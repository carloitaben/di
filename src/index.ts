import { AsyncLocalStorage } from "node:async_hooks"

type FinalizerFunction = () => void | Promise<void>

type RuntimeStorage = {
  resources: Map<string, unknown>
  finalizers: Set<FinalizerFunction>
}

const storage = new AsyncLocalStorage<RuntimeStorage>({
  name: "RuntimeStorage",
})

export class RuntimeError extends Error {
  constructor() {
    super()
    this.name = "RuntimeError"
    this.message =
      "Tried to load a dependency implementation outside a Runtime instance."
  }
}

function getStoreOrThrow() {
  const value = storage.getStore()
  if (!value) throw new RuntimeError()
  return value
}

type DependencyBuilder<T> = () => T | Promise<T>

type BuilderFinalizer<T> = (implementation: T) => void | Promise<void>

export class MissingImplementationError extends Error {
  constructor(public dependency: string) {
    super()
    this.name = "MissingImplementationError"
    this.message = `Missing implementation for dependency ${dependency}.`
  }
}

export function addFinalizer(finalizer: FinalizerFunction) {
  const store = getStoreOrThrow()
  store.finalizers.add(finalizer)
}

export class Dependency<T> {
  public Default: DependencyBuilder<T>

  constructor(name: string, fallback?: DependencyBuilder<T>)
  constructor(
    name: string,
    fallback: DependencyBuilder<T>,
    finalizer?: BuilderFinalizer<T>,
  )
  constructor(
    public name: string,
    fallback?: DependencyBuilder<T>,
    finalizer?: BuilderFinalizer<T>,
  ) {
    if (fallback !== undefined) {
      this.Default = this.make(fallback, finalizer)
    }
  }

  public make(
    builder: DependencyBuilder<T>,
    finalizer?: BuilderFinalizer<T>,
  ): DependencyBuilder<T> {
    return async () => {
      const store = getStoreOrThrow()
      const implementation = await builder()
      store.resources.set(this.name, implementation)
      if (finalizer) {
        addFinalizer(() => {
          store.resources.get(this.name)
          finalizer(implementation)
        })
      }
      return implementation
    }
  }

  then(resolve: (implementation: T) => void) {
    const store = getStoreOrThrow()

    if (!store.resources.has(this.name)) {
      throw new MissingImplementationError(this.name)
    }

    const resource = store.resources.get(this.name) as T
    return resolve(resource)
  }
}

class RetryDependency {
  constructor(public dependency: DependencyBuilder<unknown>) {}
}

async function resolveDependencies(dependencies: DependencyBuilder<unknown>[]) {
  if (!dependencies.length) return

  const settled = await Promise.allSettled(
    dependencies.map(async (dependency) => {
      try {
        return await dependency()
      } catch (error) {
        if (!(error instanceof MissingImplementationError)) throw error
        throw new RetryDependency(dependency)
      }
    }),
  )

  const rejected = settled.reduce<DependencyBuilder<unknown>[]>(
    (array, result) => {
      if (result.status === "rejected") {
        if (!(result.reason instanceof RetryDependency)) throw result.reason
        array.push(result.reason.dependency)
      }

      return array
    },
    [],
  )

  if (!rejected.length) return

  if (rejected.length === dependencies.length) {
    const first = settled.find((value) => value.status === "rejected")
    throw first?.reason
  }

  return resolveDependencies(rejected)
}

export class Runtime {
  private dependencies: DependencyBuilder<unknown>[]

  constructor(...dependencies: DependencyBuilder<unknown>[]) {
    this.dependencies = dependencies
  }

  public run = async <Result>(program: () => Promise<Result>) => {
    const current = storage.getStore()

    const store: RuntimeStorage = {
      finalizers: new Set(current?.finalizers),
      resources: new Map(current?.resources),
    }

    return storage.run(store, async () => {
      try {
        await resolveDependencies(this.dependencies)
        return storage.run(store, program)
      } finally {
        await Promise.all(
          Array.from(store.finalizers).map(async (finalizer) => finalizer()),
        )
      }
    })
  }

  public bind = <Result>(program: () => Promise<Result>) => {
    return () => this.run(program)
  }
}

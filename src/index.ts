import { AsyncLocalStorage } from "node:async_hooks"

type FinalizerFunction = () => void | Promise<void>

type RuntimeStorage = {
  resources: Map<string, unknown>
  finalizers: Set<FinalizerFunction>
}

const storage = new AsyncLocalStorage<RuntimeStorage>({
  name: "RuntimeStorage",
})

function getStoreOrThrow() {
  const value = storage.getStore()
  if (!value) throw Error("TODO: outside context")
  return value
}

type DependencyBuilder<T> = () => T | Promise<T>

type BuilderFinalizer<T> = (implementation: T) => void | Promise<void>

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
    finalizer?: BuilderFinalizer<T>
  )
  constructor(
    public name: string,
    fallback?: DependencyBuilder<T>,
    finalizer?: BuilderFinalizer<T>
  ) {
    if (fallback !== undefined) {
      this.Default = this.make(fallback, finalizer)
    }
  }

  public make(
    builder: DependencyBuilder<T>,
    finalizer?: BuilderFinalizer<T>
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
      throw Error(`TODO: missing implementation for ${this.name}`)
    }

    const resource = store.resources.get(this.name) as T
    return resolve(resource)
  }
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
        await Promise.all(this.dependencies.map((dependency) => dependency()))
        return storage.run(store, program)
      } finally {
        await Promise.all(
          Array.from(store.finalizers).map(async (finalizer) => finalizer())
        )
      }
    })
  }
}

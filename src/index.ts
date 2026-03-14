import { AsyncLocalStorage } from "async_hooks"

type FinalizerFunction = () => void | Promise<void>

type RuntimeStorage = {
  finalizers: FinalizerFunction[]
  signal: AbortSignal
  parent?: RuntimeStorage
}

type RunOptions = {
  signal?: AbortSignal
}

class ResourceKey<T> {
  private values = new WeakMap<RuntimeStorage, Readonly<{ value: T }>>()

  public getOrThrow(store: RuntimeStorage, onMissing: () => never) {
    let current: RuntimeStorage | undefined = store

    while (current) {
      const entry = this.values.get(current)

      if (entry) {
        return entry.value
      }

      current = current.parent
    }

    return onMissing()
  }

  public set(store: RuntimeStorage, value: T) {
    this.values.set(store, { value })
  }
}

const storage = new AsyncLocalStorage<RuntimeStorage>({
  name: "RuntimeStorage",
})

const defaultAbortSignal = new AbortController().signal

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

function composeSignal(
  parent: AbortSignal | undefined,
  current: AbortSignal | undefined,
): AbortSignal {
  if (parent && current) {
    return AbortSignal.any([parent, current])
  }

  return current ?? parent ?? defaultAbortSignal
}

function createStore(
  current: RuntimeStorage | undefined,
  options?: RunOptions,
): RuntimeStorage {
  return {
    finalizers: [],
    signal: composeSignal(current?.signal, options?.signal),
    parent: current,
  }
}

type DependencyBuilder<T> = () => T | Promise<T>

type BuilderFinalizer<T> = (implementation: T) => void | Promise<void>

export class MissingImplementationError extends Error {
  constructor(
    public dependency: string,
    isDefault?: boolean,
  ) {
    super()
    this.name = "MissingImplementationError"
    this.message = `Missing ${isDefault ? "default" : ""} implementation for dependency ${dependency}.`
  }
}

export function addFinalizer(finalizer: FinalizerFunction) {
  const store = getStoreOrThrow()
  store.finalizers.push(finalizer)
}

export function signal() {
  return getStoreOrThrow().signal
}

export function throwIfAborted() {
  signal().throwIfAborted()
}

type ReleaseHandler<T> = (
  resource: T,
) => FinalizerFunction | void | Promise<FinalizerFunction | void>

async function runRelease<T>(
  release: ReleaseHandler<T>,
  resource: T,
): Promise<void> {
  const cleanup = await release(resource)

  if (typeof cleanup === "function") {
    await cleanup()
  }
}

export async function acquireRelease<T>(
  acquire: () => T | Promise<T>,
  release: ReleaseHandler<Awaited<T>>,
) {
  const resource: Awaited<T> = await acquire()
  addFinalizer(() => runRelease(release, resource))
  return resource
}

export async function acquireUseRelease<T, K>(
  acquire: () => T | Promise<T>,
  use: (resource: Awaited<T>) => K | Promise<K>,
  release: ReleaseHandler<Awaited<T>>,
) {
  const resource: Awaited<T> = await acquire()
  addFinalizer(() => runRelease(release, resource))
  return use(resource)
}

export class Dependency<T> {
  public Default: DependencyBuilder<T>
  private readonly resource = new ResourceKey<T>()

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
    } else {
      this.Default = () => {
        throw new MissingImplementationError(name, true)
      }
    }
  }

  public make(
    builder: DependencyBuilder<T>,
    finalizer?: BuilderFinalizer<T>,
  ): DependencyBuilder<T> {
    return async () => {
      const store = getStoreOrThrow()
      const implementation = await builder()
      this.resource.set(store, implementation)

      if (finalizer) {
        addFinalizer(() => finalizer(implementation))
      }

      return implementation
    }
  }

  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((implementation: T) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    try {
      const store = getStoreOrThrow()
      const resource = this.resource.getOrThrow(store, () => {
        throw new MissingImplementationError(this.name)
      })

      return Promise.resolve(resource).then(onfulfilled, onrejected)
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected)
    }
  }
}

type DependencyResolution =
  | { kind: "built" }
  | {
      kind: "blocked"
      dependency: DependencyBuilder<unknown>
      error: MissingImplementationError
    }
  | { kind: "failed"; error: unknown }

async function resolveDependency(
  dependency: DependencyBuilder<unknown>,
): Promise<DependencyResolution> {
  try {
    throwIfAborted()
    await dependency()
    return { kind: "built" }
  } catch (error) {
    if (error instanceof MissingImplementationError) {
      return {
        kind: "blocked",
        dependency,
        error,
      }
    }

    return { kind: "failed", error }
  }
}

async function resolveDependencies(dependencies: DependencyBuilder<unknown>[]) {
  let pending = dependencies

  while (pending.length) {
    throwIfAborted()

    const settled = await Promise.all(pending.map(resolveDependency))
    throwIfAborted()

    const blocked: DependencyBuilder<unknown>[] = []
    let missing: MissingImplementationError | undefined

    for (const result of settled) {
      if (result.kind === "failed") {
        throw result.error
      }

      if (result.kind === "blocked") {
        blocked.push(result.dependency)
        missing ??= result.error
      }
    }

    if (!blocked.length) return

    if (blocked.length === pending.length && missing) {
      throw missing
    }

    pending = blocked
  }
}

async function finalize(finalizers: readonly FinalizerFunction[]) {
  let firstError: unknown

  for (const finalizer of [...finalizers].reverse()) {
    try {
      await finalizer()
    } catch (error) {
      firstError ??= error
    }
  }

  return firstError
}

export class Runtime {
  private dependencies: DependencyBuilder<unknown>[]

  constructor(...dependencies: DependencyBuilder<unknown>[]) {
    this.dependencies = dependencies
  }

  public run = async <Result>(
    program: () => Promise<Result>,
    options?: RunOptions,
  ) => {
    const current = storage.getStore()
    const store = createStore(current, options)

    return storage.run(store, async () => {
      let outcome: { ok: true; value: Result } | { ok: false; error: unknown }

      try {
        await resolveDependencies(this.dependencies)
        throwIfAborted()
        outcome = { ok: true, value: await program() }
      } catch (error) {
        outcome = { ok: false, error }
      }

      const cleanupError = await finalize(store.finalizers)

      if (!outcome.ok) throw outcome.error
      if (cleanupError !== undefined) throw cleanupError

      return outcome.value
    })
  }

  public bind = <Result>(program: () => Promise<Result>) => {
    return () => this.run(program)
  }
}

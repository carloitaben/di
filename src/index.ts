import { AsyncLocalStorage } from "node:async_hooks"

type FinalizerFunction = () => void | Promise<void>

type ScopeStorage = {
  resources: Map<string, unknown>
  finalizers: Set<FinalizerFunction>
}

const storageDefaultValue: ScopeStorage = {
  resources: new Map(),
  finalizers: new Set(),
}

const storage = new AsyncLocalStorage<ScopeStorage>({
  name: "RuntimeStorage",
})

function getStoreOrThrow() {
  const value = storage.getStore()
  if (!value) throw Error("TODO: outside context")
  return value
}

type Implementation<T> = () => T

export class Finalizer {
  constructor(finalizer: FinalizerFunction) {
    const store = getStoreOrThrow()
    store.finalizers.add(finalizer)
  }
}

export class Resource<T> {
  public Default: Implementation<T>

  constructor(name: string, fallback?: T)
  constructor(
    name: string,
    fallback: T,
    finalizer?: (implementation: T) => void | Promise<void>
  )
  constructor(
    public name: string,
    private fallback?: T,
    private finalizer?: (implementation: T) => void | Promise<void>
  ) {
    if (fallback !== undefined) {
      this.Default = this.make(fallback, finalizer)
    }
  }

  public make(
    implementation: T,
    finalizer?: (implementation: T) => void | Promise<void>
  ): Implementation<T> {
    return () => {
      const store = getStoreOrThrow()
      store.resources.set(this.name, implementation)
      if (finalizer) {
        new Finalizer(() => {
          finalizer(implementation)
        })
      }
      return implementation
    }
  }

  /**
   * @internal
   */
  then(resolve: (implementation: T) => void) {
    const store = getStoreOrThrow()

    if (!store.resources.has(this.name)) {
      throw Error(`TODO: missing implementation for ${this.name}`)
    }

    const resource = store.resources.get(this.name) as T
    return resolve(resource)
  }
}

export function Layer<T>() {}

export function Scope<Result, Params extends unknown[]>(
  dependencies: Implementation<unknown>[],
  callback: (...args: Params) => Promise<Result>
) {
  const current = storage.getStore()

  const store: ScopeStorage = {
    finalizers: new Set(current?.finalizers),
    resources: new Map(current?.resources),
  }

  return async function scope(...args: Params) {
    return storage.run(store, async () => {
      try {
        await Promise.all(dependencies.map((dependency) => dependency()))
        return storage.run(store, callback.bind(null, ...args))
      } catch (error) {
        console.error(error)
        throw error
      } finally {
        console.log("running finalizers")
        await Promise.all(
          Array.from(store.finalizers).map(async (finalizer) => finalizer())
        )
        console.log("finalizers ran ok")
      }
    })
  }
}

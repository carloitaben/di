# Tiny typesafe dependency injection with Thenables + AsyncLocalStorage

## Installation

Copy `src/index.ts` into your app.

## Getting started

```ts
import { Dependency, Runtime } from "@/lib/di"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")

async function program() {
  const random = await Random
  console.log(random.next())
}

const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))

const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))

await new Runtime(RandomLive).run(program)
await new Runtime(RandomTest).run(program)
```

## Default implementations

```ts
import { Dependency } from "@/lib/di"

export const Random = new Dependency("Random", () => ({
  next: () => Math.random(),
}))

export const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))
```

## Derived dependencies

```ts
import { Client, createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { Dependency } from "@/lib/di"

type ConfigShape = {
  readonly databaseUrl: string
  readonly databaseAuthToken?: string
}

export const Config = new Dependency<ConfigShape>("Config")

export const Database = new Dependency<Client>("Database")

export const DatabaseTest = Database.make(() =>
  createClient({
    url: "file:sqlite.db",
  }),
)

export const ConfigLive = Config.make(() => ({
  databaseUrl: process.env["DATABASE_URL"],
  databaseAuthToken: process.env["DATABASE_AUTH_TOKEN"],
}))

export const DatabaseLive = Database.make(async () => {
  const config = await Config

  return createClient({
    url: config.databaseUrl,
    authToken: config.databaseAuthToken,
  })
})

export const Drizzle = new Dependency("Drizzle", async () => {
  const database = await Database
  return drizzle(database)
})
```

## Finalizers

Cleanup is deferred until the enclosing `Runtime.run(...)` exits. Finalizers still run if the program throws.

```ts
import { Client, createClient } from "@libsql/client"
import { Dependency, Runtime } from "@/lib/di"

export const Database = new Dependency<Client>("Database")

export const DatabaseTest = Database.make(
  () =>
    createClient({
      url: "file:sqlite.db",
    }),
  (client) => {
    client.close()
    console.log("SQLite client closed")
  },
)

const runtime = new Runtime(DatabaseTest)

await runtime.run(async () => {
  console.log("using database")
  throw new Error("Oops")
})

// stdout:
// using database
// SQLite client closed
```

## Cancellation

Cancellation is runtime-scoped too. Pass an `AbortSignal` at the runtime boundary, then read it anywhere with `signal()`.

```ts
import { Dependency, Runtime, signal } from "@/lib/di"

type FeatureFlags = {
  readonly newCheckout: boolean
  readonly referralBanner: boolean
}

export const FeatureFlags = new Dependency<FeatureFlags>("FeatureFlags")

export const FeatureFlagsMock = FeatureFlags.make(() => ({
  newCheckout: true,
  referralBanner: false,
}))

export const FeatureFlagsLive = FeatureFlags.make(async () => {
  const response = await fetch("https://flags.internal.example/api/flags", {
    signal: signal(),
  })

  if (!response.ok) {
    throw new Error(`Failed to load flags: ${response.status}`)
  }

  return (await response.json()) as FeatureFlags
})

const controller = new AbortController()

await new Runtime(FeatureFlagsMock).run(async () => {
  const flags = await FeatureFlags
  return flags.newCheckout
})

await new Runtime(FeatureFlagsLive).run(
  async () => {
    const flags = await FeatureFlags
    return flags.newCheckout
  },
  { signal: controller.signal },
)
```

Nested runtimes inherit the parent signal. If a child runtime also receives a signal, both signals are composed.

## License

[MIT](/LICENSE)

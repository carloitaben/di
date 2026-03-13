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
  throw new Error("Oops")
})
```

## License

[MIT](/LICENSE)

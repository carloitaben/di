# Barebones typesafe dependency injection thingy using Thenables and AsyncLocalStorage

## Getting started

1. Define your dependency

```ts
import { Dependency } from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")
```

2. Use your dependency by `await`ing it

```ts
import { Dependency } from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")

async function program() {
  const random = await Random
  const randomNumber = random.next()
  console.log(`random number: ${randomNumber}`)
}
```

3. Provide a live implementation

```ts
import { Dependency } from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")

async function program() {
  const random = await Random
  const randomNumber = random.next()
  console.log(`random number: ${randomNumber}`)
}

const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))
```

4. Build a runtime with the dependency implementation

```ts
import { Dependency } from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")

async function program() {
  const random = await Random
  const randomNumber = random.next()
  console.log(`random number: ${randomNumber}`)
}

const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))

const runtimeLive = new Runtime(RandomLive)

await runtimeLive.run(program) // stdout: random number: 0.8241872233134417
```

5. Provide a test implementation

```ts
import { Dependency } from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")

async function program() {
  const random = await Random
  const randomNumber = random.next()
  console.log(`random number: ${randomNumber}`)
}

const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))

const runtimeLive = new Runtime(RandomLive)

await runtimeLive.run(program) // stdout: random number: 0.8241872233134417
await runtimeLive.run(program) // stdout: random number: 0.3176275913827688
await runtimeLive.run(program) // stdout: random number: 0.6740024767900261

const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))

const runnableTest = new Runtime(RandomTest, program)

await runnableTest.run(program) // stdout: random number: 0.25
await runnableTest.run(program) // stdout: random number: 0.25
await runnableTest.run(program) // stdout: random number: 0.25
```

6. Use the test implementation during tests

7. Profit

> [!NOTE]
> [Here you can learn more about why this pattern is so cool](https://effect.website/docs/requirements-management/services/).

## Providing a default implementation

Instead of typing the dependency manually, you can provide a default implementation and the type will be inferred from it.

```ts
import { Dependency } from "@carloitaben/di-thingy"

export const Random = new Dependency("Random", () => ({
  next: () => Math.random(),
}))

export const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))
```

## Using dependencies to create other dependencies

Since dependencies are simply functions and implementations are thenables, you can use an async function to create dependencies and `await` other dependencies within it.

```ts
import { Dependency } from "@carloitaben/di-thingy"
import { Client, createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"

export const Database = new Dependency<Client>("Database")

// Local SQLite file
export const DatabaseTest = Database.make(() =>
  createClient({
    url: "file:sqlite.db",
  })
)

// External database
export const DatabaseLive = Database.make(() =>
  createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
)

// Uses the provided Database to build the ORM
export const Drizzle = new Dependency("Drizzle", async () => {
  const database = await Database
  return drizzle(database)
})
```

## Finalizers

In the example above, you can provide cleanup functions for dependency implementations. These functions are guaranteed to run independently of the runnable result.

```ts
import { Client, createClient } from "@libsql/client"
import { Dependency, Runtime } from "../../src"

export const Database = new Dependency<Client>("Database")

export const DatabaseTest = Database.make(
  () =>
    createClient({
      url: "file:sqlite.db",
    }),
  // Close the client after the runnable finishes
  (client) => {
    client.close()
    console.log("SQLite client closed")
  }
)

// ...

async function program() {
  throw Error("Oops")
}

const runtime = new Runtime(DatabaseTest)
await runtime.run(program) // stdout: SQLite client closed
```

You can also add finalizers to default dependency implementations.

```ts
import { Dependency } from "@carloitaben/di-thingy"
import { createClient } from "@libsql/client"

export const Database = new Dependency(
  "Database",
  () =>
    createClient({
      url: "file:sqlite.db",
    }),
  (client) => client.close()
)
```

## LICENSE

[MIT](/LICENSE)

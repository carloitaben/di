# Barebones typesafe dependency injection thingy using Thenables and AsyncLocalStorage

## Getting started

1. Define your resource

```ts
import * as Scope from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Scope.Resource<Random>("Random")
```

2. Use your resource by `await`ing it

```ts
import * as Scope from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Scope.Resource<Random>("Random")

async function program() {
  const random = await Random
  const randomNumber = random.next()
  console.log(`random number: ${randomNumber}`)
}
```

3. Provide a live implementation

```ts
import * as Scope from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Scope.Resource<Random>("Random")

async function program() {
  const random = await Random
  const randomNumber = random.next()
  console.log(`random number: ${randomNumber}`)
}

const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))

const runnable = Scope.Scope([RandomLive], program)

await runnable() // stdout: random number: 0.8241872233134417
```

4. Provide a test implementation

```ts
import * as Scope from "@carloitaben/di-thingy"

type Random = {
  readonly next: () => number
}

const Random = new Scope.Resource<Random>("Random")

async function program() {
  const random = await Random
  const randomNumber = random.next()
  console.log(`random number: ${randomNumber}`)
}

const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))

const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))

const runnableLive = Scope.Scope([RandomLive], program)
await runnableLive() // stdout: random number: 0.8241872233134417
await runnableLive() // stdout: random number: 0.3176275913827688
await runnableLive() // stdout: random number: 0.6740024767900261

const runnableTest = Scope.Scope([RandomTest], program)
await runnableTest() // stdout: random number: 0.25
await runnableTest() // stdout: random number: 0.25
await runnableTest() // stdout: random number: 0.25
```

5. Use the test implementation during tests

6. Profit

> [!NOTE]
> [Here you can learn more about why this pattern is so cool](https://effect.website/docs/requirements-management/services/).

## Providing a default implementation

Instead of typing the resource manually, you can provide a default implementation and the type will be inferred from it.

```ts
import * as Scope from "@carloitaben/di-thingy"

const Random = new Scope.Resource("Random", () => ({
  next: () => Math.random(),
}))

const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))
```

## Using resources to create other resources

Since resources are simply functions and implementations are thenables, you can use an async function to create resources and `await` other resources within it.

```ts
import * as Scope from "@carloitaben/di-thingy"
import { Client, createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"

export const Database = Scope.Resource<Client>("Database")

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
export const Drizzle = Scope.Resource(async () => {
  const database = await Database
  return drizzle(database)
})

async function program() {
  const drizzle = await Drizzle
  const result = await db.execute("select 1")
}

const runnable = Scope.Scope([DatabaseTest, Drizzle], program)
```

## Finalizers

In the example above, you can provide cleanup functions for resource implementations. These functions are guaranteed to run independently of the runnable result.

```ts
import * as Scope from "@carloitaben/di-thingy"
import { Client, createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"

export const Database = Scope.Resource<Client>("Database")

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

const runnable = Scope.Scope([DatabaseTest, Drizzle], program)
await runnable() // stdout: SQLite client closed
```

You can also add finalizers to default resource implementations.

```ts
import * as Scope from "@carloitaben/di-thingy"
import { createClient } from "@libsql/client"

export const Database = Scope.Resource(
  "Database",
  () =>
    createClient({
      url: "file:sqlite.db",
    }),
  (client) => client.close()
)
```

# di

Small typed dependency injection built on [thenables](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise#thenables) and [async hooks](https://nodejs.org/api/async_context.html).

<!-- automd:file src="docs/generated/bundle-size.md" -->

![min: 2.5 kB](https://img.shields.io/badge/min-2.5%20kB-0a7ea4?style=flat-square) ![gz: 1.1 kB](https://img.shields.io/badge/gz-1.1%20kB-1f9d55?style=flat-square) ![br: 1003 B](https://img.shields.io/badge/br-1003%20B-b85c00?style=flat-square)

<!-- /automd -->

## Installation

Copy [`src/di.ts`](/src/di.ts) into your app. Optionally, you may also copy [`src/di.test.ts`](/src/di.test.ts).

## Getting started

1. Define the thing your code needs.

<!-- automd:file src="docs/snippets/getting-started.ts" lines="1:7" code lang="ts" name="" -->

```ts
import { Dependency, Runtime } from "@/lib/di"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")
```

<!-- /automd -->

2. Use it in your code by `await`ing it.

<!-- automd:file src="docs/snippets/getting-started.ts" lines="9:12" code lang="ts" name="" -->

```ts
async function program() {
  const random = await Random
  console.log(`random number: ${random.next()}`)
}
```

<!-- /automd -->

3. Create a real implementation, then run your code with it.

<!-- automd:file src="docs/snippets/getting-started.ts" lines="14:19" code lang="ts" name="" -->

```ts
const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))

const runtimeLive = new Runtime(RandomLive)
await runtimeLive.run(program) // stdout: random number: 0.8241872233134417
```

<!-- /automd -->

4. In tests, swap in a test implementation.

<!-- automd:file src="docs/snippets/getting-started.ts" lines="21:26" code lang="ts" name="" -->

```ts
const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))

const runtimeTest = new Runtime(RandomTest)
await runtimeTest.run(program) // stdout: random number: 0.25
```

<!-- /automd -->

## Default implementations

Use a default when most runtimes share one implementation. It also lets TypeScript infer the dependency type.

<!-- automd:file src="docs/snippets/defaults.ts" code lang="ts" name="" -->

```ts
import { Dependency } from "@/lib/di"

export const Random = new Dependency("Random", () => ({
  next: () => Math.random(),
}))

export const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))
```

<!-- /automd -->

## Derived dependencies

Pass an async function to build one dependency from another.

<!-- automd:file src="docs/snippets/derived.ts" code lang="ts" name="" -->

```ts
import { type Client, createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { Dependency } from "@/lib/di"

export const Database = new Dependency<Client>("Database")

export const DatabaseTest = Database.make(() =>
  createClient({
    url: "file:sqlite.db",
  }),
)

export const DatabaseLive = Database.make(() =>
  createClient({
    url: process.env["DATABASE_URL"],
    authToken: process.env["DATABASE_AUTH_TOKEN"],
  }),
)

export const Drizzle = new Dependency("Drizzle", async () => {
  const database = await Database
  return drizzle(database)
})
```

<!-- /automd -->

## Finalizers

Use finalizers for resources like database clients, sockets, or file handles. Finalizers execute when the enclosing `Runtime.run()` exits, even if it throws.

<!-- automd:file src="docs/snippets/finalizer.ts" code lang="ts" name="" -->

```ts
import { type Client, createClient } from "@libsql/client"
import { Dependency, Runtime } from "@/lib/di"

export const Database = new Dependency<Client>(
  "Database",
  () =>
    createClient({
      url: "file:sqlite.db",
    }),
  (client) => {
    client.close()
    console.log("SQLite client closed")
  },
)

const runtime = new Runtime(Database.Default)
await runtime.run(async () => {
  console.log("Using database")
  throw Error("Oops")
})

// stdout:
// Using database
// SQLite client closed
```

<!-- /automd -->

## Scoped resources

Use scoped resources for one-off runtime-owned things like temp workspaces, file handles, or log streams that should be cleaned up automatically without becoming full `Dependency` values. 

<!-- automd:file src="docs/snippets/scoped-resources.ts" code lang="ts" name="" -->

```ts
import { mkdtemp, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Runtime, acquireRelease, acquireUseRelease } from "@/lib/di"

async function program() {
  const workspace = await acquireRelease(
    () => mkdtemp(join(tmpdir(), "di-export-")),
    (path) => rm(path, { recursive: true, force: true }),
  )

  await writeFile(join(workspace, "users.csv"), "id,name\n1,Jai Dixit\n")

  await acquireUseRelease(
    () => open(join(workspace, "summary.txt"), "w"),
    (file) => file.writeFile("export complete\n"),
    (file) => file.close(),
  )
}

await new Runtime().run(program)
```

<!-- /automd -->

## Cancellation

Use cancellation when dependencies do I/O and should stop with the request or job. `Runtime.run()` provides one scoped `AbortSignal`, and `signal()` reads it anywhere in that runtime.

<!-- automd:file src="docs/snippets/feature-flags.ts" code lang="ts" name="" -->

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

  return (await response.json()) as FeatureFlags
})

async function program() {
  const flags = await FeatureFlags
  console.log(flags.newCheckout)
}

const controller = new AbortController()

await new Runtime(FeatureFlagsMock).run(program)

await new Runtime(FeatureFlagsLive).run(program, {
  signal: controller.signal,
})
```

<!-- /automd -->

> [!TIP]
> Nested runtimes inherit the parent signal. If a child runtime also receives a signal, both signals are composed.

## License

[MIT](/LICENSE)

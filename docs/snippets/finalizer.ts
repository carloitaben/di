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

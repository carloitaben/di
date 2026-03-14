import { type Client, createClient } from "@libsql/client"
import { Dependency, Runtime } from "@/index"

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
  throw Error("Oops")
})

// stdout:
// using database
// SQLite client closed

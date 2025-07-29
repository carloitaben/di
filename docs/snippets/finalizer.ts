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

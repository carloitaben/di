import { createClient } from "@libsql/client"
import { Dependency } from "@/index"

export const Database = new Dependency(
  "Database",
  () =>
    createClient({
      url: "file:sqlite.db",
    }),
  (client) => client.close(),
)

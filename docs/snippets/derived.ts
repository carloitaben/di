import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { Dependency } from "@/lib/di"

export const Database = new Dependency("Database", () =>
  createClient({
    url: "file:sqlite.db",
  }),
)

export const Drizzle = new Dependency("Drizzle", async () => {
  const database = await Database
  return drizzle(database)
})

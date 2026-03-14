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

import { Client, createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { Dependency } from "../../src"

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

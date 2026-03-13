import { type Client, createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { Dependency } from "@/index"

type ConfigShape = {
  readonly databaseUrl: string
  readonly databaseAuthToken?: string
}

export const Config = new Dependency<ConfigShape>("Config")

export const Database = new Dependency<Client>("Database")

// Local SQLite file
export const DatabaseTest = Database.make(() =>
  createClient({
    url: "file:sqlite.db",
  }),
)

// External database
export const ConfigLive = Config.make(() => ({
  databaseUrl: process.env["DATABASE_URL"] ?? "",
  databaseAuthToken: process.env["DATABASE_AUTH_TOKEN"],
}))

export const DatabaseLive = Database.make(async () => {
  const config = await Config

  return createClient({
    url: config.databaseUrl,
    authToken: config.databaseAuthToken,
  })
})

// Uses the provided Database to build the ORM
export const Drizzle = new Dependency("Drizzle", async () => {
  const database = await Database
  return drizzle(database)
})

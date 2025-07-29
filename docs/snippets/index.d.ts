declare module "@libsql/client" {
  type Client = {
    close: VoidFunction
  }
  function createClient(options: {
    url?: string | undefined
    authToken?: string | undefined
  }): Client
}

declare module "drizzle-orm/libsql" {
  function drizzle(client: import("@libsql/client").Client): {
    execute(sql: string): Promise<unknown>
  }
}

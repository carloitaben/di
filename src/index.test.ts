import { expect, test, vi } from "vitest"
import * as Scope from "."

test("Dependency injection", async () => {
  const Resource = new Scope.Resource<string>("resource")
  const mock = Resource.make(() => "mock")
  const live = Resource.make(() => "live")

  const program = vi.fn(async () => Resource)
  const programWithMockDependency = Scope.Scope([mock], program)
  const programWithLiveDependency = Scope.Scope([live], program)
  const mockResult = await programWithMockDependency()
  const liveResult = await programWithLiveDependency()
  expect(mockResult).toBe("mock")
  expect(liveResult).toBe("live")
})

test("Default", async () => {
  const Resource = new Scope.Resource("resource", () => "default")
  const result = await Scope.Scope([Resource.Default], async () => Resource)()
  expect(result).toBe("default")
})

test("Finalizer", async () => {
  const finalizer = vi.fn(() => {
    console.log("Running finalizer")
  })

  const Resource = new Scope.Resource<string>(
    "resource",
    () => "default",
    finalizer
  )

  const program = Scope.Scope([Resource.Default], async (boom: boolean) => {
    if (boom) {
      throw Error("liada")
    }

    const resource = await Resource
    console.log("got resource", resource)
    return resource
  })

  await expect(() => program(true)).rejects.toThrowError()
  expect(finalizer).toHaveBeenCalledOnce()
})

test("Resources from other resources", async () => {
  const finalizer = vi.fn(() => {
    console.log("Running finalizer")
  })

  const Database = new Scope.Resource("database", () => "default")

  const Drizzle = new Scope.Resource(
    "drizzle",
    async () => {
      const database = await Database
      return [database, "orm"]
    },
    finalizer
  )

  const program = Scope.Scope([Database.Default, Drizzle.Default], async () => {
    const drizzle = await Drizzle
    return drizzle
  })

  const result = await program()
  expect(result).toEqual(["default", "orm"])
})

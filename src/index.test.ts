import { expect, test, vi } from "vitest"
import {
  Dependency,
  MissingImplementationError,
  Runtime,
  acquireRelease,
  acquireUseRelease,
  addFinalizer,
} from "./index"

test("Dependency injection", async () => {
  const Resource = new Dependency<string>("Resource")
  const ResourceMock = Resource.make(() => "mock")
  const ResourceLive = Resource.make(() => "live")

  const program = vi.fn(async () => Resource)

  const runtimeMock = new Runtime(ResourceMock)
  const runtimeLive = new Runtime(ResourceLive)

  const mock = await runtimeMock.run(program)
  const live = await runtimeLive.run(program)

  expect(mock).toBe("mock")
  expect(live).toBe("live")
})

test("Default value", async () => {
  const Resource = new Dependency("Resource", () => "default")
  const runtime = new Runtime(Resource.Default)
  const result = await runtime.run(async () => Resource)
  expect(result).toBe("default")

  const ResourceWithoutDefault = new Dependency("AnotherResource")
  await expect(() =>
    new Runtime(ResourceWithoutDefault.Default).run(
      async () => ResourceWithoutDefault,
    ),
  ).rejects.toThrowError()
})

test("Derived dependencies", async () => {
  const Database = new Dependency("Database", () => "default")

  const Drizzle = new Dependency("Drizzle", async () => {
    const database = await Database
    return [database, "orm"]
  })

  const program = async () => {
    const drizzle = await Drizzle
    return drizzle
  }

  const runtime = new Runtime(Database.Default, Drizzle.Default)
  const result = await runtime.run(program)
  expect(result).toEqual(["default", "orm"])
})

test("Nested derived dependencies", async () => {
  const Foo = new Dependency("Foo", () => "foo")
  const Bar = new Dependency("Bar", () => Foo.then(() => "bar"))
  const Baz = new Dependency("Baz", () => Bar.then(() => "baz"))
  const Qux = new Dependency("Qux", () => Baz.then(() => "qux"))

  const runtime = new Runtime(
    Qux.Default,
    Bar.Default,
    Foo.Default,
    Baz.Default,
  )

  const result = await runtime.run(async () => Qux)
  expect(result).toEqual("qux")
})

test("Inline dependencies", async () => {
  const Foo = new Dependency("Foo", () => "foo")
  const Bar = new Dependency(
    "Bar",
    new Runtime(Foo.Default).bind(async () => {
      const foo = await Foo
      return foo + "bar"
    }),
  )

  const runtime = new Runtime(Bar.Default)
  const result = await runtime.run(async () => Bar)
  expect(result).toBe("foobar")
})

test(addFinalizer.name, async () => {
  const finalizer = vi.fn()

  const Resource = new Dependency(
    "Resource",
    () => {
      addFinalizer(finalizer)
      return "default"
    },
    finalizer,
  )

  const program = async (boom: boolean) => {
    if (boom) {
      throw Error("liada")
    }

    return Resource
  }

  const runtime = new Runtime(Resource.Default)

  await expect(() => runtime.run(() => program(true))).rejects.toThrowError()
  expect(finalizer).toHaveReturnedTimes(2)
})

test(acquireRelease.name, async () => {
  const release = vi.fn()
  const program = async () => acquireRelease(() => "foo", release)

  const runtime = new Runtime()
  const result = await runtime.run(program)
  expect(result).toBe("foo")
  expect(release).toHaveBeenCalledOnce()
})

test(acquireUseRelease.name, async () => {
  const release = vi.fn()
  const program = async () =>
    acquireUseRelease(
      () => "foo",
      (value) => value.toUpperCase(),
      release,
    )

  const runtime = new Runtime()
  const result = await runtime.run(program)
  expect(result).toBe("FOO")
  expect(release).toHaveBeenCalledOnce()
})

import { expect, test } from "bun:test"
import {
  Dependency,
  MissingImplementationError,
  Runtime,
  acquireRelease,
  acquireUseRelease,
  addFinalizer,
  signal,
  throwIfAborted,
} from "./di"

test("Dependency injection", async () => {
  const Resource = new Dependency<string>("Resource")
  const ResourceMock = Resource.make(() => "mock")
  const ResourceLive = Resource.make(() => "live")

  const program = async () => Resource

  const runtimeMock = new Runtime(ResourceMock)
  const runtimeLive = new Runtime(ResourceLive)

  const mock = await runtimeMock.run(program)
  const live = await runtimeLive.run(program)

  expect(mock).toBe("mock")
  expect(live).toBe("live")
})

test("signal throws outside a runtime", () => {
  expect(() => signal()).toThrowError()
})

test("Default value", async () => {
  const Resource = new Dependency("Resource", () => "default")
  const runtime = new Runtime(Resource.Default)
  const result = await runtime.run(async () => Resource)
  expect(result).toBe("default")

  const ResourceWithoutDefault = new Dependency("AnotherResource")
  await expect(
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

test("Nested runtimes keep parent finalizers alive", async () => {
  const calls: string[] = []

  const Parent = new Dependency("Parent", () => {
    addFinalizer(() => {
      calls.push("parent-finalizer")
    })

    return "parent"
  })

  const Child = new Dependency("Child", () => {
    addFinalizer(() => {
      calls.push("child-finalizer")
    })

    return "child"
  })

  await new Runtime(Parent.Default).run(async () => {
    expect(await Parent).toBe("parent")

    await new Runtime(Child.Default).run(async () => {
      expect(await Child).toBe("child")
      calls.push("child-program")
    })

    expect(await Parent).toBe("parent")
    expect(calls).toEqual(["child-program", "child-finalizer"])
  })

  expect(calls).toEqual([
    "child-program",
    "child-finalizer",
    "parent-finalizer",
  ])
})

test("Nested runtimes can override parent dependencies", async () => {
  const Resource = new Dependency("Resource")
  const ParentResource = Resource.make(() => "parent")
  const ChildResource = Resource.make(() => "child")

  await new Runtime(ParentResource).run(async () => {
    expect(await Resource).toBe("parent")

    await new Runtime(ChildResource).run(async () => {
      expect(await Resource).toBe("child")
    })

    expect(await Resource).toBe("parent")
  })
})

test("Nested runtimes inherit parent signal", async () => {
  const controller = new AbortController()

  await new Runtime().run(
    async () => {
      const parentSignal = signal()
      expect(parentSignal).toBe(controller.signal)

      await new Runtime().run(async () => {
        expect(signal()).toBe(parentSignal)
      })
    },
    { signal: controller.signal },
  )
})

test("Nested runtimes compose parent and child signals", async () => {
  const parentController = new AbortController()
  const childController = new AbortController()

  await new Runtime().run(
    async () => {
      await expect(
        new Runtime().run(
          async () => {
            await new Promise<void>((resolve, reject) => {
              const abort = () => {
                try {
                  throwIfAborted()
                  resolve()
                } catch (error) {
                  reject(error)
                }
              }

              signal().addEventListener("abort", abort, { once: true })
              parentController.abort(new Error("parent-abort"))
            })
          },
          { signal: childController.signal },
        ),
      ).rejects.toMatchObject({ message: "parent-abort" })
    },
    { signal: parentController.signal },
  )
})

test("Finalizers run in reverse order", async () => {
  const calls: string[] = []

  await new Runtime().run(async () => {
    addFinalizer(() => {
      calls.push("first")
    })
    addFinalizer(() => {
      calls.push("second")
    })
    addFinalizer(() => {
      calls.push("third")
    })
  })

  expect(calls).toEqual(["third", "second", "first"])
})

test("Finalizers keep running after cleanup failure", async () => {
  const calls: string[] = []
  const error = new Error("boom")

  await expect(
    new Runtime().run(async () => {
      addFinalizer(() => {
        calls.push("first")
      })
      addFinalizer(() => {
        calls.push("second")
        throw error
      })
      addFinalizer(() => {
        calls.push("third")
      })
    }),
  ).rejects.toBe(error)

  expect(calls).toEqual(["third", "second", "first"])
})

test("Program failure wins over cleanup failure", async () => {
  const cleanupError = new Error("cleanup")
  const programError = new Error("program")

  await expect(
    new Runtime().run(async () => {
      addFinalizer(() => {
        throw cleanupError
      })

      throw programError
    }),
  ).rejects.toBe(programError)
})

test("Abort before resolution stops dependency startup", async () => {
  const controller = new AbortController()
  const error = new Error("aborted")
  let calls = 0

  const Resource = new Dependency("Resource", () => {
    calls += 1
    return "value"
  })

  controller.abort(error)

  await expect(
    new Runtime(Resource.Default).run(async () => Resource, {
      signal: controller.signal,
    }),
  ).rejects.toBe(error)

  expect(calls).toBe(0)
})

test("Abort during builder work still runs finalizers", async () => {
  const controller = new AbortController()
  const error = new Error("aborted")
  const calls: string[] = []

  const Resource = new Dependency("Resource", async () => {
    addFinalizer(() => {
      calls.push("finalizer")
    })

    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        try {
          throwIfAborted()
          resolve()
        } catch (cause) {
          reject(cause)
        }
      }

      signal().addEventListener("abort", abort, { once: true })
      controller.abort(error)
    })

    return "value"
  })

  await expect(
    new Runtime(Resource.Default).run(async () => Resource, {
      signal: controller.signal,
    }),
  ).rejects.toBe(error)

  expect(calls).toEqual(["finalizer"])
})

test("Retry resolution succeeds after later pass progress", async () => {
  const Database = new Dependency("Database", () => "db")
  let emailBuilderCalls = 0
  const emailBuilder = async () => {
    emailBuilderCalls += 1
    return `${await Database}-email`
  }
  const Email = new Dependency("Email", emailBuilder)
  let authBuilderCalls = 0
  const authBuilder = async () => {
    authBuilderCalls += 1
    return `${await Email}-auth`
  }
  const Auth = new Dependency("Auth", authBuilder)

  const result = await new Runtime(
    Auth.Default,
    Email.Default,
    Database.Default,
  ).run(async () => Auth)

  expect(result).toBe("db-email-auth")
  expect(emailBuilderCalls).toBe(2)
  expect(authBuilderCalls).toBe(3)
})

test("Abort stops dependency retry loop", async () => {
  const controller = new AbortController()
  const error = new Error("aborted")
  let calls = 0
  const Missing = new Dependency<string>("Missing")
  const Blocked = new Dependency("Blocked", async () => {
    calls += 1
    controller.abort(error)
    return Missing
  })

  await expect(
    new Runtime(Blocked.Default).run(async () => Blocked, {
      signal: controller.signal,
    }),
  ).rejects.toBe(error)

  expect(calls).toBe(1)
})

test("Missing dependency surfaces MissingImplementationError", async () => {
  const Missing = new Dependency<string>("Missing")
  const Service = new Dependency(
    "Service",
    async () => `${await Missing}-service`,
  )

  await expect(
    new Runtime(Service.Default).run(async () => Service),
  ).rejects.toMatchObject({
    dependency: "Missing",
    name: MissingImplementationError.name,
  })
})

test("Dependencies with same name do not collide", async () => {
  const First = new Dependency("Resource", () => "first")
  const Second = new Dependency("Resource", () => "second")

  const result = await new Runtime(First.Default, Second.Default).run(
    async () => {
      return [await First, await Second]
    },
  )

  expect(result).toEqual(["first", "second"])
})

test(addFinalizer.name, async () => {
  let finalizerCalls = 0
  const finalizer = () => {
    finalizerCalls += 1
  }

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

  await expect(runtime.run(() => program(true))).rejects.toThrowError()
  expect(finalizerCalls).toBe(2)
})

test(acquireRelease.name, async () => {
  const calls: string[] = []
  let releaseCalls = 0
  const release = () => {
    calls.push("release")
    releaseCalls += 1
  }
  const program = async () => {
    const value = await acquireRelease(() => "foo", release)
    calls.push("program")
    return value
  }

  const runtime = new Runtime()
  const result = await runtime.run(program)
  expect(result).toBe("foo")
  expect(releaseCalls).toBe(1)
  expect(calls).toEqual(["program", "release"])
})

test(acquireUseRelease.name, async () => {
  const calls: string[] = []
  let releaseCalls = 0
  const release = () => {
    calls.push("release")
    releaseCalls += 1
  }
  const program = async () =>
    acquireUseRelease(
      () => "foo",
      (value) => {
        calls.push("use")
        return value.toUpperCase()
      },
      release,
    )

  const runtime = new Runtime()
  const result = await runtime.run(program)
  expect(result).toBe("FOO")
  expect(releaseCalls).toBe(1)
  expect(calls).toEqual(["use", "release"])
})

test("acquireRelease supports returned finalizer functions", async () => {
  const calls: string[] = []

  const result = await new Runtime().run(async () => {
    const value = await acquireRelease(
      () => "foo",
      () => () => {
        calls.push("release")
      },
    )

    calls.push("program")
    return value
  })

  expect(result).toBe("foo")
  expect(calls).toEqual(["program", "release"])
})

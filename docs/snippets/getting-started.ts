import { Dependency, Runtime } from "@/lib/di"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")

async function program() {
  const random = await Random
  console.log(`random number: ${random.next()}`)
}

const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))

const runtimeLive = new Runtime(RandomLive)
await runtimeLive.run(program) // stdout: random number: 0.8241872233134417

const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))

const runtimeTest = new Runtime(RandomTest)
await runtimeTest.run(program) // stdout: random number: 0.25

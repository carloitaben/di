import { Dependency, Runtime } from "@/index"

type Random = {
  readonly next: () => number
}

const Random = new Dependency<Random>("Random")

async function program() {
  const random = await Random
  const randomNumber = random.next()
  console.log(`random number: ${randomNumber}`)
}

const RandomLive = Random.make(() => ({
  next: () => Math.random(),
}))

const runtimeLive = new Runtime(RandomLive)

await runtimeLive.run(program) // stdout: random number: 0.8241872233134417
await runtimeLive.run(program) // stdout: random number: 0.3176275913827688
await runtimeLive.run(program) // stdout: random number: 0.6740024767900261

const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))

const runtimeTest = new Runtime(RandomTest)

await runtimeTest.run(program) // stdout: random number: 0.25
await runtimeTest.run(program) // stdout: random number: 0.25
await runtimeTest.run(program) // stdout: random number: 0.25

import { Dependency } from "../../src"

export const Random = new Dependency("Random", () => ({
  next: () => Math.random(),
}))

export const RandomTest = Random.make(() => ({
  next: () => 0.25,
}))

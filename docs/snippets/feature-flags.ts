import { Dependency, Runtime, signal } from "@/lib/di"

type FeatureFlags = {
  readonly newCheckout: boolean
  readonly referralBanner: boolean
}

export const FeatureFlags = new Dependency<FeatureFlags>("FeatureFlags")

export const FeatureFlagsMock = FeatureFlags.make(() => ({
  newCheckout: true,
  referralBanner: false,
}))

export const FeatureFlagsLive = FeatureFlags.make(async () => {
  const response = await fetch("https://flags.internal.example/api/flags", {
    signal: signal(),
  })

  return (await response.json()) as FeatureFlags
})

async function program() {
  const flags = await FeatureFlags
  console.log(flags.newCheckout)
}

const controller = new AbortController()

await new Runtime(FeatureFlagsMock).run(program)

await new Runtime(FeatureFlagsLive).run(program, {
  signal: controller.signal,
})

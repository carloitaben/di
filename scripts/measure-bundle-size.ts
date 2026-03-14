import { mkdir, rm } from "node:fs/promises"
import { builtinModules } from "node:module"
import { brotliCompressSync, gzipSync } from "node:zlib"

type MeasuredSize = {
  readonly bytes: number
  readonly display: string
}

type BundleSizeReport = {
  readonly entry: string
  readonly bun: string
  readonly minified: MeasuredSize
  readonly gzip: MeasuredSize
  readonly brotli: MeasuredSize
}

const root = import.meta.dir + "/.."
const entry = root + "/src/di.ts"
const outdir = root + "/.tmp/bundle-size"
const bundlePath = outdir + "/di.js"
const generatedDir = root + "/docs/generated"
const markdownPath = generatedDir + "/bundle-size.md"

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kilobytes = bytes / 1024

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} kB`
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`
}

function measure(bytes: number): MeasuredSize {
  return {
    bytes,
    display: formatBytes(bytes),
  }
}

function createBadge(label: string, message: string, color: string) {
  const encodedLabel = encodeURIComponent(label)
  const encodedMessage = encodeURIComponent(message)

  return `![${label}: ${message}](https://img.shields.io/badge/${encodedLabel}-${encodedMessage}-${color}?style=flat-square)`
}

function createMarkdown(report: BundleSizeReport) {
  return [
    createBadge("min", report.minified.display, "0a7ea4"),
    createBadge("gz", report.gzip.display, "1f9d55"),
    createBadge("br", report.brotli.display, "b85c00"),
  ].join(" ")
}

const external = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]

await rm(outdir, { force: true, recursive: true })
await mkdir(generatedDir, { recursive: true })

const result = await Bun.build({
  entrypoints: [entry],
  outdir,
  format: "esm",
  minify: true,
  target: "node",
  external,
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }

  process.exit(1)
}

const bundle = await Bun.file(bundlePath).bytes()

const report: BundleSizeReport = {
  entry: "src/di.ts",
  bun: Bun.version,
  minified: measure(bundle.byteLength),
  gzip: measure(gzipSync(bundle).byteLength),
  brotli: measure(brotliCompressSync(bundle).byteLength),
}

await Bun.write(markdownPath, createMarkdown(report) + "\n")

console.log(createMarkdown(report))

import { mkdtemp, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Runtime, acquireRelease, acquireUseRelease } from "@/lib/di"

async function program() {
  const workspace = await acquireRelease(
    () => mkdtemp(join(tmpdir(), "di-export-")),
    (path) => rm(path, { recursive: true, force: true }),
  )

  await writeFile(join(workspace, "users.csv"), "id,name\n1,Jai Dixit\n")

  await acquireUseRelease(
    () => open(join(workspace, "summary.txt"), "w"),
    (file) => file.writeFile("export complete\n"),
    (file) => file.close(),
  )
}

await new Runtime().run(program)

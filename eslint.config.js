import { defineConfig, globalIgnores } from "eslint/config"
import packageJson from "eslint-plugin-package-json"
import simpleImportSort from "eslint-plugin-simple-import-sort"

export default defineConfig([
  globalIgnores(["node_modules", "dist"]),
  packageJson.configs.recommended,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": [
        "warn",
        {
          groups: [["^\\u0000", "^node:", "^@?\\w", "^", "^\\."]],
        },
      ],
      "simple-import-sort/exports": "warn",
    },
  },
])

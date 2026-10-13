import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      three: createRequire(new URL("./packages/scenic/package.json", import.meta.url)).resolve("three"),
      "@scenic/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@scenic/scenic": fileURLToPath(
        new URL("./packages/scenic/src/index.ts", import.meta.url),
      ),
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});

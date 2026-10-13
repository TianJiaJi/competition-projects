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
  test: { maxWorkers:2, env:{DATABASE_URL:process.env.TEST_DATABASE_URL||'postgresql://aiden@127.0.0.1/scenic_test'}, testTimeout:60000, hookTimeout:60000, include: ["tests/unit/**/*.test.ts"], environment: "node" },
});

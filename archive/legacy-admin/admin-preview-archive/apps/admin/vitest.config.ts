import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const pkg = (path: string) =>
  fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@scenic/contracts": pkg("contracts/src/index.ts"),
      "@scenic/scenic": pkg("scenic/src/index.ts"),
      "@scenic/ui/theme.css": pkg("ui/src/theme.css"),
      "@scenic/ui/liquid-glass": pkg("ui/src/liquid-glass/index.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});

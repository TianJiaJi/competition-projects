import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { scenario } from "../scenario/config.ts";
const require = createRequire(
  new URL("../apps/mobile/package.json", import.meta.url),
);
const { Resvg } = require("@resvg/resvg-js");
const root = path.dirname(require.resolve("lucide-static/package.json"));
const output = fileURLToPath(
  new URL("../apps/mobile/src/static/icons/", import.meta.url),
);
await mkdir(output, { recursive: true });
for (const name of [
  "house",
  "map-pin",
  "calendar-days",
  "user-round",
  "wrench",
  "user-plus",
  "sparkles",
  "building-2",
]) {
  const source = await readFile(
    path.join(root, "icons", name + ".svg"),
    "utf8",
  );
  for (const [suffix, color] of [
    ["", scenario.theme.muted],
    ["-active", scenario.theme.brand],
  ]) {
    const svg = source.replaceAll("currentColor", color);
    await writeFile(
      path.join(output, name + suffix + ".png"),
      new Resvg(svg, { fitTo: { mode: "width", value: 72 } }).render().asPng(),
    );
  }
}

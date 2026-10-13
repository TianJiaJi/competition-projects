import { readFile, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
const terrain = await readFile(
  new URL("../../../packages/ui/src/contour/terrain.ts", import.meta.url),
  "utf8",
);
const paths = JSON.parse(
  terrain.slice(
    terrain.indexOf("[ ") >= 0 ? terrain.indexOf("[ ") : terrain.indexOf("[\n"),
    terrain.lastIndexOf("]") + 1,
  ),
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1120"><g fill="none" stroke="#193b35" stroke-width="1.5" opacity="0.065">${paths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
const png = new Resvg(svg).render().asPng();
await writeFile(new URL("../src/static/contour.png", import.meta.url), png);
await writeFile(
  new URL("../src/styles/contour.css", import.meta.url),
  `/* Generated static texture; embedded for native WXSS compatibility. */\npage { background-image: url("data:image/png;base64,${png.toString("base64")}"); }\n`,
);

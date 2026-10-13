import type { MaterialFile } from "../../builder/types";
// One catalog for source nodes, packaged files, HTTP downloads and reference import.
const groups = [
  ["01-map", "01-图片地图", ["M01.png"]],
  ["01-coordinates", "02-设施坐标", ["M03.json"]],
  ["01-reference", "03-沙盘参考", ["sandbox-reference.json", "R01-campus.png"]],
  [
    "02-pages",
    "04-页面模板",
    [
      "public-pages.html",
      "ops-pages.html",
      "mobile-pages.html",
      "staff-pages.html",
      "admin-pages.html",
    ],
  ],
  [
    "02-components",
    "05-公共组件",
    [
      "navigation-layout.html",
      "glass-metrics.html",
      "records-forms.html",
      "contour-background.html",
    ],
  ],
  [
    "03-sql-template",
    "06-SQL模板",
    ["schema-and-queries.sql", "initial-records.json"],
  ],
  ["03-service-template", "07-服务模板", ["service-contract.json"]],
] as const;
export const materialMime = (name: string) =>
  ({
    png: "image/png",
    svg: "image/svg+xml",
    json: "application/json",
    html: "text/html",
    sql: "text/plain",
    zip: "application/zip",
  })[name.split(".").at(-1)!] || "application/octet-stream";
export const materialCatalog = groups.flatMap(([node, folder, names]) =>
  names.map((name) => ({
    node,
    path: `material-pack/${folder}/${name}`,
    name,
    type: materialMime(name),
  })),
);
export const referenceMaterials = (
  node: string,
): (MaterialFile & { path: string })[] =>
  materialCatalog.filter((f) => f.node === node).map(({ node: _, ...f }) => f);
export const materialAssets = [
  ...materialCatalog.map((f) => f.path),
  "material-pack/产物参考/M02.svg",
  "material-pack/manifest.json",
  "material-pack.zip",
];

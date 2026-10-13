import { createHash } from "node:crypto";
import { fail } from "./database.mjs";

// Metadata only. The client cannot supply a record identifier or executable content.
export function materialFile(value) {
  if (!value || typeof value.name !== "string" || !value.name.trim())
    fail("请选择素材");
  const file = {
    name: value.name.slice(0, 500),
    size: Number.isFinite(value.size) && value.size >= 0 ? value.size : 0,
    type: String(value.type || "").slice(0, 200),
    lastModified:
      Number.isFinite(value.lastModified) && value.lastModified >= 0
        ? value.lastModified
        : 0,
    prepared: !!value.prepared,
  };
  file.id = createHash("sha256")
    .update(
      JSON.stringify([file.name, file.size, file.type, file.lastModified]),
    )
    .digest("hex")
    .slice(0, 24);
  return file;
}
export function materialList(values) {
  if (!Array.isArray(values) || values.length > 200)
    fail("素材清单最多支持 200 份文件");
  return [
    ...new Map(
      values.map((v) => {
        const f = materialFile(v);
        return [f.id, f];
      }),
    ).values(),
  ];
}

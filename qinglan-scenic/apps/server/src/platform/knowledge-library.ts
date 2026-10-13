import { sources, contextFor } from "../knowledge.ts";
import { assert, textField, type Store } from "./store.ts";
import { randomUUID } from "node:crypto";
import type { Account } from "../../../../packages/contracts/src/platform.ts";
import type { Source } from "../../../../packages/contracts/src/mobile-qa.ts";
export async function migrateKnowledge(store: Store) {
  await store.transaction(async () => {
    if (await store.get("settings", "knowledge-library-v1")) return;
    for (const source of sources) {
      const id = source.id.startsWith("poi-") ? source.id.slice(4) : source.id;
      const old = await store.get<any>("knowledge", id);
      const value = old || {
        id,
        title: source.title,
        body: source.excerpt,
        poiId: source.id.startsWith("poi-") ? id : null,
        published: true,
        version: 1,
      };
      if (!old) await store.put("knowledge", id, value);
      if (value.published && !(await store.get("knowledge-published", id)))
        await store.put("knowledge-published", id, value);
      await store.put(
        "knowledge-sources",
        source.id + "|" + source.version,
        source,
      );
    }
    for (const row of await store.list<any>("knowledge"))
      if (row.published && !(await store.get("knowledge-published", row.id)))
        await store.put("knowledge-published", row.id, row);
    for (const row of await store.list<any>("knowledge-published")) {
      const source = knowledgeSource(row);
      if (!(await store.get("knowledge-sources", source.id)))
        await store.put("knowledge-sources", source.id, source);
    }
    await store.put("settings", "knowledge-library-v1", { version: 1 });
  });
}
export function knowledgeSource(row: any): Source {
  return {
    id: "kb-" + row.id + "-v" + row.version,
    title: row.title + (row.sourceId ? " · 来源：" + row.sourceId : ""),
    kind: "fictional_setting",
    excerpt: row.body,
    version: String(row.version),
  };
}
export async function publishedKnowledge(store: Store) {
  return (await store.list<any>("knowledge-published")).filter(
    (row) => row.published && !row.disabled && !row.deleted,
  );
}
export async function knowledgeWrite(
  store: Store,
  user: Account,
  path: string,
  input: any,
) {
  if (!/^\/admin\/knowledge(?:\/|$)/.test(path)) return undefined;
  assert(user.role === "admin", "FORBIDDEN", "需要管理员权限", 403);
  const id = path.split("/")[3] || randomUUID(),
    old = await store.get<any>("knowledge", id);
  if (old)
    assert(
      old.version === input.expectedVersion,
      "VERSION_CONFLICT",
      "知识条目已更新，请重新打开",
    );
  else assert(!path.split("/")[3], "NOT_FOUND", "知识条目不存在", 404);
  if (input.action === "delete" || input.action === "disable") {
    assert(old, "NOT_FOUND", "条目不存在", 404);
    const row = {
      ...old,
      deleted: input.action === "delete",
      disabled: true,
      published: false,
      version: old.version + 1,
    };
    await store.put("knowledge", id, row);
    await store.put("knowledge-published", id, row);
    await store.put("knowledge-versions", id + "|" + row.version, row);
    return row;
  }
  const row = {
    ...old,
    id,
    title: textField(input.title, 120),
    body: textField(input.body, 20000),
    poiId: input.poiId || null,
    keywords: Array.isArray(input.keywords)
      ? input.keywords.map((v: unknown) => textField(v, 30)).slice(0, 20)
      : [],
    sourceId: textField(input.sourceId || "景区管理方", 200),
    published: input.published === true,
    disabled: false,
    deleted: false,
    version: (old?.version || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  await store.put("knowledge", id, row);
  await store.put("knowledge-versions", id + "|" + row.version, row);
  if (row.published) {
    await store.put("knowledge-published", id, row);
    const source = knowledgeSource(row);
    await store.put("knowledge-sources", source.id, source);
  }
  return row;
}

export async function knowledgeContext(
  store: Store,
  text: string,
  poiId: string | null,
  snapshot: Parameters<typeof contextFor>[2],
) {
  const live = contextFor(text, poiId, snapshot).filter(
    (source) => source.kind === "live_snapshot",
  );
  const library = await publishedKnowledge(store);
  const ranked = library
    .map((row) => ({
      row,
      score:
        (row.poiId === poiId && poiId ? 10 : 0) +
        (text.includes(row.title) ? 8 : 0) +
        (row.keywords || []).filter((keyword: string) => text.includes(keyword))
          .length *
          3 +
        (!row.poiId ? 1 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return [...ranked.map(({ row }) => knowledgeSource(row)), ...live];
}

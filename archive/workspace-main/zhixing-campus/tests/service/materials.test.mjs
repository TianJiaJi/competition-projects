import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readFileSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { materialCatalog } from "../../packages/demo/src/samples/school/materials.ts";
import {
  schoolScenario,
  schema,
  relationQuery,
  insertSql,
} from "../../packages/demo/src/samples/school/index.ts";
import { serviceContract } from "../../packages/demo/src/samples/school/service-contract.ts";
import { createService } from "../../packages/demo/server/service.mjs";
const root = new URL("../../packages/demo/assets/", import.meta.url);
test("material catalog, directory, ZIP, HTML fragments and runtime SQL/data/contracts agree", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("material-pack/manifest.json", root)),
  );
  assert.equal(materialCatalog.length, 16);
  for (const f of materialCatalog) {
    assert.equal(
      statSync(new URL(f.path, root)).size,
      manifest.files.find((m) => m.path === f.path).size,
    );
    if (f.name.endsWith(".html")) {
      const source = readFileSync(new URL(f.path, root), "utf8");
      assert.match(source, /<template/);
      assert.match(source, /<(section|form|svg|aside)/);
      assert.doesNotMatch(source, /知行|校园|师生|后勤|预制|模拟/);
    }
  }
  const sql = readFileSync(
    new URL(materialCatalog.find((f) => f.name.endsWith(".sql")).path, root),
    "utf8",
  );
  for (const value of [schema, relationQuery, insertSql("tasks", true)])
    assert.ok(sql.includes(value));
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        new URL(
          materialCatalog.find((f) => f.name === "initial-records.json").path,
          root,
        ),
      ),
    ),
    JSON.parse(JSON.stringify(schoolScenario().seed)),
  );
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        new URL(
          materialCatalog.find((f) => f.name === "service-contract.json").path,
          root,
        ),
      ),
    ),
    serviceContract,
  );
  assert.doesNotMatch(
    readFileSync(new URL("M02.svg", root), "utf8"),
    /预制|模拟|非测绘/,
  );
  const zipFiles = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import zipfile,json; print(json.dumps(zipfile.ZipFile(${JSON.stringify(fileURLToPath(new URL("material-pack.zip", root)))}).namelist()))`,
      ],
      { encoding: "utf8" },
    ),
  );
  for (const f of materialCatalog) assert.ok(zipFiles.includes(f.path));
});
test("reference list HTTP import uses real metadata; download paths are allowlisted", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "materials-"));
  const server = createService(dir);
  await new Promise((r) => server.listen(0, "localhost", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://localhost:${server.address().port}`;
  const { state, definition } = await (
    await fetch(base + "/api/workbench")
  ).json();
  const source = definition.workflow.find((n) => n.id === "02-pages");
  assert.equal(source.materials.length, 5);
  const next = await (
    await fetch(base + `/api/runs/${state.run}/node`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node: "02-pages",
        action: "import",
        mode: "reference",
      }),
    })
  ).json();
  assert.equal(next.nodes["02-pages"].files.length, 5);
  assert.ok(next.nodes["02-pages"].files.every((f) => f.size > 100));
  const file = await fetch(
    base + "/api/assets/" + encodeURI(source.materials[0].path),
  );
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-type"), /text\/html/);
  assert.match(await file.text(), /<table>/);
  const zip = await fetch(base + "/api/assets/material-pack.zip");
  assert.equal(zip.status, 200);
  assert.match(zip.headers.get("content-type"), /application\/zip/);
  const invalid = await fetch(
    base + "/api/assets/material-pack/not-in-manifest.html",
  );
  assert.notEqual(invalid.status, 200);
});

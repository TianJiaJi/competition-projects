import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const spec = JSON.parse(
  readFileSync(
    new URL("../../../docs/openapi/frontline-api-v1.0.json", import.meta.url),
    "utf8",
  ),
);
const markdown = readFileSync(
  new URL("../docs/前线处置终端接口文档-V1.0.md", import.meta.url),
  "utf8",
);
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
assert(spec.openapi === "3.1.0", "OpenAPI version");
function walk(value) {
  if (!value || typeof value !== "object") return;
  if (value.$ref) {
    assert(
      value.$ref.startsWith("#/"),
      "Only internal references are expected",
    );
    let node = spec;
    for (const key of value.$ref.slice(2).split("/")) node = node?.[key];
    assert(node, `Unresolved ${value.$ref}`);
  }
  for (const child of Object.values(value)) walk(child);
}
walk(spec);
const replaceRefs = (value) =>
  JSON.parse(
    JSON.stringify(value).replaceAll("#/components/schemas/", "#/$defs/"),
  );
const defs = replaceRefs(spec.components.schemas);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
let exampleCount = 0;
function validate(schema, example, label) {
  const check = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: defs,
    ...replaceRefs(schema),
  });
  assert(check(example), `${label}: ${JSON.stringify(check.errors)}`);
  exampleCount++;
}
for (const [name, schema] of Object.entries(defs))
  ajv.compile({ $defs: defs, ...schema });
const ids = new Set();
let operations = 0;
for (const [path, methods] of Object.entries(spec.paths))
  for (const [method, operation] of Object.entries(methods)) {
    assert(!ids.has(operation.operationId), "Duplicate operationId");
    ids.add(operation.operationId);
    operations++;
    assert(
      markdown.includes(`\`${method.toUpperCase()} ${path}\``) &&
        markdown.includes(`\`${operation.operationId}\``),
      `Markdown missing ${method} ${path}`,
    );
    for (const match of path.matchAll(/\{([^}]+)\}/g))
      assert(
        operation.parameters.some(
          (p) => p.in === "path" && p.name === match[1] && p.required,
        ),
        "Missing path parameter",
      );
    if (!path.startsWith("/auth/"))
      assert(
        operation.parameters.some((p) => p.name === "X-Run-Id" && p.required),
        "Missing run header",
      );
    if (method === "post" && !path.startsWith("/auth/"))
      assert(
        operation.parameters.some(
          (p) => p.name === "Idempotency-Key" && p.required,
        ),
        "Missing idempotency header",
      );
    for (const parameter of operation.parameters)
      if ("example" in parameter)
        validate(parameter.schema, parameter.example, parameter.name);
    const input = operation.requestBody?.content["application/json"];
    if (input)
      validate(input.schema, input.example, operation.operationId + " input");
    for (const [code, response] of Object.entries(operation.responses)) {
      const json = response.content["application/json"];
      validate(json.schema, json.example, `${operation.operationId} ${code}`);
    }
  }
assert(
  spec.paths["/admin/oa-requests/{oaId}/decision"].post[
    "x-required-capability"
  ] === "oa:approve",
  "Approval permission",
);
console.log(
  `${operations} operations, ${Object.keys(defs).length} schemas, ${exampleCount} examples, references and Markdown mappings passed.`,
);

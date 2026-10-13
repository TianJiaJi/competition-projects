import type { DemoCase } from "./data";
export interface Validation {
  valid: boolean;
  errors: string[];
}
export function validateCase(input: DemoCase): Validation {
  const errors: string[] = [];
  const required = (object: object, fields: string[], label: string) =>
    fields.forEach((key) => {
      if (
        typeof (object as Record<string, unknown>)[key] !== "string" ||
        !(object as Record<string, string>)[key].trim()
      )
        errors.push(`${label}.${key} 必须非空`);
    });
  required(input, ["caseId", "version", "completionResult"], "案例");
  for (const key of ["buildings", "facilities", "workOrders"] as const) {
    const seen = new Set<string>();
    if (!input[key]?.length) errors.push(`${key} 不能为空`);
    for (const item of input[key] ?? []) {
      required(item, ["id", "title"], key);
      if (seen.has(item.id)) errors.push(`${key} 编号 ${item.id} 重复`);
      seen.add(item.id);
    }
  }
  for (const f of input.facilities ?? []) {
    required(f, ["buildingId", "location"], f.id);
    if (!input.buildings?.some((b) => b.id === f.buildingId))
      errors.push(`${f.id} 的楼宇引用 ${f.buildingId} 不存在`);
  }
  for (const t of input.workOrders ?? []) {
    required(
      t,
      ["facilityId", "description", "location", "status", "category", "date"],
      t.id,
    );
    if (!input.facilities?.some((f) => f.id === t.facilityId))
      errors.push(`${t.id} 的设施引用 ${t.facilityId} 不存在`);
    if (t.status !== "待处理") errors.push(`${t.id} 初始状态必须为待处理`);
    if (typeof t.owner !== "string" || typeof t.result !== "string")
      errors.push(`${t.id} 必须包含 owner 和 result 文本字段`);
    if (t.owner || t.result) errors.push(`${t.id} 初始处理人和结果必须为空`);
  }
  return { valid: !errors.length, errors };
}

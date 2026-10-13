/** 读取历史数据时更新旧版内置文案，不重置订单、草稿或业务状态。 */
const stockPhrases: ReadonlyArray<readonly [string, string]> = [
  [
    "演示值班员",
    "值班员"
  ],
  [
    "青岚山境景区入口广场（演示地址，非真实邮寄地址）",
    "青岚山境景区入口广场"
  ],
  [
    "演示服务电话统一为 0571-8888 6688，仅用于样例展示。",
    "景区服务电话调整为 0571-8888 6688。"
  ],
  [
    "> 本页内容为演示说明，不代表景区正式公告。",
    "> 出行前请留意景区最新公告。"
  ],
  [
    "青岚山境游览手册（演示版）",
    "青岚山境游览手册"
  ],
  [
    "团队预约按批次登记人数，背景模拟批次不占现场配额，仅用于容量演示。",
    "团队预约按批次登记人数，批次预约与现场配额分别管理。"
  ],
  [
    "本条目引用的来源在演示样例中未提供，用于验证“来源缺失”的呈现效果。",
    "本条目引用的来源暂缺，待补充核实。"
  ],
  [
    "截至 17:00 未入园，订单自动失效（演示样例）",
    "截至 17:00 未入园，订单自动失效"
  ],
  [
    "本条演示 13:00—14:30 区间的过期状态。",
    "午后客流较大，请按现场指引有序通行。"
  ],
  [
    "开园前设备检查已完成，本条演示更早的过期区间。",
    "开园前设备检查已完成。"
  ]
];

export function upgradeStoredCopy<T>(value: T): T {
  if (typeof value === "string") {
    let next: string = value;
    for (const [before, after] of stockPhrases) next = next.replaceAll(before, after);
    return next as T;
  }
  if (Array.isArray(value)) return value.map(item => upgradeStoredCopy(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, upgradeStoredCopy(item)])) as T;
  }
  return value;
}

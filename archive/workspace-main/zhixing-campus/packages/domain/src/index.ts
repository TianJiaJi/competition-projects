export type * from "./types";
import type {
  SceneState,
  Collection,
  RecordItem,
  Scenario,
  Metric,
} from "./types";
export function createState(scenario: Scenario): SceneState {
  return {
    records: JSON.parse(JSON.stringify(scenario.seed)),
    identity: null,
    nextId: 100,
  };
}
export function createRecord(
  state: SceneState,
  collection: Collection,
  input: Omit<RecordItem, "id">,
) {
  const item = { ...input, id: `${collection}-${state.nextId++}` };
  state.records[collection].unshift(item);
  return item;
}
export function metrics(state: SceneState, scenario: Scenario): Metric[] {
  const sum = (key: "used" | "capacity", items: RecordItem[]) =>
    items.reduce((n, r) => n + (r[key] ?? 0), 0);
  const buildings = state.records.buildings,
    facilities = state.records.facilities;
  const online = facilities.filter((r) => r.status === "正常").length;
  return [
    scenario.kind === "community"
      ? {
          label: scenario.metricLabels.primary,
          value: String(sum("used", buildings)),
          unit: "户",
          note: `共 ${sum("capacity", buildings)} 户 · ${buildings.length} 栋住宅`,
        }
      : {
          label: scenario.metricLabels.primary,
          value: String(sum("used", buildings)),
          unit: "间",
          note: `共 ${sum("capacity", buildings)} 间 · ${buildings.length} 栋楼宇`,
        },
    scenario.kind === "community"
      ? {
          label: scenario.metricLabels.secondary,
          value: String(
            sum("capacity", state.records.parking) -
              sum("used", state.records.parking),
          ),
          unit: "个",
          note: `${state.records.parking.length} 个停车分区`,
        }
      : {
          label: scenario.metricLabels.secondary,
          value: String(
            state.records.bookings.filter((r) => r.status === "已预约").length,
          ),
          unit: "项",
          note: "全部有效预约",
        },
    {
      label: scenario.metricLabels.tasks,
      value: String(
        state.records.tasks.filter((r) => r.status !== "已完成").length,
      ),
      unit: "项",
      note: "含待处理与处理中",
    },
    {
      label: scenario.metricLabels.health,
      value: facilities.length
        ? ((online / facilities.length) * 100).toFixed(1)
        : "0",
      unit: "%",
      note: `${online} / ${facilities.length} 处设施正常`,
    },
  ];
}
export function validateRecord(
  title: string,
  location: string,
  description: string,
  contact = "",
) {
  if (!title.trim() || !location.trim() || !description.trim())
    return "请填写名称、位置和详细说明";
  if (contact && !/^1\d{10}$/.test(contact))
    return "请输入有效的 11 位手机号码";
  return "";
}
export function claim(item: RecordItem, identity: string) {
  if (item.status === "待处理") {
    item.status = "处理中";
    item.owner = identity;
  }
}
export function complete(item: RecordItem, result: string) {
  if (item.status !== "处理中") return "请先领取任务";
  if (!result.trim()) return "请填写处理结果";
  item.result = result.trim();
  item.status = "已完成";
  return "";
}
export function answerQuestion(
  question: string,
  scenario: Scenario,
  state: SceneState,
) {
  if (/停车|车位/.test(question) && scenario.kind === "community") {
    const count = state.records.parking.reduce(
      (n, r) => n + (r.capacity ?? 0) - (r.used ?? 0),
      0,
    );
    return `当前共有 ${count} 个停车余位。${state.records.parking.map((r) => `${r.title}余位 ${(r.capacity ?? 0) - (r.used ?? 0)} 个`).join("，")}。请按现场指引停车。`;
  }
  return (
    scenario.questions.find((q) => q.question === question)?.answer ??
    `我可以协助你了解${scenario.location}服务、报修与预约。请点击下方常见问题，或前往服务页面查看详细信息。`
  );
}

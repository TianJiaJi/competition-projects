import data, { pointById } from "../../apps/mobile/src/data";
import type { LocalState, OrderInput, Preferences } from "../../apps/mobile/src/model/types";
export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const dateAt = (offset = 0) => {
  const date = new Date(Date.now() + offset * 86400000 + 8 * 3600000);
  return date.toISOString().slice(0, 10);
};
export const slots = Array.from(
  { length: 9 },
  (_, i) =>
    `${String(i + 8).padStart(2, "0")}:00—${String(i + 9).padStart(2, "0")}:00`,
);
export function seed(): LocalState {
  return {
    version: 1,
    runId: "local-" + uid(),
    nickname: "",
    orders: [],
    favourites: [],
    messages: [],
    closedPoints: [],
    closedEdges: [],
    tour: null,
    aiSession: "",
    aiRunId: "",
    conversationIds: [],
  };
}
export function availability(
  s: LocalState,
  date: string,
  slot: string,
  kind: "entry" | "parking",
  parkingId = "p1",
  exceptId = "",
) {
  const capacity = kind === "entry" ? 30 : 12;
  return Math.max(
    0,
    capacity -
      s.orders
        .filter(
          (o) =>
            o.id !== exceptId &&
            o.date === date &&
            o.slot === slot &&
            o.kind === kind &&
            o.status === "confirmed" &&
            (kind === "entry" || o.parkingId === parkingId),
        )
        .reduce((n, o) => n + (kind === "entry" ? o.people : 1), 0),
  );
}
function validate(input: OrderInput) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    input.date < dateAt() ||
    input.date > dateAt(1)
  )
    throw Error("请选择今天或明天的到访日期。");
  if (!slots.includes(input.slot)) throw Error("请选择有效时段。");
  if (!input.name.trim() || input.name.trim().length > 30)
    throw Error("请填写不超过 30 字的联系人姓名。");
  if (!/^1\d{10}$/.test(input.phone)) throw Error("请填写 11 位手机号码。");
  if (
    input.kind === "entry" &&
    (!Number.isInteger(input.people) || input.people < 1 || input.people > 10)
  )
    throw Error("每笔入园预约限 1—10 人。");
  if (
    input.kind === "parking" &&
    (!/^.{5,10}$/.test(input.plate.trim()) ||
      !["p1", "p2", "p3"].includes(input.parkingId))
  )
    throw Error("请选择停车场并填写 5—10 字符的车牌号。");
}
export function createOrder(s: LocalState, input: OrderInput, id = uid()) {
  const existing = s.orders.find((o) => o.id === id);
  if (existing) {
    if (
      Object.keys(input).some((k) => {
        const key = k as keyof OrderInput;
        const value =
          key === "name"
            ? input.name.trim()
            : key === "plate"
              ? input.plate.trim().toUpperCase()
              : input[key];
        return existing[key] !== value;
      })
    )
      throw Error("相同预约编号的内容不一致。");
    return existing;
  }
  validate(input);
  const amount = input.kind === "entry" ? input.people : 1;
  if (
    availability(s, input.date, input.slot, input.kind, input.parkingId) <
    amount
  )
    throw Error("该时段剩余名额不足，请更换时段。");
  if (input.kind === "parking" && s.closedPoints.includes(input.parkingId))
    throw Error("该停车场暂未开放。");
  const order = {
    ...input,
    id,
    name: input.name.trim(),
    plate: input.plate.trim().toUpperCase(),
    status: "confirmed" as const,
    entered: false,
    createdAt: new Date().toISOString(),
  };
  s.orders.unshift(order);
  return order;
}
export function cancelOrder(s: LocalState, id: string) {
  const o = s.orders.find((o) => o.id === id);
  if (!o) throw Error("预约不存在。");
  if (o.entered) throw Error("已入园或进场的预约不可取消。");
  o.status = "cancelled";
}
export function rescheduleOrder(
  s: LocalState,
  id: string,
  date: string,
  slot: string,
) {
  const o = s.orders.find((o) => o.id === id);
  if (!o || o.status !== "confirmed" || o.entered)
    throw Error("当前预约不可改期。");
  validate({ ...o, date, slot });
  if (
    availability(s, date, slot, o.kind, o.parkingId, id) <
    (o.kind === "entry" ? o.people : 1)
  )
    throw Error("新时段余量不足，原预约已保留。");
  o.date = date;
  o.slot = slot;
}
export function enter(s: LocalState, id: string) {
  const o = s.orders.find((o) => o.id === id);
  if (!o || o.status !== "confirmed" || o.kind !== "entry")
    throw Error("请选择有效入园预约。");
  if (o.entered) return;
  if (o.date !== dateAt())
    throw Error("只能模拟今天的预约入园；可先将预约改为今天。");
  if (s.orders.some((x) => x.entered && !x.exited && x.kind === "entry"))
    throw Error("已有入园批次，请重置演示后重新体验。");
  o.entered = true;
  if (s.tour) {
    s.tour.orderId = o.id;
    s.tour.status = "ready";
  }
}
export function matchingRoutes(s: LocalState, p: Preferences) {
  return data.routes
    .filter(
      (r) =>
        r.minutes * (p.pace === "轻松" ? 1.2 : p.pace === "紧凑" ? 0.85 : 1) <=
          p.hours * 60 &&
        (!p.accessible || r.accessible) &&
        p.required.every((id) => r.stops.includes(id)) &&
        !r.edgeIds.some((id) => s.closedEdges.includes(id)) &&
        !r.nodeIds.some((id) => s.closedPoints.includes(id)),
    )
    .sort((a, b) => {
      const score = (r: typeof a) =>
        r.interests.filter((i) => p.interests.includes(i)).length * 5 -
        (p.avoidBusy
          ? r.stops.filter(
              (id) =>
                (s.pointLoads ||
                  (data.snapshot.points as Record<string, { load: string }>))[
                  id
                ]?.load === "busy",
            ).length * 3
          : 0) -
        (p.elderly || p.children ? r.distance / 1000 : 0);
      return score(b) - score(a) || a.minutes - b.minutes;
    });
}
export function useRoute(s: LocalState, id: string) {
  const route = data.routes.find((r) => r.id === id);
  if (!route) throw Error("路线不存在。");
  if (
    route.edgeIds.some((x) => s.closedEdges.includes(x)) ||
    route.nodeIds.some((x) => s.closedPoints.includes(x))
  )
    throw Error("路线受到关闭设施或道路影响，请重新选择。");
  const order = s.orders.find(
    (o) =>
      o.kind === "entry" && o.entered && !o.exited && o.status === "confirmed",
  );
  s.tour = {
    routeId: id,
    status: order ? "ready" : "preview",
    progress: 0,
    orderId: order?.id ?? null,
  };
}
export function sendMessage(s: LocalState, room: string, text: string) {
  const content = text.trim();
  if (!content) throw Error("请输入消息。");
  if (content.length > 300) throw Error("消息最多 300 字。");
  if (room !== "park" && !pointById[room]) throw Error("聊天室不存在。");
  s.messages.push({
    id: uid(),
    room,
    text: content,
    name: s.nickname || "山间来客",
    at: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    simulated: false,
  });
  if (s.messages.length > 500) s.messages = s.messages.slice(-500);
}

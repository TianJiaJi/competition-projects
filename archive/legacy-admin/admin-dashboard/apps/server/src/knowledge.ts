import { readFileSync } from "node:fs";
const scenic = JSON.parse(
  readFileSync(
    new URL("../../../packages/scenic/generated/mobile.json", import.meta.url),
    "utf8",
  ),
) as {
  name: string;
  routes: Array<{ name: string; edgeIds: string[]; nodeIds: string[] }>;
  points: Array<{
    id: string;
    name: string;
    description: string;
    hours: string;
    kind: string;
  }>;
};
import type {
  Source,
  ScenicState,
} from "../../../packages/contracts/src/mobile-qa.ts";
export type { Source } from "../../../packages/contracts/src/mobile-qa.ts";

const poiLore: Record<string, string> = {
  creek: "听溪台是青岚山境最早的观水点。旧传一位守山琴师曾在台下以溪声校弦，雨后若水势放缓，石缝里的回声会像第二道溪流。适合傍晚前坐在临水一侧，先听水，再看峡谷的光线变化。",
  bamboo: "竹影幽径原是山民往返茶园的小路，竹节上保留着旧时分辨季节的刻痕。当地故事里，春笋破土前会先有一阵无风自响的竹叶声。这里的看点不是走得快，而是从入口数到第七个石阶后回头看，竹影会把山路分成几层。",
  gorge: "叠翠峡的两面岩壁像合拢的书页，旧称‘山门未合’。传说早年的采药人会把当天见到的云色记在峡壁旁的石牌上，久而久之形成了辨雨的民间口诀。晴天适合看远山轮廓，雨后则适合听峡壁里的水声。",
  summit: "望岳台是青岚山境的最高观景处，也是山中人迎接远客的地方。传说台边那块朝北的望石会记住每一位登顶者第一次看见群山的方向。清晨看层云，午后看镜湖，临近闭园前则能看到山脊颜色从青转黛。",
  falls: "飞瀑亭下的水潭旧名‘洗砚潭’，传说一位落第书生在此听瀑三日，回去后写成了山中流传的第一篇游记。瀑声大时不必急着说话，站在亭侧能看见水雾把石壁的绿色提亮。雨后石阶湿滑，故事可以慢慢听，脚下要沿开放步道走。",
  lake: "镜湖栈道沿着一处古老的山间堰湖展开。相传湖面最安静时，会把来人的心事映成不同的云影，因此山民把这里当作出发前整理心绪的地方。清晨看倒影，午后看风纹，适合在临水转角停留片刻。",
  forest: "松风林曾是护林人轮值歇脚的地方，林中几株老松被称作‘听风树’。山里的说法是，风从不同树冠穿过，会带来不同季节的消息。这里适合放慢脚步，坐在石凳上听松涛，也常被安排作环线返程前的安静一站。",
};
export const sources: Source[] = [
  {
    id: "visit-rules",
    title: "青岚山境游览指南",
    kind: "fictional_setting",
    excerpt:
      "免费分时预约入园，每小时一个时段；08:00 开园、17:00 停止入园、18:00 闭园。入园身份识别后续采用人脸识别，当前服务不采集人脸。停车独立预约，不选择具体车位；预约成功不等于占有车位。",
    version: "mobile-1",
  },
  {
    id: "route-guide",
    title: "路线推荐使用说明",
    kind: "fictional_setting",
    excerpt:
      "从导览打开路线推荐，选择时长、兴趣、节奏、同行条件、必去景点及避拥堵。系统筛选预设路线。关闭道路或景点不推荐，无匹配可调整条件。路线不是实时 AI 规划，不保证最优。地图位置用于路线预览，支持开始、暂停、继续。",
    version: "mobile-1",
  },
  ...scenic.points.map((p) => ({
    id: "poi-" + p.id,
    title: p.name,
    kind: "fictional_setting",
    excerpt: `${p.name}：${p.description}。核心设定：${poiLore[p.id] || "这里有一段可以沿着山水慢慢发现的地方故事。"} 开放时间：${p.hours}。当前开放与忙闲以景区状态资料为准。`,
    version: "mobile-1",
  })),
];
export function contextFor(
  text: string,
  poiId: string | null,
  snapshot: ScenicState,
) {
  const selected = [sources[0], sources[1]];
  const poi = scenic.points.find((p) => p.id === poiId);
  if (poi) selected.push(sources.find((s) => s.id === "poi-" + poi.id)!);
  for (const p of scenic.points)
    if (text.includes(p.name) && !selected.some((s) => s.id === "poi-" + p.id))
      selected.push(sources.find((s) => s.id === "poi-" + p.id)!);
  if (snapshot && typeof snapshot === "object") {
    const values = snapshot.points;
    const rows: string[] = [];
    for (const p of scenic.points) {
      const v = values[p.id];
      if (!v || typeof v !== "object") continue;
      const item = v;
      const availability = [
        "open",
        "closed",
        "maintenance",
        "unknown",
      ].includes(String(item.availability))
        ? String(item.availability)
        : "unknown";
      const load = ["quiet", "light", "moderate", "busy", "unknown"].includes(
        String(item.load),
      )
        ? String(item.load)
        : "unknown";
      const openLabel: Record<string, string> = {
        open: "开放",
        closed: "暂时关闭",
        maintenance: "维护中",
        unknown: "未知",
      };
      const loadLabel: Record<string, string> = {
        quiet: "空闲",
        moderate: "适中",
        busy: "拥堵",
        unknown: "未知",
      };
      rows.push(
        `${p.name}：开放状态=${openLabel[availability]}，忙闲=${loadLabel[load]}`,
      );
    }
    for (const route of scenic.routes) {
      const blocked =
        route.edgeIds.some((id) => snapshot.closedEdgeIds.includes(id)) ||
        route.nodeIds.some(
          (id) => values[id] && values[id].availability !== "open",
        );
      rows.push(
        `${route.name}：${blocked ? "暂不可用，涉及关闭点位或道路" : "当前可供选择"}`,
      );
    }
    if (rows.length)
      selected.push({
        id: "live-snapshot",
        title: "当前景区开放状态",
        kind: "live_snapshot",
        excerpt:
          `这是当前景区状态资料，不代表实时传感器观测。引用时刻 ${new Date().toISOString()}。\n` +
          rows.join("\n"),
        version: "scenic-state",
      });
  }
  return selected;
}

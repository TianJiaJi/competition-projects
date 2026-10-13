import type {
  AdminUser,
  Article,
  AssetItem,
  GlobalData,
  KnowledgeEntry,
  KnowledgeSource,
  ScenicProfile,
} from "../../src/core/types";
import { assetCatalogue, defaultCoverUrl } from "../../src/core/assets";
import { BUSINESS_TIME_MS, DEFAULT_RUN_ID } from "./time";

const hour = 3_600_000;

export const demoUsers: AdminUser[] = [
  { id: "staff-demo", nickname: "值班员", identity: "staff", createdAt: "2026-01-06 09:00", disabled: false },
  { id: "staff-ops", nickname: "值班主管", identity: "staff", createdAt: "2026-01-08 09:30", disabled: false },
  { id: "visitor-1001", nickname: "山客小岚", identity: "visitor", createdAt: "2026-08-18 10:12", disabled: false },
  { id: "visitor-1002", nickname: "听溪的人", identity: "visitor", createdAt: "2026-08-22 13:40", disabled: false },
  { id: "visitor-1003", nickname: "竹林听风", identity: "visitor", createdAt: "2026-08-29 08:55", disabled: false },
  { id: "visitor-1004", nickname: "阿岫", identity: "visitor", createdAt: "2026-09-02 15:20", disabled: true },
  { id: "visitor-1005", nickname: "归云客", identity: "visitor", createdAt: "2026-09-05 11:05", disabled: false },
  { id: "visitor-1006", nickname: "雾里看山", identity: "visitor", createdAt: "2026-09-09 17:32", disabled: false },
];

export const scenicProfile: ScenicProfile = {
  name: "青岚山境",
  summary:
    "青岚山境是依托青绿山水与轻水墨意象构建的当代山岳景区，环形主路串联溪谷、竹林、峡谷、山顶、湖畔、林间与瀑布七处景观，并配有索道、卫生间、停车场与安全设施。",
  address: "青岚山境景区入口广场",
  servicePhone: "0571-8888 6688",
  coverUrl: defaultCoverUrl,
  openingText: "每日 08:00—17:00 开放入园，索道运营 08:00—18:30；展示文案不改变预约与设施营业规则。",
  updatedAt: BUSINESS_TIME_MS - 8 * hour,
};

interface ArticleSeed {
  category: Article["category"];
  title: string;
  summary: string;
  published: boolean;
}

const articleSeeds: ArticleSeed[] = [
  { category: "guide", title: "环线步道完整游览指南", summary: "从入口广场沿环形主路依次经过溪谷、竹林、峡谷与山顶，全程约 3 小时。", published: true },
  { category: "guide", title: "无障碍通行说明", summary: "入口至听溪台、归云集一带为缓坡步道，索道上下站设无障碍通道。", published: true },
  { category: "guide", title: "亲子游览路线建议", summary: "推荐竹林区与林间休息区两段短程路线，沿途设有休憩石凳与卫生间。", published: true },
  { category: "guide", title: "雨天游览注意事项", summary: "雨后石阶湿滑，飞瀑亭附近步道视情况限流，请按现场标识通行。", published: true },
  { category: "guide", title: "索道乘坐与运力说明", summary: "索道单程 8 分钟，单方向运力 20 人／分钟，排队高峰请按指引等候。", published: true },
  { category: "guide", title: "停车场分布与步行距离", summary: "三处停车场均位于入口广场外围，步行 5—10 分钟可到达入园口。", published: true },
  { category: "guide", title: "山顶观景台最佳时段", summary: "午后山顶光照稳定，望岳台向东可远眺山峦与湖面。", published: true },
  { category: "guide", title: "卫生间位置速查", summary: "六座卫生间分布在入口、溪谷、峡谷、山顶、湖畔与林间片区。", published: true },
  { category: "guide", title: "饮水与补给点说明", summary: "竹间驿与归云集提供饮水与简餐，营业时间以现场公示为准。", published: true },
  { category: "guide", title: "急救与求助设施分布", summary: "入口与山顶设 AED 与急救点，其余片区设一键求助点与救生圈。", published: true },
  { category: "guide", title: "团队游客分组提示", summary: "团队建议在入口广场集合，按批次进入环形主路，避免在峡谷段滞留。", published: true },
  { category: "guide", title: "离园路线与出口指引", summary: "返程沿归云集方向步行至景区出口，出口是唯一配置出口。", published: true },
  { category: "news", title: "秋季山色观赏提示", summary: "近期山体植被转色，溪谷与湖畔两段观景效果较好。", published: true },
  { category: "news", title: "峡谷段步道维护完成", summary: "叠翠峡步道例行维护已完成，恢复正常通行。", published: true },
  { category: "news", title: "索道设备例行检查安排", summary: "索道将于近期进行例行检查，具体时间以现场公告为准。", published: true },
  { category: "news", title: "周末客流提示", summary: "周末午后为入园高峰，建议提前选择较早时段预约。", published: true },
  { category: "news", title: "林间休息区座椅更新", summary: "松风林休息区座椅已完成更新，新增遮阴设施。", published: true },
  { category: "news", title: "停车场引导标识优化", summary: "三处停车场入口新增夜间可读引导标识，便于夜间离场。", published: true },
  { category: "news", title: "卫生间分项维修说明", summary: "部分卫生间分项暂停期间，可用服务位以现场显示为准。", published: false },
  { category: "news", title: "安全设施月度巡检完成", summary: "本月 AED、灭火器与应急避难点巡检已完成，结果正常。", published: true },
  { category: "news", title: "景区服务电话调整通知", summary: "景区服务电话调整为 0571-8888 6688。", published: false },
  { category: "news", title: "山顶平台限流说明", summary: "望岳台在客流接近承载上限时将采取短时限流措施。", published: true },
];

function articleBody(seed: ArticleSeed, imageUrl: string): string {
  return [
    `## ${seed.title}`,
    "",
    seed.summary,
    "",
    "### 出行提示",
    "",
    "- 请按开放步道通行，不要跨越护栏",
    "- 午后客流较高，可错峰前往",
    "- 现场标识与工作人员指引优先于本页说明",
    "",
    `更多路线信息可查看[环线步道完整游览指南](#/content/articles)，或参考下图：`,
    "",
    `![游览示意图](${imageUrl})`,
    "",
    "> 出行前请留意景区最新公告。",
  ].join("\n");
}

function buildArticles(): Article[] {
  return articleSeeds.map((seed, index) => {
    const asset: AssetItem = assetCatalogue[index % assetCatalogue.length];
    const createdAt = BUSINESS_TIME_MS - (30 - index % 12) * 24 * hour;
    return {
      id: `article-${String(index + 1).padStart(3, "0")}`,
      category: seed.category,
      title: seed.title,
      summary: seed.summary,
      body: articleBody(seed, asset.url),
      coverUrl: asset.url,
      published: seed.published,
      createdAt,
      updatedAt: BUSINESS_TIME_MS - index * hour - hour,
      revision: 1,
    };
  });
}

export const knowledgeSources: KnowledgeSource[] = [
  { id: "source-01", title: "青岚山境游览手册", publisher: "景区运营部", publishedAt: "2026-03-01" },
  { id: "source-02", title: "山岳景区步道安全指引", publisher: "安全管理组", publishedAt: "2026-05-18" },
  { id: "source-03", title: "索道运行与排队说明", publisher: "索道运维组", publishedAt: "2026-06-02" },
  { id: "source-04", title: "卫生间服务位配置说明", publisher: "设施保障组", publishedAt: "2026-07-11" },
  { id: "source-05", title: "停车场引导方案", publisher: "交通协调组", publishedAt: "2026-08-04" },
];

export const knowledgeEntries: KnowledgeEntry[] = [
  {
    id: "kb-01",
    title: "景区开放时间与入园规则",
    body: "青岚山境每日 08:00—17:00 开放入园，当日未消费的入园预约在 17:00 失效。",
    keywords: ["开放时间", "入园", "预约"],
    sourceId: "source-01",
    version: "v3",
    retrievalStatus: "ready",
  },
  {
    id: "kb-02",
    title: "听溪台观景与步道说明",
    body: "听溪台临溪而筑，沿支路缓行可近看溪谷；雨后石面湿滑，请按开放步道通行。",
    poiId: "creek",
    keywords: ["听溪台", "溪谷", "步道"],
    sourceId: "source-02",
    version: "v2",
    retrievalStatus: "ready",
  },
  {
    id: "kb-03",
    title: "望岳台与索道换乘",
    body: "望岳台为环线最高处，可沿山路返程，或前往索道上站乘索道下行。",
    poiId: "summit",
    keywords: ["望岳台", "索道", "换乘"],
    sourceId: "source-03",
    version: "v1",
    retrievalStatus: "ready",
  },
  {
    id: "kb-04",
    title: "卫生间分项服务位说明",
    body: "卫生间按女厕位、男厕位、小便位与无障碍间四类分项统计，暂停数量按实际生效规则计算。",
    poiId: "t1",
    keywords: ["卫生间", "服务位", "暂停"],
    sourceId: "source-04",
    version: "v4",
    retrievalStatus: "ready",
  },
  {
    id: "kb-05",
    title: "停车场与步行接驳",
    body: "三处停车场均位于入口广场外围，步行 5—10 分钟可到达入园口，实际余位以现场为准。",
    keywords: ["停车场", "接驳", "步行"],
    sourceId: "source-05",
    version: "v2",
    retrievalStatus: "ready",
  },
  {
    id: "kb-06",
    title: "应急避难点位置说明",
    body: "入口广场与山顶平台设应急避难点，遇突发天气请按工作人员指引前往。",
    keywords: ["应急", "避难", "安全"],
    sourceId: "source-02",
    version: "v1",
    retrievalStatus: "disabled",
  },
  {
    id: "kb-07",
    title: "团队预约与分批入园",
    body: "团队预约按批次登记人数，批次预约与现场配额分别管理。",
    keywords: ["团队", "批次", "配额"],
    sourceId: "source-01",
    version: "v1",
    retrievalStatus: "ready",
  },
  {
    id: "kb-08",
    title: "已归档的夜间游览问答（来源缺失）",
    body: "本条目引用的来源暂缺，待补充核实。",
    keywords: ["夜间", "问答", "归档"],
    sourceId: "source-archived",
    version: "v0",
    retrievalStatus: "disabled",
  },
];

export const globalSeed = (): GlobalData => ({
  users: demoUsers.map((user) => ({ ...user })),
  scenic: { ...scenicProfile },
  articles: buildArticles(),
  poiOverrides: {},
  knowledge: knowledgeEntries.map((entry) => ({ ...entry, keywords: [...entry.keywords] })),
  sources: knowledgeSources.map((source) => ({ ...source })),
  inspectionPlans: [
    {
      id: "plan-001",
      facilityId: "aed-entry",
      intervalDays: 30,
      nextDueDate: "2026-09-12",
      instructions: "检查 AED 电池与电极片有效期，确认箱体指示灯正常。",
      enabled: true,
      createdAt: BUSINESS_TIME_MS - 40 * 24 * hour,
      updatedAt: BUSINESS_TIME_MS - 40 * 24 * hour,
    },
    {
      id: "plan-002",
      facilityId: "fire-market",
      intervalDays: 60,
      nextDueDate: "2026-09-20",
      instructions: "检查灭火器压力表与铅封，记录检查日期。",
      enabled: true,
      createdAt: BUSINESS_TIME_MS - 20 * 24 * hour,
      updatedAt: BUSINESS_TIME_MS - 20 * 24 * hour,
    },
    {
      id: "plan-003",
      facilityId: "shelter-summit",
      intervalDays: 90,
      nextDueDate: "2026-08-30",
      instructions: "检查应急避难点标识与照明，停用计划保留历史告警。",
      enabled: false,
      createdAt: BUSINESS_TIME_MS - 90 * 24 * hour,
      updatedAt: BUSINESS_TIME_MS - 30 * 24 * hour,
    },
  ],
  nextArticleSeq: articleSeeds.length + 1,
  nextPlanSeq: 4,
  revision: 1,
});

export const seedRunId = DEFAULT_RUN_ID;

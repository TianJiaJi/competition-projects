import {sync,captureVersions} from "./store";
import {writeOnline} from "./online-write";
import { points, pointById, regions } from "@scenic/scenic";
import { assetCatalogue, defaultCoverUrl } from "../core/assets";
import { extractImageUrls, findUnsafeUrls, isCatalogueImage } from "../core/markdown";
import { LIMITS, checkPhone, checkText, collectErrors } from "../core/validate";
import { noticeEffectiveState, parseWallClock, toIsoString, type NoticeEffectiveState } from "../core/time";
import { businessNow } from "../core/time";
import type {
  Article,
  AssetItem,
  KnowledgeEntry,
  KnowledgeSource,
  Notice,
  PoiContentOverride,
  ScenicProfile,
} from "../core/types";
import { fail, ok, type ApiResult } from "../core/result";
import { getRun, getStore, mutate, requireStaff } from "./store";
import { matchKeyword, paginate, sortByUpdatedDesc, type ListQuery, type ListResult } from "./list";

async function settle<T>(value: T, ms = 120): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

export interface ScenicSaveInput {
  name: string;
  summary: string;
  address: string;
  servicePhone: string;
  coverUrl: string;
  openingText: string;
}

function validateScenic(input: ScenicSaveInput) {
  return collectErrors([
    checkText(input.name, "name", LIMITS.scenicName, "景区名称"),
    checkText(input.summary, "summary", LIMITS.summary, "景区简介"),
    checkText(input.address, "address", LIMITS.addressOrHours, "地址"),
    checkPhone(input.servicePhone, "servicePhone"),
    checkText(input.openingText, "openingText", LIMITS.addressOrHours, "营业说明"),
    !input.coverUrl || isCatalogueImage(input.coverUrl) ? null : { field: "coverUrl", message: "封面必须从随包素材清单选择" },
  ]);
}

export async function getScenic(): Promise<ApiResult<ScenicProfile>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  return settle(ok(getStore().global.scenic));
}

export async function saveScenic(input: ScenicSaveInput): Promise<ApiResult<ScenicProfile>> {
 const errors=validateScenic(input);if(errors.length)return fail("VALIDATION_ERROR","请检查表单内容",{fieldErrors:errors});
 return writeOnline("saveScenic",[input],()=>getScenic());
}

export interface ArticleQuery extends ListQuery {
  keyword?: string;
  category?: Article["category"] | "all";
  published?: boolean | "all";
}

export function articleMatches(article: Article, query: ArticleQuery): boolean {
  if (query.category && query.category !== "all" && article.category !== query.category) return false;
  if (typeof query.published === "boolean" && article.published !== query.published) return false;
  return matchKeyword(query.keyword, [article.title, article.summary]);
}

export async function adminListArticles(query: ArticleQuery = {}): Promise<ApiResult<ListResult<Article>>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const all = sortByUpdatedDesc(getStore().global.articles.filter((article) => articleMatches(article, query)));
  return settle(ok(paginate(all, query)));
}

export async function adminGetArticle(id: string): Promise<ApiResult<Article>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const article = getStore().global.articles.find((item) => item.id === id);
  if (!article) return settle(fail("NOT_FOUND", "没有找到对应的资讯或指南。"));
  return settle(ok(article));
}

export interface ArticleInput {
  category: Article["category"];
  title: string;
  summary: string;
  body: string;
  coverUrl: string;
}

function validateArticle(input: ArticleInput) {
  return collectErrors([
    checkText(input.title, "title", LIMITS.title, "标题"),
    checkText(input.summary, "summary", LIMITS.summary, "摘要"),
    checkText(input.body, "body", LIMITS.markdownBody, "正文"),
    !input.coverUrl || isCatalogueImage(input.coverUrl) ? null : { field: "coverUrl", message: "封面必须从随包素材清单选择" },
    ...extractImageUrls(input.body)
      .filter((url) => !isCatalogueImage(url))
      .map((url) => ({ field: "body", message: `正文图片必须来自素材清单：${url}` })),
    ...findUnsafeUrls(input.body).map((url) => ({ field: "body", message: `正文包含不允许的链接：${url}` })),
  ]);
}

export async function createArticle(input: ArticleInput & { published?: boolean }): Promise<ApiResult<Article>> {
 const errors=validateArticle(input);if(errors.length)return fail("VALIDATION_ERROR","请检查表单内容",{fieldErrors:errors});
 return writeOnline("createArticle",[input],id=>adminGetArticle(id));
}

export interface ArticlePatch extends ArticleInput {
  published?: boolean;
}

export async function saveArticle(id: string, patch: ArticlePatch): Promise<ApiResult<Article>> {
 const errors=validateArticle(patch);if(errors.length)return fail("VALIDATION_ERROR","请检查表单内容",{fieldErrors:errors});
 return writeOnline("saveArticle",[id,patch],id=>adminGetArticle(id));
}

export async function deleteArticle(id: string): Promise<ApiResult<{ id: string }>> {
 return writeOnline("deleteArticle",[id],async()=>ok({id}));
}

export interface PoiView {
  poiId: string;
  name: string;
  sharedName: string;
  summary: string;
  body: string;
  imageUrls: string[];
  sourceIds: string[];
  regionId: string;
  regionName: string;
  nodeId: string;
  hasOverride: boolean;
  updatedAt?: number;
}

export interface PoiQuery {
  keyword?: string;
  regionId?: string | "all";
}

function regionName(regionId: string): string {
  return regions.find((region) => region.id === regionId)?.name ?? regionId;
}

export function buildPoiView(overrides: Record<string, PoiContentOverride>): PoiView[] {
  return points
    .filter((point) => point.kind === "attraction")
    .map((point) => {
      const override = overrides[point.id];
      return {
        poiId: point.id,
        name: override?.name ?? point.name,
        sharedName: point.name,
        summary: override?.summary ?? point.description,
        body: override?.body ?? "",
        imageUrls: override?.imageUrls ?? [],
        sourceIds: override?.sourceIds ?? [],
        regionId: point.regionId,
        regionName: regionName(point.regionId),
        nodeId: point.nodeId,
        hasOverride: Boolean(override),
        updatedAt: override?.updatedAt,
      };
    });
}

export async function listPois(query: PoiQuery = {}): Promise<ApiResult<PoiView[]>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const views = buildPoiView(getStore().global.poiOverrides).filter((view) => {
    if (query.regionId && query.regionId !== "all" && view.regionId !== query.regionId) return false;
    return matchKeyword(query.keyword, [view.name, view.summary]);
  });
  return settle(ok(views));
}

export async function getPoi(poiId: string): Promise<ApiResult<PoiView>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const view = buildPoiView(getStore().global.poiOverrides).find((item) => item.poiId === poiId);
  if (!view) return settle(fail("NOT_FOUND", "没有找到对应的景点。"));
  return settle(ok(view));
}

export interface PoiContentInput {
  name: string;
  summary: string;
  body: string;
  imageUrls: string[];
  sourceIds: string[];
}

export async function savePoiContent(poiId: string, input: PoiContentInput): Promise<ApiResult<PoiContentOverride>> {
 return writeOnline("savePoiContent",[poiId,input],async()=>ok(getStore().global.poiOverrides[poiId]));
}

export interface NoticeQuery extends ListQuery {
  keyword?: string;
  audience?: Notice["audience"] | "all";
  published?: boolean | "all";
  effectiveState?: NoticeEffectiveState | "all";
}

export interface NoticeView extends Notice {
  effectiveState: NoticeEffectiveState;
}

export function buildNoticeView(notice: Notice, now = businessNow()): NoticeView {
  return { ...notice, effectiveState: noticeEffectiveState(notice, now) };
}

export async function adminListNotices(query: NoticeQuery = {}): Promise<ApiResult<ListResult<NoticeView>>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const now = businessNow();
  const views = getStore()
    .runs[getStore().activeRunId].notices.map((notice) => buildNoticeView(notice, now))
    .filter((notice) => {
      if (query.audience && query.audience !== "all" && notice.audience !== query.audience) return false;
      if (typeof query.published === "boolean" && notice.published !== query.published) return false;
      if (query.effectiveState && query.effectiveState !== "all" && notice.effectiveState !== query.effectiveState) return false;
      return matchKeyword(query.keyword, [notice.title, notice.body]);
    });
  const sorted = sortByUpdatedDesc(views.map((notice) => ({ ...notice, id: notice.id })));
  return settle(ok(paginate(sorted, query)));
}

export async function getNotice(id: string): Promise<ApiResult<NoticeView>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const notice = getRun().notices.find((item) => item.id === id);
  if (!notice) return settle(fail("NOT_FOUND", "没有找到对应的公告。"));
  return settle(ok(buildNoticeView(notice)));
}

export interface NoticeInput {
  title: string;
  body: string;
  audience: Notice["audience"];
  startsAt: string;
  endsAt: string;
}

function validateNotice(input: NoticeInput) {
  const errors = collectErrors([
    checkText(input.title, "title", LIMITS.title, "公告标题"),
    checkText(input.body, "body", LIMITS.noticeBody, "公告正文"),
  ]);
  const start = parseWallClock(input.startsAt);
  const end = parseWallClock(input.endsAt);
  if (start === null) errors.push({ field: "startsAt", message: "开始时间格式不正确" });
  if (end === null) errors.push({ field: "endsAt", message: "结束时间格式不正确" });
  if (start !== null && end !== null && start >= end) {
    errors.push({ field: "endsAt", message: "开始时间必须严格早于结束时间" });
  }
  return errors;
}

export async function createNotice(input: NoticeInput & { published?: boolean }): Promise<ApiResult<Notice>> {
 const errors=validateNotice(input);if(errors.length)return fail("VALIDATION_ERROR","请检查表单内容",{fieldErrors:errors});
 return writeOnline("createNotice",[input],id=>getNotice(id));
}

export interface NoticePatch extends NoticeInput {
  published?: boolean;
}

export async function saveNotice(id: string, patch: NoticePatch): Promise<ApiResult<Notice>> {
 const errors=validateNotice(patch);if(errors.length)return fail("VALIDATION_ERROR","请检查表单内容",{fieldErrors:errors});
 return writeOnline("saveNotice",[id,patch],id=>getNotice(id));
}

export async function deleteNotice(id: string): Promise<ApiResult<{ id: string }>> {
 return writeOnline("deleteNotice",[id],async()=>ok({id}));
}

export interface KnowledgeQuery extends ListQuery {
  keyword?: string;
  poiId?: string | "all";
  retrievalStatus?: KnowledgeEntry["retrievalStatus"] | "all";
}

export async function listKnowledge(query: KnowledgeQuery = {}): Promise<ApiResult<ListResult<KnowledgeEntry & { poiName: string | null }>>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const items = getStore()
    .global.knowledge.filter((entry) => {
      if (query.poiId && query.poiId !== "all" && entry.poiId !== query.poiId) return false;
      if (query.retrievalStatus && query.retrievalStatus !== "all" && entry.retrievalStatus !== query.retrievalStatus) return false;
      return matchKeyword(query.keyword, [entry.title, entry.body, entry.keywords.join(" ")]);
    })
    .map((entry) => ({
      ...entry,
      poiName: entry.poiId ? pointById[entry.poiId]?.name ?? null : null,
    }));
  return settle(ok(paginate(items, query)));
}

export async function getKnowledge(id: string): Promise<ApiResult<KnowledgeEntry>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const entry = getStore().global.knowledge.find((item) => item.id === id);
  if (!entry) return settle(fail("NOT_FOUND", "没有找到对应的知识条目。"));
  return settle(ok(entry));
}

export async function getSource(id: string): Promise<ApiResult<KnowledgeSource>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const source = getStore().global.sources.find((item) => item.id === id);
  if (!source) return settle(fail("NOT_FOUND", "来源缺失：未找到该来源记录。"));
  return settle(ok(source));
}

export async function listSources(): Promise<ApiResult<KnowledgeSource[]>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  return settle(ok(getStore().global.sources));
}

export function assetList(): AssetItem[] {
  return assetCatalogue;
}

export { defaultCoverUrl };

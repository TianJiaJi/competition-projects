<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import { ChevronLeft, ChevronRight, ClipboardList, Image, MapPin, Plus, RefreshCw, Wrench, X } from "lucide-vue-next";
import type { createPlatformClient } from "../../../../packages/client/src/platform";
import type { FacilityRequest, WorkOrder } from "../../../../packages/contracts/src/platform";
import GateSelect from "./GateSelect.vue";
import { displayTime } from "../core/types";

const props = defineProps<{ api: ReturnType<typeof createPlatformClient> }>();
type Facility = { id: string; name: string; regionId: string; kind: string };
type Notice = { id: string; title: string; body: string; read: boolean };
const requests = ref<FacilityRequest[]>([]), orders = ref<WorkOrder[]>([]), facilities = ref<Facility[]>([]), notices = ref<Notice[]>([]);
const tab = ref<"requests" | "orders">("requests"), selected = ref<{ kind: "request" | "order"; id: string } | null>(null);
const formOpen = ref(false), busy = ref(false), error = ref(""), notice = ref(""), reason = ref(""), photoIds = ref<string[]>([]), photoUrls = ref<string[]>([]);
const form = reactive({ kind: "repair" as "repair" | "closure", facilityId: "", reason: "" });
const selectedRequest = computed(() => selected.value?.kind === "request" ? requests.value.find(r => r.id === selected.value?.id) : undefined);
const selectedOrder = computed(() => selected.value?.kind === "order" ? orders.value.find(w => w.id === selected.value?.id) : undefined);
// Keep the run's business time in the timeline while sorting new records by actual submission time.
const requestRows = computed(() => [...requests.value].sort((a, b) => (b.createdAtWall || b.createdAt).localeCompare(a.createdAtWall || a.createdAt)));
const orderRows = computed(() => [...orders.value].sort((a, b) => (b.createdAtWall || b.createdAt).localeCompare(a.createdAtWall || a.createdAt)));
const requestStatus: Record<string, string> = { pending: "待审批", approved: "已批准", rejected: "已驳回" };
const workStatus: Record<string, string> = { created: "待派单", dispatched: "待接单", accepted: "已接单", in_progress: "处理中", suspended: "已挂起", awaiting_acceptance: "待验收", completed: "已完成" };
const actionLabel: Record<string, string> = { created: "创建工单", "work-orders": "创建工单", dispatch: "派单", reassign: "改派", claim: "领取任务", accept: "接单", start: "开始处理", submit: "提交验收", block: "受阻挂起", resources: "补充资源", resume: "恢复处理", escalate: "升级紧急", approve: "验收通过", reject: "驳回返工" };
const facilityName = (id: string) => facilities.value.find(f => f.id === id)?.name || id;
const relatedOrder = (request: FacilityRequest) => orders.value.find(w => w.id === request.workOrderId);
let generation = 0, stop: (() => void) | undefined, timer: ReturnType<typeof setInterval>;
async function load() {
  const current = ++generation;
  try {
    const [workspace, notificationData] = await Promise.all([
      props.api.request<{ workOrders: WorkOrder[]; requests: FacilityRequest[]; facilities: Facility[] }>("/workflow/workspace"),
      props.api.request<{ items: Notice[] }>("/notifications"),
    ]);
    if (current !== generation) return;
    orders.value = workspace.workOrders;
    requests.value = workspace.requests;
    facilities.value = workspace.facilities;
    notices.value = notificationData.items.filter(n => !n.read);
  } catch (e) { error.value = (e as Error).message; }
}
async function run(action: () => Promise<void>, success?: string) {
  if (busy.value) return;
  busy.value = true; error.value = ""; notice.value = "";
  try { await action(); await load(); if (success) notice.value = success; }
  catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}
function startForm() { error.value = ""; notice.value = ""; Object.assign(form, { kind: "repair", facilityId: "", reason: "" }); photoIds.value = []; formOpen.value = true; }
function closeForm() { if (busy.value) return; formOpen.value = false; photoIds.value = []; }
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, files = Array.from(input.files || []);
  input.value = "";
  if (!files.length) return;
  await run(async () => {
    if (photoIds.value.length + files.length > 6) throw Error("最多上传 6 张照片");
    for (const file of files) photoIds.value.push((await props.api.upload(file)).id);
  });
}
function submit() {
  if (!form.facilityId || !form.reason.trim()) { error.value = "请选择设施并填写现场情况"; return; }
  void run(async () => {
    await props.api.request("/facility-requests", "POST", { ...form, reason: form.reason.trim(), photoIds: photoIds.value });
    formOpen.value = false; photoIds.value = []; tab.value = "requests";
  }, "申报已提交，可在下方列表查看进度");
}
async function showPhotos(ids: string[]) {
  await run(async () => {
    photoUrls.value.forEach(URL.revokeObjectURL); photoUrls.value = [];
    for (const id of ids) photoUrls.value.push(await props.api.photo(id));
  });
}
function closePhotos() { photoUrls.value.forEach(URL.revokeObjectURL); photoUrls.value = []; }
function open(kind: "request" | "order", id: string) { error.value = ""; notice.value = ""; reason.value = ""; selected.value = { kind, id }; void nextTick(() => document.querySelector<HTMLElement>(".gate-workflow__close")?.focus()); }
function close() { if (busy.value) return; selected.value = null; reason.value = ""; closePhotos(); }
function act(action: string) {
  const item = selectedOrder.value;
  if (!item) return;
  if (["submit", "block"].includes(action) && !reason.value.trim()) { error.value = "请填写处理说明"; return; }
  void run(async () => {
    await props.api.request(`/work-orders/${item.id}/${action}`, "POST", { expectedVersion: item.version, reason: reason.value.trim(), photoIds: photoIds.value });
    reason.value = ""; photoIds.value = [];
  }, action === "submit" ? "已提交管理员验收" : action === "block" ? "已反馈受阻情况，工单已挂起" : "工单状态已更新");
}
function markRead(id: string) { void run(async () => { await props.api.request(`/notifications/${id}/read`, "POST", {}); }); }
onMounted(() => { void load(); stop = props.api.subscribe(() => { if (!busy.value) void load(); }); timer = setInterval(() => { if (!busy.value) void load(); }, 30000); });
onUnmounted(() => { stop?.(); clearInterval(timer); closePhotos(); generation++; });
</script>

<template>
  <section class="gate-workflow">
    <div class="gate-workflow__intro">
      <div><strong>现场发现问题？</strong><p>提交后在这里查看审批、派单与处理反馈。</p></div>
      <button class="primary" @click="startForm"><Plus :size="18" />发起申报</button>
    </div>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="notice" class="feedback success" role="status">{{ notice }}</p>
    <details v-if="notices.length" class="gate-workflow__notices" aria-label="站内提醒">
      <summary>站内提醒 <span>{{ notices.length }} 条未读 <ChevronRight :size="16" /></span></summary>
      <article v-for="item in notices.slice(0, 3)" :key="item.id"><div><strong>{{ item.title }}</strong><p>{{ item.body }}</p></div><button class="text-button" :disabled="busy" @click="markRead(item.id)">已阅</button></article>
    </details>
    <div class="tabs gate-workflow__tabs" role="tablist" aria-label="报修记录分类">
      <button role="tab" :aria-selected="tab === 'requests'" :aria-pressed="tab === 'requests'" @click="tab = 'requests'">我的申报 <span>{{ requests.length }}</span></button>
      <button role="tab" :aria-selected="tab === 'orders'" :aria-pressed="tab === 'orders'" @click="tab = 'orders'">工单进度 <span>{{ orders.length }}</span></button>
      <button class="gate-workflow__refresh" aria-label="刷新报修记录" :disabled="busy" @click="load"><RefreshCw :size="17" /></button>
    </div>
    <div v-if="tab === 'requests'" class="task-list gate-workflow__list">
      <button v-for="item in requestRows" :key="item.id" class="task-row gate-workflow__row" @click="open('request', item.id)">
        <span class="row"><span class="gate-workflow__kind"><ClipboardList :size="16" />{{ item.kind === 'closure' ? '关闭申请' : '现场报修' }}</span><span class="gate-workflow__status" :class="item.status">{{ requestStatus[item.status] }}</span></span>
        <strong>{{ facilityName(item.facilityId) }}</strong><span class="gate-workflow__summary">{{ item.reason }}</span>
        <span class="row task-meta"><span>{{ displayTime(item.createdAt) }}</span><span>查看详情 <ChevronRight :size="16" /></span></span>
      </button>
      <div v-if="!requestRows.length" class="empty"><ClipboardList :size="28" /><h2>暂无申报记录</h2><p>现场发现设施问题时，可直接提交报修或关闭申请。</p></div>
    </div>
    <div v-else class="task-list gate-workflow__list">
      <button v-for="item in orderRows" :key="item.id" class="task-row gate-workflow__row" @click="open('order', item.id)">
        <span class="row"><span class="gate-workflow__kind"><Wrench :size="16" />维修工单</span><span class="gate-workflow__status" :class="item.status">{{ workStatus[item.status] }}</span></span>
        <strong>{{ item.title }}</strong><span class="location"><MapPin :size="16" />{{ facilityName(item.facilityId) }}</span><span class="gate-workflow__summary">{{ item.description }}</span>
        <span class="row task-meta"><span>{{ displayTime(item.createdAt) }}</span><span>查看与跟进 <ChevronRight :size="16" /></span></span>
      </button>
      <div v-if="!orderRows.length" class="empty"><Wrench :size="28" /><h2>暂无工单</h2><p>管理员派单后，可在这里接单、反馈和查看验收结果。</p></div>
    </div>

    <div v-if="formOpen" class="gate-workflow__overlay" @mousedown.self="closeForm" @keydown.esc="closeForm">
      <section class="gate-workflow__sheet" role="dialog" aria-modal="true" aria-label="发起现场申报">
        <header><h2>发起现场申报</h2><button class="icon-button" aria-label="关闭申报" @click="closeForm"><X :size="20" /></button></header>
        <form id="gate-request-form" @submit.prevent="submit">
          <label class="field"><span>申报类型</span><GateSelect v-model="form.kind"><option value="repair">一键报修</option><option value="closure">申请关闭设施</option></GateSelect></label>
          <label class="field"><span>设施位置</span><GateSelect v-model="form.facilityId"><option value="">请选择设施</option><option v-for="item in facilities" :key="item.id" :value="item.id">{{ item.name }}</option></GateSelect></label>
          <label class="field"><span>现场情况与原因</span><textarea v-model="form.reason" maxlength="500" rows="5" placeholder="描述损坏、风险及现场情况" required /></label>
          <label class="field gate-workflow__file"><span>现场照片（最多 6 张）</span><span class="gate-workflow__upload"><Image :size="18" />拍照或选择照片</span><input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple @change="upload" /><small>已上传 {{ photoIds.length }} 张</small></label>
          <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
        </form>
        <footer><button class="secondary" :disabled="busy" @click="closeForm">取消</button><button class="primary" type="submit" form="gate-request-form" :disabled="busy">{{ busy ? '正在提交…' : '提交申报' }}</button></footer>
      </section>
    </div>
    <div v-if="selected && (selectedRequest || selectedOrder)" class="gate-workflow__overlay" @mousedown.self="close" @keydown.esc="close">
      <section class="gate-workflow__sheet" role="dialog" aria-modal="true" aria-label="申报与工单详情">
        <header><button class="back gate-workflow__close" @click="close"><ChevronLeft :size="20" />返回列表</button><button class="icon-button" aria-label="关闭详情" @click="close"><X :size="20" /></button></header>
        <div v-if="selectedRequest" class="gate-workflow__details">
          <span class="gate-workflow__status" :class="selectedRequest.status">{{ requestStatus[selectedRequest.status] }}</span>
          <h2>{{ selectedRequest.kind === 'closure' ? '关闭申请' : '现场报修' }}</h2>
          <p class="location"><MapPin :size="16" />{{ facilityName(selectedRequest.facilityId) }}</p>
          <section class="section"><h3>现场情况</h3><p class="prewrap">{{ selectedRequest.reason }}</p><button v-if="selectedRequest.photoIds.length" class="text-button" @click="showPhotos(selectedRequest.photoIds)"><Image :size="17" />查看现场照片（{{ selectedRequest.photoIds.length }}）</button></section>
          <section class="section"><h3>审批与跟进</h3><p v-if="selectedRequest.status === 'pending'">等待管理员确认，处理结果会同步到此记录。</p><p v-else-if="selectedRequest.status === 'rejected'">申请已驳回，详见下方审批记录。</p><p v-else-if="relatedOrder(selectedRequest)">已生成维修工单：{{ workStatus[relatedOrder(selectedRequest)!.status] }}。<button class="text-button" @click="open('order', relatedOrder(selectedRequest)!.id)">查看工单</button></p><p v-else>管理员已确认申请。</p></section>
          <section class="section"><h3>处理记录</h3><ol class="timeline"><li v-for="(record, index) in selectedRequest.records" :key="index"><strong>{{ record.actorName }}</strong><p class="prewrap">{{ record.reason }}</p><time class="small">{{ displayTime(record.at) }}</time></li></ol></section>
        </div>
        <div v-if="selectedOrder" class="gate-workflow__details">
          <span class="gate-workflow__status" :class="selectedOrder.status">{{ workStatus[selectedOrder.status] }}</span><h2>{{ selectedOrder.title }}</h2><p class="location"><MapPin :size="16" />{{ facilityName(selectedOrder.facilityId) }}</p>
          <section class="section"><h3>工作内容</h3><p class="prewrap">{{ selectedOrder.description }}</p></section>
          <section v-if="selectedOrder.assigneeId === api.user?.id && ['dispatched','accepted','in_progress'].includes(selectedOrder.status)" class="section gate-workflow__action"><h3>处理与反馈</h3><label v-if="selectedOrder.status === 'in_progress'" class="field"><span>处理说明 / 受阻原因</span><textarea v-model="reason" maxlength="500" rows="4" placeholder="填写处理结果或受阻情况" /></label><label v-if="['accepted','in_progress'].includes(selectedOrder.status)" class="field gate-workflow__file"><span>现场照片（最多 6 张）</span><span class="gate-workflow__upload"><Image :size="18" />拍照或选择照片</span><input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple @change="upload" /><small>已上传 {{ photoIds.length }} 张</small></label><div class="gate-workflow__buttons"><button v-if="selectedOrder.status === 'dispatched'" class="primary" :disabled="busy" @click="act('accept')">接单</button><button v-if="selectedOrder.status === 'accepted'" class="primary" :disabled="busy" @click="act('start')">开始处理</button><template v-if="selectedOrder.status === 'in_progress'"><button class="secondary" :disabled="busy" @click="act('block')">受阻反馈</button><button class="primary" :disabled="busy" @click="act('submit')">提交验收</button></template></div></section>
          <section v-else-if="selectedOrder.status === 'awaiting_acceptance'" class="section"><h3>等待验收</h3><p>已提交处理反馈，等待管理员验收。</p></section>
          <section class="section"><h3>流转记录</h3><ol class="timeline"><li v-for="(record, index) in selectedOrder.records" :key="index"><strong>{{ record.actorName }} · {{ actionLabel[record.action] || record.action }}</strong><p v-if="record.reason && record.reason !== record.action" class="prewrap">{{ record.reason }}</p><time class="small">{{ displayTime(record.at) }}</time><button v-if="record.photoIds?.length" class="text-button" @click="showPhotos(record.photoIds)">查看照片</button></li></ol></section>
        </div>
        <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
        <p v-if="notice" class="feedback success" role="status">{{ notice }}</p>
      </section>
    </div>
    <div v-if="photoUrls.length" class="gate-workflow__overlay gate-workflow__photos" role="dialog" aria-modal="true" aria-label="现场照片" @mousedown.self="closePhotos"><section class="gate-workflow__sheet"><header><h2>现场照片</h2><button class="icon-button" aria-label="关闭照片" @click="closePhotos"><X :size="20" /></button></header><img v-for="url in photoUrls" :key="url" :src="url" alt="现场上传的照片" /></section></div>
  </section>
</template>

<style scoped>
.gate-workflow { display: grid; gap: 16px; padding-bottom: 96px; }
.gate-workflow__intro { display: grid; gap: 14px; padding: 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.gate-workflow__intro strong { font-size: 17px; }
.gate-workflow__intro p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.gate-workflow__intro .primary { display: inline-flex; justify-content: center; align-items: center; gap: 8px; width: 100%; }
.gate-workflow__tabs { margin: 0; align-items: center; }
.gate-workflow__tabs button { flex: 1; }
.gate-workflow__tabs button span { font-size: 12px; }
.gate-workflow__tabs .gate-workflow__refresh { flex: none; width: 44px; display: grid; place-items: center; }
.gate-workflow__list { margin: 0; }
.gate-workflow__row { display: grid; gap: 7px; text-align: left; }
.gate-workflow__row .task-meta { margin-top: 4px; }
.gate-workflow__row .task-meta > span:last-child { display: flex; align-items: center; }
.gate-workflow__kind { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
.gate-workflow__summary { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: var(--muted); font-size: 14px; }
.gate-workflow__status { display: inline-flex; align-items: center; justify-content: center; padding: 3px 9px; border-radius: 999px; background: #edf2ef; color: var(--muted); font-size: 12px; white-space: nowrap; }
.gate-workflow__status.pending, .gate-workflow__status.dispatched, .gate-workflow__status.suspended { background: #fbf0d9; color: #805610; }
.gate-workflow__status.approved, .gate-workflow__status.completed { background: #e2f1e8; color: #23634d; }
.gate-workflow__status.rejected { background: #fbe8e5; color: #a23e36; }
.gate-workflow__status.in_progress, .gate-workflow__status.awaiting_acceptance { background: #e6eff5; color: #255d78; }
.gate-workflow__notices { padding: 14px; border-radius: 16px; background: #fff4df; }
.gate-workflow__notices summary { display: flex; align-items: center; justify-content: space-between; font-size: 15px; font-weight: 600; cursor: pointer; list-style: none; }
.gate-workflow__notices summary::-webkit-details-marker { display: none; }
.gate-workflow__notices summary span { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 400; }
.gate-workflow__notices[open] summary { margin-bottom: 8px; }
.gate-workflow__notices[open] summary svg { transform: rotate(90deg); }
.gate-workflow__notices article { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid #e7d9bb; }
.gate-workflow__notices p { margin: 2px 0 0; font-size: 13px; }
.gate-workflow__overlay { position: fixed; inset: 0; z-index: 20; display: flex; justify-content: center; align-items: flex-end; padding: 12px 0 0; background: rgb(18 48 39 / .45); }
.gate-workflow__sheet { display: flex; flex-direction: column; width: min(480px, 100%); max-height: calc(100dvh - 12px); overflow: auto; padding: 0 20px 20px; border-radius: 22px 22px 0 0; background: var(--surface); box-shadow: 0 -14px 36px rgb(12 47 34 / .18); }
.gate-workflow__sheet > header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; min-height: 64px; margin: 0 -20px 16px; padding: 8px 20px; border-bottom: 1px solid var(--line); background: var(--surface); }
.gate-workflow__sheet > header h2 { margin: 0; }
.gate-workflow__sheet .field { display: grid; gap: 7px; margin-bottom: 18px; }
.gate-workflow__sheet .field span { font-size: 14px; color: var(--muted); }
.gate-workflow__sheet .field small { color: var(--muted); }
.gate-workflow__file { position: relative; cursor: pointer; }
.gate-workflow__file input { position: absolute; width: 1px; height: 1px; min-height: 0; padding: 0; opacity: 0; }
.gate-workflow__sheet .gate-workflow__file > .gate-workflow__upload { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 48px; margin: 0; border: 1px dashed var(--brand); border-radius: 12px; background: #eef7f1; color: var(--brand); font-size: 15px; font-weight: 600; }
.gate-workflow__file:focus-within .gate-workflow__upload { outline: 2px solid var(--brand); outline-offset: 2px; }
.gate-workflow__sheet textarea { resize: vertical; }
.gate-workflow__sheet > footer, .gate-workflow__buttons { display: flex; gap: 10px; }
.gate-workflow__sheet > footer > button, .gate-workflow__buttons > button { flex: 1; }
.gate-workflow__details { display: grid; gap: 10px; }
.gate-workflow__details > h2 { margin: 0; }
.gate-workflow__details > .gate-workflow__status { justify-self: start; }
.gate-workflow__details .section { padding: 16px 0; }
.gate-workflow__details .section h3 { margin: 0 0 10px; font-size: 18px; }
.gate-workflow__details .section p { margin: 0 0 10px; }
.gate-workflow__details .timeline { margin: 0; padding-left: 24px; }
.gate-workflow__details .timeline li { margin: 0 0 14px; }
.gate-workflow__details .timeline time { display: block; margin-top: 4px; }
.gate-workflow__details .text-button { display: inline-flex; align-items: center; gap: 5px; }
.gate-workflow__photos { z-index: 21; }
.gate-workflow__photos img { display: block; max-width: 100%; margin-bottom: 12px; border-radius: 12px; }
@media (min-width: 700px) { .gate-workflow__overlay { align-items: center; padding: 16px; } .gate-workflow__sheet { max-height: min(780px, 90dvh); border-radius: 22px; } }
</style>

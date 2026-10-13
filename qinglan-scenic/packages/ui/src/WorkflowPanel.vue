<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import type { createPlatformClient } from "../../client/src/platform";
const props = defineProps<{
  api: ReturnType<typeof createPlatformClient>;
  admin?: boolean;
  mode?: "work" | "alerts" | "requests";
}>();
const data = ref<any>({
    workOrders: [],
    requests: [],
    alerts: [],
    staff: [],
    facilities: [],
  }),
  notifications = ref<any[]>([]),
  error = ref(""),
  notice = ref(""),
  busy = ref(false),
  selected = ref<any>(null),
  reason = ref(""),
  assignee = ref(""),
  photoIds = ref<string[]>([]),
  photoUrls = ref<string[]>([]),
  filter = ref(""),
  createOpen = ref(false),
  requestOpen = ref(false),
  alertOpen = ref(false),
  requestDecision = ref<{ id: string; action: "approve" | "reject" } | null>(null),
  alertId = ref(""),
  alertVersion = ref(0);
const form = reactive({
  facilityId: "",
  title: "",
  description: "",
  priority: "normal",
  kind: "repair",
  severity: "important",
  alertId: "",
});
const workDialog = ref<HTMLElement | null>(null);
let previousWorkFocus: HTMLElement | null = null;
let loadedRun = "",
  generation = 0;
const labels: Record<string, string> = {
  created: "待派单",
  dispatched: "待接单",
  accepted: "已接单",
  in_progress: "处理中",
  suspended: "已挂起",
  awaiting_acceptance: "待验收",
  completed: "已完成",
};
const actionLabels: Record<string, string> = { created: "创建工单", "work-orders": "创建工单", dispatch: "派单", reassign: "改派", claim: "领取任务", accept: "接单", start: "开始处理", submit: "提交验收", block: "受阻挂起", resources: "补充资源", resume: "恢复处理", escalate: "升级紧急", approve: "验收通过", reject: "驳回返工" };
const recordReason = (value: string) => value.replace(/^模拟员工流程：([a-z-]+)$/, (_, action: string) => `模拟员工流程：${actionLabels[action] || action}`);
const displayTime = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const works = computed(() =>
  data.value.workOrders.filter((w: any) =>
    `${w.title} ${w.id}`.includes(filter.value),
  ),
);
const name = (id: string) =>
  data.value.facilities.find((p: any) => p.id === id)?.name || id;
async function load() {
  const current = ++generation;
  try {
    const next = await props.api.request("/workflow/workspace");
    if (current !== generation) return;
    if (loadedRun && loadedRun !== props.api.runId) {
      selected.value = null;
      createOpen.value = false;
      requestOpen.value = false;
      alertOpen.value = false;
      requestDecision.value = null;
      clearPhotos();
      error.value = "运行已切换，请重新打开表单";
    }
    loadedRun = props.api.runId;
    data.value = next;
    const r = await props.api.request<any>("/notifications");
    notifications.value = r.items
      .filter((n: any) => !n.read)
      .sort((a: any, b: any) =>
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      )
      .slice(-20)
      .reverse();
    if (selected.value)
      selected.value =
        data.value.workOrders.find((w: any) => w.id === selected.value.id) ||
        null;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function execute(fn: () => Promise<void>, success = "") {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await fn();
    await load();
    notice.value = success;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function clearPhotos() {
  clearPreview();
  photoIds.value = [];
}
function clearPreview() {
  photoUrls.value.forEach(URL.revokeObjectURL);
  photoUrls.value = [];
}
function open(w: any) {
  previousWorkFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  selected.value = w;
  reason.value = "";
  error.value = "";
  notice.value = "";
  assignee.value = w.assigneeId || "";
  clearPhotos();
  void nextTick(() => workDialog.value?.focus());
}
function closeWorkOrder() {
  if (busy.value) return;
  if ((reason.value.trim() || photoIds.value.length) && !window.confirm("处理说明或照片尚未提交，确定放弃吗？")) return;
  selected.value = null;
  reason.value = "";
  error.value = "";
  clearPhotos();
  void nextTick(() => previousWorkFocus?.focus());
}
function trapWorkFocus(event: KeyboardEvent) {
  if (event.key !== "Tab" || !workDialog.value) return;
  const items = Array.from(workDialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'));
  if (!items.length) return;
  if (event.shiftKey && document.activeElement === items[0]) {
    event.preventDefault();
    items[items.length - 1].focus();
  } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
    event.preventDefault();
    items[0].focus();
  }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  await execute(async () => {
    if (photoIds.value.length + files.length > 6)
      throw Error("最多上传6张照片");
    for (const file of files) {
      const r = await props.api.upload(file);
      photoIds.value.push(r.id);
    }
  });
  input.value = "";
}
function act(action: string) {
  void execute(async () => {
    if (
      !reason.value.trim() &&
      [
        "submit",
        "block",
        "approve",
        "reject",
        "resume",
        "resources",
        "escalate",
      ].includes(action)
    )
      throw Error("请填写处理说明");
    await props.api.request(
      "/work-orders/" + selected.value.id + "/" + action,
      "POST",
      {
        expectedVersion: selected.value.version,
        reason: reason.value,
        assigneeId: assignee.value,
        photoIds: photoIds.value,
      },
    );
    reason.value = "";
    clearPhotos();
  }, `${actionLabels[action] || "操作"}已保存`);
}
function create() {
  void execute(async () => {
    await props.api.request("/work-orders", "POST", form);
    createOpen.value = false;
  });
}
function request() {
  void execute(async () => {
    await props.api.request("/facility-requests", "POST", {
      ...form,
      reason: form.description,
      photoIds: photoIds.value,
    });
    requestOpen.value = false;
    clearPhotos();
  });
}
function openDecision(r: any, action: "approve" | "reject") {
  requestDecision.value = { id: r.id, action };
  reason.value = "";
  error.value = "";
  notice.value = "";
}
function closeDecision() {
  if (busy.value) return;
  requestDecision.value = null;
  reason.value = "";
  error.value = "";
}
function decide() {
  if (!requestDecision.value) return;
  if (!reason.value.trim()) { error.value = "请填写审批说明"; return; }
  void execute(async () => {
    const decision = requestDecision.value!;
    const request = data.value.requests.find((item: any) => item.id === decision.id);
    if (!request || request.status !== "pending") throw Error("申请状态已变化，请刷新后重试");
    await props.api.request(
      "/facility-requests/" + request.id + "/" + decision.action,
      "POST",
      {
        expectedVersion: request.version,
        reason: reason.value.trim(),
        createWorkOrder: decision.action === "approve",
      },
    );
    reason.value = "";
    requestDecision.value = null;
  }, "设施申请审批已保存");
}
function editAlert(a?: any) {
  alertId.value = a?.id || "";
  alertVersion.value = a?.version || 0;
  Object.assign(form, {
    facilityId: a?.anchorId || "",
    title: a?.title || "",
    description: a?.reason || "",
    severity: a?.severity || "important",
  });
  alertOpen.value = true;
}
function saveAlert() {
  void execute(async () => {
    await props.api.request(
      "/admin/alerts" + (alertId.value ? "/" + alertId.value : ""),
      "POST",
      {
        ...form,
        reason: form.description,
        expectedVersion: alertVersion.value,
      },
    );
    alertOpen.value = false;
  });
}
function archiveAlert(a: any) {
  void execute(async () => {
    if (!reason.value.trim()) throw Error("请填写归档原因");
    await props.api.request("/admin/alerts/" + a.id, "POST", {
      action: "archive",
      reason: reason.value,
      expectedVersion: a.version,
    });
  });
}
function fromAlert(a: any) {
  Object.assign(form, {
    facilityId: a.anchorId,
    title: a.title,
    description: a.reason,
    alertId: a.id,
  });
  createOpen.value = true;
}
function viewPhotos(ids: string[]) {
  void execute(async () => {
    clearPreview();
    for (const id of ids) photoUrls.value.push(await props.api.photo(id));
  });
}
let stop: (() => void) | undefined, timer: ReturnType<typeof setInterval>;
onMounted(() => {
  void load();
  stop = props.api.subscribe(() => {
    if (!busy.value) void load();
  });
  timer = setInterval(() => {
    if (!busy.value) void load();
  }, 30000);
});
onUnmounted(() => {
  stop?.();
  clearInterval(timer);
  clearPhotos();
});
</script>
<template>
  <section class="workflow" :class="admin && 'workflow--admin'">
    <h2>
      {{
        mode === "alerts"
          ? "告警记录"
          : mode === "requests"
            ? "设施申请"
            : "维修工单与现场联动"
      }}
    </h2>
    <p v-if="error && !selected" class="wf-error" role="alert">{{ error }}</p>
    <p v-if="notice && !selected" class="wf-success" role="status">{{ notice }}</p>
    <section
      v-if="notifications.length"
      class="wf-notifications"
      aria-live="polite"
    >
      <h3>站内提醒</h3>
      <article v-for="n in notifications" :key="n.id">
        <strong>{{ n.title }}</strong>
        <p>{{ n.body }}</p>
        <button
          :disabled="busy"
          @click="
            execute(async () => {
              await api.request('/notifications/' + n.id + '/read', 'POST', {});
            })
          "
        >
          已阅
        </button>
      </article>
    </section>
    <template v-if="mode === 'alerts'"
      ><div class="wf-list-toolbar"><input v-model="filter" placeholder="搜索告警标题或原因" /><button
        @click="editAlert()"
      >
        新增人工告警</button></div
      ><label>归档原因<input v-model="reason" /></label>
      <article
        v-for="a in data.alerts.filter((a: any) =>
          `${a.title} ${a.reason}`.includes(filter),
        )"
        :key="a.id"
        class="wf-list-row"
      >
        <div class="wf-list-row__body">
          <h3>{{ a.title }} {{ a.archived ? "（已归档）" : "" }}</h3>
          <p>
            {{ name(a.anchorId) }} ·
            {{ a.source === "manual" ? "人工" : "自动" }} · {{ a.reason }}
          </p>
        </div>
        <div v-if="!a.archived" class="wf-actions wf-list-row__actions">
          <button @click="editAlert(a)">编辑</button
          ><button @click="fromAlert(a)">生成维修工单</button
          ><button :disabled="busy" @click="archiveAlert(a)">归档</button>
        </div>
        <details class="wf-list-row__history">
          <summary>修改历史</summary>
          <p v-for="(r, i) in a.history" :key="i">
            {{ r.at }} · {{ r.actorName }} · {{ r.reason }}
          </p>
        </details>
      </article></template
    >
    <template v-if="!mode || mode === 'work'"
      ><div class="wf-actions wf-list-toolbar">
        <input v-model="filter" placeholder="搜索工单标题或编号" /><button
          v-if="admin"
          @click="
            form.alertId = '';
            createOpen = true;
          "
        >
          创建维修工单</button
        ><button
          v-else
          @click="
            requestOpen = true;
            clearPhotos();
          "
        >
          现场报修 / 申请关闭
        </button>
      </div>
      <p>
        创建 → 派单 → 接单 → 处理 → 反馈 → 验收 →
        完成。验收后设施需管理员另行确认开放。
      </p>
      <article v-for="w in works" :key="w.id" class="wf-list-row">
        <div class="wf-list-row__body">
          <h3>{{ w.title }}</h3>
          <p>
            {{ name(w.facilityId) }} · {{ labels[w.status] }} ·
            {{ w.priority === "urgent" ? "紧急" : "普通" }}
          </p>
          <p class="wf-summary">{{ w.description }}</p>
        </div>
        <div class="wf-actions wf-list-row__actions"><button @click="open(w)">查看与处理</button></div>
      </article>
      <p v-if="!works.length">暂无工单。</p></template
    >
    <template v-if="mode !== 'alerts'"
      ><h3>设施申请记录</h3>
      <article v-for="r in data.requests" :key="r.id" class="wf-list-row">
        <div class="wf-list-row__body">
          <strong
            >{{ name(r.facilityId) }} ·
            {{ r.kind === "closure" ? "申请关闭" : "现场报修" }} ·
            {{
              r.status === "pending"
                ? "待审批"
                : r.status === "approved"
                  ? "已批准"
                  : "已驳回"
            }}</strong
          >
          <p>{{ r.reason }}</p>
        </div>
        <div v-if="r.photoIds.length || (admin && r.status === 'pending')" class="wf-actions wf-list-row__actions">
          <button v-if="r.photoIds.length" @click="viewPhotos(r.photoIds)">查看现场照片</button>
          <template v-if="admin && r.status === 'pending'">
          <button :disabled="busy" @click="openDecision(r, 'approve')">
            批准并生成工单</button
          ><button :disabled="busy" @click="openDecision(r, 'reject')">驳回</button></template>
        </div>
      </article></template
    >
    <Teleport to="body">
    <div
      v-if="createOpen || requestOpen || alertOpen"
      class="wf-modal workflow"
      :class="admin && 'workflow--admin'"
      role="dialog"
      aria-modal="true"
      aria-label="编辑工单或告警"
    >
      <div class="wf-dialog">
        <h3>
          {{
            alertOpen ? "编辑告警" : requestOpen ? "现场申请" : "创建维修工单"
          }}
        </h3>
        <label
          >设施<select v-model="form.facilityId">
            <option value="">请选择</option>
            <option v-for="p in data.facilities" :value="p.id">
              {{ p.name }}
            </option>
          </select></label
        ><label v-if="!requestOpen"
          >标题<input v-model="form.title" maxlength="120" /></label
        ><label v-if="requestOpen"
          >申请类型<select v-model="form.kind">
            <option value="repair">一键报修</option>
            <option value="closure">申请关闭设施</option>
          </select></label
        ><label v-if="alertOpen"
          >等级<select v-model="form.severity">
            <option value="reminder">提醒</option>
            <option value="important">重要</option>
            <option value="critical">紧急</option>
          </select></label
        ><label
          >现场情况 / 原因<textarea
            v-model="form.description"
            rows="5"
          /></label
        ><label v-if="requestOpen"
          >现场照片<input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            multiple
            @change="upload"
          />已上传 {{ photoIds.length }} 张</label
        >
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="wf-actions">
          <button
            :disabled="busy"
            @click="
              alertOpen ? saveAlert() : requestOpen ? request() : create()
            "
          >
            提交</button
          ><button
            :disabled="busy"
            @click="
              createOpen = false;
              requestOpen = false;
              alertOpen = false;
              clearPhotos();
            "
          >
            关闭
          </button>
        </div>
      </div>
    </div>
    </Teleport>
    <Teleport to="body">
    <div v-if="requestDecision" class="wf-modal workflow" :class="admin && 'workflow--admin'" role="dialog" aria-modal="true" aria-label="设施申请审批">
      <form class="wf-dialog" @submit.prevent="decide">
        <h3>{{ requestDecision.action === 'approve' ? '批准并生成工单' : '驳回设施申请' }}</h3>
        <p>{{ name(data.requests.find((r: any) => r.id === requestDecision?.id)?.facilityId || '') }} · {{ data.requests.find((r: any) => r.id === requestDecision?.id)?.reason }}</p>
        <label>审批说明<textarea v-model="reason" rows="4" maxlength="500" placeholder="说明批准或驳回原因" required :disabled="busy" /></label>
        <p v-if="error" class="wf-error" role="alert">{{ error }}</p>
        <div class="wf-actions wf-dialog__actions">
          <button type="button" :disabled="busy" @click="closeDecision">取消</button>
          <button type="submit" :disabled="busy">{{ busy ? '正在提交…' : '确认提交' }}</button>
        </div>
      </form>
    </div>
    </Teleport>
    <Teleport to="body">
    <div v-if="selected" class="wf-modal workflow" :class="admin && 'workflow--admin'" role="presentation" @mousedown.self="closeWorkOrder">
      <div ref="workDialog" class="wf-dialog wf-work-dialog" role="dialog" aria-modal="true" aria-labelledby="wf-work-title" tabindex="-1" @keydown.esc.stop="closeWorkOrder" @keydown="trapWorkFocus">
        <header class="wf-work-header">
          <div class="wf-work-header__title">
            <span class="wf-work-eyebrow" :title="selected.id">维修工单 · {{ selected.id.slice(0, 8) }}</span>
            <h3 id="wf-work-title">{{ selected.title }}</h3>
            <span class="wf-work-status">{{ labels[selected.status] || selected.status }}</span>
          </div>
          <button type="button" class="wf-work-close" :disabled="busy" aria-label="关闭工单详情" @click="closeWorkOrder">关闭</button>
        </header>
        <div class="wf-work-body">
          <section class="wf-work-section" aria-label="工单信息">
            <div class="wf-work-facts">
              <div><span>关联设施</span><strong>{{ name(selected.facilityId) }}</strong></div>
              <div><span>优先级</span><strong>{{ selected.priority === 'urgent' ? '紧急' : '普通' }}</strong></div>
              <div><span>负责员工</span><strong>{{ data.staff.find((p: any) => p.id === selected.assigneeId)?.name || selected.assigneeId || '待派单' }}</strong></div>
            </div>
            <div class="wf-work-description"><span>现场情况</span><p>{{ selected.description || '暂无说明' }}</p></div>
          </section>
          <section v-if="selected.status !== 'completed'" class="wf-work-section" aria-labelledby="wf-work-feedback-title">
            <h4 id="wf-work-feedback-title">处理与反馈</h4>
            <label v-if="admin && ['created', 'dispatched', 'accepted', 'in_progress', 'suspended'].includes(selected.status)" class="wf-work-field">
              负责员工
              <select v-model="assignee" :disabled="busy">
                <option value="">选择负责员工</option>
                <option v-for="s in data.staff" :key="s.id" :value="s.id">{{ s.name }} · {{ s.regionIds.join('、') }}</option>
              </select>
            </label>
            <label class="wf-work-field">处理说明
              <textarea v-model="reason" :disabled="busy" rows="3" placeholder="填写结果、受阻情况、资源安排或验收意见" />
            </label>
            <div class="wf-work-upload">
              <span>现场照片</span>
              <div class="wf-work-upload__row">
                <label class="wf-work-upload__button" :class="busy && 'is-disabled'" tabindex="0" @keydown.enter.prevent="($event.currentTarget as HTMLElement).querySelector('input')?.click()" @keydown.space.prevent="($event.currentTarget as HTMLElement).querySelector('input')?.click()">
                  选择照片
                  <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple tabindex="-1" :disabled="busy" @change="upload" />
                </label>
                <span>已上传 {{ photoIds.length }} / 6 张</span>
              </div>
            </div>
          </section>
          <section class="wf-work-section wf-work-history" aria-labelledby="wf-work-history-title">
            <h4 id="wf-work-history-title">流转记录</h4>
            <ol>
              <li v-for="(r, i) in selected.records" :key="i">
                <div class="wf-work-history__head"><strong>{{ actionLabels[r.action] || r.action }}</strong><time>{{ displayTime(r.at) }}</time></div>
                <p class="wf-work-history__actor">{{ r.actorName }}</p>
                <p v-if="r.reason && r.reason !== r.action" class="wf-work-history__reason">{{ recordReason(r.reason) }}</p>
                <button v-if="r.photoIds?.length" type="button" @click="viewPhotos(r.photoIds)">查看照片</button>
              </li>
            </ol>
          </section>
        </div>
        <footer class="wf-work-footer">
          <div class="wf-work-feedback" aria-live="polite">
            <p v-if="error" class="wf-error" role="alert">{{ error }}</p>
            <p v-else-if="notice" class="wf-success" role="status">{{ notice }}</p>
          </div>
          <div class="wf-work-actions" v-if="admin">
            <button v-if="['created', 'dispatched', 'accepted', 'in_progress', 'suspended'].includes(selected.status)" type="button" :disabled="busy" @click="act(selected.status === 'created' ? 'dispatch' : 'reassign')">{{ selected.status === 'created' ? '派单' : '改派' }}</button>
            <button v-if="selected.status === 'suspended'" type="button" :disabled="busy" @click="act('resources')">补充资源</button>
            <button v-if="selected.status === 'suspended'" type="button" :disabled="busy" @click="act('resume')">恢复处理</button>
            <button v-if="selected.status !== 'completed'" type="button" :disabled="busy" @click="act('escalate')">升级紧急</button>
            <button v-if="selected.status === 'awaiting_acceptance'" type="button" :disabled="busy" @click="act('reject')">驳回返工</button>
            <button v-if="selected.status === 'awaiting_acceptance'" type="button" class="wf-work-primary" :disabled="busy" @click="act('approve')">验收通过</button>
          </div>
          <div class="wf-work-actions" v-else>
            <button v-if="selected.status === 'dispatched'" type="button" class="wf-work-primary" :disabled="busy" @click="act('accept')">接单</button>
            <button v-if="selected.status === 'accepted'" type="button" class="wf-work-primary" :disabled="busy" @click="act('start')">开始处理</button>
            <button v-if="selected.status === 'in_progress'" type="button" class="wf-work-primary" :disabled="busy" @click="act('submit')">提交验收</button>
            <button v-if="['accepted', 'in_progress'].includes(selected.status)" type="button" :disabled="busy" @click="act('block')">受阻反馈并挂起</button>
          </div>
        </footer>
      </div>
    </div>
    </Teleport>
    <Teleport to="body">
    <div v-if="photoUrls.length" class="wf-modal wf-photos workflow" :class="admin && 'workflow--admin'" role="dialog" aria-modal="true" aria-label="现场照片">
      <div class="wf-dialog">
        <img v-for="url in photoUrls" :src="url" alt="现场照片" /><button
          @click="clearPreview()"
        >
          关闭照片
        </button>
      </div>
    </div>
    </Teleport>
  </section>
</template>
<style scoped>
.workflow {
  padding: 18px;
  background: var(--surface, #f8fbf9);
  border-radius: 16px;
  color: var(--text, #193b35);
}
.workflow article {
  padding: 12px 0;
  border-bottom: 1px solid #ccd8d0;
}
.wf-list-toolbar { display: flex; align-items: center; gap: 12px; }
.wf-list-toolbar > input { flex: 1 1 280px; width: min(440px, 100%); min-width: 0; }
.wf-list-toolbar > button { flex: none; margin-left: auto; }
.wf-list-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 24px; row-gap: 8px; }
.wf-list-row__body { min-width: 0; text-align: left; overflow-wrap: anywhere; }
.wf-list-row__body h3 { margin: 0 0 4px; }
.wf-list-row__actions { display: flex; justify-content: flex-end; align-items: center; align-self: center; flex-wrap: wrap; margin: 0; }
.wf-list-row__actions button { white-space: nowrap; }
.wf-list-row__history { grid-column: 1 / -1; }
.wf-summary { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.wf-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.workflow label {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}
.workflow input,
.workflow select,
.workflow textarea,
.workflow button {
  font: inherit;
  padding: 10px;
  border: 1px solid #aabfb2;
  border-radius: 8px;
  max-width: 100%;
  box-sizing: border-box;
}
.workflow button {
  cursor: pointer;
  background: #e4f2e9;
  color: #193b35;
}
.workflow button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.wf-modal {
  position: fixed;
  inset: 0;
  border-radius: 0;
  background: #1238;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
}
.wf-dialog {
  background: #f8fbf9;
  border-radius: 16px;
  padding: 20px;
  max-height: 90dvh;
  overflow: auto;
  width: min(660px, 100%);
  box-sizing: border-box;
}
.wf-dialog__actions { justify-content: flex-end; }
.wf-error {
  color: #aa3026;
}
.wf-success { color: #226b4d; }
.wf-work-dialog {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: min(840px, calc(100dvh - 32px));
  padding: 0;
  overflow: hidden;
  background: #f8fcfa;
  color: #193b35;
  font-size: 15px;
  line-height: 1.6;
}
.wf-work-header, .wf-work-footer { flex: none; padding: 20px 24px; background: #f8fcfa; }
.wf-work-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px solid #d4e2db; }
.wf-work-header__title { min-width: 0; }
.wf-work-eyebrow { display: block; color: #536b63; font-size: 12px; overflow-wrap: anywhere; }
.wf-work-header h3 { margin: 4px 0 8px; font-size: 22px; line-height: 1.35; overflow-wrap: anywhere; }
.wf-work-status { display: inline-flex; padding: 2px 10px; border-radius: 999px; background: #e0eee7; color: #175f54; font-size: 13px; font-weight: 600; }
.wf-work-close { flex: none; }
.wf-work-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px; }
.wf-work-section { padding: 20px 0; border-bottom: 1px solid #d4e2db; }
.wf-work-section:last-child { border-bottom: 0; }
.wf-work-section h4 { margin: 0 0 16px; font-size: 17px; line-height: 1.4; }
.wf-work-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.wf-work-facts > div { min-width: 0; display: grid; align-content: start; gap: 3px; }
.wf-work-facts span, .wf-work-description > span, .wf-work-upload > span { color: #536b63; font-size: 13px; }
.wf-work-facts strong { font-weight: 600; overflow-wrap: anywhere; }
.wf-work-description { margin-top: 16px; }
.wf-work-description p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.workflow .wf-work-field { display: grid; gap: 6px; margin: 0 0 16px; font-weight: 600; }
.wf-work-field select, .wf-work-field textarea { width: 100%; font-weight: 400; }
.wf-work-field textarea { min-height: 96px; resize: vertical; }
.wf-work-upload { display: grid; gap: 8px; font-weight: 600; }
.wf-work-upload__row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; color: #536b63; font-size: 13px; font-weight: 400; }
.workflow .wf-work-upload__button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; margin: 0; padding: 7px 14px; border: 1px solid #9ebbb0; border-radius: 12px; background: #fff; color: #175f54; cursor: pointer; font-size: 14px; font-weight: 600; }
.wf-work-upload__button input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.wf-work-upload__button.is-disabled { opacity: .5; cursor: wait; }
.wf-work-history ol { list-style: none; margin: 0; padding: 0 0 0 16px; border-left: 2px solid #c8ded4; }
.wf-work-history li { position: relative; padding: 0 0 18px 18px; }
.wf-work-history li:last-child { padding-bottom: 0; }
.wf-work-history li::before { content: ''; position: absolute; left: -22px; top: 7px; width: 10px; height: 10px; border-radius: 50%; background: #3c826b; box-shadow: 0 0 0 3px #eaf3ef; }
.wf-work-history__head { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px; }
.wf-work-history__head time, .wf-work-history__actor { color: #536b63; font-size: 13px; }
.wf-work-history__actor, .wf-work-history__reason { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.wf-work-history li button { margin-top: 8px; }
.wf-work-footer { border-top: 1px solid #d4e2db; }
.wf-work-feedback:empty { display: none; }
.wf-work-feedback p { margin: 0 0 10px; font-size: 13px; }
.wf-work-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.workflow .wf-work-primary, .workflow--admin .wf-work-primary { background: #175f54; border-color: #175f54; color: #fff; }
.workflow .wf-work-primary:hover:not(:disabled), .workflow--admin .wf-work-primary:hover:not(:disabled) { background: #104a41; }
.wf-work-dialog :is(button, select, textarea, .wf-work-upload__button):focus-visible { outline: 3px solid #175f54; outline-offset: 2px; }
.wf-notifications {
  max-height: 220px;
  overflow: auto;
  background: #fff4d8;
  padding: 12px;
  border-radius: 12px;
}
.wf-photos {
  z-index: 1001;
}
.wf-photos img {
  max-width: 100%;
  display: block;
  margin: 10px 0;
}
.workflow--admin { padding: 18px 20px; color: var(--ink, #193b35); }
.workflow--admin > h2 { margin: 0 0 14px; font-size: 1.15rem; }
.workflow--admin > h3 { margin: 20px 0 8px; font-size: 1.05rem; }
.workflow--admin > input { width: min(440px, 100%); margin-right: 8px; }
.workflow--admin > p { margin: 10px 0; color: var(--muted, #536b63); }
.workflow--admin > article { padding: 14px 4px; border-bottom: 1px solid var(--admin-line, #d4e2db); }
.workflow--admin > article h3 { margin: 0 0 4px; font-size: 1rem; }
.workflow--admin > article p { margin: 4px 0 8px; color: var(--muted, #536b63); }
.workflow--admin > article details { font-size: .85rem; }
.workflow--admin input:not([type='file']),
.workflow--admin select,
.workflow--admin textarea { background: rgb(114 168 151 / .07); border: 1px solid rgb(25 59 53 / .18); border-radius: 12px; padding: 10px 14px; }
.workflow--admin button { min-height: 38px; background: rgb(250 253 251 / .65); border: 1px solid rgb(25 59 53 / .12); border-radius: 12px; padding: 7px 12px; color: #193b35; box-shadow: 0 2px 8px rgb(25 59 53 / .05); }
.workflow--admin button:hover:not(:disabled) { background: rgb(114 168 151 / .16); }
.workflow--admin .wf-actions { align-items: center; }
.workflow--admin .wf-notifications { max-height: 150px; background: #fbf4e4; border-radius: 14px; }
.workflow--admin .wf-notifications h3 { margin: 0 0 8px; font-size: 1rem; }
.workflow--admin .wf-notifications article { padding: 6px 0; }
.workflow--admin .wf-notifications p { margin: 2px 0; }
.workflow--admin .wf-dialog { background: #f6fbf8; border: 1px solid #d6e5dd; box-shadow: 0 20px 60px rgb(16 50 38 / .2); }
.workflow--admin .wf-dialog h3 { margin-top: 0; }
.workflow--admin .wf-work-dialog { padding: 0; background: #f8fcfa; }
@media (max-width: 700px) {
  .wf-work-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .wf-work-header, .wf-work-footer { padding: 16px 20px; }
  .wf-work-body { padding: 0 20px; }
}
@media (max-width: 500px) {
  .wf-modal:has(.wf-work-dialog) { padding: 0; align-items: stretch; }
  .wf-work-dialog { width: 100%; max-height: 100dvh; border-radius: 0; }
  .wf-work-header h3 { font-size: 19px; }
  .wf-work-facts { grid-template-columns: 1fr 1fr; gap: 12px; }
  .wf-work-actions { justify-content: stretch; }
  .wf-work-actions button { flex: 1 1 auto; }
  .wf-work-footer { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
}
@media (max-width: 700px) {
  .wf-list-row { grid-template-columns: minmax(0, 1fr); }
  .wf-list-row__actions { justify-content: flex-end; }
}
@media (max-width: 500px) {
  .wf-list-toolbar { flex-wrap: wrap; }
  .wf-list-toolbar > input { flex-basis: 100%; width: 100%; }
}
:global(.admin-body[data-theme="dark"] .workflow--admin) { color: #e8f5ee; }
:global(.admin-body[data-theme="dark"] .workflow--admin input:not([type='file'])),
:global(.admin-body[data-theme="dark"] .workflow--admin select),
:global(.admin-body[data-theme="dark"] .workflow--admin textarea) { background: #19352b; color: #e8f5ee; border-color: #456c5c; }
:global(.admin-body[data-theme="dark"] .workflow--admin button) { background: #274838; color: #e8f5ee; border-color: #527363; }
:global(.admin-body[data-theme="dark"] .workflow--admin button:hover:not(:disabled)) { background: #35634d; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-notifications) { background: #40371e; color: #f7e7bc; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-dialog) { background: #172c24; color: #e8f5ee; border-color: #456c5c; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-header),
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-footer) { background: #172c24; border-color: #456c5c; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-section) { border-color: #456c5c; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-eyebrow),
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-facts span),
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-description > span),
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-upload > span),
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-upload__row),
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-history__actor),
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-history__head time) { color: #bfd6ca; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-status) { background: #274838; color: #c6edda; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-upload__button) { background: #274838; color: #e8f5ee; border-color: #527363; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-primary) { background: #175f54; color: #fff; border-color: #3c826b; }
:global(.admin-body[data-theme="dark"] .workflow--admin .wf-work-footer .wf-error) { color: #ffb7ad; }
</style>

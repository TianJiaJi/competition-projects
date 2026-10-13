<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from "vue";
import {
  UserRound,
  Search,
  ChevronLeft,
  ListTodo,
  History,
  MapPin,
  TriangleAlert,
  CircleAlert,
  RefreshCw,
  X,
  ChevronRight,
  Check,
  Clock3,
  Wrench,
} from "lucide-vue-next";
import { ScenicLogo } from "@scenic/ui/scenic-art";
import { ContourBackground } from "@scenic/ui/contour";
import { LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import GateWorkflowPage from "./components/GateWorkflowPage.vue";
import GateDatePicker from "./components/GateDatePicker.vue";
import GateSelect from "./components/GateSelect.vue";
import TaskRow from "./components/TaskRow.vue";
import {
  categoryLabels,
  severityLabels,
  statusLabels,
  oaTypeLabels,
  oaStatusLabels,
  displayTime,
  filterTasks,
  type Database,
  type OAType,
  type Session,
  type Command,
} from "./core/types";
import { createId } from "./core/id";
import { GateError } from "./core/validation";
import { service, demoEnabled, subscribeLive } from "./services/browser";

const session = ref<Session | null>(service.getSession()),
  db = ref<Database | null>(null),
  route = ref(location.hash.slice(1) || "/tasks");
const loading = ref(false),
  busy = ref(false),
  error = ref(""),
  errorCode = ref(""),
  fields = ref<Record<string, string>>({}),
  notice = ref(""),
  stale = ref(false);
const account = ref<HTMLDialogElement | null>(null),
  confirmDialog = ref<HTMLDialogElement | null>(null),
  confirmation = ref("");
let confirmAction: (() => void) | null = null;
const credentials = reactive({ username: "staff01", password: "" });
const filters = reactive({
  keyword: "",
  category: "",
  status: "",
  from: "",
  to: "",
});
const mineTab = ref<"tasks" | "oa">("tasks");
const oaFilter = ref("");
const draft = reactive({
  type: "reinforcement" as OAType,
  reason: "",
  needs: "",
  result: "",
  opinion: "",
  decision: "approved" as "approved" | "rejected",
});
let draftTask = "";
let pendingCommand: { signature: string; command: Command } | null = null;
const parts = computed(() => route.value.split("/").filter(Boolean));
const page = computed(() => parts.value[0] || "tasks");
const taskId = computed(() =>
  parts.value[0] === "tasks" ? parts.value[1] : undefined,
);
const task = computed(() => db.value?.tasks.find((t) => t.id === taskId.value));
const oa = computed(() =>
  db.value?.requests.find((o) => o.id === parts.value[1]),
);
const isList = computed(
  () => ["tasks", "mine", "history"].includes(page.value) && !taskId.value,
);
const isForm = computed(
  () => !!taskId.value && ["apply", "complete"].includes(parts.value[2]),
);
const owns = computed(
  () => !!task.value && task.value.assignee?.id === session.value?.employee.id,
);
const canProcessTask = computed(() => owns.value && task.value?.status === "processing" && (!task.value.workOrderStatus || task.value.workOrderStatus === "in_progress"));
const canStartTask = computed(() => task.value?.status === "pending" && (!task.value.assignee || owns.value));
const taskOAs = computed(
  () =>
    db.value?.requests
      .filter((o) => o.taskId === task.value?.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [],
);
const pendingOAs = computed(() =>
  taskOAs.value.filter((o) => o.status === "pending"),
);
const mineOAs = computed(
  () =>
    db.value?.requests
      .filter(
        (o) =>
          o.applicant.id === session.value?.employee.id &&
          (!oaFilter.value || o.status === oaFilter.value),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [],
);
const minePending = computed(
  () =>
    db.value?.requests.filter(
      (o) =>
        o.applicant.id === session.value?.employee.id && o.status === "pending",
    ).length ?? 0,
);
const demoOAs = computed(
  () => db.value?.requests.filter((o) => o.status === "pending") ?? [],
);
const visibleTasks = computed(() =>
  filterTasks(db.value?.tasks ?? [], {
    ...filters,
    actorId: session.value?.employee.id ?? "",
    scope:
      page.value === "mine"
        ? "mine"
        : page.value === "history"
          ? "history"
          : "current",
  }),
);
const title = computed(() =>
  page.value === "mine" ? "我的" : page.value === "history" ? "记录" : "待办",
);
const validRoute = computed(
  () =>
    (route.value === "/demo" && demoEnabled) ||
    route.value === "/workflow" ||
    (isList.value && parts.value.length === 1) ||
    (page.value === "oa" && parts.value.length === 2 && !!oa.value) ||
    (page.value === "tasks" &&
      !!task.value &&
      (parts.value.length === 2 ||
        (parts.value.length === 3 &&
          ["apply", "complete"].includes(parts.value[2])))),
);
const dirty = computed(() =>
  isForm.value
    ? parts.value[2] === "apply"
      ? !!(draft.reason || draft.needs)
      : !!draft.result
    : page.value === "demo" && !!draft.opinion,
);
const canWrite = computed(
  () =>
    !busy.value &&
    !stale.value &&
    !loading.value &&
    !["MOCK_STORAGE_CORRUPT", "RUN_EXPIRED"].includes(errorCode.value),
);
const demoSelection = ref("");
function clearFeedback() {
  error.value = "";
  errorCode.value = "";
  fields.value = {};
  notice.value = "";
}
function showError(e: unknown) {
  const g =
    e instanceof GateError
      ? e
      : new GateError("UNKNOWN", "操作未完成，请重试。");
  error.value = g.message;
  errorCode.value = g.code;
  fields.value = g.fieldErrors;
  if (g.code === "MOCK_STORAGE_CONFLICT") stale.value = true;
  if (g.code === "AUTH_REQUIRED") {
    session.value = null;
    account.value?.close();
  }
  nextTick(() => {
    const invalid = document.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (invalid) invalid.focus();
    else
      document
        .querySelector(".feedback.error")
        ?.scrollIntoView({ block: "start" });
  });
}
function clearDraft() {
  Object.assign(draft, {
    type: "reinforcement",
    reason: "",
    needs: "",
    result: "",
    opinion: "",
    decision: "approved",
  });
  pendingCommand = null;
}
function ask(text: string, action: () => void) {
  confirmation.value = text;
  confirmAction = action;
  confirmDialog.value?.showModal();
}
function confirm() {
  confirmDialog.value?.close();
  const action = confirmAction;
  confirmAction = null;
  action?.();
}
function go(path: string) {
  if (busy.value) return;
  if (path === route.value) return;
  const change = () => {
    clearDraft();
    clearFeedback();
    location.hash = path;
  };
  if (dirty.value) ask("离开后将丢弃尚未提交的内容。", change);
  else change();
}
function onRoute() {
  const next = location.hash.slice(1) || "/tasks";
  if (next === route.value) return;
  if (busy.value) {
    history.replaceState(null, "", `#${route.value}`);
    return;
  }
  if (dirty.value) {
    history.replaceState(null, "", `#${route.value}`);
    ask("离开后将丢弃尚未提交的内容。", () => {
      clearDraft();
      location.hash = next;
    });
    return;
  }
  route.value = next;
  clearFeedback();
  Object.assign(filters, {
    keyword: "",
    category: "",
    status: "",
    from: "",
    to: "",
  });
  if (taskId.value !== draftTask) {
    clearDraft();
    draftTask = taskId.value ?? "";
  }
  window.scrollTo(0, 0);
  nextTick(() => document.querySelector<HTMLElement>("h1")?.focus());
}
function back() {
  if (page.value === "oa" && oa.value) go(`/tasks/${oa.value.taskId}`);
  else if (isForm.value) go(`/tasks/${taskId.value}`);
  else go("/tasks");
}
async function reload() {
  if (busy.value) return;
  const previousError = errorCode.value;
  loading.value = true;
  clearFeedback();
  try {
    const next = await service.load();
    if(db.value&&db.value.runId!==next.runId){clearDraft();window.location.hash='/tasks';}
    db.value = next;
    stale.value = false;
    if (
      [
        "VERSION_CONFLICT",
        "MOCK_STORAGE_CONFLICT",
        "TASK_STATE_CONFLICT",
        "OA_STATE_CONFLICT",
      ].includes(previousError)
    )
      pendingCommand = null;
  } catch (e) {
    showError(e);
  } finally {
    loading.value = false;
  }
}
const needsPasswordChange=ref(false),newPassword=ref(""),confirmPassword=ref("");
async function finishPasswordChange(){busy.value=true;clearFeedback();try{if(newPassword.value!==confirmPassword.value)throw Error("两次密码不一致");await service.changePassword(newPassword.value);needsPasswordChange.value=false;newPassword.value="";confirmPassword.value="";await loadAfterLogin();}catch(e){showError(e);}finally{busy.value=false;}}
async function login() {
  busy.value = true;
  clearFeedback();
  try {
    session.value = await service.login(
      credentials.username,
      credentials.password,
    );
    credentials.password = "";
    route.value = route.value === "/login" ? "/tasks" : route.value;
    history.replaceState(null, "", `#${route.value}`);
    needsPasswordChange.value=service.needsPasswordChange();
    if(!needsPasswordChange.value)await loadAfterLogin();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function loadAfterLogin() {
  loading.value = true;
  try {
    const next = await service.load();
    if(db.value&&db.value.runId!==next.runId){clearDraft();window.location.hash='/tasks';}
    db.value = next;
    stale.value = false;
  } finally {
    loading.value = false;
  }
}
async function mutate(
  action: (command: Command) => Promise<Database>,
  signature: string,
  version: number,
  after?: () => void,
) {
  if (!canWrite.value) return;
  busy.value = true;
  clearFeedback();
  if (pendingCommand?.signature !== signature)
    pendingCommand = {
      signature,
      command: { key: createId(), expectedVersion: version },
    };
  try {
    db.value = await action(pendingCommand.command);
    pendingCommand = null;
    after?.();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
function start() {
  if (task.value)
    void mutate(
      (c) => service.start(task.value!.id, c),
      `start:${task.value.id}`,
      task.value.version,
      () => {
        notice.value = "已开始处理，你已成为任务负责人。";
      },
    );
}
function submitOA() {
  if (!task.value) return;
  const input = { type: draft.type, reason: draft.reason, needs: draft.needs };
  void mutate(
    (c) => service.createOA(task.value!.id, input, c),
    JSON.stringify(["oa", task.value.id, input]),
    task.value.version,
    () => {
      const newest = db.value!.requests.find(item => item.id === db.value!.createdRequestId) ?? db.value!.requests.at(-1)!;
      clearDraft();
      route.value = `/oa/${newest.id}`;
      history.pushState(null, "", `#${route.value}`);
      notice.value = "申请已提交，等待管理员审批。";
      window.scrollTo(0, 0);
    },
  );
}
function finish() {
  if (!task.value) return;
  void mutate(
    (c) => service.complete(task.value!.id, draft.result, c),
    JSON.stringify(["finish", task.value.id, draft.result]),
    task.value.version,
    () => {
      clearDraft();
      route.value = `/tasks/${task.value!.id}`;
      history.replaceState(null, "", `#${route.value}`);
      notice.value = "处置结果已提交，等待管理员验收。";
      window.scrollTo(0, 0);
    },
  );
}
function withdraw() {
  if (!oa.value) return;
  ask(
    "撤回后此申请结束，需要时可重新提交。",
    () =>
      void mutate(
        (c) => service.withdraw(oa.value!.id, c),
        `withdraw:${oa.value!.id}`,
        oa.value!.version,
        () => {
          notice.value = "申请已撤回。";
        },
      ),
  );
}
function decide() {
  const selected = db.value?.requests.find((o) => o.id === demoSelection.value);
  if (!selected) {
    showError(new GateError("VALIDATION_ERROR", "请选择待审批申请。"));
    return;
  }
  void mutate(
    (c) => service.decideDemo(selected.id, draft.decision, draft.opinion, c),
    JSON.stringify(["decision", selected.id, draft.decision, draft.opinion]),
    selected.version,
    () => {
      clearDraft();
      demoSelection.value = "";
      notice.value = "审批结果已保存，可返回任务查看。";
    },
  );
}
function reset() { notice.value = "请在独立演示终端管理运行，本端不重置业务数据。"; }
function logout() {
  const action = async () => {
    busy.value = true;
    try {
      await service.logout();
      clearDraft();
      session.value = null;
      db.value = null;
      account.value?.close();
      clearFeedback();
    } catch (e) {
      showError(e);
    } finally {
      busy.value = false;
    }
  };
  if (dirty.value) ask("退出后将丢弃尚未提交的内容。", () => void action());
  else void action();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
let sessionTimer: ReturnType<typeof setInterval>;
onMounted(() => {
  void service.restore().then(value=>{session.value=value;needsPasswordChange.value=service.needsPasswordChange();if(value&&!needsPasswordChange.value)void reload();}).catch(showError);
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("popstate", onRoute);
  window.addEventListener("beforeunload", beforeUnload);
  sessionTimer = setInterval(() => {
    if (session.value && !service.getSession()) {
      session.value = null;
      account.value?.close();
      error.value = "登录已失效，请重新登录。";
    }
  }, 30000);
});
onBeforeUnmount(() => {
  clearInterval(sessionTimer);
  window.removeEventListener("hashchange", onRoute);
  window.removeEventListener("popstate", onRoute);
  window.removeEventListener("beforeunload", beforeUnload);
});
let stopLive: (() => void) | undefined;
onMounted(() => { stopLive = subscribeLive(() => { if (session.value && !busy.value && !needsPasswordChange.value) void reload(); }); });
onBeforeUnmount(() => stopLive?.());
</script>

<template>
  <div class="gate-shell">
    <ContourBackground
      class="gate-background"
      theme="light"
      background-color="#eaf3ef"
      line-color="#193b35"
      :line-opacity="0.06"
      aria-hidden="true"
    />
    <header class="brand-bar">
      <span class="brand-name"
        ><ScenicLogo :size="28" decorative /><span>青岚山境</span></span
      ><button
        v-if="session"
        class="icon-button"
        aria-label="账号菜单"
        :disabled="busy"
        @click="account?.showModal()"
      >
        <UserRound :size="20" /><span>{{ session.employee.name }}</span></button
      ><span v-else class="small">前线处置</span>
    </header>
    <div v-if="error" class="feedback error" role="alert">
      <span>{{ error }}</span
      ><button
        v-if="
          session &&
          [
            'MOCK_STORAGE_CONFLICT',
            'VERSION_CONFLICT',
            'MOCK_STORAGE_FAILED',
            'UNKNOWN',
            'RUN_EXPIRED',
          ].includes(errorCode)
        "
        class="text-button"
        :disabled="busy || loading"
        @click="reload"
      >
        重新加载
      </button>
    </div>
    <div v-if="notice" class="feedback success" role="status">
      <Check :size="18" /><span>{{ notice }}</span>
    </div>
    <main v-if="!session" class="page login-page">
      <h1>前线处置</h1>
      <p class="muted">登录后查看任务、反馈处置结果。</p>
      <form @submit.prevent="login">
        <label class="field"
          ><span>员工账号</span
          ><input
            v-model="credentials.username"
            autocomplete="username"
            required
            :disabled="busy" /></label
        ><label class="field"
          ><span>密码</span
          ><input
            v-model="credentials.password"
            type="password"
            autocomplete="current-password"
            required
            :disabled="busy" /></label
        ><button class="primary full" :disabled="busy">
          {{ busy ? "正在登录…" : "登录" }}
        </button>
      </form>

    </main>
    <main v-else-if="needsPasswordChange" class="page login-page"><h1>首次登录请修改密码</h1><form @submit.prevent="finishPasswordChange"><label class="field">新密码<input v-model="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required/></label><label class="field">确认密码<input v-model="confirmPassword" type="password" autocomplete="new-password" required/></label><button class="primary full" :disabled="busy">保存密码并进入</button></form></main>
    <main v-else-if="loading && !db" class="page" aria-busy="true">
      <h1>读取任务</h1>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    </main>
    <main v-else-if="!db" class="page">
      <h1>暂时无法读取</h1>
      <p>可重试读取；数据损坏时可运行控制说明。</p>
      <button class="primary" :disabled="busy || loading" @click="reload">
        重试</button
      ><button
        class="text-button"
        :disabled="busy || stale || loading"
        @click="reset"
      >
        运行控制说明
      </button>
    </main>
    <main v-else-if="!validRoute" class="page">
      <h1>页面不存在</h1>
      <p>该任务、申请或页面不可用。</p>
      <button class="primary" @click="go('/tasks')">返回待办</button>
    </main>
    <template v-else-if="isList">
      <main class="page list-page">
        <div class="row">
          <h1>{{ title }}</h1>
          <button
            class="icon-button"
            :disabled="loading || busy"
            aria-label="刷新任务"
            @click="reload"
          >
            <RefreshCw :size="19" />
          </button>
        </div>
        <p class="small">
          {{
            page === "tasks"
              ? "全园现场事件 · 紧急优先"
              : page === "mine"
                ? "你负责的任务与协同申请"
                : "全园已完成事件 · 完成时间倒序"
          }}
        </p>
        <div v-if="page === 'mine'" class="tabs">
          <button
            :aria-pressed="mineTab === 'tasks'"
            @click="mineTab = 'tasks'"
          >
            我的任务</button
          ><button :aria-pressed="mineTab === 'oa'" @click="mineTab = 'oa'">
            我的 OA <span v-if="minePending">· {{ minePending }} 待审批</span>
          </button>
        </div>
        <template v-if="page !== 'mine' || mineTab === 'tasks'">
          <div class="search-field" role="search">
            <Search :size="18" :stroke-width="1.75" aria-hidden="true" />
            <input
              v-model="filters.keyword"
              type="search"
              aria-label="搜索任务或位置"
              placeholder="搜索任务或位置"
            />
            <button
              v-if="filters.keyword"
              class="search-clear"
              type="button"
              aria-label="清空搜索"
              @click="filters.keyword = ''"
            >
              <X :size="16" />
            </button>
          </div>
          <div class="filter-row">
            <label
              ><span>事件类别</span
              ><GateSelect v-model="filters.category">
                <option value="">全部类别</option>
                <option
                  v-for="(label, key) in categoryLabels"
                  :key="key"
                  :value="key"
                >
                  {{ label }}
                </option>
              </GateSelect></label
            ><label v-if="page === 'mine'"
              ><span>任务状态</span
              ><GateSelect v-model="filters.status">
                <option value="">全部状态</option>
                <option value="processing">处理中</option>
                <option value="resolved">已处理</option>
              </GateSelect></label
            >
          </div>
          <div v-if="page === 'tasks'" class="tabs">
            <button
              v-for="item in [
                { value: '', label: '全部' },
                { value: 'pending', label: '待处理' },
                { value: 'processing', label: '处理中' },
              ]"
              :key="item.value"
              :aria-pressed="filters.status === item.value"
              @click="filters.status = item.value"
            >
              {{ item.label }}
            </button>
          </div>
          <div v-if="page === 'history'" class="filter-row dates">
            <label
              ><span>完成起始日期</span
              ><GateDatePicker
                v-model="filters.from"
                label="完成起始日期"
                placeholder="开始日期" /></label
            ><label
              ><span>完成截止日期</span
              ><GateDatePicker
                v-model="filters.to"
                label="完成截止日期"
                placeholder="结束日期"
                :min="filters.from"
            /></label>
          </div>
          <p
            v-if="filters.from && filters.to && filters.from > filters.to"
            class="field-error"
            role="alert"
          >
            截止日期不能早于起始日期。
          </p>
          <div class="task-list">
            <TaskRow
              v-for="item in visibleTasks"
              :key="item.id"
              :task="item"
              @open="go(`/tasks/${$event}`)"
            />
          </div>
          <div v-if="!visibleTasks.length" class="empty">
            <h2>暂无符合条件的任务</h2>
            <p>可调整筛选条件或稍后刷新。</p>
            <button
              class="text-button"
              @click="
                Object.assign(filters, {
                  keyword: '',
                  category: '',
                  status: '',
                  from: '',
                  to: '',
                })
              "
            >
              清除筛选
            </button>
          </div>
        </template>
        <template v-else
          ><label class="field"
            ><span>申请状态</span
            ><GateSelect v-model="oaFilter">
              <option value="">全部状态</option>
              <option
                v-for="(label, key) in oaStatusLabels"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </GateSelect></label
          >
          <div class="task-list">
            <button
              v-for="item in mineOAs"
              :key="item.id"
              class="task-row"
              @click="go(`/oa/${item.id}`)"
            >
              <span class="row"
                ><strong>{{ oaTypeLabels[item.type] }}申请</strong
                ><span class="oa-status" :class="item.status">{{
                  oaStatusLabels[item.status]
                }}</span></span
              ><span>{{ item.taskTitle }}</span
              ><span class="small block">{{
                displayTime(item.updatedAt)
              }}</span>
            </button>
          </div>
          <p v-if="!mineOAs.length" class="empty">
            暂无符合条件的申请。
          </p></template
        >
      </main>
      <LiquidGlassSurface
        class="bottom-nav"
        as="nav"
        :radius="0"
        :tint-opacity="0.9"
        :blur="2"
        aria-label="主导航"
        ><button
          v-for="item in [
            { path: '/tasks', label: '待办', icon: ListTodo },
            { path: '/mine', label: '我的', icon: UserRound },
            { path: '/history', label: '记录', icon: History },
            { path: '/workflow', label: '报修', icon: Wrench },
          ]"
          :key="item.path"
          :aria-current="route === item.path ? 'page' : undefined"
          @click="go(item.path)"
        >
          <component :is="item.icon" :size="22" :stroke-width="1.75" /><span>{{
            item.label
          }}</span>
        </button></LiquidGlassSurface
      >
    </template>
    <template v-else-if="page === 'workflow'">
      <main class="page workflow-page">
        <div class="row">
          <h1>现场报修与工单</h1>
        </div>
        <p class="small">现场上报、设施关闭申请与维修工单进度</p>
        <GateWorkflowPage :api="service.api" />
      </main>
      <LiquidGlassSurface class="bottom-nav" as="nav" :radius="0" :tint-opacity="0.9" :blur="2" aria-label="主导航">
        <button v-for="item in [
          { path: '/tasks', label: '待办', icon: ListTodo },
          { path: '/mine', label: '我的', icon: UserRound },
          { path: '/history', label: '记录', icon: History },
          { path: '/workflow', label: '报修', icon: Wrench },
        ]" :key="item.path" :aria-current="route === item.path ? 'page' : undefined" @click="go(item.path)">
          <component :is="item.icon" :size="22" :stroke-width="1.75" /><span>{{ item.label }}</span>
        </button>
      </LiquidGlassSurface>
    </template>
    <template v-else-if="task && !isForm">
      <main class="page detail-page">
        <button class="back" @click="back">
          <ChevronLeft :size="20" />任务
        </button>
        <section class="section">
          <div class="row">
            <span class="severity" :class="task.severity"
              ><component
                :is="task.severity === 'critical' ? TriangleAlert : CircleAlert"
                :size="18"
              />{{ severityLabels[task.severity] }} ·
              {{ categoryLabels[task.category] }}</span
            ><span class="small">{{ task.workOrderStatus === 'awaiting_acceptance' ? '待验收' : statusLabels[task.status] }}</span>
          </div>
          <h1>{{ task.title }}</h1>
          <p class="location"><MapPin :size="17" />{{ task.location }}</p>
        </section>
        <section class="section">
          <h2>现场情况</h2>
          <p class="prewrap">{{ task.reason }}</p>
          <dl class="meta">
            <dt>监测信息</dt>
            <dd>{{ task.metric }}</dd>
            <dt>发生时间</dt>
            <dd>{{ displayTime(task.startedAt) }}</dd>
            <dt>负责人</dt>
            <dd>{{ task.assignee?.name ?? "尚未领取" }}</dd>
            <template v-if="task.handlingStartedAt"
              ><dt>开始处理</dt>
              <dd>{{ displayTime(task.handlingStartedAt) }}</dd></template
            ><template v-if="task.completedAt"
              ><dt>完成时间</dt>
              <dd>{{ displayTime(task.completedAt) }}</dd></template
            >
          </dl>
        </section>
        <section class="section">
          <div class="row">
            <h2>协同申请</h2>
            <span class="small">{{
              taskOAs.length ? `${taskOAs.length} 条` : "暂无申请"
            }}</span>
          </div>
          <p v-if="!taskOAs.length" class="small">
            需要增援、封锁现场或物资时，可提交 OA。
          </p>
          <button
            v-for="item in taskOAs"
            :key="item.id"
            class="oa-card"
            @click="go(`/oa/${item.id}`)"
          >
            <span class="row"
              ><span>{{ oaTypeLabels[item.type] }}申请</span
              ><span class="oa-status" :class="item.status">{{
                oaStatusLabels[item.status]
              }}</span></span
            ><span class="small"
              >{{ item.applicant.name }} ·
              {{ displayTime(item.createdAt) }}</span
            >
          </button>
        </section>
        <section class="section">
          <h2>处理记录</h2>
          <ol class="timeline">
            <li
              v-for="(record, index) in [...task.records].reverse()"
              :key="index"
            >
              <span
                >{{
                  {
                    created: "事件产生",
                    started: "开始处理",
                    completed: "处置完成",
                  }[record.kind]
                }}
                · {{ record.actor }}</span
              >
              <p v-if="record.kind !== 'started'" class="prewrap">
                {{ record.text }}
              </p>
              <time class="small">{{ displayTime(record.at) }}</time>
            </li>
          </ol>
        </section>
        <p v-if="pendingOAs.length" class="warning">
          还有 {{ pendingOAs.length }} 条 OA 待审批，结束申请后可完成任务。
        </p>
        <p v-if="task.workOrderStatus === 'awaiting_acceptance'" class="warning">处置结果已提交，等待管理员验收；验收通过后任务进入记录。</p>
        <p v-if="task.assignee && !owns && task.status !== 'resolved'" class="small">
          此任务由 {{ task.assignee?.name }} 负责，你可以查看处理进度。
        </p>
      </main>
      <div class="actions">
        <button
          v-if="canStartTask"
          class="primary"
          :disabled="!canWrite"
          @click="start"
        >
          {{ busy ? "正在提交…" : "开始处理" }}</button
        ><template v-else-if="canProcessTask"
          ><button
            class="secondary"
            :disabled="!canWrite"
            @click="go(`/tasks/${task.id}/apply`)"
          >
            提 OA</button
          ><button
            class="primary"
            :disabled="!canWrite || pendingOAs.length > 0"
            @click="go(`/tasks/${task.id}/complete`)"
          >
            完成反馈
          </button></template
        ><button
          v-else
          class="primary"
          @click="go(task.status === 'resolved' ? '/history' : '/tasks')"
        >
          {{ task.status === "resolved" ? "返回记录" : "返回待办" }}
        </button>
      </div>
    </template>
    <template v-else-if="task && isForm">
      <form
        v-if="canProcessTask"
        class="form-page"
        @submit.prevent="parts[2] === 'apply' ? submitOA() : finish()"
      >
        <main class="page">
          <button type="button" class="back" @click="back">
            <ChevronLeft :size="20" />任务详情
          </button>
          <h1>{{ parts[2] === "apply" ? "提交 OA" : "完成反馈" }}</h1>
          <p class="small">关联任务 · {{ task.title }}</p>
          <fieldset :disabled="busy">
            <template v-if="parts[2] === 'apply'"
              ><label class="field"
                ><span>申请类型</span
                ><GateSelect v-model="draft.type">
                  <option
                    v-for="(label, key) in oaTypeLabels"
                    :key="key"
                    :value="key"
                  >
                    {{ label }}
                  </option>
                </GateSelect></label
              ><label class="field"
                ><span>申请原因</span
                ><textarea
                  v-model="draft.reason"
                  maxlength="500"
                  :aria-invalid="!!fields.reason"
                  aria-describedby="reason-error"
                  placeholder="说明当前困难及影响"
                ></textarea
                ><small id="reason-error" class="field-error">{{
                  fields.reason
                }}</small></label
              ><label class="field"
                ><span>具体需求</span
                ><textarea
                  v-model="draft.needs"
                  maxlength="500"
                  :aria-invalid="!!fields.needs"
                  aria-describedby="needs-error"
                  placeholder="例如：需要 2 名安保人员协助疏导"
                ></textarea
                ><small id="needs-error" class="field-error">{{
                  fields.needs
                }}</small></label
              >
              <p class="small">
                提交后由管理员审批，结果可在任务详情查看。
              </p></template
            >
            <template v-else
              ><label class="field"
                ><span>处置结果</span
                ><textarea
                  v-model="draft.result"
                  maxlength="500"
                  :aria-invalid="!!fields.result"
                  aria-describedby="result-error"
                  placeholder="说明采取的措施与现场处理结果"
                ></textarea
                ><small id="result-error" class="field-error">{{
                  fields.result
                }}</small></label
              >
              <p class="small">提交后归档本次事件，并记录处理人与完成时间。</p>
              <p v-if="pendingOAs.length" class="warning">
                还有 {{ pendingOAs.length }} 条 OA 待审批，暂时不能完成。
              </p></template
            >
          </fieldset>
        </main>
        <div class="actions">
          <button
            class="primary"
            :disabled="
              !canWrite || (parts[2] === 'complete' && pendingOAs.length > 0)
            "
          >
            {{
              busy
                ? "正在提交…"
                : parts[2] === "apply"
                  ? "提交申请"
                  : "确认完成"
            }}
          </button>
        </div>
      </form>
      <main v-else class="page">
        <h1>当前无法操作</h1>
        <p>只有处理中任务的负责人可以提交申请或完成反馈。</p>
        <button class="primary" @click="go(`/tasks/${task.id}`)">
          返回任务
        </button>
      </main>
    </template>
    <template v-else-if="page === 'oa' && oa">
      <main class="page detail-page">
        <button class="back" @click="back">
          <ChevronLeft :size="20" />任务详情
        </button>
        <div class="oa-heading">
          <span class="oa-status" :class="oa.status"
            ><Clock3 v-if="oa.status === 'pending'" :size="18" />{{
              oaStatusLabels[oa.status]
            }}</span
          >
          <h1>{{ oaTypeLabels[oa.type] }}申请</h1>
          <button
            class="text-button task-link"
            @click="go(`/tasks/${oa.taskId}`)"
          >
            {{ oa.taskTitle }}<ChevronRight :size="16" />
          </button>
        </div>
        <section class="section">
          <h2>申请原因</h2>
          <p class="prewrap">{{ oa.reason }}</p>
        </section>
        <section class="section">
          <h2>具体需求</h2>
          <p class="prewrap">{{ oa.needs }}</p>
        </section>
        <section class="section">
          <dl class="meta">
            <dt>申请人</dt>
            <dd>{{ oa.applicant.name }}</dd>
            <dt>提交时间</dt>
            <dd>{{ displayTime(oa.createdAt) }}</dd>
            <dt>审批意见</dt>
            <dd class="prewrap">
              {{
                oa.decision?.opinion ??
                (oa.status === "withdrawn" ? "申请人已撤回" : "等待管理员审批")
              }}
            </dd>
            <template v-if="oa.decision"
              ><dt>审批人</dt>
              <dd>{{ oa.decision.actor.name }}</dd>
              <dt>审批时间</dt>
              <dd>{{ displayTime(oa.decision.at) }}</dd></template
            >
          </dl>
        </section>
        <section class="section">
          <h2>申请记录</h2>
          <ol class="timeline">
            <li
              v-for="(record, index) in [...oa.records].reverse()"
              :key="index"
            >
              <span>{{ record.actor.name }}</span>
              <p class="prewrap">{{ record.text }}</p>
              <time class="small">{{ displayTime(record.at) }}</time>
            </li>
          </ol>
        </section>
      </main>
      <div class="actions">
        <button
          v-if="
            oa.status === 'pending' && oa.applicant.id === session.employee.id
          "
          class="secondary"
          :disabled="!canWrite"
          @click="withdraw"
        >
          撤回申请</button
        ><button class="primary" @click="back">返回任务</button>
      </div>
    </template>
    <form
      v-else-if="page === 'demo' && demoEnabled"
      class="form-page"
      @submit.prevent="decide"
    >
      <main class="page">
        <button type="button" class="back" @click="go('/tasks')">
          <ChevronLeft :size="20" />返回待办
        </button>
        <h1>OA 审批</h1>
        <p class="warning">选择待审批申请，填写审批意见后提交。</p>
        <fieldset :disabled="busy">
          <label class="field"
            ><span>待审批申请</span
            ><GateSelect v-model="demoSelection">
              <option value="">请选择申请</option>
              <option v-for="item in demoOAs" :key="item.id" :value="item.id">
                {{ item.taskTitle }} · {{ oaTypeLabels[item.type] }} ·
                {{ displayTime(item.createdAt) }} · {{ item.id.slice(-6) }}
              </option>
            </GateSelect></label
          ><template v-if="demoSelection"
            ><div class="section">
              <p class="prewrap">
                {{ db.requests.find((o) => o.id === demoSelection)?.reason }}
              </p>
              <p class="prewrap">
                {{ db.requests.find((o) => o.id === demoSelection)?.needs }}
              </p>
            </div>
            <label class="field"
              ><span>审批结果</span
              ><GateSelect v-model="draft.decision">
                <option value="approved">批准</option>
                <option value="rejected">驳回</option>
              </GateSelect></label
            ><label class="field"
              ><span>审批意见</span
              ><textarea
                v-model="draft.opinion"
                maxlength="500"
                :aria-invalid="!!fields.opinion"
                aria-describedby="opinion-error"
              ></textarea
              ><small id="opinion-error" class="field-error">{{
                fields.opinion
              }}</small></label
            ></template
          >
          <p v-if="!demoOAs.length" class="empty">
            暂无待审批申请。请先从任务详情提交 OA。
          </p>
        </fieldset>
      </main>
      <div class="actions">
        <button class="primary" :disabled="!canWrite || !demoSelection">
          {{ busy ? "正在保存…" : "保存审批结果" }}
        </button>
      </div>
    </form>
    <dialog ref="account" class="dialog" aria-labelledby="account-title">
      <div class="row">
        <h2 id="account-title">账号</h2>
        <button
          class="icon-button"
          aria-label="关闭账号菜单"
          @click="account?.close()"
        >
          <X :size="20" />
        </button>
      </div>
      <p>{{ session?.employee.name }}</p>
      <p class="small">当前员工 · 前线处置</p>
      <div class="dialog-options">
        <button
          class="secondary"
          :disabled="busy || loading || stale"
          @click="reset"
        >
          运行控制说明</button
        ><button class="secondary" :disabled="busy" @click="logout">
          退出登录
        </button>
      </div>
    </dialog>
    <dialog ref="confirmDialog" class="dialog" aria-labelledby="confirm-title">
      <h2 id="confirm-title">确认操作</h2>
      <p>{{ confirmation }}</p>
      <div class="dialog-actions">
        <button class="secondary" @click="confirmDialog?.close()">取消</button
        ><button class="primary" @click="confirm">确认</button>
      </div>
    </dialog>
  </div>
</template>

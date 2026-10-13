<script setup lang="ts">
import { ScenicLogo } from "@scenic/ui/scenic-art";
import { LiquidGlassButton } from "@scenic/ui/liquid-glass";
import { adminTheme } from "./app/theme";
import ThemeSelect from "./components/ThemeSelect.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from "vue";
import { ContourBackground } from "@scenic/ui/contour";
import { RecordRackNav, type RackActivation, type RecordRackGroup } from "@scenic/ui/record-rack";
import {
  askConfirm,
  currentHashPath,
  pushToast,
  runtimeMessage,
  resolveConfirm,
  session,
  setHash,
  unsavedSummary,
} from "./app/state";
import { ChevronDown, LogOut, UserRound } from "lucide-vue-next";
import { LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import { linkTo, resolveRoute, sidebarGroups, useRoute, type RouteName } from "./router";
import { getMe, logout } from "./services/auth";
import { bootstrap, bootstrapSession, currentSession, checkStorageChanges, resetSample, subscribeRuntime } from "./services/store";
import ConfirmHost from "./components/ConfirmHost.vue";
import ToastHost from "./components/ToastHost.vue";
import { confirmRequest } from "./app/state";
import LoginPage from "./pages/LoginPage.vue";
import OverviewPage from "./pages/OverviewPage.vue";
import ScenicContentPage from "./pages/ScenicContentPage.vue";
import ArticlesPage from "./pages/ArticlesPage.vue";
import ArticleEditPage from "./pages/ArticleEditPage.vue";
import PoisPage from "./pages/PoisPage.vue";
import PoiEditPage from "./pages/PoiEditPage.vue";
import NoticesPage from "./pages/NoticesPage.vue";
import OrdersPage from "./pages/OrdersPage.vue";
import SlotsPage from "./pages/SlotsPage.vue";
import FacilitiesPage from "./pages/FacilitiesPage.vue";
import InspectionsPage from "./pages/InspectionsPage.vue";
import AuditPage from "./pages/AuditPage.vue";
import OAPage from "./pages/OAPage.vue";
import AlertsPage from "./pages/AlertsPage.vue";
import UsersPage from "./pages/UsersPage.vue";
import ChatPage from "./pages/ChatPage.vue";
import KnowledgePage from "./pages/KnowledgePage.vue";
import ServiceStatusPage from "./pages/ServiceStatusPage.vue";
import NotFoundPage from "./pages/NotFoundPage.vue";

const recordTheme = computed(() => ({
  '--rack-blur': '18px', '--rack-title-size': '24px', '--rack-label-size': '18px',
  '--rack-track-size': '18px', '--rack-summary-size': '16px', '--rack-support-size': '16px',
  ...(adminTheme.value === 'dark' ? {
    '--rack-tint': '22 53 49', '--rack-opacity': 0.88, '--rack-disc-opacity': 0.82,
    '--rack-text': '#e2f0e9', '--rack-muted': '#aac5bb', '--rack-accent': '#9cddc9',
    '--rack-active': '#a6efd6', '--rack-highlight': 'rgb(46 88 77 / .94)',
    '--rack-border': 'rgb(155 203 184 / .26)', '--rack-shadow': '0 15px 40px rgb(0 0 0 / .30)',
  } : {}),
}));

const route = useRoute();
const ready = ref(false);
const runtimeRun = ref("");
const expiredMessage = ref<string | null>(null);
let expiryTimer: number | undefined;

const pageComponents: Record<RouteName, Component> = {
  login: LoginPage,
  overview: OverviewPage,
  scenic: ScenicContentPage,
  articles: ArticlesPage,
  "article-new": ArticleEditPage,
  "article-edit": ArticleEditPage,
  pois: PoisPage,
  "poi-edit": PoiEditPage,
  notices: NoticesPage,
  orders: OrdersPage,
  slots: SlotsPage,
  facilities: FacilitiesPage,
  inspections: InspectionsPage,
  alerts: AlertsPage,
  oa: OAPage,
  audit: AuditPage,
  users: UsersPage,
  "staff-users": UsersPage,
  chat: ChatPage,
  knowledge: KnowledgePage,
  "service-status": ServiceStatusPage,
  "not-found": NotFoundPage,
};

const activeComponent = computed(() => pageComponents[route.value.name]);

const recordItems: RecordRackGroup[] = sidebarGroups.map(group => ({
  id: group.items[0].name,
  label: group.title,
  items: group.items.map(item => ({ id: item.name, label: item.label, href: linkTo(item.path) })),
}));
const activeRecordId = computed(() => {
  if (route.value.name === "article-new" || route.value.name === "article-edit") return "articles";
  if (route.value.name === "poi-edit") return "pois";
  return route.value.name;
});
function activateRecord({ itemId }: RackActivation): void {
  const item = recordItems.flatMap(group => group.items).find(item => item.id === itemId);
  // 与原侧栏锚点走同一条 hashchange 守卫，确认离开后才更新选中唱片。
  if (item?.href && !confirmRequest.value) window.location.hash = item.href;
}


async function refreshSession(reason?: string): Promise<void> {
  const result = await getMe();
  if (result.ok) {
    session.value = result.data;
    return;
  }
  session.value = null;
  if (reason) expiredMessage.value = reason;
}

/** 未登录、过期或游客身份访问业务页：回到登录页并带上原地址。 */
function enforceAuthRoute(): void {
  if (session.value) return;
  const current = currentHashPath();
  if (resolveRoute(current).name === "login") return;
  expiredMessage.value = expiredMessage.value ?? "未登录或登录会话已过期，登录后返回原页面。";
  setHash(`/login?redirect=${encodeURIComponent(current)}`, true);
}

function onHashChange(): void {
  if (!session.value) {
    enforceAuthRoute();
    return;
  }
  if (session.value.expiresAt <= Date.now()) {
    currentSession(); // 同时清除服务层与持久化的过期会话
    resolveConfirm(false);
    session.value = null;
    expiredMessage.value = "登录会话已超过 7 天有效期，请重新登录；已保存的业务数据不会丢失。";
    pushToast("info", "登录会话已过期，已返回登录页。");
    enforceAuthRoute();
  }
}

watch(() => session.value?.expiresAt, (expiresAt) => {
  window.clearTimeout(expiryTimer);
  if (expiresAt !== undefined) expiryTimer = window.setTimeout(onHashChange, Math.max(0, expiresAt - Date.now()));
});

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!unsavedSummary()) return;
  event.preventDefault();
  event.returnValue = "";
}

async function handleLogout(): Promise<void> {
  const draft = unsavedSummary();
  const confirmed = await askConfirm({
    title: "退出登录",
    message: draft
      ? `${draft} 退出登录会一并放弃这些未保存的修改。`
      : "退出后需要重新登录才能访问业务页面，已保存的业务数据不会丢失。",
    details: draft ? ["已保存的业务数据不会丢失。"] : [],
    confirmText: "退出",
    danger: Boolean(draft),
  });
  if (!confirmed) return;
  await logout();
  session.value = null;
  setHash("/login");
}

let removeDirtyGuard: (() => void) | null = null;
function noDirty(): void {
  removeDirtyGuard?.();
  removeDirtyGuard = null;
}
const showShell = computed(() => Boolean(session.value) && route.value.name !== "login");

let removeRuntimeListener: (() => void) | undefined;

onMounted(async () => {
  const info = bootstrap();
  runtimeMessage.value = info.message;
  removeRuntimeListener = subscribeRuntime((next) => { runtimeMessage.value = next.message;if(runtimeRun.value&&runtimeRun.value!==next.runId)pushToast("info","展示运行已切换，请重新打开记录后操作。");runtimeRun.value=next.runId; });
  bootstrapSession();
  await refreshSession();
  enforceAuthRoute();
  ready.value = true;
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("focus", onHashChange);
  document.addEventListener("visibilitychange", onHashChange);
  window.addEventListener("beforeunload", beforeUnload);
});

onBeforeUnmount(() => {
  window.clearTimeout(expiryTimer);
  window.removeEventListener("focus", onHashChange);
  document.removeEventListener("visibilitychange", onHashChange);
  removeRuntimeListener?.();
  window.removeEventListener("hashchange", onHashChange);
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>

<template>
  <ContourBackground class="admin-background" :theme="adminTheme" :background-color="adminTheme === 'dark' ? '#101c1a' : undefined" :line-color="adminTheme === 'dark' ? '#b4d4c9' : undefined" :line-opacity="adminTheme === 'dark' ? 0.055 : undefined" aria-hidden="true" />

  <div v-if="!ready" class="async-state" style="min-height: 60vh">
    <span class="spinner" aria-hidden="true" />
    <span>正在加载后台…</span>
  </div>

  <div v-else-if="!showShell" class="login-page">
    <div class="login-appearance"><ThemeToggle /><ThemeSelect /></div>
    <component :is="activeComponent" :expired-message="expiredMessage" />
  </div>

  <div v-else class="admin-shell" :class="{ 'admin-shell--flow': !'overview scenic service-status not-found'.split(' ').includes(route.name), 'admin-shell--compact-navigation': ['scenic', 'service-status'].includes(route.name) }">
    <RecordRackNav
      class="admin-record-rack"
      :items="recordItems"
      :active-id="activeRecordId"
      title="青岚山境"
      aria-label="后台主导航"
      :layout="{ size: 260, retreat: 96, spacing: 48, edge: 4, fill: true, zIndex: 40 }"
      :theme="recordTheme"
      @activate="activateRecord"
    ><template #title><span class="admin-rack-brand"><ScenicLogo :size="28" decorative /><span>青岚山境</span></span></template></RecordRackNav>

    <div class="admin-main">
      <header class="admin-header">
        <select v-if="['scenic', 'service-status'].includes(route.name)" class="select admin-compact-navigation" aria-label="页面导航" :value="route.path" @change="setHash(($event.target as HTMLSelectElement).value)">
          <optgroup v-for="group in sidebarGroups" :key="group.title" :label="group.title">
            <option v-for="item in group.items" :key="item.name" :value="item.path">{{ item.label }}</option>
          </optgroup>
        </select>
        <nav class="admin-header__breadcrumb" aria-label="当前位置">
          <ScenicLogo :size="28" /> <span>管理中心</span><span aria-hidden="true">/</span><span aria-current="page">{{ route.label }}</span>
        </nav>
        <div class="admin-header__meta">
          <ThemeToggle />
          <details class="admin-account" @keydown.esc="($event.currentTarget as HTMLDetailsElement).open = false">
            <LiquidGlassSurface as="summary" :radius="14" :tint-opacity="0.08" aria-label="账号操作"><UserRound :size="18" aria-hidden="true" /><span>{{ session?.nickname }}</span><ChevronDown :size="16" aria-hidden="true" /></LiquidGlassSurface>
            <LiquidGlassSurface class="admin-account__menu" :radius="16" :blur="8" :tint-opacity="0.94">
              <ThemeSelect />

            </LiquidGlassSurface>
          </details>
          <LiquidGlassButton variant="transparent" class="admin-header__logout" type="button" @click="handleLogout"><LogOut :size="18" aria-hidden="true" />退出</LiquidGlassButton>
        </div>
      </header>

      <main class="admin-content">
        <p v-if="runtimeMessage" class="form-error-banner" role="status">{{ runtimeMessage }}</p>
        <component :is="activeComponent" :key="route.path+runtimeRun" />
      </main>
    </div>
  </div>

  <ToastHost />
  <ConfirmHost :request="confirmRequest" />
</template>

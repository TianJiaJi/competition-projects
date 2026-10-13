<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from "vue";
import {
  askConfirm,
  currentHashPath,
  pushToast,
  runtimeMessage,
  session,
  setHash,
  unsavedSummary,
} from "./app/state";
import { businessTimeLabel } from "./app/format";
import { linkTo, resolveRoute, sidebarGroups, useRoute, type RouteName } from "./router";
import { getMe, logout } from "./services/auth";
import { bootstrap, bootstrapSession, resetSample } from "./services/store";
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
import AlertsPage from "./pages/AlertsPage.vue";
import UsersPage from "./pages/UsersPage.vue";
import ChatPage from "./pages/ChatPage.vue";
import KnowledgePage from "./pages/KnowledgePage.vue";
import ServiceStatusPage from "./pages/ServiceStatusPage.vue";
import NotFoundPage from "./pages/NotFoundPage.vue";

const route = useRoute();
const ready = ref(false);
const expiredMessage = ref<string | null>(null);
let lastPath = currentHashPath();

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
  users: UsersPage,
  chat: ChatPage,
  knowledge: KnowledgePage,
  "service-status": ServiceStatusPage,
  "not-found": NotFoundPage,
};

const activeComponent = computed(() => pageComponents[route.value.name]);

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
  expiredMessage.value = expiredMessage.value ?? "未登录或模拟会话已过期，登录后返回原页面。";
  setHash(`/login?redirect=${encodeURIComponent(current)}`, true);
}

function onHashChange(): void {
  const path = currentHashPath();
  lastPath = path;
  if (!session.value) {
    enforceAuthRoute();
    return;
  }
  if (session.value.expiresAt <= Date.now()) {
    session.value = null;
    expiredMessage.value = "模拟会话已超过 12 小时有效期，请重新登录；已保存的业务数据不会丢失。";
    pushToast("info", "模拟会话已过期，已返回登录页。");
    enforceAuthRoute();
  }
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!unsavedSummary()) return;
  event.preventDefault();
  event.returnValue = "";
}

async function handleReset(): Promise<void> {
  const confirmed = await askConfirm({
    title: "恢复本地样例",
    message: "将清理并重新建立本期后台业务状态与界面缓存，保留当前员工会话。",
    details: ["不触碰游客端与园方端的数据，也不会调用 localStorage.clear()"],
    confirmText: "恢复样例",
    danger: true,
  });
  if (!confirmed) return;
  const result = resetSample();
  if (!result.ok) {
    pushToast("error", result.error.message);
    return;
  }
  pushToast("success", "已恢复本地样例数据。");
  setHash("/overview");
  window.location.reload();
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

onMounted(async () => {
  const info = bootstrap();
  runtimeMessage.value = info.message;
  bootstrapSession();
  await refreshSession();
  enforceAuthRoute();
  ready.value = true;
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("beforeunload", beforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener("hashchange", onHashChange);
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>

<template>
  <div v-if="!ready" class="async-state" style="min-height: 60vh">
    <span class="spinner" aria-hidden="true" />
    <span>正在初始化后台样例…</span>
  </div>

  <div v-else-if="!showShell" class="login-page">
    <component :is="activeComponent" :expired-message="expiredMessage" />
  </div>

  <div v-else class="admin-shell">
    <nav class="admin-sidebar" aria-label="后台主导航">
      <div class="admin-brand">
        <div>
          <strong>青岚山境</strong>
          <span>后台管理 · 本地 Mock 原型</span>
        </div>
      </div>
      <div v-for="group in sidebarGroups" :key="group.title" class="admin-nav-group">
        <p>{{ group.title }}</p>
        <a
          v-for="item in group.items"
          :key="item.path"
          class="admin-nav-link"
          :href="linkTo(item.path)"
          :aria-current="route.name === item.name || (item.name === 'articles' && route.name.startsWith('article')) || (item.name === 'pois' && route.name === 'poi-edit') ? 'page' : undefined"
        >
          {{ item.label }}
        </a>
      </div>
    </nav>

    <div class="admin-main">
      <header class="admin-header">
        <span class="admin-header__title">{{ route.label }}</span>
        <div class="admin-header__meta">
          <span class="tag tag--info">本地 Mock</span>
          <span class="tag num" :title="'固定业务时间'">业务时间 {{ businessTimeLabel() }}</span>
          <span class="muted small">{{ session?.nickname }}（{{ session?.username }}）</span>
          <details style="position: relative">
            <summary class="btn btn--sm" style="list-style: none; display: inline-flex">更多</summary>
            <div class="panel" style="position: absolute; right: 0; top: 40px; z-index: 40; min-width: 220px">
              <button class="btn btn--sm" type="button" style="width: 100%" @click="handleReset">恢复样例</button>
              <p class="inline-note" style="margin: 8px 0 0">
                仅重置后台命名空间；按时间由业务时间推进，此处不提供演示控制台。
              </p>
            </div>
          </details>
          <button class="btn btn--sm" type="button" @click="handleLogout">退出</button>
        </div>
      </header>

      <main class="admin-content">
        <p v-if="runtimeMessage" class="form-error-banner" role="status">{{ runtimeMessage }}</p>
        <component :is="activeComponent" :key="route.path" />
      </main>
    </div>
  </div>

  <ToastHost />
  <ConfirmHost :request="confirmRequest" />
</template>

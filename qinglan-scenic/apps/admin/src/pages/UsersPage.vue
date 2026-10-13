<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { api } from "../services/store";
import { useRoute } from "../router";
import { useLiveRefresh } from "../app/live-refresh";
import { askConfirm, pushToast } from "../app/state";
import FlowPage from "../components/FlowPage.vue";
import FlowPanel from "../components/FlowPanel.vue";
import PageHeader from "../components/PageHeader.vue";
import AdminButton from "../components/AdminButton.vue";
import DrawerPanel from "../components/DrawerPanel.vue";
interface Person {
  id: string;
  username: string;
  name: string;
  role: string;
  disabled: boolean;
  archived?: boolean;
  version: number;
  tradeIds: string[];
  regionIds: string[];
}
interface Trade {
  id: string;
  name: string;
  archived?: boolean;
  version: number;
}
const route = useRoute(),
  staff = computed(() => route.value.name === "staff-users");
const items = ref<Person[]>([]),
  trades = ref<Trade[]>([]),
  keyword = ref(""),
  error = ref(""),
  formError = ref(""),
  busy = ref(false),
  open = ref(false),
  secret = ref(""),
  activity = ref<any[] | null>(null),
  activityName = ref(""),
  tradeName = ref(""),
  editorTradeName = ref(""),
  tradeError = ref(""),
  editorTradeError = ref(""),
  tradeNotice = ref("");
const form = reactive({
  id: "",
  username: "",
  name: "",
  disabled: false,
  version: 1,
  tradeIds: [] as string[],
  regionIds: [] as string[],
});
const rows = computed(() =>
  items.value.filter(
    (p) =>
      p.role === (staff.value ? "staff" : "visitor") &&
      `${p.name} ${p.username} ${p.id}`
        .toLowerCase()
        .includes(keyword.value.toLowerCase()),
  ),
);
async function load() {
  try {
    const r = await api.request<{ items: Person[]; trades: Trade[] }>(
      "/admin/people",
    );
    items.value = r.items;
    trades.value = r.trades;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function edit(p?: Person) {
  Object.assign(
    form,
    p
      ? { ...p, tradeIds: [...p.tradeIds], regionIds: [...p.regionIds] }
      : {
          id: "",
          username: "",
          name: "",
          disabled: false,
          version: 1,
          tradeIds: [],
          regionIds: [],
        },
  );
  error.value = "";
  formError.value = "";
  editorTradeError.value = "";
  editorTradeName.value = "";
  tradeNotice.value = "";
  open.value = true;
}
async function execute(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function save() {
  if (busy.value) return;
  formError.value = "";
  if (staff.value && !form.tradeIds.length) {
    formError.value = "请至少选择一个工种";
    return;
  }
  if (staff.value && !form.regionIds.length) {
    formError.value = "请至少选择一个负责区域";
    return;
  }
  void (async () => {
    busy.value = true;
    try {
      const r = await api.request<any>(
        "/admin/people" + (form.id ? "/" + form.id : ""),
        "POST",
        {
          ...form,
          username: form.username.trim(),
          name: form.name.trim(),
          role: staff.value ? "staff" : "visitor",
          expectedVersion: form.version,
        },
      );
      await load();
      open.value = false;
      secret.value = r.temporaryPassword || "";
      pushToast("success", "账号已保存");
    } catch (e) {
      formError.value = (e as Error).message;
    } finally {
      busy.value = false;
    }
  })();
}
async function archive(p: Person) {
  if (
    !(await askConfirm({
      title: "归档账号",
      message: `归档 ${p.name} 后将无法登录，关联历史保留。`,
      confirmText: "归档",
      danger: true,
    }))
  )
    return;
  void execute(async () => {
    await api.request("/admin/people/" + p.id + "/archive", "POST", {
      expectedVersion: p.version,
    });
  });
}
function resetPassword(p: Person) {
  void execute(async () => {
    const r = await api.request<any>(
      "/admin/people/" + p.id + "/reset-password",
      "POST",
      { expectedVersion: p.version },
    );
    secret.value = r.temporaryPassword;
  });
}
function detail(p: Person) {
  void execute(async () => {
    const r = await api.request<any>("/admin/people/" + p.id + "/activity");
    activity.value = r.items;
    activityName.value = p.name;
  });
}
async function addTrade(inEditor = false) {
  if (busy.value) return;
  const nameField = inEditor ? editorTradeName : tradeName;
  const errorField = inEditor ? editorTradeError : tradeError;
  const name = nameField.value.trim();
  errorField.value = "";
  tradeNotice.value = "";
  if (!name) {
    errorField.value = "请输入工种名称";
    return;
  }
  if (trades.value.some((item) => !item.archived && item.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0)) {
    errorField.value = "该工种已存在，请直接在上方选择";
    return;
  }
  busy.value = true;
  try {
    const created = await api.request<Trade>("/admin/staff-trades", "POST", { name });
    await load();
    nameField.value = "";
    if (inEditor) {
      form.tradeIds.push(created.id);
      tradeNotice.value = `已添加并选中「${created.name}」`;
    } else {
      tradeNotice.value = `已添加工种「${created.name}」`;
    }
  } catch (e) {
    errorField.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onMounted(load);
useLiveRefresh(load);
</script>
<template>
  <FlowPage
    ><PageHeader :title="staff ? '员工管理' : '游客管理'" :description="staff ? '管理员工账号、工种和负责区域。' : '管理游客账号并查看关联活动。'">
      <template #actions><AdminButton variant="primary" @click="edit()">创建账号</AdminButton></template>
    </PageHeader><FlowPanel class="people-panel"
      ><div class="people-toolbar">
        <input
          class="input"
          v-model="keyword"
          placeholder="搜索名称、账号或 ID"
          aria-label="搜索账号"
        /><span class="muted small">共 {{ rows.length }} 个账号</span>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="people-table">
        <table>
          <thead>
            <tr>
              <th>名称 / 账号</th>
              <th v-if="staff">工种 / 区域</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in rows" :key="p.id">
              <td>
                {{ p.name }}
                <div class="muted">{{ p.username }}</div>
              </td>
              <td v-if="staff">
                {{
                  p.tradeIds
                    .map((id) => trades.find((t) => t.id === id)?.name || id)
                    .join("、")
                }}
                <div>{{ p.regionIds.join("、") }}</div>
              </td>
              <td>
                {{ p.archived ? "已归档" : p.disabled ? "已禁用" : "正常" }}
              </td>
              <td>
                <div class="btn-group">
                  <AdminButton size="sm" @click="detail(p)">活动详情</AdminButton
                  ><template v-if="!p.archived"
                    ><AdminButton size="sm" @click="edit(p)">编辑</AdminButton
                    ><AdminButton size="sm" :disabled="busy" @click="resetPassword(p)"
                      >重置密码</AdminButton
                    ><AdminButton size="sm" :disabled="busy" @click="archive(p)"
                      >归档</AdminButton
                    ></template
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!rows.length">没有匹配的账号。</p>
      </div></FlowPanel
    ><FlowPanel v-if="staff" class="people-trades"
      ><h2>自定义工种</h2>
      <p class="muted small">{{ trades.filter((t) => !t.archived).map((t) => t.name).join("、") || "暂无工种" }}</p>
      <form class="people-trades__form" @submit.prevent="addTrade(false)">
        <input
          class="input"
          v-model="tradeName"
          placeholder="新工种名称"
          aria-label="新工种名称"
          :aria-invalid="!!tradeError"
          maxlength="30"
        /><AdminButton type="submit" :disabled="busy || !tradeName.trim()"
          >添加工种</AdminButton
        >
      </form>
      <p v-if="tradeError" class="form-error-banner" role="alert">{{ tradeError }}</p>
      <p v-if="tradeNotice && !open" class="people-trades__notice" role="status">{{ tradeNotice }}</p>
    </FlowPanel
    >
    <DrawerPanel
      v-if="open"
      :title="form.id ? '编辑账号' : '创建账号'"
      :subtitle="staff ? '设置员工身份、职责和负责区域' : '管理游客登录资料与账号状态'"
      @close="open = false"
      ><form id="person-form" class="person-form" @submit.prevent="save">
        <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>
        <section class="person-section" aria-labelledby="person-identity-title">
          <div class="person-section__heading">
            <span class="person-section__index">01</span>
            <div><h3 id="person-identity-title">基本信息</h3><p>用于登录和显示在业务记录中</p></div>
          </div>
          <label class="person-field"
          ><span>登录账号 <small>3—32 位，以字母开头</small></span><input
            class="input"
            v-model="form.username"
            required
            autocomplete="off"
            pattern="[a-zA-Z][a-zA-Z0-9_]{2,31}" /></label
          ><label class="person-field"
          ><span>显示名称 <small>员工或游客看到的名称</small></span><input
            class="input"
            v-model="form.name"
            required
            maxlength="30" /></label>
        </section>
        <section v-if="staff" class="person-section" aria-labelledby="person-duties-title">
          <div class="person-section__heading">
            <span class="person-section__index">02</span>
            <div><h3 id="person-duties-title">岗位职责</h3><p>工种和负责区域均至少选择一项</p></div>
          </div>
          <fieldset class="person-choices">
            <legend>工种 <small>已选 {{ form.tradeIds.length }} 项</small></legend>
            <div class="person-choices__grid">
              <label class="person-choice" v-for="t in trades.filter((t) => !t.archived)" :key="t.id"
                ><input type="checkbox" v-model="form.tradeIds" :value="t.id" /><span>{{ t.name }}</span></label>
            </div>
            <div class="person-add-trade">
              <label for="person-new-trade">添加新工种</label>
              <p>新增成功后自动选中，可直接用于当前员工。</p>
              <div class="person-add-trade__row">
                <input id="person-new-trade" class="input" v-model="editorTradeName" :aria-invalid="!!editorTradeError" maxlength="30" placeholder="输入新工种名称" />
                <AdminButton :disabled="busy || !editorTradeName.trim()" @click="addTrade(true)">新增工种</AdminButton>
              </div>
              <p v-if="editorTradeError" class="form-error-banner" role="alert">{{ editorTradeError }}</p>
              <p v-if="tradeNotice && open" class="people-trades__notice" role="status">{{ tradeNotice }}</p>
            </div>
          </fieldset>
          <fieldset class="person-choices">
            <legend>负责区域 <small>已选 {{ form.regionIds.length }} 项</small></legend>
            <div class="person-choices__grid person-choices__grid--regions">
              <label class="person-choice" v-for="i in 9" :key="i"
                ><input
                type="checkbox"
                v-model="form.regionIds"
                :value="'Z' + (i - 1)"
              /><span>区域 Z{{ i - 1 }}</span></label>
            </div>
          </fieldset>
        </section>
        <section v-if="form.id" class="person-section" aria-labelledby="person-status-title">
          <div class="person-section__heading">
            <span class="person-section__index">{{ staff ? '03' : '02' }}</span>
            <div><h3 id="person-status-title">账号状态</h3><p>禁用后该账号将无法继续登录</p></div>
          </div>
          <label class="person-status"><span><strong>禁用账号</strong><small>保留历史记录和关联数据</small></span><input type="checkbox" v-model="form.disabled" /></label>
        </section>
      </form>
      <template #footer
        ><div class="person-footer"><span>{{ form.id ? '修改保存后立即生效' : '创建后生成一次性临时密码' }}</span><div class="person-footer__actions"><AdminButton @click="open = false">取消</AdminButton><AdminButton variant="primary" type="submit" form="person-form" :disabled="busy" :loading="busy">保存账号</AdminButton></div></div></template
      ></DrawerPanel
    >
    <DrawerPanel v-if="secret" title="临时密码" @close="secret = ''"
      ><p>此密码仅展示本次。请妥善交给账号本人，首次登录必须修改。</p>
      <code class="temporary-password">{{ secret }}</code
      ><template #footer
        ><AdminButton @click="secret = ''">已保存，关闭</AdminButton></template
      ></DrawerPanel
    >
    <DrawerPanel
      v-if="activity"
      :title="activityName + ' · 活动记录'"
      @close="activity = null"
      ><p v-if="!activity.length">当前运行暂无活动记录。</p>
      <article v-for="a in activity" :key="a.id">
        <strong>{{ a.type }}</strong>
        <p class="muted">{{ a.at }}</p>
        <p>
          {{
            typeof a.detail === "string" ? a.detail : JSON.stringify(a.detail)
          }}
        </p>
      </article></DrawerPanel
    >
  </FlowPage>
</template>
<style scoped>
.people-panel { gap: 16px; }
.people-toolbar { display: flex; align-items: center; gap: 16px; }
.people-toolbar .input { min-width: 0; flex: 1; }
.people-toolbar .small { white-space: nowrap; }
.people-table {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.people-trades { flex: none; gap: 8px; }
.people-trades h2 { font-size: 1.05rem; }
.people-trades p { margin: 0; }
.people-trades__form { display: flex; align-items: center; gap: 10px; }
.people-trades__form .input { width: min(380px, 100%); }
.people-trades__notice { color: var(--admin-success); font-size: var(--admin-font-small); }
table {
  width: 100%;
  border-collapse: collapse;
}
td,
th {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid var(--border, #ddd);
}
th { position: sticky; top: 0; background: var(--admin-surface-strong, #fff); z-index: 1; }
td .btn-group { flex-wrap: nowrap; }
.person-form { display: grid; gap: 22px; padding-bottom: 4px; }
.person-form > .form-error-banner { position: sticky; top: 0; z-index: 2; margin: 0; }
.person-section { display: grid; gap: 16px; padding: 18px; border: 1px solid var(--admin-line); border-radius: 18px; background: var(--admin-surface-strong); }
.person-section__heading { display: flex; align-items: flex-start; gap: 12px; }
.person-section__index { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 10px; background: var(--admin-success-bg); color: var(--admin-success); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.person-section__heading h3 { font-size: 18px; line-height: 1.3; }
.person-section__heading p { margin: 3px 0 0; color: var(--muted); font-size: 13px; }
.person-field { display: grid; gap: 7px; font-size: 14px; font-weight: 600; }
.person-field > span { display: flex; justify-content: space-between; gap: 10px; }
.person-field small, .person-choices legend small { color: var(--muted); font-size: 12px; font-weight: 400; }
.person-field .input { width: 100%; min-height: 44px; background: var(--surface, #f8fcfa); }
.person-choices { display: grid; gap: 12px; min-width: 0; margin: 0; padding: 0; border: 0; }
.person-choices legend { width: 100%; padding: 0 0 10px; font-size: 14px; font-weight: 600; }
.person-choices legend small { margin-left: 8px; }
.person-choices__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.person-choices__grid--regions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.person-choice { display: flex; align-items: center; gap: 9px; min-height: 44px; min-width: 0; padding: 8px 11px; border: 1px solid var(--admin-line); border-radius: 11px; background: var(--surface, #f8fcfa); font-size: 14px; cursor: pointer; transition: border-color .15s, background-color .15s; }
.person-choice:hover { border-color: var(--admin-focus); }
.person-choice:has(input:checked) { border-color: var(--admin-focus); background: var(--admin-success-bg); color: var(--admin-success); font-weight: 600; }
.person-choice:focus-within { outline: 2px solid var(--admin-focus); outline-offset: 2px; }
.person-choice input { flex: none; width: 16px; height: 16px; margin: 0; accent-color: var(--admin-focus); }
.person-choice span { overflow-wrap: anywhere; }
.person-add-trade { display: grid; gap: 7px; margin-top: 2px; padding: 13px; border: 1px dashed var(--admin-line-strong); border-radius: 12px; background: var(--surface, #f8fcfa); }
.person-add-trade > label { font-size: 14px; font-weight: 600; }
.person-add-trade > p { margin: 0; color: var(--muted); font-size: 12px; }
.person-add-trade__row { display: flex; gap: 8px; }
.person-add-trade__row .input { min-width: 0; flex: 1; }
.person-add-trade__row .btn { flex: none; }
.person-add-trade .form-error-banner { color: var(--admin-danger); }
.person-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--admin-line); border-radius: 11px; cursor: pointer; }
.person-status span { display: grid; gap: 2px; }
.person-status strong { font-size: 14px; }
.person-status small { color: var(--muted); font-size: 12px; }
.person-status input { width: 18px; height: 18px; accent-color: var(--admin-focus); }
.person-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; }
.person-footer > span { color: var(--muted); font-size: 12px; }
.person-footer__actions { display: flex; gap: 8px; }
.person-footer__actions .btn { min-width: 88px; }
.temporary-password {
  font-size: 24px;
  user-select: all;
}
article {
  border-bottom: 1px solid #ddd;
  padding: 12px 0;
}
@media (max-width: 900px) { td .btn-group { flex-wrap: wrap; } }
@media (max-width: 650px) { .people-toolbar, .people-trades__form { flex-wrap: wrap; } .people-table table { min-width: 720px; } .person-section { padding: 14px; } .person-choices__grid--regions { grid-template-columns: repeat(2, minmax(0, 1fr)); } .person-footer > span { display: none; } .person-footer__actions { width: 100%; justify-content: flex-end; } }
@media (max-width: 420px) { .person-choices__grid { grid-template-columns: 1fr; } .person-add-trade__row { flex-wrap: wrap; } .person-add-trade__row .btn { width: 100%; } }
</style>

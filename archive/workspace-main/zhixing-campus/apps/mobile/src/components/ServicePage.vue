<script setup lang="ts">
import { computed, reactive, ref, onBeforeUnmount, onMounted } from "vue";
import type { LinkedRecord } from "../../../../packages/demo/src/builder/types";
import Icon from "./Icon.vue";
import {
  state,
  scenario,
  themeStyle,
  selection,
  preview,
  previewStatus,
  previewClient,
} from "../store";
import { navigate, home, back, notify } from "../platform";
import {
  createRecord,
  validateRecord,
  answerQuestion,
  type Collection,
  type RecordItem,
} from "@scene/domain";
// #ifdef H5
import { enhanceH5Accessibility } from "../platform";
let stopAccessibility: (() => void) | undefined;
onMounted(() => {
  stopAccessibility = enhanceH5Accessibility();
});
onBeforeUnmount(() => stopAccessibility?.());
// #endif
function fieldValue(event: unknown): string {
  const field = event as {
    detail?: { value?: unknown };
    target?: { value?: unknown };
  };
  return String(field.detail?.value ?? field.target?.value ?? "");
}
const props = defineProps<{ page: string }>();
const query = ref("");
const form = reactive({
  facility: 0,
  title: "",
  location: preview.enabled ? state.records.facilities[0]?.location || "" : "",
  description: "",
  contact: "",
  date: "2026-09-25",
  time: "09:00–10:00",
  count: "1",
  venue: Math.max(
    0,
    state.records.facilities
      .filter((r) => r.capacity && r.status === "正常")
      .findIndex((r) => r.id === selection.id),
  ),
});
const error = ref("");
const login = reactive({ username: "user01", password: "123456" });
const titles: Record<string, string> = {
  home: scenario.name,
  services: scenario.labels.facilities,
  repair: "报修服务",
  visitors: "访客登记",
  booking: scenario.labels.bookings,
  notices: "公告消息",
  me: "我的",
  assistant: "服务助手",
  detail: "服务详情",
  login: `${scenario.person}登录`,
  records: "我的服务记录",
};
const title = computed(() => titles[props.page] ?? "服务");
const detail = computed(() =>
  state.records[selection.collection as Collection]?.find(
    (r) => r.id === selection.id,
  ),
);
const facilities = computed(() =>
  state.records.facilities.filter((r) =>
    `${r.title}${r.location}`.includes(query.value),
  ),
);
const venues = computed(() =>
  state.records.facilities.filter((r) => r.capacity && r.status === "正常"),
);
const records = computed(() =>
  [
    ...state.records.tasks,
    ...state.records.bookings,
    ...state.records.visitors,
  ].filter((r) =>
    preview.enabled
      ? (r as LinkedRecord).submitterId === "user01" && !!state.identity
      : r.owner === state.identity,
  ),
);
const nav = [
  { page: "home", label: "首页", icon: "house" },
  { page: "services", label: "服务", icon: "map-pin" },
  { page: "booking", label: "预约", icon: "calendar-days" },
  { page: "me", label: "我的", icon: "user-round" },
];
function open(collection: Collection, item: RecordItem) {
  selection.collection = collection;
  selection.id = item.id;
  navigate("detail");
}
function auth() {
  if (state.identity) return true;
  navigate("login");
  return false;
}
const signingIn = ref(false);
async function signIn() {
  if (previewClient) {
    if (signingIn.value) return;
    signingIn.value = true;
    try {
      await previewClient.login(login.username, login.password);
      error.value = "";
      notify("登录成功");
      back();
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      signingIn.value = false;
    }
    return;
  }
  if (login.username !== "user01" || login.password !== "123456") {
    error.value = "请使用演示账号 user01 / 123456";
    return;
  }
  state.identity = "林悦";
  notify("登录成功");
  back();
}
const submitting = ref(false);
async function write(collection: Collection, input: Omit<LinkedRecord, "id">) {
  if (previewClient)
    await previewClient.write(collection, undefined, "save", input);
  else createRecord(state, collection, input);
}
async function cancelBooking(item: RecordItem) {
  if (submitting.value) return;
  submitting.value = true;
  try {
    if (previewClient) await previewClient.write("bookings", item.id, "cancel");
    else item.status = "已取消";
    notify("预约已取消");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    submitting.value = false;
  }
}
async function logout() {
  try {
    if (previewClient) await previewClient.logout();
    else state.identity = null;
    notify("已退出登录");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function submit() {
  if (submitting.value || previewStatus.fatal) return;
  submitting.value = true;
  try {
    await submitForm();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    submitting.value = false;
  }
}
async function submitForm() {
  if (!auth()) return;
  error.value = "";
  if (props.page === "booking") {
    const venue = venues.value[form.venue];
    if (!venue) {
      error.value = "请选择可预约空间";
      return;
    }
    if (
      !/^\d+$/.test(form.count) ||
      +form.count < 1 ||
      +form.count > (venue.capacity ?? 1)
    ) {
      error.value = `使用人数应为 1–${venue.capacity}`;
      return;
    }
    if (!form.date || form.date < "2026-09-25") {
      error.value = "请选择9月25日或之后的日期";
      return;
    }
    if (!form.description.trim()) {
      error.value = "请填写使用说明";
      return;
    }
    await write("bookings", {
      facilityId: venue.id,
      buildingId: (venue as LinkedRecord).buildingId,
      timeSlot: form.time,
      count: +form.count,
      title: `${venue.title}预约`,
      location: venue.title,
      description: `${form.date} ${form.time}，${form.count}人。${form.description}`,
      category: venue.category,
      status: "已预约",
      date: form.date,
      owner: state.identity!,
    });
  } else {
    error.value = validateRecord(
      form.title,
      form.location,
      form.description,
      props.page === "visitors" ? form.contact : "",
    );
    if (props.page === "visitors" && !form.contact)
      error.value = "请填写访客联系电话";
    if (error.value) return;
    const facility = state.records.facilities[form.facility] as
      | LinkedRecord
      | undefined;
    if (preview.enabled && props.page === "repair" && !facility) {
      error.value = "请选择关联设施";
      return;
    }
    await write(props.page === "repair" ? "tasks" : "visitors", {
      ...(preview.enabled && props.page === "repair"
        ? { facilityId: facility!.id, buildingId: facility!.buildingId }
        : {}),
      title: form.title.trim(),
      location: form.location.trim(),
      description: form.description.trim(),
      contact: form.contact,
      date: form.date,
      category: props.page === "repair" ? "用户报修" : "亲友来访",
      status: props.page === "repair" ? "待处理" : "待到访",
      owner: state.identity!,
    });
  }
  form.title = "";
  form.description = "";
  notify("提交成功");
  navigate("records");
}
const input = ref(""),
  busy = ref(false);
const messages = ref([
  {
    role: "assistant",
    text: `你好，我是${scenario.name}服务助手。今天有什么可以帮你？`,
  },
]);
let timer: ReturnType<typeof setInterval> | undefined;
function ask(question = input.value) {
  if (busy.value || !question.trim()) return;
  messages.value.push({ role: "user", text: question });
  const answer = answerQuestion(question, scenario, state);
  messages.value.push({ role: "assistant", text: "" });
  const target = messages.value[messages.value.length - 1];
  input.value = "";
  busy.value = true;
  let i = 0;
  timer = setInterval(() => {
    target.text = answer.slice(0, (i += 2));
    if (i >= answer.length) {
      clearInterval(timer);
      busy.value = false;
    }
  }, 24);
}
onBeforeUnmount(() => clearInterval(timer));
</script>
<template>
  <view v-if="previewStatus.fatal" class="mobile-root"
    ><view class="mobile-form"
      ><text role="alert">{{ previewStatus.error }}</text
      ><a href="http://localhost:5506/">返回工作台</a></view
    ></view
  >
  <view v-else class="mobile-root" :style="themeStyle"
    ><view class="mobile-header"
      ><button
        role="button"
        v-if="!['home', 'services', 'booking', 'me'].includes(page)"
        class="back-button"
        aria-label="返回"
        @click="back"
      >
        ‹</button
      ><view
        ><text class="mobile-brand">{{ title }}</text
        ><text class="mobile-eyebrow">{{ scenario.english }}</text></view
      ><button
        v-if="preview.enabled"
        class="refresh-data"
        role="button"
        @click="previewClient?.refresh()"
      >
        刷新数据</button
      ><view class="weather" v-if="page === 'home'">晴 · 24°</view></view
    >
    <view v-if="previewStatus.error" class="preview-error" role="alert">{{
      previewStatus.error
    }}</view>
    <view
      v-if="error && !['repair', 'booking', 'login', 'visitors'].includes(page)"
      class="form-error"
      role="alert"
      >{{ error }}</view
    >
    <view class="mobile-content">
      <template v-if="page === 'home'"
        ><view class="mobile-hero"
          ><text class="overline">美好日常 · 从这里开始</text
          ><text class="hero-title">{{ scenario.tagline }}</text
          ><text class="hero-subtitle">{{ scenario.description }}</text
          ><view class="hero-art"
            ><view class="arch arch-one" /><view class="arch arch-two" /><view
              class="art-line"
            /><text>{{
              scenario.kind === "campus" ? "知 · 行" : "云 · 栖"
            }}</text></view
          ><button
            role="button"
            class="hero-link"
            @click="navigate('services')"
          >
            探索{{ scenario.location }}服务 ↗
          </button></view
        ><view class="section-title"
          ><text>生活服务</text
          ><text class="tiny muted">EVERYDAY SERVICES</text></view
        ><view class="quick-grid"
          ><button role="button" class="quick" @click="navigate('repair')">
            <view class="quick-symbol"
              ><Icon name="wrench" active :size="24" /></view
            ><text>报修服务</text></button
          ><button role="button" class="quick" @click="navigate('booking')">
            <view class="quick-symbol"
              ><Icon name="calendar-days" active :size="24" /></view
            ><text>空间预约</text></button
          ><button
            role="button"
            v-if="scenario.kind === 'community'"
            class="quick"
            @click="navigate('visitors')"
          >
            <view class="quick-symbol"
              ><Icon name="user-plus" active :size="24" /></view
            ><text>访客登记</text></button
          ><button
            role="button"
            v-else
            class="quick"
            @click="navigate('services')"
          >
            <view class="quick-symbol"
              ><Icon name="building-2" active :size="24" /></view
            ><text>楼宇服务</text></button
          ><button role="button" class="quick" @click="navigate('assistant')">
            <view class="quick-symbol"
              ><Icon name="sparkles" active :size="24" /></view
            ><text>AI 助手</text>
          </button></view
        ><view class="section-title"
          ><text>{{ scenario.location }}新鲜事</text
          ><button role="button" class="text-link" @click="navigate('notices')">
            全部 ↗
          </button></view
        ><view
          v-for="item in state.records.notices.slice(0, 2)"
          :key="item.id"
          class="notice-card"
          @click="open('notices', item)"
          ><text class="overline">{{ item.category }} · 09/25</text
          ><text class="card-title">{{ item.title }}</text
          ><text class="body-copy clamp">{{ item.description }}</text
          ><text class="notice-arrow">↗</text></view
        ></template
      >
      <template v-else-if="page === 'services'"
        ><view class="page-intro"
          ><text class="page-title">身边的好去处</text
          ><text class="body-copy">服务就在身边，发现更多日常可能。</text></view
        ><input
          v-model="query"
          class="mobile-input"
          placeholder="搜索设施或位置"
          aria-label="搜索设施"
          @blur="query = fieldValue($event)"
        /><view v-if="!facilities.length" class="empty-state"
          >没有匹配的设施</view
        ><view
          v-for="(item, i) in facilities"
          :key="item.id"
          class="service-card"
          @click="open('facilities', item)"
          ><view class="service-top"
            ><text class="serif-number">{{
              String(i + 1).padStart(2, "0")
            }}</text
            ><text
              :class="['status-pill', { warning: item.status !== '正常' }]"
              >{{ item.status }}</text
            ></view
          ><text class="card-title">{{ item.title }}</text
          ><text class="tiny muted"
            >{{ item.location }} · {{ item.category }}</text
          ><text class="body-copy">{{ item.description }}</text
          ><text class="service-footer">查看详情 ↗</text></view
        ></template
      >
      <template v-else-if="['repair', 'visitors', 'booking'].includes(page)"
        ><view class="page-intro"
          ><text class="page-title">{{
            page === "repair"
              ? "把小事，交给我们。"
              : page === "visitors"
                ? "让相见，更从容。"
                : "为热爱，留一个位置。"
          }}</text
          ><text class="body-copy">{{
            page === "repair"
              ? "填写问题与位置，我们会认真对待每一份反馈。"
              : page === "visitors"
                ? "提前登记来访信息，让亲友到访更加方便。"
                : "选择空间与时段，开启一段美好时光。"
          }}</text></view
        ><view
          v-if="!state.identity"
          class="signin-note"
          @click="navigate('login')"
          >登录后即可提交服务申请　→</view
        ><view class="mobile-form"
          ><template v-if="page === 'booking'"
            ><text class="field-label">预约空间</text
            ><picker
              :range="venues.map((r) => r.title)"
              :value="form.venue"
              @change="form.venue = Number($event.detail.value)"
              ><view class="picker-field"
                >{{ venues[form.venue]?.title ?? "暂无可预约空间" }}
                <text>⌄</text></view
              ></picker
            ><text class="field-label">预约日期</text
            ><picker
              mode="date"
              :value="form.date"
              start="2026-09-25"
              @change="form.date = fieldValue($event)"
              ><view class="picker-field"
                >{{ form.date }} <text>⌄</text></view
              ></picker
            ><text class="field-label">预约时段</text
            ><picker
              :range="['09:00–10:00', '14:00–15:00', '18:00–19:00']"
              @change="
                form.time = ['09:00–10:00', '14:00–15:00', '18:00–19:00'][
                  Number($event.detail.value)
                ]
              "
              ><view class="picker-field"
                >{{ form.time }} <text>⌄</text></view
              ></picker
            ><text class="field-label">使用人数</text
            ><input
              v-model="form.count"
              class="mobile-input"
              type="number"
              aria-label="使用人数"
              @blur="form.count = fieldValue($event)" /></template
          ><template v-else
            ><text class="field-label">{{
              page === "repair" ? "问题名称" : "访客姓名"
            }}</text
            ><picker
              v-if="preview.enabled && page === 'repair'"
              :range="state.records.facilities"
              range-key="title"
              :value="form.facility"
              @change="
                form.facility = +fieldValue($event);
                form.location =
                  state.records.facilities[form.facility]?.location || '';
              "
              ><view class="mobile-input" role="button" aria-label="关联设施"
                >关联设施：{{
                  state.records.facilities[form.facility]?.title || "请选择"
                }}
                ▾</view
              ></picker
            ><input
              v-model="form.title"
              class="mobile-input"
              :placeholder="
                page === 'repair' ? '例如：走廊照明不亮' : '请输入访客姓名'
              "
              aria-label="名称"
              :maxlength="50"
              @blur="form.title = fieldValue($event)" /><text
              class="field-label"
              >{{ page === "repair" ? "具体位置" : "到访位置" }}</text
            ><input
              v-model="form.location"
              class="mobile-input"
              placeholder="楼栋、楼层或公共空间"
              aria-label="位置"
              :maxlength="60"
              @blur="form.location = fieldValue($event)" /><template
              v-if="page === 'visitors'"
              ><text class="field-label">联系电话</text
              ><input
                v-model="form.contact"
                class="mobile-input"
                type="tel"
                :maxlength="11"
                aria-label="联系电话"
                @blur="
                  form.contact = fieldValue($event)
                " /></template></template
          ><text class="field-label">{{
            page === "booking" ? "使用说明" : "详细说明"
          }}</text
          ><textarea
            v-model="form.description"
            class="mobile-textarea"
            aria-label="详细说明"
            placeholder="请补充说明，方便我们提供服务"
            :maxlength="500"
            :adjust-position="true"
            @blur="form.description = fieldValue($event)"
          /><text v-if="error" class="form-error" role="alert">{{ error }}</text
          ><button
            role="button"
            class="primary-button"
            :disabled="submitting || (preview.enabled && !previewStatus.ready)"
            @click="submit"
          >
            {{ page === "booking" ? "确认预约" : "提交申请" }}　↗
          </button></view
        ></template
      >
      <template v-else-if="page === 'notices'"
        ><view class="page-intro"
          ><text class="page-title">每一条，都与你有关。</text
          ><text class="body-copy"
            >及时了解{{ scenario.location }}动态与服务通知。</text
          ></view
        ><view
          v-for="item in state.records.notices"
          :key="item.id"
          class="notice-card"
          @click="open('notices', item)"
          ><text class="overline">{{ item.category }} · {{ item.date }}</text
          ><text class="card-title">{{ item.title }}</text
          ><text class="body-copy clamp">{{ item.description }}</text
          ><text class="notice-arrow">↗</text></view
        ></template
      >
      <template v-else-if="page === 'me'"
        ><view class="profile-card"
          ><view class="avatar">{{
            state.identity ? (preview.enabled ? "师" : "悦") : "○"
          }}</view
          ><text class="page-title">{{
            state.identity ?? "欢迎来到" + scenario.name
          }}</text
          ><text class="body-copy">{{
            state.identity ? "让服务伴随每一天。" : "登录后享受身边的便捷服务。"
          }}</text
          ><button
            role="button"
            v-if="!state.identity"
            class="primary-button"
            @click="navigate('login')"
          >
            登录 / 进入
          </button></view
        ><view class="menu-list"
          ><button
            role="button"
            @click="state.identity ? navigate('records') : navigate('login')"
          >
            我的服务记录 <text>↗</text></button
          ><button role="button" @click="navigate('notices')">
            公告消息 <text>↗</text></button
          ><button role="button" @click="navigate('assistant')">
            服务助手 <text>↗</text></button
          ><button role="button" v-if="state.identity" @click="logout">
            退出登录 <text>↗</text>
          </button></view
        ></template
      >
      <template v-else-if="page === 'login'"
        ><view class="page-intro login-intro"
          ><text class="overline">WELCOME HOME</text
          ><text class="page-title">欢迎回来。</text
          ><text class="body-copy">在这里，连接属于你的日常。</text></view
        ><view class="mobile-form"
          ><text class="field-label">账号</text
          ><input
            v-model="login.username"
            aria-label="账号"
            class="mobile-input"
            @blur="login.username = fieldValue($event)"
          /><text class="field-label">密码</text
          ><input
            v-model="login.password"
            aria-label="密码"
            class="mobile-input"
            :password="true"
            @blur="login.password = fieldValue($event)"
          /><text v-if="error" class="form-error">{{ error }}</text
          ><button
            role="button"
            class="primary-button"
            :disabled="signingIn"
            @click="signIn"
          >
            登录</button
          ><text class="tiny muted centered"
            >演示账号 user01 / 123456</text
          ></view
        ></template
      >
      <template v-else-if="page === 'records'"
        ><view class="page-intro"
          ><text class="page-title">服务，有迹可循。</text
          ><text class="body-copy">查看本次使用中提交的申请与预约。</text></view
        ><view v-if="!records.length" class="empty-state"
          ><text>还没有服务记录</text
          ><button
            role="button"
            class="secondary-button"
            @click="navigate('repair')"
          >
            提交报修
          </button></view
        ><view v-for="item in records" :key="item.id" class="notice-card"
          ><text class="status-pill">{{ item.status }}</text
          ><text class="card-title">{{ item.title }}</text
          ><text class="tiny muted">{{ item.location }} · {{ item.date }}</text
          ><text class="body-copy">{{ item.description }}</text
          ><text v-if="item.result" class="body-copy"
            >处理结果：{{ item.result }}</text
          ><text
            v-if="preview.enabled && (item as LinkedRecord).assigneeId"
            class="tiny muted"
            >处理人：{{ (item as LinkedRecord).assigneeId }}</text
          ><button
            role="button"
            v-if="item.status === '已预约'"
            class="text-link cancel-booking"
            @click="cancelBooking(item)"
            :disabled="submitting"
          >
            取消预约
          </button></view
        ></template
      >
      <template v-else-if="page === 'detail'"
        ><template v-if="detail"
          ><view class="detail-hero"
            ><text class="overline">{{ detail.category }}</text
            ><text class="page-title">{{ detail.title }}</text
            ><text class="status-pill">{{ detail.status }}</text></view
          ><view class="detail-body"
            ><text class="body-copy">{{ detail.description }}</text
            ><view class="detail-row"
              ><text>位置</text><text>{{ detail.location }}</text></view
            ><view class="detail-row"
              ><text>日期</text><text>{{ detail.date }}</text></view
            ><view v-if="detail.capacity" class="detail-row"
              ><text>容量 / 使用中</text
              ><text>{{ detail.capacity }} / {{ detail.used ?? 0 }}</text></view
            ><button
              role="button"
              v-if="detail.capacity && detail.status === '正常'"
              class="primary-button"
              @click="navigate('booking')"
            >
              预约空间 ↗
            </button></view
          ></template
        ><view v-else class="empty-state"
          >请选择要查看的服务<button role="button" @click="home('services')">
            返回服务列表
          </button></view
        ></template
      >
      <template v-else-if="page === 'assistant'"
        ><view class="assistant-banner"
          ><text class="assistant-symbol">✧</text
          ><text class="page-title">你的日常服务向导。</text
          ><text class="tiny muted">服务助手 · 演示回答</text></view
        ><view class="message-list" aria-live="polite"
          ><view v-for="(m, i) in messages" :key="i" :class="['bubble', m.role]"
            ><text>{{ m.text || "正在整理回答…" }}</text></view
          ></view
        ><view class="suggestions"
          ><button
            role="button"
            v-for="q in scenario.questions"
            :key="q.question"
            :disabled="busy"
            @click="ask(q.question)"
          >
            {{ q.question }} ↗
          </button></view
        ><view class="chat-composer"
          ><input
            v-model="input"
            class="mobile-input"
            placeholder="有什么可以帮你？"
            aria-label="输入问题"
            confirm-type="send"
            @confirm="ask()"
            @blur="input = fieldValue($event)"
          /><button
            role="button"
            :disabled="busy || !input.trim()"
            @click="ask()"
          >
            发送
          </button></view
        ></template
      > </view
    ><view
      v-if="['home', 'services', 'booking', 'me'].includes(page)"
      class="bottom-nav"
      ><button
        role="button"
        v-for="n in nav"
        :key="n.page"
        :class="{ active: page === n.page }"
        @click="page !== n.page && home(n.page)"
      >
        <Icon :name="n.icon" :active="page === n.page" :size="23" /><text>{{
          n.label
        }}</text
        ><view v-if="page === n.page" class="nav-dot" /></button></view
  ></view>
</template>

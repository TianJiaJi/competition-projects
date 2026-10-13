<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount, onMounted } from "vue";
import Icon from "./Icon.vue";
import { state, scenario, themeStyle, selection } from "../store";
import { navigate, home, back, notify } from "../platform";
import {
  createRecord,
  validateRecord,
  answerQuestion,
  type Collection,
  type RecordItem,
} from "@scene/domain";
import {
  bookingStatusLabel,
  leaveStatusLabel,
  formatLeaveRange,
  createBookingClient,
  todayInShanghai,
  type BookingRequest,
  type LeaveRequest,
} from "@scene/bookings";
// #ifdef H5
import { enhanceH5Accessibility } from "../platform";
let stopAccessibility: (() => void) | undefined;
onMounted(() => {
  stopAccessibility = enhanceH5Accessibility();
});
onBeforeUnmount(() => stopAccessibility?.());
// #endif
function fieldValue(event: unknown): string {
  const field = event as { detail?: { value?: unknown }; target?: { value?: unknown } };
  return String(field.detail?.value ?? field.target?.value ?? '');
}
const props = defineProps<{ page: string; initialCategory?: string }>();
const recordCategory = ref('booking');
const recordCategories = [{id:'booking',label:'预约消息'},{id:'leave',label:'请假消息'},{id:'other',label:'其他服务'}];
watch(()=>props.initialCategory,value=>{recordCategory.value=['booking','leave','other'].includes(value || '') ? value! : 'booking';},{immediate:true});
function openMessages(category:string) { if(auth()) navigate('records',`category=${category}`); }
const query = ref("");
const form = reactive({
  title: "",
  location: "",
  description: "",
  contact: "",
  date: todayInShanghai(),

});
const error = ref("");
const bookingClient = createBookingClient(import.meta.env.VITE_BOOKING_API_URL);
const sharedBookings = ref<BookingRequest[]>([]);
const sharedLeaves = ref<LeaveRequest[]>([]);
const bookingsLoading = ref(false);
const submitting = ref(false);
const cancellingId = ref("");
async function refreshBookings() {
  if (!state.identity) return;
  bookingsLoading.value = true;
  error.value = "";
  try {
    [sharedBookings.value, sharedLeaves.value] = await Promise.all([
      bookingClient.list(state.identity), bookingClient.listLeaves(state.identity),
    ]);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "预约记录加载失败";
  } finally {
    bookingsLoading.value = false;
  }
}
onMounted(() => {
  if (props.page === "records") void refreshBookings();
});
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
  login: "学生登录",
  records: "审批消息与服务记录",
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
const records = computed<Array<RecordItem & { bookingId?: string; leaveId?: string; reviewReason?: string; reviewer?: string; timeRange?: string; updatedAt?: string }>>(() => [
  ...sharedBookings.value.map((booking) => ({
    id: booking.id,
    bookingId: booking.id,
    updatedAt: booking.updatedAt || booking.createdAt,
    title: booking.activity || `${booking.venue}预约`,
    location: booking.venue,
    category: "教室预约",
    description: `${booking.date} ${booking.time} · ${booking.count}人 · ${booking.purpose}${booking.note ? ` · ${booking.note}` : ''}${booking.phone ? ` · 联系电话 ${booking.phone}` : ''}`,
    status: bookingStatusLabel[booking.status],
    date: booking.date,
    owner: booking.owner,
    reviewReason: booking.reviewReason,
    reviewer: booking.reviewer,
  })),
  ...sharedLeaves.value.map((leave) => ({
    id: leave.id,
    leaveId: leave.id,
    updatedAt: leave.updatedAt || leave.createdAt,
    title: `${leave.type}申请`,
    location: "学生请假",
    timeRange: formatLeaveRange(leave),
    category: "学生请假",
    description: `${leave.reason}${leave.leavingCampus ? ` · ${leave.destination} ${leave.address}` : ''}`,
    status: leaveStatusLabel[leave.status],
    date: leave.startDate,
    owner: leave.owner,
    reviewReason: leave.reviewReason,
    reviewer: leave.reviewer,
  })),
  ...[...state.records.tasks, ...state.records.visitors].filter((r) => r.owner === state.identity),
]);
function categoryOf(item: {bookingId?:string;leaveId?:string}) { return item.bookingId?'booking':item.leaveId?'leave':'other'; }
const visibleRecords=computed(()=>records.value.filter(item=>categoryOf(item)===recordCategory.value).sort((a,b)=>{
  const time=(value:string|undefined)=>{const n=Date.parse(value || '');return Number.isFinite(n)?n:0;};
  return time(b.updatedAt || b.date)-time(a.updatedAt || a.date) || b.id.localeCompare(a.id);
}));
function updatedLabel(value:string) { return new Date(value).toLocaleString('zh-CN',{hour12:false}); }
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
function signOut() {
  state.identity = null;
  uni.removeStorageSync("zhixing:student-session");
  notify("已退出登录");
}
function signIn() {
  if (login.username !== "user01" || login.password !== "123456") {
    error.value = "账号或密码不正确，请重新输入";
    return;
  }
  state.identity = "林悦";
  uni.setStorageSync("zhixing:student-session", "林悦");
  notify("登录成功");
  back();
}
function submit() {
  if (!auth() || submitting.value) return;
  error.value = validateRecord(form.title, form.location, form.description, props.page === "visitors" ? form.contact : "");
  if (props.page === "visitors" && !form.contact) error.value = "请填写访客联系电话";
  if (error.value) return;
  createRecord(state, props.page === "repair" ? "tasks" : "visitors", {
    title: form.title.trim(), location: form.location.trim(), description: form.description.trim(),
    contact: form.contact, date: form.date,
    category: props.page === "repair" ? "用户报修" : "亲友来访",
    status: props.page === "repair" ? "待处理" : "待到访", owner: state.identity!,
  });
  form.title = "";
  form.description = "";
  notify("提交成功");
  navigate("records", "category=other");
}
async function cancelBooking(id: string, kind: "booking" | "leave" = "booking") {
  if (!state.identity || cancellingId.value) return;
  cancellingId.value = id;
  error.value = "";
  try {
    if (kind === "booking") {
      const updated = await bookingClient.cancel(id, state.identity);
      sharedBookings.value = sharedBookings.value.map((item) => item.id === id ? updated : item);
    } else {
      const updated = await bookingClient.cancelLeave(id, state.identity);
      sharedLeaves.value = sharedLeaves.value.map((item) => item.id === id ? updated : item);
    }
    notify("申请已取消");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "取消失败";
    await refreshBookings();
  } finally { cancellingId.value = ""; }
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
  <view class="mobile-root" :style="themeStyle"
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
      ><view class="weather" v-if="page === 'home'">晴 · 24°</view></view
    >
    <view class="mobile-content">
      <template v-if="page === 'home'"
        ><view class="mobile-hero"
          ><text class="overline">美好日常 · 从这里开始</text
          ><text class="hero-title">今天的学习，<br/>从容安排。</text
          ><text class="hero-subtitle">教室预约与学生请假，随时查看申请进度。每一步，都有回应。</text
          ><view class="hero-art"
            ><view class="arch arch-one" /><view class="arch arch-two" /><view
              class="art-line"
            /><text>{{
              scenario.kind === "campus" ? "知 · 行" : "云 · 栖"
            }}</text></view
          ><button
            role="button"
            class="hero-link"
            @click="navigate('booking')"
          >
            开始教室预约 ↗
          </button></view
        ><view class="approval-entry"><view><text class="card-title">审批消息</text><text class="tiny muted">预约与请假分开查看，及时掌握审批结果</text></view><view class="approval-entry-actions"><button role="button" @click="openMessages('booking')">预约消息 <text>↗</text></button><button role="button" @click="openMessages('leave')">请假消息 <text>↗</text></button></view></view><view class="section-title"
          ><text>我的校园服务</text
          ><text class="tiny muted">STUDENT SERVICES</text></view
        ><view class="quick-grid campus-services"
          ><button role="button" class="quick" @click="navigate('booking')"><view class="quick-symbol"><Icon name="calendar-days" active :size="24" /></view><text>教室预约</text><text class="quick-copy">选空间 · 看时段</text></button
          ><button role="button" class="quick" @click="navigate('leave')"><view class="quick-symbol"><Icon name="calendar-days" active :size="24" /></view><text>学生请假</text><text class="quick-copy">填事由 · 等审批</text></button
          ><button role="button" class="quick" @click="navigate('repair')"><view class="quick-symbol"><Icon name="wrench" active :size="24" /></view><text>报修服务</text><text class="quick-copy">设施问题反馈</text></button
          ><button role="button" class="quick" @click="navigate('assistant')"><view class="quick-symbol"><Icon name="sparkles" active :size="24" /></view><text>服务助手</text><text class="quick-copy">校园常见问答</text></button></view
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
         @blur="query  = fieldValue($event)"/><view v-if="!facilities.length" class="empty-state"
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
      <template v-else-if="['repair', 'visitors'].includes(page)"
        ><view class="page-intro"
          ><text class="page-title">{{ page === "repair" ? "把小事，交给我们。" : "让相见，更从容。" }}</text
          ><text class="body-copy">{{ page === "repair" ? "填写问题与位置，我们会认真对待每一份反馈。" : "提前登记来访信息，让亲友到访更加方便。" }}</text></view
        ><view
          v-if="!state.identity"
          class="signin-note"
          @click="navigate('login')"
          >登录后即可提交服务申请　→</view
        ><view class="mobile-form"
          ><text class="field-label">{{
              page === "repair" ? "问题名称" : "访客姓名"
            }}</text
            ><input
              v-model="form.title"
              class="mobile-input"
              :placeholder="
                page === 'repair' ? '例如：走廊照明不亮' : '请输入访客姓名'
              "
              aria-label="名称"
              :maxlength="50"  @blur="form.title  = fieldValue($event)"/><text class="field-label">{{
              page === "repair" ? "具体位置" : "到访位置"
            }}</text
            ><input
              v-model="form.location"
              class="mobile-input"
              placeholder="楼栋、楼层或公共空间"
              aria-label="位置"
              :maxlength="60"  @blur="form.location  = fieldValue($event)"/><template v-if="page === 'visitors'"
              ><text class="field-label">联系电话</text
              ><input
                v-model="form.contact"
                class="mobile-input"
                type="tel"
                :maxlength="11"
                aria-label="联系电话"  @blur="form.contact  = fieldValue($event)"/></template
          ><text class="field-label">详细说明</text
          ><textarea
            v-model="form.description"
            class="mobile-textarea"
            aria-label="详细说明"
            placeholder="请补充说明，方便我们提供服务"
            :maxlength="500"
            :adjust-position="true"
           @blur="form.description  = fieldValue($event)"/><text v-if="error" class="form-error" role="alert">{{ error }}</text
          ><button role="button" class="primary-button" :disabled="submitting" @click="submit">
            提交申请　↗
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
          ><view class="avatar">{{ state.identity ? "悦" : "○" }}</view
          ><text class="page-title">{{
            state.identity ?? "欢迎来到" + scenario.name
          }}</text
          ><text class="body-copy">{{
            state.identity ? "2024级软件工程1班 · 学生服务" : "登录后管理你的预约与请假申请。"
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
            预约消息 <text>↗</text></button
          ><button role="button" @click="openMessages('leave')">请假消息 <text>↗</text></button
          ><button role="button" @click="openMessages('other')">其他服务记录 <text>↗</text></button
          ><button role="button" @click="navigate('leave')">学生请假 <text>↗</text></button
          ><button role="button" @click="navigate('notices')">
            公告消息 <text>↗</text></button
          ><button role="button" @click="navigate('assistant')">
            服务助手 <text>↗</text></button
          ><button
            role="button"
            v-if="state.identity"
            @click="signOut"
          >
            退出登录 <text>↗</text>
          </button></view
        ></template
      >
      <template v-else-if="page === 'login'"
        ><view class="page-intro login-intro"
          ><text class="overline">WELCOME HOME</text
          ><text class="page-title">欢迎登录</text
          ><text class="body-copy">登录后预约教室、提交请假并查看申请进度。</text></view
        ><view class="mobile-form"
          ><text class="field-label">账号</text
          ><input
            v-model="login.username"
            aria-label="账号"
            class="mobile-input"
           @blur="login.username  = fieldValue($event)"/><text class="field-label">密码</text
          ><input
            v-model="login.password"
            aria-label="密码"
            class="mobile-input"
            :password="true"
           @blur="login.password  = fieldValue($event)"/><text v-if="error" class="form-error">{{ error }}</text
          ><button role="button" class="primary-button" @click="signIn">
            登录</button
          ></view
        ></template
      >
      <template v-else-if="page === 'records'"
        ><view class="page-intro"
          ><text class="page-title">每份申请，都有回应。</text
          ><text class="body-copy">预约、请假分别查看，最新审批和状态变化排在前面。</text></view
        ><view class="record-category-tabs" role="tablist" aria-label="消息分类"><button v-for="category in recordCategories" :key="category.id" role="button" :aria-pressed="recordCategory===category.id" :class="{active:recordCategory===category.id}" @click="recordCategory=category.id">{{category.label}}<text>{{records.filter(item=>categoryOf(item)===category.id).length}}</text></button></view
        ><view class="record-sort-note">按最近更新时间排序 · 最新在前</view
        ><button role="button" class="secondary-button" :disabled="bookingsLoading" @click="refreshBookings">{{ bookingsLoading ? "正在刷新…" : "刷新审批消息" }}</button
        ><text v-if="error" class="form-error" role="alert">{{ error }}</text
        ><view v-if="!visibleRecords.length && !bookingsLoading && !error" class="empty-state"
          ><text>暂无{{recordCategories.find(c=>c.id===recordCategory)?.label}}</text
          ><button
            role="button"
            class="secondary-button"
            @click="navigate(recordCategory==='leave'?'leave':recordCategory==='other'?'repair':'booking')"
          >
            {{recordCategory==='leave'?'申请请假':recordCategory==='other'?'报修服务':'预约教室'}}
          </button></view
        ><view v-for="item in visibleRecords" :key="item.id" class="notice-card service-record">
          <text class="status-pill" :class="{ warning: item.status === '待审核', rejected: item.status === '已拒绝' }">{{ item.status }}</text>
          <text class="record-title">{{ item.title }}</text>
          <text v-if="item.updatedAt" class="record-updated">最近更新 {{ updatedLabel(item.updatedAt) }}</text>
          <text class="record-meta">{{ item.timeRange || `${item.location} · ${item.date}` }}</text>
          <text class="record-description">{{ item.description }}</text>
          <view v-if="item.reviewer || item.reviewReason" class="record-review">
            <text v-if="item.reviewer" class="record-reviewer">审核教师：{{ item.reviewer }}</text>
            <text v-if="item.reviewReason" class="record-review-reason">审核说明：{{ item.reviewReason }}</text>
          </view>
          <view v-if="(item.bookingId && ['待审核', '已预约'].includes(item.status)) || (item.leaveId && ['待审核', '已通过'].includes(item.status))" class="record-actions">
            <button role="button" v-if="item.bookingId" class="record-cancel" :disabled="cancellingId === item.bookingId" @click="cancelBooking(item.bookingId)">{{ cancellingId === item.bookingId ? '取消中…' : '取消预约' }}</button>
            <button role="button" v-if="item.leaveId" class="record-cancel" :disabled="cancellingId === item.leaveId" @click="cancelBooking(item.leaveId, 'leave')">{{ cancellingId === item.leaveId ? '取消中…' : '取消请假' }}</button>
          </view>
        </view
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
              v-if="detail.capacity && detail.status === '正常' && ['研讨空间', '教学空间'].includes(detail.category)"
              class="primary-button"
              @click="navigate('booking')"
            >
              预约教室 ↗
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
           @blur="input  = fieldValue($event)"/><button
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

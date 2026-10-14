<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { createBookingClient, todayInShanghai, validBookingCount, type SlotAvailability } from "@scene/bookings";
import { bookingWindowDays, classroomDetails, demoClass, studentFor } from "../../../../scenario/teaching";
import { scenario, selection, state, themeStyle } from "../store";
import { back, home, navigate, notify } from "../platform";
// #ifdef H5
import { enhanceH5Accessibility } from "../platform";
// #endif
import Icon from "./Icon.vue";

const client = createBookingClient(import.meta.env.VITE_BOOKING_API_URL);
const venues = state.records.facilities.filter((item) => item.capacity && item.status === "正常" && ["研讨空间", "教学空间"].includes(item.category));
const venueId = ref(venues.find((item) => item.id === selection.id)?.id ?? venues[0]?.id ?? "");
const venue = computed(() => venues.find((item) => item.id === venueId.value));
const days = Array.from({ length: bookingWindowDays }, (_, offset) => {
  const date = new Date(`${todayInShanghai()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  const value = date.toISOString().slice(0, 10);
  return { value, day: value.slice(5).replace("-", "/"), week: new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }).format(date) };
});
const date = ref(days[1]?.value ?? days[0].value);
const slot = ref("");
const availability = ref<SlotAvailability[]>([]);
const loading = ref(false);
const error = ref("");
let requestId = 0;
async function loadAvailability() {
  const current = ++requestId;
  availability.value = [];
  slot.value = "";
  if (!venueId.value) return;
  loading.value = true;
  error.value = "";
  try {
    const result = await client.availability(venueId.value, date.value);
    if (current === requestId) availability.value = result;
  } catch (cause) {
    if (current === requestId) error.value = cause instanceof Error ? cause.message : "时段加载失败";
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch([venueId, date], () => void loadAvailability(), { immediate: true });
const stage = ref<"select" | "details" | "confirm">("select");
const activity = ref("");
const purpose = ref("");
const count = ref("1");
const phone = ref(studentFor(state.identity ?? "林悦")?.phone ?? "");
const note = ref("");
const sending = ref(false);
function fieldValue(event: unknown) {
  const field = event as { detail?: { value?: unknown }; target?: { value?: unknown } };
  return String(field.detail?.value ?? field.target?.value ?? "");
}
function next() {
  error.value = "";
  if (stage.value === "select") {
    if (!slot.value || !availability.value.find((item) => item.time === slot.value)?.available) {
      error.value = "请选择可申请的教室与时段"; return;
    }
    stage.value = "details";
  } else if (stage.value === "details") {
    if (activity.value.trim().length < 2 || activity.value.trim().length > 50) error.value = "活动名称需 2–50 字";
    else if (purpose.value.trim().length < 2 || purpose.value.trim().length > 200) error.value = "使用用途需 2–200 字";
    else if (!validBookingCount(Number(count.value), venue.value?.capacity ?? 0)) error.value = `使用人数应为 1–${venue.value?.capacity} 的整数`;
    else if (!/^1\d{10}$/.test(phone.value.trim())) error.value = "请填写 11 位联系人手机号";
    if (!error.value) stage.value = "confirm";
  }
}
async function submit() {
  if (!state.identity) { navigate("login"); return; }
  if (sending.value || !venue.value || !slot.value) return;
  if (!validBookingCount(Number(count.value), venue.value.capacity ?? 0)) {
    error.value = `使用人数应为 1–${venue.value.capacity} 的整数`;
    stage.value = "details";
    return;
  }
  sending.value = true;
  error.value = "";
  try {
    await client.create({ facilityId: venue.value.id, owner: state.identity, date: date.value, time: slot.value,
      activity: activity.value.trim(), purpose: purpose.value.trim(), count: Number(count.value), phone: phone.value.trim(), note: note.value.trim() });
    notify("已提交，等待教师审核");
    navigate("records");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "提交失败，请重试";
    if (error.value.includes("已被预约") || error.value.includes("时段已开始")) {
      stage.value = "select";
      void loadAvailability();
    }
  } finally { sending.value = false; }
}
let stopAccessibility: (() => void) | undefined;
// #ifdef H5
onMounted(() => { stopAccessibility = enhanceH5Accessibility(); });
onBeforeUnmount(() => stopAccessibility?.());
// #endif
</script>
<template>
  <view class="mobile-root booking-page" :style="themeStyle">
    <view class="mobile-header"><button role="button" class="back-button" aria-label="返回" @click="stage === 'select' ? back() : (stage = stage === 'confirm' ? 'details' : 'select')">‹</button><view><text class="mobile-brand">教室预约</text><text class="mobile-eyebrow">SPACE FOR IDEAS</text></view></view>
    <view class="mobile-content">
      <view class="page-intro"><text class="overline">校园空间 · 随心探索</text><text class="page-title">为你的想法，<br/>留一间教室。</text><text class="body-copy">选择教室与时间，补充活动信息，由带班教师审核。</text></view>
      <view class="application-progress"><text v-for="(label, i) in ['选空间', '填资料', '核对']" :key="label" :class="{ current: ['select', 'details', 'confirm'].indexOf(stage) >= i }">{{ String(i + 1).padStart(2, '0') }} {{ label }}</text></view>
      <template v-if="stage === 'select'">
        <view class="section-title"><text>01 / 选择空间</text><text class="tiny muted">{{ venues.length }} 间可申请</text></view>
        <button v-for="item in venues" :key="item.id" role="button" class="venue-option" :class="{ chosen: venueId === item.id }" :aria-pressed="venueId === item.id" @click="venueId = item.id">
          <view class="venue-option-head"><text class="overline">{{ item.category }} · {{ item.location }}</text><text class="choice-indicator">{{ venueId === item.id ? '✓ 已选择' : '选择' }}</text></view>
          <text class="card-title">{{ item.title }}</text><text class="body-copy">{{ item.description }}</text>
          <view class="venue-tags"><text>容纳 {{ item.capacity }} 人</text><text>{{ classroomDetails[item.id]?.hours }}</text><text v-for="feature in classroomDetails[item.id]?.features" :key="feature">{{ feature }}</text></view>
          <text v-if="venueId === item.id" class="venue-rule">{{ classroomDetails[item.id]?.rule }}</text>
        </button>
        <view class="section-title"><text>02 / 选择日期</text><text class="tiny muted">近 {{ days.length }} 天</text></view>
        <scroll-view scroll-x class="date-scroll"><view class="date-strip"><button v-for="day in days" :key="day.value" role="button" class="date-option" :class="{ chosen: date === day.value }" :aria-pressed="date === day.value" @click="date = day.value"><text>{{ day.week }}</text><strong>{{ day.day }}</strong></button></view></scroll-view>
        <view class="section-title"><text>03 / 选择时段</text><text class="tiny muted">{{ date }}</text></view>
        <view v-if="loading" class="booking-hint">正在查询教室时段…</view>
        <view v-else class="slot-grid"><button v-for="item in availability" :key="item.time" role="button" class="slot-option" :class="{ chosen: slot === item.time, unavailable: !item.available }" :disabled="!item.available" :aria-pressed="slot === item.time" @click="slot = item.time"><strong>{{ item.time }}</strong><text>{{ item.reason || (item.pending ? `${item.pending} 份申请待审 · 可竞争` : '可申请') }}</text></button></view>
        <text class="booking-hint">待审申请不占用教室；教师审核时以最终可用状态为准。</text>
      </template>
      <template v-else-if="stage === 'details'">
        <view class="booking-summary"><text class="overline">已选空间</text><strong>{{ venue?.title }}</strong><text>{{ date }} · {{ slot }} · 最多 {{ venue?.capacity }} 人</text><button role="button" @click="stage = 'select'">修改时段 ↗</button></view>
        <view class="section-title"><text>活动资料</text><text class="tiny muted">* 为必填</text></view>
        <view class="mobile-form">
          <text class="field-label">活动名称 *</text><input v-model="activity" class="mobile-input" aria-label="活动名称" placeholder="例如：软件工程小组研讨" :maxlength="50" @blur="activity = fieldValue($event)" />
          <text class="field-label">使用用途 *</text><textarea v-model="purpose" class="mobile-textarea" aria-label="使用用途" placeholder="说明活动内容与教室使用方式" :maxlength="200" @blur="purpose = fieldValue($event)" />
          <text class="field-label">参加人数 *</text><input v-model="count" class="mobile-input" aria-label="参加人数" type="number" :min="1" :max="venue?.capacity" :step="1" :placeholder="`请输入 1–${venue?.capacity} 的整数`" @blur="count = fieldValue($event)" />
          <text class="booking-hint">当前场所限 1–{{ venue?.capacity }} 人，请填写整数，不得超过实际容量。</text>
          <text class="field-label">联系人手机号 *</text><input v-model="phone" class="mobile-input" aria-label="联系人手机号" type="tel" :maxlength="11" @blur="phone = fieldValue($event)" />
          <text class="field-label">补充说明（选填）</text><textarea v-model="note" class="mobile-textarea" aria-label="补充说明" placeholder="如需特殊设备或桌椅布置，可在此说明" :maxlength="200" @blur="note = fieldValue($event)" />
        </view>
      </template>
      <template v-else>
        <view class="booking-summary"><text class="overline">申请预览 · 等待教师终审</text><strong>{{ activity }}</strong><text>{{ venue?.title }} · {{ date }} {{ slot }}</text></view>
        <view class="review-lines"><view><text>地点</text><strong>{{ venue?.location }}</strong></view><view><text>班级</text><strong>{{ demoClass.name }}</strong></view><view><text>人数</text><strong>{{ count }} 人 / 容量 {{ venue?.capacity }} 人</strong></view><view><text>用途</text><strong>{{ purpose }}</strong></view><view><text>联系电话</text><strong>{{ phone }}</strong></view><view v-if="note"><text>备注</text><strong>{{ note }}</strong></view></view>
        <text class="booking-hint">提交后可在“我的服务记录”查询进度；待审及已通过预约可取消。</text>
        <view v-if="!state.identity" class="signin-note">请先登录，已填写的资料会保留。<button role="button" @click="navigate('login')">去登录 ↗</button></view>
      </template>
      <text v-if="error" class="form-error" role="alert">{{ error }}</text>
      <button role="button" class="primary-button" :disabled="sending || loading" @click="stage === 'confirm' ? submit() : next()">{{ sending ? '提交中…' : stage === 'confirm' ? '确认提交申请 ↗' : '下一步 ↗' }}</button>
      <button v-if="stage === 'confirm'" role="button" class="secondary-button" @click="stage = 'details'">返回修改资料</button>
    </view>
    <view class="bottom-nav"><button role="button" @click="home('home')"><Icon name="house" :size="23" /><text>首页</text></button><button role="button" @click="home('services')"><Icon name="map-pin" :size="23" /><text>服务</text></button><button role="button" class="active"><Icon name="calendar-days" active :size="23" /><text>预约</text></button><button role="button" @click="home('me')"><Icon name="user-round" :size="23" /><text>我的</text></button></view>
  </view>
</template>

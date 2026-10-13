<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { createBookingClient, todayInShanghai, leaveNatures, leaveDestinations, validateLeaveDetails, leaveBounds, formatLeaveDuration, validLeaveTime, type NewLeave } from "@scene/bookings";
import { demoTeacher, leaveTypes, leaveWindowDays, studentFor } from "../../../../scenario/teaching";
import { state, themeStyle } from "../store";
import { back, navigate, notify } from "../platform";
import FormSheet from "./FormSheet.vue";
import LeaveDateRange from "./LeaveDateRange.vue";
// #ifdef H5
import { enhanceH5Accessibility } from "../platform";
let stopAccessibility: (() => void) | undefined;
onMounted(() => { stopAccessibility = enhanceH5Accessibility(); });
onBeforeUnmount(() => stopAccessibility?.());
// #endif
const client = createBookingClient(import.meta.env.VITE_BOOKING_API_URL);
const form = reactive({ leavingCampus: null as boolean | null, leavingCity: null as boolean | null,
  destination: "", address: "", emergencyName: "", emergencyPhone: "", type: "", nature: "",
  startDate: "", startTime: "08:00:00", endDate: "", endTime: "18:00:00",
  reason: "", phone: studentFor(state.identity ?? "林悦")?.phone ?? "", cc: [] as string[], confirmed: false });
const errors = reactive<Record<string, string>>({});
const serviceError = ref("");
const sending = ref(false);
const sheet = ref<"" | "destination" | "type" | "nature" | "time" | "cc">("");
const sheetTitle = computed(() => ({ destination: "离校去向", type: "请假类型", nature: "请假性质", cc: "抄送人", time: "请假时间", "": "" })[sheet.value]);
const options = computed(() => sheet.value === "destination" ? leaveDestinations : sheet.value === "type" ? leaveTypes : sheet.value === "nature" ? leaveNatures : [demoTeacher.name]);
const duration = computed(() => {
  if (!form.startDate || !form.endDate) return "";
  const range = leaveBounds(form);
  return formatLeaveDuration(range.end - range.start);
});
watch(() => form.leavingCampus, (leaving) => {
  if (!leaving) { form.leavingCity = false; form.destination = ""; form.address = ""; }
  else form.leavingCity = null;
});
function valueOf(event: unknown) {
  const field = event as { detail?: { value?: unknown }; target?: { value?: unknown } };
  return String(field.detail?.value ?? field.target?.value ?? "");
}
function choose(value: string) {
  if (sheet.value === "cc") form.cc = [value];
  else if (sheet.value === "destination" || sheet.value === "type" || sheet.value === "nature") form[sheet.value] = value;
  sheet.value = "";
}
function setTime(value: { startDate: string; endDate: string; startTime: string; endTime: string }) {
  Object.assign(form, value); sheet.value = ""; delete errors.time;
}
function validate() {
  for (const key of Object.keys(errors)) delete errors[key];
  if (form.leavingCampus === null) errors.leavingCampus = "请选择是否离校";
  if (form.leavingCampus && form.leavingCity === null) errors.leavingCity = "请选择是否离开学校所在地";
  if (form.leavingCampus && !form.destination) errors.destination = "请选择离校去向";
  if (form.leavingCampus && (form.address.trim().length < 2 || form.address.trim().length > 120)) errors.address = "请填写详细地址（2–120 字）";
  if (form.emergencyName.trim().length < 2) errors.emergencyName = "请填写紧急联系人姓名";
  if (!/^1\d{10}$/.test(form.emergencyPhone.trim())) errors.emergencyPhone = "请填写 11 位紧急联系人电话";
  if (!form.type) errors.type = "请选择请假类型";
  if (!form.nature) errors.nature = "请选择请假性质";
  if (!form.startDate || !form.endDate || !validLeaveTime(form.startTime) || !validLeaveTime(form.endTime) || !duration.value) errors.time = "请选择有效的请假起止时间";
  else if (leaveBounds(form).start < Date.now()) errors.time = "开始时间不能早于当前时间";
  if (form.reason.trim().length < 5) errors.reason = "请填写至少 5 字的请假事由";
  if (!/^1\d{10}$/.test(form.phone.trim())) errors.phone = "请填写 11 位手机号";
  if (!form.confirmed) errors.confirmed = "请确认填写信息真实有效";
  return !Object.keys(errors).length;
}
async function submit() {
  if (sending.value) return;
  serviceError.value = "";
  if (!validate()) {
    const key = Object.keys(errors)[0];
    uni.pageScrollTo({ selector: `.field-${key}`, duration: 200 });
    return;
  }
  if (!state.identity) { navigate("login"); return; }
  const input: NewLeave = { ...form, owner: state.identity, leavingCampus: form.leavingCampus!, leavingCity: form.leavingCity!,
    type: form.type as NewLeave["type"], nature: form.nature as NewLeave["nature"], address: form.address.trim(),
    reason: form.reason.trim(), emergencyName: form.emergencyName.trim(), emergencyPhone: form.emergencyPhone.trim(), phone: form.phone.trim() };
  const detailError = validateLeaveDetails(input);
  if (detailError) { serviceError.value = detailError; return; }
  sending.value = true;
  try {
    await client.createLeave(input);
    notify("请假申请已提交");
    navigate("records");
  } catch (cause) { serviceError.value = cause instanceof Error ? cause.message : "提交失败，请重试"; }
  finally { sending.value = false; }
}
</script>
<template>
  <view class="mobile-root leave-page" :style="themeStyle">
    <view class="mobile-header"><button role="button" class="back-button" aria-label="返回" @click="back">‹</button><view><text class="mobile-brand">请假申请</text><text class="mobile-eyebrow">学生服务</text></view></view>
    <view class="leave-content">
      <view class="leave-intro"><text>填写请假信息</text><text>由带班教师审核，提交后可在服务记录查看进度。</text></view>
      <text class="leave-section-heading">去向信息</text>
      <view class="leave-group">
        <view class="leave-field field-leavingCampus"><view class="leave-row"><text class="leave-label required">是否离校</text><view class="inline-choices"><button role="button" :aria-pressed="form.leavingCampus === true" :class="{ selected: form.leavingCampus === true }" @click="form.leavingCampus = true">是</button><button role="button" :aria-pressed="form.leavingCampus === false" :class="{ selected: form.leavingCampus === false }" @click="form.leavingCampus = false">否</button></view></view><text v-if="errors.leavingCampus" class="field-error">{{ errors.leavingCampus }}</text></view>
        <template v-if="form.leavingCampus">
          <view class="leave-field field-leavingCity"><view class="leave-row"><text class="leave-label required">是否离开学校所在地</text><view class="inline-choices"><button role="button" :aria-pressed="form.leavingCity === true" :class="{ selected: form.leavingCity === true }" @click="form.leavingCity = true">是</button><button role="button" :aria-pressed="form.leavingCity === false" :class="{ selected: form.leavingCity === false }" @click="form.leavingCity = false">否</button></view></view><text v-if="errors.leavingCity" class="field-error">{{ errors.leavingCity }}</text></view>
          <view class="leave-field field-destination"><button role="button" class="leave-row row-select" aria-label="离校去向" @click="sheet = 'destination'"><text class="leave-label required">离校去向</text><text :class="['leave-value', { placeholder: !form.destination }]">{{ form.destination || '请选择' }}</text><text class="row-chevron">›</text></button><text v-if="errors.destination" class="field-error">{{ errors.destination }}</text></view>
          <view class="leave-field field-address"><view class="leave-row"><text class="leave-label required">详细地址</text><input v-model="form.address" aria-label="详细地址" placeholder="请输入详细地址" :maxlength="120" @input="form.address = valueOf($event)" /></view><text v-if="errors.address" class="field-error">{{ errors.address }}</text></view>
        </template>
        <view class="leave-field field-emergencyName"><view class="leave-row"><text class="leave-label required">紧急联系人</text><input v-model="form.emergencyName" aria-label="紧急联系人" placeholder="请输入姓名" :maxlength="30" @input="form.emergencyName = valueOf($event)" /></view><text v-if="errors.emergencyName" class="field-error">{{ errors.emergencyName }}</text></view>
        <view class="leave-field field-emergencyPhone"><view class="leave-row"><text class="leave-label required">紧急联系人电话</text><input v-model="form.emergencyPhone" type="tel" aria-label="紧急联系人电话" placeholder="请输入联系电话" :maxlength="11" @input="form.emergencyPhone = valueOf($event)" /></view><text v-if="errors.emergencyPhone" class="field-error">{{ errors.emergencyPhone }}</text></view>
      </view>
      <text class="leave-section-heading">请假信息</text>
      <view class="leave-group">
        <view class="leave-field field-type"><button role="button" class="leave-row row-select" aria-label="请假类型" @click="sheet = 'type'"><text class="leave-label required">请假类型</text><text :class="['leave-value', { placeholder: !form.type }]">{{ form.type || '请选择' }}</text><text class="row-chevron">›</text></button><text v-if="errors.type" class="field-error">{{ errors.type }}</text></view>
        <view class="leave-field field-nature"><button role="button" class="leave-row row-select" aria-label="请假性质" @click="sheet = 'nature'"><text class="leave-label required">请假性质</text><text :class="['leave-value', { placeholder: !form.nature }]">{{ form.nature || '请选择' }}</text><text class="row-chevron">›</text></button><text v-if="errors.nature" class="field-error">{{ errors.nature }}</text></view>
        <view class="leave-field field-time"><button role="button" class="leave-row row-select" aria-label="请假时长" @click="sheet = 'time'"><text class="leave-label required">请假时长</text><view class="leave-value"><text :class="{ placeholder: !duration }">{{ duration ? duration : '请选择起止时间' }}</text><text v-if="duration" class="range-summary">{{ form.startDate }} {{ form.startTime }}<br/>至 {{ form.endDate }} {{ form.endTime }}</text></view><text class="row-chevron">›</text></button><text v-if="errors.time" class="field-error">{{ errors.time }}</text></view>
        <view class="leave-field field-reason"><view class="leave-row reason-label"><text class="leave-label required">请假事由</text></view><textarea v-model="form.reason" class="leave-reason" aria-label="请假事由" placeholder="请说明具体事由（至少 5 字）" :maxlength="1000" @input="form.reason = valueOf($event)" /><text class="character-count">{{ form.reason.length }}/1000</text><text v-if="errors.reason" class="field-error">{{ errors.reason }}</text></view>
        <view class="leave-field field-phone"><view class="leave-row"><text class="leave-label required">手机号</text><input v-model="form.phone" type="tel" aria-label="手机号" placeholder="请输入本人手机号" :maxlength="11" @input="form.phone = valueOf($event)" /></view><text v-if="errors.phone" class="field-error">{{ errors.phone }}</text></view>
      </view>
      <text class="leave-section-heading">抄送人 <text class="optional-label">选填</text></text>
      <view class="leave-group cc-group"><view v-if="form.cc.length" class="cc-person"><text>{{ form.cc[0] }} · 带班教师</text><button role="button" aria-label="移除抄送人" @click="form.cc = []">×</button></view><button role="button" class="cc-add" @click="sheet = 'cc'">＋ {{ form.cc.length ? '更换抄送人' : '添加抄送人' }}</button></view>
      <view class="leave-submit-area"><button role="button" class="truth-check field-confirmed" :aria-pressed="form.confirmed" @click="form.confirmed = !form.confirmed"><text class="check-square" :class="{ checked: form.confirmed }">{{ form.confirmed ? '✓' : '' }}</text><text>本人确认以上填写信息真实有效</text></button><text v-if="errors.confirmed" class="field-error">{{ errors.confirmed }}</text><text v-if="Object.keys(errors).length" class="form-error" role="alert">请完善标记的必填信息后提交。</text><text v-if="serviceError" class="form-error" role="alert">{{ serviceError }}</text><button role="button" class="primary-button" :disabled="sending" @click="submit">{{ sending ? '提交中…' : state.identity ? '提交申请' : '登录并提交' }}</button><text class="leave-footer-note">请假起止时间限未来 {{ leaveWindowDays }} 天内；审批结果将同步至我的服务记录。</text></view>
    </view>
    <LeaveDateRange v-if="sheet === 'time'" :start-date="form.startDate" :end-date="form.endDate" :start-time="form.startTime" :end-time="form.endTime" @close="sheet = ''" @apply="setTime" />
    <FormSheet v-else-if="sheet" :title="sheetTitle" @close="sheet = ''"><button v-for="option in options" :key="option" role="button" class="sheet-option" @click="choose(option)">{{ option }}<text>›</text></button><text v-if="sheet === 'cc'" class="sheet-description">抄送人可查看申请内容；带班教师仍负责审批。</text></FormSheet>
  </view>
</template>

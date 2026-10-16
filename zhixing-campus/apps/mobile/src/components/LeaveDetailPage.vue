<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createBookingClient, leaveStatusLabel, leaveHistory, leaveActionLabel, leaveBounds, leaveTimes, formatLeaveDuration, type LeaveRequest } from '@scene/bookings';
import { demoClass, demoTeacher, studentFor } from '../../../../scenario/teaching';
import { state, themeStyle } from '../store';
import { back, navigate, notify } from '../platform';
import LeaveActionSheet from './LeaveActionSheet.vue';
// #ifdef H5
import { enhanceH5Accessibility } from '../platform';
let stopAccessibility: (() => void) | undefined;
onMounted(() => { stopAccessibility = enhanceH5Accessibility(); });
onBeforeUnmount(() => stopAccessibility?.());
// #endif
const props = defineProps<{ requestId: string; refreshKey: number }>();
const client = createBookingClient(import.meta.env.VITE_BOOKING_API_URL);
const record = ref<LeaveRequest>();
const loading = ref(false), busy = ref(false), error = ref('');
type LeaveOperation = 'withdraw' | 'cancel' | 'complete';
const actionContext = ref<{ action: LeaveOperation; record: LeaveRequest }>();
const actionError = ref('');
let active = true;
let loadSequence = 0;
async function refresh() {
  const sequence = ++loadSequence;
  if (!state.identity || !props.requestId) { record.value = undefined; loading.value = false; return; }
  loading.value = true; error.value = '';
  try {
    const next = await client.getLeave(props.requestId, state.identity);
    if (sequence === loadSequence) record.value = next;
  } catch (cause) {
    if (sequence === loadSequence) {
      record.value = undefined;
      const message = cause instanceof Error ? cause.message : '假条读取失败';
      error.value = message === '接口不存在'
        ? '请假服务仍是旧版本。请关闭原启动窗口后，重新运行“启动测试工作台.bat”，再重新读取；已保存的假条不会删除。'
        : message;
    }
  } finally { if (sequence === loadSequence) loading.value = false; }
}
watch(() => [props.requestId, props.refreshKey, state.identity], () => void refresh(), { immediate: true });
onBeforeUnmount(() => { loadSequence++; active = false; });
const events = computed(() => record.value ? leaveHistory(record.value) : []);
const reviewer = computed(() => record.value?.reviewer || (record.value?.classId === demoClass.id ? demoTeacher.name : '带班教师'));
const statusDescription = computed(() => ({
  pending: `申请已提交，等待${reviewer.value}审核。发现填写错误，可先撤回修改。`,
  withdrawn: '申请已撤回，暂不进入教师审核。修改后需重新提交，也可以取消申请。',
  approved: '教师已审核通过。请假结束并确认返校后，请核销假条完成流程；如不再使用本次假条，可取消申请。',
  completed: '你已确认返校或结束请假，假条已核销完结。表单与流程记录保留，不再允许修改或取消。',
  rejected: '教师未通过本次申请。请查看审核说明，可修改后重新提交。',
  cancelled: '申请已取消，流程已结束。表单与操作记录保留供查看。',
})[record.value?.status || 'pending']);
const steps = computed(() => {
  const status = record.value?.status;
  return [
    { title: '学生提交', detail: record.value?.owner || '', tone: 'done' },
    { title: '教师审核', detail: status === 'pending' ? `等待${reviewer.value}` : status === 'withdrawn' ? '已撤回，待修改' : status === 'cancelled' ? '已结束' : reviewer.value,
      tone: status === 'pending' ? 'current' : status === 'approved' || status === 'completed' ? 'done' : status === 'rejected' ? 'rejected' : 'paused' },
    { title: '返校核销', detail: status === 'completed' ? '本人已核销' : status === 'approved' ? '等待本人核销' : status === 'cancelled' || status === 'rejected' ? '无需核销' : '待审核通过',
      tone: status === 'completed' ? 'done' : status === 'approved' ? 'current' : 'future' },
    { title: '流程完结', detail: status === 'completed' ? '正常完结' : status === 'cancelled' ? '已取消' : status === 'rejected' ? '已拒绝' : '尚未完结',
      tone: status === 'completed' ? 'done' : status === 'cancelled' || status === 'rejected' ? 'paused' : 'future' },
  ];
});
function yesNo(value?: boolean) { return value === undefined ? '旧记录未填写' : value ? '是' : '否'; }
function time(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }
const sections = computed(() => {
  const item = record.value;
  if (!item) return [];
  const times = leaveTimes(item), bounds = leaveBounds(item), student = studentFor(item.owner);
  return [
    { title: '申请人信息', fields: [['申请人', item.owner], ['学号', student?.number || '未记录'], ['班级', item.classId === demoClass.id ? demoClass.name : item.classId], ['本人手机号', item.phone]] },
    { title: '请假信息', fields: [['请假类型', item.type], ['请假性质', item.nature || '旧记录未填写'], ['开始时间', `${item.startDate} ${times.start}`], ['结束时间', `${item.endDate} ${times.end}`], ['请假时长', formatLeaveDuration(bounds.end - bounds.start)], ['请假事由', item.reason]] },
    { title: '去向与紧急联系', fields: [['是否离校', yesNo(item.leavingCampus)], ['是否离开学校所在地', yesNo(item.leavingCity)], ['离校去向', item.destination || (item.leavingCampus === false ? '不离校' : '未填写')], ['详细地址', item.address || (item.leavingCampus === false ? '不适用' : '未填写')], ['紧急联系人', item.emergencyName || '旧记录未填写'], ['紧急联系人电话', item.emergencyPhone || '旧记录未填写']] },
    ...(item.status === 'completed' ? [{ title: '核销信息', fields: [['核销状态', '已核销 · 流程完结'], ['核销人', item.completedBy || item.owner], ['核销时间', item.completedAt ? time(item.completedAt) : time(item.updatedAt)], ['核销方式', '本人确认已返校或已结束请假']] }] : []),
    { title: '确认与审核信息', fields: [['抄送人', item.cc?.join('、') || '未抄送'], ['真实性确认', item.confirmed === true ? '本人已确认信息真实有效' : '旧记录未提供'], ['审核教师', item.reviewer || '尚未审核'], ['审核说明', item.reviewReason || '无'], ['申请编号', item.id], ['提交时间', time(item.createdAt)], ['最近更新', time(item.updatedAt)]] },
  ];
});
const canWithdraw = computed(() => record.value && ['pending', 'rejected'].includes(record.value.status));
const canCancel = computed(() => record.value && ['pending', 'approved', 'withdrawn'].includes(record.value.status));
const canComplete = computed(() => record.value?.status === 'approved');
function edit() { if (record.value?.status === 'withdrawn') navigate('leave', `id=${encodeURIComponent(record.value.id)}`); }
function act(action: LeaveOperation) {
  if (!record.value || !state.identity || busy.value || loading.value || actionContext.value) return;
  uni.hideToast(); // Clear earlier login/submission notices before the confirmation takes focus.
  actionError.value = '';
  actionContext.value = { action, record: { ...record.value } };
}
function closeAction() {
  if (busy.value) return;
  actionContext.value = undefined;
  actionError.value = '';
}
async function confirmAction() {
  const context = actionContext.value;
  if (!context || busy.value || loading.value || !state.identity) return;
  const { action, record: item } = context;
  busy.value = true; actionError.value = ''; error.value = '';
  try {
    const updated = action === 'withdraw'
      ? await client.withdrawLeave(item.id, state.identity, item.revision || 0)
      : action === 'complete' ? await client.completeLeave(item.id, state.identity, item.revision || 0)
      : await client.cancelLeave(item.id, state.identity, item.revision || 0);
    if (!active) return;
    record.value = updated;
    actionContext.value = undefined;
    notify(action === 'withdraw' ? '已撤回，请修改后重新提交' : action === 'complete' ? '假条已核销，流程已完结' : '请假申请已取消');
    if (action === 'withdraw') edit();
  } catch (cause) {
    if (active) actionError.value = (cause instanceof Error ? cause.message : '操作失败') + '。可关闭面板刷新状态后重试。';
  } finally { busy.value = false; }
}
</script>
<template>
  <view class="leave-detail-page" :style="themeStyle">
    <view class="leave-detail-header"><button role="button" class="detail-back" aria-label="返回" @click="back"><view class="detail-chevron" /></button><view><text class="detail-page-title">假条详情</text><text class="detail-subtitle">申请表单与办理流程</text></view><button role="button" class="detail-refresh" aria-label="刷新假条详情" :disabled="loading || busy" :aria-disabled="loading || busy" @click="refresh">{{ loading ? '同步中' : '刷新' }}</button></view>
    <view class="leave-detail-content">
      <view v-if="!state.identity" class="detail-empty"><text>请先登录后查看本人的假条。</text><button role="button" @click="navigate('login')">登录查看</button></view>
      <view v-else-if="!requestId" class="detail-empty">未选择假条，请返回服务记录。</view>
      <view v-if="loading && !record" class="detail-empty" role="status">正在读取假条…</view>
      <view v-if="error" class="detail-error" role="alert">{{ error }}<button role="button" :disabled="loading || busy" @click="refresh">重新读取</button></view>
      <template v-if="record">
        <view class="detail-status" :class="record.status"><text class="detail-status-eyebrow">当前办理状态</text><text class="detail-status-title">{{ leaveStatusLabel[record.status] }}</text><text class="detail-status-copy">{{ statusDescription }}</text></view>
        <view class="detail-section"><text class="detail-section-title">审批流程</text><view class="leave-progress" aria-label="请假审批流程"><view v-for="(step, index) in steps" :key="step.title" class="leave-progress-step" :class="step.tone"><view class="leave-step-dot">{{ step.tone === 'done' ? '✓' : index + 1 }}</view><text class="leave-step-title">{{ step.title }}</text><text class="leave-step-copy">{{ step.detail }}</text></view></view></view>
        <view v-for="section in sections" :key="section.title" class="detail-section"><text class="detail-section-title">{{ section.title }}</text><view class="leave-detail-fields"><view v-for="field in section.fields" :key="field[0]" class="leave-detail-row"><text class="leave-detail-label">{{ field[0] }}</text><text class="leave-detail-value" selectable>{{ field[1] }}</text></view></view></view>
        <view class="detail-section"><text class="detail-section-title">操作记录</text><view class="leave-event-list"><view v-for="(event, index) in events" :key="index" class="leave-event"><view class="leave-event-dot" :class="event.action" /><view><text class="leave-event-title">{{ leaveActionLabel[event.action] }}</text><text class="leave-event-meta">{{ event.actor }} · {{ time(event.at) }}</text><text v-if="event.reason" class="leave-event-reason">{{ event.reason }}</text></view></view></view></view>
      </template>
    </view>
    <view v-if="record && (canWithdraw || canCancel || record.status === 'withdrawn')" class="leave-detail-actions">
      <button v-if="canCancel" role="button" class="detail-cancel" :disabled="busy || loading" :aria-disabled="busy || loading" @click="act('cancel')">取消申请</button>
      <button v-if="canComplete" role="button" class="detail-primary" :disabled="busy || loading" :aria-disabled="busy || loading" @click="act('complete')">{{ busy ? '处理中…' : '核销假条' }}</button>
      <button v-if="canWithdraw" role="button" class="detail-primary" :disabled="busy || loading" :aria-disabled="busy || loading" @click="act('withdraw')">{{ busy ? '处理中…' : record.status === 'rejected' ? '修改后重提' : '撤回修改' }}</button>
      <button v-if="record.status === 'withdrawn'" role="button" class="detail-primary" :disabled="busy || loading" :aria-disabled="busy || loading" @click="edit">继续修改</button>
    </view>
    <LeaveActionSheet v-if="actionContext" :action="actionContext.action" :record="actionContext.record" :busy="busy" :error="actionError" @close="closeAction" @confirm="confirmAction" />
  </view>
</template>
<style scoped>
.leave-detail-page { min-height:100vh; background:#f5f7fb; color:#2c3c57; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif; padding-top:env(safe-area-inset-top); }
.leave-detail-header { display:flex; align-items:center; gap:9px; min-height:72px; padding:10px 16px 10px 10px; background:#fff; border-bottom:1px solid #e8edf5; position:sticky; top:0; z-index:5; }
.leave-detail-page :is(button,uni-button) { font-family:inherit; }
.leave-detail-page :is(button,uni-button)::after { border:0; }
.leave-detail-page .detail-back { display:flex; align-items:center; justify-content:center; width:44px; height:44px; margin:0; padding:0; border:0; background:transparent; flex:none; }
.detail-chevron { width:10px; height:10px; border-left:2px solid #35486f; border-bottom:2px solid #35486f; transform:rotate(45deg); }
.detail-page-title { display:block; font-size:18px; font-weight:650; }
.detail-subtitle { display:block; margin-top:4px; font-size:10px; color:#8e9bb0; }
.leave-detail-page .detail-refresh { margin:0 0 0 auto; padding:12px 0 12px 12px; min-height:44px; font-size:12px; line-height:20px; background:transparent; color:var(--brand); }
.leave-detail-content { max-width:640px; margin:0 auto; padding:20px 16px calc(110px + env(safe-area-inset-bottom)); }
.detail-status { padding:22px; border:1px solid #e0e7f3; border-radius:18px; background:#eef2fc; margin-bottom:20px; }
.detail-status.approved,.detail-status.completed { background:#edf8f3; border-color:#dfede7; }
.detail-status.completed .detail-status-title { color:#4b8f7d; }
.detail-status.rejected { background:#fcf1ef; border-color:#f0e1dd; }
.detail-status.cancelled,.detail-status.withdrawn { background:#f0f2f7; }
.detail-status-eyebrow { display:block; font-size:11px; color:#8794ab; }
.detail-status-title { display:block; margin:8px 0; font-size:25px; font-weight:650; color:var(--brand); }
.detail-status-copy { display:block; font-size:12px; line-height:1.9; color:#73819a; }
.detail-section { margin-bottom:20px; }
.detail-section-title { display:block; margin:0 2px 10px; font-size:14px; font-weight:600; }
.leave-progress { display:flex; padding:20px 10px; border:1px solid #e7ecf4; border-radius:16px; background:#fff; }
.leave-progress-step { flex:1; min-width:0; position:relative; text-align:center; }
.leave-progress-step:not(:last-child)::after { content:''; position:absolute; height:1px; top:13px; left:calc(50% + 20px); right:calc(-50% + 20px); background:#e3e8f1; }
.leave-step-dot { display:flex; align-items:center; justify-content:center; width:27px; height:27px; margin:0 auto 10px; border-radius:50%; background:#f0f3f8; color:#a1acbd; font-size:12px; }
.done .leave-step-dot { color:#4b8f7d; background:#e8f5ef; }
.current .leave-step-dot { color:white; background:var(--brand); box-shadow:0 0 0 4px #eef1fa; }
.rejected .leave-step-dot { color:#b16f63; background:#fceeea; }
.leave-step-title { display:block; font-size:12px; color:#566681; }
.leave-step-copy { display:block; margin-top:5px; font-size:10px; color:#98a2b4; }
.leave-detail-fields { padding:2px 16px; border:1px solid #e7ecf4; border-radius:16px; background:#fff; }
.leave-detail-row { display:flex; align-items:flex-start; gap:14px; padding:14px 0; border-bottom:1px solid #f0f3f8; line-height:1.8; }
.leave-detail-row:last-child { border-bottom:0; }
.leave-detail-label { flex:0 0 100px; font-size:12px; color:#8b97ab; }
.leave-detail-value { flex:1; min-width:0; color:#455773; font-size:13px; white-space:pre-wrap; overflow-wrap:anywhere; text-align:right; }
.leave-event-list { padding:20px 18px 0; border:1px solid #e7ecf4; border-radius:16px; background:#fff; }
.leave-event { display:flex; gap:12px; padding-bottom:22px; position:relative; }
.leave-event:not(:last-child)::before { content:''; position:absolute; left:4px; top:12px; bottom:0; width:1px; background:#e5eaf3; }
.leave-event-dot { flex:none; width:9px; height:9px; margin-top:5px; border-radius:50%; background:#8497c3; }
.leave-event-dot.approved,.leave-event-dot.completed { background:#7aaf9d; }
.leave-event-dot.rejected { background:#d2a395; }
.leave-event-title { display:block; font-size:13px; font-weight:500; }
.leave-event-meta { display:block; margin-top:5px; color:#909caf; font-size:10px; line-height:1.7; }
.leave-event-reason { display:block; margin-top:8px; color:#9a7869; font-size:12px; line-height:1.8; }
.leave-detail-actions { position:fixed; bottom:0; left:0; right:0; max-width:640px; margin:0 auto; display:flex; gap:12px; padding:14px 18px calc(14px + env(safe-area-inset-bottom)); background:#fff; border-top:1px solid #e7ecf4; z-index:6; }
.leave-detail-page .leave-detail-actions :is(button,uni-button) { display:flex; flex:1; align-items:center; justify-content:center; min-height:46px; margin:0; padding:12px; border-radius:12px; font-size:14px; line-height:1.5; }
.leave-detail-page .detail-cancel { border:1px solid #e0e5ef; color:#7e8ba1; background:#fff; }
.leave-detail-page .detail-primary { border:1px solid var(--brand); color:#fff; background:var(--brand); }
.leave-detail-page :is(button,uni-button)[disabled] { opacity:.5; }
.detail-empty,.detail-error { padding:20px; font-size:13px; line-height:1.8; text-align:center; color:#8a96aa; }
.detail-error { border:1px solid #efdcd4; border-radius:14px; background:#fff7f2; color:#a47c65; margin-bottom:16px; }
.leave-detail-page .detail-error :is(button,uni-button),.leave-detail-page .detail-empty :is(button,uni-button) { font-size:13px; color:var(--brand); padding:12px; background:transparent; }
@media(max-width:360px) { .leave-detail-label { flex-basis:90px; } .leave-detail-fields { padding-inline:13px; } .leave-detail-content { padding-inline:13px; } }
</style>

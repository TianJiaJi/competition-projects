<script setup lang="ts">
import { computed } from 'vue';
import { formatLeaveRange, leaveStatusLabel, type LeaveRequest } from '@scene/bookings';
import FormSheet from './FormSheet.vue';
type LeaveSheetAction = 'withdraw' | 'cancel' | 'complete';
const props = defineProps<{ action: LeaveSheetAction; record: LeaveRequest; busy: boolean; error?: string }>();
const emit = defineEmits<{ close: []; confirm: [] }>();
const copy = computed(() => ({
  complete: { title: '核销假条', subtitle: '请假办理的最后一步', heading: '已返校，结束这次请假', description: '请确认你已返校或已结束请假。核销后，本次申请将正常完结。', next: '已完结', note: '核销后不能修改或取消，申请和审批记录会保留。', confirm: '确认核销', icon: 'check' },
  cancel: { title: '取消申请', subtitle: '结束本次申请，不再使用假条', heading: '确定不再使用这份假条？', description: '取消后，本次申请立即结束，不再继续审批或核销。', next: '已取消', note: '取消后不能恢复，原表单与操作记录仍可查看。', confirm: '确认取消', icon: 'cross' },
  withdraw: { title: '撤回修改', subtitle: '保留已填信息，修改后重新审核', heading: '先撤回，再修改', description: '撤回后暂停教师审核，系统会带入原表单，方便你继续修改。', next: '已撤回', note: '修改完成后，需要重新提交，才能再次进入教师审核。', confirm: '确认撤回', icon: 'return' },
})[props.action]);
</script>
<template>
  <FormSheet class="leave-action-sheet" :class="action" :title="copy.title" :description="copy.subtitle" close-label="关闭确认面板" :locked="busy" @close="emit('close')">
    <view class="action-intro"><view class="action-symbol" :class="copy.icon" aria-hidden="true"><text v-if="copy.icon === 'return'">↶</text><view v-else /></view><view><text class="action-heading">{{ copy.heading }}</text><text class="action-description">{{ copy.description }}</text></view></view>
    <view class="action-record">
      <view class="action-record-heading"><text class="action-record-title">{{ record.type }}申请</text><text class="action-record-owner">{{ record.owner }}</text></view>
      <text class="action-record-time">{{ formatLeaveRange(record) }}</text>
      <view class="action-transition"><text>{{ leaveStatusLabel[record.status] }}</text><text class="action-transition-arrow" aria-hidden="true">→</text><text class="action-next">{{ copy.next }}</text></view>
    </view>
    <view class="action-notice"><view class="action-notice-dot" /><text>{{ copy.note }}</text></view>
    <view v-if="error" class="action-error" role="alert">{{ error }}</view>
    <template #footer><view class="action-footer"><button role="button" class="action-dismiss" :disabled="busy" :aria-disabled="busy" @click="emit('close')">暂不操作</button><button role="button" class="action-confirm" :disabled="busy" :aria-disabled="busy" @click="emit('confirm')"><view v-if="busy" class="action-loader" aria-hidden="true" />{{ busy ? '正在处理…' : copy.confirm }}</button></view></template>
  </FormSheet>
</template>
<style scoped>
.leave-action-sheet { background:#17233f52; backdrop-filter:blur(3px); }
.leave-action-sheet :deep(.campus-sheet) { max-width:500px; border-radius:24px 24px 0 0; box-shadow:0 -12px 50px #1d2c4b18; font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif; }
.leave-action-sheet :deep(.sheet-heading) { align-items:center; padding:21px 22px 18px; border-bottom:1px solid #eff2f7; }
.leave-action-sheet :deep(.sheet-title) { font-size:18px; font-weight:650; color:#2e3e5b; }
.leave-action-sheet :deep(.sheet-description) { margin-top:5px; font-size:11px; color:#939fb3; }
.leave-action-sheet :deep(.sheet-close) { display:flex; align-items:center; justify-content:center; flex:none; width:36px; height:36px; min-height:36px; margin:0; padding:0; border:0; border-radius:12px; background:#f4f6fa; color:#95a1b6; font-size:23px; line-height:1; }
.leave-action-sheet :deep(.sheet-body) { padding:22px 22px 20px; }
.leave-action-sheet :deep(.sheet-footer) { padding:17px 22px calc(18px + env(safe-area-inset-bottom)); border-top:1px solid #edf0f7; }
.leave-action-sheet :deep(uni-button)::after,.leave-action-sheet :deep(button)::after { border:0; }
.leave-action-sheet :deep([role="button"]:focus-visible) { outline:2px solid #8092bd; outline-offset:3px; }
.action-intro { display:flex; align-items:flex-start; gap:13px; }
.action-symbol { display:flex; align-items:center; justify-content:center; flex:none; width:45px; height:45px; border-radius:15px; background:#edf2fb; color:var(--brand,#485d98); }
.action-symbol.check { background:#eaf5f0; }
.action-symbol.check > :is(view,uni-view) { width:16px; height:9px; border-left:2px solid #5f9985; border-bottom:2px solid #5f9985; transform:translateY(-2px) rotate(-45deg); }
.action-symbol.cross { background:#fcf0ed; }
.action-symbol.cross > :is(view,uni-view) { position:relative; width:17px; height:17px; }
.action-symbol.cross > :is(view,uni-view)::before,.action-symbol.cross > :is(view,uni-view)::after { content:''; position:absolute; top:8px; left:0; width:17px; height:2px; background:#b87f74; border-radius:2px; transform:rotate(45deg); }
.action-symbol.cross > :is(view,uni-view)::after { transform:rotate(-45deg); }
.action-symbol.return { font-size:28px; line-height:1; }
.action-heading { display:block; margin:1px 0 7px; color:#354662; font-size:16px; font-weight:600; line-height:1.5; }
.action-description { display:block; color:#8a96aa; font-size:12px; line-height:1.85; }
.action-record { margin-top:22px; padding:16px; border:1px solid #e8edf6; border-radius:15px; background:#f7f9fd; }
.action-record-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.action-record-title { color:#536581; font-size:13px; font-weight:600; }
.action-record-owner { color:#8e9ab0; font-size:11px; }
.action-record-time { display:block; margin-top:8px; color:#929fb4; font-size:11px; line-height:1.85; overflow-wrap:anywhere; }
.action-transition { display:flex; align-items:center; gap:12px; margin-top:13px; padding-top:12px; border-top:1px solid #e9edf5; font-size:11px; color:#97a3b7; }
.action-transition-arrow { color:#b6c0d2; }
.action-next { padding:3px 9px; border-radius:6px; background:#eaf0fb; color:var(--brand,#485d98); font-weight:500; }
.complete .action-next { color:#5d927e; background:#e5f2eb; }
.cancel .action-next { color:#b17c70; background:#faece6; }
.action-notice { display:flex; align-items:flex-start; gap:8px; margin:16px 2px 0; color:#9ba5b7; font-size:11px; line-height:1.85; }
.action-notice-dot { width:4px; height:4px; margin-top:8px; flex:none; border-radius:50%; background:#b0bcd1; }
.action-footer { display:grid; grid-template-columns:1fr 1.5fr; gap:12px; }
.leave-action-sheet .action-footer :is(button,uni-button) { display:flex; align-items:center; justify-content:center; gap:9px; min-height:47px; margin:0; padding:12px; border-radius:13px; font:inherit; font-size:14px; line-height:1.6; }
.leave-action-sheet .action-dismiss { border:1px solid #e3e8f2; background:#fff; color:#8a98ae; }
.leave-action-sheet .action-confirm { border:1px solid var(--brand,#485d98); background:var(--brand,#485d98); color:#fff; }
.leave-action-sheet.cancel .action-confirm { background:#ad756c; border-color:#ad756c; }
.leave-action-sheet :is(button,uni-button)[disabled] { opacity:.55; }
.action-error { padding:12px; margin-top:14px; border:1px solid #eedbd5; border-radius:10px; background:#fff6f2; color:#a67b6b; font-size:12px; line-height:1.8; }
.action-loader { width:14px; height:14px; border:2px solid #ffffff55; border-top-color:#fff; border-radius:50%; animation:action-spin .9s linear infinite; }
@keyframes action-spin { to { transform:rotate(360deg); } }
@media(min-width:700px) { .leave-action-sheet :deep(.campus-sheet) { border-radius:24px; max-width:440px; } }
@media(max-width:360px) { .leave-action-sheet :deep(.sheet-heading),.leave-action-sheet :deep(.sheet-body),.leave-action-sheet :deep(.sheet-footer) { padding-inline:18px; } .action-heading { font-size:15px; } }
@media(prefers-reduced-motion:reduce) { .action-loader { animation:none; } }
</style>

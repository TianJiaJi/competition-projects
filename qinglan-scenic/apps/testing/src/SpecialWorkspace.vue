<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ArrowRight, Check, CheckCheck, FileText, Fingerprint, LockKeyhole, Package, Play, RefreshCw, RotateCcw, ShieldCheck, Users, Workflow, LoaderCircle } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";
import { businessMetrics, definition, scenarios, type ScenarioEvent, type ScenarioId, type ScenarioRuns } from "./special-engine";
const props = defineProps<{ runs: ScenarioRuns; busy: boolean; busyId: ScenarioId | null }>();
const emit = defineEmits<{ advance: [id: ScenarioId, step: number]; reset: [id: ScenarioId, parameter?: string]; report: [] }>();
const selected = ref<ScenarioId>("claim"), selectedEvent = ref<ScenarioEvent | null>(null);
const run = computed(() => props.runs[selected.value]), info = computed(() => definition(selected.value));
const icons = { claim: Users, duplicate: Fingerprint, stock: Package, permission: ShieldCheck, retry: RefreshCw, callback: Workflow };
const completed = computed(() => Object.values(props.runs).filter(run => run.step === 3).length);
const checks = computed(() => Object.values(props.runs).flatMap(run => run.assertions));
const metrics = computed(() => businessMetrics(run.value));
const recentEvents = computed(() => [...run.value.events].reverse());
const processing = computed(() => props.busyId === selected.value);
const passing = computed(() => run.value.step === 3 && run.value.assertions.every(check => check.passed));
const processed = computed(() => run.value.requests.filter(request => !["queued", "processing"].includes(request.status)).length);
const contested = computed(() => ["claim", "stock"].includes(selected.value));
const successfulRequest = computed(() => contested.value ? run.value.requests.find(request => request.status === "accepted") : undefined);
const orderedRequests = computed(() => {
  const requests = new Map(run.value.requests.map(request => [request.id, request]));
  return run.value.acceptanceOrder.map(id => requests.get(id)!);
});
const status = (step: number) => step === 3 ? "已核验" : step ? "进行中" : "待开始";
const time = (at: string) => `${new Date(at).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}.${String(new Date(at).getMilliseconds()).padStart(3, "0")}`;
const json = (value: unknown) => JSON.stringify(value, null, 2);
const stateLabels: Record<string, string> = { orderId: "订单编号", owner: "订单持有人", stock: "库存", minStock: "最低库存", version: "版本", orderState: "订单状态", claimRecords: "领取记录", orders: "创建订单", writes: "业务写入", responseIds: "返回订单编号", denied: "权限拦截", sensitiveFields: "返回敏感字段", staleIgnored: "保护旧消息" };
watch(() => run.value.id, () => { selectedEvent.value = null; });
function inspectRequest(id: string) { selectedEvent.value = [...run.value.events].reverse().find(event => event.requestId === id) || null; }
</script>

<template>
  <section class="special-workspace" aria-label="专项验证工作区">
    <div class="scenario-picker" role="group" aria-label="选择专项场景">
      <button v-for="scenario in scenarios" :key="scenario.id" :aria-label="scenario.name" :aria-pressed="selected === scenario.id" :disabled="busy" :class="{ selected: selected === scenario.id }" @click="selected = scenario.id">
        <component :is="icons[scenario.id]" :size="18" />
        <span><b>{{ scenario.name }}</b><small>{{ scenario.short }}</small></span>
        <i :class="{ done: runs[scenario.id].step === 3 }">{{ status(runs[scenario.id].step) }}</i>
      </button>
    </div>
    <div class="special-summary">
      <span><CheckCheck :size="16" />已核验 <b>{{ completed }} / 6</b> 项 <em>·</em> 断言通过 <b>{{ checks.filter(check => check.passed).length }} / {{ checks.length }}</b></span>
      <button class="secondary small" :disabled="busy || completed === 0" @click="emit('report')"><FileText :size="15" />生成专项验收报告</button>
    </div>
    <div class="special-columns">
      <section class="scenario-board panel" :aria-label="`${info.name}操作区`">
        <div class="scenario-heading">
          <div><h2><component :is="icons[selected]" :size="19" />{{ info.name }}</h2><p>{{ info.description }}</p></div>
          <label>{{ info.parameter }}<select aria-label="场景参数" :value="run.parameter" :disabled="busy" @change="emit('reset', selected, ($event.target as HTMLSelectElement).value)"><option v-for="option in info.options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        </div>
        <div class="resource-state">
          <div class="resource-heading"><span><LockKeyhole :size="15" />{{ info.resource }}</span><code>{{ run.state.orderId }}</code><span class="resource-status">{{ run.state.orderState }}</span></div>
          <div class="business-metrics">
            <article v-for="metric in metrics" :key="metric.label"><span>{{ metric.label }}</span><Transition name="state-update" mode="out-in"><strong :key="String(metric.value)">{{ metric.value }}</strong></Transition></article>
          </div>
        </div>
        <div class="request-lane">
          <div class="lane-heading"><span>参与请求 <b>{{ processed }} / {{ run.requests.length }}</b><small v-if="contested && run.requests.length"> · 按受理顺序</small></span><button v-if="successfulRequest" class="request-success" :aria-label="`查看${successfulRequest.actor}的${successfulRequest.result}记录`" @click="inspectRequest(successfulRequest.id)"><Check :size="12" />{{ successfulRequest.actor }} · {{ successfulRequest.result }}<ArrowRight :size="12" /></button><small v-else>{{ processing ? '正在执行当前操作' : run.step ? '点击请求可查看处理记录' : '准备条件后显示请求队列' }}</small></div>
          <div class="request-grid" v-if="run.requests.length" :key="run.id">
            <button v-for="request in orderedRequests" :key="request.id" :class="['request-token', request.status]" :disabled="['queued', 'processing'].includes(request.status)" :aria-label="`${request.actor} ${request.action} ${request.result}`" @click="inspectRequest(request.id)">
              <LoaderCircle v-if="request.status === 'processing'" class="spinning" :size="14" /><Check v-else-if="request.status === 'accepted'" :size="14" /><ShieldCheck v-else-if="['protected', 'reused'].includes(request.status)" :size="14" /><Users v-else :size="14" />
              <span><b>{{ request.actor }}<em v-if="['duplicate', 'retry', 'callback'].includes(selected)"> · {{ request.action }}</em></b><small>{{ request.result }}</small></span>
            </button>
          </div>
          <div v-else class="queue-empty"><Workflow :size="25" /><span>准备账户、业务资源和本轮请求</span></div>
        </div>
        <div class="scenario-controls">
          <ol class="scenario-steps" aria-label="验证步骤"><li v-for="(label, index) in ['准备条件', '触发操作', '核验结果']" :key="label" :class="{ finished: run.step > index, current: run.step === index }"><Check v-if="run.step > index" :size="12" /><b v-else>{{ index + 1 }}</b><span>{{ label }}</span><ArrowRight v-if="index < 2" :size="12" /></li></ol>
          <div class="scenario-buttons">
            <button class="secondary" :disabled="busy || run.step === 0" @click="emit('reset', selected)"><RotateCcw :size="14" />重新运行</button>
            <button class="primary scenario-next" :disabled="busy || run.step === 3" @click="emit('advance', selected, run.step)"><LoaderCircle v-if="processing" class="spinning" :size="15" /><Play v-else-if="run.step < 3" :size="14" /><CheckCheck v-else :size="16" />{{ processing ? '正在处理…' : run.step === 3 ? '本场核验完成' : info.actions[run.step] }}</button>
          </div>
        </div>
        <div class="scenario-verdict" :class="{ passing, review: run.step === 3 && !passing }" aria-live="polite">
          <template v-if="run.step === 3"><strong><ShieldCheck :size="16" />{{ passing ? '验证通过' : '请复核本轮记录' }}</strong><span v-for="check in run.assertions" :key="check.label">{{ check.label }} <b>{{ check.actual }}</b></span></template>
          <template v-else><ShieldCheck :size="16" /><span>{{ run.step === 2 ? '处理记录已就绪，点击核验结果检查业务状态。' : '业务状态与处理记录同步更新，完成操作后核验结果。' }}</span></template>
        </div>
      </section>
      <section class="scenario-ledger panel" aria-label="请求流水">
        <header><h2><Workflow :size="18" />请求流水</h2><span>{{ run.events.length }} 条</span></header>
        <div class="ledger-body" :key="run.id">
          <div v-if="!run.events.length" class="ledger-empty"><Fingerprint :size="31" /><strong>每一次处理，都有记录</strong><p>操作后查看请求编号、处理结果和数据变化。</p></div>
          <button v-for="event in recentEvents" :key="event.id" class="ledger-entry" :class="event.decision" @click="selectedEvent = event">
            <div><time>{{ time(event.at) }}</time><small>{{ event.actor }}</small><ArrowRight :size="12" /></div>
            <b>{{ event.result }}</b><code>{{ event.requestId === '—' ? event.action : event.requestId }}</code>
          </button>
        </div>
        <footer><span class="ledger-dot" />{{ processing ? '正在追加运行记录' : '记录已同步' }}<small>点击任意记录查看证据</small></footer>
      </section>
    </div>
    <ModalFrame v-if="selectedEvent" title="请求处理详情" wide @close="selectedEvent = null">
      <div class="special-evidence">
        <div class="evidence-intro"><strong>{{ selectedEvent.result }}</strong><span>{{ selectedEvent.actor }} · {{ time(selectedEvent.at) }}</span><code>{{ selectedEvent.requestId }}</code></div>
        <div class="evidence-json"><section><h3>请求输入</h3><pre>{{ json(selectedEvent.input) }}</pre></section><section><h3>处理响应</h3><pre>{{ json(selectedEvent.response) }}</pre></section></div>
        <h3>业务状态前后对照</h3><div class="evidence-table"><table><thead><tr><th>字段</th><th>处理前</th><th>处理后</th></tr></thead><tbody><tr v-for="(label, key) in stateLabels" :key="key" :class="{ changed: json(selectedEvent.before[key as keyof typeof selectedEvent.before]) !== json(selectedEvent.after[key as keyof typeof selectedEvent.after]) }"><th>{{ label }}</th><td>{{ json(selectedEvent.before[key as keyof typeof selectedEvent.before]) }}</td><td>{{ json(selectedEvent.after[key as keyof typeof selectedEvent.after]) }}</td></tr></tbody></table></div>
      </div>
    </ModalFrame>
  </section>
</template>

<style scoped>
.special-workspace { --ink: #285d48; --muted: #829078; }
.scenario-picker { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 8px; }
.scenario-picker button { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border: 1px solid #e0e8da; border-radius: 10px; background: #fff; padding: 12px; color: #76896f; text-align: left; cursor: pointer; min-width: 0; }
.scenario-picker button.selected { background: #eff5e9; border-color: #7fa079; color: var(--ink); box-shadow: inset 0 0 0 1px #7fa079; }
.scenario-picker b { display: block; font-size: 12px; font-weight: 500; }
.scenario-picker small { display: block; font-size: 9px; margin-top: 5px; color: #91a085; }
.scenario-picker i { font: 9px var(--mono); margin-left: auto; color: #94a18b; }
.scenario-picker i.done { color: #397b56; }
.special-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; font-size: 11px; color: var(--muted); }
.special-summary > span { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.special-summary b { color: var(--ink); font-family: var(--mono); font-weight: 500; }
.special-summary em { font-style: normal; color: #c0cab9; }
.special-columns { display: grid; grid-template-columns: minmax(0,1.8fr) minmax(270px,1fr); gap: 16px; }
.scenario-board { min-width: 0; overflow: hidden; }
.scenario-heading { display: flex; justify-content: space-between; gap: 15px; padding: 20px 20px 16px; }
h2 { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; color: var(--ink); margin: 0; }
.scenario-heading p { font-size: 11px; color: var(--muted); line-height: 1.7; margin-top: 7px; }
.scenario-heading label { display: grid; flex-shrink: 0; gap: 6px; font-size: 10px; color: var(--muted); }
.scenario-heading select { border: 1px solid #dce5d5; padding: 6px 8px; border-radius: 6px; color: #496c4b; background: #fff; font-size: 11px; min-width: 100px; }
.resource-state { margin: 0 20px; background: #f5f8f0; border: 1px solid #e2eadb; border-radius: 9px; padding: 13px 15px; }
.resource-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; font-size: 10px; color: #859778; }
.resource-heading > span:first-child { display: flex; align-items: center; gap: 6px; color: #55784e; }
.resource-heading code { font: 9px var(--mono); }
.resource-status { margin-left: auto; background: #e8f0df; color: #648651; padding: 4px 7px; border-radius: 4px; }
.business-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; margin-top: 15px; }
.business-metrics article > span { display: block; font-size: 10px; color: var(--muted); }
.business-metrics strong { display: inline-block; font: 25px var(--mono); color: var(--ink); padding: 4px 0; min-height: 36px; }
.request-lane { padding: 16px 20px; }
.lane-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 11px; color: #708468; margin-bottom: 9px; }
.lane-heading b { font: 11px var(--mono); margin-left: 7px; }
.lane-heading small { font-size: 9px; color: #98a58e; }
.request-success { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #bbd4a8; border-radius: 4px; padding: 2px 6px; background: #eaf4e4; color: #3f7039; font-family: inherit; font-size: 10px; line-height: 14px; cursor: pointer; white-space: nowrap; }
.request-success:hover { background: #deecd5; }.request-success:focus-visible { outline: 2px solid #527d41; outline-offset: 2px; }
.request-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; height: 103px; overflow: auto; align-content: start; }
.request-token { display: flex; align-items: center; gap: 7px; border: 1px solid #e7ede2; background: #fbfcf9; border-radius: 6px; text-align: left; padding: 8px; color: #8a9880; cursor: pointer; min-width: 0; transition: background .2s, border-color .2s; }
.request-token svg { flex-shrink: 0; }
.request-token b { font-size: 10px; font-weight: 500; display: block; }
.request-token em { font-size: 9px; font-style: normal; }
.request-token small { display: block; font-size: 9px; margin-top: 4px; }
.request-token.accepted { background: #eaf4e4; border-color: #bbd4a8; color: #527d41; }
.request-token.protected, .request-token.reused { background: #f7f3e8; border-color: #e9ddba; color: #9c843d; }
.request-token.processing { color: #376979; border-color: #82b1bc; background: #ebf4f5; }
.request-token:disabled { opacity: 1; cursor: default; }
.queue-empty { height: 103px; display: flex; align-items: center; justify-content: center; gap: 12px; border: 1px dashed #dfe7d8; border-radius: 6px; color: #a0ad97; font-size: 11px; }
.scenario-controls { border-top: 1px solid #e7edde; padding: 13px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.scenario-steps { display: flex; gap: 8px; list-style: none; padding: 0; margin: 0; color: #a3af98; font-size: 10px; }
.scenario-steps li { display: flex; gap: 4px; align-items: center; white-space: nowrap; }
.scenario-steps b { font: 10px var(--mono); }
.scenario-steps .current { color: #8a7438; }.scenario-steps .finished { color: #5a844a; }
.scenario-buttons { display: flex; gap: 8px; }.scenario-buttons button { font-size: 11px; padding: 10px 11px; white-space: nowrap; }
.scenario-verdict { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 15px; padding: 12px 20px; min-height: 42px; font-size: 10px; background: #f7f9f3; color: #8c9b7f; }
.scenario-verdict.passing { background: #eaf4e4; color: #60814d; }.scenario-verdict.review { background: #fff5df; color: #8c7136; }
.scenario-verdict strong { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; }
.scenario-verdict b { font: 12px var(--mono); padding-left: 4px; }
.scenario-ledger { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.scenario-ledger header { display: flex; align-items: center; justify-content: space-between; padding: 20px 18px 15px; border-bottom: 1px solid #e7edde; }
.scenario-ledger header > span { color: #91a085; font: 10px var(--mono); }
.ledger-body { height: 340px; flex: 1 1 0; min-height: 200px; overflow: auto; padding: 4px 15px; }
.ledger-entry { display: block; width: 100%; border: 0; border-bottom: 1px solid #e8eee2; border-left: 2px solid transparent; background: transparent; padding: 10px 8px; text-align: left; cursor: pointer; animation: entry-in .18s ease-out; }
.ledger-entry:hover { background: #f5f8f0; }.ledger-entry.accepted { border-left-color: #8dbd7d; }.ledger-entry.protected,.ledger-entry.reused { border-left-color: #c9ae6c; }
.ledger-entry > div { display: flex; align-items: center; gap: 7px; color: #94a18b; font-size: 9px; }.ledger-entry time { font-family: var(--mono); }.ledger-entry small { margin-left: auto; }
.ledger-entry b { display: block; font-size: 11px; font-weight: 500; color: #5a764e; margin-top: 6px; }
.ledger-entry code { display: block; font: 9px var(--mono); color: #9aa78f; margin-top: 4px; }
.ledger-empty { min-height: 250px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; color: #a0ad98; }.ledger-empty strong { font-size: 12px; font-weight: 400; }.ledger-empty p { font-size: 10px; text-align: center; line-height: 1.8; }
.scenario-ledger footer { display: flex; align-items: center; gap: 6px; padding: 13px 17px; border-top: 1px solid #e7edde; color: #91a185; font-size: 9px; }.scenario-ledger footer small { margin-left: auto; font-size: 9px; }.ledger-dot { width: 5px; height: 5px; border-radius: 50%; background: #91b381; }
.spinning { animation: spin 1s linear infinite; }.state-update-enter-active { animation: state-pop .3s ease-out; }.state-update-leave-active { transition: opacity .06s; }.state-update-leave-to { opacity: 0; }
@keyframes spin { to { transform: rotate(360deg); } }@keyframes state-pop { from { background: #d9edc9; transform: translateY(2px); } to { background: transparent; transform: translateY(0); } }@keyframes entry-in { from { opacity: .3; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
.special-evidence { min-height: 0; overflow: auto; padding: 24px; }.evidence-intro { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; color: #7b9170; font-size: 12px; }.evidence-intro strong { color: #365e46; }.evidence-intro code { font-size: 11px; }
.evidence-json { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; }.special-evidence h3 { font-size: 12px; font-weight: 500; color: #59764d; margin: 16px 0 10px; }.special-evidence pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.8 var(--mono); padding: 15px; background: #f5f8f0; border-radius: 7px; color: #708266; }.evidence-table { overflow: auto; }.evidence-table table { width: 100%; font-size: 11px; border-collapse: collapse; table-layout: fixed; }.evidence-table th,.evidence-table td { text-align: left; border-bottom: 1px solid #e3eadc; padding: 10px; overflow-wrap: anywhere; color: #7a8c6d; }.evidence-table th { font-weight: 500; }.evidence-table .changed td { background: #eef5e5; color: #477037; }
@media (max-width: 1450px) { .scenario-heading { padding-top: 15px; }.business-metrics strong { font-size: 23px; } }
@media (max-width: 1000px) { .scenario-picker { grid-template-columns: repeat(3,minmax(0,1fr)); }.special-columns { grid-template-columns: minmax(0,1fr); }.ledger-body { flex-basis: auto; height: 300px; }.scenario-picker i { width: auto; padding-left: 0; } }
@media (max-width: 600px) { .scenario-picker { grid-template-columns: repeat(2,minmax(0,1fr)); }.special-summary { flex-wrap: wrap; }.scenario-heading { flex-wrap: wrap; padding-inline: 14px; }.scenario-heading label { display: flex; align-items: center; }.resource-state { margin-inline: 14px; }.resource-heading code { font-size: 8px; }.request-lane,.scenario-controls { padding-inline: 14px; }.business-metrics strong { font-size: 20px; }.lane-heading { flex-wrap: wrap; }.scenario-controls { flex-wrap: wrap; }.scenario-buttons { width: 100%; }.scenario-steps { gap: 12px; }.scenario-buttons button { flex: 1; }.scenario-verdict { padding-inline: 14px; }.evidence-json { grid-template-columns: 1fr; }.special-evidence { padding: 16px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
</style>

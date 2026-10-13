<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { ArrowRight, Check, FileCode2, Layers3, LoaderCircle, Radar, Server, ShieldCheck } from "lucide-vue-next";
import { publishedPlatforms } from "./service-catalog";
import { discoverServices, type DiscoveryEvent } from "./service-discovery";
import type { SystemConfig } from "./types";
const props = defineProps<{ systems: SystemConfig[] }>();
const emit = defineEmits<{ register: [systems: SystemConfig[]]; busy: [busy: boolean]; select: [id: string] }>();
const scanning = ref(false), events = ref<DiscoveryEvent[]>([]), message = ref("");
let controller: AbortController | undefined, disposed = false;
const registered = (id: string) => props.systems.find(system => system.id === id || system.registration?.manifestId === id);
const visiblePlatforms = computed(() => publishedPlatforms.filter(platform => registered(platform.id) || events.value.some(event => event.platformId === platform.id)));
const registeredCount = computed(() => publishedPlatforms.filter(platform => registered(platform.id)).length);
const status = (id: string) => registered(id) ? "已纳入测试" : ({ found: "已发现", validated: "契约已校验", ready: "待纳入目录", limit: "目录已满", rejected: "待核对", existing: "已纳入测试", registered: "已纳入测试" })[[...events.value].reverse().find(event => event.platformId === id)?.stage || "found"];
const time = (at: string) => new Date(at).toLocaleTimeString("zh-CN", { hour12: false });
async function scan() {
  if (scanning.value) return;
  const task = new AbortController(); controller = task;
  scanning.value = true; emit("busy", true); events.value = []; message.value = "";
  try {
    const additions = await discoverServices(props.systems, task.signal, event => { if (!disposed) events.value.push(event); });
    if (disposed || task.signal.aborted) return;
    emit("register", additions);
    for (const system of additions) events.value.push({ platformId: system.id, stage: "registered", at: new Date().toISOString(), message: `${system.endpoints.length} 项接口已加入测试目录` });
    message.value = additions.length ? `已自动接入 ${additions.length} 个新平台，可直接选择服务开展测试。` : "本轮未新增服务，已有配置保持不变。";
  } catch (error) {
    if (!task.signal.aborted && !disposed) message.value = error instanceof Error ? error.message : "本轮发现已停止，请重试。";
  } finally { if (!disposed) { scanning.value = false; emit("busy", false); } }
}
onBeforeUnmount(() => { disposed = true; controller?.abort(); });
</script>
<template>
  <section class="service-discovery" aria-label="服务发现">
    <header class="discovery-heading"><div><span class="discovery-kicker">SERVICE DISCOVERY</span><h3><Radar :size="22" />平台发布与服务接入</h3><p>读取平台发布清单，解析接口契约，自动加入测试目录。</p></div><button class="primary" :disabled="scanning" @click="scan"><LoaderCircle v-if="scanning" :size="16" class="discovery-spin" /><Radar v-else :size="16" />{{ scanning ? '正在识别服务…' : events.length ? '重新扫描' : '发现并接入新服务' }}</button></header>
    <div class="discovery-metrics"><article><span>发布来源</span><b>{{ publishedPlatforms.length }}<small> 个模板 / 方案</small></b></article><article><span>已纳入测试</span><b>{{ registeredCount }}<small> 个平台</small></b></article><article><span>已配置接口</span><b>{{ publishedPlatforms.reduce((count, platform) => count + (registered(platform.id)?.endpoints.length || 0), 0) }}<small> 项</small></b></article></div>
    <div class="discovery-pipeline"><span><FileCode2 :size="15" />读取发布清单</span><ArrowRight :size="14" /><span><ShieldCheck :size="15" />校验接口契约</span><ArrowRight :size="14" /><span><Layers3 :size="15" />纳入测试目录</span></div>
    <div class="discovery-message" role="status" v-if="message">{{ message }}</div>
    <div v-if="!visiblePlatforms.length" class="discovery-empty"><Radar :size="38" /><h4>等待识别新平台</h4><p>通用模板与解决方案的发布清单已就绪。<br />开始发现后，平台信息、接口数量与接入结果将在这里更新。</p><div><span>后勤服务模板</span><span>空间预约方案</span><span>设备巡检模板</span></div></div>
    <div class="platform-cards" v-else>
      <article v-for="platform in visiblePlatforms" :key="platform.id" class="platform-card" :class="{ registered: registered(platform.id) }">
        <header><Server :size="18" /><h4>{{ registered(platform.id)?.name || platform.name }}</h4><span class="platform-status"><Check v-if="registered(platform.id)" :size="12" />{{ status(platform.id) }}</span></header>
        <p>{{ platform.description }}</p><div class="platform-origin"><span>{{ platform.templateName }}</span><span>{{ platform.publisher }} · v{{ platform.version }}</span></div>
        <footer><code>{{ platform.baseUrl }}</code><span>{{ registered(platform.id)?.endpoints.length || platform.endpointIds.length }} 项接口</span><button v-if="registered(platform.id)" class="text-button" :disabled="scanning" @click="emit('select', registered(platform.id)!.id)">查看配置<ArrowRight :size="13" /></button></footer>
      </article>
    </div>
    <section v-if="events.length" class="discovery-ledger" aria-label="服务接入记录"><h4>接入记录 <span>{{ events.length }} 条</span></h4><div class="discovery-events" aria-live="polite"><article v-for="(event, index) in [...events].reverse()" :key="index"><time>{{ time(event.at) }}</time><span><b>{{ publishedPlatforms.find(platform => platform.id === event.platformId)?.name }}</b>{{ event.message }}</span><Check v-if="['registered', 'existing'].includes(event.stage)" :size="13" /></article></div></section>
  </section>
</template>
<style scoped>
.service-discovery { min-width: 0; overflow: auto; padding: 24px; color: #365e46; }
.discovery-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.discovery-kicker { font: 9px var(--mono); letter-spacing: 2px; color: #8a9c7e; }.discovery-heading h3 { display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 500; margin: 10px 0; }.discovery-heading p { font-size: 11px; color: #87977d; line-height: 1.7; }.discovery-heading button { flex-shrink: 0; font-size: 11px; }
.discovery-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; margin: 22px 0 16px; }.discovery-metrics article { padding: 14px; background: #f3f7ee; border: 1px solid #e1e9d9; border-radius: 8px; }.discovery-metrics article > span { display: block; color: #899a7c; font-size: 10px; }.discovery-metrics b { display: block; margin-top: 8px; font: 25px var(--mono); }.discovery-metrics small { font: 10px system-ui; color: #899a7c; }
.discovery-pipeline { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #7a8f6b; padding-bottom: 16px; border-bottom: 1px solid #e5ebdf; }.discovery-pipeline span { display: flex; gap: 6px; align-items: center; }.discovery-message { padding: 12px 0; font-size: 11px; line-height: 1.6; }
.discovery-empty { text-align: center; padding: 35px 8px; color: #879c78; }.discovery-empty h4 { margin: 14px 0; font-weight: 500; }.discovery-empty p { font-size: 12px; line-height: 1.8; }.discovery-empty > div { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 20px; }.discovery-empty span { padding: 6px 9px; border: 1px solid #e1e9d9; border-radius: 5px; font-size: 10px; }
.platform-cards { display: grid; gap: 10px; margin-top: 16px; }.platform-card { border: 1px solid #e0e7d9; border-radius: 9px; padding: 14px; background: #fff; }.platform-card.registered { border-left: 3px solid #8cac7d; }.platform-card header { display: flex; align-items: center; gap: 8px; }.platform-card h4 { margin: 0; font-size: 13px; font-weight: 500; }.platform-status { margin-left: auto; display: flex; align-items: center; gap: 3px; padding: 4px 6px; border-radius: 4px; font-size: 10px; color: #8d773f; background: #faf5e8; white-space: nowrap; }.registered .platform-status { color: #4e7a3e; background: #eaf3e3; }.platform-card p { margin: 9px 0; font-size: 11px; color: #85957b; }.platform-origin { display: flex; flex-wrap: wrap; gap: 5px 14px; font-size: 10px; color: #8b9b80; }.platform-card footer { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; border-top: 1px solid #edf1e7; margin-top: 11px; padding-top: 9px; font-size: 10px; color: #7e9072; }.platform-card code { font: 10px var(--mono); }.platform-card footer button { margin-left: auto; padding: 0; font-size: 11px; }
.discovery-ledger { margin-top: 20px; }.discovery-ledger h4 { display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; }.discovery-ledger h4 span { color: #97a88a; font: 10px var(--mono); }.discovery-events { max-height: 190px; overflow: auto; margin-top: 10px; border: 1px solid #e5ebdf; border-radius: 7px; background: #f8faf5; }.discovery-events article { display: flex; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #e8eee1; font-size: 10px; color: #839677; }.discovery-events time { font-family: var(--mono); flex-shrink: 0; }.discovery-events b { display: block; font-weight: 500; color: #496f3c; margin-bottom: 4px; }.discovery-events svg { margin-left: auto; flex-shrink: 0; }
.discovery-spin { animation: discovery-spin 1s linear infinite; }@keyframes discovery-spin { to { transform: rotate(360deg); } }
@media(max-width: 800px) { .service-discovery { padding: 16px; }.discovery-heading { align-items: flex-start; flex-direction: column; }.discovery-heading h3 { font-size: 17px; }.discovery-metrics article { padding: 10px; }.discovery-metrics small { display: block; margin-top: 4px; }.discovery-pipeline { font-size: 10px; }.discovery-pipeline span { gap: 3px; }.discovery-pipeline > svg { width: 10px; }.platform-card header { flex-wrap: wrap; }.platform-card h4 { font-size: 12px; } }
@media(prefers-reduced-motion: reduce) { .discovery-spin { animation: none; } }
</style>

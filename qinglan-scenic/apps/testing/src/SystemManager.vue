<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, Plus, Server, Trash2, Check, ArrowRight, Radar, Layers3 } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";
import ServiceDiscovery from "./ServiceDiscovery.vue";
import {
  cloneSystem,
  DEFAULT_SYSTEM_ID,
  MAX_ENDPOINTS,
  newEndpoint,
  newSystem,
  validateSystem,
  resolveEndpoints,
} from "./systems";
import type { SystemConfig } from "./types";
const props = defineProps<{ systems: SystemConfig[]; activeId: string }>();
const emit = defineEmits<{
  close: [];
  save: [systems: SystemConfig[], activeId: string];
  register: [systems: SystemConfig[]];
}>();
const drafts = ref(props.systems.map(cloneSystem));
const selectedId = ref(props.activeId);
const draft = computed(
  () => drafts.value.find((s) => s.id === selectedId.value)!,
);
const errors = ref<string[]>([]);
const deleting = ref(false);
const view = ref<"editor" | "discovery">("editor"), scanning = ref(false), endpointGroup = ref("all");
const endpointDefinitions = computed(() => resolveEndpoints(draft.value));
const groups = computed(() => [...new Set(endpointDefinitions.value.map(endpoint => endpoint.group))]);
const visibleRows = computed(() => draft.value.endpoints.map((endpoint, index) => ({ endpoint, index })).filter(({ index }) => endpointGroup.value === "all" || endpointDefinitions.value[index].group === endpointGroup.value));
function select(id: string) {
  if (scanning.value) return;
  selectedId.value = id;
  view.value = "editor"; endpointGroup.value = "all";
  errors.value = [];
  deleting.value = false;
}
function add() {
  if (scanning.value || drafts.value.length >= 20) return;
  const system = newSystem();
  drafts.value.push(system);
  select(system.id);
}
function duplicate() {
  if (scanning.value || drafts.value.length >= 20) return;
  const system = cloneSystem(draft.value);
  system.id = crypto.randomUUID();
  system.name = system.name.slice(0, 35) + " · 副本";
  delete system.registration;
  drafts.value.push(system);
  select(system.id);
}
function remove() {
  if (scanning.value || draft.value.id === DEFAULT_SYSTEM_ID) return;
  drafts.value = drafts.value.filter((s) => s.id !== selectedId.value);
  select(DEFAULT_SYSTEM_ID);
}
function save() {
  if (scanning.value) return;
  for (const system of drafts.value) {
    const issues = validateSystem(system);
    if (issues.length) {
      select(system.id);
      errors.value = issues;
      return;
    }
  }
  const systems = drafts.value.map((system) => ({
    ...cloneSystem(system),
    name: system.name.trim(),
    baseUrl: system.baseUrl.replace(/\/+$/, "") || "/",
    endpoints: system.endpoints.map((endpoint) => ({
      ...endpoint,
      name: endpoint.name.trim(),
    })),
  }));
  emit("save", systems, selectedId.value);
}
function register(systems: SystemConfig[]) {
  const additions = systems.filter(system => !drafts.value.some(draft => draft.id === system.id));
  drafts.value.push(...additions.map(cloneSystem));
  emit("register", additions);
}
function addEndpoint() {
  if (draft.value.endpoints.length >= MAX_ENDPOINTS) return;
  draft.value.endpoints.push(newEndpoint()); endpointGroup.value = "all";
}
</script>
<template>
  <ModalFrame title="管理被测系统" wide @close="emit('close')">
    <div class="system-manager">
      <aside class="system-list">
        <div class="section-label">
          系统目录 <span>{{ drafts.length }} / 20</span>
        </div>
        <button
          v-for="system in drafts"
          :key="system.id"
          class="system-choice"
          :class="{ selected: view === 'editor' && selectedId === system.id }"
          :disabled="scanning"
          @click="select(system.id)"
        >
          <Server :size="16" /><span
            >{{ system.name || "未命名系统"
            }}<small>{{ system.endpoints.length }} 个接口</small><em v-if="system.registration" class="service-origin">{{ system.registration.source === 'discovery' ? '发现接入' : '方案目录' }}</em></span
          ><Check v-if="system.id === activeId" :size="14" /></button
        ><button
          class="secondary full"
          :disabled="scanning || drafts.length >= 20"
          @click="add"
        >
          <Plus :size="15" />新增系统
        </button>
        <button class="secondary full discovery-entry" aria-label="服务发现" :class="{ active: view === 'discovery' }" :disabled="scanning" @click="view = 'discovery'"><Radar :size="16" />服务发现<span>模板 / 方案</span></button>
        <p>新平台通过发布清单接入。服务目录保存在当前浏览器。</p>
      </aside>
      <ServiceDiscovery v-show="view === 'discovery'" :systems="drafts" @register="register" @busy="scanning = $event" @select="select" />
      <form
        v-show="view === 'editor'"
        id="system-form"
        novalidate
        class="system-editor"
        @submit.prevent="save"
      >
        <div class="editor-heading">
          <div>
            <h3>系统与接口配置</h3>
            <p>GET 接口用于服务观测与响应验证</p>
          </div>
          <div class="editor-tools">
            <button
              type="button"
              class="secondary small"
              :disabled="drafts.length >= 20"
              @click="duplicate"
            >
              <Copy :size="14" />复制系统</button
            ><button
              type="button"
              class="icon-button"
              aria-label="删除当前系统"
              :disabled="draft.id === DEFAULT_SYSTEM_ID"
              @click="deleting = !deleting"
            >
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
        <div v-if="draft.registration" class="system-provenance"><Layers3 :size="19" /><div><strong>{{ draft.registration.templateName }}</strong><p>{{ draft.registration.publisher }} · v{{ draft.registration.version }}<template v-if="draft.registration.registeredAt"> · {{ new Date(draft.registration.registeredAt).toLocaleString('zh-CN', { hour12: false }) }} 接入</template></p></div><span>{{ draft.registration.source === 'discovery' ? '已纳入测试' : '目录已配置' }}</span></div>
        <div v-if="deleting" class="delete-confirm">
          <span>删除“{{ draft.name }}”后将切回默认服务，保存后生效。</span
          ><button type="button" class="danger-button" @click="remove">
            确认删除</button
          ><button type="button" @click="deleting = false">取消</button>
        </div>
        <div v-if="errors.length" class="form-errors" role="alert">
          <p v-for="error in errors.slice(0, 8)" :key="error">{{ error }}</p>
        </div>
        <div class="system-connection">
          <label
            >系统名称<input
              v-model="draft.name"
              maxlength="40"
              autocomplete="off"
              placeholder="例如：订单服务" /></label
          ><label
            >API 基础地址<input
              v-model="draft.baseUrl"
              autocomplete="off"
              placeholder="/api/v1 或 https://api.example.com/v1"
          /></label>
        </div>
        <div class="endpoint-editor-heading">
          <h3>
            接口清单 <span>{{ draft.endpoints.length }} / {{ MAX_ENDPOINTS }}</span>
          </h3>
          <button
            type="button"
            class="text-button"
            :disabled="draft.endpoints.length >= MAX_ENDPOINTS"
            @click="addEndpoint"
          >
            <Plus :size="14" />添加接口
          </button>
        </div>
        <div class="endpoint-groups" role="group" aria-label="接口业务分组"><button type="button" :class="{ selected: endpointGroup === 'all' }" @click="endpointGroup = 'all'">全部 {{ draft.endpoints.length }}</button><button type="button" v-for="group in groups" :key="group" :class="{ selected: endpointGroup === group }" @click="endpointGroup = group">{{ group }} {{ endpointDefinitions.filter(endpoint => endpoint.group === group).length }}</button></div>
        <div class="endpoint-column-labels">
          <span>名称</span><span>GET 路径</span><span>预期状态</span
          ><span>延迟阈值 / ms</span><span />
        </div>
        <div
          v-for="{ endpoint, index } in visibleRows"
          :key="endpoint.id"
          class="endpoint-editor-row"
        >
          <input
            v-model="endpoint.name"
            :aria-label="`接口名称 ${index + 1}`"
            placeholder="接口名称"
            maxlength="40"
          /><input
            v-model="endpoint.path"
            :aria-label="`接口路径 ${index + 1}`"
            placeholder="/health"
          /><input
            v-model.number="endpoint.status"
            :aria-label="`预期状态码 ${index + 1}`"
            type="number"
            min="100"
            max="599"
          /><input
            v-model.number="endpoint.budget"
            :aria-label="`延迟阈值 ${index + 1}`"
            type="number"
            min="1"
            max="60000"
          /><button
            type="button"
            class="icon-button"
            :aria-label="`删除接口 ${index + 1}`"
            :disabled="draft.endpoints.length === 1"
            @click="draft.endpoints.splice(index, 1)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <p class="editor-hint">
          路径以 /
          开始，可带查询参数；地址与路径组合为完整接口标识。目录接口保留业务契约，手动新增接口校验状态码、JSON
          与耗时。
        </p>
      </form>
    </div>
    <div class="dialog-footer">
      <span>{{ view === 'discovery' ? '发现完成后自动保存接入结果；关闭可停止本轮发现。' : '手动修改需保存；服务发现的接入结果已自动保留。' }}</span>
      <div class="editor-tools">
        <button class="secondary" @click="emit('close')">取消</button
        ><button v-if="view === 'editor'" class="primary" form="system-form" type="submit" :disabled="scanning">
          保存并切换<ArrowRight :size="15" />
        </button><button v-else class="primary" :disabled="scanning" @click="view = 'editor'">返回系统配置<ArrowRight :size="15" /></button>
      </div>
    </div>
  </ModalFrame>
</template>
<style scoped>
.service-origin { display: inline-block; font-size: 9px; font-style: normal; color: #568047; background: #e9f0e1; padding: 3px 5px; border-radius: 3px; margin-top: 6px; }
.discovery-entry { justify-content: flex-start; flex-wrap: wrap; color: #3d6e50; }.discovery-entry span { font-size: 9px; color: #97a688; }.discovery-entry.active { background: #e7efdf; border-color: #9db28f; }
.system-provenance { display: flex; align-items: center; gap: 10px; padding: 14px; border: 1px solid #dfE8d7; background: #f5f8ef; border-radius: 8px; margin-bottom: 20px; color: #6d885c; }.system-provenance > svg { flex-shrink: 0; }.system-provenance strong { font-size: 12px; font-weight: 500; }.system-provenance p { font-size: 10px; line-height: 1.6; margin-top: 6px; color: #91a282; }.system-provenance > span { margin-left: auto; flex-shrink: 0; font-size: 10px; }
.endpoint-groups { display: flex; flex-wrap: wrap; gap: 6px; padding: 14px 0 6px; }.endpoint-groups button { font-size: 10px; color: #879b76; padding: 5px 8px; border: 1px solid #e3eada; background: #fafcf7; border-radius: 5px; }.endpoint-groups button.selected { color: #426e39; background: #edf4e5; border-color: #abc498; }
@media(max-width: 700px) { .service-origin { display: none; }.system-provenance { flex-wrap: wrap; }.system-provenance > span { margin-left: 0; } }
</style>

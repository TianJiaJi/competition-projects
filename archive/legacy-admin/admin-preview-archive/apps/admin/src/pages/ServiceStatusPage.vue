<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { dateTimeText } from "../app/format";
import { pushToast } from "../app/state";
import { getServiceStatus, serviceStatusNote, type ServiceStatusView } from "../services/system";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import PageHeader from "../components/PageHeader.vue";
import StatusTag from "../components/StatusTag.vue";

const status = ref<ServiceStatusView | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const result = await getServiceStatus();
  loading.value = false;
  if (!result.ok) {
    error.value = result.error.message;
    return;
  }
  status.value = result.data;
}

onMounted(load);

function tone(value: string): "success" | "warning" | "danger" | "neutral" {
  if (value === "ready" || value === "available") return "success";
  if (value === "degraded") return "warning";
  if (value === "unavailable") return "danger";
  return "neutral";
}

const llmText = computed(() => {
  if (!status.value) return "";
  if (status.value.llm === "unknown") return "未知（不显示为可用）";
  return status.value.llm;
});
</script>

<template>
  <section class="stack">
    <PageHeader
      title="服务状态"
      description="读取固定样例状态；刷新只重新读取同一份样例，不把刷新时间当作最近快照时间，也不显示密钥、连接串或服务地址。"
    >
      <template #actions>
        <AdminButton :loading="loading" @click="load">刷新</AdminButton>
      </template>
    </PageHeader>

    <AsyncSection :loading="loading && !status" :error="error ?? undefined" @retry="load">
      <div class="panel stack" v-if="status">
        <p class="inline-note">{{ serviceStatusNote() }}</p>
        <dl class="definition-list">
          <dt>后端</dt>
          <dd><StatusTag :label="status.backend" :tone="tone(status.backend)" /></dd>
          <dt>数据库</dt>
          <dd><StatusTag :label="status.database" :tone="tone(status.database)" /></dd>
          <dt>模型服务</dt>
          <dd><StatusTag :label="llmText" :tone="tone(status.llm)" /></dd>
          <dt>应用版本</dt>
          <dd class="num">{{ status.appVersion }}</dd>
          <dt>最近快照时间</dt>
          <dd class="num">{{ dateTimeText(Date.parse(status.lastSnapshotAt)) }}（预置样例值）</dd>
          <dt>样例读取时间</dt>
          <dd class="num">{{ status.sampleReadAtText }}（真实时间）</dd>
          <dt>连接数</dt>
          <dd class="num">{{ status.connections }}</dd>
        </dl>
        <p v-if="status.runtimeMessage" class="form-error-banner" role="status">{{ status.runtimeMessage }}</p>
        <p class="muted small" style="margin: 0">
          读取失败时本页显示失败与重试，不把状态降级解释成界面请求失败。失败、降级与“未知”三类情形的注入入口属于开发预览能力，本期未实现
          <code>?preview=1</code>：相关分支由服务层与单元测试覆盖。
        </p>
      </div>
    </AsyncSection>
  </section>
</template>

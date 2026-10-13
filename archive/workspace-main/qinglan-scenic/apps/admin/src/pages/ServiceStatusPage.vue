<script setup lang="ts">
import {useLiveRefresh} from "../app/live-refresh";
useLiveRefresh(()=>load());
import { computed, onMounted, ref } from "vue";
import { RefreshCw } from "lucide-vue-next";
import { dateTimeText } from "../app/format";
import { isServiceStatusSnapshot, serviceHealthCards } from "../core/service-health";
import { getServiceStatus, type ServiceStatusView } from "../services/system";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import PageHeader from "../components/PageHeader.vue";
import ServiceHealthCard from "../components/ServiceHealthCard.vue";

const status = ref<ServiceStatusView | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const cards = computed(() => serviceHealthCards(status.value?.modules));

async function load(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  error.value = null;
  try {
    const result = await getServiceStatus();
    if (!result.ok) {
      error.value = result.error.message;
    } else if (!isServiceStatusSnapshot(result.data)) {
      error.value = "服务状态数据格式不完整，请重试。";
    } else {
      status.value = result.data;
    }
  } catch {
    error.value = "服务状态暂时无法读取，请重试。";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="service-status stack">
    <PageHeader title="服务状态">
      <template #actions>
        <AdminButton :loading="loading" @click="load"><RefreshCw :size="17" aria-hidden="true" />刷新</AdminButton>
      </template>
    </PageHeader>

    <AsyncSection :loading="loading" :retain="!!status" :error="error ?? undefined" @retry="load">
      <div v-if="status" class="service-status__snapshot">
        <div class="service-status__meta">
          <span>数据检测时间 <time :datetime="status.checkedAt">{{ dateTimeText(Date.parse(status.checkedAt)) }}</time></span>
          <span>读取时间 <time :datetime="new Date(status.sampleReadAt).toISOString()">{{ status.sampleReadAtText }}</time></span>
        </div>

        <section class="service-status__group" aria-labelledby="service-infrastructure">
          <h2 id="service-infrastructure">基础服务与设备</h2>
          <div class="service-status__primary">
            <ServiceHealthCard v-for="card in cards.filter(item => item.primary)" :key="card.id" :card="card" />
          </div>
        </section>
        <section class="service-status__group" aria-labelledby="service-applications">
          <h2 id="service-applications">应用端</h2>
          <div class="service-status__applications">
            <ServiceHealthCard v-for="card in cards.filter(item => !item.primary)" :key="card.id" :card="card" />
          </div>
        </section>
      </div>
    </AsyncSection>
  </section>
</template>

<style scoped>
.service-status { width: 100%; max-width: 1312px; margin: 0 auto; padding: 0 8px 8px; container-type: inline-size; }
.service-status :deep(.page-header) { align-items: center; }
.service-status :deep(.page-header h1) { font: 600 var(--admin-font-display)/1.3 var(--serif); }
.service-status :deep(.page-header .btn) { min-height: 48px; min-width: 112px; }
.service-status__snapshot { display: grid; gap: 28px; }
.service-status__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 24px; color: var(--muted); font-size: var(--admin-font-small); }
.service-status__meta time { font-variant-numeric: tabular-nums; }
.service-status__group { display: grid; gap: 14px; min-width: 0; }
.service-status__group h2 { font-size: var(--admin-font-section); line-height: 1.4; }
.service-status__primary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.service-status__applications { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
@container (max-width: 940px) { .service-status__applications { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (max-width: 680px) { .service-status__applications { grid-template-columns: repeat(2, minmax(0, 1fr)); } .service-status__primary { grid-template-columns: 1fr; } }
@container (max-width: 420px) { .service-status__applications { grid-template-columns: 1fr; } }
</style>

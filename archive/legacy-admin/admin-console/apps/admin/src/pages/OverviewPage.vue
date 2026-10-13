<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { pushToast } from "../app/state";
import { businessTimeLabel } from "../app/format";
import { getOverview, type OverviewMetrics } from "../services/orders";
import { listReports } from "../services/chat";
import { severityLabels } from "../services/alerts";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import MetricCard from "../components/MetricCard.vue";
import PageHeader from "../components/PageHeader.vue";
import StatusTag from "../components/StatusTag.vue";

const metrics = ref<OverviewMetrics | null>(null);
const pendingReports = ref<Array<{ id: string; roomName: string; messagePreview: string }>>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const result = await getOverview();
  if (!result.ok) {
    loading.value = false;
    error.value = result.error.message;
    return;
  }
  metrics.value = result.data;
  const reports = await listReports({ status: "pending", pageSize: 20 });
  loading.value = false;
  pendingReports.value = reports.ok
    ? reports.data.items.map((report) => ({ id: report.id, roomName: report.roomName, messagePreview: report.messagePreview }))
    : [];
}

onMounted(load);

function go(to: string): void {
  window.location.hash = `#${to}`;
}

const dateText = computed(() => metrics.value?.businessDate ?? "");
</script>

<template>
  <section class="stack">
    <PageHeader
      title="工作台"
      description="按业务日期汇总当日有效预约与待办数量；指标包含背景模拟批次，点击卡片进入相同筛选的明细。"
    >
      <template #actions>
        <AdminButton :loading="loading" @click="load">刷新</AdminButton>
      </template>
    </PageHeader>

    <AsyncSection :loading="loading && !metrics" :error="error ?? undefined" @retry="load">
      <div v-if="metrics" class="stack">
        <p class="inline-note">
          业务时间 {{ businessTimeLabel() }}（固定样例时间），统计日期 {{ dateText }}；前两项按
          <code>reservationStatus=confirmed</code> 汇总现场与背景数据，含已入园／已进场。
        </p>

        <div class="metric-grid">
          <MetricCard
            label="当日有效入园预约人数"
            :value="metrics.admissionPeople"
            :foot="`入园 · ${dateText} · 包含背景模拟`"
            @open="go(`/orders?date=${dateText}&type=admission&source=all&reservationStatus=confirmed`)"
          />
          <MetricCard
            label="当日有效停车预约辆数"
            :value="metrics.parkingVehicles"
            :foot="`停车 · ${dateText} · 包含背景模拟`"
            @open="go(`/orders?date=${dateText}&type=parking&source=all&reservationStatus=confirmed`)"
          />
          <MetricCard
            label="未完成告警（待处理 + 处理中）"
            :value="metrics.pendingAlertCount"
            foot="点击进入当前告警列表"
            @open="go('/alerts?scope=current')"
          />
          <MetricCard
            label="待处理举报"
            :value="metrics.pendingReportCount"
            foot="不受其他页面筛选影响"
            @open="go('/chat?tab=reports')"
          />
        </div>

        <div class="split-2">
          <div class="panel stack">
            <p class="section-title">最新 5 条未完成告警</p>
            <AsyncSection :empty="!metrics.latestAlerts.length" empty-text="当前没有未完成告警。">
              <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px">
                <li v-for="alert in metrics.latestAlerts" :key="alert.id" class="row" style="justify-content: space-between">
                  <span class="stack" style="gap: 2px">
                    <span>{{ alert.title }}</span>
                    <span class="muted small">{{ alert.location }} · 发生时间 {{ alert.startedAt.slice(11, 16) }}</span>
                  </span>
                  <StatusTag
                    :label="severityLabels[alert.severity as keyof typeof severityLabels] ?? alert.severity"
                    :tone="alert.severity === 'critical' ? 'danger' : alert.severity === 'important' ? 'warning' : 'info'"
                  />
                </li>
              </ul>
              <div class="btn-group">
                <AdminButton size="sm" @click="go('/alerts?scope=current')">查看全部当前告警</AdminButton>
              </div>
            </AsyncSection>
          </div>

          <div class="panel stack">
            <p class="section-title">待处理举报入口</p>
            <AsyncSection :empty="!pendingReports.length" empty-text="当前没有待处理举报。">
              <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px">
                <li v-for="report in pendingReports" :key="report.id" class="stack" style="gap: 2px">
                  <span>{{ report.roomName }}</span>
                  <span class="muted small">{{ report.messagePreview }}</span>
                </li>
              </ul>
              <div class="btn-group">
                <AdminButton size="sm" @click="go('/chat?tab=reports')">前往聊天管理</AdminButton>
              </div>
            </AsyncSection>
          </div>
        </div>

        <p class="muted small" style="margin: 0">
          本页没有编辑按钮，也不提供营收图表或第二份随机指标；数字全部来自统一订单、告警与举报集合。数据缺失时显示“未知”与读取失败说明，不显示假零。
        </p>
      </div>
    </AsyncSection>
  </section>
</template>

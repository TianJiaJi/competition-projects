<script setup lang="ts">
import WorkflowPanel from '../../../../packages/ui/src/WorkflowPanel.vue';
import {api} from '../services/store';
import FlowPage from '../components/FlowPage.vue';
import FlowPanel from '../components/FlowPanel.vue';
import PageHeader from '../components/PageHeader.vue';
</script>
<template>
  <FlowPage>
    <PageHeader title="告警记录" description="查看告警来源、修改历史并处理人工告警。" />
    <FlowPanel class="alerts-panel"><WorkflowPanel :api="api" admin mode="alerts" /></FlowPanel>
  </FlowPage>
</template>
<style scoped>
.alerts-panel { padding: 0; overflow: auto; }
.alerts-panel :deep(.workflow) { min-height: 100%; background: transparent; }
.alerts-panel :deep(.workflow > h2:first-child) { display: none; }
</style>

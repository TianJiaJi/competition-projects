<script setup lang="ts">
import {
  MapPin,
  ChevronRight,
  TriangleAlert,
  CircleAlert,
} from "lucide-vue-next";
import {
  categoryLabels,
  severityLabels,
  statusLabels,
  displayTime,
  type Task,
} from "../core/types";
defineProps<{ task: Task }>();
defineEmits<{ open: [id: string] }>();
</script>
<template>
  <button class="task-row" @click="$emit('open', task.id)">
    <span class="row"
      ><span class="severity" :class="task.severity"
        ><component
          :is="task.severity === 'critical' ? TriangleAlert : CircleAlert"
          :size="17"
          :stroke-width="1.75"
        />{{ severityLabels[task.severity] }} ·
        {{ categoryLabels[task.category] }}</span
      ><span class="small">{{ task.workOrderStatus === 'awaiting_acceptance' ? '待验收' : statusLabels[task.status] }}</span></span
    >
    <strong>{{ task.title }}</strong
    ><span class="location"><MapPin :size="16" />{{ task.location }}</span>
    <span class="row task-meta"
      ><span>{{
        task.assignee
          ? `${task.assignee.name} · ${statusLabels[task.status]}`
          : "等待人员处理"
      }}</span
      ><span
        >{{ displayTime(task.completedAt ?? task.startedAt) }}
        <ChevronRight :size="14" /></span
    ></span>
  </button>
</template>

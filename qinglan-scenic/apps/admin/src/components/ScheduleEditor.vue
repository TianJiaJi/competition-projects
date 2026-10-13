<script setup lang="ts">
import { ref } from "vue";
import { api } from "../services/store";
import { businessNow, toDateString } from "../core/time";
import AdminButton from "./AdminButton.vue";
import DrawerPanel from "./DrawerPanel.vue";
const emit = defineEmits<{ saved: [] }>();
const open = ref(false),
  from = ref(toDateString(businessNow())),
  to = ref(from.value),
  kind = ref("entry"),
  lotId = ref("p1"),
  error = ref(""),
  busy = ref(false);
const rows = ref([{ start: "08:00", end: "09:00", capacity: 30 }]);
async function load() {
  try {
    const r = await api.request<any>(
      "/booking/slots?date=" +
        from.value +
        "&kind=" +
        kind.value +
        (kind.value === "parking" ? "&lotId=" + lotId.value : ""),
    );
    rows.value = r.items.map((s: any) => ({
      start: s.slot,
      end: s.end,
      capacity: s.capacity,
    }));
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await api.request("/admin/booking/schedules", "POST", {
      from: from.value,
      to: to.value,
      kind: kind.value,
      lotId: lotId.value,
      slots: rows.value,
    });
    open.value = false;
    emit("saved");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <AdminButton
    @click="
      open = true;
      load();
    "
    >自定义预约日程</AdminButton
  ><DrawerPanel v-if="open" title="自定义日期与时段" @close="open = false"
    ><p>
      08:00—17:00 内可精确到分钟。已有预约的时段必须保留，容量不能低于占用量。
    </p>
    <div class="form-grid">
      <label
        >起始日期<input
          class="input"
          type="date"
          v-model="from"
          @change="load" /></label
      ><label>结束日期<input class="input" type="date" v-model="to" /></label
      ><label
        >类型<select class="select" v-model="kind" @change="load">
          <option value="entry">入园</option>
          <option value="parking">停车</option>
        </select></label
      ><label v-if="kind === 'parking'"
        >停车场<select class="select" v-model="lotId" @change="load">
          <option v-for="id in ['p1', 'p2', 'p3']">{{ id }}</option>
        </select></label
      >
    </div>
    <div class="schedule-row" v-for="(row, i) in rows" :key="i">
      <input
        aria-label="开始时刻"
        class="input"
        type="time"
        v-model="row.start"
      /><input
        aria-label="结束时刻"
        class="input"
        type="time"
        v-model="row.end"
      /><input
        aria-label="配额"
        class="input"
        type="number"
        min="0"
        v-model.number="row.capacity"
      /><AdminButton @click="rows.splice(i, 1)">移除</AdminButton>
    </div>
    <AdminButton
      @click="rows.push({ start: '09:00', end: '10:00', capacity: 30 })"
      >添加时段</AdminButton
    >
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer
      ><AdminButton :loading="busy" @click="save"
        >保存日程</AdminButton
      ></template
    ></DrawerPanel
  >
</template>
<style scoped>
.schedule-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  margin: 12px 0;
}
</style>

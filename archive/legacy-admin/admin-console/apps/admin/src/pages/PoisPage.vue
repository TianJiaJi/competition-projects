<script setup lang="ts">
import { onMounted, ref } from "vue";
import { cachedFilters } from "../app/filter-cache";
import { regions } from "@scenic/scenic";
import { dateTimeText } from "../app/format";
import { listPois, type PoiView } from "../services/content";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import DataTable from "../components/DataTable.vue";
import FilterBar from "../components/FilterBar.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";
import TextInput from "../components/TextInput.vue";

const filters = cachedFilters("pois", { keyword: "", regionId: "all" });
const rows = ref<PoiView[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const regionOptions = [
  { value: "all", label: "全部区域" },
  ...regions.map((region) => ({ value: region.id, label: `${region.id} · ${region.name}` })),
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await listPois({ keyword: filters.keyword, regionId: filters.regionId });
  loading.value = false;
  if (!response.ok) {
    error.value = response.error.message;
    return;
  }
  rows.value = response.data;
}

async function reset(): Promise<void> {
  filters.keyword = "";
  filters.regionId = "all";
  await load();
}

onMounted(load);
</script>

<template>
  <section class="stack">
    <PageHeader
      title="景点介绍"
      description="只列出共享 kind=attraction 点位；编辑保存为全局内容覆盖，不修改共享常量、ID、区域或节点。"
    />

    <FilterBar :busy="loading" @submit="load" @reset="reset">
      <FormField label="关键词" field="poi-keyword">
        <TextInput id="poi-keyword" v-model="filters.keyword" placeholder="匹配景点名称与简介" />
      </FormField>
      <FormField label="区域" field="poi-region">
        <SelectInput id="poi-region" v-model="filters.regionId" :options="regionOptions" />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'poiId', label: '点位 ID' },
            { key: 'name', label: '名称' },
            { key: 'regionName', label: '区域' },
            { key: 'summary', label: '简介' },
            { key: 'updatedAt', label: '更新时间' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="rows"
          :row-key="(row) => String(row.poiId)"
          empty-text="没有符合条件的景点。"
        >
          <template #cell-name="{ row }">
            <span class="stack" style="gap: 2px">
              <span>{{ row.name }}</span>
              <span v-if="row.hasOverride" class="muted small">已使用后台内容覆盖（共享名称：{{ row.sharedName }}）</span>
              <span v-else class="muted small">沿用共享配置名称</span>
            </span>
          </template>
          <template #cell-regionName="{ row }">
            <StatusTag :label="String(row.regionName)" tone="info" />
          </template>
          <template #cell-summary="{ row }">
            <span class="muted small">{{ String(row.summary).slice(0, 60) }}{{ String(row.summary).length > 60 ? "…" : "" }}</span>
          </template>
          <template #cell-updatedAt="{ row }">
            <span class="num">{{ row.updatedAt ? dateTimeText(Number(row.updatedAt)) : "—" }}</span>
          </template>
          <template #cell-actions="{ row }">
            <a class="btn btn--sm" :href="`#/content/pois/${row.poiId}/edit`">编辑</a>
          </template>
        </DataTable>
      </AsyncSection>
    </div>
  </section>
</template>

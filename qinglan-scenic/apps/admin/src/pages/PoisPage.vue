<script setup lang="ts">
import {useLiveRefresh} from "../app/live-refresh";
useLiveRefresh(()=>load());
import AdminLink from "../components/AdminLink.vue";
import MarkdownPreview from "../components/MarkdownPreview.vue";
import FlowDetails from "../components/FlowDetails.vue";
const reading = ref<PoiView | null>(null);
import FlowPage from "../components/FlowPage.vue";
import FlowPanel from "../components/FlowPanel.vue";
import { onMounted, ref } from "vue";
import { cachedFilters } from "../app/filter-cache";
import { regions } from "@scenic/scenic";
import { dateTimeText } from "../app/format";
import { listPois, type PoiView } from "../services/content";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import DataTable from "../components/DataTable.vue";
import FlowFilters from "../components/FlowFilters.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";
import TextInput from "../components/TextInput.vue";

const filters = cachedFilters("pois", { keyword: "", regionId: "all" });
const rows = ref<PoiView[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const regionOptions = [
  { value: "all", label: "全部区域" },
  ...regions.map((region) => ({ value: region.id, label: `${region.id} · ${region.name}` })),
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
  const response = await listPois({ keyword: filters.keyword, regionId: filters.regionId });
  loading.value = false;
  if (!response.ok) {
    error.value = response.error.message;
    return;
  }
  rows.value = response.data;
  } catch { error.value = "读取失败，请重试。"; }
  finally { loading.value = false; }
}

async function reset(): Promise<void> {
  filters.keyword = "";
  filters.regionId = "all";
  await load();
}

onMounted(load);
</script>

<template>
  <FlowPage>
    <PageHeader
      title="景点介绍"

    />

    <FlowFilters :model="filters" :primary="['poi-keyword', 'poi-region']" search="poi-keyword" :busy="loading" @submit="load" @reset="reset"><template #default="{ filter }">
      <FormField label="关键词" field="poi-keyword">
        <TextInput id="poi-keyword" v-model="filter.keyword" placeholder="匹配景点名称与简介" />
      </FormField>
      <FormField label="区域" field="poi-region">
        <SelectInput id="poi-region" v-model="filter.regionId" :options="regionOptions" />
      </FormField>
    </template></FlowFilters>

    <FlowPanel>
      <AsyncSection :retain="rows.length > 0" :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'name', label: '名称' },
            { key: 'regionName', label: '区域' },
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
            <AdminButton size="sm" @click="reading = row as unknown as PoiView">查看</AdminButton>
            <AdminLink size="sm" :href="`#/content/pois/${row.poiId}/edit`">编辑</AdminLink>
          </template>
        </DataTable>
      </AsyncSection>
    </FlowPanel>
    <FlowDetails v-if="reading" :title="reading.name" :facts="[['点位 ID', reading.poiId], ['区域', reading.regionName], ['路网节点', reading.nodeId], ['共享名称', reading.sharedName], ['更新时间', reading.updatedAt ? dateTimeText(reading.updatedAt) : '—'], ['关联知识来源', reading.sourceIds.join('、') || '—']]" wide @close="reading = null">
      <p class="flow-read-body">{{ reading.summary }}</p><MarkdownPreview :source="reading.body" />
      <img v-for="url in reading.imageUrls" :key="url" :src="url" alt="景点图片" style="width:100%;aspect-ratio:8/5;object-fit:contain" />
    </FlowDetails>
  </FlowPage>
</template>

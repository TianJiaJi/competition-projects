<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { assetCatalogue } from "../core/assets";
import type { FieldError } from "../core/result";
import { LIMITS } from "../core/validate";
import type { KnowledgeSource } from "../core/types";
import { getPoi, listSources, savePoiContent, type PoiContentInput, type PoiView } from "../services/content";
import { useRoute } from "../router";
import { pushToast, registerUnsavedGuard } from "../app/state";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import FormField from "../components/FormField.vue";
import MarkdownPreview from "../components/MarkdownPreview.vue";
import PageHeader from "../components/PageHeader.vue";
import TextInput from "../components/TextInput.vue";

const route = useRoute();
const poiId = computed(() => route.value.params.id ?? "");
const poi = ref<PoiView | null>(null);
const sources = ref<KnowledgeSource[]>([]);
const form = ref<PoiContentInput>({ name: "", summary: "", body: "", imageUrls: [], sourceIds: [] });
const saved = ref<PoiContentInput | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);
const tab = ref<"edit" | "preview">("edit");

const dirty = computed(() => {
  if (!saved.value) return false;
  if (saved.value.name !== form.value.name || saved.value.summary !== form.value.summary || saved.value.body !== form.value.body) return true;
  return (
    saved.value.imageUrls.join("|") !== form.value.imageUrls.join("|") ||
    [...saved.value.sourceIds].sort().join("|") !== [...form.value.sourceIds].sort().join("|")
  );
});

let removeGuard: (() => void) | null = null;

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const [detail, sourceList] = await Promise.all([getPoi(poiId.value), listSources()]);
  loading.value = false;
  if (!detail.ok) {
    error.value = detail.error.message;
    return;
  }
  poi.value = detail.data;
  sources.value = sourceList.ok ? sourceList.data : [];
  const state: PoiContentInput = {
    name: detail.data.name,
    summary: detail.data.summary,
    body: detail.data.body || `## ${detail.data.name}\n\n${detail.data.summary}\n\n> 本页内容为演示说明。`,
    imageUrls: [...detail.data.imageUrls],
    sourceIds: [...detail.data.sourceIds],
  };
  form.value = { ...state, imageUrls: [...state.imageUrls], sourceIds: [...state.sourceIds] };
  saved.value = { ...state, imageUrls: [...state.imageUrls], sourceIds: [...state.sourceIds] };
}

function toggleImage(url: string): void {
  const index = form.value.imageUrls.indexOf(url);
  if (index >= 0) form.value.imageUrls.splice(index, 1);
  else if (form.value.imageUrls.length < 6) form.value.imageUrls.push(url);
  else pushToast("error", "最多选择 6 张图片。");
}

function moveImage(url: string, direction: -1 | 1): void {
  const index = form.value.imageUrls.indexOf(url);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= form.value.imageUrls.length) return;
  const next = [...form.value.imageUrls];
  [next[index], next[target]] = [next[target], next[index]];
  form.value.imageUrls = next;
}

function toggleSource(id: string): void {
  const index = form.value.sourceIds.indexOf(id);
  if (index >= 0) form.value.sourceIds.splice(index, 1);
  else form.value.sourceIds.push(id);
}

async function submit(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  formError.value = null;
  fieldErrors.value = [];
  const response = await savePoiContent(poiId.value, {
    name: form.value.name,
    summary: form.value.summary,
    body: form.value.body,
    imageUrls: [...form.value.imageUrls],
    sourceIds: [...form.value.sourceIds],
  });
  saving.value = false;
  if (!response.ok) {
    formError.value = response.error.code === "VALIDATION_ERROR" ? "景点内容校验未通过，请检查标红字段。" : response.error.message;
    fieldErrors.value = response.error.fieldErrors ?? [];
    return;
  }
  saved.value = { ...form.value, imageUrls: [...form.value.imageUrls], sourceIds: [...form.value.sourceIds] };
  pushToast("success", "景点内容已保存；设施列表会使用该显示名。");
}

onMounted(() => {
  void load();
  removeGuard = registerUnsavedGuard(() => (dirty.value ? "景点内容有未保存的修改。" : null));
});

onBeforeUnmount(() => removeGuard?.());
</script>

<template>
  <section class="stack">
    <PageHeader :title="poi ? `编辑景点 · ${poi.name}` : '编辑景点'" description="只修改内容与来源引用；点位 ID、区域、节点与共享名称保持不变。">
      <template #actions>
        <a class="btn" href="#/content/pois">返回列表</a>
        <AdminButton variant="primary" :loading="saving" @click="submit">保存</AdminButton>
      </template>
    </PageHeader>

    <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
      <div v-if="poi" class="split-2">
        <form class="panel form-stack" @submit.prevent="submit">
          <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>

          <dl class="definition-list">
            <dt>点位 ID</dt>
            <dd class="num">{{ poi.poiId }}（只读）</dd>
            <dt>区域</dt>
            <dd>{{ poi.regionId }} · {{ poi.regionName }}（只读）</dd>
            <dt>路网节点</dt>
            <dd class="num">{{ poi.nodeId }}（只读）</dd>
            <dt>共享配置名称</dt>
            <dd>{{ poi.sharedName }}（只读，不被覆盖改写）</dd>
          </dl>

          <FormField label="景点名称" field="name" required :errors="fieldErrors" :hint="`1—${LIMITS.scenicName.max} 字；保存为全局内容覆盖`">
            <template #default="{ invalid }">
              <TextInput id="name" v-model="form.name" :invalid="invalid" :maxlength="LIMITS.scenicName.max" />
            </template>
          </FormField>

          <FormField label="简介" field="summary" required :errors="fieldErrors" :hint="`1—${LIMITS.summary.max} 字`">
            <template #default="{ invalid }">
              <TextInput id="summary" v-model="form.summary" textarea :rows="3" :invalid="invalid" :maxlength="LIMITS.summary.max" />
            </template>
          </FormField>

          <FormField label="正文（Markdown）" field="body" required :errors="fieldErrors" :hint="`1—${LIMITS.markdownBody.max} 字`">
            <template #default="{ invalid }">
              <div class="stack" style="gap: 8px">
                <div class="md-toolbar">
                  <button class="btn btn--sm" type="button" :aria-pressed="tab === 'edit'" @click="tab = 'edit'">编辑</button>
                  <button class="btn btn--sm" type="button" :aria-pressed="tab === 'preview'" @click="tab = 'preview'">预览</button>
                </div>
                <TextInput v-if="tab === 'edit'" id="body" v-model="form.body" textarea :rows="12" :invalid="invalid" />
                <MarkdownPreview v-else :source="form.body" />
              </div>
            </template>
          </FormField>

          <FormField label="随包图片" field="imageUrls" :errors="fieldErrors" hint="0—6 张，去重后可调整顺序">
            <template #default>
              <div class="stack">
                <div class="card-grid">
                  <label v-for="asset in assetCatalogue" :key="asset.url" class="checkbox-row">
                    <input
                      type="checkbox"
                      :checked="form.imageUrls.includes(asset.url)"
                      @change="toggleImage(asset.url)"
                    />
                    {{ asset.title }}
                  </label>
                </div>
                <ul v-if="form.imageUrls.length" style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px">
                  <li v-for="(url, index) in form.imageUrls" :key="url" class="row">
                    <span class="num muted small">#{{ index + 1 }}</span>
                    <span style="flex: 1">{{ assetCatalogue.find((asset) => asset.url === url)?.title ?? url }}</span>
                    <AdminButton size="sm" @click.prevent="moveImage(url, -1)">上移</AdminButton>
                    <AdminButton size="sm" @click.prevent="moveImage(url, 1)">下移</AdminButton>
                    <AdminButton size="sm" variant="danger" @click.prevent="toggleImage(url)">移除</AdminButton>
                  </li>
                </ul>
                <p v-else class="muted small" style="margin: 0">未选择图片；不要求本期生成或采购图片。</p>
              </div>
            </template>
          </FormField>

          <FormField label="关联知识来源" field="sourceIds" :errors="fieldErrors" hint="可为空；只能选择已有来源">
            <template #default>
              <div class="stack">
                <label v-for="source in sources" :key="source.id" class="checkbox-row">
                  <input type="checkbox" :checked="form.sourceIds.includes(source.id)" @change="toggleSource(source.id)" />
                  {{ source.title }}（{{ source.id }}）
                </label>
              </div>
            </template>
          </FormField>
        </form>

        <div class="panel stack">
          <p class="section-title">内容预览</p>
          <h2 class="serif-title" style="font-size: 20px">{{ form.name || "（未填写名称）" }}</h2>
          <p style="margin: 0">{{ form.summary || "（未填写简介）" }}</p>
          <div v-if="form.imageUrls.length" class="card-grid">
            <img v-for="url in form.imageUrls" :key="url" class="thumb" :src="url" alt="景点示意图" />
          </div>
          <MarkdownPreview :source="form.body" empty-text="正文为空。" />
          <p class="inline-note">未知来源 ID 会被拒绝；共享常量、ID、区域与节点不会随内容保存改变。</p>
        </div>
      </div>
    </AsyncSection>
  </section>
</template>

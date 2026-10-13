<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "../router";
import { pushToast, registerUnsavedGuard } from "../app/state";
import { assetCatalogue } from "../core/assets";
import type { FieldError } from "../core/result";
import { LIMITS } from "../core/validate";
import type { Article } from "../core/types";
import { adminGetArticle, createArticle, saveArticle, type ArticleInput } from "../services/content";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import FormField from "../components/FormField.vue";
import MarkdownPreview from "../components/MarkdownPreview.vue";
import PageHeader from "../components/PageHeader.vue";
import SelectInput from "../components/SelectInput.vue";
import TextInput from "../components/TextInput.vue";

const route = useRoute();
const isNew = computed(() => route.value.name === "article-new");
const articleId = computed(() => route.value.params.id ?? "");
const title = computed(() => (isNew.value ? "新增内容" : `编辑内容 · ${articleId.value}`));

const form = ref<ArticleInput>({
  category: "guide",
  title: "",
  summary: "",
  body: "",
  coverUrl: assetCatalogue[0].url,
});
const saved = ref<ArticleInput | null>(null);
const published = ref(false);
/** 编辑页在数据到位前只显示加载态，避免先渲染空表单再被覆盖。 */
const loading = ref(!isNew.value);
const saving = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);
const tab = ref<"edit" | "preview">("edit");
const bodyRef = ref<InstanceType<typeof TextInput> | null>(null);
/** 未保存判定统一以“已保存基线”为准：新增页基线为空表单，保存后立即刷新基线。 */
const baseline = ref<ArticleInput | null>(
  isNew.value ? { category: "guide", title: "", summary: "", body: "", coverUrl: assetCatalogue[0].url } : null,
);

const dirty = computed(() => {
  if (!baseline.value) return false;
  const keys = Object.keys(baseline.value) as Array<keyof ArticleInput>;
  return keys.some((key) => baseline.value![key] !== form.value[key]);
});

let removeGuard: (() => void) | null = null;

async function load(): Promise<void> {
  if (isNew.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  const response = await adminGetArticle(articleId.value);
  loading.value = false;
  if (!response.ok) {
    error.value = response.error.message;
    return;
  }
  const article: Article = response.data;
  const state: ArticleInput = {
    category: article.category,
    title: article.title,
    summary: article.summary,
    body: article.body,
    coverUrl: article.coverUrl,
  };
  form.value = { ...state };
  saved.value = { ...state };
  baseline.value = { ...state };
  published.value = article.published;
}

function textareaElement(): HTMLTextAreaElement | null {
  return (bodyRef.value?.$el ?? null) as HTMLTextAreaElement | null;
}
function insert(before: string, after = "", placeholder = ""): void {
  const element = textareaElement();
  if (!element) {
    form.value.body = `${form.value.body}${before}${placeholder}${after}`;
    return;
  }
  const start = element.selectionStart ?? form.value.body.length;
  const end = element.selectionEnd ?? start;
  const selected = form.value.body.slice(start, end) || placeholder;
  const next = `${form.value.body.slice(0, start)}${before}${selected}${after}${form.value.body.slice(end)}`;
  form.value.body = next;
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(start + before.length, start + before.length + selected.length);
  });
}

function insertImage(url: string): void {
  const asset = assetCatalogue.find((item) => item.url === url);
  insert(`![${asset?.alt ?? "示意图"}](${url})`, "", "");
}

async function submit(publish: boolean): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  formError.value = null;
  fieldErrors.value = [];
  const payload: ArticleInput = { ...form.value };
  if (isNew.value) {
    const created = await createArticle({ ...payload, published: publish });
    saving.value = false;
    if (!created.ok) {
      formError.value = created.error.code === "VALIDATION_ERROR" ? "表单校验未通过，请检查标红字段。" : created.error.message;
      fieldErrors.value = created.error.fieldErrors ?? [];
      return;
    }
    saved.value = { ...payload };
    baseline.value = { ...payload };
    pushToast("success", publish ? "内容已创建并发布。" : "草稿已保存。");
    window.location.hash = `#/content/articles/${created.data.id}/edit`;
    return;
  }
  const response = await saveArticle(articleId.value, { ...payload, published: publish ? true : published.value });
  saving.value = false;
  if (!response.ok) {
    formError.value = response.error.code === "VALIDATION_ERROR" ? "表单校验未通过，请检查标红字段。" : response.error.message;
    fieldErrors.value = response.error.fieldErrors ?? [];
    return;
  }
  saved.value = { ...payload };
  baseline.value = { ...payload };
  published.value = response.data.published;
  pushToast("success", publish ? "内容已发布。" : "修改已保存。");
}

onMounted(() => {
  void load();
  removeGuard = registerUnsavedGuard(() => (dirty.value ? "内容编辑有未保存的草稿。" : null));
});

onBeforeUnmount(() => removeGuard?.());
</script>

<template>
  <section class="stack">
    <PageHeader :title="title" description="标题、加粗、列表、链接与素材图片；原始 HTML 会被忽略，可执行 URL 会被拒绝。">
      <template #actions>
        <a class="btn" href="#/content/articles">返回列表</a>
        <AdminButton :loading="saving" @click="submit(false)">{{ isNew ? "保存草稿" : "保存修改" }}</AdminButton>
        <AdminButton variant="primary" :loading="saving" @click="submit(true)">发布</AdminButton>
      </template>
    </PageHeader>

    <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
      <div class="split-2" :inert="saving && isNew">
        <form class="panel form-stack" @submit.prevent="submit(false)">
          <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>
          <p class="inline-note">
            当前状态：{{ isNew ? "新增（默认未发布）" : published ? "已发布" : "未发布" }}；保存草稿与发布是两种明确操作。
          </p>

          <div class="form-grid">
            <FormField label="栏目" field="category" required :errors="fieldErrors">
              <template #default="{ invalid }">
                <SelectInput
                  id="category"
                  v-model="form.category"
                  :invalid="invalid"
                  :options="[
                    { value: 'news', label: '资讯 news' },
                    { value: 'guide', label: '指南 guide' },
                  ]"
                />
              </template>
            </FormField>

            <FormField label="封面" field="coverUrl" required :errors="fieldErrors" hint="来自随包素材清单">
              <template #default="{ invalid }">
                <SelectInput
                  id="coverUrl"
                  v-model="form.coverUrl"
                  :invalid="invalid"
                  :options="assetCatalogue.map((asset) => ({ value: asset.url, label: asset.title }))"
                />
              </template>
            </FormField>
          </div>

          <FormField label="标题" field="title" required :errors="fieldErrors" :hint="`1—${LIMITS.title.max} 字`">
            <template #default="{ invalid }">
              <TextInput id="title" v-model="form.title" :invalid="invalid" :maxlength="LIMITS.title.max" />
            </template>
          </FormField>

          <FormField label="摘要" field="summary" required :errors="fieldErrors" :hint="`1—${LIMITS.summary.max} 字`">
            <template #default="{ invalid }">
              <TextInput id="summary" v-model="form.summary" textarea :rows="3" :invalid="invalid" :maxlength="LIMITS.summary.max" />
            </template>
          </FormField>

          <FormField
            label="正文（Markdown）"
            field="body"
            required
            :errors="fieldErrors"
            :hint="`1—${LIMITS.markdownBody.max} 字；图片与封面均来自本地素材清单`"
          >
            <template #default="{ invalid }">
              <div class="stack" style="gap: 8px">
                <div class="md-toolbar">
                  <AdminButton size="sm" @click.prevent="insert('## ', '', '小标题')">标题</AdminButton>
                  <AdminButton size="sm" @click.prevent="insert('**', '**', '加粗文字')">加粗</AdminButton>
                  <AdminButton size="sm" @click.prevent="insert('- ', '', '列表项')">列表</AdminButton>
                  <AdminButton size="sm" @click.prevent="insert('[', '](https://example.com)', '链接文字')">链接</AdminButton>
                  <select
                    class="select"
                    style="width: auto; min-height: 30px"
                    aria-label="插入素材图片"
                    @change="insertImage(($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">插入素材图片…</option>
                    <option v-for="asset in assetCatalogue" :key="asset.url" :value="asset.url">{{ asset.title }}</option>
                  </select>
                  <span class="md-toolbar__spacer" />
                  <button
                    class="btn btn--sm"
                    type="button"
                    :aria-pressed="tab === 'edit'"
                    @click="tab = 'edit'"
                  >
                    编辑
                  </button>
                  <button class="btn btn--sm" type="button" :aria-pressed="tab === 'preview'" @click="tab = 'preview'">
                    预览
                  </button>
                </div>
                <TextInput
                  v-if="tab === 'edit'"
                  id="body"
                  ref="bodyRef"
                  v-model="form.body"
                  textarea
                  :rows="16"
                  :invalid="invalid"
                />
                <MarkdownPreview v-else :source="form.body" />
              </div>
            </template>
          </FormField>
        </form>

        <div class="panel stack">
          <p class="section-title">预览</p>
          <img v-if="form.coverUrl" class="thumb" :src="form.coverUrl" alt="封面示意图" />
          <h2 class="serif-title" style="font-size: 20px">{{ form.title || "（未填写标题）" }}</h2>
          <p style="margin: 0">{{ form.summary || "（未填写摘要）" }}</p>
          <MarkdownPreview :source="form.body" empty-text="正文为空。" />
          <p class="inline-note">保存失败会保留草稿与输入，不关闭表单，也不更新已保存内容。</p>
        </div>
      </div>
    </AsyncSection>
  </section>
</template>

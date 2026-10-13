<script setup lang="ts">
import { cachedFilters } from "../app/filter-cache";
import { onMounted, reactive, ref } from "vue";
import { askConfirm, pushToast } from "../app/state";
import { dateTimeText } from "../app/format";
import type { Article } from "../core/types";
import { adminListArticles, deleteArticle, saveArticle, type ArticleQuery } from "../services/content";
import type { ListResult } from "../services/list";
import { withQuery } from "../router";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import DataTable from "../components/DataTable.vue";
import DrawerPanel from "../components/DrawerPanel.vue";
import FilterBar from "../components/FilterBar.vue";
import FormField from "../components/FormField.vue";
import MarkdownPreview from "../components/MarkdownPreview.vue";
import PageHeader from "../components/PageHeader.vue";
import Pagination from "../components/Pagination.vue";
import SelectInput from "../components/SelectInput.vue";
import StatusTag from "../components/StatusTag.vue";
import TextInput from "../components/TextInput.vue";

const filters = cachedFilters("articles", { keyword: "", category: "all", published: "all", page: 1, pageSize: 20 });
const result = ref<ListResult<Article> | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const previewArticle = ref<Article | null>(null);
const busyId = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const response = await adminListArticles({
    keyword: filters.keyword,
    category: filters.category as ArticleQuery["category"],
    published: filters.published === "all" ? "all" : filters.published === "published",
    page: filters.page,
    pageSize: filters.pageSize,
  });
  loading.value = false;
  if (!response.ok) {
    error.value = response.error.message;
    return;
  }
  result.value = response.data;
}

async function search(): Promise<void> {
  filters.page = 1;
  await load();
}

async function reset(): Promise<void> {
  filters.keyword = "";
  filters.category = "all";
  filters.published = "all";
  filters.page = 1;
  await load();
}

async function togglePublished(article: Article): Promise<void> {
  const next = !article.published;
  const confirmed = await askConfirm({
    title: next ? "发布内容" : "下架内容",
    message: next ? `将发布《${article.title}》。` : `将下架《${article.title}》。`,
    details: next ? ["发布后本后台查询与预览立即显示为已发布。"] : ["下架后本后台显示为未发布，不增加审批或版本流程。"],
    confirmText: next ? "发布" : "下架",
  });
  if (!confirmed) return;
  busyId.value = article.id;
  const response = await saveArticle(article.id, {
    category: article.category,
    title: article.title,
    summary: article.summary,
    body: article.body,
    coverUrl: article.coverUrl,
    published: next,
  });
  busyId.value = null;
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  pushToast("success", next ? "内容已发布。" : "内容已下架。");
  await load();
}

async function remove(article: Article): Promise<void> {
  const confirmed = await askConfirm({
    title: "删除内容",
    message: `将删除《${article.title}》（${article.id}）。`,
    details: ["删除后该内容不再出现在列表中，且不能在本后台恢复。"],
    confirmText: "删除",
    danger: true,
  });
  if (!confirmed) return;
  busyId.value = article.id;
  const response = await deleteArticle(article.id);
  busyId.value = null;
  if (!response.ok) {
    pushToast("error", response.error.message);
    return;
  }
  pushToast("success", "内容已删除。");
  await load();
}

onMounted(load);
</script>

<template>
  <section class="stack">
    <PageHeader title="资讯与指南" description="先筛选全部结果再分页；发布与下架不增加审批流程，删除前确认具体对象。">
      <template #actions>
        <a class="btn btn--primary" :href="`#${withQuery('/content/articles/new', {})}`">新增内容</a>
      </template>
    </PageHeader>

    <FilterBar :busy="loading" @submit="search" @reset="reset">
      <FormField label="关键词" field="article-keyword">
        <TextInput id="article-keyword" v-model="filters.keyword" placeholder="匹配标题与摘要" />
      </FormField>
      <FormField label="栏目" field="article-category">
        <SelectInput
          id="article-category"
          v-model="filters.category"
          :options="[
            { value: 'all', label: '全部栏目' },
            { value: 'news', label: '资讯' },
            { value: 'guide', label: '指南' },
          ]"
        />
      </FormField>
      <FormField label="发布状态" field="article-published">
        <SelectInput
          id="article-published"
          v-model="filters.published"
          :options="[
            { value: 'all', label: '全部' },
            { value: 'published', label: '已发布' },
            { value: 'draft', label: '未发布' },
          ]"
        />
      </FormField>
    </FilterBar>

    <div class="panel">
      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <DataTable
          :columns="[
            { key: 'title', label: '标题' },
            { key: 'category', label: '栏目' },
            { key: 'published', label: '发布状态' },
            { key: 'updatedAt', label: '更新时间' },
            { key: 'actions', label: '操作' },
          ]"
          :rows="result?.items ?? []"
          :row-key="(row) => String(row.id)"
          empty-text="没有符合条件的内容，可调整关键词或栏目筛选。"
        >
          <template #cell-title="{ row }">
            <span class="stack" style="gap: 2px">
              <span>{{ row.title }}</span>
              <span class="muted small">{{ row.id }}</span>
            </span>
          </template>
          <template #cell-category="{ row }">
            <StatusTag :label="row.category === 'news' ? '资讯' : '指南'" :tone="row.category === 'news' ? 'info' : 'neutral'" />
          </template>
          <template #cell-published="{ row }">
            <StatusTag :label="row.published ? '已发布' : '未发布'" :tone="row.published ? 'success' : 'neutral'" />
          </template>
          <template #cell-updatedAt="{ row }">
            <span class="num">{{ dateTimeText(Number(row.updatedAt)) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <span class="btn-group">
              <AdminButton size="sm" @click="previewArticle = row as unknown as Article">预览</AdminButton>
              <a class="btn btn--sm" :href="`#/content/articles/${row.id}/edit`">编辑</a>
              <AdminButton size="sm" :loading="busyId === row.id" @click="togglePublished(row as unknown as Article)">
                {{ row.published ? "下架" : "发布" }}
              </AdminButton>
              <AdminButton size="sm" variant="danger" :loading="busyId === row.id" @click="remove(row as unknown as Article)">
                删除
              </AdminButton>
            </span>
          </template>
        </DataTable>
        <Pagination
          v-if="result"
          :page="result.page"
          :page-size="result.pageSize"
          :total="result.total"
          :page-count="result.pageCount"
          @update:page="(page) => { filters.page = page; load(); }"
          @update:page-size="(size) => { filters.pageSize = size; filters.page = 1; load(); }"
        />
      </AsyncSection>
    </div>

    <DrawerPanel v-if="previewArticle" :title="previewArticle.title" :wide="true" @close="previewArticle = null">
      <dl class="definition-list">
        <dt>栏目</dt>
        <dd>{{ previewArticle.category === "news" ? "资讯" : "指南" }}</dd>
        <dt>状态</dt>
        <dd>{{ previewArticle.published ? "已发布" : "未发布（预览草稿）" }}</dd>
        <dt>更新时间</dt>
        <dd class="num">{{ dateTimeText(previewArticle.updatedAt) }}</dd>
      </dl>
      <img v-if="previewArticle.coverUrl" class="thumb" :src="previewArticle.coverUrl" alt="封面示意图" />
      <p style="margin: 0">{{ previewArticle.summary }}</p>
      <MarkdownPreview :source="previewArticle.body" />
      <template #footer>
        <AdminButton @click="previewArticle = null">关闭</AdminButton>
      </template>
    </DrawerPanel>
  </section>
</template>

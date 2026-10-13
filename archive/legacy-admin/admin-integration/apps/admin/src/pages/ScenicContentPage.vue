<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { pushToast, registerUnsavedGuard } from "../app/state";
import { assetCatalogue } from "../core/assets";
import type { FieldError } from "../core/result";
import { LIMITS } from "../core/validate";
import { getScenic, saveScenic } from "../services/content";
import AdminButton from "../components/AdminButton.vue";
import AsyncSection from "../components/AsyncSection.vue";
import FormField from "../components/FormField.vue";
import PageHeader from "../components/PageHeader.vue";
import SelectInput from "../components/SelectInput.vue";
import TextInput from "../components/TextInput.vue";

interface FormState {
  name: string;
  summary: string;
  address: string;
  servicePhone: string;
  coverUrl: string;
  openingText: string;
}

const form = ref<FormState>({
  name: "",
  summary: "",
  address: "",
  servicePhone: "",
  coverUrl: assetCatalogue[0].url,
  openingText: "",
});
const saved = ref<FormState | null>(null);
/** 数据到位前只显示加载态，避免先渲染空表单再被覆盖。 */
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);
const editing = ref(false);
const showPreview = ref(false);

const dirty = computed(() => {
  if (!saved.value) return false;
  return (Object.keys(saved.value) as Array<keyof FormState>).some((key) => saved.value![key] !== form.value[key]);
});

let removeGuard: (() => void) | null = null;

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  const result = await getScenic();
  loading.value = false;
  if (!result.ok) {
    error.value = result.error.message;
    return;
  }
  const state: FormState = {
    name: result.data.name,
    summary: result.data.summary,
    address: result.data.address,
    servicePhone: result.data.servicePhone,
    coverUrl: result.data.coverUrl,
    openingText: result.data.openingText,
  };
  form.value = { ...state };
  saved.value = { ...state };
}

function cancelEdit(): void {
  if (!saved.value) return;
  form.value = { ...saved.value };
  fieldErrors.value = [];
  formError.value = null;
  editing.value = false;
  showPreview.value = false;
}

async function submit(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  formError.value = null;
  fieldErrors.value = [];
  const result = await saveScenic({ ...form.value });
  saving.value = false;
  if (!result.ok) {
    formError.value = result.error.code === "VALIDATION_ERROR" ? "景区资料校验未通过，请检查标红字段。" : result.error.message;
    fieldErrors.value = result.error.fieldErrors ?? [];
    return;
  }
  const state: FormState = {
    name: result.data.name,
    summary: result.data.summary,
    address: result.data.address,
    servicePhone: result.data.servicePhone,
    coverUrl: result.data.coverUrl,
    openingText: result.data.openingText,
  };
  form.value = { ...state };
  saved.value = { ...state };
  editing.value = false;
  pushToast("success", "景区资料已保存，可在本页与刷新后复查。");
}

onMounted(() => {
  void load();
  removeGuard = registerUnsavedGuard(() => (dirty.value ? "景区资料有未保存的修改。" : null));
});

onBeforeUnmount(() => removeGuard?.());
</script>

<template>
  <section class="stack">
    <PageHeader
      title="景区资料"
      description="编辑本后台统一使用的景区文案；营业说明只影响展示，不改变预约与设施营业规则。"
    >
      <template #actions>
        <AdminButton v-if="!editing" variant="primary" @click="editing = true">编辑</AdminButton>
        <AdminButton v-if="editing" @click="showPreview = !showPreview">
          {{ showPreview ? "关闭预览" : "预览草稿" }}
        </AdminButton>
        <AdminButton v-if="editing" :loading="saving" variant="primary" @click="submit">保存</AdminButton>
        <AdminButton v-if="editing" :disabled="saving" @click="cancelEdit">取消修改</AdminButton>
      </template>
    </PageHeader>

    <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
      <div class="split-2">
        <form class="panel form-stack" @submit.prevent="submit">
          <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>

          <FormField label="景区名称" field="name" required :errors="fieldErrors" :hint="`1—${LIMITS.scenicName.max} 字`">
            <template #default="{ invalid }">
              <TextInput id="name" v-model="form.name" :invalid="invalid" :readonly="!editing" :maxlength="LIMITS.scenicName.max" />
            </template>
          </FormField>

          <FormField label="景区简介" field="summary" required :errors="fieldErrors" :hint="`1—${LIMITS.summary.max} 字`">
            <template #default="{ invalid }">
              <TextInput id="summary" v-model="form.summary" textarea :rows="4" :invalid="invalid" :readonly="!editing" :maxlength="LIMITS.summary.max" />
            </template>
          </FormField>

          <FormField label="地址" field="address" required :errors="fieldErrors" :hint="`1—${LIMITS.addressOrHours.max} 字`">
            <template #default="{ invalid }">
              <TextInput id="address" v-model="form.address" :invalid="invalid" :readonly="!editing" :maxlength="LIMITS.addressOrHours.max" />
            </template>
          </FormField>

          <FormField
            label="演示服务电话"
            field="servicePhone"
            required
            :errors="fieldErrors"
            hint="7—20 位，允许数字、+、空格与连字符"
          >
            <template #default="{ invalid }">
              <TextInput id="servicePhone" v-model="form.servicePhone" :invalid="invalid" :readonly="!editing" :maxlength="20" />
            </template>
          </FormField>

          <FormField label="封面" field="coverUrl" required :errors="fieldErrors" hint="从随包素材清单选择，离线静态资源可用">
            <template #default="{ invalid }">
              <SelectInput
                id="coverUrl"
                v-model="form.coverUrl"
                :invalid="invalid"
                :disabled="!editing"
                :options="assetCatalogue.map((asset) => ({ value: asset.url, label: asset.title }))"
              />
            </template>
          </FormField>

          <FormField
            label="营业说明"
            field="openingText"
            required
            :errors="fieldErrors"
            :hint="`1—${LIMITS.addressOrHours.max} 字；仅展示文案`"
          >
            <template #default="{ invalid }">
              <TextInput
                id="openingText"
                v-model="form.openingText"
                textarea
                :rows="3"
                :invalid="invalid"
                :readonly="!editing"
                :maxlength="LIMITS.addressOrHours.max"
              />
            </template>
          </FormField>

          <p class="muted small" style="margin: 0">
            未保存时切换路由、关闭页面或退出会提示放弃修改；保存失败会保留当前输入且不覆盖已保存值。
          </p>
        </form>

        <div class="panel stack">
          <p class="section-title">{{ showPreview && editing ? "草稿预览" : "当前已保存内容" }}</p>
          <img
            v-if="form.coverUrl"
            class="thumb"
            :src="form.coverUrl"
            :alt="assetCatalogue.find((asset) => asset.url === form.coverUrl)?.alt ?? '景区封面'"
          />
          <h2 class="serif-title" style="font-size: 20px">{{ form.name || "（未填写名称）" }}</h2>
          <p style="margin: 0">{{ form.summary || "（未填写简介）" }}</p>
          <dl class="definition-list">
            <dt>地址</dt>
            <dd>{{ form.address || "—" }}</dd>
            <dt>服务电话</dt>
            <dd class="num">{{ form.servicePhone || "—" }}</dd>
            <dt>营业说明</dt>
            <dd>{{ form.openingText || "—" }}</dd>
          </dl>
          <p class="inline-note">
            预览显示当前草稿；保存后成为本后台统一景区文案。跨端标题更新不属于本期。
          </p>
        </div>
      </div>
    </AsyncSection>
  </section>
</template>

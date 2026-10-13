<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { Check, ImageOff, Pencil } from "lucide-vue-next";
import { LiquidGlassButton, LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import { pushToast } from "../app/state";
import { useDraftGuard } from "../app/use-draft-guard";
import { assetByUrl, assetCatalogue } from "../core/assets";
import type { FieldError } from "../core/result";
import { codePointLength, LIMITS } from "../core/validate";
import { getScenic, saveScenic, type ScenicSaveInput } from "../services/content";
import AsyncSection from "../components/AsyncSection.vue";
import FormField from "../components/FormField.vue";
import TextInput from "../components/TextInput.vue";

const saved = ref<ScenicSaveInput | null>(null);
const draft = ref<ScenicSaveInput>({ name: "", summary: "", address: "", servicePhone: "", coverUrl: "", openingText: "" });
const loading = ref(true);
const saving = ref(false);
const editing = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);
const failedImages = ref<Record<string, boolean>>({});
const editButton = ref<InstanceType<typeof LiquidGlassButton> | null>(null);
const editForm = ref<HTMLFormElement | null>(null);
const formErrorBanner = ref<HTMLElement | null>(null);

function snapshot(value: ScenicSaveInput): ScenicSaveInput {
  const { name, summary, address, servicePhone, coverUrl, openingText } = value;
  return { name, summary, address, servicePhone, coverUrl, openingText };
}
const dirty = computed(() => editing.value && saved.value !== null &&
  (Object.keys(draft.value) as Array<keyof ScenicSaveInput>).some(key => draft.value[key] !== saved.value![key]));
const discard = useDraftGuard(() => dirty.value, "景区资料有未保存的修改。", () => saving.value);
const coverError = computed(() => fieldErrors.value.find(item => item.field === "coverUrl")?.message);

async function load(): Promise<void> {
  error.value = null;
  loading.value = true;
  try {
    const result = await getScenic();
    if (!result.ok) error.value = result.error.message;
    else {
      saved.value = snapshot(result.data);
      failedImages.value = {};
    }
  } catch {
    error.value = "景区资料暂时无法读取，请重试。";
  } finally {
    loading.value = false;
  }
}

async function beginEdit(): Promise<void> {
  if (!saved.value || loading.value || saving.value || editing.value) return;
  draft.value = snapshot(saved.value);
  fieldErrors.value = [];
  formError.value = null;
  editing.value = true;
  await nextTick();
  editForm.value?.querySelector<HTMLInputElement>("#name")?.focus();
}

async function finishEdit(): Promise<void> {
  editing.value = false;
  fieldErrors.value = [];
  formError.value = null;
  await nextTick();
  editButton.value?.focus();
}

async function cancelEdit(): Promise<void> {
  if (saving.value || !await discard() || !saved.value) return;
  draft.value = snapshot(saved.value);
  await finishEdit();
}

async function focusError(): Promise<void> {
  await nextTick();
  // Follow visual/keyboard order, regardless of the service's validation order.
  const invalid = editForm.value?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input[aria-invalid='true'], textarea[aria-invalid='true']");
  (invalid ?? formErrorBanner.value)?.focus();
}

async function submit(): Promise<void> {
  if (!editing.value || saving.value || !dirty.value) return;
  saving.value = true;
  formError.value = null;
  fieldErrors.value = [];
  let succeeded = false;
  try {
    const result = await saveScenic(snapshot(draft.value));
    if (!result.ok) {
      formError.value = result.error.code === "VALIDATION_ERROR" ? "请检查标记的字段后再保存。" : result.error.message;
      fieldErrors.value = result.error.fieldErrors ?? [];
    } else {
      saved.value = snapshot(result.data);
      draft.value = snapshot(result.data);
      succeeded = true;
    }
  } catch {
    formError.value = "保存失败，输入已保留，请重试。";
  } finally {
    saving.value = false;
  }
  if (succeeded) {
    await finishEdit();
    pushToast("success", "景区资料已保存。");
  } else await focusError();
}

onMounted(load);
</script>

<template>
  <section class="scenic-profile">
    <div class="scenic-profile__layout">
      <header class="scenic-profile__header">
        <div class="scenic-profile__title">
          <h1>景区资料</h1>
          <span v-if="dirty" class="scenic-profile__dirty" role="status">未保存</span>
        </div>
        <div class="scenic-profile__actions">
          <template v-if="editing">
            <LiquidGlassButton variant="primary" type="submit" form="scenic-profile-form" :loading="saving" :disabled="!dirty" :radius="18">{{ saving ? '保存中' : '保存' }}</LiquidGlassButton>
            <LiquidGlassButton variant="transparent" class="scenic-profile__cancel" type="button" :disabled="saving" @click="cancelEdit">取消</LiquidGlassButton>
          </template>
          <LiquidGlassButton v-else ref="editButton" variant="primary" :disabled="loading || !saved || Boolean(error)" :radius="18" @click="beginEdit"><Pencil :size="18" aria-hidden="true" />编辑资料</LiquidGlassButton>
        </div>
      </header>

      <AsyncSection :loading="loading" :error="error ?? undefined" @retry="load">
        <template v-if="saved && !editing">
          <LiquidGlassSurface as="section" class="scenic-profile__card scenic-profile__identity" :radius="22" :blur="2" :tint-opacity="0.16" aria-labelledby="scenic-name">
            <div class="scenic-profile__cover">
              <img v-if="saved.coverUrl && !failedImages[saved.coverUrl]" :src="saved.coverUrl" :alt="assetByUrl(saved.coverUrl)?.alt ?? '景区封面'" @error="failedImages[saved.coverUrl] = true" />
              <div v-else class="scenic-profile__cover-empty" role="status"><ImageOff :size="32" aria-hidden="true" /><span>{{ saved.coverUrl ? '封面暂时无法显示' : '尚未设置封面' }}</span></div>
            </div>
            <div class="scenic-profile__intro">
              <h2 id="scenic-name">{{ saved.name }}</h2>
              <p>{{ saved.summary }}</p>
            </div>
          </LiquidGlassSurface>
          <LiquidGlassSurface as="section" class="scenic-profile__card scenic-profile__services" :radius="22" :blur="2" :tint-opacity="0.16" aria-label="服务信息">
            <div class="scenic-profile__opening">
              <h2>营业说明</h2>
              <p>{{ saved.openingText }}</p>
            </div>
            <dl class="scenic-profile__contact">
              <div><dt>地址</dt><dd>{{ saved.address }}</dd></div>
              <div><dt>服务电话</dt><dd class="num">{{ saved.servicePhone }}</dd></div>
            </dl>
          </LiquidGlassSurface>
        </template>

        <form v-else-if="saved && editing" id="scenic-profile-form" ref="editForm" class="scenic-profile__form" :aria-busy="saving" novalidate @submit.prevent="submit">
          <p v-if="formError" ref="formErrorBanner" class="form-error-banner" role="alert" tabindex="-1">{{ formError }}</p>
          <LiquidGlassSurface as="section" class="scenic-profile__card" :radius="22" :blur="2" :tint-opacity="0.16" aria-labelledby="scenic-intro-title">
            <h2 id="scenic-intro-title" class="scenic-profile__section-title">景区介绍</h2>
            <div class="scenic-profile__edit-intro">
              <div class="scenic-profile__fields">
                <FormField label="景区名称" field="name" required :errors="fieldErrors">
                  <template #default="{ invalid }">
                    <TextInput id="name" v-model="draft.name" :invalid="invalid" :disabled="saving" :maxlength="LIMITS.scenicName.max" aria-describedby="name-help" />
                    <p id="name-help" class="scenic-profile__field-help"><span>1—{{ LIMITS.scenicName.max }} 字</span><span class="num">{{ codePointLength(draft.name) }} / {{ LIMITS.scenicName.max }}</span></p>
                  </template>
                </FormField>
                <FormField label="景区简介" field="summary" required :errors="fieldErrors">
                  <template #default="{ invalid }">
                    <TextInput id="summary" v-model="draft.summary" textarea :rows="5" :invalid="invalid" :disabled="saving" :maxlength="LIMITS.summary.max" aria-describedby="summary-help" />
                    <p id="summary-help" class="scenic-profile__field-help"><span>1—{{ LIMITS.summary.max }} 字</span><span class="num">{{ codePointLength(draft.summary) }} / {{ LIMITS.summary.max }}</span></p>
                  </template>
                </FormField>
              </div>
              <fieldset class="scenic-profile__cover-picker" :disabled="saving" :aria-describedby="coverError ? 'cover-error' : undefined">
                <legend>封面</legend>
                <div class="scenic-profile__cover-options">
                  <label v-for="asset in assetCatalogue" :key="asset.id" class="scenic-profile__cover-option">
                    <input v-model="draft.coverUrl" type="radio" name="coverUrl" :value="asset.url" :aria-label="asset.title" :aria-invalid="Boolean(coverError) || undefined" />
                    <span class="scenic-profile__cover-choice">
                      <img v-if="!failedImages[asset.url]" :src="asset.url" alt="" @error="failedImages[asset.url] = true" />
                      <span v-else class="scenic-profile__thumbnail-empty"><ImageOff :size="24" aria-hidden="true" />图片无法显示</span>
                      <span class="scenic-profile__cover-caption">{{ asset.title }}</span>
                      <span v-if="draft.coverUrl === asset.url" class="scenic-profile__selected"><Check :size="16" aria-hidden="true" /><span>已选</span></span>
                    </span>
                  </label>
                </div>
                <p v-if="coverError" id="cover-error" class="field__error" role="alert">{{ coverError }}</p>
              </fieldset>
            </div>
          </LiquidGlassSurface>

          <LiquidGlassSurface as="section" class="scenic-profile__card" :radius="22" :blur="2" :tint-opacity="0.16" aria-labelledby="scenic-service-title">
            <h2 id="scenic-service-title" class="scenic-profile__section-title">服务信息</h2>
            <div class="scenic-profile__edit-services">
              <FormField label="营业说明" field="openingText" required :errors="fieldErrors">
                <template #default="{ invalid }">
                  <TextInput id="openingText" v-model="draft.openingText" textarea :rows="5" :invalid="invalid" :disabled="saving" :maxlength="LIMITS.addressOrHours.max" aria-describedby="opening-help" />
                  <p id="opening-help" class="scenic-profile__field-help"><span>1—{{ LIMITS.addressOrHours.max }} 字，不改变预约规则</span><span class="num">{{ codePointLength(draft.openingText) }} / {{ LIMITS.addressOrHours.max }}</span></p>
                </template>
              </FormField>
              <div class="scenic-profile__fields">
                <FormField label="地址" field="address" required :errors="fieldErrors">
                  <template #default="{ invalid }">
                    <TextInput id="address" v-model="draft.address" :invalid="invalid" :disabled="saving" :maxlength="LIMITS.addressOrHours.max" aria-describedby="address-help" />
                    <p id="address-help" class="scenic-profile__field-help"><span>1—{{ LIMITS.addressOrHours.max }} 字</span><span class="num">{{ codePointLength(draft.address) }} / {{ LIMITS.addressOrHours.max }}</span></p>
                  </template>
                </FormField>
                <FormField label="服务电话" field="servicePhone" required :errors="fieldErrors">
                  <template #default="{ invalid }">
                    <TextInput id="servicePhone" v-model="draft.servicePhone" type="tel" :invalid="invalid" :disabled="saving" :maxlength="20" aria-describedby="phone-help" />
                    <p id="phone-help" class="scenic-profile__field-help"><span>7—20 位，支持数字、+、空格与连字符</span><span class="num">{{ draft.servicePhone.length }} / 20</span></p>
                  </template>
                </FormField>
              </div>
            </div>
          </LiquidGlassSurface>
        </form>
      </AsyncSection>
    </div>
  </section>
</template>

<style scoped>
.scenic-profile { width: 100%; container-type: inline-size; }
.scenic-profile__layout, .scenic-profile__form { display: flex; flex-direction: column; gap: 24px; }
.scenic-profile__header, .scenic-profile__title, .scenic-profile__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 16px; }
.scenic-profile__header { justify-content: space-between; }
.scenic-profile__title h1 { font: 600 var(--admin-font-title)/1.3 var(--serif); }
.scenic-profile__dirty { font-size: var(--admin-font-small); color: var(--admin-warning); }
.scenic-profile__cancel { min-height: 48px; padding: 8px;   color: var(--muted); font-size: var(--admin-font-body); cursor: pointer; }
.scenic-profile__cancel:disabled { opacity: .55; cursor: default; }
.scenic-profile__card { padding: 24px; min-width: 0; font-weight: 400; }
.scenic-profile__identity { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-items: center; gap: 24px; }
.scenic-profile__cover { min-width: 0; aspect-ratio: 8 / 5; overflow: hidden; border-radius: 14px; }
.scenic-profile__cover img { width: 100%; height: 100%; display: block; object-fit: contain; }
.scenic-profile__cover-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: rgb(248 252 250 / .35); color: var(--muted); font-size: var(--admin-font-small); }
.scenic-profile__intro { min-width: 0; }
.scenic-profile__intro h2 { font: 600 var(--admin-font-title)/1.3 var(--serif); margin: 0 0 16px; overflow-wrap: anywhere; }
.scenic-profile__intro p, .scenic-profile__opening p { font-size: var(--admin-font-body); line-height: 1.65; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.scenic-profile__services, .scenic-profile__edit-services { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 24px; }
.scenic-profile__opening h2 { font-size: var(--admin-font-section); margin: 0 0 16px; }
.scenic-profile__contact { margin: 0; padding-left: 24px; border-left: 1px solid rgb(25 59 53 / .14); display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.scenic-profile__contact dt { font-size: var(--admin-font-small); color: var(--muted); margin-bottom: 6px; }
.scenic-profile__contact dd { margin: 0; font-size: var(--admin-font-body); line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.scenic-profile__section-title { font-size: var(--admin-font-section); margin: 0 0 24px; }
.scenic-profile__edit-intro { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 24px; }
.scenic-profile__fields { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.scenic-profile__field-help { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; margin: 0; color: var(--muted); font-size: var(--admin-font-small); }
.scenic-profile__field-help > .num { white-space: nowrap; margin-left: auto; }
.scenic-profile :deep(.input) {
  padding: 10px 14px;
  border-radius: 12px;
  border-color: rgb(25 59 53 / .18);
  background: rgb(114 168 151 / .07);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .35);
}
.scenic-profile :deep(.input:focus-visible) {
  border-color: var(--brand);
  background: rgb(114 168 151 / .10);
  outline: 2px solid var(--admin-focus);
  outline-offset: 2px;
}
.scenic-profile :deep(.input[aria-invalid="true"]) { border-color: var(--admin-danger); background: rgb(181 62 50 / .06); }
.scenic-profile :deep(.input:disabled) { opacity: .6; cursor: wait; }
.scenic-profile :deep(.field__error) { margin: 0; }
.scenic-profile__form > .form-error-banner { margin: 0; }
.scenic-profile__cover-picker { min-width: 0; margin: 0; padding: 0; border: 0; }
.scenic-profile__cover-picker legend { font-size: var(--admin-font-body); font-weight: 600; padding: 0; margin-bottom: 12px; }
.scenic-profile__cover-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.scenic-profile__cover-option { position: relative; min-width: 0; cursor: pointer; }
.scenic-profile__cover-option input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.scenic-profile__cover-choice { position: relative; display: flex; flex-direction: column; height: 100%; padding: 6px; border: 2px solid rgb(25 59 53 / .12); border-radius: 12px; background: rgb(248 252 250 / .18); }
.scenic-profile__cover-choice img { display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: contain; border-radius: 6px; }
.scenic-profile__thumbnail-empty { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6px; aspect-ratio: 8 / 5; font-size: var(--admin-font-small); color: var(--muted); }
.scenic-profile__cover-caption { display: block; padding: 8px 2px 2px; font-size: var(--admin-font-small); line-height: 1.5; overflow-wrap: anywhere; }
.scenic-profile__selected { position: absolute; top: 8px; right: 8px; display: inline-flex; align-items: center; gap: 2px; padding: 2px 5px; background: var(--brand); color: white; border-radius: 5px; font-size: var(--admin-font-small); }
.scenic-profile__cover-option input:checked + .scenic-profile__cover-choice { border-color: var(--brand); }
.scenic-profile__cover-option input:focus-visible + .scenic-profile__cover-choice { outline: 3px solid var(--admin-focus); outline-offset: 3px; }
.scenic-profile__cover-option input:disabled + .scenic-profile__cover-choice { opacity: .55; cursor: default; }
@container (max-width: 899px) {
  .scenic-profile__identity, .scenic-profile__services, .scenic-profile__edit-intro, .scenic-profile__edit-services { grid-template-columns: minmax(0, 1fr); }
  .scenic-profile__intro { grid-row: 1; }
  .scenic-profile__cover { width: 100%; max-width: 480px; }
  .scenic-profile__contact { padding: 20px 0 0; border-left: 0; border-top: 1px solid rgb(25 59 53 / .14); }
}
@container (max-width: 419px) {
  .scenic-profile__cover-options { grid-template-columns: minmax(0, 1fr); }
}
@media (forced-colors: active) {
  .scenic-profile :deep(.input) { background: Field; color: FieldText; border-color: ButtonText; box-shadow: none; }
  .scenic-profile__cover-option input:checked + .scenic-profile__cover-choice { border-color: Highlight; }
  .scenic-profile__selected { background: Highlight; color: HighlightText; }
}
</style>

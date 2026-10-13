<script setup lang="ts">
import { reactive, ref } from "vue";
import {
  validateRecord,
  type RecordItem,
  type Collection,
} from "@scene/domain";
import TextInput from "./TextInput.vue";
import { LiquidGlassButton } from "@scene/ui/liquid-glass";
const props = defineProps<{ item?: RecordItem; collection: Collection }>();
const emit = defineEmits<{ save: [Omit<RecordItem, "id">]; cancel: [] }>();
const defaults: Record<Collection, string> = {
  facilities: "正常",
  tasks: "待处理",
  inspections: "待处理",
  people: "已认证",
  buildings: "使用中",
  bookings: "已预约",
  visitors: "待到访",
  notices: "已发布",
  security: "关注",
  parking: "开放",
};
const statusChoices: Record<Collection, string[]> = {
  facilities: ["正常", "检修中"],
  tasks: ["待处理", "处理中", "已完成"],
  inspections: ["待处理", "处理中", "已完成"],
  people: ["已认证", "待认证"],
  buildings: ["使用中", "维护中"],
  bookings: ["已预约", "已取消"],
  visitors: ["待到访", "已到访", "已离开"],
  notices: ["已发布", "草稿"],
  security: ["关注", "正常", "已完成"],
  parking: ["开放", "关闭"],
};
const form = reactive({
  title: props.item?.title ?? "",
  location: props.item?.location ?? "",
  description: props.item?.description ?? "",
  category: props.item?.category ?? "日常服务",
  status: props.item?.status ?? defaults[props.collection],
  contact: props.item?.contact ?? "",
  capacity: props.item?.capacity ?? 0,
  used: props.item?.used ?? 0,
});
const error = ref("");
function submit() {
  error.value = validateRecord(
    form.title,
    form.location,
    form.description,
    form.contact,
  );
  if (error.value) return;
  if (
    ["buildings", "facilities", "parking"].includes(props.collection) &&
    (+form.capacity < 0 || +form.used < 0 || +form.used > +form.capacity)
  ) {
    error.value = "使用数量不能超过总量，且均不能为负数";
    return;
  }
  emit("save", {
    ...form,
    title: form.title.trim(),
    capacity: +form.capacity,
    used: +form.used,
    date: props.item?.date ?? "2026-09-25",
  });
}
</script>
<template>
  <form class="editor" @submit.prevent="submit">
    <label for="record-title"
      >名称<TextInput
        id="record-title"
        v-model="form.title"
        :maxlength="50" /></label
    ><label for="record-location"
      >位置<TextInput
        id="record-location"
        v-model="form.location"
        :maxlength="60"
    /></label>
    <div class="form-pair">
      <label for="record-category"
        >分类<TextInput
          id="record-category"
          v-model="form.category"
          :maxlength="30" /></label
      ><label
        >状态<select v-model="form.status">
          <option v-for="s in statusChoices[collection]" :key="s">
            {{ s }}
          </option>
        </select></label
      >
    </div>
    <label
      v-if="['people', 'visitors'].includes(collection)"
      for="record-contact"
      >联系电话<TextInput
        id="record-contact"
        v-model="form.contact"
        type="tel"
        :maxlength="11"
    /></label>
    <div
      v-if="['buildings', 'facilities', 'parking'].includes(collection)"
      class="form-pair"
    >
      <label for="record-capacity"
        >总量<TextInput
          id="record-capacity"
          v-model="form.capacity"
          type="number"
          :min="0" /></label
      ><label for="record-used"
        >已使用<TextInput
          id="record-used"
          v-model="form.used"
          type="number"
          :min="0"
      /></label>
    </div>
    <label for="record-description"
      >详细说明<TextInput
        id="record-description"
        v-model="form.description"
        textarea
        :rows="5"
        :maxlength="600"
    /></label>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="form-actions">
      <LiquidGlassButton type="button" @click="emit('cancel')"
        >取消</LiquidGlassButton
      ><LiquidGlassButton type="submit" class="primary">保存</LiquidGlassButton>
    </div>
  </form>
</template>

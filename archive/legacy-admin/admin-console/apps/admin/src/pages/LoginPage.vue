<script setup lang="ts">
import { ref } from "vue";
import { pushToast, session } from "../app/state";
import { useRoute } from "../router";
import { setHash } from "../app/state";
import { DEMO_ACCOUNT } from "../core/session";
import type { FieldError } from "../core/result";
import { staffLogin } from "../services/auth";
import { sessionWarning } from "../services/store";
import AdminButton from "../components/AdminButton.vue";
import FormField from "../components/FormField.vue";
import TextInput from "../components/TextInput.vue";

defineProps<{ expiredMessage?: string | null }>();

const route = useRoute();
const username = ref("");
const password = ref("");
const showPassword = ref(false);
const busy = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<FieldError[]>([]);

async function submit(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  formError.value = null;
  fieldErrors.value = [];
  const result = await staffLogin({ username: username.value, password: password.value });
  busy.value = false;
  if (!result.ok) {
    formError.value = result.error.code === "VALIDATION_ERROR" ? "请填写账号与密码。" : result.error.message;
    fieldErrors.value = result.error.fieldErrors ?? [];
    return;
  }
  session.value = result.data;
  const warning = sessionWarning();
  pushToast("success", `已登录：${result.data.nickname}`);
  if (warning) pushToast("info", warning);
  const redirect = route.value.params["query.redirect"];
  setHash(redirect && redirect.startsWith("/") ? redirect : "/overview", true);
}
</script>

<template>
  <section class="login-card" aria-labelledby="login-title">
    <div>
      <p class="muted small" style="margin: 0">青岚山境 · 后台管理</p>
      <h1 id="login-title">员工登录</h1>
      <p class="muted small" style="margin: 0">
        当前为本地 Mock 原型，登录仅在本标签内模拟，不代表真实服务端鉴权。
      </p>
    </div>

    <p v-if="expiredMessage" class="form-error-banner" role="status">{{ expiredMessage }}</p>

    <form class="form-stack" @submit.prevent="submit">
      <FormField label="账号" field="username" required :errors="fieldErrors">
        <template #default="{ error, invalid }">
          <TextInput
            id="username"
            v-model="username"
            :invalid="invalid"
            :maxlength="64"
            autocomplete="username"
            placeholder="请输入员工账号"
          />
          <span v-if="error" class="sr-only">{{ error }}</span>
        </template>
      </FormField>

      <FormField label="密码" field="password" required :errors="fieldErrors">
        <template #default="{ invalid }">
          <TextInput
            id="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            :invalid="invalid"
            :maxlength="128"
            autocomplete="current-password"
            placeholder="请输入密码"
          />
        </template>
      </FormField>

      <label class="checkbox-row">
        <input v-model="showPassword" type="checkbox" />
        显示密码
      </label>

      <p v-if="formError" class="form-error-banner" role="alert">{{ formError }}</p>

      <AdminButton type="submit" variant="primary" :loading="busy" style="width: 100%">
        {{ busy ? "登录中…" : "登录" }}
      </AdminButton>
    </form>

    <details class="demo-account">
      <summary>本地演示账号（仅用于公开样例）</summary>
      <p style="margin: 8px 0 0">
        账号 <strong>{{ DEMO_ACCOUNT.username }}</strong>，密码 <strong>{{ DEMO_ACCOUNT.password }}</strong>。
        密码只用于本地演示，不能作为生产凭证；模拟会话有效期为 12 个真实小时，保存在本标签的 sessionStorage，不保存密码。
      </p>
    </details>
  </section>
</template>

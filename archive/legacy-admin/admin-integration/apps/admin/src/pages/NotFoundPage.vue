<script setup lang="ts">
import { useRoute } from "../router";
import AdminButton from "../components/AdminButton.vue";
import PageHeader from "../components/PageHeader.vue";

const route = useRoute();

function backToOverview(): void {
  window.location.hash = "#/overview";
}
</script>

<template>
  <section class="stack">
    <PageHeader title="未知页面" description="当前地址没有对应的后台页面，可能是链接已过期或输入有误。" />
    <div class="panel stack">
      <p class="muted" style="margin: 0">
        请求的地址：<code>{{ route.path }}</code>
      </p>
      <div class="btn-group">
        <AdminButton variant="primary" @click="backToOverview">返回工作台</AdminButton>
      </div>
    </div>
  </section>
</template>

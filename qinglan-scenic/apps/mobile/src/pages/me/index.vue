<script setup lang="ts">
import BottomNav from "../../components/BottomNav.vue";
import { computed } from "vue";
import { state, act, go } from "../../model/store";
import { signOut } from "../../services/platform";
import Icon from "../../components/Icon.vue";
const upcoming = computed(() =>
  state.orders.find(
    (o) => o.kind === "entry" && o.status === "confirmed" && !o.entered,
  ),
);
function edit() { if (!state.aiSession) go("login/index"); return;

  uni.showModal({
    title: "体验昵称",
    editable: true,
    placeholderText: "请输入昵称",
    content: state.nickname,
    success: (r) => {
      if (r.confirm)
        act(() => {
          const name = r.content?.trim();
          if (!name || name.length > 30) throw Error("昵称应为 1—30 字。");
          state.nickname = name;
        });
    },
  });
}
const links = computed(() => [
 ["message-circle", "消息与申诉", "notifications/index"],
  state.aiSession ? ["log-out", "退出登录", "logout"] : ["user-round", "登录 / 注册", "login/index"],
  ["calendar-days", "我的预约", "orders/index"],
  ["bookmark", "我的收藏", "content/index?mode=favourites"],
  ["message-circle", "问答历史", "qa/index?history=1"],
  ["messages-square", "游客聊天", "chat/index"],
]);
async function openLink(path: string){
  if(path==='logout'){await signOut();uni.showToast({title:'已退出登录',icon:'none'});return;}
  go(path);
}
</script>
<template>
  <view class="page"
    ><view class="identity row"
      ><view class="avatar"><Icon name="user-round" active :size="30" /></view
      ><view class="grow"
        ><view class="title">{{ state.nickname || "山间来客" }}</view
        ><text class="subtle">{{
          state.nickname ? "游客昵称" : "未设置昵称"
        }}</text></view
      ><button class="link" @tap="edit"><Icon name="pencil" /></button></view
    ><view v-if="upcoming" class="panel upcoming"
      ><view class="row between"
        ><view class="heading">下一程，等你来</view
        ><text class="badge">待入园</text></view
      ><view class="subtle"
        >{{ upcoming.date }} · {{ upcoming.slot }} ·
        {{ upcoming.people }} 人</view
      ><button
        class="primary action"
        @tap="go('orders/index?id=' + upcoming.id)"
      >
        查看预约
      </button></view
    ><view class="panel"
      ><view
        v-for="item in links"
        :key="item[1]"
        class="list-item row"
        @tap="openLink(item[2])"
        ><Icon :name="item[0]" /><text class="grow">{{ item[1] }}</text
        ><Icon name="chevron-right" /></view></view
    ><view class="quiet"
      ><view class="heading">把时间交给风景</view
      ><text class="subtle">收藏喜欢的地方，下次接着看。</text></view
    ></view
  ><BottomNav current="me" />
</template>
<style scoped>
.identity {
  margin: 18px 0 32px;
}
.identity .title {
  font-size: 26px;
  margin: 0;
}
.avatar {
  width: 60px;
  height: 60px;
  background: #c8ded4;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.upcoming {
  background: #dceae3;
}
.action {
  margin-top: 18px;
  font-size: 14px;
}
.quiet {
  text-align: center;
  padding: 28px 0;
}
</style>

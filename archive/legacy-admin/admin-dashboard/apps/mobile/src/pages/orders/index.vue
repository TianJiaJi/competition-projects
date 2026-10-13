<script setup lang="ts">
import { ref, computed } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { state, act, tab } from "../../model/store";
import {
  dateAt,
  slots,
} from "../../model/domain";
import data from "../../data";
import Icon from "../../components/Icon.vue";
import {refreshOrders,orderAction} from "../../services/platform";
onShow(()=>void refreshOrders().catch(e=>uni.showToast({title:e.message,icon:"none"})));
const selected = ref(""),
  created = ref(false),
  editing = ref(false),
  newDate = ref(dateAt()),
  newSlot = ref(slots[1]);
onLoad((q) => {
  selected.value = q?.id || "";
  created.value = q?.created === "1";
});
const order = computed(() => state.orders.find((o) => o.id === selected.value));
function cancel(id: string) {
  uni.showModal({
    title: "取消预约",
    content: "确定取消这笔预约吗？取消后将释放预约名额。",
    confirmText: "确认取消",
    success: (r) => {
      if (r.confirm) void orderAction(id,"cancel").catch(e=>uni.showToast({title:e.message,icon:"none"}));
    },
  });
}
function edit() {
  if (!order.value) return;
  newDate.value = order.value.date;
  newSlot.value = order.value.slot;
  editing.value = true;
}
async function reschedule() { try {await orderAction(selected.value,'reschedule',{date:newDate.value,slot:newSlot.value});editing.value=false;}catch(e){uni.showToast({title:(e as Error).message,icon:'none'});} }
</script>
<template>
  <view class="page"
    ><template v-if="order"
      ><view v-if="created" class="success"
        ><view class="seal"
          ><Icon
            :name="order.status === 'cancelled' ? 'x' : 'check'"
            active
            :size="30" /></view
        ><view class="title">{{
          order.status === "cancelled" ? "预约已取消" : "预约成功"
        }}</view
        ><view class="subtle">{{
          order.status === "cancelled"
            ? "下次再来，山水依旧。"
            : "山水已在，等你来。"
        }}</view></view
      ><view class="panel ticket"
        ><view class="row between"
          ><view class="heading">青岚山境</view
          ><text class="badge">{{
            order.status === "cancelled" ? "已取消" : "已预约"
          }}</text></view
        ><view class="subtle">{{
          order.kind === "entry" ? "免费入园预约" : "独立停车预约"
        }}</view
        ><view class="date">{{ order.date }}</view
        ><view class="row between list-item"
          ><text>到访时段</text><text>{{ order.slot }}</text></view
        ><view class="row between list-item"
          ><text>{{ order.kind === "entry" ? "预约人数" : "车牌号" }}</text
          ><text>{{
            order.kind === "entry" ? order.people + " 人" : order.plate
          }}</text></view
        ><view v-if="order.kind === 'parking'" class="row between list-item"
          ><text>停车场</text
          ><text>{{
            data.points.find((p) => p.id === order?.parkingId)?.name
          }}</text></view
        ><view class="row between list-item"
          ><text>{{ order.kind === "entry" ? "入园状态" : "进场状态" }}</text
          ><text>{{
            order.exited
              ? "已离园"
              : order.entered
                ? "已进入"
                : order.kind === "entry"
                  ? "未入园"
                  : "未进场"
          }}</text></view
        ><view class="row between list-item"
          ><text>联系人</text><text>{{ order.name }}</text></view
        ><view class="subtle reminder">{{
          order.kind === "entry"
            ? "请按现场指引完成人脸识别入园，本轮不采集人脸。"
            : "预约不代表占有实体车位，请遵循停车场现场指引。"
        }}</view></view
      ><view v-if="order.status === 'confirmed' && !order.entered" class="row"
        ><button class="secondary grow" @tap="edit">申请改期</button
        ><button class="secondary grow" @tap="cancel(order.id)">
          取消预约
        </button></view
      ><view v-if="editing" class="panel"
        ><view class="heading">改期</view
        ><picker
          :range="[dateAt(), dateAt(1)]"
          @change="newDate = [dateAt(), dateAt(1)][Number($event.detail.value)]"
          ><button class="secondary full">
            {{ newDate }} · 选择日期
          </button></picker
        ><picker
          :range="slots"
          @change="newSlot = slots[Number($event.detail.value)]"
          ><button class="secondary full change">
            {{ newSlot }} · 选择时段
          </button></picker
        ><button class="primary full" @tap="reschedule">确认改期</button
        ><button class="link full" @tap="editing = false">
          保留原预约
        </button></view
      ><button class="primary full change" @tap="tab('home')">返回首页</button
      ><button
        class="link full"
        @tap="
          selected = '';
          created = false;
        "
      >
        全部预约</button
      ><view class="subtle"
        >预约资料保存在账号中，多设备同步。</view
      ></template
    ><template v-else
      ><view class="title">我的预约</view
      ><view v-if="!state.orders.length" class="empty"
        >还没有预约，选个时间出发吧。<button
          class="primary full change"
          @tap="tab('booking')"
        >
          去预约
        </button></view
      ><view
        v-for="o in state.orders"
        :key="o.id"
        class="panel"
        @tap="selected = o.id"
        ><view class="row between"
          ><view>{{ o.kind === "entry" ? "入园预约" : "停车预约" }}</view
          ><text class="badge">{{
            o.status === "cancelled"
              ? "已取消"
              : o.entered
                ? "已进入"
                : "已预约"
          }}</text></view
        ><view class="subtle change">{{ o.date }} · {{ o.slot }}</view
        ><text class="subtle"
          >{{ o.kind === "entry" ? o.people + " 人" : o.plate }} ›</text
        ></view
      ></template
    ></view
  >
</template>
<style scoped>
.success {
  text-align: center;
  padding: 20px 0;
}
.seal {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #d3e5dc;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}
.ticket {
  border-top: 3px solid #175f54;
}
.date {
  font-size: 26px;
  margin: 22px 0 12px;
}
.reminder {
  border-top: 1px dashed #91aaa0;
  padding-top: 18px;
  margin-top: 18px;
}
.change {
  margin: 16px 0;
}
</style>

<script setup lang="ts">
import ScenicStatus from "../../components/ScenicStatus.vue";
import {
  useScenicState,
  refreshScenicState,
  scenicStatus,
} from "../../services/scenic-state";
useScenicState(false);
import BottomNav from "../../components/BottomNav.vue";
import { reactive, computed, ref, watch } from "vue";
import data from "../../data";
import { state, act, go } from "../../model/store";
import {
  dateAt,

  uid,
} from "../../model/domain";
import type { OrderInput } from "../../model/types";
import { request } from "../../services/qa";
import { requireLogin, runtime, refreshOrders, isAuthError } from "../../services/platform";
const form = reactive<OrderInput>({
  kind: "entry",
  date: dateAt(),
  slot: "",
  people: 1,
  name: "",
  phone: "",
  plate: "",
  parkingId: "p1",
});
const requestId = ref(uid()),
  sending = ref(false);
const dates = ref([dateAt(), dateAt(1)]);
const slots=ref<string[]>([]);
const remaining=ref<Record<string,number>>({}),slotsLoading=ref(true),slotsError=ref('');
const bookable=ref<Record<string,boolean>>({});let slotsGeneration=0;
const availability=(_state:unknown,_date:string,slot:string,..._rest:unknown[])=>remaining.value[slot.slice(0,5)];
async function refreshSlots(){
 const generation=++slotsGeneration;slotsLoading.value=true;slotsError.value='';remaining.value={};
 try{
  const run=await runtime(),today=new Date(Date.parse(run.businessTime)+8*3600000).toISOString().slice(0,10);
  dates.value=[today,new Date(Date.parse(today+'T12:00:00+08:00')+86400000).toISOString().slice(0,10)];
  if(form.date<today)form.date=today;
  const result=await request<any>('/booking/slots?date='+form.date+'&kind='+form.kind+(form.kind==='parking'?'&lotId='+form.parkingId:''));
  if(generation!==slotsGeneration)return;
  slots.value=result.items.map((s:any)=>s.slot+'—'+s.end);
  remaining.value=Object.fromEntries(result.items.map((s:any)=>[s.slot,s.remaining]));
  bookable.value=Object.fromEntries(result.items.map((s:any)=>[s.slot,s.bookable!==false]));
  if(!bookable.value[form.slot.slice(0,5)]||!remaining.value[form.slot.slice(0,5)])form.slot='';
 }catch(e){
  if(generation!==slotsGeneration)return;
  if(isAuthError(e)){go('login/index');slotsError.value='请先登录游客账号';}
  else slotsError.value=(e as Error).message;
 }
 finally{if(generation===slotsGeneration)slotsLoading.value=false;}
}
watch(()=>[form.date,form.kind,form.parkingId],()=>void refreshSlots(),{immediate:true});
const parking = computed(() => data.points.filter((p) => p.kind === "parking"));
async function submit() {
 if(sending.value||slotsLoading.value||!form.slot)return;sending.value=true;
 try{await requireLogin(); const order=await request<{id:string}>('/booking/orders','POST',{...form,slot:form.slot.slice(0,5),lotId:form.kind==='parking'?form.parkingId:undefined},requestId.value);await refreshOrders();requestId.value=uid();go('orders/index?id='+order.id+'&created=1');}
 catch(e){uni.showToast({title:(e as Error).message,icon:'none'});}finally{sending.value=false;}
}
</script>
<template>
  <view class="page"
    ><ScenicStatus /><view class="row between"
      ><view class="title">为一程山水<br />留好时间。</view
      ><button class="link" @tap="go('orders/index')">预约记录</button></view
    ><view class="row"
      ><button
        class="chip grow"
        :class="{ selected: form.kind === 'entry' }"
        @tap="form.kind = 'entry'"
      >
        入园预约</button
      ><button
        class="chip grow"
        :class="{ selected: form.kind === 'parking' }"
        @tap="form.kind = 'parking'"
      >
        停车预约
      </button></view
    ><view class="panel reading-panel"
      ><view class="heading">选择日期</view
      ><view class="row"
        ><button
          v-for="(d, i) in dates"
          :key="d"
          class="chip grow"
          :class="{ selected: form.date === d }"
          @tap="form.date = d"
        >
          {{ i === 0 ? "今天" : "明天" }}<view class="subtle">{{ d }}</view>
        </button></view
      ><picker mode="date" :value="form.date" :start="dates[0]" @change="form.date=$event.detail.value"><button class="secondary full">{{form.date}} · 选择其他日期</button></picker><template v-if="form.kind === 'parking'"
        ><view class="label">停车场</view
        ><view class="stack"
          ><button
            v-for="p in parking"
            :key="p.id"
            class="chip"
            :class="{ selected: form.parkingId === p.id }"
            :disabled="state.closedPoints.includes(p.id)"
            @tap="form.parkingId = p.id"
          >
            {{ p.name }}{{ state.closedPoints.includes(p.id) ? " · 关闭" : "" }}
          </button></view
        ></template
      ><view class="label">到访时段</view><view v-if="slotsLoading" class="subtle">正在读取预约配额…</view><view v-else-if="slotsError" class="error" @tap="refreshSlots">{{slotsError}} · 点击重试</view
      ><view v-else class="grid"
        ><button
          v-for="slot in slots"
          :key="slot"
          class="chip slot"
          :class="{ selected: form.slot === slot }"
          :disabled="
            availability(state, form.date, slot, form.kind, form.parkingId) ===
            0 || !bookable[slot.slice(0,5)]
          "
          @tap="form.slot = slot"
        >
          <view>{{ slot }}</view
          ><view class="slot-count"
            >{{bookable[slot.slice(0,5)] ? "余" : "已结束 · 余"}}
            {{
              availability(state, form.date, slot, form.kind, form.parkingId)
            }}
            {{ form.kind === "entry" ? "人" : "辆" }}配额</view
          >
        </button></view
      ></view
    ><view class="panel reading-panel"
      ><view class="heading">预约信息</view
      ><label class="label" for="contact">联系人</label
      ><input
        id="contact"
        v-model="form.name"
        placeholder="请输入联系人姓名"
        maxlength="30" /><label class="label" for="phone">联系电话</label
      ><input
        id="phone"
        v-model="form.phone"
        type="number"
        placeholder="11 位手机号码"
        maxlength="11" /><picker mode="date" :value="form.date" :start="dates[0]" @change="form.date=$event.detail.value"><button class="secondary full">{{form.date}} · 选择其他日期</button></picker><template v-if="form.kind === 'entry'"
        ><label class="label" for="people">同行人数（含本人）</label
        ><input
          id="people"
          v-model.number="form.people"
          type="number"
          placeholder="1—10 人" /></template
      ><template v-else
        ><label class="label" for="plate">车牌号</label
        ><input
          id="plate"
          v-model="form.plate"
          placeholder="例如：浙A12345"
          maxlength="10" /></template></view
    ><view class="subtle"
      >免费预约，无支付环节。未入园或进场前可取消、改期；已入园不可取消。停车预约不保留实体车位。预约资料保存在账号中，多设备同步。</view
    ><view class="action-bar"
      ><button
        class="primary full"
        :loading="sending"
        :disabled="sending || slotsLoading || !form.slot"
        @tap="submit"
      >
        确认预约
      </button></view
    ></view
  ><BottomNav current="booking" />
</template>
<style scoped>
.slot {
  padding: 12px 5px;
  font-size: 13px;
}
.slot-count {
  font-size: 10px;
  margin-top: 4px;
}
.chip.selected .subtle {
  color: #fff;
}
</style>

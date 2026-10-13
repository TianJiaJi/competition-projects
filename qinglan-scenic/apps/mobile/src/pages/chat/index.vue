<script setup lang="ts">
import {ref,computed,onUnmounted} from 'vue';
import {onShow,onHide} from '@dcloudio/uni-app';
import {state} from '../../model/store';
import {request} from '../../services/qa';
import {requireLogin} from '../../services/platform';
import {subscribeScenicChanges} from '../../services/scenic-state';
import Icon from '../../components/Icon.vue';
const room=ref('lobby'),input=ref(''),error=ref(''),sending=ref(false),rows=ref<any[]>([]);
const rooms=ref<{id:string;name:string}[]>([]);
const messages=computed(()=>rows.value.map(m=>({...m,room:m.roomId,name:m.authorName,at:new Date(m.createdAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})})).reverse());
let stopLive:(()=>void)|undefined;
let timer:ReturnType<typeof setInterval>|undefined;
let refreshVersion=0;
async function refresh(){const current=++refreshVersion;try{await requireLogin();const available=await request<any>('/chat/rooms');if(current!==refreshVersion)return;rooms.value=available.items;if(!rooms.value.some(r=>r.id===room.value)){room.value=rooms.value[0]?.id||'';rows.value=[];}if(!room.value){rows.value=[];error.value='聊天室暂未开放';return;}const value=await request<any>('/chat/messages?roomId='+room.value+'&pageSize=50');if(current!==refreshVersion)return;rows.value=value.items;error.value='';}catch(e){if(current!==refreshVersion)return;error.value=(e as Error).message;}}
async function send(){if(sending.value||!input.value.trim())return;sending.value=true;try{await requireLogin();await request('/chat/messages','POST',{roomId:room.value,text:input.value});input.value='';await refresh();}catch(e){error.value=(e as Error).message;}finally{sending.value=false;}}
function report(m:any){const own=m.authorId===uni.getStorageSync('platform-user-id'),appeal=own&&m.removed;uni.showModal({title:appeal?'申诉撤回':'举报消息',editable:true,placeholderText:'请填写原因',success:async r=>{if(!r.confirm)return;try{await request(appeal?'/appeals':'/reports','POST',{messageId:m.id,reason:r.content});uni.showToast({title:'已提交',icon:'success'});}catch(e){error.value=(e as Error).message;}}});}
function stop(){clearInterval(timer);stopLive?.();stopLive=undefined;}
onShow(()=>{stop();void refresh();stopLive=subscribeScenicChanges(()=>{if(state.aiSession)void refresh();});timer=setInterval(()=>{if(state.aiSession)void refresh();},30000);});onHide(stop);onUnmounted(stop);
</script>
<template>
  <view class="page chat-page"
    ><view class="row between"
      ><view class="heading">游客聊天室</view
      ><text class="badge">全园共享</text></view
    ><picker v-if="rooms.length"
      :range="rooms"
      range-key="name"
      @change="room = rooms[Number($event.detail.value)].id; refresh()"
      ><button class="primary full">
        {{ rooms.find((r) => r.id === room)?.name }} · 切换房间
      </button></picker
    ><view class="message-area"
      ><view class="subtle time">与同一景区运行中的游客交流</view
      ><view
        v-for="m in messages"
        :key="m.id"
        class="message"
        :class="{ own: m.name === state.nickname }"
        ><view class="subtle"
          >{{ m.name }} ·
          {{ m.simulated ? "游客留言" : "消息" }} · {{ m.at }}</view
        ><view class="bubble">{{ m.text }}</view><button class="link" @tap="report(m)">{{m.removed?"申诉 / 举报":"举报"}}</button></view
      ><view v-if="!messages.length" class="empty"
        >这个房间还没有消息。</view
      ></view
    ><view v-if="error" class="error">{{error}}</view><view v-if="rooms.length" class="composer"
      ><view class="subtle">聊聊这一程的见闻</view
      ><view class="row input-row"
        ><button
          class="link"
          aria-label="插入微笑表情"
          @tap="input = input.slice(0, 298) + '🙂'"
        >
          <Icon name="smile" /></button
        ><input
          v-model="input"
          class="grow"
          placeholder="说点什么…"
          maxlength="300"
          confirm-type="send"
          @confirm="send"
        /><button class="primary" :disabled="sending" @tap="send">发送</button></view
      ></view
    ></view
  >
</template>
<style scoped>
.chat-page{height:calc(100dvh - 44px);min-height:0;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;padding-bottom:0}.chat-page>.row,.chat-page>picker{flex-shrink:0}

.message-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 0;
}
.time {
  text-align: center;
}
.message {
  margin-top: 24px;
  margin-right: 28px;
}
.message.own {
  margin-left: 28px;
  margin-right: 0;
  text-align: right;
}
.bubble {
  background: #f8fcfa;
  color: #193b35;
  border-radius: 4px 18px 18px 18px;
  padding: 12px 16px;
  margin-top: 6px;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.own .bubble {
  background: #d3e5dc;
  border-radius: 18px 4px 18px 18px;
}
.composer {
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
  background: #eaf3ef;
}
.input-row {
  gap: 6px;
  margin-top: 8px;
}
.input-row .primary {
  padding: 12px;
}
.input-row .link {
  padding: 8px 2px;
}
</style>

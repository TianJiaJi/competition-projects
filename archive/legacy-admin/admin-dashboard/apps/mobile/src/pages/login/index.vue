<script setup lang="ts">
import {ref} from 'vue';
import {signIn} from '../../services/platform';
const username=ref(''),name=ref(''),password=ref(''),register=ref(false),error=ref(''),busy=ref(false);
async function submit(){if(busy.value)return;busy.value=true;error.value='';try{await signIn(username.value,password.value,register.value?name.value:undefined);uni.switchTab({url:'/pages/me/index'});}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
</script>
<template><view class="page"><view class="title">{{register?'初见青岚':'欢迎回来'}}</view><view class="subtle">一个账号，记录你的山水旅程。</view><view class="panel"><view class="label">用户名</view><input v-model="username" placeholder="字母开头，3—32位"/><template v-if="register"><view class="label">姓名</view><input v-model="name" placeholder="请输入显示姓名" maxlength="30"/></template><view class="label">密码</view><input v-model="password" password placeholder="至少6位"/><view v-if="error" class="error">{{error}}</view><button class="primary full" :disabled="busy" @tap="submit">{{register?'注册并登录':'登录'}}</button><button class="link full" @tap="register=!register">{{register?'已有账号，去登录':'没有账号，注册游客账号'}}</button></view></view></template>

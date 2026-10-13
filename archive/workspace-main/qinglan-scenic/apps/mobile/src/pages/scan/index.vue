<script setup lang="ts">
import { ref,onMounted,onBeforeUnmount } from 'vue';
import data from '../../data';
import { go } from '../../model/store';
import { resolveScenicCode } from '../../../../../packages/client/src/scenic-code';
// #ifdef H5
import jsQR from 'jsqr';
// #endif
const error=ref(''),running=ref(false);
function opened(value:string){try{const id=resolveScenicCode(value,data.points.map(p=>p.id));stop();go('detail/index?id='+encodeURIComponent(id));}catch(e){error.value=(e as Error).message;}}
let cleanup=()=>{};
function stop(){cleanup();cleanup=()=>{};running.value=false;}
async function camera(){stop();error.value='';
// #ifdef MP-WEIXIN
uni.scanCode({onlyFromCamera:true,success:r=>opened(r.result),fail:()=>error.value='扫码未完成，请重试或选择二维码图片。'});
// #endif
// #ifdef H5
try {const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.style.cssText='width:100%;max-height:52vh;border-radius:20px';video.srcObject=stream;document.getElementById('scan-camera')?.appendChild(video);const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!;let frame=0;cleanup=()=>{cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());video.remove();};await video.play();running.value=true;const read=()=>{if(video.readyState>=2){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);const image=ctx.getImageData(0,0,canvas.width,canvas.height),code=jsQR(image.data,image.width,image.height);if(code){opened(code.data);if(!running.value)return;}}frame=requestAnimationFrame(read);};read();}catch{stop();error.value='相机不可用，请允许相机权限，或选择二维码图片。';}
// #endif
}
function selectImage(){stop();error.value='';
// #ifdef MP-WEIXIN
uni.scanCode({onlyFromCamera:false,success:r=>opened(r.result),fail:()=>error.value='未能识别二维码，请重试。'});
// #endif
// #ifdef H5
const input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;let bitmap:ImageBitmap|undefined;try{bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas'),scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),code=jsQR(pixels.data,pixels.width,pixels.height);if(!code)throw Error();opened(code.data);}catch{error.value='图片中没有可识别的景点二维码。';}finally{bitmap?.close();}};input.click();
// #endif
}
onMounted(()=>void camera());onBeforeUnmount(stop);
</script>
<template><view class="page"><view class="title">扫码识景</view><view class="subtle">将二维码放入画面，打开对应景点介绍</view><view id="scan-camera" class="panel"/><view v-if="error" class="error" role="alert">{{error}}</view><button class="primary full" @tap="camera">{{running?'重新扫码':'开启相机'}}</button><button class="secondary full" @tap="selectImage">选择二维码图片</button><button class="secondary full" @tap="go('content/index?mode=search')">搜索景点</button></view></template>

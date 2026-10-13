<script setup lang="ts">
import { computed } from 'vue';
import { LiquidGlassButton } from '@scenic/ui/liquid-glass';
import { Route, ArrowUpRight, CableCar, ChevronRight, ChevronDown, Clock3, Info } from 'lucide-vue-next';
import { availabilityLabels, loadLabels, safetyStatus } from '@scenic/scenic';
import type { ScenicPoint, PublicSnapshot } from '@scenic/contracts';
const props=defineProps<{point:ScenicPoint;snapshot:PublicSnapshot;imageUrl?:string}>();
const emit=defineEmits<{route:[id:string];return:[]}>();
const pointState=computed(()=>props.snapshot.points[props.point.id]);
const regionState=computed(()=>props.snapshot.regions[props.point.regionId]);
const canRoute=computed(()=>pointState.value?.availability==='open'&&regionState.value?.availability==='open');
const cable=computed(()=>pointState.value?.cable);
const cableOpen=computed(()=>pointState.value?.availability==='open');
const restroom=computed(()=>pointState.value?.restroom);
const restroomUnavailable=computed(()=>['closed','maintenance'].includes(pointState.value?.availability??''));
const restroomKnown=computed(()=>pointState.value?.availability==='open'||restroomUnavailable.value);
const availableStalls=computed(()=>restroomUnavailable.value?0:restroomKnown.value?restroom.value?.availableStalls:null);
const outOfServiceStalls=computed(()=>{
  const r=restroom.value;
  if(restroomUnavailable.value)return r?.totalStalls??null;
  return restroomKnown.value&&r?.totalStalls!=null&&r.occupiedStalls!=null&&r.availableStalls!=null?r.totalStalls-r.occupiedStalls-r.availableStalls:null;
});
const restroomGenders=computed(()=>(['male','female','maleUrinals','accessible'] as const).map(key=>{
  const counts=restroom.value?.[key];
  return {key,label:({male:'男厕坐蹲位',female:'女厕坐蹲位',maleUrinals:'男厕小便位',accessible:'无障碍独立间'})[key],rows:[
    {key:'total',label:'总数',value:counts?.totalStalls,unit:'个'},
    {key:'occupied',label:'使用中',value:restroomKnown.value?counts?.occupiedStalls:null,unit:'个'},
    {key:'available',label:'可用坑位',value:restroomUnavailable.value?0:restroomKnown.value?counts?.availableStalls:null,unit:'个'},
    {key:'queue',label:'排队人数',value:restroomKnown.value?counts?.queueCount:null,unit:'人'},
  ]};
}));
const genderAvailabilityKnown=computed(()=>restroomGenders.value.some(group=>group.rows.find(row=>row.key==='available')?.value!=null));
const formatRestroom=(value:number|null|undefined)=>value==null?'暂无数据':value.toLocaleString('zh-CN');
const formatNumber=(value:number|null|undefined)=>value==null?'—':value.toLocaleString('zh-CN');
</script>
<template><div class="scenic-point-info">
            <div class="status-line">
              <span :class="['availability', pointState?.availability]">{{
                point.kind==='safety'?safetyStatus(pointState?.availability):availabilityLabels[pointState?.availability ?? "unknown"]
              }}</span
              ><span
                v-if="pointState?.availability === 'open' && !['safety','terminal'].includes(point.kind)"
                :class="[
                  'state',
                  point.kind === 'attraction'
                    ? regionState?.load
                    : pointState.load,
                ]"
                >{{ point.kind === "attraction" ? "所在区域客流：" : ""
                }}{{
                  loadLabels[
                    (point.kind === "attraction"
                      ? regionState?.load
                      : pointState.load) ?? "unknown"
                  ]
                }}</span
              >
            </div>
            <p v-if="pointState?.reason" class="reason">
              <Info :size="20" />{{ pointState.reason }}
            </p>
            <p class="hours"><Clock3 :size="18" />{{ point.hours }}</p>
            <section v-if="point.kind==='toilet'" class="restroom-detail" aria-label="卫生间坑位与排队情况">
              <div class="restroom-genders">
                <section v-for="group in restroomGenders" :key="group.key" class="restroom-gender" :aria-label="group.label+'与排队情况'" :data-restroom-gender="group.key">
                  <h3>{{group.label}}</h3>
                  <dl>
                    <div v-for="row in group.rows" :key="row.key" :class="{'available-stalls':row.key==='available'}">
                      <dt>{{row.label}}</dt><dd :data-testid="group.key+'-'+row.key">{{formatRestroom(row.value)}}<small v-if="row.value!=null">{{row.unit}}</small></dd>
                    </div>
                  </dl>
                </section>
              </div>
              <details class="restroom-summary"><summary>全部服务位合计<ChevronDown :size="16"/></summary>
              <dl class="restroom-metrics">
                <div><dt>服务位总数</dt><dd data-testid="stalls-total">{{formatRestroom(restroom?.totalStalls)}}<small v-if="restroom?.totalStalls!=null">个</small></dd></div>
                <div><dt>使用中</dt><dd data-testid="stalls-occupied">{{formatRestroom(restroomKnown?restroom?.occupiedStalls:null)}}<small v-if="restroomKnown&&restroom?.occupiedStalls!=null">个</small></dd></div>
                <div class="available-stalls"><dt>可用坑位</dt><dd data-testid="stalls-available">{{formatRestroom(availableStalls)}}<small v-if="availableStalls!=null">个</small></dd></div>
                <div><dt>排队人数</dt><dd data-testid="restroom-queue">{{formatRestroom(restroomKnown?restroom?.queueCount:null)}}<small v-if="restroomKnown&&restroom?.queueCount!=null">人</small></dd></div>
              </dl>
              </details>
              <p class="restroom-hint" role="status">{{restroomUnavailable?'当前卫生间未开放或维修中，暂无可用坑位。':!restroomKnown||availableStalls==null&&!genderAvailabilityKnown?'坑位数据暂不可用，请以现场情况为准。':availableStalls==null?'可用坑位为当前空闲数量，请以现场情况为准。':availableStalls===0?'当前无空闲坑位，可查看附近其他卫生间。':`当前有 ${availableStalls} 个空闲可用坑位。`}}<span v-if="outOfServiceStalls"> 其中 {{outOfServiceStalls}} 个坑位暂停使用。</span></p>
            </section>
            <section v-if="point.kind==='cable'" class="cable-detail" aria-label="索道容量与排队情况">
              <p class="cable-direction">{{cable?.direction==='up'?'上行至山顶':cable?.direction==='down'?'下行至山脚':'索道方向待更新'}}</p>
              <dl class="restroom-metrics">
                <div><dt>当前排队</dt><dd data-testid="cable-queue">{{formatRestroom(cableOpen?cable?.queueCount:null)}}<small v-if="cableOpen&&cable?.queueCount!=null">人</small></dd></div>
                <div><dt>预计等待</dt><dd data-testid="cable-wait">{{formatRestroom(cableOpen?cable?.waitMinutes:null)}}<small v-if="cableOpen&&cable?.waitMinutes!=null">分钟</small></dd></div>
                <div><dt>全线总容量</dt><dd data-testid="cable-capacity">{{formatRestroom(cable?.totalCapacity)}}<small v-if="cable?.totalCapacity!=null">人</small></dd></div>
                <div><dt>本方向在途</dt><dd data-testid="cable-in-transit">{{formatRestroom(cable?.inTransit)}}<small v-if="cable?.inTransit!=null">人</small></dd></div>
              </dl>
              <p v-if="cable" class="restroom-hint">全线 {{cable.cabinCount}} 厢，每厢 {{cable.cabinSeats}} 人；单程 {{cable.travelMinutes}} 分钟，每 {{cable.dispatchSeconds}} 秒发车，本方向运力 {{cable.capacityPerMinute}} 人/分钟。</p>
              <p class="restroom-hint">{{!cableOpen?'当前暂停登乘，请以现场运营安排为准。':'等待时间按当前队列和班次估算，请以现场情况为准。'}}</p>
            </section>
            <div v-if="point.kind === 'parking'" class="parking-detail">
              <span>实际可用车位</span
              ><strong class="num"
                >{{ formatNumber(pointState?.parkingFree)
                }}<small
                  >/ {{ formatNumber(pointState?.parkingCapacity) }}</small
                ></strong
              >
            </div>
            <div v-if="point.services" class="services">
              <span v-for="service in point.services" :key="service">{{
                service
              }}</span>
            </div>
            <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
              class="primary-button"
              :disabled="!canRoute"
              @click="emit('route', point.id)"
            >
              <Route :size="22" />{{point.kind==='safety'?'到这里':'查看路线'}}<ArrowUpRight :size="21" />
            </LiquidGlassButton>
            <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
              v-if="point.id === 'summit' || point.id === 'terminal-summit'"
              class="secondary-button"
              :disabled="!canRoute"
              @click="emit('return')"
            >
              <CableCar :size="22" />返回出口商业区<ChevronRight :size="21" />
            </LiquidGlassButton>
            <slot name="handoff"/>
            <details class="description">
              <summary>
                {{ point.kind === "attraction" ? "景点介绍" : "地点介绍"
                }}<ChevronDown :size="20" />
              </summary>
              <img
                v-if="point.kind === 'attraction' && imageUrl"
                :src="imageUrl"
                alt="青岚山境山水意境图"
              />
              <p>{{ point.description }}</p>
              <small v-if="point.kind === 'attraction' && imageUrl">景区意境图</small>
            </details>
</div></template>
<style scoped>
.status-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  font-size: 17px;
}
.availability {
  padding: 7px 11px;
  background: #e2eee6;
  border-radius: 8px;
  font-size: 16px;
  color: var(--brand);
}
.availability.closed,
.availability.maintenance,
.availability.unknown {
  background: #e5e9e6;
  color: #52635b;
}
.hours {
  font-size: 16px;
  color: var(--muted);
  display: flex;
  gap: 8px;
  align-items: center;
  line-height: 1.8;
  margin: 14px 0 25px;
}
.reason {
  display: flex;
  gap: 9px;
  line-height: 1.7;
  padding: 15px;
  background: #edf0e9;
  border-radius: 13px;
  font-size: 17px;
}
.reason svg {
  flex-shrink: 0;
  margin-top: 4px;
}
.primary-button,
.secondary-button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 60px;
  
  padding: 14px 15px;
  font-size: 18px;
  font-weight: 500;
}
.primary-button {
  
  
  
}
.primary-button svg:last-child {
  margin-left: auto;
}
.secondary-button {
  
  
  margin-top: 12px;
}
.primary-button:hover {
  
}
.secondary-button:hover {
  
}
.qr-section {
  margin: 26px 0 20px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 13px;
}
.qr-section > div {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 16px;
}
.qr-section img,
.phone-qr img {
  background: white;
  max-width: 100%;
  object-fit: contain;
}
.qr-section a,
.phone-qr a {
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 56px;
}
.description {
  border-top: 1px solid var(--line);
  margin-top: 12px;
}
.description summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  min-height: 60px;
  font-size: 18px;
  list-style: none;
}
.description summary::-webkit-details-marker {
  display: none;
}
.description img {
  width: 100%;
  border-radius: 13px;
  aspect-ratio: 16/9;
  object-fit: cover;
}
.description p {
  font-size: 17px;
  color: var(--muted);
  line-height: 1.9;
}
.description small {
  font-size: 12px;
  color: var(--muted);
}
.parking-detail {
  margin: 20px 0;
}
.parking-detail > span {
  font-size: 16px;
  color: var(--muted);
}
.parking-detail strong {
  display: block;
  font-size: 44px;
  font-weight: 500;
  margin: 8px 0;
}
.parking-detail small {
  font-size: 18px;
  color: var(--muted);
}
.services {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 25px;
}
.services span {
  font-size: 16px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #e4eee6;
}

.scenic-point-info{--brand:#175f54;--muted:#536b63;--line:#d4e2db;--quiet:#226b4d;--moderate:#8a580e;--busy:#b33f36;--unknown:#616d6a;color:#193b35;}
button{font:inherit;cursor:pointer;box-sizing:border-box;}button:disabled{opacity:.55;cursor:not-allowed;}button:focus-visible,summary:focus-visible{outline:3px solid #175f54;outline-offset:3px;}
.quiet{--state:var(--quiet);}.moderate{--state:var(--moderate);}.busy{--state:var(--busy);}.unknown,.closed,.maintenance{--state:var(--unknown);}
.state{display:inline-flex;align-items:center;gap:8px;color:var(--state);}.state:before{content:'';width:8px;height:8px;border-radius:50%;background:var(--state);}
</style>

<style scoped>
.restroom-detail{margin:16px 0 20px;}.restroom-metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0;}.restroom-metrics>div{padding:12px;border:1px solid #ffffff80;border-radius:12px;background:#f8fcfa66;}.restroom-metrics dt{font-size:13px;color:#536b63;}.restroom-metrics dd{margin:6px 0 0;font-size:23px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.2;}.restroom-metrics small{font-size:12px;font-weight:400;margin-left:5px;}.available-stalls dd{color:#175f54;}.restroom-hint{font-size:13px;color:#536b63;line-height:1.7;margin:12px 0 0;}
</style>

<style scoped>
.restroom-genders{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.restroom-gender{min-width:0;padding:12px 10px;border:1px solid #ffffff80;border-radius:12px;background:#f8fcfa66;}
.restroom-gender h3{font-size:15px;font-weight:600;margin:0 0 10px;color:#193b35;}
.restroom-gender dl{margin:0;display:grid;gap:10px;}
.restroom-gender dl>div{display:flex;justify-content:space-between;align-items:baseline;gap:4px;}
.restroom-gender dt{font-size:12px;color:#536b63;}
.restroom-gender dd{font-size:14px;font-weight:600;line-height:1.25;margin:0;font-variant-numeric:tabular-nums;}
.restroom-gender small{font-size:12px;font-weight:400;margin-left:4px;}
.restroom-summary{margin-top:12px;}
.restroom-summary summary{display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:8px 0;font-size:13px;color:#536b63;list-style:none;}
.restroom-summary summary::-webkit-details-marker{display:none;}
.restroom-summary[open] summary svg{transform:rotate(180deg);}
</style>

<style scoped>
.cable-detail{margin:16px 0 20px;}.cable-direction{font-size:15px;font-weight:600;margin:0 0 12px;}
</style>

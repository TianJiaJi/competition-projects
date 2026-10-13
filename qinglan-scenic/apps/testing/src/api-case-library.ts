import type { ApiMaterial } from './campus-handoff';
type Variant = [name:string, request:Record<string,unknown>, status?:number];
// Scenario expectations are local test models, not claims about deployed API behavior.
const variants:Record<string,Variant[]>={
 health:[['空请求健康探测',{}],['重复探测结果一致',{}],['服务存活字段契约',{}],['成功响应封装契约',{}],['无业务写入探测',{}],['连续读取可用性',{}],['健康响应耗时预算',{}],['健康结果布尔类型',{}]],
 availability:[['空教室参数',{facilityId:''},400],['不存在的教室',{facilityId:'F-NOT-FOUND'},404],['缺少查询日期',{date:''},400],['非法日期格式',{date:'not-a-date'},400],['学期内可用时段',{date:'交付后第三天'}],['无效日期值',{date:'2026-02-30'},400],['不同教室查询',{facilityId:'F8'}],['时段占用字段契约',{}]],
 'bookings-list':[['本人记录隔离',{owner:'林悦'}],['另一学生记录',{owner:'周子涵'}],['空申请人参数',{owner:''},400],['未知申请人',{owner:'不存在的学生'},403],['中文申请人编码',{owner:'林悦'}],['预约编号字段契约',{}],['预约状态字段契约',{}],['班级字段契约',{}]],
 'booking-create':[['缺少活动名称',{activity:''},400],['缺少使用用途',{purpose:''},400],['人数为零',{count:0},400],['人数为负',{count:-1},400],['人数非整数',{count:1.5},400],['电话格式错误',{phone:'123'},400],['无效教室',{facilityId:'F-NOT-FOUND'},404],['非法预约时段',{time:'25:00–26:00'},400]],
 'booking-approve':[['非本班教师',{reviewer:'其他班教师'},403],['缺少审核人',{reviewer:''},400],['未知审核动作',{action:'unknown'},400],['重复审核已结案申请',{action:'approve'},409],['审批人信息保留',{}],['审批后状态一致',{}],['审批不改变申请人',{}],['审批不改变教室',{}]],
 'booking-reject':[['缺少拒绝原因',{reason:''},400],['仅空白拒绝原因',{reason:'   '},400],['非本班拒绝操作',{reviewer:'其他班教师'},403],['缺少拒绝审核人',{reviewer:''},400],['超长拒绝原因',{reason:'原因'.repeat(600)},400],['中文原因保留',{reason:'该时段已有教学安排'}],['拒绝状态契约',{}],['重复拒绝结案申请',{},409]],
 'booking-cancel':[['非本人取消',{owner:'周子涵'},403],['空申请人取消',{owner:''},400],['未知申请人取消',{owner:'不存在的学生'},403],['重复取消申请',{},409],['取消后保留记录',{}],['取消状态契约',{}],['取消不改变预约时段',{}],['取消不改变教室信息',{}]],
 'leaves-list':[['本人请假记录',{owner:'林悦'}],['另一学生请假记录',{owner:'周子涵'}],['缺少学生参数',{owner:''},400],['未知学生记录',{owner:'不存在的学生'},403],['秒级开始时间契约',{}],['秒级结束时间契约',{}],['请假类型字段契约',{}],['请假状态字段契约',{}]],
 'leave-create':[['缺少请假原因',{reason:''},400],['无效请假类型',{type:'未知'},400],['非法开始时分秒',{startTime:'25:00:00'},400],['缺少秒级结束时间',{endTime:''},400],['结束早于开始',{startTime:'10:00:00',endTime:'08:00:00'},400],['紧急联系人缺失',{emergencyName:''},400],['联系电话格式错误',{emergencyPhone:'123'},400],['未确认申请承诺',{confirmed:false},400]],
 'leave-review':[['跨班级审批',{reviewer:'其他班教师'},403],['空审核教师',{reviewer:''},400],['未知请假审批动作',{action:'unknown'},400],['重复审批已结案请假',{},409],['审批结果状态契约',{}],['审批保留开始秒数',{}],['审批保留结束秒数',{}],['审批教师字段契约',{}]],
 'leave-cancel':[['非本人取消请假',{owner:'周子涵'},403],['缺少请假申请人',{owner:''},400],['未知学生取消请假',{owner:'不存在的学生'},403],['重复取消请假',{},409],['取消后保留原始类型',{}],['取消后保留秒级时间',{}],['取消状态字段契约',{}],['取消后申请人不变',{}]],
 'teacher-list':[['本班教师待办',{teacher:'陈越'}],['另一教师待办',{teacher:'另一班教师'}],['缺少教师身份',{teacher:''},400],['未知教师身份',{teacher:'不存在的教师'},403],['班级范围字段契约',{}],['学生姓名字段契约',{}],['待办状态字段契约',{}],['待办精确时间契约',{}]],
};
export function expandApiCases(materials:ApiMaterial[]):ApiMaterial[]{
 const expanded=materials.flatMap(base=>(variants[base.id] || []).map(([name,patch,status],index)=>{
  const expected=status || base.status;
  const response=expected>=400 ? {error:`${name}：模型预期拒绝`} : structuredClone(base.response);
  // Successful list variants must reflect their scenario's owner/class rather than another student's data.
  if(expected<400 && response && typeof response==='object' && 'data' in response && Array.isArray(response.data)){
   for(const row of response.data){if(patch.owner && row && typeof row==='object' && 'owner' in row)row.owner=patch.owner;if(patch.teacher==='另一班教师' && row && typeof row==='object' && 'classId' in row)row.classId='CLS-2402';}
  }
  return {...base,id:`${base.id}-case-${index+1}`,name:`${base.name} · ${name}`,request:{...base.request,...patch},status:expected,response,
   purpose:`扩展测试场景：${name}。基于交付契约的本地模型，非真实后端验证。`,checkpoint:expected>=400?`预期HTTP ${expected}且包含拒绝原因`:`${name}：响应符合交付字段与状态`,sourceMaterialId:base.id};
 }));
 const create=materials.find(m=>m.id==='leave-create')!;
 const extra:ApiMaterial[]=[['离校缺少目的地',{leavingCampus:true,destination:''}],['离校缺少详细地址',{leavingCampus:true,destination:'校外',address:''}]].map(([name,patch],index)=>({...create,id:`leave-create-extra-${index+1}`,name:`${create.name} · ${name}`,request:{...create.request,...patch as Record<string,unknown>},status:400,response:{error:`${name}：模型预期拒绝`},purpose:`本地离校参数边界模型：${name}，不向业务服务发请求。`,checkpoint:'HTTP 400及拒绝原因',sourceMaterialId:create.id}));
 return [...materials,...expanded,...extra];
}

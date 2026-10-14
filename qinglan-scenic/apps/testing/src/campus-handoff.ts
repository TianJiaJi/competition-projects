import type { Endpoint, SystemConfig } from './types';
import { expandApiCases } from './api-case-library';
import { platformApiMaterials } from './platform-api-materials';
export const HANDOFF_ID = 'CAMPUS-DELIVERY-2026-001';
export const TASK_ID = 'QA-CAMPUS-001';
export const MESSAGE_ID = 'MSG-CAMPUS-001';
export const campusProject = {
  id: 'zhixing-campus', name: '智慧校园', brand: '知行校园', version: '1.0.0',
  solution: '智慧校园一体化解决方案', frontend: '周宁 · 前端工程师', backend: '陈工 · 后端工程师',
  summary: '验收智慧校园五端整个平台，覆盖校园空间、人员权限、教学预约与请假、设施运维、后勤工单、安全巡检、消息公告及运行概览。',
  pages: [
    { id: 'mobile', name: '学生服务端', port: 5502, path: '/#/pages/home/index', device: 'phone', checks: ['导航与服务入口清晰', '预约表单及教室时段正确', '请假日历与时分秒滚轮可操作', '服务记录显示审核反馈'] },
    { id: 'staff', name: '教师工作台', port: 5503, path: '/', device: 'desktop', checks: ['登录后刷新保持身份', '教学分类与班级范围正确', '预约及请假审批可操作', '拒绝原因与学生记录一致'] },
    { id: 'admin', name: '管理后台', port: 5504, path: '/', device: 'desktop', checks: ['列表与详情布局完整', '预约管理保持只读', '筛选与分页可操作'] },
    { id: 'public', name: '公共大屏', port: 5500, path: '/', device: 'desktop', checks: ['校园概览布局完整', '模块切换与图表可读', '画面没有遮挡或裁切'] },
    { id: 'ops', name: '运行大屏', port: 5501, path: '/', device: 'desktop', checks: ['运行指标与图表可读', '设施与工单入口正确', '不同分辨率布局完整'] },
  ],
} as const;
export function projectUrl(page: typeof campusProject.pages[number], hostname = 'localhost') { return `http://${hostname}:${page.port}${page.path}`; }
export interface ApiMaterial { source?: 'platform-contract'; sourceContractId?: string; sourceMaterialId?: string; id: string; name: string; method: 'GET' | 'POST' | 'PATCH'; path: string; group: string; role: string; purpose: string; request: Record<string, unknown>; status: number; response: unknown; checkpoint: string }
const booking = { id: 'BR-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', owner: '林悦', classId: 'CLS-2401', status: 'pending', venue: '明理楼 305 教室', activity: '课程研讨', date: '交付后第二天', time: '18:00–19:00' };
const leave = { id: 'LV-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', owner: '林悦', classId: 'CLS-2401', type: '事假', startTime: '08:10:15', endTime: '10:30:20', status: 'pending' };
export const apiMaterials: ApiMaterial[] = [
  { id: 'health', name: '预约请假服务健康检查', method: 'GET', path: '/health', group: '服务基础', role: '测试工程师', purpose: '确认交付服务健康材料', request: {}, status: 200, response: { data: { ok: true } }, checkpoint: '服务返回 data.ok=true' },
  { id: 'availability', name: '教室可用时段查询', method: 'GET', path: '/api/bookings/availability', group: '教室预约', role: '学生', purpose: '查看指定教室与日期的可预约时段', request: { facilityId: 'F7', date: '交付后第二天' }, status: 200, response: { data: [{ time: '18:00–19:00', available: true, pending: 0 }] }, checkpoint: '时段包含 available 和 pending' },
  { id: 'bookings-list', name: '学生预约记录', method: 'GET', path: '/api/bookings', group: '教室预约', role: '学生', purpose: '按申请人查看预约记录', request: { owner: '林悦' }, status: 200, response: { data: [booking] }, checkpoint: '记录携带申请人、班级与状态' },
  { id: 'booking-create', name: '提交教室预约', method: 'POST', path: '/api/bookings', group: '教室预约', role: '学生', purpose: '完整提交预约申请，进入教师审核队列', request: { facilityId: 'F7', owner: '林悦', date: '交付后第二天', time: '18:00–19:00', activity: '课程研讨', purpose: '小组课程研讨', count: 8, phone: '13800000000', note: '' }, status: 201, response: { data: booking }, checkpoint: '创建后状态为 pending' },
  { id: 'booking-approve', name: '教师通过预约', method: 'PATCH', path: `/api/bookings/${booking.id}`, group: '教师审批', role: '陈越 / 本班教师', purpose: '教师最终审批本班预约', request: { action: 'approve', reviewer: '陈越' }, status: 200, response: { data: { ...booking, status: 'approved', reviewer: '陈越' } }, checkpoint: '审批后状态 approved，审核教师已记录' },
  { id: 'booking-reject', name: '教师拒绝预约', method: 'PATCH', path: `/api/bookings/${booking.id}`, group: '教师审批', role: '陈越 / 本班教师', purpose: '拒绝时记录审核原因', request: { action: 'reject', reviewer: '陈越', reason: '该时段已有教学安排' }, status: 200, response: { data: { ...booking, status: 'rejected', reviewReason: '该时段已有教学安排' } }, checkpoint: '拒绝原因可供学生查看' },
  { id: 'booking-cancel', name: '学生取消预约', method: 'PATCH', path: `/api/bookings/${booking.id}`, group: '教室预约', role: '申请人', purpose: '取消本人有效申请', request: { action: 'cancel', owner: '林悦' }, status: 200, response: { data: { ...booking, status: 'cancelled' } }, checkpoint: '本人取消后状态 cancelled' },
  { id: 'leaves-list', name: '学生请假记录', method: 'GET', path: '/api/leaves', group: '学生请假', role: '学生', purpose: '按学生查看请假记录', request: { owner: '林悦' }, status: 200, response: { data: [leave] }, checkpoint: '记录携带 HH:mm:ss 精确时间' },
  { id: 'leave-create', name: '提交秒级请假申请', method: 'POST', path: '/api/leaves', group: '学生请假', role: '学生', purpose: '提交请假类型、去向、联系信息和精确时间', request: { owner: '林悦', type: '事假', startDate: '交付后第二天', endDate: '交付后第二天', startTime: '08:10:15', endTime: '10:30:20', leavingCampus: false, leavingCity: false, destination: '', address: '', emergencyName: '联系人', emergencyPhone: '13900000000', nature: '日常请假', reason: '到校医院复诊检查', phone: '13800000000', cc: [], confirmed: true }, status: 201, response: { data: leave }, checkpoint: '完整请假信息与秒级时间保存' },
  { id: 'leave-review', name: '教师审批请假', method: 'PATCH', path: `/api/leaves/${leave.id}`, group: '教师审批', role: '陈越 / 本班教师', purpose: '审核班级内学生请假', request: { action: 'approve', reviewer: '陈越' }, status: 200, response: { data: { ...leave, status: 'approved', reviewer: '陈越' } }, checkpoint: '班级范围与最终审批状态正确' },
  { id: 'leave-cancel', name: '学生取消请假', method: 'PATCH', path: `/api/leaves/${leave.id}`, group: '学生请假', role: '申请人', purpose: '取消本人待审或已通过的请假', request: { action: 'cancel', owner: '林悦' }, status: 200, response: { data: { ...leave, status: 'cancelled' } }, checkpoint: '取消后保留原记录及状态' },
  { id: 'teacher-list', name: '教师班级待办', method: 'GET', path: '/api/leaves', group: '教师审批', role: '陈越 / 本班教师', purpose: '教师按班级读取请假队列', request: { teacher: '陈越' }, status: 200, response: { data: [leave] }, checkpoint: '队列中的班级为 CLS-2401' },
  ...platformApiMaterials,
];
export const apiBusinessGroups=[...new Set(apiMaterials.map(item=>item.group))];
export const apiTestMaterials=expandApiCases(apiMaterials);
export const API_CASE_COUNT=apiTestMaterials.length;
function shapeMatches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && actual.every((item, i) => shapeMatches(item, expected[i]));
  if (expected && typeof expected === 'object') return !!actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => shapeMatches((actual as Record<string, unknown>)[key], value));
  return actual === expected;
}
export const deliveryEndpoints: Endpoint[] = apiTestMaterials.map(material => ({ id: `delivery-${material.id}`, contractId: `delivery-${material.id}`, name: material.name, method: material.method, path: material.path, status: material.status, fixtureStatus: material.status, fixtureBudget: 500, budget: 500, baseline: 42, group: material.group, fixture: material.response, contract: material.checkpoint, validate: value => shapeMatches(value, material.response) }));
export function deliverySystem(): SystemConfig { return { id: 'campus-delivery', name: campusProject.name, baseUrl: 'http://localhost:5606', endpoints: deliveryEndpoints.map(({ id, contractId, name, method, path, status, budget }) => ({ id, contractId, name, method, path, status, budget })), registration: { source: 'catalog', manifestId: HANDOFF_ID, templateName: campusProject.solution, publisher: campusProject.frontend, version: campusProject.version, dataSource: 'local-manifest' } }; }
export const assignments = [
  { id: 'duplicate', title: '重复提交去重', risk: '学生多次点击提交导致重复预约申请', standard: '同一业务键只创建一条申请，各回执引用同一申请编号。', endpointId: 'delivery-booking-create' },
  { id: 'stock', title: '教室时段并发预约', risk: '多人争用同一教室时段导致重复占用', standard: '仅一条预约取得时段，余量为0且不为负。', endpointId: 'delivery-booking-create' },
  { id: 'permission', title: '跨账户与班级权限', risk: '其他账户或班级操作学生申请', standard: '非所属账户/班级操作被拦截，敏感字段和申请状态不变。', endpointId: 'delivery-leave-review' },
  { id: 'retry', title: '弱网重试去重', risk: '回执暂缓后重试造成重复写入', standard: '重试返回既有申请编号，业务写入仍为1次。', endpointId: 'delivery-booking-create' },
] as const;

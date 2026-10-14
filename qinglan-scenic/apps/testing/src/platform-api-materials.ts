import { campusEndpoints } from './service-catalog';
import type { ApiMaterial } from './campus-handoff';

// Reuse the existing whole-platform contract catalog, not booking/leave test variants.
// These are local handoff contracts; this module does not register backend routes.
const selected = [
  ['version', '服务基础', '测试工程师', '核对平台版本和发布修订号，关联本轮验收版本'],
  ['overview', '运行概览', '运行值守岗位', '核对校园楼宇、设施及待处理任务的概览字段'],
  ['buildings', '校园空间', '师生 / 管理员', '查询校园楼宇目录与楼层信息'],
  ['building', '校园空间', '师生 / 管理员', '核对楼宇详情与目录标识的关联'],
  ['facilities', '设施运维', '后勤人员 / 管理员', '按楼宇读取设施目录及运行状态'],
  ['facility', '设施运维', '后勤人员 / 管理员', '核对设施编号、所属楼宇、分类及状态'],
  ['tasks', '后勤工单', '后勤人员', '按楼宇读取后勤工单及设施关联'],
  ['task', '后勤工单', '后勤人员', '读取工单详情及版本，核对处置前的业务状态'],
  ['task-history', '后勤工单', '后勤人员 / 管理员', '核对工单动作、操作岗位与流转留痕'],
  ['rooms', '教学服务', '师生 / 教务人员', '查询教学空间及容量，为课表与预约提供基础目录'],
  ['timetable', '教学服务', '师生 / 教务人员', '核对教室、课程与教学时段的关联'],
  ['identity', '人员权限', '已登录岗位', '核对当前岗位的账户标识及角色'],
  ['roles', '人员权限', '管理员', '读取角色目录与权限数量'],
  ['account-directory', '人员权限', '管理员', '读取校园账户目录、岗位及启用状态'],
  ['announcements', '消息公告', '师生', '核对校园公告标题、发布状态及列表结构'],
  ['notifications-summary', '消息公告', '已登录岗位', '核对岗位通知总数、未读数与账户归属'],
  ['inspection-tasks', '安全巡检', '巡检人员', '读取巡检任务、计划、执行岗位及任务状态'],
  ['inspection-records', '安全巡检', '巡检人员 / 管理员', '核对巡检点位、执行岗位及检查结果留痕'],
] as const;

export const platformApiMaterials: ApiMaterial[] = selected.map(([id, group, role, purpose]) => {
  const contract = campusEndpoints.find(item => item.id === `campus-${id}`);
  if (!contract) throw new Error(`平台交付清单缺少契约：${id}`);
  const query = contract.path.split('?')[1];
  return {
    id: `platform-${id}`, name: contract.name, method: 'GET',
    path: `/campus-api/v1${contract.path}`, group, role, purpose,
    request: Object.fromEntries(new URLSearchParams(query)), status: contract.status,
    response: structuredClone(contract.fixture), checkpoint: contract.contract,
    source: 'platform-contract', sourceContractId: contract.id,
  };
});

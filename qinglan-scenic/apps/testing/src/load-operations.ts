import { apiMaterials } from './campus-handoff';
import type { EndpointConfig } from './types';

const operationNames: Record<string, string> = {
  availability: '查询教室可用时段',
  'bookings-list': '查询本人预约记录',
  'booking-create': '提交教室预约',
  'booking-approve': '审批通过教室预约',
  'booking-reject': '拒绝教室预约',
  'booking-cancel': '取消本人预约',
  'leaves-list': '查询本人请假记录',
  'leave-create': '提交请假申请',
  'leave-review': '审批请假申请',
  'leave-cancel': '取消本人请假',
  'teacher-list': '查询班级请假待办',
};
/** Only base business operations, not health probes or generated boundary/denial cases. */
export function loadOperations(endpoints: EndpointConfig[]): EndpointConfig[] {
  return apiMaterials.filter(material => material.id !== 'health' && material.status >= 200 && material.status < 300)
    .flatMap(material => {
      const endpoint = endpoints.find(item => item.id === `delivery-${material.id}`);
      return endpoint ? [{ ...endpoint, name: operationNames[material.id] || material.name }] : [];
    });
}
export function loadOperationName(endpoints: EndpointConfig[], id?: string): string {
  return loadOperations(endpoints).find(item => item.id === id)?.name
    || endpoints.find(item => item.id === id)?.name || '未记录业务操作';
}

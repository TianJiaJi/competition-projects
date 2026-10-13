import { asyncmap, asyncflatMap, asyncforEach, asyncfilter } from '../async-arrays.ts';
import type { Store } from './store.ts';
import { scenic } from './simulation.ts';
export async function seedContent(store: Store) {
    const putMissing=async(c:string,id:string,value:unknown)=>{if(!await store.get(c,id))await store.put(c,id,value);};
    if ((await store.get('settings', 'content-seeded')))
        return;
    (await store.transaction(async () => {
        const titles = ['初到青岚山境', '免费预约须知', '停车与步行接驳', '入园与返程时间', '雨天游览提醒', '山间慢行指南', '家庭游览建议', '无障碍设施指引', '索道乘坐须知', '卫生间查询指南', '失物与求助指引', '文明游览约定', '听溪台的水声', '竹影幽径漫步', '叠翠峡观景提示', '望岳台登高指南', '飞瀑亭观景指南', '镜湖栈道慢行', '松风林休息指南', '短线游览选择', '午间错峰建议', '闭园返程提醒', '地图忙闲怎么看', '聊天室交流约定'];
        await asyncforEach(titles, async (title, i) => { const point = scenic.points.filter(p => p.kind === 'attraction')[Math.max(0, i - 12) % 7]; const body = i < 12 ? `${title}。青岚山境采用免费分时预约，08:00开放，17:00停止入园，18:00开始闭园。请以当日公告与地图开放状态安排行程；停车预约不保留实体车位。遇到问题可联系现场工作人员。` : `${title}。${point.description} 请沿开放步道游览，不进入维护路段。客流和设施忙闲可在导览中查看，返程请预留时间。`; (await putMissing('articles', 'article-' + String(i + 1).padStart(2, '0'), { id: 'article-' + String(i + 1).padStart(2, '0'), title, body, category: i % 2 ? 'guide' : 'news', published: true, version: 1, updatedAt: new Date().toISOString() })); });
        for (const p of scenic.points) {
            (await putMissing('knowledge', p.id, { id: p.id, title: p.name, body: p.description, poiId: p.id, published: true, version: 1 }));
        }
        (await putMissing('knowledge', 'operations', { id: 'operations', title: '营业与预约规则', body: '免费分时预约，08:00开园，17:00停止入园，18:00开始闭园。预约不代表实际入园，停车预约不保证实体车位。', published: true, version: 1 }));
        (await putMissing('rules', 'public-text', { id: 'public-text', title: '公开文字审核规则', body: '明确辱骂骚扰、威胁、危险行为指导、仇恨、诈骗与隐私泄露可撤回；疑似无法核实的严重指控人工复核；正常差评、投诉、引用举报和求助应保留。', published: true, version: 1 }));
        (await putMissing('settings', 'content-seeded', { version: 1 }));
    }));
}

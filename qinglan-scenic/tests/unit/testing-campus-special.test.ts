import { expect, it } from 'vitest';
import { assignments, deliverySystem } from '../../apps/testing/src/campus-handoff';
import { SpecialSession, createSpecialReport, specialSummary, campusScenarios } from '../../apps/testing/src/special-engine';
it('固定四项校园指派逐步执行，不自动推进并具有校园证据', async () => {
  const session=new SpecialSession(()=>{},0,undefined,'campus');
  expect(campusScenarios).toHaveLength(4);expect(session.snapshot().duplicate.step).toBe(0);
  for (const a of assignments) {
    await session.advance(a.id,0);expect(session.snapshot()[a.id].step).toBe(1);expect(session.snapshot()[a.id].assertions).toEqual([]);
    await session.advance(a.id,1);expect(session.snapshot()[a.id].step).toBe(2);
    await session.advance(a.id,2);const r=session.snapshot()[a.id];expect(r.assertions.every(c=>c.passed)).toBe(true);
    expect(JSON.stringify(r)).not.toContain('订单');expect(r.state.orderId).toMatch(/^BR-TEST/);
  }
  const report=createSpecialReport(deliverySystem(),session.snapshot(),assignments.map(a=>a.id));expect(specialSummary(report)).toMatchObject({completed:4,total:4,passed:12});expect(report.scenarios).toHaveLength(4);session.dispose();
});
it('恢复场景与参数调整不篡改已有报告，取消当前场景不伪造通过', async () => {
  const session=new SpecialSession(()=>{},0,undefined,'campus');await session.advance('duplicate',0);await session.advance('duplicate',1);await session.advance('duplicate',2);
  const report=createSpecialReport(deliverySystem(),session.snapshot(),assignments.map(a=>a.id));
  const restored=new SpecialSession(()=>{},0,session.snapshot(),'campus');restored.reset('duplicate','3');expect(restored.snapshot().duplicate.step).toBe(0);expect(report.scenarios[0].step).toBe(3);
  const inFlight=restored.advance('stock',0);restored.cancel();await inFlight;expect(restored.snapshot().stock.step).toBe(0);expect(restored.snapshot().stock.assertions).toEqual([]);session.dispose();restored.dispose();
});

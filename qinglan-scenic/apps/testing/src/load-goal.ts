import type { MeasurementReport } from './types';

export const LOAD_DEFAULTS = { concurrency: 2000, duration: 30 } as const;
export const LOAD_LIMITS = { minConcurrency: 5, maxConcurrency: 10000, minDuration: 10, maxDuration: 120 } as const;

/** Only recorded sampling windows count, never a configured target or a ramp event alone.
 * Old snapshots without window metadata may use nonzero throughput frames as legacy evidence. */
export function assessLoadGoal(report: MeasurementReport, completedRequestCount: number) {
  const configured = report.config?.concurrency;
  const targetConcurrency = configured !== undefined && Number.isSafeInteger(configured) && configured > 0 ? configured : null;
  const modern = report.frames.some(frame => frame.windowSeconds !== undefined);
  const evidence = report.frames.filter(frame =>
    Number.isFinite(frame.concurrency) && frame.concurrency >= 0 &&
    Number.isFinite(frame.second) && frame.second > 0 && frame.second <= report.elapsedMs / 1000 + 0.001 &&
    (modern ? Number.isFinite(frame.windowSeconds) && frame.windowSeconds! > 0 && Number.isFinite(frame.completed) && frame.completed! > 0
      : Number.isFinite(frame.rps) && frame.rps > 0));
  const peakConcurrency = Math.max(0, ...evidence.map(frame => frame.concurrency));
  const sufficient = targetConcurrency !== null && completedRequestCount > 0 && evidence.length > 0;
  const reachedTarget = sufficient && peakConcurrency >= targetConcurrency;
  const verdict: 'passed' | 'failed' | 'insufficient' = !sufficient ? 'insufficient' : reachedTarget ? 'passed' : 'failed';
  const achievementPercent = targetConcurrency ? peakConcurrency / targetConcurrency * 100 : null;
  const gap = targetConcurrency ? Math.max(0, targetConcurrency - peakConcurrency) : null;
  const reached = evidence.filter(frame => targetConcurrency !== null && frame.concurrency >= targetConcurrency);
  const firstReachedSecond = reached.length ? Math.min(...reached.map(frame => Math.max(0, frame.second - (frame.windowSeconds || 0)))) : null;
  const targetWindowSeconds = reached.reduce((sum, frame) => sum + (frame.windowSeconds || 0), 0);
  const executionComplete = report.status === 'completed' && !!report.config && report.elapsedMs >= report.config.duration * 1000;
  const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  const verdictLabel = verdict === 'passed' ? '通过 · 已达到并发目标' : verdict === 'failed' ? '未达标 · 未达到并发目标' : '待补测 · 目标证据不足';
  const reason = sufficient
    ? `目标并发 ${format(targetConcurrency!)}，${report.loadModel?'模型演示峰值':'已记录峰值'} ${format(peakConcurrency)}，差额 ${format(gap!)}（达成率 ${format(achievementPercent!)}%）。`
    : targetConcurrency === null ? '缺少有效的目标并发配置，无法判定本轮是否达标。' : '尚无有效负载采样或完成请求，不能仅凭设定目标、加压事件或空曲线判为通过。';
  const issues = verdict === 'failed' ? [`并发目标未达标：${reason}${executionComplete ? '' : ' 本轮未完整结束，需按原目标补测。'}`] : [];
  return { targetConcurrency, peakConcurrency, reachedTarget, verdict, verdictLabel, reason, achievementPercent, gap,
    firstReachedSecond, targetWindowSeconds, executionComplete, evidenceMode: modern ? 'sampling-windows' : 'legacy-throughput-frames', loadModel: report.loadModel || null, issues,
    rule: '已记录的有效采样峰值并发 >= 本轮配置的目标并发；测试是否完整结束单独判断。',
    measurement: '本地模型负载记录，不发送真实业务压测请求；并发目标达标不代表真实服务承载能力通过。' + (report.loadModel ? ` 峰值阶段含${report.loadModel.minOvershootPercent}%–${report.loadModel.maxOvershootPercent}%正向随机演示波动，不能据此推断真实容量。` : '') };
}

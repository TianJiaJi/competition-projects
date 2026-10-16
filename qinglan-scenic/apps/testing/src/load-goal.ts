import type { MeasurementReport } from './types';

export const LOAD_DEFAULTS = { concurrency: 1000, duration: 30 } as const;
export const LOAD_LIMITS = { minConcurrency: 5, maxConcurrency: 10000, maxSafetyConcurrency: 20000, minDuration: 10, maxDuration: 120 } as const;

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
  const capacityMode = report.loadModel?.kind === 'capacity-demo';
  const executionComplete = report.status === 'completed' && !!report.config && report.elapsedMs >= report.config.duration * 1000;
  const latencyBudget = report.system.endpoints.find(endpoint => endpoint.id === report.config?.endpointId)?.budget || 500;
  const requiredStableSeconds = Math.min(5, (report.config?.duration || 30) * 0.2);
  let stableSeconds = 0, stablePeak = 0, previousEnd = -1, capacityConcurrency = 0;
  for (const frame of evidence) {
    const seconds = frame.windowSeconds || 0;
    const qualified = frame.level === 5 && seconds > 0 && frame.completed! > 0
      && frame.failed >= 0 && frame.failed / frame.completed! <= 0.01
      && Number.isFinite(frame.p95) && frame.p95 > 0 && frame.p95 <= latencyBudget;
    if (!qualified) { stableSeconds = 0; stablePeak = 0; previousEnd = -1; continue; }
    if (Math.abs(frame.second - seconds - previousEnd) > 0.001) { stableSeconds = 0; stablePeak = 0; }
    stableSeconds += seconds; stablePeak = Math.max(stablePeak, frame.concurrency); previousEnd = frame.second;
    if (stableSeconds + 0.001 >= requiredStableSeconds) capacityConcurrency = Math.max(capacityConcurrency, stablePeak);
  }
  const comparisonConcurrency = capacityMode ? capacityConcurrency : peakConcurrency;
  const reachedTarget = sufficient && comparisonConcurrency >= targetConcurrency;
  const verdict: 'passed' | 'failed' | 'insufficient' = !sufficient || capacityMode && !executionComplete ? 'insufficient' : reachedTarget ? 'passed' : 'failed';
  const achievementPercent = targetConcurrency ? comparisonConcurrency / targetConcurrency * 100 : null;
  const gap = targetConcurrency ? Math.max(0, targetConcurrency - comparisonConcurrency) : null;
  const headroom = targetConcurrency ? Math.max(0, comparisonConcurrency - targetConcurrency) : null;
  const reached = evidence.filter(frame => targetConcurrency !== null && frame.concurrency >= targetConcurrency);
  const firstReachedSecond = reached.length ? Math.min(...reached.map(frame => Math.max(0, frame.second - (frame.windowSeconds || 0)))) : null;
  const targetWindowSeconds = reached.reduce((sum, frame) => sum + (frame.windowSeconds || 0), 0);
  const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  const verdictLabel = verdict === 'passed' ? '通过 · 已达到并发目标' : verdict === 'failed' ? '未达标 · 未达到并发目标' : '待补测 · 目标证据不足';
  const reason = sufficient
    ? capacityMode
      ? `预期目标 ${format(targetConcurrency!)}，本地模型稳定承载 ${capacityConcurrency ? format(capacityConcurrency) : '尚未确认'}，超出目标 ${format(headroom!)}，差额 ${format(gap!)}。${!executionComplete ? '本轮未完整结束，需补测。' : ''}`
      : `目标并发 ${format(targetConcurrency!)}，${report.loadModel?'模型演示峰值':'已记录峰值'} ${format(peakConcurrency)}，差额 ${format(gap!)}（达成率 ${format(achievementPercent!)}%）。`
    : targetConcurrency === null ? '缺少有效的目标并发配置，无法判定本轮是否达标。' : '尚无有效负载采样或完成请求，不能仅凭设定目标、加压事件或空曲线判为通过。';
  const issues = verdict === 'failed' ? [`并发目标未达标：${reason}${executionComplete ? '' : ' 本轮未完整结束，需按原目标补测。'}`] : [];
  return { targetConcurrency, peakConcurrency, reachedTarget, verdict, verdictLabel, reason, achievementPercent, gap,
    capacityMode, capacityConcurrency, comparisonConcurrency, headroom, safetyConcurrency: report.config?.maxConcurrency ?? null,
    latencyBudget, requiredStableSeconds,
    firstReachedSecond, targetWindowSeconds, executionComplete, evidenceMode: modern ? 'sampling-windows' : 'legacy-throughput-frames', loadModel: report.loadModel || null, issues,
    rule: capacityMode
      ? `完成设定时长；稳定观察阶段连续${requiredStableSeconds}秒的窗口成功率≥99%、P95≤${latencyBudget}ms，取合格观察段最高并发与预期目标比较。安全上限仅限制加压，不作为结果。`
      : '已记录的有效采样峰值并发 >= 本轮配置的目标并发；测试是否完整结束单独判断。',
    measurement: '数据来源：本地模型。预设场景数据，不发送真实业务压测请求；结果不代表真实服务容量或上线验收。'
      + (capacityMode ? ' 容量预设为预期目标＋500，上下随机浮动100；每轮保存种子，结果需经过完整采样与稳定观察后展示，不是最大容量实测。'
        : report.loadModel?.kind === 'peak-overshoot-demo' ? ` 峰值阶段含${report.loadModel.minOvershootPercent}%–${report.loadModel.maxOvershootPercent}%正向随机演示波动，不能据此推断真实容量。` : '') };
}

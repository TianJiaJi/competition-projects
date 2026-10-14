import { loadReportSummary, type MeasurementReport } from './engine';
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const number=(value:number,digits=1)=>value.toLocaleString('zh-CN',{maximumFractionDigits:digits});
function chart(report:MeasurementReport,kind:'load'|'latency'){
  if(!report.frames.length)return '<p>尚无曲线记录</p>';
  const load=kind==='load';
  const leftMax=load?Math.max(1,report.config?.concurrency || 0,...report.frames.map(frame=>frame.concurrency)):Math.max(120,...report.frames.map(frame=>frame.p95));
  const rightMax=load?Math.max(1,report.config?.rps || 0,...report.frames.map(frame=>frame.rps)):leftMax;
  const duration=Math.max(1,report.config?.duration || 0,...report.frames.map(frame=>frame.second));
  const points=(key:'concurrency'|'rps'|'p50'|'p95',max:number)=>report.frames.map(frame=>`${40+540*Math.min(1,frame.second/duration)},${155-125*Math.min(1,Math.max(0,frame[key])/max)}`).join(' ');
  const targetY=155-125*Math.min(1,(report.config?.concurrency || 0)/leftMax);
  return `<svg viewBox="0 0 640 185" role="img" aria-label="${load?'并发目标与负载':'响应延迟'}">
    <path d="M40 30H580 M40 92H580 M40 155H580" fill="none" stroke="#dfe7de" stroke-dasharray="3 5"/>
    <text x="8" y="20">${number(leftMax,0)} ${load?'并发':'ms'}</text>
    ${load?`<text x="630" y="20" text-anchor="end">${number(rightMax)} req/s</text><path d="M40 ${targetY}H580" stroke="#a7813f" stroke-dasharray="5 5"/><text x="580" y="${targetY+13}" text-anchor="end">目标 ${number(report.config?.concurrency || 0,0)}</text>`:''}
    <polyline points="${points(load?'concurrency':'p50',leftMax)}" fill="none" stroke="#286c52" stroke-width="2.5"/>
    <polyline points="${points(load?'rps':'p95',rightMax)}" fill="none" stroke="${load?'#ba943a':'#8fa887'}" stroke-width="2"/>
    <text x="40" y="179">0 s</text><text x="580" y="179" text-anchor="end">${number(duration)} s</text>
  </svg>`;
}
export function loadReportHtml(report:MeasurementReport):string{
  const summary=loadReportSummary(report),goal=summary.goal,stats=summary.statistics;
  const metric=(label:string,value:string,note:string)=>`<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
  const stages=summary.stages.filter(stage=>stage.reached).map(stage=>`<tr><td>${stage.label}</td><td>${number(stage.concurrency,0)}</td><td>${number(stage.peakRps)}</td><td>${stage.maxWindowP95?number(stage.maxWindowP95)+' ms':'—'}</td></tr>`).join('');
  const state=goal.executionComplete?'完整测试已结束':report.status==='stopped'?'本轮已提前停止，需补齐设定时长':'本轮未完整结束，需补测';
  const target=goal.targetConcurrency===null?'—':number(goal.targetConcurrency,0);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'"><title>并发目标验收报告 · ${escape(report.system.name)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7f1;color:#304a3b;font:14px/1.8 system-ui,'Microsoft YaHei',sans-serif}main{max-width:1080px;margin:32px auto;padding:32px;background:white;border:1px solid #e0e8dc;border-radius:14px}h1{font-size:28px;margin:6px 0}h2{font-size:19px;margin:22px 0 12px}p{margin:8px 0}.eyebrow{font-size:10px;letter-spacing:2px;color:#859578}.verdict{padding:20px;border:1px solid #e4d3a7;border-radius:12px;background:#fff8e9;color:#967139;margin:20px 0}.verdict h2{font-size:26px;margin:0 0 10px}.verdict.passed{background:#eaf5e7;border-color:#bfd9b5;color:#356e43}.verdict.failed{background:#fff0ea;border-color:#e8b9a8;color:#a84e35}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metrics article{padding:16px;border:1px solid #e2eadc;background:#f6f9f2;border-radius:9px}.metrics span,.metrics small{display:block;font-size:12px;color:#849878}.metrics strong{display:block;font-size:30px;margin:10px 0}.meta{padding:14px 0;border-block:1px solid #e3eadf;color:#7f9273;font-size:12px;overflow-wrap:anywhere}.source{font-size:12px;color:#86977a}.issues{padding:18px;border:1px solid #e3ebdc;border-radius:9px;background:#f7faf3;margin-top:20px}.issues.failed{background:#fff8ef;border-color:#ead0bd}.issues h2{margin-top:0}.issues li{margin:8px 0}.charts{display:grid;grid-template-columns:1fr 1fr;gap:18px}svg{display:block;width:100%;height:auto}svg text{font:10px monospace;fill:#819476}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5ecdf}th{background:#f2f6ed}code{overflow-wrap:anywhere}@media(max-width:700px){main{margin:0;padding:20px}.metrics{grid-template-columns:1fr 1fr}.charts{grid-template-columns:1fr}}@media print{body{background:white}main{margin:0;border:0;max-width:none}.verdict,.metrics,.issues{break-inside:avoid}}@page{size:A4;margin:15mm}
</style></head><body><main><div class="eyebrow">CONCURRENCY GOAL / TEST REPORT</div><h1>本次并发目标验收</h1><p>${escape(report.system.name)} · ${escape(summary.endpointName)} · 本地模型演示${report.loadModel?'（含峰值随机波动）':''}</p>
<section class="verdict ${goal.verdict}" aria-label="并发目标结论"><h2>${goal.verdictLabel}</h2><p>${escape(goal.reason)}</p><p>${state}。目标达标与执行完整性分别记录。</p></section>
<div class="metrics">${metric('本次目标并发',target,'本次报告保存的配置')}${metric(report.loadModel?'模型演示峰值并发':'已记录峰值并发',number(goal.peakConcurrency,0),'仅依据有效模型采样')}${metric('目标达成率',goal.achievementPercent===null?'—':number(goal.achievementPercent)+'%','峰值 ÷ 目标')}${metric('距离目标差额',goal.gap===null?'—':number(goal.gap,0),goal.reachedTarget?'已达到目标，无并发缺口':'尚缺的并发数量')}</div>
<p class="source">判定标准：有效采样峰值 ≥ 目标并发即通过；没有有效采样则待补测。计划升档不单独作为通过证据。${report.loadModel?` 峰值阶段含${report.loadModel.minOvershootPercent}%–${report.loadModel.maxOvershootPercent}%正向随机演示波动，非实测数据。`:''}</p>
<div class="meta">编号：${escape(report.id)}<br>开始：${escape(new Date(report.startedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))} · 执行 ${number(report.elapsedMs/1000)} / ${report.config?.duration || 0} 秒<br>首次达标：${goal.firstReachedSecond===null?'未达到':number(goal.firstReachedSecond)+' s'} · 达标采样覆盖：${goal.evidenceMode==='legacy-throughput-frames'?'旧记录未统计':number(goal.targetWindowSeconds)+' 秒'}<br><code>${escape(summary.endpointMethod)} ${escape(report.system.baseUrl)}${escape(summary.endpointPath)}</code></div>
<section class="issues ${goal.issues.length?'failed':''}"><h2>${goal.issues.length?'未达标问题 · 已记录':'目标问题记录'}</h2>${goal.issues.length?`<ul>${goal.issues.map(issue=>`<li>${escape(issue)}</li>`).join('')}</ul><p>问题随本报告保存，汇总验收报告后纳入问题清单，由操作者手动提交反馈。</p>`:`<p>${goal.verdict==='passed'?'本次并发目标无缺口。':'证据不足，保持原目标补测，不形成虚假的通过结论。'}</p>`}${stats.failed?`<p>另有 ${number(stats.failed,0)} 次请求契约未通过，独立纳入验收问题。</p>`:''}</section>
<h2>辅助性能指标（不替代目标结论）</h2><p>累计完成请求 ${number(stats.count,0)} · 请求契约未通过 ${number(stats.failed,0)} · 峰值吞吐 ${number(summary.peakRps)} req/s · 全程 P95 ${stats.count?number(stats.p95)+' ms':'—'}</p>
<div class="charts"><section><h2>并发目标与负载过程</h2><p class="source">绿色：记录并发 · 黄色：吞吐 · 虚线：目标并发</p>${chart(report,'load')}</section><section><h2>响应延迟过程</h2><p class="source">辅助观察模型延迟变化</p>${chart(report,'latency')}</section></div>
<h2>加压过程记录</h2><table><thead><tr><th>阶段</th><th>计划 / 记录并发</th><th>峰值 req/s</th><th>最高窗口 P95</th></tr></thead><tbody>${stages}</tbody></table><p class="source">阶段表包含计划升档，目标判定仅采用有效采样。${goal.evidenceMode==='legacy-throughput-frames'?'旧报告缺少窗口元数据，使用有吞吐记录的帧核验。':''}</p>
<p class="source">${escape(goal.measurement)} 反馈是本地记录，不代表交付团队实际收到。本报告可打印为PDF，完整原始记录可另行导出JSON。</p></main></body></html>`;
}

import { loadReportSummary, type MeasurementReport } from "./engine";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
);
const number = (value: number, digits = 1) => value.toLocaleString("zh-CN", { maximumFractionDigits: digits });

function chart(report: MeasurementReport, kind: "load" | "latency") {
  if (!report.frames.length) return "<p>尚无曲线记录</p>";
  const load = kind === "load";
  const leftMax = load ? Math.max(1, report.config?.concurrency || 0, ...report.frames.map(frame => frame.concurrency))
    : Math.max(120, ...report.frames.map(frame => frame.p95));
  const rightMax = load ? Math.max(1, report.config?.rps || 0, ...report.frames.map(frame => frame.rps)) : leftMax;
  const duration = Math.max(1, report.config?.duration || 0, ...report.frames.map(frame => frame.second));
  const points = (key: "concurrency" | "rps" | "p50" | "p95", max: number) => report.frames
    .map(frame => `${40 + 540 * Math.min(1, frame.second / duration)},${155 - 125 * Math.min(1, Math.max(0, frame[key]) / max)}`).join(" ");
  return `<svg viewBox="0 0 640 185" role="img" aria-label="${load ? "负载与吞吐" : "响应延迟"}">
    <path d="M40 30H580 M40 92H580 M40 155H580" fill="none" stroke="#dfe7de" stroke-dasharray="3 5"/>
    <text x="8" y="20">${number(leftMax, 0)} ${load ? "并发" : "ms"}</text>
    ${load ? `<text x="630" y="20" text-anchor="end">${number(rightMax)} req/s</text>` : ""}
    <polyline points="${points(load ? "concurrency" : "p50", leftMax)}" fill="none" stroke="#286c52" stroke-width="2.5"/>
    <polyline points="${points(load ? "rps" : "p95", rightMax)}" fill="none" stroke="${load ? "#ba943a" : "#8fa887"}" stroke-width="2"/>
    <text x="40" y="179">0 s</text><text x="580" y="179" text-anchor="end">${number(duration)} s</text>
  </svg>`;
}

export function loadReportHtml(report: MeasurementReport): string {
  const summary = loadReportSummary(report), stats = summary.statistics;
  const status = report.status === "completed" ? "本轮压力测试已完成" : "本轮阶段记录已保存";
  const reachedStages = summary.stages.filter(stage => stage.reached);
  const stageRows = reachedStages.map(stage => `<tr><td>${stage.label}</td><td>${number(stage.concurrency, 0)}</td><td>${number(stage.peakRps)}</td><td>${stage.maxWindowP95 ? number(stage.maxWindowP95) + " ms" : "—"}</td><td>已记录</td></tr>`).join("");
  const metric = (label: string, value: string, note: string) => `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'">
<title>压力测试报告 · ${escape(report.system.name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f7f1;color:#304a3b;font:14px/1.7 system-ui,'Microsoft YaHei',sans-serif}main{max-width:1080px;margin:32px auto;padding:38px;background:white;border:1px solid #e0e8dc;border-radius:15px}h1{font-size:30px;margin:8px 0}h2{font-size:18px;margin:28px 0 12px}p{margin:8px 0}.eyebrow{font-size:11px;letter-spacing:2px;color:#849477}.meta{padding:16px 0;border-block:1px solid #e3eadf;color:#7b8d71}code{overflow-wrap:anywhere}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metrics article{background:#f4f8ef;padding:18px;border:1px solid #e2eadc;border-radius:10px}.metrics span,.metrics small{display:block;color:#7f9273;font-size:12px}.metrics strong{display:block;font-size:28px;font-weight:500;margin:9px 0}.source{color:#809077;font-size:12px}.charts{display:grid;grid-template-columns:1fr 1fr;gap:20px}svg{display:block;width:100%;height:auto}svg text{font:11px monospace;fill:#7d9172}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5ecdf;overflow-wrap:anywhere}th{background:#f1f6eb;font-weight:500}.outcomes{background:#f4f8ef;border:1px solid #dce8d3;padding:18px;margin-top:24px;border-radius:10px}.outcomes h2{margin-top:0}.status{color:#607d4c}.foot{margin-top:24px;color:#87947d;font-size:12px}@media(max-width:700px){main{margin:0;padding:20px}.metrics{grid-template-columns:1fr 1fr}.charts{grid-template-columns:1fr}}@media print{body{background:white}main{border:0;margin:0;padding:0;max-width:none}.metrics article,.charts,table{break-inside:avoid}.outcomes{break-inside:avoid}}@page{size:A4;margin:15mm}
</style></head><body><main>
<div class="eyebrow">PERFORMANCE TEST REPORT</div>
<h1>压力测试报告</h1><p class="status">${status}</p>
<div class="meta">系统：${escape(report.system.name)} · 接口：${escape(summary.endpointName)}<br>
编号：${escape(report.id)}<br>开始：${escape(new Date(report.startedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }))} · 执行：${number(report.elapsedMs / 1000)} / ${report.config?.duration || 0} 秒<br>
<code>${escape(summary.endpointMethod)} ${escape(report.system.baseUrl)}${escape(summary.endpointPath)}</code></div>
<h2>负载统计</h2><div class="metrics">
${metric("峰值并发", number(summary.peakConcurrency, 0), `目标 ${number(report.config?.concurrency || 0, 0)}${summary.reachedTarget ? " · 已达目标" : ""}`)}
${metric("累计完成请求", number(stats.count, 0), `覆盖 ${number(report.elapsedMs / 1000)} 秒执行过程`)}
${metric("峰值吞吐", number(summary.peakRps) + " req/s", "取本轮统计窗口峰值")}
${metric("全程 P95", stats.count ? number(stats.p95) + " ms" : "—", `P50 ${number(stats.p50)} · P99 ${number(stats.p99)} ms`)}
</div><p>平均吞吐 ${number(stats.rps)} req/s · 平均延迟 ${number(stats.average)} ms · 最长延迟 ${number(stats.max)} ms</p>

<div class="charts"><section><h2>负载与吞吐过程</h2><p class="source">绿色：展示并发 · 黄色：展示吞吐</p>${chart(report, "load")}</section><section><h2>响应延迟过程</h2><p class="source">深绿：窗口 P50 · 浅绿：窗口 P95</p>${chart(report, "latency")}</section></div>
<h2>已记录的加压阶段</h2><table><thead><tr><th>阶段</th><th>并发</th><th>峰值 req/s</th><th>最高窗口 P95</th><th>执行情况</th></tr></thead><tbody>${stageRows}</tbody></table>
<section class="outcomes"><h2>本轮测试成果</h2>
<p><b>✓ 负载过程已记录</b><br>覆盖 ${reachedStages.length} 个阶段，峰值并发 ${number(summary.peakConcurrency, 0)}。</p>
<p><b>✓ 性能指标已汇总</b><br>累计 ${number(stats.count, 0)} 次完成请求，吞吐与延迟趋势已生成。</p>
<p><b>✓ 报告材料已整理</b><br>本轮配置、阶段数据和趋势图已随报告一起导出。</p>
</section><p class="foot">本报告依据本轮记录生成。完整数据及加压事件可通过 JSON 导出，可使用浏览器打印功能将本报告保存为 PDF。</p>
</main></body></html>`;
}

import { mkdir, writeFile, copyFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  materialCatalog,
  materialAssets,
} from "../packages/demo/src/samples/school/materials.ts";
import {
  schema,
  relationQuery,
  insertSql,
  collections,
  schoolScenario,
} from "../packages/demo/src/samples/school/index.ts";
import { serviceContract } from "../packages/demo/src/samples/school/service-contract.ts";
const root = new URL("../packages/demo/assets/", import.meta.url);
const json = (v) => JSON.stringify(v, null, 2) + "\n";
const field = (name, label, type = "text") =>
  `<label>${label}<input name="${name}" type="${type}" required /></label>`;
const login = `<form data-page="login">${field("username", "账号")}${field("password", "密码", "password")}<button type="submit">登录</button><p role="alert" data-bind="error"></p></form>`;
const detail = `<section data-page="detail"><h2 data-bind="record.title">记录详情</h2><dl><dt>位置</dt><dd data-bind="record.location"></dd><dt>状态</dt><dd data-bind="record.status"></dd><dt>提交人</dt><dd data-bind="record.submitterId"></dd><dt>处理人</dt><dd data-bind="record.assigneeId"></dd><dt>处理结果</dt><dd data-bind="record.result"></dd></dl><p data-bind="record.description"></p></section>`;
const list = (id, label, action = "") =>
  `<section data-page="${id}"><h2>${label}</h2><form role="search">${field("query", "关键词")}<select name="status" aria-label="状态"><option value="">全部</option></select><button>查询</button></form><table><thead><tr><th>名称</th><th>位置</th><th>类型</th><th>状态</th><th>操作</th></tr></thead><tbody><tr data-repeat="records.${id}"><td data-bind="title"></td><td data-bind="location"></td><td data-bind="category"></td><td data-bind="status"></td><td><button data-action="detail">查看详情</button>${action}</td></tr></tbody></table><p data-if="empty">暂无记录</p></section>`;
const metrics = `<section class="metrics" aria-label="运行指标"><article data-repeat="metrics"><h3 data-bind="label"></h3><output data-bind="value"></output><small data-bind="unit"></small></article></section>`;
const space = `<section data-component="space-browser"><nav aria-label="浏览视角"><button data-view="overview">全景</button><button data-view="learning">重点区域</button></nav><div data-bind="space.geometry" role="img" aria-label="空间视图"></div><aside data-bind="space.selection"><h2 data-bind="title"></h2><dl><dt>建筑编号</dt><dd data-bind="buildingId"></dd><dt>关联设施</dt><dd data-bind="facilityId"></dd></dl></aside></section>`;
const request = `<form data-page="request"><h2>提交服务请求</h2>${field("title", "标题")}<label>设施<select name="facilityId" required><option data-repeat="facilities" data-value="id" data-bind="title"></option></select></label>${field("location", "位置")}<label>说明<textarea name="description" required></textarea></label><button type="submit">提交</button><p role="alert" data-bind="error"></p></form>`;
const booking = `<form data-page="booking"><h2>空间预约</h2><label>空间<select name="facilityId" required><option data-repeat="venues" data-value="id" data-bind="title"></option></select></label>${field("date", "日期", "date")}<label>时段<select name="timeSlot"><option>09:00–10:00</option><option>14:00–15:00</option></select></label>${field("count", "人数", "number")}<button type="submit">预约</button><p role="alert" data-bind="error"></p></form>`;
const editor = `<form data-page="editor"><h2>维护记录</h2>${["title", "location", "category", "status", "date", "buildingId", "facilityId", "submitterId", "assigneeId", "timeSlot", "count"].map((k) => field(k, k, k === "date" ? "date" : k === "count" ? "number" : "text")).join("")}<label>说明<textarea name="description" required></textarea></label><label>处理结果<textarea name="result"></textarea></label><button type="submit">保存</button><button type="button" data-action="cancel-edit">取消</button><p role="alert" data-bind="error"></p></form>`;
function document(title, nav, body) {
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><title>${title}</title></head><body>\n<template id="${title}"><header><h1 data-bind="applicationName">应用名称</h1><nav>${nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")}</nav><span data-bind="identity"></span><button data-action="logout">退出</button></header><main>\n${body.join("\n\n")}\n</main><p role="status" data-bind="feedback"></p></template>\n</body></html>\n`;
}
const html = {
  "public-pages.html": document(
    "public-pages",
    [
      ["overview", "总览"],
      ["buildings", "楼宇"],
      ["facilities", "设施"],
      ["venues", "空间"],
      ["bookings", "预约记录"],
      ["notices", "公告"],
    ],
    [
      `<section data-page="overview">${metrics}${space}</section>`,
      list("buildings", "楼宇"),
      list("facilities", "设施"),
      list("venues", "场馆与预约"),
      list("bookings", "预约记录"),
      list("notices", "公告"),
      detail,
    ],
  ),
  "ops-pages.html": document(
    "ops-pages",
    [["overview", "运行总览"]],
    [
      `<section data-page="overview">${metrics}${space}</section>`,
      list("security", "安防"),
      list("tasks", "待办"),
      list("facilities", "设施状态"),
      `<section data-page="energy"><h2>能耗曲线</h2><figure data-bind="energyChart"></figure></section>`,
    ],
  ),
  "mobile-pages.html": document(
    "mobile-pages",
    [
      ["home", "首页"],
      ["services", "服务"],
      ["records", "我的记录"],
      ["me", "我的"],
    ],
    [
      login,
      `<section data-page="home">${metrics}<nav><a href="#request">提交请求</a><a href="#booking">空间预约</a></nav></section>`,
      list("services", "设施与服务"),
      request,
      booking,
      list("notices", "公告"),
      `<section data-page="me"><h2 data-bind="identity">用户</h2><a href="#records">我的记录</a><button data-action="logout">退出</button></section>`,
      `<section data-page="assistant"><h2>常见问题</h2><details data-repeat="faq"><summary data-bind="question"></summary><p data-bind="answer"></p></details></section>`,
      detail,
      list(
        "records",
        "我的记录",
        '<button data-action="cancel">取消预约</button><p data-bind="result"></p>',
      ),
    ],
  ),
  "staff-pages.html": document(
    "staff-pages",
    [
      ["overview", "任务总览"],
      ["tasks", "任务列表"],
      ["inspections", "巡检计划"],
      ["history", "历史记录"],
    ],
    [
      login,
      `<section data-page="overview">${metrics}</section>`,
      list("tasks", "任务列表", '<button data-action="claim">领取</button>'),
      list(
        "inspections",
        "巡检计划",
        '<button data-action="claim">领取</button>',
      ),
      list("history", "处理历史"),
      detail,
      `<form data-page="complete"><h2>完成任务</h2><input type="hidden" name="id"><label>处理结果<textarea name="result" required></textarea></label><button type="submit">完成</button><p role="alert" data-bind="error"></p></form>`,
    ],
  ),
  "admin-pages.html": document(
    "admin-pages",
    [["overview", "总览"], ...collections.slice(0, 8).map((k) => [k, k])],
    [
      login,
      `<section data-page="overview">${metrics}</section>`,
      ...collections
        .slice(0, 8)
        .map((k) =>
          list(
            k,
            k,
            '<button data-action="edit">编辑</button><button data-action="create">新增</button>',
          ),
        ),
      editor,
      detail,
    ],
  ),
  "navigation-layout.html": document(
    "navigation-layout",
    [
      ["overview", "总览"],
      ["records", "记录"],
      ["settings", "设置"],
    ],
    [
      `<aside aria-label="分类导航"><button data-repeat="navigation" data-bind="label" data-action="navigate"></button></aside><section class="page-layout"><header><h2 data-bind="pageTitle"></h2><form role="search">${field("query", "搜索")}<button>搜索</button></form></header><div data-slot="content"></div></section>`,
    ],
  ),
  "glass-metrics.html": document(
    "glass-metrics",
    [],
    [
      metrics,
      `<style>.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.metrics article{border:1px solid #ffffff90;background:#ffffffbb;border-radius:14px;backdrop-filter:blur(2px);padding:20px;box-shadow:0 4px 12px #23334f14}.metrics output{font-size:32px}</style>`,
    ],
  ),
  "records-forms.html": document(
    "records-forms",
    [],
    [
      list("records", "数据列表"),
      detail,
      editor,
      `<nav aria-label="分页"><button data-action="previous">上一页</button><output data-bind="page"></output><button data-action="next">下一页</button></nav>`,
    ],
  ),
  "contour-background.html": document(
    "contour-background",
    [],
    [
      `<div class="contour-background"><svg aria-hidden="true" viewBox="0 0 1440 900"><defs><pattern id="terrain" width="520" height="420" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" opacity=".08">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="220" cy="195" rx="${30 + i * 21}" ry="${20 + i * 16}" transform="rotate(-18 220 195)"/>`).join("")}</g></pattern></defs><rect width="1440" height="900" fill="url(#terrain)"/></svg><main data-slot="content"></main></div><style>.contour-background{position:relative;background:#f5f7fb;color:#233044}.contour-background>svg{position:absolute;inset:0;pointer-events:none;width:100%;height:100%}.contour-background>main{position:relative}</style>`,
    ],
  ),
};
const contents = {
  ...html,
  "sandbox-reference.json": json({
    model: "campus",
    view: "learning",
    views: ["overview", "learning", "safety"],
    interactions: ["rotate", "zoom", "building-details", "facility-details"],
    focus: { buildingId: "B1", facilityId: "F4" },
    coordinates: "../02-设施坐标/M03.json",
    reference: "R01-campus.png",
  }),
  "schema-and-queries.sql": `-- 表结构\n${schema}\n\n-- 关联查询，参数：[taskId]\n${relationQuery}\n\n-- 初始化写入，按字段顺序绑定参数\n${collections.map((c) => insertSql(c) + ";").join("\n")}\n\n-- 维护记录：参数来自已校验的字段\n${collections
    .slice(0, 8)
    .map((c) => insertSql(c, true) + ";")
    .join("\n")}\n`,
  "initial-records.json": json(schoolScenario().seed),
  "service-contract.json": json(serviceContract),
};
const manifest = [];
for (const item of materialCatalog) {
  const dest = new URL(item.path, root);
  await mkdir(new URL("./", dest), { recursive: true });
  if (contents[item.name]) await writeFile(dest, contents[item.name]);
  else await copyFile(new URL(item.name, root), dest);
  manifest.push({ ...item, size: (await stat(dest)).size });
}
const output = new URL("material-pack/产物参考/M02.svg", root);
await mkdir(new URL("./", output), { recursive: true });
await copyFile(new URL("M02.svg", root), output);
await writeFile(
  new URL("material-pack/manifest.json", root),
  json({ version: "2.0.0", files: manifest, outputs: ["产物参考/M02.svg"] }),
);
// Python's ZIP writer uses UTF-8 filenames and needs no third-party runtime library.
execFileSync("python3", [
  "-c",
  `import pathlib,zipfile\np=pathlib.Path(${JSON.stringify(fileURLToPath(root))})\nwith zipfile.ZipFile(p/'material-pack.zip','w',zipfile.ZIP_DEFLATED) as z:\n for f in sorted((p/'material-pack').rglob('*')):\n  if f.is_file(): z.write(f,f.relative_to(p))\n`,
]);
for (const name of materialAssets) await stat(new URL(name, root));
console.log(
  `Prepared ${manifest.length} input files, output SVG, manifest and ZIP.`,
);

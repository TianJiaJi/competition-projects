# 知行校园

五端应用项目，使用 Vue 3、TypeScript、Three.js、ECharts 和 uni-app。普通入口使用独立前端样例；工作台 03 演示阶段接入本机 HTTP 服务与 SQLite，支持跨端共享读写。AI 回复和适配方案为预制材料。手机端为 H5，保留后续安卓 App 接入的适配边界。

## 启动

Node.js 24、pnpm 10.17.1。**先进入本目录**再运行命令，Corepack 会按 packageManager 选择版本。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

| 终端 | 地址 | 单独启动 |
| --- | --- | --- |
| 公共大屏 | http://localhost:5500/ | `pnpm dev:public` |
| 管理大屏 | http://localhost:5501/ | `pnpm dev:ops` |
| 手机服务 | http://localhost:5502/ | `pnpm dev:mobile` |
| 工作人员 | http://localhost:5503/ | `pnpm dev:staff` |
| 管理后台 | http://localhost:5504/ | `pnpm dev:admin` |
| 制作工作台 | http://localhost:5506/ | `pnpm dev:demo`（统一启动七个服务） |
| 组件预览 | http://localhost:5505/ | `pnpm dev:ui`（单独启动） |

管理后台账号 `admin01 / 123456`；工作人员 `staff01 / 123456`；手机服务 `user01 / 123456`。普通入口只控制前端身份；工作台演示入口由本机服务校验角色及操作权限，不提供生产账号管理。

普通入口的操作保留于当前端内存，刷新恢复样例。演示 02 保留这种独立交互；演示 03 共享 SQLite 并恢复当前轮次。均不新增预约时段冲突规则。

## 构建和验证

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm assets:mobile # 修改品牌色后重新生成手机图标
```

浏览器测试默认使用本机 Chrome；也可以安装 Playwright Chromium 后以 `E2E_CHANNEL=chromium pnpm test:e2e` 运行。测试自动启动五端，已有同端口服务则复用。

桌面产物位于 `apps/public/dist`、`apps/ops/dist`、`apps/admin/dist`、`apps/staff/dist`，手机产物位于 `apps/mobile/dist/build/h5`。各目录可独立使用静态服务器预览；请通过 HTTP 打开。本次没有部署网站、发布 App 或连接线上系统。

## 修改入口

- [模板替换指南](docs/模板替换指南.md)：品牌、导航、指标、页面、Mock、沙盘替换。
- [安卓衔接说明](docs/安卓衔接说明.md)：H5 与未来原生构建边界。
- [组件来源与交互基线](docs/组件来源与交互基线.md)：保留的组件与验证办法。
- [验收记录](docs/验收记录.md)：实测结果与范围。

`scenario/config.ts` 集中保存场景内容；`packages/domain` 是无网络依赖的数据和规则；`packages/experience` 是桌面页面及交互；`apps/mobile` 保留独立 uni-app 工具链。每个项目自带所有工作区包，可单独复制出去安装运行。

## 00 / 01 大屏

00 公共端以全屏沙盘为主体，通过空间、服务、概况和公告气泡浏览数据；完整列表仍可从气泡进入。01 是只读运行监控，顶部指标、两侧状态和中央图表围绕沙盘，完整业务操作通过“管理中心”打开本项目 04 端。旧监控业务地址自动回到总览。

00 默认浅色并播放卷轴开场；01 默认使用场景深色，加载完成后面板先入场、沙盘最后显现。主题切换不重播，刷新恢复默认主题，减少动态效果时直接显示。两端已替换为校园公共空岛组件。00 按学习／生活／安全组织标点，默认学习；01 保留监控布局。详见[校园沙盘布局与组件](docs/知行校园沙盘布局与组件.md)。

执行 `pnpm test:e2e` 验证布局、气泡、加载失败和各端回归；截图位于 `test-results/public-*.png` 与 `test-results/monitor-*.png`。

## 通用 AI 工作流与学校样例

工作台使用常展开 HTML 卡片＋SVG 连线组成连续依赖流，无阶段框或节点侧栏。素材人工导入，自动节点连续推进；每人保留需求、调整确认、成果验收三个主要停点。01 空间 → 02 页面 → 03 数据与服务及自动总装 → 第四人测试与交付占位。各阶段预览独立保留，通用外壳不硬编码学校业务。

```sh
pnpm dev:demo       # 开发：五端 + 5506 工作台 + 5507 服务
pnpm demo:build     # 赛前构建全部演示前端
pnpm demo:serve     # 正式本机静态运行
```

先停止占用 5500—5504、5506、5507 的其他开发服务。端口冲突明确失败，不自动更换。统一启动器只绑定 localhost，任一服务异常退出时清理其他自有进程。5505 组件预览不计入成果。

从 `http://localhost:5506/` 打开成果。01 仅沙盘，02 五端独立样例，03 真 HTTP/SQLite。普通查看不重载，同轮刷新/服务重启恢复；“开始新流程”才删除上一轮演示专属库并使旧链接失效。持久目录 `.local/builder`，测试目录 `.local/builder-e2e`。

- `pnpm test:service`：临时库/内存库中的服务、权限、关联和恢复测试。
- `pnpm test:demo`：开发版七服务浏览器验收。
- `pnpm test:demo:static`：构建后的静态版验收，包含阻断外部请求。
- `DEMO_REUSE=1 pnpm test:demo`：仅限复用专用测试服务，不能对现场排练轮次执行。
- [共享演示包](packages/demo/README.md)：契约与恢复行为。
- [运行与真人排练记录](../docs/省赛实施文档/校园演示运行与排练记录.md)：操作、故障恢复与待实测表。

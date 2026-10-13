# 云栖雅苑

独立的五端纯前端项目，使用 Vue 3、TypeScript、Three.js、ECharts 和 uni-app。无业务后端、数据库、AI 模型调用或跨端数据同步。手机端为 H5，保留后续安卓 App 接入的适配边界。

## 启动

Node.js 24、pnpm 10.17.1。**先进入本目录**再运行命令，Corepack 会按 packageManager 选择版本。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

| 终端 | 地址 | 单独启动 |
| --- | --- | --- |
| 公共大屏 | http://localhost:5400/ | `pnpm dev:public` |
| 管理大屏 | http://localhost:5401/ | `pnpm dev:ops` |
| 手机服务 | http://localhost:5402/ | `pnpm dev:mobile` |
| 工作人员 | http://localhost:5403/ | `pnpm dev:staff` |
| 管理后台 | http://localhost:5404/ | `pnpm dev:admin` |
| 组件预览 | http://localhost:5405/ | `pnpm dev:ui`（单独启动） |

管理后台账号 `admin01 / 123456`；工作人员 `staff01 / 123456`；手机服务 `user01 / 123456`。它们只控制前端演示身份，不提供真实鉴权。

操作保留于当前端内存，切页保留，刷新恢复固定样例。各端互相独立，没有持久化、跨端流转或真实预约冲突判断。接口连接和数据库无需配置。

## 构建和验证

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:ops # 仅启动或复用5401，验证监控大屏
pnpm build
pnpm assets:mobile # 修改品牌色后重新生成手机图标
```

浏览器测试默认使用本机 Chrome；也可以安装 Playwright Chromium 后以 `E2E_CHANNEL=chromium pnpm test:e2e` 运行。测试自动启动五端，已有同端口服务则复用。

桌面产物位于 `apps/public/dist`、`apps/ops/dist`、`apps/admin/dist`、`apps/staff/dist`，手机产物位于 `apps/mobile/dist/build/h5`。各目录可独立使用静态服务器预览；请通过 HTTP 打开。本次没有部署网站、发布 App 或连接线上系统。

## 修改入口

- [社区沙盘布局与组件](docs/云栖雅苑沙盘布局与组件.md)：四类住宅、公共设施定点、组件接口及验收截图。

- [模板替换指南](docs/模板替换指南.md)：品牌、导航、指标、页面、Mock、沙盘替换。
- [安卓衔接说明](docs/安卓衔接说明.md)：H5 与未来原生构建边界。
- [组件来源与交互基线](docs/组件来源与交互基线.md)：保留的组件与验证办法。
- [验收记录](docs/验收记录.md)：实测结果与范围。

`scenario/config.ts` 集中保存场景内容；`packages/domain` 是无网络依赖的数据和规则；`packages/experience` 是桌面页面及交互；`apps/mobile` 保留独立 uni-app 工具链。每个项目自带所有工作区包，可单独复制出去安装运行。

## 5401 运行监控

5401 默认使用暖棕暗色主题，顶部指标和两侧只读监控围绕下方中央沙盘；完整工单、设备及安防管理通过右上角“管理中心”进入 5404。旧业务 hash 自动回到总览。字体、图表和沙盘准备完毕后，信息面板依次入场，沙盘最后显现；减少动态效果时直接显示。

独立页面与入场状态位于 `packages/experience/src/components/CommunityMonitor.vue`，布局与动效位于同目录的 `community-monitor.css`。沙盘启用 `screenFraming` 保持卷轴横边水平并放大取景，不启用公共端的卷轴展开动画。主题切换不重新播放入场，刷新恢复暗色。

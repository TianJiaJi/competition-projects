# 知行校园

五端校园演示项目，使用 Vue 3、TypeScript、Three.js、ECharts 和 uni-app。教室预约通过本机服务连接学生端与管理员端；其他业务仍使用端内样例。手机端以 H5 为本轮验收目标。

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
| 组件预览 | http://localhost:5505/ | `pnpm dev:ui`（单独启动） |
| 预约审核服务 | http://localhost:5606/health | `pnpm dev:bookings` |

管理后台账号 `admin01 / 123456`；工作人员 `staff01 / 123456`；手机服务 `user01 / 123456`。它们只控制前端演示身份，不提供真实鉴权。

**教室预约流程：**学生端使用 `user01 / 123456` 登录，在“教室预约”选择研讨室或教学教室、日期、时段、人数并填写使用说明，提交后在“我的服务记录”看到“待审核”。管理员端使用 `admin01 / 123456` 登录，进入“教室预约”，点击“刷新申请”查看新申请，打开详情后选择“通过预约”或填写原因并“拒绝申请”。学生端点击“刷新预约状态”查看审核结果与拒绝原因；待审核或已通过的申请可以取消。服务会阻止同一学生重复申请同一时段，以及同一教室时段同时通过两个预约。

预约保存在 `.local/booking-requests.json`，刷新页面后仍可查看；删除此文件会清空本地预约。服务仅供本机 H5 演示，演示账号和接口没有生产级身份认证。其他端内记录刷新后恢复固定样例。单独启动学生端或管理员端时，也要运行 `pnpm dev:bookings`；可用 `BOOKING_PORT` 和前端的 `VITE_BOOKING_API_URL` 调整服务地址。

## 构建和验证

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm assets:mobile # 修改品牌色后重新生成手机图标
```

浏览器测试默认使用本机 Chrome；也可以安装 Playwright Chromium 后以 `E2E_CHANNEL=chromium pnpm test:e2e` 运行。测试自动启动五端和预约服务，已有同端口服务则复用。使用现有预览服务时，以 `E2E_EXTERNAL_SERVERS=1` 配合 `E2E_MOBILE_PORT`、`E2E_STAFF_PORT`、`E2E_ADMIN_PORT` 指向正确工作区。

桌面产物位于 `apps/public/dist`、`apps/ops/dist`、`apps/admin/dist`、`apps/staff/dist`，手机产物位于 `apps/mobile/dist/build/h5`。各目录可独立使用静态服务器预览；请通过 HTTP 打开。预约流程仍需运行本地服务。本次没有部署网站或发布 App。

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

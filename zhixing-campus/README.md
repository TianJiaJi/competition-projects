# 知行校园

五端校园演示项目，使用 Vue 3、TypeScript、Three.js、ECharts 和 uni-app。教室预约与学生请假通过本机服务连接学生端与教师端；管理员只读查看教室预约，其他业务仍使用端内样例。手机端以 H5 为本轮验收目标。

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
| 教师工作台 | http://localhost:5503/ | `pnpm dev:staff` |
| 管理后台 | http://localhost:5504/ | `pnpm dev:admin` |
| 组件预览 | http://localhost:5505/ | `pnpm dev:ui`（单独启动） |
| 预约审核服务 | http://localhost:5606/health | `pnpm dev:bookings` |

管理后台账号 `admin01 / 123456`；教师端（5503）`staff01 / 123456`（陈越，2024级软件工程1班）；学生端 `user01 / 123456`（林悦）。账号使用说明仅在此文档保留，不在 UI 展示“演示账号”提示。它们只控制前端演示身份，不提供真实鉴权。

**教室预约流程：**学生端从“预约”进入，浏览教室位置/容量/设施，选择近 14 天内日期及可申请时段，填写活动名称、用途、人数、联系人电话和选填备注，核对后提交。在“我的服务记录”看到“待审核”。教师端使用 `staff01 / 123456` 登录，进入底栏“审批 → 教室预约”刷新并查看本班申请，选择“通过申请”或填写拒绝原因后“拒绝申请”。学生端刷新记录查看审核结果、教师和拒绝原因；待审核或已通过可取消。教师审批时再次检查占用冲突；管理员端“教室预约”只读。

**学生请假：**学生端首页或“我的”进入“学生请假”，按去向信息、请假信息、抄送人三个分区填写。离校时需填写去向与详细地址；紧急联系人姓名/电话、请假类型/性质、事由和本人手机号为必填。点击“请假时长”，先在月历选择起止日期，再进入三列时、分、秒滚轮菜单（24 小时制），可切换开始/结束时间，自动预览精确到秒的持续时间；确认信息真实有效后提交。教师端底栏“审批 → 学生请假”处理本班申请；“教学”分类内可查看课程表、班级与学生信息。教师演示会话在当前标签页刷新后保留，主动退出才清除。学生端在同一服务记录页查看结果或取消。更多规则见 [教学预约演示规则](docs/教学预约业务规则.md)。

预约保存在 `.local/booking-requests.json`，请假保存在 `.local/leave-requests.json`；刷新页面或重启服务仍可查看。服务仅供本机 H5 演示，演示账号与接口没有生产级身份认证；真实部署需服务端登录鉴权。其他端内记录刷新后恢复固定样例。单独启动学生端、教师端或管理员端时，也要运行 `pnpm dev:bookings`；可用 `BOOKING_PORT` 和前端的 `VITE_BOOKING_API_URL` 调整服务地址。

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

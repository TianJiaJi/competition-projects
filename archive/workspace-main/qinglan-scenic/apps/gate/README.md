# 前线处置终端

青岚山境手机网页，本地完整 Mock 原型。已实现员工登录、公共任务领取、文字完成反馈、OA 申请/查询/撤回、历史筛选及独立演示审批。浅青底、宋体标题、共享静态等高线背景沿用已确认设计。

## 启动与验证

在工作区根目录使用 Node.js 24、pnpm 10：

```sh
pnpm install
pnpm dev:gate                 # http://localhost:5177，strictPort
pnpm typecheck:gate
pnpm build:gate
pnpm test:gate                # 14 个单元测试 + 8 个浏览器场景
pnpm check:gate-api           # 专项契约结构、引用、示例及文档映射
```

浏览器测试默认使用本机 Chrome，并在独立端口 5197 启动当前工作区应用，不复用现有服务器；可通过 `GATE_E2E_PORT` 和 `GATE_E2E_CHANNEL` 调整。H5 构建产物在 `apps/gate/dist`。本应用不需要启动 server 或配置密钥。

| 员工 | 账号 | 演示密码 |
| --- | --- | --- |
| 陈越 | `chen_demo` | `GateDemo123!` |
| 李明 | `li_demo` | `GateDemo123!` |

公开演示账号仅用于本地原型。模拟会话保存于 sessionStorage，12 个真实小时到期，不存密码；退出后重新登录另一账号即可验证负责人权限。

## 演示闭环

1. 待办中打开“镜湖栈道客流拥堵”，点击开始处理。
2. 提 OA，填写原因及需求；可创建多条申请，待审批时不能结案。
3. 开发服务器直接访问 `http://localhost:5177/#/demo`，选择申请并模拟批准/驳回；它不是管理员应用，也不在普通员工导航内。
4. 返回任务查看意见；也可由申请人撤回未决申请。所有待审批结束后，提交文字结果完成任务。
5. 记录中查看归档；账号菜单可恢复本端样例，保留当前会话。

生产构建默认关闭演示审批；仅专用本地演示构建可显式 `VITE_GATE_DEMO_APPROVALS=true pnpm build:gate` 开启。真实系统必须移除 Mock 适配并接入后端鉴权，不能靠隐藏路由保护管理员能力。

## 数据和交付边界

业务键 `qinglan.gate.mock.v1`；会话键 `qinglan.gate.session.v1`。数据与其他端独立，恢复不调用 `localStorage.clear()`。首次创建/重置按当前时间建立样例，后续刷新不随机改变记录。

提交失败保留输入，旧快照冲突需重新加载；草稿仅保留当前页面内存，离开前确认。Web Locks 可用时保护同源标签写入；不支持时退回同步快照比较。没有跨设备事务、离线提交或真实消息推送。

**未实现：** 真实后端、跨端联动、设备控制、转派、地图/照片、部署；管理员端仅有 OA 增补需求文档。真机软键盘、安全区和局域网需实际设备复验。

- [功能需求](docs/前线处置终端功能需求-V1.0.md)
- [接口文档](docs/前线处置终端接口文档-V1.0.md)
- [OpenAPI 3.1 JSON](../../docs/openapi/frontline-api-v1.0.json)
- [管理员 OA 增补需求](../../docs/管理员OA审批增补需求-V1.0.md)
- [验收记录](docs/验收记录-V1.0.md)

目录：`src/core` 类型、校验与规则；`src/mock` 样例；`src/services` 异步存储边界；`src/components` 列表组件；`tests` 单元及浏览器验收；`scripts` 契约生成与校验。

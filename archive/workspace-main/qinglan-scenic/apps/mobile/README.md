# 青岚山境手机游客端

uni-app + Vue 3 + TypeScript，同源编译 H5 与微信小程序。四栏：首页、导览、预约、我的。预约、收藏、聊天室和游览记录保存在当前设备；AI 问答与景区开放状态由服务端管理，文字问答调用 `deepseek-flash`。导览与 AI 使用同一运行内的景区状态，不同运行的数据隔离。

在工作区根目录运行（Node.js 24，pnpm 10）：

```sh
pnpm install
pnpm dev:server
# 另一个终端
pnpm dev:mobile
```

打开 http://127.0.0.1:5176 。独立演示控制为 http://127.0.0.1:5176/#/pages/demo/index ，支持模拟入园、设施状态及重置。预约联系人等数据保存在本机，重置会清除本端记录并建立新的问答上下文。

```sh
pnpm --filter @scenic/mobile assets  # 共享地图或路线变更后重新生成
pnpm build:mobile                  # H5 与微信产物
pnpm typecheck:mobile
pnpm test:mobile
RUN_LIVE_QA=1 pnpm test:mobile      # 显式调用真实模型，需要本地服务配置
```

产物在 `dist/build/h5` 和 `dist/build/mp-weixin`。微信开发者工具导入后者；当前 `touristappid` 仅供本地工程验证。原生模拟器、真机、键盘、安全区和扫码仍需验收。真机不能访问电脑的 `127.0.0.1`；服务目前只监听电脑回环地址，当前不包含局域网部署或合法域名配置。

小程序服务地址可通过 `.env.local` 中 `VITE_API_BASE_URL` 在编译时设置（参考 `.env.example`）；H5 由 Vite 代理 `/api` 至本地 8787。密钥只配置在服务端，不能放进 `VITE_*`。

景点介绍码接受已有点位 ID（如 `lake`）或 `qinglan://poi/lake`，可附 `?runId=当前本地运行标识`；其他链接或旧运行标识会拒绝。H5 摄像头不可用时支持粘贴及直接选择点位。

地图使用共享景区生成的 PNG 与点选层，路线为真实路网的八条模板；距离单位是米，时间包含步行和停留的演示估计。没有路线匹配时需放宽条件。图标许可证见 `THIRD_PARTY_NOTICES.txt`。

验收证据及接口边界见 [本地验收记录](../../docs/手机游客端本地验收记录-V1.0.md)。

视觉、前后端职责、接口与迁移说明见 [视觉统一与问答接口](docs/视觉统一与问答接口.md)。移动端回归使用独立端口 15176 / 18787 和临时数据库，默认开发端口仍为 5176 / 8787。

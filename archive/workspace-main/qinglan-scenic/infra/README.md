# 部署模板

当前快速部署路径改用 Compose：六个前端、一个 Node.js 后端和 PostgreSQL 17 单主库运行在内网 Linux 主机；frpc 与 Compose 网关共享容器网络，通过 SakuraFrp 回连网关 TLS 端口 127.0.0.1:31101。宿主机仅映射回环端口 8080，原 Kubernetes Ingress 的 31101 和下载系统保留。香港 VPS 上的 Caddy 用隧道 HTTPS 回源，六个域名统一指向香港 VPS。生产覆盖文件为 `infra/compose/compose.public.yaml`。

| 目录 | 内容 |
| --- | --- |
| infra/images/ | 六端通用构建、Node 24 后端镜像、静态服务与启动检查 |
| infra/compose/ | 本地联调用的六端、Caddy、单后端与 PG 17 |
| infra/compose/compose.public.yaml | 内网 Linux 主机的 Compose 公网覆盖层，包含 SakuraFrp frpc 和端口 31101 |
| infra/k8s/base/ | 六端、单后端、Ingress、PG 17 StatefulSet 与 TLS 配置 |
| infra/k8s/overlays/intranet/ | 单副本后端、PG PVC、SakuraFrp 客户端与镜像发布标签 |
| infra/edge/hongkong/ | 香港 VPS 标准 Caddy Compose 与站点配置；DNS 记录由用户手动添加，证书由 Caddy 自动申请 |
| infra/edge/standby/ | 早期现有 VPS 入口片段，当前方案不使用 |

发布前核对内网主机磁盘空间和持久卷。数据库、业务、DeepSeek、SakuraFrp 凭据只放在服务器仓库外的权限受限文件中。DNS 记录由用户手动管理；香港 Caddy 监听 80/443，通过标准 ACME 自动申请证书，并使用仓库中的内网 CA 根证书验证隧道回源。

本方案不部署 PG 备库，也不配置长期异地备份。部署前保留一份本地 PG 快照及原始 SQLite 数据；开放写入后新增数据不具备独立灾难恢复保证。

从 [单入口演示部署实施单](../docs/部署单入口演示部署-2026-09-24.md) 和 [极简确认清单](../docs/部署前极简确认清单.md) 开始。敏感凭据和真实登录表不得进入镜像或 Git。

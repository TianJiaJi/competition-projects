# 部署模板

后端已使用 PostgreSQL 17。Compose 提供独立 `migrate` 发布步骤，启动前先迁移 schema、导入并核验数据，再启动业务。K8s 后端仍默认 0 副本，需完成真实环境配置和主备初始化后开放。生产复制与切换未在本次本地联调中部署。

| 目录 | 内容 |
| --- | --- |
| images | 六端通用构建、Node 24 后端基础镜像、静态服务与启动检查 |
| compose | 六端、统一入口、单后端、单 PG 17 的独立联调模板 |
| k8s/base | scenic-demo 六端及后端、Ingress、配置、主库 Service 接口 |
| k8s/overlays/intranet | 内网版本和 PV/PVC 预留，示例路径/节点/容量必须替换 |
| edge/hongkong | 拟购香港 2 核 2G 的独立 HTTPS 入口 |
| edge/standby | 92.5.152.95 既有 edge-caddy 的接入片段 |

正式业务和 PG 主备均留内网；Compose 不承担正式主备；穿透尚未选型。公网主备入口最终指向同一个内网后端。域名为 m、ops、visitor、admin、gate、demo.starhusk.com。

从 [部署操作材料](../docs/部署操作材料-V1.0.md) 开始，配套 [迁移需求](../docs/PG迁移需求-V1.0.md)、[主备需求](../docs/主备同步与切换需求-V1.0.md)、[极简确认清单](../docs/部署前极简确认清单.md) 和 [校验记录](../docs/部署材料校验记录.md)。真实环境文件、密码和私有登录表不得进入镜像或 Git。

Compose 发布顺序：`docker compose up -d postgres` → `docker compose --profile tools run --rm migrate` → 按后端说明导入备份 → `docker compose up -d`。不得对已有业务卷执行清空或演示播种。

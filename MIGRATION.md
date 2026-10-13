# 代码迁移与版本归档

本仓库以一个 `main` 分支保存从 `qmgcbcAiden/qinglan-scenic-workspace` 各活跃分支导出的**末端快照**；没有把互不兼容的改动强行合并，也没有保留原仓库的提交历史。归档目录只用于查阅或后续人工整合，不参与根目录项目的构建。

| 新仓库路径 | 来源分支及提交 | 内容 |
| --- | --- | --- |
| 根目录 | `upstream/codex/qinglan-experience-workflows` · `128569f` | 现用工作区：青岚山境、知行校园（预约审核版）、云栖雅苑及前端模板；测试工作台在 `qinglan-scenic/apps/testing/` |
| `archive/workspace-main/` | `upstream/main` · `a38d32c` | 主线完整快照：含校园演示工作流、素材及省赛文档；与根目录的预约审核版并行，不可直接互相覆盖 |
| `archive/legacy-admin/admin-console/` | `upstream/codex/admin-console` · `d2957aa` | 青岚山境根目录形态的后台分支快照 |
| `archive/legacy-admin/admin-integration/` | `upstream/codex/admin-integration` · `9fc3989` | 青岚山境根目录形态的后台集成分支快照 |
| `archive/legacy-admin/admin-preview-archive/` | `upstream/codex/admin-preview-archive` · `b09109f` | 青岚山境根目录形态的后台预览归档分支快照 |
| `archive/legacy-admin/admin-dashboard/` | `upstream/feature/admin-dashboard` · `7100635` | 青岚山境根目录形态的后台大屏分支快照 |

原仓库工作树中未提交的 `qinglan-scenic/scripts/dev-all.mjs` 改动**未纳入**；原仓库保持原状。`origin` fork 上的 `main` 与 `codex/admin-console` 没有 `upstream` 所缺少的提交。已有的本地 `standalone/testing-workbench` 分支仅是上述测试工作台目录的单提交副本，因此不额外重复归档。

启动项目时在对应项目目录内执行 `pnpm install`；不要在 `archive/` 根目录安装依赖。各项目使用方法见各自 `README.md`。

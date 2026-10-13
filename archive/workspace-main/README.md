# 智慧场景前端工作区

青岚山境完整保留，云栖雅苑与知行校园各自拥有五端纯前端。三个项目互不依赖，模板可单独复制到其他目录使用。

| 目录 | 内容 |
| --- | --- |
| [qinglan-scenic](qinglan-scenic/README.md) | 青岚山境六端、后端、文档、素材、测试和部署材料，保持原在线运行方式 |
| [frontend-template](frontend-template/README.md) | 可复制模板；页面直接使用云栖雅苑品牌，包含五端及组件预览 |
| [yunqi-community](yunqi-community/README.md) | 云栖雅苑，暖米白与陶棕，居民服务和物业运行 |
| [zhixing-campus](zhixing-campus/README.md) | 知行校园，浅蓝白与靛蓝，大学／高职师生服务和后勤运行 |

## 启动新前端

在所选项目目录运行，不需要后端或数据库：

```sh
cd yunqi-community # 或 zhixing-campus / frontend-template
pnpm install --frozen-lockfile
pnpm dev
```

| 终端 | 云栖雅苑 | 知行校园 |
| --- | --- | --- |
| 公共大屏 | [5400](http://localhost:5400/) | [5500](http://localhost:5500/) |
| 管理大屏 | [5401](http://localhost:5401/) | [5501](http://localhost:5501/) |
| 手机服务 | [5402](http://localhost:5402/) | [5502](http://localhost:5502/) |
| 工作人员 | [5403](http://localhost:5403/) | [5503](http://localhost:5503/) |
| 管理后台 | [5404](http://localhost:5404/) | [5504](http://localhost:5504/) |

模板使用 5300–5304。组件预览需在对应项目运行 `pnpm dev:ui`，使用 5305 / 5405 / 5505。

账号：后台 `admin01`，工作人员 `staff01`，手机服务 `user01`；密码均为 `123456`。操作保留于当前端内存，刷新恢复样例，各端独立。AI 助手使用预设回答；沙盘保留原模型浏览，后续从统一组件入口更换模型。

手机端使用 uni-app，本轮交付 H5，提供后续安卓打包衔接说明，没有实际打包或发布 App。两套新项目没有演示控制端。

## 文档与验证

- [模板替换指南](frontend-template/docs/模板替换指南.md)
- [安卓衔接说明](frontend-template/docs/安卓衔接说明.md)
- [模板验收](frontend-template/docs/验收记录.md)、[小区验收](yunqi-community/docs/验收记录.md)、[校园验收](zhixing-campus/docs/验收记录.md)
- [青岚山境目录迁移记录](qinglan-scenic/docs/目录迁移记录-2026-09-25.md)

青岚山境整理单独提交为 `5438b2d`，包含原有待提交部署和文档成果。原命令先 `cd qinglan-scenic` 后执行；后续模板开发没有修改原景区。

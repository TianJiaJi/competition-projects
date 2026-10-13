# 素材使用与维护

本地目录：`packages/demo/assets/material-pack/`；同结构压缩包：`packages/demo/assets/material-pack.zip`。工作台右上角“下载素材”也提供该 ZIP。解压后按下表选择对应文件；M02 是输出参考，不需要作为输入。

| 输入节点 | 文件夹 | 文件 |
| --- | --- | --- |
| 图片地图 | 01-图片地图 | M01.png |
| 设施坐标与地形 | 02-设施坐标 | M03.json |
| 沙盘参考模板 | 03-沙盘参考 | sandbox-reference.json、R01-campus.png |
| 页面模板 | 04-页面模板 | public-pages.html、ops-pages.html、mobile-pages.html、staff-pages.html、admin-pages.html |
| 公共组件 | 05-公共组件 | navigation-layout.html、glass-metrics.html、records-forms.html、contour-background.html |
| 表结构与 SQL 模板 | 06-SQL模板 | schema-and-queries.sql、initial-records.json |
| 服务处理模板 | 07-服务模板 | service-contract.json |
| 输出参考 | 产物参考 | M02.svg |

点击整个导入框，多选文件；也可一次拖入多份。后续选择会追加，相同文件元信息不重复登记。每行 × 移除对应文件。快捷“载入参考素材”会以本表完整清单替换当前节点清单。取消系统选择窗口不改变原清单。服务确认前显示排队/提交状态；失败显示原因，点击“重试提交”。

文件只保存元信息，不保存正文；现场展示方案由样例包提供，不从任意导入内容生成项目。HTML 是通用页面/组件源码片段，包含导航、列表、详情、表单、字段和操作位置，不要求双击运行。五端适配在后续节点展示。自由输入需求和调整保留原文。

修改真实源文件后执行：

```sh
pnpm demo:assets     # 同一模型来源重新生成 PNG / SVG / 坐标，并更新素材包
pnpm demo:materials  # 只更新页面/组件模板、SQL、种子、服务契约、清单和 ZIP
```

唯一素材目录定义在 `src/samples/school/materials.ts`。生成器 `scripts/demo-materials.mjs` 遍历它写磁盘、manifest.json 和 ZIP；工作流输入节点从同一清单得到参考材料；服务加载实际文件大小并通过白名单下载。增加文件必须同时提供内容来源，生成器缺源时失败，不接受虚构文件名。生成器需要 Python 3 标准库来写 ZIP，交付后的开发/静态启动和文件导入不依赖 Python。

地图几何来自 `packages/model/src/campus/layout.ts`，M01 与 M02 同源；R01 为沙盘参考图。SQL 使用运行时 schema、relationQuery、insertSql，初始化数据来自已匿名化的 schoolScenario().seed；服务契约与服务共享账号定义和操作枚举。变更以上来源后需要重新生成，接口测试检查生成物与代码一致。

API：`POST /api/runs/:run/node`，`action:"import"`，`mode:"append"|"replace"|"reference"|"remove"`。append/replace 传 `files:[{name,size,type,lastModified}]`，remove 传 `fileId`；reference 不接受调用者自定义参考列表。旧 `file` 请求保持替换语义，旧 `file` 记录升级为一个元素的 `files`，无需复位。重复集合不增加修订或触发下游失效。移除最后一份返回待输入，历史、需求与数据库仍在。

本轮系统选择器验证需分开记录：

| 环境 | 记录要求 |
| --- | --- |
| 浏览器 filechooser 回调/自动化 | 验证点击区域、multiple、多文件登记和清单反馈；不能代替系统窗口实测 |
| macOS 原生打开窗口 | 记录系统/浏览器、所选文件、确认后的清单及刷新恢复 |
| Windows 原生选择器 | 使用 Windows 设备实测；Mac 测试不能替代 |

2026-10-12：浏览器自动化批量选择、拖放、取消、去重、移除、替换及刷新恢复通过。Mac 原生窗口控制出现超时，本次原生 Open 验证未完成；Windows 原生选择器未实测，两者均不能填写“本次原生窗口通过”。

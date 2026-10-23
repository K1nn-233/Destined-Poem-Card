# 源码与运行边界

`card/` 描述导入卡元数据；`card/greetings/index.json` 按顺序引用同目录的三条开场白；`card/scripts/index.json` 定义七个有序脚本；`card/regex/index.json` 定义十条有序正则，独立替换模板在 `card/regex/views/`。`worldbook/命定之诗.yaml` 保留 tavern_sync 格式，是世界书条目配置入口。`content/manifest.json` 关联可编辑数据与运行时资源名，数据分别放在 `content/catalogs/`、`content/ui/`；地点与路线源数据在 `content/geography/`。

`card/module-map.json` 维护模块源码、消费者、生成物和资料的关系，供 `card map` 查询；`card/baseline.json` 记录 V4.3.3 发布卡的结构与内容哈希摘要，供 `card diff` 对照。

`packages/game/src/schema/` 是唯一状态定义来源。前端 Schema 注册脚本和自动化消费同一份定义；不要在页面内另写完整 Schema。`packages/game/src/rules/` 提供共享基础资源计算；当前值、额外上限、填满与夹紧等运行策略仍由调用方负责。

前端 `dump_schema.ts` 从共享 Schema 生成 `packages/frontend/.cache/schema.json`，构建时复制到 `dist/<profile>/frontend/data_schema/schema.json`。不维护手写的 Schema 导出。

前端分成 `src/apps/home`、`custom-start`、`status` 三个入口；脚本在 `src/scripts/`，资源 URL 和 JSON5 请求在 `src/shared/`。各应用的 services、store 处理宿主接入；地图读写集中在状态栏的 `core/services/map-state.ts`。跨页面业务规则应复用 game 包；酒馆 API 调用需要保留宿主生命周期、目标聊天与变量作用域。

协议与其它自有内容一起从当前 profile 的资源根加载，源文件为 `content/ui/agreement.json`；协议正文、版本确认及存储键保留。

自动化的运行协调、外部能力与提示词分别位于 `src/runtime/`、`src/services/`、`src/prompts/`。修改状态写入时检查 Schema、世界书提示词、前端显示和自动化是否一致；不要仅通过改变显示值掩盖状态错误。

`build/` 存放构建配置，`tools/` 提供统一命令。`tools/geography.mjs` 由卡片构建调用，从 `content/geography/` 原始地点和路线生成 profile 内地理资源；见 [地理流程](geography.md)。构建产物位于 `dist/local/` 或 `dist/release/`，角色卡文件名为 `命定之诗与黄昏之歌.json`。

`tools/geography/scripts/` 和 `editors/` 分别提供地理维护脚本和编辑器。`tools/sync/` 提供同步服务与酒馆桥接，`tools/workbench/` 是双击启动的工作台（接口 `api.mjs`、免编译的 Vue 界面 `ui/`），见 [推送到酒馆](sync.md)。

旧前端的数据维护说明保留在 [archive/frontend-data-guide.md](archive/frontend-data-guide.md)，其中旧目录和 CDN 策略已不适用，现行路径以本仓源码为准。合并前的来源见 [来源](sources.md)。

普通浏览器、酒馆 iframe、酒馆助手脚本和 EJS 提示词具有不同执行环境。编译成功只证明产物生成；宿主 API、开场白替换、脚本次序及模型变量更新需要分别验证。

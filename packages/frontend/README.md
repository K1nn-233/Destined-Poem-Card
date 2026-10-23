# 前端：命定之诗与黄昏之歌

原作者：yoyo514、Hilo。前端沿用 [酒馆助手编写模板](https://github.com/StageDog/tavern_helper_template) 并包含项目定制。许可见仓库根目录 [LICENSE](../../LICENSE)；历史模板说明随本机退役资料保存在 `imports/legacy/frontend-template-docs.md`，不作为当前构建规范。

当前作为统一工作区的 package 使用，环境和安装入口见 [根 README](../../README.md)。在仓库根目录运行 `pnpm setup:workspace`、`pnpm card build` 和 `pnpm dev`，不在此目录单独安装另一套依赖。

| 内容 | 入口 |
| --- | --- |
| 首页 | `src/apps/home/` |
| 自定义开局 | `src/apps/custom-start/` |
| 状态栏 | `src/apps/status/` |
| Schema 注册、图片预载入 | `src/scripts/` |
| 资源 URL 与 JSON5 请求 | `src/shared/` |
| 酒馆宿主接入 | 各应用的 services/store；地图读写为 `status/core/services/map-state.ts` |
| 可编辑目录数据 | 根目录 `content/catalogs/`、`content/ui/` |

数据由根目录 `content/manifest.json` 映射到构建资源，保留 JSON5 写法。旧数据指南在 [归档说明](../../docs/archive/frontend-data-guide.md)，其中旧目录和 CDN 策略不作为当前规范。

Schema 唯一来源为 `packages/game/`。`dump_schema.ts` 生成本包 `.cache/schema.json`，卡片构建复制到 `dist/<profile>/frontend/data_schema/schema.json`；不要修改旧脚本目录下的 Schema 导出。共享基础资源公式同样由 game 包提供。

本包中间产物在 `dist/`，统一角色卡及发布资源以根目录 `dist/local/`、`dist/release/` 为准。新版本从本仓库发布，不再使用旧前端仓库的 CDN。

`pnpm dev` 提供本机静态资源；宿主 API、iframe、变量与事件交互需在独立测试酒馆验证。状态栏地图中 character 级标记和 chat 级地理图谱的区别见 [地理流程](../../docs/geography.md)。特殊机制说明保留在 [game-mechanics.md](docs/game-mechanics.md)，改动状态定义时以当前共享源码为准。

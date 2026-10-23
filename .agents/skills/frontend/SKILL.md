---
name: frontend
description: 修改命定之诗首页、自定义开局、状态栏、Schema 注册或图片预载入时使用，处理 packages/frontend 与共享数据的集成。
---

页面入口位于 `packages/frontend/src/apps/{home,custom-start,status}`，注册与预载入脚本位于 `src/scripts/`，资源 URL 与 JSON5 请求在 `src/shared/`，宿主读写由应用的 services/store 负责。先确定具体入口及数据流，沿用所在页面的技术栈。

内容数据在根目录 `content/catalogs/` 和 `content/ui/`；即使扩展名为 `.json`，也可能是 JSON5。新增运行时资源核对 `content/manifest.json`。状态定义与资源公式从 `packages/game/` 引入，不在组件中复制。

宿主 API 先用 `pnpm refs search <关键词> --source tavern-helper` 查锁定声明，按需读 [架构](../../../docs/architecture.md) 与 [知识源](../../../docs/references.md)。开场白触发源在 `card/greetings/`，正则装配在 `card/regex/index.json` 与 `views/`。地图问题还需读 [地理流程](../../../docs/geography.md)。

用 `pnpm dev` 提供 `127.0.0.1:5173` 资源与工作台，并检查对应入口；同步测试流程见 [同步说明](../../../docs/sync.md)。普通浏览器只能覆盖不依赖宿主的部分；酒馆 iframe、变量和事件交互需单独验证。运行相关构建检查，不把浏览器静态预览写成酒馆内已验收。

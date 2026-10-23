---
name: automation
description: 修改命定之诗自动化的运行流程、状态更新、宿主服务或模型提示词时使用，定位 packages/automation 内的实际触发链。
---

入口是 `packages/automation/src/index.ts`；按问题读取 `runtime/`、`services/`、`prompts/` 和具体实现。先确定触发事件、输入快照、目标聊天与写入位置，再改行为。

状态定义和共用公式从 `packages/game/` 复用。异步宿主或模型调用前固定目标身份，写回前核对当前目标；不要用吞异常或默认成功掩盖失败。

查宿主和 MVU API 用 `pnpm refs search <关键词> --source tavern-helper` 或 `--source mvu`；提示词 EJS 用 `--source prompt-template`。资料位置见 [知识源](../../../docs/references.md)。

检查涉及的世界书提示词、前端读法和 `card/scripts/index.json` 的脚本装配顺序。运行包内相关检查与 `pnpm verify`，说明真实触发、状态持久化及模型生成哪些实际执行过。推送到测试酒馆的流程见 [推送到酒馆](../../../docs/sync.md)。

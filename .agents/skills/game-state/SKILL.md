---
name: game-state
description: 修改游戏状态字段、MVU Schema、等级属性或共用资源公式时使用，协调前端、自动化与世界书的同一状态契约。
---

唯一 Schema 位于 `packages/game/src/schema/`，共享公式位于 `packages/game/src/rules/`。先检查字段的生产方、写入方和显示方，再修改定义；不要在前端或自动化中复制完整 Schema 或公式。

基础资源公式与额外上限、填满、夹紧属于不同职责。修改时明确哪一层负责当前行为，保留既有取整和等级档位语义，避免前端显示与实际写入不同。

查 MVU 接口用 `pnpm refs search <关键词> --source mvu`；Schema 注册帮助用 `--source tavern-resource`，酒馆变量作用域用 `--source tavern-helper`。按需参考 [知识源](../../../docs/references.md) 和 [架构](../../../docs/architecture.md)。

检查 `card/scripts/index.json` 的注册顺序、`packages/frontend/src/scripts/`、状态栏、自定义开局、自动化和世界书提示词的字段约定；运行受影响的检查及 `pnpm verify`。不默认添加旧存档迁移或静默兼容，确有需求再设计。静态类型通过不等于 MVU 在酒馆内已更新成功。

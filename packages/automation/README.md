# 命定之诗自动化脚本

本地工作区包 `@destiny/automation`，从仓库根目录运行：

```sh
pnpm --filter @destiny/automation build
pnpm --filter @destiny/automation test --runInBand
pnpm --filter @destiny/automation typecheck
```

依赖由根工作区统一安装、锁定。Vite 配置位于 `build/automation/vite.config.ts`，产物写入本包 `dist/index.js`，供角色卡构建复制。

`src/index.ts` 只启动脚本。`runtime/start` 等待 MVU 初始化完成再订阅事件；`runtime/update` 依次准备内部 date / 校验 schema、清理提示、维护角色、处理玩家经验、处理 NPC 经验、计算资源、处理事件、记录日志、删除结束事件缓存。服务直接更新事件传入的数据，各阶段的 date 通过 `runtime/host` 写入同一个已捕获楼层，供后续处理和 MVU 最终写回读取。

`runtime/command-policy` 保留规范化 MVU 命令的精确路径策略。`prompts/` 只生成提示内容，`runtime/prompts` 读取 `message_id: -2`，注入后在 `message_id: -1` 消费升级提示，明确保留原有宿主策略。

stat_data schema 与基础资源规则使用 `@destiny/game/schema`、`@destiny/game/rules`；内部 date 类型仍由本包维护。运行时继续使用宿主的 `z` 和 `_`，共享包打入产物；仅 `klona` 使用固定版本 `2.0.6` 的 CDN import。

Jest 覆盖业务规则、MVU 等待、处理顺序、阶段写入、楼层目标、提示消费及命令过滤。自动化测试不代表已在酒馆中完成端到端运行验证。

许可见仓库根目录 [LICENSE](../../LICENSE)。

# 来源

本仓库由原来的三个仓库合并而成：世界书（Worldbook-for-destined-journey）、前端（FrontEnd-for-destined-journey）和自动化脚本（Automated-script-for-destined-journey）。合并时各仓库所在的提交记录在 [migration-sources.json](migration-sources.json)。合并前的提交历史留在原仓库里，本仓库的历史从合并后开始。`IndependentFront` 不属于本产品。

V4.3.3 及更早的发布卡，从原仓库的固定标签加载界面和脚本（例如 `FrontEnd-for-destined-journey@1.9.32`、`Automated-script-for-destined-journey@3.4.6`）。这些链接不随本仓库改写；原仓库应归档保留，不要删除，否则已发布的旧卡会失效。

合并时做过的整理：

- 世界书仍是 tavern_sync YAML 加条目文件的结构；旧的 Markdown 全览不再维护，用 `pnpm card map` 和实际目录查找。
- 删除了世界书的待审核内容、`worldbook/misc/`、旧 CSS 目录和两个废弃开场。
- 三条开场迁到 `card/greetings/`，地理数据迁到 `content/geography/`，地理工具迁到 `tools/geography/`。
- 旧 Schema 和地理导出不再作为构建输入，现在由构建生成到 `dist/<profile>/`。
- 旧前端的数据维护说明保留在 [archive/frontend-data-guide.md](archive/frontend-data-guide.md)，其中的旧路径和 CDN 策略已不适用。

宿主相关资料（SillyTavern、酒馆助手、EJS、MVU、tavern_sync 等）锁定在具体版本，用 `pnpm refs restore/search/check/outdated/refresh/update` 管理，见 [知识源](references.md)。锁定资料说明的是目标接口，实际运行结果仍要在酒馆里验证。

仓库内容按根目录 [LICENSE](../LICENSE) 授权；MVU 等外部依赖遵循各自许可，版本记录在 `release.json` 与锁文件中。

开发组成员本机的 `imports/` 目录（不进 Git）里放着原仓库副本、Git bundle 和 4.3.3 发布卡原件，只用于追溯。

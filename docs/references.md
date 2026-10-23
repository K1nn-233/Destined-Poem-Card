# 锁定参考资料

参考源配置为 `maintenance/reference-sources.json`，锁文件为 `maintenance/references.lock.json`，检索索引为 `references/index.json`。缓存位于 `references/upstream/<source-id>/<原仓库路径>`；它们是宿主资料，不替代本项目源码。

```sh
pnpm refs restore
pnpm refs check
pnpm refs search getVariables --source tavern-helper
pnpm refs search regex --source sillytavern --limit 10 --context 2
pnpm refs outdated
pnpm refs outdated --source tavern-helper --report .cache/reference-update-report.md
pnpm refs refresh --report maintenance/reference-update-report.md
```

`restore` 按锁定提交和文件哈希恢复缓存，不升级、不改锁文件；`check` 核对资料状态。检索结果带文件、行号及上下文，可用 `--source`、`--limit`、`--context` 缩小范围。

`outdated` 只读取配置与锁文件，查询每个来源的 `updatePolicy.trackingRef`（`@default` 表示上游仓库默认分支），按配置的文件范围检查增删改，返回完整提交、比较链接和逐文件变更清单。它不会更改资料缓存、配置和锁。`--report` 可另外写出项目内 Markdown 报告；报告不含检查时间，没有所选文件变化时也不记录无关上游提交，避免每周只有时间戳变化。任意来源请求失败、必需文件消失、目录树截断或内容校验失败，整个命令返回非零，错误带具体 source id，不能当成“没有更新”。

每个来源的更新策略区分两类：

| 策略              | 当前来源                                                   | 更新边界                                                                                                             |
| ----------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `host-bound`      | SillyTavern、酒馆助手及配套文档、EJS、MVU、tavern_resource | 跟踪上游变化以便审查；`refresh` 保留当前 `pinCommit`、宿主版本和缓存。新版默认分支资料不代表当前云宿主支持这些接口。 |
| `follow-upstream` | tavern_sync 工具 schema/type、角色卡 v2/v3 规范            | `refresh` 可更新这几项资料的固定提交；不会修改本地同步程序、实际卡依赖或卡片格式。                                   |

`refresh` 先完成所有选中来源的检查，再仅为 `follow-upstream` 且所选文件有变化的来源准备新配置与锁记录。检查与落地复用同一批下载字节，避免分支在两次请求间移动；沿用 `update` 的文件数、大小、必需文件和内容校验。缓存、配置、锁与索引一起切换，最终 `check` 或校验回调失败时一起回滚。若系统阻止回滚，报错说明备份目录并保留旧缓存；不要删除它后再排查。

宿主升级需要明确的版本任务：确认目标宿主版本及其对应提交后，有意修改该来源的 `pinCommit`/`ref`，运行 `pnpm refs update --source <id>`，检查锁差异并验证受影响接口。现有 `update` 仍是显式按配置更新，不绕过 `pinCommit`；不得为了“更新资料”把 SillyTavern 版本 tag 改为 main。普通检索和 `restore` 不升级资料。没有配置策略的测试或旧来源默认按 `host-bound` 处理。

## 每周 Git 审查

`.github/workflows/reference-update.yml` 每周一 02:23 UTC（北京时间 10:23）检查，也可在默认分支手动运行。手动关闭 `refresh` 时只生成 Summary 和 artifact；默认会在恢复锁定资料后执行 `refresh`，运行完整 `pnpm verify`，然后把配置、锁和 `maintenance/reference-update-report.md` 提交到专用分支 `bot/reference-update`，创建或更新同一个草稿 PR。宿主资料的新变化也会进入报告供审查，但不解除宿主版本锁。所选文件无变化时不新建 PR；相同候选报告和配置不会因为本次下载时间不同而重复提交。

专用分支由工作流维护，每次基于最新默认分支重新构造候选，通过明确的 `--force-with-lease` 更新；不要在此分支手工提交修改。PR 不自动合并。报告提供逐来源的状态、完整提交、上游 compare 链接与文件增删改；具体内容可沿链接审查，合并前按目标宿主验证。所用 token 创建的 PR 不保证触发其他工作流，因此本流程在推送前直接执行完整验证。

工作流需要仓库启用 Actions，并允许 `GITHUB_TOKEN` 创建 PR（Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests）。权限或网络失败会明确使运行失败；Summary、JSON 和验证日志作为 artifact 留存。当前交付仅新增本地工作流，没有创建远端、推送或实际 PR；定时任务需文件进入已启用 Actions 的远端默认分支后才会运行。

工作流使用与现有验证流程一致的官方 Actions v7。实现依据：[GitHub commits API](https://docs.github.com/en/rest/commits/commits)、[checkout](https://github.com/actions/checkout)、[upload-artifact](https://github.com/actions/upload-artifact)、[gh pr create](https://cli.github.com/manual/gh_pr_create)、[gh pr edit](https://cli.github.com/manual/gh_pr_edit)。

| source id                                       | 适用问题与重点路径                                                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sillytavern`                                   | 宏、slash command、世界书、正则；`public/scripts/macros/definitions`、`macros.js`、`slash-commands.js`、`world-info.js`、`extensions/regex/engine.js` |
| `sillytavern-docs`                              | SillyTavern 使用语义与配置解释                                                                                                                        |
| `tavern-helper`                                 | 酒馆助手 API；`@types/function`、`@types/iframe`                                                                                                      |
| `tavern-helper-docs`                            | 酒馆助手用法说明                                                                                                                                      |
| `prompt-template`                               | EJS；`docs/reference_cn.md`、`include/reference_cn.js`                                                                                                |
| `mvu`                                           | MVU；`global.d.ts`、`src/function`、`src/prompts`                                                                                                     |
| `tavern-resource`                               | Schema 注册帮助；`util/mvu_zod.ts`                                                                                                                    |
| `tavern-sync`                                   | tavern_sync 格式；`dist/schema/*.json`、`dist/type/*.ts`                                                                                              |
| `character-card-spec`、`character-card-spec-v3` | 卡片字段与扩展格式                                                                                                                                    |

先用 query 和 `--source` 缩小范围，再读命中资料。资料版本与锁定的宿主版本见 [角色卡契约](contracts.md)；实际调用行为仍以目标宿主验证为准。

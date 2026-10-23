# 世界书：命定之诗与黄昏之歌

这里是统一工作区中的世界书源码，保留 tavern_sync YAML 与条目文件格式。项目入口见 [根 README](../README.md)。

`命定之诗.yaml` 定义条目的激活条件、插入位置、顺序和文件引用；`命定之诗/` 保存正文。新增或修改条目时同时检查配置与正文，不手动维护全量 Markdown 索引。

从仓库根目录查询和构建：

```sh
pnpm card map 雾晶港
pnpm card check
pnpm card build
```

本目录只保存世界书清单和正文。三条开场白与顺序定义在 `card/greetings/`；地理原始数据在 `content/geography/`，生成脚本和本地编辑器在 `tools/geography/`，统一构建入口和作用域见 [地理流程](../docs/geography.md)。游戏状态定义以 `packages/game/` 为准。tavern_sync 与 EJS 参考资料见 [锁定参考资料](../docs/references.md)。

合并前的来源见 [来源说明](../docs/sources.md)。许可见仓库根目录 [LICENSE](../LICENSE)。

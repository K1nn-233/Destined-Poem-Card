# 地理工具

人工维护的数据在 `content/geography/places.yaml` 与 `content/geography/edges.yaml`，独立标记副本为 `content/geography/marker0502_wsrv.txt`。地点 `parent` 表达包含关系，路线 `from/to` 表达通行关系；地点内嵌 `marker` 提供默认地图标记。

从仓库根目录运行 `pnpm card build`，统一通过 `tools/geography.mjs` 调用 `scripts/` 中的 Python，生成 `dist/<profile>/geography/` 中的 compact、loader、默认标记和 manifest。版本来自 compact 内容 SHA。脚本单独运行时也默认读取 `content/geography/` 并写入 `dist/local/geography/`，不在源码目录生成产物。

运行时地理图谱变量 `runtime_geo_compact_data` 是 **chat** 作用域；状态栏地图 `map_markers` 和 `map_drawings` 是 **character** 作用域。详细数据流、产物和验证方式统一见 [地理流程](../../docs/geography.md)，底层工具见 [scripts/README.md](scripts/README.md)。

`editors/place-tree-editor.html`、`editors/viewer0911.html` 是本地辅助页面，默认从 `../../../content/geography/` 读取源码；应由以工作区为根的静态服务打开，也支持手动导入和导出文件。编辑结果需导出并写回对应源码后再构建。页面预览不证明酒馆运行成功。历史数据和导出随原仓与退役资料保留，见 [来源说明](../../docs/sources.md)。

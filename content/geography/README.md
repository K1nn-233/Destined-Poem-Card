# 地理数据

`places.yaml` 与 `edges.yaml` 是地理图谱的权威输入；地点内嵌 `marker` 是默认地图标记的来源。`marker0502_wsrv.txt` 保留原有独立标记格式，使用 `python tools/geography/scripts/sync_markers.py` 检查一致性，确需同步时加 `--write`。

从仓库根目录运行 `pnpm card build`，生成 `dist/<profile>/geography/` 中的 compact、聊天图谱 loader 和角色地图默认标记。工具与本地编辑器见 [地理工具](../../tools/geography/README.md)，数据流与变量作用域见 [地理流程](../../docs/geography.md)。

# 地理脚本

常规生成从仓库根目录运行 `pnpm card build`，由 `tools/geography.mjs` 调用底层 Python，并输出到 `dist/<profile>/geography/`。数据来源、变量作用域与完整产物说明见 [地理流程](../../../docs/geography.md)。以下脚本用于审计和定向调试；默认输入位于 `content/geography/`，默认产物位于 `dist/local/geography/`。

| 脚本 | 用途 |
| --- | --- |
| `audit_edges_raw.py` | 只读检查路线结构、端点、重复连接、方向及 marker 粗略一致性 |
| `sync_markers.py` | 检查地点内嵌 marker 与兼容 marker 文件；`--write` 才重写兼容文件 |
| `build_compact.py` | 从原始地点和路线生成 compact；支持 `--source`、`--output` |
| `generate_tavern_loader.py` | 从 compact 生成 chat 作用域 loader；支持 `--compact`、`--output`、`--version` |
| `render_runtime_geo_mermaid.py` | 调试原始数据的 Mermaid 输出，同时为 compact 渲染提供辅助函数 |
| `render_runtime_geo_mermaid_compact.py` | 调试 compact Mermaid 输出，对照世界书中的地理 EJS |

例如在根目录执行：

```sh
python tools/geography/scripts/audit_edges_raw.py --places content/geography/places.yaml --edges content/geography/edges.yaml
python tools/geography/scripts/render_runtime_geo_mermaid_compact.py 雾晶港 --places dist/local/geography/compact/place.yaml --edges dist/local/geography/compact/edges.yaml
```

统一构建会使用内容 SHA 版本并指定 dist 输出路径。loader 的写入目标为 `runtime_geo_compact_data`，作用域是 `chat`；世界书消费者通过 `getLocalVar` 读取。生成文件不代表已有聊天已完成版本更新。

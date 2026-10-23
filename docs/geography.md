# 地理图谱与前端地图

两条链路共享地点原始数据，但变量用途与作用域不同。

| 链路 | 来源与消费者 | 变量作用域 |
| --- | --- | --- |
| 运行时地理图谱 | 原始地点/路线 → compact → 地理 loader → 世界书 EJS | `chat` 的 `runtime_geo_compact_data` |
| 前端地图标记和绘图 | 地点内嵌 marker → 默认标记导入；状态栏地图交互 → 保存/读取 | `character` 的 `map_markers`、`map_drawings` |

## 统一生成入口

人工编辑 `content/geography/places.yaml` 和 `content/geography/edges.yaml`。`Place.parent` 表达包含关系，`Edge.from/to` 表达通行连接；父子关系不等于道路。地点内嵌 `marker` 是默认地图标记的数据源。

在仓库根目录运行 `pnpm card build`。构建调用 `tools/geography.mjs`，生成 `dist/local/geography/`；release profile 对应 `dist/release/geography/`。直接调试地理生成可运行 `node tools/geography.mjs`，输出到 local profile。

| 产物 | 用途 |
| --- | --- |
| `compact/place.yaml`、`compact/edges.yaml` | 精简后的地点、路线数据 |
| `load_compact.js` | 写入聊天地理变量的脚本 |
| `map-markers.json` | 从原始地点内嵌 marker 派生的默认地图标记 |
| `manifest.json` | 内容版本、地点/路线/标记数量及变量作用域 |

版本由 compact 内容 SHA-256 派生为 `sha256:<摘要>`，生成器统一输出 UTF-8/LF，使 Windows 与 Linux 对同一数据生成相同版本。旧地理目录已退出源码入口；历史导出不用于更新角色卡。

loader 用 `getVariables({ type: 'chat' })` 和 `insertOrAssignVariables(..., { type: 'chat' })`；消费者是 `worldbook/命定之诗/额外设定/长途移动与地理参考.yaml`，通过 `getLocalVar('runtime_geo_compact_data', ...)` 读取聊天变量。早期 character 级图谱说明和独立 `runtime_geo_compact.ejs` 路径不适用于当前链路。

loader 在启动和 `tavern_events.CHAT_CHANGED` 时检查当前聊天，补齐新聊天的图谱；监听由助手随脚本 iframe 卸载释放。已有其他版本时保留覆盖询问，同版本不重复写入。重新构建不代表目标聊天已经写入新数据，需分别核对产物与聊天变量。

## 数据审计与调试

从仓库根目录运行以下只读命令；Python 依赖见 `requirements.txt`：

```sh
python tools/geography/scripts/audit_edges_raw.py --places content/geography/places.yaml --edges content/geography/edges.yaml
python tools/geography/scripts/render_runtime_geo_mermaid_compact.py 雾晶港 --places dist/local/geography/compact/place.yaml --edges dist/local/geography/compact/edges.yaml
```

具体底层脚本参数见 [脚本说明](../tools/geography/scripts/README.md)。底层 Python 是统一构建的实现与调试工具，常规更新使用 card build。

## 工作台地图页

日常编辑用工作台的「地图」页（`tools/workbench/ui/map-view.js`、`map-store.js`）。它合并了旧的地点树编辑器和拓扑查看器：地图为主体，左侧是地点树 / 路线 / 问题列表，右侧是中文表单。底图与状态栏同一张（`i.ibb.co` 低清版），首次由工作台下载并缓存在 `.cache/workbench/`。

保存写回 `places.yaml`、`edges.yaml` 和 `marker0502_wsrv.txt`，写法与旧查看器相同（js-yaml，`lineWidth: 120`），未修改时生成的文本与磁盘逐字节一致；服务端沿用原文件换行方式，并在每次写入前备份，可在「修改记录」撤销。`marker0502_wsrv.txt` 现在是地点内嵌 marker 的镜像，保存时按原顺序用内嵌内容覆盖、新标记追加，不再反向合并。页面内检查同时包含旧查看器的规则和 `audit_edges_raw.py` 的路线规则。

旧功能对照：

| 旧工具功能 | 新位置 |
| --- | --- |
| 地点树、展开/收起、筛选（有异常/错误/未挂大陆/叶子/无标记/地理点） | 左侧「地点」页签与筛选框 |
| 新增子节点/同级、提升一级、设为大陆子节点、拖放改上级 | 右侧「层级」区；地点树拖放 |
| 删除（提升子节点 / 删除子树 / 子节点改挂） | 「高级 → 删除这个地点」对话框；同时删除相连路线 |
| 地点全部字段、标记字段（名称/分组/图标/颜色/描述/图片/坐标） | 右侧各区；坐标用地图放置、拖动 |
| 改编号同步引用 | 「高级 → 编号」，同步下级和路线 |
| 撤销 | 顶部撤销 / 重做（Ctrl+Z / Ctrl+Y），保存后仍可撤销 |
| 地图点与路线、颜色模式与图例、筛选（坐标/重要性/地理/上级子树/交通方式）、只看异常、名称、淡化无关 | 地图工具栏与左侧筛选 |
| 编辑模式拖动、新增地点、新建连线、放置坐标、删除坐标、删除连线 | 「移动地点 / 新增地点 / 新建路线」工具；右侧按钮 |
| 路线分段 | 右侧「交通方式与耗时」，可编辑全部分段（旧查看器只能改第一段） |
| 暂存到浏览器 / 清空草稿 | 自动草稿，下次打开提示恢复或丢弃 |
| 导入 / 导出文件、复制 YAML、查看原始对象 | 「更多」菜单；「高级 → 查看原始数据」 |
| 合并 marker、用外部 marker 覆盖、只移除 marker 对象 | 移除：标记文件改为地点的镜像，这些操作会把旧文案写回，已不需要 |

旧编辑器仍保留在 `tools/geography/editors/`，可从「更多」菜单打开；在工作台中打开时保存同样写回工作区。保存后以 `content/geography/` 中的源文件为准，再运行构建。

## 前端地图

状态栏地图入口为 `packages/frontend/src/apps/status/pages/map/MapTab.tsx`。默认标记从本次地理构建派生，玩家保存的标记和手绘线条读取/写入 character 变量，可能被同角色的其他聊天共享。改动该作用域会改变玩家数据的可见范围，应明确需求后处理。

标记的名称、分组、描述和图片组在输入时保存；标记增删、笔画完成和清空也直接保存，未结束笔画在离页时补写。存储服务保存前检查捕获的角色文件名，避免旧页面写入另一张卡；保存失败会显示错误，不以空数据冒充成功。

地点图谱重建不等于覆盖玩家地图标记，地图绘图也不生成地理路线。验证时分别检查图谱提示词输出、默认标记导入和玩家绘图保存。

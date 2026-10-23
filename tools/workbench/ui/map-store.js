// 地图数据层：加载 / 查错 / 撤销 / 浏览器草稿 / 保存。
// 合并自旧的「地点树编辑器」和「拓扑查看器」，规则与它们保持一致。
import { reactive, computed } from "/vendor/vue.js";

const yaml = () => window.jsyaml;
const arr = (v) => (Array.isArray(v) ? v : []);
const clone = (v) => JSON.parse(JSON.stringify(v));
const DRAFT_KEY = "workbench-map-draft-v1";
export const isGeo = (place) => !!place && place.is_geographic !== false;
export const NA_TRANSPORTS = ["不适用", "n/a"];

export const map = reactive({
  loaded: false,
  error: "",
  places: [],
  edges: [],
  markers: [],
  baseline: "", // 上次加载/保存时的数据快照，用来判断有没有未保存修改
  baseHash: "",
  undoStack: [],
  redoStack: [],
  draftOffer: null,
  saving: false,
  version: 0, // 数据变化计数，驱动重新计算
});

function snapshot() {
  return JSON.stringify({ places: map.places, edges: map.edges, markers: map.markers });
}
function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + text.length;
}
export function markerTextToArray(text) {
  const trimmed = String(text || "").trim().replace(/,\s*$/, "");
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed.startsWith("[") ? trimmed : `[${trimmed}]`);
  if (!Array.isArray(parsed)) throw new Error("标记文件必须是 JSON 数组");
  return parsed;
}
function normalizePlaceMarkers(places) {
  for (const place of places) {
    if (!place || typeof place !== "object" || !place.marker || typeof place.marker !== "object") continue;
    if (!place.marker_id && place.marker.id) place.marker_id = place.marker.id;
    if (place.marker_id && place.marker.id !== place.marker_id) place.marker.id = place.marker_id;
  }
}
function apply({ places, edges, markers }) {
  normalizePlaceMarkers(places);
  map.places = places;
  map.edges = edges;
  map.markers = markers;
  map.version++;
}

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} 读取失败（${response.status}）`);
  return response.text();
}
export async function loadFromWorkspace({ keepDraftOffer = true } = {}) {
  map.error = "";
  try {
    const [placesText, edgesText, markerText] = await Promise.all([
      fetchText("/content/geography/places.yaml"),
      fetchText("/content/geography/edges.yaml"),
      fetchText("/content/geography/marker0502_wsrv.txt").catch(() => ""),
    ]);
    apply({
      places: arr(yaml().load(placesText)?.places),
      edges: arr(yaml().load(edgesText)?.edges),
      markers: markerTextToArray(markerText),
    });
    map.baseHash = hashText(placesText + edgesText + markerText);
    map.baseline = snapshot();
    map.undoStack = [];
    map.redoStack = [];
    map.loaded = true;
    if (keepDraftOffer) offerDraft();
  } catch (error) {
    map.error = `地图数据读取失败：${error.message}`;
  }
}

// ---------- 索引 ----------
export const index = computed(() => {
  map.version;
  const placeById = new Map();
  const markerById = new Map();
  const childrenByParent = new Map();
  const edgesByPlace = new Map();
  for (const place of map.places) {
    if (place?.id && !placeById.has(place.id)) placeById.set(place.id, place);
    if (place?.marker?.id) markerById.set(place.marker.id, place.marker);
  }
  for (const marker of map.markers) if (marker?.id && !markerById.has(marker.id)) markerById.set(marker.id, marker);
  for (const place of map.places) {
    const parent = place.parent ?? null;
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(place);
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "zh-Hans-CN"));
  for (const edge of map.edges) {
    if (!edge?.id) continue;
    for (const end of [edge.from, edge.to]) {
      if (!edgesByPlace.has(end)) edgesByPlace.set(end, []);
      edgesByPlace.get(end).push(edge);
    }
  }
  return { placeById, markerById, childrenByParent, edgesByPlace };
});
export const placeName = (id) => index.value.placeById.get(id)?.name || id;
export const children = (id) => arr(index.value.childrenByParent.get(id));
export function markerOf(place) {
  if (!place) return null;
  if (place.marker && typeof place.marker === "object") return place.marker;
  return place.marker_id ? index.value.markerById.get(place.marker_id) ?? null : null;
}
export function coordOf(id) {
  const pos = markerOf(index.value.placeById.get(id))?.position;
  if (!pos || typeof pos.nx !== "number" || typeof pos.ny !== "number") return null;
  return pos;
}
export function descendants(id) {
  const ids = [];
  const visit = (parent) => {
    for (const child of children(parent)) {
      if (ids.includes(child.id)) continue;
      ids.push(child.id);
      visit(child.id);
    }
  };
  visit(id);
  return ids;
}
export function rootInfo(place) {
  if (!place) return { rooted: false, cycle: false, depth: null };
  if (place.id === "continent") return { rooted: true, cycle: false, depth: 0 };
  const seen = new Set([place.id]);
  let current = place;
  let depth = 0;
  while (current && current.parent) {
    depth++;
    if (current.parent === "continent") return { rooted: true, cycle: false, depth };
    if (seen.has(current.parent)) return { rooted: false, cycle: true, depth: null };
    seen.add(current.parent);
    current = index.value.placeById.get(current.parent);
  }
  return { rooted: false, cycle: false, depth: null };
}
export function parentChain(id) {
  const chain = [];
  const seen = new Set();
  let current = index.value.placeById.get(id);
  while (current?.parent && !seen.has(current.parent)) {
    seen.add(current.parent);
    current = index.value.placeById.get(current.parent);
    if (current) chain.unshift(current);
  }
  return chain;
}
export function transports(edge) {
  return arr(edge.segments).map((s) => s?.transport).filter(Boolean);
}
export function transportText(edge) {
  const seen = new Set();
  const parts = [];
  for (const seg of arr(edge.segments)) {
    const t = seg?.transport ? String(seg.transport).trim() : "";
    if (!t || seen.has(t)) continue;
    seen.add(t);
    const days = seg.days !== null && seg.days !== undefined && seg.days !== "" ? Number(seg.days) : null;
    parts.push(Number.isFinite(days) ? `${t} ${days} 天` : t);
  }
  return parts.join(" ＋ ");
}

// ---------- 查错（两个旧工具的规则合并，消息改成白话） ----------
export const ISSUE_TEXT = {
  place_missing_id: "地点缺少编号",
  duplicate_place_id: "地点编号重复",
  missing_name: "地点没有名称",
  self_parent: "上级指向了自己",
  parent_missing: "上级地点不存在",
  parent_cycle: "上级关系绕成了一个圈",
  continent_parent: "「大陆」不应该有上级",
  unrooted: "没有挂到「大陆」下面",
  extra_root: "是一个独立的根节点（应挂到「大陆」下）",
  bad_is_geographic: "「是否地理点」的值不对",
  non_geo_waypoint: "非地理点不应作为路线中继点",
  bad_importance: "重要性应为 1、2 或 3",
  bad_keywords: "关键词格式不对",
  bad_labels: "标签格式不对",
  bad_description: "描述格式不对",
  marker_missing: "找不到对应的地图标记",
  marker_id_mismatch: "标记编号前后不一致",
  marker_coord_missing: "地图标记缺少坐标",
  bad_marker_imageUrls: "标记图片链接格式不对",
  place_without_coord: "没有地图位置",
  container_without_coord: "区域节点没有地图位置（仅提示）",
  shared_marker_id: "同一个地图标记被多个地点使用",
  edge_missing_id: "路线缺少编号",
  duplicate_edge_id: "路线编号重复",
  edge_from_missing: "路线起点不存在",
  edge_to_missing: "路线终点不存在",
  edge_from_non_geographic: "路线起点不是地理点",
  edge_to_non_geographic: "路线终点不是地理点",
  edge_self_loop: "路线起点和终点相同",
  edge_no_segments: "路线没有交通方式",
  segment_no_transport: "某一段缺少交通方式",
  na_days_not_null: "交通方式为「不适用」时天数应留空",
  edge_no_draw_coords: "两端都没有地图位置，无法画线",
  edge_partial_draw_coords: "有一端没有地图位置，无法画线",
  duplicate_endpoint_pair: "同样两个地点之间有多条路线（不同交通方式时属正常）",
  unused_marker: "有地图标记没被任何地点使用",
  duplicate_marker_id: "地图标记编号重复",
  // 以下与 tools/geography/scripts/audit_edges_raw.py 的规则一致
  missing_direction: "某一段没有填方位",
  bad_days: "天数必须是不小于 0 的数字，或留空",
  bad_terrain: "地形里有空白项",
  bad_bidirectional: "「双向通行」的值不对",
  bad_edge_importance: "路线重要性应为整数",
  parent_child_route: "路线连接的是上级和它自己的下级",
  duplicate_route: "和另一条路线的内容完全相同",
  direction_mismatch: "方位和地图上的位置对不上（仅供人工核对）",
};
const COORD_DIRECTIONS = { "西-东": ["x", -1], "东-西": ["x", 1], "北-南": ["y", -1], "南-北": ["y", 1] };
// 按两端在地图上的相对位置给出方位，例如终点在起点东边就是「西-东」。
export function suggestDirection(fromId, toId) {
  const a = coordOf(fromId), b = coordOf(toId);
  if (!a || !b) return "";
  const dx = b.nx - a.nx, dy = b.ny - a.ny;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "西-东" : "东-西";
  return dy >= 0 ? "北-南" : "南-北";
}
const ISSUE_RANK = {
  place_missing_id: 0, duplicate_place_id: 1, parent_missing: 2, parent_cycle: 2, self_parent: 2, continent_parent: 3, bad_is_geographic: 3,
  missing_name: 3, bad_keywords: 3, bad_labels: 3, bad_description: 3, marker_id_mismatch: 3, bad_marker_imageUrls: 3,
  edge_missing_id: 4, duplicate_edge_id: 5, edge_from_missing: 6, edge_to_missing: 7, edge_from_non_geographic: 8, edge_to_non_geographic: 9,
  edge_self_loop: 10, edge_no_segments: 11, segment_no_transport: 12, na_days_not_null: 13, marker_missing: 14, duplicate_marker_id: 15,
  unrooted: 18, extra_root: 19, non_geo_waypoint: 20, shared_marker_id: 21, bad_importance: 22, marker_coord_missing: 23,
  edge_no_draw_coords: 30, edge_partial_draw_coords: 31, duplicate_endpoint_pair: 32, place_without_coord: 40, unused_marker: 80, container_without_coord: 99,
};
export const issues = computed(() => {
  map.version;
  const { placeById, markerById } = index.value;
  const list = [];
  const add = (level, code, type, id, detail = "") => list.push({ level, code, type, id, text: ISSUE_TEXT[code] ?? code, detail });
  const placeCount = new Map();
  const markerUse = new Map();
  for (const place of map.places) placeCount.set(place.id, (placeCount.get(place.id) || 0) + 1);
  for (const place of map.places) {
    if (!place.id) { add("bad", "place_missing_id", "place", "(missing)"); continue; }
    const id = place.id;
    if (!place.name) add("bad", "missing_name", "place", id);
    if (place.parent === id) add("bad", "self_parent", "place", id);
    else if (place.parent !== null && place.parent !== undefined && !placeById.has(place.parent)) add("bad", "parent_missing", "place", id, place.parent);
    const root = rootInfo(place);
    if (root.cycle) add("bad", "parent_cycle", "place", id);
    if (id === "continent" && place.parent != null) add("bad", "continent_parent", "place", id);
    if (id !== "continent" && (place.parent === null || place.parent === undefined)) add("warn", "extra_root", "place", id);
    else if (id !== "continent" && !root.rooted && !root.cycle && placeById.has(place.parent)) add("warn", "unrooted", "place", id);
    if (place.is_geographic !== undefined && typeof place.is_geographic !== "boolean") add("bad", "bad_is_geographic", "place", id);
    if (place.is_geographic === false && place.is_waypoint) add("warn", "non_geo_waypoint", "place", id);
    if (place.importance !== undefined && place.importance !== null && place.importance !== "" && ![1, 2, 3].includes(Number(place.importance))) add("warn", "bad_importance", "place", id, String(place.importance));
    if (place.keywords !== undefined && !Array.isArray(place.keywords)) add("bad", "bad_keywords", "place", id);
    if (place.labels !== undefined && !Array.isArray(place.labels)) add("bad", "bad_labels", "place", id);
    if (place.description !== undefined && (typeof place.description !== "object" || place.description === null)) add("bad", "bad_description", "place", id);
    if (place.marker && typeof place.marker === "object") {
      if (place.marker_id && place.marker.id && place.marker_id !== place.marker.id) add("bad", "marker_id_mismatch", "place", id);
      const pos = place.marker.position;
      if (!pos || typeof pos.nx !== "number" || typeof pos.ny !== "number") add("warn", "marker_coord_missing", "place", id);
      if (place.marker.imageUrls !== undefined && !Array.isArray(place.marker.imageUrls)) add("bad", "bad_marker_imageUrls", "place", id);
    }
    if (place.marker_id) {
      markerUse.set(place.marker_id, (markerUse.get(place.marker_id) || 0) + 1);
      if (!markerById.has(place.marker_id)) add("bad", "marker_missing", "place", id, place.marker_id);
    } else if (id !== "continent" && isGeo(place)) {
      if (!children(id).length) add("warn", "place_without_coord", "place", id);
      else add("info", "container_without_coord", "place", id);
    }
  }
  for (const [id, count] of placeCount) if (id && count > 1) add("bad", "duplicate_place_id", "place", id, `× ${count}`);
  for (const [id, count] of markerUse) if (count > 1) add("warn", "shared_marker_id", "marker", id, `× ${count}`);

  const edgeCount = new Map();
  const pairCount = new Map();
  const routeSignatures = new Map();
  for (const edge of map.edges) {
    if (!edge.id) { add("bad", "edge_missing_id", "edge", "(missing)"); continue; }
    edgeCount.set(edge.id, (edgeCount.get(edge.id) || 0) + 1);
    const from = placeById.get(edge.from);
    const to = placeById.get(edge.to);
    if (!from) add("bad", "edge_from_missing", "edge", edge.id, edge.from);
    if (!to) add("bad", "edge_to_missing", "edge", edge.id, edge.to);
    if (from && !isGeo(from)) add("bad", "edge_from_non_geographic", "edge", edge.id);
    if (to && !isGeo(to)) add("bad", "edge_to_non_geographic", "edge", edge.id);
    if (edge.from === edge.to) add("bad", "edge_self_loop", "edge", edge.id);
    if (typeof edge.bidirectional !== "boolean") add("bad", "bad_bidirectional", "edge", edge.id);
    if (!Number.isInteger(edge.importance)) add("warn", "bad_edge_importance", "edge", edge.id);
    if (from && to && (from.parent === to.id || to.parent === from.id)) add("warn", "parent_child_route", "edge", edge.id);
    if (!Array.isArray(edge.segments) || !edge.segments.length) add("bad", "edge_no_segments", "edge", edge.id);
    else
      edge.segments.forEach((seg, i) => {
        const where = edge.segments.length > 1 ? `第 ${i + 1} 段` : "";
        if (!seg?.transport || !String(seg.transport).trim()) add("bad", "segment_no_transport", "edge", edge.id, where);
        if (seg && NA_TRANSPORTS.includes(seg.transport) && seg.days !== null && seg.days !== undefined) add("bad", "na_days_not_null", "edge", edge.id, where);
        if (seg?.days !== null && seg?.days !== undefined && (typeof seg.days !== "number" || !Number.isFinite(seg.days) || seg.days < 0)) add("bad", "bad_days", "edge", edge.id, where);
        if (!Array.isArray(seg?.terrain) || !seg.terrain.every((t) => typeof t === "string" && t.trim())) add("bad", "bad_terrain", "edge", edge.id, where);
        if (typeof seg?.direction !== "string" || !seg.direction.trim()) add("bad", "missing_direction", "edge", edge.id, where);
        else if (COORD_DIRECTIONS[seg.direction]) {
          const a = coordOf(edge.from), b = coordOf(edge.to);
          const [axis, sign] = COORD_DIRECTIONS[seg.direction];
          const delta = a && b ? (axis === "x" ? b.nx - a.nx : b.ny - a.ny) : 0;
          if (delta * sign > 0.02) add("info", "direction_mismatch", "edge", edge.id, `${where}写的是「${seg.direction}」，建议「${suggestDirection(edge.from, edge.to)}」`);
        }
      });
    if (Array.isArray(edge.segments)) {
      const reverse = edge.bidirectional === true && edge.from > edge.to;
      const segs = edge.segments.filter((s) => s && typeof s === "object").map((s) => {
        let direction = s.direction;
        if (reverse && typeof direction === "string") {
          const parts = direction.split("-");
          if (parts.length === 2 && parts.every((p) => p.trim())) direction = parts.map((p) => p.trim()).reverse().join("-");
        }
        return [s.transport, s.days, s.terrain, direction];
      });
      const signature = JSON.stringify([reverse ? edge.to : edge.from, reverse ? edge.from : edge.to, edge.bidirectional, segs]);
      if (routeSignatures.has(signature)) add("warn", "duplicate_route", "edge", edge.id, `与 ${routeSignatures.get(signature)} 相同`);
      else routeSignatures.set(signature, edge.id);
    }
    const pair = [edge.from, edge.to].sort().join("__");
    pairCount.set(pair, [...(pairCount.get(pair) || []), edge.id]);
    const a = coordOf(edge.from), b = coordOf(edge.to);
    if (!a && !b) add("warn", "edge_no_draw_coords", "edge", edge.id);
    else if (!a || !b) add("warn", "edge_partial_draw_coords", "edge", edge.id);
  }
  for (const [id, count] of edgeCount) if (count > 1) add("bad", "duplicate_edge_id", "edge", id, `× ${count}`);
  for (const ids of pairCount.values()) if (ids.length > 1) for (const id of ids) add("info", "duplicate_endpoint_pair", "edge", id, `共 ${ids.length} 条`);
  const markerCount = new Map();
  for (const marker of map.markers) {
    if (!marker?.id) continue;
    markerCount.set(marker.id, (markerCount.get(marker.id) || 0) + 1);
    if (!markerUse.has(marker.id)) add("warn", "unused_marker", "marker", marker.id, marker.name || "");
  }
  for (const [id, count] of markerCount) if (count > 1) add("bad", "duplicate_marker_id", "marker", id, `× ${count}`);
  const levelRank = { bad: 0, warn: 100, info: 200 };
  return list.sort((x, y) => levelRank[x.level] + (ISSUE_RANK[x.code] ?? 50) - (levelRank[y.level] + (ISSUE_RANK[y.code] ?? 50)) || String(x.id).localeCompare(String(y.id)));
});
export const issuesFor = (type, id) => issues.value.filter((i) => i.type === type && i.id === id);

// ---------- 修改与撤销 ----------
export const dirty = computed(() => {
  map.version;
  return map.loaded && snapshot() !== map.baseline;
});
// 每次修改前调用：记录撤销点；修改后调用 changed() 刷新索引并写草稿。
export function edit(fn) {
  map.undoStack.push(snapshot());
  if (map.undoStack.length > 80) map.undoStack.shift();
  map.redoStack = [];
  const result = fn();
  changed();
  return result;
}
export function changed() {
  map.version++;
  saveDraft();
}
export function undo() {
  const previous = map.undoStack.pop();
  if (!previous) return;
  map.redoStack.push(snapshot());
  apply(JSON.parse(previous));
  saveDraft();
}
export function redo() {
  const next = map.redoStack.pop();
  if (!next) return;
  map.undoStack.push(snapshot());
  apply(JSON.parse(next));
  saveDraft();
}
export function discardChanges() {
  if (!map.baseline) return;
  map.undoStack.push(snapshot());
  apply(JSON.parse(map.baseline));
  clearDraft();
}

// ---------- 浏览器草稿：没保存也不会丢 ----------
let draftTimer;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      if (dirty.value) localStorage.setItem(DRAFT_KEY, JSON.stringify({ baseHash: map.baseHash, savedAt: new Date().toISOString(), data: JSON.parse(snapshot()) }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 浏览器存储不可用时忽略 */
    }
  }, 400);
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 忽略 */
  }
  map.draftOffer = null;
}
function offerDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (draft?.data && JSON.stringify(draft.data) !== map.baseline) map.draftOffer = { savedAt: draft.savedAt, sameBase: draft.baseHash === map.baseHash, data: draft.data };
  } catch {
    /* 忽略 */
  }
}
export function restoreDraft() {
  if (!map.draftOffer) return;
  map.undoStack.push(snapshot());
  apply(clone(map.draftOffer.data));
  map.draftOffer = null;
  saveDraft();
}
export function dismissDraft() {
  clearDraft();
}

// ---------- 导出与保存 ----------
// 标记文件是地点里内嵌标记的镜像：保持原顺序，用地点里的最新内容覆盖，新标记追加在后面。
function markerList() {
  const embedded = new Map();
  for (const place of map.places) if (place?.marker?.id) embedded.set(place.marker.id, place.marker);
  const out = [];
  const seen = new Set();
  for (const marker of map.markers) {
    if (!marker?.id || seen.has(marker.id)) continue;
    seen.add(marker.id);
    out.push(embedded.get(marker.id) ?? marker);
  }
  for (const [id, marker] of embedded) if (!seen.has(id)) out.push(marker);
  return out;
}
export function fileTexts() {
  normalizePlaceMarkers(map.places);
  return {
    "places.yaml": yaml().dump({ places: map.places }, { lineWidth: 120 }),
    "edges.yaml": yaml().dump({ edges: map.edges }, { lineWidth: 120 }),
    "marker0502_wsrv.txt": markerList().map((m) => JSON.stringify(m, null, 2)).join(",\n"),
  };
}
export async function saveToWorkspace() {
  map.saving = true;
  try {
    const response = await fetch("/_workbench/geography", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: fileTexts() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error?.message || `保存失败（${response.status}）`);
    clearDraft();
    // 重新从磁盘读取，保证「已保存」的基准和文件完全一致。
    const undoStack = map.undoStack;
    await loadFromWorkspace({ keepDraftOffer: false });
    map.undoStack = undoStack;
    return data;
  } finally {
    map.saving = false;
  }
}
export function importFile(kind, text) {
  edit(() => {
    if (kind === "places") map.places = arr(yaml().load(text)?.places);
    else if (kind === "edges") map.edges = arr(yaml().load(text)?.edges);
    else map.markers = markerTextToArray(text);
    normalizePlaceMarkers(map.places);
  });
}

// ---------- 地点操作 ----------
function uniqueId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
}
export function newPlace(parentId, position) {
  return edit(() => {
    const id = uniqueId("new_place", index.value.placeById);
    const place = {
      id, marker_id: null, name: "新地点", parent: parentId ?? "continent", is_geographic: true, is_waypoint: false,
      keywords: [], description: { brief: "", detail: "" }, labels: [], importance: 1, notes: "",
    };
    map.places.push(place);
    if (position) setPositionRaw(place, position.nx, position.ny);
    return place;
  });
}
function setPositionRaw(place, nx, ny) {
  let marker = markerOf(place);
  if (!marker) {
    const markerId = `marker-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    marker = {
      id: markerId, name: place.name || place.id, group: arr(place.labels).join("/") || "待定",
      description: place.description?.detail || place.description?.brief || "", icon: "fa-solid fa-location-dot",
      color: "#78c6ff", position: { nx: 0, ny: 0 }, imageUrls: [],
    };
    place.marker_id = markerId;
  }
  if (!place.marker) place.marker = marker;
  place.marker.position = { nx: Number(nx.toFixed(12)), ny: Number(ny.toFixed(12)) };
}
export function setPosition(place, nx, ny, record = true) {
  if (record) edit(() => setPositionRaw(place, nx, ny));
  else {
    setPositionRaw(place, nx, ny);
    map.version++;
  }
}
export function removePosition(place) {
  edit(() => {
    const markerId = place.marker_id;
    place.marker_id = null;
    delete place.marker;
    if (markerId && !map.places.some((p) => p !== place && p.marker_id === markerId)) map.markers = map.markers.filter((m) => m.id !== markerId);
  });
}
export function renamePlaceId(place, newId) {
  newId = newId.trim();
  if (!newId) throw new Error("编号不能为空");
  if (newId === place.id) return;
  if (index.value.placeById.has(newId)) throw new Error(`编号「${newId}」已经被使用了`);
  edit(() => {
    const oldId = place.id;
    place.id = newId;
    for (const p of map.places) if (p.parent === oldId) p.parent = newId;
    for (const e of map.edges) {
      if (e.from === oldId) e.from = newId;
      if (e.to === oldId) e.to = newId;
    }
  });
}
// 改地点名称时，如果地图标记名和旧名称一样，一起改掉（状态栏地图显示的是标记名）。
export function renamePlace(place, name) {
  name = name.trim();
  if (!name || name === place.name) return;
  edit(() => {
    if (place.marker && (place.marker.name === place.name || place.marker.name === "新地点")) place.marker.name = name;
    place.name = name;
  });
}
export function moveTo(id, parentId) {
  if (parentId === id || descendants(id).includes(parentId)) throw new Error("不能把地点移到它自己或它的下级里面");
  edit(() => {
    index.value.placeById.get(id).parent = parentId;
  });
}
// mode: "promote" 子地点上移一级 / "subtree" 连同子地点一起删 / "move" 子地点改挂到 target
export function deletePlace(place, mode = "promote", target = null) {
  return edit(() => {
    const kids = children(place.id);
    const remove = new Set([place.id]);
    if (mode === "subtree") for (const id of descendants(place.id)) remove.add(id);
    else for (const child of kids) child.parent = mode === "move" ? target : place.parent ?? null;
    const removedPlaces = map.places.filter((p) => remove.has(p.id));
    map.places = map.places.filter((p) => !remove.has(p.id));
    const before = map.edges.length;
    map.edges = map.edges.filter((e) => !remove.has(e.from) && !remove.has(e.to));
    for (const p of removedPlaces) if (p.marker_id && !map.places.some((q) => q.marker_id === p.marker_id)) map.markers = map.markers.filter((m) => m.id !== p.marker_id);
    return { places: removedPlaces.length, edges: before - map.edges.length };
  });
}

// ---------- 路线操作 ----------
export function newEdge(from, to) {
  return edit(() => {
    const ids = new Set(map.edges.map((e) => e.id));
    let id = `${from}__${to}`;
    for (let n = 2; ids.has(id); n++) id = `${from}__${to}_${n}`;
    const edge = { id, from, to, bidirectional: true, segments: [{ transport: "商队", days: null, terrain: [], direction: suggestDirection(from, to), description: "", notes: "" }], importance: 1, notes: "" };
    map.edges.push(edge);
    return edge;
  });
}
export function renameEdgeId(edge, newId) {
  newId = newId.trim();
  if (!newId) throw new Error("编号不能为空");
  if (newId === edge.id) return;
  if (map.edges.some((e) => e !== edge && e.id === newId)) throw new Error(`编号「${newId}」已经被使用了`);
  edit(() => (edge.id = newId));
}
export function deleteEdge(edge) {
  edit(() => {
    map.edges = map.edges.filter((e) => e !== edge);
  });
}

import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from "/vendor/vue.js";
import { toast } from "./lib.js";
import {
  map, index, issues, issuesFor, dirty, loadFromWorkspace, undo, redo, discardChanges, restoreDraft, dismissDraft,
  saveToWorkspace, fileTexts, importFile, edit, changed, children, descendants, rootInfo, parentChain, markerOf, coordOf,
  placeName, isGeo, transports, transportText, newPlace, setPosition, removePosition, renamePlaceId, renamePlace as renamePlaceName, moveTo, deletePlace, suggestDirection,
  newEdge, renameEdgeId, deleteEdge, NA_TRANSPORTS,
} from "./map-store.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const DEPTH_COLORS = ["#c2410c", "#d97706", "#65a30d", "#0891b2", "#4f46e5", "#a21caf", "#be185d"];
const COLOR_MODES = {
  depth: { name: "按层级", legend: [["#c2410c", "大陆"], ["#d97706", "第 1 层"], ["#65a30d", "第 2 层"], ["#0891b2", "第 3 层"], ["#4f46e5", "第 4 层"], ["#a21caf", "第 5 层"], ["#be185d", "更深"], ["#6b7280", "没挂到大陆"]] },
  importance: { name: "按重要性", legend: [["#dc2626", "3 核心"], ["#f59e0b", "2 常用"], ["#3b82f6", "1 补充"], ["#9ca3af", "未填"]] },
  coord: { name: "按位置状态", legend: [["#16a34a", "有位置"], ["#dc2626", "标记缺失"], ["#9ca3af", "无位置"]] },
  issue: { name: "按问题", legend: [["#16a34a", "没问题"], ["#f59e0b", "有提醒"], ["#dc2626", "有错误"]] },
};
const PLACE_FILTERS = [
  ["all", "全部地点"], ["issues", "有问题的"], ["bad", "有错误的"], ["unrooted", "没挂到大陆的"], ["no-coord", "没有地图位置的"],
  ["bad-marker", "地图标记缺失的"], ["leaf", "没有下级的"], ["geo", "只看地理点"], ["non-geo", "只看非地理点"],
];
const TOOLS = [
  ["select", "选择", "点击地点或路线查看、编辑；按住地图拖动可平移"],
  ["move", "移动地点", "按住地图上的点拖到新位置"],
  ["add", "新增地点", "在地图上点一下，就在那里新增一个地点"],
  ["edge", "新建路线", "依次点击两个地点，在它们之间新建路线"],
];

const ChipInput = {
  props: { modelValue: { type: Array, default: () => [] }, placeholder: { type: String, default: "输入后按回车添加" } },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const text = ref("");
    const add = () => {
      const parts = text.value.split(/[，,\n]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length) emit("update:modelValue", [...props.modelValue, ...parts]);
      text.value = "";
    };
    const remove = (i) => emit("update:modelValue", props.modelValue.filter((_, j) => j !== i));
    return { text, add, remove };
  },
  template: `<div class="chip-list"><span v-for="(t, i) in modelValue" :key="i" class="chip">{{ t }}<button title="删除" @click="remove(i)">×</button></span><input class="chip-input" v-model="text" :placeholder="placeholder" @keydown.enter.prevent="add" @blur="add" /></div>`,
};

export const MapView = {
  components: { ChipInput },
  props: { route: { type: Array, default: () => [] } },
  setup() {
    // ---------- 选择与面板 ----------
    const tab = ref("places");
    const search = ref("");
    const placeFilter = ref("all");
    const importanceFilter = ref("all");
    const regionFilter = ref("all");
    const transportFilter = ref("all");
    const issueLevel = ref("all");
    const selected = reactive({ type: null, id: null });
    const expanded = ref(new Set(["continent"]));
    const showHelp = ref(false);
    const showMore = ref(false);
    const dialog = ref(null);

    const selectedPlace = computed(() => (selected.type === "place" ? index.value.placeById.get(selected.id) : null));
    const selectedEdge = computed(() => (selected.type === "edge" ? map.edges.find((e) => e.id === selected.id) : null));
    function select(type, id, { center = false } = {}) {
      if (type === "marker") {
        const owner = map.places.find((p) => p.marker_id === id);
        if (owner) return select("place", owner.id, { center });
        toast("这个地图标记没有被任何地点使用", "info");
        return;
      }
      selected.type = type;
      selected.id = id;
      if (type === "place") expandTo(id);
      if (center) nextTick(() => centerOn(type, id));
    }
    function expandTo(id) {
      const next = new Set(expanded.value);
      for (const p of parentChain(id)) next.add(p.id);
      expanded.value = next;
    }
    function toggle(id) {
      const next = new Set(expanded.value);
      next.has(id) ? next.delete(id) : next.add(id);
      expanded.value = next;
    }
    const expandAll = () => (expanded.value = new Set(map.places.map((p) => p.id)));
    const collapseAll = () => {
      expanded.value = new Set(["continent"]);
      if (selectedPlace.value) expandTo(selectedPlace.value.id);
    };

    // ---------- 筛选 ----------
    const regionIds = computed(() => (regionFilter.value === "all" ? null : new Set([regionFilter.value, ...descendants(regionFilter.value)])));
    const placeIssueLevel = computed(() => {
      const m = new Map();
      for (const i of issues.value) if (i.type === "place" && i.level !== "info") m.set(i.id, m.get(i.id) === "bad" || i.level === "bad" ? "bad" : "warn");
      return m;
    });
    const edgeIssueLevel = computed(() => {
      const m = new Map();
      for (const i of issues.value) if (i.type === "edge" && i.level !== "info") m.set(i.id, m.get(i.id) === "bad" || i.level === "bad" ? "bad" : "warn");
      return m;
    });
    function placeText(p) {
      return [p.id, p.name, p.parent, p.marker_id, ...arr(p.keywords), ...arr(p.labels), p.notes, p.description?.brief, p.description?.detail].join("\n").toLowerCase();
    }
    function placeMatches(p) {
      const q = search.value.trim().toLowerCase();
      if (q && !placeText(p).includes(q)) return false;
      if (regionIds.value && !regionIds.value.has(p.id)) return false;
      if (importanceFilter.value !== "all") {
        const n = Number(p.importance || 0);
        if (importanceFilter.value === "0" ? [1, 2, 3].includes(n) : String(n) !== importanceFilter.value) return false;
      }
      const f = placeFilter.value;
      const level = placeIssueLevel.value.get(p.id);
      if (f === "issues" && !level) return false;
      if (f === "bad" && level !== "bad") return false;
      if (f === "unrooted" && rootInfo(p).rooted) return false;
      if (f === "no-coord" && coordOf(p.id)) return false;
      if (f === "bad-marker" && (!p.marker_id || markerOf(p))) return false;
      if (f === "leaf" && children(p.id).length) return false;
      if (f === "geo" && !isGeo(p)) return false;
      if (f === "non-geo" && isGeo(p)) return false;
      return true;
    }
    const filtering = computed(() => !!search.value.trim() || placeFilter.value !== "all" || importanceFilter.value !== "all" || regionFilter.value !== "all");
    const visiblePlaces = computed(() => {
      map.version;
      return new Set(map.places.filter(placeMatches).map((p) => p.id));
    });
    const edgeText = (e) => [e.id, e.from, e.to, placeName(e.from), placeName(e.to), ...transports(e), e.notes].join("\n").toLowerCase();
    const visibleEdges = computed(() => {
      map.version;
      const q = search.value.trim().toLowerCase();
      return map.edges.filter((e) => {
        if (q && !edgeText(e).includes(q)) return false;
        if (transportFilter.value !== "all" && !transports(e).includes(transportFilter.value)) return false;
        if (regionIds.value && !regionIds.value.has(e.from) && !regionIds.value.has(e.to)) return false;
        if (placeFilter.value === "issues" && !edgeIssueLevel.value.get(e.id)) return false;
        if (placeFilter.value === "bad" && edgeIssueLevel.value.get(e.id) !== "bad") return false;
        return true;
      });
    });
    const allTransports = computed(() => {
      map.version;
      return [...new Set(map.edges.flatMap(transports))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    });
    const allTerrains = computed(() => {
      map.version;
      return [...new Set(map.edges.flatMap((e) => arr(e.segments).flatMap((s) => arr(s?.terrain))))].sort();
    });
    const regions = computed(() => treeOrder.value.filter(({ place }) => children(place.id).length));
    const issueList = computed(() => {
      const q = search.value.trim().toLowerCase();
      return issues.value.filter((i) => {
        if (issueLevel.value !== "all" && i.level !== issueLevel.value) return false;
        if (q && ![i.text, i.id, i.detail, targetText(i)].join("\n").toLowerCase().includes(q)) return false;
        return true;
      });
    });
    const issueCounts = computed(() => ({
      bad: issues.value.filter((i) => i.level === "bad").length,
      warn: issues.value.filter((i) => i.level === "warn").length,
      info: issues.value.filter((i) => i.level === "info").length,
    }));
    function targetText(i) {
      if (i.type === "place") return placeName(i.id);
      if (i.type === "edge") {
        const e = map.edges.find((x) => x.id === i.id);
        return e ? `${placeName(e.from)} ↔ ${placeName(e.to)}` : i.id;
      }
      return `地图标记 ${i.detail || i.id}`;
    }

    // ---------- 地点树 ----------
    const treeOrder = computed(() => {
      map.version;
      const out = [];
      const seen = new Set();
      const visit = (place, depth) => {
        if (!place || seen.has(place.id)) return;
        seen.add(place.id);
        out.push({ place, depth });
        for (const c of children(place.id)) visit(c, depth + 1);
      };
      for (const root of children(null)) visit(root, 0);
      for (const p of map.places) if (!seen.has(p.id)) visit(p, 0);
      return out;
    });
    const treeRows = computed(() => {
      map.version;
      const rows = [];
      const seen = new Set();
      const show = (place, depth) => {
        if (!place || seen.has(place.id)) return [];
        seen.add(place.id);
        const kids = children(place.id);
        const childRows = kids.flatMap((c) => show(c, depth + 1));
        const matches = visiblePlaces.value.has(place.id);
        if (!matches && !childRows.length) return [];
        const open = filtering.value ? true : expanded.value.has(place.id);
        return [{ place, depth, kids: kids.length, matches, open }, ...(open ? childRows : [])];
      };
      for (const root of children(null)) rows.push(...show(root, 0));
      const orphans = map.places.filter((p) => !seen.has(p.id));
      for (const p of orphans) rows.push(...show(p, 0));
      return rows;
    });
    const dragId = ref(null);
    function dropOn(targetId) {
      const id = dragId.value;
      dragId.value = null;
      if (!id || id === targetId) return;
      ask({
        title: "移动地点",
        body: `把「${placeName(id)}」移到「${placeName(targetId)}」下面？`,
        confirm: "移动",
        run: () => tryRun(() => moveTo(id, targetId)),
      });
    }

    // ---------- 地图 ----------
    const viewport = ref(null);
    const natural = reactive({ w: 4864, h: 2774 });
    const mapState = reactive({ loading: true, failed: "", zoom: 1, viewW: 800, viewH: 600 });
    const tool = ref("select");
    const pendingEdgeFrom = ref(null);
    const placing = ref(null); // 正在给已有地点放置位置
    const showEdges = ref(true);
    const showLabels = ref(false);
    const dimOthers = ref(true);
    const colorMode = ref("depth");
    const canvasW = computed(() => Math.round(mapState.viewW * mapState.zoom));
    const canvasH = computed(() => Math.round((canvasW.value * natural.h) / natural.w));
    let firstLoad = true;
    function onImageLoad(event) {
      natural.w = event.target.naturalWidth || natural.w;
      natural.h = event.target.naturalHeight || natural.h;
      mapState.loading = false;
      if (!firstLoad) return;
      firstLoad = false;
      // 第一次打开时让地图铺满整个区域，并停在中央。
      measure();
      mapState.zoom = Math.max(1, mapState.viewH / ((mapState.viewW * natural.h) / natural.w));
      nextTick(() => {
        const el = viewport.value;
        if (el) el.scrollTo({ left: (canvasW.value - el.clientWidth) / 2, top: (canvasH.value - el.clientHeight) / 2 });
      });
    }
    function onImageError() {
      mapState.loading = false;
      mapState.failed = "地图底图加载失败（第一次打开需要联网下载，约 1.5MB）。地点和路线仍可在列表里编辑。";
    }
    let resizeObserver;
    function measure() {
      if (!viewport.value) return;
      mapState.viewW = viewport.value.clientWidth;
      mapState.viewH = viewport.value.clientHeight;
    }
    function setZoom(next, anchor) {
      const el = viewport.value;
      const old = canvasW.value;
      next = Math.max(0.5, Math.min(10, next));
      if (!el || next === mapState.zoom) return;
      const rect = el.getBoundingClientRect();
      const cx = anchor ? anchor.x - rect.left : el.clientWidth / 2;
      const cy = anchor ? anchor.y - rect.top : el.clientHeight / 2;
      const rx = (el.scrollLeft + cx) / old;
      const ry = (el.scrollTop + cy) / ((old * natural.h) / natural.w);
      mapState.zoom = next;
      nextTick(() => {
        el.scrollLeft = rx * canvasW.value - cx;
        el.scrollTop = ry * canvasH.value - cy;
      });
    }
    function onWheel(event) {
      event.preventDefault();
      setZoom(mapState.zoom * Math.exp(-event.deltaY * 0.0015), { x: event.clientX, y: event.clientY });
    }
    function centerOn(type, id) {
      const el = viewport.value;
      if (!el) return;
      let pos = null;
      if (type === "place") pos = coordOf(id);
      else {
        const e = map.edges.find((x) => x.id === id);
        const a = e && coordOf(e.from), b = e && coordOf(e.to);
        if (a && b) pos = { nx: (a.nx + b.nx) / 2, ny: (a.ny + b.ny) / 2 };
      }
      if (!pos) return;
      if (mapState.zoom < 1.6) mapState.zoom = 2;
      nextTick(() => el.scrollTo({ left: pos.nx * canvasW.value - el.clientWidth / 2, top: pos.ny * canvasH.value - el.clientHeight / 2, behavior: "smooth" }));
    }
    function fit() {
      mapState.zoom = Math.max(0.5, Math.min(1, mapState.viewH / ((mapState.viewW * natural.h) / natural.w)));
    }

    const related = computed(() => {
      const places = new Set();
      const edges = new Set();
      if (selected.type === "place" && selectedPlace.value) {
        const id = selected.id;
        places.add(id);
        for (const e of arr(index.value.edgesByPlace.get(id))) {
          edges.add(e.id);
          places.add(e.from);
          places.add(e.to);
        }
        for (const c of children(id)) places.add(c.id);
        if (selectedPlace.value.parent) places.add(selectedPlace.value.parent);
      } else if (selected.type === "edge" && selectedEdge.value) {
        edges.add(selectedEdge.value.id);
        places.add(selectedEdge.value.from);
        places.add(selectedEdge.value.to);
      }
      return { places, edges };
    });
    function pointColor(p) {
      if (colorMode.value === "importance") return { 3: "#dc2626", 2: "#f59e0b", 1: "#3b82f6" }[Number(p.importance)] ?? "#9ca3af";
      if (colorMode.value === "coord") return coordOf(p.id) ? "#16a34a" : p.marker_id ? "#dc2626" : "#9ca3af";
      if (colorMode.value === "issue") {
        const level = placeIssueLevel.value.get(p.id);
        return level === "bad" ? "#dc2626" : level ? "#f59e0b" : "#16a34a";
      }
      const info = rootInfo(p);
      return info.rooted ? DEPTH_COLORS[Math.min(info.depth, DEPTH_COLORS.length - 1)] : "#6b7280";
    }
    const points = computed(() => {
      map.version;
      const hasSel = !!selected.type;
      return map.places
        .map((p) => {
          const pos = coordOf(p.id);
          if (!pos || !visiblePlaces.value.has(p.id)) return null;
          const active = selected.type === "place" && selected.id === p.id;
          const rel = related.value.places.has(p.id);
          return {
            id: p.id, name: p.name || p.id, x: pos.nx * 100, y: pos.ny * 100, color: pointColor(p), active, related: rel && !active,
            faded: dimOthers.value && hasSel && !rel, pending: pendingEdgeFrom.value === p.id, important: Number(p.importance) >= 3,
          };
        })
        .filter(Boolean);
    });
    const lines = computed(() => {
      map.version;
      if (!showEdges.value) return [];
      const pairs = new Map();
      for (const e of map.edges) {
        const key = [e.from, e.to].sort().join("__");
        pairs.set(key, [...(pairs.get(key) || []), e]);
      }
      const W = natural.w, H = natural.h;
      return visibleEdges.value
        .map((e) => {
          const a = coordOf(e.from), b = coordOf(e.to);
          if (!a || !b) return null;
          const x1 = a.nx * W, y1 = a.ny * H, x2 = b.nx * W, y2 = b.ny * H;
          const group = pairs.get([e.from, e.to].sort().join("__"));
          let d = `M ${x1} ${y1} L ${x2} ${y2}`;
          if (group.length > 1) {
            const forward = e.from < e.to;
            const s = forward ? { x: x1, y: y1 } : { x: x2, y: y2 }, t = forward ? { x: x2, y: y2 } : { x: x1, y: y1 };
            const len = Math.hypot(t.x - s.x, t.y - s.y) || 1;
            const off = (group.indexOf(e) - (group.length - 1) / 2) * 0.012 * W;
            d = `M ${x1} ${y1} Q ${(x1 + x2) / 2 - ((t.y - s.y) / len) * off} ${(y1 + y2) / 2 + ((t.x - s.x) / len) * off} ${x2} ${y2}`;
          }
          const active = selected.type === "edge" && selected.id === e.id;
          return {
            id: e.id, d, active, related: related.value.edges.has(e.id) && !active,
            faded: dimOthers.value && !!selected.type && !related.value.edges.has(e.id),
            na: transports(e).some((t) => NA_TRANSPORTS.includes(t)), oneWay: e.bidirectional === false, title: `${placeName(e.from)} ↔ ${placeName(e.to)}　${transportText(e)}`,
          };
        })
        .filter(Boolean);
    });

    // 平移、拖动地点、点击地图
    let pan = null;
    let dragPoint = null;
    function mapPos(event) {
      const canvas = viewport.value.querySelector(".map-canvas").getBoundingClientRect();
      return { nx: Math.max(0, Math.min(1, (event.clientX - canvas.left) / canvas.width)), ny: Math.max(0, Math.min(1, (event.clientY - canvas.top) / canvas.height)) };
    }
    function onPointerDown(event) {
      if (event.button !== 0) return;
      const pointEl = event.target.closest("[data-point]");
      if (pointEl && tool.value === "move") {
        const place = index.value.placeById.get(pointEl.dataset.point);
        select("place", place.id);
        dragPoint = { place, moved: false, startX: event.clientX, startY: event.clientY };
        event.preventDefault();
        return;
      }
      pan = { x: event.clientX, y: event.clientY, left: viewport.value.scrollLeft, top: viewport.value.scrollTop, moved: false };
    }
    function onPointerMove(event) {
      if (dragPoint) {
        if (!dragPoint.moved && Math.hypot(event.clientX - dragPoint.startX, event.clientY - dragPoint.startY) < 3) return;
        if (!dragPoint.moved) edit(() => {}); // 记录一个撤销点
        dragPoint.moved = true;
        const { nx, ny } = mapPos(event);
        setPosition(dragPoint.place, nx, ny, false);
        return;
      }
      if (!pan) return;
      const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      pan.moved = true;
      viewport.value.scrollLeft = pan.left - dx;
      viewport.value.scrollTop = pan.top - dy;
    }
    function onPointerUp(event) {
      if (dragPoint) {
        if (dragPoint.moved) {
          changed();
          toast(`已移动「${dragPoint.place.name}」`);
        }
        dragPoint = null;
        return;
      }
      const wasPan = pan?.moved;
      pan = null;
      if (wasPan || !viewport.value?.contains(event.target)) return;
      const pointEl = event.target.closest("[data-point]");
      const lineEl = event.target.closest("[data-edge]");
      if (placing.value) {
        if (pointEl) return;
        const place = index.value.placeById.get(placing.value);
        const { nx, ny } = mapPos(event);
        setPosition(place, nx, ny);
        placing.value = null;
        toast(`已为「${place.name}」设置地图位置`, "ok");
        return;
      }
      if (tool.value === "edge") {
        if (!pointEl) return;
        return pickEdgePoint(pointEl.dataset.point);
      }
      if (tool.value === "add" && !pointEl) {
        const parent = selectedPlace.value?.id ?? "continent";
        const place = newPlace(parent, mapPos(event));
        tool.value = "select";
        select("place", place.id);
        toast(`已新增地点，放在「${placeName(parent)}」下面。右侧可以改名称和信息`, "ok", 5000);
        return;
      }
      if (pointEl) select("place", pointEl.dataset.point);
      else if (lineEl) select("edge", lineEl.dataset.edge);
    }
    function pickEdgePoint(id) {
      const place = index.value.placeById.get(id);
      if (!isGeo(place)) return toast("路线只能连接地理点", "error");
      if (!pendingEdgeFrom.value) {
        pendingEdgeFrom.value = id;
        select("place", id);
        return;
      }
      if (pendingEdgeFrom.value === id) return toast("终点不能和起点相同", "error");
      const edge = newEdge(pendingEdgeFrom.value, id);
      pendingEdgeFrom.value = null;
      tool.value = "select";
      select("edge", edge.id);
      toast("已新建路线，右侧填写交通方式和天数", "ok", 5000);
    }
    function setTool(id) {
      tool.value = id;
      pendingEdgeFrom.value = null;
      placing.value = null;
    }
    const hint = computed(() => {
      if (placing.value) return `在地图上点一下，为「${placeName(placing.value)}」设置位置。按 Esc 取消。`;
      if (tool.value === "edge") return pendingEdgeFrom.value ? `起点：${placeName(pendingEdgeFrom.value)}。现在点击终点。按 Esc 取消。` : "新建路线：先点击起点。按 Esc 取消。";
      if (tool.value === "add") return `新增地点：在地图上点一下。新地点会放在「${placeName(selectedPlace.value?.id ?? "continent")}」下面。按 Esc 取消。`;
      if (tool.value === "move") return "移动地点：按住地图上的点拖到新位置。按 Esc 退出。";
      return "滚轮缩放，按住拖动平移；点击地点或路线查看和编辑。";
    });

    // ---------- 编辑表单 ----------
    function setField(target, path, value) {
      let obj = target;
      for (const key of path.slice(0, -1)) obj = obj?.[key];
      const key = path.at(-1);
      if (obj && JSON.stringify(obj[key]) === JSON.stringify(value)) return;
      edit(() => {
        let o = target;
        for (const k of path.slice(0, -1)) {
          if (!o[k] || typeof o[k] !== "object") o[k] = {};
          o = o[k];
        }
        o[key] = value;
      });
    }
    function setOptionalText(target, path, value) {
      let obj = target;
      for (const key of path.slice(0, -1)) obj = obj?.[key];
      if ((obj?.[path.at(-1)] ?? "") === value) return;
      setField(target, path, value);
    }
    function tryRun(fn) {
      try {
        return fn();
      } catch (error) {
        toast(error.message, "error", 5000);
      }
    }
    function renamePlace(place, value) {
      tryRun(() => {
        const old = place.id;
        renamePlaceId(place, value);
        if (selected.id === old) selected.id = place.id;
      });
    }
    function renameEdge(edge, value) {
      tryRun(() => {
        renameEdgeId(edge, value);
        selected.id = edge.id;
      });
    }
    function parentOptions(place) {
      const forbidden = new Set([place.id, ...descendants(place.id)]);
      return treeOrder.value.filter(({ place: p }) => !forbidden.has(p.id));
    }
    function changeParent(place, value) {
      tryRun(() => moveTo(place.id, value === "" ? null : value));
      expandTo(place.id);
    }
    function addChild(parentId) {
      const place = newPlace(parentId);
      select("place", place.id);
      toast("已新增地点。可以在地图上给它放置位置", "ok");
    }
    function promote(place) {
      const parent = index.value.placeById.get(place.parent);
      if (!parent) return toast("已经在最上层了", "error");
      tryRun(() => moveTo(place.id, parent.parent ?? null));
    }
    function startPlacing(place) {
      placing.value = place.id;
      tool.value = "select";
    }
    function confirmRemovePosition(place) {
      ask({ title: "删除地图位置", body: `删除「${place.name}」在地图上的位置和标记？地点本身会保留。`, confirm: "删除", danger: true, run: () => removePosition(place) });
    }
    function confirmDeletePlace(place) {
      const kids = children(place.id).length;
      const sub = descendants(place.id).length;
      const edgeCount = arr(index.value.edgesByPlace.get(place.id)).length;
      ask({
        title: `删除「${place.name}」`,
        body: kids ? `这个地点下面还有 ${sub} 个下级地点，想怎么处理它们？` : `确定删除吗？和它相连的 ${edgeCount} 条路线也会一起删除。`,
        options: kids
          ? [
              ["promote", `下级地点上移一级，挂到「${placeName(place.parent) || "最上层"}」下面`],
              ["move", "下级地点改挂到其他地点下面"],
              ["subtree", `连同全部 ${sub} 个下级地点一起删除`],
            ]
          : null,
        moveTargets: kids ? treeOrder.value.filter(({ place: p }) => p.id !== place.id && !descendants(place.id).includes(p.id)) : null,
        confirm: "删除",
        danger: true,
        run: (choice, target) => {
          if (choice === "move" && !target) return toast("请先选择要挂到哪个地点下面", "error");
          const parent = place.parent;
          const result = deletePlace(place, choice ?? "promote", target);
          selected.type = parent && index.value.placeById.has(parent) ? "place" : null;
          selected.id = parent;
          toast(`已删除 ${result.places} 个地点${result.edges ? `、${result.edges} 条路线` : ""}`, "ok");
          return true;
        },
      });
    }
    function confirmDeleteEdge(edge) {
      ask({ title: "删除路线", body: `删除「${placeName(edge.from)} ↔ ${placeName(edge.to)}」这条路线？`, confirm: "删除", danger: true, run: () => {
        deleteEdge(edge);
        selected.type = null;
        selected.id = null;
      } });
    }
    function startEdgeFrom(place) {
      tool.value = "edge";
      placing.value = null;
      pendingEdgeFrom.value = place.id;
    }
    const geoPlaces = computed(() => treeOrder.value.filter(({ place }) => isGeo(place)));
    function addSegment(edge) {
      edit(() => edge.segments.push({ transport: transports(edge)[0] ?? "商队", days: null, terrain: [], direction: "", description: "", notes: "" }));
    }
    function removeSegment(edge, i) {
      if (edge.segments.length <= 1) return toast("至少要保留一段", "error");
      edit(() => edge.segments.splice(i, 1));
    }
    function setDays(seg, value) {
      const text = String(value).trim();
      setField(seg, ["days"], text === "" ? null : Number(text));
    }
    const yamlOf = (obj) => window.jsyaml.dump(obj, { lineWidth: 120 });

    // ---------- 对话框 ----------
    function ask(options) {
      dialog.value = { ...options, choice: options.options?.[0]?.[0] ?? null, target: "" };
    }
    function runDialog() {
      const d = dialog.value;
      const result = d.run(d.choice, d.target);
      if (result === undefined || result === true) dialog.value = null;
    }

    // ---------- 保存 ----------
    async function save() {
      if (!dirty.value || map.saving) return;
      if (issueCounts.value.bad) {
        ask({ title: "还有错误", body: `地图数据里还有 ${issueCounts.value.bad} 个错误（在左侧「问题」里能看到）。仍然保存吗？`, confirm: "仍然保存", run: () => void doSave() });
        return;
      }
      await doSave();
    }
    async function doSave() {
      try {
        await saveToWorkspace();
        toast("已保存到工作区。重新构建或推送到酒馆后，游戏里才会更新", "ok", 6000);
      } catch (error) {
        toast(`保存失败：${error.message}`, "error", 8000);
      }
    }
    function confirmDiscard() {
      ask({ title: "放弃修改", body: "放弃所有还没保存的修改，回到上次保存的状态？（放弃后仍可用「撤销」找回）", confirm: "放弃修改", danger: true, run: () => {
        discardChanges();
        selected.type = null;
      } });
    }
    function download() {
      for (const [name, text] of Object.entries(fileTexts())) {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      }
      showMore.value = false;
    }
    const fileInput = ref(null);
    let importKind = "places";
    function chooseImport(kind) {
      importKind = kind;
      showMore.value = false;
      fileInput.value.click();
    }
    async function onImport(event) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        importFile(importKind, await file.text());
        selected.type = null;
        toast(`已导入 ${file.name}，检查无误后点「保存」`, "ok", 5000);
      } catch (error) {
        toast(`导入失败：${error.message}`, "error", 6000);
      }
    }

    function onKey(event) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (event.key === "Escape") {
        if (dialog.value) dialog.value = null;
        else if (showHelp.value) showHelp.value = false;
        else setTool("select");
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      } else if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }
    const beforeUnload = (event) => {
      if (dirty.value) event.preventDefault();
    };
    watch(() => [selected.type, selected.id], () => {
      if (selected.type === "place" && !index.value.placeById.has(selected.id)) selected.type = null;
      if (selected.type === "edge" && !map.edges.some((e) => e.id === selected.id)) selected.type = null;
    });
    onMounted(async () => {
      window.addEventListener("keydown", onKey);
      window.addEventListener("beforeunload", beforeUnload);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      if (!map.loaded) await loadFromWorkspace();
      await nextTick();
      measure();
      resizeObserver = new ResizeObserver(measure);
      if (viewport.value) resizeObserver.observe(viewport.value);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      resizeObserver?.disconnect();
    });

    return {
      map, issues, issuesFor, dirty, undo, redo, restoreDraft, dismissDraft, save, confirmDiscard, download, chooseImport, onImport, fileInput,
      tab, search, placeFilter, importanceFilter, regionFilter, transportFilter, issueLevel, PLACE_FILTERS, regions, allTransports, allTerrains,
      selected, selectedPlace, selectedEdge, select, expanded, toggle, expandAll, collapseAll, treeRows, dragId, dropOn, filtering,
      visibleEdges, issueList, issueCounts, targetText, placeIssueLevel, edgeIssueLevel,
      viewport, natural, mapState, canvasW, canvasH, onImageLoad, onImageError, onWheel, setZoom, fit, centerOn, points, lines,
      onPointerDown, tool, TOOLS, setTool, hint, placing, pendingEdgeFrom, showEdges, showLabels, dimOthers, colorMode, COLOR_MODES,
      setField, setOptionalText, renamePlace, renameEdge, parentOptions, changeParent, addChild, promote, startPlacing, confirmRemovePosition,
      confirmDeletePlace, confirmDeleteEdge, startEdgeFrom, geoPlaces, renamePlaceName, suggestDirection, addSegment, removeSegment, setDays, yamlOf,
      dialog, runDialog, showHelp, showMore, children, parentChain, markerOf, coordOf, placeName, isGeo, transportText, rootInfo, arr,
      edgesOf: (id) => arr(index.value.edgesByPlace.get(id)),
    };
  },
  template: `
<div class="mapx">
  <header class="mapx-head">
    <div class="grow">
      <h1>地图</h1>
      <p class="muted small">地点 {{ map.places.length }} · 路线 {{ map.edges.length }} ·
        <span :class="dirty ? 'unsaved' : ''">{{ map.saving ? '正在保存…' : dirty ? '有未保存的修改（浏览器里已自动暂存，关掉也不会丢）' : '所有修改都已保存' }}</span></p>
    </div>
    <div class="row">
      <button class="btn small" :disabled="!map.undoStack.length" title="撤销（Ctrl+Z）" @click="undo">↶ 撤销</button>
      <button class="btn small" :disabled="!map.redoStack.length" title="重做（Ctrl+Y）" @click="redo">↷ 重做</button>
      <button class="btn small" :disabled="!dirty" @click="confirmDiscard">放弃修改</button>
      <button class="btn primary" :disabled="!dirty || map.saving" title="Ctrl+S" @click="save"><span v-if="map.saving" class="spinner"></span>保存</button>
      <div class="menu-wrap">
        <button class="btn small" @click="showMore = !showMore">更多 ▾</button>
        <div v-if="showMore" class="menu" @mouseleave="showMore = false">
          <button @click="showHelp = true; showMore = false">使用说明</button>
          <button @click="download">下载三个数据文件</button>
          <button @click="chooseImport('places')">从文件导入地点（places.yaml）</button>
          <button @click="chooseImport('edges')">从文件导入路线（edges.yaml）</button>
          <button @click="chooseImport('markers')">从文件导入地图标记</button>
          <a href="/tools/geography/editors/place-tree-editor.html" target="_blank">打开旧版地点树编辑器</a>
          <a href="/tools/geography/editors/viewer0911.html" target="_blank">打开旧版拓扑查看器</a>
        </div>
      </div>
      <input ref="fileInput" type="file" hidden accept=".yaml,.yml,.txt,.json" @change="onImport" />
    </div>
  </header>

  <div v-if="map.error" class="banner error" style="margin:0 16px"><div class="grow">{{ map.error }}</div></div>
  <div v-if="map.draftOffer" class="banner info" style="margin:0 16px">
    <div class="grow"><b>发现上次没保存的地图修改</b>（{{ new Date(map.draftOffer.savedAt).toLocaleString('zh-CN', { hour12: false }) }}）。要恢复吗？
      <span v-if="!map.draftOffer.sameBase" class="field-hint">注意：之后地图文件被别处改过，恢复会覆盖那些改动。</span></div>
    <button class="btn small primary" @click="restoreDraft">恢复</button><button class="btn small" @click="dismissDraft">丢弃</button>
  </div>

  <div class="mapx-body">
    <!-- 左：地点树 / 路线 / 问题 -->
    <aside class="mapx-side">
      <div class="tabs mapx-tabs">
        <button class="tab" :class="{ active: tab === 'places' }" @click="tab = 'places'">地点</button>
        <button class="tab" :class="{ active: tab === 'edges' }" @click="tab = 'edges'">路线</button>
        <button class="tab" :class="{ active: tab === 'issues' }" @click="tab = 'issues'">问题<span class="count" v-if="issueCounts.bad + issueCounts.warn">{{ issueCounts.bad + issueCounts.warn }}</span></button>
      </div>
      <input v-model="search" :placeholder="tab === 'issues' ? '搜索问题…' : tab === 'edges' ? '搜索地点名、交通方式…' : '搜索名称、标签、关键词…'" />
      <div v-if="tab !== 'issues'" class="mapx-filters">
        <select v-model="placeFilter"><option v-for="[v, n] in PLACE_FILTERS" :key="v" :value="v">{{ n }}</option></select>
        <select v-if="tab === 'places'" v-model="importanceFilter"><option value="all">全部重要性</option><option value="3">3 核心</option><option value="2">2 常用</option><option value="1">1 补充</option><option value="0">未填</option></select>
        <select v-else v-model="transportFilter"><option value="all">全部交通方式</option><option v-for="t in allTransports" :key="t" :value="t">{{ t }}</option></select>
        <select v-model="regionFilter" class="wide"><option value="all">全部地区</option><option v-for="r in regions" :key="r.place.id" :value="r.place.id">{{ '　'.repeat(r.depth) + r.place.name }}</option></select>
      </div>
      <div v-else class="mapx-filters">
        <select v-model="issueLevel" class="wide"><option value="all">全部（{{ issues.length }}）</option><option value="bad">错误（{{ issueCounts.bad }}）</option><option value="warn">提醒（{{ issueCounts.warn }}）</option><option value="info">仅供参考（{{ issueCounts.info }}）</option></select>
      </div>

      <div v-if="tab === 'places'" class="mapx-list">
        <div class="row small" style="padding:2px 4px 6px"><button class="btn ghost small" @click="expandAll">全部展开</button><button class="btn ghost small" @click="collapseAll">全部收起</button><span class="grow"></span><button class="btn small" @click="addChild(selectedPlace?.id ?? 'continent')">＋ 新增地点</button></div>
        <div v-for="row in treeRows" :key="row.place.id" class="tree-row" :class="{ active: selected.type === 'place' && selected.id === row.place.id, dim: !row.matches }"
          :style="{ paddingLeft: 4 + row.depth * 14 + 'px' }" draggable="true" @dragstart="dragId = row.place.id" @dragover.prevent @drop.prevent="dropOn(row.place.id)" @click="select('place', row.place.id, { center: true })">
          <button class="twisty" :style="{ visibility: row.kids ? 'visible' : 'hidden' }" @click.stop="toggle(row.place.id)">{{ row.open ? '▾' : '▸' }}</button>
          <span class="tree-name">{{ row.place.name || '（未命名）' }}</span>
          <span v-if="!coordOf(row.place.id) && isGeo(row.place) && row.place.id !== 'continent'" class="tree-flag" title="没有地图位置">⌖</span>
          <span v-if="placeIssueLevel.get(row.place.id)" class="issue-dot" :class="placeIssueLevel.get(row.place.id)" title="有问题"></span>
          <span v-if="row.kids" class="muted small">{{ row.kids }}</span>
        </div>
        <div v-if="!treeRows.length" class="empty">没有符合条件的地点</div>
      </div>

      <div v-else-if="tab === 'edges'" class="mapx-list">
        <div v-for="e in visibleEdges" :key="e.id" class="list-row" :class="{ active: selected.type === 'edge' && selected.id === e.id }" @click="select('edge', e.id, { center: true })">
          <div class="row" style="gap:6px"><b class="grow">{{ placeName(e.from) }} {{ e.bidirectional === false ? '→' : '↔' }} {{ placeName(e.to) }}</b><span v-if="edgeIssueLevel.get(e.id)" class="issue-dot" :class="edgeIssueLevel.get(e.id)"></span></div>
          <div class="muted small">{{ transportText(e) || '没有交通方式' }}</div>
        </div>
        <div v-if="!visibleEdges.length" class="empty">没有符合条件的路线</div>
      </div>

      <div v-else class="mapx-list">
        <div v-for="(i, n) in issueList" :key="n" class="list-row" @click="select(i.type, i.id, { center: true })">
          <div class="row" style="gap:6px"><span class="badge" :style="{ '--c': i.level === 'bad' ? 'var(--danger)' : i.level === 'warn' ? 'var(--warning)' : 'var(--muted)' }">{{ i.level === 'bad' ? '错误' : i.level === 'warn' ? '提醒' : '参考' }}</span><b class="grow">{{ i.text }}</b></div>
          <div class="muted small">{{ targetText(i) }}{{ i.detail ? ' · ' + i.detail : '' }}</div>
        </div>
        <div v-if="!issueList.length" class="empty">没有问题 🎉</div>
      </div>
    </aside>

    <!-- 中：地图 -->
    <section class="mapx-map">
      <div class="mapx-toolbar">
        <div class="seg">
          <button v-for="[id, name, desc] in TOOLS" :key="id" :class="{ on: tool === id && !placing }" :title="desc" @click="setTool(id)">{{ name }}</button>
        </div>
        <div class="seg">
          <button title="缩小" @click="setZoom(mapState.zoom / 1.3)">−</button>
          <button title="适合窗口" @click="fit">{{ Math.round(mapState.zoom * 100) }}%</button>
          <button title="放大" @click="setZoom(mapState.zoom * 1.3)">＋</button>
        </div>
        <label class="check"><input type="checkbox" v-model="showEdges" /> 路线</label>
        <label class="check"><input type="checkbox" v-model="showLabels" /> 名称</label>
        <label class="check" title="选中一个地点后，淡化和它无关的点和线"><input type="checkbox" v-model="dimOthers" /> 突出相关</label>
        <select v-model="colorMode" style="width:auto"><option v-for="(m, k) in COLOR_MODES" :key="k" :value="k">颜色：{{ m.name }}</option></select>
      </div>
      <div class="mapx-viewport" ref="viewport" :class="'tool-' + (placing ? 'add' : tool)" @wheel="onWheel" @pointerdown="onPointerDown">
        <div class="map-canvas" :style="{ width: canvasW + 'px', height: canvasH + 'px' }">
          <img src="/_workbench/map-image" alt="" draggable="false" @load="onImageLoad" @error="onImageError" />
          <svg v-if="showEdges" class="map-lines" :viewBox="'0 0 ' + natural.w + ' ' + natural.h" preserveAspectRatio="none">
            <g v-for="l in lines" :key="l.id" :data-edge="l.id" :class="['map-line', { active: l.active, related: l.related, faded: l.faded, na: l.na }]">
              <title>{{ l.title }}</title>
              <path class="hit" :d="l.d" />
              <path class="stroke" :d="l.d" />
            </g>
          </svg>
          <div v-for="p in points" :key="p.id" :data-point="p.id" class="map-point"
            :class="{ active: p.active, related: p.related, faded: p.faded, pending: p.pending, big: p.important, labeled: showLabels || p.active || p.related }"
            :style="{ left: p.x + '%', top: p.y + '%', '--c': p.color }" :title="p.name"><span>{{ p.name }}</span></div>
        </div>
        <div v-if="mapState.loading" class="map-loading"><span class="spinner"></span>正在加载地图底图…（第一次需要下载）</div>
        <div v-if="mapState.failed" class="map-loading error">{{ mapState.failed }}</div>
      </div>
      <div class="mapx-hint">
        <span class="grow">{{ hint }}</span>
        <span class="legend"><span v-for="[c, n] in COLOR_MODES[colorMode].legend" :key="n"><i :style="{ background: c }"></i>{{ n }}</span></span>
      </div>
    </section>

    <!-- 右：详情与编辑 -->
    <aside class="mapx-detail">
      <template v-if="selectedPlace">
        <div class="detail-head">
          <div class="crumbs"><a v-for="p in parentChain(selectedPlace.id)" :key="p.id" @click="select('place', p.id, { center: true })">{{ p.name }}</a></div>
          <h2>{{ selectedPlace.name || '（未命名）' }}</h2>
          <div class="row small" style="gap:6px;margin-top:6px">
            <span class="badge">{{ isGeo(selectedPlace) ? '地理点' : '非地理点' }}</span>
            <span v-if="coordOf(selectedPlace.id)" class="badge" style="--c:var(--success)">有地图位置</span>
            <span v-else class="badge" style="--c:var(--warning)">没有地图位置</span>
            <button class="btn ghost small" @click="centerOn('place', selectedPlace.id)">在地图上定位</button>
          </div>
        </div>

        <section class="dsec">
          <h3>基本信息</h3>
          <label class="field"><span class="field-label">名称</span><input :value="selectedPlace.name" @change="renamePlaceName(selectedPlace, $event.target.value)" /></label>
          <label class="field"><span class="field-label">上级地点 <span class="key">它位于哪里，不代表能直接走过去</span></span>
            <select :value="selectedPlace.parent ?? ''" @change="changeParent(selectedPlace, $event.target.value)">
              <option value="">（最上层）</option>
              <option v-for="o in parentOptions(selectedPlace)" :key="o.place.id" :value="o.place.id">{{ '　'.repeat(o.depth) + o.place.name }}</option>
            </select></label>
          <div class="field"><span class="field-label">重要性</span>
            <div class="seg">
              <button v-for="[v, n] in [[3, '3 核心'], [2, '2 常用'], [1, '1 补充'], [null, '未填']]" :key="String(v)" :class="{ on: (selectedPlace.importance ?? null) === v }" @click="setField(selectedPlace, ['importance'], v)">{{ n }}</button>
            </div></div>
          <label class="switch"><input type="checkbox" :checked="isGeo(selectedPlace)" @change="setField(selectedPlace, ['is_geographic'], $event.target.checked)" />
            <span><b>地理点</b><span class="muted small">角色能从这里出发或抵达（城市、港口、山口…）。事件图标、说明性标记请关掉。</span></span></label>
          <label class="switch"><input type="checkbox" :checked="!!selectedPlace.is_waypoint" @change="setField(selectedPlace, ['is_waypoint'], $event.target.checked)" />
            <span><b>路线中继点</b><span class="muted small">关口、驿站、航线转折点这类，路线会经过这里。</span></span></label>
        </section>

        <section class="dsec">
          <h3>描述</h3>
          <label class="field"><span class="field-label">简述</span><input :value="selectedPlace.description?.brief ?? ''" @change="setField(selectedPlace, ['description', 'brief'], $event.target.value)" /></label>
          <label class="field"><span class="field-label">详述</span><textarea rows="4" :value="selectedPlace.description?.detail ?? ''" @change="setField(selectedPlace, ['description', 'detail'], $event.target.value)"></textarea></label>
          <div class="field"><span class="field-label">标签 <span class="key">简短分类，如「港口」「高危区域」</span></span><chip-input :model-value="arr(selectedPlace.labels)" @update:model-value="setField(selectedPlace, ['labels'], $event)" /></div>
          <div class="field"><span class="field-label">关键词 <span class="key">帮助识别这个地点的其他叫法，不会显示</span></span><chip-input :model-value="arr(selectedPlace.keywords)" @update:model-value="setField(selectedPlace, ['keywords'], $event)" /></div>
          <label class="field"><span class="field-label">备注</span><textarea rows="2" :value="selectedPlace.notes ?? ''" @change="setOptionalText(selectedPlace, ['notes'], $event.target.value)"></textarea></label>
        </section>

        <section class="dsec">
          <h3>地图位置与标记 <span class="muted small" style="font-weight:400">状态栏地图上显示的点</span></h3>
          <template v-if="coordOf(selectedPlace.id)">
            <div class="row small muted">位置：横 {{ coordOf(selectedPlace.id).nx.toFixed(4) }}，纵 {{ coordOf(selectedPlace.id).ny.toFixed(4) }}</div>
            <div class="row"><button class="btn small" @click="startPlacing(selectedPlace)">在地图上重新放置</button><button class="btn small" @click="setTool('move')">拖动调整</button><button class="btn small danger" @click="confirmRemovePosition(selectedPlace)">删除位置</button></div>
          </template>
          <template v-else>
            <p class="muted small">{{ selectedPlace.marker_id ? '这个地点登记了地图标记，但找不到标记数据。' : '还没有地图位置。' }}</p>
            <div class="row"><button class="btn small primary" @click="startPlacing(selectedPlace)">在地图上放置</button></div>
          </template>
          <template v-if="markerOf(selectedPlace) && selectedPlace.marker">
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
              <label class="field"><span class="field-label">标记名称</span><input :value="selectedPlace.marker.name ?? ''" @change="setField(selectedPlace, ['marker', 'name'], $event.target.value)" /></label>
              <label class="field"><span class="field-label">分组</span><input :value="selectedPlace.marker.group ?? ''" @change="setField(selectedPlace, ['marker', 'group'], $event.target.value)" /></label>
              <label class="field"><span class="field-label">图标 <span class="key">Font Awesome 类名</span></span><input :value="selectedPlace.marker.icon ?? ''" @change="setField(selectedPlace, ['marker', 'icon'], $event.target.value)" /></label>
              <label class="field"><span class="field-label">颜色</span><span class="row" style="flex-wrap:nowrap;gap:6px"><input type="color" style="width:42px;padding:2px" :value="/^#[0-9a-f]{6}$/i.test(selectedPlace.marker.color) ? selectedPlace.marker.color : '#78c6ff'" @change="setField(selectedPlace, ['marker', 'color'], $event.target.value)" /><input :value="selectedPlace.marker.color ?? ''" @change="setField(selectedPlace, ['marker', 'color'], $event.target.value)" /></span></label>
            </div>
            <label class="field"><span class="field-label">标记描述 <span class="key">地图上点开这个点时显示</span></span><textarea rows="5" :value="selectedPlace.marker.description ?? ''" @change="setField(selectedPlace, ['marker', 'description'], $event.target.value)"></textarea></label>
            <label class="field"><span class="field-label">图片链接 <span class="key">一行一个</span></span><textarea rows="2" :value="arr(selectedPlace.marker.imageUrls).join('\\n')" @change="setField(selectedPlace, ['marker', 'imageUrls'], $event.target.value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean))"></textarea></label>
          </template>
        </section>

        <section class="dsec">
          <h3>层级 <span class="muted small" style="font-weight:400">下级 {{ children(selectedPlace.id).length }} 个</span></h3>
          <div class="mini-list"><a v-for="c in children(selectedPlace.id)" :key="c.id" @click="select('place', c.id, { center: true })">{{ c.name }}</a></div>
          <div class="row">
            <button class="btn small" @click="addChild(selectedPlace.id)">＋ 新增下级地点</button>
            <button class="btn small" @click="addChild(selectedPlace.parent ?? 'continent')">＋ 新增同级地点</button>
            <button class="btn small" :disabled="!selectedPlace.parent" @click="promote(selectedPlace)">上移一级</button>
            <button class="btn small" :disabled="selectedPlace.id === 'continent' || selectedPlace.parent === 'continent'" @click="changeParent(selectedPlace, 'continent')">挂到大陆下</button>
          </div>
          <p class="muted small">也可以在左侧地点树里把一个地点拖到另一个地点上，改变它的上级。</p>
        </section>

        <section class="dsec">
          <h3>路线 <span class="muted small" style="font-weight:400">{{ edgesOf(selectedPlace.id).length }} 条</span></h3>
          <div class="mini-list"><a v-for="e in edgesOf(selectedPlace.id)" :key="e.id" @click="select('edge', e.id, { center: true })">{{ placeName(e.from) }} ↔ {{ placeName(e.to) }}<span class="muted small">　{{ transportText(e) }}</span></a></div>
          <div class="row"><button class="btn small" :disabled="!isGeo(selectedPlace)" @click="startEdgeFrom(selectedPlace)">＋ 从这里新建路线</button></div>
        </section>

        <section class="dsec">
          <h3>检查结果</h3>
          <div v-for="(i, n) in issuesFor('place', selectedPlace.id)" :key="n" class="banner" :class="i.level === 'bad' ? 'error' : i.level === 'warn' ? 'warn' : 'info'"><div class="grow">{{ i.text }}{{ i.detail ? '：' + i.detail : '' }}</div></div>
          <p v-if="!issuesFor('place', selectedPlace.id).length" class="muted small">没有问题。</p>
        </section>

        <details class="dsec">
          <summary>高级</summary>
          <label class="field"><span class="field-label">编号 <span class="key">程序内部引用用；修改后会同步更新下级和路线里的引用</span></span><input :value="selectedPlace.id" @change="renamePlace(selectedPlace, $event.target.value)" /></label>
          <details><summary>查看原始数据</summary><pre class="output">{{ yamlOf(selectedPlace) }}</pre></details>
          <div class="row" style="margin-top:8px"><button class="btn small danger" @click="confirmDeletePlace(selectedPlace)">删除这个地点</button></div>
        </details>
      </template>

      <template v-else-if="selectedEdge">
        <div class="detail-head">
          <div class="crumbs">路线</div>
          <h2>{{ placeName(selectedEdge.from) }} {{ selectedEdge.bidirectional === false ? '→' : '↔' }} {{ placeName(selectedEdge.to) }}</h2>
          <div class="row small" style="gap:6px;margin-top:6px"><span class="badge">{{ transportText(selectedEdge) || '没有交通方式' }}</span><button class="btn ghost small" @click="centerOn('edge', selectedEdge.id)">在地图上定位</button></div>
        </div>
        <section class="dsec">
          <h3>连接</h3>
          <label class="field"><span class="field-label">起点</span><select :value="selectedEdge.from" @change="setField(selectedEdge, ['from'], $event.target.value)"><option v-for="o in geoPlaces" :key="o.place.id" :value="o.place.id">{{ '　'.repeat(o.depth) + o.place.name }}</option></select></label>
          <label class="field"><span class="field-label">终点</span><select :value="selectedEdge.to" @change="setField(selectedEdge, ['to'], $event.target.value)"><option v-for="o in geoPlaces" :key="o.place.id" :value="o.place.id">{{ '　'.repeat(o.depth) + o.place.name }}</option></select></label>
          <div class="row" style="gap:6px"><a class="small" @click="select('place', selectedEdge.from, { center: true })">查看起点</a><a class="small" @click="select('place', selectedEdge.to, { center: true })">查看终点</a></div>
          <label class="switch"><input type="checkbox" :checked="selectedEdge.bidirectional !== false" @change="setField(selectedEdge, ['bidirectional'], $event.target.checked)" />
            <span><b>双向通行</b><span class="muted small">单向传送、季风航线这类只能单向走的请关掉。</span></span></label>
          <div class="field"><span class="field-label">重要性</span>
            <div class="seg"><button v-for="[v, n] in [[3, '3 骨干'], [2, '2 常规'], [1, '1 局部']]" :key="String(v)" :class="{ on: (selectedEdge.importance ?? null) === v }" @click="setField(selectedEdge, ['importance'], v)">{{ n }}</button></div></div>
        </section>
        <section class="dsec">
          <h3>交通方式与耗时</h3>
          <datalist id="direction-list"><option v-for="d in ['西-东', '东-西', '北-南', '南-北', '西北-东南', '西南-东北', '城市内部', '地面-天空']" :key="d" :value="d"></option></datalist>
          <datalist id="transport-list"><option v-for="t in allTransports" :key="t" :value="t"></option></datalist>
          <div v-for="(seg, i) in selectedEdge.segments" :key="i" class="seg-card">
            <div v-if="selectedEdge.segments.length > 1" class="row"><b class="grow small">第 {{ i + 1 }} 段</b><button class="btn ghost small danger" @click="removeSegment(selectedEdge, i)">删除这一段</button></div>
            <div class="grid" style="grid-template-columns:1fr 110px;gap:10px">
              <label class="field"><span class="field-label">交通方式 <span class="key">不相通写「不适用」</span></span><input list="transport-list" :value="seg.transport ?? ''" @change="setField(seg, ['transport'], $event.target.value.trim())" /></label>
              <label class="field"><span class="field-label">单程天数</span><input type="number" min="0" step="0.1" :value="seg.days ?? ''" placeholder="未知" @change="setDays(seg, $event.target.value)" /></label>
            </div>
            <div class="field"><span class="field-label">经过的地形</span><chip-input :model-value="arr(seg.terrain)" placeholder="如 平原、森林" @update:model-value="setField(seg, ['terrain'], $event)" /></div>
            <div class="field"><span class="field-label">方位 <span class="key">起点一侧-终点一侧，如「西-东」表示由西向东</span></span>
              <span class="row" style="flex-wrap:nowrap;gap:6px"><input list="direction-list" :value="seg.direction ?? ''" @change="setField(seg, ['direction'], $event.target.value.trim())" />
              <button class="btn small" :disabled="!suggestDirection(selectedEdge.from, selectedEdge.to)" title="根据两个地点在地图上的位置自动判断" @click="setField(seg, ['direction'], suggestDirection(selectedEdge.from, selectedEdge.to))">按地图填</button></span></div>
            <label class="field"><span class="field-label">说明</span><textarea rows="2" :value="seg.description ?? ''" @change="setOptionalText(seg, ['description'], $event.target.value)"></textarea></label>
          </div>
          <div class="row"><button class="btn small" @click="addSegment(selectedEdge)">＋ 添加一段</button><span class="muted small">一般一段就够；途中换乘才需要分段。</span></div>
        </section>
        <section class="dsec">
          <h3>路线说明</h3>
          <label class="field"><span class="field-label">简述</span><input :value="selectedEdge.description?.brief ?? ''" @change="setOptionalText(selectedEdge, ['description', 'brief'], $event.target.value)" /></label>
          <label class="field"><span class="field-label">详述</span><textarea rows="3" :value="selectedEdge.description?.detail ?? ''" @change="setOptionalText(selectedEdge, ['description', 'detail'], $event.target.value)"></textarea></label>
          <label class="field"><span class="field-label">备注</span><textarea rows="2" :value="selectedEdge.notes ?? ''" @change="setOptionalText(selectedEdge, ['notes'], $event.target.value)"></textarea></label>
        </section>
        <section class="dsec">
          <h3>检查结果</h3>
          <div v-for="(i, n) in issuesFor('edge', selectedEdge.id)" :key="n" class="banner" :class="i.level === 'bad' ? 'error' : i.level === 'warn' ? 'warn' : 'info'"><div class="grow">{{ i.text }}{{ i.detail ? '：' + i.detail : '' }}</div></div>
          <p v-if="!issuesFor('edge', selectedEdge.id).length" class="muted small">没有问题。</p>
        </section>
        <details class="dsec">
          <summary>高级</summary>
          <label class="field"><span class="field-label">编号</span><input :value="selectedEdge.id" @change="renameEdge(selectedEdge, $event.target.value)" /></label>
          <details><summary>查看原始数据</summary><pre class="output">{{ yamlOf(selectedEdge) }}</pre></details>
          <div class="row" style="margin-top:8px"><button class="btn small danger" @click="confirmDeleteEdge(selectedEdge)">删除这条路线</button></div>
        </details>
      </template>

      <div v-else class="detail-empty">
        <h2>怎么用</h2>
        <ol class="howto">
          <li>点地图上的点、左侧的地点树或路线，右边就会显示它的信息，可以直接修改。</li>
          <li>地图上方的工具：<b>移动地点</b>拖点改位置，<b>新增地点</b>在地图上点一下，<b>新建路线</b>依次点两个地点。</li>
          <li>改完点右上角<b>保存</b>。没保存的修改会自动暂存在浏览器里，不会丢；改错了可以<b>撤销</b>。</li>
          <li>保存后要重新构建或推送到酒馆，游戏里才会更新。</li>
        </ol>
        <p class="muted small" style="margin-top:12px">左侧「问题」里列出了数据检查发现的问题，点一下就能跳到对应的地点或路线。</p>
        <button class="btn small" style="margin-top:12px" @click="showHelp = true">详细说明</button>
      </div>
    </aside>
  </div>

  <div v-if="dialog" class="modal-back" @click.self="dialog = null">
    <div class="modal">
      <h2>{{ dialog.title }}</h2>
      <p>{{ dialog.body }}</p>
      <div v-if="dialog.options" class="modal-options">
        <label v-for="[v, n] in dialog.options" :key="v" class="row" style="flex-wrap:nowrap;align-items:flex-start"><input type="radio" :value="v" v-model="dialog.choice" style="width:auto;margin-top:4px" /> <span>{{ n }}</span></label>
        <select v-if="dialog.choice === 'move'" v-model="dialog.target"><option value="">请选择…</option><option v-for="o in dialog.moveTargets" :key="o.place.id" :value="o.place.id">{{ '　'.repeat(o.depth) + o.place.name }}</option></select>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn" @click="dialog = null">取消</button>
        <button class="btn" :class="dialog.danger ? 'danger-solid' : 'primary'" @click="runDialog">{{ dialog.confirm }}</button>
      </div>
    </div>
  </div>

  <div v-if="showHelp" class="modal-back" @click.self="showHelp = false">
    <div class="modal wide">
      <div class="row"><h2 class="grow">地图使用说明</h2><button class="btn ghost small" @click="showHelp = false">关闭</button></div>
      <h3>这里管理什么</h3>
      <p><b>地点</b>按层级排成一棵树（大陆 → 国家 → 省 → 城市）。带地图位置的地点会显示在状态栏地图上。<b>路线</b>连接两个地点，写着交通方式、天数和地形，世界书里的「长途移动」靠它告诉 AI 怎么走、要几天。</p>
      <h3>最容易搞混的两条规则</h3>
      <ul>
        <li><b>上级只表示「位于哪里」，不表示能走过去。</b>两个城市都属于帝国，不代表它们之间有路；只有路线才表示能通行。</li>
        <li><b>地理点</b>是角色能出发或抵达的地方（国家、城市、村落、港口、山口、驿站）。事件标记、商船、图标说明这类只用来展示的，要设为非地理点，它们不能作为路线的两端。</li>
      </ul>
      <h3>填写建议</h3>
      <ul>
        <li>重要性：3 是核心地点 / 骨干路线，2 常用，1 补充。</li>
        <li>新增地点时，如果世界书里已经有这个地点，填好名称即可；没有的话，要补上简述和详述。</li>
        <li>新增路线时，填好交通方式、单程天数和经过的地形。天数不知道就留空。一般一段就够了。</li>
        <li>交通方式写「不适用」表示两地只是相邻或被阻隔，这时天数要留空。</li>
        <li>删除地点会同时删除和它相连的路线；有下级的地点删除时会问你怎么处理下级。</li>
      </ul>
      <h3>操作</h3>
      <ul>
        <li>地图：滚轮缩放，按住拖动平移；点击百分比按钮回到适合窗口的大小。</li>
        <li>快捷键：Ctrl+S 保存，Ctrl+Z 撤销，Ctrl+Y 重做，Esc 取消当前工具。</li>
        <li>左侧地点树里可以把一个地点拖到另一个地点上，改变它的上级。</li>
      </ul>
    </div>
  </div>
</div>`,
};

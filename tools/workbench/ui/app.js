import { createApp, ref, computed, onMounted } from "/vendor/vue.js";
import { toasts, connection, api } from "./lib.js";
import { OverviewView, HistoryView } from "./pages.js";
import { MapView } from "./map-view.js";
import { CatalogsView } from "./catalogs.js";
import { SyncView } from "./sync.js";
import { ReleaseView } from "./release.js";
import { ThemeView } from "./theme-view.js";

const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const NAV = [
  { id: "overview", name: "概览", icon: icon('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>') },
  { id: "catalogs", name: "开局数据", icon: icon('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>') },
  { id: "map", name: "地图", icon: icon('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>') },
  { id: "theme", name: "状态栏主题", icon: icon('<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="15.5" cy="10" r="1.3"/><path d="M12 21a2.5 2.5 0 010-5h1.5a2 2 0 002-2"/>') },
  { id: "sync", name: "推送到酒馆", icon: icon('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>') },
  { id: "release", name: "版本与发布", icon: icon('<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>') },
  { id: "history", name: "修改记录", icon: icon('<path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.4"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/>') },
];
const VIEWS = { overview: OverviewView, catalogs: CatalogsView, map: MapView, theme: ThemeView, sync: SyncView, release: ReleaseView, history: HistoryView };

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return VIEWS[parts[0]] ? parts : ["overview"];
}

createApp({
  setup() {
    const route = ref(parseHash());
    window.addEventListener("hashchange", () => {
      const next = parseHash();
      // 同一页内的子路径变化（例如切换数据文件）不重新创建页面。
      if (next[0] !== route.value[0]) route.value = next;
    });
    const view = computed(() => VIEWS[route.value[0]]);
    const go = (id) => (location.hash = `#/${id}`);
    onMounted(() => setInterval(() => api("/_workbench/catalogs").catch(() => {}), 20000));
    return { NAV, route, view, go, toasts, connection };
  },
  template: `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <svg viewBox="0 0 32 32"><g fill="#d26f22"><circle cx="16" cy="16" r="4"/><path d="M16 2l2 9h-4zM16 30l-2-9h4zM2 16l9-2v4zM30 16l-9 2v-4zM6 6l8 5-3 3zM26 26l-8-5 3-3zM26 6l-5 8-3-3zM6 26l5-8 3 3z"/></g></svg>
        <div><div class="brand-title">命定之诗</div><div class="brand-sub">工作台</div></div>
      </div>
      <button v-for="item in NAV" :key="item.id" class="nav" :class="{ active: route[0] === item.id }" @click="go(item.id)">
        <span v-html="item.icon" style="display:flex"></span>{{ item.name }}
      </button>
      <div class="sidebar-foot">
        <span class="dot" :class="{ off: !connection.online }"></span>
        <span>{{ connection.online ? '工作台服务运行中' : '服务已断开，请重新双击「打开工作台」' }}</span>
      </div>
    </aside>
    <main class="main">
      <component :is="view" :key="route[0]" :route="route.slice(1)" />
    </main>
    <div class="toasts"><div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div></div>
  </div>`,
}).mount("#app");

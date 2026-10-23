// 状态栏主题：改 8 套预设主题的颜色，实时预览，直接保存回 theme-presets.ts。
import { ref, computed, onMounted, onBeforeUnmount } from "/vendor/vue.js";
import { api, toast, clone, same } from "./lib.js";
import { previewHtml } from "./theme-preview.js";

const GROUPS = [
  { label: "窗口外框", keys: ["windowBg", "windowBorder"] },
  { label: "标题栏", keys: ["titleBarBg", "titleBarText", "titleBarIcon", "titleBarBtnHover"] },
  { label: "页签栏", keys: ["tabBarBg", "tabText", "tabActiveText", "tabIndicator", "tabHoverBg"] },
  { label: "内容区", keys: ["contentBg", "cardBg", "cardBorder", "surfaceMuted", "overlayBg"] },
  { label: "文字", keys: ["textPrimary", "textSecondary", "textMuted"] },
  { label: "资源条", keys: ["resourceHp", "resourceMp", "resourceSp", "resourceExp", "resourceText"] },
  { label: "品质颜色", keys: ["qualityCommon", "qualityUncommon", "qualityRare", "qualityEpic", "qualityLegendary", "qualityMythic", "qualityUnique"] },
  { label: "按钮与提示", keys: ["primaryBg", "primaryText", "success", "warning", "error", "errorText", "errorSolidText"] },
  { label: "命定系统", keys: ["affection", "affectionBg", "affectionText", "tagPresent", "tagPresentText", "tagContract", "tagContractText"] },
  { label: "登神长阶", keys: ["ascensionElement", "ascensionPower", "ascensionLaw"] },
  { label: "货币", keys: ["currencyGold", "currencySilver", "currencyCopper"] },
];
const NAMES = {
  windowBg: "窗口背景", windowBorder: "窗口边框",
  titleBarBg: "标题栏背景", titleBarText: "标题栏文字", titleBarIcon: "标题栏图标", titleBarBtnHover: "标题栏按钮悬停",
  tabBarBg: "页签栏背景", tabText: "页签文字", tabActiveText: "选中页签文字", tabIndicator: "选中下划线", tabHoverBg: "页签悬停",
  contentBg: "内容区背景", cardBg: "卡片背景", cardBorder: "卡片边框", surfaceMuted: "弱化底色", overlayBg: "遮罩",
  textPrimary: "主要文字", textSecondary: "次要文字", textMuted: "淡色文字",
  resourceHp: "生命", resourceMp: "法力", resourceSp: "体力", resourceExp: "经验", resourceText: "资源数值",
  qualityCommon: "普通", qualityUncommon: "优良", qualityRare: "稀有", qualityEpic: "史诗", qualityLegendary: "传说", qualityMythic: "神话", qualityUnique: "唯一",
  primaryBg: "主按钮背景", primaryText: "主按钮文字", success: "成功", warning: "警告", error: "错误", errorText: "错误文字", errorSolidText: "错误底上的文字",
  affection: "好感度条", affectionBg: "好感度底", affectionText: "好感度数值", tagPresent: "「在场」标签底", tagPresentText: "「在场」标签字", tagContract: "「契约」标签底", tagContractText: "「契约」标签字",
  ascensionElement: "元素", ascensionPower: "权能", ascensionLaw: "法则",
  currencyGold: "金币", currencySilver: "银币", currencyCopper: "铜币",
};
const kebab = (key) => key.replace(/([A-Z])/g, "-$1").toLowerCase();

// 支持 #rgb、#rrggbb、#rrggbbaa、rgb()/rgba()；color-mix 之类的表达式只能改文字。
export function parseColor(v) {
  const s = String(v ?? "").trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i.exec(s);
  if (m) return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a: m[4] === undefined ? 1 : m[4].endsWith("%") ? +m[4].slice(0, -1) / 100 : +m[4] };
  return null;
}
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export function formatColor(c) {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a >= 0.999 ? base : base + hex2(c.a * 255);
}

export const ThemeView = {
  props: { route: { type: Array, default: () => [] } },
  setup() {
    const loaded = ref(null); // { hash, themes }
    const working = ref([]);
    const current = ref("");
    const error = ref("");
    const saving = ref(false);
    const peeking = ref(false);
    const collapsed = ref({});
    const undoStack = [];
    let lastKey = "";

    async function load() {
      error.value = "";
      try {
        const data = await api("/_workbench/themes");
        loaded.value = data;
        working.value = clone(data.themes);
        if (!data.themes.some((t) => t.id === current.value)) current.value = data.themes[0]?.id ?? "";
        undoStack.length = 0;
      } catch (e) {
        error.value = e.message;
      }
    }
    const original = (id) => loaded.value?.themes.find((t) => t.id === id);
    const theme = computed(() => working.value.find((t) => t.id === current.value));
    const shown = computed(() => (peeking.value ? original(current.value) : theme.value));
    const changedIds = computed(() => working.value.filter((t) => !same(t.colors, original(t.id)?.colors)).map((t) => t.id));
    const dirty = computed(() => changedIds.value.length > 0);
    const groups = computed(() => {
      if (!theme.value) return [];
      const known = new Set(GROUPS.flatMap((g) => g.keys));
      const extra = Object.keys(theme.value.colors).filter((k) => !known.has(k));
      return [...GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => k in theme.value.colors) })), ...(extra.length ? [{ label: "其他", keys: extra }] : [])];
    });
    const previewStyle = computed(() => Object.fromEntries(Object.entries(shown.value?.colors ?? {}).map(([k, v]) => [`--theme-${kebab(k)}`, v])));
    const preview = computed(() => (shown.value ? previewHtml(shown.value.colors) : ""));

    function remember(key) {
      const tag = `${current.value}:${key}`;
      if (tag === lastKey) return;
      lastKey = tag;
      undoStack.push({ id: current.value, colors: clone(theme.value.colors) });
      if (undoStack.length > 100) undoStack.shift();
    }
    function setValue(key, value) {
      remember(key);
      theme.value.colors[key] = value;
    }
    function pickColor(key, hex) {
      const old = parseColor(theme.value.colors[key]);
      const c = parseColor(hex);
      setValue(key, formatColor({ ...c, a: old?.a ?? 1 }));
    }
    function setAlpha(key, percent) {
      const c = parseColor(theme.value.colors[key]) ?? { r: 255, g: 255, b: 255, a: 1 };
      setValue(key, formatColor({ ...c, a: percent / 100 }));
    }
    function undo() {
      const entry = undoStack.pop();
      lastKey = "";
      if (!entry) return toast("没有可以撤销的修改");
      working.value.find((t) => t.id === entry.id).colors = entry.colors;
      current.value = entry.id;
    }
    function resetCurrent() {
      if (!confirm(`把「${theme.value.name}」恢复成文件里保存的颜色？`)) return;
      remember("__reset");
      lastKey = "";
      theme.value.colors = clone(original(current.value).colors);
    }
    function discardAll() {
      if (!confirm("放弃所有主题的修改？")) return;
      working.value = clone(loaded.value.themes);
      undoStack.length = 0;
    }
    async function save() {
      const changes = {};
      for (const t of working.value) {
        const before = original(t.id).colors;
        for (const [k, v] of Object.entries(t.colors)) if (v !== before[k]) (changes[t.id] ??= {})[k] = v;
      }
      const names = Object.keys(changes).map((id) => original(id).name).join("、");
      saving.value = true;
      try {
        const res = await api("/_workbench/themes", { body: { hash: loaded.value.hash, changes, summary: `修改状态栏主题：${names}` } });
        loaded.value = res;
        working.value = clone(res.themes);
        undoStack.length = 0;
        toast(`已保存：${names}。构建或推送后在状态栏生效`, "ok", 5000);
      } catch (e) {
        toast(e.message, "error", 6000);
      } finally {
        saving.value = false;
      }
    }
    const beforeUnload = (event) => {
      if (dirty.value) event.preventDefault();
    };
    onMounted(() => {
      window.addEventListener("beforeunload", beforeUnload);
      load();
    });
    onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
    return { loaded, working, current, error, saving, peeking, collapsed, theme, changedIds, dirty, groups, previewStyle, preview, NAMES, parseColor, formatColor, setValue, pickColor, setAlpha, undo, resetCurrent, discardAll, save, original };
  },
  template: `
  <div class="page page-wide">
    <div class="page-head">
      <div>
        <h1>状态栏主题</h1>
        <p>调整状态栏里玩家可选的几套配色，右边实时预览。保存后直接写进前端源码，构建或推送到酒馆后生效。</p>
      </div>
    </div>
    <div v-if="error" class="banner error"><div class="grow">{{ error }}</div></div>
    <template v-else-if="theme">
      <div class="card sticky-bar" style="flex-wrap:wrap">
        <div class="chip-list grow">
          <button v-for="t in working" :key="t.id" class="btn small" :class="{ primary: t.id === current }" @click="current = t.id">
            {{ t.name }}<span v-if="changedIds.includes(t.id)" title="有未保存的修改"> ●</span>
          </button>
        </div>
        <button class="btn small" @click="undo">撤销</button>
        <button class="btn small" @pointerdown="peeking = true" @pointerup="peeking = false" @pointerleave="peeking = false">按住看原来的颜色</button>
        <button class="btn small" :disabled="!changedIds.includes(current)" @click="resetCurrent">还原这套</button>
        <button class="btn small" :disabled="!dirty || saving" @click="discardAll">放弃全部</button>
        <button class="btn primary small" :disabled="!dirty || saving" @click="save"><span v-if="saving" class="spinner"></span>保存{{ changedIds.length ? '（' + changedIds.length + ' 套）' : '' }}</button>
      </div>
      <div class="theme-layout">
        <div class="theme-editor">
          <section v-for="g in groups" :key="g.label" class="card theme-group">
            <button class="theme-group-head" @click="collapsed[g.label] = !collapsed[g.label]">
              <span>{{ collapsed[g.label] ? '▸' : '▾' }} {{ g.label }}</span><span class="muted small">{{ g.keys.length }}</span>
            </button>
            <div v-show="!collapsed[g.label]">
              <div v-for="key in g.keys" :key="key" class="theme-row" :class="{ changed: theme.colors[key] !== original(current).colors[key] }">
                <label class="theme-swatch" :style="{ background: theme.colors[key] }" :title="parseColor(theme.colors[key]) ? '点击选颜色' : '这是公式，只能改右边的文字'">
                  <input v-if="parseColor(theme.colors[key])" type="color" :value="formatColor({ ...parseColor(theme.colors[key]), a: 1 })" @input="pickColor(key, $event.target.value)" />
                </label>
                <div class="theme-name">
                  <div>{{ NAMES[key] ?? key }}</div>
                  <div class="muted small mono">{{ key }}</div>
                </div>
                <input class="mono theme-value" :value="theme.colors[key]" @change="setValue(key, $event.target.value.trim())" />
                <div v-if="parseColor(theme.colors[key])" class="theme-alpha">
                  <span class="muted small">透明度</span>
                  <input type="range" min="0" max="100" :value="Math.round(parseColor(theme.colors[key]).a * 100)" @input="setAlpha(key, +$event.target.value)" />
                  <span class="muted small mono">{{ Math.round(parseColor(theme.colors[key]).a * 100) }}%</span>
                </div>
              </div>
            </div>
          </section>
        </div>
        <div class="theme-preview-wrap">
          <div class="tp" :style="previewStyle" v-html="preview"></div>
          <p class="muted small" style="margin-top:8px">预览是示意界面，用来看颜色搭配；实际效果以酒馆里的状态栏为准。{{ peeking ? '（正在看原来的颜色）' : '' }}</p>
        </div>
      </div>
    </template>
    <div v-else class="empty">正在读取主题…</div>
  </div>`,
};

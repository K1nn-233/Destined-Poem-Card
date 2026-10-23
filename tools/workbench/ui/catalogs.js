import { ref, computed, watch, onMounted, onBeforeUnmount } from "/vendor/vue.js";
import { api, toast, plain, clone, same, diffOps, blankLike, label, rarity, RARITIES, COST_RANGES, ASSET_COST_RANGES, FIELD_ORDER } from "./lib.js";
import { ValueEditor } from "./value-editor.js";
import { WeeklyEditor, CoreGroupsEditor } from "./cores-editors.js";

const ALL = "\u0000全部";
const PAGE = 150;

export const CatalogsView = {
  components: { ValueEditor, WeeklyEditor, CoreGroupsEditor },
  props: { route: { type: Array, default: () => [] } },
  setup(props) {
    const catalogs = ref([]);
    const file = ref("");
    const loaded = ref(null); // { hash, data }
    const loading = ref(false);
    const loadError = ref("");
    const category = ref(ALL);
    const search = ref("");
    const rarityFilter = ref("");
    const limit = ref(PAGE);
    const selection = ref(null); // { category, index, isNew }
    const original = ref(null);
    const draft = ref(null);
    const saving = ref(false);
    const problems = ref([]);
    const sectionDrafts = ref({});

    const meta = computed(() => catalogs.value.find((c) => c.file === file.value));
    const special = computed(() => meta.value?.editor ?? "");
    const isList = computed(() => {
      if (special.value) return false;
      const data = loaded.value?.data;
      return plain(data) && Object.values(data).every((v) => Array.isArray(v) && v.every(plain));
    });
    const categories = computed(() => (isList.value ? Object.keys(loaded.value.data) : []));
    const allRows = computed(() => {
      if (!isList.value) return [];
      const data = loaded.value.data;
      return categories.value.flatMap((cat) => data[cat].map((item, index) => ({ category: cat, index, item })));
    });
    const rows = computed(() => {
      const query = search.value.trim().toLowerCase();
      return allRows.value.filter(({ category: cat, item }) => {
        if (category.value !== ALL && cat !== category.value) return false;
        if (rarityFilter.value && item.rarity !== rarityFilter.value) return false;
        if (!query) return true;
        return JSON.stringify(item).toLowerCase().includes(query);
      });
    });
    // 排序、多选和批量修改（原「自定义开局数据编辑器」的功能）
    const sortBy = ref("");
    const RANK = Object.fromEntries(RARITIES.map((x, i) => [x.value, i]));
    const sortedRows = computed(() => {
      const list = [...rows.value];
      const cost = (r) => (typeof r.item.cost === "number" ? r.item.cost : Infinity);
      if (sortBy.value === "name") list.sort((a, b) => String(a.item.name).localeCompare(String(b.item.name), "zh"));
      else if (sortBy.value === "cost-asc") list.sort((a, b) => cost(a) - cost(b));
      else if (sortBy.value === "cost-desc") list.sort((a, b) => (cost(b) === Infinity ? -1 : cost(b)) - (cost(a) === Infinity ? -1 : cost(a)));
      else if (sortBy.value === "rarity") list.sort((a, b) => (RANK[a.item.rarity] ?? 99) - (RANK[b.item.rarity] ?? 99));
      return list;
    });
    const shownRows = computed(() => sortedRows.value.slice(0, limit.value));
    const picked = ref(new Set());
    const keyOf = (row) => row.category + "|" + row.index;
    const pickedRows = computed(() => allRows.value.filter((row) => picked.value.has(keyOf(row))));
    const allShownPicked = computed(() => shownRows.value.length > 0 && shownRows.value.every((row) => picked.value.has(keyOf(row))));
    function togglePick(row) {
      const next = new Set(picked.value);
      next.has(keyOf(row)) ? next.delete(keyOf(row)) : next.add(keyOf(row));
      picked.value = next;
    }
    function toggleAll() {
      const next = new Set(picked.value);
      for (const row of shownRows.value) allShownPicked.value ? next.delete(keyOf(row)) : next.add(keyOf(row));
      picked.value = next;
    }
    const batchTag = ref("");
    const batchCost = ref("");
    function removeOps(list) {
      return [...list].sort((a, b) => (a.category === b.category ? b.index - a.index : a.category < b.category ? -1 : 1)).map((row) => ({ path: [row.category, row.index], remove: true }));
    }
    function moveOps(list, target) {
      const moving = list.filter((row) => row.category !== target);
      const ops = removeOps(moving);
      let at = loaded.value.data[target].length;
      for (const row of moving) ops.push({ path: [target, at++], insert: true, value: row.item });
      return ops;
    }
    async function runBatch(ops, text) {
      if (!ops.length) return toast("选中的条目不需要改动");
      if (selection.value && !confirm("右边正在编辑的条目会关闭，继续吗？")) return;
      selection.value = null;
      if (await commit(ops, text)) picked.value = new Set();
    }
    const where = () => `${meta.value.label} · ${pickedRows.value.length} 条`;
    function applyRarity(value) {
      if (!value) return;
      runBatch(pickedRows.value.filter((row) => "rarity" in row.item && row.item.rarity !== value).map((row) => ({ path: [row.category, row.index, "rarity"], value })), `批量改稀有度为${rarity(value)?.label} · ${where()}`);
    }
    function applyTag() {
      const tag = batchTag.value.trim();
      if (!tag) return;
      const ops = [];
      for (const row of pickedRows.value) {
        const key = Array.isArray(row.item.tag) ? "tag" : Array.isArray(row.item.标签) ? "标签" : null;
        if (key && !row.item[key].includes(tag)) ops.push({ path: [row.category, row.index, key], value: [...row.item[key], tag] });
      }
      runBatch(ops, `批量加标签「${tag}」 · ${where()}`).then(() => (batchTag.value = ""));
    }
    function applyCost() {
      const delta = Number(batchCost.value);
      if (!delta) return;
      runBatch(pickedRows.value.filter((row) => typeof row.item.cost === "number").map((row) => ({ path: [row.category, row.index, "cost"], value: row.item.cost + delta })), `批量点数${delta > 0 ? "+" : ""}${delta} · ${where()}`).then(() => (batchCost.value = ""));
    }
    function applyMove(target) {
      if (target) runBatch(moveOps(pickedRows.value, target), `批量移到「${target}」 · ${where()}`);
    }
    function applyDelete() {
      if (confirm(`删除选中的 ${pickedRows.value.length} 条？可以在「修改记录」里撤销。`)) runBatch(removeOps(pickedRows.value), `批量删除 · ${where()}`);
    }
    async function moveOne(target) {
      const sel = selection.value;
      if (!target || target === sel.category || dirty.value && !confirm("当前条目有没保存的修改，移动会放弃这些修改，继续吗？")) return;
      const row = { category: sel.category, index: sel.index, item: loaded.value.data[sel.category][sel.index] };
      if (await commit(moveOps([row], target), `移动 ${row.item.name} 到「${target}」`)) selection.value = null;
    }
    // 分类管理
    function askName(text, initial = "") {
      const name = prompt(text, initial)?.trim();
      if (!name) return null;
      if (Object.hasOwn(loaded.value.data, name)) return toast(`已经有叫「${name}」的分类了`, "error"), null;
      return name;
    }
    async function newCategory() {
      const name = askName("新分类叫什么？");
      if (name && (await commit([{ path: [name], value: [] }], `新建分类 ${meta.value.label} · ${name}`))) category.value = name;
    }
    async function renameCategory() {
      const old = category.value;
      const name = askName(`把「${old}」改成什么名字？`, old);
      if (name && (await commit([{ path: [old], rename: name }], `分类改名 ${old} → ${name}`))) category.value = name;
    }
    async function mergeCategory(target) {
      const from = category.value;
      if (!target || !confirm(`把「${from}」的 ${loaded.value.data[from].length} 条全部并入「${target}」，并删掉「${from}」？`)) return;
      const at = loaded.value.data[target].length;
      const ops = loaded.value.data[from].map((item, i) => ({ path: [target, at + i], insert: true, value: item }));
      ops.push({ path: [from], remove: true });
      if (await commit(ops, `合并分类 ${from} → ${target}`)) category.value = target;
    }
    async function deleteCategory() {
      const cat = category.value;
      const count = loaded.value.data[cat].length;
      if (!confirm(count ? `删除分类「${cat}」和里面的 ${count} 条？可以在「修改记录」里撤销。` : `删除空分类「${cat}」？`)) return;
      if (await commit([{ path: [cat], remove: true }], `删除分类 ${meta.value.label} · ${cat}`)) category.value = ALL;
    }
    const hasRarity = computed(() => allRows.value.some((r) => "rarity" in r.item));
    const hasCost = computed(() => allRows.value.some((r) => "cost" in r.item));
    const dirty = computed(() => selection.value && (selection.value.isNew || !same(original.value, draft.value)));
    const sectionDirty = (key) => !same(loaded.value?.data?.[key], sectionDrafts.value[key]);
    const specialDirty = ref(false);
    const anyDirty = computed(() => dirty.value || specialDirty.value || (!isList.value && !special.value && loaded.value && Object.keys(sectionDrafts.value).some(sectionDirty)));

    function summary(item) {
      const parts = [];
      if (item.type) parts.push(item.type);
      if (item.类型) parts.push(item.类型);
      const tags = item.tag ?? item.标签 ?? item.career;
      if (Array.isArray(tags)) parts.push(tags.slice(0, 4).join(" · "));
      if (!parts.length && typeof (item.description ?? item.描述) === "string") parts.push(item.description ?? item.描述);
      return parts.filter(Boolean).join("　");
    }

    async function loadList() {
      catalogs.value = (await api("/_workbench/catalogs")).catalogs;
    }
    function confirmDiscard() {
      return !anyDirty.value || confirm("有还没保存的修改，确定放弃吗？");
    }
    async function open(name, force = false) {
      if (!force && name === file.value && loaded.value) return;
      if (!force && !confirmDiscard()) return;
      file.value = name;
      location.hash = `#/catalogs/${name}`;
      loading.value = true;
      loadError.value = "";
      selection.value = null;
      problems.value = [];
      try {
        const data = await api(`/_workbench/catalogs/${name}`);
        loaded.value = { hash: data.hash, data: data.data };
        resetSections();
        if (!categories.value.includes(category.value)) category.value = ALL;
      } catch (error) {
        loaded.value = null;
        loadError.value = error.message;
      } finally {
        loading.value = false;
        limit.value = PAGE;
      }
    }
    function resetSections() {
      sectionDrafts.value = isList.value || special.value ? {} : clone(loaded.value.data);
      specialDirty.value = false;
    }
    async function saveSpecial(ops, text) {
      if (ops.length && (await commit(ops, text))) specialDirty.value = false;
    }
    function ordered(item) {
      const keys = [...FIELD_ORDER.filter((k) => k in item), ...Object.keys(item).filter((k) => !FIELD_ORDER.includes(k))];
      return Object.fromEntries(keys.map((k) => [k, item[k]]));
    }
    function select(row) {
      if (selection.value && !selection.value.isNew && selection.value.category === row.category && selection.value.index === row.index) return;
      if (dirty.value && !confirm("当前条目有还没保存的修改，确定放弃吗？")) return;
      selection.value = { category: row.category, index: row.index, isNew: false };
      original.value = clone(row.item);
      draft.value = ordered(clone(row.item));
      problems.value = [];
    }
    function startNew(fromItem, cat, index) {
      if (dirty.value && !confirm("当前条目有还没保存的修改，确定放弃吗？")) return;
      cat ??= category.value === ALL ? categories.value[0] : category.value;
      const sample = fromItem ?? loaded.value.data[cat][0] ?? { name: "", description: "" };
      const item = fromItem ? clone(fromItem) : blankLike(sample);
      if (fromItem) item.name = `${fromItem.name}（副本）`;
      else if ("rarity" in item) item.rarity = "common";
      selection.value = { category: cat, index: index ?? loaded.value.data[cat].length, isNew: true };
      original.value = null;
      draft.value = ordered(item);
      problems.value = [];
    }
    function closeEditor() {
      if (dirty.value && !confirm("有还没保存的修改，确定放弃吗？")) return;
      selection.value = null;
    }
    const addableFields = computed(() => {
      if (!selection.value || !draft.value) return [];
      const keys = new Set(loaded.value.data[selection.value.category].flatMap((item) => Object.keys(item)));
      return [...keys].filter((k) => !(k in draft.value) && k !== "isCustom");
    });
    function addField(key) {
      const sample = loaded.value.data[selection.value.category].find((item) => key in item)?.[key];
      draft.value = { ...draft.value, [key]: blankLike(sample) };
    }
    function removeField(key) {
      if (key === "name") return;
      if (!confirm(`删除「${label(key)}」这个字段？`)) return;
      const next = { ...draft.value };
      delete next[key];
      draft.value = next;
    }
    const warnings = computed(() => {
      const item = draft.value;
      if (!item || !selection.value) return [];
      const list = [];
      if (!String(item.name ?? "").trim()) list.push("名称不能为空");
      const twins = loaded.value.data[selection.value.category].filter((other, i) => other.name === item.name && (selection.value.isNew || i !== selection.value.index));
      if (twins.length) list.push(`这个分类里已经有同名条目「${item.name}」`);
      const range = (file.value === "assets.json" ? ASSET_COST_RANGES : COST_RANGES)[item.rarity];
      if (range && typeof item.cost === "number" && (item.cost < range[0] || item.cost > range[1]))
        list.push(`${rarity(item.rarity)?.label}品质的点数通常在 ${range[0]}–${range[1]} 之间，现在是 ${item.cost}`);
      return list;
    });
    const blocking = computed(() => !String(draft.value?.name ?? "").trim());

    async function commit(ops, text) {
      saving.value = true;
      problems.value = [];
      try {
        const result = await api(`/_workbench/catalogs/${file.value}`, { body: { hash: loaded.value.hash, ops, summary: text } });
        loaded.value = { hash: result.hash, data: result.data };
        toast(`已保存：${text}`, "ok");
        return true;
      } catch (error) {
        if (error.code === "CONFLICT") problems.value = [error.message];
        else problems.value = [error.message, ...(Array.isArray(error.details) ? error.details : [])];
        toast("没有保存成功", "error");
        return false;
      } finally {
        saving.value = false;
      }
    }
    async function save() {
      const sel = selection.value;
      const name = draft.value.name;
      const where = `${meta.value.label} · ${sel.category} · ${name}`;
      const ops = sel.isNew ? [{ path: [sel.category, sel.index], insert: true, value: draft.value }] : diffOps(original.value, draft.value, [sel.category, sel.index]);
      if (!ops.length) return;
      if (await commit(ops, `${sel.isNew ? "新增" : "修改"} ${where}`)) {
        selection.value = { ...sel, isNew: false };
        original.value = clone(loaded.value.data[sel.category][sel.index]);
        draft.value = ordered(clone(original.value));
      }
    }
    async function remove() {
      const sel = selection.value;
      if (!confirm(`确定删除「${original.value.name}」吗？\n删除后可以在「修改记录」里撤销。`)) return;
      if (await commit([{ path: [sel.category, sel.index], remove: true }], `删除 ${meta.value.label} · ${sel.category} · ${original.value.name}`)) selection.value = null;
    }
    function revert() {
      if (selection.value.isNew) selection.value = null;
      else draft.value = ordered(clone(original.value));
    }
    async function saveSection(key) {
      const ops = diffOps(loaded.value.data[key], sectionDrafts.value[key], [key]);
      if (ops.length && (await commit(ops, `修改 ${meta.value.label} · ${label(key)}`))) sectionDrafts.value[key] = clone(loaded.value.data[key]);
    }

    const beforeUnload = (event) => {
      if (anyDirty.value) event.preventDefault();
    };
    onMounted(async () => {
      window.addEventListener("beforeunload", beforeUnload);
      try {
        await loadList();
        await open(props.route[0] && catalogs.value.some((c) => c.file === props.route[0]) ? props.route[0] : catalogs.value[0].file, true);
      } catch (error) {
        loadError.value = error.message;
      }
    });
    onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
    watch([category, search, rarityFilter, sortBy], () => (limit.value = PAGE));
    watch(file, () => (picked.value = new Set()));

    return { sortBy, picked, keyOf, pickedRows, allShownPicked, togglePick, toggleAll, batchTag, batchCost, applyRarity, applyTag, applyCost, applyMove, applyDelete, moveOne, newCategory, renameCategory, mergeCategory, deleteCategory, special, specialDirty, saveSpecial, ALL, catalogs, file, meta, loaded, loading, loadError, category, search, rarityFilter, limit, PAGE, selection, draft, saving, problems, sectionDrafts, isList, categories, allRows, rows, shownRows, hasRarity, hasCost, dirty, sectionDirty, summary, open, select, startNew, closeEditor, addableFields, addField, removeField, warnings, blocking, save, remove, revert, saveSection, label, rarity, RARITIES, countOf: (cat) => loaded.value.data[cat].length };
  },
  template: `
  <div class="page page-wide">
    <div class="page-head">
      <div>
        <h1>开局数据</h1>
        <p>自定义开局里玩家能选的背景、装备、道具、技能、伙伴等。保存后重新构建或推送到酒馆即可生效；每次保存都可以在「修改记录」里撤销。</p>
      </div>
    </div>
    <div class="catalog-layout">
      <nav class="file-list">
        <button v-for="c in catalogs" :key="c.file" class="file-item" :class="{ active: c.file === file }" @click="open(c.file)">
          <span class="file-label">{{ c.label }}</span><span class="file-hint">{{ c.hint }}</span>
        </button>
      </nav>

      <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div v-if="loadError" class="banner error"><div class="grow">{{ loadError }}</div></div>
        <div v-else-if="loading || !loaded" class="empty">正在读取…</div>

        <template v-else-if="special">
          <div v-for="p in problems" :key="p" class="banner error"><div class="grow">{{ p }}</div></div>
          <weekly-editor v-if="special === 'weekly'" :data="loaded.data" :saving="saving" @save="saveSpecial" @dirty="specialDirty = $event" />
          <core-groups-editor v-else-if="special === 'cores'" :data="loaded.data" :saving="saving" @save="saveSpecial" @dirty="specialDirty = $event" />
        </template>

        <template v-else-if="isList">
          <div class="tabs">
            <button class="tab" :class="{ active: category === ALL }" @click="category = ALL">全部<span class="count">{{ allRows.length }}</span></button>
            <button v-for="cat in categories" :key="cat" class="tab" :class="{ active: category === cat }" @click="category = cat">{{ cat }}<span class="count">{{ countOf(cat) }}</span></button>
            <button class="tab" title="新建分类" @click="newCategory">＋ 新分类</button>
          </div>
          <div v-if="category !== ALL" class="row small">
            <span class="muted">分类「{{ category }}」：</span>
            <button class="btn small" @click="renameCategory">改名</button>
            <select style="width:auto" @change="mergeCategory($event.target.value); $event.target.value = ''">
              <option value="">合并到…</option>
              <option v-for="c in categories.filter((x) => x !== category)" :key="c" :value="c">{{ c }}</option>
            </select>
            <button class="btn small danger" @click="deleteCategory">删除分类</button>
          </div>
          <div class="row">
            <input class="grow" style="max-width:340px" v-model="search" placeholder="搜索名称、描述、标签…" />
            <select v-if="hasRarity" v-model="rarityFilter" style="width:auto">
              <option value="">全部稀有度</option>
              <option v-for="r in RARITIES" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
            <select v-model="sortBy" style="width:auto">
              <option value="">原始顺序</option>
              <option value="name">按名称</option>
              <option v-if="hasCost" value="cost-asc">点数从低到高</option>
              <option v-if="hasCost" value="cost-desc">点数从高到低</option>
              <option v-if="hasRarity" value="rarity">按稀有度</option>
            </select>
            <span class="muted small grow">共 {{ rows.length }} 条</span>
            <button class="btn primary" @click="startNew()">＋ 新建条目</button>
          </div>

          <div v-if="picked.size" class="card row" style="padding:10px 14px;flex-wrap:wrap;gap:8px">
            <b>已选 {{ pickedRows.length }} 条</b>
            <select v-if="hasRarity" style="width:auto" @change="applyRarity($event.target.value); $event.target.value = ''">
              <option value="">改稀有度…</option>
              <option v-for="r in RARITIES" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
            <input v-model="batchTag" style="width:120px" placeholder="加标签" @keydown.enter="applyTag" />
            <button class="btn small" :disabled="!batchTag.trim()" @click="applyTag">加上</button>
            <input v-if="hasCost" v-model="batchCost" type="number" style="width:90px" placeholder="点数 ±" @keydown.enter="applyCost" />
            <button v-if="hasCost" class="btn small" :disabled="!Number(batchCost)" @click="applyCost">调整</button>
            <select style="width:auto" @change="applyMove($event.target.value); $event.target.value = ''">
              <option value="">移到分类…</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
            <button class="btn small danger" @click="applyDelete">删除选中</button>
            <span class="grow"></span>
            <button class="btn ghost small" @click="picked = new Set()">取消选择</button>
          </div>
          <div class="split" :class="{ single: !selection }">
            <div class="table-wrap">
              <table>
                <thead><tr><th style="width:28px"><input type="checkbox" :checked="allShownPicked" title="全选当前显示的条目" @change="toggleAll" /></th><th>名称</th><th v-if="category === ALL">分类</th><th v-if="hasCost" style="text-align:right">点数</th><th v-if="hasRarity">稀有度</th><th v-if="!selection">概要</th></tr></thead>
                <tbody>
                  <tr v-for="row in shownRows" :key="row.category + row.index" :class="{ selected: selection && !selection.isNew && selection.category === row.category && selection.index === row.index }" @click="select(row)">
                    <td @click.stop><input type="checkbox" :checked="picked.has(keyOf(row))" @change="togglePick(row)" /></td>
                    <td><b>{{ row.item.name }}</b></td>
                    <td v-if="category === ALL" class="muted small" style="white-space:nowrap">{{ row.category }}</td>
                    <td v-if="hasCost" class="num">{{ row.item.cost }}</td>
                    <td v-if="hasRarity"><span v-if="rarity(row.item.rarity)" class="badge" :style="{ '--c': rarity(row.item.rarity).color }">{{ rarity(row.item.rarity).label }}</span></td>
                    <td v-if="!selection" class="summary" :title="summary(row.item)">{{ summary(row.item) }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="!rows.length" class="empty">没有符合条件的条目</div>
              <div v-if="rows.length > limit" class="pager"><button class="btn small" @click="limit += PAGE">再显示 {{ Math.min(PAGE, rows.length - limit) }} 条（还有 {{ rows.length - limit }} 条）</button></div>
            </div>

            <section v-if="selection" class="card editor">
              <div class="editor-head">
                <div class="grow">
                  <h2>{{ selection.isNew ? '新建条目' : (draft.name || '（未命名）') }}</h2>
                  <select v-if="!selection.isNew" style="width:auto;margin-top:4px" :value="selection.category" title="移到别的分类" @change="moveOne($event.target.value)">
                    <option v-for="cat in categories" :key="cat" :value="cat">{{ cat === selection.category ? '分类：' + cat : '移到：' + cat }}</option>
                  </select>
                  <select v-else v-model="selection.category" style="width:auto;margin-top:4px" title="放在哪个分类">
                    <option v-for="cat in categories" :key="cat" :value="cat">放进：{{ cat }}</option>
                  </select>
                </div>
                <button class="btn ghost small" @click="closeEditor">关闭</button>
              </div>
              <div class="editor-body">
                <div v-for="p in problems" :key="p" class="banner error"><div class="grow">{{ p }}</div></div>
                <div v-for="w in warnings" :key="w" class="banner warn"><div class="grow">{{ w }}</div></div>
                <div v-for="(value, key) in draft" :key="key" class="field">
                  <span class="field-label">{{ label(key) }}<span v-if="label(key) !== key" class="key">{{ key }}</span>
                    <button v-if="key !== 'name'" class="btn ghost small remove-field" title="删除这个字段" @click="removeField(key)">移除字段</button>
                  </span>
                  <value-editor v-model="draft[key]" :field-key="key" />
                </div>
                <div v-if="addableFields.length" class="row">
                  <span class="muted small">添加字段：</span>
                  <button v-for="k in addableFields" :key="k" class="btn small" @click="addField(k)">＋ {{ label(k) }}</button>
                </div>
              </div>
              <div class="editor-foot">
                <button class="btn primary" :disabled="!dirty || saving || blocking" @click="save"><span v-if="saving" class="spinner"></span>{{ selection.isNew ? '添加到文件' : '保存修改' }}</button>
                <button class="btn" :disabled="!dirty || saving" @click="revert">{{ selection.isNew ? '取消' : '放弃修改' }}</button>
                <span class="grow"></span>
                <button v-if="!selection.isNew" class="btn small" :disabled="saving" @click="startNew(draft, selection.category, selection.index + 1)">复制一份</button>
                <button v-if="!selection.isNew" class="btn small danger" :disabled="saving" @click="remove">删除</button>
              </div>
            </section>
          </div>
        </template>

        <template v-else>
          <div v-for="p in problems" :key="p" class="banner error"><div class="grow">{{ p }}</div></div>
          <section v-for="(value, key) in loaded.data" :key="key" class="card">
            <div class="card-head">
              <h2>{{ label(key) }} <span v-if="label(key) !== key" class="muted small" style="font-weight:400">{{ key }}</span></h2>
              <div class="row">
                <button v-if="sectionDirty(key)" class="btn small" @click="sectionDrafts[key] = JSON.parse(JSON.stringify(loaded.data[key]))">放弃修改</button>
                <button class="btn primary small" :disabled="!sectionDirty(key) || saving" @click="saveSection(key)">保存</button>
              </div>
            </div>
            <value-editor v-model="sectionDrafts[key]" :field-key="key" />
          </section>
        </template>
      </div>
    </div>
  </div>`,
};

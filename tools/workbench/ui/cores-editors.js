// 首页核心相关的两个专用编辑器：每周推荐核心、核心分类。核心从世界书里读，下拉选择。
import { ref, computed, watch, onMounted } from "/vendor/vue.js";
import { api, clone, same, diffOps } from "./lib.js";

const MAX_PER_WEEK = 4; // 首页「特别推荐」最多显示 4 个（CorePage.ts MAX_SPECIAL_RECOMMEND_COUNT）
const DAY = 24 * 60 * 60 * 1000;

let coresCache = null;
function useCores() {
  const cores = ref(coresCache ?? []);
  const error = ref("");
  onMounted(async () => {
    if (coresCache) return;
    try {
      coresCache = (await api("/_workbench/cores")).cores;
      cores.value = coresCache;
    } catch (e) {
      error.value = `读取世界书核心失败：${e.message}`;
    }
  });
  return { cores, coresError: error };
}
const coreText = (core) => (core.author ? `${core.label} · ${core.author}` : core.label);

// ---------- 每周推荐 ----------
const parseDate = (text) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const fmt = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
function toWeeks(data) {
  return Object.entries(data.weeks ?? {}).map(([key, cores]) => ({
    key,
    cores: Object.entries(cores ?? {}).map(([name, config]) => ({ name, note: config?.note ?? "" })),
  }));
}
function fromWeeks(original, startDate, weeks) {
  const out = { ...clone(original), startDate, weeks: {} };
  weeks.forEach((week, i) => {
    out.weeks[`week${i + 1}`] = Object.fromEntries(
      week.cores.map((c) => {
        const old = original.weeks?.[week.key]?.[c.name];
        return [c.name, { ...(old ?? {}), note: c.note }];
      }),
    );
  });
  return out;
}

export const WeeklyEditor = {
  props: { data: Object, saving: Boolean },
  emits: ["save", "dirty"],
  setup(props, { emit }) {
    const { cores, coresError } = useCores();
    const startDate = ref("");
    const weeks = ref([]);
    function reset() {
      startDate.value = props.data.startDate ?? "";
      weeks.value = toWeeks(props.data);
    }
    watch(() => props.data, reset, { immediate: true });
    const result = computed(() => fromWeeks(props.data, startDate.value, weeks.value));
    const dirty = computed(() => !same(result.value, props.data));
    watch(dirty, (v) => emit("dirty", v), { immediate: true });
    const byName = computed(() => new Map(cores.value.map((c) => [c.name, c])));

    // 和首页同样的算法：从起始日期起每 7 天换下一周，轮完从第 1 周重来。
    const schedule = computed(() => {
      const start = parseDate(startDate.value);
      const total = Math.max(1, weeks.value.length);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!start) return { current: 0, next: [] };
      const days = Math.floor((today - start) / DAY);
      const current = days < 0 ? 0 : Math.floor(days / 7) % total;
      const cycle = days < 0 ? 0 : Math.floor(days / 7 / total);
      const next = weeks.value.map((_, i) => {
        let begin = new Date(start.getTime() + (cycle * total + i) * 7 * DAY);
        if (begin.getTime() + 7 * DAY <= today.getTime()) begin = new Date(begin.getTime() + total * 7 * DAY);
        return { begin, end: new Date(begin.getTime() + 6 * DAY) };
      });
      return { current, next, beforeStart: days < 0 };
    });
    const problems = computed(() => {
      const list = [];
      if (!parseDate(startDate.value)) list.push("轮换起始日期没填对");
      weeks.value.forEach((w, i) => {
        if (w.cores.some((c) => !c.name)) list.push(`第 ${i + 1} 周有一项还没选核心`);
        const names = w.cores.map((c) => c.name).filter(Boolean);
        if (new Set(names).size !== names.length) list.push(`第 ${i + 1} 周有重复的核心`);
      });
      return list;
    });
    function addWeek() {
      weeks.value.push({ key: `new-${Date.now()}`, cores: [] });
    }
    function removeWeek(i) {
      if (weeks.value[i].cores.length && !confirm(`删除第 ${i + 1} 周？后面的周会往前顺延。`)) return;
      weeks.value.splice(i, 1);
    }
    function moveWeek(i, d) {
      const list = weeks.value;
      [list[i], list[i + d]] = [list[i + d], list[i]];
    }
    function usedIn(week, name) {
      return week.cores.some((c) => c.name === name);
    }
    function save() {
      emit("save", diffOps(props.data, result.value, []), "修改 每周推荐核心");
    }
    return { cores, coresError, startDate, weeks, dirty, byName, schedule, problems, MAX_PER_WEEK, coreText, fmt, addWeek, removeWeek, moveWeek, usedIn, save, reset };
  },
  template: `
  <div class="core-editor">
    <div class="card sticky-bar">
      <div class="grow">
        <b>每周推荐核心</b>
        <span class="muted small">首页「特别推荐」每周换一组，按下面的顺序轮流。核心从世界书里读取，直接选就行。</span>
      </div>
      <button class="btn" :disabled="!dirty || saving" @click="reset">放弃修改</button>
      <button class="btn primary" :disabled="!dirty || saving || problems.length > 0" @click="save"><span v-if="saving" class="spinner"></span>保存</button>
    </div>
    <div v-if="coresError" class="banner error"><div class="grow">{{ coresError }}</div></div>
    <div v-for="p in problems" :key="p" class="banner warn"><div class="grow">{{ p }}</div></div>

    <section class="card">
      <div class="row" style="gap:16px;align-items:flex-end;flex-wrap:wrap">
        <label class="field" style="width:200px">
          <span class="field-label">轮换起始日期（第 1 周从这天开始）</span>
          <input type="date" v-model="startDate" />
        </label>
        <p class="muted small grow" v-if="weeks.length">
          共 {{ weeks.length }} 周一轮。
          <template v-if="schedule.beforeStart">还没到起始日期，首页先显示第 1 周。</template>
          <template v-else>今天首页显示的是<b style="color:var(--accent)">第 {{ schedule.current + 1 }} 周</b>。</template>
        </p>
      </div>
    </section>

    <section v-for="(week, i) in weeks" :key="week.key" class="card week-card" :class="{ current: i === schedule.current }">
      <div class="card-head">
        <h2>第 {{ i + 1 }} 周
          <span v-if="i === schedule.current" class="badge" style="--c: var(--accent)">本周</span>
          <span v-if="schedule.next[i]" class="muted small" style="font-weight:400">{{ i === schedule.current ? '' : '下次 ' }}{{ fmt(schedule.next[i].begin) }} – {{ fmt(schedule.next[i].end) }}</span>
        </h2>
        <div class="row">
          <button class="btn ghost small" :disabled="i === 0" title="往前移" @click="moveWeek(i, -1)">↑</button>
          <button class="btn ghost small" :disabled="i === weeks.length - 1" title="往后移" @click="moveWeek(i, 1)">↓</button>
          <button class="btn ghost small danger" @click="removeWeek(i)">删除这周</button>
        </div>
      </div>
      <div class="core-rows">
        <div v-for="(core, j) in week.cores" :key="j" class="core-row">
          <select v-model="core.name" :class="{ missing: core.name && !byName.has(core.name) }">
            <option value="" disabled>选择核心…</option>
            <option v-if="core.name && !byName.has(core.name)" :value="core.name">⚠ 世界书里没有：{{ core.name }}</option>
            <option v-for="c in cores" :key="c.name" :value="c.name" :disabled="c.name !== core.name && usedIn(week, c.name)">{{ coreText(c) }}</option>
          </select>
          <input v-model="core.note" placeholder="推荐语（显示在核心卡片上）" />
          <button class="btn ghost small" title="移除" @click="week.cores.splice(j, 1)">✕</button>
        </div>
        <p v-if="!week.cores.length" class="muted small">这周还没有推荐的核心。</p>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn small" @click="week.cores.push({ name: '', note: '' })">＋ 添加核心</button>
        <span v-if="week.cores.length > MAX_PER_WEEK" class="small" style="color:var(--danger)">首页最多显示 {{ MAX_PER_WEEK }} 个，多出来的不会显示</span>
      </div>
    </section>
    <button class="btn" @click="addWeek">＋ 添加一周</button>
  </div>`,
};

// ---------- 核心分类 ----------
function toGroups(data) {
  return Object.entries(data ?? {}).map(([name, cores]) => ({
    key: name,
    name,
    cores: Object.entries(cores ?? {}).map(([label, config]) => ({ label, note: config?.note ?? "", open: false })),
  }));
}
function fromGroups(original, groups) {
  return Object.fromEntries(
    groups.map((g) => [
      g.name,
      Object.fromEntries(
        g.cores.map((c) => {
          const old = original?.[g.key]?.[c.label];
          return [c.label, { ...(old ?? {}), note: c.note }];
        }),
      ),
    ]),
  );
}
const RESERVED = ["特别推荐", "这是什么杯"];

export const CoreGroupsEditor = {
  props: { data: Object, saving: Boolean },
  emits: ["save", "dirty"],
  setup(props, { emit }) {
    const { cores, coresError } = useCores();
    const groups = ref([]);
    function reset() {
      groups.value = toGroups(props.data);
    }
    watch(() => props.data, reset, { immediate: true });
    const result = computed(() => fromGroups(props.data, groups.value));
    const dirty = computed(() => !same(result.value, props.data));
    watch(dirty, (v) => emit("dirty", v), { immediate: true });
    const labels = computed(() => new Map(cores.value.map((c) => [c.label, c])));
    const grouped = computed(() => new Set(groups.value.flatMap((g) => g.cores.map((c) => c.label))));
    const ungrouped = computed(() => cores.value.filter((c) => !grouped.value.has(c.label)));
    const problems = computed(() => {
      const list = [];
      const names = groups.value.map((g) => g.name.trim());
      if (names.some((n) => !n)) list.push("有分组没有名字");
      if (new Set(names).size !== names.length) list.push("有重名的分组");
      for (const n of names) if (RESERVED.includes(n)) list.push(`「${n}」是首页自带的分组名，换一个`);
      groups.value.forEach((g) => {
        if (g.cores.some((c) => !c.label)) list.push(`「${g.name}」里有一项还没选核心`);
        const l = g.cores.map((c) => c.label).filter(Boolean);
        if (new Set(l).size !== l.length) list.push(`「${g.name}」里有重复的核心`);
      });
      return list;
    });
    // 分类里写了、世界书里却找不到的核心：猜一个最像的给出提示。
    function suggestion(label) {
      const base = label.replace(/核心$/, "");
      return cores.value.find((c) => c.label.replace(/核心$/, "") === base)?.label ?? "";
    }
    function addGroup() {
      groups.value.push({ key: `new-${Date.now()}`, name: "", cores: [] });
    }
    function removeGroup(i) {
      if (groups.value[i].cores.length && !confirm(`删除分组「${groups.value[i].name}」？里面的核心介绍也会一起删掉。`)) return;
      groups.value.splice(i, 1);
    }
    function addTo(group, label) {
      group.cores.push({ label, note: "", open: true });
    }
    function save() {
      emit("save", diffOps(props.data, result.value, []), "修改 核心分类");
    }
    return { cores, coresError, groups, dirty, labels, ungrouped, problems, suggestion, coreText, addGroup, removeGroup, addTo, save, reset };
  },
  template: `
  <div class="core-editor">
    <div class="card sticky-bar">
      <div class="grow">
        <b>核心分类</b>
        <span class="muted small">首页核心列表的分组页签和每个核心的介绍。没分到任何组的核心会出现在「这是什么杯」里。</span>
      </div>
      <button class="btn" :disabled="!dirty || saving" @click="reset">放弃修改</button>
      <button class="btn primary" :disabled="!dirty || saving || problems.length > 0" @click="save"><span v-if="saving" class="spinner"></span>保存</button>
    </div>
    <div v-if="coresError" class="banner error"><div class="grow">{{ coresError }}</div></div>
    <div v-for="p in problems" :key="p" class="banner warn"><div class="grow">{{ p }}</div></div>

    <section v-if="ungrouped.length" class="card">
      <h2>还没分组的核心 <span class="muted small" style="font-weight:400">{{ ungrouped.length }} 个，首页会放进「这是什么杯」</span></h2>
      <div class="chip-list" style="margin-top:8px">
        <span v-for="c in ungrouped" :key="c.name" class="chip" style="padding-right:10px">{{ coreText(c) }}</span>
      </div>
    </section>

    <section v-for="(group, i) in groups" :key="group.key" class="card">
      <div class="card-head">
        <input v-model="group.name" class="group-name" placeholder="分组名称（首页页签）" />
        <button class="btn ghost small danger" @click="removeGroup(i)">删除分组</button>
      </div>
      <div class="core-rows">
        <div v-for="(core, j) in group.cores" :key="j" class="core-block">
          <div class="core-row">
            <select v-model="core.label" :class="{ missing: core.label && !labels.has(core.label) }">
              <option value="" disabled>选择核心…</option>
              <option v-if="core.label && !labels.has(core.label)" :value="core.label">⚠ 世界书里没有：{{ core.label }}</option>
              <option v-for="c in cores" :key="c.name" :value="c.label" :disabled="c.label !== core.label && group.cores.some((x) => x.label === c.label)">{{ coreText(c) }}</option>
            </select>
            <button class="btn ghost small note-toggle" @click="core.open = !core.open">{{ core.open ? '收起介绍' : (core.note ? '编辑介绍' : '＋ 写介绍') }}</button>
            <span class="muted small note-preview grow">{{ core.open ? '' : core.note.replace(/[#*|>\\n-]+/g, ' ').trim() }}</span>
            <button class="btn ghost small" title="移出这个分组" @click="group.cores.splice(j, 1)">✕</button>
          </div>
          <p v-if="core.label && !labels.has(core.label)" class="small" style="color:var(--danger);margin:4px 0 0">
            首页靠名字匹配，这一项匹配不上任何核心。<template v-if="suggestion(core.label)">世界书里有「{{ suggestion(core.label) }}」，<a href="#" @click.prevent="core.label = suggestion(core.label)">改成它</a>？</template>
          </p>
          <textarea v-if="core.open" v-model="core.note" rows="6" placeholder="核心介绍，支持 Markdown" style="margin-top:6px"></textarea>
        </div>
      </div>
      <div class="row" style="margin-top:8px">
        <select style="width:auto" @change="addTo(group, $event.target.value); $event.target.value = ''">
          <option value="">＋ 加入核心…</option>
          <option v-for="c in cores" :key="c.name" :value="c.label" :disabled="group.cores.some((x) => x.label === c.label)">{{ coreText(c) }}</option>
        </select>
      </div>
    </section>
    <button class="btn" @click="addGroup">＋ 新建分组</button>
  </div>`,
};

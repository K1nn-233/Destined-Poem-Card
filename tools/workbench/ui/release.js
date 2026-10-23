import { ref, computed, onMounted } from "/vendor/vue.js";
import { api, toast } from "./lib.js";

const time = (iso) => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "");
const LEVEL_TEXT = { patch: "兼容更新", minor: "不兼容存档", major: "大版本" };
const CHANGE_LEVEL = {
  breaking: { text: "不兼容", color: "var(--danger)" },
  review: { text: "需确认", color: "var(--warn, #c98a12)" },
  compatible: { text: "兼容", color: "var(--ok, #3d8b4f)" },
};
const PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/i;

export const ReleaseView = {
  props: { route: { type: Array, default: () => [] } },
  setup() {
    const overview = ref(null);
    const info = ref(null);
    const infoError = ref("");
    const loadingInfo = ref(false);
    const notes = ref("");
    const notesDirty = ref(false);
    const busy = ref("");
    const result = ref(null);
    const target = ref("");

    async function loadOverview() {
      overview.value = await api("/_workbench/overview").catch(() => null);
    }
    async function loadInfo() {
      loadingInfo.value = true;
      infoError.value = "";
      try {
        info.value = await api("/_workbench/version");
        if (!notesDirty.value) notes.value = info.value.notes;
      } catch (e) {
        infoError.value = e.message;
      } finally {
        loadingInfo.value = false;
      }
    }
    async function saveNotes() {
      busy.value = "notes";
      try {
        await api("/_workbench/notes", { body: { notes: notes.value } });
        notesDirty.value = false;
        toast("更新记录已保存", "ok");
        await loadInfo();
      } catch (e) {
        toast(e.message, "error", 6000);
      } finally {
        busy.value = "";
      }
    }
    // 填的版本号 → 发布后的名字和级别，只做提示，版本号以开发组填的为准。
    const plan = computed(() => {
      const match = PATTERN.exec(target.value.trim());
      const current = info.value && PATTERN.exec(info.value.released.version);
      if (!match || !current) return null;
      const [a, b] = [current.slice(1).map(Number), match.slice(1).map(Number)];
      const diff = b.map((n, i) => n - a[i]).find((n) => n !== 0) ?? 0;
      if (diff <= 0) return { error: `要比当前的 ${info.value.released.version} 大` };
      const level = b[0] !== a[0] ? "major" : b[1] !== a[1] ? "minor" : "patch";
      const name = `${overview.value?.card.name.replace(/v\d+\.\d+$/, "") ?? ""}v${b[0]}.${b[1]}`;
      return { version: `V${b.join(".")}`, level, name, renamed: name !== info.value.released.worldbook };
    });
    const advice = computed(() => {
      if (!plan.value?.level || !info.value) return "";
      if (plan.value.level === "patch" && info.value.suggested !== "patch")
        return "这次有不兼容旧存档的改动（见上面的红色条目或【不兼容】记录），按习惯一般升 0.1。确定要这样发也可以。";
      return "";
    });
    async function publish() {
      const p = plan.value;
      if (!p || p.error) return;
      if (notesDirty.value) return toast("更新记录还没保存，先保存再发版", "error", 5000);
      const lines = [
        `发布 ${p.version}？`,
        "",
        p.renamed ? `角色卡名和世界书名会改成「${p.name}」。` : `角色卡名和世界书名保持「${p.name}」。`,
        "会改写 release.json 的版本号，把「未发布」的更新记录移到新版本下，然后构建正式版并生成发布包。",
        "中途失败会自动还原。大约需要一两分钟。",
      ];
      if (!confirm(lines.join("\n"))) return;
      busy.value = "release";
      result.value = null;
      try {
        const r = await api("/_workbench/tasks", { body: { name: "release", version: target.value.trim() } });
        let parsed = null;
        try {
          parsed = JSON.parse(r.output.slice(r.output.lastIndexOf("\n{") + 1));
        } catch {
          /* 失败时只有原始输出 */
        }
        result.value = { ...r, parsed };
        toast(r.ok ? `已发布 ${p.version}` : "发版没有完成", r.ok ? "ok" : "error", 6000);
        if (r.ok) target.value = "";
        await Promise.all([loadOverview(), loadInfo()]);
      } catch (e) {
        result.value = { ok: false, output: e.message };
      } finally {
        busy.value = "";
      }
    }
    onMounted(() => {
      loadOverview();
      loadInfo();
    });
    return { overview, info, infoError, loadingInfo, notes, notesDirty, busy, result, target, plan, advice, LEVEL_TEXT, CHANGE_LEVEL, time, loadInfo, saveNotes, publish };
  },
  template: `
  <div class="page">
    <div class="page-head">
      <div>
        <h1>版本与发布</h1>
        <p>平时怎么改、推送多少次，版本号和卡名都不会变；只有在这里发布时，才按你们填的版本号改。</p>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      <div class="card stat">
        <span class="stat-label">已发布版本</span>
        <span class="stat-value">{{ overview?.card.version ?? '…' }}</span>
        <span class="muted small">{{ time(overview?.card.releasedAt) }}</span>
      </div>
      <div class="card stat">
        <span class="stat-label">角色卡名 / 世界书名</span>
        <span class="stat-value" style="font-size:20px">{{ overview?.card.name ?? '…' }}</span>
        <span class="muted small">只在发布新版本时改</span>
      </div>
      <div class="card stat">
        <span class="stat-label">工作区最近一次构建</span>
        <span class="stat-value" style="font-size:16px;font-family:var(--mono)">{{ overview?.build?.version ?? '还没构建' }}</span>
        <span class="muted small">推到酒馆测试的开发版，带 +dev 标记</span>
      </div>
    </div>

    <section class="card">
      <div class="row" style="justify-content:space-between">
        <h2>这次和上一版比</h2>
        <button class="btn" :disabled="loadingInfo" @click="loadInfo"><span v-if="loadingInfo" class="spinner"></span>重新检查</button>
      </div>
      <div v-if="infoError" class="banner error"><div class="grow">{{ infoError }}</div></div>
      <div v-else-if="!info" class="muted" style="margin-top:8px"><span class="spinner"></span> 正在对比变量结构…</div>
      <template v-else>
        <h3 style="margin-top:12px">变量结构</h3>
        <p v-if="info.schema.missingBaseline" class="muted">找不到上一版的变量结构快照，没法自动对比。</p>
        <p v-else-if="!info.schema.changes.length" class="muted">和 {{ info.released.version }} 完全一样。</p>
        <div v-else class="list">
          <div v-for="c in info.schema.changes" :key="c.path + c.text" class="list-item">
            <span class="badge" :style="{ '--c': CHANGE_LEVEL[c.level].color }">{{ CHANGE_LEVEL[c.level].text }}</span>
            <div class="grow"><code>{{ c.path }}</code> {{ c.text }}</div>
          </div>
        </div>
        <h3 style="margin-top:16px">更新记录（未发布）</h3>
        <p class="muted small">玩家能感知的改动记在这里，发版时会写进更新说明。需要玩家手动改变量的条目，开头加【不兼容】。</p>
        <textarea v-model="notes" rows="6" @input="notesDirty = true" placeholder="- 新增了……&#10;- 修复了……"></textarea>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="btn" :disabled="!notesDirty || !!busy" @click="saveNotes"><span v-if="busy === 'notes'" class="spinner"></span>保存更新记录</button>
        </div>
      </template>
    </section>

    <section v-if="info" class="card">
      <h2>发布新版本</h2>
      <p class="muted small" style="margin-top:4px">填你们定好的版本号。下面三个是按习惯算出来的参考，点一下就能填进去。</p>
      <div class="row" style="margin-top:12px;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <label class="field" style="width:200px">
          <span class="field-label">版本号</span>
          <input v-model="target" placeholder="比如 4.3.4" @keydown.enter="publish" />
        </label>
        <div class="field" style="flex:1;min-width:260px">
          <span class="field-label">参考（变量结构对比建议：{{ LEVEL_TEXT[info.suggested] }}）</span>
          <div class="chip-list">
            <button v-for="level in ['patch', 'minor', 'major']" :key="level" class="btn" :class="{ primary: level === info.suggested }" style="padding:3px 12px" @click="target = info.next[level].version.slice(1)">
              {{ info.next[level].version }} · {{ LEVEL_TEXT[level] }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="plan?.error" class="banner error" style="margin-top:12px"><div class="grow">{{ plan.error }}</div></div>
      <div v-else-if="plan" class="banner info" style="margin-top:12px">
        <div class="grow">
          发布后是 <b>{{ plan.version }}</b>（{{ LEVEL_TEXT[plan.level] }}），角色卡名和世界书名{{ plan.renamed ? '改成' : '保持' }}「{{ plan.name }}」。
          <p v-if="advice" style="margin-top:6px">{{ advice }}</p>
        </div>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:12px">
        <span class="muted small">发版只在本机生成正式版角色卡和发布包，不会自动上传或推送到 Git。</span>
        <button class="btn primary" :disabled="!plan || !!plan.error || !!busy" @click="publish"><span v-if="busy === 'release'" class="spinner"></span>{{ plan && !plan.error ? '发布 ' + plan.version : '发布' }}</button>
      </div>
    </section>

    <div v-if="result" class="banner" :class="result.ok ? 'ok' : 'error'">
      <div class="grow">
        <template v-if="result.ok && result.parsed">
          <b>{{ result.parsed.version }} 已生成。</b>
          <p>发布包在 <code>{{ result.parsed.package }}/</code>：{{ result.parsed.files.join('、') }}。</p>
          <p v-if="result.parsed.worldbookRenamed">角色卡名和世界书名已改为「{{ result.parsed.worldbook }}」。</p>
          <p>接下来：把工作区提交到 Git 并打标签 <code>{{ result.parsed.tag }}</code>，正式版的界面资源从这个标签加载。</p>
        </template>
        <b v-else>{{ result.ok ? '发版完成。' : '发版没有完成，版本号和更新记录已还原。' }}</b>
        <details v-if="result.output" :open="!result.ok"><summary>详细输出</summary><pre class="output">{{ result.output }}</pre></details>
      </div>
    </div>
  </div>`,
};

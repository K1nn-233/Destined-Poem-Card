import { computed, ref } from "/vendor/vue.js";
import { plain, clone, blankLike, label, RARITIES, FIXED_KEYS, LONG_KEYS } from "./lib.js";

const TAG_KEYS = new Set(["tag", "标签", "identity", "career", "genders", "startLocations"]);
const TEMPLATES = {
  equip: { name: "", type: "", tag: [], rarity: "common", effect: {}, description: "" },
  skills: { name: "", type: "主动", tag: [], rarity: "common", consume: "", effect: {}, description: "" },
};
const primitive = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

function renameKey(object, from, to) {
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k === from ? to : k, v]));
}

export const ValueEditor = {
  name: "ValueEditor",
  props: {
    modelValue: { required: true },
    fieldKey: { type: [String, Number], default: "" },
    fixed: { type: Boolean, default: false },
    depth: { type: Number, default: 0 },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const set = (value) => emit("update:modelValue", value);
    const kind = computed(() => {
      const v = props.modelValue;
      const key = props.fieldKey;
      if (key === "rarity") return "rarity";
      if (typeof v === "boolean") return "bool";
      if (typeof v === "number") return "number";
      if (v === null || v === undefined) return "text";
      if (typeof v === "string") return LONG_KEYS.has(key) || v.length > 36 || v.includes("\n") ? "long" : "text";
      if (Array.isArray(v)) {
        if (v.length === 0) return TEMPLATES[key] ? "objlist" : "tags";
        if (v.every((x) => typeof x === "string") || TAG_KEYS.has(key)) return "tags";
        if (v.every(plain)) return "objlist";
        return "json";
      }
      if (plain(v)) {
        if (FIXED_KEYS.has(key) || props.fixed) return Object.values(v).every(primitive) ? "fields" : "struct";
        const values = Object.values(v);
        if (values.length > 3 && values.every((x) => typeof x === "number")) return "numbers";
        if (values.every(primitive)) return "record";
        return "struct";
      }
      return "json";
    });

    // 标签
    const tagInput = ref("");
    function addTag() {
      const text = tagInput.value.trim();
      if (!text) return;
      set([...(props.modelValue ?? []), ...text.split(/[，,]\s*/).filter(Boolean)]);
      tagInput.value = "";
    }
    const removeAt = (i) => set(props.modelValue.filter((_, index) => index !== i));

    // 键值对
    const recordEntries = computed(() => (plain(props.modelValue) ? Object.entries(props.modelValue) : []));
    function setRecordValue(key, value) {
      set({ ...props.modelValue, [key]: value });
    }
    function setRecordKey(oldKey, newKey) {
      newKey = newKey.trim();
      if (!newKey || newKey === oldKey) return;
      if (Object.hasOwn(props.modelValue, newKey)) return alert(`已经有「${newKey}」这一项了`);
      set(renameKey(props.modelValue, oldKey, newKey));
    }
    function removeKey(key) {
      const next = { ...props.modelValue };
      delete next[key];
      set(next);
    }
    function addRecord() {
      const entries = Object.entries(props.modelValue ?? {});
      let name = "新的一项";
      for (let n = 2; Object.hasOwn(props.modelValue ?? {}, name); n++) name = `新的一项${n}`;
      const sample = entries[0]?.[1];
      set({ ...(props.modelValue ?? {}), [name]: sample === undefined ? "" : blankLike(sample) });
    }

    // 对象列表
    function setItem(i, value) {
      const next = [...props.modelValue];
      next[i] = value;
      set(next);
    }
    function addItem() {
      const sample = props.modelValue[0];
      set([...props.modelValue, sample ? blankLike(sample) : clone(TEMPLATES[props.fieldKey] ?? {})]);
    }
    function removeItem(i) {
      const name = props.modelValue[i]?.name;
      if (confirm(`删除${name ? `「${name}」` : "这一项"}？`)) removeAt(i);
    }
    const itemTitle = (item, i) => item?.name || `第 ${i + 1} 项`;

    // 兜底：直接改 JSON
    const jsonText = ref("");
    const jsonError = ref("");
    const jsonValue = computed(() => JSON.stringify(props.modelValue, null, 2));
    function applyJson(text) {
      try {
        set(JSON.parse(text));
        jsonError.value = "";
      } catch (error) {
        jsonError.value = `格式不对：${error.message}`;
      }
    }

    return { kind, set, label, RARITIES, tagInput, addTag, removeAt, recordEntries, setRecordValue, setRecordKey, removeKey, addRecord, setItem, addItem, removeItem, itemTitle, jsonText, jsonError, jsonValue, applyJson, FIXED_KEYS };
  },
  template: `
  <select v-if="kind === 'rarity'" :value="modelValue" @change="set($event.target.value)">
    <option v-for="r in RARITIES" :key="r.value" :value="r.value">{{ r.label }}</option>
  </select>
  <label v-else-if="kind === 'bool'" class="row" style="gap:8px">
    <input type="checkbox" :checked="modelValue" @change="set($event.target.checked)" /> <span>{{ modelValue ? '是' : '否' }}</span>
  </label>
  <input v-else-if="kind === 'number'" type="number" :value="modelValue" @input="set($event.target.value === '' ? 0 : Number($event.target.value))" />
  <input v-else-if="kind === 'text'" :value="modelValue ?? ''" @input="set($event.target.value)" />
  <textarea v-else-if="kind === 'long'" :value="modelValue" :rows="Math.min(12, Math.max(3, Math.ceil((modelValue || '').length / 42) + (modelValue || '').split('\\n').length - 1))" @input="set($event.target.value)"></textarea>

  <div v-else-if="kind === 'tags'" class="chip-list">
    <span v-for="(tag, i) in modelValue" :key="i" class="chip">{{ tag }}<button title="删除" @click="removeAt(i)">×</button></span>
    <input class="chip-input" v-model="tagInput" placeholder="输入后按回车添加" @keydown.enter.prevent="addTag" @blur="addTag" />
  </div>

  <div v-else-if="kind === 'record'" style="display:flex;flex-direction:column;gap:6px">
    <div v-for="[key, value] in recordEntries" :key="key" class="kv">
      <input :value="key" title="名称（可修改）" @change="setRecordKey(key, $event.target.value)" />
      <textarea v-if="typeof value === 'string'" :value="value" :rows="Math.min(8, Math.max(1, Math.ceil(value.length / 34)))" @input="setRecordValue(key, $event.target.value)"></textarea>
      <input v-else-if="typeof value === 'number'" type="number" :value="value" @input="setRecordValue(key, Number($event.target.value))" />
      <input v-else :value="value ?? ''" @input="setRecordValue(key, $event.target.value)" />
      <button class="btn small icon danger" title="删除这一项" @click="removeKey(key)">×</button>
    </div>
    <div><button class="btn small" @click="addRecord">＋ 添加一项</button></div>
  </div>

  <div v-else-if="kind === 'fields'" class="num-grid">
    <label v-for="[key, value] in recordEntries" :key="key" class="field">
      <span class="field-label">{{ label(key) }}</span>
      <value-editor :model-value="value" :field-key="key" :depth="depth + 1" @update:model-value="setRecordValue(key, $event)" />
    </label>
  </div>

  <div v-else-if="kind === 'numbers'" style="display:flex;flex-direction:column;gap:8px">
    <div class="num-grid">
      <div v-for="[key, value] in recordEntries" :key="key" class="num-cell">
        <input :value="key" title="名称（可修改）" @change="setRecordKey(key, $event.target.value)" />
        <input type="number" :value="value" @input="setRecordValue(key, Number($event.target.value))" />
        <button class="btn small icon danger" title="删除这一项" @click="removeKey(key)">×</button>
      </div>
    </div>
    <div><button class="btn small" @click="addRecord">＋ 添加一项</button></div>
  </div>

  <div v-else-if="kind === 'struct'" style="display:flex;flex-direction:column;gap:8px">
    <details v-for="[key, value] in recordEntries" :key="key" class="group" :open="depth < 1 && FIXED_KEYS.has(fieldKey)">
      <summary>
        <span v-if="fixed || FIXED_KEYS.has(fieldKey)">{{ label(key) }}</span>
        <input v-else :value="key" style="width:auto;flex:1;font-weight:600" @click.stop @change="setRecordKey(key, $event.target.value)" />
        <button v-if="!(fixed || FIXED_KEYS.has(fieldKey))" class="btn small icon danger" title="删除" @click.prevent="removeKey(key)">×</button>
      </summary>
      <div class="group-body">
        <value-editor :model-value="value" :field-key="key" :depth="depth + 1" @update:model-value="setRecordValue(key, $event)" />
      </div>
    </details>
    <div v-if="!(fixed || FIXED_KEYS.has(fieldKey))"><button class="btn small" @click="addRecord">＋ 添加一项</button></div>
  </div>

  <div v-else-if="kind === 'objlist'" style="display:flex;flex-direction:column;gap:8px">
    <details v-for="(item, i) in modelValue" :key="i" class="group">
      <summary><span class="grow">{{ itemTitle(item, i) }}</span><button class="btn small icon danger" title="删除" @click.prevent="removeItem(i)">×</button></summary>
      <div class="group-body">
        <label v-for="(value, key) in item" :key="key" class="field">
          <span class="field-label">{{ label(key) }}</span>
          <value-editor :model-value="value" :field-key="key" :depth="depth + 1" @update:model-value="setItem(i, { ...item, [key]: $event })" />
        </label>
      </div>
    </details>
    <div><button class="btn small" @click="addItem">＋ 添加</button></div>
  </div>

  <div v-else>
    <textarea :value="jsonValue" rows="6" style="font-family:var(--mono);font-size:12px" @change="applyJson($event.target.value)"></textarea>
    <p v-if="jsonError" class="field-hint">{{ jsonError }}</p>
  </div>
  `,
};

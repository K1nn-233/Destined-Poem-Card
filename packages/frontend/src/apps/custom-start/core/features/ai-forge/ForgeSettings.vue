<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useForgeSettings } from './settings';
import {
  defaultEntryNames,
  resolveBook,
  selectedEntryNames,
  setEntrySelection,
  usableEntries,
} from './worldbook';
import type { ForgeMode } from './worldbook';

const props = defineProps<{ disabled?: boolean; mode: ForgeMode }>();
const store = useForgeSettings();
store.load();
const books = ref<string[]>([]);
const entries = ref<{ name: string; content: string }[]>([]);
const search = ref('');
const models = ref<string[]>([]);
const loadingModels = ref(false);
const loadingEntries = ref(false);
const modelError = ref('');
const bookError = ref('');
const saveMessage = ref('');
const saving = ref(false);
const loadedBook = ref('');
const selected = computed({
  get: () => selectedEntryNames(store.settings, entries.value, loadedBook.value, props.mode),
  set: names => setEntrySelection(store.settings, loadedBook.value, props.mode, names),
});
let modelVersion = 0;
let bookVersion = 0;
try {
  books.value = getWorldbookNames();
} catch {
  /* 未连接宿主时仍可展示设置 */
}
const visibleEntries = computed(() =>
  entries.value
    .filter(e =>
      `${e.name}\n${e.content}`.toLowerCase().includes(search.value.trim().toLowerCase()),
    )
    .sort(
      (a, b) => Number(selected.value.includes(b.name)) - Number(selected.value.includes(a.name)),
    ),
);
watch(
  () => [store.settings.apiMode, store.settings.apiUrl, store.settings.apiKey],
  () => {
    modelVersion++;
    models.value = [];
    modelError.value = '';
    loadingModels.value = false;
  },
  { flush: 'sync' },
);
watch(
  () => store.settings.worldbookName,
  () => {
    bookVersion++;
    entries.value = [];
    loadedBook.value = '';
    bookError.value = '';
    loadingEntries.value = false;
    void fetchEntries();
  },
  { flush: 'sync', immediate: true },
);
onUnmounted(() => {
  modelVersion++;
  bookVersion++;
});
async function fetchModels() {
  const version = ++modelVersion;
  const { apiUrl, apiKey } = store.settings;
  modelError.value = '';
  loadingModels.value = true;
  try {
    const url = new URL(apiUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw new Error('请填写有效接口地址');
    const list = await getModelList({ apiurl: apiUrl, key: apiKey });
    if (version !== modelVersion) return;
    const next = [...new Set(list.map(v => v.trim()).filter(Boolean))].sort();
    if (!next.length) throw new Error('未获取到可用模型，请检查接口连接后重试');
    models.value = next;
    if (!next.includes(store.settings.model)) store.settings.model = next[0];
  } catch (e) {
    if (version === modelVersion) {
      const message = e instanceof Error ? e.message : '获取模型失败';
      modelError.value = apiKey ? message.split(apiKey).join('[已隐藏]') : message;
    }
  } finally {
    if (version === modelVersion) loadingModels.value = false;
  }
}
async function fetchEntries() {
  const version = ++bookVersion;
  bookError.value = '';
  loadingEntries.value = true;
  try {
    const book = resolveBook(store.settings);
    const result = await getWorldbook(book);
    if (version === bookVersion) {
      entries.value = usableEntries(result).map(e => ({ name: e.name, content: e.content }));
      loadedBook.value = book;
    }
  } catch {
    if (version === bookVersion) {
      entries.value = [];
      loadedBook.value = '';
      bookError.value = '读取世界书失败，请选择可用的命定世界书';
    }
  } finally {
    if (version === bookVersion) loadingEntries.value = false;
  }
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  saveMessage.value = '';
  try {
    await store.save();
    saveMessage.value = '设置已保存';
  } catch {
    saveMessage.value = '保存失败，当前页面仍可使用；请稍后重试';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <details class="forge-settings">
    <summary>推演设置 · {{ store.settings.apiMode === 'main' ? '主 API' : '额外 API' }}</summary>
    <fieldset :disabled="disabled || saving">
      <label
        >调用方式<select v-model="store.settings.apiMode">
          <option value="main">默认调用主 API</option>
          <option value="custom">额外调用 API</option>
        </select></label
      >
      <p v-if="store.settings.apiMode === 'main'" class="forge-hint">
        沿用酒馆当前连接、模型与输出上限。
      </p>
      <template v-else>
        <label
          >接口地址<input
            v-model.trim="store.settings.apiUrl"
            placeholder="https://接口地址/v1"
            autocomplete="off"
        /></label>
        <label
          >API 密钥<input v-model="store.settings.apiKey" type="password" autocomplete="off"
        /></label>
        <div class="forge-actions">
          <button
            type="button"
            :disabled="loadingModels || !store.settings.apiUrl"
            @click="fetchModels"
          >
            {{ loadingModels ? '正在获取…' : '获取模型' }}
          </button>
          <label class="forge-grow"
            >模型<select v-model="store.settings.model" :disabled="loadingModels">
              <option value="" disabled>获取后选择模型</option>
              <option
                v-if="store.settings.model && !models.includes(store.settings.model)"
                :value="store.settings.model"
              >
                {{ store.settings.model }}（已保存）
              </option>
              <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
            </select></label
          >
        </div>
        <p v-if="modelError" role="alert" class="forge-error">{{ modelError }}</p>
        <label
          >输出上限<input
            v-model.number="store.settings.maxTokens"
            type="number"
            min="1024"
            max="65536"
            step="1024"
        /></label>
      </template>
      <label
        >规则世界书<select v-model="store.settings.worldbookName">
          <option value="">当前角色主世界书</option>
          <option v-for="book in books" :key="book" :value="book">{{ book }}</option>
        </select></label
      >
      <button type="button" :disabled="loadingEntries" @click="fetchEntries">
        {{ loadingEntries ? '正在读取…' : '读取世界书条目' }}
      </button>
      <p v-if="bookError" role="alert" class="forge-error">{{ bookError }}</p>
      <template v-if="entries.length">
        <label>搜索条目<input v-model="search" placeholder="搜索名称或正文" /></label>
        <div class="forge-entry-list">
          <label v-for="entry in visibleEntries" :key="entry.name" class="forge-check"
            ><input v-model="selected" type="checkbox" :value="entry.name" />{{ entry.name }}</label
          >
          <p v-if="!visibleEntries.length" class="forge-hint">没有匹配条目</p>
        </div>
        <div class="forge-actions">
          <p class="forge-hint">
            {{ mode === 'partner' ? '伙伴' : '项目' }}已选 {{ selected.length }} 条
          </p>
          <button
            type="button"
            :disabled="loadingEntries"
            @click="selected = defaultEntryNames(entries, mode)"
          >
            恢复默认勾选
          </button>
        </div>
      </template>
      <div class="forge-actions">
        <button type="button" @click="save">{{ saving ? '保存中…' : '保存设置' }}</button
        ><span role="status">{{ saveMessage }}</span>
      </div>
    </fieldset>
  </details>
</template>

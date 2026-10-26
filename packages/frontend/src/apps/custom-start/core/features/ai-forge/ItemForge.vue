<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCharacterStore } from '../../store/character';
import { commitItems, prepareItems, remainingPoints } from './commit';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  itemCost,
  resolveItemCategories,
  validationMessage,
} from './contracts';
import type { Category } from './contracts';
import { useForgeDrafts } from './drafts.store';
import ForgeIcon from './ForgeIcon.vue';
import ForgeSettings from './ForgeSettings.vue';
import ItemDraftEditor from './ItemDraftEditor.vue';
import { apiProblem, characterContext, generateItems } from './service';
import { useForgeSettings } from './settings';
import { useGeneration } from './use-generation';
import './forge.scss';

const character = useCharacterStore();
const state = useForgeDrafts();
const settings = useForgeSettings();
settings.load();
const current = ref<Category>('equipment');
const expanded = ref<string | null>(null);
const message = ref('');
const { busy, error, run, cancel } = useGeneration();
const available = computed(() => remainingPoints(character));
const total = computed(() => state.items.reduce((sum, item) => sum + itemCost(item), 0));
const balance = computed(() => available.value - total.value);
const problem = computed(() => {
  if (!state.items.length) return '';
  try {
    prepareItems(character, state.items);
    return '';
  } catch (e) {
    return validationMessage(e);
  }
});
const points = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : '—');
async function generate(categories: Category[]) {
  if (busy.value) return;
  message.value = '';
  try {
    categories = resolveItemCategories(state.requirements, categories);
  } catch (e) {
    error.value = validationMessage(e);
    return;
  }
  const config = JSON.parse(JSON.stringify(settings.settings));
  const invalid = apiProblem(config);
  if (invalid) {
    error.value = invalid;
    return;
  }
  // 单分类更新时，为其它未提交草稿预留点数。
  const reserved = state.items
    .filter(i => !categories.includes(i.category))
    .reduce((sum, d) => sum + itemCost(d), 0);
  const budget = available.value - reserved;
  const context = characterContext(character);
  const requirements = JSON.parse(JSON.stringify(state.requirements));
  const result = await run(
    (id, isCurrent) =>
      generateItems({ settings: config, context, budget, requirements, categories, id, isCurrent }),
    config.apiKey,
  );
  if (!result) return;
  state.items = [...state.items.filter(d => !categories.includes(d.category)), ...result];
  state.itemChat = SillyTavern.getCurrentChatId();
  expanded.value = result[0]?.id ?? null;
  message.value = '草稿已生成，请检查内容与点数后确认。';
}
function confirm() {
  if (busy.value || !state.items.length) return;
  error.value = '';
  try {
    if (state.itemChat !== SillyTavern.getCurrentChatId())
      throw new Error('聊天已切换，请在当前开局重新生成');
    const count = state.items.length;
    commitItems(character, state.items);
    state.items = [];
    expanded.value = null;
    message.value = `已将${count}项内容加入「已选项目」`;
  } catch (e) {
    error.value = validationMessage(e);
  }
}
</script>

<template>
  <section class="ai-forge" aria-label="开局项目推演">
    <header class="forge-heading">
      <ForgeIcon />
      <div>
        <h3>开局项目推演</h3>
        <p>写下构想，让武器、道具、资产与技能成为你的起点。</p>
      </div>
      <span class="forge-badge">AI 推演</span>
    </header>
    <ForgeSettings :disabled="busy" mode="items" />
    <fieldset :disabled="busy">
      <div class="forge-tabs" aria-label="推演分类">
        <div
          v-for="category in CATEGORIES"
          :key="category"
          class="forge-category-choice"
          :class="{ 'is-included': state.selectedCategories.includes(category) }"
        >
          <label class="forge-category-check">
            <input
              v-model="state.selectedCategories"
              type="checkbox"
              :value="category"
              :aria-label="'参与生成' + CATEGORY_LABELS[category]"
              @change="current = category"
            />
          </label>
          <button type="button" :aria-pressed="current === category" @click="current = category">
            {{ CATEGORY_LABELS[category]
            }}<span>{{ state.requirements[category].count || 0 }}</span>
          </button>
        </div>
      </div>
      <p class="forge-hint">只生成勾选且数量大于0的分类，要求可留空。</p>
      <div class="forge-request">
        <label
          >数量<input
            v-model.number="state.requirements[current].count"
            :aria-label="CATEGORY_LABELS[current] + '数量'"
            type="number"
            min="0"
            max="10"
        /></label>
        <label
          >{{ CATEGORY_LABELS[current] }}要求<textarea
            v-model="state.requirements[current].requirement"
            :aria-label="CATEGORY_LABELS[current] + '要求'"
            rows="3"
            :placeholder="
              current === 'equipment'
                ? '如：一把适合游侠的弓，一柄便携短刀，突出风与追踪的主题'
                : '描述用途、风格、品质或希望拥有的效果；留空则结合角色背景设计'
            "
          />
        </label>
      </div>
      <div class="forge-actions forge-end">
        <span class="forge-hint">每类 0–10 项</span
        ><button
          type="button"
          :disabled="!state.requirements[current].count"
          @click="generate([current])"
        >
          单独生成{{ CATEGORY_LABELS[current] }}
        </button>
      </div>
      <div class="forge-total-action">
        <button
          type="button"
          class="forge-primary"
          :disabled="!state.selectedCategories.length"
          @click="generate([...state.selectedCategories])"
        >
          <ForgeIcon />结合已勾选项目生成
        </button>
      </div>
    </fieldset>
    <div v-if="busy" class="forge-progress" role="status">
      <span>正在读取规则并推演，请稍候…</span
      ><button type="button" @click="cancel">取消生成</button>
    </div>
    <p v-if="error" role="alert" class="forge-error">{{ error }}</p>
    <p v-if="message" role="status" class="forge-success">{{ message }}</p>
    <div class="forge-budget" aria-live="polite">
      <div>
        <span>当前可用</span><strong>{{ points(available) }}</strong>
      </div>
      <div>
        <span>草稿所需</span><strong>{{ points(total) }}</strong>
      </div>
      <div :class="{ 'forge-error': balance < 0 }">
        <span>{{ balance < 0 ? '超出预算' : '注入后剩余' }}</span
        ><strong>{{ points(Math.abs(balance)) }}</strong>
      </div>
    </div>
    <fieldset v-if="state.items.length" :disabled="busy">
      <div class="forge-preview-title">
        <h4>待确认草稿 · {{ state.items.length }} 项</h4>
        <span>展开微调 · 随时删除</span>
      </div>
      <article v-for="(draft, i) in state.items" :key="draft.id" class="forge-draft">
        <div class="forge-draft-head">
          <button
            type="button"
            class="forge-draft-toggle"
            :aria-expanded="expanded === draft.id"
            @click="expanded = expanded === draft.id ? null : draft.id"
          >
            <span class="forge-category">{{ CATEGORY_LABELS[draft.category] }}</span
            ><strong>{{ draft.name || '未命名' }}</strong
            ><span>{{ points(itemCost(draft)) }} 点</span
            ><span aria-hidden="true">{{ expanded === draft.id ? '⌃' : '⌄' }}</span></button
          ><button
            type="button"
            class="forge-delete"
            :aria-label="'删除' + draft.name"
            @click="state.items.splice(i, 1)"
          >
            删除
          </button>
        </div>
        <ItemDraftEditor v-if="expanded === draft.id" v-model="state.items[i]" />
      </article>
      <p v-if="problem" role="alert" class="forge-error">{{ problem }}</p>
      <div class="forge-actions forge-end">
        <button type="button" class="forge-primary" :disabled="!!problem" @click="confirm">
          确认注入已选项目
        </button>
      </div>
    </fieldset>
  </section>
</template>

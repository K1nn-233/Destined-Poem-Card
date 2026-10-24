<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCharacterStore } from '../../store/character';
import { commitPartner, preparePartner, remainingPoints } from './commit';
import { levelsForTier, partnerCost, TIER_NAMES, validationMessage } from './contracts';
import { useForgeDrafts } from './drafts.store';
import ForgeIcon from './ForgeIcon.vue';
import ForgeSettings from './ForgeSettings.vue';
import PartnerDraftEditor from './PartnerDraftEditor.vue';
import { apiProblem, characterContext, generatePartner } from './service';
import { useForgeSettings } from './settings';
import { useGeneration } from './use-generation';
import './forge.scss';

const character = useCharacterStore();
const state = useForgeDrafts();
const settings = useForgeSettings();
settings.load();
const message = ref('');
const { busy, error, run, cancel } = useGeneration();
const available = computed(() => remainingPoints(character));
const levels = computed(() => levelsForTier(state.partnerOptions.tier));
watch(
  () => state.partnerOptions.tier,
  () => {
    if (!levels.value.includes(state.partnerOptions.level))
      state.partnerOptions.level = levels.value[0];
  },
  { flush: 'sync' },
);
const cost = computed(() => {
  if (!state.partner) return 0;
  try {
    return partnerCost(state.partner.level);
  } catch {
    return NaN;
  }
});
const balance = computed(() => available.value - cost.value);
const problem = computed(() => {
  if (!state.partner) return '';
  try {
    preparePartner(character, state.partner);
    return '';
  } catch (e) {
    return validationMessage(e);
  }
});
const points = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : '—');
async function generate() {
  if (busy.value) return;
  message.value = '';
  const config = JSON.parse(JSON.stringify(settings.settings));
  const invalid = apiProblem(config);
  if (invalid) {
    error.value = invalid;
    return;
  }
  const context = characterContext(character);
  const budget = available.value;
  const description = state.partnerDescription;
  const options = { ...state.partnerOptions };
  const result = await run(
    (id, isCurrent) =>
      generatePartner({ settings: config, context, budget, description, options, id, isCurrent }),
    config.apiKey,
  );
  if (!result) return;
  state.partner = result;
  state.partnerChat = SillyTavern.getCurrentChatId();
  message.value = '伙伴草稿已生成，请检查并微调。';
}
function confirm() {
  if (busy.value || !state.partner) return;
  error.value = '';
  try {
    if (state.partnerChat !== SillyTavern.getCurrentChatId())
      throw new Error('聊天已切换，请在当前开局重新生成');
    commitPartner(character, state.partner);
    message.value = `已将伙伴「${state.partner.name}」加入已选项目`;
    state.partner = null;
  } catch (e) {
    error.value = validationMessage(e);
  }
}
</script>

<template>
  <section class="ai-forge" aria-label="自定义伙伴推演">
    <header class="forge-heading">
      <ForgeIcon variant="partner" />
      <div>
        <h3>自定义伙伴推演</h3>
        <p>描述你想遇见的人，补齐属于对方的经历与能力。</p>
      </div>
      <span class="forge-badge">AI 推演</span>
    </header>
    <ForgeSettings :disabled="busy" mode="partner" />
    <fieldset :disabled="busy">
      <label
        >伙伴整体描述<textarea
          v-model="state.partnerDescription"
          rows="4"
          placeholder="例如：一位来自北方的年轻药师，性格温和但固执，擅长草药与防护，曾因一次远行与你结缘。也可以指定种族、外貌与技能主题。"
        />
      </label>
      <div class="forge-grid forge-partner-options">
        <label
          >层级<select v-model.number="state.partnerOptions.tier" aria-label="伙伴生成层级">
            <option v-for="(name, i) in TIER_NAMES" :key="name" :value="i + 1">{{ name }}</option>
          </select></label
        >
        <label
          >等级<select v-model.number="state.partnerOptions.level" aria-label="伙伴生成等级">
            <option v-for="level in levels" :key="level" :value="level">{{ level }} 级</option>
          </select></label
        >
        <label
          >装备数量<select
            v-model.number="state.partnerOptions.equipmentCount"
            aria-label="伙伴生成装备数量"
          >
            <option v-for="n in 11" :key="n" :value="n - 1">{{ n - 1 }} 件</option>
          </select></label
        >
        <label
          >技能数量<select
            v-model.number="state.partnerOptions.skillCount"
            aria-label="伙伴生成技能数量"
          >
            <option v-for="n in 21" :key="n" :value="n - 1">{{ n - 1 }} 个</option>
          </select></label
        >
      </div>
      <div class="forge-actions forge-end">
        <button
          type="button"
          class="forge-primary"
          :disabled="!state.partnerDescription.trim()"
          @click="generate"
        >
          <ForgeIcon variant="partner" />生成伙伴
        </button>
      </div>
      <p v-if="state.partner" class="forge-hint">重新生成会替换当前伙伴草稿。</p>
    </fieldset>
    <div v-if="busy" class="forge-progress" role="status">
      <span>正在根据世界书生成伙伴…</span><button type="button" @click="cancel">取消生成</button>
    </div>
    <p v-if="error" role="alert" class="forge-error">{{ error }}</p>
    <p v-if="message" role="status" class="forge-success">{{ message }}</p>
    <div class="forge-budget" aria-live="polite">
      <div>
        <span>当前可用</span><strong>{{ points(available) }}</strong>
      </div>
      <div>
        <span>伙伴所需</span><strong>{{ points(cost) }}</strong>
      </div>
      <div :class="{ 'forge-error': balance < 0 }">
        <span>{{ balance < 0 ? '超出预算' : '注入后剩余' }}</span
        ><strong>{{ points(Math.abs(balance)) }}</strong>
      </div>
    </div>
    <fieldset v-if="state.partner" :disabled="busy">
      <div class="forge-preview-title">
        <h4>伙伴预览 · 可编辑</h4>
        <button type="button" class="forge-delete" @click="state.partner = null">删除此伙伴</button>
      </div>
      <PartnerDraftEditor v-model="state.partner" />
      <p v-if="problem" role="alert" class="forge-error">{{ problem }}</p>
      <div class="forge-actions forge-end">
        <button type="button" class="forge-primary" :disabled="!!problem" @click="confirm">
          确认注入已选项目
        </button>
      </div>
    </fieldset>
  </section>
</template>

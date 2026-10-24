<script setup lang="ts">
import { computed, ref } from 'vue';
import { FormArrayInput, FormKeyValueInput } from '../../components/Form';
import AttributeEditor from '../../views/Background/components/AttributeEditor.vue';
import EquipmentEditor, {
  type EquipmentItem,
} from '../../views/Background/components/EquipmentEditor.vue';
import SkillEditor, { type SkillItem } from '../../views/Background/components/SkillEditor.vue';
import type { PartnerDraft } from './contracts';
import { TIER_NAMES } from './contracts';
const draft = defineModel<PartnerDraft>({ required: true });
const tier = computed(() => Math.ceil(draft.value.level / 4));
const localError = ref('');
const groups = [
  { key: 'elements', label: '要素' },
  { key: 'powers', label: '权能' },
  { key: 'laws', label: '法则' },
] as const;
type Group = (typeof groups)[number]['key'];
function addAbility(group: Group) {
  let n = 1;
  const record = draft.value.stairway[group];
  while (record[`能力${n}`]) n++;
  record[`能力${n}`] = { 效果: '填写能力效果' };
}
function renameAbility(group: Group, old: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const next = input.value.trim();
  const record = draft.value.stairway[group];
  if (
    !next ||
    (next !== old && Object.hasOwn(record, next)) ||
    ['__proto__', 'constructor', 'prototype'].includes(next)
  ) {
    localError.value = '能力名称不能为空、重复或使用保留字';
    input.value = old;
    return;
  }
  draft.value.stairway[group] = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key === old ? next : key, value]),
  );
  localError.value = '';
}
// 编辑器先允许暂存不完整字段，最终确认统一由PartnerDraftSchema严格校验。
const skills = computed({
  get: () => draft.value.skills,
  set: (v: SkillItem[]) => {
    draft.value.skills = v as PartnerDraft['skills'];
  },
});
const equipment = computed({
  get: () => draft.value.equip,
  set: (v: EquipmentItem[]) => {
    draft.value.equip = v.map(e => ({
      ...e,
      position: draft.value.equip.find(old => old.name === e.name)?.position ?? '',
    })) as PartnerDraft['equip'];
  },
});
</script>

<template>
  <div class="forge-editor">
    <div class="forge-grid">
      <label>姓名<input v-model="draft.name" /></label
      ><label>等级<input v-model.number="draft.level" type="number" min="1" max="25" /></label
      ><label>种族<input v-model="draft.race" /></label
      ><label
        >好感度<input v-model.number="draft.affinity" type="number" min="-100" max="100"
      /></label>
    </div>
    <p class="forge-hint">
      {{ TIER_NAMES[tier - 1] || '请填写有效等级' }} · 等级变化后请同步调整属性、装备与登神能力。
    </p>
    <label class="forge-check"><input v-model="draft.isContract" type="checkbox" />命定契约</label>
    <div class="forge-field"><span>身份</span><FormArrayInput v-model="draft.identity" /></div>
    <div class="forge-field"><span>职业</span><FormArrayInput v-model="draft.career" /></div>
    <label>性格<textarea v-model="draft.personality" rows="3" /></label
    ><label>喜爱<textarea v-model="draft.like" rows="2" /></label>
    <label>外貌<textarea v-model="draft.app" rows="3" /></label
    ><label>着装<textarea v-model="draft.cloth" rows="3" /></label>
    <label>背景故事<textarea v-model="draft.backgroundInfo" rows="4" /></label>
    <details>
      <summary>
        五维属性 · {{ Object.values(draft.attributes).reduce((a, b) => a + b, 0) }} 点
      </summary>
      <AttributeEditor v-model="draft.attributes" :min="0" :max="6 + tier * 2" />
    </details>
    <details open>
      <summary>技能 · {{ draft.skills.length }} 个</summary>
      <SkillEditor v-model="skills" />
    </details>
    <details>
      <summary>装备 · {{ draft.equip.length }} 件</summary>
      <EquipmentEditor v-model="equipment" /><label v-for="(entry, i) in draft.equip" :key="i"
        >{{ entry.name }} · 穿戴位置<input v-model="entry.position"
      /></label>
    </details>
    <details>
      <summary>登神长阶</summary>
      <label class="forge-check"
        ><input v-model="draft.stairway.isOpen" type="checkbox" />开启登神长阶</label
      >
      <template v-for="group in groups" :key="group.key">
        <h4>{{ group.label }}</h4>
        <div v-for="key in Object.keys(draft.stairway[group.key])" :key="key" class="forge-nested">
          <div class="forge-actions">
            <label class="forge-grow"
              >名称<input :value="key" @change="renameAbility(group.key, key, $event)" /></label
            ><button
              class="forge-delete"
              type="button"
              @click="delete draft.stairway[group.key][key]"
            >
              删除
            </button>
          </div>
          <FormKeyValueInput v-model="draft.stairway[group.key][key]" />
        </div>
        <button type="button" @click="addAbility(group.key)">添加{{ group.label }}</button>
      </template>
      <label>神位<input v-model="draft.stairway.godlyRank" /></label>
      <label>神国名称<input v-model="draft.stairway.godKingdom.name" /></label
      ><label>神国描述<textarea v-model="draft.stairway.godKingdom.description" rows="3" /></label>
      <p v-if="localError" class="forge-error">{{ localError }}</p>
    </details>
  </div>
</template>

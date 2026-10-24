<script setup lang="ts">
import { ref } from 'vue';
import { FormArrayInput, FormKeyValueInput } from '../../components/Form';
import { RARITY_MAP } from '../../data/constants';
import type { ItemDraft } from './contracts';

const draft = defineModel<ItemDraft>({ required: true });
const localError = ref('');
function addInternal() {
  let n = 1;
  while (draft.value.internalAssets[`内部资产${n}`]) n++;
  draft.value.internalAssets[`内部资产${n}`] = {
    品质: draft.value.rarity,
    标签: [],
    数量: 1,
    效果: {},
    描述: '',
    总占用空间: '不适用',
  };
}
function renameInternal(old: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const next = input.value.trim();
  if (
    !next ||
    (next !== old && Object.hasOwn(draft.value.internalAssets, next)) ||
    ['__proto__', 'constructor', 'prototype'].includes(next)
  ) {
    localError.value = '内部资产名称不能为空、重复或使用保留字';
    input.value = old;
    return;
  }
  draft.value.internalAssets = Object.fromEntries(
    Object.entries(draft.value.internalAssets).map(([key, value]) => [
      key === old ? next : key,
      value,
    ]),
  );
  localError.value = '';
}
</script>

<template>
  <div class="forge-editor">
    <div class="forge-grid">
      <label>名称<input v-model="draft.name" /></label>
      <label
        >品质<select v-model="draft.rarity">
          <option v-for="(label, value) in RARITY_MAP" :key="value" :value="value">
            {{ label }}
          </option>
        </select></label
      >
      <label
        >类型<select v-if="draft.category === 'skill'" v-model="draft.type">
          <option>主动</option>
          <option>被动</option></select
        ><input v-else v-model="draft.type"
      /></label>
      <label v-if="draft.category === 'item'"
        >件数<input v-model.number="draft.quantity" type="number" min="1" max="999"
      /></label>
      <label v-if="draft.category === 'skill'"
        >消耗<input v-model="draft.consume" placeholder="如 动作: 10 MP"
      /></label>
      <label v-if="draft.category === 'equipment'"
        >穿戴位置<input v-model="draft.position"
      /></label>
    </div>
    <div class="forge-field"><span>标签</span><FormArrayInput v-model="draft.tag" /></div>
    <div v-if="draft.category !== 'asset'" class="forge-field">
      <span>效果</span><FormKeyValueInput v-model="draft.effect" />
    </div>
    <label>描述<textarea v-model="draft.description" rows="3" /></label>
    <template v-if="draft.category === 'asset'">
      <label>总空间<textarea v-model="draft.totalSpace" rows="2" /></label>
      <label>结算<textarea v-model="draft.settlement" rows="2" /></label>
      <label>位置<input v-model="draft.location" /></label>
      <details>
        <summary>内部资产（{{ Object.keys(draft.internalAssets).length }}）</summary>
        <div v-for="(internal, key) in draft.internalAssets" :key="key" class="forge-nested">
          <div class="forge-actions">
            <label class="forge-grow"
              >内部资产名称<input :value="key" @change="renameInternal(key, $event)" /></label
            ><button type="button" class="forge-delete" @click="delete draft.internalAssets[key]">
              删除
            </button>
          </div>
          <div class="forge-grid">
            <label
              >品质<select v-model="internal.品质">
                <option v-for="(label, value) in RARITY_MAP" :key="value" :value="value">
                  {{ label }}
                </option>
              </select></label
            ><label>数量<input v-model.number="internal.数量" type="number" min="1" /></label>
          </div>
          <div class="forge-field"><span>标签</span><FormArrayInput v-model="internal.标签" /></div>
          <div class="forge-field">
            <span>效果</span><FormKeyValueInput v-model="internal.效果" />
          </div>
          <label>描述<textarea v-model="internal.描述" rows="2" /></label
          ><label>总占用空间<input v-model="internal.总占用空间" /></label>
        </div>
        <p v-if="localError" class="forge-error">{{ localError }}</p>
        <button type="button" @click="addInternal">添加内部资产</button>
      </details>
    </template>
  </div>
</template>

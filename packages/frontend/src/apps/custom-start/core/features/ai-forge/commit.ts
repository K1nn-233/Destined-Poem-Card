import type { useCharacterStore } from '../../store/character';
import type { Asset, Equipment, Item, Skill } from '../../types';
import type { ItemDraft, PartnerDraft } from './contracts';
import { toSelectedItem, toSelectedPartner } from './contracts';

type CharacterStore = ReturnType<typeof useCharacterStore>;
export function remainingPoints(store: CharacterStore) {
  return store.character.reincarnationPoints - store.consumedPoints;
}
export function prepareItems(store: CharacterStore, drafts: ItemDraft[]) {
  if (!drafts.length) throw new Error('没有待注入项目');
  const names = {
    equipment: new Set(store.selectedEquipments.map(i => i.name.trim())),
    item: new Set(store.selectedItems.map(i => i.name.trim())),
    asset: new Set(store.selectedAssets.map(i => i.name.trim())),
    skill: new Set(store.selectedSkills.map(i => i.name.trim())),
  };
  const result = drafts.map(draft => {
    const data = toSelectedItem(draft);
    if (names[draft.category].has(data.name))
      throw new Error(`「${data.name}」已存在，请改名或删除重复项`);
    names[draft.category].add(data.name);
    return { category: draft.category, data };
  });
  const total = result.reduce((sum, entry) => sum + entry.data.cost, 0);
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(remainingPoints(store)) ||
    total > remainingPoints(store)
  )
    throw new Error('转生点数不足，请降低品质、数量或删除部分项目');
  return result;
}
export function commitItems(store: CharacterStore, drafts: ItemDraft[]) {
  // 同步重验整批后再一次patch；不信任AI报价、旧余额或按钮的disabled状态。
  const items = prepareItems(store, drafts);
  store.$patch(state => {
    items.forEach(({ category, data }) => {
      if (category === 'equipment') state.selectedEquipments.push(data as Equipment);
      if (category === 'item') state.selectedItems.push(data as Item);
      if (category === 'asset') state.selectedAssets.push(data as Asset);
      if (category === 'skill') state.selectedSkills.push(data as Skill);
    });
  });
}
export function preparePartner(store: CharacterStore, draft: PartnerDraft) {
  const partner = toSelectedPartner(draft);
  if (store.selectedPartners.some(p => p.name.trim() === partner.name))
    throw new Error(`伙伴「${partner.name}」已存在，请改名或删除重复项`);
  if (!Number.isFinite(remainingPoints(store)) || partner.cost > remainingPoints(store))
    throw new Error('转生点数不足，请降低伙伴等级或调整已选项目');
  return partner;
}
export function commitPartner(store: CharacterStore, draft: PartnerDraft) {
  const partner = preparePartner(store, draft);
  store.$patch(state => {
    state.selectedPartners.push(partner);
  });
}

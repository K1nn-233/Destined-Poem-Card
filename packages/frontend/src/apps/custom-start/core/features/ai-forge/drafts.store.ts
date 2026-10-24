import { defineStore } from 'pinia';
import { ref } from 'vue';
import { CATEGORIES, DEFAULT_COUNTS } from './contracts';
import type { ItemDraft, PartnerDraft, PartnerGenerationOptions, Requirements } from './contracts';

// 只保留在本次开局内，切换步骤不丢草稿；不进入预设、角色卡或聊天变量。
export const useForgeDrafts = defineStore('customStartAIDrafts', () => {
  const requirements = ref(
    Object.fromEntries(
      CATEGORIES.map(c => [c, { count: DEFAULT_COUNTS[c], requirement: '' }]),
    ) as Requirements,
  );
  const items = ref<ItemDraft[]>([]);
  const partner = ref<PartnerDraft | null>(null);
  const partnerDescription = ref('');
  const partnerOptions = ref<PartnerGenerationOptions>({
    tier: 1,
    level: 1,
    equipmentCount: 2,
    skillCount: 5,
  });
  const itemChat = ref<string | null>(null);
  const partnerChat = ref<string | null>(null);
  return {
    requirements,
    items,
    partner,
    partnerDescription,
    partnerOptions,
    itemChat,
    partnerChat,
  };
});

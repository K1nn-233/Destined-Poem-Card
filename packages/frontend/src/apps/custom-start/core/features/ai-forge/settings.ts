import { defineStore } from 'pinia';
import { ref } from 'vue';
import { z } from 'zod';

const KEY = 'custom_start_ai_settings';
export const ForgeSettingsSchema = z.object({
  apiMode: z.enum(['main', 'custom']).catch('main'),
  apiUrl: z.string().trim().catch(''),
  apiKey: z.string().catch(''),
  model: z.string().trim().catch(''),
  maxTokens: z.number().int().min(1024).max(65536).catch(8192),
  worldbookName: z.string().catch(''),
  extraEntries: z.array(z.string()).catch([]),
  // 未设置的模式使用推荐条目；显式列表独立按世界书和推演用途保存。
  entrySelections: z
    .record(
      z.string(),
      z.object({
        items: z.array(z.string()).optional(),
        partner: z.array(z.string()).optional(),
      }),
    )
    .catch({}),
});
export type ForgeSettings = z.infer<typeof ForgeSettingsSchema>;
export const useForgeSettings = defineStore('customStartAISettings', () => {
  const settings = ref(ForgeSettingsSchema.parse({}));
  const loaded = ref(false);
  const load = () => {
    if (loaded.value) return;
    try {
      settings.value = ForgeSettingsSchema.parse(getVariables({ type: 'global' })[KEY] ?? {});
    } catch {
      /* 普通预览或宿主尚未就绪时沿用主API默认值。 */
    }
    loaded.value = true;
  };
  const save = async () => {
    const next = ForgeSettingsSchema.parse(settings.value);
    await insertOrAssignVariables({ [KEY]: next }, { type: 'global' });
    settings.value = next;
  };
  return { settings, load, save };
});

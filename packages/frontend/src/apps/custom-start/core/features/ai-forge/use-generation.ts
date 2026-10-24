import { onMounted, onUnmounted, ref } from 'vue';
import { validationMessage } from './contracts';

// 同一开局iframe共享锁，分类生成与伙伴生成不会并行发起请求。
const active = ref<string | null>(null);
export function useGeneration() {
  const busy = ref(false);
  const error = ref('');
  let current: string | null = null;
  const cancel = () => {
    const id = current;
    current = null;
    busy.value = false;
    if (active.value === id) active.value = null;
    if (id) {
      try {
        stopGenerationById(id);
      } catch {
        /* 晚到结果仍由id检查丢弃 */
      }
    }
  };
  onMounted(() => window.addEventListener('pagehide', cancel));
  onUnmounted(() => {
    cancel();
    window.removeEventListener('pagehide', cancel);
  });
  const run = async <T>(
    operation: (id: string, isCurrent: () => boolean) => Promise<T>,
    secret: string,
  ): Promise<T | null> => {
    if (active.value) {
      error.value = '已有推演正在进行，请等待完成或取消';
      return null;
    }
    const id = `custom-start-${crypto.randomUUID()}`;
    let chat: string;
    try {
      chat = SillyTavern.getCurrentChatId();
    } catch {
      error.value = '未连接到酒馆，请在开局页面中使用推演';
      return null;
    }
    current = id;
    active.value = id;
    busy.value = true;
    error.value = '';
    const isCurrent = () => current === id && SillyTavern.getCurrentChatId() === chat;
    try {
      const result = await operation(id, isCurrent);
      if (!isCurrent()) {
        if (current === id) error.value = '聊天已切换，本次结果已丢弃';
        return null;
      }
      return result;
    } catch (e) {
      if (current === id)
        error.value = secret
          ? validationMessage(e).split(secret).join('[已隐藏]')
          : validationMessage(e);
      return null;
    } finally {
      if (current === id) {
        current = null;
        busy.value = false;
      }
      if (active.value === id) active.value = null;
    }
  };
  return { busy, error, run, cancel };
}

const SessionStoragePrefix = 'status-sub-tab';

export const buildSessionKey = (scope_name: string, state_key: string) => {
  const messageId = typeof getCurrentMessageId === 'function' ? getCurrentMessageId() : 'unknown';
  return `${SessionStoragePrefix}:${messageId}:${scope_name}:${state_key}`;
};

export const readSessionState = <T>(storage_key: string, fallback_value: T): T => {
  try {
    const rawValue = sessionStorage.getItem(storage_key);
    if (!rawValue) {
      return fallback_value;
    }

    const parsedValue = JSON.parse(rawValue) as T;
    return parsedValue ?? fallback_value;
  } catch (error) {
    console.warn('[StatusTab] 读取会话状态失败:', error);
    return fallback_value;
  }
};

export const writeSessionState = <T>(storage_key: string, next_value: T): void => {
  try {
    sessionStorage.setItem(storage_key, JSON.stringify(next_value));
  } catch (error) {
    console.warn('[StatusTab] 保存会话状态失败:', error);
  }
};

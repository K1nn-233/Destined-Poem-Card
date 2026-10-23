import { loadDataJson5 } from '@/shared/load-json5';

export const loadPredefinedData = async <T>(fileName: string, logLabel: string): Promise<T> => {
  const data = await loadDataJson5<T>(fileName);
  console.log(`[${logLabel}] 成功加载预定义数据文件:`, fileName);
  return data;
};

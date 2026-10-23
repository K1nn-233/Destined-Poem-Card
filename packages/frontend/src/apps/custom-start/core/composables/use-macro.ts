import { klona } from 'klona';

/**
 * 使用酒馆宏解析文本
 */
export async function parseMacro(text: string): Promise<string> {
  if (!text) return text;
  try {
    return (await SillyTavern.substituteParams(text)) as unknown as string;
  } catch {
    return text;
  }
}

/**
 * 深度遍历对象，解析所有字符串字段中的宏
 * @param obj 要解析的对象
 * @returns 解析后的对象深拷贝
 */
export async function parseMacroDeep<T>(obj: T): Promise<T> {
  const cloned = klona(obj);

  const parseValue = async (value: unknown): Promise<unknown> => {
    if (_.isString(value)) {
      return parseMacro(value);
    }
    if (_.isArray(value)) {
      return Promise.all(value.map(parseValue));
    }
    if (_.isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = await parseValue(v);
      }
      return result;
    }
    return value;
  };

  return (await parseValue(cloned)) as T;
}

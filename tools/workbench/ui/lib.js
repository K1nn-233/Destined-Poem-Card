import { reactive } from "/vendor/vue.js";

export const toasts = reactive([]);
export function toast(message, type = "info", ms = 3500) {
  const item = { id: Math.random(), message, type };
  toasts.push(item);
  setTimeout(() => toasts.splice(toasts.indexOf(item), 1), ms);
}

export const connection = reactive({ online: true });

export async function api(url, options = {}) {
  const init = { ...options };
  if (options.body !== undefined && typeof options.body !== "string") {
    init.method ??= "POST";
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  let response;
  try {
    response = await fetch(url, init);
    connection.online = true;
  } catch {
    connection.online = false;
    throw Object.assign(
      new Error("连不上工作台服务。请确认那个黑色窗口还开着；关掉了的话，重新双击「打开工作台」。"),
      { code: "OFFLINE" },
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`服务返回了无法读取的结果（${response.status}）`);
  }
  if (!response.ok || data.ok === false)
    throw Object.assign(new Error(data.error?.message ?? `请求失败（${response.status}）`), {
      code: data.error?.code,
      details: data.error?.details,
    });
  return data;
}

export const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
export function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// 把编辑前后的差异变成最小的修改操作，只改动到的字段会被写回文件，注释和其他内容保持原样。
export function diffOps(before, after, path = [], ops = []) {
  if (same(before, after)) return ops;
  if (plain(before) && plain(after)) {
    const removed = Object.keys(before).filter((k) => !(k in after));
    const added = Object.keys(after).filter((k) => !(k in before));
    // 改名或调整顺序时整体替换，保留界面上看到的顺序。
    const orderChanged = Object.keys(before).filter((k) => k in after).join("\u0000") !== Object.keys(after).filter((k) => k in before).join("\u0000");
    if ((removed.length && added.length) || orderChanged) {
      ops.push({ path, value: after });
      return ops;
    }
    for (const k of removed) ops.push({ path: [...path, k], remove: true });
    for (const k of Object.keys(after)) {
      if (!(k in before)) ops.push({ path: [...path, k], value: after[k] });
      else diffOps(before[k], after[k], [...path, k], ops);
    }
    return ops;
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length && before.some(plain)) {
    before.forEach((v, i) => diffOps(v, after[i], [...path, i], ops));
    return ops;
  }
  ops.push({ path, value: after });
  return ops;
}

// 按已有条目生成一个空白模板，字段结构不变、内容清空。
export function blankLike(value) {
  if (Array.isArray(value)) return [];
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blankLike(v)]));
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  return "";
}

export const RARITIES = [
  { value: "common", label: "普通", color: "#776748" },
  { value: "uncommon", label: "优良", color: "#206d35" },
  { value: "rare", label: "稀有", color: "#4a5ba0" },
  { value: "epic", label: "史诗", color: "#833fae" },
  { value: "legendary", label: "传说", color: "#a65a00" },
  { value: "mythic", label: "神话", color: "#d12a2b" },
  { value: "only", label: "唯一", color: "#0d7278" },
];
export const rarity = (value) => RARITIES.find((r) => r.value === value);
// 与自定义开局的点数参考区间一致。
export const COST_RANGES = {
  common: [5, 30], uncommon: [20, 60], rare: [35, 100], epic: [80, 200], legendary: [150, 400], mythic: [300, 1000], only: [666, 666],
};
export const ASSET_COST_RANGES = {
  common: [100, 180], uncommon: [180, 350], rare: [350, 700], epic: [700, 1300], legendary: [1300, 2200], mythic: [2200, 3000], only: [666, 666],
};

export const LABELS = {
  name: "名称", cost: "点数", rarity: "稀有度", type: "类型", tag: "标签", effect: "效果", description: "描述",
  quantity: "数量", position: "部位", consume: "消耗", lifeLevel: "生命层级", level: "等级", race: "种族",
  identity: "身份", career: "职业", personality: "性格", like: "喜好", app: "外貌", cloth: "衣着", equip: "装备",
  attributes: "属性", strength: "力量", dexterity: "敏捷", constitution: "体质", intelligence: "智力", mind: "精神",
  stairway: "登神长阶", isOpen: "已开启", elements: "要素", powers: "权能", laws: "法则", godlyRank: "神位",
  godKingdom: "神国", isContract: "已契约", affinity: "好感度", comment: "备注", backgroundInfo: "背景信息",
  skills: "技能", requiredRace: "限定种族", requiredLocation: "限定地点", requiredIdentity: "限定身份",
  genders: "性别选项", raceCosts: "种族点数", identityCosts: "身份点数", startLocations: "出生地",
  startDate: "轮换起始日期", weeks: "每周推荐", note: "说明", _隐藏: "隐藏",
};
export const label = (key) => (typeof key === "number" ? `第 ${key + 1} 项` : LABELS[key] ?? key);
// 这些对象的键是固定字段，不允许在界面里改名或增删。
export const FIXED_KEYS = new Set(["attributes", "godKingdom", "stairway"]);
// 这些字段的值通常较长，用多行输入框。
export const LONG_KEYS = new Set(["description", "描述", "personality", "like", "app", "cloth", "backgroundInfo", "comment", "note", "总空间", "结算"]);
export const FIELD_ORDER = ["name", "cost", "rarity", "type", "quantity", "position", "consume", "tag"];

// 对比两个版本的变量结构（zod 导出的 JSON Schema，io: input），判断旧存档还能不能直接用。
// breaking：旧存档的变量需要玩家手动改（删字段、改类型、新增无默认值的必填字段、可选值变少）
// review：约束或默认值变了，通常不影响旧存档，但发版前看一眼
// compatible：新增带默认值或可选的字段、可选值变多
const IGNORED = new Set(["description", "title", "$schema", "examples"]);
const STRUCTURE = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "prefixItems",
  "anyOf",
  "oneOf",
  "allOf",
  "enum",
  "const",
  "default",
  "$ref",
  "$defs",
  "definitions",
]);

const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (plain(value))
    return `{${Object.keys(value)
      .filter((k) => !IGNORED.has(k))
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
// 展开 $ref，让编号不同但结构相同的定义能直接比较。
export function deref(schema) {
  const defs = { ...(schema.definitions ?? {}), ...(schema.$defs ?? {}) };
  const walk = (node, stack) => {
    if (Array.isArray(node)) return node.map((n) => walk(n, stack));
    if (!plain(node)) return node;
    if (typeof node.$ref === "string") {
      const name = node.$ref.replace(/^#\/(\$defs|definitions)\//, "");
      if (node.$ref === "#") return { recursive: "#" };
      if (stack.includes(name)) return { recursive: name };
      const { $ref, ...rest } = node;
      return walk({ ...defs[name], ...rest }, [...stack, name]);
    }
    const out = {};
    for (const [k, v] of Object.entries(node))
      if (k !== "$defs" && k !== "definitions") out[k] = walk(v, stack);
    return out;
  };
  return walk(schema, []);
}
const types = (node) => {
  if (node.type) return [].concat(node.type).sort();
  if (node.properties) return ["object"];
  if (node.items) return ["array"];
  return [];
};
const label = (path) => (path.length ? path.join(".") : "（根）");

export function diffSchemas(before, after) {
  const changes = [];
  const add = (level, path, text) =>
    changes.push({ level, path: label(path), text });
  const walk = (a, b, path) => {
    if (!plain(a) || !plain(b)) {
      if (canonical(a) !== canonical(b)) add("breaking", path, "结构改变");
      return;
    }
    if (canonical(a) === canonical(b)) return;
    const variants = (n) => n.anyOf ?? n.oneOf;
    if (variants(a) || variants(b)) {
      const oldSet = new Set((variants(a) ?? [a]).map(canonical));
      const newSet = new Set((variants(b) ?? [b]).map(canonical));
      const lost = [...oldSet].filter((x) => !newSet.has(x));
      if (lost.length) add("breaking", path, "可接受的类型或取值变少了");
      else add("compatible", path, "可接受的类型或取值变多了");
      return;
    }
    const ta = types(a);
    const tb = types(b);
    if (ta.length && tb.length && canonical(ta) !== canonical(tb)) {
      if (ta.every((t) => tb.includes(t)))
        add("compatible", path, `类型放宽：${ta.join("/")} → ${tb.join("/")}`);
      else add("breaking", path, `类型改变：${ta.join("/")} → ${tb.join("/")}`);
      return;
    }
    if (a.enum || b.enum) {
      const oldEnum = (a.enum ?? []).map(canonical);
      const newEnum = new Set((b.enum ?? []).map(canonical));
      if (!b.enum) add("compatible", path, "取消了固定取值");
      else if (oldEnum.some((x) => !newEnum.has(x)) || !a.enum)
        add("breaking", path, "固定取值变少了");
      else add("compatible", path, "固定取值变多了");
    }
    if (a.properties || b.properties) {
      const pa = a.properties ?? {};
      const pb = b.properties ?? {};
      const ra = new Set(a.required ?? []);
      const rb = new Set(b.required ?? []);
      for (const key of Object.keys(pa))
        if (!(key in pb)) add("breaking", [...path, key], "删除了字段");
      for (const key of Object.keys(pb)) {
        if (!(key in pa)) {
          if (rb.has(key))
            add("breaking", [...path, key], "新增了必填字段（没有默认值）");
          else add("compatible", [...path, key], "新增字段（有默认值或可选）");
          continue;
        }
        if (rb.has(key) && !ra.has(key))
          add("breaking", [...path, key], "字段从可选变成必填");
        else if (!rb.has(key) && ra.has(key))
          add("compatible", [...path, key], "字段从必填变成可选");
        walk(pa[key], pb[key], [...path, key]);
      }
    }
    for (const key of ["additionalProperties", "items"]) {
      const sub = key === "items" ? "[]" : "{*}";
      if (plain(a[key]) && plain(b[key])) walk(a[key], b[key], [...path, sub]);
      else if (canonical(a[key]) !== canonical(b[key])) {
        if (b[key] === undefined || b[key] === true)
          add("compatible", [...path, sub], "放宽了限制");
        else add("breaking", [...path, sub], "收紧了限制");
      }
    }
    if (canonical(a.default) !== canonical(b.default) && path.length)
      add("review", path, "默认值改变");
    const rest = (n) =>
      canonical(
        Object.fromEntries(
          Object.entries(n).filter(([k]) => !STRUCTURE.has(k)),
        ),
      );
    if (rest(a) !== rest(b)) add("review", path, "取值范围或格式约束改变");
  };
  walk(deref(before), deref(after), []);
  const breaking = changes.filter((c) => c.level === "breaking");
  return {
    changes,
    breaking: breaking.length > 0,
    suggested: breaking.length ? "minor" : "patch",
  };
}

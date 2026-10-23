// 状态栏主题：直接读写 packages/frontend/src/apps/status/config/theme-presets.ts。
// 只替换颜色值所在的那一行，注释、顺序和其它代码保持不变。
export const THEME_FILE = "packages/frontend/src/apps/status/config/theme-presets.ts";

const BLOCK = /const (\w+): Theme = \{([\s\S]*?)\n\};/g;
const LINE = /^(\s+)(\w+): '((?:[^'\\]|\\.)*)',?\s*$/;
const unquote = (s) => s.replace(/\\(.)/g, "$1");
const quote = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export function parseThemes(text) {
  const themes = [];
  for (const match of text.matchAll(BLOCK)) {
    const body = match[2];
    const id = /\n\s+id: '([^']+)'/.exec(body)?.[1];
    const name = /\n\s+name: '([^']+)'/.exec(body)?.[1];
    const colorsStart = body.indexOf("colors: {");
    if (!id || colorsStart < 0) continue;
    const colors = {};
    for (const line of body.slice(colorsStart).split(/\r?\n/).slice(1)) {
      if (/^\s*\},?\s*$/.test(line)) break;
      const m = LINE.exec(line);
      if (m) colors[m[2]] = unquote(m[3]);
    }
    themes.push({ id, name, constName: match[1], colors });
  }
  if (!themes.length) throw new Error("没有在主题文件里找到任何主题");
  return themes;
}

// changes: { 主题id: { 颜色键: 新值 } }
export function applyThemeChanges(text, changes) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let out = text;
  for (const match of [...text.matchAll(BLOCK)].reverse()) {
    const body = match[2];
    const id = /\n\s+id: '([^']+)'/.exec(body)?.[1];
    const wanted = changes[id];
    if (!wanted) continue;
    const colorsStart = body.indexOf("colors: {");
    const lines = body.slice(colorsStart).split(/\r?\n/);
    const seen = new Set();
    for (let i = 1; i < lines.length; i++) {
      if (/^\s*\},?\s*$/.test(lines[i])) break;
      const m = LINE.exec(lines[i]);
      if (!m || !Object.hasOwn(wanted, m[2])) continue;
      const value = wanted[m[2]];
      if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value))
        throw new Error(`「${id}」的 ${m[2]} 颜色值无效`);
      lines[i] = `${m[1]}${m[2]}: '${quote(value.trim())}',`;
      seen.add(m[2]);
    }
    const missing = Object.keys(wanted).filter((k) => !seen.has(k));
    if (missing.length) throw new Error(`「${id}」里找不到这些颜色：${missing.join("、")}`);
    const nextBody = body.slice(0, colorsStart) + lines.join(eol);
    const start = match.index + match[0].indexOf(body);
    out = out.slice(0, start) + nextBody + out.slice(start + body.length);
  }
  return out;
}

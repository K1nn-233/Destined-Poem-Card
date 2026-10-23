// 工作台的本机接口：概览、检查/构建、开局数据和地图文件的读写与撤销。
// 只写白名单里的文件；每次写入前把旧版本存进 .cache/workbench/history，可在界面里撤销。
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import JSON5 from "json5";
import YAML from "yaml";
import { modify, applyEdits, parseTree, findNodeAtLocation } from "jsonc-parser";
import { cardIdentity } from "../lib/version.mjs";
import { readCover, writeCover } from "../lib/cover.mjs";
import { unreleasedNotes } from "../release.mjs";
import { THEME_FILE, parseThemes, applyThemeChanges } from "./themes.mjs";

export class WorkbenchError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const CATALOGS = [
  { file: "baseInfo.json", label: "基础信息", hint: "性别、种族、身份、出生地及其点数" },
  { file: "backgrounds.json", label: "开局背景", hint: "开局时可选的背景故事" },
  { file: "equipments.json", label: "装备", hint: "武器、防具和饰品" },
  { file: "items.json", label: "道具", hint: "药剂、消耗品和杂物" },
  { file: "skills.json", label: "技能", hint: "各学派的主动与被动技能" },
  { file: "partners.json", label: "伙伴", hint: "开局可招募的伙伴" },
  { file: "assets.json", label: "资产", hint: "住宅、载具和产业" },
  { file: "SPECIAL_RECOMMEND_CORES.json", label: "每周推荐核心", hint: "首页每周轮换推荐的核心", editor: "weekly" },
  { file: "coreClassification.json", dir: "content/ui", label: "核心分类", hint: "首页核心列表的分组和介绍", editor: "cores" },
];
const GEOGRAPHY_FILES = {
  "places.yaml": "places",
  "edges.yaml": "edges",
  "marker0502_wsrv.txt": null,
};
const RARITIES = new Set(["only", "common", "uncommon", "rare", "epic", "legendary", "mythic"]);
const sha = (text) => createHash("sha256").update(text).digest("hex");
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function json(response, data, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}
async function body(request, limit = 30 * 1024 * 1024) {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new WorkbenchError("REQUEST_FORMAT", "请求格式不对，请刷新工作台后重试");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new WorkbenchError("REQUEST_SIZE", "提交的内容太大");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WorkbenchError("REQUEST_FORMAT", "提交的内容无法读取，请刷新工作台后重试");
  }
}

// 按顺序在已解析的数据上执行同样的操作，用来核对文本编辑的结果。
function applyToData(data, ops) {
  const result = structuredClone(data);
  for (const op of ops) {
    const parentPath = op.path.slice(0, -1);
    const key = op.path.at(-1);
    let parent = result;
    for (const part of parentPath) parent = parent?.[part];
    if (parent === null || typeof parent !== "object")
      throw new WorkbenchError("BAD_PATH", `找不到要修改的位置：${op.path.join(" / ")}`);
    if (typeof op.rename === "string") {
      // 改名时保持原来的顺序
      if (!plain(parent) || !Object.hasOwn(parent, key)) throw new WorkbenchError("BAD_PATH", `找不到要改名的分类：${key}`);
      if (Object.hasOwn(parent, op.rename)) throw new WorkbenchError("INVALID", `已经有叫「${op.rename}」的分类了`);
      const entries = Object.entries(parent).map(([k, v]) => [k === key ? op.rename : k, v]);
      for (const k of Object.keys(parent)) delete parent[k];
      Object.assign(parent, Object.fromEntries(entries));
    } else if (op.insert) {
      if (!Array.isArray(parent)) throw new WorkbenchError("BAD_PATH", "只能在列表中插入条目");
      parent.splice(key, 0, structuredClone(op.value));
    } else if (op.remove) {
      if (Array.isArray(parent)) parent.splice(key, 1);
      else delete parent[key];
    } else parent[key] = structuredClone(op.value);
  }
  return result;
}
function sameValue(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (plain(a))
    return plain(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.hasOwn(b, k) && sameValue(a[k], b[k]));
  return Object.is(a, b);
}
export function editCatalogText(text, ops) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = text.match(/\n( +)\S/)?.[1].length ?? 2;
  const formattingOptions = { insertSpaces: true, tabSize: indent, eol };
  let next = text;
  for (const op of ops) {
    if (!Array.isArray(op?.path) || !op.path.length || !op.path.every((p) => typeof p === "string" || Number.isInteger(p)))
      throw new WorkbenchError("BAD_PATH", "修改位置格式不对");
    if (typeof op.rename === "string") {
      if (!op.rename.trim()) throw new WorkbenchError("INVALID", "分类名不能为空");
      const node = findNodeAtLocation(parseTree(next), op.path);
      const keyNode = node?.parent?.type === "property" ? node.parent.children[0] : null;
      if (!keyNode) throw new WorkbenchError("BAD_PATH", `找不到要改名的分类：${op.path.join(" / ")}`);
      next = next.slice(0, keyNode.offset) + JSON.stringify(op.rename) + next.slice(keyNode.offset + keyNode.length);
      continue;
    }
    const edits = modify(next, op.path, op.remove ? undefined : op.value, {
      formattingOptions,
      isArrayInsertion: Boolean(op.insert),
    });
    next = applyEdits(next, edits);
  }
  return next;
}
export function validateCatalog(data) {
  const problems = [];
  if (!plain(data)) return ["文件最外层必须是一个对象"];
  for (const [category, value] of Object.entries(data)) {
    if (!Array.isArray(value) || !value.every(plain)) continue;
    value.forEach((item, index) => {
      const where = `${category} 第 ${index + 1} 条`;
      if (typeof item.name !== "string" || !item.name.trim()) problems.push(`${where}：名称不能为空`);
      if ("cost" in item && (typeof item.cost !== "number" || !Number.isFinite(item.cost)))
        problems.push(`${where}（${item.name}）：点数必须是数字`);
      if ("rarity" in item && !RARITIES.has(item.rarity))
        problems.push(`${where}（${item.name}）：稀有度「${item.rarity}」不在可选范围内`);
    });
  }
  return problems;
}

export function createWorkbench({ root, sync }) {
  const historyDir = path.join(root, ".cache/workbench/history");
  const catalogPath = (file) => {
    const item = CATALOGS.find((c) => c.file === file);
    if (!item) throw new WorkbenchError("NOT_FOUND", "没有这个数据文件");
    return path.join(root, item.dir ?? "content/catalogs", file);
  };
  const geographyPath = (file) => {
    if (!Object.hasOwn(GEOGRAPHY_FILES, file))
      throw new WorkbenchError("NOT_FOUND", "没有这个地图文件");
    return path.join(root, "content/geography", file);
  };
  let task = null;

  async function remember(relative, summary) {
    const absolute = path.join(root, relative);
    let text;
    try {
      text = await fs.readFile(absolute, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    await fs.mkdir(historyDir, { recursive: true });
    const id = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(path.join(historyDir, `${id}.json`), JSON.stringify({ id, time: new Date().toISOString(), file: relative, summary, text }));
  }
  async function writeFile(relative, text, summary) {
    await remember(relative, summary);
    const absolute = path.join(root, relative);
    const temporary = `${absolute}.workbench-tmp`;
    await fs.writeFile(temporary, text, "utf8");
    await fs.rename(temporary, absolute);
  }
  async function history() {
    let names = [];
    try {
      names = (await fs.readdir(historyDir)).filter((n) => n.endsWith(".json")).sort().reverse().slice(0, 50);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const items = [];
    for (const name of names) {
      const { id, time, file, summary } = JSON.parse(await fs.readFile(path.join(historyDir, name), "utf8"));
      items.push({ id, time, file, summary });
    }
    return items;
  }
  async function undo(id) {
    if (typeof id !== "string" || !/^[\w-]+$/.test(id)) throw new WorkbenchError("NOT_FOUND", "没有这条记录");
    let entry;
    try {
      entry = JSON.parse(await fs.readFile(path.join(historyDir, `${id}.json`), "utf8"));
    } catch {
      throw new WorkbenchError("NOT_FOUND", "没有这条记录");
    }
    const allowed = entry.file.startsWith("content/catalogs/") || entry.file.startsWith("content/geography/") || entry.file === "CHANGELOG.md" || entry.file === THEME_FILE || CATALOGS.some((c) => c.dir && entry.file === `${c.dir}/${c.file}`);
    if (!allowed || entry.file.includes("..")) throw new WorkbenchError("NOT_FOUND", "这条记录不能恢复");
    await writeFile(entry.file, entry.text, `撤销：${entry.summary}`);
    return { file: entry.file };
  }

  async function newestSourceTime() {
    let newest = 0;
    async function walk(directory) {
      let entries;
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (["node_modules", "dist", ".cache"].includes(entry.name)) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (!/\.(md|txt)$/i.test(entry.name) || directory.includes(`${path.sep}worldbook`))
          newest = Math.max(newest, (await fs.stat(full)).mtimeMs);
      }
    }
    for (const part of ["card", "worldbook", "content", "packages", "build", "release.json"]) {
      const full = path.join(root, part);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      if (stat.isDirectory()) await walk(full);
      else newest = Math.max(newest, stat.mtimeMs);
    }
    return newest;
  }
  function run(args) {
    return new Promise((resolve) => {
      const started = Date.now();
      const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
      let output = "";
      const take = (chunk) => {
        output += chunk.toString("utf8");
        if (output.length > 400_000) output = output.slice(-400_000);
      };
      child.stdout.on("data", take);
      child.stderr.on("data", take);
      child.on("error", (error) => resolve({ ok: false, output: error.message, ms: Date.now() - started }));
      child.on("close", (code) => resolve({ ok: code === 0, output, ms: Date.now() - started }));
    });
  }
  async function overview() {
    const release = JSON.parse(await fs.readFile(path.join(root, "release.json"), "utf8"));
    const check = await run(["tools/card.mjs", "check"]);
    let stats = null;
    try {
      stats = JSON.parse(check.output.slice(check.output.indexOf("{")));
    } catch {
      /* 检查失败时只给出原始输出 */
    }
    let build = null;
    try {
      const reportFile = path.join(root, "dist/local/report.json");
      const report = JSON.parse(await fs.readFile(reportFile, "utf8"));
      build = { time: (await fs.stat(reportFile)).mtime.toISOString(), sha256: report.sha256, entries: report.worldbook?.entries, version: report.cardVersion };
      build.stale = (await newestSourceTime()) > (await fs.stat(reportFile)).mtimeMs;
    } catch {
      /* 还没有构建过 */
    }
    const places = YAML.parse(await fs.readFile(geographyPath("places.yaml"), "utf8"))?.places ?? [];
    const edges = YAML.parse(await fs.readFile(geographyPath("edges.yaml"), "utf8"))?.edges ?? [];
    return {
      card: { ...cardIdentity(release), releasedAt: release.releasedAt ?? null },
      check: { ok: check.ok, stats, output: check.ok ? "" : check.output },
      build,
      geography: { places: places.length, edges: edges.length },
      task: task && { name: task.name, startedAt: task.startedAt },
    };
  }
  async function runTask(name, options = {}) {
    const commands = {
      check: ["tools/card.mjs", "check"],
      build: ["tools/card.mjs", "build", "--profile", "local"],
      // 版本号由开发组在页面上填，这里只收 主.次.补丁 格式。
      release: /^v?\d+\.\d+\.\d+$/i.test(String(options.version ?? "").trim())
        ? ["tools/card.mjs", "release", String(options.version).trim()]
        : null,
    };
    if (name === "release" && !commands.release) throw new WorkbenchError("INVALID", "版本号格式应为 主.次.补丁，比如 4.3.4");
    if (!commands[name]) throw new WorkbenchError("NOT_FOUND", "未知操作");
    if (task || sync?.activeJob) throw new WorkbenchError("BUSY", "另一项构建或推送正在进行，请等它结束");
    task = { name, startedAt: new Date().toISOString() };
    try {
      return await run(commands[name]);
    } finally {
      task = null;
    }
  }
  // 世界书里的命定核心（和首页 CorePage.ts 用同一套规则识别）。
  async function worldbookCores() {
    const { loadWorldbook } = await import("../lib/card-source.mjs");
    const { entries } = await loadWorldbook();
    return entries
      .filter((e) => /\[命定系统\](?!➡️系统(?:开始|结束)$)/.test(e.名称 ?? ""))
      .map((e) => {
        const rest = e.名称.replace(/^.*\[命定系统\]/, "");
        return { name: e.名称, label: rest.replace(/\(([^)]*)\)$/, ""), author: rest.match(/\(([^)]*)\)$/)?.[1] ?? "" };
      });
  }
  async function versionInfo() {
    const result = await run(["tools/card.mjs", "version", "--json"]);
    const line = result.output.trim().split("\n").at(-1);
    if (!result.ok) throw new WorkbenchError("VERSION", `读取版本信息失败：${result.output.slice(-1500)}`);
    return JSON.parse(line);
  }
  async function saveNotes({ notes }) {
    if (typeof notes !== "string") throw new WorkbenchError("INVALID", "更新记录格式不对");
    const file = "CHANGELOG.md";
    let text;
    try {
      text = await fs.readFile(path.join(root, file), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      text = "# 更新日志\n\n## 未发布\n";
    }
    const section = unreleasedNotes(text);
    const body = notes.trim() ? `\n${notes.trim()}\n\n` : "\n";
    const next = section
      ? text.slice(0, section.bodyStart) + body + text.slice(section.end).replace(/^\n+/, "")
      : text.replace(/\n*$/, "\n\n## 未发布\n") + body;
    await writeFile(file, next.replace(/\n*$/, "\n"), "修改更新记录");
    return { notes: notes.trim() };
  }
  async function replaceCover({ data }) {
    if (typeof data !== "string" || !data) throw new WorkbenchError("INVALID", "没有收到图片");
    if (task || sync?.activeJob) throw new WorkbenchError("BUSY", "构建或推送进行中，等它结束再换封面");
    // 旧封面留一份，换错了可以从 .cache/workbench/covers 找回。
    try {
      const old = await readCover();
      const dir = path.join(root, ".cache/workbench/covers");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}.png`), old.bytes);
    } catch {
      /* 之前没有封面 */
    }
    try {
      const cover = await writeCover(Buffer.from(data, "base64"));
      return { width: cover.width, height: cover.height, sha256: cover.sha256 };
    } catch (error) {
      throw new WorkbenchError("INVALID", error.message);
    }
  }
  async function readThemes() {
    const text = await fs.readFile(path.join(root, THEME_FILE), "utf8");
    try {
      return { hash: sha(text), themes: parseThemes(text) };
    } catch (error) {
      throw new WorkbenchError("PARSE", `主题文件读不出来：${error.message}`);
    }
  }
  async function saveThemes({ hash, changes, summary }) {
    const text = await fs.readFile(path.join(root, THEME_FILE), "utf8");
    if (hash !== sha(text))
      throw new WorkbenchError("CONFLICT", "主题文件在你编辑期间被别处改过了。请先记下你的修改，刷新后再改一次。");
    if (!plain(changes) || !Object.keys(changes).length) throw new WorkbenchError("NO_CHANGE", "没有需要保存的修改");
    let next;
    try {
      next = applyThemeChanges(text, changes);
    } catch (error) {
      throw new WorkbenchError("INVALID", error.message);
    }
    const themes = parseThemes(next);
    for (const [id, colors] of Object.entries(changes))
      for (const [key, value] of Object.entries(colors))
        if (themes.find((t) => t.id === id)?.colors[key] !== value.trim())
          throw new WorkbenchError("INTERNAL", "保存结果与预期不一致，已取消保存，文件没有改动");
    await writeFile(THEME_FILE, next, summary || "修改状态栏主题");
    return { hash: sha(next), themes };
  }
  async function readCatalog(file) {
    const text = await fs.readFile(catalogPath(file), "utf8");
    let data;
    try {
      data = JSON5.parse(text);
    } catch (error) {
      throw new WorkbenchError("PARSE", `${file} 本身有格式错误，需要先手动修好：${error.message}`);
    }
    return { file, hash: sha(text), data };
  }
  async function saveCatalog(file, { hash, ops, summary }) {
    const absolute = catalogPath(file);
    const text = await fs.readFile(absolute, "utf8");
    if (hash !== sha(text))
      throw new WorkbenchError("CONFLICT", "这个文件在你编辑期间被别处改过了。请先复制好你的修改，刷新后再改一次。");
    if (!Array.isArray(ops) || !ops.length) throw new WorkbenchError("NO_CHANGE", "没有需要保存的修改");
    const before = JSON5.parse(text);
    const expected = applyToData(before, ops);
    const next = editCatalogText(text, ops);
    let actual;
    try {
      actual = JSON5.parse(next);
    } catch (error) {
      throw new WorkbenchError("INTERNAL", `保存结果格式异常，已取消保存：${error.message}`);
    }
    if (!sameValue(actual, expected)) throw new WorkbenchError("INTERNAL", "保存结果与预期不一致，已取消保存，文件没有改动");
    const problems = validateCatalog(actual);
    if (problems.length) throw new WorkbenchError("INVALID", "数据有问题，没有保存", problems);
    await writeFile(path.relative(root, absolute).replaceAll("\\", "/"), next, summary || `修改 ${file}`);
    return { file, hash: sha(next), data: actual };
  }
  async function saveGeography({ files }) {
    if (!plain(files) || !Object.keys(files).length) throw new WorkbenchError("NO_CHANGE", "没有需要保存的地图文件");
    for (const [file, text] of Object.entries(files)) {
      geographyPath(file);
      if (typeof text !== "string" || !text.trim()) throw new WorkbenchError("INVALID", `${file} 内容为空，没有保存`);
      const key = GEOGRAPHY_FILES[file];
      if (key) {
        let parsed;
        try {
          parsed = YAML.parse(text);
        } catch (error) {
          throw new WorkbenchError("INVALID", `${file} 格式错误，没有保存：${error.message}`);
        }
        if (!Array.isArray(parsed?.[key]) || !parsed[key].length) throw new WorkbenchError("INVALID", `${file} 缺少 ${key} 列表，没有保存`);
      }
    }
    for (const [file, text] of Object.entries(files)) {
      // 沿用原文件的换行方式，避免一次保存让整个文件在 Git 里显示为改动。
      const current = await fs.readFile(geographyPath(file), "utf8").catch(() => "");
      const lf = text.replace(/\r\n/g, "\n");
      const next = current.includes("\r\n") ? lf.replace(/\n/g, "\r\n") : lf;
      if (next === current) continue;
      await writeFile(`content/geography/${file}`, next, `地图编辑器保存 ${file}`);
    }
    return { saved: Object.keys(files) };
  }
  async function syncBackups() {
    const directory = path.join(root, ".cache/sync/backups");
    let names = [];
    try {
      names = (await fs.readdir(directory)).filter((n) => n.endsWith(".json")).sort().reverse().slice(0, 20);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const items = [];
    for (const name of names) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
        items.push({ path: `.cache/sync/backups/${name}`, createdAt: data.createdAt, target: data.target, origin: data.environment?.origin, user: data.environment?.user });
      } catch {
        /* 跳过损坏的备份 */
      }
    }
    return items;
  }

  // 地图底图：与游戏状态栏同一张图（低清版），第一次下载后缓存到本地。
  const MAP_SOURCES = ["https://i.ibb.co/gF7WXfmp/Map-2774-P.avif", "https://l.urusai.cc/pnP7j.avif"];
  const mapCache = path.join(root, ".cache/workbench/map-2774.avif");
  let mapDownload = null;
  async function mapImage() {
    try {
      return await fs.readFile(mapCache);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    mapDownload ??= (async () => {
      const failures = [];
      for (const url of MAP_SOURCES) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length < 10_000) throw new Error("文件太小");
          await fs.mkdir(path.dirname(mapCache), { recursive: true });
          await fs.writeFile(mapCache, bytes);
          return bytes;
        } catch (error) {
          failures.push(`${new URL(url).host}: ${error.message}`);
        }
      }
      throw new WorkbenchError("MAP_DOWNLOAD", `地图底图下载失败，请检查网络后刷新（${failures.join("；")}）`);
    })().finally(() => (mapDownload = null));
    return mapDownload;
  }

  // 返回 true 表示已处理该请求。
  return async function handle(request, response, pathname) {
    if (!pathname.startsWith("/_workbench/")) return false;
    try {
      const route = pathname.slice("/_workbench/".length);
      const method = request.method;
      let catalog;
      if (method === "GET" && route === "overview") json(response, { ok: true, ...(await overview()) });
      else if (method === "POST" && route === "tasks") json(response, { ok: true, ...(await (async () => { const b = await body(request); return runTask(b.name, b); })()) });
      else if (method === "GET" && route === "catalogs") json(response, { ok: true, catalogs: CATALOGS });
      else if ((catalog = route.match(/^catalogs\/([\w.]+)$/))) {
        if (method === "GET") json(response, { ok: true, ...(await readCatalog(catalog[1])) });
        else if (method === "POST") json(response, { ok: true, ...(await saveCatalog(catalog[1], await body(request))) });
        else throw new WorkbenchError("NOT_FOUND", "未知操作");
      } else if (method === "POST" && route === "geography") json(response, { ok: true, ...(await saveGeography(await body(request))) });
      else if (method === "GET" && route === "history") json(response, { ok: true, items: await history() });
      else if (method === "POST" && route === "history/undo") json(response, { ok: true, ...(await undo((await body(request)).id)) });
      else if (method === "GET" && route === "themes") json(response, { ok: true, ...(await readThemes()) });
      else if (method === "POST" && route === "themes") json(response, { ok: true, ...(await saveThemes(await body(request))) });
      else if (method === "GET" && route === "cores") json(response, { ok: true, cores: await worldbookCores() });
      else if (method === "GET" && route === "version") json(response, { ok: true, ...(await versionInfo()) });
      else if (method === "POST" && route === "notes") json(response, { ok: true, ...(await saveNotes(await body(request))) });
      else if (method === "POST" && route === "cover") json(response, { ok: true, ...(await replaceCover(await body(request))) });
      else if (method === "GET" && route === "cover") {
        let cover;
        try {
          cover = await readCover();
        } catch (error) {
          throw new WorkbenchError("NOT_FOUND", error.message);
        }
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        response.end(cover.bytes);
      }
      else if (method === "GET" && route === "sync-backups") json(response, { ok: true, items: await syncBackups() });
      else if (method === "GET" && route === "map-image") {
        const bytes = await mapImage();
        response.writeHead(200, { "Content-Type": "image/avif", "Cache-Control": "max-age=86400" });
        response.end(bytes);
      }
      else throw new WorkbenchError("NOT_FOUND", "未知操作");
    } catch (error) {
      const status = { NOT_FOUND: 404, CONFLICT: 409, BUSY: 409 }[error.code] ?? (error instanceof WorkbenchError ? 400 : 500);
      json(response, { ok: false, error: { code: error.code ?? "ERROR", message: error.message, details: error.details } }, status);
    }
    return true;
  };
}

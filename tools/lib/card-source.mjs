import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import JSON5 from "json5";
import { cardIdentity, VERSION_PLACEHOLDER } from "./version.mjs";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function insideWorkspace(target) {
  const relative = path.relative(ROOT, path.resolve(target));
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative) ||
    relative.split(path.sep)[0] === "imports"
  )
    throw new Error(`源文件越过工作区边界: ${target}`);
  return target;
}
export const resolveSource = (file) =>
  insideWorkspace(path.resolve(ROOT, file.replaceAll("\\", "/")));
export async function readSourceBytes(file) {
  const target = await fs.realpath(resolveSource(file));
  insideWorkspace(target);
  return fs.readFile(target);
}
export async function readText(file) {
  return (await readSourceBytes(file)).toString("utf8");
}
export function parseSourceJSON(text, file) {
  const normalized = text.replace(/^\uFEFF/, "");
  try {
    return JSON.parse(normalized);
  } catch (cause) {
    let location = "";
    const position = cause.message.match(/position (\d+)/)?.[1];
    if (position !== undefined) {
      const prefix = normalized.slice(0, Number(position)).split("\n");
      location = `（第 ${prefix.length} 行，第 ${prefix.at(-1).length + 1} 列）`;
    } else {
      try {
        JSON5.parse(normalized);
      } catch (diagnostic) {
        if (diagnostic.lineNumber)
          location = `（第 ${diagnostic.lineNumber} 行，第 ${diagnostic.columnNumber} 列）`;
      }
    }
    throw Object.assign(
      new SyntaxError(`${file}${location}: JSON 格式错误: ${cause.message}`, {
        cause,
      }),
      { code: "SOURCE_FORMAT", file },
    );
  }
}
export const readJSON = async (file) =>
  parseSourceJSON(await readText(file), file);
export const normalizeText = (value) => value.replace(/\r\n/g, "\n");
export async function sourceFile(file, base = ROOT) {
  const target = insideWorkspace(
    path.resolve(base, file.replaceAll("\\", "/")),
  );
  const candidates = [
    target,
    ...(await fs.readdir(path.dirname(target)))
      .filter((name) => name.startsWith(path.basename(target) + "."))
      .map((name) => path.join(path.dirname(target), name)),
  ];
  const existing = [];
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) existing.push(candidate);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  if (existing.length !== 1)
    throw new Error(`文件引用必须唯一: ${file} (${existing.length})`);
  return insideWorkspace(await fs.realpath(existing[0]));
}
export function flattenEntries(entries) {
  return entries.flatMap((e) => (e.条目 ? flattenEntries(e.条目) : [e]));
}
export async function loadWorldbook() {
  const file = "worldbook/命定之诗.yaml";
  let manifest;
  try {
    manifest = YAML.parse(await readText(file));
  } catch (cause) {
    throw Object.assign(
      new Error(`${file}: YAML 格式错误: ${cause.message}`, { cause }),
      { code: "SOURCE_FORMAT", file },
    );
  }
  if (!Array.isArray(manifest?.条目))
    throw new Error(`${file}: 条目必须是数组`);
  const entries = flattenEntries(manifest.条目);
  const references = [];
  for (const entry of entries) {
    if (entry.文件)
      references.push({
        entry,
        file: await sourceFile(entry.文件, resolveSource("worldbook")),
      });
  }
  return { manifest, entries, references };
}
export function assetOrigins(release, profile = "local") {
  if (!["local", "release"].includes(profile))
    throw new Error(`未知构建配置: ${profile}`);
  const origin =
    profile === "local"
      ? release.localOrigin.replace(/\/$/, "")
      : `https://testingcf.jsdelivr.net/gh/${release.repository}@${cardIdentity(release).tag}`;
  const base = `${origin}/dist/${profile}`;
  return { origin, base, assetBase: base + "/frontend" };
}
export async function assembleCard({
  book,
  mapMarkers,
  release,
  profile = "local",
  version = VERSION_PLACEHOLDER,
}) {
  const card = await readJSON("card/meta.json");
  const identity = cardIdentity(release);
  // 卡名、世界书名、版本号统一由 release.json 决定，meta.json 里的同名字段会被覆盖。
  card.name = card.data.name = identity.name;
  card.data.extensions.world = identity.worldbook;
  // 作者备注里写 {{版本}}，构建时换成实际版本号。
  for (const holder of [card, card.data])
    for (const key of ["creatorcomment", "creator_notes"])
      if (typeof holder[key] === "string")
        holder[key] = holder[key].replaceAll("{{版本}}", version);
  const { base, assetBase } = assetOrigins(release, profile);
  const greetings = await readJSON("card/greetings/index.json");
  const messages = await Promise.all(
    greetings.map((g) =>
      g.file ? readText(g.file).then(normalizeText) : g.content,
    ),
  );
  card.data.first_mes = card.first_mes = messages[0];
  card.data.alternate_greetings = messages.slice(1);
  card.data.character_version = version;
  card.data.character_book = book;
  card.data.extensions.regex_scripts = await Promise.all(
    (await readJSON("card/regex/index.json")).map(async (item) => {
      const { replacementFile, frontendView, ...regex } = item;
      if (replacementFile)
        regex.replaceString = await readText(replacementFile);
      if (frontendView)
        regex.replaceString =
          "```\n<body>\n<script>\n" +
          `$('body').load('${assetBase}/${frontendView}/index.html')` +
          "\n</script>\n</body>\n```";
      return regex;
    }),
  );
  const scripts = await Promise.all(
    (await readJSON("card/scripts/index.json")).map(async (item) => {
      const { role, contentFile, ...script } = item;
      const own = {
        schema: assetBase + "/data_schema/index.js",
        automation: base + "/automation/index.js",
        geography: base + "/geography/load_compact.js",
      };
      const dependency = release.dependencies[role];
      const template = await readText(contentFile);
      const url = own[role] ?? dependency?.url;
      if (!url && template.includes(`{{${role}}}`))
        throw new Error(`脚本缺少资源配置: ${role}`);
      script.content = template.replaceAll(`{{${role}}}`, url);
      return script;
    }),
  );
  card.data.extensions.tavern_helper = {
    scripts,
    variables: {
      map_markers: mapMarkers,
      map_drawings: [],
      status_edit_enabled: false,
      start_presets: { presets: [] },
    },
  };
  return card;
}

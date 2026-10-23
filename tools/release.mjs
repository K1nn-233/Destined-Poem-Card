// 版本状态与发版：pnpm card version / pnpm card release <patch|minor|major>
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, readJSON, resolveSource } from "./lib/card-source.mjs";
import {
  bumpVersion,
  cardIdentity,
  LEVELS,
  LEVEL_LABELS,
  parseVersion,
} from "./lib/version.mjs";
import { diffSchemas } from "./lib/schema-diff.mjs";

const CHANGELOG = "CHANGELOG.md";
const UNRELEASED = "## 未发布";
const INCOMPATIBLE = "【不兼容】";
export const schemaSnapshot = (version) => `card/releases/V${version}.schema.json`;

function localISO(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const pad = (n) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const local = new Date(date.getTime() + offset * 60000);
  return (
    local.toISOString().slice(0, 19) +
    (offset >= 0 ? "+" : "-") +
    pad(offset / 60) +
    ":" +
    pad(offset % 60)
  );
}
// 重新导出当前变量结构（zod → JSON Schema），只跑 tsx，几秒钟。
export function dumpSchema() {
  const result = spawnSync(
    process.execPath,
    [resolveSource("node_modules/tsx/dist/cli.mjs"), "dump_schema.ts"],
    { cwd: resolveSource("packages/frontend"), encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `导出变量结构失败：\n${(result.stderr || result.stdout).slice(-2000)}`,
    );
  return readJSON("packages/frontend/.cache/schema.json");
}
export function unreleasedNotes(text) {
  const start = text.indexOf(UNRELEASED);
  if (start < 0) return null;
  const bodyStart = text.indexOf("\n", start) + 1;
  const next = text.slice(bodyStart).search(/^## /m);
  const end = next < 0 ? text.length : bodyStart + next;
  return { start, bodyStart, end, body: text.slice(bodyStart, end).trim() };
}
export async function versionStatus({ dump = true } = {}) {
  const release = await readJSON("release.json");
  const identity = cardIdentity(release);
  const current = dump
    ? await dumpSchema()
    : await readJSON("packages/frontend/.cache/schema.json");
  let baseline = null;
  try {
    baseline = await readJSON(schemaSnapshot(release.version));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const schema = baseline
    ? diffSchemas(baseline, current)
    : { changes: [], breaking: false, suggested: "patch", missingBaseline: true };
  let notes = "";
  try {
    notes = unreleasedNotes(await fs.readFile(resolveSource(CHANGELOG), "utf8"))?.body ?? "";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const notesIncompatible = notes.includes(INCOMPATIBLE);
  const suggested = schema.breaking || notesIncompatible ? "minor" : "patch";
  return {
    released: {
      version: identity.version,
      at: release.releasedAt ?? null,
      name: identity.name,
      worldbook: identity.worldbook,
    },
    schema,
    notes,
    notesIncompatible,
    suggested,
    next: Object.fromEntries(
      LEVELS.map((level) => {
        const version = bumpVersion(release.version, level);
        return [
          level,
          {
            version: `V${version}`,
            worldbook: cardIdentity({ ...release, version }).worldbook,
            label: LEVEL_LABELS[level],
          },
        ];
      }),
    ),
  };
}
function packageNotes({ identity, previous, level, notes }) {
  const renamed = identity.worldbook !== previous.worldbook;
  const lines = [
    `${identity.name}　${identity.version}`,
    "",
    "【更新内容】",
    notes || "（这次没有写更新记录）",
    "",
    "【怎么更新】",
  ];
  if (!renamed)
    lines.push(
      `这次是兼容更新，世界书名还是「${identity.worldbook}」，旧存档可以直接继续玩。`,
      "导入新卡后，进入聊天时如果提示「世界书版本比角色卡旧」，点「更新世界书」即可，旧世界书会自动备份。",
      "也可以先删掉酒馆里的旧世界书再导入新卡。",
    );
  else
    lines.push(
      `世界书名改成了「${identity.worldbook}」（原来是「${previous.worldbook}」）。`,
      level === "major"
        ? "这是大版本更新，世界观有较大改动，建议开新档。"
        : "这次是不兼容旧存档的更新，旧存档需要按更新内容手动调整变量，或者开新档。",
      "导入新卡会自带新世界书；旧世界书可以留着给旧存档用，也可以删掉。",
    );
  return lines.join("\n") + "\n";
}
// 版本号由开发组决定：传具体版本号（4.3.4），或者 patch / minor / major 让它按上一版加一。
// 变量结构对比只是建议，和版本号习惯不一致时给出提醒，不拦着。
export function resolveTarget(current, target) {
  const text = String(target ?? "").trim();
  if (!text) throw new Error("请指定要发布的版本号，比如 4.3.4");
  const version = LEVELS.includes(text) ? bumpVersion(current, text) : parseVersionText(text);
  const a = parseVersion(current);
  const b = parseVersion(version);
  const order = (v) => [v.major, v.minor, v.patch];
  const cmp = order(b).map((n, i) => n - order(a)[i]).find((n) => n !== 0) ?? 0;
  if (cmp <= 0) throw new Error(`新版本号 V${version} 要比当前的 V${current} 大`);
  const level = b.major !== a.major ? "major" : b.minor !== a.minor ? "minor" : "patch";
  return { version, level };
}
export function adviceFor(status, level) {
  const advice = [];
  if (status.schema.missingBaseline) advice.push("找不到上一版的变量结构快照，没有做兼容性对比。");
  if (level === "patch" && status.suggested !== "patch")
    advice.push(
      "这次有不兼容旧存档的改动，按习惯一般升 0.1：",
      ...status.schema.changes
        .filter((c) => c.level === "breaking")
        .map((c) => `  - 变量 ${c.path}：${c.text}`),
      ...(status.notesIncompatible ? [`  - 更新记录里有${INCOMPATIBLE}条目`] : []),
    );
  return advice;
}
export async function release(target, { build } = {}) {
  const status = await versionStatus();
  const releaseFile = resolveSource("release.json");
  const changelogFile = resolveSource(CHANGELOG);
  const original = {
    release: await fs.readFile(releaseFile, "utf8"),
    changelog: await fs.readFile(changelogFile, "utf8").catch(() => null),
  };
  const data = JSON.parse(original.release);
  const previous = cardIdentity(data);
  const { version, level } = resolveTarget(data.version, target);
  const advice = adviceFor(status, level);
  const identity = cardIdentity({ ...data, version });
  const date = localISO();
  const snapshot = resolveSource(schemaSnapshot(version));
  const restore = async () => {
    await fs.writeFile(releaseFile, original.release);
    if (original.changelog !== null)
      await fs.writeFile(changelogFile, original.changelog);
    await fs.rm(snapshot, { force: true });
  };
  try {
    data.version = version;
    data.releasedAt = date;
    data.published = false;
    await fs.writeFile(releaseFile, JSON.stringify(data, null, 2) + "\n");
    await fs.copyFile(resolveSource("packages/frontend/.cache/schema.json"), snapshot);
    let changelog = original.changelog ?? "# 更新日志\n\n## 未发布\n";
    const unreleased = unreleasedNotes(changelog);
    const heading = `## ${identity.version}（${date.slice(0, 10)}）`;
    if (unreleased)
      changelog =
        changelog.slice(0, unreleased.bodyStart) +
        "\n" +
        heading +
        "\n\n" +
        (unreleased.body || "（没有记录）") +
        "\n\n" +
        changelog.slice(unreleased.end).replace(/^\n+/, "");
    await fs.writeFile(changelogFile, changelog.replace(/\n*$/, "\n"));
    const builder = build ?? (await import("./card.mjs")).build;
    await builder("local");
    await builder("release");
    await (await import("./check-artifacts.mjs")).checkArtifacts();
  } catch (error) {
    await restore();
    throw new Error(`发版中断，已还原版本号和更新日志：${error.message}`, {
      cause: error,
    });
  }
  const outDir = resolveSource("dist/release/发布包");
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const pngName = `${data.cardName}${identity.version}.png`;
  await fs.copyFile(
    resolveSource("dist/release/命定之诗与黄昏之歌.png"),
    path.join(outDir, pngName),
  );
  await fs.writeFile(
    path.join(outDir, "更新说明.txt"),
    packageNotes({ identity, previous, level, notes: status.notes }),
  );
  return {
    version: identity.version,
    level,
    worldbook: identity.worldbook,
    worldbookRenamed: identity.worldbook !== previous.worldbook,
    advice,
    package: path.relative(ROOT, outDir).replaceAll("\\", "/"),
    files: [pngName, "更新说明.txt"],
    tag: identity.tag,
  };
}
const parseVersionText = (text) => {
  const v = parseVersion(text);
  return `${v.major}.${v.minor}.${v.patch}`;
};
export async function main(args) {
  const [command, ...rest] = args;
  if (command === "version") {
    const status = await versionStatus();
    if (rest.includes("--json")) {
      console.log(JSON.stringify(status));
      return;
    }
    console.log(`已发布：${status.released.version}（${status.released.at ?? "日期未知"}）`);
    console.log(`卡名 / 世界书名：${status.released.name}`);
    if (status.schema.missingBaseline) console.log("没有上一版的变量结构快照，无法对比。");
    else if (!status.schema.changes.length) console.log("变量结构：和上一版相同。");
    else {
      console.log("变量结构变化：");
      for (const c of status.schema.changes)
        console.log(`  [${{ breaking: "不兼容", review: "需确认", compatible: "兼容" }[c.level]}] ${c.path}：${c.text}`);
    }
    if (status.notesIncompatible) console.log(`更新日志里有${INCOMPATIBLE}条目。`);
    const next = status.next[status.suggested];
    console.log(`建议下一版：${next.version}（${next.label}），世界书名「${next.worldbook}」`);
    return;
  }
  const target = rest.find((a) => !a.startsWith("--"));
  const result = await release(target);
  for (const line of result.advice) console.warn(`[提醒] ${line}`);
  console.log(JSON.stringify(result, null, 2));
}

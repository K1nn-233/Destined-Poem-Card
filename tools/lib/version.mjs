// 版本号规则（开发组约定）：
// - 0.0.1：兼容旧存档的改动
// - 0.1：不兼容旧存档（变量结构等硬性变化，需要玩家自己改变量）
// - 1：世界观大改
// 角色卡名和世界书名只带「大版本.小版本」，补丁版本不改名，玩家继承存档时不用改世界书文件名。
import { createHash } from "node:crypto";

const PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const LEVELS = ["patch", "minor", "major"];
export const LEVEL_LABELS = {
  patch: "兼容更新（0.0.1）",
  minor: "不兼容存档（0.1）",
  major: "大版本（1）",
};
// 世界书里不启用的版本标记条目，自动化脚本用它判断玩家的世界书是不是和卡同一版。
export const VERSION_ENTRY_NAME = "【版本标记】请勿修改";
export const VERSION_PLACEHOLDER = "V__CARD_VERSION__";

export function parseVersion(value) {
  const match = PATTERN.exec(String(value ?? "").replace(/^v/i, ""));
  if (!match) throw new Error(`版本号格式应为 主.次.补丁（如 4.3.3）: ${value}`);
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}
export function bumpVersion(value, level) {
  const v = parseVersion(value);
  if (level === "patch") return `${v.major}.${v.minor}.${v.patch + 1}`;
  if (level === "minor") return `${v.major}.${v.minor + 1}.0`;
  if (level === "major") return `${v.major + 1}.0.0`;
  throw new Error(`发版级别应为 ${LEVELS.join(" / ")}: ${level}`);
}
// 卡名、世界书名、发布标签都从 release.json 的 cardName + version 算出来。
export function cardIdentity(release) {
  const v = parseVersion(release.version);
  if (typeof release.cardName !== "string" || !release.cardName.trim())
    throw new Error("release.json 缺少 cardName");
  const line = `${release.cardName}v${v.major}.${v.minor}`;
  return {
    version: `V${release.version}`,
    name: line,
    worldbook: line,
    tag: `v${release.version}`,
  };
}
// 两次正式发布之间推到酒馆测试的构建：V4.3.3+dev.20261024.1a2b3c4
// 末尾是内容哈希（不含版本号本身），同一份内容推几次都是同一个标记。
export function devVersion(release, contentHash, date = new Date()) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  return `V${release.version}+dev.${day}.${contentHash.slice(0, 7)}`;
}
export function versionFor(profile, release, contentHash, date) {
  return profile === "release"
    ? cardIdentity(release).version
    : devVersion(release, contentHash, date);
}
export const contentHash = (text) =>
  createHash("sha256").update(text).digest("hex");

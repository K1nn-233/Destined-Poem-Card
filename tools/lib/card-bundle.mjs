import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import {
  ROOT,
  resolveSource,
  readJSON,
  loadWorldbook,
} from "./card-source.mjs";
export const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} 失败 (${result.status})`);
}
export async function restoreBundler() {
  const lock = await readJSON("maintenance/tavern-sync.lock.json");
  const file = resolveSource(".cache/tools/tavern_sync.mjs");
  await fs.mkdir(path.dirname(file), { recursive: true });
  let bytes;
  try {
    bytes = await fs.readFile(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!bytes) {
    const response = await fetch(lock.url);
    if (!response.ok)
      throw new Error(`tavern_sync 下载失败: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== lock.sha256)
      throw new Error("tavern_sync 下载 SHA256 不匹配");
    await fs.writeFile(file, bytes);
  }
  if (sha256(bytes) !== lock.sha256)
    throw new Error("tavern_sync 缓存 SHA256 不匹配");
  return file;
}
export async function bundleWorldbook(identity) {
  const bundler = await restoreBundler();
  const { manifest, entries, references } = await loadWorldbook();
  for (const ref of references) ref.entry.文件 = ref.file.replaceAll("\\", "/");
  const meta = await readJSON("card/meta.json");
  if (!identity?.name || !identity?.worldbook)
    throw new Error("打包世界书需要卡名和世界书名");
  const cache = resolveSource(".cache/card");
  await fs.mkdir(cache, { recursive: true });
  const input = path.join(cache, "character.yaml");
  const output = path.join(cache, "official");
  const character = {
    头像: null,
    版本: identity.version,
    作者: meta.data.creator,
    第一条消息: [{ 内容: "【首页】" }],
    世界书名称: identity.worldbook,
    ...manifest,
  };
  await fs.writeFile(input, YAML.stringify(character));
  // tavern_sync resolves its settings relative to its own executable, not cwd.
  await fs.copyFile(bundler, path.join(cache, "tavern_sync.mjs"));
  await fs.writeFile(
    path.join(cache, "tavern_sync.yaml"),
    YAML.stringify({
      user名称: "__WORKSPACE_UNUSED_USER__",
      配置: {
        workspace: {
          类型: "角色卡",
          酒馆中的名称: identity.name,
          本地文件路径: input,
          导出文件路径: output,
        },
      },
    }),
  );
  run(process.execPath, [
    path.join(cache, "tavern_sync.mjs"),
    "bundle",
    "workspace",
  ]);
  // This pinned version always names character output .png, including JSON when avatar=null.
  const generated = JSON.parse(await fs.readFile(output + ".png", "utf8"));
  if (generated.data.character_book.entries.length !== entries.length)
    throw new Error("官方打包后条目数发生变化");
  return generated.data.character_book;
}

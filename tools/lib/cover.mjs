// 角色卡封面：card/cover/cover.png。打包时把卡数据写进这张图，推送时替换酒馆里的头像。
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parsePNG, SIGNATURE } from "./png.mjs";
import { resolveSource } from "./card-source.mjs";

export const COVER_FILE = "card/cover/cover.png";
const MAX_BYTES = 15 * 1024 * 1024;
// 只保留画面相关的数据块；文字块里可能夹着旧卡数据（chara／ccv3），一并去掉。
const TEXT_CHUNKS = new Set(["tEXt", "iTXt", "zTXt"]);

export function cleanCover(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length > MAX_BYTES) throw new Error("封面图片太大（超过 15MB）");
  let chunks;
  try {
    chunks = parsePNG(bytes);
  } catch (error) {
    throw new Error(`封面必须是 PNG 图片：${error.message}`);
  }
  const header = chunks[0].data;
  const clean = Buffer.concat([
    SIGNATURE,
    ...chunks.filter((c) => !TEXT_CHUNKS.has(c.type)).map((c) => c.raw),
  ]);
  return {
    bytes: clean,
    width: header.readUInt32BE(0),
    height: header.readUInt32BE(4),
    sha256: createHash("sha256").update(clean).digest("hex"),
  };
}
export async function readCover(file = COVER_FILE) {
  let bytes;
  try {
    bytes = await fs.readFile(resolveSource(file));
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(`缺少角色卡封面：请把 PNG 图片放到 ${file}`);
    throw error;
  }
  return cleanCover(bytes);
}
export async function writeCover(bytes, file = COVER_FILE) {
  const cover = cleanCover(bytes);
  const target = resolveSource(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, cover.bytes);
  await fs.rename(temp, target);
  return cover;
}

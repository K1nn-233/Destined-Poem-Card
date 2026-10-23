import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  bumpVersion,
  cardIdentity,
  devVersion,
  versionFor,
  VERSION_ENTRY_NAME,
} from "../tools/lib/version.mjs";
import { diffSchemas } from "../tools/lib/schema-diff.mjs";
import { cleanCover } from "../tools/lib/cover.mjs";
import { addVersionEntry } from "../tools/card.mjs";
import { unreleasedNotes } from "../tools/release.mjs";
import { chunk } from "../tools/lib/png.mjs";

const release = { cardName: "命定之诗与黄昏之歌", version: "4.3.3" };

test("card and worldbook names carry only major.minor", () => {
  assert.deepEqual(cardIdentity(release), {
    version: "V4.3.3",
    name: "命定之诗与黄昏之歌v4.3",
    worldbook: "命定之诗与黄昏之歌v4.3",
    tag: "v4.3.3",
  });
  assert.equal(cardIdentity({ ...release, version: "4.3.4" }).worldbook, "命定之诗与黄昏之歌v4.3");
  assert.equal(cardIdentity({ ...release, version: "4.4.0" }).worldbook, "命定之诗与黄昏之歌v4.4");
  assert.equal(bumpVersion("4.3.3", "patch"), "4.3.4");
  assert.equal(bumpVersion("4.3.3", "minor"), "4.4.0");
  assert.equal(bumpVersion("4.3.3", "major"), "5.0.0");
  assert.throws(() => bumpVersion("4.3", "patch"), /版本号格式/);
});

test("test builds are marked as dev of the last release; release builds are plain", () => {
  const date = new Date(2026, 9, 24);
  assert.equal(devVersion(release, "abcdef0123", date), "V4.3.3+dev.20261024.abcdef0");
  assert.equal(versionFor("release", release, "abcdef0123", date), "V4.3.3");
  assert.equal(versionFor("local", release, "abcdef0123", date), "V4.3.3+dev.20261024.abcdef0");
});

test("schema diff separates compatible additions from breaking changes", () => {
  const base = {
    type: "object",
    properties: {
      主角: {
        type: "object",
        properties: { 名字: { type: "string" }, 等级: { type: "number" } },
        required: ["名字"],
      },
    },
    required: ["主角"],
  };
  const clone = () => structuredClone(base);
  assert.deepEqual(diffSchemas(base, clone()).changes, []);

  const added = clone();
  added.properties.主角.properties.身份 = { type: "array", default: [], items: { type: "string" } };
  assert.equal(diffSchemas(base, added).suggested, "patch");

  const required = clone();
  required.properties.主角.properties.阵营 = { type: "string" };
  required.properties.主角.required.push("阵营");
  assert.equal(diffSchemas(base, required).suggested, "minor");

  const removed = clone();
  delete removed.properties.主角.properties.等级;
  assert.deepEqual(
    diffSchemas(base, removed).changes.map((c) => [c.level, c.path]),
    [["breaking", "主角.等级"]],
  );

  const retyped = clone();
  retyped.properties.主角.properties.等级 = { type: "string" };
  assert.equal(diffSchemas(base, retyped).breaking, true);

  // $ref 编号不同但结构相同，不算变化。
  const viaRef = {
    $defs: { hero: base.properties.主角 },
    type: "object",
    properties: { 主角: { $ref: "#/$defs/hero" } },
    required: ["主角"],
  };
  assert.deepEqual(diffSchemas(base, viaRef).changes, []);
});

test("the 4.3.3 snapshot differs from the workspace only by compatible additions", async () => {
  const before = JSON.parse(await fs.readFile(new URL("../card/releases/V4.3.3.schema.json", import.meta.url)));
  let after;
  try {
    after = JSON.parse(await fs.readFile(new URL("../packages/frontend/.cache/schema.json", import.meta.url)));
  } catch {
    return; // 还没导出过变量结构
  }
  const result = diffSchemas(before, after);
  assert.equal(result.breaking, false, JSON.stringify(result.changes));
});

test("version entry is a single disabled marker at the end of the worldbook", () => {
  const book = { name: "书", entries: [{ id: 0, comment: "a", content: "x", enabled: true, extensions: { display_index: 0 } }] };
  const once = addVersionEntry(book, "V1.0.0");
  const twice = addVersionEntry(once, "V1.0.1");
  const markers = twice.entries.filter((e) => e.comment === VERSION_ENTRY_NAME);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].content, "V1.0.1");
  assert.equal(markers[0].enabled, false);
  assert.equal(markers[0].id, 1);
  assert.equal(twice.entries.length, 2);
});

test("cover keeps image chunks and drops embedded card text", async () => {
  const cover = await fs.readFile(new URL("../card/cover/cover.png", import.meta.url));
  const withText = Buffer.concat([cover.subarray(0, -12), chunk("tEXt", Buffer.from("chara\0abc")), cover.subarray(-12)]);
  const cleaned = cleanCover(withText);
  assert.deepEqual(cleaned.bytes, cleanCover(cover).bytes);
  assert.ok(!cleaned.bytes.includes("chara"));
  assert.equal(cleaned.width, 512);
  assert.throws(() => cleanCover(Buffer.from("not a png")), /PNG/);
});

test("unreleased changelog section is found between headings", () => {
  const text = "# 更新日志\n\n## 未发布\n\n- 新东西\n\n## V4.3.3（2026-09-12）\n\n旧\n";
  assert.equal(unreleasedNotes(text).body, "- 新东西");
  assert.equal(unreleasedNotes("# 更新日志\n"), null);
});

test("release takes the team's version number; level words still work; must go up", async () => {
  const { resolveTarget, adviceFor } = await import("../tools/release.mjs");
  assert.deepEqual(resolveTarget("4.3.3", "4.3.4"), { version: "4.3.4", level: "patch" });
  assert.deepEqual(resolveTarget("4.3.3", "V4.5.0"), { version: "4.5.0", level: "minor" });
  assert.deepEqual(resolveTarget("4.3.3", "major"), { version: "5.0.0", level: "major" });
  assert.throws(() => resolveTarget("4.3.3", "4.3.3"), /要比当前/);
  assert.throws(() => resolveTarget("4.3.3", "4.2.9"), /要比当前/);
  assert.throws(() => resolveTarget("4.3.3", ""), /请指定/);
  const breaking = { schema: { changes: [{ level: "breaking", path: "主角.等级", text: "删除了字段" }] }, suggested: "minor", notesIncompatible: false };
  assert.match(adviceFor(breaking, "patch").join("\n"), /一般升 0\.1/);
  assert.deepEqual(adviceFor(breaking, "minor"), []);
});

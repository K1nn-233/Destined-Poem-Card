import test from "node:test";
import assert from "node:assert/strict";
import JSON5 from "json5";
import { editCatalogText, validateCatalog } from "../tools/workbench/api.mjs";
import { staticFile } from "../tools/dev.mjs";

const source = `{
  // 通用开局
  "通用开局": [
    {
      "name": "日常",
      "description": "日常的一天"
    },
    {
      "name": "骰子",
      // by某位作者
      "description": "旧描述"
    }
  ]
}
`;

test("editing a field keeps comments and other text untouched", () => {
  const next = editCatalogText(source, [{ path: ["通用开局", 1, "description"], value: "新描述" }]);
  assert.equal(next, source.replace("旧描述", "新描述"));
});

test("insert and remove items, result parses as JSON5", () => {
  let next = editCatalogText(source, [{ path: ["通用开局", 2], insert: true, value: { name: "新背景", description: "" } }]);
  assert.deepEqual(JSON5.parse(next)["通用开局"].map((i) => i.name), ["日常", "骰子", "新背景"]);
  assert.match(next, /\/\/ by某位作者/);
  next = editCatalogText(next, [{ path: ["通用开局", 0], remove: true }]);
  assert.deepEqual(JSON5.parse(next)["通用开局"].map((i) => i.name), ["骰子", "新背景"]);
  assert.match(next, /\/\/ 通用开局/);
});

test("validation reports empty names, bad costs and unknown rarity", () => {
  const problems = validateCatalog({ 剑: [{ name: "", cost: 1 }, { name: "a", cost: "x", rarity: "gold" }] });
  assert.equal(problems.length, 3);
  assert.deepEqual(validateCatalog({ genders: ["男"] }), []);
});

test("static routes only expose workbench, tools and local build files", () => {
  assert.equal(staticFile("/"), "tools/workbench/ui/index.html");
  assert.equal(staticFile("/workbench/app.js"), "tools/workbench/ui/app.js");
  assert.equal(staticFile("/vendor/vue.js"), "node_modules/vue/dist/vue.esm-browser.prod.js");
  assert.equal(staticFile("/content/catalogs/items.json"), null);
  assert.equal(staticFile("/release.json"), null);
});

// 数据和工作台对不上时让测试失败，提醒同步改工作台（见 .agents/skills/workbench/SKILL.md）。
test("every catalog data file is editable in the workbench", async () => {
  const { CATALOGS } = await import("../tools/workbench/api.mjs");
  const fs = await import("node:fs/promises");
  const manifest = JSON.parse(await fs.readFile(new URL("../content/manifest.json", import.meta.url), "utf8"));
  const listed = new Set(CATALOGS.map((c) => `${c.dir ?? "content/catalogs"}/${c.file}`));
  const missing = Object.values(manifest).filter((file) => file.startsWith("content/catalogs/") && file.endsWith(".json") && !listed.has(file));
  assert.deepEqual(missing, [], "新增的数据文件要加进 tools/workbench/api.mjs 的 CATALOGS");
});

test("workbench recognises cores with the same rule as the home page", async () => {
  const fs = await import("node:fs/promises");
  const home = await fs.readFile(new URL("../packages/frontend/src/apps/home/services/CorePage.ts", import.meta.url), "utf8");
  const api = await fs.readFile(new URL("../tools/workbench/api.mjs", import.meta.url), "utf8");
  const rule = home.match(/const CORE_PATTERN = (\/.+\/);/)?.[1];
  assert.ok(rule, "CorePage.ts 里找不到 CORE_PATTERN");
  assert.ok(api.includes(rule), "首页识别核心的规则变了，同步改 tools/workbench/api.mjs 的 worldbookCores");
});

test("renaming a category keeps its position and the file's comments", () => {
  const text = '{\n  // 第一类\n  "甲": [{ "name": "a" }],\n  // 第二类\n  "乙": [{ "name": "b" }]\n}\n';
  const next = editCatalogText(text, [{ path: ["甲"], rename: "丙" }]);
  assert.equal(next, '{\n  // 第一类\n  "丙": [{ "name": "a" }],\n  // 第二类\n  "乙": [{ "name": "b" }]\n}\n');
  assert.deepEqual(Object.keys(JSON5.parse(next)), ["丙", "乙"]);
});

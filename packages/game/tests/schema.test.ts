import assert from "node:assert/strict";
import test from "node:test";
import lodash from "lodash";
import { z } from "zod";

// 与酒馆和离线 dump 一样，宿主先初始化全局，再加载共享 Schema。
Object.assign(globalThis, { z, _: lodash });
const { Schema } = await import("../src/schema/index.ts");

test("empty state supplies usable defaults without sharing mutable state across parses", () => {
  const state = Schema.parse({});
  assert.deepEqual(state.世界, { 时间: "", 地点: "" });
  assert.equal(state.主角.等级, 1);
  assert.equal(state.主角.升级所需经验, 120);
  assert.deepEqual(state.主角.属性, {
    力量: 0,
    敏捷: 0,
    体质: 0,
    智力: 0,
    精神: 0,
  });
  assert.deepEqual(state.主角.生命值, { 当前: 0, 上限: { _基础: 0, 额外: 0 } });
  assert.deepEqual(state.关系列表, {});
  state.主角.身份.push("冒险者");
  assert.deepEqual(Schema.parse({}).主角.身份, []);
});

test("normalization preserves the existing resource, item and character boundaries", () => {
  const state = Schema.parse({
    不存在的字段: true,
    主角: {
      等级: "30",
      身份: ["冒险者", "冒险者"],
      生命值: { 当前: "999", 上限: { _基础: "100", 额外: "-20" } },
      法力值: { 当前: -5, 上限: { _基础: 10, 额外: 0 } },
      体力值: { 当前: 5, 上限: { _基础: -10, 额外: 2 } },
      背包: {
        药水: { 数量: "2", 标签: ["回复", "回复"], 不存在的字段: true },
        空瓶: { 数量: 0 },
        欠账: { 数量: -1 },
      },
      不存在的字段: true,
    },
    关系列表: {
      同伴: { 标签: ["同行", "同行"], 好感度: 200, 不存在的字段: true },
    },
  });

  assert.equal(state.主角.等级, 25);
  assert.equal(state.主角.升级所需经验, "MAX");
  assert.deepEqual(state.主角.身份, ["冒险者"]);
  assert.deepEqual(state.主角.生命值, {
    当前: 80,
    上限: { _基础: 100, 额外: -20 },
  });
  assert.equal(state.主角.法力值.当前, 0);
  assert.deepEqual(state.主角.体力值, {
    当前: 0,
    上限: { _基础: -10, 额外: 2 },
  });
  assert.deepEqual(Object.keys(state.主角.背包), ["药水"]);
  assert.equal(state.主角.背包.药水.数量, 2);
  assert.deepEqual(state.主角.背包.药水.标签, ["回复"]);
  assert.deepEqual(state.关系列表.同伴.标签, ["同行"]);
  assert.equal(state.关系列表.同伴.好感度, 100);
  for (const object of [
    state,
    state.主角,
    state.主角.背包.药水,
    state.关系列表.同伴,
  ]) {
    assert.equal(Object.hasOwn(object, "不存在的字段"), false);
  }
});

test("shared Schema composes with the host Zod instance and returns its native errors", () => {
  assert.equal(Schema.constructor, z.ZodObject);
  const hostEnvelope = z.object({ stat_data: Schema });
  assert.equal(hostEnvelope.shape.stat_data, Schema);
  assert.equal(hostEnvelope.parse({ stat_data: {} }).stat_data.主角.等级, 1);
  const invalid = hostEnvelope.safeParse({
    stat_data: { 主角: { 等级: "非法等级" } },
  });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.ok(invalid.error instanceof z.ZodError);
    assert.deepEqual(invalid.error.issues[0].path, [
      "stat_data",
      "主角",
      "等级",
    ]);
  }
});

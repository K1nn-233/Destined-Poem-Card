import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBaseResources,
  getHpMultiplier,
  getMpSpMultiplier,
} from "../src/rules/index.ts";

test("each milestone switches exactly at its level and keeps the preceding tier below it", () => {
  const tiers = [
    [1, 1, 1],
    [5, 2, 2.5],
    [9, 4, 6],
    [13, 10, 15],
    [17, 20, 35],
    [21, 40, 80],
    [25, 100, 160],
  ];

  for (let i = 0; i < tiers.length; i++) {
    const [level, hp, mpSp] = tiers[i];
    assert.equal(getHpMultiplier(level), hp);
    assert.equal(getMpSpMultiplier(level), mpSp);
    assert.equal(getHpMultiplier(level + 0.5), hp);
    assert.equal(getMpSpMultiplier(level + 0.5), mpSp);
    const previous = tiers[Math.max(0, i - 1)];
    assert.equal(getHpMultiplier(level - 0.01), previous[1]);
    assert.equal(getMpSpMultiplier(level - 0.01), previous[2]);
  }
});

test("lookup retains the original fallback below level one and final tier above max level", () => {
  for (const level of [-10, 0, Number.NaN, Number.NEGATIVE_INFINITY]) {
    assert.equal(getHpMultiplier(level), 1);
    assert.equal(getMpSpMultiplier(level), 1);
  }
  for (const level of [26, 100, Number.POSITIVE_INFINITY]) {
    assert.equal(getHpMultiplier(level), 100);
    assert.equal(getMpSpMultiplier(level), 160);
  }
});

test("HP includes all five attributes while MP and SP use their respective pairs", () => {
  const attributes = Object.freeze({
    力量: 8,
    敏捷: 6,
    体质: 10,
    智力: 6,
    精神: 5,
  });
  assert.deepEqual(calculateBaseResources(13, attributes), {
    hp: 10035,
    mp: 8250,
    sp: 10500,
  });
  assert.deepEqual(
    calculateBaseResources(1, { 力量: 0, 敏捷: 0, 体质: 0, 智力: 0, 精神: 0 }),
    {
      hp: 0,
      mp: 0,
      sp: 0,
    },
  );
});

test("rounds the final totals without rounding attributes early", () => {
  const attributes = {
    力量: 0.01,
    敏捷: 0.02,
    体质: 0.02,
    智力: 0.04,
    精神: 0.05,
  };
  assert.deepEqual(calculateBaseResources(5, attributes), {
    hp: 4,
    mp: 11,
    sp: 4,
  });
});

test("does not clamp negative base limits or change the supplied attributes", () => {
  const attributes = Object.freeze({
    力量: -1,
    敏捷: -1,
    体质: -1,
    智力: -1,
    精神: -1,
  });
  assert.deepEqual(calculateBaseResources(1, attributes), {
    hp: -105,
    mp: -100,
    sp: -100,
  });
});

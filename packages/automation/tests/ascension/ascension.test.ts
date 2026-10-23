import { canBreakAscensionLevel, syncAscensionState } from '../../src/services/ascension';
import { buildVariables } from '../helpers';

describe('ascension gating', () => {
  test('level 12 requires element to break', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 12,
        },
      },
    });

    expect(canBreakAscensionLevel(12, variables)).toBe(false);

    variables.stat_data.主角.登神长阶.要素 = { 火: { 名称: '火' } };
    expect(canBreakAscensionLevel(12, variables)).toBe(true);
  });

  test('level 16 requires power to break', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 16,
        },
      },
    });

    expect(canBreakAscensionLevel(16, variables)).toBe(false);

    variables.stat_data.主角.登神长阶.权能 = { 炽权: { 名称: '炽权' } };
    expect(canBreakAscensionLevel(16, variables)).toBe(true);
  });

  test('level 20 requires law to break', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
        },
      },
    });

    expect(canBreakAscensionLevel(20, variables)).toBe(false);

    variables.stat_data.主角.登神长阶.法则 = { 焰律: { 名称: '焰律' } };
    expect(canBreakAscensionLevel(20, variables)).toBe(true);
  });

  test('level 24 requires law and god position to break', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 24,
          登神长阶: {
            法则: { 焰律: { 名称: '焰律' } },
            神位: '',
          },
        },
      },
    });

    expect(canBreakAscensionLevel(24, variables)).toBe(false);

    variables.stat_data.主角.登神长阶.神位 = '焰之神座';
    expect(canBreakAscensionLevel(24, variables)).toBe(true);
  });
});

describe('ascension tasks', () => {
  test('level 12 full exp adds element quest', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 12,
          累计经验值: 28440,
          升级所需经验: 28440,
        },
      },
    });

    syncAscensionState(variables);
    expect(variables.stat_data.任务列表['登神·启明之阶']).toBeDefined();
  });

  test('level 16 full exp adds power quest', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 16,
          累计经验值: 74840,
          升级所需经验: 74840,
          登神长阶: {
            要素: { a: {}, b: {}, c: {} },
          },
        },
      },
    });

    syncAscensionState(variables);
    expect(variables.stat_data.任务列表['登神·铸权之仪']).toBeDefined();
  });

  test('level 20 full exp adds law quest regardless of extra condition', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          累计经验值: 185840,
          升级所需经验: 185840,
          登神长阶: {
            权能: { a: {} },
          },
        },
      },
      date: { ...buildVariables({}).date, ascensionLawReady: false },
    });

    syncAscensionState(variables);
    expect(variables.stat_data.任务列表['登神·定律誓约']).toBeDefined();
  });

  test('level 20 blocks law write when extra condition unmet', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          登神长阶: {
            法则: { test: { 名称: 'test' } },
          },
        },
      },
      date: { ...buildVariables({}).date, ascensionLawReady: false },
    });

    syncAscensionState(variables);
    expect(Object.keys(variables.stat_data.主角.登神长阶.法则)).toHaveLength(0);
  });

  test('level 25 adds god nation quest when law count >= 2', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 25,
          登神长阶: {
            法则: { a: {}, b: {} },
            神国: { 名称: '', 描述: '' },
          },
        },
      },
    });

    syncAscensionState(variables);
    expect(variables.stat_data.任务列表['登神·神国初立']).toBeDefined();
  });

  test('law source is consumed on first law when only one source exists', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          背包: {
            '༺焰之源质༻': { 标签: ['法则源质'] },
          },
          登神长阶: {
            法则: { 焰律: { 名称: '焰律' } },
          },
        },
      },
    });

    syncAscensionState(variables, buildVariables({}));
    expect(variables.stat_data.主角.背包['༺焰之源质༻']).toBeUndefined();
  });

  test('law source is not consumed when there are multiple sources', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          背包: {
            '༺焰之源质༻': { 标签: ['法则源质'] },
            '༺霜之源质༻': { 标签: ['法则源质'] },
          },
          登神长阶: {
            法则: { 焰律: { 名称: '焰律' } },
          },
        },
      },
    });

    syncAscensionState(variables, buildVariables({}));
    expect(Object.keys(variables.stat_data.主角.背包)).toHaveLength(2);
  });

  test('law source is not consumed when law already existed', () => {
    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          登神长阶: {
            法则: { 旧律: { 名称: '旧律' } },
          },
        },
      },
    });
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 21,
          背包: {
            '༺焰之源质༻': { 标签: ['法则源质'] },
          },
          登神长阶: {
            法则: { 旧律: { 名称: '旧律' }, 新律: { 名称: '新律' } },
          },
        },
      },
    });

    syncAscensionState(variables, oldVariables);
    expect(variables.stat_data.主角.背包['༺焰之源质༻']).toBeDefined();
  });

  test('level 20 allows law write when source was consumed externally (had source before)', () => {
    // 模拟外部先移除源质再写入法则的场景
    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          背包: {
            '༺焰之源质༻': { 标签: ['法则源质'] },
          },
          登神长阶: {
            法则: {},
          },
        },
      },
    });
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          背包: {}, // 源质已被外部消耗
          登神长阶: {
            法则: { 焰律: { 名称: '焰律' } }, // 法则已写入
          },
        },
      },
    });

    syncAscensionState(variables, oldVariables);
    // 因为 oldVariables 中有源质，说明源质刚被消耗用于铸造，法则应保留
    const laws = variables.stat_data.主角.登神长阶.法则 as Record<string, unknown>;
    expect(Object.keys(laws)).toHaveLength(1);
    expect(laws['焰律']).toBeDefined();
  });

  test('level 20 blocks law write when no source existed before and now', () => {
    // 从未有过源质的情况下写入法则应被阻止
    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          背包: {}, // 之前没有源质
          登神长阶: {
            法则: {},
          },
        },
      },
    });
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          背包: {}, // 现在也没有源质
          登神长阶: {
            法则: { 非法律: { 名称: '非法律' } }, // 非法写入
          },
        },
      },
    });

    syncAscensionState(variables, oldVariables);
    // 没有源质历史记录，法则应被清空
    expect(Object.keys(variables.stat_data.主角.登神长阶.法则)).toHaveLength(0);
  });
});

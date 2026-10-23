import { processExperienceAndLevel } from '../../src/services/experience';
import { buildVariables } from '../helpers';

describe('experience processing', () => {
  test('level 12 caps exp when element missing', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 12,
          累计经验值: 30000,
          升级所需经验: 28440,
          登神长阶: {
            要素: {},
          },
        },
      },
    });

    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 12,
        },
      },
    });

    processExperienceAndLevel(variables, oldVariables);
    expect(variables.stat_data.主角.等级).toBe(12);
    expect(variables.stat_data.主角.累计经验值).toBe(28440);
  });

  test('level 12 allows upgrade when element exists', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 12,
          累计经验值: 30000,
          升级所需经验: 28440,
          登神长阶: {
            要素: { 火: { 名称: '火' } },
          },
        },
      },
    });

    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 12,
        },
      },
    });

    processExperienceAndLevel(variables, oldVariables);
    expect(variables.stat_data.主角.等级).toBe(13);
  });

  test('level 16 caps exp when power missing', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 16,
          累计经验值: 90000,
          升级所需经验: 74840,
          登神长阶: {
            权能: {},
          },
        },
      },
    });

    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 16,
        },
      },
    });

    processExperienceAndLevel(variables, oldVariables);
    expect(variables.stat_data.主角.等级).toBe(16);
    expect(variables.stat_data.主角.累计经验值).toBe(74840);
  });

  test('level 20 caps exp when law missing', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
          累计经验值: 200000,
          升级所需经验: 185840,
          登神长阶: {
            法则: {},
          },
        },
      },
    });

    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 20,
        },
      },
    });

    processExperienceAndLevel(variables, oldVariables);
    expect(variables.stat_data.主角.等级).toBe(20);
    expect(variables.stat_data.主角.累计经验值).toBe(185840);
  });

  test('level 24 caps exp when god position missing', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 24,
          累计经验值: 450000,
          升级所需经验: 401840,
          登神长阶: {
            法则: { 焰律: { 名称: '焰律' } },
            神位: '',
          },
        },
      },
    });

    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 24,
        },
      },
    });

    processExperienceAndLevel(variables, oldVariables);
    expect(variables.stat_data.主角.等级).toBe(24);
    expect(variables.stat_data.主角.累计经验值).toBe(401840);
  });

  test('level 24 allows upgrade when law and god position both exist', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 24,
          累计经验值: 450000,
          升级所需经验: 401840,
          登神长阶: {
            法则: { 焰律: { 名称: '焰律' } },
            神位: '焰之神座',
          },
        },
      },
    });

    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 24,
        },
      },
    });

    processExperienceAndLevel(variables, oldVariables);
    expect(variables.stat_data.主角.等级).toBe(25);
  });

  test('level 24 caps exp when law is missing', () => {
    const variables = buildVariables({
      stat_data: {
        主角: {
          等级: 24,
          累计经验值: 450000,
          升级所需经验: 401840,
          登神长阶: {
            法则: {},
            神位: '焰之神座',
          },
        },
      },
    });

    const oldVariables = buildVariables({
      stat_data: {
        主角: {
          等级: 24,
        },
      },
    });

    processExperienceAndLevel(variables, oldVariables);
    expect(variables.stat_data.主角.等级).toBe(24);
    expect(variables.stat_data.主角.累计经验值).toBe(401840);
  });
});

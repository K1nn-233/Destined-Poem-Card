/**
 * 路由常量模块
 * 独立的常量定义，避免循环依赖
 */

/**
 * 步骤元信息接口
 */
export interface StepMeta {
  title: string;
  shortTitle: string;
  step: number;
}

/**
 * 步骤配置 - 单一数据源
 * 用于生成路由和步骤导航
 */
export const STEP_CONFIGS: StepMeta[] = [
  { title: '基础信息与属性', shortTitle: '信息/属性', step: 1 },
  { title: '装备与技能', shortTitle: '装备/技能', step: 2 },
  { title: '伙伴与初始背景', shortTitle: '伙伴/背景', step: 3 },
  { title: '确认提交', shortTitle: '确认', step: 4 },
];

/**
 * 路由名称常量
 */
export const ROUTE_NAMES = {
  LAYOUT: 'Layout',
  BASIC_INFO: 'BasicInfo',
  SELECTIONS: 'Selections',
  BACKGROUND: 'Background',
  CONFIRM: 'Confirm',
} as const;

/**
 * 路由路径常量
 */
export const ROUTE_PATHS = {
  ROOT: '/',
  BASIC: '/basic',
  SELECTIONS: '/selections',
  BACKGROUND: '/background',
  CONFIRM: '/confirm',
} as const;

/**
 * 步骤到路由名的映射
 */
export const STEP_TO_ROUTE: Record<number, string> = {
  1: ROUTE_NAMES.BASIC_INFO,
  2: ROUTE_NAMES.SELECTIONS,
  3: ROUTE_NAMES.BACKGROUND,
  4: ROUTE_NAMES.CONFIRM,
};

/**
 * 路由名到步骤的映射
 */
export const ROUTE_TO_STEP: Record<string, number> = {
  [ROUTE_NAMES.BASIC_INFO]: 1,
  [ROUTE_NAMES.SELECTIONS]: 2,
  [ROUTE_NAMES.BACKGROUND]: 3,
  [ROUTE_NAMES.CONFIRM]: 4,
};

/**
 * 获取步骤总数
 */
export const TOTAL_STEPS = STEP_CONFIGS.length;

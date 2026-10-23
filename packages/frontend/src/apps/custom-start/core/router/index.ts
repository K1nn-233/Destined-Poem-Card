/**
 * 路由器模块入口
 */
import { createMemoryHistory, createRouter } from 'vue-router';

import { routes } from './routes';

/**
 * 创建并配置路由器实例
 */
export const router = createRouter({
  history: createMemoryHistory(),
  routes,
});

// 导出路由配置和常量
export * from './routes';

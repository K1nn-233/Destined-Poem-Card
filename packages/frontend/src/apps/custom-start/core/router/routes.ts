/**
 * 路由配置模块
 */
import type { RouteRecordRaw } from 'vue-router';

import Layout from '../layout/index.vue';
import Background from '../views/Background/index.vue';
import BasicInfo from '../views/BasicInfo/index.vue';
import Confirm from '../views/Confirm/index.vue';
import Selections from '../views/Selections/index.vue';

import { ROUTE_NAMES, ROUTE_PATHS, STEP_CONFIGS } from './route-constants';

/**
 * 路由配置
 */
export const routes: RouteRecordRaw[] = [
  {
    path: ROUTE_PATHS.ROOT,
    name: ROUTE_NAMES.LAYOUT,
    component: Layout,
    redirect: ROUTE_PATHS.BASIC,
    children: [
      {
        path: 'basic',
        name: ROUTE_NAMES.BASIC_INFO,
        component: BasicInfo,
        meta: { title: STEP_CONFIGS[0].title, step: 1 },
      },
      {
        path: 'selections',
        name: ROUTE_NAMES.SELECTIONS,
        component: Selections,
        meta: { title: STEP_CONFIGS[1].title, step: 2 },
      },
      {
        path: 'background',
        name: ROUTE_NAMES.BACKGROUND,
        component: Background,
        meta: { title: STEP_CONFIGS[2].title, step: 3 },
      },
      {
        path: 'confirm',
        name: ROUTE_NAMES.CONFIRM,
        component: Confirm,
        meta: { title: STEP_CONFIGS[3].title, step: 4 },
      },
    ],
  },
];

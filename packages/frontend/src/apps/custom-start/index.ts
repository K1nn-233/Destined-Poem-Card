import { initializeEquipmentsReady } from './core/data/equipments';
import { initializeItemsReady } from './core/data/Items';
import { initializeAssetsReady } from './core/data/assets';
import { initializeSkillsReady } from './core/data/skills';
import { initializeBackgroundsReady } from './core/data/backgrounds';
import { initPartnersDataReady } from './core/data/destined-ones';
import { baseInfoReady } from './core/data/base-info';
/**
 * 应用入口文件
 * 负责初始化 Vue 应用、挂载路由和状态管理
 */
import './core/styles/index.scss';

import { createApp } from 'vue';

import App from './core/App.vue';
import { router } from './core/router';
import { pinia } from './core/store';

const app = createApp(App);

$(() => {
  const host = document.getElementById('app');
  if (host) host.textContent = '正在加载开局数据…';
  Promise.all([
    initializeEquipmentsReady,
    initializeItemsReady,
    initializeAssetsReady,
    initializeSkillsReady,
    initializeBackgroundsReady,
    initPartnersDataReady,
    baseInfoReady,
  ])
    .then(() => {
      app.use(pinia);
      app.use(router);
      app.mount('#app');
    })
    .catch((error: unknown) => {
      console.error('开局数据加载失败', error);
      if (host) {
        host.setAttribute('role', 'alert');
        host.textContent = `开局数据加载失败：${error instanceof Error ? error.message : String(error)}。请检查资源地址后刷新。`;
      }
    });
});

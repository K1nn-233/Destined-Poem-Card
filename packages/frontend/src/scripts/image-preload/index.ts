export {};

interface Prefetch {
  title: string;
  assets: string[];
}

const Settings = z.object({
  资源预载: z.string().default(''),
});

const variable_option = { type: 'script', script_id: getScriptId() } as const;

function get_prefetches(): Prefetch[] {
  const settings = Settings.parse(getVariables(variable_option));
  insertVariables(settings, variable_option);

  const globalRegexes = getTavernRegexes({ type: 'global' });
  const characterRegexes = getTavernRegexes({ type: 'character', name: 'current' });
  const allRegexes = [...globalRegexes, ...characterRegexes];

  return _(allRegexes)
    .filter(regex => regex.enabled && regex.script_name.includes('预载-'))
    .map(regex => ({
      title: regex.script_name.replace('预载-', '').replaceAll(/【.+?】/gs, ''),
      content: regex.replace_string,
    }))
    .concat([{ title: '脚本变量', content: settings.资源预载 }])
    .map(({ title, content }) => ({
      title,
      assets: content
        .split('\n')
        .map(asset => asset.trim())
        .filter(asset => !!asset),
    }))
    .value();
}

const CACHE_NAME = 'destined-journey-cache-v1';

// 并发控制配置
const CONCURRENCY_LIMIT = 4; // 同时进行的最大请求数
const BATCH_DELAY = 100; // 批次间隔（毫秒）

/**
 * 批量执行任务，限制并发数量
 * @param tasks 任务函数数组
 * @param concurrency 最大并发数
 * @param delayBetweenBatches 批次间隔
 */
const runWithConcurrency = async <T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  delayBetweenBatches = 0,
): Promise<PromiseSettledResult<T>[]> => {
  const results: PromiseSettledResult<T>[] = [];
  let index = 0;

  const runNext = async (): Promise<void> => {
    while (index < tasks.length) {
      const currentIndex = index++;
      const task = tasks[currentIndex];
      try {
        const value = await task();
        results[currentIndex] = { status: 'fulfilled', value };
      } catch (reason) {
        results[currentIndex] = { status: 'rejected', reason };
      }
    }
  };

  // 启动 concurrency 个并发 worker
  const workers = Array(Math.min(concurrency, tasks.length))
    .fill(null)
    .map(async (_, workerIndex) => {
      // 为每个 worker 添加初始延迟，避免同时启动
      if (delayBetweenBatches > 0 && workerIndex > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches * workerIndex));
      }
      await runNext();
    });

  await Promise.all(workers);
  return results;
};

const cacheAsset = async (asset: string): Promise<void> => {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(asset);
    if (cached) return;
    const response = await fetch(asset, { mode: 'cors' });
    if (response.ok) {
      await cache.put(asset, response.clone());
    }
  } catch (error) {
    console.warn('[ImagePreload] 缓存资源失败:', asset, error);
  }
};

const preloadImage = (asset: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`图片预加载失败: ${asset}`));
    img.src = asset;
  });
};

/**
 * 预加载并缓存单个资源
 */
const preloadAndCacheAsset = async (asset: string): Promise<void> => {
  await preloadImage(asset);
  await cacheAsset(asset);
};

$(() => {
  // 收集所有需要预加载的资源（去重）
  const allAssets = _.uniq(get_prefetches().flatMap(prefetch => prefetch.assets));

  // 转换为任务函数数组
  const tasks = allAssets.map(asset => () => preloadAndCacheAsset(asset));

  // 使用并发控制执行预加载
  runWithConcurrency(tasks, CONCURRENCY_LIMIT, BATCH_DELAY).then(results => {
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    if (allAssets.length > 0) {
      console.log(
        `[ImagePreload] 预加载完成: ${succeeded} 成功, ${failed} 失败, 共 ${allAssets.length} 个资源`,
      );
    }
  });
});

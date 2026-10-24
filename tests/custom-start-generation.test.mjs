import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
test('自定义开局：AI 推演模拟回归（无真实 API 调用）', () => {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('tsx/cli'),
      '--tsconfig',
      'packages/frontend/tsconfig.json',
      'packages/frontend/tests/custom-start-regression.mts',
    ],
    { cwd: root, encoding: 'utf8', timeout: 60000 },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('REGRESSION_RESULT='));
  assert.ok(line, '缺少回归结果');
  const report = JSON.parse(line.slice('REGRESSION_RESULT='.length));
  assert.equal(report.failed, 0);
  assert.ok(report.passed >= 56);
});

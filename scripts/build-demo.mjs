import { cpSync, mkdtempSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const stage = mkdtempSync(path.join(root, '.demo-build-'));

try {
  const api = path.join(root, 'pages', 'api');
  for (const entry of ['pages', 'components', 'lib', 'styles', 'public', 'package.json', 'package-lock.json', 'next.config.mjs', 'jsconfig.json']) {
    cpSync(path.join(root, entry), path.join(stage, entry), {
      recursive: true,
      filter: source => source !== api,
    });
  }
  symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'junction');
  const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
    cwd: stage,
    env: { ...process.env, NEXT_PUBLIC_PORTFOLIO_DEMO: 'true' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Build demo gagal.');
  const output = path.join(root, 'out');
  rmSync(output, { recursive: true, force: true });
  renameSync(path.join(stage, 'out'), output);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

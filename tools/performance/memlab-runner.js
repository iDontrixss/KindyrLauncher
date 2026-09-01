'use strict';

const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const chrome = process.env.KINDYR_MEMLAB_CHROME || process.env.CHROME_PATH || '/opt/google/chrome/chrome';
if (!existsSync(resolve(chrome))) {
  console.error(`MemLab preflight: Chrome executable not found at ${chrome}.`);
  console.error('Install/provide a compatible browser only when intentionally running MemLab; this command does not download one.');
  process.exit(2);
}

const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'exec', '--', 'memlab', 'run', '--scenario', 'tools/performance/memlab-scenario.js',
], { stdio: 'inherit', env: process.env });
process.exit(result.status || 1);

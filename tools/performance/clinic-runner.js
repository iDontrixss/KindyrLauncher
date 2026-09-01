'use strict';

const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const script = resolve(process.env.KINDYR_CLINIC_SCRIPT || 'tools/performance/imports.js');
const mode = process.env.KINDYR_CLINIC_MODE || 'standard';
const npmBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const commands = mode === 'heap'
  ? [['clinic', 'heapprofiler', '--', process.execPath, script]]
  : [
      ['clinic', 'doctor', '--', process.execPath, script],
      ['clinic', 'flame', '--', process.execPath, script],
      ['clinic', 'bubbleprof', '--', process.execPath, script],
    ];

if (!existsSync(script)) throw new Error(`Clinic target does not exist: ${script}`);
if (process.env.KINDYR_CLINIC_RUN !== '1') {
  console.log('Dry run. Set KINDYR_CLINIC_RUN=1 to execute isolated Node profiling:');
  for (const command of commands) console.log(`  ${command.join(' ')}`);
  process.exit(0);
}

for (const command of commands) {
  const result = spawnSync(npmBin, ['exec', '--', ...command], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

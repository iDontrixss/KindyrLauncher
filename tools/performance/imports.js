'use strict';

const { performance } = require('node:perf_hooks');
const { createRequire } = require('node:module');

const requireFromProject = createRequire(__filename);
const packages = [
  'electron-updater',
  'adm-zip',
  '@xmcl/core',
  '@xmcl/file-transfer',
  '@xmcl/installer',
];

const results = packages.map((name) => {
  const start = performance.now();
  try {
    requireFromProject(name);
    return { name, ok: true, milliseconds: Number((performance.now() - start).toFixed(2)) };
  } catch (error) {
    return { name, ok: false, milliseconds: Number((performance.now() - start).toFixed(2)), error: error.message };
  }
});

console.log(JSON.stringify({ node: process.version, results }, null, 2));

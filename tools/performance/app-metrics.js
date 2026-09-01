'use strict';

const { app } = require('electron');

if (process.env.ELECTRON_PERF_APP_METRICS !== '1') {
  console.error('Set ELECTRON_PERF_APP_METRICS=1 to capture app.getAppMetrics().');
  app.quit();
} else {
  app.whenReady().then(() => {
    console.log(JSON.stringify({ capturedAt: new Date().toISOString(), metrics: app.getAppMetrics() }, null, 2));
    app.quit();
  });
}

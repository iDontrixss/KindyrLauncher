// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Estado mutable compartido entre módulos del proceso principal.
// Cada módulo lo lee/escribe como state.<campo>.
module.exports = {
  discordRPC: null,
  msmcAuth: null,
  autoUpdaterInstance: null,
  autoUpdaterConfigured: false,
  semverModule: null,
  xmclCorePromise: null,
  xmclFileTransferPromise: null,
  xmclInstallerPromise: null,
  xmclLaunchTask: null,
  xmclCancellationRequested: false,
  microsoftAccounts: [],
  microsoftAccountStore: null,
  microsoftAccountWriteQueue: Promise.resolve(),
  mainWindow: undefined,
  minecraftProcess: null,
  runningInstanceId: null,
  activeLaunchInstanceId: null,
  launchRequestInProgress: false,
  inicioCancelado: false,
  minecraftStopRequested: false,
  splashWindow: undefined,
  splashCloseTimer: null,
  mainWindowLoadFallbackTimer: null,
  launchStartedAt: 0,
  currentLogFile: null,
  lastProgressMessage: '',
  lastProgressSentAt: 0,
  lastDataMessage: '',
  lastDataSentAt: 0,
  pendingLogLines: [],
  pendingLogBytes: 0,
  logFlushTimer: null,
  minecraftVersionCache: null,
  minecraftVersionRequest: null,
  loaderVersionCache: {},
  versionCacheCleanupTimer: null,
  curseSearchAbortController: null,
  appQuitAfterShutdown: false,
  quitLeavingOrphan: false
}

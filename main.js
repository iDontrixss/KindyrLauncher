// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

if (process.platform === 'linux' && process.env.KINDYR_ENABLE_GPU !== '1') {
  process.env.ELECTRON_OZONE_PLATFORM_HINT = 'x11'
}
const { app, ipcMain, net, protocol } = require('electron')
require('./main/ipc-guard').guardIpcRegistrations()
const state = require('./main/state')
const { PROFILE_ENABLED, scheduleProfileCheckpoint } = require('./main/diagnostics')
const { handleFatalError, logUnfatalError } = require('./main/fatal')
const { flushLaunchLogSync } = require('./main/launch/log')
const { shutdownForAppQuit } = require('./main/launch/process')
const { checkOrphanAtBootOnce } = require('./main/orphan')
const { registerRestrictedFileProtocol } = require('./main/file-protocol')
const { hardenDefaultSession } = require('./main/session-security')
const { getKindyrDataRoot } = require('./main/paths')
const { loadLauncherSettings } = require('./main/settings')
const { clearMainWindowLoadFallbackTimer, clearSplashCloseTimer } = require('./main/window-helpers')
const { createOnboardingWindow, createWindow, isOnboardingDone } = require('./main/windows')
require('./main/xmcl-shim')
require('./main/ipc/export-mrpack')
require('./main/ipc/import-pack')
require('./main/skins')
require('./main/ipc/window')
require('./main/ipc/settings')
require('./main/ipc/updates')
require('./main/ipc/background')
require('./main/ipc/content')
require('./main/ipc/console')
require('./main/ipc/discover')
require('./main/ipc/instances')
require('./main/ipc/misc')
require('./main/ipc/launch')

try {
  state.discordRPC = require('./discord-rpc')
} catch {
  state.discordRPC = null
}
process.on('uncaughtException', (error) => {
  handleFatalError('uncaughtException', error)
})
process.on('unhandledRejection', (reason) => {
  // Periféricos (Discord/skins/fetch): solo registro, jamás matar la partida.
  logUnfatalError('unhandledRejection', reason)
})

if (process.platform === 'linux' && process.env.KINDYR_ENABLE_GPU !== '1') {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  console.log('[Kindyr] Linux safe graphics enabled')
}

// Forzar scrollbars clasicas: con overlay scrollbars (Windows 11 con
// "mostrar siempre las barras" desactivado) Chromium dibuja un thumb
// flotante redondeado e ignora el estilo ::-webkit-scrollbar.
// OverlayScrollbar = overlay generico, FluentScrollbar = estilo Fluent de Win11.
try {
  app.commandLine.appendSwitch('disable-features', 'OverlayScrollbar,FluentScrollbar')
} catch {}

if (PROFILE_ENABLED) {
  ipcMain.on('profile-checkpoint', (_event, payload = {}) => {
    const label = typeof payload === 'string' ? payload : payload.label
    const renderer = payload && typeof payload === 'object' ? payload.renderer : null
    scheduleProfileCheckpoint(label, 50, renderer)
  })
}

// F1: single process. withStore solo serializa intra-proceso; sin lock dos
// launchers pisarían stores. Segunda instancia enfoca la existente y sale.
try {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    try { app.quit() } catch {}
  } else {
    app.on('second-instance', () => {
      try {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          if (state.mainWindow.isMinimized()) state.mainWindow.restore()
          state.mainWindow.focus()
        }
      } catch {}
    })
  }
} catch {}
app.whenReady().then(() => {
  // KL-02/KL-08: antes de crear cualquier ventana. file:// solo sirve la app y
  // los archivos de datos que la UI muestra; permisos web denegados.
  registerRestrictedFileProtocol({ protocol, net, getDataRoot: getKindyrDataRoot })
  hardenDefaultSession()
  // Huérfana: una sola validación al arrancar, con timeout. Si falla → desconocido.
  checkOrphanAtBootOnce().catch(() => {})
  scheduleProfileCheckpoint('app-ready')
  scheduleProfileCheckpoint('idle-10s', 10_000)
  scheduleProfileCheckpoint('idle-60s', 60_000)
  try {
    if (state.discordRPC) {
      const stored = loadLauncherSettings()
      state.discordRPC.initDiscordRPC(stored.discordEnabled !== false).catch(() => {})
    }
  } catch {}
  if (!isOnboardingDone()) {
    createOnboardingWindow()
  } else {
    createWindow()
  }
})

app.on('before-quit', (event) => {
  if (state.appQuitAfterShutdown) return
  // Huérfana explícita (crash Solo o X Solo): salir sin matar la JVM.
  // La consola sigue por logs/latest.log; orphan-minecraft.json ya guardado.
  if (state.quitLeavingOrphan) {
    flushLaunchLogSync()
    try {
      if (state.discordRPC && typeof state.discordRPC.shutdownDiscordRPC === 'function') {
        state.discordRPC.shutdownDiscordRPC().catch(() => {})
      }
    } catch {}
    return
  }
  // Cierre normal con juego vivo: apagar ordenado (TERM, KILL a los 5s).
  if (state.minecraftProcess || state.xmclLaunchTask || state.launchRequestInProgress) {
    event.preventDefault()
    shutdownForAppQuit()
      .catch(() => {})
      .finally(() => {
        state.appQuitAfterShutdown = true
        app.quit()
      })
    return
  }
  flushLaunchLogSync()
  try {
    if (state.discordRPC && typeof state.discordRPC.shutdownDiscordRPC === 'function') {
      state.discordRPC.shutdownDiscordRPC().catch(() => {})
    }
  } catch {}
})

app.on('window-all-closed', () => {
  clearSplashCloseTimer()
  clearMainWindowLoadFallbackTimer()
  if (state.splashWindow && !state.splashWindow.isDestroyed()) state.splashWindow.close()
  state.splashWindow = null
  if (process.platform !== 'darwin') app.quit()
})

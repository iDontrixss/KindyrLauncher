// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const APP_ROOT = require('path').resolve(__dirname, '../')
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const state = require('./state')
const { scheduleProfileCheckpoint } = require('./diagnostics')
const { ensureDefaultInstances } = require('./instances-store')
const { getKindyrDataRoot } = require('./paths')
const { checkForUpdatesOnStartup, startUpdatePolling } = require('./updater')
const { SPLASH_MIN_MS, clearMainWindowLoadFallbackTimer, clearSplashCloseTimer, getAppIcon, getRendererWebPreferences, hardenWindowNavigation } = require('./window-helpers')

function createSplashWindow() {
  const { version } = require('../package.json')
  state.splashWindow = new BrowserWindow({
    width: 520,
    height: 400,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    backgroundColor: '#121212',
    skipTaskbar: false,
    icon: getAppIcon(),
    webPreferences: getRendererWebPreferences(path.join(APP_ROOT, 'preload-splash.js'))
  })
  hardenWindowNavigation(state.splashWindow)
  scheduleProfileCheckpoint('splash-created')
  const window = state.splashWindow
  window.on('closed', () => {
    if (state.splashWindow === window) {
      state.splashWindow = null
      clearSplashCloseTimer()
    }
  })
  state.splashWindow.loadFile('splash.html', { query: { v: version } })
}

function closeSplashAndShowMain() {
  clearSplashCloseTimer()
  clearMainWindowLoadFallbackTimer()
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.show()
    state.mainWindow.focus()
  }
  if (state.splashWindow && !state.splashWindow.isDestroyed()) {
    state.splashWindow.close()
  }
  state.splashWindow = null
  // Auto-updater: chequea al iniciar pero NUNCA descarga solo. Si hay actualización, solo muestra el diálogo en primer plano.
  // Si el usuario acepta, ahí descarga. Si no acepta, no pasa nada. Solo se ofrece una release con manifiesto firmado (pnpm release:sign).
  // Además, polling cada 30 min para quien deja el launcher abierto.
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdatesOnStartup().catch(error => {
        console.error('AutoUpdater error:', error.message || error)
      })
      startUpdatePolling()
    }, 2500)
  }
}
function isOnboardingDone() {
  const file = path.join(getKindyrDataRoot(), 'onboarding-done.json')
  return fs.existsSync(file)
}

function markOnboardingDone() {
  const dir = getKindyrDataRoot()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'onboarding-done.json'), JSON.stringify({ done: true }))
}
function createWindow() {
  ensureDefaultInstances()
  const splashStartedAt = Date.now()
  createSplashWindow()

  state.mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#1a1a1a',
    webPreferences: getRendererWebPreferences(path.join(APP_ROOT, 'preload.js')),
    icon: getAppIcon()
  })
  hardenWindowNavigation(state.mainWindow)
  scheduleProfileCheckpoint('main-window-created')
  const window = state.mainWindow
  let splashDismissScheduled = false
  const dismissSplashWhenMainIsUsable = (reason) => {
    if (splashDismissScheduled || state.mainWindow !== window || window.isDestroyed()) return
    splashDismissScheduled = true
    clearMainWindowLoadFallbackTimer()
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashStartedAt))
    clearSplashCloseTimer()
    state.splashCloseTimer = setTimeout(() => {
      state.splashCloseTimer = null
      if (state.mainWindow !== window || window.isDestroyed()) return
      if (reason !== 'ready-to-show') console.warn(`[Kindyr] Splash fallback activated: ${reason}`)
      closeSplashAndShowMain()
    }, wait)
  }
  window.on('closed', () => {
    if (state.mainWindow !== window) return
    state.mainWindow = null
    clearSplashCloseTimer()
    clearMainWindowLoadFallbackTimer()
    if (state.splashWindow && !state.splashWindow.isDestroyed()) state.splashWindow.close()
    state.splashWindow = null
  })

  state.mainWindow.loadFile('index.html').catch(error => {
    console.error('[Kindyr] Could not load main window:', error.message || error)
    dismissSplashWhenMainIsUsable('load-error')
  })

  state.mainWindow.once('ready-to-show', () => {
    scheduleProfileCheckpoint('main-ready-to-show')
    dismissSplashWhenMainIsUsable('ready-to-show')
  })
  state.mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => dismissSplashWhenMainIsUsable('did-finish-load'), 750)
  })
  state.mainWindow.webContents.once('did-fail-load', (_event, _code, description) => {
    console.error('[Kindyr] Main window load failed:', description)
    dismissSplashWhenMainIsUsable('did-fail-load')
  })
  state.mainWindowLoadFallbackTimer = setTimeout(() => {
    dismissSplashWhenMainIsUsable('12-second-timeout')
  }, 12_000)
  state.mainWindowLoadFallbackTimer.unref?.()
}
function createOnboardingWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 600,
    resizable: false,
    frame: false,
    webPreferences: getRendererWebPreferences(path.join(APP_ROOT, 'preload-onboarding.js')),
    icon: getAppIcon()
  })
  hardenWindowNavigation(win)
  win.loadFile('onboarding.html')
  global.onboardingWindow = win
  win.on('closed', () => {
    if (global.onboardingWindow === win) global.onboardingWindow = null
  })
}

module.exports = {
  createOnboardingWindow,
  createWindow,
  isOnboardingDone,
  markOnboardingDone
}

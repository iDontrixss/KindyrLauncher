// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const APP_ROOT = require('path').resolve(__dirname, '../')
const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const state = require('./state')
const { isAppNavigationUrl } = require('./file-protocol')

function clearSplashCloseTimer() {
  if (!state.splashCloseTimer) return
  clearTimeout(state.splashCloseTimer)
  state.splashCloseTimer = null
}

function clearMainWindowLoadFallbackTimer() {
  if (!state.mainWindowLoadFallbackTimer) return
  clearTimeout(state.mainWindowLoadFallbackTimer)
  state.mainWindowLoadFallbackTimer = null
}

const SPLASH_MIN_MS = 1600

function resolveAppIconPath() {
  const candidates = app.isPackaged
    ? [
      path.join(process.resourcesPath, 'icon.ico'),
      path.join(process.resourcesPath, 'assets', 'icon.ico')
    ]
    : [
      path.join(APP_ROOT, 'assets', 'icon.ico'),
      path.join(APP_ROOT, 'icon.ico')
    ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return ''
}

function getAppIcon() {
  const iconPath = resolveAppIconPath()
  if (!iconPath) return undefined
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return undefined
  return image
}

function getRendererWebPreferences(preload) {
  return {
    ...(preload ? { preload } : {}),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    devTools: false,
    spellcheck: false,
    enableWebSQL: false,
    webgl: true,
    backgroundThrottling: true,
    autoplayPolicy: 'document-user-activation-required'
  }
}

function hardenWindowNavigation(win) {
  if (!win || !win.webContents) return
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    // KL-10: solo páginas de la app (antes valía cualquier file:// del disco).
    const blockForeign = (event, url) => {
      if (!isAppNavigationUrl(String(url || ''))) event.preventDefault()
    }
    win.webContents.on('will-navigate', blockForeign)
    win.webContents.on('will-redirect', blockForeign)
    win.webContents.on('will-attach-webview', (event) => event.preventDefault())
  } catch {}
}

module.exports = {
  SPLASH_MIN_MS,
  clearMainWindowLoadFallbackTimer,
  clearSplashCloseTimer,
  getAppIcon,
  getRendererWebPreferences,
  hardenWindowNavigation
}

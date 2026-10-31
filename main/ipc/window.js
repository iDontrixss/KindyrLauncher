// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain } = require('electron')
const state = require('../state')
const { showFatalChoice } = require('../fatal')
const { saveLauncherSettings } = require('../settings')
const { createWindow, isOnboardingDone, markOnboardingDone } = require('../windows')

ipcMain.on('minimize', () => {
  state.mainWindow?.minimize()
})

ipcMain.handle('finish-onboarding', (event, config = {}) => {
  // KL-17: solo la ventana de onboarding, y solo una vez. Desde la ventana
  // principal reabriría otra ventana principal y pisaría los ajustes.
  const onboarding = global.onboardingWindow
  if (isOnboardingDone() || !onboarding || onboarding.isDestroyed() || event.sender !== onboarding.webContents) {
    return { ok: false, error: 'El onboarding ya se completó.' }
  }
  markOnboardingDone()
  const safe = (config && typeof config === 'object') ? config : {}
  const settings = {
    username: String(safe.username || '').slice(0, 64),
    language: String(safe.language || 'es').slice(0, 16),
    theme: String(safe.theme || 'midnight').slice(0, 32),
    accountType: String(safe.accountType || 'offline').slice(0, 32),
    minRam: '2G',
    maxRam: '4G',
    minRamMb: 2048,
    maxRamMb: 4096,
    javaArgs: '',
    maxConcurrentDownloads: 6,
    settingsSavedAt: Date.now()
  }
  saveLauncherSettings(settings)

  if (global.onboardingWindow) {
    global.onboardingWindow.close()
    global.onboardingWindow = null
  }
  createWindow()
  return { ok: true }
})
ipcMain.on('maximize', () => {
  if (!state.mainWindow) return
  if (state.mainWindow.isMaximized()) {
    state.mainWindow.unmaximize()
  } else {
    state.mainWindow.maximize()
  }
})

ipcMain.on('close', () => {
  if (global.onboardingWindow && !global.onboardingWindow.isDestroyed()) {
    global.onboardingWindow.close()
    global.onboardingWindow = null
    return
  }
  // X con juego vivo: popup propio. Default + Esc/X del diálogo = Solo launcher
  // (cierra launcher, JVM huérfana). Cerrar todo mata la JVM y sale.
  try {
    const gameAlive = Boolean(typeof state.minecraftProcess !== 'undefined' && state.minecraftProcess && !state.minecraftProcess.killed)
    if (gameAlive && state.mainWindow && !state.mainWindow.isDestroyed()) {
      showFatalChoice({
        title: 'Minecraft sigue en ejecución',
        message: '¿Cerrar solo el launcher o cerrar todo?',
        detail: 'Solo launcher deja el juego huérfano (consola por latest.log). Cerrar todo mata la JVM.',
        mode: 'game'
      }).then((choice) => {
        if (choice !== 1) {
          try { state.quitLeavingOrphan = true } catch {}
        }
        try { state.mainWindow.close() } catch {}
      })
      return
    }
  } catch {}
  state.mainWindow?.close()
})

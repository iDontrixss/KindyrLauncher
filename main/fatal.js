// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const APP_ROOT = require('path').resolve(__dirname, '../')
const { BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const state = require('./state')
const { writeCrashReport } = require('./diagnostics')
const { flushLaunchLogSync } = require('./launch/log')
const { getAppIcon, getRendererWebPreferences, hardenWindowNavigation } = require('./window-helpers')

let fatalErrorInProgress = false
function handleFatalError(source, error) {
  if (fatalErrorInProgress) return
  fatalErrorInProgress = true
  const detail = (error && error.stack) || String(error)
  try {
    console.error(`[Kindyr][fatal:${source}]`, detail)
  } catch {}
  try {
    if (typeof flushLaunchLogSync === 'function') flushLaunchLogSync()
  } catch {}
  // Un crash real no pregunta: no hay diálogo posible si el proceso muere
  // (alerta de Windows, SIGKILL, OOM). Por eso NO se mata la JVM ni se
  // muestra nada aquí: la supervivencia está garantizada por construcción
  // (spawn detached + orphan-minecraft.json al lanzar + consola por
  // latest.log). Al reabrir se detecta la huérfana por pid+cmd+hora.
  writeCrashReport(source, detail)
  try { process.exit(1) } catch {}
}
function logUnfatalError(source, reason) {
  const detail = (reason && reason.stack) || String(reason)
  try { console.error(`[Kindyr][unfatal:${source}]`, detail) } catch {}
  try { writeCrashReport(`unfatal-${source}`, detail) } catch {}
}

// Diálogo fatal propio (fatal-dialog.html, estilo menú de cuentas), no nativo:
// debe verse igual en crash y en X, con foco inicial en Solo y Esc/X = Solo.
// Single-flight: si ya hay uno abierto se enfoca y los llamadores comparten
// la misma resolución. Cierre sin elección = 0 (jamás matar por gesto ambiguo).
let fatalDialogWindow = null
const fatalChoiceWaiters = []
function resolveFatalChoice(value) {
  const v = Number(value) === 1 ? 1 : 0
  const waiters = fatalChoiceWaiters.splice(0)
  for (const resolve of waiters) {
    try { resolve(v) } catch {}
  }
  try {
    if (fatalDialogWindow && !fatalDialogWindow.isDestroyed()) fatalDialogWindow.close()
  } catch {}
  fatalDialogWindow = null
}
ipcMain.handle('fatal-choice', (_event, choice) => {
  resolveFatalChoice(choice)
  return { ok: true }
})
function showFatalChoice({ title, message, detail = '', mode = 'game' }) {
  return new Promise((resolve) => {
    fatalChoiceWaiters.push(resolve)
    if (fatalDialogWindow && !fatalDialogWindow.isDestroyed()) {
      try { fatalDialogWindow.focus(); fatalDialogWindow.moveTop() } catch {}
      return
    }
    const hasParent = Boolean(state.mainWindow && !state.mainWindow.isDestroyed())
    try {
      fatalDialogWindow = new BrowserWindow({
        width: 520,
        height: 500,
        frame: false,
        resizable: false,
        center: true,
        show: false,
        alwaysOnTop: true,
        backgroundColor: '#030f2b',
        parent: hasParent ? state.mainWindow : undefined,
        modal: hasParent,
        webPreferences: getRendererWebPreferences(path.join(APP_ROOT, 'preload-fatal.js')),
        icon: getAppIcon()
      })
    } catch {
      resolveFatalChoice(0)
      return
    }
    hardenWindowNavigation(fatalDialogWindow)
    fatalDialogWindow.on('closed', () => {
      fatalDialogWindow = null
      resolveFatalChoice(0)
    })
    try {
      fatalDialogWindow.loadFile('fatal-dialog.html', {
        query: { title, message, detail: String(detail).slice(0, 2000), mode }
      })
    } catch {
      resolveFatalChoice(0)
      return
    }
    fatalDialogWindow.once('ready-to-show', () => {
      try {
        fatalDialogWindow.show()
        fatalDialogWindow.focus()
        fatalDialogWindow.moveTop()
      } catch {}
    })
  })
}

module.exports = {
  handleFatalError,
  logUnfatalError,
  showFatalChoice
}

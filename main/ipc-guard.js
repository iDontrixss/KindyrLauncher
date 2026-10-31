// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const APP_ROOT = require('path').resolve(__dirname, '../')
const { BrowserWindow, ipcMain } = require('electron')
const path = require('path')

function normalizeMessage(message, maxLength = 1200) {
  return String(message).replace(/\s+/g, ' ').slice(0, maxLength)
}

// F2: origen ≠ autorización. Valida frame file:// en handlers destructivos.
// Una página legítima también puede invocar con params válidos por bug, por
// eso además cada handler valida schema y efectos. Solo main window/splash.
// Fail-closed: sin frame/URL verificable se rechaza. Además de file://, la
// ruta debe estar dentro de la carpeta de la app (nunca un file:// arbitrario)
// y el emisor debe ser una BrowserWindow propia.
function assertTrustedIpcSender(event) {
  const untrusted = () => new Error('Origen IPC no confiable.')
  const url = event && event.senderFrame ? String(event.senderFrame.url || '') : ''
  if (!url.startsWith('file://')) throw untrusted()
  let filePath
  try { filePath = require('url').fileURLToPath(url) } catch { throw untrusted() }
  const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p))
  const appRoot = norm(APP_ROOT)
  const target = norm(filePath)
  if (target !== appRoot && !target.startsWith(appRoot + path.sep)) throw untrusted()
  if (event.sender && !BrowserWindow.fromWebContents(event.sender)) throw untrusted()
}

// Todo canal IPC pasa por assertTrustedIpcSender, no solo los destructivos:
// ipcMain.handle/on se envuelven una vez, antes de registrar ningún handler.
// Los handlers que ya llaman al guard explícitamente siguen funcionando.
function guardIpcRegistrations() {
  const rawHandle = ipcMain.handle.bind(ipcMain)
  const rawOn = ipcMain.on.bind(ipcMain)
  ipcMain.handle = (channel, listener) => rawHandle(channel, (event, ...args) => {
    try { assertTrustedIpcSender(event) } catch (error) { return { ok: false, error: error.message || String(error) } }
    return listener(event, ...args)
  })
  ipcMain.on = (channel, listener) => rawOn(channel, (event, ...args) => {
    try { assertTrustedIpcSender(event) } catch { return }
    listener(event, ...args)
  })
}

// S5: validación de forma en el borde main. Los ids que viajan por IPC
// (projectId, versionId, modId, slugs) solo necesitan ser strings cortos no
// vacíos: el proveedor responde 404 a lo inexistente, pero sin cota un
// renderer comprometido puede forzar URLs/keys de caché gigantes o log-spam.
// Lanza si no cumple; los llamadores legítimos siempre envían ids cortos.
function requireTrimmedString(value, label, maxLen = 128) {
  const clean = String(value ?? '').trim()
  if (!clean) throw new Error(`${label || 'Valor'} inválido.`)
  if (clean.length > maxLen) throw new Error(`${label || 'Valor'} demasiado largo.`)
  return clean
}

module.exports = {
  assertTrustedIpcSender,
  guardIpcRegistrations,
  normalizeMessage,
  requireTrimmedString
}

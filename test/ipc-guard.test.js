// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Guardia de origen IPC: fail-closed y aplicada a TODOS los canales.
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('url')
const { readMainModule } = require('./helpers/main-source')

const root = path.resolve(__dirname, '..')
const guardSource = readMainModule('main/ipc-guard.js')
const mainEntry = readMainModule('main.js')

function extractFunction(name) {
  const start = guardSource.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} debe existir`)
  const open = guardSource.indexOf('{', start)
  let depth = 0
  for (let i = open; i < guardSource.length; i++) {
    if (guardSource[i] === '{') depth++
    else if (guardSource[i] === '}' && --depth === 0) return guardSource.slice(start, i + 1)
  }
  throw new Error('función sin cierre')
}

function buildGuard({ trustedWebContents = true } = {}) {
  const src = extractFunction('assertTrustedIpcSender')
  const BrowserWindow = { fromWebContents: () => (trustedWebContents ? {} : null) }
  return new Function('path', 'BrowserWindow', 'APP_ROOT', 'require', `${src}; return assertTrustedIpcSender`)(
    path, BrowserWindow, root, require
  )
}

const evt = (url, sender = {}) => ({ senderFrame: url === undefined ? null : { url }, sender })

test('acepta páginas file:// dentro de la carpeta de la app', () => {
  const guard = buildGuard()
  assert.doesNotThrow(() => guard(evt(pathToFileURL(path.join(root, 'index.html')).href)))
})

test('rechaza frame ausente, URL vacía, http y file:// ajeno', () => {
  const guard = buildGuard()
  assert.throws(() => guard({}), /no confiable/)
  assert.throws(() => guard(evt(undefined)), /no confiable/)
  assert.throws(() => guard(evt('')), /no confiable/)
  assert.throws(() => guard(evt('https://evil.example/index.html')), /no confiable/)
  assert.throws(() => guard(evt(pathToFileURL(path.join(root, '..', 'otro', 'x.html')).href)), /no confiable/)
})

test('rechaza emisores que no son una BrowserWindow propia', () => {
  const guard = buildGuard({ trustedWebContents: false })
  assert.throws(() => guard(evt(pathToFileURL(path.join(root, 'index.html')).href)), /no confiable/)
})

test('ipcMain.handle/on se envuelven antes de cargar cualquier módulo con handlers', () => {
  const guardAt = mainEntry.indexOf("require('./main/ipc-guard').guardIpcRegistrations()")
  assert.ok(guardAt >= 0, 'main.js debe instalar la guardia')
  // Ningún require de módulos propios (que registran handlers al cargarse) antes de la guardia.
  const beforeGuard = mainEntry.slice(0, guardAt)
  assert.equal(/require\('\.\/main\//.test(beforeGuard), false)
  assert.equal(/ipcMain\.(handle|on)\(/.test(beforeGuard), false)
})

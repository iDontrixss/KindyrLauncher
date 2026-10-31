// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-15: las llamadas a APIs no pueden quedarse colgadas. Se prueba contra un
// servidor local que acepta la conexión y nunca responde.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { installElectronStub } = require('./helpers/electron-stub')

const env = installElectronStub()
test.after(() => env.restore())
const { fetchWithTimeout, API_TIMEOUT_MS } = require('../main/http')

test('KL-15: fetchWithTimeout aborta un servidor que no responde', async (t) => {
  const sockets = new Set()
  const server = http.createServer(() => { /* nunca responde */ })
  server.on('connection', s => sockets.add(s))
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  t.after(() => { for (const s of sockets) s.destroy(); server.close() })
  const url = `http://127.0.0.1:${server.address().port}/`
  const started = Date.now()
  await assert.rejects(fetchWithTimeout(url, {}, 300), err => err.name === 'TimeoutError' || err.name === 'AbortError')
  assert.ok(Date.now() - started < 5000)
  // Un signal propio (cancelación de búsqueda) sigue funcionando junto al timeout.
  const ctrl = new AbortController()
  const pending = fetchWithTimeout(url, { signal: ctrl.signal }, 10_000)
  ctrl.abort()
  await assert.rejects(pending, err => err.name === 'AbortError')
  assert.ok(API_TIMEOUT_MS > 0 && API_TIMEOUT_MS <= 60_000)
})

test('KL-15: los módulos de API no usan fetch sin timeout', () => {
  const root = path.resolve(__dirname, '..')
  for (const file of ['main/providers/modrinth.js', 'main/providers/curseforge.js', 'main/ipc/updates.js', 'main/updater.js', 'main/launch/forge.js']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8')
    assert.equal(/(?<![\w.])fetch\(/.test(src), false, `${file} tiene fetch( sin timeout`)
  }
})

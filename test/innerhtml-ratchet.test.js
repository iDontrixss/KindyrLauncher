// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// F2: trinquete + sanitize + senderFrame. Comportamentales: mutantes
// (innerHTML crudo, sin escape, sin sender) deben tumbar su test.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const mainSource = require('./helpers/main-source').readMainSource()
const commonSource = fs.readFileSync(path.join(root, 'common.js'), 'utf8')
const instancesSource = fs.readFileSync(path.join(root, 'instances.js'), 'utf8')

test('trinquete innerHTML: CI falla si sube o hay nuevo con riesgos', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-innerhtml.js')], { encoding: 'utf8' })
  assert.equal(r.status, 0, (r.stderr || '') + (r.stdout || ''))
  assert.match(r.stdout || '', /Trinquete innerHTML OK/)
})

test('setSafeHtml es la única vía documentada', () => {
  assert.match(commonSource, /function setSafeHtml\(el, html\)/)
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /data-click\/data-args \(ui-actions\.js\)/)
})

test('el changelog pasa por el saneador único', () => {
  assert.match(instancesSource, /sanitizeProviderHtml\(html, /)
  assert.equal(instancesSource.includes('box.innerHTML = html'), false)
})

test('senderFrame en destructivos: launch, update, java, delete + writes', () => {
  assert.match(mainSource, /function assertTrustedIpcSender\(event\)/)
  for (const ch of ['launch-game', 'install-update', 'settings-set-java-path', 'instance-delete', 'upload-instance-files', 'delete-instance-content', 'instance-rename', 'instance-duplicate', 'instance-set-icon', 'import-mrpack', 'export-mrpack', 'settings-purge-cache']) {
    const i = mainSource.indexOf(`ipcMain.handle('${ch}'`)
    assert.ok(i >= 0, ch)
    assert.ok(mainSource.slice(i, i + 900).includes('assertTrustedIpcSender'), ch)
  }
})

test('KL-10: la CSP principal ya no admite scripts ni manejadores inline', () => {
  const csp = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)[1]
  const scriptSrc = csp.split(';').map(p => p.trim()).find(p => p.startsWith('script-src '))
  assert.equal(scriptSrc, "script-src 'self'")
  assert.match(csp, /script-src-attr 'none'/)
})

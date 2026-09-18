// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Regresión de los 4 bloqueantes: S9 fail-closed en entradas CF, S1 changelog
// saneado, S2 sin interpolación en onclick, S11 javaHome con procedencia +
// sanitizeCustomArgs en guardado y lanzamiento.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const instancesSource = fs.readFileSync(path.join(root, 'instances.js'), 'utf8')
const accountsSource = fs.readFileSync(path.join(root, 'accounts.js'), 'utf8')
const commonSource = fs.readFileSync(path.join(root, 'common.js'), 'utf8')

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} debe existir`)
  const next = source.indexOf('\nfunction ', start + 1)
  const nextAsync = source.indexOf('\nasync function ', start + 1)
  let end = source.length
  if (next >= 0) end = Math.min(end, next)
  if (nextAsync >= 0) end = Math.min(end, nextAsync)
  return source.slice(start, end)
}

function handlerBody(source, channel) {
  const start = source.indexOf(`ipcMain.handle('${channel}'`)
  assert.ok(start >= 0, `handler ${channel} debe existir`)
  return source.slice(start, start + 6000)
}

test('S9: downloadCurseForgeModpackEntry es fail-closed (sin hash no instala)', () => {
  const body = functionBody(mainSource, 'downloadCurseForgeModpackEntry')
  assert.ok(body.includes('downloadSingleFileVerified('), 'debe delegar en descarga verificada')
  assert.equal(body.includes('await downloadToFile('), false, 'no debe descargar sin verificar')
  assert.match(body, /Instalaci[oó]n bloqueada por seguridad|bloqueada por seguridad/)
})

test('S1: el changelog se sanea antes de innerHTML', () => {
  assert.match(instancesSource, /function sanitizeChangelogHtml\(html\)/)
  assert.match(instancesSource, /CHANGELOG_DROP_TAGS/)
  assert.match(instancesSource, /sanitizeChangelogHtml\(html\)/)
  assert.equal(instancesSource.includes('box.innerHTML = html'), false, 'no debe inyectar HTML de proveedor sin sanear')
})

test('S2: accounts.js no interpola ids en onclick', () => {
  assert.equal(accountsSource.includes("onclick=\"setActiveMicrosoftAccount('"), false)
  assert.equal(accountsSource.includes("onclick=\"logoutMicrosoft(event, '"), false)
  assert.match(accountsSource, /data-ms-active=/)
  assert.match(accountsSource, /data-ms-logout=/)
  assert.match(accountsSource, /addEventListener\('click'/)
})

test('S2: common.js no interpola nombres en onclick', () => {
  assert.equal(commonSource.includes("onclick=\"deleteOfflineAccount(event, '"), false)
  assert.match(commonSource, /data-offline-delete=/)
})

test('S11: sanitizeCustomArgs bloquea classpath, módulos, props y argfiles', () => {
  const body = functionBody(mainSource, 'sanitizeCustomArgs')
  for (const blocked of ["'-cp'", "'--add-opens'", "'--add-exports'", "'-Djava.'", "'-agentpath'", "'--patch-module'", "'-Xshare:'"]) {
    assert.ok(body.includes(blocked), `blocklist debe incluir ${blocked}`)
  }
  assert.ok(body.includes("startsWith('@')"), 'debe bloquear @argfiles')
})

test('S11: instance-set-launch-opts sanitiza y exige procedencia', () => {
  const body = handlerBody(mainSource, 'instance-set-launch-opts')
  assert.match(body, /sanitizeCustomArgs\(/)
  assert.match(body, /isTrustedJavaBinary\(/)
})

test('S11: launch-game exige java autorizado y re-valida', () => {
  const body = handlerBody(mainSource, 'launch-game')
  assert.match(body, /isTrustedJavaBinary\(/)
  assert.match(body, /resolveJavaPath\(trust\.canonical\)/)
})

test('S11: el diálogo de Java registra procedencia confiable', () => {
  const body = handlerBody(mainSource, 'settings-browse-java')
  assert.match(body, /approveJavaBinary\(/)
  assert.match(mainSource, /approvedJavaBinaries/)
})

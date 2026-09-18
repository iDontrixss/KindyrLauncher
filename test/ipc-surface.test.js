// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// S5: la superficie IPC valida forma/tamaño en el borde main. El preload
// solo corta transporte (skinBytes); main es autoritativo.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const preloadSource = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')

function handlerBody(source, channel) {
  const start = source.indexOf(`ipcMain.handle('${channel}'`)
  assert.ok(start >= 0, `handler ${channel} debe existir`)
  return source.slice(start, start + 6000)
}

test('existe helper de forma y se usa en entradas provider', () => {
  assert.match(mainSource, /function requireTrimmedString\(value, label, maxLen/)
  for (const fn of ['getModrinthProjectDetails', 'getCurseForgeProjectDetails', 'getCurseForgeFiles', 'getModrinthVersions', 'getModrinthVersionDetails']) {
    const start = mainSource.indexOf(`function ${fn}(`)
    assert.ok(start >= 0, `${fn} debe existir`)
    const body = mainSource.slice(start, start + 800)
    assert.ok(body.includes('requireTrimmedString('), `${fn} debe acotar su id`)
  }
})

test('ms-set-active exige cuenta existente; ms-logout valida forma', () => {
  assert.match(handlerBody(mainSource, 'ms-set-active'), /no existe/)
  assert.match(handlerBody(mainSource, 'ms-logout'), /requireTrimmedString\(/)
})

test('update-content y set-version validan kind/file/versionId', () => {
  assert.match(handlerBody(mainSource, 'update-instance-content'), /requireTrimmedString\(payload\.kind/)
  const setBody = handlerBody(mainSource, 'set-instance-content-version')
  assert.match(setBody, /requireTrimmedString\(payload\.kind/)
  assert.match(setBody, /requireTrimmedString\(payload\.versionId/)
})

test('curseforge-set-key acota longitud y caracteres', () => {
  const body = handlerBody(mainSource, 'curseforge-set-key')
  assert.match(body, /256/)
  assert.match(body, /\\s/)
})

test('rollback-to-version solo permite releases publicadas anteriores', () => {
  const body = handlerBody(mainSource, 'rollback-to-version')
  assert.match(body, /release\.draft/)
  assert.match(body, /semver\.lt\(relVersion, curValid\)/)
})

test('install-update exige descarga completada', () => {
  assert.match(mainSource, /updateDownloadedReady = true/)
  assert.match(handlerBody(mainSource, 'install-update'), /updateDownloadedReady/)
})

test('finish-onboarding tolera config ausente', () => {
  assert.match(mainSource, /ipcMain\.handle\('finish-onboarding', \(_event, config = \{\}\)/)
})

test('skins: corte temprano en main y en preload', () => {
  assert.match(mainSource, /skinBytes\.length > MAX_SKIN_BYTES/)
  assert.match(preloadSource, /MAX_PRELOAD_SKIN_BYTES/)
  assert.match(preloadSource, /assertSkinBytesSize\(skinBytes\)/)
})

test('sin divergencia con S9/S11: mismos helpers en install y launch', () => {
  assert.match(mainSource, /downloadSingleFileVerified\(file\.url, target, file\.hashes/)
  const launchBody = handlerBody(mainSource, 'launch-game')
  assert.match(launchBody, /isTrustedJavaBinary\(/)
  assert.match(launchBody, /sanitizeCustomArgs\(customArgs\)/)
})

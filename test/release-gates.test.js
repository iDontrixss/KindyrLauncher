// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-04 (instalador sin clave pública de actualización) y KL-09 (ffmpeg
// dentro del ASAR): compuertas del afterPack.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { assertUpdateKeys, assertFfmpegUnpacked } = require('../scripts/after-pack')

const root = path.resolve(__dirname, '..')

function fakeProject(keys) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-gate-'))
  fs.mkdirSync(path.join(dir, 'main'))
  fs.writeFileSync(path.join(dir, 'main', 'update-public-keys.js'), 'module.exports = ' + JSON.stringify(keys))
  return dir
}

const ctx = (projectDir, targetName) => ({ packager: { projectDir }, targets: [{ name: targetName }] })

test('KL-04: un instalador sin claves Ed25519 válidas no se genera', () => {
  const previous = process.env.KINDYR_ALLOW_NO_UPDATE_KEYS
  delete process.env.KINDYR_ALLOW_NO_UPDATE_KEYS
  try {
    const empty = fakeProject([])
    assert.throws(() => assertUpdateKeys(ctx(empty, 'nsis')), /release:keygen/)
    assert.throws(() => assertUpdateKeys(ctx(empty, 'AppImage')), /release:keygen/)
    assert.doesNotThrow(() => assertUpdateKeys(ctx(empty, 'dir')), 'build --dir de prueba permitido')
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' })
    assert.throws(() => assertUpdateKeys(ctx(fakeProject(['no es una clave', rsa]), 'nsis')), /Ed25519/)
    const ed = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' })
    assert.doesNotThrow(() => assertUpdateKeys(ctx(fakeProject([ed]), 'nsis')))
    process.env.KINDYR_ALLOW_NO_UPDATE_KEYS = '1'
    assert.doesNotThrow(() => assertUpdateKeys(ctx(empty, 'nsis')), 'override explícito para artefactos de CI')
  } finally {
    if (previous === undefined) delete process.env.KINDYR_ALLOW_NO_UPDATE_KEYS
    else process.env.KINDYR_ALLOW_NO_UPDATE_KEYS = previous
  }
})

test('KL-04: la CI solo usa el override en los jobs de empaquetado que no publican', () => {
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
  assert.equal((ci.match(/KINDYR_ALLOW_NO_UPDATE_KEYS: '1'/g) || []).length, 2)
  assert.equal((ci.match(/--publish never/g) || []).length >= 2, true)
})

test('KL-09: ffmpeg se desempaqueta y main lo ejecuta desde app.asar.unpacked', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.ok(pkg.build.asarUnpack.includes('node_modules/ffmpeg-static/**'))
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-unpacked-'))
  assert.throws(() => assertFfmpegUnpacked(empty), /desempaquetado/)
  const src = fs.readFileSync(path.join(root, 'main', 'ipc', 'background.js'), 'utf8')
  assert.match(src, /app\.asar\.unpacked/)
  assert.equal(/require\('ffmpeg-static'\)\s*\n\s*const \{ spawn \}/.test(src), false)
})

test('KL-14: fuses de Electron endurecidos en el build', () => {
  const fuses = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build.electronFuses
  assert.equal(fuses.runAsNode, false)
  assert.equal(fuses.enableNodeOptionsEnvironmentVariable, false)
  assert.equal(fuses.enableNodeCliInspectArguments, false)
  assert.equal(fuses.onlyLoadAppFromAsar, true)
  assert.equal(fuses.enableEmbeddedAsarIntegrityValidation, true)
})

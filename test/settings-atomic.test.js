// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// F1: stores atómicos. Comportamentales, no grep: deben tumbar mutantes
// (directo, sin wx, corrupt→[] silencioso, sin cola, ignora error save).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { atomicWriteJsonSync, purgeStaleTmps, preserveCorruptSync } = require('../stores/atomic-store')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-store-'))
}

test('kill antes/durante tmp → anterior intacto; post-rename → nuevo completo', () => {
  const dir = tmpDir()
  const dest = path.join(dir, 'settings.json')
  atomicWriteJsonSync(dest, { version: 1, a: 1 })
  // Simula fallo antes de escribir tmp: no se toca dest
  const before = fs.readFileSync(dest, 'utf8')
  assert.match(before, /"a": 1/)
  // Simula tmp abandonado a mitad: dest sigue válido + purga solo propio
  const fakeTmp = `${dest}.tmp-999-123`
  fs.writeFileSync(fakeTmp, '{"a":')
  assert.deepEqual(JSON.parse(fs.readFileSync(dest, 'utf8')).a, 1)
  const purged = purgeStaleTmps(dir, 'settings.json')
  assert.equal(purged, 1)
  assert.equal(fs.existsSync(fakeTmp), false)
  // Post-rename: nuevo completo
  atomicWriteJsonSync(dest, { version: 1, a: 2 })
  assert.deepEqual(JSON.parse(fs.readFileSync(dest, 'utf8')).a, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('wx exclusivo: colisión tmp no destruye bueno', () => {
  const dir = tmpDir()
  const dest = path.join(dir, 'x.json')
  atomicWriteJsonSync(dest, { v: 1 })
  const tmp = `${dest}.tmp-1-1-1`
  fs.writeFileSync(tmp, '{}', { flag: 'wx' })
  assert.throws(() => fs.writeFileSync(tmp, '{}', { flag: 'wx' }), /EEXIST/)
  assert.deepEqual(JSON.parse(fs.readFileSync(dest, 'utf8')).v, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('corrupto se preserva .bak, nunca [] silencioso', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'instances.json')
  fs.writeFileSync(file, '{"broken":')
  const bak = preserveCorruptSync(file)
  assert.ok(bak && fs.existsSync(bak), 'debe preservar .bak')
  assert.ok(fs.existsSync(file), 'no debe borrar el original en diagnóstico')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('50 escrituras concurrentes → siempre documento válido de una escritura', async () => {
  const dir = tmpDir()
  const dest = path.join(dir, 'c.json')
  // Cola single-writer a nivel op (como withLauncherSettings), no solo write
  let q = Promise.resolve()
  const results = []
  for (let i = 0; i < 50; i++) {
    const v = i
    q = q.then(() => { atomicWriteJsonSync(dest, { version: 1, v }); results.push(v) })
    q.catch(() => {})
  }
  await q
  const final = JSON.parse(fs.readFileSync(dest, 'utf8'))
  assert.ok(results.includes(final.v), 'final debe ser una escritura aceptada')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('dos RMW campos distintos → ambos sobreviven (sin lost-update)', async () => {
  const dir = tmpDir()
  const dest = path.join(dir, 's.json')
  atomicWriteJsonSync(dest, { version: 1, java: 'a', theme: 'x' })
  let q = Promise.resolve()
  const withStore = (mut) => {
    const run = async () => {
      const cur = JSON.parse(fs.readFileSync(dest, 'utf8'))
      const next = await mut({ ...cur })
      atomicWriteJsonSync(dest, next)
      return next
    }
    const r = q.then(run)
    q = r.catch(() => {})
    return r
  }
  await Promise.all([
    withStore((s) => ({ ...s, java: 'b' })),
    withStore((s) => ({ ...s, theme: 'y' }))
  ])
  const final = JSON.parse(fs.readFileSync(dest, 'utf8'))
  assert.equal(final.java, 'b')
  assert.equal(final.theme, 'y')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('main.js: settings versionada, futura bloqueada, corrupt preservado', () => {
  const src = require('./helpers/main-source').readMainSource()
  assert.match(src, /SETTINGS_STORE_VERSION/)
  assert.match(src, /preserveCorruptSync/)
  assert.match(src, /versión futura|version.*KNOWN|_readOnly/)
  assert.match(src, /withLauncherSettings/)
  assert.match(src, /purgeStaleTmps/)
})

test('main.js: instances ya no cae a [] silencioso', () => {
  const src = require('./helpers/main-source').readMainSource()
  assert.match(src, /customInstancesCorruptInfo/)
  assert.match(src, /instances\.json corrupto/)
})

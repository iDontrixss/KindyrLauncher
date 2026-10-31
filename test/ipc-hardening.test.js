// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-07 (subida por arrastre: rutas y bytes propuestos por el renderer) y
// KL-17 (finish-onboarding fuera del onboarding). Handlers reales cargados con
// un stub de electron; appData temporal, nada toca datos del usuario.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { installElectronStub } = require('./helpers/electron-stub')

const env = installElectronStub()
test.after(() => env.restore())

require('../main/ipc/content')
require('../main/ipc/window')
const { writeStagedBlob, MAX_UPLOAD_BLOB_BYTES } = require('../content-sniff')

test('KL-07: rutas UNC/de dispositivo se descartan sin tocarlas', async () => {
  const r = await env.invoke('upload-instance-files', {
    instanceId: 'vanilla-1.21.4',
    filePaths: ['\\\\attacker\\share\\mod.jar', '//attacker/share/mod.jar', '\\\\?\\UNC\\attacker\\s\\m.jar', 'C:\\no-existe-kindyr\\mod.jar']
  })
  assert.equal(r.ok, true)
  assert.deepEqual(r.copied, [])
  const reasons = r.skipped.map(s => s.reason)
  assert.deepEqual(reasons.slice(0, 3), ['not-local', 'not-local', 'not-local'])
  assert.equal(reasons[3], 'missing', 'una ruta local sigue el flujo normal')
})

test('KL-07: los blobs deben ser binarios y se miden antes de copiarse', () => {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-stage-'))
  try {
    assert.throws(() => writeStagedBlob(staging, 'a.jar', [80, 75, 3, 4]), e => e.reason === 'unreadable')
    assert.throws(() => writeStagedBlob(staging, 'b.jar', { length: 1e12 }), e => e.reason === 'unreadable')
    assert.throws(() => writeStagedBlob(staging, 'c.jar', new Uint8Array(0)), e => e.reason === 'unreadable')
    const huge = { byteLength: MAX_UPLOAD_BLOB_BYTES + 1 }
    Object.setPrototypeOf(huge, Uint8Array.prototype)
    assert.throws(() => writeStagedBlob(staging, 'd.jar', huge), e => e.reason === 'too-large')
    const ok = writeStagedBlob(staging, 'e.jar', new Uint8Array([80, 75, 3, 4]).subarray(1))
    assert.deepEqual([...fs.readFileSync(ok)], [75, 3, 4])
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
})

test('KL-07: el preload corta blobs gigantes antes del transporte IPC', async () => {
  global.window = { addEventListener: () => {} }
  try {
    require('../preload')
  } finally {
    delete global.window
  }
  const upload = env.exposed.kindyrAPI.instances.uploadFiles
  const big = { name: 'x.jar', bytes: { byteLength: 300 * 1024 * 1024 } }
  assert.throws(() => upload({ instanceId: 'x', fileBlobs: [big] }), /tamaño máximo/)
  const mid = () => ({ name: 'y.jar', bytes: { byteLength: 200 * 1024 * 1024 } })
  assert.throws(() => upload({ instanceId: 'x', fileBlobs: [mid(), mid(), mid()] }), /tamaño máximo/)
  await upload({ instanceId: 'x', fileBlobs: [{ name: 'z.jar', bytes: new Uint8Array(4) }] })
  const last = env.rendererCalls.at(-1)
  assert.equal(last.channel, 'upload-instance-files')
  assert.equal(last.args[0].fileBlobs.length, 1)
})

test('KL-07: el icono de instancia solo acepta rutas locales', () => {
  const { resolveInstanceIcon } = require('../main/instance-create')
  assert.throws(() => resolveInstanceIcon({ path: '\\\\attacker\\share\\icon.png' }), /disco local/)
  assert.throws(() => resolveInstanceIcon({ path: '//attacker/share/icon.png' }), /disco local/)
})

test('KL-17: finish-onboarding se rechaza fuera de la ventana de onboarding', async () => {
  global.onboardingWindow = null
  let r = await env.invoke('finish-onboarding', { username: 'x' })
  assert.equal(r.ok, false)
  // Otra ventana (p. ej. la principal) con la de onboarding abierta.
  global.onboardingWindow = { webContents: {}, isDestroyed: () => false, close: () => {} }
  r = await env.invoke('finish-onboarding', { username: 'x' })
  assert.equal(r.ok, false)
  // Desde la propia ventana pero con el onboarding ya completado.
  fs.mkdirSync(env.appData + '/KindyrLauncher', { recursive: true })
  fs.writeFileSync(path.join(env.appData, 'KindyrLauncher', 'onboarding-done.json'), '{"done":true}')
  r = await env.handlers.get('finish-onboarding')({ sender: global.onboardingWindow.webContents }, { username: 'x' })
  assert.equal(r.ok, false)
  global.onboardingWindow = null
})

test('KL-12: claves de prototipo no resuelven carpetas ni tipos de contenido', async () => {
  const { getInstanceTargetPath } = require('../main/instances-store')
  const { resolveContentDir } = require('../main/instance-content')
  for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.throws(() => getInstanceTargetPath('vanilla-1.21.4', key), /no valida/)
    assert.throws(() => resolveContentDir('vanilla-1.21.4', key), /inválido/)
  }
  const r = await env.invoke('open-instance-target', 'vanilla-1.21.4', 'toString')
  assert.equal(r.ok, false)
  assert.equal(fs.existsSync(path.join(process.cwd(), '[object global]')), false)
  assert.equal(fs.existsSync(path.join(process.cwd(), '[object Undefined]')), false)
  assert.ok(getInstanceTargetPath('vanilla-1.21.4', 'mods').endsWith('mods'))
})

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-02 (lectura de archivos arbitrarios vía file://) y KL-08 (permisos web
// concedidos por defecto). Unitarios de la política de rutas + integración en
// Electron real con los módulos de main.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { pathToFileURL } = require('url')
const { resolveAllowedFileUrl, isAllowedDataFile } = require('../main/file-protocol')

const root = path.resolve(__dirname, '..')
const mainSource = require('./helpers/main-source').readMainSource()

function electronBinary() {
  try {
    const dir = path.dirname(require.resolve('electron/package.json'))
    const exe = path.join(dir, 'dist', fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim())
    return fs.existsSync(exe) ? exe : ''
  } catch { return '' }
}

function makeTree() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-fileproto-'))
  const appRoot = path.join(work, 'app')
  const dataRoot = path.join(work, 'data')
  fs.mkdirSync(path.join(dataRoot, 'instances', 'demo'), { recursive: true })
  fs.mkdirSync(appRoot, { recursive: true })
  fs.writeFileSync(path.join(appRoot, 'page.html'), '<!doctype html><body></body>')
  fs.writeFileSync(path.join(appRoot, 'inside.txt'), 'INSIDE')
  fs.writeFileSync(path.join(work, 'outside.txt'), 'OUTSIDE-SECRET')
  fs.writeFileSync(path.join(dataRoot, 'background.png'), 'BG')
  fs.writeFileSync(path.join(dataRoot, 'settings.json'), '{"secret":true}')
  fs.writeFileSync(path.join(dataRoot, 'instances', 'demo', 'icon.png'), 'ICON')
  fs.writeFileSync(path.join(dataRoot, 'instances', 'demo', 'instance.json'), '{}')
  return { work, appRoot, dataRoot }
}

test('KL-02: política de rutas file:// (app + fondo + iconos, nada más)', () => {
  const { work, appRoot, dataRoot } = makeTree()
  try {
    const allow = (p) => resolveAllowedFileUrl(pathToFileURL(p).href, { appRoot, dataRoot })
    assert.ok(allow(path.join(appRoot, 'page.html')))
    assert.ok(allow(path.join(dataRoot, 'background.png')))
    assert.ok(allow(path.join(dataRoot, 'instances', 'demo', 'icon.png')))
    assert.equal(allow(path.join(work, 'outside.txt')), '')
    assert.equal(allow(path.join(dataRoot, 'settings.json')), '')
    assert.equal(allow(path.join(dataRoot, 'microsoft-accounts.json')), '')
    assert.equal(allow(path.join(dataRoot, 'instances', 'demo', 'instance.json')), '')
    assert.equal(allow(path.join(dataRoot, 'instances', 'demo', 'minecraft', 'icon.png')), '')
    assert.equal(allow(path.join(dataRoot, 'instances', 'missing', 'icon.png')), '', 'inexistente: realpath falla')
    assert.equal(resolveAllowedFileUrl(pathToFileURL(appRoot).href + '/%2e%2e/outside.txt', { appRoot, dataRoot }), '')
    assert.equal(resolveAllowedFileUrl('file://evil-host/share/x.png', { appRoot, dataRoot }), '')
    assert.equal(resolveAllowedFileUrl('https://example.com/x', { appRoot, dataRoot }), '')
    assert.equal(resolveAllowedFileUrl('not a url', { appRoot, dataRoot }), '')
    assert.equal(isAllowedDataFile(path.join(dataRoot, '..', 'background.png'), dataRoot), false)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
})

test('KL-02: un enlace dentro de dataRoot no puede apuntar fuera', (t) => {
  const { work, appRoot, dataRoot } = makeTree()
  try {
    // Junction de directorio: en Windows no requiere privilegios (a diferencia
    // de los symlinks de archivo). instances/evil -> carpeta externa con icon.png.
    const outsideDir = path.join(work, 'outside-dir')
    fs.mkdirSync(outsideDir)
    fs.writeFileSync(path.join(outsideDir, 'icon.png'), 'OUTSIDE')
    const link = path.join(dataRoot, 'instances', 'evil')
    try { fs.symlinkSync(outsideDir, link, 'junction') } catch { return t.skip('sin permiso para crear enlaces') }
    assert.equal(resolveAllowedFileUrl(pathToFileURL(path.join(link, 'icon.png')).href, { appRoot, dataRoot }), '')
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
})

test('KL-02/KL-08: main registra el protocolo restringido y endurece la sesión antes de crear ventanas', () => {
  const ready = mainSource.slice(mainSource.indexOf('app.whenReady().then('))
  const reg = ready.indexOf('registerRestrictedFileProtocol(')
  const hard = ready.indexOf('hardenDefaultSession()')
  assert.ok(reg > 0 && hard > 0)
  assert.ok(reg < ready.indexOf('createWindow()') && hard < ready.indexOf('createOnboardingWindow()'))
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build.files.includes('main/**/*'))
})

test('KL-02/KL-08: en Electron real el renderer no lee fuera y no obtiene permisos', (t) => {
  const exe = electronBinary()
  if (!exe) return t.skip('binario de Electron no instalado')
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return t.skip('sin display (usar xvfb-run)')
  const { work } = makeTree()
  try {
    const outFile = path.join(work, 'out.json')
    const run = spawnSync(exe, [path.join(__dirname, 'helpers', 'electron-main-security-runner.js'), work, outFile], { timeout: 90_000, encoding: 'utf8' })
    assert.ok(fs.existsSync(outFile), 'sin salida del runner: ' + (run.stderr || run.error || ''))
    const r = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    assert.equal(r.error, undefined, r.error)
    assert.equal(r.appFile, 'INSIDE')
    assert.equal(r.relative, 'INSIDE')
    assert.equal(r.background, 'BG')
    assert.equal(r.instanceIcon, 'ICON')
    for (const key of ['outside', 'traversal', 'encodedTraversal', 'settingsJson', 'instanceFile']) {
      assert.notEqual(r[key], 'OUTSIDE-SECRET', key)
      assert.match(r[key], /^(HTTP 403|ERR)$/, `${key} debería estar bloqueado: ${r[key]}`)
    }
    assert.equal(r.notification, 'denied')
    assert.notEqual(r.geolocation, 'granted')
    assert.match(r.media, /^denied/)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
})

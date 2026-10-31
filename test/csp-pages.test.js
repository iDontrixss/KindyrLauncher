// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-10: CSP de la ventana principal y de las secundarias, y navegación
// limitada a la carpeta de la app.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { pathToFileURL } = require('url')
const { checkPages } = require('../scripts/csp-secondary')

const root = path.resolve(__dirname, '..')

function electronBinary() {
  try {
    const dir = path.dirname(require.resolve('electron/package.json'))
    const exe = path.join(dir, 'dist', fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim())
    return fs.existsSync(exe) ? exe : ''
  } catch { return '' }
}

test('KL-10: las ventanas secundarias tienen CSP por hash y ningún manejador inline', () => {
  assert.deepEqual(checkPages(), [])
  for (const file of ['splash.html', 'onboarding.html', 'fatal-dialog.html', 'update-confirmation.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8')
    const csp = html.match(/data-kindyr-csp="secondary" content="([^"]+)"/)[1]
    assert.match(csp, /default-src 'none'/)
    assert.match(csp, /script-src 'sha256-[A-Za-z0-9+/=]+'/)
    assert.equal(/unsafe-inline'[^;]*;/.test(csp.split(';').find(p => p.trim().startsWith('script-src'))), false)
  }
})

test('KL-10: la CSP principal no permite esquemas sobrantes', () => {
  const csp = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)[1]
  assert.equal(csp.includes('filesystem:'), false)
  assert.equal(csp.includes('cdn.jsdelivr.net'), false)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /frame-src 'none'/)
})

test('KL-10: will-navigate solo permite páginas de la propia app', () => {
  const { isAppNavigationUrl } = require('../main/file-protocol')
  assert.equal(isAppNavigationUrl(pathToFileURL(path.join(root, 'index.html')).href), true)
  assert.equal(isAppNavigationUrl(pathToFileURL(path.join(os.tmpdir(), 'x.html')).href), false)
  assert.equal(isAppNavigationUrl('file://evil-host/share/x.html'), false)
  assert.equal(isAppNavigationUrl('https://modrinth.com/'), false)
  assert.equal(isAppNavigationUrl(pathToFileURL(root).href + '/%2e%2e/x.html'), false)
})

test('KL-10: en Electron real las ventanas secundarias cargan sin violaciones y su script corre', (t) => {
  const exe = electronBinary()
  if (!exe) return t.skip('binario de Electron no instalado')
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return t.skip('sin display (usar xvfb-run)')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-pages-'))
  try {
    const outFile = path.join(tmp, 'out.json')
    const run = spawnSync(exe, [path.join(__dirname, 'helpers', 'electron-pages-runner.js'), outFile], { timeout: 120_000, encoding: 'utf8' })
    assert.ok(fs.existsSync(outFile), 'sin salida del runner: ' + (run.stderr || run.error || ''))
    const r = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    assert.equal(r.error, undefined, r.error)
    for (const page of ['splash', 'onboarding', 'fatal', 'update']) assert.deepEqual(r[page].violations, [], page)
    assert.equal(r.splash.probed, true)
    assert.equal(r.onboarding.probed, true, 'la delegación de clics del onboarding funciona')
    assert.equal(r.fatal.probed, 'TITULO-PRUEBA')
    assert.equal(r.update.probed, 'MENSAJE-PRUEBA')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

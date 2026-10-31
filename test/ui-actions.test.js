// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-10: la UI no usa manejadores ni scripts inline (la CSP los prohíbe).
// Guardián estático + prueba del despachador en Electron real.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const sectionFiles = fs.readdirSync(path.join(root, 'sections')).map(f => 'sections/' + f)
const RENDERER = ['index.html', 'ui-actions.js', 'html-sanitizer.js', 'common.js', 'navigation.js', 'accounts.js', 'instances.js', 'modrinth.js', 'curseforge.js', 'launcher.js', 'app-init.js', ...sectionFiles]
const EVENTS = 'click|change|input|keydown|error|dragover|dragleave|drop'

function electronBinary() {
  try {
    const dir = path.dirname(require.resolve('electron/package.json'))
    const exe = path.join(dir, 'dist', fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim())
    return fs.existsSync(exe) ? exe : ''
  } catch { return '' }
}

function declaredActions() {
  const src = read('ui-actions.js')
  const block = src.slice(src.indexOf('const UI_ACTIONS = new Set(['), src.indexOf('])', src.indexOf('const UI_ACTIONS')))
  return new Set([...block.matchAll(/'([\w$]+)'/g)].map(m => m[1]))
}

function usedActions() {
  const used = new Set()
  for (const f of RENDERER) {
    const src = read(f)
    for (const m of src.matchAll(new RegExp(`data-(?:${EVENTS})="([\\w$]+)"`, 'g'))) used.add(m[1])
    for (const m of src.matchAll(new RegExp(`dataset\\.(?:${EVENTS})\\s*=\\s*'([\\w$]+)'`, 'g'))) used.add(m[1])
  }
  return used
}

test('KL-10: ningún manejador on*= ni script inline en el renderer', () => {
  for (const f of RENDERER) {
    const src = read(f)
    const handler = src.match(/<[a-z][^<>]*\son[a-z]+\s*=\s*["'\\]/i)
    assert.equal(handler, null, `${f}: manejador inline ${handler && handler[0].slice(0, 80)}`)
    assert.equal(/setAttribute\(\s*['"]on[a-z]+['"]/.test(src), false, `${f}: setAttribute('on...')`)
    if (f.endsWith('.html')) {
      assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(src), false, `${f}: <script> inline`)
    }
    assert.equal(/createElement\(\s*['"]script['"]\s*\)[\s\S]{0,80}\.(textContent|text|innerHTML)\s*=/.test(src), false, `${f}: script inyectado por texto`)
  }
})

test('KL-10: la lista blanca coincide con las acciones usadas y todas son funciones globales', () => {
  const declared = declaredActions()
  const used = usedActions()
  for (const name of ['uiRemoveElement', 'uiRemoveParent', 'uiClickById']) used.add(name)
  const missing = [...used].filter(n => !declared.has(n))
  const unused = [...declared].filter(n => !used.has(n))
  assert.deepEqual(missing, [], 'acciones usadas sin registrar')
  assert.deepEqual(unused, [], 'acciones registradas que ya no se usan')
  const sources = RENDERER.map(read).join('\n')
  for (const name of declared) {
    assert.match(sources, new RegExp(`^(?:async\\s+)?function ${name.replace('$', '\\$')}\\s*\\(`, 'm'), `${name} no es una función global`)
  }
})

test('KL-10: los data-args literales son JSON válido (y los dinámicos usan uiArgs)', () => {
  const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  for (const f of RENDERER) {
    const src = read(f)
    for (const m of src.matchAll(/data-args(?:-[a-z]+)?=(["'])(.*?)\1/g)) {
      const value = m[2]
      // Dinámicos: ' + uiArgs(...) + ' o ${uiArgs(...)} (uiArgs escapa el JSON).
      if (/^' \+ uiArgs\(|^\$\{uiArgs\(/.test(value)) continue
      assert.equal(/ \+ |\$\{/.test(value), false, `${f}: data-args con concatenación sin uiArgs: ${value.slice(0, 80)}`)
      assert.doesNotThrow(() => JSON.parse(unescape(value)), `${f}: data-args no es JSON: ${value.slice(0, 80)}`)
    }
  }
})

test('KL-10: el despachador respeta orden, stopPropagation, tokens y lista blanca; la CSP bloquea on*= inyectado', (t) => {
  const exe = electronBinary()
  if (!exe) return t.skip('binario de Electron no instalado')
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return t.skip('sin display (usar xvfb-run)')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-uiact-test-'))
  try {
    const outFile = path.join(tmp, 'out.json')
    const run = spawnSync(exe, [path.join(__dirname, 'helpers', 'electron-ui-actions-runner.js'), outFile], { timeout: 90_000, encoding: 'utf8' })
    assert.ok(fs.existsSync(outFile), 'sin salida del runner: ' + (run.stderr || run.error || ''))
    const r = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    assert.equal(r.error, undefined, r.error)
    // Burbujeo emulado: primero el botón, luego la card; el listener real también.
    assert.deepEqual(r.inner, [['inner', '#inner'], ['card']])
    assert.equal(r.cardListenerAfterInner, 1)
    // data-stop: la card no recibe ni la acción ni su listener.
    assert.deepEqual(r.stopper, [['stopper']])
    assert.equal(r.cardListenerAfterStop, 1)
    assert.deepEqual(r.onlyStop, [])
    assert.deepEqual(r.input, [['input', 'hola']])
    assert.deepEqual(r.enter, [['enter']], 'data-key filtra la tecla')
    assert.deepEqual(r.byid, [['byid', '#field', 'dato']], 'tokens $id: y $data:')
    assert.equal(r.evilCalled, false, 'una acción fuera de la lista blanca no se ejecuta')
    assert.equal(r.injectedPwn, 0, 'la CSP bloquea onclick/onerror inyectados')
    assert.ok(r.violations.length >= 1, 'el navegador informa la violación de CSP')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

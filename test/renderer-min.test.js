// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// F3.1 renderer mínimos: las dos promesas más repetidas.
// 1) saveSettings con fallo a mitad NO diverge (localStorage solo si main ok).
// 2) dispose+generación cancelan timers/fetch al navegar (sin fantasma).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const ajustesHtml = require('./helpers/section-source').readSectionSource('ajustes')
const navSource = fs.readFileSync(path.join(root, 'navigation.js'), 'utf8')
const instSource = fs.readFileSync(path.join(root, 'instances.js'), 'utf8')

// KL-10: el script de la sección ya no es inline; readSectionSource devuelve
// marcado + sections/ajustes.js, y aquí basta con el texto completo.
function inlineScript(source) {
  return source
}

function extractFunction(script, name) {
  const i = script.indexOf(name)
  assert.ok(i >= 0, name + ' existe')
  const open = script.indexOf('{', i)
  let depth = 0
  for (let j = open; j < script.length; j++) {
    if (script[j] === '{') depth++
    if (script[j] === '}') { depth--; if (depth === 0) return script.slice(i, j + 1) }
  }
  throw new Error('no se pudo extraer ' + name)
}

test('saveSettings: main primero, localStorage solo si ok (no diverge)', () => {
  const body = extractFunction(inlineScript(ajustesHtml), 'async function saveSettings()')
  const iResources = body.indexOf('saveResources')
  const iSetItem = body.indexOf("localStorage.setItem('kindyr-settings'")
  assert.ok(iResources >= 0 && iSetItem >= 0, 'ambas escrituras presentes')
  assert.ok(iResources < iSetItem, 'main (saveResources) va ANTES que localStorage')
  assert.match(body, /no persistido/)
  // Comportamental: ejecuta saveSettings con saveResources en fallo
  const calls = []
  const sandbox = {
    getValidatedSettings: () => ({ ok: true, settings: { maxConcurrentDownloads: 6 } }),
    settings: { maxConcurrentDownloads: 6, discordRPC: true },
    localStorage: { setItem: (k, v) => calls.push(['set', k]), getItem: () => null, removeItem: () => {} },
    window: { kindyrAPI: { settings: { saveResources: async () => ({ ok: false, error: 'boom' }) }, discord: { setEnabled: async () => ({}) } } },
    document: { getElementById: () => null },
    console, setStatus: () => {}, updateDiscordToggleUI: () => {}, t: (s) => s,
    JAVA_MAJORS_UI: []
  }
  sandbox.globalThis = sandbox
  const fnSrc = body + '\n;return saveSettings();'
  vm.createContext(sandbox)
  return vm.runInContext(`(async () => { ${fnSrc} })()`, sandbox).then(() => {
    assert.deepEqual(calls, [], 'con fallo en main NO se escribe localStorage')
  })
})

test('saveSettings: con main ok sí persiste localStorage', () => {
  const body = extractFunction(inlineScript(ajustesHtml), 'async function saveSettings()')
  const calls = []
  const sandbox = {
    getValidatedSettings: () => ({ ok: true, settings: { maxConcurrentDownloads: 6 } }),
    settings: { maxConcurrentDownloads: 6, discordRPC: true },
    localStorage: { setItem: (k, v) => calls.push(['set', k]), getItem: () => null, removeItem: () => {} },
    window: { kindyrAPI: { settings: { saveResources: async () => ({ ok: true }) }, discord: { setEnabled: async () => ({}) } } },
    document: { getElementById: () => null },
    console, setStatus: () => {}, updateDiscordToggleUI: () => {}, t: (s) => s,
    JAVA_MAJORS_UI: []
  }
  sandbox.globalThis = sandbox
  const fnSrc = body + '\n;return saveSettings();'
  vm.createContext(sandbox)
  return vm.runInContext(`(async () => { ${fnSrc} })()`, sandbox).then(() => {
    assert.deepEqual(calls, [['set', 'kindyr-settings']])
  })
})

test('navegar dispone la vista y la generación invalida respuestas viejas', () => {
  assert.match(navSource, /disposeInstanceDetailView/)
  assert.match(instSource, /instanceViewGeneration/)
  assert.match(instSource, /generation !== instanceViewGeneration/)
  assert.match(instSource, /clearTimeout|clearInterval/)
})

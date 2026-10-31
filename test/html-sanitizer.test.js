// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-01: el HTML de proveedores (descripciones y changelogs) es entrada hostil.
// Este test ejecuta el saneador real en Electron (CSP de index.html) contra
// variantes de inyección y verifica que ninguna ejecute código ni deje
// atributos activos, y que el contenido legítimo se conserve.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

function electronBinary() {
  try {
    const dir = path.dirname(require.resolve('electron/package.json'))
    const exe = path.join(dir, 'dist', fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim())
    return fs.existsSync(exe) ? exe : ''
  } catch { return '' }
}

const PWN = 'window.__pwn=1'
const HOSTILE = [
  `<center><img src="x" onerror="${PWN}"></center>`,
  `<font color=red><img src="x" onerror="${PWN}"></font>`,
  `<x-custom><y-custom><img src="x" onerror="${PWN}"></y-custom></x-custom>`,
  `<center><font><marquee><img src="x" onerror="${PWN}"></marquee></font></center>`,
  `<svg><animate onbegin="${PWN}" attributeName="x" dur="1s"></animate></svg>`,
  `<center><svg><animate onbegin="${PWN}" attributeName="x" dur="1s"></animate></svg></center>`,
  `<math><mtext><img src="x" onerror="${PWN}"></mtext></math>`,
  `<noscript><p title="</noscript><img src=x onerror=${PWN}>"></p></noscript>`,
  `<template><img src="x" onerror="${PWN}"></template>`,
  `<table><tr><td><img src="x" onerror="${PWN}"></td></tr></table>`,
  `<table><img src="x" onerror="${PWN}"></table>`,
  `<details open ontoggle="${PWN}"><summary>x</summary></details>`,
  `<p onmouseover="${PWN}" style="position:fixed;inset:0">x</p>`,
  `<div tabindex=1 autofocus onfocus="${PWN}">x</div>`,
  `<img src="x" srcset="x" onerror="${PWN}">`,
  `<iframe srcdoc="<script>parent.${PWN}<\/script>"></iframe>`,
  `<object data="data:text/html,<script>${PWN}<\/script>"></object>`,
  `<form><button formaction="javascript:${PWN}">x</button></form>`,
  `<meta http-equiv="refresh" content="0;url=javascript:${PWN}">`,
  `<style>@import 'x'</style><img src=x onerror=${PWN}>`,
  `<!--<img src=x onerror=${PWN}>--><p>ok</p>`,
  `<scr<script>ipt>${PWN}</scr</script>ipt>`,
  '<div>'.repeat(200) + `<img src="x" onerror="${PWN}">` + '</div>'.repeat(200)
]

test('KL-01: el saneador único reemplaza a las dos copias anteriores', () => {
  const discover = read('sections/descubrir.html') + read('sections/descubrir.js')
  const instances = read('instances.js')
  assert.equal(/function sanitizeRichHtml|function sanitizeChangelogHtml/.test(discover + instances), false)
  assert.match(discover, /sanitizeProviderHtml\(detailData && detailData\.bodyHtml, base\)/)
  assert.match(discover, /box\.replaceChildren\(clean\)/)
  assert.match(instances, /sanitizeProviderHtml\(html, 'https:\/\/modrinth\.com'\)/)
  assert.ok(read('index.html').indexOf('html-sanitizer.js') < read('index.html').indexOf('common.js'))
  assert.ok(JSON.parse(read('package.json')).build.files.includes('html-sanitizer.js'))
})

test('KL-01: ningún payload hostil se ejecuta ni deja atributos activos (Electron real)', (t) => {
  const exe = electronBinary()
  if (!exe) return t.skip('binario de Electron no instalado')
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return t.skip('sin display (usar xvfb-run)')
  const cases = [
    ...HOSTILE.map(html => ({ html })),
    { html: '<h1>Título</h1><p>Hola <strong>mundo</strong> <a href="/mod/x">link</a></p><img src="/i.png" alt="cap"><center>centrado</center>', base: 'https://modrinth.com' },
    { html: '<a href="javascript:alert(1)">a</a><a href=" JaVaScRiPt:alert(1)">b</a><a href="data:text/html,x">c</a><img src="data:image/png;base64,AA"><a href="https://user:pw@evil.example/">d</a>' },
    { html: '   ' }
  ]
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-sanitizer-test-'))
  try {
    const casesFile = path.join(tmp, 'cases.json')
    const outFile = path.join(tmp, 'out.json')
    fs.writeFileSync(casesFile, JSON.stringify(cases))
    const run = spawnSync(exe, [path.join(__dirname, 'helpers', 'electron-sanitizer-runner.js'), casesFile, outFile], { timeout: 90_000, encoding: 'utf8', env: { ...process.env, ELECTRON_ENABLE_LOGGING: '' } })
    assert.ok(fs.existsSync(outFile), 'el runner de Electron no produjo salida: ' + (run.stderr || run.error || ''))
    const results = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    assert.ok(Array.isArray(results), results.error)
    HOSTILE.forEach((html, i) => {
      const r = results[i]
      assert.equal(r.pwn, 0, `payload ejecutado: ${html.slice(0, 80)}`)
      assert.equal(/\son[a-z]+=|<svg|<math|<script|<iframe|<object|<style|<template|<noscript|<form|<button|<meta|javascript:|srcset=|style=|autofocus/i.test(r.html), false, `salida insegura: ${r.html.slice(0, 160)}`)
    })
    const legit = results[HOSTILE.length]
    assert.match(legit.html, /<h1>Título<\/h1>/)
    assert.match(legit.html, /<strong>mundo<\/strong>/)
    assert.match(legit.html, /<a href="https:\/\/modrinth\.com\/mod\/x" target="_blank" rel="noopener noreferrer">link<\/a>/)
    assert.match(legit.html, /<img src="https:\/\/modrinth\.com\/i\.png" alt="cap" loading="lazy" referrerpolicy="no-referrer">/)
    assert.match(legit.html, /<div class="rich-center">centrado<\/div>/)
    const urls = results[HOSTILE.length + 1]
    assert.equal(/href=|<img/.test(urls.html), false, `URLs peligrosas no filtradas: ${urls.html}`)
    assert.equal(results[HOSTILE.length + 2].hasContent, false)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

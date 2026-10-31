// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// F2: trinquete anti-innerHTML. Bloqueante desde día 1 sin bloquear todo:
// baseline por archivo; CI falla si un archivo sube o uno nuevo tiene alguna.
// Permite literales sin interpolación (innerHTML = '' / HTML estático) y la
// única vía setSafeHtml(). Mide outerHTML/insertAdjacentHTML/document.write.
// Uso: node scripts/check-innerhtml.js [--write-baseline]
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const baselineFile = path.join(__dirname, 'check-innerhtml-baseline.json')

const TARGETS = ['ui-actions.js', 'html-sanitizer.js', 'app-init.js', 'common.js', 'navigation.js', 'accounts.js', 'instances.js', 'modrinth.js', 'curseforge.js', 'launcher.js']
const HTML_DIRS = ['sections']

function collectFiles() {
  const out = []
  for (const f of TARGETS) {
    const p = path.join(root, f)
    if (fs.existsSync(p)) out.push(p)
  }
  for (const d of HTML_DIRS) {
    const dir = path.join(root, d)
    if (!fs.existsSync(dir)) continue
    for (const e of fs.readdirSync(dir)) {
      // La lógica de las secciones vive en sections/*.js (KL-10).
      if (e.endsWith('.html') || e.endsWith('.js')) out.push(path.join(dir, e))
    }
  }
  const idx = path.join(root, 'index.html')
  if (fs.existsSync(idx)) out.push(idx)
  for (const f of ['fatal-dialog.html', 'update-confirmation.html', 'splash.html', 'onboarding.html']) {
    const p = path.join(root, f)
    if (fs.existsSync(p)) out.push(p)
  }
  return out
}

function countViolations(file) {
  let src = fs.readFileSync(file, 'utf8')
  // La única vía setSafeHtml() no cuenta como violación: es el punto
  // sanctioned. Se excluye su definición del conteo.
  src = src.replace(/function setSafeHtml\(el, html\)\s*\{[^}]*\}/, 'function setSafeHtml(){}')
  const lines = src.split('\n')
  let n = 0
  const risky = /(\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\()/
  const safeLine = /(escapeHtml|setSafeHtml)/
  // Literales estáticos sin interpolación ni concatenación externa permitidos
  const staticLiteral = /^\s*(el|list|results|container|view|targetView|modal|box|wrap|row|div|btn|button|updateBtn|mainEl|listEl|head|table|select|grid|preview|actionsEl|menu|pfp|icon|projectIcon|localToggle|lt|incompatBtn|confirm|toast)\.(innerHTML|outerHTML)\s*=\s*('''|"""|''|"")\s*;?\s*$/
  lines.forEach((line) => {
    if (!risky.test(line)) return
    if (staticLiteral.test(line)) return
    if (/innerHTML\s*=\s*''\s*;/.test(line)) return
    if (safeLine.test(line)) {
      // Misma línea saneada: solo acepta si TODO lo interpolado va escapado.
      // Heurística barata: si hay '+' con identificador fuera de escapeHtml(),
      // cuenta como violación para revisión manual.
      const plusParts = line.split('+')
      if (plusParts.length > 1) {
        const unsanitized = plusParts.some(p => /[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*|\[[^\]]+\])/.test(p) && !/(escapeHtml|setSafeHtml|fa-|fa-solid|fa-regular|fa-brands|<i |<\/i>|<div|<span|<button|<img|<strong)/.test(p))
        if (unsanitized) { n++; return }
      }
      return
    }
    n++
  })
  return n
}

const files = collectFiles()
const counts = {}
for (const f of files) {
  counts[path.relative(root, f).replace(/\\/g, '/')] = countViolations(f)
}

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(baselineFile, JSON.stringify(counts, null, 2))
  console.log('Baseline escrita:', baselineFile, JSON.stringify(counts))
  process.exit(0)
}

let baseline = {}
try { baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8')) } catch {
  console.error('Sin baseline. Generala con: node scripts/check-innerhtml.js --write-baseline')
  process.exit(1)
}

let failed = false
for (const [rel, n] of Object.entries(counts)) {
  const base = baseline[rel]
  if (base === undefined) {
    if (n > 0) { console.error(`NUEVO ${rel} con ${n} usos riesgosos`); failed = true }
    continue
  }
  if (n > base) { console.error(`${rel}: subió ${base} → ${n}`); failed = true }
  else console.log(`${rel}: ${n} (base ${base}) OK`)
}
for (const rel of Object.keys(baseline)) {
  if (!(rel in counts)) console.log(`${rel}: eliminado, base era ${baseline[rel]}`)
}
if (failed) {
  console.error('Trinquete innerHTML: hay subidas. Usa setSafeHtml() o baja el conteo y actualiza baseline solo al arreglar.')
  process.exit(1)
}
console.log('Trinquete innerHTML OK')

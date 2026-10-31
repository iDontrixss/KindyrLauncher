// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-10: CSP estricta para las ventanas secundarias (splash, onboarding,
// diálogo fatal y confirmación de actualización). Sin 'unsafe-inline' en
// scripts: su único <script> inline se autoriza por hash sha256.
// Uso: node scripts/csp-secondary.js           -> verifica (falla si desalineado)
//      node scripts/csp-secondary.js --write   -> recalcula y escribe los hashes
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const PAGES = ['splash.html', 'onboarding.html', 'fatal-dialog.html', 'update-confirmation.html']
const MARKER = 'data-kindyr-csp="secondary"'

function inlineScripts(html) {
  // El parser HTML normaliza CRLF a LF antes de hashear: se hace lo mismo.
  const text = html.replace(/\r\n?/g, '\n')
  return [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
}

function buildPolicy(html) {
  const hashes = inlineScripts(html).map(code => `'sha256-${crypto.createHash('sha256').update(code, 'utf8').digest('base64')}'`)
  return [
    "default-src 'none'",
    `script-src ${hashes.join(' ') || "'none'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

function expectedMeta(html) {
  return `<meta http-equiv="Content-Security-Policy" ${MARKER} content="${buildPolicy(html)}">`
}

function currentMeta(html) {
  const m = html.match(new RegExp(`<meta http-equiv="Content-Security-Policy" ${MARKER} content="[^"]*">`))
  return m ? m[0] : ''
}

function writePage(file) {
  const full = path.join(root, file)
  let html = fs.readFileSync(full, 'utf8')
  const eol = html.includes('\r\n') ? '\r\n' : '\n'
  const meta = expectedMeta(html)
  const existing = currentMeta(html)
  if (existing) html = html.replace(existing, meta)
  else html = html.replace(/(<meta charset="UTF-8">)/i, `$1${eol}  ${meta}`)
  fs.writeFileSync(full, html)
}

function checkPages() {
  const problems = []
  for (const file of PAGES) {
    const html = fs.readFileSync(path.join(root, file), 'utf8')
    if (currentMeta(html) !== expectedMeta(html)) problems.push(file)
    if (/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<script>[\s\S]*?<\/script>/g, ''))) problems.push(file + ' (manejador inline)')
  }
  return problems
}

if (require.main === module) {
  if (process.argv.includes('--write')) PAGES.forEach(writePage)
  const problems = checkPages()
  if (problems.length) {
    console.error('CSP de ventanas secundarias desalineada: ' + problems.join(', ') + '\nEjecutá: node scripts/csp-secondary.js --write')
    process.exit(1)
  }
  console.log('CSP de ventanas secundarias OK')
}

module.exports = { PAGES, buildPolicy, checkPages, inlineScripts }

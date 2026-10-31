// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// Limpia exports reales de launchers antes de subirlos como fixtures:
// quita rutas C:\Users\<nombre>, nombres de cuenta, tokens e IDs de máquina.
// Uso: node tools/clean-fixture.js <carpeta-export> <launcher> <version>
const fs = require('fs')
const path = require('path')

const [src, launcher, version] = process.argv.slice(2)
if (!src || !launcher || !version) {
  console.error('Uso: node tools/clean-fixture.js <carpeta> <launcher> <version>')
  process.exit(1)
}
const redact = (text) => String(text)
  .replace(/C:\\Users\\[^"\\\/]+/gi, 'C:\\Users\\REDACTED')
  .replace(/\/home\/[^"\\\/]+/g, '/home/REDACTED')
  .replace(/"accessToken"\s*:\s*"[^"]*"/g, '"accessToken":"REDACTED"')
  .replace(/"refreshToken"\s*:\s*"[^"]*"/g, '"refreshToken":"REDACTED"')
  .replace(/"clientToken"\s*:\s*"[^"]*"/g, '"clientToken":"REDACTED"')

let count = 0
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { walk(full); continue }
    if (!/\.(json|cfg|txt|toml)$/i.test(e.name)) continue
    const orig = fs.readFileSync(full, 'utf8')
    const clean = redact(orig)
    if (clean !== orig) { fs.writeFileSync(full, clean); count++ }
  }
}
walk(src)
fs.writeFileSync(path.join(src, 'manifest.json'), JSON.stringify({ launcher, version, _synthetic: false, cleanedAt: new Date().toISOString() }, null, 2))
console.log(`Limpios ${count} archivos + manifest ${launcher} ${version}`)

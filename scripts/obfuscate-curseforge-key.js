#!/usr/bin/env node
// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Genera curseforge-embedded.json obfuscado desde CURSEFORGE_API_KEY env
// Uso: CURSEFORGE_API_KEY="$2a$10$..." node scripts/obfuscate-curseforge-key.js
// Resultado: curseforge-embedded.json {k:"base64..."} gitignored, nunca plaintext en repo
const fs = require('fs')
const path = require('path')

const key = String(process.env.CURSEFORGE_API_KEY || '').trim()
if (!key) {
  console.error('Falta CURSEFORGE_API_KEY env. Ej: CURSEFORGE_API_KEY="tu_key" node scripts/obfuscate-curseforge-key.js')
  process.exit(1)
}
// --- Anti-RE: xorKey fragmentado (no literal greppeable) + ROT + reverse ---
function deriveXorKey() {
  // 'Kindyr' + 'Launcher' + '-' + 'CurseForge' + '-' + '2026'
  const p1 = Buffer.from('S2luZHly', 'base64').toString() // Kindyr
  const p2 = Buffer.from('TGF1bmNoZXI=', 'base64').toString() // Launcher
  const p3 = String.fromCharCode(45) // '-'
  const p4 = Buffer.from('Q3Vyc2VGb3JnZQ==', 'base64').toString() // CurseForge
  const p5 = Buffer.from('MjAyNg==', 'base64').toString() // 2026
  return p1 + p2 + p3 + p4 + p3 + p5
}
const xorKey = deriveXorKey()
const ROT = 37
const buf = Buffer.from(key, 'utf8')
const xored = Buffer.alloc(buf.length)
for (let i = 0; i < buf.length; i++) xored[i] = buf[i] ^ xorKey.charCodeAt(i % xorKey.length)
xored.reverse()
for (let i = 0; i < xored.length; i++) xored[i] = (xored[i] + ROT) & 0xFF
const b64 = xored.toString('base64')
const out = path.join(__dirname, '..', 'curseforge-embedded.json')
fs.writeFileSync(out, JSON.stringify({ k: b64 }, null, 2))
console.log(`OK -> ${out} (${b64.length} chars) - NO commitear plaintext, este archivo ya está gitignored para código libre.`)

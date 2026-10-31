// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const { createCurseForgeStore } = require('../../curseforge-store')
const { getKindyrDataRoot } = require('../paths')

function getCurseForgeKeyFile() {
  return path.join(getKindyrDataRoot(), 'curseforge.key')
}
let curseForgeStore = null
function getCurseForgeStore() {
  if (!curseForgeStore) {
    curseForgeStore = createCurseForgeStore({ fs, path, safeStorage, filePath: getCurseForgeKeyFile() })
  }
  return curseForgeStore
}
// Key embebida obfuscada para código libre: todos usan la API sin config, pero key nunca plaintext en git
// Generada por: CURSEFORGE_API_KEY="..." node scripts/obfuscate-curseforge-key.js -> curseforge-embedded.json {k:"..."} (gitignored)
// En CI: secret CURSEFORGE_API_KEY genera el json antes de build; el ASAR lleva solo base64 XOR+ROT+reverse, no plaintext greppeable
// Parche seguridad: descifrado LAZY - solo cuando se entra explícitamente a descubrir/curseforge (search/status)
// Anti-RE: xorKey fragmentado (no literal), ROT 37, reverse, buffers zeroizados. Nunca loggear key/k/xorKey/plaintext
function deriveEmbeddedXorKey() {
  const p1 = Buffer.from('S2luZHly', 'base64').toString()
  const p2 = Buffer.from('TGF1bmNoZXI=', 'base64').toString()
  const p3 = String.fromCharCode(45)
  const p4 = Buffer.from('Q3Vyc2VGb3JnZQ==', 'base64').toString()
  const p5 = Buffer.from('MjAyNg==', 'base64').toString()
  return p1 + p2 + p3 + p4 + p3 + p5
}
function getEmbeddedCurseForgeKey() {
  // Nota portabilidad: este descifrado es DETERMINÍSTICO y portátil. Funciona en cualquier PC que instale el build,
  // porque curseforge-embedded.json está empaquetado DENTRO del ASAR (package.json:files) y la derivación no depende de máquina.
  // No es "solo local dev" — es distribuido. El fallback safeStorage es per-máquina y también portátil.
  try {
    // Anti-RE: evitar que require cache quede con plaintext accesible largo tiempo — leer fresco
    let embedded
    try {
      const resolved = require.resolve('./curseforge-embedded.json')
      delete require.cache[resolved]
    } catch {}
    embedded = require('../../curseforge-embedded.json')
    if (embedded && typeof embedded.k === 'string' && embedded.k) {
      const xorKey = deriveEmbeddedXorKey()
      const ROT = 37
      const buf = Buffer.from(embedded.k, 'base64')
      for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] - ROT + 256) & 0xFF
      buf.reverse()
      const out = Buffer.alloc(buf.length)
      for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ xorKey.charCodeAt(i % xorKey.length)
      const decoded = out.toString('utf8').trim()
      try { buf.fill(0); out.fill(0) } catch {}
      // No dejar xorKey en string pool más de lo necesario — no loggear
      return decoded
    }
  } catch {}
  return ''
}

function getCurseForgeApiKey() {
  // 0) embebida obfuscada LAZY (solo se descifra si se pide explícitamente)
  const embedded = getEmbeddedCurseForgeKey()
  if (embedded) return embedded
  // 1) env var dev / inyección CI – se auto-cifra al disco y se borra de memoria
  const envKey = String(process.env.CURSEFORGE_API_KEY || '').trim()
  if (envKey) {
    try { getCurseForgeStore().save(envKey) } catch {}
    try { delete process.env.CURSEFORGE_API_KEY } catch {}
    return envKey
  }
  // 2) store cifrado por usuario (fallback UI CurseForge)
  try { return getCurseForgeStore().load() } catch { return '' }
}

module.exports = {
  getCurseForgeApiKey,
  getCurseForgeStore
}

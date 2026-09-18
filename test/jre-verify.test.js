// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// El JRE de Adoptium se verifica (sha256 + tamaño de la API de metadatos,
// misma plataforma/arch) antes de extraer, y la extracción tar filtra
// absolutos, `..` y symlinks, con techo anti gzip-bomb.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')

test('existen los helpers de verificación del JRE', () => {
  assert.match(mainSource, /async function getAdoptiumJreAsset\(javaMajor\)/)
  assert.match(mainSource, /function sha256OfFile\(filePath\)/)
  assert.match(mainSource, /function isSafeTarEntry\(entryPath, entry\)/)
  assert.match(mainSource, /MAX_JRE_EXTRACTED_BYTES/)
})

test('downloadManagedJava es fail-closed sin checksum', () => {
  const start = mainSource.indexOf('async function downloadManagedJava(')
  assert.ok(start >= 0)
  const end = mainSource.indexOf('\nasync function ensureManagedJava(', start)
  const body = mainSource.slice(start, end >= 0 ? end : mainSource.length)
  assert.match(body, /getAdoptiumJreAsset\(javaMajor\)/)
  assert.match(body, /No se pudo verificar el JRE de Adoptium/)
  assert.match(body, /no coincide con el sha256 publicado por Adoptium/)
  assert.match(body, /no coincide en tamaño con el publicado por Adoptium/)
  assert.match(body, /Archivo eliminado/)
})

test('la extracción tar está endurecida y acotada', () => {
  assert.match(mainSource, /preservePaths: false/)
  assert.match(mainSource, /filter: \(entryPath, entry\) => isSafeTarEntry\(entryPath, entry\)/)
  assert.match(mainSource, /SymbolicLink' \|\| type === 'Link'/)
  assert.match(mainSource, /extractedBytes > MAX_JRE_EXTRACTED_BYTES/)
})

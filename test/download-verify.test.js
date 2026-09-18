// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Single-file downloads (mods individuales Modrinth/CurseForge) deben pasar
// por descarga verificada fail-closed: sin hash no se instala, con mismatch
// se elimina el archivo y se lanza error.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} debe existir en main.js`)
  const next = source.indexOf('\nfunction ', start + 1)
  const nextAsync = source.indexOf('\nasync function ', start + 1)
  let end = source.length
  if (next >= 0) end = Math.min(end, next)
  if (nextAsync >= 0) end = Math.min(end, nextAsync)
  return source.slice(start, end)
}

test('existe el helper de descarga verificada fail-closed', () => {
  assert.match(mainSource, /async function downloadSingleFileVerified\(url, destination, hashes/)
  assert.match(mainSource, /Instalaci[oó]n bloqueada por seguridad/)
  assert.match(mainSource, /el hash del archivo descargado no coincide/)
  assert.match(mainSource, /fs\.promises\.rm\(destination, \{ force: true \}\)/)
})

test('installModrinthProject verifica hash en ambas ramas single-file', () => {
  const body = functionBody(mainSource, 'installModrinthProject')
  assert.equal(body.includes('await downloadToFile(file.url, target)'), false)
  const uses = body.match(/downloadSingleFileVerified\(/g) || []
  assert.ok(uses.length >= 2, `installModrinthProject debe usar descarga verificada en downloads e instance (encontrados: ${uses.length})`)
})

test('installCurseForgeProject verifica hash en todas las ramas single-file', () => {
  const body = functionBody(mainSource, 'installCurseForgeProject')
  assert.equal(body.includes('await downloadToFile(file.downloadUrl, target)'), false)
  const uses = body.match(/downloadSingleFileVerified\(/g) || []
  assert.ok(uses.length >= 3, `installCurseForgeProject debe usar descarga verificada en downloads, modpack-zip e instance (encontrados: ${uses.length})`)
})

test('los zips de modpack también se descargan verificados', () => {
  const mrpack = functionBody(mainSource, 'installMrpackInstance')
  assert.ok(mrpack.includes('downloadSingleFileVerified(file.url, mrpackPath'), 'installMrpackInstance debe verificar el .mrpack')
  const cf = functionBody(mainSource, 'installCurseForgeModpackInstance')
  assert.ok(cf.includes('downloadSingleFileVerified(file.downloadUrl, zipPath'), 'installCurseForgeModpackInstance debe verificar el .zip')
})

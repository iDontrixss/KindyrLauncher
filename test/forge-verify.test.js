// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// El instalador oficial de Forge jamás debe ejecutarse sin verificación
// previa: sha1 del repo Maven cuando existe sidecar, más validación
// estructural obligatoria (ZIP con version.json o install_profile.json
// parseable). Incluye la reutilización de caché.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')

test('existen los helpers de verificación pre-ejecución', () => {
  assert.match(mainSource, /async function verifyForgeInstallerFile\(installerPath, installerUrl\)/)
  assert.match(mainSource, /async function inspectForgeInstaller\(installerPath\)/)
  assert.match(mainSource, /async function fetchMavenSha1Hex\(artifactUrl\)/)
  assert.match(mainSource, /function sha1OfFile\(filePath\)/)
})

test('la verificación es fail-closed y elimina el archivo', () => {
  const start = mainSource.indexOf('async function verifyForgeInstallerFile(')
  const body = mainSource.slice(start, mainSource.indexOf('\nfunction ', start + 1) >= 0 ? mainSource.indexOf('\nfunction ', start + 1) : mainSource.length)
  assert.match(body, /no coincide con el sha1 publicado/)
  assert.match(body, /no se ejecutó nada/)
  const rms = body.match(/fs\.promises\.rm\(installerPath, \{ force: true \}\)/g) || []
  assert.ok(rms.length >= 3, `toda ruta de fallo debe borrar el instalador (encontrados: ${rms.length})`)
})

test('installForgeWithOfficialInstaller verifica antes de spawn y valida la caché', () => {
  assert.match(mainSource, /verifyForgeInstallerFile\(candidatePath, installerUrl\)/)
  assert.match(mainSource, /NUNCA a ciegas: se valida estructura antes de ejecutar/)
  // La caché ya no se acepta solo por tamaño: se inspecciona estructura
  assert.match(mainSource, /inspectForgeInstaller\(candidatePath\)/)
  // spawn sigue existiendo pero solo después de la verificación
  const verifyPos = mainSource.indexOf('verifyForgeInstallerFile(candidatePath, installerUrl)')
  const spawnPos = mainSource.indexOf("'-jar', installerPath, '--installClient'")
  assert.ok(verifyPos >= 0 && spawnPos >= 0 && verifyPos < spawnPos, 'la verificación debe preceder al spawn')
})

test('no queda detección legacy duplicada sin validar', () => {
  assert.equal(mainSource.includes('isLegacyInstaller'), false)
  assert.match(mainSource, /if \(installerKind === 'legacy'\)/)
})

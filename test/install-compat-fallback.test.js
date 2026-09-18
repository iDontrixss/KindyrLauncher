// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Regresión: instalar contenido compatible no debe fallar por el loader de la
// instancia (ej. Fresh Animations resourcepack en Fabric 26.2), los packs que
// publican todo como beta deben resolverse, y el modal de aviso solo aparece
// en desfasaje real de versión de juego.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const modrinthSource = fs.readFileSync(path.join(root, 'modrinth.js'), 'utf8')

function functionBody(source, file, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} debe existir en ${file}`)
  const next = source.indexOf('\nfunction ', start + 1)
  const nextAsync = source.indexOf('\nasync function ', start + 1)
  let end = source.length
  if (next >= 0) end = Math.min(end, next)
  if (nextAsync >= 0) end = Math.min(end, nextAsync)
  return source.slice(start, end)
}

test('el loader se normaliza por tipo de proyecto (RP/shader/datapack -> minecraft)', () => {
  const body = functionBody(mainSource, 'main.js', 'normalizeVersionLoaderForKind')
  assert.match(body, /resourcepack/)
  assert.match(body, /shader/)
  assert.match(body, /datapack/)
  assert.match(body, /minecraft/)
  assert.match(body, /plugin/)
  assert.match(body, /any/)
})

test('installModrinthProject filtra versiones con el loader normalizado', () => {
  const body = functionBody(mainSource, 'main.js', 'installModrinthProject')
  assert.ok(body.includes('normalizeVersionLoaderForKind'), 'debe normalizar el loader antes de buscar versiones')
  assert.ok(body.includes('loader: versionLoader'), 'la búsqueda debe usar el loader normalizado')
})

test('installLatestRelease reintenta sin filtro de canal si no hay release (packs todo-beta)', () => {
  const body = functionBody(mainSource, 'main.js', 'installLatestReleaseProject')
  assert.ok(body.includes("versionType: 'release'"), 'primero intenta release estable')
  assert.match(body, /no hay versiones compatibles/i, 'detecta el error de sin-compatibles para reintentar')
  assert.ok(body.includes('installModrinthProject(baseArgs)'), 'reintenta con cualquier canal (sin versionType)')
})

test('el fallback instala directo si hay match de versión de juego; el modal es solo para desfasaje real', () => {
  const body = functionBody(modrinthSource, 'modrinth.js', 'installFallbackNewest')
  const matchIdx = body.indexOf('game_versions')
  const modalIdx = body.indexOf('showCompatWarnModal')
  assert.ok(matchIdx >= 0, 'debe buscar match por game_versions')
  assert.ok(modalIdx >= 0, 'debe mostrar el modal de aviso')
  assert.ok(matchIdx < modalIdx, 'el match silencioso va ANTES que el modal (el modal es solo último recurso)')
})

test('la compatibilidad del modal se calcula con todas las versiones, no una muestra', () => {
  const body = functionBody(modrinthSource, 'modrinth.js', 'renderCompatInstances')
  assert.equal(body.includes('slice(0,20)'), false, 'muestrear las primeras 20 podía marcar incompatible algo compatible')
  assert.ok(body.includes('supportedVersions'), 'debe agregar game versions al set de soporte')
})

test('CurseForge no filtra por modloader en packs sin loader', () => {
  const body = functionBody(mainSource, 'main.js', 'installCurseForgeProject')
  assert.ok(body.includes('effectiveKind'), 'debe distinguir el tipo antes de filtrar por loader')
  assert.match(body, /loader: \(effectiveKind === 'mod'/)
})

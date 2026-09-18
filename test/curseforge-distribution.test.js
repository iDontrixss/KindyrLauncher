// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Regresión CurseForge: cuando el autor desactiva la distribución por API
// (allowModDistribution=false) los archivos vienen sin downloadUrl. El
// launcher debe elegir el más nuevo ENTRE los descargables (no fallar en
// vano) y, si no hay ninguno, explicar la causa real con salida accionable
// en vez del críptico "archivo sin downloadUrl".
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const modrinthSource = fs.readFileSync(path.join(root, 'modrinth.js'), 'utf8')
const commonSource = fs.readFileSync(path.join(root, 'common.js'), 'utf8')
const discoverSource = fs.readFileSync(path.join(root, 'sections', 'descubrir.html'), 'utf8')

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

test('pick elige el más nuevo con URL en vez de fallar si el primero no tiene', () => {
  const body = functionBody(mainSource, 'main.js', 'pickCurseForgePrimaryFile')
  assert.ok(body.includes('filter'), 'debe filtrar archivos descargables antes de elegir')
  assert.ok(body.includes('downloadUrl'), 'la selección depende de downloadUrl')
  assert.equal(body.includes('archivo sin downloadUrl'), false, 'el error críptico no debe existir más')
})

test('sin ninguna URL el error explica la causa (distribución desactivada)', () => {
  const body = functionBody(mainSource, 'main.js', 'pickCurseForgePrimaryFile')
  assert.match(body, /no permite descargas por API/)
})

test('el mensaje accionable existe en ES y EN', () => {
  assert.match(commonSource, /'curseforge\.noDistribution': 'Este proyecto no permite descargas automáticas/)
  assert.match(commonSource, /'curseforge\.noDistribution': 'This project disallows automatic downloads/)
  assert.match(commonSource, /'curseforge\.webOnly': 'Solo web'/)
  assert.match(commonSource, /'curseforge\.webOnly': 'Web only'/)
  assert.match(commonSource, /'curseforge\.openSite': 'Abrir en CurseForge'/)
})

test('la ficha CF expone webOnly para pre-marcar en UI', () => {
  const body = functionBody(mainSource, 'main.js', 'normalizeCurseForgeFileForUI')
  assert.ok(body.includes('webOnly'), 'debe exponer webOnly')
})

test('los flujos de instalación muestran el mensaje amable, no el técnico', () => {
  const friendly = functionBody(modrinthSource, 'modrinth.js', 'friendlyInstallError')
  assert.ok(friendly.includes('curseforge.noDistribution'), 'mapea al i18n accionable')
  assert.ok(modrinthSource.includes('friendlyInstallError(result.error)'), 'los installs lo usan')
})

test('la card de error de Descubrir ofrece abrir en CurseForge', () => {
  assert.ok(discoverSource.includes('discover-install-card-action'), 'la card acepta botón de acción')
  assert.ok(discoverSource.includes("t('curseforge.openSite')"), 'usa el label i18n')
  assert.ok(discoverSource.includes("t('curseforge.noDistribution')"), 'muestra el mensaje accionable')
})

test('el search CF expone allowModDistribution hasta la card', () => {
  const body = functionBody(mainSource, 'main.js', 'normalizeCurseForgeHit')
  assert.ok(body.includes('allowModDistribution'), 'el hit normalizado lleva el flag')
})

test('la card marca Solo web y no deja intentar en vano', () => {
  assert.ok(discoverSource.includes('allowModDistribution === false'), 'detecta proyectos solo-web')
  assert.ok(discoverSource.includes("t('curseforge.webOnly')"), 'badge/tag Solo web')
  assert.ok(discoverSource.includes('project.allowModDistribution === false'), 'pre-chequeo antes de instalar')
  assert.ok(discoverSource.includes("t('twin.findButton')"), 'la card Solo web ofrece buscar en Modrinth')
})

test('el modal de instalación muestra banner Solo web sin chequear instancias', () => {
  assert.ok(modrinthSource.includes('compat-webonly'), 'banner dedicado en la lista de compatibilidad')
  assert.ok(modrinthSource.includes("t('curseforge.openSite')"), 'el banner abre el sitio')
})

test('el rescate exige slug exacto y descarta modpack/plugin', () => {
  const body = functionBody(mainSource, 'main.js', 'getModrinthTwinProject')
  assert.ok(body.includes('no-slug'), 'sin slug no hay rescate')
  assert.ok(body.includes('modpack') && body.includes('plugin'), 'modpacks y plugins fuera de alcance')
  assert.ok(body.includes('modrinthTwinCache'), 'cachea por sesión')
})

test('si el slug difiere, busca por título con el autor como ancla', () => {
  const body = functionBody(mainSource, 'main.js', 'findModrinthTwinUncached')
  assert.ok(body.includes('/search?query='), 'fallback por búsqueda cuando el slug no matchea')
  assert.ok(body.includes('verifyTwinCandidate'), 'cada candidato pasa la misma verificación')
  const sim = functionBody(mainSource, 'main.js', 'titlesSimilar')
  assert.ok(sim.includes('normalizeTwinText'), 'compara normalizado')
  assert.ok(sim.includes('shared'), 'exige solape de tokens además de contenencia')
})

test('el rescate verifica tipo, título y autor del team (nada silencioso)', () => {
  const body = functionBody(mainSource, 'main.js', 'verifyTwinCandidate')
  assert.ok(body.includes('datapack'), 'datapacks comparan por categoría, no por tipo')
  assert.ok(body.includes('titlesSimilar'), 'títulos ligeramente distintos también valen')
  assert.ok(body.includes('/team/'), 'verifica el autor contra el team')
  assert.ok(body.includes("reason: 'author'"), 'rechaza si el autor no coincide')
  assert.ok(body.includes("reason: 'kind'"), 'rechaza si el tipo no coincide')
  assert.ok(body.includes("reason: 'title'"), 'rechaza si el título no coincide')
})

test('el rescate está expuesto y cableado en la UI', () => {
  assert.match(mainSource, /ipcMain\.handle\('curseforge-find-twin'/)
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
  assert.ok(preload.includes("invoke('curseforge-find-twin', payload)"), 'preload expone findTwin')
  assert.ok(modrinthSource.includes('offerModrinthTwinInstall'), 'flujo de oferta con confirmación')
  assert.ok(modrinthSource.includes('twin-modal'), 'modal dedicado (no sustitución silenciosa)')
  assert.ok(modrinthSource.includes("t('twin.confirm')"), 'confirmación explícita')
})

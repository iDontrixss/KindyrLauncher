// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
const discoverSource = fs.readFileSync(path.join(__dirname, '..', 'sections', 'descubrir.html'), 'utf8')
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8')
const commonSource = fs.readFileSync(path.join(__dirname, '..', 'common.js'), 'utf8')
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')

// Réplica de normalizeDiscoverCategory (debe coincidir con main.js)
function normalizeDiscoverCategory(value) {
  const clean = String(value || '').toLowerCase().trim()
  if (!clean || !/^[a-z0-9][a-z0-9-]*$/.test(clean) || clean.length > 40) return ''
  return clean
}

test('categorías Modrinth: normalización de slugs', () => {
  assert.equal(normalizeDiscoverCategory('adventure'), 'adventure')
  assert.equal(normalizeDiscoverCategory('Game-Mechanics'), 'game-mechanics')
  assert.equal(normalizeDiscoverCategory('  tech  '), 'tech')
  assert.equal(normalizeDiscoverCategory(''), '')
  assert.equal(normalizeDiscoverCategory(undefined), '')
  assert.equal(normalizeDiscoverCategory('foo bar'), '')
  assert.equal(normalizeDiscoverCategory('a!b'), '')
  assert.equal(normalizeDiscoverCategory('-abc'), '')
  assert.equal(normalizeDiscoverCategory('x'.repeat(41)), '')
})

test('categorías Modrinth: main.js cablea category en facets y new_filters', () => {
  assert.match(mainSource, /function normalizeDiscoverCategory\(value\)/)
  assert.match(mainSource, /normalizeDiscoverCategory\(payload\.category\)/)
  assert.match(mainSource, /facets\.push\(\['categories:' \+ category\]\)/)
  assert.match(mainSource, /parts\.push\(`categories = \$\{category\}`\)/)
})

test('categorías CurseForge: main.js acepta uno o varios categoryIds (fan-out)', () => {
  assert.match(mainSource, /function normalizeCurseForgeCategoryIds\(value\)/)
  assert.match(mainSource, /normalizeCurseForgeCategoryIds\(payload\.categoryIds \?\? payload\.categoryId\)/)
  assert.match(mainSource, /url\.searchParams\.set\('categoryId', String\(categoryId\)\)/)
})

test('categorías CurseForge: IPC + preload exponen la lista oficial', () => {
  assert.match(mainSource, /ipcMain\.handle\('curseforge-categories'/)
  assert.match(mainSource, /\/categories\?gameId=/)
  assert.match(preloadSource, /categories: \(\) => ipcRenderer\.invoke\('curseforge-categories'\)/)
})

test('CurseForge: datapack usa la clase oficial Data Packs (6945), no Customization (4546)', () => {
  assert.match(mainSource, /datapack: 6945/)
  assert.equal(mainSource.includes('datapack: 4546'), false)
  assert.match(mainSource, /6945: 'datapack'/)
})

test('Descubrir: panel con secciones y chips de loaders/categorías', () => {
  assert.match(discoverSource, /id="discover-loaders"/)
  assert.match(discoverSource, /id="discover-categories"/)
  assert.match(discoverSource, /id="discover-category-group"/)
  assert.match(discoverSource, /selectDiscoverLoader/)
  assert.match(discoverSource, /selectDiscoverCategory/)
  assert.match(discoverSource, /loadDiscoverCategories/)
  // El select legacy se conserva oculto para no romper la lógica existente
  assert.match(discoverSource, /id="discover-loader"/)
  // Payloads llevan los filtros nuevos (multi-id en Todo, id único por tipo)
  assert.match(discoverSource, /categoryIds: discoverCategoryIds/)
  assert.match(discoverSource, /category: discoverCategory/)
  assert.match(discoverSource, /cfCategoryIdsByName/)
})

test('Descubrir: CurseForge muestra UN chip por nombre en Todo (fan-out multi-clase)', () => {
  assert.match(discoverSource, /CURSEFORGE_SEARCHABLE_CLASS_IDS/)
  assert.match(discoverSource, /discoverCategoryName/)
  assert.match(discoverSource, /byName\[name\]\.ids\.length >= 2/)
  assert.match(mainSource, /function mergeCurseForgeCategoryPages\(pages, sortField, limit\)/)
  assert.match(mainSource, /function normalizeCurseForgeCategoryIds\(value\)/)
})

test('Descubrir: chips STYLE_GUIDE-compliant (radius 0, ink, hard shadow, active accent)', () => {
  assert.match(stylesSource, /\.discover-chips \.type-chip\.discover-chip \{/)
  assert.match(stylesSource, /border-radius: 0;/)
  assert.match(stylesSource, /box-shadow: 2px 2px 0 var\(--kindyr-ink\);/)
  assert.match(stylesSource, /\.discover-chips \.type-chip\.discover-chip\.active \{/)
  assert.match(stylesSource, /background: var\(--kindyr-accent\);/)
  const chipBlock = stylesSource.slice(
    stylesSource.indexOf('.discover-chips .type-chip.discover-chip {'),
    stylesSource.indexOf('.discover-chips-scroll')
  )
  assert.equal(chipBlock.includes('999px'), false)
})

test('Descubrir: i18n ES/EN para las secciones nuevas', () => {
  assert.match(commonSource, /'discover\.contentType': 'Tipo de contenido'/)
  assert.match(commonSource, /'discover\.modLoaders': 'Cargadores de mods'/)
  assert.match(commonSource, /'discover\.categories': 'Categorías'/)
  assert.match(commonSource, /'discover\.contentType': 'Content type'/)
  assert.match(commonSource, /'discover\.modLoaders': 'Mod loaders'/)
  assert.match(commonSource, /'discover\.categories': 'Categories'/)
})

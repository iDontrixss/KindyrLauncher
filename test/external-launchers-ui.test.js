// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Fase 3: UI "Importar desde otro launcher" cableada según STYLE_GUIDE.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const instancesSource = fs.readFileSync(path.join(root, 'instances.js'), 'utf8')
const preloadSource = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8')
const commonSource = fs.readFileSync(path.join(root, 'common.js'), 'utf8')

test('el paso external vive junto a la importación por archivo', () => {
  assert.ok(html.includes('id="create-step-external"'), 'paso external en el modal')
  assert.ok(html.includes('id="external-launcher-view"'), 'contenedor dinámico')
  assert.ok(html.includes('onclick="openExternalFromImportMenu()"'), 'ruta hacia el paso external')
  assert.ok(html.includes('data-i18n="create.choice.importExternal"'), 'i18n del botón')
  // "Importar modpack" es modal propio SOLO con Subir archivo / Desde otro launcher.
  assert.ok(html.includes('id="import-modpack-modal"'), 'modal propio de importar')
  const importModal = html.slice(html.indexOf('id="import-modpack-modal"'), html.indexOf('id="import-modpack-modal"') + 2000)
  assert.ok(importModal.includes('data-i18n="instances.import"'), 'título Importar, no Crear')
  assert.ok(importModal.includes('onclick="createImportMrpack()"'), 'vía de archivo intacta')
  assert.ok(importModal.includes('onclick="openExternalFromImportMenu()"'), 'vía externa')
  assert.ok(!html.includes('id="create-import-suboptions"'), 'sin subopciones dentro de Crear (sin fuga de estado)')
  assert.ok(!html.includes('toggleImportOptions'), 'sin toggle con estado global')
  // Agregar instancia: solo Personalizado + Descubrir.
  const choice = html.slice(html.indexOf('id="create-step-choice"'), html.indexOf('id="create-step-custom"'))
  assert.ok(choice.includes('data-i18n="create.choice.custom"'), 'Personalizado presente')
  assert.ok(choice.includes('data-i18n="create.choice.search"'), 'Descubrir presente')
  assert.ok(!choice.includes('data-i18n="instances.import"'), 'Importar fuera de Agregar')
  // Regla 7 de la guía: controles clickeables propios son cards del sistema.
  for (const match of [...html.matchAll(/<button[^>]*onclick="(openExternalFromImportMenu\(\)|createImportMrpack\(\))"[^>]*>/g)]) {
    assert.match(match[0], /create-choice-option/, 'botón de importar es card del sistema')
  }
  assert.ok(instancesSource.includes("for (const name of ['choice', 'custom', 'external'])"), 'step registrado')
  assert.ok(instancesSource.includes('function openImportModpackMenu()'), 'apertura desde toolbar/inicio')
  assert.ok(instancesSource.includes('function closeImportModpackMenu('), 'cierre del modal propio')
  assert.ok(instancesSource.includes('function openExternalFromImportMenu()'), 'puente al paso external')
})

test('renombre a Descubrir modpacks con i18n y sin tocar el compás', () => {
  assert.ok(html.includes('data-i18n="create.choice.search"'), 'clave i18n, no string suelto')
  assert.ok(html.includes('id="nav-discover"'), 'sección Descubrir intacta')
  assert.ok(html.includes('fa-compass'), 'SVG de Descubrir intacto')
  const esBlock = commonSource.slice(commonSource.indexOf('I18N = {'), commonSource.indexOf('\n  en: {'))
  assert.ok(esBlock.includes("'create.choice.search': 'Descubrir modpacks'"), 'ES renombrado')
})

test('picker e instancias replican la estructura de referencia', () => {
  assert.ok(instancesSource.includes('external-pick-row'), 'filas de picker con chevron')
  assert.ok(instancesSource.includes('external-pick-chevron'), 'chevron por fila')
  assert.ok(instancesSource.includes('external-pathbar'), 'barra de ruta con Elegir carpeta')
  assert.ok(instancesSource.includes('external.clear'), 'Limpiar selección')
  assert.ok(instancesSource.includes('external.continue'), 'Continuar importa la selección')
  assert.ok(instancesSource.includes('external-clear-btn'), 'botón Limpiar')
})

test('en paso external solo quedan Volver/Continuar contextuales', () => {
  assert.ok(html.includes('id="create-cancel-btn"'), 'Cancelar del Crear identificable')
  assert.ok(instancesSource.includes("back.hidden = step === 'choice' || step === 'external'"), 'sin Volver global en external')
  assert.ok(instancesSource.includes("cancelBtn.hidden = step === 'external'"), 'sin Cancelar global en external')
  assert.ok(!instancesSource.includes('modalClose.hidden'), 'X siempre visible')
  const start = styles.indexOf('/* EXTERNAL-IMPORT-START')
  const end = styles.indexOf('EXTERNAL-IMPORT-END */')
  const block = styles.slice(start, end)
  assert.ok(block.includes('#import-modpack-modal .create-modal'), 'override del modal Importar')
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'override solo con tokens')
})

test('íconos por launcher: SVG en assets/external', () => {
  assert.ok(instancesSource.includes('EXTERNAL_LAUNCHER_ICONS'), 'mapa de íconos por launcher')
  for (const id of ['prism', 'curseforge', 'modrinth', 'sklauncher', 'official']) {
    assert.ok(instancesSource.includes(`assets/external/${id}.svg`), `SVG cableado para ${id}`)
    assert.ok(fs.existsSync(path.join(root, 'assets', 'external', `${id}.svg`)), `SVG de ${id} en repo`)
  }
  const prismSvg = fs.readFileSync(path.join(root, 'assets', 'external', 'prism.svg'), 'utf8')
  assert.ok(prismSvg.includes('CC BY-SA 4.0') && prismSvg.includes('Prism Launcher'), 'atribución CC BY-SA de Prism')
})

test('i18n ES/EN par para external.*', () => {
  const es = commonSource.indexOf('I18N = {')
  const en = commonSource.indexOf('\n  en: {', es)
  assert.ok(es >= 0 && en > es, 'bloques es/en existen')
  const esBlock = commonSource.slice(es, en)
  const enBlock = commonSource.slice(en)
  const keys = [...esBlock.matchAll(/'(external\.[a-zA-Z.]+|create\.choice\.importExternal\w*)':/g)].map(m => m[1])
  assert.ok(keys.length >= 20, `claves external suficientes (hay ${keys.length})`)
  for (const key of new Set(keys)) {
    assert.ok(enBlock.includes(`'${key}':`), `falta EN para ${key}`)
  }
})

test('la UI usa escapeHtml/t, progreso toast y reutiliza afterModpackImport', () => {
  const start = instancesSource.indexOf('let externalState')
  const end = instancesSource.indexOf('function closeCreateInstanceModal')
  assert.ok(start >= 0 && end > start, 'bloque external localizable')
  const block = instancesSource.slice(start, end)
  assert.ok(block.includes('escapeHtml('), 'sanea nombres/rutas no confiables')
  assert.ok(block.includes('t('), 'i18n en contenido dinámico')
  assert.ok(block.includes('onExternalImportProgress'), 'progreso en vivo')
  assert.ok(block.includes('externalImportCancel'), 'cancelación cableada')
  assert.ok(block.includes('afterModpackImport(result)'), 'reutiliza post-import existente')
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'sin colores fijos en el JS nuevo')
})

test('el CSS nuevo usa solo tokens de tema', () => {
  const start = styles.indexOf('/* EXTERNAL-IMPORT-START')
  const end = styles.indexOf('EXTERNAL-IMPORT-END */')
  assert.ok(start >= 0 && end > start, 'bloque CSS delimitado')
  const block = styles.slice(start, end)
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'sin hex: solo var(--kindyr-*)')
  assert.ok(block.includes('var(--kindyr-'), 'usa tokens de tema')
  assert.ok(block.includes('border-radius: 0'), 'radius 0 neobrutalista')
})

test('preload expone external* y main registra el IPC sin tocar import-mrpack', () => {
  for (const fn of ['externalDetect', 'externalList', 'externalBrowse', 'externalImport', 'externalImportCancel', 'onExternalImportProgress', 'offExternalImportProgress']) {
    assert.ok(preloadSource.includes(fn), `preload expone ${fn}`)
  }
  assert.ok(mainSource.includes('registerExternalLaunchersIpc({ ipcMain, dialog, getDataRoot: getKindyrDataRoot })'), 'registro en main')
  assert.ok(mainSource.includes("ipcMain.handle('import-mrpack'"), 'import-mrpack intacto')
  assert.ok(mainSource.includes('function createImportInstanceDirs(packName)'), 'helper de creación intacto')
  assert.ok(mainSource.includes('fs.renameSync(tmp, dest)'), 'registro atómico')
})

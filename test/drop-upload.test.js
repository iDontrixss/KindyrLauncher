// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Drag&drop de archivos: el renderer solo propone rutas; main valida cada
// una (existencia, regular, tamaño, extensión) y reporta omitidos.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const instancesSource = fs.readFileSync(path.join(root, 'instances.js'), 'utf8')
const preloadSource = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')

function handlerBody(source, channel) {
  const start = source.indexOf(`ipcMain.handle('${channel}'`)
  assert.ok(start >= 0, `handler ${channel} debe existir`)
  return source.slice(start, start + 8000)
}

test('drop usa el mismo canal con filePaths opcional; diálogo intacto', () => {
  const body = handlerBody(mainSource, 'upload-instance-files')
  assert.match(body, /payload\.filePaths !== undefined/)
  assert.match(body, /!Array\.isArray\(payload\.filePaths\)/)
  assert.match(body, /dialog\.showOpenDialog/)
})

test('drop valida forma, tamaño y extensión en main', () => {
  const body = handlerBody(mainSource, 'upload-instance-files')
  assert.match(body, /function dropFileBase|dropFileBase\(src\)/)
  assert.match(mainSource, /UPLOAD_ALLOWED_EXTS = new Set\(\['\.jar', '\.zip', '\.mrpack'\]\)/)
  assert.match(mainSource, /MAX_UPLOAD_FILE_BYTES = 2 \* 1024 \* 1024 \* 1024/)
  assert.match(mainSource, /MAX_UPLOAD_FILES = 20/)
  assert.match(body, /stat\.isFile\(\)/)
  assert.match(body, /stat\.size > MAX_UPLOAD_FILE_BYTES/)
  assert.match(body, /sanitizeFileName\(path\.basename\(/)
  assert.match(body, /resolveContentDir\(instance\.id, kind\)/)
  assert.match(body, /skipped\.push\(/)
})

test('renderer exige drop real y lee File.path', () => {
  assert.match(instancesSource, /event\.isTrusted/)
  assert.match(instancesSource, /dt\?\.files/)
  assert.match(instancesSource, /typeof f\.path === 'string' && f\.path/)
  assert.match(instancesSource, /payload\.filePaths = paths/)
  assert.match(instancesSource, /guardWindowDropNavigation/)
})

test('preload acota el array de rutas en transporte', () => {
  assert.match(preloadSource, /MAX_PRELOAD_UPLOAD_PATHS/)
  assert.match(preloadSource, /capUploadPayload\(payload\)/)
})

test('upload clasifica por contenido y reporta skipped[] en ambas vías', () => {
  const body = handlerBody(mainSource, 'upload-instance-files')
  assert.match(body, /classifyContentFile\(src, isJar \? '\.jar' : '\.zip'\)/)
  assert.match(body, /reason: 'unrecognized'/)
  assert.match(body, /reason: 'is-modpack'/)
  assert.match(body, /reason: 'unreadable'/)
  assert.match(body, /return \{ ok: true, copied, skipped \}/)
  assert.match(mainSource, /require\('\.\/content-sniff'\)/)
  // .mrpack entra al circuito zip (si no, el redirect de modpack nunca se ve)
  assert.match(mainSource, /UPLOAD_ALLOWED_EXTS = new Set\(\['\.jar', '\.zip', '\.mrpack'\]\)/)
  assert.match(body, /lower\.endsWith\('\.mrpack'\)/)
})

test('el diálogo SOLO corre en la rama sin filePaths/fileBlobs (un drop jamás lo abre)', () => {
  const body = handlerBody(mainSource, 'upload-instance-files')
  // El showOpenDialog vive dentro del else de la condición drop
  assert.match(body, /\} else \{\s*\n\s*const result = await dialog\.showOpenDialog/)
  assert.match(body, /un drop jamás debe abrirlo/)
})

test('cada invoke de upload deja traza forense (rama + conteos)', () => {
  assert.match(mainSource, /function debugUploadLog\(line\)/)
  const body = handlerBody(mainSource, 'upload-instance-files')
  assert.match(body, /debugUploadLog\(`invoke keys=/)
  assert.match(body, /debugUploadLog\(`done dropMode=/)
})

test('renderer muestra guía de modpack cuando corresponde', () => {
  assert.match(instancesSource, /uploadResultStatus\(result\)/)
  assert.match(instancesSource, /UPLOAD_SKIP_MESSAGE_KEY/)
  assert.match(instancesSource, /'is-modpack': 'instance\.uploadIsModpack'/)
})

test('drops sin ruta viajan como bytes y main los stageniza igual', () => {
  assert.match(instancesSource, /arrayBuffer\(\)/)
  assert.match(instancesSource, /MAX_RENDERER_BLOB_BYTES/)
  assert.match(instancesSource, /payload\.fileBlobs = blobs/)
  assert.match(mainSource, /payload\.fileBlobs !== undefined/)
  assert.match(mainSource, /writeStagedBlob\(stagedDir, checked\.file/)
  assert.match(mainSource, /stageCleanup\(\)/)
  assert.match(preloadSource, /MAX_PRELOAD_UPLOAD_BLOBS/)
})

test('drop sin paths avisa en vez de quedarse mudo', () => {
  assert.match(instancesSource, /instance\.dropEmpty/)
  assert.match(instancesSource, /collectDroppedPaths\(event\)/)
  assert.match(instancesSource, /text\/uri-list/)
  assert.match(instancesSource, /function fileUriToPath\(uri\)/)
  assert.match(instancesSource, /instance\.dropFolder/)
  assert.match(instancesSource, /function describeDropData\(dt\)/)
})

test('solo el panel Contenido adicional acepta drop (ni vista amplia ni tarjetas)', () => {
  assert.match(instancesSource, /function setupInstanceContentDropZone\(\)/)
  assert.match(instancesSource, /getElementById\('instance-detail-view'\)/)
  // Alcance por .content-hub más cercano (título, toolbar, filtros y lista)
  assert.match(instancesSource, /closest\('\.content-hub'\)/)
  // La zona se enlaza en cada render (auto-reparación si el panel se recrea)
  assert.match(instancesSource, /setupInstanceContentDropZone\(\)/)
  // Cursor: sin dropEffect='copy' Windows muestra prohibido aunque el drop
  // esté permitido (quirk Chromium).
  assert.match(instancesSource, /dropEffect = 'copy'/)
  assert.equal(instancesSource.includes('setupInstanceDropZone('), false)
  assert.equal(instancesSource.includes('setupInstanceListDropZone'), false)
  assert.equal(instancesSource.includes("closest('.instance-card')"), false)
  // renderLauncherInstancesList no engancha nada de drop
  const sectionSource = fs.readFileSync(path.join(root, 'sections', 'instancias.html'), 'utf8')
  assert.equal(sectionSource.includes('DropZone'), false)
})

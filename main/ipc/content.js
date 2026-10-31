// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain, shell, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const { classifyContentFile, writeStagedBlob } = require('../../content-sniff')
const state = require('../state')
const { INSTANCE_CONTENT_KINDS, MAX_UPLOAD_FILES, MAX_UPLOAD_FILE_BYTES, deleteInstanceContentFile, dropFileBase, getContentLatestCompatible, installSpecificContentVersion, listInstanceContent, resolveContentDir, toggleInstanceContentFile } = require('../instance-content')
const { ensureInstanceFolders, getInstance, getInstanceDir, getInstanceTargetPath, instanceFolders } = require('../instances-store')
const { assertTrustedIpcSender, requireTrimmedString } = require('../ipc-guard')
const { invalidateStorageCache } = require('../storage')
const { isLocalAbsolutePath, listFiles, safeFileName, sanitizeFileName } = require('../util')

ipcMain.handle('open-instance-folder', (_event, instanceId) => {
  const instance = getInstance(instanceId)
  if (!instance) {
    return { ok: false, error: 'No existe la instancia seleccionada.' }
  }

  ensureInstanceFolders(instance)
  shell.openPath(getInstanceDir(instanceId))
  return { ok: true }
})

ipcMain.handle('get-instance-details', (_event, instanceId) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'No existe la instancia seleccionada.' }

  ensureInstanceFolders(instance)
  const mods = listFiles(instanceFolders.mods(instanceId), entry => entry.isFile() && (/\.jar$/i.test(entry.name) || /\.jar\.disabled$/i.test(entry.name)))
  const worlds = listFiles(instanceFolders.saves(instanceId), entry => entry.isDirectory())
  const logs = [
    ...listFiles(instanceFolders.logs(instanceId), entry => entry.isFile() && /\.log(\.gz)?$/i.test(entry.name)),
    ...listFiles(instanceFolders.launcherLogs(instanceId), entry => entry.isFile() && /\.log$/i.test(entry.name)).map(item => ({ ...item, name: 'launcher-logs/' + item.name }))
  ]
  let content = []
  try {
    content = listInstanceContent(instanceId)
  } catch { content = [] }

  return {
    ok: true,
    instance,
    counts: {
      mods: mods.length,
      content: content.length,
      worlds: worlds.length,
      logs: logs.length
    },
    mods,
    content,
    worlds,
    logs
  }
})

ipcMain.handle('open-instance-target', (_event, instanceId, target) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'No existe la instancia seleccionada.' }

  try {
    ensureInstanceFolders(instance)
    const targetPath = getInstanceTargetPath(instanceId, target)
    fs.mkdirSync(targetPath, { recursive: true })
    shell.openPath(targetPath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('toggle-instance-mod', (_event, instanceId, fileName) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'No existe la instancia seleccionada.' }

  try {
    ensureInstanceFolders(instance)
    const cleanName = safeFileName(fileName)
    const modsDir = instanceFolders.mods(instanceId)
    const currentPath = path.join(modsDir, cleanName)
    if (!fs.existsSync(currentPath)) return { ok: false, error: 'No existe el mod seleccionado.' }

    const nextName = cleanName.endsWith('.disabled')
      ? cleanName.replace(/\.disabled$/i, '')
      : cleanName + '.disabled'
    const nextPath = path.join(modsDir, nextName)
    if (fs.existsSync(nextPath)) return { ok: false, error: 'Ya existe un archivo con ese nombre.' }

    fs.renameSync(currentPath, nextPath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('toggle-instance-content', (_event, payload = {}) => {
  try {
    const result = toggleInstanceContentFile(payload.instanceId, payload.kind, payload.file)
    invalidateStorageCache()
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('delete-instance-content', (_event, payload = {}) => {
  try { assertTrustedIpcSender(typeof _event !== 'undefined' ? _event : event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  try {
    const result = deleteInstanceContentFile(payload.instanceId, payload.kind, payload.file)
    invalidateStorageCache()
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('upload-instance-files', async (_event, payload = {}) => {
  try { assertTrustedIpcSender(typeof _event !== 'undefined' ? _event : event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  let stagedDir = null
  const stageCleanup = async () => {
    if (stagedDir) await fs.promises.rm(stagedDir, { recursive: true, force: true }).catch(() => {})
    stagedDir = null
  }
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) throw new Error('No existe la instancia seleccionada.')
    ensureInstanceFolders(instance)
    const hint = String(payload.kindHint || 'mod').toLowerCase()
    const fallback = Object.hasOwn(INSTANCE_CONTENT_KINDS, hint) ? hint : 'mod'
    let dropMode = false
    let sources
    const skipped = []
    if (payload.filePaths !== undefined || payload.fileBlobs !== undefined) {
      // Drop directo sobre la vista: rutas y/o bytes los propone el renderer
      // y se validan uno por uno en main. Lo inválido se reporta en `skipped`
      // sin abortar el lote. El diálogo nativo conserva su conducta histórica
      // y SOLO corre en la rama else: un drop jamás debe abrirlo.
      dropMode = true
      sources = []
      if (payload.filePaths !== undefined) {
        if (!Array.isArray(payload.filePaths)) throw new Error('filePaths debe ser un array.')
        for (const src of payload.filePaths.slice(0, MAX_UPLOAD_FILES)) {
          const checked = dropFileBase(src)
          if (!checked.ok) { skipped.push({ file: checked.file, reason: checked.reason }); continue }
          // KL-07: la ruta la propone el renderer. Solo discos locales: una ruta
          // UNC/de dispositivo dispara una conexión SMB con solo hacer stat.
          if (!isLocalAbsolutePath(src)) { skipped.push({ file: checked.file, reason: 'not-local' }); continue }
          sources.push(checked)
        }
      }
    } else {
      const result = await dialog.showOpenDialog(state.mainWindow, {
        title: 'Subir archivos a la instancia',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Contenido Minecraft', extensions: ['jar', 'zip', 'mrpack', 'disabled'] }]
      })
      if (result.canceled || !result.filePaths.length) { await stageCleanup(); return { ok: false, cancelled: true } }
      sources = result.filePaths.slice(0, MAX_UPLOAD_FILES)
    }
    // Drops sin ruta (orígenes virtuales, adjuntos, Firefox): el renderer
    // manda {name, bytes} y main los valida igual que un archivo en disco:
    // el staging entra al MISMO pipeline (stat → sniff → copy) de abajo.
    if (payload.fileBlobs !== undefined) {
      if (!Array.isArray(payload.fileBlobs)) throw new Error('fileBlobs debe ser un array.')
      dropMode = true
      if (!Array.isArray(sources)) sources = []
      const room = Math.max(0, MAX_UPLOAD_FILES - sources.length)
      for (const blob of payload.fileBlobs.slice(0, room)) {
        const checked = dropFileBase(blob && blob.name)
        if (!checked.ok) { skipped.push({ file: checked.file, reason: checked.reason }); continue }
        try {
          if (!stagedDir) {
            stagedDir = path.join(require('os').tmpdir(), `kindyr-upload-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
          }
          const src = writeStagedBlob(stagedDir, checked.file, blob && blob.bytes)
          sources.push({ src, file: checked.file })
        } catch (error) {
          skipped.push({ file: checked.file, reason: (error && error.reason) || 'unreadable' })
        }
      }
    }
    const copied = []
    for (const item of sources) {
      const src = dropMode ? item.src : item
      const base = dropMode ? item.file : sanitizeFileName(path.basename(src))
      // Verificación en el momento de copiar (vale para ambas vías): existe,
      // archivo regular y tope anti disk-fill. En diálogo solo rechaza lo
      // absurdo (>2 GiB); la extensión la eligió el usuario en la UI nativa.
      let stat = null
      try { stat = fs.statSync(src) } catch { skipped.push({ file: base, reason: 'missing' }); continue }
      if (!stat.isFile()) { skipped.push({ file: base, reason: 'not-file' }); continue }
      if (stat.size > MAX_UPLOAD_FILE_BYTES) { skipped.push({ file: base, reason: 'too-large' }); continue }
      const lower = base.toLowerCase()
      const isJar = lower.endsWith('.jar') || lower.endsWith('.jar.disabled')
      // .mrpack ES un zip (formato Modrinth): entra al circuito zip para que
      // la clasificación lo detecte como modpack y dispare la guía (antes
      // moría en la puerta por extensión y el redirect nunca se veía).
      const isZip = !isJar && (lower.endsWith('.zip') || lower.endsWith('.zip.disabled') || lower.endsWith('.mrpack') || lower.endsWith('.mrpack.disabled'))
      let kind = fallback
      let loader = ''
      if (isJar || isZip) {
        // Detección por contenido (diálogo y drop por igual): un .jar solo
        // entra a mods/ si trae descriptor de mod reconocido; un .zip que
        // sea modpack se rechaza con guía al instalador; resourcepack,
        // shader y datapack deciden su propio kind por contenido (el hint
        // solo desempata lo ambiguo). Lo no reconocido no se copia a ciegas.
        let sniffed
        try {
          sniffed = await classifyContentFile(src, isJar ? '.jar' : '.zip')
        } catch {
          skipped.push({ file: base, reason: 'unreadable' })
          continue
        }
        if (sniffed.kind === 'unknown') { skipped.push({ file: base, reason: 'unrecognized' }); continue }
        if (sniffed.kind === 'modpack') { skipped.push({ file: base, reason: 'is-modpack' }); continue }
        if (sniffed.kind === 'mod') { kind = 'mod'; loader = sniffed.loader || '' }
        else if (sniffed.kind === 'resourcepack' || sniffed.kind === 'shader' || sniffed.kind === 'datapack') { kind = sniffed.kind }
        // Nota: 'datapack'/'shader'/'resourcepack' usan las claves de
        // INSTANCE_CONTENT_KINDS que resolveContentDir ya valida.
      }
      const resolved = resolveContentDir(instance.id, kind)
      fs.mkdirSync(resolved.folder, { recursive: true })
      const dest = path.join(resolved.folder, base)
      if (fs.existsSync(dest)) { skipped.push({ file: base, reason: 'exists' }); continue }
      await fs.promises.copyFile(src, dest)
      copied.push(loader ? { kind, file: base, loader } : { kind, file: base })
    }
    invalidateStorageCache()
    return { ok: true, copied, skipped }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  } finally {
    await stageCleanup()
  }
})

ipcMain.handle('check-content-updates', async (_event, payload = {}) => {
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) throw new Error('No existe la instancia seleccionada.')
    const items = listInstanceContent(instance.id).filter(i => i.projectId)
    const updates = []
    const maxConcurrent = 4
    let idx = 0
    async function worker() {
      while (idx < items.length) {
        const item = items[idx++]
        try {
          const info = await getContentLatestCompatible(instance, item)
          if (info.hasUpdate) {
            updates.push({ id: item.id, kind: item.kind, file: item.file, ...info })
          }
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(maxConcurrent, Math.max(1, items.length)) }, () => worker()))
    return { ok: true, updates, checked: items.length }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('update-instance-content', async (_event, payload = {}) => {
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) throw new Error('No existe la instancia seleccionada.')
    const kind = requireTrimmedString(payload.kind, 'Tipo de contenido', 32)
    const file = requireTrimmedString(payload.file, 'Archivo', 256)
    const items = listInstanceContent(instance.id)
    const item = items.find(i => i.id === kind + ':' + file) ||
      items.find(i => i.file === file && i.kind === kind)
    if (!item) throw new Error('No existe el contenido seleccionado.')
    if (!item.projectId) throw new Error('Este archivo fue subido manualmente, no tiene updates.')
    const info = await getContentLatestCompatible(instance, item)
    if (!info.hasUpdate || !info.latestVersionId) throw new Error('Ya está actualizado.')
    const installed = await installSpecificContentVersion(instance, item, info.latestVersionId)
    invalidateStorageCache()
    return { ok: true, file: installed.file, version: installed.version }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('update-all-instance-content', async (_event, payload = {}) => {
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) throw new Error('No existe la instancia seleccionada.')
    const items = listInstanceContent(instance.id).filter(i => i.projectId)
    let updated = 0
    const failed = []
    for (const item of items) {
      try {
        const info = await getContentLatestCompatible(instance, item)
        if (!info.hasUpdate || !info.latestVersionId) continue
        await installSpecificContentVersion(instance, item, info.latestVersionId)
        updated++
      } catch (error) {
        failed.push(item.file)
      }
    }
    invalidateStorageCache()
    return { ok: true, updated, failed }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('set-instance-content-version', async (_event, payload = {}) => {
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) throw new Error('No existe la instancia seleccionada.')
    const kind = requireTrimmedString(payload.kind, 'Tipo de contenido', 32)
    const file = requireTrimmedString(payload.file, 'Archivo', 256)
    const versionId = requireTrimmedString(payload.versionId, 'Versión', 128)
    const items = listInstanceContent(instance.id)
    const item = items.find(i => i.id === kind + ':' + file) ||
      items.find(i => i.file === file && i.kind === kind)
    if (!item) throw new Error('No existe el contenido seleccionado.')
    const installed = await installSpecificContentVersion(instance, item, versionId)
    invalidateStorageCache()
    return { ok: true, file: installed.file, version: installed.version }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

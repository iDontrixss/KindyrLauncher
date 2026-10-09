// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Registro IPC de "Importar desde otro launcher" — Fase 2.
// Toda ruta que llega de la UI se valida en el proceso principal.
// No toca el flujo existente `import-mrpack` ni `saveCustomInstances`.
//
// Canales:
//   external-detect  () => [{ launcherId, label, roots }]
//   external-list    ({ launcherId, rootOverride? }) => { ok, root, instances, error }
//   external-browse  () => { cancelled } | { ok, path }
//   external-import  ({ importId, launcherId, gameDir, name, minecraftVersion,
//                       loader, loaderVersion, selection? }) => resultado final
//   external-import-cancel ({ importId }) => { ok }
// Eventos: external-import-progress { importId, stage, doneBytes, totalBytes, current }

const fs = require('fs')
const path = require('path')
const {
  copyExternalInstance,
  purgeStaleTempDirs,
  DEFAULT_SELECTION,
  SELECTABLE_DIRS,
  SELECTABLE_FILES
} = require('./importer')
const { CANONICAL_LOADERS } = require('./shared')

const ADAPTERS = {
  prism: () => require('./prism'),
  curseforge: () => require('./curseforge'),
  modrinth: () => require('./modrinth'),
  sklauncher: () => require('./sklauncher'),
  official: () => require('./official')
}

function adapterFor(launcherId) {
  const load = ADAPTERS[String(launcherId || '')]
  return load ? load() : null
}

function trimmedString(value, maxLen = 256) {
  const text = String(value == null ? '' : value).trim()
  if (!text || text.length > maxLen) return null
  return text
}

function validImportId(value) {
  const text = trimmedString(value, 64)
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) return null
  return text
}

function validAbsoluteDir(dirPath, maxLen = 1024) {
  const text = String(dirPath || '').trim()
  if (!text || text.length > maxLen || !path.isAbsolute(text)) return null
  try {
    if (!fs.statSync(text).isDirectory()) return null
  } catch {
    return null
  }
  return text
}

function validSelection(raw) {
  const selection = { ...DEFAULT_SELECTION }
  if (raw && typeof raw === 'object') {
    for (const key of [...SELECTABLE_DIRS, ...SELECTABLE_FILES]) {
      if (raw[key] !== undefined) selection[key] = raw[key] === true
    }
  }
  return selection
}

function registerExternalLaunchersIpc({ ipcMain, dialog, getDataRoot }) {
  const inFlight = new Map()

  try {
    purgeStaleTempDirs(getDataRoot())
  } catch {}

  ipcMain.handle('external-detect', () => {
    return Object.keys(ADAPTERS).map(launcherId => {
      const adapter = adapterFor(launcherId)
      return { launcherId, label: adapter.label, roots: adapter.detect() }
    })
  })

  ipcMain.handle('external-list', (_event, payload = {}) => {
    const adapter = adapterFor(payload.launcherId)
    if (!adapter) return { ok: false, root: null, instances: [], error: 'Launcher no válido.' }
    let root = null
    if (payload.rootOverride !== undefined && payload.rootOverride !== null && String(payload.rootOverride).trim() !== '') {
      root = validAbsoluteDir(payload.rootOverride)
      if (!root) return { ok: false, root: null, instances: [], error: 'Carpeta no válida.' }
    } else {
      const found = adapter.detect().find(item => item.exists)
      if (!found) return { ok: false, root: null, instances: [], error: `${adapter.label} no encontrado. Elegí la carpeta manualmente.` }
      root = found.root
    }
    return adapter.listInstances(root)
  })

  ipcMain.handle('external-browse', async () => {
    const result = await dialog.showOpenDialog({ title: 'Elegir carpeta de instancias', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths.length) return { cancelled: true }
    const dir = validAbsoluteDir(result.filePaths[0])
    if (!dir) return { ok: false, error: 'Carpeta no válida.' }
    return { ok: true, path: dir }
  })

  ipcMain.handle('external-import', async (event, payload = {}) => {
    const importId = validImportId(payload.importId)
    const adapter = adapterFor(payload.launcherId)
    const gameDir = validAbsoluteDir(payload.gameDir)
    const name = trimmedString(payload.name, 96)
    const minecraftVersion = trimmedString(payload.minecraftVersion, 32)
    const loader = CANONICAL_LOADERS.has(String(payload.loader || '')) ? String(payload.loader) : null
    const loaderVersion = payload.loaderVersion == null || payload.loaderVersion === ''
      ? ''
      : trimmedString(payload.loaderVersion, 64)
    if (!importId || !adapter || !gameDir || !name) {
      return { ok: false, error: 'Datos de importación no válidos.' }
    }
    if (!minecraftVersion || !/^\d+\.\d+(\.\d+)?$/.test(minecraftVersion)) {
      return { ok: false, error: 'Versión de Minecraft no válida.' }
    }
    if (!loader || (loader !== 'vanilla' && loaderVersion === null)) {
      return { ok: false, error: 'Loader no válido.' }
    }
    if (inFlight.has(importId)) return { ok: false, error: 'Importación ya en curso.' }
    const controller = new AbortController()
    inFlight.set(importId, controller)
    const onProgress = (data) => {
      try {
        event.sender.send('external-import-progress', { importId, ...data })
      } catch {}
    }
    try {
      return await copyExternalInstance({
        gameDir,
        name,
        minecraftVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
        source: adapter.id
      }, {
        dataRoot: getDataRoot(),
        selection: validSelection(payload.selection),
        signal: controller.signal,
        onProgress
      })
    } finally {
      inFlight.delete(importId)
    }
  })

  ipcMain.handle('external-import-cancel', (_event, payload = {}) => {
    const importId = validImportId(payload && payload.importId)
    const controller = importId ? inFlight.get(importId) : null
    if (!controller) return { ok: false, error: 'Importación no encontrada.' }
    try {
      controller.abort()
    } catch {}
    return { ok: true }
  })

  return { inFlight }
}

module.exports = { registerExternalLaunchersIpc, ADAPTER_IDS: Object.keys(ADAPTERS) }

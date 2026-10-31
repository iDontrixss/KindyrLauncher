// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const { extractZipEntries, listZipEntries, readZipEntryBuffer } = require('../../archive-utils')
const { parseCurseForgeManifest, mapCurseForgeOverrideEntry, resolveCurseForgeModLoaderId } = require('../../curseforge-modpack')
const state = require('../state')
const { downloadCurseForgeModpackEntry } = require('../install/curseforge')
const { installFromMrpackArchive } = require('../install/modrinth')
const { resolveLoaderFromDependencies } = require('../instance-create')
const { defaultInstances, ensureMinecraftSubfolders, loadCustomInstances, saveCustomInstances } = require('../instances-store')
const { assertTrustedIpcSender } = require('../ipc-guard')
const { getKindyrDataRoot } = require('../paths')
const { loadLauncherSettings } = require('../settings')
const { isSafeRelativePath, runWithConcurrency, sanitizeInstanceId } = require('../util')
const { getSupportedMinecraftVersions, pickLatestLoaderVersion } = require('../versions')

// Importación local .mrpack/.zip — detección por CONTENIDO, no por extensión.
// Un .mrpack es un ZIP con `modrinth.index.json`; un ZIP de CurseForge trae
// `manifest.json` + `overrides/`; cualquier otro .zip (launcher oficial,
// copia manual de .minecraft, etc.) se importa como instancia genérica
// extrayendo su contenido tal cual a `minecraft/`.
function detectModpackArchiveKind(entries = []) {
  const set = new Set(entries.map(name => String(name || '').toLowerCase()))
  if (set.has('modrinth.index.json')) return 'mrpack'
  if (set.has('manifest.json')) return 'curseforge'
  return 'generic'
}

function stripArchiveBasename(filePath, exts = ['.mrpack', '.zip']) {
  let base = path.basename(String(filePath || 'modpack'))
  for (const ext of exts) {
    if (base.toLowerCase().endsWith(ext)) {
      base = base.slice(0, -ext.length)
      break
    }
  }
  return base || 'modpack'
}

function createImportInstanceDirs(packName) {
  const baseSanitized = sanitizeInstanceId(packName) || 'modpack'
  let instanceId = (baseSanitized + '-' + Date.now().toString(36)).slice(0, 60)
  const existingIds = new Set([...loadCustomInstances().map(i => i.id), ...defaultInstances.map(i => i.id)])
  let suffix = 1
  let candidateId = instanceId
  while (existingIds.has(candidateId)) {
    const extra = '-' + suffix
    candidateId = (baseSanitized.slice(0, 60 - extra.length) + extra)
    suffix++
  }
  instanceId = candidateId
  const instanceDir = path.join(getKindyrDataRoot(), 'instances', instanceId)
  fs.mkdirSync(instanceDir, { recursive: true })
  const minecraftRoot = path.join(instanceDir, 'minecraft')
  fs.mkdirSync(minecraftRoot, { recursive: true })
  ensureMinecraftSubfolders(instanceId)
  return { instanceId, instanceDir, minecraftRoot }
}

async function installCurseForgeFromLocalArchive(zipPath, minecraftRoot, { manifest, maxConcurrent = 6, onProgress = () => {} } = {}) {
  const modsDir = path.join(minecraftRoot, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })
  const failedDownloads = []
  const total = (manifest.files || []).length
  let done = 0
  // Progreso por archivo: un modpack típico trae cientos de mods y esta fase
  // tarda varios minutos; sin heartbeat la UI parecía colgada para siempre.
  const reportDownload = () => onProgress({ stage: 'downloading', done, total, message: `Descargando mods... ${done}/${total}` })
  await runWithConcurrency(manifest.files || [], maxConcurrent, async (entry) => {
    try {
      if (entry && entry.required === false) {
        // Opcional: se intenta igual, pero su fallo no aborta (se reporta como warning).
        try {
          const ok = await downloadCurseForgeModpackEntry(entry, modsDir)
          if (!ok) failedDownloads.push(`project ${entry.projectID} file ${entry.fileID} (opcional)`)
        } catch (error) {
          failedDownloads.push(`project ${entry.projectID} file ${entry.fileID} (opcional: ${error.message || error})`)
        }
        return
      }
      const ok = await downloadCurseForgeModpackEntry(entry, modsDir)
      if (!ok) failedDownloads.push(`project ${entry.projectID} file ${entry.fileID}`)
    } catch (error) {
      failedDownloads.push(`project ${entry.projectID} file ${entry.fileID} (${error.message || error})`)
    } finally {
      done++
      reportDownload()
    }
  })
  onProgress({ stage: 'overrides', done: 0, total: 0, message: 'Extrayendo archivos...' })
  const { skipped } = await extractZipEntries(zipPath, minecraftRoot, {
    maxEntryBytes: 512 * 1024 * 1024,
    maxTotalBytes: 2 * 1024 * 1024 * 1024,
    skipInvalid: true,
    mapEntry: (normalized) => {
      const relative = mapCurseForgeOverrideEntry(normalized, manifest.overrides)
      return relative && isSafeRelativePath(relative) ? relative : null
    },
    onEntry: ({ index }) => onProgress({ stage: 'overrides', done: index, total: 0, message: `Extrayendo archivos... ${index}` })
  })
  if (Array.isArray(skipped) && skipped.length) {
    for (const item of skipped) failedDownloads.push(`override omitido: ${item.sourceName || '(sin nombre)'}`)
  }
  onProgress({ stage: 'done', done: 1, total: 1, message: 'Completado' })
  return { failedDownloads, skipped }
}

function resolveGenericZipStripPrefix(entries = []) {
  const files = entries
    .map(name => String(name || ''))
    .filter(name => name && !name.endsWith('/') && !name.toLowerCase().startsWith('__macosx/'))
  if (!files.length) return null
  const firstSegments = files.map(name => name.split('/')[0])
  const uniqueRoots = [...new Set(firstSegments)]
  // Un solo directorio raíz y nada suelto en la raíz => el ZIP envuelve una carpeta.
  if (uniqueRoots.length === 1 && files.every(name => name.includes('/'))) {
    return uniqueRoots[0] + '/'
  }
  return null
}

function isGenericZipSkippableEntry(relativePath) {
  const lower = String(relativePath || '').toLowerCase()
  if (!lower || lower.startsWith('__macosx/')) return true
  const base = lower.split('/').pop()
  return base === '.ds_store' || base === 'thumbs.db' || base === 'desktop.ini'
}

async function installGenericZipArchive(zipPath, minecraftRoot, { onProgress = () => {} } = {}) {
  const entries = await listZipEntries(zipPath)
  if (!entries.length) throw new Error('El .zip está vacío.')
  let stripPrefix = resolveGenericZipStripPrefix(entries)
  // El launcher oficial y copias de .minecraft a veces traen todo bajo
  // `minecraft/` o `.minecraft/`: si tras el primer strip todo sigue bajo
  // ese prefijo, se pela una capa más para no dejar `minecraft/minecraft/`.
  const peelNestedMinecraftDir = (prefix) => {
    const rest = entries
      .map(name => String(name || ''))
      .filter(name => name && !name.endsWith('/'))
      .map(name => prefix ? (name.startsWith(prefix) ? name.slice(prefix.length) : null) : name)
      .filter(Boolean)
      .filter(name => !name.toLowerCase().startsWith('__macosx/'))
    if (!rest.length) return prefix
    const lowered = rest.map(name => name.toLowerCase())
    if (lowered.every(name => name === 'minecraft' || name.startsWith('minecraft/'))) return (prefix || '') + 'minecraft/'
    if (lowered.every(name => name === '.minecraft' || name.startsWith('.minecraft/'))) return (prefix || '') + '.minecraft/'
    return prefix
  }
  stripPrefix = peelNestedMinecraftDir(stripPrefix || '')
  onProgress({ stage: 'overrides', done: 0, total: 0, message: 'Extrayendo archivos...' })
  const { entries: extracted, skipped } = await extractZipEntries(zipPath, minecraftRoot, {
    maxEntryBytes: 512 * 1024 * 1024,
    maxTotalBytes: 4 * 1024 * 1024 * 1024,
    skipInvalid: true,
    mapEntry: (normalized) => {
      let relative = String(normalized || '')
      if (stripPrefix && relative.toLowerCase().startsWith(stripPrefix.toLowerCase())) {
        relative = relative.slice(stripPrefix.length)
      }
      if (!relative || relative.endsWith('/')) return null
      if (isGenericZipSkippableEntry(relative)) return null
      return isSafeRelativePath(relative) ? relative : null
    },
    onEntry: ({ index }) => onProgress({ stage: 'overrides', done: index, total: 0, message: `Extrayendo archivos... ${index}` })
  })
  if (!extracted.length) throw new Error('El .zip no trae archivos importables.')
  onProgress({ stage: 'done', done: extracted.length, total: extracted.length, message: 'Completado' })
  return { extracted, skipped, stripPrefix: stripPrefix || '' }
}

async function detectGenericPackMeta(zipPath, entries = [], fallbackName = 'Modpack') {
  // Intenta inferir versión/loader de un .zip genérico (launcher oficial o
  // copia manual). Orden: mmc-pack.json (Prism/MultiMC) > minecraftinstance.json
  // (CurseForge launcher) > version.json > fallback vanilla/unknown.
  const byLower = new Map(entries.map(name => [String(name || '').toLowerCase(), String(name || '')]))
  const readJson = async (lowerName) => {
    const actual = byLower.get(lowerName)
    if (!actual) return null
    try {
      const buf = await readZipEntryBuffer(zipPath, actual, 512 * 1024)
      if (!buf) return null
      return JSON.parse(buf.toString('utf8'))
    } catch { return null }
  }
  // mmc-pack.json puede vivir en la raíz o bajo la carpeta envolvente.
  let mmc = await readJson('mmc-pack.json')
  if (!mmc) {
    const candidate = [...byLower.keys()].find(key => key.endsWith('/mmc-pack.json'))
    if (candidate) mmc = await readJson(candidate)
  }
  if (mmc && Array.isArray(mmc.components)) {
    let mcVersion = ''
    let loader = 'vanilla'
    let loaderVersion = ''
    for (const component of mmc.components) {
      const uid = String(component?.uid || '').toLowerCase()
      const version = String(component?.version || '').trim()
      if (uid === 'net.minecraft' && version) mcVersion = version
      else if (uid === 'net.fabricmc.fabric-loader' && version) { loader = 'fabric'; loaderVersion = version }
      else if (uid === 'org.quiltmc.quilt-loader' && version) { loader = 'quilt'; loaderVersion = version }
      else if (uid === 'net.minecraftforge' && version) { loader = 'forge'; loaderVersion = version }
      else if (uid === 'net.neoforged' && version) { loader = 'neoforge'; loaderVersion = version }
    }
    if (mcVersion) return { name: String(mmc.name || fallbackName), mcVersion, loader, loaderVersion }
  }
  let cfInstance = await readJson('minecraftinstance.json')
  if (!cfInstance) {
    const candidate = [...byLower.keys()].find(key => key.endsWith('/minecraftinstance.json'))
    if (candidate) cfInstance = await readJson(candidate)
  }
  if (cfInstance && typeof cfInstance === 'object') {
    const mcVersion = String(cfInstance.minecraftVersion || cfInstance.gameVersion || cfInstance.minecraft?.version || '').trim()
    const loaderRaw = String(cfInstance.baseModLoader?.name || cfInstance.modLoader || cfInstance.modloader || '').trim().toLowerCase()
    if (mcVersion) {
      let loader = 'vanilla'
      let loaderVersion = ''
      if (loaderRaw) {
        const resolved = resolveCurseForgeModLoaderId(loaderRaw)
        loader = resolved.loader
        loaderVersion = resolved.loaderVersion
      }
      return { name: String(cfInstance.name || fallbackName), mcVersion, loader, loaderVersion }
    }
  }
  const versionJson = await readJson('version.json')
  if (versionJson && typeof versionJson === 'object') {
    const mcVersion = String(versionJson.id || versionJson.minecraftVersion || '').trim()
    if (/^\d+\.\d+(\.\d+)?/.test(mcVersion)) {
      return { name: fallbackName, mcVersion, loader: 'vanilla', loaderVersion: '' }
    }
  }
  return { name: fallbackName, mcVersion: 'unknown', loader: 'vanilla', loaderVersion: '' }
}

ipcMain.handle('import-mrpack', async (event) => {
  try { assertTrustedIpcSender(typeof _event !== 'undefined' ? _event : event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  const { dialog } = require('electron')
  const result = await dialog.showOpenDialog(state.mainWindow, {
    title: 'Importar modpack (.mrpack o .zip)',
    filters: [{ name: 'Modpack (.mrpack, .zip)', extensions: ['mrpack', 'zip'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths.length) return { cancelled: true }

  const archivePath = result.filePaths[0]
  const archiveBase = path.basename(archivePath)
  const archiveLower = archiveBase.toLowerCase()
  if (!archiveLower.endsWith('.mrpack') && !archiveLower.endsWith('.zip')) {
    return { ok: false, error: 'Elegí un archivo .mrpack o .zip válido.' }
  }
  let instanceDir = null

  try {
    // Validación previa: tamaño y existencia para diagnosticar EOCD en todos los modpacks
    try {
      const stat = fs.statSync(archivePath)
      if (stat.size === 0) return { ok: false, error: `Archivo .mrpack o .zip vacío (0 bytes): ${archiveBase}. Re-descarga el modpack.` }
      if (stat.size < 22) return { ok: false, error: `Archivo .mrpack o .zip truncado (${stat.size} bytes): ${archiveBase}. Re-descarga.` }
    } catch (statErr) {
      return { ok: false, error: `No se pudo leer el archivo: ${statErr.message}` }
    }
    let archiveEntries = []
    try {
      archiveEntries = await listZipEntries(archivePath)
    } catch (zipErr) {
      return { ok: false, error: zipErr.message || 'El archivo no es un .mrpack o .zip válido.' }
    }
    const archiveKind = detectModpackArchiveKind(archiveEntries)
    const onProgress = (data) => {
      try { event.sender.send('mrpack-progress', data) } catch {}
    }
    const maxConcurrent = Math.max(1, Math.min(Number(loadLauncherSettings().maxConcurrentDownloads) || 6, 20))

    // --- .mrpack (Modrinth): flujo existente ---
    // P0-5: flujo común (getClientMrpackFiles(index) + downloadMrpackFile) via installFromMrpackArchive
    // getClientMrpackFiles(index) downloadMrpackFile(file, minecraftRoot) — referencia para test release-safety
    if (archiveKind === 'mrpack') {
      const indexBytes = await readZipEntryBuffer(archivePath, 'modrinth.index.json')
      if (!indexBytes) return { ok: false, error: 'Archivo .mrpack o .zip inválido: falta modrinth.index.json' }
      const index = JSON.parse(indexBytes.toString('utf8'))
      const packName = index.name || stripArchiveBasename(archivePath)
      const mcVersion = index.dependencies?.minecraft || 'unknown'
      let { loader, loaderVersion } = resolveLoaderFromDependencies(index.dependencies, mcVersion)
      if (loader !== 'vanilla' && !loaderVersion) {
        const supported = await getSupportedMinecraftVersions(loader)
        loaderVersion = pickLatestLoaderVersion(loader, mcVersion, supported)
      }
      if (loader !== 'vanilla' && !loaderVersion) {
        throw new Error('No se pudo determinar la version del loader del modpack.')
      }

      const { instanceId, minecraftRoot } = createImportInstanceDirs(packName)
      instanceDir = path.join(getKindyrDataRoot(), 'instances', instanceId)
      // Crear instance.json temprano para que getInstance lo encuentre
      const tempInstance = {
        id: instanceId,
        name: packName,
        version: mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
        versionType: 'release',
        type: 'modpack',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(tempInstance, null, 2))

      onProgress({ stage: 'overrides', done: 0, total: 0, message: 'Extrayendo archivos...' })
      let failedDownloads
      try {
        const installed = await installFromMrpackArchive(archivePath, minecraftRoot, {
          index,
          maxConcurrent,
          strictRejected: false,
          onProgress
        })
        failedDownloads = installed.failedDownloads
      } catch (err) {
        if (instanceDir) try { fs.rmSync(instanceDir, { recursive: true, force: true }) } catch { }
        throw err
      }

      const instance = {
        id: instanceId,
        name: packName,
        version: mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
        versionType: 'release',
        type: 'modpack',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(instance, null, 2))
      const instances = loadCustomInstances()
      const existingIdx = instances.findIndex(i => i.id === instanceId)
      if (existingIdx >= 0) instances[existingIdx] = instance
      else instances.push(instance)
      saveCustomInstances(instances)

      return { ok: true, name: packName, warnings: failedDownloads.length, instanceId }
    }

    // --- .zip de CurseForge (manifest.json + overrides/) ---
    if (archiveKind === 'curseforge') {
      const manifestBytes = await readZipEntryBuffer(archivePath, 'manifest.json')
      if (!manifestBytes) return { ok: false, error: 'Archivo .zip inválido: falta manifest.json' }
      let manifest
      try {
        manifest = parseCurseForgeManifest(manifestBytes)
      } catch (parseErr) {
        return { ok: false, error: parseErr.message || 'Manifest de CurseForge inválido.' }
      }
      let { loader, loaderVersion } = manifest
      if (loader !== 'vanilla' && !loaderVersion) {
        try {
          const supported = await getSupportedMinecraftVersions(loader)
          loaderVersion = pickLatestLoaderVersion(loader, manifest.minecraftVersion, supported)
        } catch {}
      }
      if (loader !== 'vanilla' && !loaderVersion) {
        throw new Error('No se pudo determinar la version del loader del modpack.')
      }
      const packName = manifest.name || stripArchiveBasename(archivePath)
      const { instanceId, minecraftRoot } = createImportInstanceDirs(packName)
      instanceDir = path.join(getKindyrDataRoot(), 'instances', instanceId)
      const tempInstance = {
        id: instanceId,
        name: packName,
        version: manifest.minecraftVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
        versionType: 'release',
        type: 'modpack',
        source: 'curseforge',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(tempInstance, null, 2))
      let failedDownloads = []
      try {
        onProgress({ stage: 'downloading', done: 0, total: manifest.files.length, message: 'Descargando mods...' })
        const installed = await installCurseForgeFromLocalArchive(archivePath, minecraftRoot, {
          manifest,
          maxConcurrent,
          onProgress
        })
        failedDownloads = installed.failedDownloads
      } catch (err) {
        if (instanceDir) try { fs.rmSync(instanceDir, { recursive: true, force: true }) } catch { }
        throw err
      }
      const instance = {
        id: instanceId,
        name: packName,
        version: manifest.minecraftVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
        versionType: 'release',
        type: 'modpack',
        source: 'curseforge',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(instance, null, 2))
      const instances = loadCustomInstances()
      const existingIdx = instances.findIndex(i => i.id === instanceId)
      if (existingIdx >= 0) instances[existingIdx] = instance
      else instances.push(instance)
      saveCustomInstances(instances)
      return { ok: true, name: packName, warnings: failedDownloads.length, instanceId }
    }

    // --- .zip genérico (launcher oficial / copia manual): extraer tal cual ---
    const fallbackName = stripArchiveBasename(archivePath)
    const genericMeta = await detectGenericPackMeta(archivePath, archiveEntries, fallbackName)
    let { loader: genericLoader, loaderVersion: genericLoaderVersion } = genericMeta
    if (genericLoader !== 'vanilla' && !genericLoaderVersion && genericMeta.mcVersion && genericMeta.mcVersion !== 'unknown') {
      try {
        const supported = await getSupportedMinecraftVersions(genericLoader)
        genericLoaderVersion = pickLatestLoaderVersion(genericLoader, genericMeta.mcVersion, supported)
      } catch {}
      if (!genericLoaderVersion) {
        genericLoader = 'vanilla'
        genericLoaderVersion = ''
      }
    }
    const { instanceId: genericId, minecraftRoot: genericRoot } = createImportInstanceDirs(genericMeta.name)
    instanceDir = path.join(getKindyrDataRoot(), 'instances', genericId)
    const tempGeneric = {
      id: genericId,
      name: genericMeta.name,
      version: genericMeta.mcVersion,
      loader: genericLoader,
      loaderVersion: genericLoader === 'vanilla' ? '' : genericLoaderVersion,
      versionType: 'release',
      type: 'modpack',
      source: 'local-zip',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(tempGeneric, null, 2))
    let genericWarnings = 0
    try {
      const installed = await installGenericZipArchive(archivePath, genericRoot, { onProgress })
      genericWarnings = Array.isArray(installed.skipped) ? installed.skipped.length : 0
    } catch (err) {
      if (instanceDir) try { fs.rmSync(instanceDir, { recursive: true, force: true }) } catch { }
      throw err
    }
    const genericInstance = {
      id: genericId,
      name: genericMeta.name,
      version: genericMeta.mcVersion,
      loader: genericLoader,
      loaderVersion: genericLoader === 'vanilla' ? '' : genericLoaderVersion,
      versionType: 'release',
      type: 'modpack',
      source: 'local-zip',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(genericInstance, null, 2))
    const genericInstances = loadCustomInstances()
    const genericIdx = genericInstances.findIndex(i => i.id === genericId)
    if (genericIdx >= 0) genericInstances[genericIdx] = genericInstance
    else genericInstances.push(genericInstance)
    saveCustomInstances(genericInstances)
    return { ok: true, name: genericMeta.name, warnings: genericWarnings, instanceId: genericId }
  } catch (err) {
    if (instanceDir) try { fs.rmSync(instanceDir, { recursive: true, force: true }) } catch { }
    console.error('[import-mrpack] fallo:', archivePath, err && err.message, err && err.stack)
    return { ok: false, error: err.message }
  }
})

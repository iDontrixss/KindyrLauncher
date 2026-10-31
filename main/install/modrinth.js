// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { extractZipEntries, readZipEntryBuffer } = require('../../archive-utils')
const { getClientMrpackFiles, verifyMrpackFile } = require('../../mrpack-utils')
const { downloadSingleFileVerified, downloadToFile, pickPrimaryFile, resolveLocalDownloadDir } = require('../download')
const { getInstallFolder, registerCustomInstance, resolveLoaderFromDependencies } = require('../instance-create')
const { ensureInstanceFolders, ensureMinecraftSubfolders, getInstance, getInstanceDir, getMinecraftRoot, loadCustomInstances, saveCustomInstances } = require('../instances-store')
const { getModrinthVersions, persistModrinthFileMeta, resolveModrinthFileUrlFallback } = require('../providers/modrinth')
const { loadLauncherSettings } = require('../settings')
const { isSafeRelativePath, runWithConcurrency, safePath, sanitizeFileName, sanitizeInstanceId } = require('../util')
const { getSupportedMinecraftVersions, pickLatestLoaderVersion } = require('../versions')

function pickLatestVersion(versions, versionType) {
  const list = Array.isArray(versions) ? versions : []
  let latest = null
  let latestTimestamp = -Infinity
  for (const version of list) {
    if (versionType && version.version_type !== versionType) continue
    const timestamp = Date.parse(version.date_published || '') || 0
    if (!latest || timestamp > latestTimestamp) {
      latest = version
      latestTimestamp = timestamp
    }
  }
  return latest
}

async function extractMrpackOverrides(archivePath, minecraftRoot, opts = {}) {
  const onEntry = typeof opts.onEntry === 'function' ? opts.onEntry : null
  const { skipped } = await extractZipEntries(archivePath, minecraftRoot, {
    maxEntryBytes: 512 * 1024 * 1024,
    maxTotalBytes: 2 * 1024 * 1024 * 1024,
    // Tolerante como el resto de importaciones locales: una entrada hostil
    // aislada se salta y se reporta, no aborta un modpack real.
    skipInvalid: true,
    mapEntry(normalized) {
      const prefixes = ['overrides/', 'client-overrides/']
      const prefix = prefixes.find(item => normalized.startsWith(item))
      if (!prefix) return null
      const relative = normalized.slice(prefix.length)
      return isSafeRelativePath(relative) ? relative : null
    },
    ...(onEntry ? { onEntry } : {})
  })
  return { skipped }
}

async function downloadMrpackFile(packFile, minecraftRoot) {
  const destination = safePath(minecraftRoot, packFile.path)
  await fs.promises.mkdir(path.dirname(destination), { recursive: true })
  // Intentar cada URL, con fallback Modrinth por hash si todas fallan (P0-1 URL stale)
  const triedUrls = [...packFile.downloads]
  for (const url of triedUrls) {
    try {
      await downloadToFile(url, destination)
      if (await verifyMrpackFile(destination, packFile.hashes)) {
        try {
          const instanceId = path.basename(path.dirname(minecraftRoot))
          if (instanceId) {
            const stat = fs.statSync(destination)
            persistModrinthFileMeta(instanceId, {
              path: packFile.path,
              hashes: packFile.hashes,
              fileSize: packFile.fileSize || stat.size,
              downloads: packFile.downloads,
              env: packFile.env || { client: 'required' },
              projectId: packFile.projectId || '',
              versionId: packFile.versionId || '',
              filename: path.basename(packFile.path),
              primary: false
            })
          }
        } catch {}
        return true
      }
      await fs.promises.rm(destination, { force: true })
    } catch {
      await fs.promises.rm(destination, { force: true }).catch(() => {})
    }
  }
  // Fallback: si todas fallaron y tenemos projectId/versionId, intentar resolver URL fresca
  if (packFile.projectId || packFile.versionId) {
    try {
      const fallbackMeta = { ...packFile, projectId: packFile.projectId || '', versionId: packFile.versionId || '' }
      const freshUrl = await resolveModrinthFileUrlFallback(fallbackMeta)
      if (freshUrl && !triedUrls.includes(freshUrl)) {
        try {
          await downloadToFile(freshUrl, destination)
          if (await verifyMrpackFile(destination, packFile.hashes)) {
            try {
              const instanceId = path.basename(path.dirname(minecraftRoot))
              if (instanceId) {
                const stat = fs.statSync(destination)
                const updatedDownloads = [freshUrl, ...packFile.downloads.filter(u => u !== freshUrl)]
                persistModrinthFileMeta(instanceId, {
                  path: packFile.path,
                  hashes: packFile.hashes,
                  fileSize: packFile.fileSize || stat.size,
                  downloads: updatedDownloads,
                  env: packFile.env || { client: 'required' },
                  projectId: packFile.projectId || '',
                  versionId: packFile.versionId || '',
                  filename: path.basename(packFile.path),
                  primary: false
                })
              }
            } catch {}
            return true
          }
          await fs.promises.rm(destination, { force: true })
        } catch {
          await fs.promises.rm(destination, { force: true }).catch(() => {})
        }
      }
    } catch {}
  }
  return false
}

// P0-5: flujo común mrpack — validación, filtrado, descarga, extracción, progreso, persistencia
async function installFromMrpackArchive(archivePath, minecraftRoot, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}
  const maxConcurrent = Math.max(1, Math.min(Number(opts.maxConcurrent) || 6, 20))
  const strictRejected = opts.strictRejected !== false
  let index = opts.index || null
  if (!index) {
    const indexBytes = await readZipEntryBuffer(archivePath, 'modrinth.index.json')
    if (!indexBytes) throw new Error('El .mrpack o .zip no trae modrinth.index.json.')
    index = JSON.parse(indexBytes.toString('utf8'))
  }
  if (index.formatVersion !== 1) throw new Error(`Versión de formato no soportada: ${index.formatVersion}`)
  if (index.game !== 'minecraft') throw new Error('Pack no es de Minecraft')
  const prepared = getClientMrpackFiles(index)
  // Para beta: si viene de Modrinth con env, conservar; si no, fallback {client:"required"} ya en persistencia
  if (strictRejected && prepared.rejected.length) {
    throw new Error(`El modpack contiene ${prepared.rejected.length} archivo(s) sin una descarga segura.`)
  }
  const packFiles = prepared.accepted
  const total = packFiles.length
  let done = 0
  const failedDownloads = [...prepared.rejected.map(f => `${f.path} (${f.error})`)]
  // Progreso overrides (mantenido para compatibilidad con import-mrpack)
  onProgress({ stage: 'overrides', done: 0, total: 0, message: 'Extrayendo archivos...' })
  // NOTA P0-5: orden ahora es descarga → extracción (unificado). Antes import era extracción → descarga.
  // Si falla a mitad, el estado parcial difiere (antes quedaban overrides sin mods, ahora mods sin overrides),
  // pero el resultado final exitoso es equivalente y la limpieza en catch borra instanceDir completo.
  // Descarga con concurrencia unificada (antes install usaba runWithConcurrency configurable, import usaba batch 6 serial)
  // getClientMrpackFiles(index) y downloadMrpackFile(file, minecraftRoot) son el núcleo común
  await runWithConcurrency(packFiles, maxConcurrent, async packFile => {
    const ok = await downloadMrpackFile(packFile, minecraftRoot)
    if (!ok) failedDownloads.push(packFile.path)
    done++
    onProgress({ stage: 'downloading', done, total, message: `Descargando mods... ${done}/${total}` })
  })
  // Extracción overrides (solo overrides/client-overrides, ignora server-overrides)
  // Heartbeat por archivo: en packs con overrides pesados la extracción tarda
  // minutos y sin esto la UI parecía colgada en "Extrayendo archivos...".
  const { skipped: overrideSkipped } = await extractMrpackOverrides(archivePath, minecraftRoot, {
    onEntry: ({ index }) => onProgress({ stage: 'overrides', done: index, total: 0, message: `Extrayendo archivos... ${index}` })
  })
  if (Array.isArray(overrideSkipped) && overrideSkipped.length) {
    for (const item of overrideSkipped) failedDownloads.push(`override omitido: ${item.sourceName || '(sin nombre)'}`)
  }
  onProgress({ stage: 'done', done: total, total, message: 'Completado' })
  return { index, prepared, packFiles, failedDownloads }
}

async function installMrpackInstance(version, project, options = {}) {
  const file = pickPrimaryFile(version)
  const baseName = sanitizeInstanceId(project.slug || project.title || version.name)
  const instanceId = baseName + '-' + sanitizeInstanceId(version.version_number || version.id).slice(0, 20) + '-' + Date.now().toString(36)
  const instanceDir = getInstanceDir(instanceId)
  const minecraftRoot = getMinecraftRoot(instanceId)
  fs.mkdirSync(instanceDir, { recursive: true })
  fs.mkdirSync(minecraftRoot, { recursive: true })

  try {
  const mrpackPath = path.join(instanceDir, sanitizeFileName(file.filename || project.slug || 'modpack') + '.mrpack')
  await downloadSingleFileVerified(file.url, mrpackPath, file.hashes, file.filename || project.title || 'Modpack Modrinth')
  const maxDownloads = Math.max(
    1,
    Math.min(Number(loadLauncherSettings().maxConcurrentDownloads) || 6, 20)
  )
  ensureMinecraftSubfolders(instanceId)
  const { index, failedDownloads } = await installFromMrpackArchive(mrpackPath, minecraftRoot, { maxConcurrent: maxDownloads, strictRejected: true })
  if (failedDownloads.length) {
    throw new Error(`No se pudieron importar ${failedDownloads.length} archivo(s) del modpack.`)
  }
  const dependencies = index.dependencies || {}
  const minecraftVersion = String(dependencies.minecraft || version.game_versions?.[0] || '').trim() || 'unknown'

  let { loader, loaderVersion } = resolveLoaderFromDependencies(dependencies, minecraftVersion)
  const selectedLoader = String(options.selectedLoader || '').trim()
  if (selectedLoader && selectedLoader !== 'minecraft' && selectedLoader !== 'any') {
    loader = selectedLoader
    const fromDeps = resolveLoaderFromDependencies(dependencies, minecraftVersion)
    if (fromDeps.loader === loader && fromDeps.loaderVersion) {
      loaderVersion = fromDeps.loaderVersion
    }
  }

  if (loader !== 'vanilla' && !loaderVersion) {
    const supported = await getSupportedMinecraftVersions(loader)
    loaderVersion = pickLatestLoaderVersion(loader, minecraftVersion, supported)
  }

  if (loader !== 'vanilla' && !loaderVersion) {
    throw new Error('No se pudo determinar la version del loader para este modpack.')
  }

  const instance = {
    id: instanceId,
    name: project.title || index.name || 'Modpack',
    version: minecraftVersion,
    loader,
    loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
    type: 'modpack',
    source: 'modrinth',
    projectId: project.project_id || project.id,
    slug: project.slug,
    versionId: version.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  registerCustomInstance(instance)
  fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(instance, null, 2))
  return { instance, path: instanceDir }
  } catch (error) {
    await fs.promises.rm(instanceDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function installModrinthProject(payload = {}) {
  const versionId = String(payload.versionId || '').trim()
  const project = payload.project || {}
  const projectType = String(project.project_type || payload.projectType || 'mod')
  const installKind = String(payload.installKind || projectType)
  const destination = String(payload.destination || 'downloads')
  // El loader que filtra versiones depende del TIPO, no de la instancia:
  // resourcepacks/shaders/datapacks declaran loader "minecraft" en Modrinth,
  // así que un loader de mods (fabric/...) o "vanilla" los dejaría sin
  // resultados ("No hay versiones compatibles") aunque sean compatibles.
  const versionLoader = normalizeVersionLoaderForKind(getProjectInstallKindFromProject(project), payload.loader)

  let version = null
  if (versionId) {
    const allVersions = await getModrinthVersions({
      projectId: project.project_id || project.id || project.slug
    })
    version = allVersions.find(item => item.id === versionId) || null
  }

  if (!version) {
    const versions = await getModrinthVersions({
      projectId: project.project_id || project.id || project.slug,
      gameVersion: payload.gameVersion,
      loader: versionLoader,
      versionType: payload.versionType
    })
    version = pickLatestVersion(versions, payload.versionType)
  }

  if (!version) throw new Error('No hay versiones compatibles para esa combinacion.')
  const file = pickPrimaryFile(version)

  if (destination === 'downloads') {
    const downloadsDir = resolveLocalDownloadDir(payload.downloadDir || payload.downloadPath || payload.localPath)
    const target = path.join(downloadsDir, sanitizeFileName(file.filename || project.slug || project.title || 'modrinth-file'))
    const downloaded = await downloadSingleFileVerified(file.url, target, file.hashes, file.filename || project.title || 'Archivo Modrinth')
    return { type: 'download', path: downloaded.path, version }
  }

  if (projectType === 'modpack') {
    const installed = await installMrpackInstance(version, project, {
      selectedLoader: payload.loader
    })
    return { type: 'instance', path: installed.path, instance: installed.instance, version }
  }

  const instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  ensureInstanceFolders(instance)
  const folder = getInstallFolder(projectType, installKind, instance.id)
  const target = path.join(folder, sanitizeFileName(file.filename || project.slug || project.title || 'modrinth-file'))
  const downloaded = await downloadSingleFileVerified(file.url, target, file.hashes, file.filename || project.title || 'Archivo Modrinth')
  // La descarga ya fue verificada contra el hash del proveedor: persistir metadata
  // para exportar el .mrpack y re-resolver URLs si el CDN rota.
  try {
    const hashes = file.hashes || {}
    const rel = path.relative(getMinecraftRoot(instance.id), target).replace(/\\/g, '/')
    // Verificar env Modrinth: version/files no traen env; project.client_side/server_side no es por-file, fallback documentado
    const env = { client: 'required' }
    persistModrinthFileMeta(instance.id, {
      path: rel,
      hashes,
      fileSize: file.size || fs.statSync(target).size,
      downloads: [file.url],
      env,
      projectId: String(project.project_id || project.id || ''),
      versionId: String(version.id || ''),
      filename: file.filename || path.basename(target),
      primary: Boolean(file.primary)
    })
  } catch {}
  return { type: 'content', path: downloaded.path, instance, version }
}

async function installLatestReleaseProject(payload = {}) {
  let instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  if (!instance.version || instance.version === 'unknown') throw new Error('La instancia no tiene version de Minecraft valida.')

  const project = payload.project || {}
  const projectType = String(project.project_type || 'mod')
  const installKind = getProjectInstallKindFromProject(project)
  const needsLoader = installKind === 'mod'
  let loader = needsLoader && instance.loader && instance.loader !== 'vanilla'
    ? instance.loader
    : 'minecraft'
  let versionId = ''
  let previousCustomInstances = null
  let previousInstanceMetadata = null
  let instanceMetadataFile = ''

  if (needsLoader && (!instance.loader || instance.loader === 'vanilla')) {
    const projectId = project.project_id || project.id || project.slug
    const versions = await getModrinthVersions({
      projectId,
      gameVersion: instance.version,
      versionType: 'release'
    })
    const loaderPreference = ['fabric', 'neoforge', 'forge', 'quilt']
    let automatic = null

    for (const candidate of loaderPreference) {
      const projectVersion = pickLatestVersion(
        versions.filter(version => Array.isArray(version.loaders) && version.loaders.includes(candidate)),
        'release'
      )
      if (!projectVersion) continue
      const supported = await getSupportedMinecraftVersions(candidate)
      const loaderVersion = pickLatestLoaderVersion(candidate, instance.version, supported)
      if (!loaderVersion) continue
      automatic = { loader: candidate, loaderVersion, projectVersion }
      break
    }

    if (!automatic) {
      throw new Error('No hay un loader compatible para instalar este mod en Minecraft ' + instance.version + '.')
    }

    loader = automatic.loader
    versionId = automatic.projectVersion.id
    instance = {
      ...instance,
      loader,
      loaderVersion: automatic.loaderVersion,
      type: 'loader',
      updatedAt: new Date().toISOString()
    }
    previousCustomInstances = loadCustomInstances()
    instanceMetadataFile = path.join(getInstanceDir(instance.id), 'instance.json')
    previousInstanceMetadata = fs.existsSync(instanceMetadataFile)
      ? fs.readFileSync(instanceMetadataFile)
      : null
    registerCustomInstance(instance)
    ensureInstanceFolders(instance)
    fs.writeFileSync(
      instanceMetadataFile,
      JSON.stringify(instance, null, 2)
    )
  }

  try {
    const baseArgs = {
      project,
      installKind,
      destination: 'instance',
      instanceId: instance.id,
      gameVersion: instance.version,
      loader,
      versionId
    }
    try {
      return await installModrinthProject({ ...baseArgs, versionType: 'release' })
    } catch (error) {
      // Muchos proyectos (sobre todo resourcepacks/shaders) publican todo
      // como beta/alpha y nunca como release: si no hay release compatible,
      // reintentar con cualquier canal antes de rendirse. Solo aplica al
      // error de "sin compatibles", no a fallos reales (red, hash, disco).
      const noCompatible = /no hay versiones compatibles/i.test((error && error.message) || '')
      if (versionId || !noCompatible) throw error
      return await installModrinthProject(baseArgs)
    }
  } catch (error) {
    if (previousCustomInstances) {
      saveCustomInstances(previousCustomInstances)
      if (previousInstanceMetadata) fs.writeFileSync(instanceMetadataFile, previousInstanceMetadata)
      else if (fs.existsSync(instanceMetadataFile)) fs.unlinkSync(instanceMetadataFile)
    }
    throw error
  }
}

function getProjectInstallKindFromProject(project) {
  const categories = (project && (project.categories || project.display_categories)) || []
  if (categories.includes('datapack')) return 'datapack'
  return String((project && project.project_type) || 'mod')
}

const MOD_LOADER_IDS = new Set(['fabric', 'forge', 'neoforge', 'quilt'])

// Normaliza el loader con el que se filtran versiones según el tipo de
// proyecto. Los callers suelen pasar el loader de la INSTANCIA (ej. fabric),
// que no existe en versiones de resourcepacks/shaders/datapacks (usan
// "minecraft") ni en plugins de servidor: sin esto el filtro devuelve vacío
// aunque haya versiones compatibles con la versión de Minecraft.
function normalizeVersionLoaderForKind(installKind, loader) {
  const normalized = String(loader || '').toLowerCase().trim()
  const kind = String(installKind || 'mod').toLowerCase()
  if (kind === 'resourcepack' || kind === 'shader' || kind === 'datapack') {
    if (!normalized || normalized === 'any' || normalized === 'minecraft') return normalized || 'minecraft'
    return 'minecraft'
  }
  if (kind === 'plugin') {
    if (!normalized || normalized === 'any') return normalized
    if (MOD_LOADER_IDS.has(normalized) || normalized === 'vanilla' || normalized === 'minecraft') return 'any'
    return normalized
  }
  return loader
}

module.exports = {
  getProjectInstallKindFromProject,
  installFromMrpackArchive,
  installLatestReleaseProject,
  installModrinthProject,
  pickLatestVersion
}

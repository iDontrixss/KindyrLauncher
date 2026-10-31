// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { extractZipEntries, readZipEntryBuffer } = require('../../archive-utils')
const { parseCurseForgeManifest, mapCurseForgeOverrideEntry } = require('../../curseforge-modpack')
const { CURSEFORGE_API, MODRINTH_USER_AGENT } = require('../constants')
const { getCurseForgeFiles, pickCurseForgePrimaryFile } = require('../providers/curseforge')
const { getCurseForgeApiKey } = require('../providers/curseforge-key')
const { downloadSingleFileVerified, resolveLocalDownloadDir } = require('../download')
const { getProjectInstallKindFromProject } = require('./modrinth')
const { getInstallFolder, registerCustomInstance } = require('../instance-create')
const { ensureInstanceFolders, ensureMinecraftSubfolders, getInstance, getInstanceDir, getMinecraftRoot } = require('../instances-store')
const { normalizeVersion } = require('../providers/modrinth')
const { loadLauncherSettings } = require('../settings')
const { isSafeRelativePath, runWithConcurrency, sanitizeFileName, sanitizeInstanceId } = require('../util')
const { getSupportedMinecraftVersions, pickLatestLoaderVersion } = require('../versions')

async function installCurseForgeProject(payload = {}) {
  const project = payload.project || {}
  const isCF = Boolean(project._curseForge || project.project_id)
  if (!isCF) throw new Error('Proyecto no es de CurseForge.')
  const modId = String(project.project_id || project.id || '').trim()
  const projectType = String(project.project_type || payload.projectType || 'mod')
  const installKind = String(payload.installKind || projectType)
  const destination = String(payload.destination || 'downloads')
  const gameVersion = payload.gameVersion ? normalizeVersion(payload.gameVersion) : undefined
  const loader = String(payload.loader || '').trim()
  const versionId = String(payload.versionId || '').trim()

  let file = null
  if (versionId) {
    const files = await getCurseForgeFiles({ modId })
    file = files.find(f => String(f.id) === versionId) || null
    if (!file) throw new Error('Versión CurseForge no encontrada.')
  } else {
    // Igual que en Modrinth: el loader de la instancia solo filtra en mods/
    // modpacks. En resourcepacks/shaders/datapacks/plugins excluiría archivos
    // que no declaran modloader aunque sean compatibles con la versión.
    const effectiveKind = getProjectInstallKindFromProject({ ...project, project_type: projectType })
    const files = await getCurseForgeFiles({
      modId,
      gameVersion,
      loader: (effectiveKind === 'mod' || effectiveKind === 'modpack') ? loader : ''
    })
    file = pickCurseForgePrimaryFile(files)
  }

  if (destination === 'downloads') {
    const downloadsDir = resolveLocalDownloadDir(payload.downloadDir || payload.downloadPath || payload.localPath)
    const target = path.join(downloadsDir, sanitizeFileName(file.fileName || file.displayName || project.slug || 'curseforge-file'))
    const downloaded = await downloadSingleFileVerified(file.downloadUrl, target, file.hashes, file.fileName || file.displayName || 'Archivo CurseForge')
    return { type: 'download', path: downloaded.path, version: file, file }
  }
  if (projectType === 'modpack') {
    if (destination === 'downloads') {
      const downloadsDir = resolveLocalDownloadDir(payload.downloadDir || payload.downloadPath || payload.localPath)
      const target = path.join(downloadsDir, sanitizeFileName(file.fileName || project.slug + '.zip'))
      const downloaded = await downloadSingleFileVerified(file.downloadUrl, target, file.hashes, file.fileName || project.slug || 'Modpack CurseForge')
      return { type: 'download', path: downloaded.path, version: file, file }
    }
    const installed = await installCurseForgeModpackInstance(file, project)
    return { type: 'instance', path: installed.path, instance: installed.instance, version: file, file }
  }
  const instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  ensureInstanceFolders(instance)
  const folder = getInstallFolder(projectType, installKind, instance.id)
  const target = path.join(folder, sanitizeFileName(file.fileName || file.displayName || project.slug || 'curseforge-file'))
  const downloaded = await downloadSingleFileVerified(file.downloadUrl, target, file.hashes, file.fileName || file.displayName || 'Archivo CurseForge')
  return { type: 'content', path: downloaded.path, instance, version: file, file }
}

async function installCurseForgeLatestReleaseProject(payload = {}) {
  let instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  if (!instance.version || instance.version === 'unknown') throw new Error('La instancia no tiene versión válida.')
  const project = payload.project || {}
  const installKind = getProjectInstallKindFromProject(project)
  return installCurseForgeProject({
    project,
    installKind,
    destination: 'instance',
    instanceId: instance.id,
    gameVersion: instance.version,
    loader: instance.loader || 'vanilla'
  })
}

async function getCurseForgeSingleFile(modId, fileId) {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) throw new Error('CurseForge no configurado.')
  const url = CURSEFORGE_API + '/mods/' + encodeURIComponent(String(modId)) + '/files/' + encodeURIComponent(String(fileId))
  // Timeout explícito: sin esto un stall de red dejaba la importación del
  // modpack colgada para siempre en "Descargando mods..." (un import de
  // CurseForge hace cientos de estas llamadas).
  const res = await fetch(url, { headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': MODRINTH_USER_AGENT }, signal: AbortSignal.timeout(30000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || body.message || 'CurseForge no respondió bien.')
  return body.data || null
}

async function downloadCurseForgeModpackEntry(entry, modsDir) {
  const detail = await getCurseForgeSingleFile(entry.projectID, entry.fileID)
  if (!detail || !detail.downloadUrl) return false
  const destination = path.join(modsDir, sanitizeFileName(detail.fileName || `cf-${entry.projectID}-${entry.fileID}.jar`))
  // Fail-closed (S9): igual que el resto de single-file, una entrada sin hash
  // verificable del proveedor no se instala. downloadSingleFileVerified lanza
  // con mensaje específico ("bloqueada por seguridad"), que el llamador
  // agrega a failedDownloads y aborta la instalación limpiando instanceDir.
  await downloadSingleFileVerified(
    detail.downloadUrl,
    destination,
    detail.hashes,
    `CurseForge project ${entry.projectID} file ${entry.fileID} (${detail.fileName || 'mod'})`
  )
  return true
}

async function installCurseForgeModpackInstance(file, project) {
  if (!file || !file.downloadUrl) throw new Error('CurseForge: el proyecto no permite descargas por API (solo web).')
  const baseName = sanitizeInstanceId(project.slug || project.title || file.displayName || 'curseforge-modpack')
  const instanceId = (baseName + '-' + Date.now().toString(36)).slice(0, 60)
  const instanceDir = getInstanceDir(instanceId)
  const minecraftRoot = getMinecraftRoot(instanceId)
  fs.mkdirSync(instanceDir, { recursive: true })
  fs.mkdirSync(minecraftRoot, { recursive: true })
  try {
    const zipPath = path.join(instanceDir, sanitizeFileName(file.fileName || project.slug || 'modpack') + '.zip')
    await downloadSingleFileVerified(file.downloadUrl, zipPath, file.hashes, file.fileName || file.displayName || 'Modpack CurseForge')
    const manifestBytes = await readZipEntryBuffer(zipPath, 'manifest.json')
    if (!manifestBytes) throw new Error('El modpack de CurseForge no trae manifest.json.')
    const manifest = parseCurseForgeManifest(manifestBytes)
    let { loader, loaderVersion } = manifest
    if (loader !== 'vanilla' && !loaderVersion) {
      const supported = await getSupportedMinecraftVersions(loader)
      loaderVersion = pickLatestLoaderVersion(loader, manifest.minecraftVersion, supported)
    }
    if (loader !== 'vanilla' && !loaderVersion) {
      throw new Error('No se pudo determinar la version del loader del modpack.')
    }
    ensureMinecraftSubfolders(instanceId)
    const modsDir = path.join(minecraftRoot, 'mods')
    const maxConcurrent = Math.max(1, Math.min(Number(loadLauncherSettings().maxConcurrentDownloads) || 6, 20))
    const failedDownloads = []
    await runWithConcurrency(manifest.files, maxConcurrent, async (entry) => {
      try {
        const ok = await downloadCurseForgeModpackEntry(entry, modsDir)
        if (!ok) failedDownloads.push(`project ${entry.projectID} file ${entry.fileID}`)
      } catch (error) {
        failedDownloads.push(`project ${entry.projectID} file ${entry.fileID} (${error.message || error})`)
      }
    })
    await extractZipEntries(zipPath, minecraftRoot, {
      maxEntryBytes: 512 * 1024 * 1024,
      maxTotalBytes: 2 * 1024 * 1024 * 1024,
      mapEntry: (normalized) => {
        const relative = mapCurseForgeOverrideEntry(normalized, manifest.overrides)
        return relative && isSafeRelativePath(relative) ? relative : null
      }
    })
    if (failedDownloads.length) {
      throw new Error(`No se pudieron descargar ${failedDownloads.length} archivo(s) del modpack.`)
    }
    const instance = {
      id: instanceId,
      name: manifest.name || project.title || 'Modpack',
      version: manifest.minecraftVersion,
      loader,
      loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
      type: 'modpack',
      source: 'curseforge',
      projectId: String(project.project_id || project.id || ''),
      slug: project.slug,
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

module.exports = {
  downloadCurseForgeModpackEntry,
  installCurseForgeLatestReleaseProject,
  installCurseForgeProject
}

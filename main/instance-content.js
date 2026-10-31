// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { downloadSingleFileVerified, pickPrimaryFile } = require('./download')
const { pickLatestVersion } = require('./install/modrinth')
const { ensureInstanceFolders, getInstance, instanceFolders } = require('./instances-store')
const { getModrinthProjectMini, getModrinthVersions, loadModrinthFilesMeta, modrinthJson, persistModrinthFileMeta, saveModrinthFilesMetaAtomic } = require('./providers/modrinth')
const { listFiles, safeFileName, sanitizeFileName } = require('./util')

function hashLocalFile(filePath, algo = 'sha1') {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo)
    const s = fs.createReadStream(filePath)
    s.on('data', d => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
    s.on('error', reject)
  })
}

// Identifica archivos subidos a mano (sin meta) por hash sha1 contra Modrinth:
// así recuperan pfp/título/autor/versión y entran al flujo de updates.
async function identifyInstanceContentFiles(instanceId, limit = 30) {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  ensureInstanceFolders(instance)
  const candidates = listInstanceContent(instanceId)
    .filter(i => !i.projectId && i.entryType !== 'folder')
    .filter(i => Number(i.size) > 0 && Number(i.size) <= 400 * 1024 * 1024)
    .slice(0, Math.max(1, Math.min(Number(limit) || 30, 60)))
  const identified = []
  const maxConcurrent = 3
  let idx = 0
  async function worker() {
    while (idx < candidates.length) {
      const item = candidates[idx++]
      try {
        const resolved = resolveContentDir(instanceId, item.kind)
        const fullPath = path.join(resolved.folder, item.file)
        if (!fs.existsSync(fullPath)) continue
        const sha1 = await hashLocalFile(fullPath, 'sha1')
        let version = null
        try {
          version = await modrinthJson('/version_file/' + encodeURIComponent(sha1), { algorithm: 'sha1' })
        } catch { version = null }
        if (!version || !version.id || !version.project_id) continue
        const files = Array.isArray(version.files) ? version.files : []
        const match = files.find(f => String((f.hashes || {}).sha1 || '').toLowerCase() === sha1.toLowerCase()) || files.find(f => f.primary) || files[0]
        if (!match || !match.url) continue
        let mini = null
        try { mini = await getModrinthProjectMini(version.project_id) } catch { mini = null }
        try {
          persistModrinthFileMeta(instanceId, {
            path: item.dir + '/' + item.file,
            hashes: match.hashes || { sha1 },
            fileSize: fs.statSync(fullPath).size,
            downloads: [match.url],
            env: { client: 'required' },
            projectId: String(version.project_id || ''),
            versionId: String(version.id || ''),
            filename: item.file,
            primary: Boolean(match.primary)
          })
        } catch {}
        identified.push({
          id: item.id,
          kind: item.kind,
          file: item.file,
          projectId: String(version.project_id || ''),
          versionId: String(version.id || ''),
          versionNumber: version.version_number || version.name || '',
          title: mini ? mini.title : '',
          iconUrl: mini ? mini.iconUrl : '',
          author: mini ? mini.author : '',
          projectType: mini ? mini.projectType : '',
          url: mini ? mini.url : ''
        })
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxConcurrent, Math.max(1, candidates.length)) }, () => worker()))
  return { identified, checked: candidates.length }
}

function stripDisabledSuffix(name) {
  return String(name || '').replace(/\.disabled$/i, '')
}

function isContentEnabled(name) {
  return !/\.disabled$/i.test(String(name || ''))
}

// Centro de control: contenido unificado (mods, resourcepacks, shaders, datapacks).
// Cada entrada expone kind + meta Modrinth (projectId/versionId) cuando existe,
// para que el frontend pueda mostrar pfp/título/autor y chequear updates
// compatibles con la versión de la instancia.
const INSTANCE_CONTENT_KINDS = {
  mod: { dir: 'mods', label: 'Mod' },
  resourcepack: { dir: 'resourcepacks', label: 'Resource pack' },
  shader: { dir: 'shaderpacks', label: 'Shader' },
  datapack: { dir: 'datapacks', label: 'Datapack' }
}

// Subida de archivos (diálogo + drag&drop): cotas compartidas.
const MAX_UPLOAD_FILES = 20
const MAX_UPLOAD_FILE_BYTES = 2 * 1024 * 1024 * 1024
const UPLOAD_ALLOWED_EXTS = new Set(['.jar', '.zip', '.mrpack'])

// Forma + extensión de UNA ruta propuesta por el renderer (vía drop). Solo
// validación barata sin FS: lo dependiente de disco (existencia, tipo,
// tamaño) se verifica en el momento de copiar. El traversal muere aquí:
// basename descarta directorios y sanitizeFileName la sintaxis hostil.
function dropFileBase(src) {
  if (typeof src !== 'string' || !src.trim()) return { ok: false, file: '?', reason: 'empty' }
  const base = sanitizeFileName(path.basename(src))
  const ext = path.extname(base.replace(/\.disabled$/i, '')).toLowerCase()
  if (!UPLOAD_ALLOWED_EXTS.has(ext)) return { ok: false, file: base, reason: 'type' }
  return { ok: true, file: base, src }
}

function resolveContentDir(instanceId, kind) {
  const key = String(kind || '').toLowerCase()
  const def = Object.hasOwn(INSTANCE_CONTENT_KINDS, key) ? INSTANCE_CONTENT_KINDS[key] : null
  if (!def) throw new Error('Tipo de contenido inválido.')
  return { ...def, kind: String(kind).toLowerCase(), folder: instanceFolders[def.dir](instanceId) }
}

function findContentMeta(metaList, rel, fileName) {
  if (!Array.isArray(metaList)) return null
  const base = stripDisabledSuffix(fileName)
  const relBase = String(rel || '').replace(/\.disabled$/i, '')
  return metaList.find(m => m && (m.path === rel || m.path === relBase)) ||
    metaList.find(m => m && stripDisabledSuffix(m.filename) === base) ||
    null
}

function removeContentMeta(instanceId, rel, fileName) {
  try {
    const list = loadModrinthFilesMeta(instanceId)
    if (!list.length) return
    const base = stripDisabledSuffix(fileName)
    const relBase = String(rel || '').replace(/\.disabled$/i, '')
    const filtered = list.filter(m => {
      if (!m) return false
      if (m.path === rel || m.path === relBase) return false
      if (stripDisabledSuffix(m.filename) === base && String(m.path || '').split('/')[0] === String(rel || '').split('/')[0]) return false
      return true
    })
    if (filtered.length !== list.length) saveModrinthFilesMetaAtomic(instanceId, filtered)
  } catch {}
}

function listInstanceContent(instanceId) {
  const metaList = loadModrinthFilesMeta(instanceId)
  const content = []
  for (const [kind, def] of Object.entries(INSTANCE_CONTENT_KINDS)) {
    const folder = instanceFolders[def.dir](instanceId)
    if (!fs.existsSync(folder)) continue
    const entries = listFiles(folder, entry => {
      if (entry.isDirectory()) return true
      return /\.(jar|zip)(\.disabled)?$/i.test(entry.name)
    })
    for (const entry of entries) {
      const rel = def.dir + '/' + entry.name
      const meta = findContentMeta(metaList, rel, entry.name)
      content.push({
        id: kind + ':' + entry.name,
        kind,
        kindLabel: def.label,
        dir: def.dir,
        file: entry.name,
        baseName: stripDisabledSuffix(entry.name),
        rel,
        entryType: entry.type,
        size: entry.size,
        updatedAt: entry.updatedAt,
        enabled: entry.type === 'folder' ? true : isContentEnabled(entry.name),
        uploaded: !meta,
        projectId: meta ? String(meta.projectId || '') : '',
        versionId: meta ? String(meta.versionId || '') : ''
      })
    }
  }
  content.sort((a, b) => String(a.baseName || a.file).localeCompare(String(b.baseName || b.file), undefined, { sensitivity: 'base' }))
  return content
}

function toggleInstanceContentFile(instanceId, kind, fileName) {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  ensureInstanceFolders(instance)
  const resolved = resolveContentDir(instanceId, kind)
  const cleanName = safeFileName(fileName)
  const currentPath = path.join(resolved.folder, cleanName)
  if (!fs.existsSync(currentPath)) throw new Error('No existe el contenido seleccionado.')
  const nextName = isContentEnabled(cleanName)
    ? cleanName + '.disabled'
    : stripDisabledSuffix(cleanName)
  if (nextName === cleanName) throw new Error('Archivo no válido.')
  const nextPath = path.join(resolved.folder, nextName)
  if (fs.existsSync(nextPath)) throw new Error('Ya existe un archivo con ese nombre.')
  fs.renameSync(currentPath, nextPath)
  return { ok: true, file: nextName }
}

function deleteInstanceContentFile(instanceId, kind, fileName) {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  ensureInstanceFolders(instance)
  const resolved = resolveContentDir(instanceId, kind)
  const cleanName = safeFileName(fileName)
  const target = path.join(resolved.folder, cleanName)
  if (!fs.existsSync(target)) throw new Error('No existe el contenido seleccionado.')
  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true })
  } else {
    fs.unlinkSync(target)
  }
  removeContentMeta(instanceId, resolved.dir + '/' + cleanName, cleanName)
  // Limpiar variante .disabled opuesta si quedó huérfana en meta
  removeContentMeta(instanceId, resolved.dir + '/' + stripDisabledSuffix(cleanName), stripDisabledSuffix(cleanName))
  return { ok: true }
}

function pickCompatibleLoaderForInstance(instance, kind) {
  if (String(kind) !== 'mod') return 'minecraft'
  const loader = String(instance.loader || '').toLowerCase()
  return ['fabric', 'forge', 'neoforge', 'quilt'].includes(loader) ? loader : 'minecraft'
}

async function getContentLatestCompatible(instance, item) {
  const projectId = String(item.projectId || '').trim()
  if (!projectId) return { hasUpdate: false, reason: 'uploaded' }
  // Solo filtrar por loader en mods con loader real; en vanilla o en
  // resourcepacks/shaders/datapacks el filtro escondería versiones válidas.
  const loader = pickCompatibleLoaderForInstance(instance, item.kind)
  const useLoader = item.kind === 'mod' && ['fabric', 'forge', 'neoforge', 'quilt'].includes(loader)
  const versions = await getModrinthVersions({
    projectId,
    gameVersion: instance.version,
    loader: useLoader ? loader : undefined
  })
  if (!versions.length) return { hasUpdate: false, reason: 'no-compatible' }
  const latest = pickLatestVersion(versions, '')
  if (!latest) return { hasUpdate: false, reason: 'no-compatible' }
  const currentId = String(item.versionId || '')
  if (currentId && latest.id === currentId) return { hasUpdate: false, latestVersionId: latest.id, latestNumber: latest.version_number || '' }
  // Si no hay versionId local (instalado a mano pero con meta parcial), igual reportar latest
  return {
    hasUpdate: !currentId || latest.id !== currentId,
    latestVersionId: latest.id,
    latestNumber: latest.version_number || latest.name || '',
    latestName: latest.name || '',
    gameVersions: latest.game_versions || [],
    loaders: latest.loaders || []
  }
}

async function installSpecificContentVersion(instance, item, versionId) {
  const projectId = String(item.projectId || '').trim()
  const targetVersionId = String(versionId || '').trim()
  if (!projectId || !targetVersionId) throw new Error('Proyecto o versión inválida.')
  const allVersions = await getModrinthVersions({ projectId })
  const version = allVersions.find(v => v.id === targetVersionId)
  if (!version) throw new Error('La versión elegida ya no existe.')
  const file = pickPrimaryFile(version)
  const resolved = resolveContentDir(instance.id, item.kind)
  fs.mkdirSync(resolved.folder, { recursive: true })
  const target = path.join(resolved.folder, sanitizeFileName(file.filename || item.baseName || 'modrinth-file'))
  const downloaded = await downloadSingleFileVerified(file.url, target, file.hashes, file.filename || 'Archivo Modrinth')
  // Borrar archivo anterior (ambas variantes enabled/disabled, y nombre viejo si cambió).
  // Primero limpiar su meta vieja para no borrar la que persistimos abajo
  // (si el nombre no cambió, ambas comparten path).
  removeContentMeta(instance.id, resolved.dir + '/' + item.file, item.file)
  removeContentMeta(instance.id, resolved.dir + '/' + item.baseName, item.baseName)
  // Borrar archivo anterior (ambas variantes enabled/disabled, y nombre viejo si cambió)
  for (const candidate of new Set([item.file, item.baseName, item.baseName + '.disabled', stripDisabledSuffix(item.file), stripDisabledSuffix(item.file) + '.disabled'])) {
    if (!candidate || path.basename(candidate) !== candidate) continue
    const p = path.join(resolved.folder, candidate)
    if (p !== downloaded.path && fs.existsSync(p)) {
      const st = fs.statSync(p)
      if (st.isDirectory()) continue
      fs.unlinkSync(p)
    }
  }
  try {
    const rel = resolved.dir + '/' + path.basename(downloaded.path)
    persistModrinthFileMeta(instance.id, {
      path: rel,
      hashes: file.hashes || {},
      fileSize: file.size || fs.statSync(downloaded.path).size,
      downloads: [file.url],
      env: { client: 'required' },
      projectId,
      versionId: String(version.id || ''),
      filename: path.basename(downloaded.path),
      primary: Boolean(file.primary)
    })
  } catch {}
  return { path: downloaded.path, file: path.basename(downloaded.path), version }
}

module.exports = {
  INSTANCE_CONTENT_KINDS,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_BYTES,
  deleteInstanceContentFile,
  dropFileBase,
  getContentLatestCompatible,
  identifyInstanceContentFiles,
  installSpecificContentVersion,
  listInstanceContent,
  resolveContentDir,
  toggleInstanceContentFile
}

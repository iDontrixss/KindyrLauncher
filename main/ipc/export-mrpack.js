// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { writeZip } = require('../../archive-utils')
const { normalizeMrpackPath } = require('../../mrpack-utils')
const state = require('../state')
const { ensureInstanceLoaderVersion } = require('../instance-create')
const { getInstance, getMinecraftRoot } = require('../instances-store')
const { assertTrustedIpcSender } = require('../ipc-guard')
const { loadModrinthFilesMeta } = require('../providers/modrinth')
const { safePath } = require('../util')

ipcMain.handle('export-mrpack', async (_event, instanceId) => {
  try { assertTrustedIpcSender(typeof _event !== 'undefined' ? _event : event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'Instancia no encontrada' }

  try {
    await ensureInstanceLoaderVersion(instance)
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }

  const { dialog } = require('electron')
  const safeExportBase = String(instance.name || 'modpack').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'modpack'
  const result = await dialog.showSaveDialog(state.mainWindow, {
    title: 'Exportar modpack',
    defaultPath: safeExportBase + '.mrpack',
    filters: [{ name: 'Modpack Modrinth', extensions: ['mrpack'] }]
  })
  if (result.canceled || !result.filePath) return { cancelled: true }

  try {
    const instanceMinecraftDir = getMinecraftRoot(instance.id)

    const loaderDependencies = {}
    if (instance.loader === 'fabric') loaderDependencies['fabric-loader'] = instance.loaderVersion
    else if (instance.loader === 'quilt') loaderDependencies['quilt-loader'] = instance.loaderVersion
    else if (instance.loader === 'forge') loaderDependencies.forge = instance.loaderVersion
    else if (instance.loader === 'neoforge') loaderDependencies.neoforge = instance.loaderVersion

    const metaList = loadModrinthFilesMeta(instance.id)
    const metaByPath = new Map(metaList.map(m => [m.path, m]))
    const filesForIndex = []
    const verifiedPaths = new Set()
    const verifiedPathsLower = new Set()
    // Helper streaming hash (evita OOM)
    const hashFile = (filePath, algo) => new Promise((resolve, reject) => {
      const h = crypto.createHash(algo)
      const s = fs.createReadStream(filePath)
      s.on('data', d => h.update(d))
      s.on('end', () => resolve(h.digest('hex')))
      s.on('error', reject)
    })
    // 1) Construir files[] solo para Modrinth + hash coincide (fileSize quick, hash verdad) + downloads https válido
    for (const meta of metaList) {
      let fullPath
      try { fullPath = safePath(instanceMinecraftDir, meta.path) } catch { continue }
      if (!fs.existsSync(fullPath)) continue // eliminado → no exportar
      let stat
      try { stat = fs.statSync(fullPath) } catch { continue }
      // Validar fileSize u32 y coherencia con stat
      const metaSize = Number(meta.fileSize)
      if (!Number.isFinite(metaSize) || metaSize <= 0 || metaSize > 4294967295) continue
      if (stat.size !== metaSize) {
        // size mismatch => modificado, pasará a overrides si hash tampoco coincide (hash es verdad)
      }
      if (stat.isSymbolicLink && stat.isSymbolicLink()) continue
      try { const lst = fs.lstatSync(fullPath); if (lst.isSymbolicLink()) continue } catch { continue }
      const hashes = meta.hashes || {}
      const preferred = (() => {
        if (typeof hashes.sha1 === 'string' && hashes.sha1) return ['sha1', hashes.sha1.toLowerCase()]
        if (typeof hashes.sha512 === 'string' && hashes.sha512) return ['sha512', hashes.sha512.toLowerCase()]
        return null
      })()
      if (!preferred) continue // P0-4 sin hash verificable → no files[], irá a overrides si existe
      const [algo, expected] = preferred
      let actual
      try { actual = await hashFile(fullPath, algo) } catch { continue }
      if (actual !== expected) continue // modificado → overrides
      const downloads = Array.isArray(meta.downloads) ? meta.downloads.filter(u => { try { const url=new URL(u); return url.protocol==='https:' && !url.username && !url.password } catch { return false } }) : []
      if (!downloads.length) continue // sin fuente redistribuible → overrides
      let env = meta.env && typeof meta.env === 'object' && meta.env.client ? meta.env : { client: 'required' }
      try { normalizeMrpackPath(meta.path) } catch { continue }
      let finalDownloads = downloads
      filesForIndex.push({
        path: meta.path,
        hashes: { sha1: String(hashes.sha1 || '').toLowerCase() || undefined, sha512: String(hashes.sha512 || '').toLowerCase() || undefined },
        fileSize: metaSize >>> 0,
        downloads: finalDownloads,
        env
      })
      const last = filesForIndex[filesForIndex.length-1]
      if (!last.hashes.sha1) delete last.hashes.sha1
      if (!last.hashes.sha512) delete last.hashes.sha512
      verifiedPaths.add(meta.path)
      verifiedPathsLower.add(meta.path.toLowerCase())
    }
    const indexFiles = filesForIndex.map(f => ({
      path: f.path,
      hashes: f.hashes,
      fileSize: f.fileSize,
      downloads: f.downloads,
      env: f.env
    }))

    if (!instance.version || instance.version === 'unknown') {
      throw new Error('La instancia no tiene versión de Minecraft válida para exportar.')
    }
    const versionId = (() => {
      const bytes = crypto.randomBytes(6)
      const base62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      let out = ''
      for (let i = 0; i < 8; i++) out += base62[bytes[i % bytes.length] % 62]
      return out.slice(0, 8)
    })()
    const index = {
      formatVersion: 1,
      game: 'minecraft',
      versionId,
      name: instance.name,
      dependencies: {
        minecraft: instance.version,
        ...loaderDependencies
      },
      files: indexFiles
    }
    // Determinar defaultPath seguro
    const safeDefaultName = (() => {
      const base = String(instance.name || 'modpack').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'modpack'
      return base.slice(0, 60)
    })()
    // Sobrescribir result.filePath si es necesario? No, dialog ya dio path, pero asegurar que index es válido
    await writeZip(result.filePath, async zip => {
      zip.addBuffer(Buffer.from(JSON.stringify(index, null, 2)), 'modrinth.index.json')
      // saves excluido por defecto (mundo puede ser GB, no portable). Solo mods/plugins/datapacks/config/resourcepacks/shaderpacks
      const overrideDirs = ['mods', 'plugins', 'datapacks', 'config', 'resourcepacks', 'shaderpacks']
      let totalOverrideBytes = 0
      const MAX_OVERRIDE_TOTAL = 500 * 1024 * 1024 // 500MB límite razonable para overrides
      for (const dir of overrideDirs) {
        const dirPath = path.join(instanceMinecraftDir, dir)
        if (!fs.existsSync(dirPath)) continue
        const addDir = (currentPath, zipPath) => {
          let entries
          try { entries = fs.readdirSync(currentPath) } catch { return }
          for (const file of entries) {
            const fullPath = path.join(currentPath, file)
            const zipFilePath = path.join(zipPath, file)
            let stat
            try { stat = fs.lstatSync(fullPath) } catch { continue }
            if (stat.isSymbolicLink()) continue
            if (stat.isDirectory()) {
              addDir(fullPath, zipFilePath)
            } else if (stat.isFile()) {
              const rel = zipFilePath.replace(/\\/g, '/')
              const relLower = rel.toLowerCase()
              if (verifiedPaths.has(rel) || (process.platform === 'win32' && verifiedPathsLower.has(relLower))) return
              // Límite saves ya excluido, pero para otros dirs también limitar tamaño total
              if (stat.size > 512 * 1024 * 1024) continue // skip archivos >512MB
              if (totalOverrideBytes + stat.size > MAX_OVERRIDE_TOTAL) continue
              totalOverrideBytes += stat.size
              try { zip.addFile(fullPath, 'overrides/' + rel) } catch {}
            }
          }
        }
        addDir(dirPath, dir)
      }
    })
    return { ok: true, name: instance.name }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

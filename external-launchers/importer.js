// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Motor de copia de "Importar desde otro launcher" — Fase 2 parcial (P4/P8).
// NO toca el flujo existente de importación por archivo (import-mrpack).
//
// Contrato:
// - Origen SOLO lectura (stat + read). Jamás se escribe, mueve ni borra nada
//   fuera de las rutas creadas por este módulo.
// - Staging: `<dataRoot>/.tmp-kindyr-import-<rand>/minecraft/...`; al terminar
//   se RENOMBRA a `instances/<id>/`. Si falla o se cancela, se borra el staging.
//   El borrado en error/cancelación solo alcanza al staging o al destino recién
//   renombrado (huérfano sin registro), jamás al origen ni a `instances/` ajeno.
// - Cancelación real a mitad de copia con AbortController (pipeline con signal,
//   chequeo por fichero). No usa el progreso `mrpack-progress` existente.
// - Sin ficheros grandes en memoria: copia por streams.
// - Comprobación de espacio libre antes de copiar (si el SO la expone).
// - Selección por defecto: mods, config, resourcepacks, shaderpacks, saves,
//   options.txt y servers.dat. Excluidos siempre: logs, crash-reports y cachés.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { pipeline } = require('stream/promises')
const { walkSizeBytes, SIZE_EXCLUDED_DIRS } = require('./shared')

// Prefijo identificable de staging. La purga de arranque SOLO borra hijos
// directos de dataRoot con este prefijo; nunca toca `instances/`.
const STAGING_PREFIX = '.tmp-kindyr-import-'

const SELECTABLE_DIRS = ['mods', 'config', 'resourcepacks', 'shaderpacks', 'saves']
const SELECTABLE_FILES = ['options.txt', 'servers.dat']

const DEFAULT_SELECTION = Object.freeze({
  mods: true,
  config: true,
  resourcepacks: true,
  shaderpacks: true,
  saves: true,
  'options.txt': true,
  'servers.dat': true
})

// Excluidos siempre, a cualquier nivel (defensa en profundidad: la copia ya es
// por allowlist en el nivel superior, esto cubre subcarpetas anidadas).
const ALWAYS_EXCLUDED = new Set([
  ...SIZE_EXCLUDED_DIRS,
  'crash-reports',
  'crash_reports',
  'temp',
  'tmp'
])

// Espejo de sanitizeInstanceId (main.js:1558). Fase 2 lo unificará con el
// flujo existente en vez de duplicarlo; aquí vive para no tocar main.js.
function sanitizeInstanceId(value) {
  return String(value || 'instance').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'instance'
}

// Nombre visible único: si ya existe, sufijo " (2)", " (3)", ... Sin sobrescribir.
function uniqueInstanceName(existingNames, base) {
  const taken = new Set((existingNames || []).map(name => String(name)))
  const clean = String(base || 'Instancia').trim() || 'Instancia'
  if (!taken.has(clean)) return clean
  let counter = 2
  while (taken.has(`${clean} (${counter})`)) counter++
  return `${clean} (${counter})`
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const error = new Error('Importación cancelada.')
    error.cancelled = true
    throw error
  }
}

function isAbortError(error) {
  return Boolean(error && (error.cancelled || error.name === 'AbortError' || error.code === 'ABORT_ERR'))
}

async function copyFileStream(src, dest, signal) {
  throwIfAborted(signal)
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  const readSide = fs.createReadStream(src)
  const writeSide = fs.createWriteStream(dest)
  if (signal) await pipeline(readSide, writeSide, { signal })
  else await pipeline(readSide, writeSide)
}

// Copia recursiva con allowlist implícita (el llamador elige raíces) y
// exclusión de ALWAYS_EXCLUDED + symlinks (no se siguen fuera del origen).
async function copyTree(srcDir, destDir, { signal, onFile } = {}) {
  const stack = [{ src: srcDir, dest: destDir }]
  while (stack.length) {
    const { src, dest } = stack.pop()
    throwIfAborted(signal)
    await fs.promises.mkdir(dest, { recursive: true })
    const entries = await fs.promises.readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      throwIfAborted(signal)
      if (ALWAYS_EXCLUDED.has(entry.name.toLowerCase())) continue
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      const stat = await fs.promises.lstat(srcPath)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) {
        stack.push({ src: srcPath, dest: destPath })
      } else if (stat.isFile()) {
        await copyFileStream(srcPath, destPath, signal)
        if (onFile) onFile({ src: srcPath, bytes: stat.size })
      }
    }
  }
}

function loadRegistry(dataRoot) {
  try {
    const raw = fs.readFileSync(path.join(dataRoot, 'instances.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Escritura atómica del registro (tmp + rename, mismo dir): si el proceso
// muere a medias, el registro anterior queda intacto. Espejo de
// saveCustomInstances (main.js).
function saveRegistry(dataRoot, list) {
  fs.mkdirSync(dataRoot, { recursive: true })
  const dest = path.join(dataRoot, 'instances.json')
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
    fs.renameSync(tmp, dest)
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {}
    throw error
  }
}

function freeSpaceBytes(dir) {
  try {
    if (typeof fs.statfsSync !== 'function') return null
    return fs.statfsSync(dir).available
  } catch {
    return null
  }
}

function randomSuffix() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

// source: { gameDir, name, minecraftVersion, loader, loaderVersion, source }
// opts: { dataRoot, selection?, signal?, onProgress? }
// Devuelve { ok:true, ... } | { ok:false, cancelled:true } | { ok:false, error }.
async function copyExternalInstance(source, opts = {}) {
  const dataRoot = opts.dataRoot
  const selection = { ...DEFAULT_SELECTION, ...(opts.selection || {}) }
  const signal = opts.signal || null
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}
  try {
    if (!dataRoot || !path.isAbsolute(dataRoot)) throw new Error('Raíz de datos no válida.')
    const gameDir = source && source.gameDir
    if (!gameDir || !fs.statSync(gameDir).isDirectory()) throw new Error('Carpeta de origen no encontrada.')
    throwIfAborted(signal)

    const registry = loadRegistry(dataRoot)
    const name = uniqueInstanceName(registry.map(item => item.name), source.name)
    const baseId = sanitizeInstanceId(name) || 'instance'
    const instancesRoot = path.join(dataRoot, 'instances')
    fs.mkdirSync(instancesRoot, { recursive: true })

    let instanceId = `${baseId}-${randomSuffix()}`.slice(0, 60)
    while (fs.existsSync(path.join(instancesRoot, instanceId))) {
      instanceId = `${baseId}-${randomSuffix()}`.slice(0, 60)
    }

    // Plan: solo entradas seleccionadas que existan en el origen.
    const plan = []
    for (const dirName of SELECTABLE_DIRS) {
      if (!selection[dirName]) continue
      const src = path.join(gameDir, dirName)
      try {
        if (fs.statSync(src).isDirectory()) plan.push({ src, rel: dirName })
      } catch {}
    }
    for (const fileName of SELECTABLE_FILES) {
      if (!selection[fileName]) continue
      const src = path.join(gameDir, fileName)
      try {
        if (fs.statSync(src).isFile()) plan.push({ src, rel: fileName })
      } catch {}
    }
    if (!plan.length) throw new Error('El origen no contiene nada importable (mods, config, saves, options.txt...).')

    let totalBytes = 0
    for (const item of plan) {
      totalBytes += walkSizeBytes(item.src).bytes
    }
    const free = freeSpaceBytes(dataRoot)
    if (free != null && free < totalBytes) {
      throw new Error(`Espacio libre insuficiente (necesario ~${totalBytes} bytes).`)
    }

    const staging = path.join(dataRoot, STAGING_PREFIX + randomSuffix())
    const stagingMc = path.join(staging, 'minecraft')
    let renamed = false
    const destDir = path.join(instancesRoot, instanceId)
    try {
      fs.mkdirSync(stagingMc, { recursive: true })
      let doneBytes = 0
      onProgress({ stage: 'copying', doneBytes, totalBytes, current: '' })
      for (const item of plan) {
        throwIfAborted(signal)
        const stat = fs.statSync(item.src)
        if (stat.isDirectory()) {
          await copyTree(item.src, path.join(stagingMc, item.rel), {
            signal,
            onFile: ({ src, bytes }) => {
              doneBytes += bytes
              onProgress({ stage: 'copying', doneBytes, totalBytes, current: src })
            }
          })
        } else {
          await copyFileStream(item.src, path.join(stagingMc, item.rel), signal)
          doneBytes += stat.size
          onProgress({ stage: 'copying', doneBytes, totalBytes, current: item.src })
        }
      }
      throwIfAborted(signal)
      fs.renameSync(staging, destDir)
      renamed = true

      const now = new Date().toISOString()
      const instance = {
        id: instanceId,
        name,
        version: source.minecraftVersion || 'unknown',
        loader: source.loader || 'vanilla',
        loaderVersion: source.loader === 'vanilla' ? '' : (source.loaderVersion || ''),
        versionType: 'release',
        type: 'modpack',
        source: `external:${(source.source || 'unknown')}`,
        createdAt: now,
        updatedAt: now
      }
      fs.writeFileSync(path.join(destDir, 'instance.json'), JSON.stringify(instance, null, 2))
      const updated = loadRegistry(dataRoot)
      const idx = updated.findIndex(item => item.id === instanceId)
      if (idx >= 0) updated[idx] = instance
      else updated.push(instance)
      saveRegistry(dataRoot, updated)

      onProgress({ stage: 'done', doneBytes: totalBytes, totalBytes, current: '' })
      return { ok: true, instanceId, name, destDir, minecraftRoot: path.join(destDir, 'minecraft'), copiedBytes: doneBytes }
    } catch (error) {
      try {
        fs.rmSync(staging, { recursive: true, force: true })
      } catch {}
      if (renamed) {
        try {
          fs.rmSync(destDir, { recursive: true, force: true })
        } catch {}
      }
      throw error
    }
  } catch (error) {
    if (isAbortError(error)) return { ok: false, cancelled: true, error: 'Importación cancelada.' }
    return { ok: false, error: (error && error.message) || String(error) }
  }
}

// Purga de arranque: SOLO hijos directos con prefijo propio. dataRoot:
// STAGING_PREFIX. tmpRoot (os.tmpdir): copias WAL de app.db. Nunca instances/.
function purgeStaleTempDirs(dataRoot, tmpRoot = os.tmpdir()) {
  const removed = []
  try {
    if (dataRoot) {
      for (const entry of fs.readdirSync(dataRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith(STAGING_PREFIX)) {
          try {
            fs.rmSync(path.join(dataRoot, entry.name), { recursive: true, force: true })
            removed.push(entry.name)
          } catch {}
        }
      }
    }
  } catch {}
  try {
    if (tmpRoot) {
      for (const entry of fs.readdirSync(tmpRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('kindyr-modrinth-db-')) {
          try {
            fs.rmSync(path.join(tmpRoot, entry.name), { recursive: true, force: true })
            removed.push(entry.name)
          } catch {}
        }
      }
    }
  } catch {}
  return { removed }
}

module.exports = {
  STAGING_PREFIX,
  SELECTABLE_DIRS,
  SELECTABLE_FILES,
  DEFAULT_SELECTION,
  ALWAYS_EXCLUDED,
  sanitizeInstanceId,
  uniqueInstanceName,
  copyExternalInstance,
  purgeStaleTempDirs,
  loadRegistry,
  saveRegistry
}

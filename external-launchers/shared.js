// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Utilidades compartidas de los adaptadores de "Importar desde otro launcher".
// Fase 1: detección (solo lectura) + listado. La copia/registro vive en Fase 2.
//
// Reglas que cumplen todos los adaptadores:
// - El origen es SOLO lectura: jamás mover, borrar ni modificar nada.
// - Solo se leen los ficheros de la lista blanca META_FILES de cada adaptador.
//   Nunca cuentas, tokens ni credenciales (ni en logs).
// - Datos no confiables: JSON con tope de tamaño, todo parse defensivo.
// - Loader: valores canónicos 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'.
//   Si no se determina con certeza => loader null => instancia "no compatible".

const fs = require('fs')
const os = require('os')
const path = require('path')

const MAX_JSON_BYTES = 1 * 1024 * 1024
const MAX_WALK_ENTRIES = 20000

// P7: KindyrLauncher solo empaqueta win + linux (package.json build). macOS
// queda marcado como no soportado: los adaptadores no proponen raíces darwin.
const SUPPORTED_PLATFORMS = ['win32', 'linux']

function platformNote(platform = process.platform) {
  if (SUPPORTED_PLATFORMS.includes(platform)) return null
  return `Plataforma no soportada (${platform}): KindyrLauncher solo distribuye builds de Windows y Linux.`
}

// Directorios que no aportan nada a una importación y se excluyen del tamaño.
const SIZE_EXCLUDED_DIRS = new Set([
  'logs', 'crash-reports', 'cache', 'caches', '.cache',
  'webcache2', 'gpu-cache', 'gpu_cache', 'gpuCache', 'blob_storage',
  '__macosx', 'natives', '.fabric', '.mixin.out'
])

const CANONICAL_LOADERS = new Set(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'])

function isDir(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

// Lee JSON no confiable con tope de tamaño. Devuelve null ante cualquier problema.
function safeReadJson(filePath, maxBytes = MAX_JSON_BYTES) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function safeReadText(filePath, maxBytes = 256 * 1024) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function listSubdirs(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(entry => {
        try {
          return entry.isDirectory()
        } catch {
          return false
        }
      })
      .map(entry => entry.name)
  } catch {
    return []
  }
}

// Tamaño en bytes sin cargar nada en memoria (solo stat). No sigue symlinks.
// Devuelve { bytes, truncated }.
function walkSizeBytes(rootDir, { excluded = SIZE_EXCLUDED_DIRS, maxEntries = MAX_WALK_ENTRIES } = {}) {
  let bytes = 0
  let seen = 0
  let truncated = false
  const stack = [rootDir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (seen >= maxEntries) {
        truncated = true
        return { bytes, truncated }
      }
      const full = path.join(current, entry.name)
      let stat
      try {
        stat = fs.lstatSync(full)
      } catch {
        continue
      }
      if (stat.isSymbolicLink()) {
        seen++
        continue
      }
      if (stat.isDirectory()) {
        seen++
        if (excluded.has(entry.name.toLowerCase())) continue
        stack.push(full)
      } else if (stat.isFile()) {
        seen++
        bytes += stat.size
      }
    }
  }
  return { bytes, truncated }
}

// Normaliza un nombre de loader a canónico o null si no se reconoce.
// Nunca inventa: lo desconocido es null (=> "no compatible" en el adaptador).
function normalizeLoaderName(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (!value) return null
  if (['vanilla', 'minecraft', 'none', 'unmodded'].includes(value)) return 'vanilla'
  if (value.includes('neoforge') || value === 'neoforged') return 'neoforge'
  if (value.includes('quilt')) return 'quilt'
  if (value.includes('fabric')) return 'fabric'
  if (value.includes('forge')) return 'forge'
  if (CANONICAL_LOADERS.has(value)) return value
  return null
}

function mcVersionLike(value) {
  const match = String(value || '').match(/(\d+\.\d+(?:\.\d+)?)/)
  return match ? match[1] : null
}

function envelope({ root = null, instances = [], error = null } = {}) {
  return { ok: error == null, root, instances, error }
}

function unsupportedEntry({ id, name, gameDir, reason, meta = {} }) {
  return {
    id,
    name,
    gameDir,
    minecraftVersion: null,
    loader: null,
    loaderVersion: null,
    sizeBytes: null,
    sizeTruncated: false,
    supported: false,
    reason,
    shared: false,
    meta
  }
}

// Resuelve candidatos de raíz según plataforma con env inyectable (testeable).
function envPaths(env = {}) {
  const appData = env.APPDATA || process.env.APPDATA || null
  const home = env.HOME || env.USERPROFILE || process.env.HOME || process.env.USERPROFILE || os.homedir()
  const documents = home ? path.join(home, 'Documents') : null
  return { appData, home, documents }
}

// P9 (Fase 3): resume una selección de instancias para avisar cuando varios
// perfiles comparten gameDir ("se copiará la misma carpeta N veces").
// Entradas: [{ id, name, gameDir, sizeBytes|null }].
// Devuelve { totalBytes, unknownSize, groups: [{ gameDir, sizeBytes, shared, names }] }.
function summarizeGameDirs(entries = []) {
  const groups = new Map()
  let totalBytes = 0
  let unknownSize = false
  for (const entry of entries) {
    const gameDir = String((entry && entry.gameDir) || '')
    const key = gameDir ? path.resolve(gameDir) : '(desconocido)'
    if (!groups.has(key)) groups.set(key, { gameDir: key, sizeBytes: 0, names: [] })
    const group = groups.get(key)
    group.names.push(String((entry && entry.name) || (entry && entry.id) || '(sin nombre)'))
    if (typeof entry.sizeBytes === 'number') {
      group.sizeBytes += entry.sizeBytes
      totalBytes += entry.sizeBytes
    } else {
      unknownSize = true
    }
  }
  return {
    totalBytes,
    unknownSize,
    groups: [...groups.values()].map(group => ({ ...group, shared: group.names.length > 1 }))
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
  }
}

module.exports = {
  MAX_JSON_BYTES,
  SIZE_EXCLUDED_DIRS,
  CANONICAL_LOADERS,
  SUPPORTED_PLATFORMS,
  platformNote,
  isDir,
  isFile,
  safeReadJson,
  safeReadText,
  listSubdirs,
  walkSizeBytes,
  normalizeLoaderName,
  mcVersionLike,
  summarizeGameDirs,
  envelope,
  unsupportedEntry,
  envPaths
}

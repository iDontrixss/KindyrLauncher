// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Adaptador Modrinth App — Fase 1 (detección solo-lectura + listado).
// Verificado en esta máquina (Windows): %APPDATA%\ModrinthApp\profiles\<nombre>
// es la carpeta de juego (mods, saves, options van en la raíz del perfil).
// Metadatos en app.db (SQLite): tabla `instances` + `instance_content_sets`.
// La pista de "tabla profiles" es INCORRECTA: no existe tal tabla (verificado).
//
// Tablas que se leen (SELECT de solo lectura): instances, instance_content_sets,
// settings (solo columna custom_dir). NUNCA se consultan tablas con credenciales
// (minecraft_users, minecraft_device_tokens, modrinth_users, skins, etc.) ni se
// escriben en logs.
// Rutas macOS/Linux: SIN VERIFICAR.

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  isDir,
  listSubdirs,
  walkSizeBytes,
  normalizeLoaderName,
  envelope,
  unsupportedEntry,
  envPaths
} = require('./shared')

// NUNCA se tocan estas tablas (credenciales / datos sensibles). Documentado
// para auditoría; el lector SQL solo nombra las tablas permitidas.
const NEVER_TABLES = [
  'minecraft_users', 'minecraft_device_tokens', 'modrinth_users',
  'custom_minecraft_skins', 'custom_minecraft_skin_textures'
]

function candidateRoots({ platform = process.platform, env = {} } = {}) {
  const { appData, home } = envPaths(env)
  if (platform === 'win32' && appData) {
    return [path.join(appData, 'ModrinthApp')] // Verificado en esta máquina.
  }
  if (platform === 'linux' && home) {
    return [path.join(home, '.local', 'share', 'ModrinthApp')] // SIN VERIFICAR
  }
  // macOS: no soportado (sin target de build). Ver shared.SUPPORTED_PLATFORMS.
  return []
}

// Filas ya leídas de app.db -> entradas. `profilesDir` es <root>/profiles.
// instanceRows: [{ id, name, path }] de `instances` (Verificado).
// contentSets: [{ instance_id, game_version, loader, loader_version }] (Verificado).
// Loader fuera del mapa conocido => null => "no compatible".
function parseDbRows({ instanceRows = [], contentSets = [], profilesDir = '' } = {}) {
  const setByInstance = new Map()
  for (const set of contentSets) {
    if (set && set.instance_id && !setByInstance.has(set.instance_id)) {
      setByInstance.set(set.instance_id, set)
    }
  }
  return instanceRows.map(row => {
    const id = String((row && row.id) || '').trim()
    const profileDir = String((row && row.path) || '').trim()
    const name = String((row && row.name) || '').trim() || profileDir || id
    const key = id || profileDir || name
    const gameDir = profileDir ? path.join(profilesDir, profileDir) : profilesDir
    if (!id || !profileDir || !isDir(gameDir)) {
      return unsupportedEntry({
        id: key || '(sin id)',
        name,
        gameDir,
        reason: !profileDir ? 'Fila de app.db sin carpeta de perfil (path).' : `Carpeta de perfil no encontrada: ${profileDir}`,
        meta: { source: 'modrinth', dbId: id || null }
      })
    }
    const set = setByInstance.get(id) || null
    const minecraftVersion = set && set.game_version ? String(set.game_version) : null
    const loader = normalizeLoaderName(set && set.loader)
    const loaderVersion = set && set.loader_version != null && String(set.loader_version).trim()
      ? String(set.loader_version).trim()
      : null
    if (!minecraftVersion) {
      return {
        ...unsupportedEntry({
          id: key, name, gameDir,
          reason: 'Sin game_version en instance_content_sets de app.db.',
          meta: { source: 'modrinth', dbId: id }
        }),
        loader, loaderVersion
      }
    }
    if (!loader) {
      return {
        ...unsupportedEntry({
          id: key, name, gameDir,
          reason: 'Loader indeterminado en instance_content_sets (no se elige a ciegas).',
          meta: { source: 'modrinth', dbId: id }
        }),
        minecraftVersion, loaderVersion
      }
    }
    const { bytes, truncated } = walkSizeBytes(gameDir)
    return {
      id: key,
      name,
      gameDir,
      minecraftVersion,
      loader,
      loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
      sizeBytes: bytes,
      sizeTruncated: truncated,
      supported: loader === 'vanilla' ? true : Boolean(loaderVersion),
      reason: loader === 'vanilla' || loaderVersion ? null : 'Loader conocido pero sin versión en app.db.',
      shared: false,
      meta: { source: 'modrinth', dbId: id }
    }
  })
}

// Prefijo identificable de las copias temporales de app.db (ver purge en importer).
const DB_COPY_PREFIX = 'kindyr-modrinth-db-'

// Copia app.db + compañeros WAL (-wal/-shm) a un directorio temporal propio.
// El original NUNCA se abre: ni siquiera en solo lectura (el modo WAL podría
// crear/actualizar -shm al abrirlo). Devuelve la ruta de la copia.
function copyAppDbToTemp(appDbPath) {
  const stat = fs.statSync(appDbPath)
  if (!stat.isFile()) throw new Error('app.db no es un fichero.')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), DB_COPY_PREFIX))
  const copyPath = path.join(dir, 'app.db')
  fs.copyFileSync(appDbPath, copyPath)
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const companion = appDbPath + suffix
    try {
      if (fs.statSync(companion).isFile()) fs.copyFileSync(companion, copyPath + suffix)
    } catch {}
  }
  return { dir, copyPath }
}

// Lee app.db en solo lectura SOBRE LA COPIA temporal. Solo SELECTs a tablas
// permitidas. Requiere node:sqlite (Node >= 22.5; verificado en Electron 42).
function readAppDb(appDbPath) {
  let DatabaseSync
  try {
    ;({ DatabaseSync } = require('node:sqlite'))
  } catch {
    return { ok: false, error: 'Lectura de app.db no soportada en este entorno (sin node:sqlite).' }
  }
  let staged = null
  try {
    staged = copyAppDbToTemp(appDbPath)
    const db = new DatabaseSync(staged.copyPath, { readOnly: true })
    try {
      const instanceRows = db.prepare('SELECT id, name, path FROM instances').all()
      const contentSets = db.prepare(
        'SELECT instance_id, game_version, loader, loader_version FROM instance_content_sets'
      ).all()
      let customDir = null
      try {
        const row = db.prepare('SELECT custom_dir FROM settings LIMIT 1').get()
        if (row && row.custom_dir) customDir = String(row.custom_dir)
      } catch {}
      return { ok: true, instanceRows, contentSets, customDir }
    } finally {
      db.close()
    }
  } catch (error) {
    return { ok: false, error: `No se pudo leer app.db: ${error && error.message || error}` }
  } finally {
    if (staged) {
      try {
        fs.rmSync(staged.dir, { recursive: true, force: true })
      } catch {}
    }
  }
}

function listInstances(root) {
  if (!root || !isDir(root)) return envelope({ root, instances: [], error: 'Carpeta de Modrinth App no encontrada.' })
  const appDbPath = path.join(root, 'app.db')
  const profilesDir = path.join(root, 'profiles')
  if (!isDir(profilesDir) && !fs.existsSync(appDbPath)) {
    return envelope({ root, instances: [], error: 'Sin profiles/ ni app.db en la carpeta indicada.' })
  }
  const read = fs.existsSync(appDbPath)
    ? readAppDb(appDbPath)
    : { ok: false, error: 'Sin app.db: no hay metadatos de versión/loader.' }
  if (!read.ok) {
    // Sin metadatos no se puede determinar loader: listado honesto por carpetas.
    const instances = listSubdirs(profilesDir).map(name => unsupportedEntry({
      id: name,
      name,
      gameDir: path.join(profilesDir, name),
      reason: read.error,
      meta: { source: 'modrinth', dbId: null }
    }))
    return envelope({ root, instances })
  }
  const base = read.customDir && isDir(read.customDir) ? read.customDir : root
  const dir = path.join(base, 'profiles')
  const instances = parseDbRows({ instanceRows: read.instanceRows, contentSets: read.contentSets, profilesDir: dir })
  return envelope({ root, instances })
}

function detect({ platform, env, overrideRoot } = {}) {
  if (overrideRoot) {
    return [{ root: overrideRoot, exists: isDir(overrideRoot), source: 'manual' }]
  }
  return candidateRoots({ platform, env }).map(root => ({ root, exists: isDir(root), source: 'default' }))
}

module.exports = {
  id: 'modrinth',
  label: 'Modrinth App',
  NEVER_TABLES,
  DB_COPY_PREFIX,
  candidateRoots,
  parseDbRows,
  copyAppDbToTemp,
  readAppDb,
  listInstances,
  detect
}

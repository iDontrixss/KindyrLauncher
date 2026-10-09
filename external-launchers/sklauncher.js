// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Adaptador SKLauncher — Fase 1 (detección solo-lectura + listado).
// Verificado en esta máquina (Windows):
//   %APPDATA%\.sklauncher\instances.json -> { instances: [{ id, name, type,
//     gameType, minecraftVersion, loaderVersion, directory, ... }] }
//   %APPDATA%\.sklauncher\instances\<id>\ es DIRECTAMENTE la carpeta de juego
//   (mods, saves, options.txt y servers.dat en la raíz; sin subcarpeta
//   'minecraft' ni '.minecraft').
// Instalación portable "...\SKLauncher\instances\<Nombre>\minecraft":
// SIN VERIFICAR (C:\SKLauncher no existe aquí); soportada vía overrideRoot.
// Solo se lee instances.json (+ stat de carpetas). Nunca accounts.json ni
// settings con claves (curseforgeApiKey, clientId) ni logs de credenciales.

const path = require('path')
const {
  isDir,
  safeReadJson,
  walkSizeBytes,
  normalizeLoaderName,
  envelope,
  unsupportedEntry,
  envPaths
} = require('./shared')

const META_FILES = ['instances.json']

function candidateRoots({ platform = process.platform, env = {} } = {}) {
  const { appData, home } = envPaths(env)
  const roots = []
  if (platform === 'win32' && appData) {
    roots.push(path.join(appData, '.sklauncher')) // Verificado en esta máquina.
  } else if (platform === 'linux' && home) {
    roots.push(path.join(home, '.sklauncher')) // SIN VERIFICAR
  }
  // macOS: no soportado (sin target de build). Ver shared.SUPPORTED_PLATFORMS.
  return roots
}

// versionId tipo "1.21.1-neoforge-21.1.247": rescata MC + loader + versión.
// Inferencia sobre UNA muestra real; si no encaja => nulls (no compatible).
function parseVersionId(versionId) {
  const raw = String(versionId || '').trim()
  const mc = (raw.match(/(\d+\.\d+(?:\.\d+)?)/) || [])[1] || null
  const loader = normalizeLoaderName(raw)
  let loaderVersion = null
  if (loader && loader !== 'vanilla') {
    const idx = raw.toLowerCase().lastIndexOf(loader)
    const tail = idx >= 0 ? raw.slice(idx + loader.length).replace(/^[-_\s]+/, '') : ''
    const cleaned = tail.replace(new RegExp('^' + mc.replace(/\./g, '\\.') + '[-_]?'), '')
    loaderVersion = tail.trim() || cleaned.trim() || null
    if (loaderVersion === mc) loaderVersion = null
  }
  return { mc, loader, loaderVersion }
}

// Registros de instances.json -> entradas. `dataRoot` = carpeta con instances.json.
function parseSkInstances(json, dataRoot) {
  const list = json && Array.isArray(json.instances) ? json.instances : []
  return list.map(item => {
    const id = String((item && item.id) || '').trim()
    const name = String((item && item.name) || '').trim() || id || '(sin nombre)'
    const key = id || name
    const mcRaw = String((item && item.minecraftVersion) || '').trim()
    const mcIsPlaceholder = /^(latest-(release|snapshot)|latest|snapshot)$/i.test(mcRaw)
    const gameType = normalizeLoaderName(item && item.gameType)
    const versionId = parseVersionId(item && item.versionId)
    const minecraftVersion = mcIsPlaceholder ? null : (mcRaw.match(/(\d+\.\d+(?:\.\d+)?)/) || [])[1] || versionId.mc
    const loader = gameType || versionId.loader
    let loaderVersion = String((item && item.loaderVersion) || '').trim() || versionId.loaderVersion
    const dirField = String((item && item.directory) || '').trim()
    const gameDir = dirField && isDir(dirField) ? dirField : path.join(dataRoot, 'instances', key)

    if (!isDir(gameDir)) {
      return unsupportedEntry({
        id: key, name, gameDir,
        reason: `Carpeta de instancia no encontrada: ${key}`,
        meta: { source: 'sklauncher', skId: id || null }
      })
    }
    if (!minecraftVersion) {
      return {
        ...unsupportedEntry({
          id: key, name, gameDir,
          reason: `Versión de Minecraft indeterminada (${mcRaw || 'ausente'}).`,
          meta: { source: 'sklauncher', skId: id || null }
        }),
        loader, loaderVersion: loaderVersion || null
      }
    }
    if (!loader) {
      return {
        ...unsupportedEntry({
          id: key, name, gameDir,
          reason: 'Loader indeterminado en instances.json (no se elige a ciegas).',
          meta: { source: 'sklauncher', skId: id || null }
        }),
        minecraftVersion, loaderVersion: loaderVersion || null
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
      reason: loader === 'vanilla' || loaderVersion ? null : 'Loader conocido pero sin versión en instances.json.',
      shared: false,
      meta: { source: 'sklauncher', skId: id || null }
    }
  })
}

function listInstances(root) {
  if (!root || !isDir(root)) return envelope({ root, instances: [], error: 'Carpeta de SKLauncher no encontrada.' })
  const json = safeReadJson(path.join(root, 'instances.json'))
  if (!json) return envelope({ root, instances: [], error: 'instances.json ausente o ilegible.' })
  return envelope({ root, instances: parseSkInstances(json, root) })
}

function detect({ platform, env, overrideRoot } = {}) {
  if (overrideRoot) {
    return [{ root: overrideRoot, exists: isDir(overrideRoot), source: 'manual' }]
  }
  return candidateRoots({ platform, env }).map(root => ({ root, exists: isDir(root), source: 'default' }))
}

module.exports = {
  id: 'sklauncher',
  label: 'SKLauncher',
  META_FILES,
  candidateRoots,
  parseVersionId,
  parseSkInstances,
  listInstances,
  detect
}

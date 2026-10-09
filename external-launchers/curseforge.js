// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Adaptador CurseForge — Fase 1 (detección solo-lectura + listado).
// VERIFICADO en esta máquina (Windows, app CurseForge real instalada):
//   raíz actual: %USERPROFILE%\curseforge\minecraft\Instances\<Nombre>\
//   (la carpeta de instancia ES la carpeta de juego: mods/ en la raíz).
//   minecraftinstance.json verificado con claves: name, gameVersion ("26.3",
//   admite 2 partes), isVanilla (bool), guid, installPath, gameTypeID y
//   baseModLoader: { name: "fabric-0.19.5-26.3", type: 4, forgeVersion,
//   minecraftVersion }. El loader se deduce de baseModLoader.name (verificado
//   para fabric); los `type` numéricos NO se mapean (solo muestra type 4).
//   Hay además un fichero `.curseclient` (guid, 36 bytes) que se ignora.
// Lista blanca de lectura: minecraftinstance.json por instancia. Nada más.
// Ruta histórica Documents\Curse\... y variantes macOS/Linux: SIN VERIFICAR.

const path = require('path')
const {
  isDir,
  isFile,
  safeReadJson,
  listSubdirs,
  walkSizeBytes,
  normalizeLoaderName,
  mcVersionLike,
  envelope,
  unsupportedEntry,
  envPaths
} = require('./shared')

const META_FILES = ['minecraftinstance.json']

function candidateRoots({ platform = process.platform, env = {} } = {}) {
  const { home, documents } = envPaths(env)
  const roots = []
  if (platform === 'win32') {
    // Ruta actual de la app CurseForge. VERIFICADA en esta máquina.
    if (home) roots.push(path.join(home, 'curseforge', 'minecraft', 'Instances'))
    // Ruta histórica (era Twitch/Curse). SIN VERIFICAR.
    if (documents) roots.push(path.join(documents, 'Curse', 'Minecraft', 'Instances'))
  } else if (platform === 'linux' && home) {
    roots.push(path.join(home, 'curseforge', 'minecraft', 'Instances')) // SIN VERIFICAR
  }
  // macOS: no soportado (sin target de build). Ver shared.SUPPORTED_PLATFORMS.
  return roots
}

// "forge-47.4.16" o "fabric-loader-0.16.9" traen la versión embebida en el
// propio campo de loader (SIN VERIFICAR como formato real). Si hay un campo
// de versión dedicado, ese manda; esto es solo rescate defensivo.
function extractEmbeddedLoaderVersion(loaderRaw) {
  const raw = String(loaderRaw || '').trim()
  if (!raw) return null
  const match = raw.match(/(\d[\w.\-+]*)$/)
  if (!match) return null
  const prefix = raw.slice(0, raw.length - match[1].length).toLowerCase()
  if (!/(forge|fabric|quilt|neoforge|loader|minecraft)[-_]*$/.test(prefix)) return null
  return match[1]
}

// Parse de minecraftinstance.json. Claves VERIFICADAS en instalación real:
// name, gameVersion, isVanilla, guid, baseModLoader.{name, type, forgeVersion,
// minecraftVersion}. El resto de claves candidatas son tolerancia defensiva;
// lo que no se determina con certeza queda null (=> "no compatible").
// Nota: los `type` numéricos de baseModLoader NO se mapean (solo hay muestra
// de type 4 = fabric vía name); el loader sale de baseModLoader.name.
function parseMinecraftInstance(json) {
  if (!json || typeof json !== 'object') return { name: null, minecraftVersion: null, loader: null, loaderVersion: null }
  const name = [json.name, json.instanceName, json.title]
    .map(value => String(value || '').trim())
    .find(Boolean) || null
  const versionRaw = [json.gameVersion, json.minecraftVersion, json.gameVersionString, json.version,
    json.baseModLoader && json.baseModLoader.minecraftVersion]
    .map(value => String(value || '').trim())
    .find(Boolean) || null
  if (json.isVanilla === true) {
    return { name, minecraftVersion: mcVersionLike(versionRaw), loader: 'vanilla', loaderVersion: '' }
  }
  const loaderRaw = [json.modLoader, json.loader, json.loaderType, json.modloader,
    json.baseModLoader && json.baseModLoader.name]
    .map(value => String(value || '').trim())
    .find(Boolean) || null
  const loaderVersionRaw = [json.modLoaderVersion, json.loaderVersion,
    json.baseModLoader && json.baseModLoader.version,
    json.baseModLoader && json.baseModLoader.forgeVersion]
    .map(value => String(value || '').trim())
    .find(Boolean) || extractEmbeddedLoaderVersion(loaderRaw)
  return {
    name,
    minecraftVersion: mcVersionLike(versionRaw),
    loader: normalizeLoaderName(loaderRaw),
    loaderVersion: loaderVersionRaw || null
  }
}

function buildEntry(instancesDir, dirName) {
  const dir = path.join(instancesDir, dirName)
  const metaPath = path.join(dir, 'minecraftinstance.json')
  if (!isFile(metaPath)) {
    return unsupportedEntry({
      id: dirName,
      name: dirName,
      gameDir: dir,
      reason: 'Sin minecraftinstance.json en la carpeta.',
      meta: { source: 'curseforge', dir }
    })
  }
  const parsed = parseMinecraftInstance(safeReadJson(metaPath))
  const name = parsed.name || dirName
  if (!parsed.minecraftVersion) {
    return {
      ...unsupportedEntry({
        id: dirName, name, gameDir: dir,
        reason: 'Versión de Minecraft indeterminada en minecraftinstance.json.',
        meta: { source: 'curseforge', dir }
      }),
      loader: parsed.loader,
      loaderVersion: parsed.loaderVersion
    }
  }
  if (!parsed.loader) {
    return {
      ...unsupportedEntry({
        id: dirName, name, gameDir: dir,
        reason: 'Loader indeterminado en minecraftinstance.json (no se elige a ciegas).',
        meta: { source: 'curseforge', dir }
      }),
      minecraftVersion: parsed.minecraftVersion,
      loaderVersion: parsed.loaderVersion
    }
  }
  const { bytes, truncated } = walkSizeBytes(dir)
  return {
    id: dirName,
    name,
    gameDir: dir,
    minecraftVersion: parsed.minecraftVersion,
    loader: parsed.loader,
    loaderVersion: parsed.loader === 'vanilla' ? '' : (parsed.loaderVersion || null),
    sizeBytes: bytes,
    sizeTruncated: truncated,
    supported: parsed.loader === 'vanilla' ? true : Boolean(parsed.loaderVersion),
    reason: parsed.loader === 'vanilla' || parsed.loaderVersion
      ? null
      : 'Loader conocido pero sin versión en minecraftinstance.json.',
    shared: false,
    meta: { source: 'curseforge', dir }
  }
}

function listInstances(root) {
  if (!root || !isDir(root)) return envelope({ root, instances: [], error: 'Carpeta de instancias de CurseForge no encontrada.' })
  const instances = listSubdirs(root).map(name => buildEntry(root, name))
  return envelope({ root, instances })
}

function detect({ platform, env, overrideRoot } = {}) {
  if (overrideRoot) {
    return [{ root: overrideRoot, exists: isDir(overrideRoot), source: 'manual' }]
  }
  return candidateRoots({ platform, env }).map(root => ({ root, exists: isDir(root), source: 'default' }))
}

module.exports = {
  id: 'curseforge',
  label: 'CurseForge',
  META_FILES,
  candidateRoots,
  parseMinecraftInstance,
  listInstances,
  detect
}

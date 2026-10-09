// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Adaptador launcher oficial de Minecraft — Fase 1 (solo lectura + listado).
// Verificado en esta máquina (Windows): %APPDATA%\.minecraft\launcher_profiles.json
//   { profiles: { "<uuid>": { name, gameDir?, lastVersionId, type, ... } } }
// Aquí "instancia" = un perfil. Sin gameDir propio el perfil USA LA RAÍZ
// .minecraft COMPARTIDA con los demás perfiles (shared: true): la Fase 2 debe
// tratar ese caso aparte (no es una carpeta dedicada).
// Solo se leen name/gameDir/lastVersionId. Nunca tokens ni credenciales
// (viven en otras claves/ficheros que este adaptador no abre).
// Rutas macOS/Linux: SIN VERIFICAR.

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

const META_FILES = ['launcher_profiles.json']

function candidateRoots({ platform = process.platform, env = {} } = {}) {
  const { appData, home } = envPaths(env)
  if (platform === 'win32' && appData) {
    return [path.join(appData, '.minecraft')] // Verificado en esta máquina.
  }
  if (platform === 'linux' && home) {
    return [path.join(home, '.minecraft')] // SIN VERIFICAR
  }
  // macOS: no soportado (sin target de build). Ver shared.SUPPORTED_PLATFORMS.
  return []
}

// lastVersionId -> { minecraftVersion, loader, loaderVersion }.
// Muestras reales vistas: "1.21.1", "1.20.1-forge-47.4.16",
// "1.12.2-forge1.12.2-14.23.5.2779", "fabric-loader-0.17.2-1.20.1",
// "neoforge-21.1.248" (SIN versión MC), "latest-release".
// Lo que no encaja con certeza => nulls (no compatible, no a ciegas).
function parseLastVersionId(lastVersionId) {
  const raw = String(lastVersionId || '').trim()
  if (!raw) return { minecraftVersion: null, loader: null, loaderVersion: null }
  if (/^(latest-(release|snapshot)|latest|snapshot)$/i.test(raw)) {
    return { minecraftVersion: null, loader: null, loaderVersion: null }
  }
  let match = raw.match(/^fabric-loader-([\w.\-+]+)-(\d+\.\d+(?:\.\d+)?)$/i)
  if (match) return { minecraftVersion: match[2], loader: 'fabric', loaderVersion: match[1] }
  match = raw.match(/^quilt-loader-([\w.\-+]+)-(\d+\.\d+(?:\.\d+)?)$/i)
  if (match) return { minecraftVersion: match[2], loader: 'quilt', loaderVersion: match[1] }
  match = raw.match(/(\d+\.\d+(?:\.\d+)?)-forge-?(.+)$/i)
  if (match && /forge/i.test(raw)) {
    let tail = match[2].trim()
    // "forge1.12.2-14.23.5.2779" -> quita el prefijo de MC repetido.
    tail = tail.replace(new RegExp('^' + match[1].replace(/\./g, '\\.') + '[-_]?'), '').trim()
    return { minecraftVersion: match[1], loader: 'forge', loaderVersion: tail || null }
  }
  match = raw.match(/^neoforge-([\w.\-+]+)$/i)
  if (match) return { minecraftVersion: null, loader: 'neoforge', loaderVersion: match[1] }
  match = raw.match(/^(\d+\.\d+(?:\.\d+)?)$/)
  if (match && normalizeLoaderName(raw) === null) {
    return { minecraftVersion: match[1], loader: 'vanilla', loaderVersion: '' }
  }
  return { minecraftVersion: null, loader: normalizeLoaderName(raw), loaderVersion: null }
}

// Objeto profiles ya parseado -> entradas. `root` = carpeta .minecraft.
function parseLauncherProfiles(json, root) {
  const profiles = json && json.profiles && typeof json.profiles === 'object' ? json.profiles : {}
  return Object.entries(profiles).map(([profileId, profile]) => {
    const name = String((profile && profile.name) || '').trim() || `Perfil ${String(profileId).slice(0, 8)}`
    const gameDirRaw = String((profile && profile.gameDir) || '').trim()
    const gameDir = gameDirRaw || root
    const shared = !gameDirRaw || path.resolve(gameDir) === path.resolve(root)
    const parsed = parseLastVersionId(profile && profile.lastVersionId)
    const meta = { source: 'official', profileId }

    if (!isDir(gameDir)) {
      return unsupportedEntry({
        id: profileId, name, gameDir,
        reason: `Carpeta del perfil no encontrada: ${gameDirRaw || '(raíz)'}`, meta
      })
    }
    if (!parsed.minecraftVersion) {
      return {
        ...unsupportedEntry({
          id: profileId, name, gameDir,
          reason: `Versión de Minecraft indeterminada (lastVersionId: ${String((profile && profile.lastVersionId) || 'ausente')}).`,
          meta
        }),
        loader: parsed.loader,
        loaderVersion: parsed.loaderVersion,
        shared
      }
    }
    if (!parsed.loader) {
      return {
        ...unsupportedEntry({
          id: profileId, name, gameDir,
          reason: 'Loader indeterminado (no se elige a ciegas).',
          meta
        }),
        minecraftVersion: parsed.minecraftVersion,
        loaderVersion: parsed.loaderVersion,
        shared
      }
    }
    const { bytes, truncated } = walkSizeBytes(gameDir)
    return {
      id: profileId,
      name,
      gameDir,
      minecraftVersion: parsed.minecraftVersion,
      loader: parsed.loader,
      loaderVersion: parsed.loader === 'vanilla' ? '' : parsed.loaderVersion,
      sizeBytes: bytes,
      sizeTruncated: truncated,
      supported: parsed.loader === 'vanilla' ? true : Boolean(parsed.loaderVersion),
      reason: parsed.loader === 'vanilla' || parsed.loaderVersion
        ? (shared ? 'Comparte la carpeta .minecraft con otros perfiles.' : null)
        : 'Loader conocido pero sin versión en launcher_profiles.json.',
      shared,
      meta
    }
  })
}

function listInstances(root) {
  if (!root || !isDir(root)) return envelope({ root, instances: [], error: 'Carpeta .minecraft no encontrada.' })
  const json = safeReadJson(path.join(root, 'launcher_profiles.json'))
  if (!json) return envelope({ root, instances: [], error: 'launcher_profiles.json ausente o ilegible.' })
  return envelope({ root, instances: parseLauncherProfiles(json, root) })
}

function detect({ platform, env, overrideRoot } = {}) {
  if (overrideRoot) {
    return [{ root: overrideRoot, exists: isDir(overrideRoot), source: 'manual' }]
  }
  return candidateRoots({ platform, env }).map(root => ({ root, exists: isDir(root), source: 'default' }))
}

module.exports = {
  id: 'official',
  label: 'Minecraft (oficial)',
  META_FILES,
  candidateRoots,
  parseLastVersionId,
  parseLauncherProfiles,
  listInstances,
  detect
}

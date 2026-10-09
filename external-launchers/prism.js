// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Adaptador Prism Launcher — Fase 1 (detección solo-lectura + listado).
// VERIFICADO en esta máquina (Windows, Prism real instalado):
//   raíz por defecto %APPDATA%\PrismLauncher (sin clave InstanceDir en
//   prismlauncher.cfg => se respeta la ubicación por defecto).
//   <root>/instances/<Nombre>/{instance.cfg, mmc-pack.json, minecraft/}
//   instance.cfg: INI [General] con `name=<nombre>` en MINÚSCULAS (verificado;
//   se acepta también `Name=` por tolerancia).
//   mmc-pack.json: { components: [{ uid, version }], formatVersion: 1 }
//   (verificado: net.minecraft 26.3, net.fabricmc.fabric-loader 0.19.5,
//   net.fabricmc.intermediary, org.lwjgl3; versiones de 2 partes como "26.3").
//   Carpeta de juego VERIFICADA: `minecraft/` (no `.minecraft`, que queda como
//   alternativa sin verificar). Subcarpetas ocultas (ej. `.tmp/<id>/` de
//   instancias a medio crear) se EXCLUYEN del listado.
// Lista blanca de lectura (nunca credenciales):
//   prismlauncher.cfg (solo clave InstanceDir), instance.cfg (name),
//   mmc-pack.json (componentes). Nada más.

const path = require('path')
const {
  isDir,
  safeReadJson,
  safeReadText,
  listSubdirs,
  walkSizeBytes,
  normalizeLoaderName,
  mcVersionLike,
  envelope,
  unsupportedEntry,
  envPaths
} = require('./shared')

const META_FILES = ['prismlauncher.cfg', 'instance.cfg', 'mmc-pack.json']

// UIDs de componentes conocidos en mmc-pack.json (SIN VERIFICAR).
const MC_UIDS = new Set(['net.minecraft'])
const LOADER_UIDS = [
  ['net.fabricmc.fabric-loader', 'fabric'],
  ['org.quiltmc.quilt-loader', 'quilt'],
  ['net.neoforged', 'neoforge'],
  ['net.minecraftforge', 'forge']
]

function candidateRoots({ platform = process.platform, env = {} } = {}) {
  const { appData, home } = envPaths(env)
  const roots = []
  if (platform === 'win32' && appData) {
    roots.push(path.join(appData, 'PrismLauncher')) // Verificado en esta máquina.
  } else if (platform === 'linux' && home) {
    roots.push(path.join(home, '.local', 'share', 'PrismLauncher')) // SIN VERIFICAR
    // Variante Flatpak (SIN VERIFICAR, configurable vía overrideRoot).
    roots.push(path.join(home, '.var', 'app', 'org.prismlauncher.PrismLauncher', 'data', 'PrismLauncher'))
  }
  // macOS: no soportado (sin target de build). Ver shared.SUPPORTED_PLATFORMS.
  return roots
}

// Lee InstanceDir de prismlauncher.cfg (SIN VERIFICAR). Null si ausente.
function parseInstanceDirOverride(cfgText, root) {
  if (!cfgText) return null
  const match = cfgText.split(/\r?\n/).map(line => line.trim())
    .find(line => /^InstanceDir\s*=/.test(line))
  if (!match) return null
  const raw = match.slice(match.indexOf('=') + 1).trim().replace(/^"|"$/g, '')
  if (!raw) return null
  return path.isAbsolute(raw) ? raw : path.join(root, raw)
}

function parseInstanceCfg(text) {
  if (!text) return {}
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return out
}

function parseMmcPack(json) {
  const components = json && Array.isArray(json.components) ? json.components : []
  let minecraftVersion = null
  let loader = null
  let loaderVersion = null
  for (const component of components) {
    const uid = String(component && component.uid || '')
    const version = String(component && component.version || '').trim() || null
    if (!minecraftVersion && MC_UIDS.has(uid)) {
      minecraftVersion = mcVersionLike(version)
    }
    if (!loader) {
      for (const [prefix, canonical] of LOADER_UIDS) {
        if (uid === prefix || uid.startsWith(prefix + '.')) {
          loader = canonical
          loaderVersion = version
          break
        }
      }
    }
  }
  if (!loader) loader = normalizeLoaderName(null)
  return { minecraftVersion, loader, loaderVersion }
}

// Carpeta de juego: 'minecraft' (VERIFICADO en instalación real), si no
// '.minecraft' (alternativa sin verificar), si no la raíz (con marca).
function resolveGameDir(instanceDir) {
  const plain = path.join(instanceDir, 'minecraft')
  if (isDir(plain)) return { gameDir: plain, fallback: false }
  const hidden = path.join(instanceDir, '.minecraft')
  if (isDir(hidden)) return { gameDir: hidden, fallback: false }
  return { gameDir: instanceDir, fallback: true }
}

function buildEntry(instanceDir, dirName) {
  const cfg = parseInstanceCfg(safeReadText(path.join(instanceDir, 'instance.cfg')))
  const pack = parseMmcPack(safeReadJson(path.join(instanceDir, 'mmc-pack.json')))
  // `name=` minúscula en instalaciones reales; se tolera `Name=`.
  const cfgName = cfg.name || cfg.Name || null
  const name = cfgName || dirName
  const hasMeta = Boolean(cfgName) || pack.minecraftVersion || pack.loader
  const { gameDir, fallback } = resolveGameDir(instanceDir)

  if (!hasMeta) {
    return unsupportedEntry({
      id: dirName,
      name,
      gameDir,
      reason: 'Sin metadatos legibles (instance.cfg / mmc-pack.json ausentes).',
      meta: { source: 'prism', dir: instanceDir, gameDirFallback: fallback }
    })
  }
  if (!pack.minecraftVersion) {
    return {
      ...unsupportedEntry({
        id: dirName,
        name,
        gameDir,
        reason: 'Versión de Minecraft indeterminada en mmc-pack.json.',
        meta: { source: 'prism', dir: instanceDir, gameDirFallback: fallback }
      }),
      minecraftVersion: null,
      loader: pack.loader,
      loaderVersion: pack.loaderVersion
    }
  }
  if (!pack.loader) {
    return {
      ...unsupportedEntry({
        id: dirName,
        name,
        gameDir,
        reason: 'Loader indeterminado en mmc-pack.json (no se elige a ciegas).',
        meta: { source: 'prism', dir: instanceDir, gameDirFallback: fallback }
      }),
      minecraftVersion: pack.minecraftVersion,
      loaderVersion: pack.loaderVersion
    }
  }
  const { bytes, truncated } = walkSizeBytes(gameDir)
  return {
    id: dirName,
    name,
    gameDir,
    minecraftVersion: pack.minecraftVersion,
    loader: pack.loader,
    loaderVersion: pack.loader === 'vanilla' ? '' : (pack.loaderVersion || null),
    sizeBytes: bytes,
    sizeTruncated: truncated,
    supported: pack.loader === 'vanilla' ? true : Boolean(pack.loaderVersion),
    reason: pack.loader === 'vanilla' || pack.loaderVersion
      ? null
      : 'Loader conocido pero sin versión en mmc-pack.json.',
    shared: false,
    meta: { source: 'prism', dir: instanceDir, gameDirFallback: fallback }
  }
}

function listInstances(root) {
  if (!root || !isDir(root)) return envelope({ root, instances: [], error: 'Raíz de Prism Launcher no encontrada.' })
  const cfgText = safeReadText(path.join(root, 'prismlauncher.cfg'), 64 * 1024)
  const override = parseInstanceDirOverride(cfgText, root)
  const instancesDir = override || path.join(root, 'instances')
  if (!isDir(instancesDir)) {
    return envelope({ root, instances: [], error: `Carpeta de instancias no encontrada: ${instancesDir}` })
  }
  const instances = listSubdirs(instancesDir)
    // Se excluyen carpetas ocultas (ej. `.tmp/<id>/` de creaciones a medias).
    .filter(name => !name.startsWith('.'))
    .map(name => buildEntry(path.join(instancesDir, name), name))
  return envelope({ root, instances })
}

function detect({ platform, env, overrideRoot } = {}) {
  if (overrideRoot) {
    return [{ root: overrideRoot, exists: isDir(overrideRoot), source: 'manual' }]
  }
  return candidateRoots({ platform, env }).map(root => ({ root, exists: isDir(root), source: 'default' }))
}

module.exports = {
  id: 'prism',
  label: 'Prism Launcher',
  META_FILES,
  candidateRoots,
  parseInstanceDirOverride,
  parseInstanceCfg,
  parseMmcPack,
  resolveGameDir,
  listInstances,
  detect
}

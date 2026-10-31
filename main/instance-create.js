// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { defaultInstances, ensureInstanceFolders, getInstanceDir, instanceFolders, loadCustomInstances, saveCustomInstances } = require('./instances-store')
const { isLocalAbsolutePath, sanitizeInstanceId } = require('./util')
const { getSupportedMinecraftVersions, pickLatestLoaderVersion } = require('./versions')

function createLauncherInstance(payload = {}) {
  const version = String(payload.version || '').trim()
  const loader = String(payload.loader || 'vanilla').trim()
  const loaderVersion = String(payload.loaderVersion || '').trim()
  const versionType = String(payload.versionType || 'release').trim()
  if (!version) throw new Error('Elegí una versión.')
  if (!['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(loader)) throw new Error('Loader invalido.')
  if (loader !== 'vanilla' && !loaderVersion) throw new Error('Ese loader no es compatible con esa versión.')
  if (loaderVersion && /[<>:"/\\|?*\x00-\x1F]/.test(loaderVersion)) throw new Error('Versión de loader inválida.')
  if (loader === 'forge' && loaderVersion && !/^[\w.-]+$/.test(loaderVersion)) throw new Error('Versión de Forge inválida.')
  if (loader === 'neoforge' && loaderVersion && !/^\d+\.\d+\.\d+$/.test(loaderVersion)) throw new Error('Versión de NeoForge inválida.')

  const idParts = [loader, version, loaderVersion].filter(Boolean).map(sanitizeInstanceId)
  let instanceId = idParts.join('-')
  const existingIds = new Set([...defaultInstances.map(i => i.id), ...loadCustomInstances().map(i => i.id)])
  if (existingIds.has(instanceId)) {
    let suffix = 2
    while (existingIds.has(`${instanceId}-${suffix}`)) suffix++
    instanceId = `${instanceId}-${suffix}`
  }
  const defaultName = loader === 'vanilla'
    ? 'Minecraft ' + version
    : loader[0].toUpperCase() + loader.slice(1) + ' ' + version
  const name = String(payload.name || '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 48) || defaultName
  const icon = resolveInstanceIcon(payload.icon)
  const instance = {
    id: instanceId,
    name,
    version,
    loader,
    loaderVersion,
    versionType,
    type: loader === 'vanilla' ? 'vanilla' : 'loader',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  if (icon && (icon.file || icon.fa)) {
    instance.icon = icon.file
      ? { file: path.join(getInstanceDir(instanceId), icon.file) }
      : { fa: icon.fa, bg: icon.bg }
  }
  registerCustomInstance(instance)
  ensureInstanceFolders(instance)
  if (icon && icon.file && icon.sourcePath) {
    try {
      fs.copyFileSync(icon.sourcePath, path.join(getInstanceDir(instance.id), icon.file))
    } catch (error) {
      throw new Error('No se pudo guardar el ícono: ' + (error.message || String(error)))
    }
  }
  fs.writeFileSync(path.join(getInstanceDir(instance.id), 'instance.json'), JSON.stringify(instance, null, 2))
  return instance
}

const INSTANCE_ICON_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const MAX_INSTANCE_ICON_BYTES = 5 * 1024 * 1024

// Normaliza el icono elegido en el asistente. Acepta preset {fa,bg} o
// subida {path}. Para subidas devuelve {file, sourcePath} para copiar
// al crear la instancia (el renderer no escribe archivos).
function resolveInstanceIcon(iconPayload) {
  if (!iconPayload || typeof iconPayload !== 'object') return null
  const fa = String(iconPayload.fa || '').trim()
  const bg = String(iconPayload.bg || '').trim()
  if (fa || bg) {
    if (!/^[a-z0-9-]+$/i.test(fa)) throw new Error('Ícono inválido.')
    if (!/^#[0-9a-f]{6}$/i.test(bg)) throw new Error('Color de ícono inválido.')
    return { fa, bg }
  }
  const iconPath = String(iconPayload.path || '').trim()
  if (!iconPath) return null
  // KL-07: la ruta llega del renderer; nunca rutas de red/dispositivo.
  if (!isLocalAbsolutePath(iconPath)) throw new Error('El ícono debe estar en un disco local.')
  const ext = path.extname(iconPath).toLowerCase()
  if (!INSTANCE_ICON_IMAGE_EXTS.has(ext)) throw new Error('El ícono debe ser PNG, JPG, WebP o GIF.')
  let stat = null
  try {
    stat = fs.statSync(iconPath)
    if (!stat.isFile()) throw new Error('No es un archivo válido.')
  } catch (error) {
    throw new Error('No se pudo leer el ícono: ' + (error.message || String(error)))
  }
  if (stat.size > MAX_INSTANCE_ICON_BYTES) throw new Error('El ícono supera los 5 MiB.')
  return { file: 'icon' + ext, sourcePath: iconPath }
}

function normalizeForgeLoaderVersion(minecraftVersion, forgeValue) {
  const raw = String(forgeValue || '').trim()
  if (!raw) return ''
  const prefix = String(minecraftVersion || '').trim() + '-'
  if (prefix.length > 1 && raw.startsWith(prefix)) return raw.slice(prefix.length)
  const match = raw.match(/^(\d+\.\d+(?:\.\d+)?)-(.+)$/)
  if (match && match[1] === String(minecraftVersion || '').trim()) return match[2]
  return raw
}

function resolveLoaderFromDependencies(dependencies, minecraftVersion = '') {
  const deps = dependencies || {}
  if (deps['fabric-loader']) {
    return { loader: 'fabric', loaderVersion: String(deps['fabric-loader']).trim() }
  }
  if (deps['quilt-loader']) {
    return { loader: 'quilt', loaderVersion: String(deps['quilt-loader']).trim() }
  }
  if (deps.neoforge) {
    return { loader: 'neoforge', loaderVersion: String(deps.neoforge).trim() }
  }
  if (deps.forge) {
    return {
      loader: 'forge',
      loaderVersion: normalizeForgeLoaderVersion(minecraftVersion, deps.forge)
    }
  }
  return { loader: 'vanilla', loaderVersion: '' }
}

async function ensureInstanceLoaderVersion(instance) {
  if (!instance.loader || instance.loader === 'vanilla') return instance
  if (instance.loaderVersion) return instance

  const supported = await getSupportedMinecraftVersions(instance.loader)
  const loaderVersion = pickLatestLoaderVersion(instance.loader, instance.version, supported)
  if (!loaderVersion) throw new Error('La instancia no tiene version de loader.')

  instance.loaderVersion = loaderVersion
  instance.updatedAt = new Date().toISOString()
  registerCustomInstance(instance)
  const instanceFile = path.join(getInstanceDir(instance.id), 'instance.json')
  fs.writeFileSync(instanceFile, JSON.stringify(instance, null, 2))
  return instance
}

function getInstallFolder(projectType, installKind, instanceId) {
  if (projectType === 'resourcepack') return instanceFolders.resourcepacks(instanceId)
  if (projectType === 'shader') return instanceFolders.shaderpacks(instanceId)
  if (installKind === 'plugin') return instanceFolders.plugins(instanceId)
  if (installKind === 'datapack') return instanceFolders.datapacks(instanceId)
  return instanceFolders.mods(instanceId)
}

function registerCustomInstance(instance) {
  const custom = loadCustomInstances()
  const existing = custom.findIndex(item => item.id === instance.id)
  if (existing >= 0) custom[existing] = instance
  else custom.push(instance)
  saveCustomInstances(custom)
}

module.exports = {
  INSTANCE_ICON_IMAGE_EXTS,
  MAX_INSTANCE_ICON_BYTES,
  createLauncherInstance,
  ensureInstanceLoaderVersion,
  getInstallFolder,
  registerCustomInstance,
  resolveInstanceIcon,
  resolveLoaderFromDependencies
}

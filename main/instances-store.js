// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { atomicWriteJsonSync, purgeStaleTmps, preserveCorruptSync } = require('../stores/atomic-store')
const { getKindyrDataRoot } = require('./paths')

const preparingInstances = new Map()

const defaultInstances = [
  { id: 'vanilla-1.21.4', name: 'Minecraft 1.21.4', version: '1.21.4', loader: 'vanilla' },
  { id: 'vanilla-1.20.6', name: 'Minecraft 1.20.6', version: '1.20.6', loader: 'vanilla' },
  { id: 'vanilla-1.19.4', name: 'Minecraft 1.19.4', version: '1.19.4', loader: 'vanilla' },
  { id: 'vanilla-1.18.2', name: 'Minecraft 1.18.2', version: '1.18.2', loader: 'vanilla' }
]

function getInstanceDir(instanceId) {
  return path.join(getKindyrDataRoot(), 'instances', instanceId)
}

function getMinecraftRoot(instanceId) {
  return path.join(getInstanceDir(instanceId), 'minecraft')
}

function getLauncherLogsDir(instanceId) {
  return path.join(getInstanceDir(instanceId), 'launcher-logs')
}

const instanceFolders = {
  root: getInstanceDir,
  minecraft: getMinecraftRoot,
  mods: (instanceId) => path.join(getMinecraftRoot(instanceId), 'mods'),
  plugins: (instanceId) => path.join(getMinecraftRoot(instanceId), 'plugins'),
  datapacks: (instanceId) => path.join(getMinecraftRoot(instanceId), 'datapacks'),
  resourcepacks: (instanceId) => path.join(getMinecraftRoot(instanceId), 'resourcepacks'),
  shaderpacks: (instanceId) => path.join(getMinecraftRoot(instanceId), 'shaderpacks'),
  saves: (instanceId) => path.join(getMinecraftRoot(instanceId), 'saves'),
  logs: (instanceId) => path.join(getMinecraftRoot(instanceId), 'logs'),
  launcherLogs: getLauncherLogsDir
}

function getInstance(instanceId) {
  const customInstance = loadCustomInstances().find(item => item.id === instanceId)
  return customInstance || defaultInstances.find(item => item.id === instanceId)
}

function getCustomInstancesFile() {
  return path.join(getKindyrDataRoot(), 'instances.json')
}

let customInstancesCache = null

let customInstancesCorruptInfo = null
function loadCustomInstances() {
  if (customInstancesCache) return customInstancesCache.map(instance => ({ ...instance }))
  const file = getCustomInstancesFile()
  if (!fs.existsSync(file)) {
    customInstancesCache = []
    return []
  }
  let raw = ''
  try { raw = fs.readFileSync(file, 'utf8') } catch {
    customInstancesCache = []
    return []
  }
  let data = null
  try { data = JSON.parse(raw) } catch {
    // F1: jamás [] silencioso. Preserva corrupto, avisa, RAM [] temporal.
    const bak = preserveCorruptSync(file)
    customInstancesCorruptInfo = { file, bak, at: Date.now() }
    try { console.error('[Kindyr][instances] instances.json corrupto, preservado en', bak) } catch {}
    customInstancesCache = []
    const out = []
    out._corrupt = true
    out._corruptBak = bak
    return out
  }
  try {
    customInstancesCache = Array.isArray(data) ? data : []
    if (!Array.isArray(data)) {
      const bak = preserveCorruptSync(file)
      customInstancesCorruptInfo = { file, bak, at: Date.now() }
    }
    if (migrateInstanceIcons(customInstancesCache)) {
      try {
        atomicWriteJsonSync(file, customInstancesCache, { mode: 0o600 })
      } catch {}
    }
    return customInstancesCache.map(instance => ({ ...instance }))
  } catch {
    const bak = preserveCorruptSync(file)
    customInstancesCorruptInfo = { file, bak, at: Date.now() }
    customInstancesCache = []
    return []
  }
}

// Repara iconos guardados con ruta relativa (versiones previas guardaban
// solo el nombre): los resuelve contra la carpeta de la instancia y
// descarta los que ya no existen para no mostrar imagenes rotas.
function migrateInstanceIcons(instances) {
  if (!Array.isArray(instances)) return false
  let changed = false
  for (const instance of instances) {
    const icon = instance && instance.icon
    if (!icon || typeof icon !== 'object' || !icon.file || path.isAbsolute(icon.file)) continue
    const candidate = path.join(getInstanceDir(instance.id), path.basename(icon.file))
    if (fs.existsSync(candidate)) {
      icon.file = candidate
    } else {
      delete instance.icon
    }
    changed = true
  }
  return changed
}

function saveCustomInstances(instances) {
  customInstancesCache = Array.isArray(instances)
    ? instances.map(instance => ({ ...instance }))
    : []
  fs.mkdirSync(getKindyrDataRoot(), { recursive: true })
  // F1: tmp + wx + fsync + rename mismo volumen + purga tmp propio.
  const dest = getCustomInstancesFile()
  try { purgeStaleTmps(path.dirname(dest), 'instances.json') } catch {}
  try {
    atomicWriteJsonSync(dest, customInstancesCache, { mode: 0o600 })
  } catch (error) {
    throw error
  }
}

function getAllInstances() {
  const merged = new Map(defaultInstances.map(instance => [instance.id, instance]))
  loadCustomInstances().forEach(instance => merged.set(instance.id, instance))
  return [...merged.values()]
}

function getInstanceTargetPath(instanceId, target) {
  // KL-12: solo claves propias (target='toString'/'constructor' resolvía por prototipo).
  const resolver = Object.hasOwn(instanceFolders, target) ? instanceFolders[target] : null
  if (!resolver) throw new Error('Carpeta no valida.')
  return resolver(instanceId)
}

function ensureMinecraftSubfolders(instanceId) {
  ;['mods', 'plugins', 'datapacks', 'resourcepacks', 'shaderpacks', 'saves', 'logs'].forEach(folder => {
    fs.mkdirSync(path.join(getMinecraftRoot(instanceId), folder), { recursive: true })
  })
  fs.mkdirSync(getLauncherLogsDir(instanceId), { recursive: true })
}

function ensureInstanceFolders(instance) {
  const instanceDir = getInstanceDir(instance.id)
  fs.mkdirSync(instanceDir, { recursive: true })

  const instanceFile = path.join(instanceDir, 'instance.json')
  ensureMinecraftSubfolders(instance.id)
  if (!fs.existsSync(instanceFile)) {
    fs.writeFileSync(
      instanceFile,
      JSON.stringify({ ...instance, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2)
    )
  }

  return getMinecraftRoot(instance.id)
}

function ensureDefaultInstances() {
  fs.mkdirSync(path.join(getKindyrDataRoot(), 'instances'), { recursive: true })
  // F1: sembrar una sola vez. Borradas no reaparecen (flag defaults-seeded).
  const flag = path.join(getKindyrDataRoot(), 'defaults-seeded.json')
  const firstSeed = !fs.existsSync(flag)
  getAllInstances().forEach(ensureInstanceFolders)
  if (firstSeed) {
    try { fs.writeFileSync(flag, JSON.stringify({ seededAt: Date.now() }, null, 2)) } catch {}
  }
  // Limpieza tmp huérfanos sin tocar el único .bak bueno.
  try { purgeStaleTmps(getKindyrDataRoot(), 'settings.json') } catch {}
  try { purgeStaleTmps(getKindyrDataRoot(), 'instances.json') } catch {}
}

module.exports = {
  defaultInstances,
  ensureDefaultInstances,
  ensureInstanceFolders,
  ensureMinecraftSubfolders,
  getAllInstances,
  getInstance,
  getInstanceDir,
  getInstanceTargetPath,
  getLauncherLogsDir,
  getMinecraftRoot,
  instanceFolders,
  loadCustomInstances,
  preparingInstances,
  saveCustomInstances
}

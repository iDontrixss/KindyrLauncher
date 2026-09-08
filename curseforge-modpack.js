// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Utilidades puras para modpacks de CurseForge (sin Electron, testeables).
// Un ZIP de modpack CF trae `manifest.json` + carpeta `overrides/`.
// `manifest.files[]` son mods ({projectID, fileID}) que se resuelven
// contra la API y se instalan en `mods/`; `overrides/` se extrae tal cual.

const KNOWN_LOADERS = ['neoforge', 'forge', 'fabric', 'quilt']

function resolveCurseForgeModLoaderId(modLoaderId) {
  const raw = String(modLoaderId || '').trim().toLowerCase()
  if (!raw || raw === 'any' || raw === 'minecraft') return { loader: 'vanilla', loaderVersion: '' }
  for (const loader of KNOWN_LOADERS) {
    if (raw === loader || raw.startsWith(loader + '-')) {
      return { loader, loaderVersion: raw.slice(loader.length + 1) }
    }
  }
  return { loader: 'vanilla', loaderVersion: '' }
}

function curseForgeHashesToMap(hashes) {
  const map = {}
  for (const item of Array.isArray(hashes) ? hashes : []) {
    const value = String(item?.value || '').toLowerCase()
    if (/^[a-f0-9]{40}$/.test(value) && !map.sha1) map.sha1 = value
    else if (/^[a-f0-9]{128}$/.test(value) && !map.sha512) map.sha512 = value
  }
  return map
}

function parseCurseForgeManifest(input) {
  let manifest = input
  if (Buffer.isBuffer(manifest)) manifest = JSON.parse(manifest.toString('utf8'))
  else if (typeof manifest === 'string') manifest = JSON.parse(manifest)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Manifest de CurseForge inválido.')
  }
  if (manifest.manifestType !== 'minecraftModpack') {
    throw new Error('El archivo no es un modpack de Minecraft.')
  }
  const name = String(manifest.name || '').trim() || 'Modpack'
  const minecraftVersion = String(manifest.minecraft?.version || '').trim() || 'unknown'
  const loaders = Array.isArray(manifest.minecraft?.modLoaders) ? manifest.minecraft.modLoaders : []
  const primary = loaders.find(item => item && item.primary) || loaders[0] || {}
  const { loader, loaderVersion } = resolveCurseForgeModLoaderId(primary.id)
  const files = []
  for (const entry of Array.isArray(manifest.files) ? manifest.files : []) {
    const projectID = Number(entry?.projectID)
    const fileID = Number(entry?.fileID)
    if (!Number.isInteger(projectID) || projectID <= 0 || !Number.isInteger(fileID) || fileID <= 0) {
      throw new Error('El manifest contiene una entrada de archivo inválida.')
    }
    files.push({ projectID, fileID, required: entry?.required !== false })
  }
  const overrides = String(manifest.overrides || 'overrides').replace(/\/+$/, '') || 'overrides'
  return { name, minecraftVersion, loader, loaderVersion, files, overrides }
}

function mapCurseForgeOverrideEntry(normalized, overridesDir = 'overrides') {
  const prefix = String(overridesDir || 'overrides').replace(/\/+$/, '') + '/'
  const source = String(normalized || '')
  if (!source.startsWith(prefix)) return null
  const relative = source.slice(prefix.length)
  if (!relative || relative.includes('..')) return null
  return relative
}

module.exports = {
  resolveCurseForgeModLoaderId,
  curseForgeHashesToMap,
  parseCurseForgeManifest,
  mapCurseForgeOverrideEntry
}

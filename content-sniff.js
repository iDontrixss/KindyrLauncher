// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Clasificación de contenido subido (.jar/.zip) por CONTENIDO, no por
// extensión. Solo existencia de marcadores + una lectura mínima:
//   .jar -> mod (forge/fabric/neoforge/quilt/legacy) o unknown
//   .zip -> modpack | resourcepack | shader | datapack | unknown
// Lanza si el archivo no es un ZIP legible ('unreadable' lo decide el
// llamador). No ejecuta ni extrae nada: solo lista nombres y lee pack.mcmeta
// (≤64 KiB). Sin dependencias nuevas: reutiliza archive-utils (@xmcl/unzip
// con límites ZipSlip ya auditados).
const fs = require('fs')
const path = require('path')
const { listZipEntries, readZipEntryBuffer } = require('./archive-utils')

const PACK_MCMETA_MAX_BYTES = 64 * 1024

// Orden de prioridad si un .jar trae varios descriptores (jars multi-loader
// existen: p. ej. Architectury trae fabric.mod.json + mods.toml). El kind es
// 'mod' en todos los casos; el loader es informativo.
const JAR_MARKERS = [
  ['meta-inf/neoforge.mods.toml', 'neoforge'],
  ['meta-inf/mods.toml', 'forge'],
  ['fabric.mod.json', 'fabric'],
  // quilt.mod.json vive en la raíz del jar según Quilt; se acepta también en
  // META-INF/ por tolerancia (el costo de ambas ramas es nulo).
  ['quilt.mod.json', 'quilt'],
  ['meta-inf/quilt.mod.json', 'quilt'],
  ['mcmod.info', 'forge-legacy']
]

async function classifyJarContent(filePath) {
  const entries = await listZipEntries(filePath)
  const set = new Set(entries.map(name => name.toLowerCase()))
  for (const [marker, loader] of JAR_MARKERS) {
    if (set.has(marker)) return { kind: 'mod', loader }
  }
  return { kind: 'unknown' }
}

async function classifyZipContent(filePath) {
  const entries = await listZipEntries(filePath)
  const lowered = entries.map(name => name.toLowerCase())
  const set = new Set(lowered)
  // Un modpack completo nunca es contenido individual: se rechaza con razón
  // propia para guiar al instalador de modpacks.
  if (set.has('modrinth.index.json') || set.has('manifest.json')) return { kind: 'modpack' }
  const mcmetaName = entries.find(name => name.toLowerCase() === 'pack.mcmeta')
  if (mcmetaName) {
    let meta = null
    try {
      const buf = await readZipEntryBuffer(filePath, mcmetaName, PACK_MCMETA_MAX_BYTES)
      meta = buf ? JSON.parse(buf.toString('utf8')) : null
    } catch {
      meta = null
    }
    const format = meta && meta.pack && meta.pack.pack_format
    if (meta && (typeof format === 'number' || typeof format === 'string')) {
      const hasAssets = lowered.some(name => name.startsWith('assets/'))
      const hasData = lowered.some(name => name.startsWith('data/'))
      // pack.mcmeta lo comparten resourcepacks y datapacks: decide el árbol.
      if (hasAssets) return { kind: 'resourcepack' }
      if (hasData) return { kind: 'datapack' }
      return { kind: 'resourcepack' }
    }
    return { kind: 'unknown' }
  }
  if (lowered.some(name => name.startsWith('shaders/') && name.length > 'shaders/'.length)) {
    return { kind: 'shader' }
  }
  return { kind: 'unknown' }
}

async function classifyContentFile(filePath, ext) {
  if (ext === '.jar') return classifyJarContent(filePath)
  return classifyZipContent(filePath)
}

// Drops sin ruta (orígenes virtuales, adjuntos, Firefox): el renderer manda
// los bytes y main los valida igual que un archivo en disco. Tope de
// transporte deliberadamente menor que MAX_UPLOAD_FILE_BYTES: los bytes viajan
// en memoria por IPC, no por stream desde disco.
const MAX_UPLOAD_BLOB_BYTES = 256 * 1024 * 1024

// Escribe bytes a staging y devuelve la ruta para el pipeline uniforme
// (stat → sniff → copy). El nombre ya viene validado por el llamador
// (dropFileBase); aquí solo cinturón: basename + escritura exclusiva.
function writeStagedBlob(stagingDir, file, bytes) {
  const name = path.basename(String(file || ''))
  if (!name || name === '.' || name === '..') {
    const error = new Error('Nombre inválido.')
    error.reason = 'type'
    throw error
  }
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || [])
  if (buf.length > MAX_UPLOAD_BLOB_BYTES) {
    const error = new Error('Archivo demasiado grande.')
    error.reason = 'too-large'
    throw error
  }
  fs.mkdirSync(stagingDir, { recursive: true })
  const dest = path.join(stagingDir, name)
  try {
    fs.writeFileSync(dest, buf, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error && error.code === 'EEXIST') error.reason = 'exists'
    throw error
  }
  return dest
}

module.exports = {
  MAX_UPLOAD_BLOB_BYTES,
  classifyContentFile,
  classifyJarContent,
  classifyZipContent,
  writeStagedBlob
}

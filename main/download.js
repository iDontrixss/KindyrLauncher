// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const { verifyMrpackFile } = require('../mrpack-utils')
const { curseForgeHashesToMap } = require('../curseforge-modpack')
const state = require('./state')
const { MODRINTH_USER_AGENT } = require('./constants')

function getDefaultLocalDownloadDir() {
  try {
    return path.join(app.getPath('downloads'), 'KindyrLauncher')
  } catch {
    return path.join(require('os').homedir(), 'Downloads', 'KindyrLauncher')
  }
}

function getUserDownloadsDir() {
  try {
    return app.getPath('downloads')
  } catch {
    return path.join(require('os').homedir(), 'Downloads')
  }
}

function resolveLocalDownloadDir(customDir) {
  const raw = String(customDir || '').trim()
  if (!raw) return getDefaultLocalDownloadDir()
  if (raw.includes('\0')) throw new Error('Ruta de descarga no válida.')
  const resolved = path.resolve(raw)
  if (!path.isAbsolute(resolved)) throw new Error('Ruta de descarga no válida.')
  if (resolved.length > 260) throw new Error('Ruta de descarga demasiado larga.')
  fs.mkdirSync(resolved, { recursive: true })
  return resolved
}

async function downloadToFile(url, destination, opts = {}) {
  const parsed = new URL(String(url || ''))
  if (parsed.protocol !== 'https:') throw new Error('URL de descarga invalida (solo HTTPS).')
  const externalSignal = opts && opts.signal ? opts.signal : null
  if (externalSignal && externalSignal.aborted) {
    const reason = externalSignal.reason
    throw reason instanceof Error ? reason : new Error('Descarga cancelada.')
  }
  const timeoutMs = Number(opts && opts.timeoutMs) > 0 ? Math.floor(Number(opts.timeoutMs)) : 60000
  const controller = new AbortController()
  const forwardAbort = () => {
    try { controller.abort(externalSignal.reason) } catch {}
  }
  if (externalSignal) {
    try { externalSignal.addEventListener('abort', forwardAbort, { once: true }) } catch {}
  }
  const timer = setTimeout(() => {
    try { controller.abort(new Error(`Descarga sin respuesta por ${Math.round(timeoutMs / 1000)}s: ${parsed.host}`)) } catch {}
  }, timeoutMs)
  if (timer && typeof timer.unref === 'function') {
    try { timer.unref() } catch {}
  }
  try {
    return await downloadToFileInner(parsed, destination, controller.signal)
  } catch (error) {
    if (controller.signal.aborted && externalSignal && externalSignal.aborted) {
      const reason = externalSignal.reason
      throw reason instanceof Error ? reason : new Error('Descarga cancelada.')
    }
    throw error
  } finally {
    try { clearTimeout(timer) } catch {}
    if (externalSignal) {
      try { externalSignal.removeEventListener('abort', forwardAbort) } catch {}
    }
  }
}

async function downloadToFileInner(parsed, destination, signal) {
  const throwIfCancelled = () => {
    if (state.inicioCancelado || state.xmclCancellationRequested) throw new Error('Descarga cancelada.')
    if (signal && signal.aborted) {
      const reason = signal.reason
      throw reason instanceof Error ? reason : new Error('Descarga cancelada.')
    }
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const partPath = `${destination}.part`
  let start = 0
  if (fs.existsSync(partPath)) {
    try { start = fs.statSync(partPath).size } catch { start = 0 }
    if (start > 50 * 1024 * 1024) { try { fs.unlinkSync(partPath); start = 0 } catch {} }
  }
  const headers = {
    'User-Agent': MODRINTH_USER_AGENT,
    Accept: 'application/octet-stream'
  }
  if (start > 0) headers.Range = `bytes=${start}-`
  throwIfCancelled()
  let response = await fetch(parsed, { headers, signal })
  if (start > 0 && response.status === 416) {
    try { fs.unlinkSync(partPath) } catch {}
    start = 0
    delete headers.Range
    throwIfCancelled()
    response = await fetch(parsed, { headers, signal })
  }
  const isResume = start > 0 && response.status === 206
  if (!isResume && !response.ok) throw new Error('No se pudo descargar el archivo: HTTP ' + response.status)
  if (isResume && ![206, 200].includes(response.status)) throw new Error('No se pudo reanudar la descarga: HTTP ' + response.status)
  if (!response.body) throw new Error('La descarga no devolvio contenido.')
  if (start > 0 && response.status === 200) {
    try { fs.unlinkSync(partPath) } catch {}
    start = 0
  }

  try {
    const writeFlags = isResume ? 'a' : 'w'
    throwIfCancelled()
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partPath, { flags: writeFlags }), { signal })
    throwIfCancelled()
    try {
      await fs.promises.rename(partPath, destination)
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error
      await fs.promises.rm(destination, { force: true })
      await fs.promises.rename(partPath, destination)
    }
    const stat = await fs.promises.stat(destination)
    return { path: destination, bytes: stat.size }
  } catch (error) {
    // keep part file for resume on transient errors; only clean on final failure if needed
    if (signal && signal.aborted) {
      const reason = signal.reason
      throw reason instanceof Error ? reason : new Error('Descarga cancelada.')
    }
    throw error
  }
}

function pickPrimaryFile(version) {
  const files = Array.isArray(version.files) ? version.files : []
  const file = files.find(item => item.primary) || files[0]
  if (!file || !file.url) throw new Error('La version elegida no tiene archivo descargable.')
  return file
}

// Descarga verificada para archivos individuales (mods, resourcepacks, zips de
// modpack). Fail-closed: exige hash sha1/sha512 del proveedor y elimina el
// archivo si falta el hash o no coincide. Antes los single-file se instalaban
// sin verificar (Modrinth verificaba pero no rechazaba, CF ni verificaba).
function normalizeVerifiableHashes(hashes) {
  if (!hashes || typeof hashes !== 'object') return {}
  if (Array.isArray(hashes)) return curseForgeHashesToMap(hashes)
  const map = {}
  if (typeof hashes.sha1 === 'string' && /^[a-f0-9]{40}$/i.test(hashes.sha1)) map.sha1 = hashes.sha1.toLowerCase()
  if (typeof hashes.sha512 === 'string' && /^[a-f0-9]{128}$/i.test(hashes.sha512)) map.sha512 = hashes.sha512.toLowerCase()
  return map
}

async function downloadSingleFileVerified(url, destination, hashes, label = 'Archivo') {
  const map = normalizeVerifiableHashes(hashes)
  if (!map.sha1 && !map.sha512) {
    throw new Error(`${label}: el proveedor no informó hash verificable (sha1/sha512 requerido). Instalación bloqueada por seguridad.`)
  }
  const downloaded = await downloadToFile(url, destination)
  let ok = false
  try {
    ok = await verifyMrpackFile(destination, map)
  } catch {
    ok = false
  }
  if (!ok) {
    await fs.promises.rm(destination, { force: true }).catch(() => {})
    throw new Error(`${label}: el hash del archivo descargado no coincide con el del proveedor. Archivo eliminado, no se instaló nada.`)
  }
  return downloaded
}

module.exports = {
  downloadSingleFileVerified,
  downloadToFile,
  getDefaultLocalDownloadDir,
  getUserDownloadsDir,
  pickPrimaryFile,
  resolveLocalDownloadDir
}

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { SETTINGS_STORE_VERSION, atomicWriteJsonSync, purgeStaleTmps, preserveCorruptSync } = require('../stores/atomic-store')
const state = require('./state')
const { logOnly } = require('./launch/log')
const { getKindyrDataRoot, getLauncherCacheDir } = require('./paths')
const { sanitizeInstanceId, yieldToEventLoop } = require('./util')

let launcherSettingsCache = null

function getLauncherSettingsFile() {
  return path.join(getKindyrDataRoot(), 'settings.json')
}

function getDefaultLauncherSettings() {
  return {
    version: SETTINGS_STORE_VERSION,
    javaInstalls: { '8': '', '17': '', '21': '', '25': '' },
    maxConcurrentDownloads: 6,
    discordEnabled: true,
    // S11: binarios java aprobados por el usuario vía diálogo nativo
    // (settings-browse-java) o detectados por el launcher. Un javaHome por
    // instancia solo se ejecuta si su binario canónico está aquí o es un
    // runtime gestionado. Ver isTrustedJavaBinary().
    approvedJavaBinaries: []
  }
}

let launcherSettingsCorruptInfo = null
function loadLauncherSettings() {
  if (launcherSettingsCache) {
    return {
      ...launcherSettingsCache,
      javaInstalls: { ...launcherSettingsCache.javaInstalls },
      approvedJavaBinaries: [...(launcherSettingsCache.approvedJavaBinaries || [])]
    }
  }

  const file = getLauncherSettingsFile()
  const defaults = getDefaultLauncherSettings()
  if (!fs.existsSync(file)) {
    launcherSettingsCache = { ...defaults, javaInstalls: { ...defaults.javaInstalls }, approvedJavaBinaries: [] }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls } }
  }
  let raw = ''
  try { raw = fs.readFileSync(file, 'utf8') } catch {
    launcherSettingsCache = { ...defaults, javaInstalls: { ...defaults.javaInstalls }, approvedJavaBinaries: [] }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls } }
  }
  let data = null
  try { data = JSON.parse(raw) } catch {
    // Corrupto: preservar para diagnóstico, RAM defaults, avisar. Nunca pisar.
    const bak = preserveCorruptSync(file)
    launcherSettingsCorruptInfo = { file, bak, at: Date.now() }
    try { console.error('[Kindyr][settings] settings.json corrupto, preservado en', bak) } catch {}
    launcherSettingsCache = { ...defaults, javaInstalls: { ...defaults.javaInstalls }, approvedJavaBinaries: [] }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls }, _corrupt: true, _corruptBak: bak }
  }
  // Versión futura: lectura sí, cero escrituras (no degradar). Se marca
  // readOnly y el save la rechaza hasta migrar explícitamente.
  if (Number.isFinite(Number(data.version)) && Number(data.version) > SETTINGS_STORE_VERSION) {
    launcherSettingsCache = {
      ...defaults,
      ...data,
      javaInstalls: { ...defaults.javaInstalls, ...(data.javaInstalls || {}) },
      approvedJavaBinaries: sanitizeApprovedJavaBinaries(data.approvedJavaBinaries)
    }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls }, _futureVersion: Number(data.version), _readOnly: true }
  }
  try {
    launcherSettingsCache = {
      ...defaults,
      ...data,
      javaInstalls: { ...defaults.javaInstalls, ...(data.javaInstalls || {}) },
      approvedJavaBinaries: sanitizeApprovedJavaBinaries(data.approvedJavaBinaries)
    }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls } }
  } catch {
    const bak = preserveCorruptSync(file)
    launcherSettingsCorruptInfo = { file, bak, at: Date.now() }
    launcherSettingsCache = { ...defaults, javaInstalls: { ...defaults.javaInstalls }, approvedJavaBinaries: [] }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls }, _corrupt: true, _corruptBak: bak }
  }
}

function saveLauncherSettings(data) {
  const incoming = (data && typeof data === 'object') ? data : {}
  // Futura: bloqueada. Misma versión con unknowns: se preservan (merge),
  // no se tiran. data.version entrante se ignora, manda STORE_VERSION.
  if (Number.isFinite(Number(incoming.version)) && Number(incoming.version) > SETTINGS_STORE_VERSION) {
    throw new Error('Configuración de versión futura: no se sobrescribe. Actualizá Kindyr para migrar.')
  }
  if (launcherSettingsCache && launcherSettingsCache._readOnly) {
    throw new Error('Configuración en solo lectura (versión futura): no se guarda.')
  }
  const defaults = getDefaultLauncherSettings()
  // Preserva unknowns de la versión actual conocida (no tirar campos que no entendemos dentro de la misma versión).
  const prev = launcherSettingsCache && typeof launcherSettingsCache === 'object' ? launcherSettingsCache : {}
  // Orden: defaults < guardado < entrante. Antes los defaults pisaban lo
  // guardado, así que un guardado parcial reseteaba campos (p. ej. Discord).
  launcherSettingsCache = {
    ...defaults,
    ...prev,
    ...incoming,
    version: SETTINGS_STORE_VERSION,
    javaInstalls: {
      ...defaults.javaInstalls,
      ...((prev.javaInstalls) || {}),
      ...((incoming.javaInstalls) || {})
    },
    approvedJavaBinaries: sanitizeApprovedJavaBinaries(incoming.approvedJavaBinaries !== undefined ? incoming.approvedJavaBinaries : prev.approvedJavaBinaries)
  }
  delete launcherSettingsCache._corrupt
  delete launcherSettingsCache._corruptBak
  delete launcherSettingsCache._futureVersion
  delete launcherSettingsCache._readOnly
  fs.mkdirSync(getKindyrDataRoot(), { recursive: true })
  try { purgeStaleTmps(getKindyrDataRoot(), 'settings.json') } catch {}
  atomicWriteJsonSync(getLauncherSettingsFile(), launcherSettingsCache, { mode: 0o600 })
}

// F1: serializa RMW completo, no solo write. Fallo no envenena: la cola sigue,
// el llamador recibe el rechazo y disco sigue siendo verdad. Caché solo tras OK.
let launcherSettingsQueue = Promise.resolve()
function withLauncherSettings(mutator) {
  const run = async () => {
    const current = loadLauncherSettings()
    if (current && current._readOnly) throw new Error('Configuración en solo lectura (versión futura).')
    const snapshot = JSON.parse(JSON.stringify({ ...current, _corrupt: undefined, _corruptBak: undefined, _futureVersion: undefined, _readOnly: undefined }))
    const updated = await mutator(snapshot)
    if (updated === undefined) return loadLauncherSettings()
    saveLauncherSettings(updated)
    return loadLauncherSettings()
  }
  const result = launcherSettingsQueue.then(run)
  launcherSettingsQueue = result.catch(() => {})
  return result
}

function getSharedMinecraftCacheDir(mcVersion) {
  return path.join(getLauncherCacheDir(), 'shared-minecraft', sanitizeInstanceId(String(mcVersion || 'unknown')))
}

async function tryPopulateFromSharedCache(minecraftRoot, mcVersion) {
  const shared = getSharedMinecraftCacheDir(mcVersion)
  try { await fs.promises.access(shared) } catch { return 0 }
  let copied = 0
  for (const sub of ['libraries', 'assets', 'versions']) {
    const src = path.join(shared, sub)
    const dst = path.join(minecraftRoot, sub)
    let srcExists = false
    try { await fs.promises.access(src); srcExists = true } catch {}
    let dstExists = false
    try { await fs.promises.access(dst); dstExists = true } catch {}
    if (!srcExists || dstExists) continue
    try {
      await fs.promises.mkdir(path.dirname(dst), { recursive: true })
      await fs.promises.cp(src, dst, { recursive: true, force: false })
      copied++
    } catch {}
    await yieldToEventLoop()
  }
  if (copied) logOnly('debug', `Shared cache hit for ${mcVersion}: ${copied} carpetas pre-pobladas`)
  return copied
}

async function populateSharedCache(minecraftRoot, mcVersion) {
  try {
    const shared = getSharedMinecraftCacheDir(mcVersion)
    await fs.promises.mkdir(shared, { recursive: true })
    for (const sub of ['libraries', 'assets']) {
      const src = path.join(minecraftRoot, sub)
      const dst = path.join(shared, sub)
      let srcExists = false
      try { await fs.promises.access(src); srcExists = true } catch {}
      let dstExists = false
      try { await fs.promises.access(dst); dstExists = true } catch {}
      if (!srcExists || dstExists) continue
      try {
        await fs.promises.cp(src, dst, { recursive: true, force: false })
      } catch {}
      await yieldToEventLoop()
    }
  } catch {}
}

function getBackgroundImagePath() {
  const dataRoot = getKindyrDataRoot()
  const candidates = [
    path.join(dataRoot, 'background.mp4'),
    path.join(dataRoot, 'background.png'),
    path.join(dataRoot, 'background.jpg'),
    path.join(dataRoot, 'background.jpeg'),
    path.join(dataRoot, 'background.webp'),
    path.join(dataRoot, 'background.gif')
  ]
  for (const target of candidates) {
    if (fs.existsSync(target)) return target
  }
  // fallback: scan any background.* we allowed
  try {
    for (const entry of fs.readdirSync(dataRoot)) {
      if (entry.toLowerCase().startsWith('background.')) {
        const full = path.join(dataRoot, entry)
        if (fs.statSync(full).isFile()) return full
      }
    }
  } catch {}
  return ''
}

function sendSettingsStatus(type, message) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return
  state.mainWindow.webContents.send('settings-status', { type, message })
}

// S11: procedencia del binario java antes de ejecutarlo. Un javaHome por
// instancia solo llega a spawn si es de procedencia confiable:
//  - runtime gestionado por el launcher (descargado + verificado por main), o
//  - ruta elegida por el usuario en el diálogo nativo (settings-browse-java)
//    o devuelta por la detección del sistema (settings-detect-java), que main
//    registra en approvedJavaBinaries.
// Un renderer comprometido puede invocar los IPC pero no puede forjar estas
// entradas sin que el usuario elija la carpeta en el diálogo del SO.
const MAX_APPROVED_JAVA_BINARIES = 20

function sanitizeApprovedJavaBinaries(value) {
  const out = []
  for (const item of Array.isArray(value) ? value : []) {
    const clean = String(item || '').trim()
    if (!clean || clean.length > 1024 || /[\0\n\r]/.test(clean)) continue
    if (!out.includes(clean)) out.push(clean)
    if (out.length >= MAX_APPROVED_JAVA_BINARIES) break
  }
  return out
}

module.exports = {
  MAX_APPROVED_JAVA_BINARIES,
  getBackgroundImagePath,
  loadLauncherSettings,
  populateSharedCache,
  sanitizeApprovedJavaBinaries,
  saveLauncherSettings,
  sendSettingsStatus,
  tryPopulateFromSharedCache
}

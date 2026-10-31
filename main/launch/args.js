// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const crypto = require('crypto')

function validateUsername(username) {
  const name = String(username || '').trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('El nombre offline debe tener 3-16 caracteres y solo letras, numeros o guion bajo.')
  }
  return name
}

function parseMemory(memory, fallback) {
  const raw = String(memory || fallback).trim().toUpperCase().replace(/\s+/g, '')
  const match = raw.match(/^(\d+(?:\.\d+)?)(G|M|GB|MB)?$/)
  if (!match) {
    throw new Error('La RAM debe tener formato como 2G, 4096M o 4G.')
  }
  const amount = Number(match[1])
  const unit = (match[2] || 'M').replace('B', '')
  const mb = unit === 'G' ? Math.round(amount * 1024) : Math.round(amount)
  if (!Number.isFinite(mb) || mb < 512 || mb > 32768) {
    throw new Error('La RAM debe estar entre 512M y 32G.')
  }
  const normalized = unit === 'G' ? (mb % 1024 === 0 ? (mb / 1024) + 'G' : mb + 'M') : mb + 'M'
  return { value: normalized, mb }
}

function validateMemory(minRam, maxRam) {
  const min = parseMemory(minRam, '2G')
  const max = parseMemory(maxRam, '4G')
  if (min.mb > max.mb) {
    throw new Error('La RAM minima no puede ser mayor que la maxima.')
  }
  return { min: min.mb, max: max.mb }
}

// KL-06: LISTA DE PERMITIDOS (antes era una lista de bloqueo, y una lista de
// bloqueo nunca es completa: propiedades de terceros como las rutas de
// librerías nativas de LWJGL/JNA o los mods extra de Fabric cargan código).
// Solo pasa lo que sirve para ajustar rendimiento y la ventana del juego, y
// ningún valor puede contener rutas. Lo descartado se informa al llamador
// (onRejected) para que el log de lanzamiento lo muestre.
const MAX_CUSTOM_ARGS = 32
// -XX:+Flag / -XX:-Flag / -XX:Flag=valor (solo GC, memoria y JIT).
const ALLOWED_XX_FLAGS = new Set([
  'UseG1GC', 'UseZGC', 'ZGenerational', 'UseShenandoahGC', 'UseParallelGC', 'UseSerialGC',
  'UnlockExperimentalVMOptions', 'ParallelRefProcEnabled', 'MaxGCPauseMillis', 'DisableExplicitGC',
  'AlwaysPreTouch', 'G1NewSizePercent', 'G1MaxNewSizePercent', 'G1HeapRegionSize', 'G1ReservePercent',
  'G1HeapWastePercent', 'G1MixedGCCountTarget', 'InitiatingHeapOccupancyPercent',
  'G1MixedGCLiveThresholdPercent', 'G1RSetUpdatingPauseTimePercent', 'G1UseAdaptiveIHOP', 'SurvivorRatio',
  'MaxTenuringThreshold', 'PerfDisableSharedMem', 'UseStringDeduplication', 'UseNUMA', 'UseLargePages',
  'UseTransparentHugePages', 'ConcGCThreads', 'ParallelGCThreads', 'ReservedCodeCacheSize',
  'MetaspaceSize', 'MaxMetaspaceSize', 'MaxDirectMemorySize', 'SoftMaxHeapSize', 'UseCompressedOops',
  'OptimizeStringConcat', 'UseCodeCacheFlushing', 'UseAdaptiveSizePolicy', 'MaxInlineLevel',
  'UseCriticalJavaThreadPriority', 'ThreadPriorityPolicy', 'AllocatePrefetchStyle', 'UseVectorCmov'
])
// -Dclave=valor: solo propiedades de codificación, red y compatibilidad de loaders.
const ALLOWED_SYSTEM_PROPERTIES = new Set([
  'file.encoding', 'stdout.encoding', 'stderr.encoding', 'sun.stdout.encoding', 'sun.stderr.encoding',
  'java.net.preferIPv4Stack', 'java.net.preferIPv6Addresses', 'log4j2.formatMsgNoLookups',
  'user.language', 'user.country', 'user.region',
  'fml.ignoreInvalidMinecraftCertificates', 'fml.ignorePatchDiscrepancies', 'fml.earlyprogresswindow',
  'fabric.debug.disableClassPathIsolation'
])
const SAFE_VALUE_RE = /^[A-Za-z0-9._+-]{0,64}$/
const SIZE_RE = /^\d{1,6}[kKmMgG]?$/
// Opciones del juego (args de Minecraft): bandera sola o con un valor.
const GAME_FLAGS = new Set(['--fullscreen', '--demo'])
const GAME_OPTIONS = {
  '--width': /^\d{2,5}$/,
  '--height': /^\d{2,5}$/,
  '--server': /^[A-Za-z0-9.-]{1,253}$/,
  '--port': /^\d{1,5}$/,
  '--quickPlayMultiplayer': /^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/,
  '--quickPlaySingleplayer': /^[^\/:*?"<>|\u0000-\u001f]{1,64}$/,
  '--quickPlayRealms': /^\d{1,12}$/
}

function isAllowedJvmArg(arg) {
  const xx = arg.match(/^-XX:([+-]?)([A-Za-z0-9]+)(?:=(.*))?$/)
  if (xx) {
    if (!ALLOWED_XX_FLAGS.has(xx[2])) return false
    if (xx[1] && xx[3] !== undefined) return false
    return xx[3] === undefined || SAFE_VALUE_RE.test(xx[3])
  }
  const prop = arg.match(/^-D([A-Za-z0-9._-]+)=(.*)$/)
  if (prop) return ALLOWED_SYSTEM_PROPERTIES.has(prop[1]) && SAFE_VALUE_RE.test(prop[2])
  // -Xss / -Xmn: tamaño de pila y generación joven. -Xmx/-Xms los gestionan los ajustes de RAM.
  const size = arg.match(/^-X(ss|mn)(.+)$/)
  if (size) return SIZE_RE.test(size[2])
  return false
}

function sanitizeCustomArgs(args, { onRejected } = {}) {
  const list = (Array.isArray(args) ? args : []).map(arg => String(arg).trim()).filter(Boolean)
  const filtered = []
  const rejected = []
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]
    if (filtered.length >= MAX_CUSTOM_ARGS) { rejected.push(arg); continue }
    if (arg.length > 256 || /[\0\n\r]/.test(arg)) { rejected.push(arg); continue }
    if (/^-[XD]/.test(arg)) {
      if (isAllowedJvmArg(arg)) filtered.push(arg)
      else rejected.push(arg)
      continue
    }
    if (GAME_FLAGS.has(arg)) { filtered.push(arg); continue }
    const pattern = Object.prototype.hasOwnProperty.call(GAME_OPTIONS, arg) ? GAME_OPTIONS[arg] : null
    if (pattern && i + 1 < list.length && pattern.test(list[i + 1])) {
      filtered.push(arg, list[i + 1])
      i++
      continue
    }
    rejected.push(arg)
  }
  if (rejected.length && typeof onRejected === 'function') onRejected(rejected)
  return filtered
}

// Los args personalizados de la UI ("Argumentos JVM") antes iban todos a los
// args del juego, así que la JVM nunca los recibía. Los de una sola raya
// (-X/-D/-XX) van a la JVM; el resto, al juego. La RAM la gestionan los
// ajustes de memoria (por eso -Xmx/-Xms están bloqueados arriba).
function splitLaunchArgs(args) {
  const jvm = []
  const game = []
  for (const arg of Array.isArray(args) ? args : []) {
    if (/^-[XD]/.test(arg)) jvm.push(arg)
    else game.push(arg)
  }
  return { jvm, game }
}

function createOfflineUuid(username) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + username).digest('hex')
  return hash.slice(0, 8) + '-' + hash.slice(8, 12) + '-' + hash.slice(12, 16) + '-' + hash.slice(16, 20) + '-' + hash.slice(20)
}

module.exports = {
  createOfflineUuid,
  sanitizeCustomArgs,
  splitLaunchArgs,
  validateMemory,
  validateUsername
}

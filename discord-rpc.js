// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Discord Rich Presence para Kindyr Launcher SIN dependencias externas.
// Habla directamente con el cliente de Discord por IPC local
// (Windows: \\.\pipe\discord-ipc-N · Linux/macOS: $XDG_RUNTIME_DIR|TMPDIR|/tmp/discord-ipc-N)
// usando el protocolo de frames: [uint32 opcode][uint32 len][json].
//
// Para activarlo en producción:
//   1. Creá una aplicación en https://discord.com/developers/applications
//   2. Subí un asset de imagen grande con key `kindyr_logo`
//   3. Poné el Client ID abajo o vía env DISCORD_CLIENT_ID
// Sin Client ID válido o sin Discord abierto, el módulo no hace nada (fail-soft).

const net = require('net')
const crypto = require('crypto')

const DISCORD_CLIENT_ID = String(process.env.DISCORD_CLIENT_ID || '1546707426550616125').trim()

const OP_HANDSHAKE = 0
const OP_FRAME = 1
const OP_CLOSE = 2
// const OP_PING = 3
// const OP_PONG = 4

const CONNECT_TIMEOUT_MS = 3000
const RETRY_DELAY_MS = 15_000

let socket = null
let rpcReady = false
let rpcConnecting = false
let rpcEnabled = true
let rpcRetryTimer = null
let readBuffer = Buffer.alloc(0)
let appStartTimestamp = Date.now()
let playStartTimestamp = null
let lastActivityKey = ''

function getDiscordClientId() {
  return DISCORD_CLIENT_ID
}

function isDiscordConfigured() {
  const id = getDiscordClientId()
  return /^[0-9]{16,21}$/.test(id) && id !== '000000000000000000'
}

function getPipeCandidates() {
  if (process.platform === 'win32') {
    const pipes = []
    for (let i = 0; i < 10; i++) pipes.push(`\\\\.\\pipe\\discord-ipc-${i}`)
    return pipes
  }
  const dirs = []
  if (process.env.XDG_RUNTIME_DIR) dirs.push(process.env.XDG_RUNTIME_DIR)
  if (process.env.TMPDIR) dirs.push(process.env.TMPDIR)
  if (process.env.TMP) dirs.push(process.env.TMP)
  if (process.env.TEMP) dirs.push(process.env.TEMP)
  dirs.push('/tmp')
  const seen = new Set()
  const pipes = []
  for (const dir of dirs) {
    const clean = String(dir || '').replace(/[\\/]+$/, '')
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    for (let i = 0; i < 10; i++) pipes.push(`${clean}/discord-ipc-${i}`)
  }
  return pipes
}

function encodeFrame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt32LE(opcode, 0)
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

function destroySocket() {
  if (!socket) return
  const s = socket
  socket = null
  try { s.removeAllListeners() } catch {}
  try { s.destroy() } catch {}
}

function clearRetryTimer() {
  if (!rpcRetryTimer) return
  clearTimeout(rpcRetryTimer)
  rpcRetryTimer = null
}

function scheduleRetry(reason) {
  clearRetryTimer()
  if (!rpcEnabled) return
  rpcRetryTimer = setTimeout(() => {
    rpcRetryTimer = null
    connectDiscordRPC().catch(() => {})
  }, RETRY_DELAY_MS)
  if (rpcRetryTimer.unref) rpcRetryTimer.unref()
  if (reason) console.log('[Discord RPC] Reintento programado:', reason)
}

function tryConnectPipe(pipePath) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(pipePath)
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { s.destroy() } catch {}
      reject(new Error('timeout'))
    }, CONNECT_TIMEOUT_MS)
    if (timer.unref) timer.unref()
    s.once('connect', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(s)
    })
    s.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
  })
}

function onSocketData(chunk) {
  readBuffer = Buffer.concat([readBuffer, chunk])
  while (readBuffer.length >= 8) {
    const opcode = readBuffer.readUInt32LE(0)
    const length = readBuffer.readUInt32LE(4)
    if (readBuffer.length < 8 + length) break
    const body = readBuffer.subarray(8, 8 + length)
    readBuffer = readBuffer.subarray(8 + length)
    if (opcode !== OP_FRAME) continue
    let message = null
    try {
      message = JSON.parse(body.toString('utf8'))
    } catch {
      continue
    }
    if (message && message.evt === 'READY') {
      rpcReady = true
      rpcConnecting = false
      clearRetryTimer()
      console.log('[Discord RPC] Conectado.')
      setDiscordState('idle').catch(() => {})
    }
    // ERROR con code 4000 (invalid client id) u otros: no reintentar a ciegas
    if (message && message.evt === 'ERROR' && message.data && Number(message.data.code) === 4000) {
      console.log('[Discord RPC] Client ID invalido, no se reintentara.')
      clearRetryTimer()
      destroySocket()
      rpcReady = false
      rpcConnecting = false
    }
  }
}

function onSocketClosed() {
  const wasReady = rpcReady
  const wasConnecting = rpcConnecting
  rpcReady = false
  rpcConnecting = false
  destroySocket()
  readBuffer = Buffer.alloc(0)
  if (!wasReady && !wasConnecting) return
  if (wasReady) {
    scheduleRetry('conexion cerrada (estaba conectado)')
    return
  }
  // El pipe existe (Discord abierto) pero cerro antes del READY:
  // casi siempre es Client ID desconocido o invalido.
  console.log('[Discord RPC] Discord cerro la conexion durante el handshake. Revisa que el Client ID sea correcto.')
  scheduleRetry('conexion rechazada (revisar Client ID)')
}

async function connectDiscordRPC() {
  if (!rpcEnabled || rpcReady || rpcConnecting) return
  if (!isDiscordConfigured()) return
  rpcConnecting = true
  readBuffer = Buffer.alloc(0)
  const candidates = getPipeCandidates()
  let lastError = null
  for (const pipePath of candidates) {
    try {
      const s = await tryConnectPipe(pipePath)
      socket = s
      socket.on('data', onSocketData)
      socket.once('error', onSocketClosed)
      socket.once('close', onSocketClosed)
      try {
        socket.write(encodeFrame(OP_HANDSHAKE, { v: 1, client_id: getDiscordClientId() }))
        console.log('[Discord RPC] Handshake enviado a ' + pipePath + ' (client_id ' + getDiscordClientId() + ')')
      } catch (error) {
        lastError = error
        onSocketClosed()
        continue
      }
      // Esperamos el evento READY en onSocketData; si no llega, el reintento lo maneja el timer.
      return
    } catch (error) {
      lastError = error
    }
  }
  rpcConnecting = false
  console.log('[Discord RPC] No se pudo conectar (Discord abierto?):', lastError?.message || String(lastError))
  scheduleRetry('fallo de conexion')
}

function buildActivity(state, info = {}) {
  const base = {
    assets: {
      large_image: 'kindyr_logo',
      large_text: 'Kindyr Launcher'
    },
    instance: false
  }
  if (state === 'playing') {
    const name = String(info.instanceName || 'Minecraft').slice(0, 128)
    const version = String(info.version || '').slice(0, 32)
    const loader = String(info.loader || 'vanilla').slice(0, 32)
    return {
      ...base,
      details: ('Jugando ' + name).slice(0, 128),
      state: (version ? 'Minecraft ' + version : 'Minecraft') + (loader && loader !== 'vanilla' ? ' • ' + loader : ''),
      timestamps: { start: playStartTimestamp || appStartTimestamp }
    }
  }
  if (state === 'starting') {
    const name = String(info.instanceName || '').slice(0, 128)
    return {
      ...base,
      details: 'Iniciando Minecraft...',
      state: name || 'Preparando juego',
      timestamps: { start: playStartTimestamp || Date.now() }
    }
  }
  return {
    ...base,
    details: 'En el launcher',
    state: 'Explorando instancias',
    timestamps: { start: appStartTimestamp }
  }
}

async function setDiscordState(state, info = {}) {
  if (!rpcEnabled || !isDiscordConfigured()) return { ok: false, reason: 'disabled-or-unconfigured' }
  if (!socket || !rpcReady) {
    connectDiscordRPC().catch(() => {})
    return { ok: false, reason: 'not-connected' }
  }
  try {
    const activity = buildActivity(state, info)
    const key = JSON.stringify(activity)
    if (key === lastActivityKey) return { ok: true, cached: true }
    lastActivityKey = key
    const nonce = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    await new Promise((resolve, reject) => {
      try {
        socket.write(
          encodeFrame(OP_FRAME, {
            cmd: 'SET_ACTIVITY',
            args: { pid: process.pid, activity },
            nonce
          }),
          (error) => (error ? reject(error) : resolve())
        )
      } catch (error) {
        reject(error)
      }
    })
    return { ok: true }
  } catch (error) {
    console.log('[Discord RPC] No se pudo actualizar actividad:', error?.message || String(error))
    rpcReady = false
    onSocketClosed()
    return { ok: false, reason: 'set-activity-failed' }
  }
}

async function clearDiscordActivity() {
  if (!socket || !rpcReady) return
  try {
    const nonce = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    await new Promise((resolve) => {
      try {
        socket.write(
          encodeFrame(OP_FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce }),
          () => resolve()
        )
      } catch {
        resolve()
      }
    })
  } catch {}
}

async function initDiscordRPC(enabled) {
  rpcEnabled = enabled !== false
  appStartTimestamp = Date.now()
  if (!rpcEnabled) return { ok: true, enabled: false }
  await connectDiscordRPC()
  return { ok: true, enabled: true, configured: isDiscordConfigured() }
}

async function setDiscordEnabled(enabled) {
  rpcEnabled = Boolean(enabled)
  clearRetryTimer()
  if (!rpcEnabled) {
    lastActivityKey = ''
    playStartTimestamp = null
    await clearDiscordActivity()
    if (socket) {
      try {
        socket.write(encodeFrame(OP_CLOSE, {}))
      } catch {}
    }
    destroySocket()
    rpcReady = false
    rpcConnecting = false
    readBuffer = Buffer.alloc(0)
    return { ok: true, enabled: false }
  }
  await connectDiscordRPC()
  return { ok: true, enabled: true, configured: isDiscordConfigured() }
}

function getDiscordState() {
  return {
    ok: true,
    enabled: rpcEnabled,
    connected: rpcReady,
    configured: isDiscordConfigured()
  }
}

function notifyDiscordLaunchStart(instanceName) {
  playStartTimestamp = Date.now()
  return setDiscordState('starting', { instanceName })
}

function notifyDiscordPlaying(instance = {}) {
  playStartTimestamp = playStartTimestamp || Date.now()
  return setDiscordState('playing', {
    instanceName: instance.name,
    version: instance.version,
    loader: instance.loader
  })
}

function notifyDiscordIdle() {
  playStartTimestamp = null
  lastActivityKey = ''
  return setDiscordState('idle')
}

async function shutdownDiscordRPC() {
  clearRetryTimer()
  lastActivityKey = ''
  await clearDiscordActivity()
  if (socket) {
    try {
      socket.write(encodeFrame(OP_CLOSE, {}))
    } catch {}
  }
  destroySocket()
  rpcReady = false
  rpcConnecting = false
  readBuffer = Buffer.alloc(0)
}

module.exports = {
  DISCORD_CLIENT_ID,
  initDiscordRPC,
  setDiscordEnabled,
  getDiscordState,
  setDiscordState,
  notifyDiscordLaunchStart,
  notifyDiscordPlaying,
  notifyDiscordIdle,
  shutdownDiscordRPC,
  isDiscordConfigured
}

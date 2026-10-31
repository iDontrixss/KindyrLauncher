// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const state = require('../state')
const { normalizeMessage } = require('../ipc-guard')

const MAX_PENDING_LOG_LINES = 500
const MAX_PENDING_LOG_BYTES = 512 * 1024
const MAX_PENDING_LOG_LINE_BYTES = 64 * 1024

function sendLauncherStatus(type, message) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return
  try {
    state.mainWindow.webContents.send('launcher-status', { type, message: normalizeMessage(message), instanceId: state.runningInstanceId || state.activeLaunchInstanceId || null })
  } catch {}
}

function flushLaunchLog(afterFlush = null) {
  if (!state.currentLogFile || state.pendingLogLines.length === 0) {
    if (!state.currentLogFile) {
      state.pendingLogLines = []
      state.pendingLogBytes = 0
    }
    state.logFlushTimer = null
    if (typeof afterFlush === 'function') afterFlush()
    return
  }

  const file = state.currentLogFile
  const chunk = state.pendingLogLines.join('')
  state.pendingLogLines = []
  state.pendingLogBytes = 0
  state.logFlushTimer = null
  fs.appendFile(file, chunk, () => {
    if (typeof afterFlush === 'function') afterFlush()
  })
}

function writeLaunchLog(message) {
  if (!state.currentLogFile) return
  const text = String(message ?? '')
  const line = `[${new Date().toLocaleTimeString()}] ${text}${text.endsWith('\n') ? '' : '\n'}`
  const lineBytes = Buffer.byteLength(line, 'utf8')

  if (lineBytes > MAX_PENDING_LOG_LINE_BYTES) {
    if (state.logFlushTimer) {
      clearTimeout(state.logFlushTimer)
      state.logFlushTimer = null
    }
    const file = state.currentLogFile
    flushLaunchLog(() => fs.appendFile(file, line, () => { }))
    return
  }

  state.pendingLogLines.push(line)
  state.pendingLogBytes += lineBytes
  if (state.pendingLogLines.length >= MAX_PENDING_LOG_LINES || state.pendingLogBytes >= MAX_PENDING_LOG_BYTES) {
    if (state.logFlushTimer) clearTimeout(state.logFlushTimer)
    flushLaunchLog()
    return
  }
  if (!state.logFlushTimer) state.logFlushTimer = setTimeout(flushLaunchLog, 250)
}

function logAndSend(type, message) {
  writeLaunchLog(message)
  sendLauncherStatus(type, message)
}

function logOnly(type, message) {
  writeLaunchLog('[' + type + '] ' + message)
}

function shouldSendData(message) {
  const now = Date.now()
  const clean = normalizeMessage(message)
  if (clean === state.lastDataMessage && now - state.lastDataSentAt < 1500) return false
  if (now - state.lastDataSentAt < 350) return false
  state.lastDataMessage = clean
  state.lastDataSentAt = now
  return true
}

function logData(message) {
  writeLaunchLog(message)
}

function shouldSendProgress(message) {
  const now = Date.now()
  if (message === state.lastProgressMessage && now - state.lastProgressSentAt < 2500) return false
  if (now - state.lastProgressSentAt < 1000) return false
  state.lastProgressMessage = message
  state.lastProgressSentAt = now
  return true
}

// Vacía la cola de log a disco de forma síncrona: el flush asíncrono
// (flushLaunchLog) puede perderse si la app sale antes del callback.
function flushLaunchLogSync() {
  if (!state.currentLogFile || state.pendingLogLines.length === 0) return
  const chunk = state.pendingLogLines.join('')
  state.pendingLogLines = []
  state.pendingLogBytes = 0
  if (state.logFlushTimer) {
    try { clearTimeout(state.logFlushTimer) } catch {}
    state.logFlushTimer = null
  }
  try {
    fs.appendFileSync(state.currentLogFile, chunk)
  } catch {}
}

module.exports = {
  flushLaunchLog,
  flushLaunchLogSync,
  logAndSend,
  logData,
  logOnly,
  sendLauncherStatus,
  shouldSendProgress,
  writeLaunchLog
}

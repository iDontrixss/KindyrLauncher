// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { getKindyrDataRoot } = require('./paths')

// F1: huérfana documentada + singleInstanceLock. withStore solo serializa
// dentro de un proceso; dos launchers pisarían stores. El lock lo hace cierto.
//
// KL-13: antes de ofrecer "matar" se exige que el PID siga siendo NUESTRA JVM.
// Firma = PID + carpeta del juego (--gameDir, siempre en la línea de comandos
// de la JVM que lanzamos) + hora real de inicio del proceso (el SO la da;
// distingue un PID reutilizado). Si algo no se puede comprobar: no se mata.
const START_WINDOW_BEFORE_MS = 120_000
const START_WINDOW_AFTER_MS = 10_000

function getOrphanFile() {
  try { return path.join(getKindyrDataRoot(), 'orphan-minecraft.json') } catch { return '' }
}
function saveOrphanInfo(info) {
  try {
    const file = getOrphanFile()
    if (!file) return
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ ...info, savedAt: Date.now() }, null, 2))
  } catch (error) {
    console.error('[Kindyr][orphan] No se pudo guardar el registro de la JVM:', error.message || error)
  }
}
function clearOrphanInfo() {
  try {
    const file = getOrphanFile()
    if (file && fs.existsSync(file)) fs.rmSync(file, { force: true })
  } catch {}
}
function loadOrphanInfo() {
  try {
    const file = getOrphanFile()
    if (!file || !fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch { return null }
}

function runFile(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      resolve(error ? '' : String(stdout || ''))
    })
  })
}

// Línea de comandos y hora de inicio (ms epoch) del proceso, o null.
async function getProcessInfo(pid, timeoutMs = 4000) {
  if (process.platform === 'win32') {
    const script = `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if ($p) { @{ cmd = $p.CommandLine; start = $p.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress }`
    const out = (await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], timeoutMs)).trim()
    if (!out) return null
    try {
      const parsed = JSON.parse(out)
      const startTimeMs = Date.parse(parsed.start)
      return { commandLine: String(parsed.cmd || ''), startTimeMs: Number.isFinite(startTimeMs) ? startTimeMs : 0 }
    } catch { return null }
  }
  // Linux/macOS: lstart tiene formato fijo de 24 caracteres ("Mon Oct 30 12:00:00 2026").
  const out = (await runFile('ps', ['-ww', '-o', 'lstart=', '-o', 'command=', '-p', String(pid)], timeoutMs)).trim()
  if (!out) return null
  const startTimeMs = Date.parse(out.slice(0, 24))
  return { commandLine: out.slice(24).trim(), startTimeMs: Number.isFinite(startTimeMs) ? startTimeMs : 0 }
}

function sameGameDir(commandLine, gameDir) {
  if (!commandLine || !gameDir) return false
  const norm = (value) => {
    const s = String(value).replace(/\\/g, '/')
    return process.platform === 'win32' ? s.toLowerCase() : s
  }
  return norm(commandLine).includes(norm(path.resolve(gameDir)))
}

async function validateOrphanProcess(info, timeoutMs = 4000, { getInfo = getProcessInfo } = {}) {
  if (!info || !Number.isInteger(Number(info.pid)) || Number(info.pid) <= 0) return { alive: false, reason: 'no-pid' }
  const pid = Number(info.pid)
  try { process.kill(pid, 0) } catch (error) {
    // EPERM: existe pero es de otro usuario; nunca es nuestra JVM.
    if (error && error.code === 'EPERM') return { alive: true, validated: false, reason: 'foreign-process' }
    return { alive: false, reason: 'not-running' }
  }
  // Registros de versiones previas no tienen la firma completa: fail-closed.
  if (!info.gameDir || !Number.isFinite(Number(info.startedAt))) return { alive: true, validated: false, reason: 'legacy-record' }
  let proc = null
  try { proc = await getInfo(pid, timeoutMs) } catch { proc = null }
  if (!proc) return { alive: true, validated: false, reason: 'unknown-no-info' }
  if (!sameGameDir(proc.commandLine, info.gameDir)) return { alive: true, validated: false, reason: 'cmd-mismatch' }
  const startedAt = Number(info.startedAt)
  if (!proc.startTimeMs || proc.startTimeMs < startedAt - START_WINDOW_BEFORE_MS || proc.startTimeMs > startedAt + START_WINDOW_AFTER_MS) {
    return { alive: true, validated: false, reason: 'pid-reused' }
  }
  return { alive: true, validated: true }
}

let orphanStatusAtBoot = null
async function checkOrphanAtBootOnce() {
  const info = loadOrphanInfo()
  if (!info || !info.pid) return null
  try { orphanStatusAtBoot = await validateOrphanProcess(info, 4000) } catch { orphanStatusAtBoot = { alive: false } }
  // Si ya no vive, limpia el registro para no ofrecer Kill fantasma.
  if (!orphanStatusAtBoot || orphanStatusAtBoot.alive === false) { try { clearOrphanInfo() } catch {} }
  return orphanStatusAtBoot
}

module.exports = {
  checkOrphanAtBootOnce,
  clearOrphanInfo,
  getProcessInfo,
  loadOrphanInfo,
  saveOrphanInfo,
  validateOrphanProcess
}

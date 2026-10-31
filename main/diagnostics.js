// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const { getKindyrDataRoot } = require('./paths')

const PROFILE_ENABLED = process.env.KINDYR_PROFILE === '1'
// F1: fatal scopeado. Periféricos (Discord/skins/fetch → unhandledRejection)
// solo se registran. uncaughtException del core con juego vivo pregunta
// "Solo launcher" (default, Esc/X) vs "Cerrar todo". Solo Solo mata la JVM
// con decisión explícita. Sin juego se mantiene exit(1) clásico.
// No se escriben stores aquí: el estado en memoria puede estar corrupto.
function writeCrashReport(source, detail) {
  try {
    const dir = getKindyrDataRoot()
    fs.mkdirSync(dir, { recursive: true })
    const crashFile = path.join(dir, `crash-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
    let appVersion = ''
    try { appVersion = app.getVersion() } catch {}
    fs.writeFileSync(crashFile, [
      `Kindyr Launcher crash report (${source})`,
      `Fecha: ${new Date().toISOString()}`,
      appVersion ? `Versión: ${appVersion}` : '',
      `Plataforma: ${process.platform} ${process.arch}`,
      '',
      detail,
      ''
    ].filter(line => line !== '').join('\n'))
    return crashFile
  } catch { return '' }
}

function getLinuxPssKiB(pid) {
  if (!PROFILE_ENABLED || process.platform !== 'linux') return null
  try {
    const rollup = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8')
    const match = rollup.match(/^Pss:\s+(\d+)\s+kB$/m)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

async function profileCheckpoint(label, renderer = null) {
  if (!PROFILE_ENABLED || !app.isReady()) return

  const mainMemory = await process.getProcessMemoryInfo()
  const processes = app.getAppMetrics().map(metric => ({
    pid: metric.pid,
    type: metric.type,
    name: metric.name,
    cpu: metric.cpu,
    memory: metric.memory,
    pssKiB: getLinuxPssKiB(metric.pid)
  }))
  const snapshot = {
    label: String(label || 'checkpoint').slice(0, 80),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime() * 10) / 10,
    mainMemory,
    mainPssKiB: getLinuxPssKiB(process.pid),
    renderer,
    processes
  }
  console.log('[Kindyr profile]', JSON.stringify(snapshot))
}

function scheduleProfileCheckpoint(label, delayMs = 0, renderer = null) {
  if (!PROFILE_ENABLED) return
  const timer = setTimeout(() => {
    profileCheckpoint(label, renderer).catch(error => {
      console.error('[Kindyr profile] Failed to collect metrics:', error.message || error)
    })
  }, delayMs)
  timer.unref?.()
}

module.exports = {
  PROFILE_ENABLED,
  scheduleProfileCheckpoint,
  writeCrashReport
}

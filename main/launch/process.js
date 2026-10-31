// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const state = require('../state')
const { flushLaunchLogSync } = require('./log')

let launchQueue = Promise.resolve()
function withLaunchLock(fn) {
  const next = launchQueue.then(fn, fn)
  launchQueue = next.catch(() => {})
  return next
}

// Apagado ordenado compartido por `kill-minecraft` y el cierre de la app.
// Cancela instalaciones XMCL en curso y pide cierre graceful a la JVM.
// Devuelve el proceso detenido o null si no había nada en marcha.
function requestMinecraftStop() {
  state.inicioCancelado = true

  if (state.xmclLaunchTask) {
    state.xmclCancellationRequested = true
    try {
      state.xmclLaunchTask.cancel().catch(() => { })
    } catch (e) {

    }
    state.xmclLaunchTask = null
  }

  if (!state.minecraftProcess) return null
  const processToStop = state.minecraftProcess
  state.minecraftStopRequested = true
  try {
    processToStop.kill('SIGTERM')
  } catch {}
  return processToStop
}

// Secuencia de salida: cancela tareas, espera cierre graceful de Minecraft
// (con SIGKILL de respaldo a los 5s), vuelca logs y apaga Discord RPC.
// Nunca rechaza: el quit debe completarse aunque algo falle.
async function shutdownForAppQuit() {
  const stopped = requestMinecraftStop()
  if (stopped) {
    await new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      try {
        stopped.once('close', finish)
      } catch {
        finish()
        return
      }
      setTimeout(() => {
        try {
          stopped.kill('SIGKILL')
        } catch {}
        finish()
      }, 5000)
    })
    if (state.minecraftProcess === stopped) state.minecraftProcess = null
    state.runningInstanceId = null
    state.currentLogFile = null
  }
  flushLaunchLogSync()
  try {
    if (state.discordRPC && typeof state.discordRPC.shutdownDiscordRPC === 'function') {
      await state.discordRPC.shutdownDiscordRPC()
    }
  } catch {}
}

module.exports = {
  requestMinecraftStop,
  shutdownForAppQuit,
  withLaunchLock
}

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { sanitizeMicrosoftAccount } = require('../../account-storage')
const state = require('../state')
const { getMinecraftCredentials, loadMicrosoftAccounts, withMicrosoftAccounts } = require('../accounts')
const { launchWithXMCL } = require('../launch/engine')
const { ensureInstanceFolders, getInstance, getLauncherLogsDir } = require('../instances-store')
const { assertTrustedIpcSender, requireTrimmedString } = require('../ipc-guard')
const { isTrustedJavaBinary, resolveJavaPath, resolveLaunchJavaPath } = require('../java')
const { sanitizeCustomArgs, validateMemory, validateUsername } = require('../launch/args')
const { flushLaunchLog, logAndSend, logOnly, writeLaunchLog } = require('../launch/log')
const { requestMinecraftStop, withLaunchLock } = require('../launch/process')
const { getMicrosoftAuth } = require('../lazy-deps')
const { clearOrphanInfo, loadOrphanInfo, validateOrphanProcess } = require('../orphan')
const { loadLauncherSettings, saveLauncherSettings } = require('../settings')
const { beginXmclLaunch } = require('../launch/xmcl-tasks')

ipcMain.handle('launch-game', async (_event, payload) => {
  try { assertTrustedIpcSender(_event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  return withLaunchLock(async () => {
  if (state.minecraftProcess || state.xmclLaunchTask || state.launchRequestInProgress) {
    return { ok: false, error: 'Minecraft ya se esta iniciando o ejecutando.' }
  }

  state.launchRequestInProgress = true
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) {
      return { ok: false, error: 'No existe la instancia seleccionada.' }
    }
    state.activeLaunchInstanceId = instance.id

  let username
  let memory
  try {
    username = validateUsername(payload.username)
    memory = validateMemory(payload.minRam, payload.maxRam)
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }

  const minecraftRoot = ensureInstanceFolders(instance)
  const launcherLogsDir = getLauncherLogsDir(instance.id)
  fs.mkdirSync(launcherLogsDir, { recursive: true })
  state.currentLogFile = path.join(launcherLogsDir, 'latest.log')
  fs.writeFileSync(state.currentLogFile, '')

  beginXmclLaunch(instance)

  let javaPath = ''
  try {
    const customJavaHome = String(payload.javaHome || '').trim()
    if (customJavaHome) {
      // S11: no basta con que la ruta "parezca" un Java (cualquier binario
      // plantado con nombre java/javaw.exe pasa resolveJavaPath). Se exige
      // procedencia confiable: runtime gestionado o carpeta elegida por el
      // usuario en el diálogo nativo. Se ejecuta la ruta canónica (realpath)
      // re-validada, cerrando swaps por symlink entre guardado y lanzamiento.
      const trust = isTrustedJavaBinary(customJavaHome)
      if (!trust.trusted) {
        throw new Error('La ruta de Java no está autorizada. Elegila de nuevo con Examinar en los ajustes de la instancia (vacío = automático).')
      }
      javaPath = resolveJavaPath(trust.canonical)
    } else {
      javaPath = await resolveLaunchJavaPath(instance.version)
    }
  } catch (error) {
    logAndSend('error', error.stack || error.message || String(error))
    flushLaunchLog()
    state.currentLogFile = null
    return { ok: false, error: error.message || String(error) }
  }

  if (!javaPath || typeof javaPath !== 'string' || javaPath.trim() === '') {
    const errMsg = 'No se encontro ruta valida de Java. Asegurate de tener Java instalado o configurado en Ajustes.'
    logAndSend('error', errMsg)
    state.currentLogFile = null
    return { ok: false, error: errMsg }
  }

  if (typeof memory.min !== 'number' || typeof memory.max !== 'number' || memory.min <= 0 || memory.max <= 0) {
    const errMsg = `Parametros de memoria invalidos: min=${memory.min}, max=${memory.max}`
    writeLaunchLog(errMsg)
    state.currentLogFile = null
    return { ok: false, error: errMsg }
  }

  const customArgs = String(payload.customArgs || '')
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean)

    logOnly('debug', 'Usando XMCL como motor de lanzamiento')
    const allowedArgs = sanitizeCustomArgs(customArgs, {
      onRejected: (rejected) => logAndSend('warn', `Argumentos ignorados (no permitidos): ${rejected.join(' ').slice(0, 400)}`)
    })
    return await launchWithXMCL(instance, username, memory, javaPath, minecraftRoot, allowedArgs)
  } finally {
    state.launchRequestInProgress = false
    state.activeLaunchInstanceId = null
  }
  })
})

ipcMain.handle('ms-login', async () => {
  try {
    const auth = getMicrosoftAuth()
    const xboxManager = await auth.launch('electron')
    const token = await xboxManager.getMinecraft()
    const minecraftCredentials = getMinecraftCredentials(token)
    const refreshToken = xboxManager.save()
    if (!refreshToken) throw new Error('Microsoft no devolvió un token de renovación válido.')
    const account = {
      id: minecraftCredentials.uuid,
      name: minecraftCredentials.name,
      uuid: minecraftCredentials.uuid,
      access_token: minecraftCredentials.access_token,
      refresh_token: refreshToken,
      client_token: crypto.randomUUID(),
      client_id: auth.token?.client_id || '',
      xuid: minecraftCredentials.xuid,
      expires_at: minecraftCredentials.expires_at,
      user_properties: minecraftCredentials.user_properties || {},
      active: true,
      type: 'microsoft'
    }
    await withMicrosoftAccounts(async (accounts) => {
      const updated = accounts.map(a => ({ ...a, active: false }))
      const existing = updated.findIndex(a => a.id === account.id)
      if (existing >= 0) updated[existing] = account
      else updated.push(account)
      return updated
    })
    return { ok: true, account: sanitizeMicrosoftAccount(account) }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-logout', async (_event, accountId) => {
  try {
    const id = requireTrimmedString(accountId, 'Cuenta', 128)
    await withMicrosoftAccounts(async (accounts) => accounts.filter(a => a.id !== id))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-accounts-list', () => {
  try {
    state.microsoftAccounts = loadMicrosoftAccounts()
    return { ok: true, accounts: state.microsoftAccounts.map(sanitizeMicrosoftAccount) }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-set-active', async (_event, accountId) => {
  try {
    const id = requireTrimmedString(accountId, 'Cuenta', 128)
    const known = loadMicrosoftAccounts().some(a => a && a.id === id)
    if (!known) throw new Error('La cuenta seleccionada no existe.')
    await withMicrosoftAccounts(async (accounts) => accounts.map(a => ({ ...a, active: a.id === id })))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('kill-minecraft', () => {
  const stopped = requestMinecraftStop()
  if (stopped) {
    setTimeout(() => {
      if (state.minecraftProcess === stopped) {
        try { stopped.kill('SIGKILL') } catch {}
      }
    }, 5000)
  }
  return { ok: true }
})

// F1 huérfana: estado al reabrir + Kill solo si pid+cmd+hora coinciden.
// Sin las tres no se mata nada (pid reutilizado). Consola por latest.log.
ipcMain.handle('orphan-status', async () => {
  try {
    const info = loadOrphanInfo()
    if (!info || !info.pid) return { ok: true, orphan: null }
    const check = await validateOrphanProcess(info, 4000)
    if (!check || check.alive === false) { try { clearOrphanInfo() } catch {} return { ok: true, orphan: null } }
    return { ok: true, orphan: { instanceId: info.instanceId || '', pid: Number(info.pid), validated: Boolean(check.validated), reason: check.reason || '' } }
  } catch (e) { return { ok: false, error: e.message || String(e) } }
})
ipcMain.handle('orphan-kill', async () => {
  try {
    const info = loadOrphanInfo()
    if (!info || !info.pid) return { ok: false, error: 'No hay proceso huérfano registrado.' }
    const check = await validateOrphanProcess(info, 4000)
    if (!check || check.alive !== true || check.validated !== true) return { ok: false, error: 'No se pudo validar el proceso huérfano. No se mata nada por seguridad.' }
    try {
      process.kill(Number(info.pid), 'SIGTERM')
      setTimeout(() => { try { process.kill(Number(info.pid), 'SIGKILL') } catch {} }, 5000).unref?.()
    } catch (e) { return { ok: false, error: e.message || String(e) } }
    try { clearOrphanInfo() } catch {}
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message || String(e) } }
})

ipcMain.handle('mc-status', () => {
  return {
    running: state.launchRequestInProgress || state.minecraftProcess !== null,
    instanceId: state.runningInstanceId || state.activeLaunchInstanceId
  }
})

ipcMain.handle('discord-set-enabled', async (_event, enabled) => {
  try {
    const settings = loadLauncherSettings()
    settings.discordEnabled = Boolean(enabled)
    saveLauncherSettings(settings)
    if (state.discordRPC) {
      const result = await state.discordRPC.setDiscordEnabled(settings.discordEnabled)
      if (settings.discordEnabled) {
        const running = getInstance(state.runningInstanceId || state.activeLaunchInstanceId)
        if (running && (state.minecraftProcess || state.launchRequestInProgress)) {
          await state.discordRPC.notifyDiscordPlaying(running).catch(() => {})
        } else {
          await state.discordRPC.notifyDiscordIdle().catch(() => {})
        }
      }
      return result
    }
    return { ok: true, enabled: settings.discordEnabled }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
})

ipcMain.handle('discord-get-state', () => {
  try {
    const settings = loadLauncherSettings()
    if (state.discordRPC && typeof state.discordRPC.getDiscordState === 'function') {
      const discordState = state.discordRPC.getDiscordState()
      return { ...discordState, enabled: settings.discordEnabled !== false }
    }
    return { ok: true, enabled: settings.discordEnabled !== false, connected: false, configured: false }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
})

ipcMain.handle('discord-set-activity', async (_event, payload = {}) => {
  try {
    if (!state.discordRPC) return { ok: false, reason: 'unavailable' }
    const settings = loadLauncherSettings()
    if (settings.discordEnabled === false) return { ok: false, reason: 'disabled' }
    return await state.discordRPC.setDiscordState(payload.state || 'idle', payload.info || {})
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
})

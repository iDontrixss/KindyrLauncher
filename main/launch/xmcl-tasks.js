// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const state = require('../state')
const { registerCustomInstance } = require('../instance-create')
const { getInstanceDir } = require('../instances-store')
const { logAndSend, logOnly, sendLauncherStatus, shouldSendProgress, writeLaunchLog } = require('./log')
const { getXmclCore } = require('../lazy-deps')
const { loadLauncherSettings } = require('../settings')

function beginXmclLaunch(instance) {
  state.launchStartedAt = Date.now()
  state.inicioCancelado = false
  state.xmclCancellationRequested = false
  state.minecraftStopRequested = false
  state.lastProgressMessage = ''
  state.lastProgressSentAt = 0
  state.lastDataMessage = ''
  state.lastDataSentAt = 0
  state.pendingLogLines = []
  state.pendingLogBytes = 0
  if (state.logFlushTimer) {
    clearTimeout(state.logFlushTimer)
    state.logFlushTimer = null
  }
  logAndSend('starting', `Preparando ${instance.name} (XMCL)`)
  try {
    if (state.discordRPC && loadLauncherSettings().discordEnabled !== false) {
      state.discordRPC.notifyDiscordLaunchStart(instance.name)
    }
  } catch {}
}

function formatMinecraftCloseMessage(code, signal, stoppedByLauncher) {
  if (stoppedByLauncher) return 'Minecraft se cerro desde el launcher.'
  if (code === 0) return 'Minecraft se cerro correctamente.'
  if (code === null || code === undefined) {
    return `Minecraft se cerro${signal ? ` (señal: ${signal})` : '.'}`
  }
  return `Minecraft se cerro/crasheo con codigo ${code}.`
}

function isXmclCancellationError(error) {
  const name = String(error?.name || '')
  const message = String(error?.message || error || '')
  return name === 'CancelledError' || /^cancelled$/i.test(message)
}

function replaceLaunchArgumentPlaceholders(argumentsList, replacements) {
  const replaceValue = (value) => {
    if (typeof value === 'string') {
      return value.replace(/\$\{(clientid|auth_xuid)\}/g, (placeholder, key) => {
        return replacements[key] || placeholder
      })
    }
    if (Array.isArray(value)) return value.map(replaceValue)
    return value
  }

  return argumentsList.map(argument => {
    if (typeof argument === 'string') return replaceValue(argument)
    return { ...argument, value: replaceValue(argument.value) }
  })
}

function applyModernAuthPlaceholders(resolvedVersion, auth) {
  if (!auth.clientId && !auth.xuid) return resolvedVersion
  return {
    ...resolvedVersion,
    arguments: {
      ...resolvedVersion.arguments,
      game: replaceLaunchArgumentPlaceholders(resolvedVersion.arguments.game, {
        clientid: auth.clientId,
        auth_xuid: auth.xuid
      })
    }
  }
}

function throwIfXmclLaunchCancelled() {
  if (state.inicioCancelado || state.xmclCancellationRequested) {
    const error = new Error('Cancelled')
    error.name = 'CancelledError'
    throw error
  }
}

async function runXmclTask(task, stage) {
  throwIfXmclLaunchCancelled()
  state.xmclLaunchTask = task
  const context = {
    onUpdate: (updatedTask) => {
      if (state.inicioCancelado || state.xmclCancellationRequested) {
        return
      }
      const total = updatedTask.total > 0 ? updatedTask.total : '?'
      const current = updatedTask.progress || 0
      const message = `${stage} ${current}/${total}`
      if (shouldSendProgress(message)) {
        writeLaunchLog(message)
        sendLauncherStatus('progress', message)
      }
    },
    onFailed: () => { }
  }

  try {
    return await task.startAndWait(context)
  } finally {
    if (state.xmclLaunchTask === task) state.xmclLaunchTask = null
  }
}

function getXmclLeafErrors(error, seen = new Set()) {
  if (!error || seen.has(error)) return []
  if (typeof error === 'object') seen.add(error)

  const nested = Array.isArray(error.errors) ? error.errors : []
  if (nested.length > 0) {
    return nested.flatMap(item => getXmclLeafErrors(item, seen))
  }
  if (error.cause && error.cause !== error) {
    const caused = getXmclLeafErrors(error.cause, seen)
    if (caused.length > 0) return caused
  }
  return [error]
}

function formatXmclError(error) {
  const errors = getXmclLeafErrors(error)
  const lines = []

  for (const item of errors) {
    const name = String(item?.name || 'Error')
    const message = String(item?.message || item || 'Error desconocido')
    const metadata = [
      item?.code ? `codigo=${item.code}` : '',
      item?.statusCode ? `HTTP=${item.statusCode}` : '',
      item?.phase ? `fase=${item.phase}` : '',
      item?.url ? `url=${item.url}` : '',
      item?.destination ? `destino=${item.destination}` : ''
    ].filter(Boolean)
    const line = `${name}: ${message}${metadata.length > 0 ? ` (${metadata.join(', ')})` : ''}`
    if (!lines.includes(line)) lines.push(line)
  }

  if (lines.length === 0) return error?.stack || error?.message || String(error)
  const heading = lines.length > 1 ? `Se produjeron ${lines.length} errores:` : 'Detalle del error:'
  return `${heading}\n${lines.slice(0, 12).join('\n')}${lines.length > 12 ? `\n...y ${lines.length - 12} errores mas.` : ''}`
}

async function waitForXmclProfile(minecraftRoot, versionIds, timeoutMs = 5 * 60 * 1000) {
  if (!Array.isArray(versionIds) || versionIds.length === 0) return ''
  const xmclCore = await getXmclCore()
  const startedAt = Date.now()
  const stableSince = new Map()
  const lastSignatures = new Map()

  while (Date.now() - startedAt < timeoutMs) {
    throwIfXmclLaunchCancelled()
    for (const versionId of versionIds) {
      const profilePath = getXmclVersionJsonPath(minecraftRoot, versionId)
      try {
        const stat = await fs.promises.stat(profilePath)
        const signature = `${stat.size}:${stat.mtimeMs}`
        if (lastSignatures.get(versionId) !== signature) {
          lastSignatures.set(versionId, signature)
          stableSince.set(versionId, Date.now())
          continue
        }
        if (Date.now() - (stableSince.get(versionId) || 0) < 1500) continue
        const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, versionId)
        if (!await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) continue
        return versionId
      } catch { }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return ''
}

async function hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion) {
  const xmclCore = await getXmclCore()
  const generatedLibraries = resolvedVersion.libraries.filter(library =>
    /^net\.minecraftforge:forge:.*:client(?:@jar)?$/.test(String(library.name || ''))
  )
  const expectedArtifacts = generatedLibraries.map(library => ({
    file: path.join(minecraftRoot, 'libraries', library.download.path),
    sha1: library.download.sha1
  }))

  const installProfilePath = path.join(minecraftRoot, 'versions', resolvedVersion.id, 'install_profile.json')
  try {
    const installProfile = JSON.parse(await fs.promises.readFile(installProfilePath, 'utf8'))
    for (const [name, value] of Object.entries(installProfile.data || {})) {
      const coordinate = value?.client
      const expectedSha = installProfile.data?.[`${name}_SHA`]?.client
      if (!coordinate || !expectedSha || !/^\[.+\]$/.test(coordinate)) continue
      const artifactPath = resolveXmclMavenCoordinate(coordinate)
      if (!artifactPath) continue
      expectedArtifacts.push({
        file: path.join(minecraftRoot, 'libraries', artifactPath),
        sha1: String(expectedSha).replace(/^'|'$/g, '')
      })
    }
  } catch { }

  for (const artifact of expectedArtifacts) {
    try {
      const stat = await fs.promises.stat(artifact.file)
      if (stat.size === 0) return false
      if (artifact.sha1 && await xmclCore.checksum(artifact.file, 'sha1') !== artifact.sha1) return false
    } catch {
      return false
    }
  }
  return true
}

function resolveXmclMavenCoordinate(value) {
  const coordinate = String(value || '').replace(/^\[|\]$/g, '')
  const [withoutExtension, extension = 'jar'] = coordinate.split('@')
  const [group, artifact, version, classifier] = withoutExtension.split(':')
  if (!group || !artifact || !version) return ''
  return `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`
}

async function removeInvalidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion) {
  const generatedLibraries = resolvedVersion.libraries.filter(library =>
    /^net\.minecraftforge:forge:.*:client(?:@jar)?$/.test(String(library.name || ''))
  )
  for (const library of generatedLibraries) {
    await fs.promises.unlink(path.join(minecraftRoot, 'libraries', library.download.path)).catch(() => { })
  }
  const installProfilePath = path.join(minecraftRoot, 'versions', resolvedVersion.id, 'install_profile.json')
  try {
    const installProfile = JSON.parse(await fs.promises.readFile(installProfilePath, 'utf8'))
    for (const [name, value] of Object.entries(installProfile.data || {})) {
      if (!installProfile.data?.[`${name}_SHA`]?.client) continue
      const artifactPath = resolveXmclMavenCoordinate(value?.client)
      if (artifactPath) await fs.promises.unlink(path.join(minecraftRoot, 'libraries', artifactPath)).catch(() => { })
    }
  } catch { }
  await fs.promises.rm(path.join(minecraftRoot, 'versions', resolvedVersion.id), { recursive: true, force: true })
}

async function runXmclTaskWithProfileFallback(task, stage, minecraftRoot, versionIds) {
  if (!Array.isArray(versionIds) || versionIds.length === 0) {
    return runXmclTask(task, stage)
  }
  const taskPromise = runXmclTask(task, stage)
  const profilePromise = waitForXmclProfile(minecraftRoot, versionIds).then(versionId => {
    if (!versionId) return new Promise(() => { })
    return versionId
  })
  const winner = await Promise.race([
    taskPromise.then(versionId => ({ source: 'task', versionId })),
    profilePromise.then(versionId => ({ source: 'profile', versionId }))
  ])

  if (winner.source === 'profile') {

    taskPromise.catch(() => { })
    Promise.resolve(task.cancel()).catch(() => { })
    if (state.xmclLaunchTask === task) state.xmclLaunchTask = null
    logOnly('debug', `${stage}: perfil ${winner.versionId} completo; continuando tras tarea XMCL pendiente.`)
  }
  return winner.versionId
}

async function runXmclTaskWithRetry(createTask, stage, attempts = 3, profileFallback = null) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfXmclLaunchCancelled()
    try {
      const task = createTask()
      return profileFallback
        ? await runXmclTaskWithProfileFallback(task, stage, profileFallback.minecraftRoot, profileFallback.versionIds)
        : await runXmclTask(task, stage)
    } catch (error) {
      if (isXmclCancellationError(error) || state.inicioCancelado || state.xmclCancellationRequested) throw error
      lastError = error
      logOnly('debug', `${stage} fallo en el intento ${attempt}: ${formatXmclError(error)}`)
      if (attempt >= attempts) break

      const delayMs = attempt * 1000
      logAndSend('progress', `${stage} tuvo errores de descarga. Reintentando (${attempt + 1}/${attempts})...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

function getXmclVersionJsonPath(minecraftRoot, versionId) {
  return path.join(minecraftRoot, 'versions', versionId, versionId + '.json')
}

function persistXmclVersionId(instance, versionId) {
  instance.xmclVersionId = versionId
  instance.updatedAt = new Date().toISOString()
  registerCustomInstance(instance)
  fs.writeFileSync(
    path.join(getInstanceDir(instance.id), 'instance.json'),
    JSON.stringify(instance, null, 2)
  )
}

module.exports = {
  applyModernAuthPlaceholders,
  beginXmclLaunch,
  formatMinecraftCloseMessage,
  formatXmclError,
  getXmclVersionJsonPath,
  hasValidXmclGeneratedArtifacts,
  isXmclCancellationError,
  persistXmclVersionId,
  removeInvalidXmclGeneratedArtifacts,
  resolveXmclMavenCoordinate,
  runXmclTaskWithRetry,
  throwIfXmclLaunchCancelled
}

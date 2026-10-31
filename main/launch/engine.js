// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { extractZipEntries } = require('../../archive-utils')
const state = require('../state')
const { getActiveMicrosoftAccount, getXuidFromMinecraftToken } = require('../accounts')
const { getExpectedXmclLoaderVersionIds, installForgeWithOfficialInstaller } = require('./forge')
const { ensureInstanceLoaderVersion } = require('../instance-create')
const { getInstanceDir } = require('../instances-store')
const { ensureJavaExecutableForLaunch, getRequiredJavaMajor } = require('../java')
const { createOfflineUuid, splitLaunchArgs } = require('./args')
const { flushLaunchLog, logAndSend, logData, logOnly, sendLauncherStatus } = require('./log')
const { getMicrosoftAuth, getXmclCore, getXmclFileTransfer, getXmclInstaller } = require('../lazy-deps')
const { clearOrphanInfo, saveOrphanInfo } = require('../orphan')
const { loadLauncherSettings, populateSharedCache, tryPopulateFromSharedCache } = require('../settings')
const { yieldToEventLoop } = require('../util')
const { applyModernAuthPlaceholders, formatMinecraftCloseMessage, formatXmclError, getXmclVersionJsonPath, hasValidXmclGeneratedArtifacts, isXmclCancellationError, persistXmclVersionId, removeInvalidXmclGeneratedArtifacts, runXmclTaskWithRetry, throwIfXmclLaunchCancelled } = require('./xmcl-tasks')

async function installXmclLoader(instance, minecraftRoot, javaPath, maxSockets, dispatcher) {
  if (!instance.loader || instance.loader === 'vanilla') return instance.version

  await ensureInstanceLoaderVersion(instance)
  throwIfXmclLaunchCancelled()
  const xmclCore = await getXmclCore()

  const cachedVersionId = String(instance.xmclVersionId || '').trim()
  if (cachedVersionId && fs.existsSync(getXmclVersionJsonPath(minecraftRoot, cachedVersionId))) {
    try {
      const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, cachedVersionId)
      if (await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) return cachedVersionId
      logOnly('debug', `Perfil XMCL en cache incompleto para ${instance.id}: faltan artefactos generados.`)
      await removeInvalidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)
    } catch (error) {
      logOnly('debug', `Perfil XMCL en cache invalido para ${instance.id}: ${error.message || error}`)
    }
  }

  const expectedVersionIds = getExpectedXmclLoaderVersionIds(instance)
  for (const versionId of expectedVersionIds) {
    if (!fs.existsSync(getXmclVersionJsonPath(minecraftRoot, versionId))) continue
    try {
      const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, versionId)
      if (!await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) {
        await removeInvalidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)
        continue
      }
      persistXmclVersionId(instance, versionId)
      return versionId
    } catch (error) {
      logOnly('debug', `Perfil XMCL detectado pero invalido (${versionId}): ${error.message || error}`)
    }
  }

  sendLauncherStatus('progress', `Instalando ${instance.loader} ${instance.loaderVersion}...`)
  const xmclInstaller = await getXmclInstaller()
  let versionId = ''

  if (instance.loader === 'fabric') {
    versionId = await xmclInstaller.installFabric({
      minecraftVersion: instance.version,
      version: instance.loaderVersion,
      minecraft: minecraftRoot,
      side: 'client'
    })
  } else if (instance.loader === 'quilt') {
    versionId = await xmclInstaller.installQuiltVersion({
      minecraftVersion: instance.version,
      version: instance.loaderVersion,
      minecraft: minecraftRoot,
      side: 'client'
    })
  } else if (instance.loader === 'forge') {
    versionId = await installForgeWithOfficialInstaller(instance, minecraftRoot, javaPath)
  } else if (instance.loader === 'neoforge') {
    versionId = await runXmclTaskWithRetry(
      () => xmclInstaller.installNeoForgedTask('neoforge', instance.loaderVersion, minecraftRoot, {
        side: 'client',
        java: javaPath,
        librariesDownloadConcurrency: maxSockets,
        dispatcher,
        mavenHost: ['https://maven.neoforged.net/releases']
      }),
      'Instalando NeoForge',
      3,
      { minecraftRoot, versionIds: expectedVersionIds }
    )
  } else {
    throw new Error(`Loader XMCL no soportado: ${instance.loader}`)
  }

  throwIfXmclLaunchCancelled()
  if (!versionId) throw new Error(`XMCL no devolvio la version instalada de ${instance.loader}.`)
  persistXmclVersionId(instance, versionId)
  return versionId
}

function waitForProcessSpawn(child) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      child.off('spawn', onSpawn)
      child.off('error', onError)
    }
    const onSpawn = () => {
      cleanup()
      resolve()
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    child.once('spawn', onSpawn)
    child.once('error', onError)
  })
}

async function checkXmclNatives(resource, version, option = {}) {
  const xmclCore = await getXmclCore()
  const nativeRoot = option.nativeRoot || resource.getNativesRoot(version.id)
  await fs.promises.mkdir(nativeRoot, { recursive: true })

  const natives = version.libraries.filter((library) => library.isNative || String(library.classifier || '').startsWith('natives'))
  const includedLibraries = natives.map((library) => library.name).sort()
  const extractedByFile = new Map()
  const platform = option.platform || xmclCore.getPlatform()

  for (const library of natives) {
    if (!library.download?.path) {
      throw Object.assign(new TypeError(`Library ${library.name}(${version.id}) has no download path!`), { library })
    }

    const excluded = library.extractExclude || []
    const archivePath = resource.getLibraryByPath(library.download.path)
    const result = await extractZipEntries(archivePath, nativeRoot, {
      maxEntries: 100000,
      maxEntryBytes: 512 * 1024 * 1024,
      maxTotalBytes: 2 * 1024 * 1024 * 1024,
      mapEntry(entryName) {
        if (entryName.includes('META-INF/') || entryName.endsWith('.sha1') || entryName.endsWith('.git')) return null
        if (excluded.some((prefix) => entryName.startsWith(prefix))) return null
        if (entryName.includes('/')) {
          const [entryOs, entryArch] = entryName.split('/')
          const normalizedArch = entryArch === 'ia32' ? 'x86' : entryArch
          if (entryOs !== platform.name || normalizedArch !== platform.arch) return null
        }
        return path.basename(entryName)
      }
    })
    for (const extracted of result.entries) {
      extractedByFile.set(extracted.relativePath, library.name)
    }
  }

  const entries = []
  for (const [file, name] of extractedByFile) {
    entries.push({ file, name, sha1: await xmclCore.checksum(path.join(nativeRoot, file), 'sha1') })
  }
  await fs.promises.writeFile(path.join(nativeRoot, '.json'), JSON.stringify({ entries, libraries: includedLibraries }))
}

async function launchWithXMCL(instance, username, memory, javaPath, minecraftRoot, customArgs) {
  const settings = loadLauncherSettings()
  const maxSockets = Math.max(2, Math.min(Number(settings.maxConcurrentDownloads) || 6, 20))
  const { jvm: jvmArgs, game: gameArgs } = splitLaunchArgs(customArgs)

  logOnly('debug', `Instancia: ${getInstanceDir(instance.id)}`)
  logOnly('debug', `Minecraft root: ${minecraftRoot}`)
  logOnly('debug', `Java major: ${getRequiredJavaMajor(instance.version)} para MC ${instance.version}`)
  logOnly('debug', `Memoria: min=${memory.min}MB max=${memory.max}MB`)
  logOnly('debug', `Descargas simultaneas: ${maxSockets}`)
  logOnly('debug', `Custom args: ${customArgs.length > 0 ? customArgs.join(' ') : '(ninguno)'}`)

  const msAccount = await getActiveMicrosoftAccount()
  const auth = msAccount ? {
    accessToken: msAccount.access_token,
    gameProfile: {
      id: msAccount.uuid,
      name: msAccount.name
    },
    userType: 'msa',
    properties: msAccount.user_properties || {},
    clientId: msAccount.client_id || getMicrosoftAuth().token?.client_id || '',
    xuid: msAccount.xuid || getXuidFromMinecraftToken(msAccount.access_token)
  } : {
    accessToken: 'null',
    gameProfile: {
      id: createOfflineUuid(username),
      name: username
    },
    userType: 'legacy',
    properties: {},
    clientId: '',
    xuid: ''
  }

  const minecraftLocation = minecraftRoot
  let installDispatcher = null

  try {
    const [xmclCore, xmclFileTransfer, xmclInstaller] = await Promise.all([
      getXmclCore(),
      getXmclFileTransfer(),
      getXmclInstaller()
    ])

    logOnly('debug', 'Obteniendo metadata de version...')
    const versionList = await xmclInstaller.getVersionList()
    const versionMeta = versionList.versions.find(v => v.id === instance.version)
    if (!versionMeta) {
      throw new Error(`Version de Minecraft no encontrada en el manifest: ${instance.version}`)
    }

    installDispatcher = xmclFileTransfer.getDefaultAgent({
      maxRetries: 5,
      minTimeout: 750,
      maxTimeout: 10000
    })
    const installOptions = {
      side: 'client',
      assetsDownloadConcurrency: maxSockets,
      librariesDownloadConcurrency: maxSockets,
      prevalidSizeOnly: true,
      dispatcher: installDispatcher
    }

    try { await tryPopulateFromSharedCache(minecraftLocation, instance.version) } catch {}
    await yieldToEventLoop()
    logOnly('debug', 'Instalando Minecraft y dependencias base...')
    const baseResolvedVersion = await runXmclTaskWithRetry(
      () => xmclInstaller.installTask(versionMeta, minecraftLocation, installOptions),
      'Descargando Minecraft'
    )
    throwIfXmclLaunchCancelled()
    await yieldToEventLoop()
    try { await populateSharedCache(minecraftLocation, instance.version) } catch {}

    javaPath = ensureJavaExecutableForLaunch(javaPath)
    logOnly('debug', `Java: ${javaPath}`)

    let resolvedVersion = baseResolvedVersion
    if (instance.loader && instance.loader !== 'vanilla') {
      const loaderVersionId = await installXmclLoader(
        instance,
        minecraftLocation,
        javaPath,
        maxSockets,
        installDispatcher
      )
      throwIfXmclLaunchCancelled()
      resolvedVersion = await xmclCore.Version.parse(minecraftLocation, loaderVersionId)
      resolvedVersion = await runXmclTaskWithRetry(
        () => xmclInstaller.installDependenciesTask(resolvedVersion, installOptions),
        `Descargando dependencias de ${instance.loader}`
      )
      throwIfXmclLaunchCancelled()
    }

    await installDispatcher.close()
    installDispatcher = null
    logOnly('debug', 'Instalacion completada. Iniciando lanzamiento...')

    resolvedVersion = applyModernAuthPlaceholders(resolvedVersion, auth)

    const launchOptions = {
      gameProfile: auth.gameProfile,
      accessToken: auth.accessToken,
      userType: auth.userType,
      properties: auth.properties,
      launcherName: 'KindyrLauncher',
      launcherBrand: 'KindyrLauncher',
      versionName: resolvedVersion.id,
      versionType: instance.versionType || 'release',
      gamePath: minecraftRoot,
      resourcePath: minecraftRoot,
      javaPath: javaPath,
      minMemory: memory.min,
      maxMemory: memory.max,
      version: resolvedVersion,
      extraJVMArgs: jvmArgs,
      extraMCArgs: gameArgs,
      // La JVM debe sobrevivir al launcher (Solo launcher / X Solo): en
      // Windows los hijos heredan el job de Electron y mueren con él aunque
      // no se les haga kill. detached:true la desacopla; el Kill explícito
      // por handle sigue funcionando igual.
      extraExecOption: { detached: true },
      prechecks: [
        xmclCore.LaunchPrecheck.checkVersion,
        xmclCore.LaunchPrecheck.checkLibraries,
        checkXmclNatives,
        xmclCore.LaunchPrecheck.linkAssets
      ]
    }

    state.minecraftProcess = await xmclCore.launch(launchOptions)

    if (state.inicioCancelado) {
      if (state.minecraftProcess) {
        state.minecraftProcess.kill('SIGKILL')
        state.minecraftProcess = null
      }
      state.currentLogFile = null
      return { ok: false, cancelled: true, error: 'Lanzamiento cancelado.' }
    }

    let spawnConfirmed = false
    if (state.minecraftProcess && state.minecraftProcess.on) {
      state.minecraftProcess.on('error', (error) => {
        if (!spawnConfirmed) return
        logAndSend('error', error.stack || error.message || String(error))
        flushLaunchLog()
        state.minecraftProcess = null
        state.runningInstanceId = null
        state.currentLogFile = null
      })

      if (state.minecraftProcess.stdout) {
        state.minecraftProcess.stdout.on('data', (data) => {
          logData(data.toString())
        })
      }

      if (state.minecraftProcess.stderr) {
        state.minecraftProcess.stderr.on('data', (data) => {
          logData(data.toString())
        })
      }

      state.minecraftProcess.on('close', (code, signal) => {
        const ranFor = Math.round((Date.now() - state.launchStartedAt) / 1000)
        const cleanMessage = formatMinecraftCloseMessage(code, signal, state.minecraftStopRequested)
        state.minecraftStopRequested = false
        logAndSend('close', `${cleanMessage} Duracion: ${ranFor}s`)
        flushLaunchLog()
        state.minecraftProcess = null
        state.runningInstanceId = null
        state.currentLogFile = null
        try { clearOrphanInfo() } catch {}
        try {
          if (state.discordRPC) state.discordRPC.notifyDiscordIdle()
        } catch {}
      })
    }

    await waitForProcessSpawn(state.minecraftProcess)
    spawnConfirmed = true
    if (state.inicioCancelado) {
      state.minecraftProcess.kill('SIGKILL')
      state.minecraftProcess = null
      state.currentLogFile = null
      return { ok: false, cancelled: true, error: 'Lanzamiento cancelado.' }
    }

    state.runningInstanceId = instance.id
    logAndSend('running', 'Minecraft iniciado.')
    // Huérfana documentada: pid+cmd+hora para validar Kill tras reinicio.
    // Consola sigue por logs/latest.log, no por pipes (se rompen si salimos).
    try {
      // KL-13: firma verificable contra el SO (ver main/orphan.js).
      saveOrphanInfo({ pid: state.minecraftProcess?.pid || null, gameDir: minecraftRoot, startedAt: Date.now(), instanceId: instance.id, version: instance.version })
    } catch {}
    try {
      if (state.discordRPC) state.discordRPC.notifyDiscordPlaying(instance)
    } catch {}
    return { ok: true }

  } catch (error) {
    if (installDispatcher) {
      await installDispatcher.close().catch(() => { })
      installDispatcher = null
    }
    state.xmclLaunchTask = null
    state.minecraftProcess = null
    state.runningInstanceId = null
    if (state.inicioCancelado || state.xmclCancellationRequested || isXmclCancellationError(error)) {
      const message = 'Lanzamiento cancelado.'
      logAndSend('close', message)
      flushLaunchLog()
      state.currentLogFile = null
      state.inicioCancelado = false
      state.minecraftStopRequested = false
      try {
        if (state.discordRPC) state.discordRPC.notifyDiscordIdle()
      } catch {}
      return { ok: false, cancelled: true, error: message }
    }
    const detailedError = formatXmclError(error)
    logAndSend('error', detailedError)
    flushLaunchLog()
    state.currentLogFile = null
    try {
      if (state.discordRPC) state.discordRPC.notifyDiscordIdle()
    } catch {}
    return { ok: false, error: detailedError }
  }
}

module.exports = {
  installXmclLoader,
  launchWithXMCL
}

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const state = require('../state')
const { getDefaultLocalDownloadDir, getUserDownloadsDir } = require('../download')
const { installXmclLoader } = require('../launch/engine')
const { getExpectedXmclLoaderVersionIds } = require('../launch/forge')
const { INSTANCE_ICON_IMAGE_EXTS, MAX_INSTANCE_ICON_BYTES, createLauncherInstance, registerCustomInstance, resolveInstanceIcon } = require('../instance-create')
const { defaultInstances, ensureInstanceFolders, getAllInstances, getInstance, getInstanceDir, getMinecraftRoot, loadCustomInstances, preparingInstances, saveCustomInstances } = require('../instances-store')
const { assertTrustedIpcSender } = require('../ipc-guard')
const { ensureJavaExecutableForLaunch, ensureManagedJava, getRequiredJavaMajor, isTrustedJavaBinary, resolveJavaPath } = require('../java')
const { sanitizeCustomArgs } = require('../launch/args')
const { sendLauncherStatus } = require('../launch/log')
const { getXmclCore, getXmclFileTransfer, getXmclInstaller } = require('../lazy-deps')
const { loadLauncherSettings, populateSharedCache, tryPopulateFromSharedCache } = require('../settings')
const { invalidateStorageCache } = require('../storage')
const { sanitizeInstanceId, yieldToEventLoop } = require('../util')
const { runXmclTaskWithRetry } = require('../launch/xmcl-tasks')

ipcMain.handle('browse-instance-icon', async () => {
  const result = await dialog.showOpenDialog(state.mainWindow, {
    title: 'Elegir ícono de la instalación',
    properties: ['openFile'],
    filters: [{ name: 'Imagen', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }
  const iconPath = result.filePaths[0]
  const ext = path.extname(iconPath).toLowerCase()
  if (!INSTANCE_ICON_IMAGE_EXTS.has(ext)) {
    return { ok: false, error: 'El ícono debe ser PNG, JPG, WebP o GIF.' }
  }
  let stat = null
  try {
    stat = fs.statSync(iconPath)
    if (!stat.isFile()) throw new Error('No es un archivo válido.')
  } catch (error) {
    return { ok: false, error: 'No se pudo leer el archivo: ' + (error.message || String(error)) }
  }
  if (stat.size > MAX_INSTANCE_ICON_BYTES) {
    return { ok: false, error: 'El ícono supera los 5 MiB.' }
  }
  return { ok: true, path: iconPath }
})

ipcMain.handle('get-downloads-dir', async () => {
  try {
    return { ok: true, path: getUserDownloadsDir(), defaultPath: getDefaultLocalDownloadDir() }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('browse-download-dir', async (_event, payload = {}) => {
  try {
    const current = String(payload.current || '').trim()
    let defaultPath = getUserDownloadsDir()
    if (current) {
      try {
        const resolved = path.resolve(current)
        if (path.isAbsolute(resolved)) defaultPath = resolved
      } catch {}
    }
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Elegir carpeta de descarga',
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }
    return { ok: true, path: result.filePaths[0] }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('create-instance', (_event, payload) => {
  try {
    const instance = createLauncherInstance(payload)
    invalidateStorageCache() // Storage size changed
    return { ok: true, instance, instances: getAllInstances() }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

function persistCustomInstance(instance) {
  instance.updatedAt = new Date().toISOString()
  registerCustomInstance(instance)
  fs.writeFileSync(path.join(getInstanceDir(instance.id), 'instance.json'), JSON.stringify(instance, null, 2))
  invalidateStorageCache()
  return instance
}

function getEditableInstance(id) {
  const instance = getInstance(id)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  if (defaultInstances.some(item => item.id === instance.id)) {
    throw new Error('Las instalaciones base no se pueden modificar.')
  }
  return instance
}

ipcMain.handle('instance-rename', (_event, payload = {}) => {
  try { assertTrustedIpcSender(typeof _event !== 'undefined' ? _event : event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  try {
    const instance = getEditableInstance(payload.id)
    const name = String(payload.name || '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 48)
    if (!name) throw new Error('Elegí un nombre válido.')
    instance.name = name
    persistCustomInstance(instance)
    return { ok: true, instance }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('instance-duplicate', async (_event, payload = {}) => {
  try { assertTrustedIpcSender(typeof _event !== 'undefined' ? _event : event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  try {
    const source = getEditableInstance(payload.id)
    const baseId = sanitizeInstanceId(source.id + '-copia') || (source.id + '-copia')
    const existingIds = new Set([...defaultInstances.map(i => i.id), ...loadCustomInstances().map(i => i.id)])
    let instanceId = baseId
    let suffix = 2
    while (existingIds.has(instanceId)) instanceId = `${baseId}-${suffix++}`
    const targetDir = getInstanceDir(instanceId)
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    await fs.promises.cp(path.join(getInstanceDir(source.id)), targetDir, { recursive: true, force: true })
    await fs.promises.rm(path.join(targetDir, 'launcher-logs'), { recursive: true, force: true }).catch(() => {})
    const instance = {
      ...JSON.parse(JSON.stringify(source)),
      id: instanceId,
      name: String(source.name || 'Instancia') + ' (copia)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    if (instance.icon && instance.icon.file) {
      const copied = path.join(targetDir, path.basename(instance.icon.file))
      instance.icon = fs.existsSync(copied) ? { file: copied } : undefined
      if (!instance.icon) delete instance.icon
    }
    persistCustomInstance(instance)
    return { ok: true, instance, instances: getAllInstances() }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('instance-delete', async (_event, payload = {}) => {
  try { assertTrustedIpcSender(_event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  try {
    const instance = getEditableInstance(payload.id)
    await fs.promises.rm(getInstanceDir(instance.id), { recursive: true, force: true })
    const remaining = loadCustomInstances().filter(item => item.id !== instance.id)
    saveCustomInstances(remaining)
    invalidateStorageCache()
    return { ok: true, instances: getAllInstances() }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('instance-set-icon', (_event, payload = {}) => {
  try { assertTrustedIpcSender(typeof _event !== 'undefined' ? _event : event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  try {
    const instance = getEditableInstance(payload.id)
    const icon = resolveInstanceIcon(payload.icon)
    const dir = getInstanceDir(instance.id)
    for (const old of fs.readdirSync(dir)) {
      if (/^icon\.(png|jpg|jpeg|webp|gif)$/i.test(old)) {
        try { fs.unlinkSync(path.join(dir, old)) } catch {}
      }
    }
    if (!icon) {
      delete instance.icon
    } else if (icon.file) {
      fs.copyFileSync(icon.sourcePath, path.join(dir, icon.file))
      instance.icon = { file: path.join(dir, icon.file) }
    } else {
      instance.icon = { fa: icon.fa, bg: icon.bg }
    }
    persistCustomInstance(instance)
    return { ok: true, instance }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('instance-set-channel', (_event, payload = {}) => {
  try {
    const instance = getEditableInstance(payload.id)
    const channel = String(payload.versionType || '').trim()
    if (!['release', 'beta', 'alpha'].includes(channel)) throw new Error('Canal inválido.')
    instance.versionType = channel
    persistCustomInstance(instance)
    return { ok: true, instance }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

function validateInstanceMemoryMb(value) {
  if (value === null || value === undefined || value === '') return null
  const mb = Math.round(Number(value))
  if (!Number.isFinite(mb) || mb < 512 || mb > 32768) throw new Error('RAM inválida: usá números 512-32768.')
  return mb
}

ipcMain.handle('instance-set-launch-opts', (_event, payload = {}) => {
  try {
    const instance = getEditableInstance(payload.id)
    const memoryMinMb = validateInstanceMemoryMb(payload.memoryMinMb)
    const memoryMaxMb = validateInstanceMemoryMb(payload.memoryMaxMb)
    if (memoryMinMb && memoryMaxMb && memoryMinMb > memoryMaxMb) {
      throw new Error('La RAM mínima no puede ser mayor que la máxima.')
    }
    const javaHome = String(payload.javaHome || '').trim()
    let canonicalJavaHome = ''
    if (javaHome) {
      // Valida estructura (existe, nombre de binario, plataforma/arq).
      const resolved = resolveJavaPath(javaHome)
      const trust = isTrustedJavaBinary(resolved)
      if (!trust.trusted) {
        throw new Error('Esa ruta de Java no fue elegida con Examinar ni es un runtime gestionado. Elegila de nuevo con Examinar para autorizarla.')
      }
      canonicalJavaHome = trust.canonical
    }
    instance.memoryMinMb = memoryMinMb
    instance.memoryMaxMb = memoryMaxMb
    instance.javaHome = canonicalJavaHome
    // S11: se persiste ya sanitizado (mismo filtro que en lanzamiento), para
    // que el valor guardado nunca contenga vectores de agente/classpath.
    instance.javaArgs = sanitizeCustomArgs(String(payload.javaArgs || '').split(/\s+/).map(item => item.trim()).filter(Boolean)).join(' ').slice(0, 500)
    persistCustomInstance(instance)
    return { ok: true, instance }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('instance-change-version', (_event, payload = {}) => {
  try {
    const instance = getEditableInstance(payload.id)
    const version = String(payload.version || '').trim()
    const loader = String(payload.loader || 'vanilla').trim()
    const loaderVersion = String(payload.loaderVersion || '').trim()
    if (!version) throw new Error('Elegí una versión.')
    if (!['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(loader)) throw new Error('Loader invalido.')
    if (loader !== 'vanilla' && !loaderVersion) throw new Error('Ese loader no es compatible con esa versión.')
    if (loaderVersion && /[<>:"/\\|?*\x00-\x1F]/.test(loaderVersion)) throw new Error('Versión de loader inválida.')
    if (loader === 'forge' && loaderVersion && !/^[\w.-]+$/.test(loaderVersion)) throw new Error('Versión de Forge inválida.')
    if (loader === 'neoforge' && loaderVersion && !/^\d+\.\d+\.\d+$/.test(loaderVersion)) throw new Error('Versión de NeoForge inválida.')
    instance.version = version
    instance.loader = loader
    instance.loaderVersion = loader === 'vanilla' ? '' : loaderVersion
    instance.type = loader === 'vanilla' ? 'vanilla' : instance.type === 'modpack' ? 'modpack' : 'loader'
    delete instance.xmclVersionId
    persistCustomInstance(instance)
    return { ok: true, instance }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('instance-repair', (_event, payload = {}) => {
  try {
    const instance = getEditableInstance(payload.id)
    const ids = new Set()
    if (instance.xmclVersionId) ids.add(String(instance.xmclVersionId))
    try {
      for (const id of getExpectedXmclLoaderVersionIds(instance)) ids.add(id)
    } catch {}
    for (const id of ids) {
      if (!id) continue
      fs.rmSync(path.join(getMinecraftRoot(instance.id), 'versions', id), { recursive: true, force: true })
    }
    delete instance.xmclVersionId
    persistCustomInstance(instance)
    return { ok: true, instance }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('instance-unlink-modpack', (_event, payload = {}) => {
  try {
    const instance = getEditableInstance(payload.id)
    delete instance.source
    delete instance.projectId
    delete instance.slug
    delete instance.versionId
    if (instance.type === 'modpack') instance.type = instance.loader === 'vanilla' ? 'vanilla' : 'loader'
    persistCustomInstance(instance)
    return { ok: true, instance }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('prepare-instance', async (_event, instanceId) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'No existe la instancia seleccionada.' }
  if (preparingInstances.has(instanceId)) return { ok: false, error: 'Ya se está preparando esta instancia.' }
  if (state.minecraftProcess || state.launchRequestInProgress) return { ok: false, error: 'Minecraft se está iniciando, esperá a que termine.' }
  const minecraftRoot = ensureInstanceFolders(instance)
  const task = (async () => {
    try {
      sendLauncherStatus('progress', `Preparando ${instance.name}…`)
      try { await tryPopulateFromSharedCache(minecraftRoot, instance.version) } catch {}
      const maxSockets = Math.max(1, Math.min(Number(loadLauncherSettings().maxConcurrentDownloads) || 6, 20))
      sendLauncherStatus('progress', `Descargando Java ${getRequiredJavaMajor(instance.version)}…`)
      const javaPath = await ensureManagedJava(instance.version)
      await yieldToEventLoop()
      ensureJavaExecutableForLaunch(javaPath)
      const [xmclCore, xmclFileTransfer, xmclInstaller] = await Promise.all([getXmclCore(), getXmclFileTransfer(), getXmclInstaller()])
      const versionList = await xmclInstaller.getVersionList()
      const versionMeta = versionList.versions.find(v => v.id === instance.version)
      if (!versionMeta) throw new Error(`Versión de Minecraft no encontrada: ${instance.version}`)
      const dispatcher = xmclFileTransfer.getDefaultAgent({ maxRetries: 5, minTimeout: 750 })
      const installOptions = { side: 'client', assetsDownloadConcurrency: maxSockets, librariesDownloadConcurrency: maxSockets, prevalidSizeOnly: true, dispatcher }
      await runXmclTaskWithRetry(() => xmclInstaller.installTask(versionMeta, minecraftRoot, installOptions), 'Descargando Minecraft')
      await yieldToEventLoop()
      try { await populateSharedCache(minecraftRoot, instance.version) } catch {}
      if (instance.loader && instance.loader !== 'vanilla') {
        await installXmclLoader(instance, minecraftRoot, javaPath, maxSockets, dispatcher)
        const loaderVersionId = instance.xmclVersionId || (typeof getExpectedXmclLoaderVersionIds === 'function' ? getExpectedXmclLoaderVersionIds(instance)[0] : '')
        if (loaderVersionId) {
          const resolved = await xmclCore.Version.parse(minecraftRoot, loaderVersionId)
          await runXmclTaskWithRetry(() => xmclInstaller.installDependenciesTask(resolved, installOptions), `Descargando ${instance.loader}`)
        }
      }
      await dispatcher.close().catch(() => {})
      sendLauncherStatus('progress', `Instancia lista: ${instance.name}`)
      invalidateStorageCache()
      return { ok: true }
    } catch (error) {
      const msg = error?.message || String(error)
      sendLauncherStatus('error', `No se pudo preparar ${instance.name}: ${msg}`)
      throw error
    } finally {
      preparingInstances.delete(instanceId)
    }
  })()
  preparingInstances.set(instanceId, task)
  task.catch(() => {})
  return { ok: true, preparing: true }
})

ipcMain.handle('prepare-status', () => {
  return { ok: true, preparing: [...preparingInstances.keys()] }
})

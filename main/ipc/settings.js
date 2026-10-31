// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain, shell, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const state = require('../state')
const { ensureDefaultInstances, getAllInstances } = require('../instances-store')
const { assertTrustedIpcSender } = require('../ipc-guard')
const { JAVA_MAJORS, approveJavaBinary, authorizeJavaHome, detectJavaInstallation, downloadManagedJava, javaHomeFromCandidate, readManagedJavaHome, validateJavaHome } = require('../java')
const { getKindyrDataRoot, getLauncherCacheDir } = require('../paths')
const { loadLauncherSettings, saveLauncherSettings, sendSettingsStatus } = require('../settings')
const { getStorageInfo, invalidateStorageCache } = require('../storage')
const { loaderVersionRequests } = require('../versions')

ipcMain.handle('get-instances', () => {
  ensureDefaultInstances()
  return getAllInstances()
})

ipcMain.handle('get-data-root', () => {
  ensureDefaultInstances()
  return getKindyrDataRoot()
})

ipcMain.handle('settings-get-java', () => {
  const settings = loadLauncherSettings()
  const installs = JAVA_MAJORS.map(major => {
    const custom = String(settings.javaInstalls[String(major)] || '').trim()
    const managed = readManagedJavaHome(major)
    const activeHome = custom || managed || ''
    const check = validateJavaHome(activeHome)
    return {
      major,
      path: activeHome,
      valid: check.valid,
      source: custom ? 'custom' : managed ? 'managed' : 'none'
    }
  })
  return { ok: true, installs, maxConcurrentDownloads: settings.maxConcurrentDownloads }
})

ipcMain.handle('settings-save-resources', (_event, payload) => {
  try {
    const current = loadLauncherSettings()
    if (current && current._readOnly) return { ok: false, readOnly: true, error: 'Configuración en solo lectura (versión futura).' }
    if (current && current._corrupt) return { ok: false, corrupt: true, bak: current._corruptBak || '', error: 'Configuración corrupta preservada. No se sobrescribe.' }
    const value = Math.max(1, Math.min(Number(payload.maxConcurrentDownloads) || 6, 20))
    const next = { ...current, maxConcurrentDownloads: value }
    delete next._corrupt; delete next._corruptBak; delete next._futureVersion; delete next._readOnly
    saveLauncherSettings(next)
    return { ok: true, maxConcurrentDownloads: value }
  } catch (e) { return { ok: false, error: e.message || String(e) } }
})

// KL-05: una ruta escrita a mano (o enviada por el renderer) no es procedencia
// confiable. Si el binario no está aprobado, lo confirma el usuario en un
// diálogo nativo que el renderer no puede responder. Los diálogos se
// serializan: guardar ajustes envía las cuatro versiones a la vez.
let javaApprovalQueue = Promise.resolve()
function confirmJavaApproval(javaPath) {
  const run = javaApprovalQueue.then(async () => {
    const owner = state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined
    const { response } = await dialog.showMessageBox(owner, {
      type: 'warning',
      title: 'Autorizar Java',
      message: '¿Usar este ejecutable de Java para lanzar Minecraft?',
      detail: `${javaPath}\n\nSolo autorizalo si instalaste vos este Java. Kindyr ejecutará este archivo al iniciar el juego.`,
      buttons: ['Cancelar', 'Autorizar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    return response === 1
  })
  javaApprovalQueue = run.catch(() => false)
  return run
}

ipcMain.handle('settings-set-java-path', async (_event, payload) => {
  try { assertTrustedIpcSender(_event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  const major = String(payload && payload.major || '')
  if (!JAVA_MAJORS.includes(Number(major))) {
    return { ok: false, error: 'Version de Java invalida.' }
  }
  const cleanPath = String(payload && payload.path || '').trim()
  let home = ''
  if (cleanPath) {
    const authorized = await authorizeJavaHome(cleanPath, { confirm: confirmJavaApproval })
    if (!authorized.ok) return authorized
    home = authorized.home
  }
  // Releer después de autorizar: approveJavaBinary ya guardó la aprobación.
  const settings = loadLauncherSettings()
  settings.javaInstalls[major] = home
  saveLauncherSettings(settings)
  return { ok: true, path: home, valid: Boolean(home) }
})

ipcMain.handle('settings-browse-java', async () => {
  const result = await dialog.showOpenDialog(state.mainWindow, {
    title: 'Seleccionar carpeta de Java',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }
  const home = javaHomeFromCandidate(result.filePaths[0])
  if (!home) return { ok: false, error: `No se encontro un runtime Java compatible con ${process.platform} en esa carpeta.` }
  // S11: la carpeta fue elegida por el usuario en el diálogo nativo del SO
  // (el renderer no puede forjar este resultado en silencio), así que su
  // binario queda registrado como procedencia confiable para futuros
  // javaHome por instancia.
  try {
    const check = validateJavaHome(home)
    if (check.valid && check.path) approveJavaBinary(check.path)
  } catch {}
  return { ok: true, path: home }
})

ipcMain.handle('settings-detect-java', (_event, major) => {
  const parsed = Number(major)
  if (!JAVA_MAJORS.includes(parsed)) return { ok: false, error: 'Version de Java invalida.' }
  const detected = detectJavaInstallation(parsed)
  // La búsqueda la hace main en ubicaciones estándar del sistema (JAVA_HOME,
  // Program Files, /usr/lib/jvm...): procedencia elegida por el launcher, no
  // por el renderer, así que el binario encontrado queda aprobado.
  if (detected.ok && detected.source === 'detected') {
    try {
      const check = validateJavaHome(detected.path)
      if (check.valid && check.path) approveJavaBinary(check.path)
    } catch (error) {
      console.error('[Kindyr][java] No se pudo aprobar el Java detectado:', error.message || error)
    }
  }
  return detected
})

ipcMain.handle('settings-install-java', async (_event, major) => {
  const parsed = Number(major)
  if (!JAVA_MAJORS.includes(parsed)) return { ok: false, error: 'Version de Java invalida.' }
  try {
    const javaw = await downloadManagedJava(parsed, (type, message) => sendSettingsStatus(type, message))
    return { ok: true, path: path.dirname(path.dirname(javaw)) }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('settings-get-storage', async () => {
  const dataRoot = getKindyrDataRoot()
  const result = await getStorageInfo()
  result.dataRoot = dataRoot
  return result
})

ipcMain.handle('settings-purge-cache', () => {
  try { assertTrustedIpcSender(typeof _event !== 'undefined' ? _event : event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  state.minecraftVersionCache = null
  state.minecraftVersionRequest = null
  state.loaderVersionCache = {}
  loaderVersionRequests.clear()
  if (state.versionCacheCleanupTimer) {
    clearTimeout(state.versionCacheCleanupTimer)
    state.versionCacheCleanupTimer = null
  }

  // Solo caché/runtime (_extract). No usar para instancias: es fallback síncrono acotado.
  const removeDirTolerant = (dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) return

      try {
        fs.rmSync(dirPath, { recursive: true, force: true })
        return
      } catch (directErr) {
        const removeRecursiveSafe = (currentPath, depth = 0) => {
          if (depth > 64) return
          let st = null
          try { st = fs.lstatSync(currentPath) } catch { return }
          // No seguir symlinks: unlink directo para no borrar fuera de caché.
          if (st.isSymbolicLink()) {
            try { fs.unlinkSync(currentPath) } catch {}
            return
          }
          try {
            if (st.isDirectory()) {
              const entries = fs.readdirSync(currentPath)
              for (const entry of entries) {
                removeRecursiveSafe(path.join(currentPath, entry), depth + 1)
              }
              try {
                fs.rmdirSync(currentPath)
              } catch (rmdirErr) {
              }
            } else {
              try {
                fs.unlinkSync(currentPath)
              } catch (unlinkErr) {
              }
            }
          } catch (statErr) {
          }
        }
        removeRecursiveSafe(dirPath)
      }
    } catch (err) {
    }
  }

  const cacheDir = getLauncherCacheDir()
  removeDirTolerant(cacheDir)

  const runtimeDir = path.join(getKindyrDataRoot(), 'runtime')
  if (fs.existsSync(runtimeDir)) {
    for (const entry of fs.readdirSync(runtimeDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name === '_extract') {
        removeDirTolerant(path.join(runtimeDir, entry.name))
      }
    }
  }
  invalidateStorageCache() // Cache size changed
  return { ok: true }
})

ipcMain.handle('settings-open-data-root', () => {
  const dataRoot = getKindyrDataRoot()
  fs.mkdirSync(dataRoot, { recursive: true })
  shell.openPath(dataRoot)
  return { ok: true, path: dataRoot }
})

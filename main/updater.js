// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const APP_ROOT = require('path').resolve(__dirname, '../')
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const state = require('./state')
const { assertTrustedIpcSender } = require('./ipc-guard')
const { getSemver } = require('./lazy-deps')
const { getKindyrDataRoot } = require('./paths')
const { loadLauncherSettings } = require('./settings')
const { getRendererWebPreferences, hardenWindowNavigation } = require('./window-helpers')
const trustedUpdatePublicKeys = require('./update-public-keys')
const { fetchWithTimeout } = require('./http')
const {
  MANIFEST_ASSET_NAME,
  MAX_MANIFEST_BYTES,
  MAX_SIGNATURE_BYTES,
  SIGNATURE_ASSET_NAME,
  verifySignedManifest,
  verifyUpdateInfoAgainstManifest
} = require('./update-signature')

const UPDATE_REPO = 'iDontrixss/KindyrLauncher'
// Última actualización cuyo manifiesto firmado verificó; solo lo que cubra este
// manifiesto puede ofrecerse, descargarse o instalarse.
let verifiedUpdate = null
// Versión que el usuario rechazó en esta sesión (no insistir en cada chequeo periódico).
let dismissedVersion = null

function getAutoUpdater() {
  if (!state.autoUpdaterInstance) {
    state.autoUpdaterInstance = require('electron-updater').autoUpdater
  }
  configureAutoUpdater(state.autoUpdaterInstance)
  return state.autoUpdaterInstance
}

function assertSafeReleaseDownloadUrl(value) {
  const parsed = new URL(String(value || ''))
  const host = parsed.hostname.toLowerCase()
  const allowedHosts = ['github.com', 'objects.githubusercontent.com']
  const allowed = parsed.protocol === 'https:' && allowedHosts.some(h => host === h || host.endsWith('.' + h))
  if (!allowed) throw new Error('URL de descarga no permitida.')
  return parsed.toString()
}

let pendingUpdateInfo = null
let updateConfirmationWindow = null

async function isPrerelease(version) {
  const semverPrerelease = getSemver().prerelease(version)
  if (semverPrerelease !== null) {
    return true
  }

  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetchWithTimeout(`https://api.github.com/repos/iDontrixss/KindyrLauncher/releases/tags/v${version}`)
      if (response.ok) {
        const releaseData = await response.json()
        return releaseData.prerelease === true
      }
    } catch (e) {
      lastError = e
      if (attempt < 5) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  console.error(`Failed to verify release status for v${version} after 5 attempts:`, lastError?.message || lastError)
  return null
}

function showUpdateConfirmation(updateInfo) {
  pendingUpdateInfo = updateInfo

  const settings = loadLauncherSettings()
  const language = settings?.language || 'es'

  const title = language === 'es' ? 'Actualización de prueba disponible' : 'Test update available'
  const message = language === 'es'
    ? `La versión más reciente disponible es una versión de prueba y puede contener errores. ¿Desea instalarla?`
    : `The latest available version is a test version and may contain bugs. Do you want to install it?`
  const acceptText = language === 'es' ? 'Instalar' : 'Install'
  const cancelText = language === 'es' ? 'Cancelar' : 'Cancel'

  // Si ya hay un aviso abierto, traerlo al frente en lugar de crear otro
  if (updateConfirmationWindow && !updateConfirmationWindow.isDestroyed()) {
    try { updateConfirmationWindow.show(); updateConfirmationWindow.focus(); updateConfirmationWindow.moveTop(); } catch {}
    return
  }

  updateConfirmationWindow = new BrowserWindow({
    width: 560,
    height: 420,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#030f2b',
    webPreferences: getRendererWebPreferences(path.join(APP_ROOT, 'preload.js'))
  })
  hardenWindowNavigation(updateConfirmationWindow)

  updateConfirmationWindow.loadFile('update-confirmation.html', {
    query: { title, message, acceptText, cancelText, version: updateInfo.version }
  })

  updateConfirmationWindow.once('ready-to-show', () => {
    try {
      updateConfirmationWindow.show()
      updateConfirmationWindow.focus()
      updateConfirmationWindow.moveTop()
      updateConfirmationWindow.setAlwaysOnTop(true)
      // Asegurar que quede por encima incluso si el launcher estaba en segundo plano
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.focus()
        updateConfirmationWindow.focus()
      }
    } catch {}
  })

  updateConfirmationWindow.on('closed', () => {
    updateConfirmationWindow = null
    pendingUpdateInfo = null
  })
}

function getPreviousVersionFile() {
  return path.join(getKindyrDataRoot(), 'previous-version.json')
}
function savePreviousVersion(version) {
  try {
    fs.mkdirSync(getKindyrDataRoot(), { recursive: true })
    fs.writeFileSync(getPreviousVersionFile(), JSON.stringify({ version: String(version), savedAt: Date.now() }, null, 2))
  } catch {}
}
function loadPreviousVersion() {
  try {
    if (!fs.existsSync(getPreviousVersionFile())) return null
    const data = JSON.parse(fs.readFileSync(getPreviousVersionFile(), 'utf8'))
    return data.version || null
  } catch { return null }
}

function configureAutoUpdater(updater) {
  if (state.autoUpdaterConfigured) return
  state.autoUpdaterConfigured = true

  // MODO MANUAL: vos controlás cuándo aparece la actualización.
  // No se descarga ni instala solo. Todo requiere confirmación explícita del usuario.
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  // Canal beta: tiene que ser true. Con false, electron-updater resuelve la
  // versión vía GET /releases/latest, endpoint que EXCLUYE prereleases por
  // definición → beta-a-beta jamás se ofrecería (verificado en
  // electron-updater 6.8.9: GitHubProvider.getLatestTagName). Con true usa el
  // feed Atom, elige prereleases del mismo canal y cae a latest.yml si no hay
  // latest-beta.yml. No habilita downgrades de rebote (eso solo lo fuerza el
  // setter de .channel, que no se usa); allowDowngrade sigue en false y las
  // firma del manifiesto + confirmación + semver siguen vigentes.
  updater.allowPrerelease = true
  updater.allowDowngrade = false

  updater.on('update-available', async (updateInfo) => {
    // Fail-closed: lo que informa latest.yml debe estar cubierto por el manifiesto firmado.
    try {
      if (!verifiedUpdate) throw new Error('no hay manifiesto firmado verificado')
      verifyUpdateInfoAgainstManifest(updateInfo, verifiedUpdate.manifest)
    } catch (error) {
      console.error('[Kindyr][update] Actualización rechazada:', error.message || error)
      verifiedUpdate = null
      return
    }
    // Guardar versión actual como previa antes de actualizar (para downgrade manual)
    try { savePreviousVersion(app.getVersion()) } catch {}
    updateDownloadedReady = false
    lastUpdateInfo = updateInfo
    // Notificar al renderer para mostrar botón "Actualizar" en topnav — sin descargar
    try { state.mainWindow?.webContents.send('update-available-notify', updateInfo) } catch {}
    const isPrereleaseVersion = await isPrerelease(updateInfo.version)

    if (isPrereleaseVersion === null) {
      console.error(`Could not verify release status for v${updateInfo.version}, skipping update`)
      return
    }

    // En modo manual, siempre pedimos confirmación, tanto para stable como prerelease
    if (dismissedVersion === updateInfo.version) return
    showUpdateConfirmation(updateInfo)
  })

  updater.on('download-progress', (progress) => {
    state.splashWindow?.webContents.send('update-status', `Descargando... ${Math.round(progress.percent)}%`)
    try { state.mainWindow?.webContents.send('update-download-progress', progress) } catch {}
  })

  updater.on('update-downloaded', () => {
    // No auto-instala. Avisa y espera a que el usuario haga clic en "Reiniciar para actualizar"
    updateDownloadedReady = true
    state.splashWindow?.webContents.send('update-status', 'Actualización lista — reinicia para instalar')
    try { state.mainWindow?.webContents.send('update-downloaded-notify', lastUpdateInfo) } catch {}
  })

  updater.on('error', (err) => {
    console.error('AutoUpdater error:', err.message)
  })
}

let lastUpdateInfo = null
// S5: install-update solo tiene sentido tras una descarga completa avisada
// por 'update-downloaded'. Sin este gate, un renderer comprometido podía
// forzar quitAndInstall (cierre de la app) en cualquier momento.
let updateDownloadedReady = false
ipcMain.handle('show-update-notice', () => {
  const info = pendingUpdateInfo || lastUpdateInfo
  if (info) {
    showUpdateConfirmation(info)
    return { ok: true }
  }
  // Si no hay pendiente, forzar check (firmado)
  dismissedVersion = null
  checkSignedUpdate().catch(() => {})
  return { ok: false, error: 'No hay actualización pendiente' }
})
ipcMain.handle('check-for-updates', async () => {
  try {
    dismissedVersion = null
    if (!await checkSignedUpdate()) {
      return { ok: false, error: 'No hay una actualización firmada disponible.' }
    }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message || String(e) } }
})
ipcMain.handle('get-last-update-info', () => {
  const candidate = lastUpdateInfo || pendingUpdateInfo || null
  if (!candidate || !candidate.version) return null
  try {
    const semver = getSemver()
    const cur = semver.valid(String(app.getVersion()).replace(/^[vV]/, ''), { loose: true })
    const cand = semver.valid(String(candidate.version).replace(/^[vV]/, ''), { loose: true })
    if (cur && cand && !semver.gt(cand, cur)) return null
  } catch {}
  return candidate
})

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchWithRetry(url, options, label) {
  // Ciclo 5s -> espera 3s -> 5s con logs en tiempo real
  for (let intento = 1; intento <= 2; intento++) {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 5000)
    console.log(`[Kindyr][${label}] Intento ${intento}/2 — GET ${url} (timeout 5s)`)
    try {
      const res = await fetchWithTimeout(url, { ...options, signal: ctrl.signal })
      clearTimeout(timeout)
      console.log(`[Kindyr][${label}] Respuesta ${res.status} en intento ${intento}`)
      return res
    } catch (e) {
      clearTimeout(timeout)
      const isTimeout = e.name === 'AbortError' || String(e.message).includes('aborted')
      console.warn(`[Kindyr][${label}] ${isTimeout ? 'Timeout 5s' : 'Error'} en intento ${intento}/2: ${e.message || e}`)
      if (intento === 1) {
        console.log(`[Kindyr][${label}] Esperando 3s antes de reintento...`)
        await sleep(3000)
      } else {
        throw e
      }
    }
  }
}

async function downloadReleaseAsset(asset, maxBytes) {
  const url = assertSafeReleaseDownloadUrl(asset && asset.browser_download_url)
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'KindyrLauncher/' + app.getVersion() } }, 'asset ' + asset.name)
  if (!res.ok) throw new Error(`HTTP ${res.status} descargando ${asset.name}`)
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${asset.name} demasiado grande.`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > maxBytes) throw new Error(`${asset.name} demasiado grande.`)
  return bytes
}

// Busca la release más nueva cuyo manifiesto esté firmado con una clave de confianza.
// Las releases sin manifiesto, con firma inválida, con tag distinto o que no sean
// más nuevas que la instalada se descartan: subir o reemplazar una release en
// GitHub no basta para que el launcher la ofrezca.
async function findSignedUpdate() {
  if (!Array.isArray(trustedUpdatePublicKeys) || !trustedUpdatePublicKeys.length) {
    console.warn('[Kindyr][update] Sin claves públicas de actualización: no se ofrecerán actualizaciones.')
    return null
  }
  const response = await fetchWithRetry(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=20`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + app.getVersion() }
  }, 'GitHub Releases')
  if (!response.ok) throw new Error(`GitHub Releases HTTP ${response.status}`)
  const releases = await response.json()
  if (!Array.isArray(releases)) throw new Error('Respuesta de GitHub Releases inválida.')

  const semver = getSemver()
  const current = semver.valid(String(app.getVersion()).replace(/^[vV]/, ''), { loose: true })
  if (!current) return null
  const candidates = releases
    .filter(release => release && !release.draft)
    .map(release => ({ release, version: semver.valid(String(release.tag_name || '').replace(/^[vV]/, ''), { loose: true }) }))
    .filter(item => item.version && semver.gt(item.version, current))
    .sort((a, b) => semver.rcompare(a.version, b.version))

  for (const { release } of candidates) {
    const assets = Array.isArray(release.assets) ? release.assets : []
    const manifestAsset = assets.find(asset => asset && asset.name === MANIFEST_ASSET_NAME)
    const signatureAsset = assets.find(asset => asset && asset.name === SIGNATURE_ASSET_NAME)
    if (!manifestAsset || !signatureAsset) {
      console.warn(`[Kindyr][update] ${release.tag_name} sin manifiesto firmado: descartada.`)
      continue
    }
    try {
      const [manifestBytes, signatureBytes] = await Promise.all([
        downloadReleaseAsset(manifestAsset, MAX_MANIFEST_BYTES),
        downloadReleaseAsset(signatureAsset, MAX_SIGNATURE_BYTES)
      ])
      const manifest = verifySignedManifest({
        manifestBytes,
        signature: signatureBytes.toString('utf8'),
        publicKeys: trustedUpdatePublicKeys,
        releaseTag: release.tag_name,
        currentVersion: app.getVersion()
      })
      console.log(`[Kindyr][update] ${release.tag_name}: firma verificada.`)
      return { release, manifest }
    } catch (error) {
      console.warn(`[Kindyr][update] ${release.tag_name} descartada: ${error.message || error}`)
    }
  }
  return null
}

// Verifica el manifiesto y, solo entonces, deja que electron-updater lea latest.yml
// de ESA release (el feed queda fijado al tag firmado: una release posterior sin
// firmar no puede desviar al updater).
async function checkSignedUpdate() {
  const found = await findSignedUpdate()
  if (!found) {
    console.log('[Kindyr][update] No hay actualización firmada más nueva.')
    return false
  }
  verifiedUpdate = found
  const updater = getAutoUpdater()
  updater.setFeedURL({ provider: 'generic', url: `https://github.com/${UPDATE_REPO}/releases/download/${found.release.tag_name}` })
  await updater.checkForUpdates()
  return true
}

async function checkForUpdatesOnStartup() {
  if (!app.isPackaged) {
    console.log('[Kindyr] Update check skipped outside packaged app')
    return
  }

  try {
    await checkSignedUpdate()
  } catch (error) {
    console.warn('[Kindyr] Chequeo de actualización falló (se reintentará):', error.message || error)
  }
}

ipcMain.on('update-confirm', (_event, accepted) => {
  if (!accepted && pendingUpdateInfo) dismissedVersion = pendingUpdateInfo.version
  if (accepted && pendingUpdateInfo && verifiedUpdate && pendingUpdateInfo.version === verifiedUpdate.manifest.version) {
    getAutoUpdater().downloadUpdate()
    state.splashWindow?.webContents.send('update-status', 'Descargando actualización...')
    try { state.mainWindow?.webContents.send('update-status', 'Descargando actualización...') } catch {}
  }
  updateConfirmationWindow?.close()
})
ipcMain.handle('install-update', (_event) => {
  try { assertTrustedIpcSender(_event) } catch (e) { return { ok: false, error: e.message || String(e) } }
  if (!updateDownloadedReady) return { ok: false, error: 'No hay actualización descargada pendiente de instalar.' }
  try { getAutoUpdater().quitAndInstall() } catch (e) { console.error('quitAndInstall failed', e) }
  return { ok: true }
})

let updatePollInterval = null
const UPDATE_POLL_MS = 30 * 60 * 1000
function startUpdatePolling() {
  if (!app.isPackaged) return
  if (updatePollInterval) clearInterval(updatePollInterval)
  // Para quien deja el launcher abierto: cada 30 min busca una release firmada nueva
  // (la API anónima de GitHub admite 60 consultas/hora, no se puede ir más rápido).
  updatePollInterval = setInterval(() => {
    // Sin diálogo abierto y sin una actualización ya descargada esperando reinicio
    if (updateConfirmationWindow && !updateConfirmationWindow.isDestroyed()) return
    if (updateDownloadedReady) return
    checkSignedUpdate().catch(e => console.warn('[Kindyr] Polling update check failed:', e.message || e))
  }, UPDATE_POLL_MS)
  updatePollInterval.unref?.()
}

module.exports = {
  assertSafeReleaseDownloadUrl,
  checkForUpdatesOnStartup,
  loadPreviousVersion,
  startUpdatePolling
}

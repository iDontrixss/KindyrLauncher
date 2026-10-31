// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Lógica de la sección ajustes (cargada por navigation.js tras inyectar
// sections/ajustes.html; la CSP ya no admite scripts inline).
let settingsInitialized = false
let javaInstallsRequest = null
let javaInstallsLoadedAt = 0
let storageInfoRequest = null
let storageInfoLoadedAt = 0

function showSettingsTab(tabName, button) {
  document.querySelectorAll('.settings-nav-btn').forEach(btn => btn.classList.remove('active'))
  document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'))
  if (button) button.classList.add('active')
  document.getElementById('settings-' + tabName).classList.add('active')
  
  if (tabName === 'resources') {
    refreshStorageInfo()
  }
  if (tabName === 'general') {
    renderJavaInstalls()
  }
}

function selectLanguage(lang, button) {
  settings.language = lang
  document.querySelectorAll('.lang-chip').forEach(chip => chip.classList.remove('active'))
  if (button) button.classList.add('active')
  applyLanguage()
}

function selectTheme(theme, button) {
  settings.theme = theme
  document.querySelectorAll('.theme-chip').forEach(chip => chip.classList.remove('active'))
  if (button) button.classList.add('active')
  applyTheme()
}

function updateDownloadsLabel() {
  const slider = document.getElementById('setting-max-downloads')
  const value = document.getElementById('setting-max-downloads-value')
  if (!slider || !value) return
  value.value = slider.value
  settings.maxConcurrentDownloads = Number(slider.value)
}

function updateEagerToggleUI() {
  const on = document.getElementById('prepare-on')
  const off = document.getElementById('prepare-off')
  const status = document.getElementById('prepare-status')
  const enabled = Boolean(settings.eagerPrepareOnCreate)
  if (on) on.classList.toggle('active', enabled)
  if (off) off.classList.toggle('active', !enabled)
  if (status) {
    status.style.display = 'block'
    status.textContent = enabled ? '✓ ' + t('settings.prepare.on') + ' · ' + t('settings.prepare.desc') : '○ ' + t('settings.prepare.off')
    status.style.color = enabled ? '#1bd96a' : '#666'
  }
}

function setEagerPrepare(enabled) {
  settings.eagerPrepareOnCreate = Boolean(enabled)
  settings.settingsSavedAt = Date.now()
  try { localStorage.setItem('kindyr-settings', JSON.stringify(settings)) } catch {}
  updateEagerToggleUI()
  setStatus((enabled ? t('settings.prepare.on') : t('settings.prepare.off')) + ' · ' + t('settings.prepare.title'))
}

function updateDiscordToggleUI() {
  const switchEl = document.getElementById('discord-rpc-switch')
  const label = document.getElementById('discord-rpc-label')
  const status = document.getElementById('discord-rpc-status')
  const enabled = settings.discordRPC !== false
  if (switchEl) {
    switchEl.classList.toggle('is-on', enabled)
    switchEl.setAttribute('aria-checked', enabled ? 'true' : 'false')
  }
  if (label) {
    label.textContent = enabled ? t('settings.discord.enabled') : t('settings.discord.disabled')
  }
  if (status) {
    status.textContent = (enabled ? '● ' : '○ ') + (enabled ? t('settings.discord.on') : t('settings.discord.off'))
  }
  refreshDiscordConnectionStatus()
}

async function refreshDiscordConnectionStatus() {
  const status = document.getElementById('discord-rpc-status')
  if (!status || settings.discordRPC === false) return
  if (!window.kindyrAPI?.discord?.getState) return
  try {
    const state = await window.kindyrAPI.discord.getState()
    if (!document.getElementById('discord-rpc-status') || settings.discordRPC === false) return
    let detail = ''
    if (state && state.configured === false) detail = ' · ' + t('settings.discord.unconfigured')
    else if (state && state.connected) detail = ' · ' + t('settings.discord.connected')
    else detail = ' · ' + t('settings.discord.notConnected')
    status.textContent = '● ' + t('settings.discord.on') + detail
  } catch {
    // Sin diagnóstico disponible: se deja el texto base
  }
}

function toggleDiscordRPC() {
  return setDiscordRPC(!(settings.discordRPC !== false))
}

async function setDiscordRPC(enabled) {
  settings.discordRPC = Boolean(enabled)
  settings.settingsSavedAt = Date.now()
  try { localStorage.setItem('kindyr-settings', JSON.stringify(settings)) } catch {}
  updateDiscordToggleUI()
  try {
    if (window.kindyrAPI?.discord?.setEnabled) {
      const result = await window.kindyrAPI.discord.setEnabled(settings.discordRPC)
      if (result && result.ok === false) {
        setStatus(result.error || t('settings.saveError'))
        return
      }
    }
  } catch (error) {
    console.error('Error toggling Discord RPC:', error)
  }
  setStatus(t('settings.discord.title') + ' · ' + (enabled ? t('settings.discord.enabled') : t('settings.discord.disabled')))
}

async function renderJavaInstalls(force = false) {
  const list = document.getElementById('java-installs-list')
  if (!list || !window.kindyrAPI?.settings?.getJavaInstalls) return
  if (!force && list.childElementCount && Date.now() - javaInstallsLoadedAt < 30_000) return
  if (javaInstallsRequest) return javaInstallsRequest

  javaInstallsRequest = window.kindyrAPI.settings.getJavaInstalls()
  try {
    const result = await javaInstallsRequest
    if (!result.ok) {
      list.innerHTML = '<div class="install-note">Error al cargar instalaciones de Java: ' + escapeHtml(result.error || 'Desconocido') + '</div>'
      return
    }
    
    try {
      list.innerHTML = result.installs.map(item => (
        '<div class="java-block" data-java-major="' + item.major + '">' +
          '<div class="java-block-title">' + escapeHtml(t('java.location', { major: item.major })) + '</div>' +
          '<div class="java-path-row">' +
            '<input class="setting-input java-path-input" id="java-path-' + item.major + '" value="' + escapeHtml(item.path || '') + '" placeholder="Automático">' +
            '<span class="java-status ' + (item.valid ? 'ok' : 'bad') + '" title="' + (item.valid ? 'OK' : 'Sin Java') + '">' +
              (item.valid ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-minus"></i>') +
            '</span>' +
          '</div>' +
          '<div class="java-actions">' +
            '<button type="button" class="secondary-btn" data-click="installRecommendedJava" data-args="' + uiArgs(item.major) + '"><i class="fa-solid fa-download"></i> ' + escapeHtml(t('java.installRecommended')) + '</button>' +
            '<button type="button" class="secondary-btn" data-click="detectJavaPath" data-args="' + uiArgs(item.major) + '"><i class="fa-solid fa-magnifying-glass"></i> ' + escapeHtml(t('java.detect')) + '</button>' +
            '<button type="button" class="secondary-btn" data-click="browseJavaPath" data-args="' + uiArgs(item.major) + '"><i class="fa-regular fa-folder-open"></i> ' + escapeHtml(t('java.browse')) + '</button>' +
          '</div>' +
        '</div>'
      )).join('')
      
      // No sobrescribir maxConcurrentDownloads si el usuario está editando o si ya hay valor local más reciente
      // El valor se gestiona via slider y saveSettings -> saveResources
      javaInstallsLoadedAt = Date.now()
    } catch (error) {
      console.error('Error rendering Java installs:', error)
      list.innerHTML = '<div class="install-note">Error al renderizar instalaciones de Java</div>'
    }
  } catch (error) {
    console.error('Error getting Java installs:', error)
    list.innerHTML = '<div class="install-note">Error al cargar instalaciones de Java</div>'
  } finally {
    javaInstallsRequest = null
  }
}

async function saveJavaPath(major) {
  const input = document.getElementById('java-path-' + major)
  if (!input || !window.kindyrAPI?.settings?.setJavaPath) return
  try {
    const result = await window.kindyrAPI.settings.setJavaPath({ major, path: input.value.trim() })
    if (!result.ok) {
      setStatus(result.error)
      return
    }
    renderJavaInstalls(true)
  } catch (error) {
    console.error('Error saving Java path:', error)
    setStatus('Error al guardar ruta de Java')
  }
}

async function browseJavaPath(major) {
  try {
    const result = await window.kindyrAPI.settings.browseJava()
    if (result.cancelled) return
    if (!result.ok) {
      setStatus(result.error)
      return
    }
    document.getElementById('java-path-' + major).value = result.path
    await saveJavaPath(major)
  } catch (error) {
    console.error('Error browsing Java path:', error)
    setStatus('Error al buscar ruta de Java')
  }
}

async function detectJavaPath(major) {
  try {
    const result = await window.kindyrAPI.settings.detectJava(major)
    if (!result.ok) {
      setStatus(result.error)
      return
    }
    document.getElementById('java-path-' + major).value = result.path
    await saveJavaPath(major)
    setStatus('Java ' + major + ' detectado')
  } catch (error) {
    console.error('Error detecting Java path:', error)
    setStatus('Error al detectar Java')
  }
}

async function installRecommendedJava(major) {
  setStatus('Descargando Java ' + major + '...')
  try {
    const result = await window.kindyrAPI.settings.installJava(major)
    if (!result.ok) {
      setStatus(result.error)
      return
    }
    document.getElementById('java-path-' + major).value = result.path
    renderJavaInstalls(true)
    refreshStorageInfo(true)
    setStatus('Java ' + major + ' instalado')
  } catch (error) {
    console.error('Error installing Java:', error)
    setStatus('Error al instalar Java')
  }
}

async function refreshStorageInfo(force = false) {
  if (!window.kindyrAPI?.settings?.getStorage) return
  if (!force && storageInfoLoadedAt && Date.now() - storageInfoLoadedAt < 10_000) return
  if (storageInfoRequest) return storageInfoRequest

  storageInfoRequest = window.kindyrAPI.settings.getStorage()
  try {
    const result = await storageInfoRequest
    if (!result.ok) return
    document.getElementById('settings-data-root').value = result.dataRoot
    document.getElementById('storage-total').textContent = result.formatted.total
    document.getElementById('storage-instances').textContent = result.formatted.instances
    document.getElementById('storage-runtime').textContent = result.formatted.runtime
    document.getElementById('storage-cache').textContent = result.formatted.cache
    storageInfoLoadedAt = Date.now()
  } catch (error) {
    console.error('Error refreshing storage info:', error)
  } finally {
    storageInfoRequest = null
  }
}

async function openDataRoot() {
  try {
    await window.kindyrAPI.settings.openDataRoot()
  } catch (error) {
    console.error('Error opening data root:', error)
    setStatus('Error al abrir carpeta de datos')
  }
}

async function purgeLauncherCache() {
  try {
    const result = await window.kindyrAPI.settings.purgeCache()
    if (result && result.ok) {
      refreshStorageInfo(true)
      setStatus(t('settings.cache.purge') + ' ✓')
      return
    }

    setStatus(result?.error || 'No se pudo vaciar la caché')
  } catch (error) {
    console.error('Error purging cache:', error)
    setStatus('Error al vaciar caché')
  }
}

async function pickBackgroundImage() {
  try {
    setStatus(t('settings.background.processing'))
    const result = await window.kindyrAPI.settings.pickBackground()
    if (result.cancelled) {
      setStatus(t('app.ready'))
      return
    }
    if (!result.ok) {
      setStatus(result.error || t('settings.background.error'))
      return
    }
    settings.backgroundImage = result.path
    applyBackground()
    setStatus(t('settings.background.applied'))
  } catch (error) {
    console.error('Error picking background:', error)
    setStatus(error?.message || String(error) || t('settings.background.error'))
  }
}

async function clearBackgroundImage() {
  try {
    await window.kindyrAPI.settings.clearBackground()
    settings.backgroundImage = ''
    applyBackground()
  } catch (error) {
    console.error('Error clearing background:', error)
    setStatus('Error al quitar imagen de fondo')
  }
}

function applySettingsToForm() {
  try {
    document.getElementById('setting-min-ram-slider').value = String(settings.minRamMb || 2048)
    document.getElementById('setting-max-ram-slider').value = String(settings.maxRamMb || 4096)
    document.getElementById('setting-min-ram-mb').value = String(settings.minRamMb || 2048)
    document.getElementById('setting-max-ram-mb').value = String(settings.maxRamMb || 4096)
    syncRamFromSlider('min')
    syncRamFromSlider('max')
    const javaArgsEl = document.getElementById('setting-java-args')
    if (javaArgsEl) javaArgsEl.value = settings.javaArgs || ''
    const downloads = document.getElementById('setting-max-downloads')
    const downloadsValue = document.getElementById('setting-max-downloads-value')
    if (downloads) downloads.value = String(settings.maxConcurrentDownloads || 6)
    if (downloadsValue) downloadsValue.value = String(settings.maxConcurrentDownloads || 6)
    document.querySelectorAll('.lang-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.lang === settings.language)
    })
    applyTheme()
    try { updateEagerToggleUI() } catch {}
    try { updateDiscordToggleUI() } catch {}
  } catch (error) {
    console.error('Error applying settings to form:', error)
  }
}

function getValidatedSettings() {
  try {
    syncRamFromSlider('min')
    syncRamFromSlider('max')

    const minRam = parseRam(settings.minRam)
    const maxRam = parseRam(settings.maxRam)

    if (!isValidUsername(settings.username)) {
      return { ok: false, error: 'Nombre offline invalido: usa 3-16 letras, numeros o _' }
    }
    if (!minRam || !maxRam) {
      return { ok: false, error: 'RAM invalida: usa algo como 2048, 4096M o 4G' }
    }
    if (minRam.mb > maxRam.mb) {
      return { ok: false, error: 'La RAM minima no puede ser mayor que la maxima' }
    }

    settings.javaArgs = document.getElementById('setting-java-args')?.value.trim() || settings.javaArgs || ''

    return {
      ok: true,
      settings: {
        username: settings.username,
        minRam: minRam.value,
        maxRam: maxRam.value,
        minRamMb: minRam.mb,
        maxRamMb: maxRam.mb,
        language: settings.language,
        theme: settings.theme,
        backgroundImage: settings.backgroundImage,
        javaArgs: settings.javaArgs,
        maxConcurrentDownloads: Number(document.getElementById('setting-max-downloads')?.value || settings.maxConcurrentDownloads || 6),
        eagerPrepareOnCreate: Boolean(settings.eagerPrepareOnCreate),
        discordRPC: settings.discordRPC !== false
      }
    }
  } catch (error) {
    console.error('[VALIDACION AJUSTES] CATCH ERROR:', error)
    console.error('[VALIDACION AJUSTES] CATCH STACK:', error.stack)
    return { ok: false, error: 'Error al validar ajustes' }
  }
}

async function saveSettings() {
  try {
    const validated = getValidatedSettings()
    if (!validated.ok) {
      setStatus(validated.error)
      return
    }

    // F1: main es verdad. Solo se escribe localStorage si main confirma ok.
    // Si main falla, UI dice "no persistido" y no diverge.
    const pending = { ...settings, ...validated.settings, settingsSavedAt: Date.now() }
    if (window.kindyrAPI?.settings?.saveResources) {
      const res = await window.kindyrAPI.settings.saveResources({
        maxConcurrentDownloads: pending.maxConcurrentDownloads
      })
      if (res && res.ok === false) {
        if (res.readOnly) setStatus('Config de versión futura: solo lectura, no se guarda.')
        else if (res.corrupt) setStatus('Config corrupta preservada (' + (res.bak || '') + '). No se persistió.')
        else setStatus(res.error || 'No se persistieron los cambios en el proceso principal.')
        return
      }
    }
    try {
      if (window.kindyrAPI?.discord?.setEnabled) {
        await window.kindyrAPI.discord.setEnabled(pending.discordRPC !== false)
      }
    } catch {}
    updateDiscordToggleUI()
    const javaResults = await Promise.allSettled(JAVA_MAJORS_UI.map(major => {
      const input = document.getElementById('java-path-' + major)
      if (!input) return Promise.resolve({ ok: true })
      return window.kindyrAPI.settings.setJavaPath({ major, path: input.value.trim() })
    }))
    const failedJava = javaResults.find(r => r.status === 'fulfilled' && r.value && r.value.ok === false)
    if (failedJava) {
      setStatus(failedJava.value.error || 'Error al guardar ruta de Java (no persistido)')
      return
    }
    const rejectedJava = javaResults.find(r => r.status === 'rejected')
    if (rejectedJava) {
      setStatus('Error al guardar ruta de Java (no persistido)')
      return
    }
    settings = pending
    try { localStorage.setItem('kindyr-settings', JSON.stringify(settings)) } catch {}
    // Nota: guardar ajustes no debe tocar la cuenta activa. Antes estas dos
    // líneas creaban una cuenta offline con el nombre actual y la activaban,
    // sacando al usuario de su sesión de Microsoft al guardar.
    setStatus(t('settings.save') + ' ✓')
  } catch (error) {
    console.error('Error saving settings:', error)
    setStatus('Error al guardar ajustes (no persistido)')
  }
}

async function resetSettings() {
  try {
    localStorage.removeItem('kindyr-settings')
    settings = {
      username: settings.username,
      accountType: settings.accountType,
      activeUuid: settings.activeUuid,
      minRam: '2G',
      maxRam: '4G',
      minRamMb: 2048,
      maxRamMb: 4096,
      language: 'es',
      theme: 'midnight',
      backgroundImage: '',
      javaArgs: '',
      maxConcurrentDownloads: 6,
      eagerPrepareOnCreate: settings.eagerPrepareOnCreate,
      discordRPC: true,
      settingsSavedAt: Date.now()
    }
    // Limpiar activeUuid si no corresponde
    if (settings.accountType !== 'microsoft') delete settings.activeUuid
    await window.kindyrAPI.settings.clearBackground()
    try {
      if (window.kindyrAPI?.discord?.setEnabled) {
        await window.kindyrAPI.discord.setEnabled(true)
      }
    } catch {}
    applySettingsToForm()
    applyBackground()
    setStatus(t('settings.reset') + ' ✓')
  } catch (error) {
    console.error('Error resetting settings:', error)
    setStatus('Error al restaurar ajustes')
  }
}


// TEMPORAL PARA BORRAR: simulacro crash solo-dev
async function simulateCrashDev() {
  const el = document.getElementById('crash-dev-status')
  try {
    if (!window.kindyrAPI?.updater?.simulateCrash) throw new Error('Preload sin simulateCrash (¿build viejo?)')
    const res = await window.kindyrAPI.updater.simulateCrash()
    if (!res.ok) throw new Error(res.error || 'Rechazado')
    if (el) el.textContent = 'Crash provocado: el launcher se cierra solo, el juego debe seguir vivo.'
  } catch (e) {
    if (el) el.textContent = 'No se pudo: ' + (e.message || String(e))
  }
}

async function checkForUpdatesManual() {
  const status = document.getElementById('update-status')
  if (status) { status.style.display = 'block'; status.textContent = 'Buscando actualizaciones...'; status.style.color = '#aacdff' }
  try {
    if (!window.kindyrAPI?.updater?.getVersion) throw new Error('Updater no disponible en dev')
    const current = await window.kindyrAPI.updater.getVersion()
    const res = await window.kindyrAPI.updater.getPreviousVersions()
    if (!res.ok) throw new Error(res.error || 'No se pudo consultar GitHub')
    const newer = res.versions.find(v => {
      try { const semver = window.require ? require('semver') : null; return false } catch { return false }
    })
    // Fallback simple: si hay versiones, mostrar la más reciente distinta a current
    const latest = res.versions[0]
    if (latest && latest.version !== current) {
      if (status) { status.textContent = `Nueva versión disponible: ${latest.tag} — revisá el aviso Kindyr`; status.style.color = '#1bd96a' }
      setStatus(`Actualización disponible: ${latest.tag}`)
    } else {
      if (status) { status.textContent = `Estás en la última versión (v${current}) ✓`; status.style.color = '#1bd96a' }
      setStatus('Sin actualizaciones')
    }
  } catch (e) {
    if (status) { status.textContent = 'Error: ' + (e.message || String(e)); status.style.color = '#ff5a3c' }
  }
}

async function loadPreviousVersions() {
  const listEl = document.getElementById('previous-versions-list')
  const status = document.getElementById('update-status')
  if (!listEl) return
  listEl.style.display = 'flex'
  listEl.innerHTML = '<div class="ram-hint">Cargando versiones...</div>'
  try {
    const verRes = await window.kindyrAPI.updater.getVersion()
    const current = typeof verRes === 'string' ? verRes : (verRes || '0.2.0')
    // Actualizar badge
    const badge = document.getElementById('settings-version-badge')
    if (badge) badge.textContent = 'v' + current
    const res = await window.kindyrAPI.updater.getPreviousVersions()
    if (!res.ok) throw new Error(res.error || 'No se pudo cargar versiones')
    const versions = res.versions || []
    if (!versions.length) {
      listEl.innerHTML = '<div class="ram-hint">No hay versiones anteriores publicadas.</div>'
      return
    }
    listEl.innerHTML = versions.map(v => `
      <div style="display:flex; align-items:center; gap:10px; background:var(--kindyr-bg); border:2px solid var(--kindyr-ink); padding:10px 12px; box-shadow:2px 2px 0 var(--kindyr-ink);">
        <div style="min-width:0; flex:1">
          <div style="font-family:'JetBrains Mono',monospace; font-size:12px; font-weight:800; color:var(--kindyr-text)">${escapeHtml(v.tag)} ${v.prerelease ? '<span style=\"background:#facc15;color:#010712;padding:1px 5px;font-size:9px;margin-left:6px; border:1px solid #010712\">BETA</span>' : ''}</div>
          <div style="font-size:11px; color:var(--kindyr-blue-soft)">${escapeHtml(new Date(v.published_at).toLocaleDateString())} • <a href="${escapeHtml(v.url)}" target="_blank" style="color:var(--kindyr-blue)">GitHub</a></div>
        </div>
        <button type="button" class="secondary-btn" style="flex-shrink:0; padding:8px 10px; font-size:11px" data-click="rollbackToVersion" data-args="${uiArgs(v.tag)}"><i class="fa-solid fa-download"></i> Rollback</button>
      </div>
    `).join('')
    if (status) { status.style.display = 'block'; status.textContent = `Encontradas ${versions.length} versiones • Actual: v${current}`; status.style.color = '#aacdff' }
  } catch (e) {
    listEl.innerHTML = `<div class="ram-hint" style="color:#ff5a3c">Error: ${escapeHtml(e.message || String(e))}</div>`
  }
}

async function rollbackToVersion(tag) {
  if (!confirm(`¿Volver a ${tag}? Se descargará el instalador de GitHub. Tus instancias y Java se conservan.`)) return
  const status = document.getElementById('update-status')
  if (status) { status.style.display = 'block'; status.textContent = `Iniciando rollback a ${tag}...`; status.style.color = '#ff5a3c' }
  try {
    const res = await window.kindyrAPI.updater.rollback(tag)
    if (!res.ok) throw new Error(res.error || 'Fallo rollback')
    if (status) { status.textContent = `Descarga iniciada: ${tag} — revisá tu carpeta Descargas`; status.style.color = '#1bd96a' }
    setStatus(`Rollback ${tag} iniciado`)
  } catch (e) {
    if (status) { status.textContent = 'Error rollback: ' + (e.message || String(e)); status.style.color = '#ff5a3c' }
  }
}

async function downgradeToPreviousVersion() {
  const btn = document.getElementById('downgrade-btn')
  const status = document.getElementById('update-status')
  if (btn) btn.disabled = true
  if (status) { status.style.display = 'block'; status.textContent = 'Buscando versión anterior...'; status.style.color = '#aacdff' }
  try {
    const targetRes = await window.kindyrAPI.updater.getDowngradeTarget()
    if (!targetRes.ok) throw new Error(targetRes.error || 'No hay versión anterior')
    const tag = targetRes.tag
    if (!confirm(`¿Desactualizar a ${tag}? Volverás a la versión que tenías antes de la última actualización. Tus instancias/Java se conservan.`)) {
      if (btn) btn.disabled = false
      if (status) status.style.display = 'none'
      return
    }
    if (status) { status.textContent = `Desactualizando a ${tag}...`; status.style.color = '#ff5a3c' }
    const res = await window.kindyrAPI.updater.downgradeToPrevious()
    if (!res.ok) throw new Error(res.error || 'Fallo desactualización')
    if (status) { status.textContent = `Desactualización iniciada: ${tag} — se descargará el instalador`; status.style.color = '#1bd96a' }
    setStatus(`Desactualizado a ${tag}`)
  } catch (e) {
    if (status) { status.textContent = 'Error desactualizar: ' + (e.message || String(e)); status.style.color = '#ff5a3c' }
  } finally {
    if (btn) btn.disabled = false
  }
}

function initializeSettings() {
  if (settingsInitialized) return
  settingsInitialized = true
  
  try {
    applySettingsToForm()
    applyBackground()
    // Mostrar versión actual en badge y preparar downgrade
    if (window.kindyrAPI?.updater?.getVersion) {
      window.kindyrAPI.updater.getVersion().then(v => {
        const badge = document.getElementById('settings-version-badge')
        if (badge && v) badge.textContent = 'v' + String(v).replace(/^[vV]/,'')
      }).catch(()=>{})
    }
    if (window.kindyrAPI?.updater?.getDowngradeTarget) {
      window.kindyrAPI.updater.getDowngradeTarget().then(r => {
        const btn = document.getElementById('downgrade-btn')
        if (!btn) return
        if (r.ok && r.tag) {
          btn.title = `Volver a ${r.tag} (${r.source === 'stored' ? 'versión previa instalada' : 'anterior en GitHub'})`
          btn.disabled = false
        } else {
          btn.title = 'No hay versión anterior disponible'
          // Mantener habilitado para que el click muestre el error, o deshabilitar:
          // btn.disabled = true
        }
      }).catch(()=>{})
    }
  } catch (error) {
    console.error('Error initializing settings:', error)
  }
}


initializeSettings()

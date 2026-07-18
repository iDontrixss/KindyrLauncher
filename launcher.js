// Game launch and event handling

let launchInProgress = false

// Validate settings for launch
function getValidatedSettings() {
  try {
    let minRam, maxRam
    try {
      minRam = parseRam(settings.minRam)
    } catch (e) {
      throw e
    }

    try {
      maxRam = parseRam(settings.maxRam)
    } catch (e) {
      throw e
    }

    try {
      const usernameValid = isValidUsername(settings.username)
    } catch (e) {
      throw e
    }

    if (!isValidUsername(settings.username)) {
      return { ok: false, error: 'Nombre offline invalido: usa 3-16 letras, numeros o _' }
    }
    if (!minRam || !maxRam) {
      return { ok: false, error: 'RAM invalida: usa algo como 2048, 4096M o 4G' }
    }
    if (minRam.mb > maxRam.mb) {
      return { ok: false, error: 'La RAM minima no puede ser mayor que la maxima' }
    }

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
        javaArgs: settings.javaArgs || '',
        maxConcurrentDownloads: settings.maxConcurrentDownloads || 6
      }
    }
  } catch (error) {
    return { ok: false, error: 'Error al validar ajustes' }
  }
}

// Game launch
async function launchGame() {
  if (launchInProgress) {
    return
  }

  launchInProgress = true

  try {
    const btn = document.getElementById('play-btn')
    const status = document.getElementById('status')
    const log = document.getElementById('log')
    const validated = getValidatedSettings()
    if (!validated.ok) {
      setStatus(validated.error)
      log.textContent = validated.error
      return
    }
    settings = validated.settings
    localStorage.setItem('zotlin-settings', JSON.stringify(settings))
    recordRecentInstance(selectedInstance)
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-stop"></i> Cancelar'
    btn.classList.add('danger')
    btn.onclick = function(e) {
      cancelGame(e)
    }
    status.textContent = 'Descargando archivos...'
    log.textContent = ''
    clearConsole()
    appendConsole('info', 'Iniciando ' + selectedInstance)
    const result = await window.zotlinAPI.launcher.launch({
      instanceId: selectedInstance,
      username: settings.username,
      minRam: settings.minRam,
      maxRam: settings.maxRam,
      customArgs: settings.javaArgs
    })
    if (!result.ok) {
      status.textContent = t('app.launchError')
      log.textContent = result.error.slice(0, 90)
      appendConsole('error', result.error)
      resetPlayBtn()
    }
  } finally {
    launchInProgress = false
  }
}

async function cancelGame() {
  await window.zotlinAPI.launcher.kill()
  resetPlayBtn()
  setStatus(t('app.ready'))
}

function resetPlayBtn() {
  const btn = document.getElementById('play-btn')
  if (!btn) return
  btn.disabled = false
  btn.innerHTML = '<i class="fa-solid fa-play"></i> ' + escapeHtml(t('instance.play'))
  btn.classList.remove('danger')
  btn.onclick = function(e) {
    launchGame(e)
  }
}

// Launcher event handlers
window.zotlinAPI.launcher.onStatus((event) => {
  const btn = document.getElementById('play-btn')
  const status = document.getElementById('status')
  const log = document.getElementById('log')

  if (event.type === 'starting') {
    status.textContent = event.message
    log.textContent = ''
  }

  appendConsole(event.type, event.message)

  if (event.type === 'debug' || event.type === 'download' || event.type === 'progress') {
    log.textContent = event.message.slice(0, 90)
  }

  if (event.type === 'data') {
    status.textContent = t('app.minecraftStarting')
  }

  if (event.type === 'running') {
    status.textContent = t('app.playing')
    btn.disabled = false
    btn.innerHTML = '<i class="fa-solid fa-stop"></i> Cerrar Minecraft'
    btn.classList.add('danger')
    btn.onclick = function(e) {
      cancelGame(e)
    }
  }

  if (event.type === 'close') {
    status.textContent = t('app.ready')
    log.textContent = event.message.slice(0, 90)
    resetPlayBtn()
  }

  if (event.type === 'error') {
    status.textContent = t('app.launchError')
    log.textContent = event.message.slice(0, 90)
    resetPlayBtn()
  }
})

if (window.zotlinAPI?.settings?.onStatus) {
  window.zotlinAPI.settings.onStatus((event) => {
    if (event.message) setStatus(event.message)
  })
}

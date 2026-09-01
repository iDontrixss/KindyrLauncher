

let launchInProgress = false

function getValidatedLaunchSettings() {
  try {
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
        maxConcurrentDownloads: Math.max(1, Math.min(Number(settings.maxConcurrentDownloads) || 6, 20))
      }
    }
  } catch (error) {
    return { ok: false, error: 'Error al validar ajustes' }
  }
}

async function launchGame() {
  if (launchInProgress) {
    return
  }

  launchInProgress = true

  try {
    const btn = document.getElementById('play-btn')
    const status = document.getElementById('status')
    const log = document.getElementById('log')
    if (!btn || !status || !log) throw new Error('La vista de lanzamiento no esta disponible.')

    const validated = getValidatedLaunchSettings()
    if (!validated.ok) {
      setStatus(validated.error)
      log.textContent = validated.error
      return
    }
    settings = validated.settings
    localStorage.setItem('kindyr-settings', JSON.stringify(settings))
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
    const result = await window.kindyrAPI.launcher.launch({
      instanceId: selectedInstance,
      username: settings.username,
      minRam: settings.minRam,
      maxRam: settings.maxRam,
      customArgs: settings.javaArgs
    })
    if (!result.ok) {
      if (result.cancelled) {
        status.textContent = t('app.ready')
        log.textContent = result.error
        appendConsole('info', result.error)
        resetPlayBtn()
        return
      }
      status.textContent = t('app.launchError')
      log.textContent = result.error.slice(0, 90)
      appendConsole('error', result.error)
      resetPlayBtn()
    }
  } catch (error) {
    const message = error?.message || 'No se pudo iniciar Minecraft.'
    const log = document.getElementById('log')
    if (log) log.textContent = message.slice(0, 90)
    setStatus(t('app.launchError'))
    appendConsole('error', message)
    resetPlayBtn()
  } finally {
    launchInProgress = false
  }
}

async function cancelGame() {
  try {
    await window.kindyrAPI.launcher.kill()
    setStatus(t('app.ready'))
  } catch (error) {
    setStatus(error?.message || t('app.launchError'))
  } finally {
    resetPlayBtn()
  }
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

window.kindyrAPI.launcher.onStatus((event) => {
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

if (window.kindyrAPI?.settings?.onStatus) {
  window.kindyrAPI.settings.onStatus((event) => {
    if (event.message) setStatus(event.message)
  })
}

// CurseForge frontend — separado de modrinth.js (STYLE_GUIDE.md: provider switch)
// Maneja búsqueda, versiones e instalación CurseForge; nunca toca Modrinth

async function loadCurseForgeInstallVersions() {
  if (!installProject || !installProject._curseForge) return
  const gameVersion = document.getElementById('install-game-version').value.trim()
  const loader = document.getElementById('install-loader').value
  setInstallNote(t('install.checkingCompatibility'))
  const list = document.getElementById('install-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.searchingCompatible')) + '</div>'
  const result = await window.kindyrAPI.curseforge.versions({
    projectId: installProject.project_id || installProject.id,
    modId: installProject.project_id || installProject.id,
    gameVersion,
    loader
  })
  if (!result.ok) {
    installVersions = []
    installVersionId = ''
    setInstallNote(result.error)
    if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(result.error) + '</div>'
    return
  }
  installVersions = result.versions || []
  installVersionId = installVersions[0]?.id || ''
  renderInstallVersions()
}

async function loadCurseForgeModpackVersions() {
  if (!installProject || !installProject._curseForge) return
  setInstallNote(t('install.loadingModpackVersions'))
  const list = document.getElementById('install-modpack-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.loadingVersions')) + '</div>'
  const result = await window.kindyrAPI.curseforge.versions({
    projectId: installProject.project_id || installProject.id,
    modId: installProject.project_id || installProject.id,
    loader: 'any'
  })
  if (!result.ok) {
    installVersions = []
    installVersionId = ''
    setInstallNote(result.error)
    if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(result.error) + '</div>'
    return
  }
  installVersions = (result.versions || []).filter(v => (v.version_type || 'release') === 'release')
  installVersionId = installVersions[0]?.id || ''
  const compatible = getCompatibleLoadersForVersion(installVersions[0])
  installModpackLoader = compatible[0] || 'minecraft'
  renderModpackVersions()
  renderModpackLoaders()
}

// Wrapper para openInstallModal: si es CF delega a CF loaders, si no a Modrinth original
(function(){
  const origOpen = window.openInstallModal
  const origLoadInstall = window.loadInstallVersions
  const origLoadModpack = window.loadModpackInstallVersions
  const origInstallSelected = window.installSelectedProject
  const origInstallCompat = window.installToCompatInstance

  // Patch loadInstallVersions para delegar
  window.loadInstallVersions = async function() {
    if (installProject && installProject._curseForge) return loadCurseForgeInstallVersions()
    if (typeof origLoadInstall === 'function') return origLoadInstall()
    // fallback original modrinth
    const gameVersion = document.getElementById('install-game-version').value.trim()
    const loader = document.getElementById('install-loader').value
    setInstallNote(t('install.checkingCompatibility'))
    const list = document.getElementById('install-version-list')
    if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.searchingCompatible')) + '</div>'
    const result = await window.kindyrAPI.modrinth.versions({ projectId: installProject.project_id || installProject.slug, gameVersion, loader })
    if (!result.ok) { installVersions=[]; installVersionId=''; setInstallNote(result.error); if(list) list.innerHTML='<div class="discover-message">'+escapeHtml(result.error)+'</div>'; return }
    installVersions = result.versions || []
    installVersionId = installVersions[0]?.id || ''
    renderInstallVersions()
  }

  window.loadModpackInstallVersions = async function() {
    if (installProject && installProject._curseForge) return loadCurseForgeModpackVersions()
    if (typeof origLoadModpack === 'function') return origLoadModpack()
    const result = await window.kindyrAPI.modrinth.versions({ projectId: installProject.project_id || installProject.slug, loader:'any' })
    if (!result.ok) { installVersions=[]; installVersionId=''; setInstallNote(result.error); return }
    installVersions = (result.versions || []).filter(v=>v.version_type==='release')
    installVersionId = installVersions[0]?.id || ''
    renderModpackVersions(); renderModpackLoaders()
  }

  window.installToCompatInstance = async function(instanceId, button) {
    if (installProject && installProject._curseForge) {
      if (!installProject || !instanceId) return
      const orig = button ? button.innerHTML : ''
      if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Instalando...' }
      const instance = (typeof launcherInstances !== 'undefined' ? launcherInstances.find(i => i.id === instanceId) : null)
      const gameVersion = instance ? instance.version : document.getElementById('install-game-version').value.trim()
      const loader = instance ? (instance.loader || 'vanilla') : document.getElementById('install-loader').value
      try {
        const result = await window.kindyrAPI.curseforge.install({
          project: installProject,
          installKind: getInstallKind(installProject),
          gameVersion,
          loader,
          destination: 'instance',
          instanceId
        })
        if (button) { button.disabled = false; button.innerHTML = orig }
        if (!result.ok) { setInstallNote(result.error); setStatus(result.error); return }
        await refreshLauncherInstances()
        setInstallNote('Instalado en ' + instance.name)
        setStatus('Instalado en ' + instance.name)
        closeInstallModal()
        if (result.instance && result.instance.id && typeof openInstanceView === 'function') setTimeout(()=>openInstanceView(result.instance.id),400)
      } catch (e) {
        if (button) { button.disabled = false; button.innerHTML = orig }
        setInstallNote(e.message || String(e)); setStatus(e.message || String(e))
      }
      return
    }
    if (typeof origInstallCompat === 'function') return origInstallCompat(instanceId, button)
    // fallback modrinth
    const orig = button ? button.innerHTML : ''
    if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Instalando...' }
    const instance = (typeof launcherInstances !== 'undefined' ? launcherInstances.find(i => i.id === instanceId) : null)
    const gameVersion = instance ? instance.version : document.getElementById('install-game-version').value.trim()
    const loader = instance ? (instance.loader || 'vanilla') : document.getElementById('install-loader').value
    try {
      const result = await window.kindyrAPI.modrinth.install({
        project: installProject,
        installKind: getInstallKind(installProject),
        gameVersion,
        loader,
        destination: 'instance',
        instanceId
      })
      if (button) { button.disabled = false; button.innerHTML = orig }
      if (!result.ok) { setInstallNote(result.error); setStatus(result.error); return }
      await refreshLauncherInstances()
      setInstallNote('Instalado en ' + instance.name)
      setStatus('Instalado en ' + instance.name)
      closeInstallModal()
      if (result.instance && result.instance.id && typeof openInstanceView === 'function') setTimeout(()=>openInstanceView(result.instance.id),400)
    } catch (e) {
      if (button) { button.disabled = false; button.innerHTML = orig }
      setInstallNote(e.message || String(e)); setStatus(e.message || String(e))
    }
  }

  window.installSelectedProject = async function() {
    if (!installProject || !installVersionId) { setStatus(t('install.pickVersion')); return }
    const isCF = Boolean(installProject._curseForge)
    const isModpack = installProject.project_type === 'modpack'
    const selectedVersionData = getSelectedInstallVersion()
    const destination = isModpack ? installModpackDestination : document.getElementById('install-destination').value
    const isModpackNewInstance = isModpack && destination === 'instance'
    const shouldShowToast = isModpackNewInstance && settings.eagerPrepareOnCreate
    const btn = document.getElementById('install-confirm')
    btn.disabled = true
    btn.textContent = destination === 'downloads' ? t('install.downloading') : t('install.installing')
    setInstallNote(t('install.working'))
    if (shouldShowToast) { showPrepareToast(installProject.title || 'Modpack', t('install.working')); updatePrepareToast(10, t('install.working'), 'Iniciando') }
    const api = isCF ? window.kindyrAPI.curseforge : window.kindyrAPI.modrinth
    const result = await api.install({
      project: installProject,
      installKind: getInstallKind(installProject),
      versionId: installVersionId,
      gameVersion: isModpack ? (selectedVersionData?.game_versions?.[0] || selectedVersionData?.version_number || selectedVersion) : document.getElementById('install-game-version').value.trim(),
      loader: isModpack ? installModpackLoader : document.getElementById('install-loader').value,
      destination,
      instanceId: document.getElementById('install-instance').value
    })
    btn.disabled = false
    if (isModpack) btn.textContent = installModpackDestination === 'downloads' ? t('install.download') : t('install.install')
    else updateInstallDestination()
    if (!result.ok) {
      if (shouldShowToast) { updatePrepareToast(0, result.error, 'Error'); setTimeout(()=>hidePrepareToast(true),3000) }
      setInstallNote(result.error); setStatus(result.error); return
    }
    await refreshLauncherInstances()
    if (shouldShowToast) {
      updatePrepareToast(100, t('install.done', { path: result.path }), 'Listo')
      setStatus(t('settings.beta.prepared', { name: installProject.title || result.instance?.name || 'Modpack' }))
      setTimeout(()=>hidePrepareToast(true),900)
      closeInstallModal()
      if (result.instance && result.instance.id) { await new Promise(r=>setTimeout(r,200)); openInstanceView(result.instance.id) }
      return
    }
    setInstallNote(t('install.done', { path: result.path }))
    setStatus(destination === 'downloads' ? t('install.downloaded') : t('install.installedLauncher'))
  }
})()

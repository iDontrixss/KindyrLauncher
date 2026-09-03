// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

function loadHomeDiscoverScripts() {
  const script = document.createElement('script')
  script.textContent = `
    let homeDiscoverOffset = 0
    let homeDiscoverTotal = 0
    let homeDiscoverTimer = null
    let homeDiscoverLoading = false
    let homeDiscoverType = 'mod'
    let homeDiscoverOpen = false
    function getHomeDiscoverTypes() {
      return [
        { id: 'mod', label: t('discover.type.mod'), placeholder: t('home.search.mods') },
        { id: 'resourcepack', label: t('discover.type.resourcepack'), placeholder: t('home.search.resourcepacks') },
        { id: 'datapack', label: t('discover.type.datapack'), placeholder: t('home.search.datapacks') },
        { id: 'shader', label: t('discover.type.shader'), placeholder: t('home.search.shaders') }
      ]
    }
    
    function getHomeDiscoverLimit() {
      return Math.max(12, Math.min(Number(document.getElementById('home-discover-limit')?.value) || 18, 24))
    }
    
    function getHomeDiscoverPlaceholder() {
      const type = getHomeDiscoverTypes().find(item => item.id === homeDiscoverType)
      return type ? type.placeholder : t('home.search.content')
    }
    
    function isHomeDiscoverOpen() {
      return document.getElementById('home-discover-wrap')?.classList.contains('open')
    }
    
    function matchesHomeDiscoverProject(project) {
      if (homeDiscoverType === 'datapack') {
        const categories = project.display_categories || project.categories || []
        return categories.includes('datapack')
      }
      return project.project_type === homeDiscoverType
    }
    
    function getProjectInstallKind(project) {
      const categories = project.display_categories || project.categories || []
      if (categories.includes('datapack')) return 'datapack'
      return project.project_type || 'mod'
    }

    function getHomeProjectTypeLabel(type) {
      const labels = {
        mod: t('discover.type.modSingle'),
        modpack: t('discover.type.modpackSingle'),
        resourcepack: t('discover.type.resourcepackSingle'),
        shader: t('discover.type.shaderSingle')
      }
      return labels[type] || type || t('discover.project')
    }

    function getHomeProjectUrl(project) {
      return 'https://modrinth.com/' + encodeURIComponent(project.project_type || 'mod') + '/' + encodeURIComponent(project.slug)
    }
    
    function renderHomeDiscoverTabs() {
      document.getElementById('home-discover-tabs').innerHTML = getHomeDiscoverTypes().map(type => (
        '<button type="button" class="home-discover-tab ' + (type.id === homeDiscoverType ? 'active' : '') + '" onclick="selectHomeDiscoverType(&quot;' + type.id + '&quot;)">' + type.label + '</button>'
      )).join('')
      const query = document.getElementById('home-discover-query')
      if (query) query.placeholder = getHomeDiscoverPlaceholder()
    }
    
    function selectHomeDiscoverType(type) {
      homeDiscoverType = type
      homeDiscoverOffset = 0
      renderHomeDiscoverTabs()
      if (isHomeDiscoverOpen()) searchHomeDiscover(true)
    }
    
    function updateHomeDiscoverContext() {
      const meta = getSelectedInstanceMeta()
      document.getElementById('home-discover-version').textContent = meta.version || selectedVersion
      document.getElementById('home-discover-loader').textContent = getInstanceLoaderLabel(meta.loader)
    }
    
    function syncDiscoverButtonState(isOpen) {
      const btn = document.getElementById('instance-discover-btn')
      if (!btn) return
      btn.classList.toggle('active', isOpen)
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    }
    
    function toggleHomeDiscoverPanel(forceOpen) {
      const wrap = document.getElementById('home-discover-wrap')
      const shouldOpen = forceOpen === true ? true : forceOpen === false ? false : !homeDiscoverOpen

      if (!shouldOpen) {
        homeDiscoverOpen = false
        wrap.classList.remove('open')
        syncDiscoverButtonState(false)
        return
      }

      homeDiscoverOpen = true
      wrap.classList.add('open')
      syncDiscoverButtonState(true)
      renderHomeDiscoverTabs()
      updateHomeDiscoverContext()
      document.getElementById('home-discover-sort').value = 'relevance'
      homeDiscoverOffset = 0
      searchHomeDiscover(true)
    }
    
    function scheduleHomeDiscoverSearch() {
      clearTimeout(homeDiscoverTimer)
      homeDiscoverTimer = setTimeout(() => searchHomeDiscover(true), 450)
    }
    
    function renderHomeDiscoverPagination() {
      const limit = getHomeDiscoverLimit()
      const totalPages = Math.max(1, Math.ceil(homeDiscoverTotal / limit))
      const currentPage = Math.floor(homeDiscoverOffset / limit) + 1
      const container = document.getElementById('home-discover-pagination')
      if (!container) return

      const pages = []
      if (totalPages <= 5) {
        for (let page = 1; page <= totalPages; page += 1) pages.push(page)
      } else {
        pages.push(1, 2, '…', totalPages)
      }

      container.innerHTML =
        '<button type="button" class="home-discover-page-btn" onclick="changeHomeDiscoverPage(-1)" ' + (currentPage <= 1 || homeDiscoverLoading ? 'disabled' : '') + ' aria-label="' + escapeHtml(t('home.prevPage')) + '"><i class="fa-solid fa-chevron-left"></i></button>' +
        pages.map(page => {
          if (page === '…') return '<span style="color:#666;font-size:12px;">…</span>'
          return '<button type="button" class="home-discover-page-btn ' + (page === currentPage ? 'active' : '') + '" onclick="goHomeDiscoverPage(' + page + ')">' + page + '</button>'
        }).join('') +
        '<button type="button" class="home-discover-page-btn" onclick="changeHomeDiscoverPage(1)" ' + (currentPage >= totalPages || homeDiscoverLoading ? 'disabled' : '') + ' aria-label="' + escapeHtml(t('home.nextPage')) + '"><i class="fa-solid fa-chevron-right"></i></button>'
    }
    
    function renderHomeDiscoverMessage(message) {
      document.getElementById('home-discover-results').innerHTML = '<div class="home-discover-message">' + escapeHtml(message) + '</div>'
      renderHomeDiscoverPagination()
    }
    
    function renderHomeDiscoverResults(projects) {
      const results = document.getElementById('home-discover-results')
      if (!results) return
      results.innerHTML = ''
      if (!projects.length) {
        renderHomeDiscoverMessage(t('home.noCompatible'))
        return
      }

      const chunkSize = 12
      let idx = 0

      function renderChunk() {
        const frag = document.createDocumentFragment()
        for (let i = 0; i < chunkSize && idx < projects.length; i++, idx++) {
          const project = projects[idx]
          const wrapper = document.createElement('div')
          wrapper.className = 'project-card'
          const iconWrap = document.createElement('div')
          iconWrap.className = 'project-icon'
          if (project.icon_url) {
            const img = document.createElement('img')
            img.src = project.icon_url
            img.alt = ''
            img.loading = 'lazy'
            iconWrap.appendChild(img)
          } else {
            const cube = document.createElement('i')
            cube.className = 'fa-solid fa-cube'
            cube.setAttribute('aria-hidden', 'true')
            iconWrap.appendChild(cube)
          }
          const body = document.createElement('div')
          body.className = 'project-body'
          const titleEl = document.createElement('div')
          titleEl.className = 'project-title'
          titleEl.title = project.title || ''
          titleEl.textContent = project.title || ''
          const descEl = document.createElement('div')
          descEl.className = 'project-desc'
          descEl.textContent = project.description || t('discover.noDescription')
          const stats = document.createElement('div')
          stats.className = 'project-stats'
          const dlTag = document.createElement('span')
          dlTag.className = 'project-tag'
          const dlIcon = document.createElement('i')
          dlIcon.className = 'fa-solid fa-download'
          dlIcon.setAttribute('aria-hidden', 'true')
          dlTag.append(dlIcon, document.createTextNode(' ' + formatCompactNumber(project.downloads)))
          const followTag = document.createElement('span')
          followTag.className = 'project-tag'
          const starIcon = document.createElement('i')
          starIcon.className = 'fa-solid fa-star'
          starIcon.setAttribute('aria-hidden', 'true')
          followTag.append(starIcon, document.createTextNode(' ' + formatCompactNumber(project.follows)))
          stats.append(dlTag, followTag)
          const categories = (project.display_categories || project.categories || []).slice(0, 3)
          const tags = [getHomeProjectTypeLabel(project.project_type), ...categories].filter(Boolean).slice(0, 5)
          tags.forEach(tag => {
            const tagEl = document.createElement('span')
            tagEl.className = 'project-tag'
            tagEl.textContent = tag
            stats.appendChild(tagEl)
          })
          body.append(titleEl, descEl, stats)
          const actions = document.createElement('div')
          actions.className = 'project-actions'
          const viewBtn = document.createElement('button')
          viewBtn.type = 'button'
          viewBtn.className = 'secondary-btn'
          viewBtn.textContent = t('discover.view')
          viewBtn.addEventListener('click', () => openModrinthProject(getHomeProjectUrl(project)))
          const installBtn = document.createElement('button')
          installBtn.type = 'button'
          installBtn.className = 'primary-btn'
          installBtn.textContent = t('discover.install')
          installBtn.addEventListener('click', () => quickInstallLatestRelease(project, installBtn))
          actions.append(viewBtn, installBtn)
          wrapper.append(iconWrap, body, actions)
          frag.appendChild(wrapper)
        }
        results.appendChild(frag)
        if (idx < projects.length) {

          setTimeout(renderChunk, 0)
        } else {
          renderHomeDiscoverPagination()
        }
      }

      renderChunk()
    }
    
    async function searchHomeDiscover(resetPage = false) {
      if (homeDiscoverLoading) return
      if (resetPage) homeDiscoverOffset = 0
      homeDiscoverLoading = true

      const meta = getSelectedInstanceMeta()
      const query = document.getElementById('home-discover-query').value
      const sort = document.getElementById('home-discover-sort').value
      const limit = getHomeDiscoverLimit()
      updateHomeDiscoverContext()
      renderHomeDiscoverMessage(t('home.loadingContent'))

      const result = await window.kindyrAPI.modrinth.search({
        query,
        version: meta.version || selectedVersion,
        sort,
        type: homeDiscoverType,
        offset: homeDiscoverOffset,
        limit
      })

      homeDiscoverLoading = false
      if (!result.ok) {
        renderHomeDiscoverMessage(result.error || t('home.searchFailed'))
        setStatus(result.error || t('home.searchFailed'))
        return
      }

      homeDiscoverTotal = result.totalHits
      const typeLabel = getHomeDiscoverTypes().find(item => item.id === homeDiscoverType)?.label || t('instance.content')
      renderHomeDiscoverResults(result.hits.filter(matchesHomeDiscoverProject))
      setStatus(t('home.loadedFor', { type: typeLabel, version: meta.version || selectedVersion }))
    }
    
    function goHomeDiscoverPage(page) {
      const limit = getHomeDiscoverLimit()
      homeDiscoverOffset = Math.max(0, (page - 1) * limit)
      searchHomeDiscover(false)
    }
    
    function changeHomeDiscoverPage(direction) {
      const limit = getHomeDiscoverLimit()
      const nextOffset = homeDiscoverOffset + direction * limit
      const maxOffset = Math.max(0, Math.ceil(homeDiscoverTotal / limit) * limit - limit)
      homeDiscoverOffset = Math.max(0, Math.min(nextOffset, maxOffset))
      searchHomeDiscover(false)
    }
    
    async function quickInstallLatestRelease(project, button) {
      const meta = getSelectedInstanceMeta()
      const projectType = getProjectInstallKind(project)
      if (projectType === 'mod' && (!meta.loader || meta.loader === 'vanilla')) {
        setStatus(t('home.vanillaModsWarning'))
        return
      }

      const originalText = button.textContent
      button.disabled = true
      button.textContent = t('home.installing')
      setStatus(t('home.installingRelease', { title: project.title }))

      const result = await window.kindyrAPI.modrinth.installLatestRelease({
        project,
        instanceId: selectedInstance
      })

      button.disabled = false
      button.textContent = originalText
      if (!result.ok) {
        setStatus(result.error)
        return
      }

      setStatus(t('home.installed', { name: result.version?.name || result.version?.version_number || project.title }))
      refreshInstancePanelSoon(3)
      if (isHomeDiscoverOpen()) searchHomeDiscover(false)
    }
    
    renderHomeDiscoverTabs()
    updateHomeDiscoverContext()
  `
  document.head.appendChild(script)
}

let installProject = null
let installVersions = []
let installVersionId = ''
let installModpackLoader = ''
let installModpackDestination = 'instance'
const modpackLoaderDefs = [
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'minecraft', label: 'Vanilla' }
]

function getInstallKind(project) {
  const activeDiscoverType = typeof discoverType === 'string' ? discoverType : ''
  if (activeDiscoverType === 'plugin' || activeDiscoverType === 'datapack') return activeDiscoverType
  return project.project_type || 'mod'
}

function getDefaultLoader(project) {
  if (project.project_type === 'resourcepack' || project.project_type === 'shader') return 'minecraft'
  if (project.project_type === 'modpack') return 'any'
  const activeDiscoverType = typeof discoverType === 'string' ? discoverType : ''
  if (activeDiscoverType === 'plugin') return 'paper'
  return 'any'
}

function toggleInstallLocalPanel() {
  const compatBody = document.getElementById('install-compat-body')
  const localReplace = document.getElementById('install-local-replace')
  const btn = document.getElementById('install-local-toggle')
  const card = document.getElementById('install-local-card')
  if (!compatBody || !localReplace || !btn) return
  const isLocal = !localReplace.hasAttribute('hidden')
  if (isLocal) {
    localReplace.setAttribute('hidden','')
    compatBody.removeAttribute('hidden')
    compatBody.style.display = ''
    if (card) card.style.display = ''
    btn.innerHTML = '<i class="fa-solid fa-download"></i> Descargar local'
    btn.classList.remove('btn-primary')
    btn.classList.add('btn-secondary')
  } else {
    compatBody.setAttribute('hidden','')
    compatBody.style.display = 'none'
    localReplace.removeAttribute('hidden')
    if (card) card.style.display = 'none'
    btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cerrar'
    btn.classList.remove('btn-secondary')
    btn.classList.add('btn-primary')
    // filtrar loaders compatibles del mod
    filterLocalLoaders()
    loadInstallVersions()
  }
}

function filterLocalLoaders() {
  const loaderSelect = document.getElementById('install-loader')
  if (!loaderSelect || !installProject) return
  // recolectar loaders compatibles de las versiones ya cargadas o del proyecto
  const compatLoaders = new Set()
  for (const v of (installVersions || [])) {
    for (const l of (v.loaders || [])) compatLoaders.add(String(l).toLowerCase())
  }
  // si no hay versiones aún, mostrar todos pero priorizar los del proyecto
  const all = ['any','minecraft','fabric','forge','neoforge','quilt','paper','spigot','bukkit']
  const keep = compatLoaders.size ? ['any', ...[...compatLoaders].filter(x=>all.includes(x))] : all
  for (const opt of [...loaderSelect.options]) {
    const show = keep.includes(opt.value)
    opt.hidden = !show
    opt.disabled = !show
  }
  if (loaderSelect.value && loaderSelect.options[loaderSelect.selectedIndex]?.hidden) {
    loaderSelect.value = keep[0] || 'any'
  }
}

function getCompatInstancesForProject(project) {
  const instances = (typeof launcherInstances !== 'undefined' && Array.isArray(launcherInstances)) ? launcherInstances : []
  if (!instances.length) {
    // fallback: try window
    try {
      const winInstances = window.launcherInstances
      if (Array.isArray(winInstances) && winInstances.length) return winInstances
    } catch {}
    return []
  }
  // Mostrar todas para no quedar vacío; el filtrado real por versión/loader se hace al instalar
  // Si es mod, vanilla no es compatible pero igual lo mostramos como deshabilitado para feedback
  return instances
}

async function renderCompatInstances() {
  const list = document.getElementById('install-compat-list')
  const countEl = document.getElementById('install-compat-count')
  if (!list) return
  let compat = getCompatInstancesForProject(installProject || {})
  if (!compat.length) {
    try {
      const res = await window.kindyrAPI.instances.list()
      const arr = Array.isArray(res) ? res : (res && Array.isArray(res.instances) ? res.instances : [])
      if (arr.length) {
        if (typeof launcherInstances !== 'undefined') launcherInstances = arr
        compat = getCompatInstancesForProject(installProject || {})
        if (!compat.length) compat = arr
      }
    } catch {}
  }
  if (!compat.length) {
    list.innerHTML = '<div class="install-note">No tenés instancias. Creá una primero o usá Descargar local.</div>'
    if (countEl) countEl.textContent = '0'
    return
  }
  // Verificar instalados (async, sin bloquear orden)
  const isMod = (installProject && (installProject.project_type || 'mod') === 'mod')
  const slug = String(installProject.slug || installProject.project_id || '').toLowerCase()
  // intentar obtener loaders soportados del mod para filtrar mejor
  let supportedLoaders = null
  let supportedVersions = null
  try {
    const isCF = Boolean(installProject._curseForge)
    const api = isCF ? window.kindyrAPI.curseforge : window.kindyrAPI.modrinth
    const vRes = await api.versions({ projectId: installProject.project_id || installProject.slug || installProject.id, modId: installProject.project_id || installProject.id })
    if (vRes && vRes.ok && Array.isArray(vRes.versions) && vRes.versions.length) {
      supportedLoaders = new Set()
      supportedVersions = new Set()
      for (const v of vRes.versions.slice(0,20)) {
        for (const l of (v.loaders || [])) supportedLoaders.add(String(l).toLowerCase())
        for (const gv of (v.game_versions || v.gameVersions || [])) supportedVersions.add(String(gv).toLowerCase())
      }
    }
  } catch {}
  const checks = await Promise.all(compat.map(async inst => {
    let installed = false
    try {
      const det = await window.kindyrAPI.instances.getDetails(inst.id)
      const mods = det && (det.mods || det.files || [])
      if (Array.isArray(mods)) {
        installed = mods.some(m => {
          const n = String(m.name || m.fileName || m.path || '').toLowerCase()
          return n.includes(slug) || (installProject.title && n.includes(String(installProject.title).toLowerCase().slice(0,8)))
        })
      }
    } catch {}
    let isIncompat = false
    if (!installed) {
      if (isMod && (!inst.loader || inst.loader === 'vanilla')) isIncompat = true
      else if (supportedLoaders && supportedLoaders.size && inst.loader && !supportedLoaders.has(String(inst.loader).toLowerCase()) && !supportedLoaders.has('minecraft') && String(inst.loader).toLowerCase() !== 'vanilla') isIncompat = true
      else if (supportedVersions && supportedVersions.size && !supportedVersions.has(String(inst.version).toLowerCase())) isIncompat = true
    }
    const status = installed ? 'installed' : (isIncompat ? 'incompatible' : 'compatible')
    return { inst, status, installed }
  }))
  // Orden: compatibles, incompatibles, instalados
  const order = { compatible: 0, incompatible: 1, installed: 2 }
  checks.sort((a,b) => (order[a.status] - order[b.status]) || a.inst.name.localeCompare(b.inst.name))
  if (countEl) countEl.textContent = checks.filter(c=>c.status==='compatible').length + ' compatibles'
  list.innerHTML = checks.map(({inst, status}) => {
    const loaderLabel = (typeof getInstanceLoaderLabel === 'function' ? getInstanceLoaderLabel(inst.loader) : inst.loader) || 'Vanilla'
    let btn = ''
    let tag = ''
    let ic = 'fa-gamepad'
    let cardClass = 'instance-card'
    let titleAttr = ''
    if (status === 'installed') {
      btn = '<button type="button" class="btn btn-secondary" disabled><i class="fa-solid fa-check"></i> Instalado</button>'
      tag = '<span class="mini ok" style="background:#1a1a1a;color:#666;border-color:#333"><i class="fa-solid fa-check"></i> Instalado</span>'
      cardClass += ' installed'
      ic = 'fa-check'
    } else if (status === 'incompatible') {
      btn = '<button type="button" class="btn btn-secondary" disabled style="border-color:#f59e0b;color:#f59e0b"><i class="fa-solid fa-triangle-exclamation"></i> Instalar</button>'
      tag = '<span class="mini">No compatible</span>'
      cardClass += ' incompatible'
      ic = 'fa-cube'
      titleAttr = ' title="Está instancia usa un loader o una versión de juego que este proyecto no soporta."'
    } else {
      btn = '<button type="button" class="btn btn-primary" onclick="installToCompatInstance(\'' + escapeHtml(inst.id) + '\', this)"><i class="fa-solid fa-bolt"></i> Instalar</button>'
      tag = '<span class="mini ok">Compatible</span>'
    }
    return '<div class="' + cardClass + '"' + titleAttr + '>'
      + '<div class="ic"><i class="fa-solid ' + ic + '"></i></div>'
      + '<div><div class="i-name">' + escapeHtml(inst.name) + '</div><div class="i-meta">' + escapeHtml(loaderLabel) + ' · ' + escapeHtml(inst.version) + '</div><div class="i-tags">' + tag + '<span class="mini">' + escapeHtml(inst.version) + '</span><span class="mini">' + escapeHtml(loaderLabel) + '</span></div></div>'
      + btn
      + '</div>'
  }).join('')
}

async function installToCompatInstance(instanceId, button) {
  if (!installProject || !instanceId) return
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
    setInstallNote(isCF ? 'Instalado en ' + instance.name : t('install.installedLauncher'))
    setStatus('Instalado en ' + instance.name)
    closeInstallModal()
    if (result.instance && result.instance.id && typeof openInstanceView === 'function') {
      setTimeout(() => openInstanceView(result.instance.id), 400)
    }
  } catch (e) {
    if (button) { button.disabled = false; button.innerHTML = orig }
    setInstallNote(e.message || String(e))
    setStatus(e.message || String(e))
  }
}

function setInstallModalMode(isModpack) {
  const standard = document.getElementById('install-standard-view')
  const modpack = document.getElementById('install-modpack-view')
  if (standard) standard.style.display = isModpack ? 'none' : 'block'
  if (modpack) modpack.style.display = isModpack ? 'block' : 'none'
}

function setInstallNote(message) {
  const note = document.getElementById('install-note')
  if (!note) return
  const icon = document.createElement('i')
  icon.className = 'fa-solid fa-circle-info'
  icon.setAttribute('aria-hidden', 'true')
  const text = document.createElement('span')
  text.textContent = String(message || '')
  note.replaceChildren(icon, text)
}

function getCompatibleLoadersForVersion(version) {
  const loaders = (version?.loaders || []).map(loader => String(loader).toLowerCase())
  return modpackLoaderDefs
    .map(loader => loader.id)
    .filter(id => loaders.includes(id))
}

function getSelectedInstallVersion() {
  return installVersions.find(version => version.id === installVersionId) || null
}

function selectModpackDestination(value, button) {
  installModpackDestination = value
  document.querySelectorAll('#install-modpack-destination .destination-option').forEach(option => {
    option.classList.toggle('active', option === button)
  })
  const confirmBtn = document.getElementById('install-confirm')
  if (confirmBtn) confirmBtn.textContent = value === 'downloads' ? t('install.download') : t('install.install')
}

function selectModpackLoader(loaderId) {
  const compatible = getCompatibleLoadersForVersion(getSelectedInstallVersion())
  if (!compatible.includes(loaderId) || compatible.length <= 1) return
  installModpackLoader = loaderId
  renderModpackLoaders()
}

function renderModpackLoaders() {
  const container = document.getElementById('install-modpack-loaders')
  if (!container) return
  const version = getSelectedInstallVersion()
  const compatible = getCompatibleLoadersForVersion(version)
  if (!compatible.length) {
    container.innerHTML = '<div class="install-note">' + escapeHtml(t('install.noLoaders')) + '</div>'
    return
  }
  if (!compatible.includes(installModpackLoader)) {
    installModpackLoader = compatible[0]
  }
  const canSwitch = compatible.length > 1
  container.innerHTML = ''
  const fragLoader = document.createDocumentFragment()
  modpackLoaderDefs.forEach(loader => {
    const isCompatible = compatible.includes(loader.id)
    const isActive = installModpackLoader === loader.id
    const btn = document.createElement('button')
    btn.type = 'button'
    if (!isCompatible) {
      btn.className = 'loader-option blocked'
      btn.disabled = true
      btn.textContent = loader.label
      const x = document.createElement('i')
      x.className = 'fa-solid fa-xmark loader-block-icon'
      x.setAttribute('aria-hidden', 'true')
      btn.appendChild(x)
    } else {
      btn.className = 'loader-option' + (isActive ? ' active' : '')
      btn.textContent = loader.label
      btn.disabled = !canSwitch
      if (canSwitch) btn.addEventListener('click', () => selectModpackLoader(loader.id))
    }
    fragLoader.appendChild(btn)
  })
  container.appendChild(fragLoader)
}

function renderModpackVersions() {
  const list = document.getElementById('install-modpack-version-list')
  if (!list) return
  if (!installVersions.length) {
    list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.noModpackVersions')) + '</div>'
    setInstallNote(t('install.noVersions'))
    return
  }
  list.innerHTML = ''
  const frag = document.createDocumentFragment()
  installVersions.forEach(version => {
    const item = document.createElement('div')
    item.className = 'install-version-item' + (version.id === installVersionId ? ' active' : '')
    const nameEl = document.createElement('span')
    nameEl.textContent = version.name || version.version_number || ''
    const metaEl = document.createElement('span')
    const gameVersions = (version.game_versions || []).slice(0, 4).join(', ')
    const loaders = (version.loaders || []).join(', ')
    metaEl.textContent = (version.version_type || '') + ' · ' + loaders + ' · ' + gameVersions
    item.append(nameEl, metaEl)
    item.addEventListener('click', () => selectModpackVersion(version.id))
    frag.appendChild(item)
  })
  list.appendChild(frag)
  setInstallNote(t('install.availableVersions', { count: installVersions.length }))
}

function selectModpackVersion(versionId) {
  installVersionId = versionId
  renderModpackVersions()
  renderModpackLoaders()
}

async function loadModpackInstallVersions() {
  if (!installProject) return
  setInstallNote(t('install.loadingModpackVersions'))
  const list = document.getElementById('install-modpack-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.loadingVersions')) + '</div>'

  const result = await window.kindyrAPI.modrinth.versions({
    projectId: installProject.project_id || installProject.slug,
    loader: 'any'
  })

  if (!result.ok) {
    installVersions = []
    installVersionId = ''
    setInstallNote(result.error)
    if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(result.error) + '</div>'
    return
  }

  installVersions = (result.versions || []).filter(version => version.version_type === 'release')
  installVersionId = installVersions[0]?.id || ''
  const compatible = getCompatibleLoadersForVersion(installVersions[0])
  installModpackLoader = compatible[0] || 'minecraft'
  renderModpackVersions()
  renderModpackLoaders()
}

async function openInstallModal(project) {
  installProject = project
  installVersions = []
  installVersionId = ''
  const isModpack = project.project_type === 'modpack'
  setInstallModalMode(isModpack)
  const title = document.getElementById('install-title')
  if (title) title.textContent = t('install.titleProject', { title: project.title })
  const projectIcon = document.getElementById('install-project-icon')
  if (projectIcon) {
    projectIcon.innerHTML = project.icon_url
      ? '<img src="' + escapeHtml(project.icon_url) + '" alt="">'
      : '<i class="fa-solid fa-box-open" aria-hidden="true"></i>'
  }
  const projectMeta = document.getElementById('install-project-meta')
  if (projectMeta) {
    const typeLabels = {
      mod: t('discover.type.modSingle'),
      modpack: t('discover.type.modpackSingle'),
      resourcepack: t('discover.type.resourcepackSingle'),
      shader: t('discover.type.shaderSingle')
    }
    const typeLabel = typeLabels[project.project_type] || t('discover.project')
    projectMeta.textContent = typeLabel + (project.author ? ' · ' + project.author : '')
  }
  const kickerText = document.getElementById('install-kicker-text')
  if (kickerText) {
    const isCF = Boolean(project._curseForge)
    kickerText.textContent = (isCF ? 'CURSEFORGE' : 'MODRINTH') + ' · INSTALADOR'
  }
  setInstallNote(isModpack ? t('install.loadingModpackVersions') : t('install.searchingCompatible'))
  await refreshLauncherInstances()

  if (isModpack) {
    installModpackDestination = 'instance'
    document.querySelectorAll('#install-modpack-destination .destination-option').forEach(option => {
      option.classList.toggle('active', option.dataset.value === 'instance')
    })
    const confirmBtn = document.getElementById('install-confirm')
    if (confirmBtn) confirmBtn.textContent = t('install.install')
    document.getElementById('install-modal').classList.add('active')
    loadModpackInstallVersions()
    return
  }

  // nuevo flujo: compatibles + local (copy prototype)
  const flow = document.getElementById('install-flow')
  if (flow) flow.style.display = isModpack ? 'none' : 'grid'
  const compatBody = document.getElementById('install-compat-body')
  const localReplace = document.getElementById('install-local-replace')
  const localCard = document.getElementById('install-local-card')
  if (compatBody) { compatBody.removeAttribute('hidden'); compatBody.style.display = '' }
  if (localReplace) localReplace.setAttribute('hidden','')
  if (localCard) localCard.style.display = ''
  const localToggle = document.getElementById('install-local-toggle')
  if (localToggle) { localToggle.innerHTML = '<i class="fa-solid fa-download"></i> Descargar local'; localToggle.classList.remove('btn-primary'); localToggle.classList.add('btn-secondary') }

  const gameVersion = document.getElementById('install-game-version')
  if (gameVersion) gameVersion.value = '' // local: sin filtro inicial, muestra todas
  const loader = document.getElementById('install-loader')
  if (loader) loader.value = 'any'
  const destination = document.getElementById('install-destination')
  if (destination) destination.value = 'downloads'
  const list = document.getElementById('install-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.loadingVersions')) + '</div>'
  updateInstallDestination()
  document.getElementById('install-modal').classList.add('active')
  if (!isModpack) await renderCompatInstances()
  loadInstallVersions()
}

function closeInstallModal(event) {
  if (event && event.target.id !== 'install-modal') return
  document.getElementById('install-modal').classList.remove('active')
  const cb = document.getElementById('install-compat-body')
  const lr = document.getElementById('install-local-replace')
  const lc = document.getElementById('install-local-card')
  if (cb) { cb.removeAttribute('hidden'); cb.style.display = '' }
  if (lr) lr.setAttribute('hidden','')
  if (lc) lc.style.display = ''
  const lt = document.getElementById('install-local-toggle')
  if (lt) { lt.innerHTML = '<i class="fa-solid fa-download"></i> Descargar local'; lt.classList.remove('btn-primary'); lt.classList.add('btn-secondary') }
}

function updateInstallDestination() {
  const destination = document.getElementById('install-destination').value
  const wrap = document.getElementById('install-instance-wrap')
  const isModpack = installProject && installProject.project_type === 'modpack'
  if (wrap) wrap.style.display = destination === 'instance' && !isModpack ? 'block' : 'none'
  const confirmBtn = document.getElementById('install-confirm')
  if (confirmBtn) confirmBtn.textContent = destination === 'downloads' ? t('install.download') : t('install.install')
}

async function loadInstallVersions() {
  if (!installProject) return
  const gameVersion = document.getElementById('install-game-version').value.trim()
  const loader = document.getElementById('install-loader').value
  setInstallNote(t('install.checkingCompatibility'))
  const list = document.getElementById('install-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.searchingCompatible')) + '</div>'

  const result = await window.kindyrAPI.modrinth.versions({
    projectId: installProject.project_id || installProject.slug,
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

function renderInstallVersions() {
  const list = document.getElementById('install-version-list')
  if (!list) return
  if (!installVersions.length) {
    list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.noCompatible')) + '</div>'
    setInstallNote(t('install.noCompatibleNote'))
    return
  }
  list.innerHTML = ''
  const fragInstall = document.createDocumentFragment()
  installVersions.slice(0, 30).forEach(version => {
    const loaders = (version.loaders || []).join(', ')
    const gameVersions = (version.game_versions || []).slice(0, 4).join(', ')
    const item = document.createElement('div')
    item.className = 'install-version-item' + (version.id === installVersionId ? ' active' : '')
    const nameEl = document.createElement('span')
    nameEl.textContent = version.name || version.version_number || ''
    const metaEl = document.createElement('span')
    metaEl.textContent = (version.version_type || '') + ' · ' + loaders + ' · ' + gameVersions
    item.append(nameEl, metaEl)
    item.addEventListener('click', () => selectInstallVersion(version.id))
    fragInstall.appendChild(item)
  })
  list.appendChild(fragInstall)
  setInstallNote(t('install.compatibleFound', { count: installVersions.length }))
}

function selectInstallVersion(versionId) {
  installVersionId = versionId
  renderInstallVersions()
}

async function installSelectedProject() {
  if (!installProject || !installVersionId) {
    setStatus(t('install.pickVersion'))
    return
  }

  const isModpack = installProject.project_type === 'modpack'
  const selectedVersionData = getSelectedInstallVersion()
  const destination = isModpack
    ? installModpackDestination
    : document.getElementById('install-destination').value
  const isModpackNewInstance = isModpack && destination === 'instance'
  const shouldShowToast = isModpackNewInstance && settings.eagerPrepareOnCreate
  const btn = document.getElementById('install-confirm')
  btn.disabled = true
  btn.textContent = destination === 'downloads' ? t('install.downloading') : t('install.installing')
  setInstallNote(t('install.working'))

  if (shouldShowToast) {
    showPrepareToast(installProject.title || 'Modpack', t('install.working'))
    updatePrepareToast(10, t('install.working'), 'Iniciando')
  }

  const result = await window.kindyrAPI.modrinth.install({
    project: installProject,
    installKind: getInstallKind(installProject),
    versionId: installVersionId,
    gameVersion: isModpack
      ? (selectedVersionData?.game_versions?.[0] || selectedVersionData?.version_number || selectedVersion)
      : document.getElementById('install-game-version').value.trim(),
    loader: isModpack ? installModpackLoader : document.getElementById('install-loader').value,
    destination,
    instanceId: document.getElementById('install-instance').value
  })

  btn.disabled = false
  if (isModpack) {
    btn.textContent = installModpackDestination === 'downloads' ? t('install.download') : t('install.install')
  } else {
    updateInstallDestination()
  }
  if (!result.ok) {
    if (shouldShowToast) {
      updatePrepareToast(0, result.error, 'Error')
      setTimeout(() => hidePrepareToast(true), 3000)
    }
    setInstallNote(result.error)
    setStatus(result.error)
    return
  }

  await refreshLauncherInstances()
  if (shouldShowToast) {
    updatePrepareToast(100, t('install.done', { path: result.path }), 'Listo')
    setStatus(t('settings.beta.prepared', { name: installProject.title || result.instance?.name || 'Modpack' }))
    setTimeout(() => hidePrepareToast(true), 900)
    closeInstallModal()
    if (result.instance && result.instance.id) {
      await new Promise(r => setTimeout(r, 200))
      openInstanceView(result.instance.id)
    }
    return
  }
  setInstallNote(t('install.done', { path: result.path }))
  setStatus(destination === 'downloads' ? t('install.downloaded') : t('install.installedLauncher'))
}

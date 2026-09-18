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

      let result = await window.kindyrAPI.modrinth.installLatestRelease({
        project,
        instanceId: selectedInstance
      })
      // Fallback RP/shader: sin compatibilidad directa se ofrece instalar la
      // más actual con modal de aviso en vez de fallar en seco.
      if (!result.ok && isNoCompatibleError(result.error) && !project._curseForge && COMPAT_FALLBACK_KINDS.has(getProjectInstallKind(project))) {
        const fb = await installFallbackNewest({ project, installKind: getProjectInstallKind(project), instanceId: selectedInstance, instanceVersion: meta.version })
        if (fb.cancelled) {
          button.disabled = false
          button.textContent = originalText
          setStatus(t('app.ready'))
          return
        }
        result = fb
      }

      button.disabled = false
      button.textContent = originalText
      if (!result.ok) {
        setStatus(friendlyInstallError(result.error))
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
let installLocalPathDefault = ''
// Gemelo Modrinth verificado para proyectos CF "Solo web" (ver oferta abajo).
let compatTwinProject = null
let compatTwinChecked = false
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

// ===== Fallback RP/shader sin compatibilidad directa + modal de aviso =====
// Paso 1: si alguna versión declara la versión de la instancia (cualquier
// canal: hay packs que publican todo como beta y nunca como release), se
// instala directo SIN modal. Paso 2: solo en desfasaje real (ej. instancia
// 26.1.2 y pack hasta 1.21.11) se instala la más actual previo modal de
// aviso (puede fallar o tener bugs visuales). Solo aplica a resourcepacks y
// shaders de Modrinth: los mods con loader incorrecto no correrían y los
// datapacks pueden romper mundos.
const COMPAT_FALLBACK_KINDS = new Set(['resourcepack', 'shader'])

function isNoCompatibleError(message) {
  return /no hay versiones compatibles/i.test(String(message || ''))
}

// Error de distribución desactivada por el autor en CurseForge: la API no da
// URL y ningún reintento lo arregla. Se muestra el mensaje accionable (i18n)
// en vez del técnico del backend.
function isNoDistributionError(message) {
  return /no permite descargas por API/i.test(String((message && message.message) || message || ''))
}

function friendlyInstallError(error) {
  const raw = String((error && error.message) || error || '')
  if (isNoDistributionError(raw)) return t('curseforge.noDistribution')
  return raw
}

function getFallbackKind(project) {
  const cats = (project && (project.display_categories || project.categories)) || []
  if (cats.includes('datapack')) return 'datapack'
  return (project && project.project_type) || 'mod'
}

function pickNewestProjectVersion(versions) {
  let best = null
  let bestTs = -Infinity
  for (const v of (Array.isArray(versions) ? versions : [])) {
    const ts = Date.parse(v.date_published || '') || 0
    if (!best || ts > bestTs) { best = v; bestTs = ts }
  }
  return best
}

let compatWarnState = null

function ensureCompatWarnModal() {
  let modal = document.getElementById('compat-warn-modal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.id = 'compat-warn-modal'
  modal.innerHTML =
    '<div class="account-modal compat-warn-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">' +
      '<div class="modal-head"><span class="compat-warn-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>' +
      '<div class="modal-title" id="compat-warn-title"></div>' +
      '<button type="button" class="modal-close" onclick="closeCompatWarnModal(false)" aria-label="×">×</button></div>' +
      '<div class="modal-body"><div class="compat-warn-box"><i class="fa-solid fa-triangle-exclamation"></i><span id="compat-warn-message"></span></div></div>' +
      '<div class="compat-warn-foot"><button type="button" class="secondary-btn" id="compat-warn-cancel"></button>' +
      '<button type="button" class="primary-btn" id="compat-warn-confirm"></button></div>' +
    '</div>'
  modal.addEventListener('click', (ev) => { if (ev.target === modal) closeCompatWarnModal(false) })
  document.body.appendChild(modal)
  return modal
}

function closeCompatWarnModal(confirmed) {
  document.getElementById('compat-warn-modal')?.classList.remove('active')
  const st = compatWarnState
  compatWarnState = null
  if (st && typeof st.resolve === 'function') st.resolve(Boolean(confirmed))
}

function showCompatWarnModal({ title, packVersion, packVersions, instanceVersion }) {
  const modal = ensureCompatWarnModal()
  document.getElementById('compat-warn-title').textContent = t('compat.warnTitle')
  document.getElementById('compat-warn-message').textContent = t('compat.warnMessage', { title, packVersion, packVersions, instanceVersion })
  document.getElementById('compat-warn-cancel').textContent = t('install.cancel')
  const confirm = document.getElementById('compat-warn-confirm')
  confirm.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + escapeHtml(t('compat.confirmAnyway'))
  modal.classList.add('active')
  return new Promise(resolve => {
    compatWarnState = { resolve }
    document.getElementById('compat-warn-cancel').onclick = () => closeCompatWarnModal(false)
    confirm.onclick = () => closeCompatWarnModal(true)
  })
}

// Compara versiones de juego por grupos numéricos (1.21.11 > 1.21.2, 26.2 > 1.21.11).
function compareGameVersions(a, b) {
  const pa = String(a).split(/[^0-9]+/).filter(Boolean).map(Number)
  const pb = String(b).split(/[^0-9]+/).filter(Boolean).map(Number)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = i < pa.length ? pa[i] : 0
    const y = i < pb.length ? pb[i] : 0
    if (x !== y) return x - y
  }
  return String(a).localeCompare(String(b))
}

// Busca la versión más actual sin filtro de juego e instala:
// - Paso 1: si alguna declara la versión de la instancia (cualquier canal:
//   hay packs que publican todo como beta), se instala DIRECTO sin modal.
// - Paso 2: solo en desfasaje real se muestra el aviso y se instala la más
//   actual. Devuelve {ok, version?, error?, cancelled?}.
async function installFallbackNewest({ project, installKind, instanceId, instanceVersion }) {
  const versionsRes = await window.kindyrAPI.modrinth.versions({ projectId: project.project_id || project.id || project.slug })
  if (!versionsRes.ok) return { ok: false, error: versionsRes.error }
  const all = versionsRes.versions || []
  if (!all.length) return { ok: false, error: t('install.noVersions') }
  const withFile = all.filter(v => (v.files || []).some(f => f.url))
  const pool = withFile.length ? withFile : all
  const mcVersion = String(instanceVersion || '')
  if (mcVersion) {
    const matching = pool.filter(v => (v.game_versions || []).includes(mcVersion))
    const silent = pickNewestProjectVersion(matching)
    if (silent) {
      setStatus(t('install.installing'))
      return window.kindyrAPI.modrinth.install({ project, installKind, versionId: silent.id, destination: 'instance', instanceId })
    }
  }
  const latest = pickNewestProjectVersion(pool)
  if (!latest) return { ok: false, error: t('install.noVersions') }
  const declared = [...new Set(all.flatMap(v => v.game_versions || []))]
    .filter(v => /^\d/.test(String(v))).sort(compareGameVersions).slice(-4).join(', ') || '—'
  const confirmed = await showCompatWarnModal({
    title: project.title,
    packVersion: latest.version_number || latest.name || '',
    packVersions: declared,
    instanceVersion: mcVersion
  })
  if (!confirmed) return { ok: false, cancelled: true }
  setStatus(t('install.installing'))
  return window.kindyrAPI.modrinth.install({ project, installKind, versionId: latest.id, destination: 'instance', instanceId })
}

// ===== Rescate cross-provider CF -> Modrinth (gemelo verificado) =====
// Cuando CurseForge bloquea la distribución por API pero el MISMO proyecto
// existe en Modrinth (mismo slug + tipo + autor verificado en backend), se
// ofrece instalarlo desde ahí. Siempre con confirmación explícita mostrando
// ambas fuentes: nunca sustitución silenciosa.
let twinModalState = null

function ensureTwinModal() {
  let modal = document.getElementById('twin-modal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.id = 'twin-modal'
  modal.innerHTML =
    '<div class="account-modal twin-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">' +
      '<div class="modal-head"><span class="twin-icon"><i class="fa-solid fa-arrows-rotate"></i></span>' +
      '<div class="modal-title" id="twin-title"></div>' +
      '<button type="button" class="modal-close" onclick="closeTwinModal(false)" aria-label="×">×</button></div>' +
      '<div class="modal-body"><div class="twin-box"><i class="fa-solid fa-circle-info"></i><span id="twin-message"></span></div></div>' +
      '<div class="twin-foot"><button type="button" class="secondary-btn" id="twin-cancel"></button>' +
      '<button type="button" class="primary-btn" id="twin-confirm"></button></div>' +
    '</div>'
  modal.addEventListener('click', (ev) => { if (ev.target === modal) closeTwinModal(false) })
  document.body.appendChild(modal)
  return modal
}

function closeTwinModal(accepted) {
  document.getElementById('twin-modal')?.classList.remove('active')
  const st = twinModalState
  twinModalState = null
  if (st && typeof st.resolve === 'function') st.resolve(Boolean(accepted))
}

function showTwinModal({ cfTitle, twinTitle, author }) {
  const modal = ensureTwinModal()
  document.getElementById('twin-title').textContent = t('twin.title')
  document.getElementById('twin-message').textContent = t('twin.message', { title: cfTitle, twin: twinTitle, author })
  document.getElementById('twin-cancel').textContent = t('install.cancel')
  const confirm = document.getElementById('twin-confirm')
  confirm.innerHTML = '<i class="fa-solid fa-download"></i> ' + escapeHtml(t('twin.confirm'))
  modal.classList.add('active')
  return new Promise(resolve => {
    twinModalState = { resolve }
    document.getElementById('twin-cancel').onclick = () => closeTwinModal(false)
    confirm.onclick = () => closeTwinModal(true)
  })
}

// Busca gemelo en Modrinth y, con confirmación, lo instala en la instancia.
// Devuelve {ok, version?...} o {ok:false, twin:false} (sin gemelo) o
// {ok:false, cancelled:true} (usuario canceló).
async function offerModrinthTwinInstall({ cfProject, instanceId }) {
  let twinRes = null
  try {
    twinRes = await window.kindyrAPI.curseforge.findTwin({
      modId: cfProject.project_id || cfProject.id,
      slug: cfProject.slug,
      title: cfProject.title,
      author: cfProject.author,
      kind: String(cfProject.project_type || 'mod')
    })
  } catch (e) {
    return { ok: false, twin: false, error: (e && e.message) || String(e) }
  }
  if (!twinRes || !twinRes.ok || !twinRes.found) return { ok: false, twin: false }
  const confirmed = await showTwinModal({ cfTitle: cfProject.title, twinTitle: twinRes.project.title, author: twinRes.author || cfProject.author })
  if (!confirmed) return { ok: false, cancelled: true }
  setStatus(t('install.installing'))
  const installed = await window.kindyrAPI.modrinth.installLatestRelease({ project: twinRes.project, instanceId })
  if (!installed.ok && isNoCompatibleError(installed.error) && COMPAT_FALLBACK_KINDS.has(getFallbackKind(twinRes.project))) {
    const instance = (typeof launcherInstances !== 'undefined' ? launcherInstances.find(i => i.id === instanceId) : null)
    const fb = await installFallbackNewest({ project: twinRes.project, installKind: getFallbackKind(twinRes.project), instanceId, instanceVersion: instance ? instance.version : '' })
    if (fb.cancelled) return { ok: false, cancelled: true }
    return fb
  }
  return installed
}

async function ensureInstallLocalPaths() {
  if (installLocalPathDefault) {
    if (!document.getElementById('install-local-path')?.value) {
      document.getElementById('install-local-path').value = installLocalPathDefault
    }
    if (!document.getElementById('install-modpack-path')?.value) {
      document.getElementById('install-modpack-path').value = installLocalPathDefault
    }
    return installLocalPathDefault
  }
  try {
    const api = (installProject && installProject._curseForge)
      ? window.kindyrAPI.curseforge
      : window.kindyrAPI.modrinth
    const res = await api.getDownloadsDir()
    if (res && res.ok && (res.path || res.defaultPath)) {
      // Predefinida: carpeta Descargas del usuario (petición UX)
      installLocalPathDefault = String(res.path || res.defaultPath)
      const localInput = document.getElementById('install-local-path')
      if (localInput && !localInput.value) localInput.value = installLocalPathDefault
      const packInput = document.getElementById('install-modpack-path')
      if (packInput && !packInput.value) packInput.value = installLocalPathDefault
      return installLocalPathDefault
    }
  } catch {}
  return ''
}

function getInstallLocalPath() {
  const el = document.getElementById('install-local-path')
  const v = String(el?.value || '').trim()
  return v || installLocalPathDefault || ''
}

function getInstallModpackPath() {
  const el = document.getElementById('install-modpack-path')
  const v = String(el?.value || '').trim()
  return v || installLocalPathDefault || ''
}

async function browseInstallLocalPath() {
  try {
    const current = getInstallLocalPath()
    const api = (installProject && installProject._curseForge)
      ? window.kindyrAPI.curseforge
      : window.kindyrAPI.modrinth
    const res = await api.browseDownloadDir(current)
    if (res && res.ok && res.path) {
      document.getElementById('install-local-path').value = res.path
    }
  } catch (e) {
    setInstallNote(e.message || String(e))
  }
}

async function browseInstallModpackPath() {
  try {
    const current = getInstallModpackPath()
    const api = (installProject && installProject._curseForge)
      ? window.kindyrAPI.curseforge
      : window.kindyrAPI.modrinth
    const res = await api.browseDownloadDir(current)
    if (res && res.ok && res.path) {
      document.getElementById('install-modpack-path').value = res.path
    }
  } catch (e) {
    setInstallNote(e.message || String(e))
  }
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
  const flow = document.getElementById('install-flow')
  if (!compatBody || !localReplace || !btn) return
  const isLocal = !localReplace.hasAttribute('hidden')
  if (isLocal) {
    localReplace.setAttribute('hidden','')
    compatBody.removeAttribute('hidden')
    compatBody.style.display = ''
    if (card) card.style.display = ''
    if (flow) flow.classList.remove('local-mode')
    btn.innerHTML = '<i class="fa-solid fa-download"></i> Descargar local'
    btn.classList.remove('btn-primary')
    btn.classList.add('btn-secondary')
  } else {
    compatBody.setAttribute('hidden','')
    compatBody.style.display = 'none'
    localReplace.removeAttribute('hidden')
    if (card) card.style.display = 'none'
    if (flow) flow.classList.add('local-mode')
    btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cerrar'
    btn.classList.remove('btn-secondary')
    btn.classList.add('btn-primary')
    // filtrar loaders compatibles del mod
    filterLocalLoaders()
    updateInstallDestination()
    ensureInstallLocalPaths()
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
  // Solo web (CF con distribución por API desactivada): primero se busca un
  // gemelo verificado en Modrinth; sin gemelo, banner final (ningún intento
  // por CF puede funcionar, la API no da URL).
  const isWebOnlyCF = Boolean(installProject && installProject._curseForge && installProject.allowModDistribution === false)
  if (isWebOnlyCF && !compatTwinChecked) {
    const siteUrl = installProject._curseUrl || ('https://www.curseforge.com/minecraft/mc-mods/' + encodeURIComponent(installProject.slug || installProject.project_id || ''))
    list.innerHTML = '<div class="compat-webonly"><i class="fa-solid fa-triangle-exclamation"></i>' +
      '<div><strong>' + escapeHtml(t('curseforge.webOnly')) + '</strong><span>' + escapeHtml(t('curseforge.noDistribution')) + '</span></div>' +
      '<button type="button" class="btn btn-primary" id="compat-twin-find"><i class="fa-solid fa-arrows-rotate"></i> ' + escapeHtml(t('twin.findButton')) + '</button>' +
      '<button type="button" class="btn btn-secondary" id="compat-webonly-open"><i class="fa-solid fa-arrow-up-right-from-square"></i> ' + escapeHtml(t('curseforge.openSite')) + '</button></div>'
    if (countEl) countEl.textContent = '0 compatibles'
    document.getElementById('compat-webonly-open')?.addEventListener('click', () => {
      if (window.kindyrAPI?.curseforge?.openProject) window.kindyrAPI.curseforge.openProject(siteUrl)
    })
    document.getElementById('compat-twin-find')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + escapeHtml(t('twin.finding')) }
      let found = null
      try {
        const res = await window.kindyrAPI.curseforge.findTwin({
          modId: installProject.project_id || installProject.id,
          slug: installProject.slug,
          title: installProject.title,
          author: installProject.author,
          kind: String(installProject.project_type || 'mod')
        })
        if (res && res.ok && res.found) found = res.project
      } catch {}
      compatTwinChecked = true
      compatTwinProject = found
      renderCompatInstances()
    })
    return
  }
  if (isWebOnlyCF && !compatTwinProject) {
    const siteUrl = installProject._curseUrl || ('https://www.curseforge.com/minecraft/mc-mods/' + encodeURIComponent(installProject.slug || installProject.project_id || ''))
    list.innerHTML = '<div class="compat-webonly"><i class="fa-solid fa-triangle-exclamation"></i>' +
      '<div><strong>' + escapeHtml(t('curseforge.webOnly')) + '</strong><span>' + escapeHtml(t('curseforge.noDistribution')) + '</span></div>' +
      '<button type="button" class="btn btn-secondary" id="compat-webonly-open"><i class="fa-solid fa-arrow-up-right-from-square"></i> ' + escapeHtml(t('curseforge.openSite')) + '</button></div>'
    if (countEl) countEl.textContent = '0 compatibles'
    document.getElementById('compat-webonly-open')?.addEventListener('click', () => {
      if (window.kindyrAPI?.curseforge?.openProject) window.kindyrAPI.curseforge.openProject(siteUrl)
    })
    return
  }
  // Proyecto efectivo: en modo gemelo se chequea/instala el gemelo de
  // Modrinth (mismo slug + tipo + autor verificado en backend).
  const effProject = compatTwinProject
    ? { ...installProject, project_id: compatTwinProject.project_id, slug: compatTwinProject.slug, title: compatTwinProject.title, project_type: compatTwinProject.project_type, categories: compatTwinProject.categories, display_categories: compatTwinProject.display_categories }
    : (installProject || {})
  const effIsCF = !compatTwinProject && Boolean(installProject && installProject._curseForge)
  let compat = getCompatInstancesForProject(effProject)
  if (!compat.length) {
    try {
      const res = await window.kindyrAPI.instances.list()
      const arr = Array.isArray(res) ? res : (res && Array.isArray(res.instances) ? res.instances : [])
      if (arr.length) {
        if (typeof launcherInstances !== 'undefined') launcherInstances = arr
        compat = getCompatInstancesForProject(effProject)
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
  const isMod = ((effProject.project_type || 'mod') === 'mod')
  const slug = String(effProject.slug || effProject.project_id || '').toLowerCase()
  // intentar obtener loaders soportados del mod para filtrar mejor
  let supportedLoaders = null
  let supportedVersions = null
  try {
    const api = effIsCF ? window.kindyrAPI.curseforge : window.kindyrAPI.modrinth
    const vRes = await api.versions({ projectId: effProject.project_id || effProject.slug || effProject.id, modId: effProject.project_id || effProject.id })
    if (vRes && vRes.ok && Array.isArray(vRes.versions) && vRes.versions.length) {
      supportedLoaders = new Set()
      supportedVersions = new Set()
      // OJO: usar TODAS las versiones, no una muestra. La API no garantiza
      // orden y hay proyectos con 100+ versiones: muestrear las primeras
      // podía marcar como incompatible algo perfectamente compatible.
      for (const v of vRes.versions) {
        for (const l of (v.loaders || [])) supportedLoaders.add(String(l).toLowerCase())
      }
      for (const v of vRes.versions) {
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
          return n.includes(slug) || (effProject.title && n.includes(String(effProject.title).toLowerCase().slice(0,8)))
        })
      }
      if (!installed && det && Array.isArray(det.content)) {
        const pid = String(effProject.project_id || effProject.id || '').toLowerCase()
        if (pid) installed = det.content.some(item => String(item.projectId || '').toLowerCase() === pid)
      }
    } catch {}
    let loaderMismatch = false
    let versionMismatch = false
    if (!installed) {
      if (isMod && (!inst.loader || inst.loader === 'vanilla')) loaderMismatch = true
      else if (supportedLoaders && supportedLoaders.size && inst.loader && !supportedLoaders.has(String(inst.loader).toLowerCase()) && !supportedLoaders.has('minecraft') && String(inst.loader).toLowerCase() !== 'vanilla') loaderMismatch = true
      if (supportedVersions && supportedVersions.size && !supportedVersions.has(String(inst.version).toLowerCase())) versionMismatch = true
    }
    // RP/shader con desfasaje SOLO de versión de juego: ofrecer instalar la
    // más actual con aviso en vez de bloquear (los loaders no aplican).
    const canForce = !installed && !effIsCF &&
      COMPAT_FALLBACK_KINDS.has(getFallbackKind(effProject)) && versionMismatch && !loaderMismatch
    const status = installed ? 'installed' : (canForce ? 'force' : ((loaderMismatch || versionMismatch) ? 'incompatible' : 'compatible'))
    return { inst, status, installed }
  }))
  // Orden: compatibles, forzables, incompatibles, instalados
  const order = { compatible: 0, force: 1, incompatible: 2, installed: 3 }
  checks.sort((a,b) => (order[a.status] - order[b.status]) || a.inst.name.localeCompare(b.inst.name))
  if (countEl) countEl.textContent = checks.filter(c=>c.status==='compatible').length + ' compatibles'
  const twinInfo = compatTwinProject
    ? '<div class="compat-twininfo"><i class="fa-solid fa-arrows-rotate"></i><span>' + escapeHtml(t('twin.fromModrinth')) + '</span></div>'
    : ''
  list.innerHTML = twinInfo + checks.map(({inst, status}) => {
    const loaderLabel = (typeof getInstanceLoaderLabel === 'function' ? getInstanceLoaderLabel(inst.loader) : inst.loader) || 'Vanilla'
    let btn = ''
    let tag = ''
    let ic = 'fa-gamepad'
    let cardClass = 'instance-card'
    let titleAttr = ''
    if (status === 'installed') {
      btn = '<button type="button" class="btn btn-secondary" disabled><i class="fa-solid fa-check"></i> ' + escapeHtml(t('discover.installed')) + '</button>'
      tag = '<span class="mini ok" style="background:#1a1a1a;color:#666;border-color:#333"><i class="fa-solid fa-check"></i> ' + escapeHtml(t('discover.installed')) + '</span>'
      cardClass += ' installed'
      ic = 'fa-check'
    } else if (status === 'force') {
      btn = '<button type="button" class="btn btn-warn" onclick="installCompatInstanceAnyway(\'' + escapeHtml(inst.id) + '\', this)"><i class="fa-solid fa-triangle-exclamation"></i> ' + escapeHtml(t('compat.installAnyway')) + '</button>'
      tag = '<span class="mini warn">' + escapeHtml(t('compat.forceTag')) + '</span>'
      cardClass += ' forceable'
      ic = 'fa-triangle-exclamation'
      titleAttr = ' title="' + escapeHtml(t('compat.warnTitle')) + '"'
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
  const isCF = Boolean(installProject._curseForge)
  const orig = button ? button.innerHTML : ''
  if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Instalando...' }
  const instance = (typeof launcherInstances !== 'undefined' ? launcherInstances.find(i => i.id === instanceId) : null)
  const gameVersion = instance ? instance.version : document.getElementById('install-game-version').value.trim()
  const loader = instance ? (instance.loader || 'vanilla') : document.getElementById('install-loader').value
  try {
    let result
    if (compatTwinProject) {
      // Modo gemelo: el proyecto CF es Solo web, se instala el gemelo de
      // Modrinth (mismo slug + tipo + autor verificado en backend).
      result = await window.kindyrAPI.modrinth.installLatestRelease({ project: compatTwinProject, instanceId })
      if (!result.ok && isNoCompatibleError(result.error) && COMPAT_FALLBACK_KINDS.has(getFallbackKind(compatTwinProject))) {
        const fb = await installFallbackNewest({ project: compatTwinProject, installKind: getFallbackKind(compatTwinProject), instanceId, instanceVersion: gameVersion })
        if (fb.cancelled) {
          if (button) { button.disabled = false; button.innerHTML = orig }
          setInstallNote(result.error)
          setStatus(t('app.ready'))
          return
        }
        result = fb
      }
    } else {
      result = await window.kindyrAPI.modrinth.install({
        project: installProject,
        installKind: getInstallKind(installProject),
        gameVersion,
        loader,
        destination: 'instance',
        instanceId
      })
    }
    // Fallback RP/shader: si no hay versión compatible directa, ofrecer la
    // más actual con modal de aviso en vez de fallar en seco.
    if (!result.ok && isNoCompatibleError(result.error) && !installProject._curseForge && COMPAT_FALLBACK_KINDS.has(getFallbackKind(installProject))) {
      const fb = await installFallbackNewest({ project: installProject, installKind: getInstallKind(installProject), instanceId, instanceVersion: gameVersion })
      if (fb.cancelled) {
        if (button) { button.disabled = false; button.innerHTML = orig }
        setInstallNote(result.error)
        setStatus(t('app.ready'))
        return
      }
      result = fb
    }
    if (button) { button.disabled = false; button.innerHTML = orig }
    if (!result.ok) { const msg = friendlyInstallError(result.error); setInstallNote(msg); setStatus(msg); return }
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

async function installCompatInstanceAnyway(instanceId, button) {
  if (!installProject || !instanceId) return
  const orig = button ? button.innerHTML : ''
  if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + escapeHtml(t('install.checkingCompatibility')) }
  const instance = (typeof launcherInstances !== 'undefined' ? launcherInstances.find(i => i.id === instanceId) : null)
  try {
    const fb = await installFallbackNewest({ project: installProject, installKind: getInstallKind(installProject), instanceId, instanceVersion: instance ? instance.version : '' })
    if (button) { button.disabled = false; button.innerHTML = orig }
    if (fb.cancelled) { setStatus(t('app.ready')); return }
    if (!fb.ok) { const msg = friendlyInstallError(fb.error); setInstallNote(msg); setStatus(msg); return }
    await refreshLauncherInstances()
    setInstallNote(t('install.installedLauncher'))
    setStatus(t('home.installed', { name: fb.version?.name || fb.version?.version_number || installProject.title }))
    closeInstallModal()
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
  const pathWrap = document.getElementById('install-modpack-path-wrap')
  if (pathWrap) pathWrap.style.display = value === 'downloads' ? 'block' : 'none'
  if (value === 'downloads') ensureInstallLocalPaths()
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
  compatTwinProject = null
  compatTwinChecked = false
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
    const packPathWrap = document.getElementById('install-modpack-path-wrap')
    if (packPathWrap) packPathWrap.style.display = 'none'
    document.getElementById('install-modal').classList.add('active')
    ensureInstallLocalPaths()
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
  // Panel local (no-modpack) siempre es descarga local: ya no hay selector Ubicación.
  // Se conserva por compatibilidad si el select legacy existiera en alguna vista.
  const destEl = document.getElementById('install-destination')
  const destination = destEl ? destEl.value : 'downloads'
  const wrap = document.getElementById('install-instance-wrap')
  const isModpack = installProject && installProject.project_type === 'modpack'
  if (wrap) wrap.style.display = destination === 'instance' && !isModpack ? 'block' : 'none'
  const pathWrap = document.getElementById('install-localpath-wrap')
  if (pathWrap) pathWrap.style.display = 'block'
  const confirmBtn = document.getElementById('install-confirm')
  if (confirmBtn) confirmBtn.textContent = t('install.download')
  ensureInstallLocalPaths()
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
  // No-modpack: siempre descarga local (el usuario ya eligió "Descargar local").
  const destination = isModpack ? installModpackDestination : 'downloads'
  const isModpackNewInstance = isModpack && destination === 'instance'
  const btn = document.getElementById('install-confirm')
  btn.disabled = true
  btn.textContent = destination === 'downloads' ? t('install.downloading') : t('install.installing')
  setInstallNote(t('install.installing'))

  const result = await window.kindyrAPI.modrinth.install({
    project: installProject,
    installKind: getInstallKind(installProject),
    versionId: installVersionId,
    gameVersion: isModpack
      ? (selectedVersionData?.game_versions?.[0] || selectedVersionData?.version_number || selectedVersion)
      : document.getElementById('install-game-version').value.trim(),
    loader: isModpack ? installModpackLoader : document.getElementById('install-loader').value,
    destination,
    downloadDir: isModpack ? getInstallModpackPath() : getInstallLocalPath(),
    instanceId: document.getElementById('install-instance')?.value || ''
  })

  btn.disabled = false
  if (isModpack) {
    btn.textContent = installModpackDestination === 'downloads' ? t('install.download') : t('install.install')
  } else {
    updateInstallDestination()
  }
  if (!result.ok) {
    setInstallNote(result.error)
    setStatus(result.error)
    return
  }

  await refreshLauncherInstances()
  if (isModpackNewInstance && result.instance && result.instance.id) {
    // El modpack crea instancia: preparación real (Java+MC) si está activada.
    await runEagerPrepare(result.instance.id, installProject.title || result.instance.name || 'Modpack')
    closeInstallModal()
    await new Promise(r => setTimeout(r, 200))
    openInstanceView(result.instance.id)
    return
  }
  setInstallNote(t('install.done', { path: result.path }))
  setStatus(destination === 'downloads' ? t('install.downloaded') : t('install.installedLauncher'))
}

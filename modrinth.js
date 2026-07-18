// Modrinth API integration (search, install, home discover)

// Load home discover scripts dynamically
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
          const icon = project.icon_url
            ? '<img src="' + escapeHtml(project.icon_url) + '" alt="">'
            : '<i class="fa-solid fa-cube"></i>'
          const categories = (project.display_categories || project.categories || []).slice(0, 3)
          const tags = [
            getProjectTypeLabel(project.project_type),
            ...categories,
            (project.latest_version ? project.latest_version : '')
          ].filter(Boolean).slice(0, 5)
          const encodedProject = escapeHtml(JSON.stringify(project))
          const encodedUrl = escapeHtml(JSON.stringify(getProjectUrl(project)))
          wrapper.className = 'project-card'
          wrapper.innerHTML =
            '<div class="project-icon">' + icon + '</div>' +
            '<div class="project-body">' +
              '<div class="project-title" title="' + escapeHtml(project.title) + '">' + escapeHtml(project.title) + '</div>' +
              '<div class="project-desc">' + escapeHtml(project.description || t('discover.noDescription')) + '</div>' +
              '<div class="project-stats">' +
                '<span class="project-tag"><i class="fa-solid fa-download"></i> ' + formatCompactNumber(project.downloads) + '</span>' +
                '<span class="project-tag"><i class="fa-solid fa-star"></i> ' + formatCompactNumber(project.follows) + '</span>' +
                tags.map(tag => '<span class="project-tag">' + escapeHtml(tag) + '</span>').join('') +
              '</div>' +
            '</div>' +
            '<div class="project-actions">' +
              '<button type="button" class="secondary-btn" onclick="openModrinthProject(' + encodedUrl + ')">' + escapeHtml(t('discover.view')) + '</button>' +
              '<button type="button" class="primary-btn" onclick="quickInstallLatestRelease(' + encodedProject + ', this)">' + escapeHtml(t('discover.install')) + '</button>' +
            '</div>'
          frag.appendChild(wrapper)
        }
        results.appendChild(frag)
        if (idx < projects.length) {
          // yield to event loop so renderer can breathe
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

      const result = await window.zotlinAPI.modrinth.search({
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
      homeDiscoverOffset = Math.max(0, Math.min(nextOffset, Math.max(0, homeDiscoverTotal - limit)))
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

      const result = await window.zotlinAPI.modrinth.installLatestRelease({
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

// Install modal functions
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

function setInstallModalMode(isModpack) {
  const standard = document.getElementById('install-standard-view')
  const modpack = document.getElementById('install-modpack-view')
  if (standard) standard.style.display = isModpack ? 'none' : 'block'
  if (modpack) modpack.style.display = isModpack ? 'block' : 'none'
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
  container.innerHTML = modpackLoaderDefs.map(loader => {
    const isCompatible = compatible.includes(loader.id)
    const isActive = installModpackLoader === loader.id
    if (!isCompatible) {
      return '<button type="button" class="loader-option blocked" disabled>' + loader.label + '<i class="fa-solid fa-xmark loader-block-icon" aria-hidden="true"></i></button>'
    }
    const onclick = canSwitch ? ' onclick="selectModpackLoader(&quot;' + loader.id + '&quot;)"' : ''
    const disabled = canSwitch ? '' : ' disabled'
    return '<button type="button" class="loader-option ' + (isActive ? 'active' : '') + '"' + onclick + disabled + '>' + loader.label + '</button>'
  }).join('')
}

function renderModpackVersions() {
  const list = document.getElementById('install-modpack-version-list')
  if (!list) return
  if (!installVersions.length) {
    list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.noModpackVersions')) + '</div>'
    const note = document.getElementById('install-note')
    if (note) note.textContent = t('install.noVersions')
    return
  }

  list.innerHTML = installVersions.map(version => {
    const gameVersions = (version.game_versions || []).slice(0, 4).join(', ')
    const loaders = (version.loaders || []).join(', ')
    return '<div class="install-version-item ' + (version.id === installVersionId ? 'active' : '') + '" onclick="selectModpackVersion(&quot;' + version.id + '&quot;)">' +
      '<span>' + escapeHtml(version.name || version.version_number) + '</span>' +
      '<span>' + escapeHtml(version.version_type + ' · ' + loaders + ' · ' + gameVersions) + '</span>' +
    '</div>'
  }).join('')
  const note = document.getElementById('install-note')
  if (note) note.textContent = t('install.availableVersions', { count: installVersions.length })
}

function selectModpackVersion(versionId) {
  installVersionId = versionId
  renderModpackVersions()
  renderModpackLoaders()
}

async function loadModpackInstallVersions() {
  if (!installProject) return
  const note = document.getElementById('install-note')
  if (note) note.textContent = t('install.loadingModpackVersions')
  const list = document.getElementById('install-modpack-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.loadingVersions')) + '</div>'

  const result = await window.zotlinAPI.modrinth.versions({
    projectId: installProject.project_id || installProject.slug,
    loader: 'any'
  })

  if (!result.ok) {
    installVersions = []
    installVersionId = ''
    if (note) note.textContent = result.error
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
  const note = document.getElementById('install-note')
  if (note) note.textContent = isModpack ? t('install.loadingModpackVersions') : t('install.searchingCompatible')
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

  const gameVersion = document.getElementById('install-game-version')
  if (gameVersion) gameVersion.value = selectedVersion
  const loader = document.getElementById('install-loader')
  if (loader) loader.value = getDefaultLoader(project)
  const destination = document.getElementById('install-destination')
  if (destination) destination.value = 'downloads'
  const list = document.getElementById('install-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.loadingVersions')) + '</div>'
  updateInstallDestination()
  document.getElementById('install-modal').classList.add('active')
  loadInstallVersions()
}

function closeInstallModal(event) {
  if (event && event.target.id !== 'install-modal') return
  document.getElementById('install-modal').classList.remove('active')
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
  const note = document.getElementById('install-note')
  if (note) note.textContent = t('install.checkingCompatibility')
  const list = document.getElementById('install-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.searchingCompatible')) + '</div>'

  const result = await window.zotlinAPI.modrinth.versions({
    projectId: installProject.project_id || installProject.slug,
    gameVersion,
    loader
  })

  if (!result.ok) {
    installVersions = []
    installVersionId = ''
    if (note) note.textContent = result.error
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
    const note = document.getElementById('install-note')
    if (note) note.textContent = t('install.noCompatibleNote')
    return
  }

  list.innerHTML = installVersions.slice(0, 30).map(version => {
    const loaders = (version.loaders || []).join(', ')
    const gameVersions = (version.game_versions || []).slice(0, 4).join(', ')
    return '<div class="install-version-item ' + (version.id === installVersionId ? 'active' : '') + '" onclick="selectInstallVersion(&quot;' + version.id + '&quot;)">' +
      '<span>' + escapeHtml(version.name || version.version_number) + '</span>' +
      '<span>' + escapeHtml(version.version_type + ' · ' + loaders + ' · ' + gameVersions) + '</span>' +
    '</div>'
  }).join('')
  const note = document.getElementById('install-note')
  if (note) note.textContent = t('install.compatibleFound', { count: installVersions.length })
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
  const btn = document.getElementById('install-confirm')
  btn.disabled = true
  btn.textContent = destination === 'downloads' ? t('install.downloading') : t('install.installing')
  const note = document.getElementById('install-note')
  if (note) note.textContent = t('install.working')

  const result = await window.zotlinAPI.modrinth.install({
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
    if (note) note.textContent = result.error
    setStatus(result.error)
    return
  }

  await refreshLauncherInstances()
  if (note) note.textContent = t('install.done', { path: result.path })
  setStatus(destination === 'downloads' ? t('install.downloaded') : t('install.installedLauncher'))
}

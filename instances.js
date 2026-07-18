// Instance management (create, list, details, export)

let modsExpanded = false

// Instance detail view functions
function getInstanceLoaderLabel(loader) {
  if (!loader || loader === 'vanilla') return 'Vanilla'
  return loader.charAt(0).toUpperCase() + loader.slice(1)
}

function getSelectedInstanceMeta() {
  return launcherInstances.find(instance => instance.id === selectedInstance) || {
    id: selectedInstance,
    version: selectedVersion,
    loader: selectedInstance.startsWith('vanilla-') ? 'vanilla' : 'minecraft'
  }
}

function updateSelectedInstanceHero() {
  const instance = launcherInstances.find(item => item.id === selectedInstance)
  const displayName = instance ? instance.name : ('Minecraft ' + selectedVersion)
  document.querySelectorAll('#selected-version').forEach(el => {
    el.textContent = displayName
  })
  const heroDetail = document.getElementById('instance-hero-detail')
  if (heroDetail) {
    heroDetail.textContent = instance
      ? (instance.loader || 'vanilla') + ' · ' + instance.version + ' · Java Edition'
      : 'Release · Java Edition'
  }
}

function syncRecentCardsSelection() {
  document.querySelectorAll('#recent-instances-grid .ver-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.instance === selectedInstance)
  })
}

function applySelectedInstance(rowOrId) {
  if (typeof rowOrId === 'string') {
    selectedInstance = rowOrId
    const instance = launcherInstances.find(item => item.id === selectedInstance)
    if (instance) {
      selectedVersion = instance.version
    }
  } else {
    selectedInstance = rowOrId.dataset.instance
    const instance = launcherInstances.find(item => item.id === selectedInstance)
    if (instance) {
      selectedVersion = instance.version
    } else {
      selectedVersion = rowOrId.dataset.version
    }
  }
  updateSelectedInstanceHero()
  recordRecentInstance(selectedInstance)
  syncRecentCardsSelection()
  syncSelectedVersion()
}

function syncSelectedVersion() {
  document.querySelectorAll('.version-row').forEach(row => {
    const isSelected = row.dataset.instance === selectedInstance
    const instance = launcherInstances.find(item => item.id === row.dataset.instance)
    row.classList.toggle('selected', isSelected)
    const badge = row.querySelector('.version-badge')
    if (badge) {
      badge.textContent = isSelected
        ? t('instances.current')
        : (instance?.loader || 'Release')
    }
  })
}

function loadInstanceDetailContent() {
  const instance = launcherInstances.find(item => item.id === selectedInstance)
  const displayName = instance ? instance.name : ('Minecraft ' + selectedVersion)
  const loaderLabel = instance?.loader || 'vanilla'
  const versionLabel = instance?.version || selectedVersion
  const detailView = document.getElementById('instance-detail-view')
  detailView.innerHTML = `
    <div class="hero">
      <div>
        <div class="hero-label">${escapeHtml(t('instance.label'))}</div>
        <div class="hero-version" id="selected-version">${displayName}</div>
<div class="hero-detail" id="instance-hero-detail">${loaderLabel} · ${versionLabel} · Java Edition</div>
      </div>
      <div class="hero-actions">
        <button type="button" class="icon-action" id="open-folder-btn" title="${escapeHtml(t('instance.openInstanceFolder'))}" aria-label="${escapeHtml(t('instance.openInstanceFolder'))}">
          <i class="fa-regular fa-folder-open"></i>
        </button>
        <button type="button" class="icon-action" id="export-mrpack-btn" title="${escapeHtml(t('instance.exportMrpack'))}" aria-label="${escapeHtml(t('instance.exportMrpack'))}">
          <i class="fa-solid fa-file-export"></i>
        </button>
        <button type="button" class="play-btn" id="play-btn">
          <i class="fa-solid fa-play"></i> ${escapeHtml(t('instance.play'))}
        </button>
      </div>
    </div>

    <div class="instance-manager">
      <div class="instance-manager-head">
        <div class="instance-manager-title">
          <strong id="instance-manager-name">${displayName}</strong>
<span id="instance-manager-meta">${loaderLabel} · ${versionLabel} · ${escapeHtml(t('instance.isolatedFolder'))}</span>
        </div>
        <div class="instance-manager-actions">
          <button type="button" class="primary-btn instance-discover-btn" id="instance-discover-btn" aria-expanded="false" aria-controls="home-discover-wrap">
            <i class="fa-solid fa-compass" aria-hidden="true"></i> ${escapeHtml(t('instance.discover'))}
          </button>
          <button type="button" class="secondary-btn" onclick="refreshInstancePanel()"><i class="fa-solid fa-rotate"></i> ${escapeHtml(t('instance.refresh'))}</button>
          <button type="button" class="secondary-btn" id="toggle-mods-btn" onclick="toggleModsList()"><i class="fa-solid fa-chevron-down" id="toggle-mods-icon"></i> ${escapeHtml(t('instance.showMore'))}</button>
        </div>
      </div>
      <div class="home-discover-wrap" id="home-discover-wrap">
        <div class="home-discover-inner">
          <div class="home-discover-panel" id="home-discover-panel">
            <div class="home-discover-tabs" id="home-discover-tabs"></div>
            <div class="home-discover-search-row">
              <div class="home-discover-search-wrap">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input class="home-discover-search" id="home-discover-query" placeholder="${escapeHtml(t('home.search.mods'))}" oninput="scheduleHomeDiscoverSearch()">
              </div>
            </div>
            <div class="home-discover-filters">
              <select class="discover-select" id="home-discover-sort" onchange="searchHomeDiscover(true)" aria-label="${escapeHtml(t('home.sort.label'))}">
                <option value="relevance">${escapeHtml(t('home.sort.relevance'))}</option>
                <option value="downloads">${escapeHtml(t('home.sort.downloads'))}</option>
                <option value="follows">${escapeHtml(t('home.sort.followers'))}</option>
                <option value="updated">${escapeHtml(t('home.sort.updated'))}</option>
                <option value="newest">${escapeHtml(t('home.sort.newest'))}</option>
              </select>
              <select class="discover-select" id="home-discover-limit" onchange="searchHomeDiscover(true)" aria-label="${escapeHtml(t('home.limit.label'))}">
                <option value="12">${escapeHtml(t('home.limit', { count: 12 }))}</option>
                <option value="18" selected>${escapeHtml(t('home.limit', { count: 18 }))}</option>
                <option value="24">${escapeHtml(t('home.limit', { count: 24 }))}</option>
              </select>
              <div class="home-discover-badges">
                <span class="home-discover-badge" id="home-discover-version-badge"><i class="fa-solid fa-cube"></i> <span id="home-discover-version">1.21.4</span></span>
                <span class="home-discover-badge" id="home-discover-loader-badge"><i class="fa-solid fa-gears"></i> <span id="home-discover-loader">Vanilla</span></span>
              </div>
              <div class="home-discover-pagination" id="home-discover-pagination"></div>
            </div>
            <div class="home-discover-results-grid" id="home-discover-results"></div>
          </div>
        </div>
      </div>
      <div class="tab-row">
<button type="button" class="tab-btn active" id="instance-tab-content-btn" onclick="switchInstanceTab('content')"><i class="fa-solid fa-cubes"></i> ${escapeHtml(t('instance.content'))}</button>
<button type="button" class="tab-btn" id="instance-tab-files-btn" onclick="switchInstanceTab('files')"><i class="fa-regular fa-folder-open"></i> ${escapeHtml(t('instance.folders'))}</button>
<button type="button" class="tab-btn" id="instance-tab-worlds-btn" onclick="switchInstanceTab('worlds')"><i class="fa-solid fa-earth-americas"></i> ${escapeHtml(t('instance.worlds'))}</button>
<button type="button" class="tab-btn" id="instance-tab-logs-btn" onclick="switchInstanceTab('logs')"><i class="fa-regular fa-rectangle-list"></i> Logs</button>
      </div>
      <div class="instance-tab active" id="instance-tab-content">
        <div class="instance-actions">
<button type="button" class="folder-btn" onclick="openInstanceTarget('mods')"><i class="fa-regular fa-folder-open"></i> ${escapeHtml(t('instance.openMods'))}</button>
<button type="button" class="folder-btn" onclick="openInstanceTarget('resourcepacks')"><i class="fa-regular fa-folder-open"></i> Resource packs</button>
<button type="button" class="folder-btn" onclick="openInstanceTarget('shaderpacks')"><i class="fa-regular fa-folder-open"></i> Shaders</button>
        </div>
        <div id="instance-content-list" class="content-table"></div>
      </div>
      <div class="instance-tab" id="instance-tab-files">
        <div class="instance-actions" id="instance-folder-actions"></div>
      </div>
      <div class="instance-tab" id="instance-tab-worlds">
        <div id="instance-worlds-list" class="content-table"></div>
      </div>
      <div class="instance-tab" id="instance-tab-logs">
        <div class="instance-actions">
          <button type="button" class="folder-btn"><i class="fa-regular fa-folder-open"></i> ${escapeHtml(t('instance.minecraftLogs'))}</button>
          <button type="button" class="folder-btn"><i class="fa-regular fa-folder-open"></i> ${escapeHtml(t('instance.launcherLogs'))}</button>
        </div>
        <div id="instance-logs-list" class="content-table"></div>
      </div>
    </div>

    <div class="console-panel" id="console-panel">
      <div class="console-head">
        <span>${escapeHtml(t('instance.console'))}</span>
        <div class="console-actions">
          <button type="button" class="console-btn">${escapeHtml(t('instance.clear'))}</button>
        </div>
      </div>
      <div class="console-output" id="console-output"></div>
    </div>
  `
  
  // Attach event listeners after HTML injection
  const playBtn = document.getElementById('play-btn')
  const openFolderBtn = document.getElementById('open-folder-btn')
  const refreshBtn = document.querySelector('.instance-manager-actions .secondary-btn')
  const tabBtns = document.querySelectorAll('.tab-btn')
  const consoleBtn = document.querySelector('.console-btn')

  // playBtn event listener removed - using btn.onclick instead
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', openSelectedInstanceFolder)
  }
  const exportBtn = document.getElementById('export-mrpack-btn')
  if (exportBtn) exportBtn.addEventListener('click', exportMrpack)
  
  // discoverBtn listener will be attached after loadHomeDiscoverScripts()
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshInstancePanel)
  }
  tabBtns.forEach(btn => {
    const tabName = btn.id.replace('instance-tab-', '').replace('-btn', '')
    btn.addEventListener('click', () => showInstanceTab(tabName))
  })
  // Attach folder button listeners with specific targets
  const modsBtn = document.querySelector('.folder-btn:nth-of-type(1)')
  const resourcepacksBtn = document.querySelector('.folder-btn:nth-of-type(2)')
  const shaderpacksBtn = document.querySelector('.folder-btn:nth-of-type(3)')
  const logsBtn = document.querySelector('#instance-tab-logs .folder-btn:nth-of-type(1)')
  const launcherLogsBtn = document.querySelector('#instance-tab-logs .folder-btn:nth-of-type(2)')
  
  if (modsBtn) modsBtn.addEventListener('click', () => openInstanceTarget('mods'))
  if (resourcepacksBtn) resourcepacksBtn.addEventListener('click', () => openInstanceTarget('resourcepacks'))
  if (shaderpacksBtn) shaderpacksBtn.addEventListener('click', () => openInstanceTarget('shaderpacks'))
  if (logsBtn) logsBtn.addEventListener('click', () => openInstanceTarget('logs'))
  if (launcherLogsBtn) launcherLogsBtn.addEventListener('click', () => openInstanceTarget('launcherLogs'))
  if (consoleBtn) {
    consoleBtn.addEventListener('click', clearConsole)
  }
  
  updateSelectedInstanceHero()
  refreshInstancePanel()
  loadHomeDiscoverScripts()
  
  // Attach discoverBtn listener after loadHomeDiscoverScripts()
  const discoverBtn = document.getElementById('instance-discover-btn')
  if (discoverBtn) {
    discoverBtn.addEventListener('click', toggleHomeDiscoverPanel)
  }
}

async function openInstanceView(rowOrId) {
  applySelectedInstance(rowOrId)
  const instance = launcherInstances.find(item => item.id === selectedInstance)
  
  // Actualizar currentSection para que no sea 'home' cuando estás en vista de instancia
  currentSection = 'instance-detail'
  
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'))
  
  const detailView = document.getElementById('instance-detail-view')
  detailView.classList.add('active')
  
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'))
  
  setTopbarMode('instance', instance?.name || 'Instancia')
  setStatus(t('instance.selectedStatus', { name: instance?.name || selectedVersion }))
  
  if (!loadedSections.has('instance-detail')) {
    loadInstanceDetailContent()
    loadedSections.add('instance-detail')
    // Esperar a que el HTML esté listo
    await new Promise(resolve => setTimeout(resolve, 300))
  } else {
    await refreshInstancePanel()
  }
  updateSelectedInstanceHero()
  
  updateHomeDiscoverContext()
  
  // Check if Minecraft is running and update button accordingly
  try {
    window.zotlinAPI.launcher.status().then(result => {
      // Resetear botón primero
      resetPlayBtn()
      
      // Luego verificar si esta instancia específica está corriendo
      if (result.running && result.instanceId === selectedInstance) {
        const btn = document.getElementById('play-btn')
        if (btn) {
          btn.disabled = false
          btn.innerHTML = '<i class="fa-solid fa-stop"></i> Cerrar Minecraft'
          btn.classList.add('danger')
          btn.onclick = function(e) {
            cancelGame(e)
          }
          setStatus(t('app.playing'))
        }
      }
    }).catch(err => {
      console.error('Error en status check:', err)
    })
  } catch (err) {
    console.error('Error al llamar status():', err)
  }
}

function switchInstanceTab(tab) {
  document.querySelectorAll('.instance-tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('instance-tab-' + tab).classList.add('active')
  document.getElementById('instance-tab-' + tab + '-btn').classList.add('active')
}

function openInstanceTarget(target) {
  if (window.zotlinAPI?.instances?.openTarget) {
    window.zotlinAPI.instances.openTarget(selectedInstance, target)
  }
}

function openInstanceFromList(event, button) {
  event.stopPropagation()
  openInstanceView(button.closest('.version-row'))
}

async function openSelectedInstanceFolder() {
  const result = await window.zotlinAPI.instances.openFolder(selectedInstance)
  setStatus(result.ok ? t('instance.folderOpened') : result.error)
}

function toggleModsList() {
  const list = document.getElementById('instance-content-list')
  const btn = document.getElementById('toggle-mods-btn')
  if (!list) return
  const rows = list.querySelectorAll('.content-row')
  if (rows.length <= 5) {
    if (btn) btn.style.display = 'none'
    return
  }
  if (btn) btn.style.display = ''
  modsExpanded = !modsExpanded
  const limit = 5
  rows.forEach((row, i) => {
    if (i >= limit) row.style.display = modsExpanded ? '' : 'none'
  })
  const icon = document.getElementById('toggle-mods-icon')
  if (icon) {
    icon.className = modsExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'
  }
  if (btn) {
    btn.innerHTML = `<i class="${modsExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'}" id="toggle-mods-icon"></i> ${modsExpanded ? t('instance.showLess') : t('instance.showMore')}`
  }
}

async function exportMrpack() {
  if (!window.zotlinAPI?.instances?.exportMrpack) {
    setStatus(t('instance.exportError'))
    return
  }
  setStatus(t('instance.exporting'))
  const result = await window.zotlinAPI.instances.exportMrpack(selectedInstance)
  if (result.ok) {
    setStatus(t('instance.exportSuccess', { name: result.name }))
  } else if (result.cancelled) {
    setStatus(t('app.ready'))
  } else {
    setStatus(result.error || t('instance.exportError'))
  }
}

async function openInstanceFolder(event, button) {
  event.stopPropagation()
  const row = button.closest('.version-row')
  const result = await window.zotlinAPI.instances.openFolder(row.dataset.instance)
  setStatus(result.ok ? t('instance.folderOpened') : result.error)
}

function showInstanceTab(tabName) {
  activeInstanceTab = tabName
  requestAnimationFrame(() => {
    const tabs = document.querySelectorAll('.instance-tab')
    const btns = document.querySelectorAll('.tab-btn')
    tabs.forEach(tab => tab.classList.remove('active'))
    btns.forEach(btn => btn.classList.remove('active'))
    const targetTab = document.getElementById('instance-tab-' + tabName)
    const targetBtn = document.getElementById('instance-tab-' + tabName + '-btn')
    if (targetTab) targetTab.classList.add('active')
    if (targetBtn) targetBtn.classList.add('active')
  })
}

function renderEmpty(targetId, message) {
  const target = document.getElementById(targetId)
  target.className = 'muted-empty'
  target.textContent = message
}

async function refreshInstancePanel() {
  const result = await window.zotlinAPI.instances.getDetails(selectedInstance)
  if (!result.ok) {
    setStatus(result.error)
    return
  }

  const instance = result.instance
  requestAnimationFrame(() => {
    const nameEl = document.getElementById('instance-manager-name')
    const metaEl = document.getElementById('instance-manager-meta')
    const heroDetail = document.getElementById('instance-hero-detail')
    if (nameEl) nameEl.textContent = instance.name
    if (metaEl) metaEl.textContent = instance.loader + ' · ' + instance.version + ' · ' + t('instance.isolatedFolder')
    if (heroDetail) {
      heroDetail.textContent = (instance.loader || 'vanilla') + ' · ' + instance.version + ' · Java Edition'
    }
  })
  renderInstanceContent(result.mods)
  modsExpanded = false
  toggleModsList()
  renderInstanceWorlds(result.worlds)
  renderInstanceLogs(result.logs)
  renderInstanceFolders()
}

function renderInstanceContent(mods) {
  const list = document.getElementById('instance-content-list')
  if (!list) return
  list.className = 'content-table'
  if (!mods.length) {
    renderEmpty('instance-content-list', t('instance.emptyMods'))
    return
  }

  const fragment = document.createDocumentFragment()
  mods.forEach(mod => {
    const disabled = mod.name.endsWith('.disabled')
    const status = disabled ? t('instance.disabled') : t('instance.active')
    const action = disabled ? t('instance.enable') : t('instance.disable')
    const encodedName = JSON.stringify(mod.name)
    const div = document.createElement('div')
    div.className = 'content-row'
    div.innerHTML = '<div><strong title="' + escapeHtml(mod.name) + '">' + escapeHtml(mod.name) + '</strong><span>' + formatFileSize(mod.size) + '</span></div>' +
      '<span class="pill ' + (disabled ? 'disabled' : '') + '">' + status + '</span>' +
      '<button type="button" class="small-action" onclick="toggleInstanceMod(' + escapeHtml(encodedName) + ')">' + action + '</button>'
    fragment.appendChild(div)
  })
  list.innerHTML = ''
  list.appendChild(fragment)
}

function renderInstanceWorlds(worlds) {
  const list = document.getElementById('instance-worlds-list')
  if (!list) return
  list.className = 'content-table'
  if (!worlds.length) {
    renderEmpty('instance-worlds-list', t('instance.emptyWorlds'))
    return
  }

  const fragment = document.createDocumentFragment()
  worlds.forEach(world => {
    const div = document.createElement('div')
    div.className = 'content-row'
    div.innerHTML = '<div><strong title="' + escapeHtml(world.name) + '">' + escapeHtml(world.name) + '</strong><span>' + escapeHtml(t('instance.updatedAt', { date: new Date(world.updatedAt).toLocaleString() })) + '</span></div><span class="pill">' + escapeHtml(t('instance.world')) + '</span><button type="button" class="small-action" onclick="openInstanceTarget(&quot;saves&quot;)">' + escapeHtml(t('instances.open')) + '</button></div>'
    fragment.appendChild(div)
  })
  list.innerHTML = ''
  list.appendChild(fragment)
}

function renderInstanceLogs(logs) {
  const list = document.getElementById('instance-logs-list')
  if (!list) return
  list.className = 'content-table'
  if (!logs.length) {
    renderEmpty('instance-logs-list', t('instance.emptyLogs'))
    return
  }

  const fragment = document.createDocumentFragment()
  logs.forEach(logFile => {
    const div = document.createElement('div')
    div.className = 'content-row'
    div.innerHTML = '<div><strong title="' + escapeHtml(logFile.name) + '">' + escapeHtml(logFile.name) + '</strong><span>' + formatFileSize(logFile.size) + ' · ' + new Date(logFile.updatedAt).toLocaleString() + '</span></div><span class="pill">Log</span><button type="button" class="small-action" onclick="openInstanceTarget(&quot;launcherLogs&quot;)">' + escapeHtml(t('instances.open')) + '</button></div>'
    fragment.appendChild(div)
  })
  list.innerHTML = ''
  list.appendChild(fragment)
}

function renderInstanceFolders() {
  const folders = [
    ['root', t('instance.folder.root')],
    ['minecraft', 'Minecraft root'],
    ['mods', 'Mods'],
    ['plugins', 'Plugins'],
    ['datapacks', 'Datapacks'],
    ['resourcepacks', 'Resource packs'],
    ['shaderpacks', 'Shaders'],
    ['saves', t('instance.folder.saves')],
    ['logs', 'Logs MC'],
    ['launcherLogs', 'Logs launcher']
  ]
  const actionsEl = document.getElementById('instance-folder-actions')
  if (actionsEl) {
    const fragment = document.createDocumentFragment()
    folders.forEach(([target, label]) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'folder-btn'
      btn.onclick = () => openInstanceTarget(target)
      btn.innerHTML = '<i class="fa-regular fa-folder-open"></i> ' + escapeHtml(label)
      fragment.appendChild(btn)
    })
    actionsEl.innerHTML = ''
    actionsEl.appendChild(fragment)
  }
}

function refreshInstancePanelSoon(times = 1) {
  refreshInstancePanel()
  if (times <= 1) return
  setTimeout(() => refreshInstancePanelSoon(times - 1), 900)
}

async function openInstanceTarget(target) {
  const result = await window.zotlinAPI.instances.openTarget(selectedInstance, target)
  setStatus(result.ok ? t('instance.folderOpen') : result.error)
  if (result.ok) refreshInstancePanelSoon(6)
}

async function toggleInstanceMod(fileName) {
  const result = await window.zotlinAPI.instances.toggleMod(selectedInstance, fileName)
  setStatus(result.ok ? t('instance.modUpdated') : result.error)
  if (result.ok) refreshInstancePanelSoon(2)
}

// Create instance modal functions
let createLoader = 'vanilla'
let createVersions = []
let createSelectedVersion = null
let createVersionTimer = null
const createLoaders = [
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'quilt', label: 'Quilt' }
]

function renderCreateLoaders() {
  const row = document.getElementById('create-loader-row')
  if (row) {
    row.innerHTML = createLoaders.map(loader => (
      '<button type="button" class="loader-option ' + (loader.id === createLoader ? 'active' : '') + '" onclick="selectCreateLoader(&quot;' + loader.id + '&quot;)">' + loader.label + '</button>'
    )).join('')
  }
}

function selectCreateLoader(loader) {
  createLoader = loader
  createSelectedVersion = null
  renderCreateLoaders()
  loadCreateVersions()
}

function openCreateInstanceModal() {
  createLoader = 'vanilla'
  createSelectedVersion = null
  const snapshots = document.getElementById('create-snapshots')
  if (snapshots) snapshots.checked = false
  const search = document.getElementById('create-version-search')
  if (search) search.value = ''
  const note = document.getElementById('create-instance-note')
  if (note) note.textContent = t('create.loadingVersions')
  const list = document.getElementById('create-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('create.loadingVersions')) + '</div>'
  renderCreateLoaders()
  document.getElementById('create-instance-modal').classList.add('active')
  loadCreateVersions()
}

function closeCreateInstanceModal(event) {
  if (event && event.target.id !== 'create-instance-modal') return
  document.getElementById('create-instance-modal').classList.remove('active')
}

function scheduleCreateVersionLoad() {
  clearTimeout(createVersionTimer)
  createVersionTimer = setTimeout(loadCreateVersions, 250)
}

async function loadCreateVersions() {
  const includeSnapshots = document.getElementById('create-snapshots').checked
  const query = document.getElementById('create-version-search').value
  const note = document.getElementById('create-instance-note')
  if (note) note.textContent = t('install.searchingCompatible')
  const list = document.getElementById('create-version-list')
  if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.searchingCompatible')) + '</div>'

  const result = await window.zotlinAPI.instances.versions({
    loader: createLoader,
    includeSnapshots,
    query
  })

  if (!result.ok) {
    createVersions = []
    createSelectedVersion = null
    if (note) note.textContent = result.error
    if (list) list.innerHTML = '<div class="discover-message">' + escapeHtml(result.error) + '</div>'
    return
  }

  createVersions = result.versions || []
  createSelectedVersion = createVersions[0] || null
  renderCreateVersions()
}

function renderCreateVersions() {
  const list = document.getElementById('create-version-list')
  if (!list) return
  if (!createVersions.length) {
    list.innerHTML = '<div class="discover-message">' + escapeHtml(t('install.noCompatible')) + '</div>'
    const note = document.getElementById('create-instance-note')
    if (note) note.textContent = t('install.noCompatibleNote')
    return
  }

  list.innerHTML = createVersions.map(version => (
    '<div class="version-picker-item ' + (createSelectedVersion && createSelectedVersion.id === version.id ? 'active' : '') + '" onclick="selectCreateVersion(&quot;' + version.id + '&quot;)">' +
      '<strong>' + escapeHtml(version.id) + '</strong>' +
      '<span class="version-kind ' + (version.type === 'snapshot' ? 'snapshot' : '') + '">' + escapeHtml(version.type) + '</span>' +
      '<span>' + (version.loaderVersion ? escapeHtml(version.loaderVersion) : '<i class="fa-solid fa-check"></i>') + '</span>' +
    '</div>'
  )).join('')
  const note = document.getElementById('create-instance-note')
  if (note) note.textContent = t('create.compatibleVersions', { count: createVersions.length })
}

function selectCreateVersion(versionId) {
  createSelectedVersion = createVersions.find(version => version.id === versionId) || null
  renderCreateVersions()
}

async function createSelectedInstance() {
  if (!createSelectedVersion) {
    setStatus(t('create.pickVersion'))
    return
  }

  const btn = document.getElementById('create-instance-confirm')
  btn.disabled = true
  btn.textContent = t('create.creating')
  const result = await window.zotlinAPI.instances.create({
    version: createSelectedVersion.id,
    versionType: createSelectedVersion.type,
    loader: createLoader,
    loaderVersion: createSelectedVersion.loaderVersion
  })
  btn.disabled = false
  btn.textContent = t('create.create')

  if (!result.ok) {
    const note = document.getElementById('create-instance-note')
    if (note) note.textContent = result.error
    setStatus(result.error)
    return
  }

  await refreshLauncherInstances()
  closeCreateInstanceModal()
  openInstanceView(result.instance.id)
  setStatus(t('create.created', { name: result.instance.name }))
}

// Launcher instances management
async function refreshLauncherInstances() {
  if (!window.zotlinAPI?.instances?.list) return
  launcherInstances = await window.zotlinAPI.instances.list()
  pruneRecentInstanceIds()
  if (typeof renderLauncherInstancesList === 'function') renderLauncherInstancesList()
  if (typeof renderRecentInstances === 'function') renderRecentInstances()
  const select = document.getElementById('install-instance')
  if (!select) return
  select.innerHTML = launcherInstances.map(instance => (
    '<option value="' + escapeHtml(instance.id) + '">' + escapeHtml(instance.name + ' · ' + instance.version + ' · ' + instance.loader) + '</option>'
  )).join('')
  select.value = selectedInstance
}

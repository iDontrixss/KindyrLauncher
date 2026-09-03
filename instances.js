// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

let modsExpanded = false
let launcherInstancesRefreshRequest = null
const instanceRefreshTimers = new Set()
let instanceViewGeneration = 0

function disposeInstanceDetailView() {
  instanceViewGeneration++
  for (const timer of instanceRefreshTimers) clearTimeout(timer)
  instanceRefreshTimers.clear()
  if (typeof clearConsole === 'function') clearConsole()
  if (typeof consolePanelVisible !== 'undefined') consolePanelVisible = false
  modsExpanded = false
  const detailView = document.getElementById('instance-detail-view')
  if (detailView) detailView.replaceChildren()
  loadedSections.delete('instance-detail')
}

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
  const loader = instance?.loader || 'vanilla'
  const version = instance?.version || selectedVersion
  const loaderChip = document.getElementById('instance-hero-loader')
  const versionChip = document.getElementById('instance-hero-version')
  const statLoader = document.getElementById('instance-stat-loader')
  const statVersion = document.getElementById('instance-stat-version')
  const heroIcon = document.getElementById('instance-hero-icon')
  if (loaderChip) loaderChip.textContent = getInstanceLoaderLabel(loader)
  if (versionChip) versionChip.textContent = version
  if (statLoader) statLoader.textContent = getInstanceLoaderLabel(loader)
  if (statVersion) statVersion.textContent = version
  if (heroIcon) heroIcon.textContent = String(displayName || 'M').charAt(0).toUpperCase()
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
  const initial = String(displayName || 'M').charAt(0).toUpperCase()
  const detailView = document.getElementById('instance-detail-view')
  detailView.innerHTML = `
    <section class="instance-hero">
      <div class="instance-hero-identity">
        <div class="instance-hero-icon" id="instance-hero-icon" aria-hidden="true">${escapeHtml(initial)}</div>
        <div class="instance-hero-copy">
          <div class="hero-label">${escapeHtml(t('instance.label'))}</div>
          <div class="hero-version" id="selected-version">${escapeHtml(displayName)}</div>
          <div class="hero-detail" id="instance-hero-detail">${escapeHtml(loaderLabel)} · ${escapeHtml(versionLabel)} · Java Edition</div>
          <div class="instance-hero-chips">
            <span><i class="fa-solid fa-puzzle-piece"></i><b id="instance-hero-loader">${escapeHtml(getInstanceLoaderLabel(loaderLabel))}</b></span>
            <span><i class="fa-solid fa-cube"></i><b id="instance-hero-version">${escapeHtml(versionLabel)}</b></span>
            <span><i class="fa-solid fa-box-archive"></i>${escapeHtml(t('instance.isolatedFolder'))}</span>
          </div>
        </div>
      </div>
      <div class="instance-hero-actions">
        <button type="button" class="instance-tool-btn" id="open-folder-btn" title="${escapeHtml(t('instance.openInstanceFolder'))}" aria-label="${escapeHtml(t('instance.openInstanceFolder'))}">
          <i class="fa-regular fa-folder-open"></i>
        </button>
        <button type="button" class="instance-tool-btn" id="export-mrpack-btn" title="${escapeHtml(t('instance.exportMrpack'))}" aria-label="${escapeHtml(t('instance.exportMrpack'))}">
          <i class="fa-solid fa-file-export"></i>
        </button>
        <button type="button" class="play-btn" id="play-btn">
          <i class="fa-solid fa-play"></i> ${escapeHtml(t('instance.play'))}
        </button>
      </div>
    </section>

    <div class="instance-detail-stats" aria-label="${escapeHtml(t('instance.controlCenter'))}">
      <div class="instance-detail-stat"><i class="fa-solid fa-gears"></i><span>${escapeHtml(t('instance.loaderLabel'))}</span><strong id="instance-stat-loader">${escapeHtml(getInstanceLoaderLabel(loaderLabel))}</strong></div>
      <div class="instance-detail-stat"><i class="fa-solid fa-code-branch"></i><span>${escapeHtml(t('instance.versionLabel'))}</span><strong id="instance-stat-version">${escapeHtml(versionLabel)}</strong></div>
      <div class="instance-detail-stat"><i class="fa-solid fa-cubes"></i><span>${escapeHtml(t('instance.modsCount'))}</span><strong id="instance-stat-mods">0</strong></div>
      <div class="instance-detail-stat instance-detail-stat-accent"><i class="fa-solid fa-earth-americas"></i><span>${escapeHtml(t('instance.worldsCount'))}</span><strong id="instance-stat-worlds">0</strong></div>
    </div>

    <div class="instance-manager">
      <div class="instance-manager-head">
        <div class="instance-manager-title">
          <span class="instance-manager-kicker">${escapeHtml(t('instance.controlCenter'))}</span>
          <strong id="instance-manager-name">${escapeHtml(displayName)}</strong>
          <span id="instance-manager-meta">${escapeHtml(t('instance.managerHint'))}</span>
        </div>
        <div class="instance-manager-actions">
          <button type="button" class="primary-btn instance-discover-btn" id="instance-discover-btn" onclick="openDiscoverForInstance()">
            <i class="fa-solid fa-compass" aria-hidden="true"></i> ${escapeHtml(t('instance.discover'))}
          </button>
          <button type="button" class="secondary-btn" onclick="refreshInstancePanel()"><i class="fa-solid fa-rotate"></i> ${escapeHtml(t('instance.refresh'))}</button>
          <button type="button" class="secondary-btn" id="toggle-mods-btn" onclick="toggleModsList()"><i class="fa-solid fa-chevron-down" id="toggle-mods-icon"></i> ${escapeHtml(t('instance.showMore'))}</button>
        </div>
      </div>
      <div class="tab-row">
        <button type="button" class="tab-btn active" id="instance-tab-content-btn" onclick="switchInstanceTab('content')"><i class="fa-solid fa-cubes"></i><span>${escapeHtml(t('instance.content'))}</span></button>
        <button type="button" class="tab-btn" id="instance-tab-files-btn" onclick="switchInstanceTab('files')"><i class="fa-regular fa-folder-open"></i><span>${escapeHtml(t('instance.folders'))}</span></button>
        <button type="button" class="tab-btn" id="instance-tab-worlds-btn" onclick="switchInstanceTab('worlds')"><i class="fa-solid fa-earth-americas"></i><span>${escapeHtml(t('instance.worlds'))}</span></button>
        <button type="button" class="tab-btn" id="instance-tab-logs-btn" onclick="switchInstanceTab('logs')"><i class="fa-regular fa-rectangle-list"></i><span>${escapeHtml(t('instance.logs'))}</span></button>
      </div>
      <div class="instance-tab active" id="instance-tab-content">
        <div class="instance-actions">
          <span class="instance-actions-label">${escapeHtml(t('instance.quickFolders'))}</span>
          <button type="button" class="folder-btn" onclick="openInstanceTarget('mods')"><i class="fa-solid fa-cubes"></i> ${escapeHtml(t('instance.openMods'))}</button>
          <button type="button" class="folder-btn" onclick="openInstanceTarget('resourcepacks')"><i class="fa-solid fa-palette"></i> Resource packs</button>
          <button type="button" class="folder-btn" onclick="openInstanceTarget('shaderpacks')"><i class="fa-solid fa-wand-magic-sparkles"></i> Shaders</button>
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

  const openFolderBtn = document.getElementById('open-folder-btn')
  const consoleBtn = document.querySelector('.console-btn')

  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', openSelectedInstanceFolder)
  }
  const exportBtn = document.getElementById('export-mrpack-btn')
  if (exportBtn) exportBtn.addEventListener('click', exportMrpack)

  const logsBtn = document.querySelector('#instance-tab-logs .folder-btn:nth-of-type(1)')
  const launcherLogsBtn = document.querySelector('#instance-tab-logs .folder-btn:nth-of-type(2)')
  if (logsBtn) logsBtn.addEventListener('click', () => openInstanceTarget('logs'))
  if (launcherLogsBtn) launcherLogsBtn.addEventListener('click', () => openInstanceTarget('launcherLogs'))
  if (consoleBtn) {
    consoleBtn.addEventListener('click', clearConsole)
  }
  
  updateSelectedInstanceHero()
  refreshInstancePanel()
}

async function openInstanceView(rowOrId) {
  applySelectedInstance(rowOrId)
  const instance = launcherInstances.find(item => item.id === selectedInstance)

  activateSectionView('instance-detail')
  setTopbarMode('instance', instance?.name || 'Instancia')
  setStatus(t('instance.selectedStatus', { name: instance?.name || selectedVersion }))

  if (!loadedSections.has('instance-detail')) {
    loadInstanceDetailContent()
    loadedSections.add('instance-detail')
  } else {
    await refreshInstancePanel()
  }
  updateSelectedInstanceHero()

  try {
    window.kindyrAPI.launcher.status().then(result => {
      resetPlayBtn()
      
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
  if (window.kindyrAPI?.instances?.openTarget) {
    window.kindyrAPI.instances.openTarget(selectedInstance, target)
  }
}

function openInstanceFromList(event, button) {
  event.stopPropagation()
  openInstanceView(button.closest('.version-row'))
}

async function openSelectedInstanceFolder() {
  const result = await window.kindyrAPI.instances.openFolder(selectedInstance)
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
  if (!window.kindyrAPI?.instances?.exportMrpack) {
    setStatus(t('instance.exportError'))
    return
  }
  setStatus(t('instance.exporting'))
  const result = await window.kindyrAPI.instances.exportMrpack(selectedInstance)
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
  const result = await window.kindyrAPI.instances.openFolder(row.dataset.instance)
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
  const generation = instanceViewGeneration
  const result = await window.kindyrAPI.instances.getDetails(selectedInstance)
  if (generation !== instanceViewGeneration || currentSection !== 'instance-detail') return
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
    if (metaEl) metaEl.textContent = t('instance.managerHint')
    if (heroDetail) {
      heroDetail.textContent = (instance.loader || 'vanilla') + ' · ' + instance.version + ' · Java Edition'
    }
    const statLoader = document.getElementById('instance-stat-loader')
    const statVersion = document.getElementById('instance-stat-version')
    const statMods = document.getElementById('instance-stat-mods')
    const statWorlds = document.getElementById('instance-stat-worlds')
    if (statLoader) statLoader.textContent = getInstanceLoaderLabel(instance.loader)
    if (statVersion) statVersion.textContent = instance.version
    if (statMods) statMods.textContent = result.mods.length
    if (statWorlds) statWorlds.textContent = result.worlds.length
  })
  const wasExpanded = modsExpanded
  renderInstanceContent(result.mods)
  modsExpanded = wasExpanded
  // Sincronizar estado sin forzar colapso
  const list = document.getElementById('instance-content-list')
  if (list) {
    const rows = list.querySelectorAll('.content-row')
    const limit = 5
    const shouldCollapse = !wasExpanded && rows.length > limit
    // Aplicar estado actual
    rows.forEach((row, i) => {
      if (i >= limit) row.style.display = wasExpanded ? '' : 'none'
    })
    const btn = document.getElementById('toggle-mods-btn')
    const icon = document.getElementById('toggle-mods-icon')
    if (btn) btn.style.display = rows.length > limit ? '' : 'none'
    if (icon) icon.className = wasExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'
    if (btn) btn.innerHTML = `<i class="${wasExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'}" id="toggle-mods-icon"></i> ${wasExpanded ? t('instance.showLess') : t('instance.showMore')}`
  }
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
    const div = document.createElement('div')
    div.className = 'content-row'
    const iconWrap = document.createElement('div')
    iconWrap.className = 'content-row-icon'
    const icon = document.createElement('i')
    icon.className = 'fa-solid fa-puzzle-piece'
    icon.setAttribute('aria-hidden', 'true')
    iconWrap.appendChild(icon)
    const copy = document.createElement('div')
    copy.className = 'content-row-copy'
    const strong = document.createElement('strong')
    strong.title = mod.name
    strong.textContent = mod.name
    const sizeSpan = document.createElement('span')
    sizeSpan.textContent = formatFileSize(mod.size)
    copy.append(strong, sizeSpan)
    const pill = document.createElement('span')
    pill.className = 'pill' + (disabled ? ' disabled' : '')
    pill.textContent = status
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'small-action'
    btn.textContent = action
    btn.addEventListener('click', () => toggleInstanceMod(mod.name))
    div.append(iconWrap, copy, pill, btn)
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
    div.innerHTML = '<div class="content-row-icon"><i class="fa-solid fa-earth-americas"></i></div>' +
      '<div class="content-row-copy"><strong title="' + escapeHtml(world.name) + '">' + escapeHtml(world.name) + '</strong><span>' + escapeHtml(t('instance.updatedAt', { date: new Date(world.updatedAt).toLocaleString() })) + '</span></div>' +
      '<span class="pill">' + escapeHtml(t('instance.world')) + '</span>' +
      '<button type="button" class="small-action" onclick="openInstanceTarget(&quot;saves&quot;)">' + escapeHtml(t('instances.open')) + '</button>'
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
    div.innerHTML = '<div class="content-row-icon"><i class="fa-regular fa-file-lines"></i></div>' +
      '<div class="content-row-copy"><strong title="' + escapeHtml(logFile.name) + '">' + escapeHtml(logFile.name) + '</strong><span>' + formatFileSize(logFile.size) + ' · ' + new Date(logFile.updatedAt).toLocaleString() + '</span></div>' +
      '<span class="pill">Log</span>' +
      '<button type="button" class="small-action" onclick="openInstanceTarget(&quot;launcherLogs&quot;)">' + escapeHtml(t('instances.open')) + '</button>'
    fragment.appendChild(div)
  })
  list.innerHTML = ''
  list.appendChild(fragment)
}

function renderInstanceFolders() {
  const folders = [
    ['root', t('instance.folder.root'), 'fa-box-archive'],
    ['minecraft', 'Minecraft root', 'fa-cube'],
    ['mods', 'Mods', 'fa-puzzle-piece'],
    ['plugins', 'Plugins', 'fa-plug'],
    ['datapacks', 'Datapacks', 'fa-database'],
    ['resourcepacks', 'Resource packs', 'fa-palette'],
    ['shaderpacks', 'Shaders', 'fa-wand-magic-sparkles'],
    ['saves', t('instance.folder.saves'), 'fa-earth-americas'],
    ['logs', 'Logs MC', 'fa-file-lines'],
    ['launcherLogs', 'Logs launcher', 'fa-terminal']
  ]
  const actionsEl = document.getElementById('instance-folder-actions')
  if (actionsEl) {
    const fragment = document.createDocumentFragment()
    folders.forEach(([target, label, icon]) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'folder-btn'
      btn.onclick = () => openInstanceTarget(target)
      btn.innerHTML = '<span class="folder-btn-icon"><i class="fa-solid ' + icon + '"></i></span><span>' + escapeHtml(label) + '</span><i class="fa-solid fa-arrow-up-right-from-square folder-btn-arrow"></i>'
      fragment.appendChild(btn)
    })
    actionsEl.innerHTML = ''
    actionsEl.appendChild(fragment)
  }
}

function refreshInstancePanelSoon(times = 1) {
  if (currentSection !== 'instance-detail') return
  refreshInstancePanel()
  if (times <= 1) return
  const timer = setTimeout(() => {
    instanceRefreshTimers.delete(timer)
    refreshInstancePanelSoon(times - 1)
  }, 900)
  instanceRefreshTimers.add(timer)
}

async function openInstanceTarget(target) {
  const result = await window.kindyrAPI.instances.openTarget(selectedInstance, target)
  setStatus(result.ok ? t('instance.folderOpen') : result.error)
  if (result.ok) refreshInstancePanelSoon(6)
}

async function toggleInstanceMod(fileName) {
  const result = await window.kindyrAPI.instances.toggleMod(selectedInstance, fileName)
  setStatus(result.ok ? t('instance.modUpdated') : result.error)
  if (result.ok) refreshInstancePanelSoon(2)
}

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

  const result = await window.kindyrAPI.instances.versions({
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
  const result = await window.kindyrAPI.instances.create({
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

  if (settings.eagerPrepareOnCreate && window.kindyrAPI?.instances?.prepare) {
    showPrepareToast(result.instance.name, t('settings.beta.preparing', { name: result.instance.name }))
    setStatus(t('settings.beta.preparing', { name: result.instance.name }))
    let lastPercent = 5
    updatePrepareToast(lastPercent, t('settings.beta.preparing', { name: result.instance.name }), 'Iniciando')
    const off = window.kindyrAPI.launcher.onStatus((ev) => {
      if (!ev || !ev.message) return
      const msg = ev.message
      const m = msg.match(/(\d+)\/(\d+)/)
      if (m) {
        const cur = parseInt(m[1], 10), tot = parseInt(m[2], 10)
        if (tot > 0) {
          const pct = Math.min(95, Math.max(lastPercent, Math.round((cur / tot) * 70 + 20)))
          updatePrepareToast(pct, msg, `${cur}/${tot}`)
          lastPercent = pct
        }
      } else if (msg.includes('Descargando Java')) {
        updatePrepareToast(10, msg, 'Java')
        lastPercent = 10
      } else if (msg.includes('Instancia lista')) {
        updatePrepareToast(100, msg, 'Listo')
        lastPercent = 100
      } else if (msg.includes('Preparando')) {
        updatePrepareToast(lastPercent, msg, 'Preparando')
      } else if (ev.type === 'error') {
        updatePrepareToast(lastPercent, msg, 'Error')
      }
    })
    try {
      const prep = await window.kindyrAPI.instances.prepare(result.instance.id)
      if (!prep || !prep.ok) {
        const err = prep?.error || t('settings.beta.failed', { name: result.instance.name })
        updatePrepareToast(lastPercent, err, 'Error')
        setStatus(err)
        setTimeout(() => hidePrepareToast(), 3000)
        await new Promise(r => setTimeout(r, 1200))
        hidePrepareToast(true)
        await refreshLauncherInstances()
        openInstanceView(result.instance.id)
        return
      }
      // Esperar a que termine la preparación en segundo plano
      let attempts = 0
      while (attempts < 360) {
        await new Promise(r => setTimeout(r, 500))
        try {
          const st = await window.kindyrAPI.instances.prepareStatus()
          if (!st.preparing.includes(result.instance.id)) break
        } catch {}
        attempts++
      }
      updatePrepareToast(100, t('settings.beta.prepared', { name: result.instance.name }), 'Listo')
      setStatus(t('settings.beta.prepared', { name: result.instance.name }))
      await new Promise(r => setTimeout(r, 700))
      hidePrepareToast(true)
      await refreshLauncherInstances()
      openInstanceView(result.instance.id)
    } catch (e) {
      updatePrepareToast(lastPercent, e.message || t('settings.beta.failed', { name: result.instance.name }), 'Error')
      setStatus(t('settings.beta.failed', { name: result.instance.name }))
      setTimeout(() => hidePrepareToast(true), 3000)
      await refreshLauncherInstances()
      openInstanceView(result.instance.id)
    } finally {
      try { off() } catch {}
    }
  } else {
    openInstanceView(result.instance.id)
    setStatus(t('create.created', { name: result.instance.name }))
  }
}

async function refreshLauncherInstances() {
  if (!window.kindyrAPI?.instances?.list) return
  if (!launcherInstancesRefreshRequest) {
    launcherInstancesRefreshRequest = window.kindyrAPI.instances.list()
      .finally(() => {
        launcherInstancesRefreshRequest = null
      })
  }
  launcherInstances = await launcherInstancesRefreshRequest
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

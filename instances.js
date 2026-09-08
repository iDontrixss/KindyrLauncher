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
  renderHeroIcon(heroIcon, instance, displayName)
}

function instanceIconHtml(instance, cls) {
  const initial = escapeHtml(String(instance?.name || 'M').charAt(0).toUpperCase())
  const icon = instance && instance.icon
  if (icon && icon.file) {
    return '<div class="' + cls + ' has-img">' + initial + '<img src="' + escapeHtml(toFileUrl(icon.file)) + '" alt="" loading="lazy" onerror="this.remove()"></div>'
  }
  if (icon && icon.fa) {
    return '<div class="' + cls + ' has-fa" style="background:' + escapeHtml(icon.bg || '') + '"><i class="fa-solid ' + escapeHtml(icon.fa) + '"></i></div>'
  }
  return '<div class="' + cls + '">' + initial + '</div>'
}

function renderHeroIcon(el, instance, displayName) {
  if (!el) return
  const icon = instance && instance.icon
  const initial = String(displayName || 'M').charAt(0).toUpperCase()
  el.classList.toggle('has-img', Boolean(icon && icon.file))
  el.classList.toggle('has-fa', Boolean(icon && !icon.file && icon.fa))
  if (icon && icon.file) {
    el.style.background = ''
    el.innerHTML = escapeHtml(initial) + '<img src="' + escapeHtml(toFileUrl(icon.file)) + '" alt="" onerror="this.remove()">'
  } else if (icon && icon.fa) {
    el.style.background = icon.bg || ''
    el.innerHTML = '<i class="fa-solid ' + escapeHtml(icon.fa) + '"></i>'
  } else {
    el.style.background = ''
    el.textContent = initial
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
        <button type="button" class="instance-tool-btn" id="instance-settings-btn" title="${escapeHtml(t('instance.settings.open'))}" aria-label="${escapeHtml(t('instance.settings.open'))}">
          <i class="fa-solid fa-gear"></i>
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
  const instanceSettingsBtn = document.getElementById('instance-settings-btn')
  if (instanceSettingsBtn) instanceSettingsBtn.addEventListener('click', () => openInstanceSettings())

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
let createStep = 'choice'
let createNameEdited = false
let createIcon = null
let createLoaderChannel = 'stable'
let createLoaderVersions = []
let createPresetsRendered = false
const createLoaders = [
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'quilt', label: 'Quilt' }
]
const CREATE_CHANNELS = [
  { id: 'stable', labelKey: 'create.channel.stable' },
  { id: 'latest', labelKey: 'create.channel.latest' },
  { id: 'other', labelKey: 'create.channel.other' }
]
const CREATE_ICON_PRESETS = [
  { fa: 'fa-cube', bg: '#1bd96a' },
  { fa: 'fa-gem', bg: '#4c8dff' },
  { fa: 'fa-ghost', bg: '#a78bfa' },
  { fa: 'fa-dragon', bg: '#ff5d5d' },
  { fa: 'fa-rocket', bg: '#ffa53c' },
  { fa: 'fa-hammer', bg: '#b78a00' },
  { fa: 'fa-tree', bg: '#34d399' },
  { fa: 'fa-fish', bg: '#2f6fd4' },
  { fa: 'fa-star', bg: '#ff5a3c' },
  { fa: 'fa-skull', bg: '#5b5b5b' },
  { fa: 'fa-bolt', bg: '#b78a00' },
  { fa: 'fa-moon', bg: '#3b1f6e' }
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
  createLoaderChannel = 'stable'
  const other = document.getElementById('create-other-loader')
  if (other) { other.value = ''; other.hidden = true }
  renderCreateLoaders()
  renderCreateChannels()
  loadCreateVersions()
  syncCreateNameDefault()
}

function defaultCreateName() {
  const mc = createSelectedVersion ? createSelectedVersion.id : ''
  const label = (createLoaders.find(item => item.id === createLoader) || {}).label || createLoader
  if (createLoader === 'vanilla') return mc ? 'Minecraft ' + mc : 'Minecraft'
  return mc ? label + ' ' + mc : label
}

function syncCreateNameDefault() {
  if (createNameEdited) return
  const input = document.getElementById('create-name')
  if (input) input.value = defaultCreateName()
}

function renderCreateIconPreview() {
  const preview = document.getElementById('create-icon-preview')
  if (!preview) return
  preview.classList.remove('has-img', 'has-fa')
  if (createIcon && createIcon.kind === 'upload' && createIcon.path) {
    preview.classList.add('has-img')
    const nameInput = document.getElementById('create-name')
    const initial = escapeHtml(String((nameInput && nameInput.value) || defaultCreateName() || 'M').charAt(0).toUpperCase())
    preview.innerHTML = initial + '<img src="' + escapeHtml(toFileUrl(createIcon.path)) + '" alt="" onerror="this.remove()">'
    return
  }
  if (createIcon && createIcon.kind === 'preset' && createIcon.fa) {
    preview.classList.add('has-fa')
    preview.style.background = createIcon.bg || ''
    preview.innerHTML = '<i class="fa-solid ' + escapeHtml(createIcon.fa) + '"></i>'
    return
  }
  preview.style.background = ''
  const nameInput = document.getElementById('create-name')
  const initial = String((nameInput && nameInput.value) || defaultCreateName() || 'M').charAt(0).toUpperCase()
  preview.textContent = initial
}

function renderCreatePresets() {
  if (createPresetsRendered) return
  createPresetsRendered = true
  const grid = document.getElementById('create-preset-grid')
  if (!grid) return
  grid.innerHTML = CREATE_ICON_PRESETS.map((preset, index) => (
    '<button type="button" class="create-preset-cell" data-preset="' + index + '" style="background:' + escapeHtml(preset.bg) + '" onclick="selectCreatePreset(' + index + ')" aria-label="preset ' + (index + 1) + '">' +
      '<i class="fa-solid ' + escapeHtml(preset.fa) + '"></i>' +
    '</button>'
  )).join('')
}

function selectCreatePreset(index) {
  const preset = CREATE_ICON_PRESETS[index]
  if (!preset) return
  createIcon = { kind: 'preset', fa: preset.fa, bg: preset.bg }
  document.querySelectorAll('#create-preset-grid .create-preset-cell').forEach((cell, cellIndex) => {
    cell.classList.toggle('selected', cellIndex === index)
  })
  renderCreateIconPreview()
}

function createTogglePresets() {
  renderCreatePresets()
  const grid = document.getElementById('create-preset-grid')
  if (grid) grid.hidden = !grid.hidden
}

function createRandomIcon() {
  selectCreatePreset(Math.floor(Math.random() * CREATE_ICON_PRESETS.length))
  const grid = document.getElementById('create-preset-grid')
  if (grid) grid.hidden = true
}

async function createUploadIcon() {
  if (!window.kindyrAPI?.instances?.browseIcon) {
    updateCreateNote(t('create.icon.browseError'))
    return
  }
  const result = await window.kindyrAPI.instances.browseIcon()
  if (result.cancelled) return
  if (!result.ok) {
    updateCreateNote(result.error || t('create.icon.browseError'))
    return
  }
  createIcon = { kind: 'upload', path: result.path }
  document.querySelectorAll('#create-preset-grid .create-preset-cell').forEach(cell => cell.classList.remove('selected'))
  renderCreateIconPreview()
}

function updateCreateNote(message) {
  const note = document.getElementById('create-instance-note')
  if (note) note.textContent = message
}

function resolveCreateLoaderVersion() {
  if (createLoader === 'vanilla') return ''
  if (createLoaderChannel === 'other') {
    const other = document.getElementById('create-other-loader')
    return String(other ? other.value : '').trim()
  }
  const list = Array.isArray(createLoaderVersions) ? createLoaderVersions : []
  if (!list.length) return String((createSelectedVersion && createSelectedVersion.loaderVersion) || '')
  if (createLoaderChannel === 'latest') return String(list[list.length - 1].version || '')
  for (let index = list.length - 1; index >= 0; index--) {
    if (list[index].stable) return String(list[index].version || '')
  }
  return String(list[list.length - 1].version || '')
}

function updateCreateVersionNote() {
  if (!createSelectedVersion) {
    updateCreateNote(createVersions.length ? t('create.pickVersion') : t('install.noCompatibleNote'))
    return
  }
  const loaderVersion = resolveCreateLoaderVersion()
  updateCreateNote(createSelectedVersion.id + (loaderVersion ? ' · ' + loaderVersion : ''))
}

function renderCreateChannels() {
  const wrap = document.getElementById('create-loader-channel-wrap')
  if (wrap) wrap.hidden = createLoader === 'vanilla'
  const row = document.getElementById('create-channel-row')
  if (row) {
    row.innerHTML = CREATE_CHANNELS.map(channel => (
      '<button type="button" class="loader-option ' + (channel.id === createLoaderChannel ? 'active' : '') + '" onclick="selectCreateChannel(&quot;' + channel.id + '&quot;)">' + escapeHtml(t(channel.labelKey)) + '</button>'
    )).join('')
  }
  const other = document.getElementById('create-other-loader')
  if (other) other.hidden = createLoaderChannel !== 'other'
}

function selectCreateChannel(channel) {
  createLoaderChannel = channel
  renderCreateChannels()
  updateCreateVersionNote()
}

async function loadCreateLoaderVersions() {
  createLoaderVersions = []
  if (createLoader === 'vanilla' || !createSelectedVersion) {
    renderCreateChannels()
    updateCreateVersionNote()
    return
  }
  if (!window.kindyrAPI?.instances?.loaderVersions) {
    renderCreateChannels()
    updateCreateVersionNote()
    return
  }
  try {
    const result = await window.kindyrAPI.instances.loaderVersions({
      loader: createLoader,
      minecraftVersion: createSelectedVersion.id
    })
    if (result && result.ok && Array.isArray(result.versions)) {
      createLoaderVersions = result.versions.filter(item => item && item.version)
    }
  } catch {}
  renderCreateChannels()
  updateCreateVersionNote()
}

function openCreateInstanceModal() {
  createLoader = 'vanilla'
  createSelectedVersion = null
  selectCreateStep('choice')
  document.getElementById('create-instance-modal').classList.add('active')
}

function selectCreateStep(step) {
  createStep = step
  for (const name of ['choice', 'modpack', 'custom']) {
    const el = document.getElementById('create-step-' + name)
    if (el) el.hidden = name !== step
  }
  const back = document.getElementById('create-back-btn')
  if (back) back.hidden = step === 'choice'
  const confirm = document.getElementById('create-instance-confirm')
  if (confirm) confirm.hidden = step !== 'custom'
  if (step === 'custom') {
    createNameEdited = false
    createIcon = null
    createLoaderChannel = 'stable'
    createLoaderVersions = []
    const nameInput = document.getElementById('create-name')
    if (nameInput) nameInput.value = ''
    const other = document.getElementById('create-other-loader')
    if (other) { other.value = ''; other.hidden = true }
    const grid = document.getElementById('create-preset-grid')
    if (grid) grid.hidden = true
    const snapshots = document.getElementById('create-snapshots')
    if (snapshots) snapshots.checked = false
    const search = document.getElementById('create-version-search')
    if (search) search.value = ''
    updateCreateNote(t('create.loadingVersions'))
    const select = document.getElementById('create-version-select')
    if (select) select.innerHTML = ''
    renderCreateLoaders()
    renderCreateChannels()
    renderCreateIconPreview()
    syncCreateNameDefault()
    loadCreateVersions()
  }
}

async function createBrowseModpacks() {
  closeCreateInstanceModal()
  const nav = document.getElementById('nav-discover')
  if (typeof openDiscoverSection === 'function') {
    await openDiscoverSection(nav)
  } else if (typeof loadSection === 'function') {
    await loadSection('discover', nav)
  } else {
    return
  }
  if (typeof selectDiscoverType === 'function') selectDiscoverType('modpack')
}

async function createImportMrpack() {
  closeCreateInstanceModal()
  if (!window.kindyrAPI?.instances?.importMrpack) {
    setStatus(t('instances.importError'))
    return
  }
  window.kindyrAPI.instances.offImportProgress()
  window.kindyrAPI.instances.onImportProgress((data) => {
    setStatus(data.message)
  })
  let result
  try {
    result = await window.kindyrAPI.instances.importMrpack()
  } finally {
    window.kindyrAPI.instances.offImportProgress()
  }
  if (result.ok) {
    if (result.warnings) {
      setStatus(t('instances.importSuccess', { name: result.name }) + ` (${result.warnings} mod(s) fallaron)`)
    } else {
      setStatus(t('instances.importSuccess', { name: result.name }))
    }
    if (typeof refreshLauncherInstances === 'function') refreshLauncherInstances()
  } else if (result.cancelled) {
    setStatus(t('app.ready'))
  } else {
    setStatus(result.error || t('instances.importError'))
  }
}

function closeCreateInstanceModal(event) {
  if (event && event.target.id !== 'create-instance-modal') return
  document.getElementById('create-instance-modal').classList.remove('active')
}

async function loadCreateVersions() {
  const snapshotsEl = document.getElementById('create-snapshots')
  const includeSnapshots = Boolean(snapshotsEl && snapshotsEl.checked)
  updateCreateNote(t('install.searchingCompatible'))
  const select = document.getElementById('create-version-select')
  if (select) select.innerHTML = ''

  const result = await window.kindyrAPI.instances.versions({
    loader: createLoader,
    includeSnapshots,
    query: ''
  })

  if (!result.ok) {
    createVersions = []
    createSelectedVersion = null
    updateCreateNote(result.error)
    renderCreateVersionOptions()
    return
  }

  createVersions = result.versions || []
  createSelectedVersion = createVersions[0] || null
  renderCreateVersionOptions()
  syncCreateNameDefault()
  loadCreateLoaderVersions()
}

function filterCreateVersionOptions() {
  renderCreateVersionOptions()
}

function getFilteredCreateVersions() {
  const searchEl = document.getElementById('create-version-search')
  const query = String(searchEl ? searchEl.value : '').trim().toLowerCase()
  if (!query) return createVersions
  return createVersions.filter(version => String(version.id || '').toLowerCase().includes(query))
}

function renderCreateVersionOptions() {
  const select = document.getElementById('create-version-select')
  if (!select) return
  const filtered = getFilteredCreateVersions()
  if (!filtered.length) {
    select.innerHTML = ''
    createSelectedVersion = null
    updateCreateNote(createVersions.length ? t('install.noCompatible') : t('install.noCompatibleNote'))
    return
  }
  if (!filtered.some(version => createSelectedVersion && version.id === createSelectedVersion.id)) {
    createSelectedVersion = filtered[0]
  }
  select.innerHTML = filtered.map(version => (
    '<option value="' + escapeHtml(version.id) + '"' + (createSelectedVersion && version.id === createSelectedVersion.id ? ' selected' : '') + '>' +
      escapeHtml(version.id) + (version.loaderVersion ? ' · ' + version.loaderVersion : '') +
    '</option>'
  )).join('')
  if (createSelectedVersion) select.value = createSelectedVersion.id
  updateCreateVersionNote()
}

function selectCreateVersion(versionId) {
  createSelectedVersion = createVersions.find(version => version.id === versionId) || null
  const select = document.getElementById('create-version-select')
  if (select && createSelectedVersion) select.value = createSelectedVersion.id
  syncCreateNameDefault()
  loadCreateLoaderVersions()
}

async function createSelectedInstance() {
  if (!createSelectedVersion) {
    setStatus(t('create.pickVersion'))
    return
  }
  const loaderVersion = resolveCreateLoaderVersion()
  if (createLoader !== 'vanilla' && !loaderVersion) {
    const note = document.getElementById('create-instance-note')
    const message = createLoaderChannel === 'other' ? t('create.badLoaderVersion') : t('create.pickVersion')
    if (note) note.textContent = message
    setStatus(message)
    return
  }
  const nameInput = document.getElementById('create-name')
  const name = String(nameInput ? nameInput.value : '').trim() || defaultCreateName()
  let icon = null
  if (createIcon && createIcon.kind === 'upload' && createIcon.path) {
    icon = { path: createIcon.path }
  } else if (createIcon && createIcon.kind === 'preset' && createIcon.fa) {
    icon = { fa: createIcon.fa, bg: createIcon.bg }
  }

  const btn = document.getElementById('create-instance-confirm')
  if (btn) {
    btn.disabled = true
    btn.textContent = t('create.creating')
  }
  let result = null
  try {
    result = await window.kindyrAPI.instances.create({
      version: createSelectedVersion.id,
      versionType: createSelectedVersion.type,
      loader: createLoader,
      loaderVersion,
      name,
      icon
    })
  } catch (error) {
    const message = error?.message || String(error || 'No se pudo crear la instalación.')
    const note = document.getElementById('create-instance-note')
    if (note) note.textContent = message
    setStatus(message)
    return
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = t('create.create')
    }
  }

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

// ===== Ajustes de instancia =====
let isettingsId = null
let isettingsTab = 'general'
let isettingsIcon = null
let isettingsPresetsRendered = false
let isettingsVersions = []
let isettingsSelectedVersion = null
let isettingsLoader = 'vanilla'
let isettingsLoaderChannel = 'stable'
let isettingsLoaderVersions = []
const ISETTINGS_UPDATE_CHANNELS = [
  { id: 'release', descKey: 'instance.settings.updateChannelReleaseDesc' },
  { id: 'beta', descKey: 'instance.settings.updateChannelBetaDesc' },
  { id: 'alpha', descKey: 'instance.settings.updateChannelAlphaDesc' }
]

function namesMatchLoose(a, b) {
  const norm = (value) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const left = norm(a)
  return left !== '' && left === norm(b)
}

function getIsettingsInstance() {
  return (launcherInstances || []).find(item => item.id === isettingsId) || null
}

function syncIsettingsInstance(updated) {
  if (!updated || !updated.id) return
  const index = launcherInstances.findIndex(item => item.id === updated.id)
  if (index >= 0) launcherInstances[index] = { ...launcherInstances[index], ...updated }
  if (typeof renderLauncherInstancesList === 'function') {
    try { renderLauncherInstancesList() } catch {}
  }
  if (typeof renderRecentInstances === 'function') {
    try { renderRecentInstances() } catch {}
  }
  if (updated.id === selectedInstance) updateSelectedInstanceHero()
}

function isettingsNote(which, message) {
  const note = document.getElementById('isettings-' + which + '-note')
  if (!note) return
  if (!message) {
    note.hidden = true
    note.textContent = ''
    return
  }
  note.hidden = false
  note.textContent = message
}

function openInstanceSettings(instanceId) {
  isettingsId = instanceId || selectedInstance
  const instance = getIsettingsInstance()
  if (!instance) {
    setStatus(t('instance.selectedStatus', { name: '' }))
    return
  }
  const icon = instance.icon
  isettingsIcon = icon && icon.file
    ? { kind: 'upload', path: icon.file }
    : (icon && icon.fa ? { kind: 'preset', fa: icon.fa, bg: icon.bg } : null)
  const head = document.getElementById('instance-settings-head')
  if (head) {
    head.innerHTML = instanceIconHtml(instance, 'instance-card-icon') +
      '<div><div style="font-size:15px;font-weight:800">' + escapeHtml(instance.name) + '</div>' +
      '<div style="font-size:11px;color:var(--kindyr-blue-soft)">' + escapeHtml(t('instance.settings.open')) + '</div></div>'
  }
  switchInstanceSettingsTab('general')
  document.getElementById('instance-settings-modal').classList.add('active')
}

function closeInstanceSettings(event) {
  if (event && event.target.id !== 'instance-settings-modal') return
  document.getElementById('instance-settings-modal').classList.remove('active')
  isettingsId = null
}

function switchInstanceSettingsTab(tab) {
  isettingsTab = tab
  document.querySelectorAll('#instance-settings-nav .settings-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.istab === tab)
  })
  document.querySelectorAll('#instance-settings-modal [data-ispanel]').forEach(panel => {
    panel.hidden = panel.dataset.ispanel !== tab
  })
  if (tab === 'general') loadIsettingsGeneral()
  else if (tab === 'installation') loadIsettingsInstallation()
  else if (tab === 'java') loadIsettingsJava()
}

// ---- General ----
function loadIsettingsGeneral() {
  const instance = getIsettingsInstance()
  if (!instance) return
  const nameInput = document.getElementById('isettings-name')
  if (nameInput) nameInput.value = instance.name || ''
  renderIsettingsIconPreview()
  renderIsettingsUpdateChannels()
  const delInput = document.getElementById('isettings-delete-confirm')
  if (delInput) delInput.value = ''
  const delBtn = document.getElementById('isettings-delete-btn')
  if (delBtn) delBtn.disabled = true
  isettingsNote('general', '')
}

function renderIsettingsIconPreview() {
  const preview = document.getElementById('isettings-icon-preview')
  if (!preview) return
  preview.classList.remove('has-img', 'has-fa')
  preview.style.background = ''
  const instance = getIsettingsInstance()
  const initial = String(instance?.name || 'M').charAt(0).toUpperCase()
  if (isettingsIcon && isettingsIcon.kind === 'upload' && isettingsIcon.path) {
    preview.classList.add('has-img')
    preview.innerHTML = escapeHtml(initial) + '<img src="' + escapeHtml(toFileUrl(isettingsIcon.path)) + '" alt="" onerror="this.remove()">'
    return
  }
  if (isettingsIcon && isettingsIcon.kind === 'preset' && isettingsIcon.fa) {
    preview.classList.add('has-fa')
    preview.style.background = isettingsIcon.bg || ''
    preview.innerHTML = '<i class="fa-solid ' + escapeHtml(isettingsIcon.fa) + '"></i>'
    return
  }
  preview.textContent = initial
}

function renderIsettingsPresets() {
  if (isettingsPresetsRendered) return
  isettingsPresetsRendered = true
  const grid = document.getElementById('isettings-preset-grid')
  if (!grid) return
  grid.innerHTML = CREATE_ICON_PRESETS.map((preset, index) => (
    '<button type="button" class="create-preset-cell" data-preset="' + index + '" style="background:' + escapeHtml(preset.bg) + '" onclick="selectIsettingsPreset(' + index + ')">' +
      '<i class="fa-solid ' + escapeHtml(preset.fa) + '"></i>' +
    '</button>'
  )).join('')
}

function markIsettingsPresetSelected() {
  document.querySelectorAll('#isettings-preset-grid .create-preset-cell').forEach((cell, cellIndex) => {
    const preset = CREATE_ICON_PRESETS[cellIndex]
    cell.classList.toggle('selected', Boolean(
      isettingsIcon && isettingsIcon.kind === 'preset' && preset &&
      preset.fa === isettingsIcon.fa && preset.bg === isettingsIcon.bg
    ))
  })
}

function selectIsettingsPreset(index) {
  const preset = CREATE_ICON_PRESETS[index]
  if (!preset) return
  isettingsIcon = { kind: 'preset', fa: preset.fa, bg: preset.bg }
  markIsettingsPresetSelected()
  renderIsettingsIconPreview()
  isettingsSaveIcon()
}

function isettingsTogglePresets() {
  renderIsettingsPresets()
  markIsettingsPresetSelected()
  const grid = document.getElementById('isettings-preset-grid')
  if (grid) grid.hidden = !grid.hidden
}

function isettingsRandomIcon() {
  renderIsettingsPresets()
  const preset = CREATE_ICON_PRESETS[Math.floor(Math.random() * CREATE_ICON_PRESETS.length)]
  if (!preset) return
  isettingsIcon = { kind: 'preset', fa: preset.fa, bg: preset.bg }
  markIsettingsPresetSelected()
  const grid = document.getElementById('isettings-preset-grid')
  if (grid) grid.hidden = true
  renderIsettingsIconPreview()
  isettingsSaveIcon()
}

async function isettingsUploadIcon() {
  if (!window.kindyrAPI?.instances?.browseIcon) {
    isettingsNote('general', t('create.icon.browseError'))
    return
  }
  const result = await window.kindyrAPI.instances.browseIcon()
  if (result.cancelled) return
  if (!result.ok) {
    isettingsNote('general', result.error || t('create.icon.browseError'))
    return
  }
  isettingsIcon = { kind: 'upload', path: result.path }
  markIsettingsPresetSelected()
  renderIsettingsIconPreview()
  isettingsSaveIcon()
}

async function isettingsSaveIcon() {
  const instance = getIsettingsInstance()
  if (!instance || !window.kindyrAPI?.instances?.setIcon) return
  const payload = isettingsIcon && isettingsIcon.kind === 'upload'
    ? { path: isettingsIcon.path }
    : (isettingsIcon && isettingsIcon.kind === 'preset' ? { fa: isettingsIcon.fa, bg: isettingsIcon.bg } : null)
  const result = await window.kindyrAPI.instances.setIcon({ id: instance.id, icon: payload })
  if (!result.ok) {
    isettingsNote('general', result.error)
    return
  }
  syncIsettingsInstance(result.instance)
  isettingsNote('general', t('instance.settings.saved'))
}

async function isettingsRename() {
  const instance = getIsettingsInstance()
  const input = document.getElementById('isettings-name')
  if (!instance || !input || !window.kindyrAPI?.instances?.rename) return
  const result = await window.kindyrAPI.instances.rename({ id: instance.id, name: input.value })
  if (!result.ok) {
    isettingsNote('general', result.error)
    input.value = instance.name || ''
    return
  }
  syncIsettingsInstance(result.instance)
  const head = document.getElementById('instance-settings-head')
  if (head) openInstanceSettingsRefreshHead()
  isettingsNote('general', t('instance.settings.saved'))
}

function openInstanceSettingsRefreshHead() {
  const instance = getIsettingsInstance()
  const head = document.getElementById('instance-settings-head')
  if (!instance || !head) return
  head.innerHTML = instanceIconHtml(instance, 'instance-card-icon') +
    '<div><div style="font-size:15px;font-weight:800">' + escapeHtml(instance.name) + '</div>' +
    '<div style="font-size:11px;color:var(--kindyr-blue-soft)">' + escapeHtml(t('instance.settings.open')) + '</div></div>'
}

async function isettingsDuplicate() {
  const instance = getIsettingsInstance()
  if (!instance || !window.kindyrAPI?.instances?.duplicate) return
  const btn = document.getElementById('isettings-duplicate-btn')
  if (btn) btn.disabled = true
  try {
    const result = await window.kindyrAPI.instances.duplicate({ id: instance.id })
    if (!result.ok) {
      isettingsNote('general', result.error)
      return
    }
    await refreshLauncherInstances()
    isettingsNote('general', t('instance.settings.duplicateOk', { name: result.instance.name }))
    setStatus(t('instance.settings.duplicateOk', { name: result.instance.name }))
  } finally {
    if (btn) btn.disabled = false
  }
}

function renderIsettingsUpdateChannels() {
  const row = document.getElementById('isettings-update-channel-row')
  const instance = getIsettingsInstance()
  if (!row || !instance) return
  const current = instance.versionType || 'release'
  row.innerHTML = ISETTINGS_UPDATE_CHANNELS.map(channel => (
    '<button type="button" class="loader-option ' + (channel.id === current ? 'active' : '') + '" onclick="isettingsSetChannel(&quot;' + channel.id + '&quot;)">' + escapeHtml(t('create.channel.' + channel.id)) + '</button>'
  )).join('')
  const desc = document.getElementById('isettings-channel-desc')
  if (desc) {
    const found = ISETTINGS_UPDATE_CHANNELS.find(channel => channel.id === current)
    const key = found ? found.descKey : ISETTINGS_UPDATE_CHANNELS[0].descKey
    desc.textContent = t(key)
  }
}

async function isettingsSetChannel(channel) {
  const instance = getIsettingsInstance()
  if (!instance || !window.kindyrAPI?.instances?.setChannel) return
  const result = await window.kindyrAPI.instances.setChannel({ id: instance.id, versionType: channel })
  if (!result.ok) {
    isettingsNote('general', result.error)
    return
  }
  syncIsettingsInstance(result.instance)
  renderIsettingsUpdateChannels()
  isettingsNote('general', t('instance.settings.saved'))
}

function isettingsDeleteCheck() {
  const instance = getIsettingsInstance()
  const input = document.getElementById('isettings-delete-confirm')
  const btn = document.getElementById('isettings-delete-btn')
  if (!input || !btn) return
  btn.disabled = !namesMatchLoose(input.value, instance?.name)
}

async function isettingsDelete() {
  const instance = getIsettingsInstance()
  const input = document.getElementById('isettings-delete-confirm')
  if (!instance || !window.kindyrAPI?.instances?.remove) return
  if (!namesMatchLoose(input ? input.value : '', instance.name)) return
  const btn = document.getElementById('isettings-delete-btn')
  if (btn) btn.disabled = true
  try {
    const result = await window.kindyrAPI.instances.remove({ id: instance.id })
    if (!result.ok) {
      isettingsNote('general', result.error)
      return
    }
    closeInstanceSettings()
    await refreshLauncherInstances()
    if (selectedInstance === instance.id) {
      const first = (launcherInstances || [])[0]
      if (first) {
        selectedInstance = first.id
        selectedVersion = first.version
      }
    }
    const nav = document.getElementById('nav-instances')
    if (typeof loadSection === 'function') await loadSection('instances', nav)
    setStatus(t('app.ready'))
  } finally {
    if (btn) btn.disabled = false
  }
}

// ---- Instalación ----
function isettingsContentRows(rows) {
  return rows.map(row => (
    '<div class="content-row"><strong>' + escapeHtml(row[0]) + '</strong><span>' + escapeHtml(row[1]) + '</span></div>'
  )).join('')
}

async function loadIsettingsInstallation() {
  const instance = getIsettingsInstance()
  if (!instance) return
  const table = document.getElementById('isettings-current-table')
  if (table) {
    const rows = [
      [getInstanceLoaderLabel(instance.loader), String(instance.loader || 'vanilla')],
      ['Minecraft', String(instance.version || '')]
    ]
    if (instance.loader && instance.loader !== 'vanilla' && instance.loaderVersion) {
      rows.push([t('create.loaderVersion'), String(instance.loaderVersion)])
    }
    table.innerHTML = isettingsContentRows(rows)
  }
  const group = document.getElementById('isettings-modpack-group')
  const modTable = document.getElementById('isettings-modpack-table')
  const isModpack = instance.type === 'modpack' || Boolean(instance.projectId)
  if (group) group.hidden = !isModpack
  if (modTable && isModpack) {
    modTable.innerHTML = isettingsContentRows([
      [t('instance.settings.modpack'), String(instance.slug || instance.projectId || instance.source || '')],
      ['Minecraft', String(instance.version || '')]
    ])
  }
  isettingsLoader = instance.loader || 'vanilla'
  isettingsLoaderChannel = 'stable'
  isettingsLoaderVersions = []
  isettingsSelectedVersion = { id: instance.version, type: instance.versionType || 'release' }
  const other = document.getElementById('isettings-other-loader')
  if (other) { other.value = ''; other.hidden = true }
  renderIsettingsLoaders()
  await loadIsettingsVersions()
}

function renderIsettingsLoaders() {
  const row = document.getElementById('isettings-loader-row')
  if (row) {
    row.innerHTML = createLoaders.map(loader => (
      '<button type="button" class="loader-option ' + (loader.id === isettingsLoader ? 'active' : '') + '" onclick="isettingsSelectLoader(&quot;' + loader.id + '&quot;)">' + loader.label + '</button>'
    )).join('')
  }
  renderIsettingsChannels()
}

function isettingsSelectLoader(loader) {
  isettingsLoader = loader
  isettingsSelectedVersion = null
  renderIsettingsLoaders()
  loadIsettingsVersions()
}

async function loadIsettingsVersions() {
  const select = document.getElementById('isettings-mc-select')
  if (select) select.innerHTML = ''
  isettingsNote('install', '')
  if (!window.kindyrAPI?.instances?.versions) return
  const result = await window.kindyrAPI.instances.versions({ loader: 'vanilla', includeSnapshots: true, query: '' })
  if (!result.ok) {
    isettingsNote('install', result.error)
    return
  }
  isettingsVersions = result.versions || []
  const instance = getIsettingsInstance()
  if (select) {
    select.innerHTML = isettingsVersions.map(version => (
      '<option value="' + escapeHtml(version.id) + '">' + escapeHtml(version.id) + '</option>'
    )).join('')
    const current = instance ? instance.version : ''
    if (current && isettingsVersions.some(version => version.id === current)) {
      select.value = current
      isettingsSelectedVersion = isettingsVersions.find(version => version.id === current)
    } else {
      isettingsSelectedVersion = isettingsVersions[0] || null
      if (isettingsSelectedVersion) select.value = isettingsSelectedVersion.id
    }
  }
  loadIsettingsLoaderVersions()
}

function isettingsSelectMcVersion(versionId) {
  isettingsSelectedVersion = isettingsVersions.find(version => version.id === versionId)
    || { id: String(versionId || ''), type: 'release' }
  loadIsettingsLoaderVersions()
}

function resolveIsettingsLoaderVersion() {
  if (isettingsLoader === 'vanilla') return ''
  if (isettingsLoaderChannel === 'other') {
    const other = document.getElementById('isettings-other-loader')
    return String(other ? other.value : '').trim()
  }
  const list = Array.isArray(isettingsLoaderVersions) ? isettingsLoaderVersions : []
  if (!list.length) {
    const instance = getIsettingsInstance()
    if (instance && instance.loader === isettingsLoader) return String(instance.loaderVersion || '')
    return ''
  }
  if (isettingsLoaderChannel === 'latest') return String(list[list.length - 1].version || '')
  for (let index = list.length - 1; index >= 0; index--) {
    if (list[index].stable) return String(list[index].version || '')
  }
  return String(list[list.length - 1].version || '')
}

function renderIsettingsChannels() {
  const wrap = document.getElementById('isettings-loader-channel-wrap')
  if (wrap) wrap.hidden = isettingsLoader === 'vanilla'
  const row = document.getElementById('isettings-loader-channel-row')
  if (row) {
    row.innerHTML = CREATE_CHANNELS.map(channel => (
      '<button type="button" class="loader-option ' + (channel.id === isettingsLoaderChannel ? 'active' : '') + '" onclick="isettingsSelectChannel(&quot;' + channel.id + '&quot;)">' + escapeHtml(t(channel.labelKey)) + '</button>'
    )).join('')
  }
  const other = document.getElementById('isettings-other-loader')
  if (other) other.hidden = isettingsLoaderChannel !== 'other'
}

function isettingsSelectChannel(channel) {
  isettingsLoaderChannel = channel
  renderIsettingsChannels()
}

async function loadIsettingsLoaderVersions() {
  isettingsLoaderVersions = []
  const select = document.getElementById('isettings-mc-select')
  const mc = select ? select.value : (isettingsSelectedVersion ? isettingsSelectedVersion.id : '')
  isettingsSelectedVersion = isettingsVersions.find(version => version.id === mc) || isettingsSelectedVersion
  if (isettingsLoader === 'vanilla' || !mc || !window.kindyrAPI?.instances?.loaderVersions) {
    renderIsettingsChannels()
    return
  }
  try {
    const result = await window.kindyrAPI.instances.loaderVersions({ loader: isettingsLoader, minecraftVersion: mc })
    if (result && result.ok && Array.isArray(result.versions)) {
      isettingsLoaderVersions = result.versions.filter(item => item && item.version)
    }
  } catch {}
  renderIsettingsChannels()
}

async function isettingsApplyVersion() {
  const instance = getIsettingsInstance()
  const select = document.getElementById('isettings-mc-select')
  if (!instance || !select || !window.kindyrAPI?.instances?.changeVersion) return
  const loaderVersion = resolveIsettingsLoaderVersion()
  if (isettingsLoader !== 'vanilla' && !loaderVersion) {
    isettingsNote('install', t('create.badLoaderVersion'))
    return
  }
  const result = await window.kindyrAPI.instances.changeVersion({
    id: instance.id,
    version: select.value,
    loader: isettingsLoader,
    loaderVersion
  })
  if (!result.ok) {
    isettingsNote('install', result.error)
    return
  }
  syncIsettingsInstance(result.instance)
  isettingsNote('install', t('instance.settings.versionApplied'))
  setStatus(t('instance.settings.versionApplied'))
  loadIsettingsInstallation()
}

async function isettingsRepair() {
  const instance = getIsettingsInstance()
  if (!instance || !window.kindyrAPI?.instances?.repair) return
  const btn = document.getElementById('isettings-repair-btn')
  if (btn) btn.disabled = true
  try {
    const result = await window.kindyrAPI.instances.repair({ id: instance.id })
    if (!result.ok) {
      isettingsNote('install', result.error)
      return
    }
    syncIsettingsInstance(result.instance)
    isettingsNote('install', t('instance.settings.repaired'))
    setStatus(t('instance.settings.repaired'))
  } finally {
    if (btn) btn.disabled = false
  }
}

async function isettingsUnlinkModpack() {
  const instance = getIsettingsInstance()
  if (!instance || !window.kindyrAPI?.instances?.unlinkModpack) return
  const result = await window.kindyrAPI.instances.unlinkModpack({ id: instance.id })
  if (!result.ok) {
    isettingsNote('install', result.error)
    return
  }
  syncIsettingsInstance(result.instance)
  isettingsNote('install', t('instance.settings.unlinked'))
  setStatus(t('instance.settings.unlinked'))
  loadIsettingsInstallation()
}

// ---- Java ----
function loadIsettingsJava() {
  const instance = getIsettingsInstance()
  if (!instance) return
  const minInput = document.getElementById('isettings-ram-min')
  const maxInput = document.getElementById('isettings-ram-max')
  if (minInput) {
    minInput.value = instance.memoryMinMb != null ? String(instance.memoryMinMb) : ''
    minInput.placeholder = String(settings.minRamMb || 2048)
  }
  if (maxInput) {
    maxInput.value = instance.memoryMaxMb != null ? String(instance.memoryMaxMb) : ''
    maxInput.placeholder = String(settings.maxRamMb || 4096)
  }
  const javaInput = document.getElementById('isettings-java-home')
  if (javaInput) javaInput.value = instance.javaHome || ''
  const argsInput = document.getElementById('isettings-jvm-args')
  if (argsInput) argsInput.value = instance.javaArgs || ''
  isettingsNote('java', '')
}

async function isettingsBrowseJava() {
  if (!window.kindyrAPI?.settings?.browseJava) return
  const result = await window.kindyrAPI.settings.browseJava()
  if (!result || result.cancelled) return
  if (!result.ok) {
    isettingsNote('java', result.error)
    return
  }
  const input = document.getElementById('isettings-java-home')
  if (input) input.value = result.path || result.home || ''
}

function isettingsClearJava() {
  const input = document.getElementById('isettings-java-home')
  if (input) input.value = ''
}

async function isettingsSaveJava() {
  const instance = getIsettingsInstance()
  if (!instance || !window.kindyrAPI?.instances?.setLaunchOpts) return
  const minInput = document.getElementById('isettings-ram-min')
  const maxInput = document.getElementById('isettings-ram-max')
  const javaInput = document.getElementById('isettings-java-home')
  const argsInput = document.getElementById('isettings-jvm-args')
  const parseMb = (el) => {
    const raw = String(el && el.value ? el.value : '').trim()
    if (!raw) return null
    const mb = Math.round(Number(raw))
    return Number.isFinite(mb) ? mb : NaN
  }
  const memoryMinMb = parseMb(minInput)
  const memoryMaxMb = parseMb(maxInput)
  if ((memoryMinMb !== null && !(memoryMinMb >= 512 && memoryMinMb <= 32768)) ||
      (memoryMaxMb !== null && !(memoryMaxMb >= 512 && memoryMaxMb <= 32768)) ||
      (memoryMinMb !== null && memoryMaxMb !== null && memoryMinMb > memoryMaxMb)) {
    isettingsNote('java', t('instance.settings.memoryError'))
    return
  }
  const result = await window.kindyrAPI.instances.setLaunchOpts({
    id: instance.id,
    memoryMinMb,
    memoryMaxMb,
    javaHome: String(javaInput && javaInput.value ? javaInput.value : '').trim(),
    javaArgs: String(argsInput && argsInput.value ? argsInput.value : '').trim()
  })
  if (!result.ok) {
    isettingsNote('java', result.error)
    return
  }
  syncIsettingsInstance(result.instance)
  isettingsNote('java', t('instance.settings.saved'))
  setStatus(t('instance.settings.saved'))
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

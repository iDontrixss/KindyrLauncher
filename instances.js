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

// Sanea HTML de proveedor (changelog Modrinth ya convertido a HTML en main)
// antes de inyectarlo con innerHTML. Replica el patrón de Descubrir
// (sections/descubrir.html: sanitizeRichHtml) con nombres propios para no
// colisionar con sus `const` globales cuando esa sección se carga.
// Allowlist de tags, sin handlers ni estilos, solo URLs http(s).
const CHANGELOG_ALLOWED_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'pre', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'details', 'summary', 'sup', 'sub'])
const CHANGELOG_DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'noscript', 'template', 'link', 'meta', 'base', 'title'])

function isSafeChangelogUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.charAt(0) === '#') return ''
  if (/^(javascript|data|vbscript|file|blob):/i.test(raw)) return ''
  try {
    const url = new URL(raw, 'https://modrinth.com')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.href
  } catch { return '' }
}

function sanitizeChangelogHtml(html) {
  const source = String(html || '')
  if (!source.trim()) return ''
  let root
  try {
    const doc = new DOMParser().parseFromString('<div>' + source + '</div>', 'text/html')
    root = doc.body ? doc.body.firstChild : null
  } catch { return '' }
  if (!root) return ''
  function clean(node) {
    const children = Array.from(node.childNodes)
    for (const child of children) {
      if (child.nodeType === 8) { child.remove(); continue }
      if (child.nodeType === 3) continue
      if (child.nodeType !== 1) { child.remove(); continue }
      const tag = child.tagName.toLowerCase()
      if (CHANGELOG_DROP_TAGS.has(tag)) { child.remove(); continue }
      if (!CHANGELOG_ALLOWED_TAGS.has(tag)) {
        while (child.firstChild) node.insertBefore(child.firstChild, child)
        child.remove()
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        if ((tag === 'a' && name === 'href') || (tag === 'img' && name === 'src')) {
          const safe = isSafeChangelogUrl(attr.value)
          if (safe) child.setAttribute(attr.name, safe)
          else child.removeAttribute(attr.name)
          continue
        }
        if ((name === 'alt' || name === 'title') && (tag === 'img' || tag === 'a')) continue
        child.removeAttribute(attr.name)
      }
      if (tag === 'a') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer') }
      if (tag === 'img') { child.setAttribute('loading', 'lazy'); if (!child.getAttribute('alt')) child.setAttribute('alt', '') }
      clean(child)
    }
  }
  clean(root)
  return root.innerHTML
}

function disposeInstanceDetailView() {
  instanceViewGeneration++
  for (const timer of instanceRefreshTimers) clearTimeout(timer)
  instanceRefreshTimers.clear()
  if (typeof stopInstanceConsole === 'function') stopInstanceConsole()
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
        </div>
      </div>
      <div class="tab-row">
        <button type="button" class="tab-btn active" id="instance-tab-content-btn" onclick="switchInstanceTab('content')"><i class="fa-solid fa-cubes"></i><span>${escapeHtml(t('instance.content'))}</span></button>
        <button type="button" class="tab-btn" id="instance-tab-files-btn" onclick="switchInstanceTab('files')"><i class="fa-regular fa-folder-open"></i><span>${escapeHtml(t('instance.folders'))}</span></button>
        <button type="button" class="tab-btn" id="instance-tab-worlds-btn" onclick="switchInstanceTab('worlds')"><i class="fa-solid fa-earth-americas"></i><span>${escapeHtml(t('instance.worlds'))}</span></button>
        <button type="button" class="tab-btn" id="instance-tab-logs-btn" onclick="switchInstanceTab('logs')"><i class="fa-regular fa-rectangle-list"></i><span>${escapeHtml(t('instance.logs'))}</span></button>
        <button type="button" class="tab-btn" id="instance-tab-console-btn" onclick="switchInstanceTab('console')"><i class="fa-solid fa-terminal"></i><span>${escapeHtml(t('instance.consoleTab'))}</span></button>
      </div>
      <div class="instance-tab active" id="instance-tab-content">
        <div class="content-hub">
          <div class="content-hub-title">${escapeHtml(t('instance.additionalContent'))}</div>
          <div class="content-hub-toolbar">
            <label class="content-hub-search" for="instance-content-search">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <input id="instance-content-search" placeholder="${escapeHtml(t('instance.searchContent'))}" oninput="filterInstanceContent()" autocomplete="off">
            </label>
            <button type="button" class="secondary-btn content-hub-btn" onclick="uploadInstanceFiles()" title="${escapeHtml(t('instance.dropHint'))}"><i class="fa-regular fa-folder-open"></i> ${escapeHtml(t('instance.uploadFiles'))}</button>
            <button type="button" class="primary-btn content-hub-btn content-hub-browse" onclick="openDiscoverForInstance()"><i class="fa-regular fa-compass"></i> ${escapeHtml(t('instance.browseContent'))}</button>
          </div>
          <div class="content-hub-filters">
            <div class="content-hub-sort">
              <button type="button" class="content-hub-sort-btn" id="instance-content-sort" onclick="cycleInstanceContentSort()" title="${escapeHtml(t('instance.sortBy'))}">
                <i class="fa-solid fa-arrow-down-wide-short"></i> <span id="instance-content-sort-label">${escapeHtml(t('instance.sortName'))}</span> <i class="fa-solid fa-chevron-down"></i>
              </button>
              <button type="button" class="content-hub-iconbtn" onclick="filterInstanceContent()" title="${escapeHtml(t('instance.refresh'))}"><i class="fa-solid fa-filter"></i></button>
            </div>
            <div class="content-hub-chips" id="instance-content-filters" role="tablist" aria-label="${escapeHtml(t('instance.content'))}"></div>
            <button type="button" class="content-hub-updatesonly" id="instance-content-updatesonly" onclick="toggleInstanceContentUpdatesOnly()"><i class="fa-solid fa-plus"></i> ${escapeHtml(t('instance.filter'))}</button>
            <div class="content-hub-side">
              <button type="button" class="content-hub-link" id="instance-update-all-btn" onclick="updateAllInstanceContent()"><i class="fa-solid fa-download"></i> ${escapeHtml(t('instance.updateAll'))}</button>
              <button type="button" class="content-hub-link" onclick="refreshInstancePanel()"><i class="fa-solid fa-rotate"></i> ${escapeHtml(t('instance.refresh'))}</button>
            </div>
          </div>
          <div class="content-hub-tablehead">
            <button type="button" id="instance-content-selectall" class="kindyr-check" onclick="toggleSelectAllInstanceContent()" aria-pressed="false" aria-label="${escapeHtml(t('instance.selectAll'))}"><i class="fa-solid fa-check"></i></button>
            <span>${escapeHtml(t('instance.colProject'))}</span>
            <span>${escapeHtml(t('instance.colVersion'))}</span>
            <span class="content-hub-actionshead">${escapeHtml(t('instance.colActions'))}</span>
          </div>
          <div id="instance-content-list" class="content-hub-list"></div>
          <div class="content-hub-bulk" id="instance-content-bulk" hidden>
            <span id="instance-content-bulk-label"></span>
            <button type="button" class="secondary-btn content-hub-btn" onclick="bulkToggleInstanceContent(true)">${escapeHtml(t('instance.enable'))}</button>
            <button type="button" class="secondary-btn content-hub-btn" onclick="bulkToggleInstanceContent(false)">${escapeHtml(t('instance.disable'))}</button>
            <button type="button" class="secondary-btn content-hub-btn content-hub-danger" onclick="bulkDeleteInstanceContent()"><i class="fa-regular fa-trash-can"></i> ${escapeHtml(t('confirm.delete'))}</button>
          </div>
        </div>
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
      <div class="instance-tab" id="instance-tab-console">
        <div class="console-tab">
          <div class="console-tab-toolbar">
            <span class="console-tab-status" id="instance-console-status"><span class="console-tab-dot" id="instance-console-dot"></span><span id="instance-console-status-text"></span></span>
            <span class="console-tab-count" id="instance-console-count"></span>
            <div class="console-tab-side">
              <button type="button" class="type-chip active" id="instance-console-follow" onclick="toggleInstanceConsoleFollow()"><i class="fa-solid fa-arrow-down"></i> ${escapeHtml(t('instance.console.follow'))}</button>
              <button type="button" class="content-hub-iconbtn" onclick="refreshInstanceConsole(true)" title="${escapeHtml(t('instance.refresh'))}"><i class="fa-solid fa-rotate"></i></button>
              <button type="button" class="content-hub-iconbtn" onclick="copyInstanceConsole()" title="${escapeHtml(t('instance.console.copy'))}"><i class="fa-regular fa-copy"></i></button>
              <button type="button" class="content-hub-iconbtn" onclick="clearInstanceConsoleView()" title="${escapeHtml(t('instance.console.clear'))}"><i class="fa-solid fa-eraser"></i></button>
            </div>
          </div>
          <div class="console-tab-view" id="instance-console-view" aria-live="off"></div>
        </div>
      </div>
    </div>
  `

  const openFolderBtn = document.getElementById('open-folder-btn')

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

  stopInstanceConsole()
  instanceConsole = null
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
  // Si la consola estaba siguiendo en vivo, reenganchar a la instancia actual.
  if (getInstanceConsole().timer) startInstanceConsole()

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
  if (tab === 'console') startInstanceConsole()
  else stopInstanceConsole()
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
  if (tabName === 'console') startInstanceConsole()
  else stopInstanceConsole()
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

// ===== Centro de control: hub de contenido unificado =====
// Reorganización estilo "Additional content": mods + resourcepacks + shaders +
// datapacks en una sola lista con pfp del proyecto, versiones (⇄) y updates (⬇).
let instanceContentItems = []
let instanceContentFilter = { q: '', kind: 'all', sort: 'name', updatesOnly: false }
let instanceContentSelected = new Set()
let instanceProjectCache = new Map()
let instanceUpdatesCache = new Map()
let instanceUpdatesState = 'idle'
let instanceContentGen = 0
const INSTANCE_CONTENT_KINDS_UI = [
  { id: 'all', labelKey: 'instance.filterAll' },
  { id: 'mod', labelKey: 'instance.filterMods' },
  { id: 'resourcepack', labelKey: 'instance.filterResourcepacks' },
  { id: 'shader', labelKey: 'instance.filterShaders' },
  { id: 'datapack', labelKey: 'instance.filterDatapacks' }
]
const INSTANCE_CONTENT_SORTS = [
  { id: 'name', labelKey: 'instance.sortName' },
  { id: 'recent', labelKey: 'instance.sortRecent' },
  { id: 'size', labelKey: 'instance.sortSize' }
]

function instanceContentKindLabel(kind) {
  const found = INSTANCE_CONTENT_KINDS_UI.find(k => k.id === kind)
  return found ? t(found.labelKey) : kind
}

function normalizeInstanceContent(raw, modsFallback) {
  if (Array.isArray(raw) && raw.length) return raw
  if (Array.isArray(modsFallback)) {
    return modsFallback.map(m => ({
      id: 'mod:' + m.name,
      kind: 'mod',
      kindLabel: 'Mod',
      dir: 'mods',
      file: m.name,
      baseName: String(m.name || '').replace(/\.disabled$/i, ''),
      rel: 'mods/' + m.name,
      entryType: 'file',
      size: m.size,
      updatedAt: m.updatedAt,
      enabled: !/\.disabled$/i.test(String(m.name || '')),
      uploaded: true,
      projectId: '',
      versionId: ''
    }))
  }
  return []
}

async function refreshInstancePanel() {
  const generation = instanceViewGeneration
  const myGen = ++instanceContentGen
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
    if (statMods) statMods.textContent = (result.content || result.mods || []).length
    if (statWorlds) statWorlds.textContent = result.worlds.length
  })
  instanceContentItems = normalizeInstanceContent(result.content, result.mods)
  instanceContentSelected = new Set()
  instanceUpdatesCache = new Map()
  instanceUpdatesState = 'idle'
  renderInstanceContentFilters()
  renderInstanceContent()
  enrichInstanceContentProjects(myGen)
  checkInstanceContentUpdates(myGen)
  identifyInstanceContentFiles(myGen)
  renderInstanceWorlds(result.worlds)
  renderInstanceLogs(result.logs)
  renderInstanceFolders()
}

function renderInstanceContentFilters() {
  const wrap = document.getElementById('instance-content-filters')
  if (!wrap) return
  wrap.innerHTML = INSTANCE_CONTENT_KINDS_UI.map(kind => (
    '<button type="button" class="type-chip' + (instanceContentFilter.kind === kind.id ? ' active' : '') + '" data-kind="' + kind.id + '" onclick="setInstanceContentFilter(&quot;' + kind.id + '&quot;)">' + escapeHtml(t(kind.labelKey)) + '</button>'
  )).join('')
  const sortLabel = document.getElementById('instance-content-sort-label')
  if (sortLabel) {
    const sort = INSTANCE_CONTENT_SORTS.find(s => s.id === instanceContentFilter.sort) || INSTANCE_CONTENT_SORTS[0]
    sortLabel.textContent = t(sort.labelKey)
  }
  const updatesBtn = document.getElementById('instance-content-updatesonly')
  if (updatesBtn) {
    updatesBtn.classList.toggle('active', instanceContentFilter.updatesOnly)
    updatesBtn.innerHTML = '<i class="fa-solid fa-' + (instanceContentFilter.updatesOnly ? 'check' : 'plus') + '"></i> ' + escapeHtml(instanceContentFilter.updatesOnly ? t('instance.updatesOnly') : t('instance.filter'))
  }
  const search = document.getElementById('instance-content-search')
  if (search && document.activeElement !== search) {
    search.placeholder = t('instance.searchContent', { count: instanceContentItems.length })
  }
}

function setInstanceContentFilter(kind) {
  instanceContentFilter.kind = kind
  renderInstanceContentFilters()
  renderInstanceContent()
}

function cycleInstanceContentSort() {
  const idx = INSTANCE_CONTENT_SORTS.findIndex(s => s.id === instanceContentFilter.sort)
  instanceContentFilter.sort = INSTANCE_CONTENT_SORTS[(idx + 1) % INSTANCE_CONTENT_SORTS.length].id
  renderInstanceContentFilters()
  renderInstanceContent()
}

function toggleInstanceContentUpdatesOnly() {
  instanceContentFilter.updatesOnly = !instanceContentFilter.updatesOnly
  renderInstanceContentFilters()
  renderInstanceContent()
}

function filterInstanceContent() {
  const search = document.getElementById('instance-content-search')
  instanceContentFilter.q = String(search ? search.value : '').trim().toLowerCase()
  renderInstanceContent()
}

function getFilteredInstanceContent() {
  const q = instanceContentFilter.q
  let list = instanceContentItems.filter(item => {
    if (instanceContentFilter.kind !== 'all' && item.kind !== instanceContentFilter.kind) return false
    if (instanceContentFilter.updatesOnly && !instanceUpdatesCache.has(item.id)) return false
    if (!q) return true
    const proj = instanceProjectCache.get(item.projectId || '')
    const hay = [item.baseName, item.file, item.kindLabel, item.dir, proj?.title, proj?.author].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })
  if (instanceContentFilter.sort === 'recent') {
    list = [...list].sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
  } else if (instanceContentFilter.sort === 'size') {
    list = [...list].sort((a, b) => (b.size || 0) - (a.size || 0))
  } else {
    list = [...list].sort((a, b) => String(a.baseName || a.file).localeCompare(String(b.baseName || b.file), undefined, { sensitivity: 'base' }))
  }
  return list
}

function contentKindIcon(kind) {
  if (kind === 'mod') return 'fa-puzzle-piece'
  if (kind === 'resourcepack') return 'fa-palette'
  if (kind === 'shader') return 'fa-wand-magic-sparkles'
  if (kind === 'datapack') return 'fa-database'
  return 'fa-cube'
}

function renderInstanceContent() {
  const list = document.getElementById('instance-content-list')
  if (!list) return
  setupInstanceContentDropZone()
  const items = getFilteredInstanceContent()
  const search = document.getElementById('instance-content-search')
  if (search && document.activeElement !== search) {
    search.placeholder = t('instance.searchContent', { count: instanceContentItems.length })
  }
  if (!instanceContentItems.length) {
    list.className = 'content-hub-list'
    renderEmpty('instance-content-list', t('instance.emptyMods'))
    syncInstanceContentBulk()
    return
  }
  if (!items.length) {
    list.className = 'content-hub-list'
    renderEmpty('instance-content-list', t('discover.noResults'))
    syncInstanceContentBulk()
    return
  }
  list.className = 'content-hub-list'
  const frag = document.createDocumentFragment()
  items.forEach(item => {
    const proj = item.projectId ? instanceProjectCache.get(item.projectId) : null
    const update = instanceUpdatesCache.get(item.id)
    const title = proj?.title || item.baseName
    const subtitle = proj ? (proj.author || '') : t('instance.uploaded')
    const versionLabel = update?.latestNumber && update.hasUpdate ? update.latestNumber : (proj?.version || t('instance.unknownVersion'))
    const row = document.createElement('div')
    row.className = 'content-hub-row' + (item.enabled ? '' : ' is-disabled')
    row.dataset.id = item.id
    // Icono / pfp original del proyecto
    const iconHtml = proj?.iconUrl
      ? '<span class="content-hub-icon has-img"><img src="' + escapeHtml(proj.iconUrl) + '" alt="" loading="lazy" onerror="this.remove()"></span>'
      : '<span class="content-hub-icon"><i class="fa-solid ' + contentKindIcon(item.kind) + '"></i></span>'
    const versionBtn = !item.projectId
      ? '<span class="content-hub-verbtn is-muted" title="' + escapeHtml(t('instance.uploadedHint')) + '"><i class="fa-solid fa-arrow-right-arrow-left"></i></span>'
      : update?.hasUpdate
        ? '<button type="button" class="content-hub-verbtn is-update" data-act="update" title="' + escapeHtml(t('instance.updateAvailable', { version: update.latestNumber || '' })) + '"><i class="fa-solid fa-download"></i></button>'
        : '<button type="button" class="content-hub-verbtn" data-act="versions" title="' + escapeHtml(t('instance.seeVersions')) + '"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>'
    row.innerHTML =
      '<button type="button" class="kindyr-check" data-act="select" aria-pressed="' + (instanceContentSelected.has(item.id) ? 'true' : 'false') + '" aria-label="' + escapeHtml(t('instance.selectAll') + ': ' + title) + '"><i class="fa-solid fa-check"></i></button>' +
      '<div class="content-hub-project">' + iconHtml +
        '<div class="content-hub-copy"><strong title="' + escapeHtml(item.file) + '">' + escapeHtml(title) + '</strong>' +
        '<span>' + (proj ? '<i class="fa-solid fa-circle-user"></i> ' + escapeHtml(subtitle) : '<i class="fa-solid fa-upload"></i> ' + escapeHtml(subtitle)) + ' · ' + escapeHtml(instanceContentKindLabel(item.kind)) + '</span></div>' +
      '</div>' +
      '<div class="content-hub-version"><strong>' + escapeHtml(versionLabel) + '</strong><span>' + escapeHtml(item.file) + '</span></div>' +
      '<div class="content-hub-actions">' + versionBtn +
        '<label class="content-hub-switch" title="' + escapeHtml(item.enabled ? t('instance.disable') : t('instance.enable')) + '"><input type="checkbox" data-act="toggle" ' + (item.enabled ? 'checked' : '') + '><span></span></label>' +
        '<button type="button" class="content-hub-iconbtn" data-act="delete" title="' + escapeHtml(t('confirm.delete')) + '"><i class="fa-regular fa-trash-can"></i></button>' +
        '<button type="button" class="content-hub-iconbtn" data-act="menu" title="⋮"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
      '</div>'
    row.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]')
      if (!btn) return
      ev.stopPropagation()
      const act = btn.dataset.act
      if (act === 'select') {
        if (instanceContentSelected.has(item.id)) instanceContentSelected.delete(item.id)
        else instanceContentSelected.add(item.id)
        btn.setAttribute('aria-pressed', instanceContentSelected.has(item.id) ? 'true' : 'false')
        syncInstanceContentSelectAll()
        syncInstanceContentBulk()
        return
      }
      if (act === 'toggle') { toggleInstanceContent(item); return }
      if (act === 'delete') { deleteInstanceContent(item); return }
      // Tanto ⬇ (update disponible) como ⇄ (ver versiones) abren el mismo
      // modal "Update version": el download preselecciona la última versión.
      if (act === 'update' || act === 'versions') { openInstanceContentVersions(item, act === 'update'); return }
      if (act === 'menu') { openInstanceContentMenu(item, btn); return }
    })
    frag.appendChild(row)
  })
  list.innerHTML = ''
  list.appendChild(frag)
  syncInstanceContentSelectAll()
  syncInstanceContentBulk()
  const updateBtn = document.getElementById('instance-update-all-btn')
  if (updateBtn) {
    const n = instanceUpdatesCache.size
    updateBtn.innerHTML = '<i class="fa-solid fa-download"></i> ' + escapeHtml(t('instance.updateAll') + (n ? ' (' + n + ')' : ''))
    updateBtn.classList.toggle('has-updates', n > 0)
  }
}

function syncInstanceContentBulk() {
  const bar = document.getElementById('instance-content-bulk')
  if (!bar) return
  const n = instanceContentSelected.size
  bar.hidden = n === 0
  const label = document.getElementById('instance-content-bulk-label')
  if (label) label.textContent = t('instance.selectedCount', { count: n })
}

function toggleSelectAllInstanceContent() {
  const items = getFilteredInstanceContent()
  const allSelected = items.length > 0 && items.every(i => instanceContentSelected.has(i.id))
  items.forEach(i => {
    if (allSelected) instanceContentSelected.delete(i.id)
    else instanceContentSelected.add(i.id)
  })
  renderInstanceContent()
}

function syncInstanceContentSelectAll() {
  const selectAll = document.getElementById('instance-content-selectall')
  if (!selectAll) return
  const items = getFilteredInstanceContent()
  selectAll.setAttribute('aria-pressed', items.length > 0 && items.every(i => instanceContentSelected.has(i.id)) ? 'true' : 'false')
}

async function enrichInstanceContentProjects(gen) {
  const ids = [...new Set(instanceContentItems.map(i => i.projectId).filter(Boolean))]
    .filter(id => !instanceProjectCache.has(id)).slice(0, 40)
  if (!ids.length) return
  await Promise.all(ids.map(async (projectId) => {
    try {
      const res = await window.kindyrAPI.modrinth.details({ projectId })
      if (gen !== instanceContentGen) return
      if (res && res.ok && res.details) {
        const d = res.details
        const author = (d.creators && d.creators[0] && d.creators[0].name) || d.author || ''
        instanceProjectCache.set(projectId, {
          title: d.title || projectId,
          iconUrl: d.iconUrl || '',
          author,
          version: '',
          url: d.url || ('https://modrinth.com/project/' + encodeURIComponent(projectId))
        })
      } else {
        instanceProjectCache.set(projectId, { title: projectId, iconUrl: '', author: '' })
      }
    } catch {
      if (gen === instanceContentGen) instanceProjectCache.set(projectId, { title: projectId, iconUrl: '', author: '' })
    }
  }))
  if (gen !== instanceContentGen) return
  // Completar número de versión instalada cuando hay meta versionId
  try {
    await Promise.all(instanceContentItems.filter(i => i.versionId && i.projectId).slice(0, 40).map(async (item) => {
      try {
        const versions = await window.kindyrAPI.modrinth.versions({ projectId: item.projectId })
        if (gen !== instanceContentGen || !versions.ok) return
        const v = (versions.versions || []).find(x => x.id === item.versionId)
        if (v) {
          const cached = instanceProjectCache.get(item.projectId) || { title: item.baseName }
          instanceProjectCache.set(item.projectId + ':' + item.versionId, { ...cached })
          item._versionNumber = v.version_number || v.name || ''
        }
      } catch {}
    }))
  } catch {}
  if (gen !== instanceContentGen) return
  // Pintar número de versión por item
  instanceContentItems.forEach(item => {
    if (item._versionNumber) {
      const cached = instanceProjectCache.get(item.projectId)
      if (cached && !cached.version) cached.version = item._versionNumber
    }
  })
  renderInstanceContent()
}

async function checkInstanceContentUpdates(gen) {
  if (!instanceContentItems.some(i => i.projectId)) return
  instanceUpdatesState = 'checking'
  try {
    const res = await window.kindyrAPI.instances.checkUpdates({ instanceId: selectedInstance })
    if (gen !== instanceContentGen) return
    if (res && res.ok && Array.isArray(res.updates)) {
      instanceUpdatesCache = new Map(res.updates.map(u => [u.id, u]))
      instanceUpdatesState = 'done'
      // Reflejar última versión conocida en la caché de proyecto para la columna Version
      res.updates.forEach(u => {
        const item = instanceContentItems.find(i => i.id === u.id)
        if (item && u.latestNumber) {
          const cached = instanceProjectCache.get(item.projectId)
          if (cached) cached._latest = u.latestNumber
        }
      })
      renderInstanceContent()
      renderInstanceContentFilters()
      if (res.updates.length) setStatus(t('instance.updatesFound', { count: res.updates.length }))
    } else {
      instanceUpdatesState = 'done'
    }
  } catch {
    instanceUpdatesState = 'done'
  }
}

// Identifica archivos subidos a mano por hash (Modrinth version_file):
// así recuperan pfp/título/autor/versión y entran al flujo de updates.
let instanceIdentifyAttempted = new Set()
let instanceIdentifyFor = ''
async function identifyInstanceContentFiles(gen) {
  if (instanceIdentifyFor !== selectedInstance) {
    instanceIdentifyFor = selectedInstance
    instanceIdentifyAttempted = new Set()
  }
  const pending = instanceContentItems.filter(i => !i.projectId && i.entryType !== 'folder' && !instanceIdentifyAttempted.has(selectedInstance + ':' + i.id))
  if (!pending.length || !window.kindyrAPI?.instances?.identifyContent) return
  pending.slice(0, 30).forEach(i => instanceIdentifyAttempted.add(selectedInstance + ':' + i.id))
  try {
    const res = await window.kindyrAPI.instances.identifyContent({ instanceId: selectedInstance, limit: 30 })
    if (gen !== instanceContentGen) return
    if (res && res.ok && Array.isArray(res.identified) && res.identified.length) {
      res.identified.forEach(found => {
        const item = instanceContentItems.find(i => i.id === found.id)
        if (!item) return
        item.projectId = found.projectId
        item.versionId = found.versionId
        item.uploaded = false
        if (found.versionNumber) item._versionNumber = found.versionNumber
        if (found.projectId) {
          instanceProjectCache.set(found.projectId, {
            title: found.title || item.baseName,
            iconUrl: found.iconUrl || '',
            author: found.author || '',
            version: found.versionNumber || '',
            url: found.url || ''
          })
        }
      })
      renderInstanceContent()
      renderInstanceContentFilters()
      // Los recién identificados también pueden tener updates
      checkInstanceContentUpdates(gen)
    }
  } catch {}
}

// Compat: el botón viejo "mostrar más" ya no existe en el hub (lista completa con scroll).
function toggleModsList() {}

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

// ===== Consola read-only del Centro de control =====
// Muestra latest.log completo SIN filtrar (sin colapsar espacios ni truncar
// líneas) + polling en vivo por byte. Solo lectura: sin entrada de comandos.
const INSTANCE_CONSOLE_POLL_MS = 1200
const INSTANCE_CONSOLE_MAX_LINES = 5000
let instanceConsole = null
// Sesiones terminadas: al cerrar el juego la consola se vacía y vuelve el
// ASCII, y no se recarga la cola vieja hasta el próximo inicio.
const consoleDeadInstances = new Set()

// Arte idle. Regla de color SOLO para el dibujo: # negro, B azul,
// : azul marino, K blanco. El resto usa el color de consola del tema.
const CONSOLE_FACE_ART = [
  ':##:#',
  '             ####::BBBBBBBBBBB::####',
  '         ####::BBBBBBBBBBBBBBBBBBB::####',
  '     ####::BBBBBBBBBBBBBBBBBBBBBBBBBBB:####',
  '   ####::BBBBBBBBBB:::::BBBBBBBBBBB::##::###',
  '   ###::###::BB::#::KK:###::BBB::##::KKK:###',
  '   ###::::::####KKKKKK:########:KKKKKKK:####',
  '   ##:::::::::#:KKKKKK:#####:KKKKKKKKK:#::##',
  '   ##:::::::::#:KKKKKK:###:KKKKKKKK:##:BBB##',
  '   ##:::::::::#:KKKKKK:::KKKKKKKK:#::BBBBB##',
  '   ##:::::::::#:KKKKKKKKKKKKKK::#:BBBBBBBB##',
  '   ##:::::::::#:KKKKKKKKKKKKKKK:##:BBBBBBB##',
  '   ##:::::::::#:KKKKKKKKKKKKKKKKKK::#::BBB##',
  '   ###::::::::#:KKKKKK:::KKKKKKKKKKKKK:##:##',
  '   ###::::::::#:KKKKKK:####::KKKKKKKKKKK:###',
  '     #####::::#:KKKKKK:###:::##:KKKKK::###',
  '         ######:KKKKK:####:BBBB:######',
  '             ####::#######:BB::###',
  '                 #############',
  '                      :##:'
]

function getInstanceConsole() {
  if (!instanceConsole) {
    instanceConsole = { instanceId: null, lines: [], carry: '', bytes: 0, timer: null, follow: true, running: false, pollCount: 0, busy: false, rendered: 0, showingAscii: false }
  }
  return instanceConsole
}

function stopInstanceConsole() {
  const st = getInstanceConsole()
  if (st.timer) { clearInterval(st.timer); st.timer = null }
}

async function startInstanceConsole() {
  const st = getInstanceConsole()
  stopInstanceConsole()
  if (st.instanceId !== selectedInstance) {
    instanceConsole = { instanceId: selectedInstance, lines: [], carry: '', bytes: 0, timer: null, follow: true, running: false, pollCount: 0, busy: false, rendered: 0, showingAscii: false }
  }
  renderInstanceConsole()
  // Sesión ya terminada: drenar hasta EOF para mostrar el ASCII en vez de la cola vieja.
  if (consoleDeadInstances.has(selectedInstance)) {
    await drainInstanceConsole()
    renderInstanceConsole()
  } else {
    await pollInstanceConsole(true)
  }
  getInstanceConsole().timer = setInterval(() => { pollInstanceConsole(false) }, INSTANCE_CONSOLE_POLL_MS)
}

// Vacía la vista y avanza hasta el final del archivo para no recargar lo viejo.
async function drainInstanceConsole() {
  const st = getInstanceConsole()
  st.lines = []
  st.carry = ''
  st.pollCount = 0
  st.rendered = 0
  try {
    if (window.kindyrAPI?.instances?.readConsole && st.instanceId) {
      const res = await window.kindyrAPI.instances.readConsole({ instanceId: st.instanceId, sizeOnly: true })
      st.bytes = (res && Number(res.nextByte)) || 0
    } else {
      st.bytes = 0
    }
  } catch { st.bytes = 0 }
}

// Botón limpiar: vacía la vista y drena hasta EOF para que el polling no
// recargue lo viejo (igual que al cerrar el juego). No borra el archivo.
async function clearInstanceConsoleView() {
  const st = getInstanceConsole()
  if (st.instanceId) consoleDeadInstances.add(st.instanceId)
  await drainInstanceConsole()
  renderInstanceConsole()
}

// Al cerrar el juego: desaparecen todos los logs y vuelve el ASCII.
async function clearInstanceConsoleFor(instanceId) {
  if (!instanceId) return
  consoleDeadInstances.add(instanceId)
  const st = getInstanceConsole()
  if (st.instanceId !== instanceId) return
  await drainInstanceConsole()
  renderInstanceConsole()
}

// Al iniciar el juego: la sesión revive (el próximo inicio trae logs nuevos).
function reviveInstanceConsole(instanceId) {
  if (!instanceId) return
  consoleDeadInstances.delete(instanceId)
}

async function pollInstanceConsole(initial) {
  const st = getInstanceConsole()
  if (st.busy) return
  if (currentSection !== 'instance-detail' || st.instanceId !== selectedInstance) return
  if (!window.kindyrAPI?.instances?.readConsole) return
  st.busy = true
  try {
    const res = await window.kindyrAPI.instances.readConsole({ instanceId: selectedInstance, fromByte: initial ? 0 : st.bytes })
    if (currentSection !== 'instance-detail' || st.instanceId !== selectedInstance) return
    if (!res || !res.ok) return
    if (res.reset || initial) {
      st.lines = []
      st.carry = ''
      st.bytes = 0
    }
    if (res.text) appendInstanceConsoleText(st, res.text)
    st.bytes = Number(res.nextByte) || st.bytes
    st.pollCount++
    if (st.pollCount % 10 === 1) syncInstanceConsoleRunning()
    else renderInstanceConsole()
  } catch {} finally {
    st.busy = false
  }
}

function appendInstanceConsoleText(st, text) {
  const chunk = st.carry + String(text || '')
  st.carry = ''
  if (!chunk) return
  const endsNewline = /(\r\n|\n)$/.test(chunk)
  const parts = chunk.split(/\r\n|\n/)
  if (!endsNewline) st.carry = parts.pop()
  for (const line of parts) st.lines.push(line)
  if (st.lines.length > INSTANCE_CONSOLE_MAX_LINES) {
    st.lines.splice(0, st.lines.length - INSTANCE_CONSOLE_MAX_LINES)
  }
}

async function syncInstanceConsoleRunning() {
  const st = getInstanceConsole()
  try {
    const res = await window.kindyrAPI.launcher.status()
    st.running = Boolean(res && res.running && (!res.instanceId || res.instanceId === st.instanceId))
  } catch { st.running = false }
  renderInstanceConsole()
}

function toggleInstanceConsoleFollow() {
  const st = getInstanceConsole()
  st.follow = !st.follow
  const btn = document.getElementById('instance-console-follow')
  if (btn) btn.classList.toggle('active', st.follow)
  if (st.follow) scrollInstanceConsoleToBottom()
}

function refreshInstanceConsole() {
  const st = getInstanceConsole()
  st.bytes = 0
  st.lines = []
  st.carry = ''
  st.pollCount = 0
  st.rendered = 0
  renderInstanceConsole()
  pollInstanceConsole(true)
}

async function copyInstanceConsole() {
  const st = getInstanceConsole()
  try {
    await navigator.clipboard.writeText(st.lines.join('\n'))
    setStatus(t('instance.console.copied'))
  } catch {}
}

function scrollInstanceConsoleToBottom() {
  const view = document.getElementById('instance-console-view')
  if (view) view.scrollTop = view.scrollHeight
}

// Severidad por línea para colorear como una terminal promedio (amarillo /
// rojo). Solo pinta: jamás filtra ni oculta líneas.
function classifyConsoleLine(line) {
  const text = String(line || '')
  if (/\[(?:[^\]\[]*\/)?(?:error|fatal|severe)\b/i.test(text)) return 'error'
  if (/\b(\w*exceptions?|fatal error|severe)\b/i.test(text)) return 'error'
  if (/\b(failed to|failure|could not|unable to|no se pudo|error:)/i.test(text)) return 'error'
  if (/\[(?:[^\]\[]*\/)?(?:warn|warning)\b/i.test(text)) return 'warn'
  if (/^\s*warn(ing)?\b/i.test(text)) return 'warn'
  return null
}

function consoleLineDiv(line) {
  const div = document.createElement('div')
  const level = classifyConsoleLine(line)
  div.className = 'console-line' + (level ? ' lvl-' + level : '')
  div.textContent = line
  return div
}

function renderInstanceConsole() {
  const st = getInstanceConsole()
  const view = document.getElementById('instance-console-view')
  if (!view) return
  const dot = document.getElementById('instance-console-dot')
  const statusText = document.getElementById('instance-console-status-text')
  const count = document.getElementById('instance-console-count')
  if (dot) dot.classList.toggle('live', st.running)
  if (statusText) statusText.textContent = st.running ? t('instance.console.live') : t('instance.console.stopped')
  if (count) count.textContent = t('instance.console.lines', { count: st.lines.length })
  const followBtn = document.getElementById('instance-console-follow')
  if (followBtn) followBtn.classList.toggle('active', st.follow)
  if (!st.lines.length && !st.carry) {
    // Estado idle: ASCII (no estaba en modo vivo o se limpió).
    if (!st.showingAscii) {
      renderInstanceConsoleIdle(view)
      st.showingAscii = true
    }
    st.rendered = 0
    return
  }
  // Reconstruir solo si cambió el modo o se recortó el buffer por delante.
  if (st.showingAscii || st.rendered > st.lines.length) {
    view.innerHTML = ''
    const frag = document.createDocumentFragment()
    for (const line of st.lines) frag.appendChild(consoleLineDiv(line))
    view.appendChild(frag)
    st.showingAscii = false
    st.rendered = st.lines.length
  } else if (st.rendered < st.lines.length) {
    // Incremental: solo las líneas nuevas (el poll corre cada ~1s).
    const nearBottomPre = view.scrollHeight - view.scrollTop - view.clientHeight < 48
    const frag = document.createDocumentFragment()
    for (let i = st.rendered; i < st.lines.length; i++) frag.appendChild(consoleLineDiv(st.lines[i]))
    const oldCarry = view.querySelector('.console-carry')
    if (oldCarry) oldCarry.remove()
    view.appendChild(frag)
    st.rendered = st.lines.length
    if (st.carry) {
      const carryDiv = document.createElement('div')
      carryDiv.className = 'console-line console-carry'
      carryDiv.textContent = st.carry
      view.appendChild(carryDiv)
    }
    if (st.follow && nearBottomPre) scrollInstanceConsoleToBottom()
    return
  }
  const oldCarry = view.querySelector('.console-carry')
  if (oldCarry) oldCarry.remove()
  if (st.carry) {
    const carryDiv = document.createElement('div')
    carryDiv.className = 'console-line console-carry'
    carryDiv.textContent = st.carry
    view.appendChild(carryDiv)
  }
  if (st.follow) {
    const nearBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 48
    if (nearBottom) scrollInstanceConsoleToBottom()
  }
}

function renderInstanceConsoleIdle(view) {
  view.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'console-ascii'
  const msgLines = String(t('instance.consoleIdle')).split('\n')
  const content = ['', ...msgLines, '']
  const boxWidth = Math.max(...content.map(l => l.length))
  const rows = [
    { text: '/' + '_'.repeat(boxWidth + 2) + '\\', art: false },
    ...content.map(l => ({ text: '| ' + l.padEnd(boxWidth, ' ') + ' |', art: false })),
    { text: ' ' + '\\' + '_'.repeat(boxWidth + 2) + '/', art: false },
    { text: '      \\', art: false },
    { text: '       \\', art: false },
    ...CONSOLE_FACE_ART.map(text => ({ text, art: true }))
  ]
  for (const row of rows) {
    const div = document.createElement('div')
    div.className = 'console-ascii-row'
    if (row.art) div.appendChild(renderAsciiColored(row.text))
    else div.textContent = row.text
    wrap.appendChild(div)
  }
  view.appendChild(wrap)
  view.scrollTop = 0
}

function renderAsciiColored(line) {
  const frag = document.createDocumentFragment()
  const classes = { '#': 'ascii-ink', 'B': 'ascii-blue', ':': 'ascii-navy', 'K': 'ascii-white' }
  let buf = ''
  let cls = null
  const flush = () => {
    if (!buf) return
    const span = document.createElement('span')
    if (cls) span.className = cls
    span.textContent = buf
    frag.appendChild(span)
    buf = ''
  }
  for (const ch of line) {
    const c = classes[ch] || null
    if (c !== cls) { flush(); cls = c }
    buf += ch
  }
  flush()
  return frag
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

async function toggleInstanceContent(item) {
  const result = await window.kindyrAPI.instances.toggleContent({ instanceId: selectedInstance, kind: item.kind, file: item.file })
  setStatus(result.ok ? t('instance.modUpdated') : (result.error || t('instance.modUpdated')))
  if (result.ok) {
    item.file = result.file || item.file
    item.id = item.kind + ':' + item.file
    item.enabled = !item.enabled
    item.baseName = String(item.file).replace(/\.disabled$/i, '')
    renderInstanceContent()
  }
}

function deleteInstanceContent(item) {
  const label = (instanceProjectCache.get(item.projectId || '')?.title) || item.baseName
  if (typeof showConfirm === 'function') {
    showConfirm(t('instance.deleteConfirm', { name: label }), async () => {
      const result = await window.kindyrAPI.instances.deleteContent({ instanceId: selectedInstance, kind: item.kind, file: item.file })
      setStatus(result.ok ? t('instance.deleted') : result.error)
      if (result.ok) refreshInstancePanel()
    })
  } else {
    refreshInstancePanel()
  }
}

async function bulkToggleInstanceContent(enable) {
  const ids = [...instanceContentSelected]
  for (const id of ids) {
    const item = instanceContentItems.find(i => i.id === id)
    if (!item || item.enabled === enable) continue
    try {
      const result = await window.kindyrAPI.instances.toggleContent({ instanceId: selectedInstance, kind: item.kind, file: item.file })
      if (result.ok) {
        item.file = result.file || item.file
        item.id = item.kind + ':' + item.file
        item.enabled = enable
        item.baseName = String(item.file).replace(/\.disabled$/i, '')
      }
    } catch {}
  }
  instanceContentSelected = new Set()
  renderInstanceContent()
}

async function bulkDeleteInstanceContent() {
  const ids = [...instanceContentSelected]
  const doDelete = async () => {
    for (const id of ids) {
      const item = instanceContentItems.find(i => i.id === id)
      if (!item) continue
      try { await window.kindyrAPI.instances.deleteContent({ instanceId: selectedInstance, kind: item.kind, file: item.file }) } catch {}
    }
    instanceContentSelected = new Set()
    refreshInstancePanel()
  }
  if (typeof showConfirm === 'function') showConfirm(t('instance.deleteBulkConfirm', { count: ids.length }), doDelete)
  else doDelete()
}

async function uploadInstanceFiles() {
  setStatus(t('instance.uploading'))
  const hint = instanceContentFilter.kind !== 'all' ? instanceContentFilter.kind : 'mod'
  const result = await window.kindyrAPI.instances.uploadFiles({ instanceId: selectedInstance, kindHint: hint })
  if (result.cancelled) { setStatus(t('app.ready')); return }
  if (!result.ok) { setStatus(result.error); return }
  setStatus(uploadResultStatus(result))
  refreshInstancePanel()
}

// Mensaje de estado compartido diálogo/drop: subidos + omitidos. Si algún
// omitido es un modpack completo se muestra la guía al instalador en vez de
// un conteo genérico (es el caso que más confunde: el archivo "desaparece").
// Para el resto, el primer motivo conocido con mensaje propio (los demás
// quedan en el conteo).
const UPLOAD_SKIP_MESSAGE_KEY = {
  'is-modpack': 'instance.uploadIsModpack',
  type: 'instance.uploadSkipType',
  'too-large': 'instance.uploadSkipTooLarge',
  unrecognized: 'instance.uploadSkipUnknown',
  unreadable: 'instance.uploadSkipUnreadable'
}
function uploadResultStatus(result) {
  const copied = (result.copied || []).length
  const skipped = result.skipped || []
  let status = t('instance.uploadedOk', { count: copied })
  if (skipped.length) {
    const noted = skipped.find(s => s && UPLOAD_SKIP_MESSAGE_KEY[s.reason])
    status += ' ' + (noted
      ? t(UPLOAD_SKIP_MESSAGE_KEY[noted.reason], { file: noted.file })
      : t('instance.uploadSkipped', { count: skipped.length }))
  }
  return status
}

// Drag&drop de archivos ÚNICAMENTE sobre el panel "Contenido adicional"
// (.content-hub: título, toolbar, filtros y lista). Todo lo demás rechaza.
// En Electron solo un drop real del SO puebla File.path; los eventos
// sintéticos desde JS llegan con isTrusted=false y sin paths, y se ignoran
// aquí. La frontera real igual es main, que revalida cada ruta.
// Se enlaza sobre #instance-detail-view (nodo estático que nunca se recrea)
// filtrando por .content-hub más cercano: así no depende del momento del
// render ni se pierde si el panel se reconstruye.
function setupInstanceContentDropZone() {
  guardWindowDropNavigation()
  const view = document.getElementById('instance-detail-view')
  if (!view || view.dataset.contentDropBound) return
  view.dataset.contentDropBound = '1'
  const hubFromEvent = (event) => {
    const target = event.target
    if (!target || typeof target.closest !== 'function') return null
    return target.closest('.content-hub')
  }
  const clearHighlight = () => {
    view.querySelectorAll('.content-hub.is-drop-target').forEach(el => el.classList.remove('is-drop-target'))
  }
  view.addEventListener('dragenter', (event) => {
    const hub = hubFromEvent(event)
    if (!selectedInstance || !hub) return
    event.preventDefault()
    // Sin dropEffect explícito, Chromium/Windows sigue mostrando el cursor
    // de prohibido (🚫) aunque el drop esté permitido.
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    hub.classList.add('is-drop-target')
  })
  view.addEventListener('dragover', (event) => {
    if (!selectedInstance || !hubFromEvent(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  })
  view.addEventListener('dragleave', (event) => {
    if (!hubFromEvent(event)) clearHighlight()
  })
  view.addEventListener('drop', (event) => {
    event.preventDefault()
    clearHighlight()
    const hub = hubFromEvent(event)
    if (!event.isTrusted || !selectedInstance || !hub) return
    collectDroppedPaths(event).then((collected) => {
      const paths = collected.paths || []
      const blobs = collected.blobs || []
      if (paths.length || blobs.length) { uploadDroppedFiles(paths, undefined, collected); return }
      // Diagnóstico permanente: sin esto es imposible saber del lado soporte
      // si el SO no entregó nada, si vino solo texto o si eran carpetas.
      setStatus(t(collected.sawFolder ? 'instance.dropFolder' : 'instance.dropEmpty') + ' [' + describeDropData(event.dataTransfer) + ']')
    }).catch(() => setStatus(t('instance.dropEmpty')))
  })
}

// Huella del contenido del drop para diagnóstico (qué entregó el SO).
// Incluye marcador de build del código drop (dz:N): al reportar un problema,
// pegar el mensaje COMPLETO permite saber qué versión del código lo generó.
// REGLA: incrementar DROP_BUILD en cada cambio al flujo de drop; quitarlo
// cuando el feature se declare estable.
const DROP_BUILD = 3
function describeDropData(dt) {
  try {
    const files = (dt && dt.files && dt.files.length) || 0
    const items = Array.from((dt && dt.items) || []).map(i => ((i && i.kind) || '?') + ':' + ((i && i.type) || '?')).join(',')
    const types = Array.from((dt && dt.types) || []).join(',')
    return `archivos:${files} items:[${items}] tipos:[${types}] dz:${DROP_BUILD}`
  } catch { return 'indisponible dz:' + DROP_BUILD }
}

// file:// URL o ruta Windows en texto -> 'E:\dir\file' canónica para main.
// Orígenes como Firefox/Outlook pegan URIs en vez de Files con .path.
function fileUriToPath(uri) {
  let p = String(uri || '').trim().replace(/^<|>$/g, '')
  if (!p || p.startsWith('#')) return ''
  if (/^file:\/\//i.test(p)) {
    try {
      const u = new URL(p)
      if (u.protocol.toLowerCase() !== 'file:') return ''
      p = decodeURIComponent(u.pathname)
    } catch { return '' }
  }
  const drive = p.match(/^\/([A-Za-z]:[\/\\])/)
  if (drive) p = p.slice(1)
  p = p.replace(/\//g, '\\')
  if (!/^[A-Za-z]:\\/.test(p)) return ''
  return p
}

// file.path solo lo pueblan drops reales del Explorador. Gestores virtuales
// (WinRAR/7-Zip abierto, Firefox, Outlook) mandan items de texto con URIs o
// entradas de directorio: se resuelven aquí; main revalida todo igual.
// Tope espejo de MAX_UPLOAD_BLOB_BYTES (content-sniff.js): los bytes viajan
// en memoria por IPC; más que esto ni se serializa (main lo rechazaría igual
// tras pagar el transporte, así que se corta aquí con motivo visible).
const MAX_RENDERER_BLOB_BYTES = 256 * 1024 * 1024

async function collectDroppedPaths(event) {
  const out = { paths: [], blobs: [], localSkipped: [], sawFolder: false }
  const dt = event.dataTransfer
  const files = Array.from(dt?.files || [])
  const fromFiles = []
  for (const f of files) {
    if (f && typeof f.path === 'string' && f.path) { fromFiles.push(f.path); continue }
    // Archivo en memoria sin ruta (orígenes virtuales, adjuntos, Firefox):
    // se mandan los bytes y main los valida igual (staging + pipeline).
    if (!f || typeof f.arrayBuffer !== 'function') continue
    const name = (f.name && String(f.name).slice(0, 120)) || 'archivo'
    if ((f.size || 0) > MAX_RENDERER_BLOB_BYTES) { out.localSkipped.push({ file: name, reason: 'too-large' }); continue }
    try {
      const buf = await f.arrayBuffer()
      if (!(buf instanceof ArrayBuffer) || !buf.byteLength) continue
      out.blobs.push({ name, bytes: new Uint8Array(buf) })
    } catch {}
  }
  if (fromFiles.length) out.paths = fromFiles
  // Sin early-return: un drop mixto puede traer archivos con ruta, blobs en
  // memoria y texto a la vez; cada rama aporta lo suyo sin duplicar (los
  // File con path ya salieron por fromFiles; sus entradas se ignoran abajo).
  const items = Array.from(dt?.items || [])
  for (const item of items) {
    let entry = null
    try { entry = item && typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null } catch {}
    if (entry && entry.isDirectory) { out.sawFolder = true; continue }
    if (!item || item.kind !== 'string') continue
    if (item.type !== 'text/uri-list' && item.type !== 'text/plain') continue
    let text = ''
    try { text = await new Promise(resolve => { item.getAsString(s => resolve(s || '')) }) } catch {}
    for (const line of String(text).split(/\r?\n/)) {
      const p = fileUriToPath(line)
      if (p && !out.paths.includes(p)) out.paths.push(p)
    }
  }
  return out
}

// Un drop fuera de la zona navegaría la ventana al file:// soltado (permitido
// por hardenWindowNavigation) y dejaría la vista en blanco: se anula a nivel
// ventana sin interferir con el handler de la zona (corre antes, por bubbling).
function guardWindowDropNavigation() {
  if (window.__kindyrDropGuard) return
  window.__kindyrDropGuard = true
  ;['dragover', 'drop'].forEach(type => window.addEventListener(type, (event) => {
    event.preventDefault()
  }))
}

async function uploadDroppedFiles(paths, instanceId, collected = {}) {
  const targetId = instanceId || selectedInstance
  if (!targetId) return
  setStatus(t('instance.uploading'))
  const hint = instanceContentFilter.kind !== 'all' ? instanceContentFilter.kind : 'mod'
  const payload = { instanceId: targetId, kindHint: hint }
  if (Array.isArray(paths) && paths.length) payload.filePaths = paths
  const blobs = Array.isArray(collected.blobs) ? collected.blobs : []
  if (blobs.length) payload.fileBlobs = blobs
  let result
  try {
    result = await window.kindyrAPI.instances.uploadFiles(payload)
  } catch (error) {
    setStatus((error && error.message) || String(error))
    return
  }
  if (result.cancelled) { setStatus(t('app.ready')); return }
  if (!result.ok) { setStatus(result.error); return }
  // Skips decididos en renderer (p. ej. blob gigante) se suman a los de main.
  const localSkipped = Array.isArray(collected.localSkipped) ? collected.localSkipped : []
  setStatus(uploadResultStatus({ copied: result.copied || [], skipped: [...(result.skipped || []), ...localSkipped] }))
  // La subida siempre es a la instancia abierta (único destino posible).
  if (targetId === selectedInstance) refreshInstancePanel()
}

async function updateSingleInstanceContent(item) {
  setStatus(t('instance.updating', { name: item.baseName }))
  const result = await window.kindyrAPI.instances.updateContent({ instanceId: selectedInstance, kind: item.kind, file: item.file })
  setStatus(result.ok ? t('instance.updatedOk', { name: item.baseName }) : (result.error || t('instance.updateError')))
  if (result.ok) refreshInstancePanel()
}

async function updateAllInstanceContent() {
  if (!instanceUpdatesCache.size) {
    // Intentar chequeo fresco antes de decir que no hay nada
    await checkInstanceContentUpdates(instanceContentGen)
    if (!instanceUpdatesCache.size) { setStatus(t('instance.noUpdates')); return }
  }
  setStatus(t('instance.updatingAll', { count: instanceUpdatesCache.size }))
  const result = await window.kindyrAPI.instances.updateAllContent({ instanceId: selectedInstance })
  setStatus(result.ok ? t('instance.updatedAll', { count: result.updated }) : result.error)
  if (result.ok) refreshInstancePanel()
}

// ===== Modal "Update version" (⬇ y ⇄ abren el mismo) =====
// Izquierda: buscador + lista de versiones con badge de canal (A/B/R) y "Current".
// Derecha: número + pill de canal + fecha, changelog, loaders/versiones.
// Footer: aviso de backup + Cancel + "Update to X".
let contentVersionsState = null
const contentVersionDetailCache = new Map()

function versionChannelOf(v) {
  const raw = String(v?.version_type || v?.versionType || 'release').toLowerCase()
  if (raw === 'alpha') return { id: 'alpha', letter: 'A', label: 'Alpha' }
  if (raw === 'beta') return { id: 'beta', letter: 'B', label: 'Beta' }
  return { id: 'release', letter: 'R', label: 'Release' }
}

function formatVersionDate(iso) {
  const ms = Date.parse(iso || '')
  if (!Number.isFinite(ms)) return ''
  try {
    return new Date(ms).toLocaleDateString(settings.language === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return String(iso).slice(0, 10) }
}

function ensureContentVersionsModal() {
  let modal = document.getElementById('content-versions-modal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.id = 'content-versions-modal'
  modal.innerHTML = '<div class="account-modal content-versions-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">' +
    '<div class="modal-head content-versions-head"><span class="content-versions-pfp" id="content-versions-pfp"></span>' +
    '<div class="modal-title" id="content-versions-title"></div>' +
    '<button type="button" class="content-versions-close" onclick="closeInstanceContentVersions()" aria-label="×"><i class="fa-solid fa-xmark"></i></button></div>' +
    '<div class="content-versions-body">' +
    '<div class="content-versions-side"><label class="content-versions-search"><i class="fa-solid fa-magnifying-glass"></i>' +
    '<input id="content-versions-search" autocomplete="off"></label>' +
    '<div id="content-versions-list" class="content-versions-list"></div>' +
    '<button type="button" class="content-versions-incompat" id="content-versions-incompat" onclick="toggleContentVersionsIncompatible()"></button></div>' +
    '<div class="content-versions-main" id="content-versions-main"></div>' +
    '</div>' +
    '<div class="content-versions-foot"><div class="content-versions-warn"><i class="fa-solid fa-triangle-exclamation"></i><span id="content-versions-warn-text"></span></div>' +
    '<div class="content-versions-footbtns"><button type="button" class="secondary-btn" onclick="closeInstanceContentVersions()" id="content-versions-cancel"></button>' +
    '<button type="button" class="primary-btn content-versions-update" id="content-versions-update"></button></div></div></div>'
  modal.addEventListener('click', (ev) => { if (ev.target === modal) closeInstanceContentVersions() })
  document.body.appendChild(modal)
  return modal
}

function closeInstanceContentVersions() {
  document.getElementById('content-versions-modal')?.classList.remove('active')
  contentVersionsState = null
}

function toggleContentVersionsIncompatible() {
  if (!contentVersionsState) return
  contentVersionsState.showIncompatible = !contentVersionsState.showIncompatible
  renderContentVersionsList()
}

function filterContentVersionsList() {
  if (!contentVersionsState) return
  contentVersionsState.q = String(document.getElementById('content-versions-search')?.value || '').trim().toLowerCase()
  renderContentVersionsList()
}

function getVisibleContentVersions() {
  const st = contentVersionsState
  if (!st) return []
  return st.versions.filter(v => {
    if (!st.showIncompatible && !v._compat) return false
    if (st.q && !String(v.version_number || v.name || '').toLowerCase().includes(st.q)) return false
    return true
  })
}

function renderContentVersionsList() {
  const st = contentVersionsState
  if (!st) return
  const listEl = document.getElementById('content-versions-list')
  const incompatBtn = document.getElementById('content-versions-incompat')
  if (incompatBtn) {
    incompatBtn.innerHTML = '<i class="fa-regular fa-eye' + (st.showIncompatible ? '-slash' : '') + '"></i> ' + escapeHtml(st.showIncompatible ? t('instance.hideIncompatible') : t('instance.showIncompatible'))
    incompatBtn.classList.toggle('active', st.showIncompatible)
  }
  const visible = getVisibleContentVersions()
  if (!visible.length) {
    listEl.innerHTML = '<div class="muted-empty">' + escapeHtml(t('discover.noResults')) + '</div>'
    return
  }
  listEl.innerHTML = ''
  const frag = document.createDocumentFragment()
  visible.forEach(v => {
    const ch = versionChannelOf(v)
    const isCurrent = v.id === st.item.versionId
    const isSelected = v.id === st.selectedId
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'content-versions-item' + (isSelected ? ' selected' : '') + (isCurrent ? ' is-current' : '')
    row.innerHTML = '<span class="content-versions-channel channel-' + ch.id + '">' + ch.letter + '</span>' +
      '<span class="content-versions-itemname">' + escapeHtml(v.version_number || v.name || v.id) + '</span>' +
      (isCurrent ? '<span class="content-versions-current">' + escapeHtml(t('instance.current')) + '</span>' : '')
    row.addEventListener('click', () => selectContentVersion(v.id))
    frag.appendChild(row)
  })
  listEl.appendChild(frag)
  const selectedEl = listEl.querySelector('.content-versions-item.selected')
  if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
    try { selectedEl.scrollIntoView({ block: 'nearest' }) } catch {}
  }
}

async function selectContentVersion(versionId) {
  const st = contentVersionsState
  if (!st) return
  st.selectedId = versionId
  renderContentVersionsList()
  const mainEl = document.getElementById('content-versions-main')
  const updateBtn = document.getElementById('content-versions-update')
  const v = st.versions.find(x => x.id === versionId)
  if (!v) return
  const ch = versionChannelOf(v)
  const isCurrent = v.id === st.item.versionId
  mainEl.innerHTML = '<div class="content-versions-maintop"><strong>' + escapeHtml(v.version_number || v.name || '') + '</strong>' +
    '<span class="content-versions-channelpill channel-' + ch.id + '">' + escapeHtml(ch.label) + '</span>' +
    '<span class="content-versions-date">' + escapeHtml(formatVersionDate(v.date_published)) + '</span></div>' +
    '<div class="content-versions-sub"><i class="fa-regular fa-file-lines"></i> ' + escapeHtml(t('instance.changelogTitle')) + ' · ' + escapeHtml((v.loaders || []).join(' + ') || 'Minecraft') + ' · ' + escapeHtml((v.game_versions || []).slice(0, 3).join(', ')) + '</div>' +
    '<div class="content-versions-changelog" id="content-versions-changelog"><div class="muted-empty">' + escapeHtml(t('install.loadingVersions')) + '</div></div>'
  if (updateBtn) {
    updateBtn.innerHTML = '<i class="fa-solid fa-download"></i> ' + escapeHtml(t('instance.updateTo', { version: v.version_number || v.name || '' }))
    updateBtn.disabled = isCurrent
    updateBtn.onclick = () => installSelectedContentVersion()
  }
  // Detalle con changelog (cacheado por versión)
  let detail = contentVersionDetailCache.get(versionId)
  if (!detail) {
    try {
      const res = await window.kindyrAPI.modrinth.version({ versionId })
      if (!contentVersionsState || contentVersionsState.selectedId !== versionId) return
      if (res && res.ok && res.version) {
        detail = res.version
        contentVersionDetailCache.set(versionId, detail)
      }
    } catch {}
  }
  if (!contentVersionsState || contentVersionsState.selectedId !== versionId) return
  const box = document.getElementById('content-versions-changelog')
  if (!box) return
  const html = detail?.changelogHtml || ''
  if (html) {
    // S1: nunca innerHTML directo con HTML de proveedor (XSS vía
    // <img onerror>, <svg onload>, javascript:). Se sanea primero.
    box.innerHTML = sanitizeChangelogHtml(html) || '<div class="muted-empty">' + escapeHtml(t('instance.noChangelog')) + '</div>'
    box.querySelectorAll('a').forEach(a => {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    })
  } else {
    box.innerHTML = '<div class="muted-empty">' + escapeHtml(t('instance.noChangelog')) + '</div>'
  }
}

async function installSelectedContentVersion() {
  const st = contentVersionsState
  if (!st || !st.selectedId || st.selectedId === st.item.versionId) return
  const updateBtn = document.getElementById('content-versions-update')
  if (updateBtn) updateBtn.disabled = true
  setStatus(t('install.installing'))
  const r = await window.kindyrAPI.instances.setContentVersion({ instanceId: selectedInstance, kind: st.item.kind, file: st.item.file, versionId: st.selectedId })
  setStatus(r.ok ? t('instance.updatedOk', { name: st.item.baseName }) : (r.error || t('instance.updateError')))
  if (r.ok) { closeInstanceContentVersions(); refreshInstancePanel() }
  else if (updateBtn) updateBtn.disabled = false
}

async function openInstanceContentVersions(item, preselectLatest = false) {
  if (!item.projectId) { setStatus(t('instance.uploadedHint')); return }
  const modal = ensureContentVersionsModal()
  const proj = instanceProjectCache.get(item.projectId) || { title: item.baseName }
  const pfp = document.getElementById('content-versions-pfp')
  if (pfp) {
    pfp.innerHTML = proj.iconUrl
      ? '<img src="' + escapeHtml(proj.iconUrl) + '" alt="" onerror="this.remove()">'
      : '<i class="fa-solid ' + contentKindIcon(item.kind) + '"></i>'
    pfp.classList.toggle('has-img', Boolean(proj.iconUrl))
  }
  document.getElementById('content-versions-title').textContent = t('instance.updateVersion')
  document.getElementById('content-versions-warn-text').textContent = t('instance.updateWarning')
  document.getElementById('content-versions-cancel').textContent = t('install.cancel')
  const search = document.getElementById('content-versions-search')
  if (search) {
    search.placeholder = t('instance.searchVersion')
    search.value = ''
    search.oninput = filterContentVersionsList
  }
  document.getElementById('content-versions-list').innerHTML = '<div class="muted-empty">' + escapeHtml(t('install.loadingVersions')) + '</div>'
  document.getElementById('content-versions-main').innerHTML = ''
  const updateBtn = document.getElementById('content-versions-update')
  if (updateBtn) { updateBtn.innerHTML = ''; updateBtn.disabled = true; updateBtn.onclick = null }
  modal.classList.add('active')
  try {
    const instance = launcherInstances.find(i => i.id === selectedInstance)
    const res = await window.kindyrAPI.modrinth.versions({ projectId: item.projectId })
    if (!document.getElementById('content-versions-modal')?.classList.contains('active')) return
    if (!res.ok) {
      document.getElementById('content-versions-list').innerHTML = '<div class="muted-empty">' + escapeHtml(res.error || t('home.searchFailed')) + '</div>'
      return
    }
    const all = res.versions || []
    if (!all.length) {
      document.getElementById('content-versions-list').innerHTML = '<div class="muted-empty">' + escapeHtml(t('install.noVersions')) + '</div>'
      return
    }
    const mcVersion = instance?.version || ''
    const versions = all.map(v => ({ ...v, _compat: !mcVersion || (v.game_versions || []).includes(mcVersion) }))
    const latestUpdate = instanceUpdatesCache.get(item.id)
    let selectedId = item.versionId
    if (preselectLatest && latestUpdate?.latestVersionId && versions.some(v => v.id === latestUpdate.latestVersionId)) {
      selectedId = latestUpdate.latestVersionId
    }
    if (!versions.some(v => v.id === selectedId)) {
      const firstCompat = versions.find(v => v._compat)
      selectedId = (firstCompat || versions[0]).id
    }
    contentVersionsState = { item, versions, selectedId, showIncompatible: false, q: '' }
    // Si la actual es incompatible, mostrar todo para no dejar la lista vacía
    if (!versions.some(v => v.id === selectedId && v._compat)) contentVersionsState.showIncompatible = true
    renderContentVersionsList()
    selectContentVersion(selectedId)
  } catch (e) {
    document.getElementById('content-versions-list').innerHTML = '<div class="muted-empty">' + escapeHtml(e.message || String(e)) + '</div>'
  }
}

function openInstanceContentMenu(item, anchorBtn) {
  document.querySelectorAll('.content-hub-menu').forEach(m => m.remove())
  const menu = document.createElement('div')
  menu.className = 'content-hub-menu'
  const proj = instanceProjectCache.get(item.projectId || '')
  menu.innerHTML =
    (item.projectId ? '<button type="button" data-m="open"><i class="fa-solid fa-arrow-up-right-from-square"></i> ' + escapeHtml(t('instance.viewOnModrinth')) + '</button>' : '') +
    '<button type="button" data-m="folder"><i class="fa-regular fa-folder-open"></i> ' + escapeHtml(t('instance.openFolder')) + '</button>' +
    '<button type="button" data-m="copy"><i class="fa-regular fa-copy"></i> ' + escapeHtml(t('instance.copyName')) + '</button>'
  document.body.appendChild(menu)
  const rect = anchorBtn.getBoundingClientRect()
  menu.style.top = (rect.bottom + window.scrollY + 4) + 'px'
  menu.style.left = Math.max(8, rect.right + window.scrollX - 210) + 'px'
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close) } }
  setTimeout(() => document.addEventListener('click', close), 0)
  menu.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-m]')
    if (!btn) return
    const act = btn.dataset.m
    menu.remove()
    if (act === 'folder') {
      const map = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' }
      openInstanceTarget(map[item.kind] || 'mods')
    } else if (act === 'copy') {
      try { await navigator.clipboard.writeText(item.file) } catch {}
      setStatus(item.file)
    } else if (act === 'open') {
      const url = proj?.url || ('https://modrinth.com/project/' + encodeURIComponent(item.projectId))
      if (window.kindyrAPI?.modrinth?.openProject) window.kindyrAPI.modrinth.openProject(url)
      else window.open?.(url, '_blank')
    }
  })
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
  await afterModpackImport(result)
}

// Post-import .mrpack: refresh + preparación eager (Java+MC) si está
// activada + vista de la instancia. Con la opción apagada, comportamiento
// anterior (quedarse en la lista con el estado).
async function afterModpackImport(result) {
  if (!result) return
  if (!result.ok) {
    if (result.cancelled) setStatus(t('app.ready'))
    else setStatus(result.error || t('instances.importError'))
    return
  }
  if (typeof refreshLauncherInstances === 'function') await refreshLauncherInstances()
  if (result.instanceId) {
    const prepState = await runEagerPrepare(result.instanceId, result.name)
    if (prepState !== 'off') {
      openInstanceView(result.instanceId)
      return
    }
  }
  if (result.warnings) {
    setStatus(t('instances.importSuccess', { name: result.name }) + ` (${result.warnings} mod(s) fallaron)`)
  } else {
    setStatus(t('instances.importSuccess', { name: result.name }))
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

// Preparación eager (Java + Minecraft) con toast de progreso, para creación
// e instalación de instancias y modpacks. Respeta el ajuste
// settings.eagerPrepareOnCreate. No navega: el llamador decide.
// Devuelve 'ready' (lista), 'failed' (se intentó, falló) u 'off' (desactivado).
async function runEagerPrepare(instanceId, instanceName) {
  if (!settings.eagerPrepareOnCreate || !window.kindyrAPI?.instances?.prepare) return 'off'
  const displayName = instanceName || instanceId
  showPrepareToast(displayName, t('settings.prepare.preparing', { name: displayName }))
  setStatus(t('settings.prepare.preparing', { name: displayName }))
  let lastPercent = 5
  updatePrepareToast(lastPercent, t('settings.prepare.preparing', { name: displayName }), 'Iniciando')
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
    const prep = await window.kindyrAPI.instances.prepare(instanceId)
    if (!prep || !prep.ok) {
      const err = prep?.error || t('settings.prepare.failed', { name: displayName })
      updatePrepareToast(lastPercent, err, 'Error')
      setStatus(err)
      setTimeout(() => hidePrepareToast(), 3000)
      await new Promise(r => setTimeout(r, 1200))
      hidePrepareToast(true)
      await refreshLauncherInstances()
      return 'failed'
    }
    // Esperar a que termine la preparación en segundo plano
    let attempts = 0
    while (attempts < 360) {
      await new Promise(r => setTimeout(r, 500))
      try {
        const st = await window.kindyrAPI.instances.prepareStatus()
        if (!st.preparing.includes(instanceId)) break
      } catch {}
      attempts++
    }
    updatePrepareToast(100, t('settings.prepare.prepared', { name: displayName }), 'Listo')
    setStatus(t('settings.prepare.prepared', { name: displayName }))
    await new Promise(r => setTimeout(r, 700))
    hidePrepareToast(true)
    await refreshLauncherInstances()
    return 'ready'
  } catch (e) {
    updatePrepareToast(lastPercent, e.message || t('settings.prepare.failed', { name: displayName }), 'Error')
    setStatus(t('settings.prepare.failed', { name: displayName }))
    setTimeout(() => hidePrepareToast(true), 3000)
    await refreshLauncherInstances()
    return 'failed'
  } finally {
    try { off() } catch {}
  }
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

  const prepState = await runEagerPrepare(result.instance.id, result.instance.name)
  openInstanceView(result.instance.id)
  if (prepState === 'off') setStatus(t('create.created', { name: result.instance.name }))
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

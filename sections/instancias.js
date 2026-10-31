// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Lógica de la sección instancias (cargada por navigation.js tras inyectar
// sections/instancias.html; la CSP ya no admite scripts inline).
function updateInstancesSummary(visibleCount = null) {
  const instances = Array.isArray(launcherInstances) ? launcherInstances : []
  const vanilla = instances.filter(instance => !instance.loader || instance.loader === 'vanilla').length
  const total = instances.length
  const values = {
    'instances-total': total,
    'instances-vanilla': vanilla,
    'instances-modded': total - vanilla,
    'instances-visible': visibleCount === null ? total : visibleCount
  }
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id)
    if (element) element.textContent = value
  })
}

function renderLauncherInstancesList() {
  const list = document.getElementById('versions-list')
  if (!list) return
  list.innerHTML = ''
  updateInstancesSummary()
  if (!launcherInstances || !launcherInstances.length) {
    list.innerHTML = '<div class="instances-empty"><i class="fa-solid fa-layer-group"></i><span>' + escapeHtml(t('instances.empty')) + '</span></div>'
    return
  }

  const chunkSize = 10
  let idx = 0

  function renderChunk() {
    const frag = document.createDocumentFragment()
    for (let i = 0; i < chunkSize && idx < launcherInstances.length; i++, idx++) {
      const instance = launcherInstances[idx]
      const div = document.createElement('div')
      const loader = instance.loader || 'vanilla'
      const initial = String(instance.name || 'M').charAt(0).toUpperCase()
      div.className = 'version-row instance-card'
      div.dataset.instance = instance.id
      div.dataset.version = instance.version
      div.dataset.search = [instance.name, instance.version, loader, instance.type].filter(Boolean).join(' ').toLowerCase()
      div.dataset.click = 'openInstanceView'
      div.dataset.args = '["$this"]'
      div.innerHTML = '<div class="instance-card-head">' +
        (typeof instanceIconHtml === 'function' ? instanceIconHtml(instance, 'instance-card-icon') : '<div class="instance-card-icon">' + escapeHtml(initial) + '</div>') +
        '<div class="version-info"><strong>' + escapeHtml(instance.name) + '</strong>' +
          '<span>' + escapeHtml(loader + ' · ' + instance.version + (instance.type === 'modpack' ? ' · Modpack' : '')) + '</span></div>' +
        '<div class="version-badge">' + escapeHtml(loader) + '</div>' +
      '</div>' +
      '<div class="instance-card-footer">' +
        '<span class="instance-version-chip"><i class="fa-solid fa-cube"></i> ' + escapeHtml(instance.version) + '</span>' +
        '<div class="instance-card-actions">' +
          '<button type="button" class="icon-action" data-click="openInstanceFolder" data-args="[&quot;$event&quot;,&quot;$this&quot;]" title="' + escapeHtml(t('instance.openFolder')) + '" aria-label="' + escapeHtml(t('instance.openFolder')) + '"><i class="fa-regular fa-folder-open"></i></button>' +
          '<button type="button" class="version-action" data-click="openInstanceFromList" data-args="[&quot;$event&quot;,&quot;$this&quot;]">' + escapeHtml(t('instances.open')) + ' <i class="fa-solid fa-arrow-right"></i></button>' +
        '</div>' +
      '</div>'
      frag.appendChild(div)
    }
    list.appendChild(frag)
    if (idx < launcherInstances.length) setTimeout(renderChunk, 0)
  }

  renderChunk()
}

function selectVersionFromList(row) {
  applySelectedInstance(row)
  syncSelectedVersion()
}

function useVersion(event, button) {
  event.stopPropagation()
  openInstanceView(button.closest('.version-row'))
}

function filterVersions() {
  const search = document.getElementById('version-search').value.trim().toLowerCase()
  let visible = 0
  document.querySelectorAll('.version-row').forEach(row => {
    const matches = !search || String(row.dataset.search || row.dataset.version || '').includes(search)
    row.style.display = matches ? '' : 'none'
    if (matches) visible++
  })
  updateInstancesSummary(visible)
}


if (typeof refreshLauncherInstances === 'function') {
  refreshLauncherInstances()
}
async function importMrpack() {
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

  if (typeof afterModpackImport === 'function') {
    await afterModpackImport(result)
  } else if (result.ok) {
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

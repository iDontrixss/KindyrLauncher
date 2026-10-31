// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Lógica de la sección inicio (cargada por navigation.js tras inyectar
// sections/inicio.html; la CSP ya no admite scripts inline).
var KEO_OPTIMIZED_QUERY = 'Keo Optimized'
var KEO_OPTIMIZED_SLUG_FALLBACK = 'keo-optimized'
var keoOptimizedProject = typeof keoOptimizedProject !== 'undefined' ? keoOptimizedProject : null
var keoOptimizedLoading = false

function formatRecentCardTitle(name) {
  const clean = String(name || '').trim()
  if (clean.length <= 22) return clean
  return clean.slice(0, 20) + '…'
}

function updateHomeStats() {
  const count = document.getElementById('home-instance-count')
  const account = document.getElementById('home-account-status')
  const version = document.getElementById('home-selected-version')
  const total = Array.isArray(launcherInstances) ? launcherInstances.length : 0
  if (count) count.innerHTML = total + '<span>' + t(total === 1 ? 'home.instanceUnit' : 'home.instancesUnit') + '</span>'
  if (account) account.textContent = t('home.accountStatus', { name: document.getElementById('username')?.textContent || 'offline' })
  if (version) version.textContent = selectedVersion || 'Minecraft'
}

function renderRecentInstances() {
  const grid = document.getElementById('recent-instances-grid')
  if (!grid) return

  const instancesById = new Map(launcherInstances.map(instance => [instance.id, instance]))
  const instances = loadRecentInstanceIds()
    .map(id => instancesById.get(id))
    .filter(Boolean)

  updateHomeStats()

  if (!instances.length) {
    grid.innerHTML = '<div class="recent-empty">' + escapeHtml(t('home.empty')) + '</div>'
    return
  }

  grid.innerHTML = instances.map(instance => {
    const loaderLabel = instance.loader || 'vanilla'
    const initial = String(instance.name || 'M').charAt(0).toUpperCase()
    return '<div class="ver-card" data-instance="' + escapeHtml(instance.id) + '" data-version="' + escapeHtml(instance.version) + '" data-click="selectRecentInstance" data-args="[&quot;$this&quot;]">' +
      (typeof instanceIconHtml === 'function' ? instanceIconHtml(instance, 'ver-card-icon') : '<div class="ver-card-icon">' + escapeHtml(initial) + '</div>') +
      '<div class="ver-card-copy"><div class="ver-num">' + escapeHtml(formatRecentCardTitle(instance.name)) + '</div>' +
      '<div class="ver-type">' + escapeHtml(loaderLabel + ' · ' + instance.version) + '</div></div>' +
      '<i class="fa-solid fa-arrow-right ver-card-arrow" aria-hidden="true"></i>' +
    '</div>'
  }).join('')
}

function selectRecentInstance(el) {
  openInstanceView(el)
}

function getKeoProjectScore(project) {
  const title = String(project.title || '').toLowerCase()
  const slug = String(project.slug || '').toLowerCase()
  const author = String(project.author || '').toLowerCase()
  let score = 0
  if (slug === KEO_OPTIMIZED_SLUG_FALLBACK) score += 100
  if (title === 'keo optimized') score += 80
  if (title.includes('keo') && title.includes('optimized')) score += 40
  if (author.includes('elkeomc')) score += 25
  if (project.project_type === 'modpack') score += 10
  return score
}

function renderKeoOptimizedCard(project) {
  const card = document.getElementById('keo-optimized-card')
  const icon = document.getElementById('keo-optimized-icon')
  const title = document.getElementById('keo-optimized-title')
  const meta = document.getElementById('keo-optimized-meta')
  const desc = document.getElementById('keo-optimized-desc')
  const loader = document.getElementById('keo-optimized-loader')
  const version = document.getElementById('keo-optimized-version')
  if (!card || !icon || !title || !meta || !desc || !loader || !version) return

  title.textContent = t('home.optimized.title')
  if (!project) {
    icon.innerHTML = '<i class="fa-solid fa-bolt" aria-hidden="true"></i>'
    meta.textContent = t('home.optimized.loading')
    desc.textContent = t('home.optimized.fallbackDesc')
    loader.textContent = 'Modpack'
    version.textContent = '...'
    card.disabled = false
    return
  }

  const categories = project.display_categories || project.categories || []
  const loaderName = categories.find(item => ['fabric', 'forge', 'neoforge', 'quilt'].includes(String(item).toLowerCase())) || 'Modpack'
  const latestVersion = project.latest_version || (Array.isArray(project.versions) ? project.versions[0] : '')
  const creator = project.author || 'ElKeoMC'
  const downloads = formatCompactNumber(project.downloads || 0)

  icon.innerHTML = project.icon_url
    ? '<img src="' + escapeHtml(project.icon_url) + '" alt="">'
    : '<i class="fa-solid fa-cube" aria-hidden="true"></i>'
  meta.textContent = t('home.optimized.meta', { creator, downloads })
  desc.textContent = project.description || t('home.optimized.fallbackDesc')
  loader.textContent = loaderName
  version.textContent = latestVersion || t('home.optimized.versionUnknown')
}

async function loadKeoOptimizedProject() {
  if (keoOptimizedLoading || keoOptimizedProject) {
    renderKeoOptimizedCard(keoOptimizedProject)
    return
  }
  keoOptimizedLoading = true
  renderKeoOptimizedCard(null)

  const result = await window.kindyrAPI?.modrinth?.search?.({
    query: KEO_OPTIMIZED_QUERY,
    type: 'modpack',
    sort: 'relevance',
    offset: 0,
    limit: 10
  })

  keoOptimizedLoading = false
  if (!result?.ok) {
    setStatus(result?.error || t('home.optimized.loadError'))
    return
  }

  keoOptimizedProject = (result.hits || [])
    .slice()
    .sort((a, b) => getKeoProjectScore(b) - getKeoProjectScore(a))[0] || null
  if (keoOptimizedProject && getKeoProjectScore(keoOptimizedProject) <= 0) {
    keoOptimizedProject = null
  }
  renderKeoOptimizedCard(keoOptimizedProject)
}

async function openKeoOptimizedInstall() {
  if (!keoOptimizedProject) {
    await loadKeoOptimizedProject()
  }
  if (!keoOptimizedProject) {
    setStatus(t('home.optimized.notFound'))
    return
  }
  openInstallModal(keoOptimizedProject)
}


if (typeof refreshLauncherInstances === 'function') {
  refreshLauncherInstances()
}
renderRecentInstances()
loadKeoOptimizedProject()

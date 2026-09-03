

let currentSection = 'home'
let loadedSections = new Set()
let discoverInstanceContextId = null

const sectionFiles = {
  home: 'sections/inicio.html',
  instances: 'sections/instancias.html',
  discover: 'sections/descubrir.html',
  skins: 'sections/skins.html',
  settings: 'sections/ajustes.html'
}
const sectionLoadPromises = new Map()

function reportSectionCheckpoint(sectionName, state) {
  window.kindyrAPI?.profile?.checkpoint?.(`section:${sectionName}:${state}`, {
    section: sectionName,
    state,
    domNodes: document.getElementsByTagName('*').length,
    images: document.images.length,
    loadedSections: [...loadedSections]
  })
}

function getDiscoverInstanceContext() {
  if (!discoverInstanceContextId) return null
  return launcherInstances.find(instance => instance.id === discoverInstanceContextId) || null
}

function updateInstanceDiscoverContext(patch = {}) {
  const instance = getDiscoverInstanceContext()
  if (instance) Object.assign(instance, patch)
}

async function syncDiscoverContext(refreshResults = false) {
  if (typeof syncDiscoverContextView === 'function') {
    syncDiscoverContextView(refreshResults)
  }
}

function activateSectionView(sectionName, navEl = null) {
  const targetView = document.getElementById(sectionName + '-view')
  if (!targetView) return null

  const activeView = document.querySelector('.view.active')
  if (activeView !== targetView) {
    if (activeView?.id === 'instance-detail-view' && typeof disposeInstanceDetailView === 'function') {
      disposeInstanceDetailView()
    }
    activeView?.classList.remove('active')
    targetView.classList.add('active')
  }

  const activeNav = document.querySelector('.pill-nav.active')
  if (activeNav !== navEl) {
    activeNav?.classList.remove('active')
    navEl?.classList.add('active')
  }

  currentSection = sectionName
  if (typeof syncRendererActivity === 'function') syncRendererActivity()
  reportSectionCheckpoint(sectionName, 'activated')
  return targetView
}

async function openDiscoverSection(navEl = document.getElementById('nav-discover')) {
  discoverInstanceContextId = null
  await loadSection('discover', navEl)
  await syncDiscoverContext(true)
}

async function openDiscoverForInstance(instanceId = selectedInstance) {
  const instance = launcherInstances.find(item => item.id === instanceId)
  if (!instance) {
    setStatus(t('instance.selectedStatus', { name: selectedVersion }))
    return
  }
  discoverInstanceContextId = instance.id
  await loadSection('discover', document.getElementById('nav-discover'))
  await syncDiscoverContext(true)
}

async function openStandardDiscover(navEl = document.getElementById('nav-discover')) {
  return openDiscoverSection(navEl)
}

function getInstanceDiscoverContext() {
  return getDiscoverInstanceContext()
}

function syncInstanceDiscoverContext(refreshResults = false) {
  return syncDiscoverContext(refreshResults)
}

async function loadSection(sectionName, navEl) {
  if (currentSection === sectionName && loadedSections.has(sectionName)) return
  if (!sectionFiles[sectionName]) {
    console.error('Unknown section:', sectionName)
    return
  }

  const targetView = activateSectionView(sectionName, navEl)
  if (!targetView) return

  const viewKey = navEl ? navEl.getAttribute('data-i18n-view-title') || navEl.dataset.viewTitle : null
  setTopbarMode('nav', navEl ? (navEl.dataset.viewTitle || navEl.textContent.trim()) : t('nav.home'), viewKey || 'nav.home')

  if (loadedSections.has(sectionName)) {
    return
  }

  if (!sectionLoadPromises.has(sectionName)) {
    const loadPromise = (async () => {
      try {
        const response = await fetch(sectionFiles[sectionName])
        if (!response.ok) throw new Error('Failed to load section')
        targetView.innerHTML = await response.text()
        loadedSections.add(sectionName)
        translateElement(targetView)

        const scripts = targetView.querySelectorAll('script')
        const fragment = document.createDocumentFragment()
        scripts.forEach(script => {
          const newScript = document.createElement('script')
          newScript.textContent = script.hasAttribute('data-isolate')
            ? '(function(){\n' + script.textContent + '\n})();'
            : script.textContent
          fragment.appendChild(newScript)
          script.remove()
        })
        targetView.appendChild(fragment)

        applyTheme()
        if (typeof syncRendererActivity === 'function') syncRendererActivity()
        reportSectionCheckpoint(sectionName, 'loaded')
      } catch (error) {
        console.error('Error loading section:', error)
        targetView.innerHTML = '<div class="empty-view">' + escapeHtml(t('settings.validation.error')) + '</div>'
      }
    })()
    sectionLoadPromises.set(sectionName, loadPromise)
  }

  try {
    await sectionLoadPromises.get(sectionName)
  } finally {
    sectionLoadPromises.delete(sectionName)
  }
}

function goHomeFromInstance() {
  activateSectionView('home', document.getElementById('nav-home'))
  setTopbarMode('nav', t('nav.home'), 'nav.home')
}

const _setTopbarModeImpl = function(mode, title, i18nKey) {
  const topbar = document.getElementById('subheader')
  const titleEl = document.getElementById('topbar-title')
  if (!topbar || !titleEl) return
  if (mode === 'instance') {
    topbar.classList.add('instance-mode')
    delete titleEl.dataset.i18nKey
    titleEl.textContent = title || t('instance.title.fallback')
  } else {
    topbar.classList.remove('instance-mode')
    const key = i18nKey || (title ? null : 'nav.home')
    if (key) titleEl.dataset.i18nKey = key
    else delete titleEl.dataset.i18nKey
    titleEl.textContent = title || t(i18nKey || 'nav.home')
  }
}

const setTopbarMode = _setTopbarModeImpl

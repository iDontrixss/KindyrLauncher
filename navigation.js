// Navigation and sidebar management

let currentSection = 'home'
let loadedSections = new Set()
const sectionNodeCache = new Map()

const sectionFiles = {
  home: 'sections/inicio.html',
  instances: 'sections/instancias.html',
  discover: 'sections/descubrir.html',
  skins: 'sections/skins.html',
  settings: 'sections/ajustes.html'
}

async function loadSection(sectionName, navEl) {
  if (currentSection === sectionName && loadedSections.has(sectionName)) return

  // Ocultar vista de instancia si está activa
  const instanceDetailView = document.getElementById('instance-detail-view')
  if (instanceDetailView) instanceDetailView.classList.remove('active')

  // Detach previous section nodes into a cache so scripts are not re-executed
  const previousSection = currentSection
  if (previousSection && previousSection !== sectionName && previousSection !== 'instance-detail') {
    const prevView = document.getElementById(previousSection + '-view')
    if (prevView) {
      // Move child nodes out of the DOM and store them
      const nodes = Array.from(prevView.childNodes)
      if (nodes.length) {
        sectionNodeCache.set(previousSection, nodes)
        for (const n of nodes) prevView.removeChild(n)
      }
      // Keep loadedSections marked — content already executed and cached
    }
  }

  currentSection = sectionName
  
  const navItems = document.querySelectorAll('.nav-item')
  const views = document.querySelectorAll('.view')
  
  navItems.forEach(item => item.classList.remove('active'))
  if (navEl) navEl.classList.add('active')
  
  views.forEach(view => view.classList.remove('active'))
  
  const targetView = document.getElementById(sectionName + '-view')
  if (targetView) targetView.classList.add('active')
  
  setTopbarMode('nav', navEl ? (navEl.dataset.viewTitle || navEl.textContent.trim()) : t('nav.home'))
  
  if (!loadedSections.has(sectionName)) {
    try {
      const response = await fetch(sectionFiles[sectionName])
      if (!response.ok) throw new Error('Failed to load section')
      const html = await response.text()
      const targetView = document.getElementById(sectionName + '-view')
      if (targetView) {
        targetView.innerHTML = html
        loadedSections.add(sectionName)

        applyLanguage()
        applyTheme()

        // Execute scripts once by creating new script elements (only on first load)
        const scripts = targetView.querySelectorAll('script')
        const fragment = document.createDocumentFragment()
        scripts.forEach(script => {
          const newScript = document.createElement('script')
          if (script.hasAttribute('data-isolate')) {
            try {
              newScript.textContent = '(function(){\n' + script.textContent + '\n})();'
            } catch (e) {
              newScript.textContent = script.textContent
            }
          } else {
            newScript.textContent = script.textContent
          }
          fragment.appendChild(newScript)
          script.remove()
        })
        targetView.appendChild(fragment)
      }
    } catch (error) {
      console.error('Error loading section:', error)
      const targetView = document.getElementById(sectionName + '-view')
      if (targetView) targetView.innerHTML = '<div class="empty-view">' + escapeHtml(t('settings.validation.error')) + '</div>'
    }
  } else {
    // Section was previously loaded — reattach cached nodes if present without re-executing scripts
    const targetView = document.getElementById(sectionName + '-view')
    if (targetView) {
      const cached = sectionNodeCache.get(sectionName)
      if (cached && cached.length) {
        // Re-attach nodes inside requestAnimationFrame to avoid layout thrashing
        requestAnimationFrame(() => {
          for (const n of cached) targetView.appendChild(n)
          // Remove from cache since nodes are back in the DOM
          sectionNodeCache.delete(sectionName)
          
          // Aplicamos traducción y renderizado si viene del caché
          applyLanguage()
          if (sectionName === 'instances' && typeof renderLauncherInstancesList === 'function') renderLauncherInstancesList()
          if (sectionName === 'discover' && typeof renderDiscoverTypes === 'function') renderDiscoverTypes()
        })
      } else {
        applyLanguage()
        if (sectionName === 'instances' && typeof renderLauncherInstancesList === 'function') renderLauncherInstancesList()
        if (sectionName === 'discover' && typeof renderDiscoverTypes === 'function') renderDiscoverTypes()
      }
    }
  }
}

function reloadSectionsForLanguage() {
  const sectionsToReload = ['discover', 'home', 'instances']
  sectionsToReload.forEach(section => {
    loadedSections.delete(section)
    sectionNodeCache.delete(section)
    const view = document.getElementById(section + '-view')
    if (view) view.innerHTML = ''
  })
  if (currentSection !== 'settings') {
    const activeNav = document.getElementById('nav-' + currentSection)
    loadSection(currentSection, activeNav)
  }
}

function goHomeFromInstance() {
  loadedSections.delete('instance-detail')
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'))
  document.getElementById('home-view').classList.add('active')
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'))
  document.getElementById('nav-home').classList.add('active')
  setTopbarMode('nav', t('nav.home'))
  currentSection = 'home'
}

// Throttle helper to prevent expensive repeated DOM updates
function throttle(fn, wait) {
  let last = 0
  let timeout = null
  let lastArgs = null
  return function throttled(...args) {
    const now = Date.now()
    const remaining = wait - (now - last)
    lastArgs = args
    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      last = now
      fn.apply(this, lastArgs)
      lastArgs = null
    } else if (!timeout) {
      timeout = setTimeout(() => {
        last = Date.now()
        timeout = null
        if (lastArgs) fn.apply(this, lastArgs)
        lastArgs = null
      }, remaining)
    }
  }
}

const _setTopbarModeImpl = function(mode, title) {
  const topbar = document.getElementById('topbar')
  const titleEl = document.getElementById('topbar-title')
  if (!topbar || !titleEl) return
  if (mode === 'instance') {
    topbar.classList.add('instance-mode')
    delete titleEl.dataset.i18nKey
    titleEl.textContent = title || t('instance.title.fallback')
  } else {
    topbar.classList.remove('instance-mode')
    titleEl.dataset.i18nKey = 'nav.home'
    titleEl.textContent = title || t('nav.home')
  }
}

// Expose a throttled version to avoid style recalcs flooding the renderer
const setTopbarMode = throttle(_setTopbarModeImpl, 200)

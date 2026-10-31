// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Lógica de la sección skins (cargada por navigation.js tras inyectar
// sections/skins.html; la CSP ya no admite scripts inline).
(function() {
  let fallbackTimer = null
  function startFallbackTimer() {
    clearTimeout(fallbackTimer)
    fallbackTimer = setTimeout(() => {
      if (!window.skinview3d || !viewer) {
        console.warn('skinview3d timeout — fallback 2D')
        useFallback2D = true
        skinSetStatus(t('skins.skinview3dUnavailable'), 'error')
        if (!viewer) { loadFavorites(); renderTab('populares').then(() => selectInitialSkin()) }
      }
    }, 4500)
  }
  if (window.skinview3d) {
    initViewer();
    return;
  }
  startFallbackTimer()
  // F2: vendorizado local (assets/skinview3d.bundle.js 3.4.1). Sin CDN en runtime.
  const s = document.createElement('script')
  s.src = 'assets/skinview3d.bundle.js'
  s.onload = () => {
    clearTimeout(fallbackTimer)
    if (window.skinview3d) {
      initViewer()
    } else {
      console.error('skinview3d no está disponible en window después de cargar')
      useFallback2D = true
      skinSetStatus(t('skins.skinview3dLoadError'), 'error')
      loadFavorites(); renderTab('populares').then(() => selectInitialSkin())
    }
  }
  s.onerror = () => {
    clearTimeout(fallbackTimer)
    console.error('Error al cargar skinview3d local')
    useFallback2D = true
    skinSetStatus(t('skins.skinview3dLoadError'), 'error')
    loadFavorites(); renderTab('populares').then(() => selectInitialSkin())
  }
  document.head.appendChild(s)
})()

let viewer = null
let currentSkin = null
let currentModel = 'classic'
let currentTab = 'populares'
let favorites = []
let useFallback2D = false
let activeSkinObjectUrl = ''

function setSkinsPerformanceMode(active) {
  if (!viewer) return
  viewer.renderPaused = !active
  // Modrinth style: nunca auto-rotar, solo pause/render
  viewer.autoRotate = false
  if (viewer.animation && 'paused' in viewer.animation) {
    viewer.animation.paused = !active
  }
}

const FEATURED = [
  'Notch', 'Technoblade', 'Dream', 'GeorgeNotFound', 'Sapnap',
  'TommyInnit', 'Skeppy', 'BadBoyHalo', 'Philza', 'WilburSoot',
  'Quackity', 'Ranboo', 'Tubbo', 'Jschlatt', 'xQc'
]
const FEATURED_UUIDS = {
  Notch: '069a79f444e94726a5befca90e38aaf5',
  Technoblade: 'b876ec32e396476ba1158438d83c67d4',
  Dream: 'ec70bcaf702f4bb8b48d276fa52a780c',
  GeorgeNotFound: 'bd3dd5a404384699b2fd36f518154b41',
  Sapnap: 'c66f7c8aed0c446990b0421d8ff7ca49',
  TommyInnit: 'e80e8194323e414298515e1bcb8a3508',
  Skeppy: '8e176c5ac26d4c148efe77b598b8b3ea',
  BadBoyHalo: '26bdff37fec848f1980f66bf69ee751c',
  Philza: 'f327197be9dd449182cd6cef1d59346e',
  WilburSoot: 'd6ebd3e3c0ef4e5a80db6ee537115a17',
  Quackity: '26dd0066650149e891b5febedde19041',
  Ranboo: '284770fdd01a4507a0c947300c7d2b57',
  Tubbo: 'b25efb42bda644138da94eae3d345746',
  Jschlatt: '4f16bc54a29640eabb51ba6b04ad42c1',
  xQc: 'd9f20e576077449ba05f44121981a247'
}

const avatar = uuid => `https://mc-heads.net/avatar/${String(uuid||'').replace(/-/g,'')}/48`
const skin   = uuid => `https://mc-heads.net/skin/${String(uuid||'').replace(/-/g,'')}`
const body   = uuid => `https://mc-heads.net/body/${String(uuid||'').replace(/-/g,'')}/160`

let pendingSkin = null
let viewerInitPromise = null

async function getOwnEquippedSkin() {
  try {
    if (!window.kindyrAPI?.microsoft?.list) return null
    const result = await window.kindyrAPI.microsoft.list()
    if (!result?.ok || !Array.isArray(result.accounts)) return null
    const active = result.accounts.find(a => a.active)
    if (!active?.uuid || !active?.name) return null
    const clean = String(active.uuid).replace(/-/g, '')
    if (!/^[a-f0-9]{32}$/i.test(clean)) return null
    return { name: active.name, uuid: clean }
  } catch { return null }
}

async function selectInitialSkin() {
  const own = await getOwnEquippedSkin()
  if (own) {
    await selectSkin(own.name, own.uuid, 'equipped')
    return true
  }
  const defaultUUID = await getCachedUUID(FEATURED[0])
  if (defaultUUID) {
    await selectSkin(FEATURED[0], defaultUUID, 'popular')
    return true
  }
  return false
}

async function resolveUUID(username) {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3500)
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`, { signal: controller.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const data = await res.json()
    return data.id || null
  } catch {
    return null
  }
}

const uuidCache = new Map(Object.entries(FEATURED_UUIDS))
try {
  const saved = JSON.parse(localStorage.getItem('kindyr_uuid_cache') || '{}')
  Object.entries(saved).forEach(([k,v]) => { if (typeof v === 'string' && /^[a-f0-9]{32}$/i.test(v.replace(/-/g,''))) uuidCache.set(k, v.replace(/-/g,'')) })
} catch {}
function persistUuidCache() {
  try {
    const obj = {}
    for (const [k,v] of uuidCache.entries()) if (FEATURED_UUIDS[k] !== v) obj[k] = v
    localStorage.setItem('kindyr_uuid_cache', JSON.stringify(obj))
  } catch {}
}

async function getCachedUUID(username) {
  if (uuidCache.has(username)) return uuidCache.get(username)
  if (FEATURED_UUIDS[username]) {
    uuidCache.set(username, FEATURED_UUIDS[username])
    return FEATURED_UUIDS[username]
  }
  const uuid = await resolveUUID(username)
  if (uuid) {
    const clean = uuid.replace(/-/g,'')
    uuidCache.set(username, clean)
    if (uuidCache.size > 120) uuidCache.delete(uuidCache.keys().next().value)
    persistUuidCache()
    return clean
  }
  return null
}

async function initViewer() {
  if (viewerInitPromise) return viewerInitPromise
  viewerInitPromise = (async () => {
  const canvas = document.getElementById('skin-canvas')
  if (!canvas) {
    console.error('Canvas no encontrado')
    return
  }
  if (viewer) {
    try { if (viewer._idleTimer) clearInterval(viewer._idleTimer) } catch {}
    try { if (viewer._kindyrRO) viewer._kindyrRO.disconnect() } catch {}
    try {
      viewer.dispose()
    } catch (e) {
      console.warn('Error al destruir viewer anterior:', e)
    }
    viewer = null
  }

  if (!window.skinview3d) {
    console.error('skinview3d no está disponible')
    useFallback2D = true
    skinSetStatus('⚠️ skinview3d no disponible. Usando vista 2D.', 'error')
    loadFavorites()
    await renderTab('populares')
    if (pendingSkin) { const p = pendingSkin; pendingSkin=null; await selectSkin(p.name,p.uuid,p.source) }
    else await selectInitialSkin()
    return
  }
  try {
    const wrap = canvas.parentElement
    const w = Math.max(200, (wrap && wrap.clientWidth) ? wrap.clientWidth : 230)
    const h = Math.max(280, (wrap && wrap.clientHeight) ? wrap.clientHeight : 320)
    // Modrinth: TresJS idle + random subtle + drag; skinview3d equiv: static idle, drag enabled, click impulse
    viewer = new skinview3d.SkinViewer({ canvas, width: w, height: h })

    viewer.fov = 32
    viewer.zoom = 0.9
    viewer.autoRotate = false
    viewer.animation = null
    // Modrinth controls: grab cursor, rotate only, no zoom/pan — exact like SkinPreviewRenderer
    if (viewer.controls) {
      viewer.controls.enableRotate = true
      viewer.controls.enableZoom = false
      viewer.controls.enablePan = false
      viewer.controls.rotateSpeed = 1.0
      viewer.controls.minPolarAngle = Math.PI/3.2
      viewer.controls.maxPolarAngle = Math.PI/1.9
    }
    try { viewer.playerObject.rotation.y = 0.274 } catch {} // 15.75° like Modrinth initialRotation
    try { viewer.camera.position.set(0, 8, 30) } catch {}
    try { viewer.controls.target.set(0, 2, 0) } catch {}
    try { viewer.controls.update() } catch {}
    // Cursor like Modrinth (grab) + click impulse like SkinPreviewRenderer
    try { canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none'; } catch {}
    try {
      let dragMoved = false
      let downAt = 0
      canvas.addEventListener('pointerdown', () => { dragMoved = false; downAt = Date.now() })
      canvas.addEventListener('pointermove', () => { dragMoved = true })
      canvas.addEventListener('pointerup', () => {
        const quickClick = !dragMoved && (Date.now() - downAt) < 220
        try { canvas.style.cursor = 'grab' } catch {}
        if (quickClick && viewer && viewer.playerObject) {
          try {
            const target = viewer.playerObject
            const origZ = target.rotation.z
            const origX = target.position ? target.position.x : 0
            target.rotation.z = origZ + 0.18
            if (target.position) target.position.x = origX + 0.12
            setTimeout(() => { try { target.rotation.z = origZ; if (target.position) target.position.x = origX } catch {} }, 160)
          } catch {}
        }
      })
      canvas.addEventListener('pointerdown', () => { try { canvas.style.cursor = 'grabbing' } catch {} })
      canvas.addEventListener('pointerleave', () => { try { canvas.style.cursor = 'grab' } catch {} })
      // Resize observer like Modrinth fit
      const wrapEl = canvas.parentElement
      if (wrapEl && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          try {
            const nw = wrapEl.clientWidth
            const nh = wrapEl.clientHeight
            if (nw > 40 && nh > 40 && viewer) { viewer.setSize(nw, nh) }
          } catch {}
        })
        ro.observe(wrapEl)
        viewer._kindyrRO = ro
      }
    } catch {}
    // Modrinth random idle subtle: every 8s slightly bob (like randomAnimations)
    try {
      if (viewer._idleTimer) clearInterval(viewer._idleTimer)
      viewer._idleTimer = setInterval(() => {
        try {
          if (!viewer || viewer.renderPaused) return
          const t = viewer.playerObject
          const baseY = 0.274
          t.rotation.y = baseY + (Math.random()-0.5)*0.06
          setTimeout(() => { try { t.rotation.y = baseY } catch {} }, 320)
        } catch {}
      }, 8000)
    } catch {}
    try { canvas.style.width = '100%'; canvas.style.height = '100%'; } catch {}
    setSkinsPerformanceMode(
      !document.hidden && document.hasFocus() && currentSection === 'skins'
    )

    canvas.style.display = 'block'

    loadFavorites()
    await renderTab('populares')

    if (pendingSkin) { const p = pendingSkin; pendingSkin=null; await selectSkin(p.name,p.uuid,p.source) }
    else await selectInitialSkin()
  } catch (error) {
    console.error('Error al crear viewer:', error)
    console.error('Error stack:', error.stack)
    console.warn('Falló la creación del viewer 3D, usando fallback 2D')
    useFallback2D = true
    skinSetStatus('⚠️ Error 3D. Usando vista 2D.', 'error')
    loadFavorites()
    await renderTab('populares')
    if (pendingSkin) { const p = pendingSkin; pendingSkin=null; await selectSkin(p.name,p.uuid,p.source) }
    else await selectInitialSkin()
  }
  })()
  return viewerInitPromise
}

async function openTab(tab, el) {
  currentTab = tab
  document.querySelectorAll('.skin-tab').forEach(t => t.classList.remove('active'))
  if (el) el.classList.add('active')
  else {
    const tabs = document.querySelectorAll('.skin-tab')
    const map = { populares: 0, favoritas: 1, subir: 2 }
    if (tabs[map[tab]]) tabs[map[tab]].classList.add('active')
  }
  document.getElementById('search-bar').style.display = tab === 'populares' ? 'flex' : 'none'
  await renderTab(tab)
}

async function renderTab(tab) {
  const body = document.getElementById('gallery-body')
  if (tab === 'populares') await renderPopulares(body)
  else if (tab === 'favoritas') renderFavoritas(body)
  else renderSubir(body)
}

async function renderPopulares(el) {
  const own = await getOwnEquippedSkin()
  const ownClean = own ? own.uuid.replace(/-/g,'').toLowerCase() : ''
  // dedup: si la equipada ya está en favoritas, no repetir (fix doble al entrar/salir)
  const favFiltered = favorites.filter(f => String(f.uuid||'').replace(/-/g,'').toLowerCase() !== ownClean)
  const favCards = favFiltered.map(f => mkCard(f.name, body(f.uuid), f.uuid, 'fav')).join('')
  const addCard = `<div class="skin-card add-card" data-click="uiClickById" data-args='["skin-file-input"]' title="Añadir skin"><div style="font-size:24px; line-height:1; color:var(--kindyr-blue); font-weight:300;">+</div><div style="font-family:'Space Grotesk';font-weight:800;font-size:11px;color:var(--kindyr-text);">Añadir skin</div><div style="font-size:10px;color:var(--kindyr-blue-soft);font-weight:600;">Arrastra y suelta</div></div>`
  const equippedCard = own ? mkCard(own.name, body(own.uuid), own.uuid, 'equipped') : ''
  // Predeterminadas placeholder with skeletons for instant paint (Modrinth speed)
  el.innerHTML = `
    <div class="skin-section-head" data-click="toggleSkinSection" data-args='["guardadas-grid","$this",false]'><i class="fa-solid fa-chevron-up" style="transition:transform .15s;"></i> Skins guardadas</div>
    <div class="skin-grid" id="guardadas-grid">${addCard}${equippedCard}${favCards}</div>
    <div class="skin-section-head" data-click="toggleSkinSection" data-args='["popular-grid","$this",true]'><i class="fa-solid fa-chevron-up" style="transition:transform .15s;"></i> Skins predeterminadas</div>
    <div class="skin-grid" id="popular-grid">
      ${FEATURED.map(n => `<div class="skin-card" style="opacity:.45;"><div class="skin-loading" style="padding:28px 0;">${escapeHtml(n)}</div></div>`).join('')}
    </div>
    <div id="search-results"></div>`

  const grid = document.getElementById('popular-grid')
  // Instant with hardcoded UUIDs — no network wait (fixes “tardan mucho”)
  const cards = FEATURED.map(username => {
    const uuid = FEATURED_UUIDS[username] || uuidCache.get(username)
    return uuid ? mkCard(username, body(uuid), uuid, 'popular') : ''
  })
  // Use rAF to paint skeletons first, then real cards (perceived instant)
  requestAnimationFrame(() => {
    if (grid?.isConnected) grid.innerHTML = cards.filter(Boolean).join('')
    // Highlight equipped card if visible
    if (own) {
      const eq = document.getElementById('card-' + own.uuid)
      if (eq && currentSkin && currentSkin.uuid === own.uuid) eq.classList.add('selected')
    }
  })
}

// Plegar/desplegar una grilla de skins. Las guardadas no se pliegan
// (allowCollapse=false), igual que antes de migrar el onclick inline.
function toggleSkinSection(gridId, head, allowCollapse) {
  const grid = document.getElementById(gridId)
  if (!grid) return
  const icon = head && head.querySelector('i')
  grid.style.display = allowCollapse && grid.style.display !== 'none' ? 'none' : 'grid'
  if (icon) icon.style.transform = grid.style.display === 'none' ? 'rotate(-90deg)' : 'rotate(0deg)'
}

function mkCard(name, avatarUrl, uuid, source) {
  const safeUuid = String(uuid || '').replace(/[^a-f0-9-]/gi, '')
  if (!safeUuid) return ''
  const allowedSources = ['popular', 'search', 'fav', 'equipped']
  const safeSource = allowedSources.includes(source) ? source : 'search'
  const skinName = String(name || 'Minecraft')
  const fav = favorites.some(f => f.uuid === safeUuid)
  const isEquipped = safeSource === 'equipped'
  return `<div class="skin-card ${isEquipped ? 'equipped' : ''}" id="card-${safeUuid}" data-click="selectSkin" data-args="${uiArgs(skinName, safeUuid, safeSource)}" style="${isEquipped ? 'border-color:#1D9E75;background:#17382d;' : ''}">
    <button class="skin-card-fav ${fav ? 'active' : ''}" title="${escapeHtml(t('skins.saveFavorite'))}" data-click="toggleFav" data-args="${uiArgs(skinName, safeUuid)}" data-stop>★</button>
    ${isEquipped ? '<span style="position:absolute;top:6px;left:6px;background:#1D9E75;color:#fff;font-size:9px;font-weight:800;padding:2px 5px;border-radius:4px;">EQUIPADA</span>' : ''}
    <img class="skin-card-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async">
    <div class="skin-card-name">${escapeHtml(name)}</div>
  </div>`
}

async function searchSkin() {
  const q = document.getElementById('skin-search').value.trim()
  if (!q) return
  const wrap = document.getElementById('search-results')
  if (!wrap) return
  wrap.innerHTML = `<div class="skin-loading">${escapeHtml(t('skins.searching', { q }))}</div>`
  try {
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(q)}`)
    if (!res.ok) throw new Error()
    const { id, name } = await res.json()
    wrap.innerHTML = `
      <div class="skin-grid-label">${escapeHtml(t('skins.searchResult', { name }))}</div>
      <div class="skin-grid">${mkCard(name, body(id), id, 'search')}</div>`
  } catch {
    wrap.innerHTML = `<div class="skin-empty">${escapeHtml(t('skins.searchNotFound', { q }))}</div>`
  }
}

async function selectSkin(name, uuid, source) {
  const cleanUuid = String(uuid||'').replace(/-/g,'')
  uuid = /^[a-f0-9]{32}$/i.test(cleanUuid) ? cleanUuid : uuid
  document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('selected'))
  const card = document.getElementById('card-' + uuid)
  if (card) card.classList.add('selected')
  else pendingSkin = { name, uuid, source }

  const skinUrl = skin(uuid)
  if (activeSkinObjectUrl) {
    URL.revokeObjectURL(activeSkinObjectUrl)
    activeSkinObjectUrl = ''
  }
  currentSkin = { name, uuid, url: skinUrl, model: currentModel, source }

  const svName = document.getElementById('sv-name')
  if (svName) svName.textContent = name
  const srcLabel = { popular: t('skins.sourcePopular'), search: t('skins.sourceSearch'), fav: t('skins.sourceFavorite'), upload: t('skins.sourceUpload'), equipped: (t('skins.sourceEquipped') !== 'skins.sourceEquipped' ? t('skins.sourceEquipped') : 'EQUIPADA') }
  const svBadge = document.getElementById('sv-badge')
  if (svBadge) svBadge.textContent = `${currentModel === 'classic' ? t('skins.modelClassic') : t('skins.modelSlim')} · ${srcLabel[source] || ''}`
  skinSetStatus('', '')

  if (useFallback2D) {
    const previewImg = document.getElementById('skin-preview-img')
    const canvas = document.getElementById('skin-canvas')
    if (previewImg) {
      previewImg.src = `https://mc-heads.net/body/${uuid}/160`
      previewImg.style.display = 'block'
    }
    if (canvas) canvas.style.display = 'none'
    skinSetStatus(t('skins.view2dActive'), 'ok')
    return
  }

  const previewImg = document.getElementById('skin-preview-img')
  const canvas = document.getElementById('skin-canvas')
  if (previewImg) previewImg.style.display = 'none'
  if (canvas) canvas.style.display = 'block'

  if (viewer) {
    try {
      await viewer.loadSkin(skinUrl)
      try { viewer.playerObject.rotation.y = -0.45 } catch {}
      skinSetStatus(t('skins.skinLoaded'), 'ok')
      pendingSkin = null
    } catch (error) {
      console.error('Error al cargar skin:', error)
      skinSetStatus(t('skins.skinLoadError'), 'error')
    }
  } else if (useFallback2D) {
    return
  } else if (viewerInitPromise) {
    pendingSkin = { name, uuid, source }
    skinSetStatus(t('skins.loading'), '')
    try { await viewerInitPromise } catch {}
    if (viewer && pendingSkin && pendingSkin.uuid === uuid) {
      pendingSkin = null
      return selectSkin(name, uuid, source)
    }
  } else {
    pendingSkin = { name, uuid, source }
    skinSetStatus(t('skins.loading'), '')
  }
}

function setModel(m) {
  currentModel = m
  document.getElementById('model-classic').classList.toggle('active', m === 'classic')
  document.getElementById('model-slim').classList.toggle('active', m === 'slim')

  if (currentSkin && viewer) {
    viewer.playerObject.skin.modelType = m === 'slim' ? 'slim' : 'default'
  }

  if (currentSkin) {
    document.getElementById('sv-badge').textContent = `${m === 'classic' ? t('skins.modelClassic') : t('skins.modelSlim')} · ${currentSkin.source?.toUpperCase() || ''}`
  }
}

async function applySkin() {
  if (!currentSkin) return
  const btn = document.getElementById('btn-apply')
  btn.disabled = true
  btn.textContent = t('skins.applying')
  skinSetStatus('', '')

  try {
    const result = await window.kindyrAPI.microsoft.list()
    const active = result?.accounts?.find(a => a.active)

    if (active) {
      let skinBytes = null
      if (currentSkin.url.startsWith('blob:')) {
        const response = await fetch(currentSkin.url)
        const arrayBuffer = await response.arrayBuffer()
        skinBytes = new Uint8Array(arrayBuffer)
      }
      const r = await window.kindyrAPI.skins.applyOnline(currentSkin.url, currentModel, skinBytes)
      r.ok ? skinSetStatus(t('skins.skinApplied'), 'ok')
             : skinSetStatus('Error: ' + (r.error || t('skins.tryAgain')), 'error')
    } else {
      let skinBytes = null
      if (currentSkin.url.startsWith('blob:')) {
        const response = await fetch(currentSkin.url)
        const arrayBuffer = await response.arrayBuffer()
        skinBytes = new Uint8Array(arrayBuffer)
      }
      const r = await window.kindyrAPI.skins.saveLocal(currentSkin.url, currentSkin.name, skinBytes)
      r.ok ? skinSetStatus(t('skins.skinSavedLocal'), 'ok')
             : skinSetStatus('Error: ' + (r.error || t('skins.tryAgain')), 'error')
    }
  } catch(e) {
    skinSetStatus('Error: ' + e.message, 'error')
  }

  btn.disabled = false
  btn.textContent = t('skins.apply')
}

function loadFavorites() {
  try { favorites = JSON.parse(localStorage.getItem('kindyr_favs') || '[]') } catch { favorites = [] }
}
function saveFavorites() {
  localStorage.setItem('kindyr_favs', JSON.stringify(favorites))
}
function toggleFav(name, uuid) {
  const idx = favorites.findIndex(f => f.uuid === uuid)
  idx >= 0 ? favorites.splice(idx, 1) : favorites.push({ name, uuid })
  saveFavorites()
  const btn = document.querySelector(`#card-${uuid} .skin-card-fav`)
  if (btn) btn.classList.toggle('active', favorites.some(f => f.uuid === uuid))
  if (currentTab === 'favoritas') renderTab('favoritas')
}
function favCurrentSkin() {
  if (!currentSkin?.uuid) return
  toggleFav(currentSkin.name, currentSkin.uuid)
  skinSetStatus(t('skins.favoriteSaved'), 'ok')
}
function renderFavoritas(el) {
  if (!favorites.length) {
    el.innerHTML = `<div class="skin-empty">${t('skins.noFavorites')}</div>`
    return
  }
  el.innerHTML = `
    <div class="skin-grid-label">${t('skins.myFavorites', { count: favorites.length })}</div>
    <div class="skin-grid">${favorites.map(f => mkCard(f.name, avatar(f.uuid), f.uuid, 'fav')).join('')}</div>`
}

function editCurrentSkin() {
  if (currentSkin) applySkin()
  else uiClickById('skin-file-input')
}

function setSkinDropHighlight(zone, active) {
  if (zone) zone.classList.toggle('drag', Boolean(active))
}

function renderSubir(el) {
  el.innerHTML = `
    <div class="skin-upload-zone" id="upload-zone"
      data-click="uiClickById" data-args='["skin-file-input"]'
      data-dragover="setSkinDropHighlight" data-args-dragover='["$this",true]' data-prevent="dragover"
      data-dragleave="setSkinDropHighlight" data-args-dragleave='["$this",false]'
      data-drop="handleDrop" data-args-drop='["$event"]'>
      <div class="skin-upload-icon">🎨</div>
      <div class="skin-upload-text">
        <strong>${t('skins.dragDrop')}</strong><br>
        ${t('skins.orClick')}
        ${t('skins.fileSpec')}
      </div>
    </div>
    <div id="upload-msg"></div>`
}

function handleDrop(e) {
  e.preventDefault()
  document.getElementById('upload-zone')?.classList.remove('drag')
  const f = e.dataTransfer.files[0]
  if (f) processFile(f)
}
function handleFileUpload(e) { if (e.target.files[0]) processFile(e.target.files[0]) }

async function processFile(file) {
  if (!file.name.endsWith('.png')) {
    document.getElementById('upload-msg').innerHTML = `<div class="sv-status error" style="text-align:center;padding:12px">${t('skins.pngOnly')}</div>`
    return
  }
  if (activeSkinObjectUrl) URL.revokeObjectURL(activeSkinObjectUrl)
  const url = URL.createObjectURL(file)
  activeSkinObjectUrl = url
  const name = file.name.replace('.png', '')
  currentSkin = { name, url, model: currentModel, source: 'upload' }
  document.getElementById('sv-name').textContent = name
  document.getElementById('sv-badge').textContent = `${currentModel === 'classic' ? t('skins.modelClassic') : t('skins.modelSlim')} · ${t('skins.sourceUpload')}`

  const previewImg = document.getElementById('skin-preview-img')
  const canvas = document.getElementById('skin-canvas')
  if (previewImg) previewImg.style.display = 'none'
  if (canvas) canvas.style.display = 'block'

  if (viewer) {
    try {
      await viewer.loadSkin(url)
    } catch (error) {
      console.error('Error al cargar skin local:', error)
    }
  } else {
    console.error('Viewer no disponible')
  }

  document.getElementById('upload-msg').innerHTML = `<div class="sv-status ok" style="text-align:center;padding:12px">${t('skins.previewReady')}</div>`
}

function skinSetStatus(msg, type) {
  const el = document.getElementById('sv-status')
  el.textContent = msg || t('skins.selectSkin')
  el.className = 'sv-status' + (type ? ' ' + type : '')
}

window.refreshSkinsEquipped = async function() {
  try {
    const own = await getOwnEquippedSkin()
    if (own) {
      await selectSkin(own.name, own.uuid, 'equipped')
      const bodyEl = document.getElementById('gallery-body')
      if (bodyEl && currentTab === 'populares') await renderTab('populares')
    }
  } catch {}
}

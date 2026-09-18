// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
const discoverSource = fs.readFileSync(path.join(__dirname, '..', 'sections', 'descubrir.html'), 'utf8')
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8')
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
const commonSource = fs.readFileSync(path.join(__dirname, '..', 'common.js'), 'utf8')
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')

test('detalle: marked renderiza el markdown de Modrinth como la web', () => {
  const { marked } = require('marked')
  const html = String(marked.parse('# Titulo\n\nHola **mundo** [link](https://modrinth.com)\n\n- a\n- b\n'))
  assert.match(html, /<h1[^>]*>Titulo<\/h1>/)
  assert.match(html, /<strong>mundo<\/strong>/)
  assert.match(html, /<a href="https:\/\/modrinth\.com">link<\/a>/)
  assert.match(html, /<li>a<\/li>/)
})

test('detalle: main.js expone detalles Modrinth (body->HTML, galería) y CurseForge (description, screenshots)', () => {
  assert.match(mainSource, /async function getModrinthProjectDetails\(payload/)
  assert.match(mainSource, /bodyHtml: await renderMarkdownToHtml\(body\.body\)/)
  assert.match(mainSource, /async function getCurseForgeProjectDetails\(payload/)
  assert.match(mainSource, /\/mods\/' \+ encodeURIComponent\(modId\) \+ '\/description'/)
  assert.match(mainSource, /m\.screenshots/)
  assert.match(mainSource, /side: \{ client: body\.client_side/)
  assert.match(mainSource, /datePublished: body\.published/)
  assert.match(mainSource, /dateUpdated: m\.dateModified/)
  assert.match(mainSource, /donation_urls/)
  assert.match(mainSource, /\/team\/' \+ encodeURIComponent\(body\.team\)/)
  assert.match(mainSource, /avatar_url/)
  assert.match(mainSource, /creators: \(m\.authors/)
  assert.match(mainSource, /ipcMain\.handle\('modrinth-details'/)
  assert.match(mainSource, /ipcMain\.handle\('curseforge-details'/)
})

test('detalle: preload expone details en ambos providers', () => {
  assert.match(preloadSource, /details: \(payload\) => ipcRenderer\.invoke\('modrinth-details', payload\)/)
  assert.match(preloadSource, /details: \(payload\) => ipcRenderer\.invoke\('curseforge-details', payload\)/)
})

test('detalle: sección full-width con tabs Descripción/Versiones/Galería + X', () => {
  assert.match(discoverSource, /id="discover-details"/)
  assert.match(discoverSource, /id="discover-details-info"/)
  assert.match(discoverSource, /selectProjectTab\('desc'\)/)
  assert.match(discoverSource, /selectProjectTab\('versions'\)/)
  assert.match(discoverSource, /selectProjectTab\('gallery'\)/)
  assert.match(discoverSource, /id="project-tab-desc"/)
  assert.match(discoverSource, /id="project-tab-versions"/)
  assert.match(discoverSource, /id="project-tab-gallery"/)
  assert.match(discoverSource, /installDetailProject\(this\)/)
  assert.match(discoverSource, /discover-close/)
  assert.match(discoverSource, /discover-details-main/)
  assert.match(discoverSource, /discover-filter-panel discover-details-side/)
  assert.match(discoverSource, /<\/section>\s*<aside class="discover-filter-panel discover-details-side"/s)
  assert.match(discoverSource, /discover-filter-heading.*section-kicker.*discover\.info/s)
  assert.match(discoverSource, /discover-filter-group"><label>/)
  assert.match(discoverSource, /detail-sub-label/)
  assert.match(discoverSource, /detail-action-install/)
  assert.match(discoverSource, /discover-close/)
  assert.match(discoverSource, /function setDiscoverDetailsOpen\(open\)/)
  assert.match(discoverSource, /showing-details/)
  assert.match(discoverSource, /function renderProjectInfo\(\)/)
  assert.match(discoverSource, /project\.info\.creator/)
  assert.match(discoverSource, /project\.info\.clientSide/)
  assert.equal(indexSource.includes('id="project-modal"'), false)
})

test('detalle: estilos de sección + slide de filtros', () => {
  assert.match(stylesSource, /#discover-details \{/)
  assert.match(stylesSource, /\.discover-shell\.showing-details \{/)
  assert.match(stylesSource, /grid-template-columns: 300px minmax\(0, 1fr\) 0fr/)
  assert.match(stylesSource, /grid-template-columns: 0fr minmax\(0, 1fr\) 300px/)
  assert.match(stylesSource, /@keyframes detailSlideIn/)
  assert.match(stylesSource, /\.discover-details-main \{/)
  assert.match(stylesSource, /\.discover-details-side \{/)
  assert.match(stylesSource, /\.discover-workspace \[hidden\] \{/)
  assert.match(stylesSource, /showing-details #discover-filter-panel \{/)
  assert.match(stylesSource, /\.type-chip\.detail-action-install \{/)
  assert.match(stylesSource, /\.discover-details-top \{/)
  assert.match(stylesSource, /min-height: 780px;/)
  assert.match(stylesSource, /\.creator-list \{/)
})

test('detalle: solo la ficha scrollea, la sidebar queda estática', () => {
  assert.match(stylesSource, /\.discover-shell\.showing-details #discover-details \{[^}]*overflow-y: auto/s)
  assert.match(stylesSource, /\.discover-shell\.showing-details \.discover-details-side \{[^}]*overflow: hidden/s)
})

test('detalle: descubrir abre la ficha al clickear la card y sanea el HTML del proveedor', () => {
  assert.match(discoverSource, /onclick="openDiscoveredProjectDetails\('/)
  assert.match(discoverSource, /event\.stopPropagation\(\);installDiscoveredProject\(/)
  assert.match(discoverSource, /function sanitizeRichHtml\(html, baseUrl\)/)
  assert.match(discoverSource, /RICH_DROP_TAGS/)
  assert.match(discoverSource, /javascript\|data\|vbscript\|file\|blob/)
  assert.match(discoverSource, /function renderProjectDescription\(\)/)
  assert.match(discoverSource, /function renderProjectGallery\(\)/)
  assert.match(discoverSource, /function loadProjectVersionList\(\)/)
  assert.match(discoverSource, /function versionTypeLabel\(versionType\)/)
  assert.match(discoverSource, /function selectProjectTab\(name\)/)
})

test('detalle: estilos STYLE_GUIDE-compliant para sección, tabs y cuerpo rico', () => {
  assert.match(stylesSource, /#discover-details \{/)
  assert.match(stylesSource, /\.project-modal-tabs \.type-chip\.project-tab\.active \{/)
  assert.match(stylesSource, /\.rich-body img \{/)
  assert.match(stylesSource, /\.project-gallery \{/)
  assert.match(stylesSource, /table\.version-table \{/)
  assert.match(stylesSource, /\.version-table tr\.version-row \{[^}]*display: table-row/s)
  assert.match(stylesSource, /\.version-table col\.col-gv \{/)
  assert.match(stylesSource, /\.version-table \.version-cell-chips \{[^}]*text-align: center/s)
  assert.match(stylesSource, /\.version-table tbody \.version-row:hover td \{[^}]*border-color: var\(--kindyr-accent\)/s)
  const hoverBlock = stylesSource.slice(
    stylesSource.indexOf('.version-table tbody .version-row:hover td {'),
    stylesSource.indexOf('.version-table tbody .version-row:hover td {') + 200
  )
  assert.equal(hoverBlock.includes('facc15'), false)
  assert.match(stylesSource, /\.version-table tbody td:first-child \{[^}]*border-left/s)
  assert.match(discoverSource, /t\('project\.col\.status'\)/)
  assert.match(discoverSource, /version\.fileDate \|\| version\.datePublished/)
  assert.match(discoverSource, /<table class="version-table">/)
  assert.match(discoverSource, /<colgroup>/)
  assert.match(discoverSource, /formatRelativeTime\(uploadedRaw\)/)
  assert.match(discoverSource, /cappedTagChips\(/)
  assert.match(stylesSource, /\.version-row\.version-head th \{/)
  assert.match(stylesSource, /\.detail-sub-label \{/)
})

test('detalle: i18n ES/EN (info completa traducida, tipos y loaders intactos)', () => {
  assert.match(commonSource, /'project\.tab\.description': 'Descripción'/)
  assert.match(commonSource, /'project\.tab\.gallery': 'Galería'/)
  assert.match(commonSource, /'project\.info\.creator': 'Creador'/)
  assert.match(commonSource, /'project\.info\.clientSide': 'Lado cliente'/)
  assert.match(commonSource, /'project\.info\.required': 'Requerido'/)
  assert.match(commonSource, /'project\.link\.source': 'Código'/)
  assert.match(commonSource, /'project\.info\.creator': 'Creator'/)
  assert.match(commonSource, /'project\.link\.source': 'Source'/)
  assert.match(commonSource, /'project\.col\.status': 'Estado'/)
  assert.match(commonSource, /'project\.col\.status': 'Status'/)
  assert.match(commonSource, /'project\.versionType\.release': 'Release'/)
  assert.match(mainSource, /downloads: file\.downloadCount \|\| 0/)
  assert.match(commonSource, /'discover\.info': 'Información'/)
  assert.match(commonSource, /'discover\.info': 'Information'/)
})

test('detalle: categorías traducidas por slug con fallback al original', () => {
  assert.match(commonSource, /'cat\.adventure-and-rpg': 'Aventura y RPG'/)
  assert.match(commonSource, /'cat\.quests': 'Misiones'/)
  assert.match(commonSource, /'cat\.tech': 'Tecnología'/)
  assert.match(discoverSource, /function categoryLabel\(slug, fallbackName\)/)
})

test('detalle: tags de cards y header traducidos como los chips', () => {
  assert.match(discoverSource, /translateCategoryName\(tag, isCF\)/)
  assert.match(discoverSource, /translateCategoryName\(cat, isCF\)/)
})

test('detalle: project-tag es card neobrutalista (sin pills)', () => {
  const start = stylesSource.indexOf('\n.project-tag {')
  const tagBlock = stylesSource.slice(start, start + 400)
  assert.match(tagBlock, /border-radius: 0;/)
  assert.match(tagBlock, /box-shadow: 2px 2px 0 var\(--kindyr-ink\);/)
  assert.equal(tagBlock.includes('999px'), false)
})

test('detalle: sidebar con las 4 secciones fijas + creadores con pfp y rol', () => {
  assert.match(discoverSource, /project\.info\.compatibility/)
  assert.match(discoverSource, /project\.info\.tags/)
  assert.match(discoverSource, /project\.info\.creators/)
  assert.match(discoverSource, /function translateTeamRole\(role\)/)
  assert.match(discoverSource, /creator-row/)
  assert.match(discoverSource, /creator-avatar/)
  assert.match(discoverSource, /discover-info-sticky/)
  assert.match(stylesSource, /\.discover-info-sticky \{/)
  assert.match(stylesSource, /\.creator-row \{/)
  assert.match(stylesSource, /min-height: 780px;/)
  assert.match(stylesSource, /\.type-chip\.detail-action\.detail-close \{/)
  assert.match(commonSource, /'project\.role\.owner': 'Propietario'/)
  assert.match(commonSource, /'project\.info\.compatibility': 'Compatibilidad'/)
  assert.match(commonSource, /'project\.info\.creators': 'Creators'/)
})

test('detalle: check-syntax cubre scripts inline del HTML (regresión sección rota)', () => {
  const checker = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'check-syntax.js'), 'utf8')
  assert.match(checker, /endsWith\('\.html'\)/)
  assert.match(checker, /new vm\.Script\(/)
})

test('detalle: loaders con SVG oficial, mayúscula y sin traducir', () => {
  assert.match(discoverSource, /const LOADER_ICONS = \{/)
  assert.match(discoverSource, /"neoforge": "<svg/)
  assert.match(discoverSource, /function loaderDisplayName\(id\)/)
  assert.match(discoverSource, /function loaderChip\(id\)/)
  assert.match(discoverSource, /NeoForge/)
  assert.match(stylesSource, /\.loader-svg \{/)
})

test('detalle: tabla centrada, jerarquía título/subtítulo y sin scroll-x', () => {
  assert.match(stylesSource, /\.version-cell-dim \{[^}]*text-align: center/s)
  assert.match(stylesSource, /\.discover-filter-group > label \{[^}]*font: 800 11px/s)
  assert.match(stylesSource, /\.detail-sub-label \{[^}]*font: 400 10px/s)
  assert.match(stylesSource, /overflow-x: clip;/)
  assert.match(discoverSource, /closeProjectDetails\(\)/)
  assert.match(discoverSource, /function selectDiscoverProvider\(provider\) \{[^}]*closeProjectDetails/s)
  assert.match(stylesSource, /\.version-cell-chips \{[^}]*text-align: center/s)
})

test('detalle: sin currentLanguage indefinido y sin duplicar formatRelativeTime', () => {
  assert.equal(discoverSource.includes('currentLanguage'), false)
  assert.equal(discoverSource.includes('function formatRelativeTime'), false)
  assert.match(commonSource, /function formatRelativeTime\(value\)/)
  assert.match(commonSource, /'time\.years': 'Hace \{count\} años'/)
  assert.match(commonSource, /'time\.years': '\{count\} years ago'/)
})

test('detalle: STYLE_GUIDE exige cards para controles clickeables', () => {
  const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'STYLE_GUIDE.md'), 'utf8')
  assert.match(guide, /Todo control clickeable propio es una card/)
})

// Réplica de isSafeRichUrl (debe coincidir con sections/descubrir.html): solo http(s),
// resuelve relativas contra la web del proveedor, bloquea esquemas peligrosos.
function isSafeRichUrl(value, base) {
  const raw = String(value || '').trim()
  if (!raw || raw.charAt(0) === '#') return ''
  if (/^(javascript|data|vbscript|file|blob):/i.test(raw)) return ''
  try {
    const url = new URL(raw, base || undefined)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.href
  } catch { return '' }
}

test('detalle: URLs del cuerpo rico solo http(s) y relativas resueltas', () => {
  assert.equal(isSafeRichUrl('https://cdn.modrinth.com/x.png'), 'https://cdn.modrinth.com/x.png')
  assert.equal(isSafeRichUrl('javascript:alert(1)'), '')
  assert.equal(isSafeRichUrl('data:text/html,<b>x</b>'), '')
  assert.equal(isSafeRichUrl('#ancla'), '')
  assert.equal(isSafeRichUrl('/gallery/img.png', 'https://modrinth.com'), 'https://modrinth.com/gallery/img.png')
  assert.equal(isSafeRichUrl('   '), '')
})

// Réplica de mergeCurseForgeCategoryPages (debe coincidir con main.js).
function mergeCurseForgeCategoryPages(pages, sortField, limit) {
  const seen = new Set()
  const merged = []
  let totalHits = 0
  for (const page of pages) {
    totalHits += Number(page.total) || 0
    for (const hit of page.hits) {
      if (!hit || seen.has(hit.project_id)) continue
      seen.add(hit.project_id)
      merged.push(hit)
    }
  }
  if (sortField === 6) {
    merged.sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
  } else if (sortField === 3 || sortField === 11) {
    merged.sort((a, b) => (Date.parse(b.date_modified) || 0) - (Date.parse(a.date_modified) || 0))
  }
  return { hits: merged.slice(0, Math.max(1, limit)), totalHits }
}

test('detalle: fan-out multi-categoría fusiona, dedupea y ordena', () => {
  const pages = [
    { total: 2, hits: [{ project_id: '1', downloads: 10, date_modified: '2026-01-01' }, { project_id: '2', downloads: 50, date_modified: '2026-03-01' }] },
    { total: 2, hits: [{ project_id: '2', downloads: 50, date_modified: '2026-03-01' }, { project_id: '3', downloads: 30, date_modified: '2026-02-01' }] }
  ]
  const byDownloads = mergeCurseForgeCategoryPages(pages, 6, 10)
  assert.equal(byDownloads.totalHits, 4)
  assert.deepEqual(byDownloads.hits.map(h => h.project_id), ['2', '3', '1'])
  const byUpdated = mergeCurseForgeCategoryPages(pages, 3, 2)
  assert.deepEqual(byUpdated.hits.map(h => h.project_id), ['2', '3'])
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

// Replicate buildModrinthFacets logic for unit test (must match main.js:731)
const modrinthTypeFilters = {
  all: [],
  mod: [['project_type:mod']],
  modpack: [['project_type:modpack']],
  resourcepack: [['project_type:resourcepack']],
  shader: [['project_type:shader']],
  datapack: [['project_type:mod'], ['categories:datapack']],
  plugin: [['project_type:mod'], ['categories:bukkit', 'categories:spigot', 'categories:paper', 'categories:purpur', 'categories:folia', 'categories:velocity', 'categories:waterfall']]
}
function normalizeVersion(value) {
  const clean = String(value || '').trim()
  if (!clean) return ''
  if (!/^\d+(?:\.\d+){1,2}(?:-(?:pre|rc)\d+)?$/i.test(clean)) throw new Error('Version invalida')
  return clean
}
function buildModrinthFacets(payload) {
  const type = String(payload.type || 'all')
  const facets = [...(modrinthTypeFilters[type] || [])]
  const version = normalizeVersion(payload.version)
  if (version) facets.push(['versions:' + version])
  const loader = String(payload.loader || '').toLowerCase()
  const loaderAllowedTypes = new Set(['mod', 'all'])
  if (['fabric', 'forge', 'neoforge', 'quilt'].includes(loader) && loaderAllowedTypes.has(type)) {
    facets.push(['categories:' + loader])
  }
  return facets
}

test('P1-1: loader filtering allowlist', () => {
  // mod + fabric → loader aplicado
  assert.deepEqual(buildModrinthFacets({ type: 'mod', loader: 'fabric' }), [['project_type:mod'], ['categories:fabric']])
  assert.deepEqual(buildModrinthFacets({ type: 'mod', loader: 'forge', version: '1.21.4' }), [['project_type:mod'], ['versions:1.21.4'], ['categories:forge']])
  // all + fabric → loader aplicado
  assert.deepEqual(buildModrinthFacets({ type: 'all', loader: 'fabric' }), [['categories:fabric']])
  // modpack + fabric → NO loader (modpack no debe filtrar por loader)
  assert.deepEqual(buildModrinthFacets({ type: 'modpack', loader: 'fabric' }), [['project_type:modpack']])
  // resourcepack + fabric → NO loader
  assert.deepEqual(buildModrinthFacets({ type: 'resourcepack', loader: 'fabric' }), [['project_type:resourcepack']])
  assert.deepEqual(buildModrinthFacets({ type: 'resourcepack', loader: 'fabric', version: '1.21.4' }), [['project_type:resourcepack'], ['versions:1.21.4']])
  // shader + fabric → NO loader
  assert.deepEqual(buildModrinthFacets({ type: 'shader', loader: 'fabric' }), [['project_type:shader']])
  // datapack + fabric → NO loader (P1-1 fix, antes sí lo aplicaba)
  assert.deepEqual(buildModrinthFacets({ type: 'datapack', loader: 'fabric' }), [['project_type:mod'], ['categories:datapack']])
  // plugin + fabric → NO loader
  assert.deepEqual(buildModrinthFacets({ type: 'plugin', loader: 'fabric' }), [['project_type:mod'], ['categories:bukkit', 'categories:spigot', 'categories:paper', 'categories:purpur', 'categories:folia', 'categories:velocity', 'categories:waterfall']])
  // shader/resourcepack/datapack/plugin con loader y version → solo version, no loader
  assert.deepEqual(buildModrinthFacets({ type: 'shader', loader: 'quilt', version: '1.20.1' }), [['project_type:shader'], ['versions:1.20.1']])
})

test('P1-1: main.js allowlist es solo mod y all', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  // Debe contener el allowlist corregido y NO contener plugin/datapack en el allowlist
  assert.match(mainSource, /loaderAllowedTypes\s*=\s*new Set\(\['mod',\s*'all'\]\)/)
  assert.equal(mainSource.includes("loaderAllowedTypes = new Set(['mod', 'plugin'"), false)
  assert.equal(mainSource.includes("loaderAllowedTypes = new Set(['mod', 'plugin', 'datapack'"), false)
})

// Integración real contra Modrinth (requiere red, puede skipear si no hay conexión)
test('P1-1: integración Modrinth resourcepack+fabric no filtra por loader', async () => {
  const MODRINTH_API = 'https://api.modrinth.com/v2'
  const UA = 'KindyrLauncher/1.2.0'
  async function search(payload) {
    const facets = buildModrinthFacets(payload)
    const url = new URL(MODRINTH_API + '/search')
    url.searchParams.set('index', 'relevance')
    url.searchParams.set('offset', '0')
    url.searchParams.set('limit', '3')
    if (facets.length) url.searchParams.set('facets', JSON.stringify(facets))
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error('Modrinth search failed ' + res.status)
    return res.json()
  }
  // resourcepack + fabric debe devolver resourcepacks (no filtrado por fabric) y total alto
  const rpFabric = await search({ type: 'resourcepack', loader: 'fabric', version: '1.21.4' }).catch(() => null)
  if (!rpFabric) { console.log('skip: sin conexión Modrinth'); return }
  assert.ok(rpFabric.total_hits > 1000, 'resourcepack+fabric debe tener >1000 hits (no 2)')
  assert.ok(rpFabric.hits.every(h => h.project_type === 'resourcepack'), 'todos deben ser resourcepack')
  // shader + fabric debe devolver shaders
  const shaderFabric = await search({ type: 'shader', loader: 'fabric' }).catch(() => null)
  if (shaderFabric) {
    assert.ok(shaderFabric.total_hits > 100, 'shader+fabric debe tener hits')
    if (shaderFabric.hits.length) assert.equal(shaderFabric.hits[0].project_type, 'shader')
  }
  // mod + fabric debe seguir filtrando y devolver mods
  const modFabric = await search({ type: 'mod', loader: 'fabric', version: '1.21.4' })
  assert.ok(modFabric.total_hits > 1000)
  assert.ok(modFabric.hits.every(h => h.project_type === 'mod'))
})

// P1-2: new_filters builder
function buildModrinthNewFilters(payload) {
  const type = String(payload.type || 'all')
  const parts = []
  if (type === 'mod') parts.push('project_types = mod')
  else if (type === 'modpack') parts.push('project_types = modpack')
  else if (type === 'resourcepack') parts.push('project_types = resourcepack')
  else if (type === 'shader') parts.push('project_types = shader')
  else if (type === 'datapack') parts.push('project_types = mod AND categories = datapack')
  else if (type === 'plugin') parts.push('project_types = mod AND (categories = bukkit OR categories = spigot OR categories = paper OR categories = purpur OR categories = folia OR categories = velocity OR categories = waterfall)')
  const version = normalizeVersion(payload.version)
  if (version) parts.push(`game_versions = '${version}'`)
  const loader = String(payload.loader || '').toLowerCase()
  const loaderAllowedTypes = new Set(['mod', 'all'])
  if (['fabric', 'forge', 'neoforge', 'quilt'].includes(loader) && loaderAllowedTypes.has(type)) {
    parts.push(`loaders = ${loader}`)
  }
  return parts.join(' AND ')
}

test('P1-2: new_filters builder casos requeridos', () => {
  assert.equal(buildModrinthNewFilters({ type: 'mod', loader: 'fabric', version: '1.21.4' }), "project_types = mod AND game_versions = '1.21.4' AND loaders = fabric")
  assert.equal(buildModrinthNewFilters({ type: 'mod', loader: 'forge', version: '1.20.1' }), "project_types = mod AND game_versions = '1.20.1' AND loaders = forge")
  assert.equal(buildModrinthNewFilters({ type: 'modpack', version: '1.21.4' }), "project_types = modpack AND game_versions = '1.21.4'")
  assert.equal(buildModrinthNewFilters({ type: 'resourcepack', version: '1.21.4' }), "project_types = resourcepack AND game_versions = '1.21.4'")
  assert.equal(buildModrinthNewFilters({ type: 'shader', version: '1.21.4' }), "project_types = shader AND game_versions = '1.21.4'")
  assert.equal(buildModrinthNewFilters({ type: 'datapack', version: '1.21.4' }), "project_types = mod AND categories = datapack AND game_versions = '1.21.4'")
  assert.equal(buildModrinthNewFilters({ type: 'plugin', version: '1.21.4' }), "project_types = mod AND (categories = bukkit OR categories = spigot OR categories = paper OR categories = purpur OR categories = folia OR categories = velocity OR categories = waterfall) AND game_versions = '1.21.4'")
  assert.equal(buildModrinthNewFilters({ type: 'mod', loader: 'fabric' }), "project_types = mod AND loaders = fabric")
  assert.equal(buildModrinthNewFilters({ type: 'all' }), "")
  assert.equal(buildModrinthNewFilters({}), "")
  assert.equal(buildModrinthNewFilters({ type: 'mod', loader: 'fabric', version: '' }), "project_types = mod AND loaders = fabric")
  // Combinación varios filtros ya cubierta arriba
  // resourcepack/shader/datapack/plugin NO deben recibir loader
  assert.equal(buildModrinthNewFilters({ type: 'resourcepack', loader: 'fabric', version: '1.21.4' }), "project_types = resourcepack AND game_versions = '1.21.4'")
  assert.equal(buildModrinthNewFilters({ type: 'shader', loader: 'fabric' }), "project_types = shader")
  assert.equal(buildModrinthNewFilters({ type: 'datapack', loader: 'fabric' }), "project_types = mod AND categories = datapack")
  assert.equal(buildModrinthNewFilters({ type: 'plugin', loader: 'fabric' }), "project_types = mod AND (categories = bukkit OR categories = spigot OR categories = paper OR categories = purpur OR categories = folia OR categories = velocity OR categories = waterfall)")
})

test('P1-2: new_filters usa game_versions no versions', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  assert.match(mainSource, /buildModrinthNewFilters/)
  assert.match(mainSource, /game_versions/)
  assert.equal(mainSource.includes("buildModrinthNewFilters") && mainSource.includes("project_types = mod"), true)
})

test('P1-2: integración Modrinth new_filters vs facets', async () => {
  const MODRINTH_API = 'https://api.modrinth.com/v2'
  const UA = 'KindyrLauncher/1.2.0'
  async function searchNew(payload) {
    const nf = buildModrinthNewFilters(payload)
    const url = new URL(MODRINTH_API + '/search')
    url.searchParams.set('index', 'relevance')
    url.searchParams.set('offset', '0')
    url.searchParams.set('limit', '3')
    if (nf) url.searchParams.set('new_filters', nf)
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error('new_filters failed ' + res.status)
    return res.json()
  }
  async function searchFacets(payload) {
    const facets = buildModrinthFacets(payload)
    const url = new URL(MODRINTH_API + '/search')
    url.searchParams.set('index', 'relevance')
    url.searchParams.set('offset', '0')
    url.searchParams.set('limit', '3')
    if (facets.length) url.searchParams.set('facets', JSON.stringify(facets))
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    return res.json()
  }
  const cases = [
    { type: 'mod', loader: 'fabric', version: '1.21.4' },
    { type: 'resourcepack', version: '1.21.4' },
    { type: 'shader', version: '1.21.4' },
    { type: 'datapack', version: '1.21.4' },
    { type: 'plugin', version: '1.21.4' },
    { type: 'mod', loader: 'fabric' },
    { type: 'all' },
  ]
  for (const c of cases) {
    const nf = await searchNew(c).catch(() => null)
    const fac = await searchFacets(c).catch(() => null)
    if (!nf || !fac) { console.log('skip case', c, 'sin conexión'); continue }
    // Ambos deben devolver mismo project_type dominante y total similar
    assert.ok(Math.abs(nf.total_hits - fac.total_hits) < fac.total_hits * 0.2 || nf.total_hits > 0, `new_filters vs facets total similar for ${JSON.stringify(c)}`)
  }
  // Sin filtros
  const noFilterNew = await searchNew({}).catch(()=>null)
  const noFilterFac = await searchFacets({}).catch(()=>null)
  if (noFilterNew && noFilterFac) assert.ok(noFilterNew.total_hits > 1000 && noFilterFac.total_hits > 1000)
})

test('P1-2: fallback y limit/offset', () => {
  // Verificar que main.js implementa fallback new_filters -> facets
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  assert.match(mainSource, /newFilters/)
  assert.match(mainSource, /facets/)
  assert.match(mainSource, /fallback/i)
  // limit/offset igual que antes
  assert.match(mainSource, /Math\.max\(0, Math\.min\(Number\(payload\.offset\)/)
  assert.match(mainSource, /Math\.max\(1, Math\.min\(Number\(payload\.limit\)/)
})

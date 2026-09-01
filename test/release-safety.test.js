const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const preloadSource = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
const navigationSource = fs.readFileSync(path.join(root, 'navigation.js'), 'utf8')
const instancesSource = fs.readFileSync(path.join(root, 'instances.js'), 'utf8')
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const stylesSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8')
const manifest = require('../package.json')

test('uses XMCL as the only Minecraft launch engine', () => {
  assert.equal(mainSource.includes('minecraft-launcher-core'), false)
  assert.equal(mainSource.includes('KINDYR_USE_MCLC'), false)
  assert.equal(mainSource.includes('.mclc('), false)
  assert.equal('minecraft-launcher-core' in manifest.dependencies, false)
})

test('does not expose Microsoft access tokens through the renderer API', () => {
  assert.equal(preloadSource.includes('access_token'), false)
  assert.match(mainSource, /sanitizeMicrosoftAccount/)
})

test('persists and renews Microsoft sessions only in the main process', () => {
  assert.match(mainSource, /refresh_token: refreshToken/)
  assert.match(mainSource, /getMicrosoftAuth\(\)\.refresh\(account\.refresh_token\)/)
  assert.match(mainSource, /const msAccount = await getActiveMicrosoftAccount\(\)/)
  assert.equal(preloadSource.includes('refresh_token'), false)
})

test('packages the runtime security helpers', () => {
  for (const file of ['account-storage.js', 'archive-utils.js', 'mrpack-utils.js', 'skin-security.js']) {
    assert.ok(manifest.build.files.includes(file), `${file} debe incluirse en app.asar`)
  }
})

test('the mrpack importer downloads accepted files through the safe destination helper', () => {
  assert.match(mainSource, /function safePath\(root, relativePath\)/)
  assert.match(mainSource, /ipcMain\.handle\('import-mrpack'[\s\S]*getClientMrpackFiles\(index\)[\s\S]*downloadMrpackFile\(file,/)
  assert.match(mainSource, /downloadMrpackFile[\s\S]*verifyMrpackFile/)
})

test('releases the dynamic instance detail view when navigating away', () => {
  assert.match(navigationSource, /activeView\?\.id === 'instance-detail-view'[\s\S]*disposeInstanceDetailView\(\)/)
  assert.match(instancesSource, /function disposeInstanceDetailView\(\)[\s\S]*replaceChildren\(\)[\s\S]*loadedSections\.delete\('instance-detail'\)/)
})

test('uses the Kindyr-specific install dialog', () => {
  assert.match(indexSource, /MODRINTH · INSTALADOR/)
  assert.match(stylesSource, /\/\* Kindyr install flow \*\//)
})

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
  for (const file of ['account-storage.js', 'archive-utils.js', 'mrpack-utils.js', 'curseforge-modpack.js', 'skin-security.js', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.es.md']) {
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

test('the create-instance modal asks modpack vs custom first', () => {
  assert.match(indexSource, /id="create-step-choice"/)
  assert.match(indexSource, /id="create-step-modpack"/)
  assert.match(indexSource, /id="create-step-custom"/)
  assert.match(indexSource, /selectCreateStep\('modpack'\)/)
  assert.match(indexSource, /selectCreateStep\('custom'\)/)
  assert.match(instancesSource, /function selectCreateStep\(step\)/)
  assert.match(instancesSource, /function createBrowseModpacks\(\)/)
  assert.match(instancesSource, /function createImportMrpack\(\)/)
  const commonSource = fs.readFileSync(path.join(root, 'common.js'), 'utf8')
  for (const key of ['create.choice.title', 'create.choice.modpack', 'create.choice.custom', 'create.choice.search', 'create.choice.importFile', 'create.back', 'create.name', 'create.gameVersion', 'create.loaderVersion', 'create.channel.stable', 'create.channel.latest', 'create.channel.other', 'create.icon.upload', 'create.icon.random', 'create.icon.customize']) {
    assert.ok(commonSource.includes(`'${key}'`), `falta i18n ${key}`)
  }
})

test('the custom create step has icon, name, version select and loader channel', () => {
  for (const id of ['create-icon-preview', 'create-preset-grid', 'create-name', 'create-version-select', 'create-loader-channel-wrap', 'create-channel-row', 'create-other-loader']) {
    assert.match(indexSource, new RegExp(`id="${id}"`), `falta #${id} en el modal`)
  }
  assert.match(instancesSource, /function selectCreateChannel\(channel\)/)
  assert.match(instancesSource, /function loadCreateLoaderVersions\(\)/)
  assert.match(instancesSource, /function instanceIconHtml\(instance, cls\)/)
  const mainSource2 = mainSource
  assert.match(mainSource2, /ipcMain\.handle\('loader-versions'/)
  assert.match(mainSource2, /ipcMain\.handle\('browse-instance-icon'/)
  assert.match(mainSource2, /function resolveInstanceIcon\(iconPayload\)/)
})

test('instance icons use absolute paths with migration for legacy relative ones', () => {
  assert.match(mainSource, /function migrateInstanceIcons\(instances\)/)
  assert.match(mainSource, /\{\s*file:\s*path\.join\(getInstanceDir\(instanceId\), icon\.file\)\s*\}/)
  assert.match(instancesSource, /onerror="this\.remove\(\)"/)
})

test('the instance settings modal has three tabs and backend handlers', () => {
  assert.match(indexSource, /id="instance-settings-modal"/)
  for (const id of ['instance-settings-head', 'instance-settings-nav', 'isettings-name', 'isettings-delete-confirm', 'isettings-mc-select', 'isettings-ram-min', 'isettings-java-home']) {
    assert.match(indexSource, new RegExp(`id="${id}"`), `falta #${id}`)
  }
  for (const fn of ['openInstanceSettings', 'switchInstanceSettingsTab', 'isettingsDelete', 'isettingsDuplicate', 'isettingsApplyVersion', 'isettingsRepair', 'isettingsSaveJava', 'namesMatchLoose']) {
    assert.match(instancesSource, new RegExp(`function ${fn}\\(`), `falta ${fn}`)
  }
  for (const channel of ['instance-rename', 'instance-duplicate', 'instance-delete', 'instance-set-icon', 'instance-set-channel', 'instance-set-launch-opts', 'instance-change-version', 'instance-repair', 'instance-unlink-modpack']) {
    assert.match(mainSource, new RegExp(`ipcMain\\.handle\\('${channel}'`), `falta IPC ${channel}`)
  }
  const preloadSource = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
  for (const api of ['rename:', 'duplicate:', 'remove:', 'setIcon:', 'setChannel:', 'changeVersion:', 'repair:', 'unlinkModpack:']) {
    assert.ok(preloadSource.includes(api), `falta preload ${api}`)
  }
})

test('downloads and rollbacks only allow safe https destinations', () => {
  assert.match(mainSource, /parsed\.protocol !== 'https:'/)
  assert.match(mainSource, /function assertSafeReleaseDownloadUrl\(value\)/)
  assert.match(mainSource, /assertSafeReleaseDownloadUrl\(asset\.browser_download_url\)/)
})

test('all windows deny popups and foreign navigation', () => {
  assert.match(mainSource, /function hardenWindowNavigation\(win\)/)
  assert.match(mainSource, /setWindowOpenHandler\(\(\) => \(\{\s*action: 'deny'\s*\}\)\)/)
  assert.match(mainSource, /hardenWindowNavigation\(mainWindow\)/)
  assert.match(mainSource, /hardenWindowNavigation\(splashWindow\)/)
})

test('the update dialog never uses node require in the renderer', () => {
  const updateDialog = fs.readFileSync(path.join(root, 'update-confirmation.html'), 'utf8')
  assert.equal(updateDialog.includes("require('electron')"), false)
})

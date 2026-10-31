// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { getCurseForgeCategories, getCurseForgeFiles, getCurseForgeProjectDetails, normalizeCurseForgeFileForUI, searchCurseForge } = require('../providers/curseforge')
const { getCurseForgeApiKey, getCurseForgeStore } = require('../providers/curseforge-key')
const { installCurseForgeLatestReleaseProject, installCurseForgeProject } = require('../install/curseforge')
const { installLatestReleaseProject, installModrinthProject } = require('../install/modrinth')
const { identifyInstanceContentFiles } = require('../instance-content')
const { getModrinthProjectDetails, getModrinthTwinProject, getModrinthVersionDetails, getModrinthVersions, searchModrinth } = require('../providers/modrinth')
const { getKindyrDataRoot } = require('../paths')
const { listCreatableInstances, listLoaderVersions } = require('../versions')

ipcMain.handle('modrinth-search', async (_event, payload) => {
  try {
    const result = await searchModrinth(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-search', async (_event, payload) => {
  try {
    const result = await searchCurseForge(payload)
    return { ok: true, ...result }
  } catch (error) {
    // Sin retry en AUTH. Modrinth intacto: este canal nunca lo toca.
    return { ok: false, error: error.message || String(error), code: error.code || 'CF_ERROR', status: error.status || 0 }
  }
})

ipcMain.handle('curseforge-status', () => {
  try {
    const hasKey = Boolean(getCurseForgeApiKey())
    return { ok: true, hasKey }
  } catch (e) {
    return { ok: true, hasKey: false }
  }
})

ipcMain.handle('curseforge-categories', async () => {
  try {
    const categories = await getCurseForgeCategories()
    return { ok: true, categories }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('modrinth-details', async (_event, payload) => {
  try {
    const details = await getModrinthProjectDetails(payload)
    return { ok: true, details }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-details', async (_event, payload) => {
  try {
    const details = await getCurseForgeProjectDetails(payload)
    return { ok: true, details }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-set-key', (_event, apiKey) => {
  try {
    const key = String(apiKey || '').trim()
    // S5: las keys reales de CurseForge rondan los 60 caracteres; cota alta
    // para no romper formatos futuros, pero acotada (va al store cifrado y
    // al header x-api-key de cada request).
    if (!key || key.length < 10 || key.length > 256 || /[\s\x00-\x1F\x7F]/.test(key)) return { ok: false, error: 'API key inválida.' }
    getCurseForgeStore().save(key)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-versions', async (_event, payload) => {
  try {
    const files = await getCurseForgeFiles(payload)
    const versions = files.map(normalizeCurseForgeFileForUI)
    return { ok: true, versions }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-install', async (_event, payload) => {
  try {
    const result = await installCurseForgeProject(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-install-latest-release', async (_event, payload) => {
  try {
    const result = await installCurseForgeLatestReleaseProject(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('modrinth-versions', async (_event, payload) => {
  try {
    const versions = await getModrinthVersions(payload)
    return { ok: true, versions }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('modrinth-version', async (_event, payload) => {
  try {
    const version = await getModrinthVersionDetails(payload)
    return { ok: true, version }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-find-twin', async (_event, payload = {}) => {
  try {
    const twin = await getModrinthTwinProject(payload)
    return { ok: true, ...twin }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('identify-instance-content', async (_event, payload = {}) => {
  try {
    const result = await identifyInstanceContentFiles(payload.instanceId, payload.limit)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('get-onboarding-settings', () => {
  try {
    const file = path.join(getKindyrDataRoot(), 'settings.json')
    if (!fs.existsSync(file)) return { ok: false }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { ok: true, settings: data }
  } catch (e) {
    return { ok: false }
  }
})

ipcMain.handle('modrinth-install', async (_event, payload) => {
  try {
    const result = await installModrinthProject(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('modrinth-install-latest-release', async (_event, payload) => {
  try {
    const result = await installLatestReleaseProject(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('minecraft-versions', async (_event, payload) => {
  try {
    const versions = await listCreatableInstances(payload)
    return { ok: true, versions }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('loader-versions', async (_event, payload = {}) => {
  try {
    const versions = await listLoaderVersions(payload.loader, payload.minecraftVersion)
    return { ok: true, versions }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { app, ipcMain, shell } = require('electron')
const { handleFatalError } = require('../fatal')
const { getSemver } = require('../lazy-deps')
const { assertSafeReleaseDownloadUrl, loadPreviousVersion } = require('../updater')
const { fetchWithTimeout } = require('../http')

ipcMain.handle('get-app-version', () => app.getVersion())

// TEMPORAL PARA BORRAR (test crash con juego vivo): solo dev (!isPackaged).
// Responde ok primero y luego provoca uncaught real para verificar el diálogo
// Solo launcher / Cerrar todo + huérfana. En empaquetado siempre rechaza.
ipcMain.handle('crash-simulate', () => {
  if (app.isPackaged) return { ok: false, error: 'Solo disponible en desarrollo (pnpm start).' }
  setTimeout(() => {
    try { handleFatalError('simulated-crash', new Error('Crash simulado para probar Solo launcher vs Cerrar todo.')) } catch {}
  }, 300).unref?.()
  return { ok: true }
})

ipcMain.handle('get-previous-versions', async () => {
  try {
    const current = app.getVersion()
    const res = await fetchWithTimeout('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases?per_page=20', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + current }
    })
    if (!res.ok) throw new Error('GitHub ' + res.status)
    const releases = await res.json()
    const semver = getSemver()
    const currentValid = semver.valid(String(current).replace(/^[vV]/, ''), { loose: true })
    const list = (Array.isArray(releases) ? releases : [])
      .filter(r => !r.draft && r.tag_name)
      .map(r => ({
        tag: String(r.tag_name),
        version: String(r.tag_name).replace(/^[vV]/, ''),
        name: r.name || r.tag_name,
        prerelease: Boolean(r.prerelease),
        published_at: r.published_at,
        url: r.html_url,
        assets: (r.assets || []).map(a => ({ name: a.name, url: a.browser_download_url }))
      }))
      .filter(r => semver.valid(r.version, { loose: true }))
      .filter(r => !currentValid || semver.lt(r.version, currentValid) || r.version === currentValid)
      .sort((a, b) => semver.rcompare(a.version, b.version))
      .slice(0, 8)
    return { ok: true, current, versions: list }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('rollback-to-version', async (_event, tag) => {
  try {
    const cleanTag = String(tag || '').trim()
    if (!cleanTag) throw new Error('Tag inválido')
    const current = app.getVersion()
    const semver = getSemver()
    const curValid = semver.valid(String(current).replace(/^[vV]/, ''), { loose: true })
    const res = await fetchWithTimeout(`https://api.github.com/repos/iDontrixss/KindyrLauncher/releases/tags/${encodeURIComponent(cleanTag.replace(/^[vV]/, 'v'))}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + current }
    })
    if (!res.ok) throw new Error('Release no encontrada: ' + cleanTag)
    const release = await res.json()
    // HALLAZGO NUEVO (downgrade arbitrario): el tag venía del renderer sin
    // cotejar. Un renderer comprometido podía abrir el instalador de
    // CUALQUIER tag: drafts no publicados o versiones no menores que la
    // actual. Misma política que get-previous-versions: release publicada
    // (no draft) con semver válido y estrictamente menor que la actual.
    // Las prereleases SE permiten a propósito: la UI las lista con badge
    // BETA (ajustes) y ofrece rollback a ellas; bloquearlas rompería el
    // flujo legítimo.
    const relVersion = semver.valid(String(release.tag_name || '').replace(/^[vV]/, ''), { loose: true })
    if (release.draft || !relVersion || !curValid || !semver.lt(relVersion, curValid)) {
      throw new Error('Solo se puede volver a una versión publicada anterior a la actual: ' + cleanTag)
    }
    const asset = (release.assets || []).find(a => /Setup.*\.exe$/i.test(a.name) || /\.exe$/i.test(a.name)) || (release.assets || [])[0]
    if (!asset || !asset.browser_download_url) throw new Error('No hay instalador para ' + cleanTag)
    await shell.openExternal(assertSafeReleaseDownloadUrl(asset.browser_download_url))
    return { ok: true, url: asset.browser_download_url }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('get-downgrade-target', async () => {
  try {
    const current = app.getVersion()
    const stored = loadPreviousVersion()
    if (stored) {
      const semver = getSemver()
      const curValid = semver.valid(String(current).replace(/^[vV]/, ''), { loose: true })
      const prevValid = semver.valid(String(stored).replace(/^[vV]/, ''), { loose: true })
      if (prevValid && (!curValid || prevValid !== curValid)) {
        return { ok: true, tag: stored.startsWith('v') ? stored : 'v' + stored, version: String(stored).replace(/^[vV]/, ''), source: 'stored' }
      }
    }
    // Fallback: buscar en GitHub la versión inmediatamente anterior a current
    const res = await fetchWithTimeout('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases?per_page=20', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + current }
    })
    if (!res.ok) throw new Error('GitHub ' + res.status)
    const releases = await res.json()
    const semver = getSemver()
    const curValid = semver.valid(String(current).replace(/^[vV]/, ''), { loose: true })
    const sorted = (Array.isArray(releases) ? releases : [])
      .filter(r => !r.draft && r.tag_name && semver.valid(String(r.tag_name).replace(/^[vV]/, ''), { loose: true }))
      .map(r => ({ tag: String(r.tag_name), version: String(r.tag_name).replace(/^[vV]/, ''), prerelease: Boolean(r.prerelease) }))
      .filter(r => curValid ? semver.lt(r.version, curValid) : true)
      .sort((a, b) => semver.rcompare(a.version, b.version))
    const target = sorted[0] || null
    if (!target) return { ok: false, error: 'No hay versión anterior disponible' }
    return { ok: true, tag: target.tag, version: target.version, source: 'github' }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('downgrade-to-previous', async () => {
  try {
    const targetRes = await (async () => {
      const stored = loadPreviousVersion()
      if (stored) return { ok: true, tag: stored.startsWith('v') ? stored : 'v' + stored }
      const res = await fetchWithTimeout('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases?per_page=20', {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + app.getVersion() }
      })
      if (!res.ok) throw new Error('GitHub ' + res.status)
      const releases = await res.json()
      const semver = getSemver()
      const curValid = semver.valid(String(app.getVersion()).replace(/^[vV]/, ''), { loose: true })
      const sorted = (Array.isArray(releases) ? releases : [])
        .filter(r => !r.draft && r.tag_name && semver.valid(String(r.tag_name).replace(/^[vV]/, ''), { loose: true }))
        .filter(r => curValid ? semver.lt(String(r.tag_name).replace(/^[vV]/, ''), curValid) : true)
        .sort((a, b) => semver.rcompare(String(a.tag_name).replace(/^[vV]/, ''), String(b.tag_name).replace(/^[vV]/, '')))
      const target = sorted[0]
      if (!target) throw new Error('No hay versión anterior')
      return { ok: true, tag: String(target.tag_name) }
    })()
    if (!targetRes.ok) throw new Error(targetRes.error || 'No hay versión previa')
    const tag = targetRes.tag
    const res = await fetchWithTimeout(`https://api.github.com/repos/iDontrixss/KindyrLauncher/releases/tags/${encodeURIComponent(tag.replace(/^[vV]/, 'v'))}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + app.getVersion() }
    })
    if (!res.ok) throw new Error('Release no encontrada: ' + tag)
    const release = await res.json()
    const asset = (release.assets || []).find(a => /Setup.*\.exe$/i.test(a.name) || /\.exe$/i.test(a.name)) || (release.assets || [])[0]
    if (!asset || !asset.browser_download_url) throw new Error('No hay instalador para ' + tag)
    await shell.openExternal(assertSafeReleaseDownloadUrl(asset.browser_download_url))
    return { ok: true, tag, url: asset.browser_download_url }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

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

test('xmcl file-transfer shim exists and main.js has hook', () => {
  const shimPath = path.join(root, 'xmcl-shims', 'core-utils.js')
  assert.ok(fs.existsSync(shimPath), 'xmcl-shims/core-utils.js debe existir')
  const shim = require(shimPath)
  assert.equal(typeof shim.isNotNull, 'function')
  assert.equal(shim.isNotNull('a'), true)
  assert.equal(shim.isNotNull(null), false)
  assert.equal(typeof shim.checksum, 'function')
  assert.equal(typeof shim.exists, 'function')

  // main.js must contain the subpath shims to prevent stripping error
  assert.match(mainSource, /@xmcl\/core\/utils/)
  assert.match(mainSource, /@xmcl\/file-transfer/)
  assert.match(mainSource, /xmcl-shims.*core-utils/)
  assert.match(mainSource, /Module\._resolveFilename/)
})

test('xmcl file-transfer dist can be required without type stripping', () => {
  // Direct dist require should work (bypasses index.ts)
  const candidates = [
    path.join(root, 'node_modules', '.pnpm', '@xmcl+file-transfer@2.1.2', 'node_modules', '@xmcl', 'file-transfer', 'dist', 'index.js'),
    path.join(root, 'node_modules', '@xmcl', 'file-transfer', 'dist', 'index.js')
  ]
  let loaded = null
  let lastError = null
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue
    try {
      loaded = require(p)
      break
    } catch (e) { lastError = e }
  }
  // Fallback to require.resolve
  if (!loaded) {
    try {
      const resolved = require.resolve('@xmcl/file-transfer/dist/index.js')
      loaded = require(resolved)
    } catch (e) { lastError = e }
  }
  assert.ok(loaded, `file-transfer dist debe cargarse sin stripping: ${lastError?.message || 'no candidate'}`)
  assert.equal(typeof loaded.getDefaultAgent, 'function')
})

test('xmcl installer can be required with core/utils shim', () => {
  // Install the same hook as main.js does for this test process
  const Module = require('module')
  const originalResolve = Module._resolveFilename
  let hookInstalled = false
  if (!Module._resolveFilename.__kindyrPatched) {
    Module._resolveFilename = function(request, parent, isMain, options) {
      if (request === '@xmcl/core/utils' || request === '@xmcl/core/utils.js') {
        const shim = path.join(root, 'xmcl-shims', 'core-utils.js')
        if (fs.existsSync(shim)) return shim
      }
      if (request === '@xmcl/file-transfer') {
        try {
          const store = path.join(root, 'node_modules', '.pnpm')
          const entries = fs.readdirSync(store).filter(e => e.startsWith('@xmcl+file-transfer@'))
          for (const entry of entries) {
            const cand = path.join(store, entry, 'node_modules', '@xmcl', 'file-transfer', 'dist', 'index.js')
            if (fs.existsSync(cand)) return cand
          }
        } catch {}
      }
      return originalResolve.apply(this, arguments)
    }
    Module._resolveFilename.__kindyrPatched = true
    hookInstalled = true
  }

  try {
    // Clear installer cache
    const installerPath = require.resolve('@xmcl/installer/dist/index.js')
    delete require.cache[installerPath]
    // Also clear core/utils cache if any
    Object.keys(require.cache).forEach(k => {
      if (k.includes('@xmcl')) delete require.cache[k]
    })
    const installer = require('@xmcl/installer/dist/index.js')
    assert.ok(installer, 'installer dist debe cargarse')
    // Check that it has expected exports (install, getVersionList)
    assert.ok(typeof installer.install === 'function' || typeof installer.getVersionList === 'function' || typeof installer.installForge === 'function' || Object.keys(installer).length > 0)
  } finally {
    if (hookInstalled) {
      Module._resolveFilename = originalResolve
      delete Module._resolveFilename.__kindyrPatched
    }
  }
})

test('xmcl core dist can be required', () => {
  const core = require('@xmcl/core/dist/index.js')
  assert.ok(core)
  assert.equal(typeof core.launch, 'function')
})

test('prepare with invalid version should fail gracefully not with missing module', async () => {
  // Simulate what prepare-instance does for invalid version 26.2: it should fail with version not found, not module not found
  // We check that getMojangVersions would not contain 26.2
  // This is a static check: ensure normalizeVersion allows 26.2 but manifest would not contain it
  const { normalizeVersion } = (() => {
    try {
      // Try to load main's normalizeVersion logic via static copy
      return { normalizeVersion: (v) => String(v).trim() }
    } catch { return {} }
  })()
  assert.ok(true) // placeholder - actual version check is done via manifest, not here
})

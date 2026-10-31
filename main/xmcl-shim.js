// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const APP_ROOT = require('path').resolve(__dirname, '../')
const fs = require('fs')
const path = require('path')

// --- XMCL subpath shim for Node's type stripping limitation (file-transfer main is TS, core/utils missing) ---
try {
  const Module = require('module')
  const originalResolveFilename = Module._resolveFilename
  Module._resolveFilename = function(request, parent, isMain, options) {
    // Core utils - pnpm store has no utils.js, use shim
    if (request === '@xmcl/core/utils' || request === '@xmcl/core/utils.js') {
      const shim = path.join(APP_ROOT, 'xmcl-shims', 'core-utils.js')
      if (fs.existsSync(shim)) return shim
      try {
        const coreDist = require.resolve('@xmcl/core/dist/index.js')
        if (fs.existsSync(coreDist)) return coreDist
      } catch {}
    }
    // File-transfer main is TS (index.ts) - use compiled dist to avoid strip-types error and undici resolution
    if (request === '@xmcl/file-transfer' || request === '@xmcl/file-transfer/dist/index.js' || request === '@xmcl/file-transfer/index.ts') {
      try {
        const pnpmStore = path.join(APP_ROOT, 'node_modules', '.pnpm')
        if (fs.existsSync(pnpmStore)) {
          const entries = fs.readdirSync(pnpmStore).filter(e => e.startsWith('@xmcl+file-transfer@'))
          for (const entry of entries) {
            const candidate = path.join(pnpmStore, entry, 'node_modules', '@xmcl', 'file-transfer', 'dist', 'index.js')
            if (fs.existsSync(candidate)) return candidate
          }
        }
      } catch {}
      const candidates = [
        path.join(APP_ROOT, 'node_modules', '@xmcl', 'file-transfer', 'dist', 'index.js')
      ]
      for (const c of candidates) if (fs.existsSync(c)) return c
      try {
        const resolved = require.resolve('@xmcl/file-transfer/dist/index.js')
        if (fs.existsSync(resolved)) return resolved
      } catch {}
    }
    // Generic fallback for any @xmcl/* subpath that would hit TS strip error: try dist
    if (request.startsWith('@xmcl/') && request.includes('/') && !request.endsWith('.js') && !request.endsWith('.mjs')) {
      const parts = request.split('/')
      if (parts.length === 3) {
        const pkg = `${parts[0]}/${parts[1]}`
        const sub = parts[2]
        // Try shim for known subpaths
        if (pkg === '@xmcl/core' && sub === 'utils') {
          const shim = path.join(APP_ROOT, 'xmcl-shims', 'core-utils.js')
          if (fs.existsSync(shim)) return shim
        }
        // Try dist file for subpath
        try {
          const base = require.resolve(`${pkg}/dist/index.js`)
          const dir = path.dirname(base)
          const candidate = path.join(dir, `${sub}.js`)
          if (fs.existsSync(candidate)) return candidate
        } catch {}
      }
    }
    return originalResolveFilename.apply(this, arguments)
  }
} catch {}

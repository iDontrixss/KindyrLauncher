// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

let installer
try {
  installer = require.resolve('electron/install.js')
} catch {
  console.log('Electron no está instalado; se omite la descarga del binario.')
  process.exit(0)
}

const major = Number(process.versions.node.split('.')[0])
if (major >= 26) {
  console.error('Electron 42 no completa su instalador con Node 26. Usá Node 24 LTS (ver .nvmrc).')
  process.exit(1)
}

const result = spawnSync(process.execPath, [installer], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status || 1)

const electronRoot = path.dirname(require.resolve('electron/package.json'))
const executableName = fs.readFileSync(path.join(electronRoot, 'path.txt'), 'utf8').trim()
const executable = path.join(electronRoot, 'dist', executableName)
if (!fs.existsSync(executable)) {
  console.error(`El instalador de Electron no creó el binario esperado: ${executable}`)
  process.exit(1)
}

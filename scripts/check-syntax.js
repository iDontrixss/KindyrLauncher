// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const files = []

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(absolute)
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolute)
  }
}

collect(root)
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout)
    process.exit(result.status || 1)
  }
}

console.log(`Sintaxis válida: ${files.length} archivos JavaScript.`)

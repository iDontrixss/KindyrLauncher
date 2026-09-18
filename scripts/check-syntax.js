// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const files = []
const htmlFiles = []

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(absolute)
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolute)
    else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(absolute)
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

// Los scripts inline de las secciones (ej. sections/descubrir.html) también rompen
// la app si tienen un error de sintaxis: se compilan igual que un .js.
let inlineCount = 0
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script\s*>/gi)]
  blocks.forEach((match, index) => {
    if (!match[1].trim()) return
    inlineCount += 1
    try {
      new vm.Script(match[1], { filename: `${file}#inline${index}` })
    } catch (error) {
      process.stderr.write(`${file}#inline${index}: ${error.message}\n`)
      process.exitCode = 1
    }
  })
}
if (process.exitCode) process.exit(process.exitCode)

console.log(`Sintaxis válida: ${files.length} archivos JavaScript + ${inlineCount} scripts inline.`)

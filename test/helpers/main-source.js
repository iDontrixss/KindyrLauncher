// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// El proceso principal está repartido entre main.js y main/**. Varias pruebas
// verifican contratos de código fuente; este helper les da el texto completo
// (main.js primero, luego los módulos en orden alfabético estable).
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')

function listModules(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listModules(full))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

function listMainFiles() {
  return [path.join(root, 'main.js'), ...listModules(path.join(root, 'main'))]
}

function readMainSource() {
  return listMainFiles().map(file => fs.readFileSync(file, 'utf8')).join('\n')
}

function readMainModule(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

module.exports = { readMainSource, readMainModule, listMainFiles }

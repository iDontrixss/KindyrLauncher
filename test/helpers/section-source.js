// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// Cada sección se reparte en sections/<nombre>.html (marcado) y
// sections/<nombre>.js (lógica; la CSP no admite scripts inline). Las pruebas
// de contrato leen ambas partes juntas.
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')

function readSectionSource(name) {
  const base = path.join(root, 'sections', name)
  const js = base + '.js'
  return fs.readFileSync(base + '.html', 'utf8') + '\n' + (fs.existsSync(js) ? fs.readFileSync(js, 'utf8') : '')
}

module.exports = { readSectionSource }

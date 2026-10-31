// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Arranque de la ventana principal (antes inline en index.html: la CSP ya no
// admite scripts inline).
document.addEventListener('DOMContentLoaded', () => {
  loadSection('home', document.getElementById('nav-home'))
  try {
    if (window.kindyrAPI && window.kindyrAPI.updater && typeof window.kindyrAPI.updater.getVersion === 'function') {
      window.kindyrAPI.updater.getVersion().then(v => {
        const el = document.getElementById('topnav-brand-ver')
        if (el && v) el.textContent = 'v' + String(v).replace(/^[vV]/, '')
      }).catch(() => {})
    }
  } catch {}
})

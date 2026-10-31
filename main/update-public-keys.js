// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Claves públicas (Ed25519, PEM SPKI) en las que el launcher confía para
// aceptar actualizaciones. Se generan con `pnpm release:keygen`; la clave
// privada nunca entra al repositorio. Para rotar, agrega la clave nueva sin
// quitar la anterior hasta que todos los usuarios hayan actualizado.
// Sin claves aquí el launcher NO ofrece ninguna actualización (fail-closed).

module.exports = [
  `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApsvQEabsLh0ulk7H1cJzxIsxtZRFs6cvwC4LX7n6HYs=
-----END PUBLIC KEY-----
`
]

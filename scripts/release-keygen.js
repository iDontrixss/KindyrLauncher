// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// Uso: pnpm release:keygen [--force]
//
// Genera el par de claves Ed25519 con el que se firman las actualizaciones.
//  - La clave PRIVADA se guarda fuera del repo (por defecto
//    ~/.kindyr/release-signing-key.pem, o KINDYR_SIGNING_KEY), cifrada con la
//    passphrase que elijas. Haz una copia de seguridad: sin ella no puedes
//    firmar más versiones.
//  - La clave PÚBLICA se agrega a main/update-public-keys.js (se commitea y
//    va dentro del launcher).

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { defaultPrivateKeyPath, getPassphrase, loadPublicKeys, writePublicKeys } = require('./release-signing-lib')

async function main() {
  const force = process.argv.includes('--force')
  const privatePath = defaultPrivateKeyPath()
  if (fs.existsSync(privatePath) && !force) {
    console.error(`Ya existe una clave privada en ${privatePath}.`)
    console.error('Para rotar a una clave nueva usa --force (la clave pública anterior se conserva en el launcher hasta que la quites a mano).')
    process.exit(1)
  }

  const passphrase = await getPassphrase('Passphrase para cifrar la clave privada: ')
  const again = process.env.KINDYR_SIGNING_PASSPHRASE != null ? passphrase : await getPassphrase('Repite la passphrase: ')
  if (passphrase !== again) throw new Error('Las passphrases no coinciden.')

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase })
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' })

  fs.mkdirSync(path.dirname(privatePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(privatePath, privatePem, { mode: 0o600 })

  const keys = loadPublicKeys().slice()
  keys.push(publicPem)
  writePublicKeys(keys)

  console.log(`Clave privada (cifrada): ${privatePath}`)
  console.log('Clave pública agregada a main/update-public-keys.js — commitéala.')
  console.log('\nIMPORTANTE: guarda una copia de la clave privada y de la passphrase en un lugar seguro y fuera de GitHub.')
  console.log('Las versiones ya instaladas no conocen esta clave: publica una versión con ella antes de firmar actualizaciones.')
}

main().catch((error) => { console.error(error.message || error); process.exit(1) })

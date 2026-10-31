// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// Uso: pnpm release:sign [--dir dist] [--tag v0.2.0-beta.3]
//
// Genera y firma update-manifest.json con los instaladores de dist/ (tag,
// versión, sha512 y tamaño). Sube a la release de GitHub, junto al instalador
// y latest.yml:
//   update-manifest.json
//   update-manifest.json.sig
// El launcher solo ofrece una actualización si esa firma verifica con la clave
// pública embebida (main/update-public-keys.js).

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const semver = require('semver')
const { ROOT, defaultPrivateKeyPath, getPassphrase, loadPublicKeys, sha512Base64 } = require('./release-signing-lib')
const { MANIFEST_ASSET_NAME, SIGNATURE_ASSET_NAME, verifySignedManifest } = require('../main/update-signature')

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function findInstallers(dir, version) {
  const wanted = version.replace(/[^\w]/g, '')
  return fs.readdirSync(dir)
    .filter(name => /\.(exe|AppImage)$/i.test(name) && !/uninstall/i.test(name))
    .filter(name => name.replace(/[^\w]/g, '').includes(wanted))
    .sort()
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const dir = path.resolve(ROOT, argValue('--dir') || 'dist')
  const tag = argValue('--tag') || `v${pkg.version}`
  const version = tag.replace(/^v/, '')
  if (semver.valid(version) !== version) throw new Error(`Tag inválido: ${tag}`)
  if (version !== pkg.version) throw new Error(`El tag ${tag} no coincide con package.json (${pkg.version}). Sube la versión antes de compilar y firmar.`)
  if (!fs.existsSync(dir)) throw new Error(`No existe ${dir}. Compila primero (pnpm build).`)

  const installers = findInstallers(dir, version)
  if (!installers.length) throw new Error(`No hay instaladores de ${version} en ${dir}.`)

  const files = installers.map(name => {
    const full = path.join(dir, name)
    return { name, sha512: sha512Base64(full), size: fs.statSync(full).size }
  })

  // Si electron-builder dejó latest.yml, sus hashes deben coincidir con los que vamos a firmar.
  const yml = path.join(dir, 'latest.yml')
  if (fs.existsSync(yml)) {
    const text = fs.readFileSync(yml, 'utf8')
    const winFile = files.find(file => /\.exe$/i.test(file.name))
    if (winFile && !text.includes(winFile.sha512)) {
      throw new Error('El sha512 del instalador no coincide con latest.yml: recompila o regenera latest.yml antes de firmar.')
    }
  }

  const manifest = { schema: 1, tag, version, files, signedAt: new Date().toISOString() }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  const privatePath = defaultPrivateKeyPath()
  if (!fs.existsSync(privatePath)) throw new Error(`No hay clave privada en ${privatePath}. Ejecuta pnpm release:keygen.`)
  const pem = fs.readFileSync(privatePath, 'utf8')
  const passphrase = /ENCRYPTED/.test(pem) ? await getPassphrase('Passphrase de la clave de firma: ') : undefined
  const privateKey = crypto.createPrivateKey({ key: pem, format: 'pem', passphrase })
  const signature = crypto.sign(null, manifestBytes, privateKey).toString('base64')

  // Autocomprobación: la firma debe verificar con las claves que irán dentro del launcher.
  try {
    verifySignedManifest({ manifestBytes, signature, publicKeys: loadPublicKeys(), releaseTag: tag, currentVersion: '0.0.0' })
  } catch (error) {
    throw new Error(`La firma no verifica con main/update-public-keys.js (${error.message}). ¿Es la clave correcta y está commiteada?`)
  }

  fs.writeFileSync(path.join(dir, MANIFEST_ASSET_NAME), manifestBytes)
  fs.writeFileSync(path.join(dir, SIGNATURE_ASSET_NAME), signature + '\n')

  console.log(`Firmado ${tag} con ${files.length} archivo(s):`)
  for (const file of files) console.log(`  ${file.name}  ${(file.size / 1048576).toFixed(1)} MiB  sha512 ${file.sha512.slice(0, 16)}…`)
  console.log(`\nSube a la release ${tag}: ${installers.join(', ')}, latest*.yml, *.blockmap, ${MANIFEST_ASSET_NAME} y ${SIGNATURE_ASSET_NAME}`)
}

main().catch((error) => { console.error(error.message || error); process.exit(1) })

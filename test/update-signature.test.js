// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Actualizaciones firmadas: una release subida o reemplazada en GitHub no basta
// para que el launcher la ofrezca; hace falta un manifiesto firmado con la clave
// privada del autor.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const {
  parseManifest,
  verifyManifestSignature,
  verifySignedManifest,
  verifyUpdateInfoAgainstManifest
} = require('../main/update-signature')
const { readMainModule } = require('./helpers/main-source')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function newKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return { publicKey, privateKey, publicPem: publicKey.export({ type: 'spki', format: 'pem' }) }
}
const hash = (text) => crypto.createHash('sha512').update(text).digest('base64')

function makeManifest(overrides = {}) {
  return {
    schema: 1,
    tag: 'v0.3.0',
    version: '0.3.0',
    files: [{ name: 'Kindyr Launcher Setup 0.3.0.exe', sha512: hash('instalador'), size: 1234 }],
    signedAt: '2026-10-26T00:00:00.000Z',
    ...overrides
  }
}
function sign(manifest, privateKey) {
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  return { bytes, signature: crypto.sign(null, bytes, privateKey).toString('base64') }
}

test('acepta un manifiesto firmado, de la release correcta y más nuevo', () => {
  const k = newKeys()
  const { bytes, signature } = sign(makeManifest(), k.privateKey)
  const manifest = verifySignedManifest({ manifestBytes: bytes, signature, publicKeys: [k.publicPem], releaseTag: 'v0.3.0', currentVersion: '0.2.0-beta.2' })
  assert.equal(manifest.version, '0.3.0')
})

test('rechaza si se altera un solo byte del manifiesto', () => {
  const k = newKeys()
  const { bytes, signature } = sign(makeManifest(), k.privateKey)
  const tampered = Buffer.from(bytes)
  tampered[tampered.indexOf(Buffer.from('1234'))] ^= 1
  assert.equal(verifyManifestSignature(tampered, signature, [k.publicPem]), false)
  assert.throws(() => verifySignedManifest({ manifestBytes: tampered, signature, publicKeys: [k.publicPem], releaseTag: 'v0.3.0', currentVersion: '0.2.0' }), /Firma/)
})

test('rechaza firmas de otra clave y el launcher sin claves', () => {
  const author = newKeys()
  const attacker = newKeys()
  const forged = sign(makeManifest(), attacker.privateKey)
  assert.equal(verifyManifestSignature(forged.bytes, forged.signature, [author.publicPem]), false)
  assert.throws(() => verifySignedManifest({ manifestBytes: forged.bytes, signature: forged.signature, publicKeys: [], releaseTag: 'v0.3.0', currentVersion: '0.2.0' }), /claves públicas/)
  // claves basura no cuentan como confianza
  assert.equal(verifyManifestSignature(forged.bytes, forged.signature, ['no-es-una-clave']), false)
})

test('una firma válida vieja no sirve para downgrade ni para otra release', () => {
  const k = newKeys()
  const old = sign(makeManifest({ tag: 'v0.1.0', version: '0.1.0' }), k.privateKey)
  assert.throws(() => verifySignedManifest({ manifestBytes: old.bytes, signature: old.signature, publicKeys: [k.publicPem], releaseTag: 'v0.1.0', currentVersion: '0.2.0-beta.2' }), /más nueva/)
  const current = sign(makeManifest(), k.privateKey)
  assert.throws(() => verifySignedManifest({ manifestBytes: current.bytes, signature: current.signature, publicKeys: [k.publicPem], releaseTag: 'v9.9.9', currentVersion: '0.2.0' }), /tag de la release/)
  assert.throws(() => verifySignedManifest({ manifestBytes: current.bytes, signature: current.signature, publicKeys: [k.publicPem], releaseTag: 'v0.3.0', currentVersion: '0.3.0' }), /más nueva/)
})

test('valida la forma del manifiesto', () => {
  const bad = [
    makeManifest({ schema: 2 }),
    makeManifest({ tag: 'v0.3.1' }),
    makeManifest({ files: [] }),
    makeManifest({ files: [{ name: '../evil.exe', sha512: hash('x'), size: 1 }] }),
    makeManifest({ files: [{ name: 'a.exe', sha512: 'corto', size: 1 }] }),
    makeManifest({ files: [{ name: 'a.exe', sha512: hash('x'), size: -5 }] })
  ]
  for (const manifest of bad) assert.throws(() => parseManifest(Buffer.from(JSON.stringify(manifest))))
  assert.throws(() => parseManifest(Buffer.from('no es json')))
})

test('latest.yml debe coincidir con el manifiesto firmado', () => {
  const manifest = parseManifest(Buffer.from(JSON.stringify(makeManifest())))
  const good = { version: '0.3.0', files: [{ url: 'Kindyr-Launcher-Setup-0.3.0.exe', sha512: hash('instalador') }], sha512: hash('instalador') }
  assert.equal(verifyUpdateInfoAgainstManifest(good, manifest), true)
  // instalador sustituido: hash distinto
  assert.throws(() => verifyUpdateInfoAgainstManifest({ ...good, files: [{ url: 'x.exe', sha512: hash('malware') }], sha512: hash('malware') }, manifest), /no está en el manifiesto/)
  // un archivo extra sin firmar junto a uno firmado
  assert.throws(() => verifyUpdateInfoAgainstManifest({ ...good, files: [...good.files, { url: 'y.exe', sha512: hash('otro') }] }, manifest), /no está en el manifiesto/)
  // otra versión
  assert.throws(() => verifyUpdateInfoAgainstManifest({ ...good, version: '0.3.1' }, manifest), /versión/)
  assert.throws(() => verifyUpdateInfoAgainstManifest({ version: '0.3.0', files: [] }, manifest), /no lista archivos/)
})

test('el updater exige la firma y ya no usa la puerta de update.json', () => {
  const updater = readMainModule('main/updater.js')
  assert.match(updater, /verifySignedManifest\(/)
  assert.match(updater, /verifyUpdateInfoAgainstManifest\(/)
  assert.match(updater, /provider: 'generic'/)
  assert.equal(/update\.json|update-kindyr|fetchUpdateApproval/.test(updater), false)
  // la descarga solo arranca para lo verificado
  assert.match(updater, /verifiedUpdate && pendingUpdateInfo\.version === verifiedUpdate\.manifest\.version/)
  const keys = require('../main/update-public-keys')
  assert.ok(Array.isArray(keys))
  for (const key of keys) assert.doesNotThrow(() => crypto.createPublicKey(key))
  // el mecanismo viejo no debe seguir en el repo
  for (const gone of ['update.json', 'update-kindyr.bat', 'update-kindyr.ps1', 'scripts/update-kindyr.js']) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, `${gone} debería haberse eliminado`)
  }
  assert.equal(pkg.scripts['update-kindyr'], undefined)
})

test('release:keygen + release:sign producen una firma que el launcher acepta', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-sign-'))
  try {
    const keysFile = path.join(tmp, 'update-public-keys.js')
    fs.copyFileSync(path.join(root, 'main', 'update-public-keys.js'), keysFile)
    const env = {
      ...process.env,
      KINDYR_SIGNING_KEY: path.join(tmp, 'private.pem'),
      KINDYR_SIGNING_PASSPHRASE: 'frase-de-prueba',
      KINDYR_PUBLIC_KEYS_FILE: keysFile
    }
    const run = (script, args = []) => spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { env, encoding: 'utf8' })

    const keygen = run('release-keygen.js')
    assert.equal(keygen.status, 0, keygen.stderr)
    assert.match(fs.readFileSync(path.join(tmp, 'private.pem'), 'utf8'), /ENCRYPTED PRIVATE KEY/)
    // no pisa una clave existente sin --force
    assert.notEqual(run('release-keygen.js').status, 0)

    const dist = path.join(tmp, 'dist')
    fs.mkdirSync(dist)
    const installer = `Kindyr Launcher Setup ${pkg.version}.exe`
    fs.writeFileSync(path.join(dist, installer), 'contenido del instalador')
    const signed = run('release-sign.js', ['--dir', dist, '--tag', `v${pkg.version}`])
    assert.equal(signed.status, 0, signed.stderr)

    const manifestBytes = fs.readFileSync(path.join(dist, 'update-manifest.json'))
    const signature = fs.readFileSync(path.join(dist, 'update-manifest.json.sig'), 'utf8')
    const publicKeys = require(keysFile)
    const manifest = verifySignedManifest({ manifestBytes, signature, publicKeys, releaseTag: `v${pkg.version}`, currentVersion: '0.0.1' })
    assert.equal(manifest.files[0].name, installer)
    assert.equal(manifest.files[0].sha512, hash('contenido del instalador'))

    // si cambian el instalador después de firmar, el hash firmado ya no coincide
    fs.writeFileSync(path.join(dist, installer), 'instalador manipulado')
    const info = { version: pkg.version, files: [{ url: installer, sha512: hash('instalador manipulado') }] }
    assert.throws(() => verifyUpdateInfoAgainstManifest(info, manifest), /no está en el manifiesto/)

    // la clave privada nunca se escribe dentro del repositorio
    assert.equal(fs.readFileSync(path.join(root, 'main', 'update-public-keys.js'), 'utf8').includes('PRIVATE'), false)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

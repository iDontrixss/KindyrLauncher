// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// Utilidades compartidas por release-keygen.js y release-sign.js.

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')

const ROOT = path.resolve(__dirname, '..')
// KINDYR_PUBLIC_KEYS_FILE solo existe para las pruebas (no apuntar a otro archivo en un release real).
const PUBLIC_KEYS_FILE = process.env.KINDYR_PUBLIC_KEYS_FILE || path.join(ROOT, 'main', 'update-public-keys.js')

// La clave privada vive FUERA del repositorio. Se puede cambiar con KINDYR_SIGNING_KEY.
function defaultPrivateKeyPath() {
  return process.env.KINDYR_SIGNING_KEY || path.join(os.homedir(), '.kindyr', 'release-signing-key.pem')
}

// Lee texto sin mostrarlo en pantalla (passphrase).
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const write = rl._writeToOutput
    rl._writeToOutput = (text) => { if (text.includes(question)) write.call(rl, text) }
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer) })
  })
}

async function getPassphrase(prompt, { allowEmpty = false } = {}) {
  if (process.env.KINDYR_SIGNING_PASSPHRASE != null) return process.env.KINDYR_SIGNING_PASSPHRASE
  const value = await askHidden(prompt)
  if (!value && !allowEmpty) throw new Error('Passphrase vacía.')
  return value
}

function loadPublicKeys() {
  delete require.cache[require.resolve(PUBLIC_KEYS_FILE)]
  return require(PUBLIC_KEYS_FILE)
}

function writePublicKeys(keys) {
  const text = fs.readFileSync(PUBLIC_KEYS_FILE, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const body = keys.map(key => '  `' + key.trim().replace(/\r?\n/g, '\n') + '\n`').join(',' + eol)
  const marker = text.indexOf('module.exports')
  const head = text.slice(0, marker)
  const out = `${head}module.exports = [${eol}${body}${keys.length ? eol : ''}]${eol}`
  fs.writeFileSync(PUBLIC_KEYS_FILE, out.replace(/\r?\n/g, eol))
}

function sha512Base64(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')
}

module.exports = { ROOT, PUBLIC_KEYS_FILE, defaultPrivateKeyPath, getPassphrase, loadPublicKeys, writePublicKeys, sha512Base64 }

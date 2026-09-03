// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// Script manual para publicar una actualización. Vos controlás cuándo aparece.
// Uso: pnpm update-kindyr  (o npm run update-kindyr)
// Hace: verifica que estés en main limpio, pide versión, crea tag y publica via electron-builder

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', ...opts })
}

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans.trim()) }))
}

async function main() {
  const pkgPath = path.join(__dirname, '..', 'package.json')
  const updateJsonPath = path.join(__dirname, '..', 'update.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  console.log(`Versión actual: ${pkg.version}`)
  console.log('Este comando es la LLAVE DE SEGURIDAD del auto-update.')
  console.log('Sin ejecutar pnpm update-kindyr, aunque se suba una release vulnerada a GitHub, el launcher NO la ofrecerá.')
  console.log('El launcher solo avisa si update.json (en main) tiene una versión mayor. update.json solo se actualiza con este comando.')
  console.log('Auto-update en modo manual: autoDownload=false, solo diálogo, descarga solo si el usuario acepta (main.js:2952).')

  // Verificar git limpio
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' })
    if (status.trim()) {
      console.error('Hay cambios sin commitear. Commitea antes de publicar.')
      console.log(status)
      process.exit(1)
    }
  } catch {}

  const current = pkg.version
  let next = await ask(`Nueva versión (enter para mantener ${current}): `)
  if (!next) next = current
  let versionChanged = false
  if (next !== current) {
    pkg.version = next
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`package.json actualizado a ${next}`)
    versionChanged = true
  }

  // Actualizar update.json — habilita UN chequeo. No es whitelist de versión.
  // update.json = { updatesEnabled: true, approvedAt: "ISO", version: "0.1.0" }
  // El launcher lo lee una vez, lo marca como visto (last-update-check.json) y no vuelve a chequear hasta próximo pnpm update-kindyr.
  let updateJson = {}
  try { updateJson = JSON.parse(fs.readFileSync(updateJsonPath, 'utf8')) } catch {}
  updateJson.updatesEnabled = true
  updateJson.approvedAt = new Date().toISOString()
  updateJson.version = next
  updateJson.notes = `Habilitado via pnpm update-kindyr ${new Date().toISOString().slice(0,10)} — autoriza UN chequeo a GitHub`
  fs.writeFileSync(updateJsonPath, JSON.stringify(updateJson, null, 2) + '\n')
  console.log(`update.json habilitado (approvedAt=${updateJson.approvedAt}) — autoriza UN chequeo a GitHub para cualquier versión mayor (fix/beta/release)`)
  console.log('[Kindyr] Lo que hará cada launcher en su próximo inicio (visible en su terminal con --enable-logging):')
  console.log('  [Kindyr] Iniciando UN ciclo de update (pnpm update-kindyr habilitó check)')
  console.log('  [Kindyr][update.json] Intento 1/2 — GET https://raw.githubusercontent.com/.../update.json (timeout 5s)')
  console.log('  [Kindyr][update.json] Si timeout/error → espera 3s → Intento 2/2 (5s)')
  console.log('  [Kindyr][GitHub Releases] Intento 1/2 — GET https://api.github.com/.../releases (timeout 5s) → espera 3s → Intento 2/2')
  console.log('  [Kindyr] Si hay versión mayor → diálogo al usuario (aceptar/cancelar) → si acepta descarga, sino nada. En cualquier caso, ciclo terminado y updater DESACTIVADO hasta próximo pnpm update-kindyr.')

  if (versionChanged) {
    run(`git add package.json update.json`)
    run(`git commit -m "release: v${next} (update.json habilitado para un chequeo)"`)
    run(`git tag v${next}`)
  } else {
    run(`git add update.json`)
    run(`git commit -m "chore: habilita updater para un chequeo (update.json ${updateJson.approvedAt})"`)
  }

  const publish = await ask('¿Publicar ahora con electron-builder? (s/N): ')
  if (publish.toLowerCase() === 's' || publish.toLowerCase() === 'y') {
    run('npm run build', { stdio: 'inherit' })
    console.log('Si usás --publish, asegurate de tener GH_TOKEN configurado.')
    const doPublish = await ask('¿Ejecutar electron-builder --publish always? (s/N): ')
    if (doPublish.toLowerCase() === 's' || doPublish.toLowerCase() === 'y') {
      run('npx electron-builder --publish always', { stdio: 'inherit' })
    }
    const pushAll = await ask('¿Hacer git push (incluye update.json) + --follow-tags? (s/N): ')
    if (pushAll.toLowerCase() === 's' || pushAll.toLowerCase() === 'y') {
      run('git push --follow-tags')
      run('git push')
      console.log('\n=== PUBLICADO ===')
      console.log('En tiempo real, cada launcher que se abra ahora hará (visible en su terminal):')
      console.log('  [Kindyr] Iniciando UN ciclo...')
      console.log('  [Kindyr][update.json] Intento 1/2 (5s) -> si timeout espera 3s -> Intento 2/2 (5s)')
      console.log('  [Kindyr][GitHub Releases] Intento 1/2 (5s) -> espera 3s -> Intento 2/2 (5s)')
      console.log('  [Kindyr] UPDATE_AVAILABLE / NO_UPDATE / CHECK_FAILED -> guarda lastApprovedAt y DESACTIVA updater')
      console.log('Si subiste una release vulnerada a GitHub SIN este push, los launchers NO la vieron.')
    }
  } else {
    console.log('No se publicó. Recordá: sin git push de update.json, el auto-update no se activa aunque haya release en GitHub.')
    console.log('Cuando quieras habilitarla, ejecutá de nuevo pnpm update-kindyr y hacé push. El ciclo 5s→3s→5s se verá en la terminal del launcher.')
  }

  console.log('\nFlujo final: pnpm update-kindyr → update.json (approvedAt nuevo) → Kindyr inicia UN ciclo 5s→3s→5s por recurso → guarda lastApprovedAt → OFF hasta próximo pnpm update-kindyr')
}

main().catch(e => { console.error(e); process.exit(1) })

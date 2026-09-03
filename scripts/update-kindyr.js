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

  // Actualizar update.json — ESTA es la aprobación que ve el launcher
  let updateJson = { version: current, notes: '', approvedAt: new Date().toISOString() }
  try { updateJson = JSON.parse(fs.readFileSync(updateJsonPath, 'utf8')) } catch {}
  if (next !== updateJson.version) {
    updateJson.version = next
    updateJson.approvedAt = new Date().toISOString()
    updateJson.notes = `Aprobada via pnpm update-kindyr ${new Date().toISOString().slice(0,10)}`
    fs.writeFileSync(updateJsonPath, JSON.stringify(updateJson, null, 2) + '\n')
    console.log(`update.json actualizado a ${next} — esta es la señal que habilita el auto-update en los launchers`)
    versionChanged = true
  }

  if (versionChanged) {
    run(`git add package.json update.json`)
    run(`git commit -m "release: v${next} (update.json aprobado)"`)
    run(`git tag v${next}`)
  } else {
    console.log('Sin cambios de versión. Si solo querés aprobar la versión actual para que se ofrezca, se actualizará update.json igual.')
    const forceApprove = await ask('¿Forzar aprobación de update.json con la versión actual? (s/N): ')
    if (forceApprove.toLowerCase() === 's' || forceApprove.toLowerCase() === 'y') {
      updateJson.approvedAt = new Date().toISOString()
      fs.writeFileSync(updateJsonPath, JSON.stringify(updateJson, null, 2) + '\n')
      run(`git add update.json`)
      run(`git commit -m "chore: aprueba v${current} para auto-update"`)
    }
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
      console.log('Publicado. Ahora los launchers que hagan check verán update.json y ofrecerán el diálogo.')
      console.log('Si subís una release a GitHub SIN ejecutar pnpm update-kindyr, los launchers NO la verán (medida de seguridad).')
    }
  } else {
    console.log('No se publicó. Recordá: sin git push de update.json, el auto-update no se activa aunque haya release en GitHub.')
    console.log('Cuando quieras habilitarla, ejecutá de nuevo pnpm update-kindyr y hacé push.')
  }

  console.log('Listo. Flujo: abrir launcher -> chequea update.json (raw.githubusercontent) -> si hay versión mayor aprobada, muestra diálogo -> si acepta, descarga; si no, no pasa nada.')
}

main().catch(e => { console.error(e); process.exit(1) })

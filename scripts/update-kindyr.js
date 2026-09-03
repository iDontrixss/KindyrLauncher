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
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  console.log(`Versión actual: ${pkg.version}`)
  console.log('Este comando publica una release en GitHub. Los usuarios verán el diálogo solo si aceptan, nunca auto-instala.')
  console.log('El auto-update está en modo manual: autoDownload=false, autoInstall=false, solo muestra diálogo (main.js:2952) y descarga si el usuario hace clic en Instalar.')

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
  if (next !== current) {
    pkg.version = next
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`package.json actualizado a ${next}`)
    run(`git add package.json`)
    run(`git commit -m "release: v${next}"`)
    run(`git tag v${next}`)
  }

  const publish = await ask('¿Publicar ahora con electron-builder? (s/N): ')
  if (publish.toLowerCase() === 's' || publish.toLowerCase() === 'y') {
    // Publica a GitHub Releases. Solo los que abran el launcher verán el diálogo, y solo si aceptan se descarga.
    run('npm run build', { stdio: 'inherit' })
    // El publish se hace via electron-builder --publish always (configurado en package.json build.publish github)
    console.log('Si usás --publish, asegurate de tener GH_TOKEN configurado.')
    const doPublish = await ask('¿Ejecutar electron-builder --publish always? (s/N): ')
    if (doPublish.toLowerCase() === 's' || doPublish.toLowerCase() === 'y') {
      run('npx electron-builder --publish always', { stdio: 'inherit' })
    }
    const pushTag = await ask('¿Hacer git push --follow-tags? (s/N): ')
    if (pushTag.toLowerCase() === 's' || pushTag.toLowerCase() === 'y') {
      run('git push --follow-tags')
      run('git push')
    }
  } else {
    console.log('No se publicó. Podés publicar manualmente cuando quieras con: pnpm update-kindyr')
  }

  console.log('Listo. Los usuarios que abran el launcher verán el diálogo de actualización. Si aceptan, se descarga; si no, no pasa nada.')
}

main().catch(e => { console.error(e); process.exit(1) })

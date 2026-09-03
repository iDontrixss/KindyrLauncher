// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

test('P1-3: descubrir usa AbortController y request ID', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sections', 'descubrir.html'), 'utf8')
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  // Renderer debe tener AbortController y requestId
  assert.match(html, /discoverAbortController/)
  assert.match(html, /discoverRequestId/)
  assert.match(html, /new AbortController\(\)/)
  assert.match(html, /abort\(\)/)
  // Debe mantener requestContextId protección
  assert.match(html, /requestContextId/)
  // Main debe tener abort controllers
  assert.match(main, /modrinthSearchAbortController/)
  assert.match(main, /curseSearchAbortController/)
  assert.match(main, /AbortController/)
  assert.match(main, /signal/)
})

test('P1-3: cancelación AbortController - B aborta A', async () => {
  // Simular lógica de searchModrinth con AbortController y requestId
  let requestId = 0
  let controller = null
  const results = []

  async function mockSearch(id, delay, value, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(value), delay)
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      }
    })
  }

  async function searchWithAbort(value, delay) {
    if (controller) controller.abort()
    controller = new AbortController()
    const myId = ++requestId
    const mySignal = controller.signal
    try {
      const result = await Promise.race([
        mockSearch(myId, delay, value, mySignal),
        new Promise((_, reject) => mySignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
      ])
      if (myId !== requestId) {
        results.push(`stale-${value}-ignored`)
        return null
      }
      if (mySignal.aborted) {
        results.push(`aborted-${value}-ignored`)
        return null
      }
      results.push(`ok-${value}`)
      return result
    } catch (e) {
      if (e.name === 'AbortError') {
        results.push(`abort-${value}`)
        return null
      }
      throw e
    }
  }

  // A lenta, B rápida - B debe ganar, A abortada
  const pA = searchWithAbort('A', 100)
  await new Promise(r => setTimeout(r, 10))
  const pB = searchWithAbort('B', 20)
  await Promise.allSettled([pA, pB])
  // Esperar un poco para que ambos terminen
  await new Promise(r => setTimeout(r, 150))
  assert.ok(results.includes('abort-A') || results.includes('stale-A-ignored'), 'A debe ser abortada o ignorada')
  assert.ok(results.includes('ok-B'), 'B debe ganar')
  assert.equal(results.includes('ok-A'), false, 'A no debe pisar B')
})

test('P1-3: protección request ID - A termina después de B no pisa', async () => {
  let requestId = 0
  const results = []

  async function searchWithId(value, delay) {
    const myId = ++requestId
    await new Promise(r => setTimeout(r, delay))
    if (myId !== requestId) {
      results.push(`stale-${value}`)
      return null
    }
    results.push(`ok-${value}`)
    return value
  }

  const pA = searchWithId('A', 50) // A más lenta
  await new Promise(r => setTimeout(r, 5))
  const pB = searchWithId('B', 10) // B rápida, incrementa requestId a 2
  await Promise.all([pA, pB])
  assert.ok(results.includes('ok-B'))
  assert.ok(results.includes('stale-A'))
  assert.equal(results.filter(r => r.startsWith('ok-')).length, 1)
})

test('P1-3: error de búsqueda abortada no se muestra', async () => {
  let requestId = 0
  let controller = new AbortController()
  const errorsShown = []

  async function searchWithAbortError(value) {
    const myId = ++requestId
    const mySignal = controller.signal
    try {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('network fail')), 20))
      if (myId !== requestId || mySignal.aborted) return
      errorsShown.push('shown-' + value)
    } catch (e) {
      if (e.name === 'AbortError' || mySignal.aborted) {
        // No mostrar error para abortada
        return
      }
      if (myId !== requestId) return
      errorsShown.push('shown-' + value)
    }
  }

  // Simular abort antes de error
  const pA = searchWithAbortError('A')
  controller.abort()
  await pA
  assert.equal(errorsShown.length, 0, 'error de abortada no debe mostrarse')

  // Error real de B sí debe mostrarse
  controller = new AbortController()
  requestId = 0
  errorsShown.length = 0
  let showError = false
  async function searchB(value) {
    const myId = ++requestId
    try {
      throw new Error('real fail')
    } catch (e) {
      if (e.name === 'AbortError') return
      if (myId !== requestId) return
      showError = true
    }
  }
  await searchB('B')
  assert.equal(showError, true, 'error real debe mostrarse')
})

test('P1-3: spinner/loading termina correctamente', async () => {
  let loading = false
  let requestId = 0
  let controller = null

  async function search(value, delay) {
    if (controller) controller.abort()
    controller = new AbortController()
    const myId = ++requestId
    const mySignal = controller.signal
    loading = true
    try {
      await Promise.race([
        new Promise(r => setTimeout(r, delay)),
        new Promise((_, rej) => mySignal.addEventListener('abort', () => rej(new DOMException('Aborted','AbortError')), {once:true}))
      ])
      if (myId !== requestId || mySignal.aborted) return
    } catch (e) {
      if (e.name === 'AbortError') return
      throw e
    } finally {
      if (myId === requestId) loading = false
    }
  }

  const pA = search('A', 100)
  await new Promise(r => setTimeout(r, 10))
  const pB = search('B', 20)
  await Promise.allSettled([pA, pB])
  await new Promise(r => setTimeout(r, 150))
  assert.equal(loading, false, 'loading debe terminar en false para la última request')
})

test('P1-3: búsqueda vacía y cambio rápido de filtros', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sections', 'descubrir.html'), 'utf8')
  // Debe mantener debounce 450ms
  assert.match(html, /450/)
  // scheduleModrinthSearch debe existir y usar clearTimeout
  assert.match(html, /scheduleModrinthSearch/)
  assert.match(html, /clearTimeout\(discoverTimer\)/)
})

test('P1-3: main.js search no duplica lógica y mantiene limit/offset', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  // Debe mantener limit/offset clamps
  assert.match(main, /Math\.max\(0, Math\.min\(Number\(payload\.offset\)/)
  assert.match(main, /Math\.max\(1, Math\.min\(Number\(payload\.limit\)/)
  // Debe mantener new_filters y facets
  assert.match(main, /newFilters/)
  assert.match(main, /facets/)
  assert.match(main, /fallback/i)
})

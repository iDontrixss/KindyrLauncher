// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Saneador único del HTML que llega de proveedores (descripción de proyectos de
// Modrinth/CurseForge y changelogs). Ese HTML lo escribe cualquier autor de un
// proyecto, así que es entrada hostil.
//
// Diseño (KL-01): NO se muta el árbol parseado. Se parsea en un documento inerte
// (DOMParser: no ejecuta scripts ni carga recursos) y se CONSTRUYE un fragmento
// nuevo en el documento actual copiando solo lo permitido. Un nodo que no se
// creó aquí de forma explícita no puede llegar a la salida, por lo que no hay
// hijos "olvidados" al desenvolver etiquetas, ni atributos que se cuelen.
// La salida es un DocumentFragment que se inserta con replaceChildren(): no hay
// serialización + reparseo intermedio (evita mutation XSS).

const PROVIDER_HTML_NS = 'http://www.w3.org/1999/xhtml'
const PROVIDER_HTML_MAX_DEPTH = 64
// Etiquetas que se recrean tal cual (sin atributos salvo los de abajo).
const PROVIDER_HTML_ALLOWED_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'pre', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'span', 'div', 'details', 'summary', 'sup', 'sub', 'center'])
// Etiquetas que se descartan CON su contenido (código, embebidos, formularios,
// contenido foráneo SVG/MathML). El resto de etiquetas desconocidas se
// desenvuelven: se conserva su contenido ya saneado.
const PROVIDER_HTML_DROP_TAGS = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal', 'form', 'input', 'button', 'select', 'option', 'textarea', 'noscript', 'template', 'link', 'meta', 'base', 'title', 'head', 'svg', 'math', 'audio', 'video', 'source', 'track', 'canvas', 'dialog', 'slot'])

function safeProviderUrl(value, base) {
  const raw = String(value || '').trim()
  if (!raw || raw.charAt(0) === '#') return ''
  try {
    const url = new URL(raw, base || undefined)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    if (url.username || url.password) return ''
    return url.href
  } catch { return '' }
}

function sanitizeProviderHtml(html, baseUrl) {
  const out = document.createDocumentFragment()
  const source = String(html || '')
  if (!source.trim()) return out
  let body
  try {
    body = new DOMParser().parseFromString(source, 'text/html').body
  } catch { return out }
  if (!body) return out

  function copyChildren(from, into, depth) {
    if (depth > PROVIDER_HTML_MAX_DEPTH) return
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === 3) { into.appendChild(document.createTextNode(child.data)); continue }
      if (child.nodeType !== 1) continue
      // Solo HTML: SVG/MathML tienen sus propias reglas de parseo y atributos activos.
      if (child.namespaceURI !== PROVIDER_HTML_NS) continue
      const tag = child.localName
      if (PROVIDER_HTML_DROP_TAGS.has(tag)) continue
      if (!PROVIDER_HTML_ALLOWED_TAGS.has(tag)) { copyChildren(child, into, depth + 1); continue }
      const el = document.createElement(tag === 'center' ? 'div' : tag)
      if (tag === 'center') el.className = 'rich-center'
      if (tag === 'a') {
        const href = safeProviderUrl(child.getAttribute('href'), baseUrl)
        if (href) el.setAttribute('href', href)
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      } else if (tag === 'img') {
        const src = safeProviderUrl(child.getAttribute('src'), baseUrl)
        if (!src) continue
        el.setAttribute('src', src)
        el.setAttribute('alt', String(child.getAttribute('alt') || '').slice(0, 300))
        el.setAttribute('loading', 'lazy')
        el.setAttribute('referrerpolicy', 'no-referrer')
      }
      if ((tag === 'a' || tag === 'img') && child.hasAttribute('title')) {
        el.setAttribute('title', String(child.getAttribute('title')).slice(0, 300))
      }
      copyChildren(child, el, depth + 1)
      into.appendChild(el)
    }
  }

  copyChildren(body, out, 0)
  return out
}

function providerHtmlHasContent(fragment) {
  if (!fragment) return false
  return Boolean(String(fragment.textContent || '').trim()) || Boolean(fragment.querySelector && fragment.querySelector('img, hr'))
}

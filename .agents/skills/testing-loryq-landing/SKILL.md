---
name: testing-loryq-landing
description: Test the LoryqLauncher static landing page (index.html) end-to-end. Use when verifying UI, security-hardening, or content changes to the site.
---

# Testing the LoryqLauncher landing page

The repo is a **static site**: `index.html` (all CSS + JS inline) plus image assets. There is no backend, build step, package manager, or dependency manifest — so server-side test categories (SQLi, CORS, auth, API dependencies) do not apply. `data.json` is NOT referenced by the page (leftover admin data).

## Run it locally
```bash
cd <repo> && python3 -m http.server 8099
# open http://localhost:8099/index.html
```
No install/build needed. Maximize the browser before recording:
`sudo apt-get install -y wmctrl 2>/dev/null; wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`

## Key things to verify
- **Icons render** — icons come from version-pinned flaticon CDN stylesheets (`<i class="fi fi-...">`). Feature cards + download button show glyphs (grid, bolt, shield, Java, Windows). If the CDN `<link>`s carry Subresource Integrity (`integrity=`) hashes, a WRONG hash makes the browser BLOCK the CSS and every icon becomes a blank box. So visible glyphs = SRI valid. Confirm via DevTools Console: no "Failed to find a valid digest / integrity" error (an unrelated `favicon.ico` 404 is expected and harmless).
  - To recompute an SRI hash if the CDN file changes: `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`. The CDN returns `access-control-allow-origin: *`, so `crossorigin="anonymous"` works. Do NOT add SRI to the Google Fonts CSS link — its response varies by user-agent and the hash won't be stable.
- **Theme toggle** — top-right sun/moon button (`id=themeBtn`, `onclick=toggleTheme()`); dark ↔ light. Persists to `localStorage` key `loryq-theme` (value validated against an allowlist).
- **Language toggle** — EN/ES button (`id=langBtn`, `onclick=toggleLang()`); swaps all `data-i18n` text between hardcoded ES/EN translation tables. Button label flips.
- **FAQ / changelog accordions** — click a question / "Ver detalles" to expand.
- **Download button** links to GitHub Releases (`github.com/iDontrixss/ZotlinLauncher/releases/...`), not the repo-committed `.exe`.

## Notes
- Security-relevant server-side code (GROQ API key, moderation) lives in the separate `zotlin-reports-and-suggestions` Vercel app, not this repo.
- The i18n code uses `innerHTML` only for `data-i18n-html` keys sourced from static translation tables (no user input), so it is not an XSS sink.

## Devin Secrets Needed
None — fully local static site, no credentials required.

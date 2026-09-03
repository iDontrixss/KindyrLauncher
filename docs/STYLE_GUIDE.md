# KindyrLauncher – Guía de Estilo UI/UX

> **Siempre que necesites agregar algo de UX/UI, lee este archivo primero.** Es la fuente única de verdad para colores, tipografía, espaciado, bordes, sombras y componentes. No inventes valores nuevos.

## 1. Filosofía
Neo-brutalista hard-shadow: `border-radius: 0` en todo, bordes gruesos `2-3px solid var(--kindyr-ink)`, sombras duras sin blur `3-5px 3-5px 0 var(--kindyr-ink)`, hover `translate(-1px,-1px)` + sombra +1px. Cero blur, alto contraste.

## 2. Tokens – Colores

| Token | Valor | Uso |
|-------|-------|-----|
| `--kindyr-bg` | `#030f2b` (midnight) | body |
| `--kindyr-surface` | `#0a2559` | modals, panels |
| `--kindyr-surface-2` | `#12408a` | cards, inputs hover |
| `--kindyr-blue` | `#4c8dff` | pill-nav active, interactive idle |
| `--kindyr-blue-soft` | `#aacdff` / `#79b0ff` | texto muted, placeholder |
| `--kindyr-accent` | `#ff5a3c` | CTA primary, active chip |
| `--kindyr-ink` | `#010712` | bordes, sombras |
| `--kindyr-text` | `#f4f8ff` | texto principal |
| Success | `#1bd96a` | play, check, progress fill |
| Scrollbar thumb | `#facc15` → `#f59e0b` hover |

**Temas `data-theme`:** `midnight` (default), `navy` `#010718`, `azure` `#08245b`, `steel` `#dceaff` (light, `color-scheme:light`). Todos usan mismos tokens, solo cambian bg/surface. Legacy `light/green/kindyr/neobrutal` siguen en `styles.css` pero no se usan.

## 3. Tipografía
* Primaria: `'Space Grotesk','Segoe UI',system-ui,sans-serif` `600` base, `800` títulos/CTAs
* Mono: `'JetBrains Mono',monospace` para kickers, badges, números
* Console: `Consolas,'Courier New',monospace` `11px/1.45` `.console-output`
* Escala: `.page-title 32px/1.05 800 -0.035em uppercase` + barra `14×3 accent` `::before`; `.bento-label 10px 700 0.14em uppercase accent`; `.project-title 13px 800`; `.pill-nav 13px 700`

## 4. Espaciado / Layout
* Shell: `.topnav 66px` + `3px` border + `122×3` accent; `.content 24×28px`; `.main flex column`; `.bottombar 12×24 2px top`
* Grids: `bento 12col gap14`, `discover 238px+1fr gap14`, `results 3col gap11`, `instances-card-grid auto-fit 350px gap13`, `skins 258px+1fr gap14`
* Padding: panels `14-18px`, cards `11-16px`, modals `16 body + 12×15 head`, inputs `38-42px`

## 5. Bordes y Sombras
* **Bordes:** `0 radius` (Kindyr), `2px solid var(--kindyr-ink)` estándar, `3px` modals/hero, `1px #255cb7` separadores, `2px dashed #255cb7` empties
* **Sombras duras:** `2px 2px 0` chips/inputs, `3px 3px 0` cards/buttons, `4px 4px` bento/popups, `5px 5px` hero, `8px 8px` modals, hover `+1px` + `translate(-1,-1)`; `inset 0 2px rgba(255,255,255,0.05)`

## 6. Componentes

**Cards:** `.bento-cell` `18px #0e336f 2px ink 4px 4px`, `.project-card` `13px #0e336f 2px ink 3px 3px`, `.version-row.instance-card` `16px #0e336f 2px ink 4px 4px`, `.ver-card` `12px #12408a 2px ink 3px 3px`
**Botones:** `.primary-btn` `38-44px #ff5a3c/#1bd96a 2px ink 3px 3px` `#260800` hover `translate(-1) brightness(1.08)`; `.secondary-btn` `#12408a/#0e336f 2px ink`; `.pill-nav` `9×16 transparent` active `bg #4c8dff 2px ink 2px shadow`; `.type-chip` `8×10 #0e336f 2px ink 2px shadow 11px 800` active `#ff5a3c`
**Modals:** `.modal-backdrop` `fixed inset 0 24px bg rgba(1,7,18,0.82) center z-50 fadeIn 0.18s`; `.account-modal` `min(450px) bg var(--kindyr-surface) 3px ink 8px 8px`; head `16×18 bg var(--kindyr-surface-2) 3px ink bottom`
**Inputs:** `38-42px #071c45 2px #010712 0 radius 2px 2px ink` `placeholder #6f9de8` focus `border var(--kindyr-blue)` `outline 2px var(--kindyr-accent)`
**Sliders:** `accent-color var(--kindyr-accent)`, `hint 11px #79b0ff`
**Toasts:** `fixed top:16 right:16 z-9999 flex column gap10 pointer-events:none` → card `340px bg var(--kindyr-surface) 2px var(--kindyr-ink) 4px 4px left 3px var(--kindyr-accent)` igual que `discover-install-card`

## 7. Patrones de Página
* Inicio: `home-intro + bento-grid` (featured 8 + status 4 + quick-actions 12 + recent 12)
* Instancias: `page-head + 4 summary cards + library grid`
* Descubrir: `discover-shell` sidebar filtros + workspace search + meta + results + pager
* Skins: `258px viewer + 1fr gallery` checker `16px`
* Ajustes: `220px nav + 1fr panel` groups `15px bg #0a2559 2px ink 4px shadow`

## 8. i18n
`common.js:7` `I18N = {es:{}, en:{}}` `t(key,vars)` `split('{var}').join` fallback `es`. `translateElement` actualiza `[data-i18n]`, `[data-i18n-placeholder]` etc. Temas: `data-theme="midnight|navy|azure|steel"`.

## 9. Reglas para nuevo UX/UI
1. Usa tokens, no hex sueltos. 2. `radius 0`, `2px ink` + hard shadow. 3. Hover `translate(-1,-1)` + shadow. 4. Texto `Space Grotesk 800` + `JetBrains Mono` para números. 5. Reutiliza `.settings-group`, `.primary-btn`, `.type-chip` antes de crear nuevo. 6. Toasts → `prepare-toast-stack` top-right, `340px`, `var(--kindyr-surface)`, `4px 4px`, `left 3px accent`.

> **Obligatorio:** Antes de agregar cualquier componente, importa este archivo y copia un componente existente. No inventes paletas ni radios.

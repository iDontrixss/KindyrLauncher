# Fase 4.1 — cierre del diagnóstico de memoria del renderer

## Resultado

No hay fuga progresiva confirmada. La carga que aparece al recorrer las cinco vistas se estabiliza después del primer ciclo: los snapshots B, C, D y E contienen el mismo conjunto relevante de objetos. La clasificación final es **B** para las vistas cacheadas de forma intencional, con evidencia secundaria de **C** para el pico temporal de V8 y **D** para recursos nativos del renderer, sobre todo Skins.

No se modificó código de producción ni se hizo commit o push.

## Evidencia A–E

| Punto | PSS total | Renderer | Heap usado | DOM/listeners | Lectura |
| --- | ---: | ---: | ---: | ---: | --- |
| A, reposo 60 s | 275.9 MiB | 77.5 MiB | 1.50 MiB | 1.210 / 91 | Sólo Inicio. |
| B, ciclo 1 | 306.6 MiB | 95.5 MiB | 1.92 MiB | 3.938 / 348 | Primera carga de vistas. |
| C, ciclo 4 | 328.9 MiB | 116.5 MiB | 3.05 MiB | 5.623 / 427 | Pico antes de GC normal. |
| D, +60 s | 310.8 MiB | 98.5 MiB | 1.78 MiB | 3.938 / 348 | Recuperación espontánea. |
| E, GC CDP | 314.7 MiB | 99.7 MiB | 1.78 MiB | 3.938 / 348 | No reduce heap adicional; PSS es variable/nativo. |

La caída C→D ocurrió antes del GC explícito: heap usado -1.27 MiB, PSS total -18.0 MiB y PSS renderer -18.0 MiB. D→E dejó el heap y el DOM iguales; el PSS subió 3.9 MiB en una sola lectura, dentro de la variación de procesos y recursos nativos. Hubo ocho procesos y un renderer en todos los puntos.

## Comparación de snapshots

- A→B: +1.170 `Text`, +140 `ShadowRoot`, +264 `EventListener`, +293 `Array`, +7 `ArrayBuffer` y +2 `Map`.
- B→C: sólo +96 bytes de shallow size de `Text`, sin aumento de conteos relevantes.
- C→D y D→E: sin delta de objetos relevantes.
- A→E: igual a A→B; los objetos de la carga inicial siguen vivos porque las vistas permanecen cacheadas.

No se halló DOM detached de Kindyr ni una closure/retaining path que conserve una estructura propia innecesaria. Los caminos de heap para listeners terminan en `native:InternalNode → EventListener`, una representación interna de V8; por eso se complementó con la auditoría CDP de listeners.

## Los 264 EventListener

Son normales en este flujo, no duplicados por ciclo. CDP vio 345 listeners DOM tras navegación; 133 son `click` de `common.js:965`, uno por botón de opción generado para los selects personalizados. También hay siete `click` en `common.js:1022` y siete `change` en `common.js:1040`, ambos de esos selects. Los targets son nodos vivos de las vistas; tras cuatro ciclos el snapshot conserva 348 listeners, exactamente igual que después del primero.

Esto coincide con `navigation.js`: `loadedSections` conserva cada vista tras su primera carga. El diseño explica DOM, botones y listeners persistentes sin implicar fuga.

## Aislamiento por sección

| Sección | Delta PSS persistente tras GC | Delta renderer | Recursos | Clasificación |
| --- | ---: | ---: | ---: | --- |
| Inicio (control) | -0.8 MiB | -0.7 MiB | 0 | Sin crecimiento. |
| Instancias | +5.8 MiB | +2.9 MiB | +1 | B. |
| Descubrir | +10.2 MiB | +7.6 MiB | +18 | B. |
| Skins | +12.4 MiB | +5.3 MiB | +32 | D. |
| Ajustes | +0.4 MiB | +0.1 MiB | +1 | B. |

Skins produce el mayor delta. Conserva 32 recursos más y tras GC el heap JS sólo baja ~0.10 MiB; no se obtuvo una ruta JS de Kindyr. Esto apunta a imágenes, Three.js/skinview3d y otros recursos nativos del renderer. Descubrir también conserva una vista grande y sus recursos, coherente con la caché intencional. Cuentas es un modal, no una vista primaria de `loadedSections`, y no se abrió para mantener el flujo estándar limitado a cinco vistas.

## Cliente y datos temporales

La captura usó streaming de chunks a archivos temporales, timeout por operación y cierre del stream incluso ante error. Los cinco snapshots fueron JSON válidos, no vacíos y con `nodes`, `edges`, `strings` y metadata. Las rutas, hashes y tamaños están en `phase-4/snapshot-capture-log.json`; los snapshots no se añadieron a Git y se eliminaron al cierre, junto con la instrumentación temporal.

## Respuestas directas

1. No hay fuga progresiva demostrada: B→C no crece en snapshots.
2. Los +264 listeners corresponden a la primera carga de vistas/selects; no se duplican entre ciclos.
3. C contiene un pico transitorio; D vuelve al conjunto de B y E no libera más heap.
4. El GC explícito no redujo heap usado después de la recuperación de D.
5. El PSS permanece sobre A porque las vistas y recursos cargados siguen vivos; su parte no explicada por JS es compatible con Chromium/V8.
6. Skins es la sección de mayor delta persistente.
7. No existe una ruta de retención atribuible a Kindyr que justifique cambiar código.
8. No hace falta cambiar código en esta fase.
9. Imágenes/recursos de Skins, recursos de Descubrir y la reserva/contabilidad de Chromium/V8 explican mejor el PSS residual que una fuga JS.

## Siguiente paso recomendado

No optimizar a partir de este hallazgo. Si el producto requiere bajar memoria tras navegar, decidir explícitamente si se quiere cambiar la política funcional de `loadedSections` (descargar vistas inactivas) y medir el coste de recarga; es una decisión de producto, no una corrección de fuga.

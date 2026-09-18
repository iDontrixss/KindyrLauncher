# Fase 4 — diagnóstico de retención de memoria del renderer

## Conclusión actualizada por Fase 4.1

No hay evidencia de una fuga progresiva del renderer durante la navegación estándar. La clasificación principal es **B — carga intencional única de vistas**, con un pico transitorio compatible con **C — heap reservado/recolectado por V8** y una parte de PSS compatible con **D — recursos nativos de Chromium** (especialmente Skins).

No se cambió código de producción. Tampoco se cambiaron XMCL, updater, autenticación, flags gráficos, Electron ni dependencias.

## Método reproducible

- AppImage de Fase 3; Electron 42.3.0; modo gráfico seguro de Linux intacto.
- CDP se habilitó temporalmente sólo en `127.0.0.1`.
- A: reposo 60 s. B: un ciclo de Inicio, Instancias, Descubrir, Skins y Ajustes (10 recorridos). C: cuatro ciclos. D: 60 s sin interacción. E: `HeapProfiler.collectGarbage` únicamente como diagnóstico.
- Cada heap snapshot se recibió con `HeapProfiler.addHeapSnapshotChunk` y se escribió incrementalmente en `/tmp`; no se acumuló en memoria ni se guardó en Git.
- PSS procede de `smaps_rollup`; no se sumó RSS.

## A–E

| Punto | PSS total | PSS renderer | Heap usado | DOM CDP | Listeners CDP | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| A, reposo | 275.9 MiB | 77.5 MiB | 1.50 MiB | 1,210 | 91 | Sólo Inicio cargado. |
| B, ciclo 1 | 306.6 MiB | 95.5 MiB | 1.92 MiB | 3,938 | 348 | Se cargaron las cinco vistas una vez. |
| C, ciclo 4 | 328.9 MiB | 116.5 MiB | 3.05 MiB | 5,623 | 427 | Pico temporal antes de la recolección normal. |
| D, +60 s | 310.8 MiB | 98.5 MiB | 1.78 MiB | 3,938 | 348 | Se recuperó el pico sin GC forzado. |
| E, GC diagnóstico | 314.7 MiB | 99.7 MiB | 1.78 MiB | 3,938 | 348 | Sin objetos adicionales liberables; la variación de PSS es de proceso/nativa. |

`Private_Dirty` del renderer fue 24.0, 36.6, 57.7, 39.7 y 40.9 MiB respectivamente. Hubo siempre ocho procesos y un único renderer.

## Heap y listeners

Los snapshots A→B y A→E coinciden: +1.170 `Text`, +140 `ShadowRoot`, +264 `EventListener`, +293 `Array`, +7 `ArrayBuffer` y +2 `Map`. Sus shallow sizes son pequeños: los listeners suman 19.2 KiB, `ShadowRoot` 23.5 KiB y `Text` 91.4 KiB. B→C sólo varió 96 bytes de `Text`; C→D y D→E no registraron delta de objetos retenidos.

La auditoría CDP encontró 345 listeners DOM expuestos (el snapshot nativo cuenta 348). El grupo más grande son 133 `click` creados en `common.js` para los botones de opción de los selects personalizados; después aparecen siete `click` de triggers y siete `change` de selects. Sus targets son nodos vivos de las vistas cargadas. No se observó DOM detached atribuible a Kindyr: sólo cadenas y built-ins de ArrayBuffer con la palabra `detached`. El formato de heap de V8 sólo expone los listeners mediante `native:InternalNode → EventListener`, por lo que no dio una ruta JS más específica; la auditoría CDP sí asoció los grupos a líneas concretas.

`navigation.js` conserva las vistas en `loadedSections` y las carga una sola vez. Es coherente con que el DOM, los botones y sus listeners sigan vivos después de B y no crezcan en C.

## Decisión

No se aplica corrección. Eliminar secciones, listeners o forzar GC reduciría memoria aparente a costa de romper la caché de navegación, sin una fuga demostrada. La siguiente fase sólo debería tocar renderer si cambia ese diseño de caché con un objetivo de producto explícito, o si un flujo distinto demuestra crecimiento B→C persistente.

Los datos completos de cierre están en `phase-4-1-diagnostic-closure.md`, `phase-4/snapshot-summary.json`, `phase-4/snapshot-capture-log.json` y `phase-4/section-isolation.json`.

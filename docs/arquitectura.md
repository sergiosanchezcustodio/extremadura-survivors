# Arquitectura: dónde está cada cosa

Mapa del código para quien llega sin haberlo visto: un agente nuevo (Codex,
Claude) o una persona. No explica el porqué de cada decisión —eso está en los
comentarios de cada fichero, que son largos a propósito, y en
[docs/memoria/](memoria/README.md)—, solo dónde buscar.

## Lo esencial en cinco líneas

- **Sin build.** `index.html` carga `js/main.js` como módulo ES6 nativo y ya.
  Se edita un fichero, se recarga la pestaña. `package.json` existe SOLO para
  las pruebas con Playwright de `herramientas/`: el juego no depende de nada.
- **Hace falta un servidor** (los módulos no cargan por `file://`):
  `python herramientas/servidor.py` sirve en http://localhost:8000 con
  `Cache-Control: no-store`, que evita el fallo más caro de diagnosticar —cambiar
  un PNG o un `.js` y seguir viendo el viejo—.
- **Timestep fijo a 60 Hz** (`core/bucle.js`): `actualizar(dt)` y
  `dibujar(alpha)` en `main.js`, lógica y render desacoplados.
- **Todo en unidades lógicas de 480x270.** El arte va a ×4 (`ESCALA_ARTE` en
  `core/constantes.js`), la interfaz en su propia rejilla de 960x540
  (`ANCHO_UI`) sobre otro lienzo, a resolución de pantalla.
- **Determinista.** Misma semilla ⇒ misma partida, bit a bit, en cualquier
  navegador. De eso depende el cooperativo online (lockstep). Por eso existen
  `core/rng.js` y `core/mate.js`, y por eso el estado de la partida no se guarda
  en ningún sitio.

## Carpetas

| Carpeta | Qué hay |
|---|---|
| `js/core/` | Motor sin juego: bucle, entrada, cámara, pools, spatial hash, RNG, matemáticas deterministas, carga de recursos, progreso META, nube, lockstep. |
| `js/datos/` | **Datos puros, jamás lógica**: catálogos de armas, pasivos, enemigos, jefes, mascotas, personajes, potenciadores y los niveles. |
| `js/entidades/` | Lo que vive en la partida, todo con pool preasignado: jugador, enemigos, proyectiles, disparos enemigos, zonas de daño, gemas, cofres. |
| `js/sistemas/` | Lo que mueve a las entidades: armas, colisiones, director de oleadas, jefes, progresión, mascotas, paredes de rejilla y su suelo, obstáculos, partículas, VFX, audio. |
| `js/ui/` | Todas las pantallas y paneles. Van en la **capa de interfaz** (`ui/capa.js`), un lienzo aparte a resolución de pantalla, para que el texto nunca salga pixelado. |
| `js/red/` | Cooperativo online: código de invitación, conexión WebRTC sin servidor, sincronización con el lockstep, consola de depuración de red. |
| `assets/` | Arte y sonido **ya procesados**, lo que carga el juego. No se edita a mano: sale de `resources/` con las herramientas. |
| `resources/` | Originales de Sergio (PNG, GIF grandes). `resources/generadas/` son bocetos de Replicate y no se versionan. |
| `herramientas/` | Scripts de desarrollo: procesar arte, pruebas en Node y en navegador, empaquetar, publicar. |
| `docs/` | Documentación. Ver el índice en `AGENTS.md`. |
| `nube/` | El worker de Cloudflare que guarda la copia en la nube del progreso (ver `nube/LEEME.md`). |
| `manual/` | Manual del jugador (HTML y PDF). |
| `css/estilos.css` | El poco CSS que hay: los lienzos y la capa HTML del código de invitación. |

## `js/core/`

| Fichero | Para qué |
|---|---|
| `bucle.js` | Timestep fijo con acumulador (60 Hz, tope `MAX_PASOS`). |
| `constantes.js` | Resolución lógica, `ESCALA_ARTE`, rejilla de la UI, `DT`, `TILE`. La separación lógica/arte vive aquí y solo aquí. |
| `entrada.js` | Teclado, mandos y joystick táctil, **por jugador** (teclado al 1, mando k al k). |
| `controles.js` | Qué tecla/botón hace qué, reasignable. Ajuste de la máquina, no de la partida. |
| `camara.js` | Cámara con **correa**: sigue al centro del grupo y nadie pasa del borde. |
| `pool.js` | Pool genérico. **Cero `new` durante la partida.** |
| `rejilla.js` | Spatial hash para colisiones. Nunca N². |
| `rng.js` | PRNG con semilla. Toda aleatoriedad que toque la simulación sale de aquí. `Math.random` solo vale para lo cosmético que no afecta a nada (el tono de un efecto de sonido, `sistemas/audio.js`). |
| `mate.js` | Seno, coseno, hipotenusa… deterministas entre navegadores. En la simulación se usan estos y no `Math.sin`. |
| `determinismo.js` | Herramienta de desarrollo: firmas de estado y las tres pruebas de determinismo. |
| `lockstep.js` | Búfer de pulsaciones entre el mando y la simulación. |
| `recursos.js` | Carga del atlas con sustitución automática: el juego es jugable aunque falte arte. |
| `metaProgreso.js` | Progreso META (denarios, héroes, potenciadores) en `localStorage`. Lo único que sobrevive entre partidas. Tres huecos de partida. |
| `progresoPortable.js` | El progreso como texto pegable, para llevárselo a otro ordenador. |
| `nube.js` | Copia del progreso en la nube (login con GitHub contra el worker de `nube/`). |

## `js/main.js` (≈4.500 líneas)

El director de orquesta: estado de pantallas (`PANTALLA_*` e `irA`), la entrada
de cada menú (`entradaTitulo`, `entradaSeleccion`, `entradaNiveles`…), el alta y
baja de jugadores, `usarNivel` (cambiar de nivel), la partida en red, y los dos
latidos: `actualizar(dt)` y `dibujar(alpha)`.

Orden de un paso de partida en `actualizar`, más o menos: entrada → mascotas →
campo de flujo de la rejilla → mover enemigos y proyectiles → obstáculos,
paredes y ataúdes → zonas, gemas, cofres → disparos enemigos → partículas, VFX,
audio → director de oleadas → jefes. Cambiar ese orden cambia la partida (y la
firma de determinismo).

## `js/datos/`

`armas.js` (58 en juego + 7 apartadas con marca), `pasivos.js` (objetos),
`enemigos.js`, `jefes.js`, `mascotas.js`, `personajes.js` (ocho, cada uno con
su arma propia), `potenciadores.js` (tienda META). Los niveles en
`datos/niveles/`: `indice.js` los registra; `merida.js` es el nivel 1 (calzada,
mundo abierto hacia el norte); `lighthouse.js` el nivel 2 (recinto), con su
mapa generado en `lighthouse-mapa.js` (**no se edita a mano**: sale de
`herramientas/mapa-lighthouse.js`).

Qué es cada arma y objeto, y las decisiones tomadas: `docs/armas-y-objetos.md`.

## `js/sistemas/`

| Fichero | Para qué |
|---|---|
| `armas.js` | Motor de armas. Un comportamiento nuevo es una función en `COMPORTAMIENTOS`; un arma que reutiliza uno es solo una entrada en `datos/armas.js`. |
| `colisiones.js` | Todo lo que choca, sobre la rejilla espacial. |
| `director.js` | Oleadas: lee la curva del nivel y hace aparecer tandas. |
| `jefes.js` | Motor genérico de jefes, parametrizado por `datos/jefes.js`. |
| `progresion.js` | Experiencia, subida de nivel, ofertas de tres cartas, cofres de élite. |
| `mascotas.js` | La mascota de cada jugador. |
| `rejillaMapa.js` | Niveles de recinto: paredes, colisión contra ellas, campo de flujo para que la horda persiga por los pasillos, cierres que abren los jefes. |
| `sueloRejilla.js` | Suelo, paredes, escaparates y estanterías de un nivel de rejilla. |
| `obstaculos.js` | Columnas, antorchas, estatuas del nivel de calzada. |
| `expendedoras.js` | Máquinas expendedoras del nivel 2. |
| `particulas.js`, `vfx.js` | Efectos: partículas, números de daño, sacudida de cámara. |
| `audio.js` | Música, efectos y voz (los MP3 horneados de `assets/voz/`). |

## `js/ui/`

Cada pantalla, su fichero: `intro.js`, `huecos.js` (las tres partidas),
`pantallas.js` + `tituloVivo.js` (título y selección), `niveles.js`,
`historia.js` + `relato.js` (placa de piedra con el relato narrado),
`tienda.js`, `configuracion.js`, `controles.js`, `red.js` + `codigoRed.js`,
`hud.js` (paneles de jugador), `ficha.js`, `menuNivel.js`, `cofre.js`,
`mapa.js` (plano del recinto), `final.js`, `depuracion.js` (overlay F3),
`galeria.js` (temporal, revisar arte). `capa.js` es el lienzo nítido y `tema.js`
el tema de color tomado del nivel.

## Teclas de desarrollo

F3 abre el overlay de depuración (tiempos por subsistema; Y/P/N/O apagan suelo,
partículas, números y efectos para aislar). Las teclas 1-4 sueltan hordas de
prueba. `J` añade un jugador con teclado y `H` lo quita. Bloq Mayús o `Y`
abren el plano en un recinto.

## Pruebas

Todas en `herramientas/`, con `node` (las de navegador usan Playwright, que es
la única devDependency):

| Comando | Qué mira | Navegador |
|---|---|---|
| `npm run probar` | Matemáticas, códec de invitación, lockstep, sincro, progreso, nube (worker y cliente). La batería rápida. | No |
| `node herramientas/probar-determinismo.js` | Las tres pruebas de determinismo. | Sí |
| `npm run probar-nivel2` | Paredes del nivel 2 **con teclas de verdad**. | Sí |
| `npm run probar-menus` | Que se llega a cada pantalla y se puede volver. | Sí |
| `npm run probar-partida` | Una partida en red de verdad entre dos pestañas. | Sí |
| `node herramientas/probar-aguante.js [min]` | Veinte minutos seguidos jugando. | Sí |
| `node herramientas/probar-firma-arsenal.js` | Que la firma de determinismo ve el arsenal. | Sí |
| `node herramientas/medir-rendimiento.js [logica\|dibujo\|memoria]` | Coste por paso con la pantalla llena. | Sí |
| `npm run jugar-en-red [n]` | Abre n ventanas ya conectadas, para mirar el cooperativo. | Sí |

Las de navegador levantan su propio servidor en otro puerto (no hace falta el
de 8000) y necesitan `npm install` y `npx playwright install chromium` la
primera vez.

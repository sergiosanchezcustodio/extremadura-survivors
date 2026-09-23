# Extremadura Survivors — instrucciones para agentes

Survivors-like (estilo Vampire Survivors) ambientado en la Extremadura romana y
de hoy. Navegador, Canvas 2D, JavaScript con módulos ES6 nativos, **sin build y
sin dependencias**. Cooperativo local hasta 4 y online por lockstep. Lo publica
GitHub Pages desde `master` y también está en itch.io.

Este fichero lo leen **Codex** (`AGENTS.md`) y **Claude Code** (a través de
`CLAUDE.md`, que lo importa). Es la única fuente de instrucciones: si algo
cambia, se cambia aquí.

Quien dirige el proyecto es **Sergio** (sergiosanchezcustodio). Dibuja él el
arte, prueba él cada cambio jugando y habla en **español**: se le contesta en
español, directo y sin relleno.

## Antes de tocar nada

1. **[docs/arquitectura.md](docs/arquitectura.md)** — dónde está cada cosa, el
   orden de un paso de partida y todas las pruebas.
2. **[docs/memoria/](docs/memoria/README.md)** — las decisiones que NO están en
   el código: qué pidió Sergio, qué se probó y se quitó, y por qué. Casi todo lo
   que parece una mejora obvia ya se discutió ahí. Leer el fichero del tema
   antes de proponer.
3. El documento del área que se vaya a tocar (índice más abajo).
4. Los comentarios del propio fichero. Son largos **a propósito**: cuentan el
   porqué y los fallos ya pagados. No se recortan ni se "limpian".

## Restricciones (no negociables)

- Cero dependencias externas en el juego. Solo HTML/CSS/JS con módulos ES6
  nativos. `package.json` existe únicamente para las pruebas con Playwright.
- Canvas 2D puro. Nada de WebGL ni librerías.
- Object pooling obligatorio: **cero `new` durante la partida** (ni objetos,
  ni arrays, ni closures por frame).
- Colisiones vía spatial hash (`js/core/rejilla.js`). Nunca N².
- `js/datos/` contiene datos puros, jamás lógica.
- Resolución interna 480x270, escalado entero, `imageSmoothingEnabled = false`.
- Nombres de dominio en español, técnicos en inglés. **Comentarios en español.**
- **Determinismo.** Misma semilla ⇒ misma partida bit a bit en cualquier
  navegador; el online depende de ello. En la simulación, el azar sale de
  `core/rng.js` y la trigonometría de `core/mate.js` (nunca `Math.random`,
  `Math.sin`, `Date.now` ni `performance.now` en lógica que afecte a la
  partida). Ver `docs/cooperativo-online.md`.
- El estado de LA PARTIDA EN CURSO vive solo en memoria (sin `sessionStorage`
  ni nada equivalente): persistir estado a medio jugar rompería la
  reproducibilidad. `localStorage` SÍ está permitido, pero únicamente para
  progreso META que sobrevive entre partidas —denarios, héroes y potenciadores
  desbloqueados—, nunca para nada que se lea durante una partida activa.
- La interfaz va en la **capa nítida** (`js/ui/capa.js`), nunca en el lienzo
  pixelado del juego: el texto no puede verse pixelado.
- Los sprites se dibujan a **1:1**. Deformar (squash, zoom) se hornea offline
  en la hoja; escalar en cada frame hundía los fps.
- En los niveles de rejilla, **ni paredes diagonales ni curvas**, y **la cara
  de un muro es pared**: nadie puede estar dentro (ver
  `docs/memoria/perspectiva-la-cara-es-pared.md`).

## Comandos

Windows 11 y PowerShell. Rutas con `\` en PowerShell y con `/` en Node.

| Comando | Qué hace |
|---|---|
| `.\herramientas\jugar.ps1` | Levanta el servidor y abre el juego (`jugar.bat` a doble clic). `-SinNavegador` para solo el servidor. |
| `python herramientas/servidor.py` | Servidor en http://localhost:8000 con `Cache-Control: no-store`. **Usar este y no `python -m http.server`**: sin el no-store el navegador sirve el `.js` o el PNG viejo y se busca el fallo donde no está. |
| `npm install` y después `npx playwright install chromium` | Solo la primera vez, para las pruebas. |
| `npm run probar` | Batería rápida sin navegador: matemáticas, códec, lockstep, sincro, progreso, nube. |
| `npm run probar-nivel2` | Paredes del nivel 2 en un navegador, **con teclas**. |
| `npm run probar-menus` | Se llega a cada pantalla y se puede volver. |
| `npm run probar-partida` | Partida en red real entre dos pestañas. |
| `node herramientas/probar-determinismo.js` | Las tres pruebas de determinismo. |
| `node herramientas/medir-rendimiento.js` | Coste por paso con la pantalla llena. |
| `.\herramientas\procesar-assets.ps1` | Convierte `resources/` en los sprites de `assets/`. |
| `.\herramientas\paneles-lighthouse.ps1` | Paneles de pared y estantería del nivel 2, a 64x224. |
| `node herramientas/mapa-lighthouse.js generar\|importar` | Traza el mapa del nivel 2 y escribe el `.tmj` de Tiled, o importa lo retocado en Tiled a `js/datos/niveles/lighthouse-mapa.js`. |
| `.\herramientas\ver-assets.ps1 <ruta>` | Describe imágenes **en texto** (medidas, alfa, caja, fotogramas, colores) sin abrirlas. |
| `.\herramientas\medir-lapida.ps1` | Dónde caen los renglones del menú del título. |
| `.\herramientas\empaquetar.ps1` | Ejecutable de Windows con NW.js en `dist/` (no se versiona). |
| `.\herramientas\publicar-itch.ps1` | Publica en itch.io. Ver `docs/publicar.md`. |
| `.\herramientas\instalar-lanzador.ps1 [-Agente codex]` | Deja el comando `extremadura`, que abre Claude o Codex en el repo. |
| `node herramientas/generar-imagen.js "<prompt>" -s <ruta>` | Imagen con Replicate (ver más abajo). |
| `node herramientas/generar-voz.js "<texto>" -s <ruta.mp3>` | Narración con ElevenLabs para `assets/voz/`. |

## Cómo se trabaja aquí

- **Al terminar cualquier tarea, el servidor tiene que estar levantado** en
  http://localhost:8000/ y el mensaje final acaba con ese enlace. Sergio va
  directo a probarlo. Si ya hay uno escuchando en el 8000, basta con decirlo.
- **Probar de verdad, no afirmar.** Si algo se mueve o choca, se prueba en un
  navegador **pulsando teclas** (Playwright `keyboard.down/up`), como hace
  `herramientas/probar-nivel2.js`. Colocar al jugador asignando `x`/`y` solo
  vale para situarlo antes de empezar: pisa `xPrev`/`yPrev`, que es lo que lee
  la colisión, y la prueba da por bueno un juego que no existe. Sergio dio
  permiso para construir estas pruebas en vez de pedirle que compruebe él.
- **Si una prueba falla, se dice con la salida.** Nada de "debería funcionar".
- **Commits** solo cuando Sergio lo pida. Mensaje en español, una frase que
  cuenta lo que cambia para quien juega (mira `git log --oneline`), con
  detalle debajo si hace falta. Nunca `.env`, ni `dist/`, ni
  `resources/generadas/`.
- **Una tarea, una sesión.** Al cerrar una tarea, sesión nueva para la
  siguiente: el contexto acumulado es lo que más cuesta (ver abajo).
- **Balance:** la dificultad sube con **vida y densidad, nunca con velocidad**.
  Los enemigos "especiales" van a la velocidad de su versión básica. Ver
  `docs/memoria/dificultad-vida-no-velocidad.md`.
- **"emerita" en el código NO siempre es un olvido del cambio de nombre.** El
  worker de Cloudflare, el id de nivel `merida`, `prompt-emerita-survivors.md` y
  las claves viejas de `localStorage` (paracaídas de la migración) se quedan
  así a propósito. Ver `docs/memoria/cambio-de-nombre-extremadura.md`.
- **Ficheros generados, no a mano:** `js/datos/niveles/lighthouse-mapa.js` (sale
  de `mapa-lighthouse.js`) y todo `assets/` que tenga origen en `resources/`
  (sale de `procesar-assets.ps1` o `paneles-lighthouse.ps1`).
- **Memoria.** Cuando Sergio corrige una forma de trabajar o se toma una
  decisión que no queda escrita en el código, se añade un fichero en
  `docs/memoria/` y su línea en `docs/memoria/README.md`. Si un fichero de ahí
  se queda viejo, se corrige. Fechas siempre absolutas.

## Coste de contexto (no negociable)

El coste de lo que entra en la sesión es su tamaño **multiplicado por los pasos
que quedan**, porque se relee en cada uno. Una imagen cuesta miles de tokens y
ya no se va; los ficheros JS del proyecto juntos son calderilla. Medido sobre
una sesión real: las imágenes eran el 70% del contexto y el 95% del gasto (ver
`docs/memoria/coste-por-contexto-acumulado.md`).

- **Leer código es barato.** No racionar lecturas de `.js`, `.json`, `.md` ni
  `.ps1`.
- **Nunca abrir una imagen para comprobar un hecho.** Medidas, transparencia,
  centrado, fotogramas y colores los da `ver-assets.ps1` en una línea de texto.
  Abrir la imagen es sólo para opinar sobre el dibujo, y una sola vez.
- **Captura de pantalla sólo para juzgar lo visual.** Si la pregunta tiene
  respuesta de texto —¿existe el elemento?, ¿qué valor tiene?, ¿hay error en
  consola?— se evalúa JavaScript en la página o se leen los mensajes de
  consola. Y antes de capturar, ventana pequeña.
- **Los lotes de imágenes, fuera de la sesión principal** (un subagente o una
  tarea aparte que devuelva solo el resumen).

## Imágenes y voz generadas

Hay cuenta de **Replicate** (imágenes) y de **ElevenLabs** (voz). Los tokens
viven en `.env` (`REPLICATE_API_TOKEN=...` y `ELEVENLABS_API_KEY=...`), que está en
`.gitignore` y no se sube nunca. Sin token las herramientas lo dicen y no
llaman a la API.

- Se pueden usar **sin preguntar** cuando Sergio pide una imagen o un boceto.
- **No es arte final.** El arte lo dibuja Sergio; lo generado sirve para probar
  una idea o rellenar un hueco. Nada entra en `assets/` sin que él lo vea.
- **Cuesta dinero.** Céntimos por imagen con `flux-schnell`, bastante más con
  modelos grandes. Cuatro variantes sí; cuarenta a ver qué sale, no. Si una
  tanda va a costar más que un café, se dice antes.
- Lo generado no se abre para comprobar que existe: `ver-assets.ps1`.
- `resources/generadas/` está en `.gitignore`: es un cajón de bocetos. Lo que
  valga se mueve a mano a su carpeta de `resources/`.

## Documentación

| Documento | De qué va |
|---|---|
| [docs/arquitectura.md](docs/arquitectura.md) | Mapa del código, orden del paso de partida, pruebas. |
| [docs/memoria/](docs/memoria/README.md) | Decisiones y formas de trabajar que no están en el código. |
| [docs/armas-y-objetos.md](docs/armas-y-objetos.md) | Las armas y objetos y **las decisiones tomadas, para no volver a discutirlas**. Leer antes de tocar armas u objetos. |
| [docs/anadir-un-nivel.md](docs/anadir-un-nivel.md) | Cómo se añade un nivel; calzada frente a recinto; Tiled; la cara de un muro. |
| [docs/niveles.md](docs/niveles.md) | Los siete niveles previstos y sus jefes. |
| [docs/cooperativo-online.md](docs/cooperativo-online.md) | Estado del online, pruebas y trampas ya pagadas. Leer antes de tocar `js/red/`, `lockstep.js` o algo que pueda romper el determinismo. |
| [docs/publicar.md](docs/publicar.md) | GitHub Pages, itch.io y el sello del atlas. |
| [docs/migrar-a-codex.md](docs/migrar-a-codex.md) | Qué se hizo para poder trabajar con Codex y qué no se lleva. |
| [nube/LEEME.md](nube/LEEME.md) | El worker de Cloudflare de la copia en la nube. |
| [README.md](README.md) | La cara pública del proyecto, para jugadores. |
| `prompt-emerita-survivors.md` | Plan original por fases. **Histórico**: las cinco fases están cerradas. |

## Estado (23/09/2026)

- Las cinco fases del plan original están cerradas, y la lista de armas y
  objetos de Sergio también: 58 armas en juego, 29 objetos, ocho héroes con su
  arma propia, ocho mascotas, tres jefes en el nivel 1 (Cerbero, Hidra, Loba
  capitolina). No queda arte provisional.
- **Nivel 1, Emerita**: completo. **Nivel 2, CC The Lighthouse**: recinto de
  rejilla con el arte de Sergio, pero en lo jugable es un **prototipo** (curva
  de oleadas copiada de Mérida, jefes reutilizados de Mérida).
  Niveles 3 a 7: solo en `docs/niveles.md`.
- Online por lockstep hasta 4 jugadores, funcionando; **sin probar todavía
  entre dos casas de verdad**.

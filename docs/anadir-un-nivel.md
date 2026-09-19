# Añadir un nivel

Documento de referencia para quien vaya a escribir el nivel 2. Estaba en el
README y se movió aquí cuando el README pasó a ser la portada del proyecto:
el detalle sigue haciendo falta, pero no en la primera pantalla.

**Qué es cada nivel del recorrido está en [niveles.md](niveles.md)**; aquí solo
está el CÓMO. El ejemplo de más abajo usa el nivel 2 —el CC The Lighthouse—
porque es el siguiente que toca, pero vale igual para cualquiera de los seis que
faltan. Hasta septiembre de 2026 el ejemplo era Cáceres, que era uno de los
sitios que había apuntados antes de que Sergio cerrara el recorrido; se cambió
para no dejar el documento enseñando un nivel que ya no existe.

## El contrato

`js/datos/niveles/merida.js` exporta un único objeto `NIVEL`. Un nivel nuevo
es, en el caso ideal, copiar ese archivo y cambiar los valores — sin tocar
nada de `sistemas/` ni de `ui/`. La forma real (la que lee el código hoy, no
un boceto) es esta:

```js
export const NIVEL = {
  id: 'merida',                // clave interna: nombra el atlas de assets,
                                // 'merida-suelo.jpg', 'merida' + sprite, etc.
  nombre: 'Emerita Augusta',
  subtitulo: 'Las ruinas del Imperio',
  duracion: 1800,               // segundos que dura la partida (30 min)

  historia: [ '@CAPÍTULO I', '#LA HORDA', /* ... */ ],  // el relato del sitio,
                                // en la placa de piedra, antes de jugarlo.
                                // Opcional — ver "La historia de cada nivel"

  paleta: { arena: '#b99b6b', /* ... */ },      // colores del suelo procedural
                                                  // de emergencia (sin PNG)
  interfaz: {                                    // tema visual de menús: pausa,
    ornamento: 'romano',                         // derrota/victoria, subida de
    fondo: '#2b2e33', /* ... */                  // nivel — lo lee ui/tema.js
  },

  suelo: {                      // ui/... si no hay `imagen`, o si no carga,
    imagen: 'niveles/merida-suelo.jpg',   // el nivel sigue siendo jugable con
    variantes: 4, base: 'arena',          // el suelo procedural de `paleta`
    motas: ['arenaOscura', 'piedra', 'caliza'],
    densidadMotas: 42, grietas: 2
  },

  // Curva de oleadas: array de FUENTES. Cada una está viva entre `desde` y
  // `hasta` (segundos), suelta `cantidad` enemigos cada `cada` segundos con
  // un `patron` ('anillo' | 'linea' | 'oleada' | 'cerco' | 'individual'),
  // eligiendo el tipo al azar de `tipos`. Los ids de `tipos` son claves del
  // catálogo GLOBAL y COMPARTIDO en datos/enemigos.js — hoy no hay bestiario
  // por nivel; si The Lighthouse necesita un monstruo que Mérida no tiene, se añade
  // como entrada nueva a ese catálogo global.
  eventos: [
    { desde: 0, hasta: 120, patron: 'anillo', cada: 0.37, cantidad: 2,
      tipos: ['serpiente'] },
    // 'individual' es el patrón de los élites: entra UNA vez al abrir su
    // ventana, no cuenta contra el techo de densidad, y admite `aviso` (el
    // texto que anuncia un élite o un jefe al entrar).
    { desde: 300, hasta: 302, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTICORA' }
  ],

  // Techo de enemigos vivos a la vez, interpolado entre marcas — un freno de
  // rendimiento, no un objetivo de diseño. Sin marca para t > la última, se
  // queda en el valor de la última (ver `topeEn` en sistemas/director.js).
  densidad: [
    { t: 0, max: 90 },
    { t: 1200, max: 850 }
  ],

  // Vida y daño de cada enemigo se multiplican por 1 + factor * minutos al
  // aparecer. La velocidad NO escala nunca (bestiario ilegible si acelera).
  escalado: { vida: 0.11, danyo: 0.05 },

  // Momentos en los que entra un JEFE DE VERDAD, aparte del final (ver más
  // abajo). `jefe` es una clave dentro de `jefes`, así que el director
  // resuelve el tipo sin saber nada de Cerbero ni de la Loba.
  hitos: [
    { t: 600, texto: 'CERBERO', jefe: 'intermedio' }
  ],

  // Objetos sólidos del escenario (columnas, antorchas, estatuas, ruinas),
  // repetidos cada vez que el tile de suelo repite. Coordenadas LOCALES al
  // tile (0..ancho, 0..alto), no de mundo. `tipo` es un id del atlas de
  // objetos que procesa herramientas/procesar-assets.ps1.
  decoracion: [
    { tipo: 'columna', x: 186, y: 50 }
  ],

  // Los tres jefes del nivel. `intermedio`, `segundo` y `final` son claves
  // que apuntan a entradas de datos/jefes.js — ver el aviso importante más
  // abajo sobre qué significa reutilizar una de esas tres claves.
  jefes: { intermedio: 'cerbero', segundo: 'hidra', final: 'loba',
           escolta: 'gemelo', avisoFinal: 'LA LOBA CAPITOLINA' }
  // Sin campo `musica`: la Fase 7 sustituyó los ficheros de audio previstos
  // originalmente por síntesis procedural (sistemas/audio.js). No hay nada
  // que referenciar desde un nivel — el audio no depende del nivel en curso.
};
```

## Lo que NO es "solo copiar el archivo de datos" (todavía)

El contrato de arriba es real, pero hay tres sitios donde un nivel nuevo sí
obliga a tocar código, y conviene saberlo antes de prometer que The Lighthouse es
gratis:

1. **Los jefes tienen comportamiento a medida, no genérico.**
   `sistemas/jefes.js` reconoce por nombre exactamente tres tipos —
   `'cerbero'`, `'hidra'`, `'loba'`— y cada uno lleva su propia máquina de
   estados (fases, conos de fuego, veneno, furia...). Un nivel nuevo puede
   **reutilizar** cualquiera de los tres (con su propio nombre de aviso y
   sus propios números de escalado, vía `datos/jefes.js`) sin escribir una
   sola línea de lógica. Pero un jefe con un comportamiento genuinamente
   distinto —no una Loba con más vida, sino un enemigo que hace algo que
   ninguno de los tres hace hoy— necesita una función `actualizarNombre(...)`
   nueva en `sistemas/jefes.js`, siguiendo el mismo patrón que las tres que
   ya existen.

2. **El pipeline de assets está escrito para el nivel 1, no en bucle.**
   `herramientas/procesar-assets.ps1` espera el arte en
   `resources/stages/<n>/` (mapa, objetos de escenario, bestiario si trae
   ilustraciones propias) y hoy tiene las rutas de `stages\1\...` escritas a
   mano en sus tablas de configuración (`$SUELOS`, la lista de objetos del
   escenario, etc.). Añadir The Lighthouse implica **añadir sus propias entradas
   en esas tablas** (`stages\2\...` → `dst='niveles\lighthouse-suelo.png'`,
   etc.), no solo dejar caer los PNG en una carpeta y esperar a que el
   script los encuentre solo.

3. **Un nivel nuevo hay que darlo de alta en el índice.** Ya no es tocar un
   import de `main.js` —eso se acabó—, pero tampoco basta con dejar caer el
   archivo en la carpeta: `js/datos/niveles/indice.js` lleva la lista de los
   que existen y en qué orden se recorre la región, y ahí hay que añadir una
   línea. Es la única de todo el proyecto fuera de `datos/niveles/`. Ver
   **El índice y el selector**, más abajo.

## Ejemplo comentado: un nivel de CALZADA

El nivel 2 —The Lighthouse— ya está escrito y es de RECINTO (ver más abajo), así
que como ejemplo de "copiar merida.js y cambiar los números" sirve mejor
cualquiera de los cinco que faltan. El esqueleto es este:

```js
// js/datos/niveles/<sitio>.js
//
// Copiado de merida.js y con los números cambiados. Mientras el sitio
// reutilice el bestiario y los tres jefes existentes (solo con otro nombre
// y otra curva de escalado), esto es TODO lo que hace falta escribir aquí.

export const NIVEL = {
  id: 'lighthouse',
  nombre: 'CC The Lighthouse',
  subtitulo: 'Sin salida',
  duracion: 1800,

  paleta: { /* neones y baldosa, en vez de los ocres de Mérida */ },
  interfaz: { /* mismo formato que merida.js, otra paleta */ },

  suelo: {
    imagen: 'niveles/lighthouse-suelo.png',   // sale de resources/stages/2/...
    variantes: 4, base: 'piedra',
    motas: ['piedraOscura', 'musgo'], densidadMotas: 38, grietas: 3
  },

  // Puede EMPEZAR copiando los eventos de Mérida tal cual y solo retocar
  // cadencias/cantidades: la curva ya está una vez validada jugando, y
  // reescribirla desde cero es tirar ese trabajo.
  eventos: [ /* ... */ ],
  densidad: [ /* ... */ ],
  escalado: { vida: 0.12, danyo: 0.05 },   // un pelín más duro que Mérida

  hitos: [
    { t: 600, texto: 'CERBERO', jefe: 'intermedio' }
  ],
  decoracion: [ /* escaparates/jardineras medidos sobre lighthouse-suelo.png */ ],

  // Reutiliza los tres jefes SIN tocar sistemas/jefes.js: solo cambian el
  // nombre de aviso y los números de datos/jefes.js si se quiere que
  // pegue distinto que en Mérida.
  jefes: { intermedio: 'cerbero', segundo: 'hidra', final: 'loba',
           escolta: 'gemelo', avisoFinal: 'LO QUE VIVE EN EL CENTRO' }
};
```

Para jugarlo: `herramientas/procesar-assets.ps1` necesita sus propias
entradas para `stages\2\...` (ver el aviso 2 de arriba), y hay que dar de alta
`lighthouse.js` en el índice.

## Dos clases de nivel: calzada y recinto

Hasta septiembre de 2026 todos los niveles eran de la misma clase. Ahora hay
dos, y la diferencia está en un solo campo del archivo de datos:

**CALZADA** (Mérida). Sin campo `mapa`. El suelo es una imagen que repite sin
límite hacia arriba y hacia abajo, el ancho lo pone la propia imagen, y lo
sólido son las quince piezas de `decoracion` que lleva `sistemas/obstaculos.js`.
Es lo que había y no ha cambiado ni una línea.

**RECINTO** (CC The Lighthouse). Con campo `mapa`. El mundo es CERRADO y de
tamaño conocido, con paredes de verdad, y lo lleva `sistemas/rejillaMapa.js`:

```js
import { MAPA, LEYENDA, CELDA } from './lighthouse-mapa.js';

mapa: { rejilla: MAPA, leyenda: LEYENDA, celda: CELDA },
coloresMapa: { '#': '#2f333c', '.': '#b9b5ad', /* uno por símbolo */ }
```

Con ese campo puesto, el motor enciende solo cuatro cosas que en un nivel de
calzada no existen:

1. **Las paredes frenan.** La posición dice en qué celda estás y mirar si hay
   pared es un acceso a un array, así que el coste no depende de cuántas paredes
   tenga el mapa. Un centro comercial tiene unas 2100 celdas macizas; recorrer
   una lista de cajas como hace `obstaculos.js` no valía aquí.
2. **La horda persigue POR LOS PASILLOS.** Un campo de flujo —una búsqueda en
   anchura desde los jugadores, recalculada diez veces por segundo— dice en cada
   celda hacia dónde hay que ir. Se usa solo cuando hay pared de por medio:
   mientras te ve, el enemigo va en línea recta como siempre.
3. **Se aparece donde se puede estar.** Los patrones del director reparten en
   anillo alrededor de la cámara sin saber que hay tiendas, así que lo que cae
   dentro de una pared se corre a la celda transitable más cercana.
4. **La cámara topa con la fachada** en vez de asomarse al vacío.

Lo que NO cambia: oleadas, densidad, escalado, hitos y jefes son el mismo
contrato y los lee el mismo director.

## El mapa se dibuja en Tiled

La rejilla vive en `js/datos/niveles/<nivel>-mapa.js` y es un fichero
**GENERADO**: no se edita a mano. Se trabaja con
[Tiled](https://www.mapeditor.org/), que es un editor externo — **no es una
dependencia del juego**: no se carga en tiempo de ejecución, solo produce un
JSON que una herramienta traduce a `datos/`, que sigue siendo datos puros.

```
node herramientas/mapa-lighthouse.js generar [semilla]
    Traza un centro comercial entero y escribe:
      resources/mapas/lighthouse.tmj        <- se abre en Tiled
      resources/mapas/lighthouse-tiles.png  <- el tileset de colores planos
      js/datos/niveles/lighthouse-mapa.js   <- lo que lee el juego

node herramientas/mapa-lighthouse.js importar
    Lee el .tmj ya retocado a mano y reescribe SOLO el módulo de datos.
```

El ciclo de trabajo es: se genera una vez, se abre el `.tmj` en Tiled, se mueve
lo que haga falta con el ratón, se importa y se recarga el navegador. Por ahí no
hay que pasar por el código.

Dos cosas que el importador comprueba y avisa:

- **Que todo lo transitable sea UNA SOLA PIEZA.** Un local sin puerta es suelo
  al que no se puede llegar, y ahí caen gemas que nadie va a recoger. El
  generador lo garantiza taladrando; al editar a mano se puede romper, y por eso
  se avisa.
- **Que un hueco sin pintar es PARED.** Es lo seguro: tratarlo como suelo abriría
  un agujero al vacío por un despiste con el borrador.

En Tiled, las salidas y el punto de arranque están en una **capa de objetos**
(`puntos`), no en la de tiles: se arrastran con el ratón, que es para lo que
están ahí.

El tileset de hoy son ocho cuadrados de color plano — es el PROTOTIPO. Cuando
haya arte se sustituye ese PNG por el dibujado y el `.tmj` no se entera.

## El índice y el selector

`js/datos/niveles/indice.js` es la lista de los niveles que existen. Añadir uno
es una línea:

```js
const MODULOS = [
  () => import('./merida.js'),
  () => import('./lighthouse.js')      // <- lo único que hay que escribir fuera
];                                  //    de datos/niveles/<el nivel>.js
```

A partir de ahí el juego se ocupa solo:

- **La pantalla de elegir nivel** (`js/ui/niveles.js`) se pinta con el
  `nombre`, el `subtitulo` y la `duracion` que traiga cada archivo de datos. No
  hay ninguna lista de nombres escrita a mano en la interfaz: si The Lighthouse cambia
  de nombre, la pantalla lo dice sin que nadie la toque.
- **Va al final del recorrido**, después de elegir héroe y mascota: primero con
  quién se va, después adónde. Y se ve SIEMPRE, enseñando la región entera,
  también lo cerrado. Es lo contrario del criterio de la pantalla de mascotas
  —que se salta cuando no hay ninguna comprada— a propósito: allí lo que no se
  ha comprado no existe, y aquí lo que no se ha desbloqueado es justo lo que
  hay que enseñar.
- **Los sitios todavía sin escribir** salen apagados y con «PRÓXIMAMENTE».
  Están en `PROXIMOS`, en el mismo índice, y son solo nombres: ni oleadas, ni
  paleta, ni jefes. Al escribir uno de verdad se le añade su `import` arriba y
  se le quita el renglón de `PROXIMOS`.
- **Cerrar un nivel hasta terminar el anterior** es un campo del propio nivel:

  ```js
  requiere: 'merida'    // no se puede entrar hasta ganar en Mérida
  ```

  Se comprueba contra `MetaProgreso.fases`, que solo apunta las VICTORIAS:
  morir en el minuto 28 de Mérida no abre The Lighthouse. Un nivel sin `requiere` está
  siempre abierto, que es el caso de Mérida.
- **En cooperativo online lo elige el anfitrión.** El id del nivel viaja en el
  saludo junto a la semilla y los personajes, y quien se une carga ese mismo
  antes de empezar. Es obligatorio, no una comodidad: dos máquinas con niveles
  distintos son dos mundos distintos desde el primer fotograma, y ahí no hay
  lockstep que valga.

## La historia de cada nivel

`historia` es un campo más del archivo de datos: las líneas del relato que sube
por la placa de piedra al elegir el sitio y antes de jugarlo (`js/ui/historia.js`
lo enseña, `js/ui/relato.js` lo dibuja). Van **partidas a mano** —el corte de
cada renglón es parte del ritmo, porque se lee según entra—, una cadena vacía es
un renglón en blanco, `'#'` es titular y `'@'` antetítulo:

```js
historia: [
  '@CAPÍTULO II',
  '#SIN',
  '#SALIDA',
  '',
  'Aquí lo que pasó en el centro comercial.'
],
historiaImagen: 'menus/lighthouse-placa.jpg'   // opcional: otra lámina de fondo
```

Un nivel **sin** `historia` no pasa por esa pantalla y entra directo a jugar. No
es un error: es que todavía no tiene nada que contar.

La lámina es la de la intro salvo que se declare `historiaImagen`, que se hornea
al cargar el nivel (no al abrir la pantalla: una imagen que se empieza a pedir
cuando ya se está leyendo el relato se pone de fondo a media lectura).

Y la **intro** del arranque (`js/ui/intro.js`) NO cuenta ya el nivel 1: presenta
el juego entero. Contaba Mérida porque Mérida era todo lo que había, y meter
los seis relatos ahí sería un cuarto de hora de lectura antes de tocar el juego,
cinco sextos de ella sobre sitios donde no se puede entrar.

## Rendimiento del cambio de nivel

Cambiar de nivel NO vuelve a cargar el atlas. `Recursos.cargar()` trae el arte
común una vez al arrancar y `Recursos.cargarNivel(nivel)` solo el suelo y la
paleta, que es lo único que distingue a un sitio de otro. Lo que cuesta al
cambiar es esa imagen de suelo, y por eso la pantalla dice «Cargando el mapa…»
mientras llega.

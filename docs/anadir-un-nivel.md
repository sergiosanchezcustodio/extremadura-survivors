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
           escolta: 'gemelo', avisoFinal: 'LA LOBA CAPITOLINA' },

  // LA MÚSICA DEL SITIO, en el orden en que suena. Al acabar la última vuelve a
  // la primera, así que la partida entera las encadena sin silencio en medio
  // (con el evento `ended`, no con `loop`: eso repetiría la misma canción para
  // siempre). Un nivel sin `musica` se queda con las de Mérida.
  //
  // Los .mp3 los hornea herramientas/procesar-assets.ps1 desde resources/musica/
  // (tabla `$MUSICA`), a 128 kbps y sin carátula incrustada.
  musica: ['assets/musica/emerita-1.mp3', 'assets/musica/emerita-2.mp3']
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

### El suelo se dibuja con texturas, una por símbolo

`coloresMapa` sigue mandando en el plano, pero el suelo que se pisa lo pinta
`sistemas/sueloRejilla.js` con una TEXTURA por símbolo de la leyenda: una
imagen de 32x32 que repite (cuatro celdas), troceada por celdas al dibujar.
Se declaran en el nivel:

```js
texturasMapa: { '.': 'assets/niveles/lighthouse/pasillo.png', /* símbolo → PNG */ }
```

Las que no estén se sustituyen por un dibujo de relleno hecho en código a
partir del color de `coloresMapa` —terrazo, baldosa, tablones, moqueta,
terracota, estantería con género, mostrador de madera, persiana en las
puertas— elegido por el `nombre` de la leyenda. Así el mapa se lee antes de
que exista un solo PNG, y cuando Sergio dibuja uno es dejarlo en
`assets/niveles/<nivel>/` y apuntarlo aquí.

Se pinta por TROZOS de 16x16 celdas cacheados en lienzos fijos (reservados al
cargar, no en partida): unos veinte blits por fotograma en vez de dos mil
celdas. El caché se invalida solo cuando cambia lo que se ve, que hoy es abrir
o cerrar puertas (`RejillaMapa.versionSuelo`); una puerta abierta se pinta como
pasillo.

### El mobiliario: estanterías y mostradores

Dos símbolos más, `E` (estantería) y `M` (mostrador), sólidos como la pared
pero con dibujo propio. Los pone el generador (`amueblar` en
`herramientas/mapa-lighthouse.js`): los lineales del hipermercado son
estanterías; las tiendas llevan una o dos estanterías cortas; y todo local
lleva mostradores —uno si es pequeño, dos o más si pasa de 200 módulos, que es
el mismo corte que le da dos puertas—. En el híper y la mueblería las cajas
van en la franja de salida. Ningún mueble se pone sin dos módulos de aire
alrededor, ni delante de una puerta: las puertas se abren ANTES de amueblar.

### El grosor de la pared es el tamaño de la celda

Es la consecuencia que más condiciona el trazado y no es evidente: **una pared
es UNA celda**, así que no hay forma de tener un tabique más fino que la rejilla
que lo dibuja. The Lighthouse empezó con celdas de 32 y los tabiques entre el
pasillo y una tienda medían 32 unidades —un quinto del ancho del pasillo—, con
aspecto de búnker. Hoy la celda mide **8** y el tabique mide 8.

No se baja más porque la cuenta de celdas crece al cuadrado. Y por eso hay **dos
rejillas**, que conviene no confundir:

| | Tamaño | Celdas | Para qué |
|---|---|---|---|
| **Colisión** | 8 unidades | 1264x816 = 1.031.424 | paredes, dibujo, línea de visión |
| **Navegación** | 16 unidades | 632x408 = 257.856 | campo de flujo y niebla del plano |

La de navegación se deriva de la otra al cargar el nivel: una celda suya es
sólida si lo es **cualquiera** de las cuatro finas que la forman. Eso engorda las
paredes 8 unidades a efectos de ruta —la horda pasa algo despegada del muro, que
es lo que uno quiere— y no cierra ningún paso, porque la puerta más estrecha del
mapa mide 64 unidades.

Por qué dos y no una: el campo de flujo se rehace diez veces por segundo y sobre
la rejilla fina costaba 7,8 ms, un pico capaz de comerse un fotograma.

Y aun sobre la basta, **la búsqueda está acotada a 110 celdas** (unas tres
pantallas y media, medidas ANDANDO y no en línea recta). Con el tope, el coste
deja de depender del tamaño del mapa **para siempre**: da igual que mañana sean
mil pantallas. Lo que quede fuera del alcance persigue en línea recta como en
Mérida, y está a tres pantallas, así que a nadie le importa lo que haga.

### Las puertas que abren los jefes

El CC The Lighthouse **no se abre entero**. Se juega en tres anillos alrededor
del punto de partida, y de uno al siguiente solo se pasa por cierres que hay que
ganarse:

| Cierre | Lo abre | Se pasa de |
|---|---|---|
| gris | el jefe del minuto 10 | 33% a 66% del mapa |
| azul | el jefe del minuto 20 | 66% a 100% |
| verde (la calle) | el jefe final | y con él **se acaba la fase** |

Los anillos son **círculos concéntricos de verdad**, por distancia geométrica al
punto de partida, y cubren **todas las celdas, muro incluido**: con la frontera
definida solo sobre el suelo, cualquier pasadizo excavado por dentro del muro la
rodea por detrás y la barrera no separa nada. Pasó, y el mapa entero se recorría
con todos los cierres echados.

Repartirlos **por distancia andando** parece más fino —"lo que tienes a tres
minutos"— y es una trampa: en un laberinto la curva de nivel de la distancia
andando no se parece a un círculo, y el anillo de fuera salía roto en lóbulos que
solo se comunicaban pasando por el centro, que está cerrado. Había que darle una
puerta a cada lóbulo —cuarenta y dos— o tapiarlo, y se tapiaban 57.000 celdas de
golpe. Con círculos, cada anillo es una región conexa por definición.

Los radios no se reparten a ojo: se eligen para que **cada anillo tenga un tercio
de la superficie jugable**. Con el inicio cerca del centro, los tercios en área no
caen ni de lejos en los tercios del radio.

Y cada anillo lleva su **galería circular**: el pasillo que le da la vuelta por
dentro, como la galería de un centro comercial de verdad. Sin ella, cruzar de un
brazo al de enfrente obligaría a pasar por el centro, que está cerrado.

### Nada de paredes a medio rematar

Un tabique que se queda a una celda de tocar con el muro de al lado deja un hueco
de 8 unidades. El jugador ocupa unas 20, así que **no se pasa** — pero se ve el
hueco, se intenta, y no se pasa. No es zona transitable y tampoco es una pared
cerrada; queda raro. Lo cazó Sergio jugando.

Salen solos por todas partes: un tabique mal rematado, una galería que corta un
muro en diagonal y le deja la punta al aire, un túnel de reconexión que pasa
rozando. Ir tapando los casos de uno en uno es una carrera que no se gana, así
que el generador lo resuelve de una vez y geométricamente: **se tapia todo el
suelo por el que no quepa el jugador**.

Formalmente es una apertura morfológica; en claro, una celda de suelo se queda si
forma parte de algún cuadrado de 4×4 celdas (32 unidades) enteramente libre. Si
no, era una rendija y pasa a ser pared. El paso más estrecho que el generador
abre a propósito son 64 unidades —la puerta de una tienda—, así que no hay forma
de que esto se coma nada que sirva.

Se pasa **cuatro veces** —tras amueblar, tras abrir galerías y cierres, y al
final con las puertas abiertas y con ellas cerradas—, porque cada corte nuevo
puede dejar una punta al aire, y porque una hoja de cierre es una pared más: con
la puerta echada puede pinchar contra otra y dejar su propia rendija justo
delante, que es el peor sitio para dejar una. El resumen lo verifica en los dos
estados y tiene que decir 0 y 0.

Y de paso arregla un fallo callado: las comprobaciones de conectividad miran si
dos celdas **se tocan**, que no es lo mismo que si el jugador puede ir de una a
otra. El mapa se daba por bien comunicado a través de rendijas que nadie puede
cruzar. Pasando esto antes de comprobar, las dos cosas vuelven a significar lo
mismo.

Cada cierre lleva además su **vestíbulo** despejado a los dos lados, saltándose la
membrana que separa los anillos: sin él, el suelo de delante de una puerta echada
quedaba pinchado entre la hoja y lo que hubiera enfrente.

### Ocho, ocho y cuatro

Son **8 cierres grises, 8 azules y 4 salidas**, repartidos por ángulo alrededor
del inicio y con una separación mínima entre ellos (se prueban varias, de 150
celdas hacia abajo, y se para en cuanto caben los ocho). Elegirlos por orden de
barrido de la rejilla los amontonaba todos en la mitad norte.

Una cosa que NO es un fallo: con el inicio descentrado, el círculo exterior corta
el borde del mapa y el anillo de fuera queda partido en dos lóbulos por pura
geometría — no hay forma de ir de uno al otro sin cruzar el anillo de en medio.
No se tapian (eran 109.000 celdas): se entra en cada uno por sus propias puertas,
y con ocho repartidas por ángulo siempre les tocan varias.

El generador comprueba e imprime el recorrido tramo a tramo:

```
  al empezar        : 33.3% del mapa, 0/4 salidas
  tras el jefe 10min: 66.5% del mapa, 0/4 salidas
  tras el jefe 20min: 100.0% del mapa, 4/4 salidas
```

Un tramo que no crezca respecto al anterior es un cierre que no abre nada, y eso
no se ve jugando hasta que alguien se pasa media hora dando vueltas.

**En un recinto con puertas se gana MATANDO AL JEFE FINAL**, no agotando el
reloj. Ahí la partida es salir del centro comercial, las puertas de la calle las
abre él, y terminar por tiempo con el jefe vivo sería ganar habiéndose quedado
dentro. En una calzada como Mérida no cambia nada: se sigue ganando por reloj.

### Los ficheros van comprimidos

A este tamaño no queda más remedio, y las dos compresiones son distintas:

- **El módulo de datos**, por tramos (`codificacion: 'tramos'`): el símbolo y
  detrás cuántas celdas iguales van seguidas. `"#4.3#"` son cuatro paredes, tres
  de pasillo y una pared. De 1 MB a 130 KB, y es un fichero que se regenera cada
  vez que se toca el trazado. Lo descomprime `iniciar` en `rejillaMapa.js`.
- **El `.tmj`**, en base64 + zlib, que es el formato propio de Tiled para mapas
  grandes. En claro son 7,2 MB; comprimido, 80 KB. Tiled lo abre igual sin tocar
  nada.

## El plano del nivel

Un recinto trae plano, y es otra cosa que el radar de Mérida: se abre con **Bloq
Mayús** o con el botón **Y**, congela la partida y se aleja y acerca con **+** y
**-** (o con los gatillos de arriba del mando). Se cierra con **ESC** o con **B**,
que es lo que se intenta por instinto, además de con la tecla que lo abrió.

El aumento de entrada **se elige solo**: el mayor con el que quepa el centro
comercial entero en el panel. Es lo primero que hay que ver en un sitio de 509
pantallas: dónde estás dentro del conjunto.

Los aumentos por debajo de 1 usan **lienzos reducidos aparte**, no el grande
encogido: un tabique mide una celda, o sea un píxel, y al reducir se perdería una
fila de cada dos — el plano saldría con paredes agujereadas que no existen. En los
reducidos, una celda es pared si lo es cualquiera de las que la forman, así que
los tabiques sobreviven engordados, que en un plano es lo correcto.

El panel va **translúcido** (57%): es una consulta, y ver la horda moverse por
debajo mientras se mira dice bastante sin tener que cerrarlo.

Lo importante es lo que NO enseña. El plano arranca **en blanco** y se descubre
andando: `RejillaMapa.visto` marca un disco de 19 celdas de navegación alrededor
de cada jugador a cada paso. Lo único visible desde el primer segundo son **las
puertas, y solo como un icono**, sin nada alrededor: grises, azules y verdes,
cada juego de su color. Es la diferencia entre enseñar el mapa y dar una
referencia: sabes que hay una salida en el muro norte y no sabes cómo se llega,
que es lo que tiene que sentir quien está dentro.

Una puerta **abierta** se pinta hueca, solo el marco. A partir del minuto diez,
media lectura del plano es distinguir "ahí hay un cierre" de "ese ya lo abriste".

Lo explorado se olvida al empezar cada partida — heredarlo de la anterior le
quitaría al nivel justo lo que lo hace un laberinto.


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

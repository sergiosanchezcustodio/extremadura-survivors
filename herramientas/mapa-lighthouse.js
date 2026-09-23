// GENERADOR Y CONVERSOR DEL MAPA DEL CC THE LIGHTHOUSE.
//
// Se ejecuta EN FRÍO, nunca desde el juego. Hace dos cosas, en dos sentidos:
//
//   node herramientas/mapa-lighthouse.js generar [semilla]
//       Traza un centro comercial entero —pasillos, tiendas grandes, tiendas
//       pequeñas, zona de ocio y salidas— y escribe TRES ficheros:
//         resources/mapas/lighthouse.tmj      para abrir en Tiled y retocar
//         resources/mapas/lighthouse-tiles.png el tileset de colores planos
//         js/datos/niveles/lighthouse-mapa.js  los datos que lee el juego
//
//   node herramientas/mapa-lighthouse.js importar
//       Lee el .tmj —ya retocado a mano en Tiled— y REESCRIBE solo el módulo
//       de datos. Es el camino de vuelta: lo que Sergio mueve en Tiled entra
//       en el juego sin pasar por aquí.
//
// Tiled NO es una dependencia del juego: no se carga en tiempo de ejecución ni
// aparece en package.json (no hay). Es un editor externo que produce un JSON, y
// este script lo traduce a `datos/`, que sigue siendo datos puros.

// Módulos ES, como todo el proyecto (package.json declara "type": "module").
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- La rejilla ---------------------------------------------------------------
//
// EL GROSOR DE LA PARED ES EL TAMAÑO DE LA CELDA, y esa es la razón de que la
// celda sea pequeña. Una pared es UNA celda: no hay forma de tener un muro más
// fino que la rejilla que lo dibuja. Con la celda de 32 que tuvo esto al
// principio, los tabiques entre el pasillo y una tienda medían 32 unidades —un
// quinto de lo que mide el pasillo entero— y el centro comercial parecía un
// búnker. A 8, el tabique mide 8: un 75% más fino, y ya se lee como un
// escaparate y no como un muro de carga.
//
// No se baja más porque la cuenta de celdas crece al cuadrado: a 8 el mapa son
// 129.024 celdas y el campo de flujo sigue costando décimas de milisegundo; a 4
// serían medio millón y la búsqueda en anchura dejaría de ser gratis.
//
// El MUNDO no cambia de tamaño: 448x288 celdas de 8 son los mismos 3584x2304
// unidades ≈ 64 pantallas de 480x270 que había con 112x72 celdas de 32.
// CELDA = 4 DESDE EL 21/09/2026. Sergio pidió todas las paredes y muros un 50%
// más estrechos, y como una pared es una celda (ver docs/anadir-un-nivel.md,
// "El grosor de la pared es el tamaño de la celda"), la única forma honesta de
// hacerlo es partir la celda por la mitad: un tabique mide ahora 4 unidades.
// El mapa son 2528x1632 = 4,1 millones de celdas; el generador tarda unos
// segundos y el juego carga el nivel en décimas. La rejilla de NAVEGACIÓN del
// motor sigue midiendo 16 unidades (ahora 4x4 celdas), así que el campo de
// flujo no se entera.
const CELDA = 4;

// Todo el trazado se piensa en "módulos" de 32 unidades —que es como se pensó
// cuando la celda medía eso— y se expresa en celdas multiplicando por esto. Así
// los números de abajo siguen leyéndose igual (un pasillo de 3 o 4 módulos) y
// cambiar la finura de la rejilla es cambiar una constante.
const F = 8;                      // celdas por módulo (32 / CELDA)

// EL TAMAÑO, EN MÓDULOS. 316x204 módulos son 10112x6528 unidades: 509 pantallas
// de 480x270, ocho veces la superficie que tenía el primer trazado (64). Es lo
// que pidió Sergio, y es una sola línea si hay que volver atrás — el resto del
// generador no tiene ni un número que dependa del tamaño del mapa.
const ANCHO = 316 * F;
const ALTO = 204 * F;

// Lo que mide de grueso un tabique: UNA celda, que es el mínimo posible. La
// fachada del edificio va aparte y es más gorda, que para eso es la fachada.
const TABIQUE = 1;
const FACHADA = 3;                // 12 unidades: la mitad de lo que era

// CELDAS DE CARA de una pared o una estantería en el juego: lo que dice
// `alturasMapa` en datos/niveles/lighthouse.js, y TIENE QUE COINCIDIR. Esa
// franja no se pisa (`RejillaMapa.pie`), y un generador que no lo supiera
// daría por transitables pasillos que en el juego están tapados por la cara
// del muro de arriba. Se usa para ensanchar galerías y túneles, y para que las
// comprobaciones de conectividad y de rendijas miren el mapa como lo pisa el
// jugador. 14 celdas son 56 unidades: el alto de los paneles de Sergio a su
// tamaño (213 px = 53 unidades), redondeado a celdas.
const CARA = 14;
const CARA_MOSTRADOR = 4;
const CARA_PUERTA = 6;

// CUÁNTO DE ESA CARA NO SE PISA. Tiene que coincidir con `pieMapa` en
// datos/niveles/lighthouse.js (que no lo declara, o sea: la cara entera). Si
// aquí se midiera de menos, el generador daría por transitables pasillos que
// en el juego están tapados por la cara del muro de arriba; de más, tapiaría
// pasillos por los que sí se pasa.
const CARA_SOLIDA = CARA;

// El alfabeto del mapa. El juego solo distingue PARED de lo demás; los otros
// símbolos son el TIPO de suelo, y de momento solo sirven para pintarlo de un
// color distinto en el prototipo (y para saber dónde está cada cosa al mirar el
// fichero, que no es poco con 8064 celdas).
const PARED      = '#';
const PASILLO    = '.';
const HIPER      = 'a';   // pasillos de alimentos, estilo Carrefour/Mercadona
const IKEA       = 'b';   // el recorrido largo del que no se sale
const TIENDA     = 'c';   // habitación simple (ya no se emite: ver TIENDAS)
const OCIO       = 'd';   // cines, bolera, restaurantes
const PLAZA      = 'f';   // food trucks y zona central

// LAS TIENDAS PEQUEÑAS, CADA UNA DE LO SUYO (Sergio, 21/09/2026). Antes eran
// todas `c`, "tienda", y daba igual: el suelo era el mismo. Ahora cada tipo
// tiene SUS paredes y SUS estanterías dibujadas —ropa con maniquíes, juguetes
// con ositos— y no se mezclan dentro de un mismo local, así que el mapa tiene
// que decir de qué es cada tienda. Son siete símbolos nuevos, AL FINAL del
// tileset para no mover los gids de Tiled. `c` se queda en la leyenda por si
// algún mapa viejo lo trae, pero el generador ya no lo escribe.
const ROPA       = 'r';
const JUGUETES   = 'j';
const LIBROS     = 'l';
const REGALOS    = 'g';
const DROGUERIA  = 'q';
const TECNOLOGIA = 't';
const FRUTERIA   = 'u';
// OCHO TIPOS DE TIENDA, que son los ocho juegos de estanterías que dibujó
// Sergio: supermercado, regalos, tecnología, alimentos, droguería, juguetes,
// ropa y libros. Cada uno con SUS estanterías, SU pared de dentro y SU
// escaparate —uno de los ocho ventanales, sin repetir— (ver paredesMapa y
// escaparatesMapa en lighthouse.js). Fueron seis entre el 21 y el 22/09/2026,
// hasta que Sergio pidió los ocho ventanales, uno por tipo.
//
// La mueblería y el ocio siguen fuera: son otra cosa y no tienen ni
// estanterías ni ventanal propios. Se quedan en la leyenda por si un mapa
// viejo los trae. `u` es ALIMENTOS (las estanterías de frutería son comida).
const TIENDAS = [JUGUETES, REGALOS, DROGUERIA, TECNOLOGIA, FRUTERIA, ROPA, LIBROS];

// EL TECHO: una tienda CERRADA no enseña el interior, enseña su techo. Es
// sólido —no se entra, no se ve, no aparece nadie dentro— y no tiene cara.
// Aproximadamente un tercio de las tiendas va cerrado; la mayoría queda accesible.
const TECHO = 'T';
const CERRADAS = 0.35;

// EL PASILLO DE CADA ANILLO (Sergio, 22/09/2026): los pasillos del anillo 1 y
// del 2 llevan su propio suelo —suelo2.png y suelo3.png; el 1 es el de
// siempre, `.`—, y ese suelo nunca entra en una tienda. El trazado se hace
// entero con `.` y al final, con los anillos ya repartidos, cada celda de
// pasillo se cambia por el símbolo de su anillo. Los tres se llaman `pasillo`
// en la leyenda, y el motor los trata igual salvo para elegir la textura.
const PASILLO_1 = ',';
const PASILLO_2 = ';';

// LAS PUERTAS, que son lo que le da forma a la partida. Están CERRADAS —son
// pared— hasta que cae el jefe que las abre, y hasta entonces el centro
// comercial es más pequeño de lo que parece:
//
//   GRIS   los cierres del anillo interior. Los abre el jefe del minuto 10.
//   AZUL   los del anillo intermedio.       Los abre el jefe del minuto 20.
//   SALIDA las de la fachada, verdes.       Las abre el jefe final, y con él se
//          acaba la fase: son la puerta de la calle.
const PUERTA_GRIS = 'G';
const PUERTA_AZUL = 'Z';
const SALIDA      = 'S';

// EL MOBILIARIO. Sólido como una pared para la simulación —no se pasa por
// encima de una estantería—, pero con símbolo propio para que se DIBUJE como lo
// que es: una estantería con género y un mostrador con su tablero, no un trozo
// de muro de carga en medio de la tienda. Lo pidió Sergio para empezar el
// escenario del nivel 2: cada tipo de tienda con su suelo, estanterías, y
// mostradores —uno en las tiendas pequeñas, dos o más en las grandes—.
const ESTANTERIA = 'E';
const MOSTRADOR  = 'M';
// Lo que mide de grueso una estantería: DOS celdas (16 unidades). Era un módulo
// entero, y con las estanterías de Sergio sobraba: lo que se ve de una
// estantería es su FRENTE —tres celdas de cara con las baldas y el género,
// ver sueloRejilla.js— y la tapa es solo una chapa oscura; a un módulo de
// grueso la chapa era más grande que el frente y la estantería parecía un
// arcón. Dos celdas dejan una tapa fina y el frente manda.
//
// Y TODAS TUMBADAS (de este a oeste), en el híper y en las tiendas. Un lineal
// de pie enseñaría solo su tapa a lo largo y el frente en una celda del
// extremo: una raya negra. Tumbado, el frente entero da al sur, que es donde
// mira la cámara.
const GRUESO_ESTANTE = 2;         // 8 unidades


// Lo que cuenta como muro para la excavadora y para las comprobaciones. El
// mobiliario va aquí: un túnel de reconexión que pase por una estantería se la
// lleva por delante igual que a un tabique.
const esMuro = (ch) => ch === PARED || ch === ESTANTERIA || ch === MOSTRADOR || ch === TECHO;

// El orden es el del tileset: el gid de Tiled es este índice + 1. Lo nuevo va
// AL FINAL para que los gids de lo que ya estaba no se muevan.
const ORDEN = [PARED, PASILLO, HIPER, IKEA, TIENDA, OCIO, PLAZA, SALIDA,
               PUERTA_GRIS, PUERTA_AZUL, ESTANTERIA, MOSTRADOR,
               ROPA, JUGUETES, LIBROS, REGALOS, DROGUERIA, TECNOLOGIA, FRUTERIA, TECHO,
               PASILLO_1, PASILLO_2];
const COLORES = {
  [PARED]:   [0x3a, 0x3f, 0x4a],
  [PASILLO]: [0xd8, 0xd4, 0xcc],
  [HIPER]:   [0xbd, 0xd6, 0xc0],
  [IKEA]:    [0xe6, 0xdc, 0xa8],
  [TIENDA]:  [0xd6, 0xc6, 0xd8],
  [OCIO]:    [0xc6, 0xbe, 0xe4],
  [PLAZA]:   [0xe8, 0xcf, 0xb0],
  [SALIDA]:      [0x66, 0xd2, 0x78],
  [PUERTA_GRIS]: [0x9b, 0xa2, 0xad],
  [PUERTA_AZUL]: [0x4f, 0x8f, 0xd8],
  [ESTANTERIA]:  [0x8a, 0x5a, 0x3a],
  [MOSTRADOR]:   [0xb8, 0x86, 0x4e],
  // Las siete tiendas, en tonos de la `c` de siempre para que en Tiled sigan
  // leyéndose como "tienda" y a la vez se distingan.
  [ROPA]:        [0xd6, 0xc6, 0xd8],
  [JUGUETES]:    [0xe0, 0xc4, 0xc4],
  [LIBROS]:      [0xc8, 0xc0, 0xd8],
  [REGALOS]:     [0xd8, 0xc8, 0xc0],
  [DROGUERIA]:   [0xd0, 0xd0, 0xd8],
  [TECNOLOGIA]:  [0xc0, 0xc8, 0xd0],
  [FRUTERIA]:    [0xcc, 0xd8, 0xc0],
  [TECHO]:       [0x55, 0x58, 0x60],
  [PASILLO_1]:   [0xd0, 0xd4, 0xd8],
  [PASILLO_2]:   [0xc8, 0xd4, 0xcc]
};

// --- Azar reproducible --------------------------------------------------------
// Misma semilla, mismo centro comercial. Importa porque el mapa se regenera al
// tocar los parámetros y no queremos que cambie TODO cada vez sin querer.
function crearRng(semilla) {
  let s = semilla >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

// --- El trazado ---------------------------------------------------------------
function crearRejilla() {
  const g = [];
  for (let y = 0; y < ALTO; y++) g.push(new Array(ANCHO).fill(PARED));
  return g;
}

const dentro = (x, y) => x >= 0 && y >= 0 && x < ANCHO && y < ALTO;

function rellenar(g, x0, y0, w, h, ch) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) if (dentro(x, y)) g[y][x] = ch;
  }
}

// Partición binaria del espacio: se corta el rectángulo en dos una y otra vez, y
// POR CADA CORTE se abre un pasillo. Así la red de pasillos nace conectada por
// construcción —no hay que unir nada después— y cada hoja que queda es el hueco
// donde cabe un local.
//
// Los cortes siguen una retícula ortogonal con ligera variación alrededor del centro.
// Así las galerías quedan rectas y los bloques conservan plantas comerciales claras.
function partir(g, x0, y0, w, h, profundidad, rng, hojas) {
  const MIN = 14 * F;                 // por debajo de esto ya no cabe local + pasillo
  if (profundidad === 0 || (w < MIN * 2 + 6 * F && h < MIN * 2 + 6 * F)) {
    hojas.push({ x: x0, y: y0, w, h });
    return;
  }

  // PARAR ANTES DE TIEMPO, A VECES. Los bloques grandes dejan espacio para
  // supermercados y tiendas con pasillos interiores transitables.
  const area = w * h;
  if (area >= 850 * F * F && area <= 1550 * F * F && rng() < 0.65) {
    hojas.push({ x: x0, y: y0, w, h });
    return;
  }

  // Se corta por el lado LARGO salvo que ese lado ya no dé para dos locales; en
  // ese caso se corta por el otro, que es el único que queda. Que los dos sean
  // demasiado cortos es imposible aquí: eso ya salió por arriba como hoja.
  let porAncho = w >= h;
  if (porAncho && w < MIN * 2 + 6 * F) porAncho = false;
  else if (!porAncho && h < MIN * 2 + 6 * F) porAncho = true;
  // LAS GALERÍAS PRINCIPALES SON ANCHAS y las calles secundarias mantienen
  // suficiente espacio libre tras descontar las caras altas de las fachadas.
  const longitudCorte = porAncho ? w : h;
  const disponible = longitudCorte - 2 * MIN;
  const anchoMinimo = Math.min(5 * F, disponible);
  const anchoObjetivo = profundidad >= 7 ? 10 * F : profundidad >= 5 ? 8 * F : 6 * F;
  const anchoMaximo = Math.min(anchoObjetivo, Math.floor(disponible * 0.9));
  const anchoPasillo = rnd(rng, anchoMinimo, anchoMaximo);

  if (porAncho) {
    // El corte queda cerca del centro del bloque para mantener tramos rectos y locales amplios.
    const tramo = w - 2 * MIN - anchoPasillo;
    const corte = x0 + MIN + Math.floor(tramo * (0.46 + rng() * 0.08));
    rellenar(g, corte, y0, anchoPasillo, h, PASILLO);
    partir(g, x0, y0, corte - x0, h, profundidad - 1, rng, hojas);
    const dcha = x0 + w - (corte + anchoPasillo);
    partir(g, corte + anchoPasillo, y0, dcha, h, profundidad - 1, rng, hojas);
  } else {
    const tramo = h - 2 * MIN - anchoPasillo;
    const corte = y0 + MIN + Math.floor(tramo * (0.46 + rng() * 0.08));
    rellenar(g, x0, corte, w, anchoPasillo, PASILLO);
    partir(g, x0, y0, w, corte - y0, profundidad - 1, rng, hojas);
    const abajo = y0 + h - (corte + anchoPasillo);
    partir(g, x0, corte + anchoPasillo, w, abajo, profundidad - 1, rng, hojas);
  }
}

// Qué local cabe en cada hoja. Se decide por SUPERFICIE, que es como funciona un
// centro comercial: el IKEA está donde hay sitio para el IKEA, no al revés.
function tipoDeLocal(w, h, rng) {
  const area = (w * h) / (F * F);      // en módulos, para que los números se lean
  // Los locales grandes son supermercados; el resto, una de las cinco
  // tiendas, sorteada. Ni mueblería ni ocio: ver TIENDAS.
  if (area >= 500 && rng() < 0.5) return HIPER;
  const seis = [HIPER].concat(TIENDAS);
  return seis[Math.floor(rng() * seis.length)];
}

// El local ocupa la hoja menos un anillo de pared. El anillo es lo que separa
// una tienda de la de al lado y del pasillo: sin él, todo sería una nave diáfana.
function carvarLocal(g, hoja, rng, locales) {
  const x0 = hoja.x + TABIQUE, y0 = hoja.y + TABIQUE;
  const w = hoja.w - TABIQUE * 2, h = hoja.h - TABIQUE * 2;
  if (w < 4 * F || h < 4 * F) return;         // hueco residual: se queda macizo

  const tipo = tipoDeLocal(w, h, rng);
  rellenar(g, x0, y0, w, h, tipo);
  // Cerrada o abierta se sortea AQUÍ, con el tipo, para que el resto del
  // trazado de la misma semilla no cambie por ello.
  locales.push({ x: x0, y: y0, w, h, tipo, cerrada: rng() < CERRADAS, lineales: 0 });
}

// Cerrar una tienda: el interior pasa a TECHO. Sus paredes se quedan —la
// cara de fuera sigue siendo el escaparate, cerrado (ver escaparatesMapa)— y
// por dentro no hay nada que ver ni dónde estar.
function cerrarLocal(g, local) {
  rellenar(g, local.x, local.y, local.w, local.h, TECHO);
  local.cerrada = true;
}

// Las celdas de los locales ABIERTOS, con su tabique: por ahí no pasan ni
// galerías ni túneles, para que una tienda siga siendo un rectángulo con sus
// cuatro paredes enteras. Los cerrados sí se pueden atravesar: un techo con un
// pasillo por medio son dos techos, y siguen siendo rectángulos.
function mascaraAbiertos(locales) {
  const m = new Uint8Array(ANCHO * ALTO);
  for (const l of locales) {
    if (l.cerrada) continue;
    for (let y = l.y - TABIQUE; y < l.y + l.h + TABIQUE; y++) {
      for (let x = l.x - TABIQUE; x < l.x + l.w + TABIQUE; x++) {
        if (dentro(x, y)) m[y * ANCHO + x] = 1;
      }
    }
  }
  return m;
}

// El borde de un techo que toca suelo se vuelve PARED: un túnel o una galería
// que cruza una tienda cerrada deja a cada lado un canto de techo, y un techo
// necesita su pared debajo para leerse como edificio y no como una losa.
function amurallarTechos(g) {
  const cambios = [];
  for (let y = 1; y < ALTO - 1; y++) {
    for (let x = 1; x < ANCHO - 1; x++) {
      if (g[y][x] !== TECHO) continue;
      if (!esMuro(g[y - 1][x]) || !esMuro(g[y + 1][x]) || !esMuro(g[y][x - 1]) || !esMuro(g[y][x + 1])) {
        cambios.push([x, y]);
      }
    }
  }
  for (const [x, y] of cambios) g[y][x] = PARED;
  return cambios.length;
}

// --- Mobiliario ---------------------------------------------------------------
//
// Un mueble se coloca solo si TODO su rectángulo, más un anillo de holgura
// alrededor, es suelo del local. La holgura es lo que garantiza que entre dos
// muebles —o entre un mueble y la pared— queda paso de sobra: HOLGURA celdas
// (32 unidades) es por donde ya cabe el jugador, y aquí se deja el doble.
const AIRE = 2 * F;

function cabeMueble(g, local, bx, by, bw, bh) {
  for (let cy = by - AIRE; cy < by + bh + AIRE; cy++) {
    for (let cx = bx - AIRE; cx < bx + bw + AIRE; cx++) {
      if (!dentro(cx, cy)) return false;
      const ch = g[cy][cx];
      const propio = cx >= bx && cx < bx + bw && cy >= by && cy < by + bh;
      // El mueble en sí, sobre suelo del local. Su holgura, sobre suelo del
      // local o contra un muro —un mostrador pegado a la pared del fondo está
      // bien—, pero nunca sobre otro mueble ni sobre el hueco de una puerta,
      // que las puertas ya están abiertas cuando se amuebla.
      if (propio ? ch !== local.tipo : (ch !== local.tipo && ch !== PARED)) return false;
    }
  }
  return true;
}

// Intenta poner un mueble de bw x bh en un sitio al azar de `zona` —el local
// entero o una franja de él—, unas cuantas veces. Devuelve si lo consiguió. Se
// sortea SIEMPRE el mismo número de veces aunque acierte a la primera, para que
// meter un mueble más no cambie el resto del trazado de la misma semilla.
function ponerMueble(g, zona, bw, bh, simbolo, rng, margen = AIRE) {
  const { x, y, w, h } = zona;
  const INTENTOS = 10;
  let puesto = false;
  for (let i = 0; i < INTENTOS; i++) {
    const bx = rnd(rng, x + margen, x + w - bw - margen);
    const by = rnd(rng, y + margen, y + h - bh - margen);
    if (puesto || bx < x + margen || by < y + margen) continue;
    if (!cabeMueble(g, zona, bx, by, bw, bh)) continue;
    rellenar(g, bx, by, bw, bh, simbolo);
    puesto = true;
  }
  return puesto;
}

// MOSTRADORES: uno en las tiendas pequeñas, dos o más en las grandes. El corte
// entre pequeña y grande es el mismo que el de las puertas (200 módulos): una
// tienda con dos bocas tiene dos cajas. De ahí para arriba, uno más por cada
// 400 módulos, que en el hipermercado grande son cuatro o cinco.
//
// Tumbado o de pie según la forma del local: un mostrador atravesado en una
// tienda alargada corta el paso más de lo que amuebla.
//
// `zona` es dónde se ponen (el local entero, o su franja de cajas) y `area` en
// módulos es lo que decide cuántos, que no siempre es el área de la zona.
function ponerMostradores(g, zona, area, rng, margen = AIRE) {
  const cuantos = area >= 200 ? 2 + Math.floor((area - 200) / 400) : 1;
  const tumbado = zona.w >= zona.h;
  let puestos = 0;
  for (let i = 0; i < cuantos; i++) {
    const bw = tumbado ? 3 * F : F, bh = tumbado ? F : 3 * F;
    if (ponerMueble(g, zona, bw, bh, MOSTRADOR, rng, margen)) puestos++;
  }
  return puestos;
}

// Lo de dentro de cada local. AQUÍ ES DONDE SE DECIDE CUÁNTO ESTORBA EL MAPA, y
// el encargo era no abusar: las estanterías dejan siempre pasillo a los lados y
// ninguna cierra el local de lado a lado.
function amueblar(g, local, rng) {
  const { x, y, w, h, tipo } = local;
  if (tipo === PLAZA || local.cerrada) return;

  // TODAS LAS TIENDAS IGUALES, y sencillas (Sergio, 21/09/2026): lo que cambia
  // de una a otra es el dibujo de las paredes y de las estanterías, no el
  // trazado. Dos cosas y nada más:
  //
  //   1. ESTANTERÍAS PEGADAS A LAS PAREDES NORTE Y SUR, dejando libres las
  //      puertas y un margen a cada lado de ellas. "Dentro de las tiendas no
  //      deben existir paredes sin nada; al menos el 50% de la pared deben
  //      ser estanterías": las dos paredes largas forradas casi enteras dan
  //      ese 50%. LAS PAREDES VERTICALES NO LLEVAN (Sergio, tercera pasada):
  //      en 3/4 una estantería pegada a una pared vertical solo enseña la
  //      tapa, una tira marrón de arriba abajo, y no se lee como nada.
  //   2. FILAS INTERIORES HORIZONTALES, y solo horizontales, por lo mismo:
  //      el frente dibujado tiene que dar a la cámara.
  //
  // Las medidas salen de las caras: una estantería enseña CARA celdas de
  // frente hacia el sur, y el paso entre dos filas tiene que quedar DESPUÉS de
  // esa cara. Filas cada 4 módulos: 2 de estantería, 14 de cara y 16 de
  // pasillo (64 unidades).
  const G = GRUESO_ESTANTE;

  // ¿Hay puerta en esta celda del contorno (el tabique)? Las puertas se abren
  // antes de amueblar, y su hueco lleva el suelo de la tienda (ver
  // `abrirPuerta`): lo que las distingue del tabique es que no son muro.
  const puertaEn = (cx, cy) => dentro(cx, cy) && !esMuro(g[cy][cx]);
  // Margen que se deja libre a cada lado de una puerta, en celdas.
  const M = F;

  // 1. Las paredes norte y sur forradas, en tramos alineados a panel (4
  //    celdas) para que ningún tramo empiece a medio dibujo. Se saltan las
  //    celdas frente a una puerta (y M a cada lado), y se dejan libres las
  //    esquinas: dos módulos a cada lado, que es la vuelta que dejan también
  //    las filas.
  const libreH = (cx, cyTabique) => {
    for (let k = -M; k <= M; k++) if (puertaEn(cx + k, cyTabique)) return false;
    return true;
  };
  // NADA PEGADO A UN ESCAPARATE (Sergio, 22/09/2026). La pared que da al
  // pasillo es un ventanal de cristal, y una estantería delante lo tapa y
  // encima se ve a través de él. Así que una pared solo se forra si al otro
  // lado NO hay pasillo. Se mira tres celdas más allá del tabique: si en ese
  // margen aparece pasillo, esa pared es escaparate.
  const daAlPasillo = (cx, cyTabique, dir) => {
    for (let k = 0; k <= 3; k++) {
      const cy = cyTabique + dir * k;
      if (!dentro(cx, cy)) return true;              // la fachada, como si lo fuera
      if (g[cy][cx] === PASILLO) return true;
    }
    return false;
  };
  const x0 = Math.ceil((x + 2 * F) / 4) * 4, x1 = Math.floor((x + w - 2 * F) / 4) * 4;
  for (let cx = x0; cx < x1; cx++) {
    if (libreH(cx, y - 1) && !daAlPasillo(cx, y - 1, -1)) {
      for (let k = 0; k < G; k++) g[y + k][cx] = ESTANTERIA;
    }
    if (libreH(cx, y + h) && !daAlPasillo(cx, y + h, 1)) {
      for (let k = 0; k < G; k++) g[y + h - 1 - k][cx] = ESTANTERIA;
    }
  }

  // 2. Las filas interiores. Dejan 4 módulos desde la pared norte (la cara de
  //    la estantería pegada a ella mide 14 celdas, y 16 más de paso) y 4 hasta
  //    la sur (su propia cara más el paso), y 2 módulos a este y oeste para
  //    dar la vuelta.
  // Y los pasillos de dentro, otro 50%: de 4 módulos de paso entre lineales a
  // 5 (ver `anchoPasillo`).
  let filas = 0;
  for (let cy = y + 4 * F; cy + G <= y + h - 4 * F; cy += 5 * F) {
    for (let k = 0; k < G; k++) for (let cx = x0; cx < x1; cx++) g[cy + k][cx] = ESTANTERIA;
    filas++;
  }
  local.lineales = filas;
}

// La puerta: se taladra desde el borde del local hacia fuera hasta topar con
// pasillo. Como el local está metido una celda dentro de su hoja y los pasillos
// corren por los bordes de las hojas, el túnel nunca es largo.
// Lo ancha que es una puerta: dos módulos, 64 unidades. Con cuatro jugadores y
// una horda detrás, un hueco más estrecho es un tapón.
const PUERTA = 2 * F;

// La puerta: se taladra desde el borde del local hacia fuera hasta topar con
// pasillo. Como el local está separado de su hoja por un tabique de una celda,
// el túnel es casi siempre esa única celda.
function abrirPuerta(g, local, rng) {
  const lados = [0, 1, 2, 3];
  // Barajado con la misma semilla, para no depender del orden de `sort`.
  for (let i = lados.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lados[i], lados[j]] = [lados[j], lados[i]];
  }

  let abiertas = 0;
  const quiere = (local.w * local.h) / (F * F) >= 200 ? 2 : 1;   // los grandes, dos bocas
  // Hasta dónde se mira buscando pasillo. Un tabique y algo de margen: más allá
  // de eso, lo que hay al otro lado es otra tienda, no un pasillo.
  const ALCANCE = TABIQUE + F;

  for (const lado of lados) {
    if (abiertas >= quiere) break;

    // Punto de partida en el borde del local y hacia dónde se taladra. `px,py`
    // es la esquina del hueco y `ox,oy` la dirección en la que se ensancha.
    // EN UNA PARED VERTICAL LA PUERTA ES MÁS LARGA: el tramo de muro que queda
    // encima del hueco enseña su cara hacia abajo, y esa cara —CARA celdas de
    // pie que no se pisan— cae DENTRO del hueco. Con PUERTA a secas quedaban
    // dos celdas de paso: la tienda parecía tener puerta y no la tenía.
    const largo = (lado === 2 || lado === 3) ? PUERTA + CARA : PUERTA;
    let px, py, dx = 0, dy = 0, ox = 0, oy = 0;
    if (lado === 0) {
      px = rnd(rng, local.x, local.x + local.w - PUERTA); py = local.y - 1; dy = -1; ox = 1;
    } else if (lado === 1) {
      px = rnd(rng, local.x, local.x + local.w - PUERTA); py = local.y + local.h; dy = 1; ox = 1;
    } else if (lado === 2) {
      px = local.x - 1; py = rnd(rng, local.y, local.y + local.h - largo); dx = -1; oy = 1;
    } else {
      px = local.x + local.w; py = rnd(rng, local.y, local.y + local.h - largo); dx = 1; oy = 1;
    }

    // ¿Hay pasillo ahí detrás? Si no, ese lado da a otra tienda o a la fachada,
    // y una puerta que comunica dos tiendas no es una puerta de centro
    // comercial.
    let hay = false;
    for (let k = 0; k <= ALCANCE && !hay; k++) {
      const tx = px + dx * k, ty = py + dy * k;
      if (!dentro(tx, ty)) break;
      if (g[ty][tx] === PASILLO) hay = true;
    }
    if (!hay) continue;

    // Y se taladra el hueco entero, de PUERTA celdas de ancho, hasta el pasillo.
    // Qué suelo se ve por el hueco lo decide después `uniformarBocas`.
    for (let k = 0; k <= ALCANCE; k++) {
      const tx = px + dx * k, ty = py + dy * k;
      if (!dentro(tx, ty)) break;
      let tocado = false;
      for (let w = 0; w < largo; w++) {
        const ax = tx + ox * w, ay = ty + oy * w;
        if (!dentro(ax, ay)) continue;
        if (g[ay][ax] === PASILLO) { tocado = true; continue; }
        g[ay][ax] = PASILLO;
      }
      if (tocado) break;          // ya se ha llegado al pasillo: no seguir
    }
    abiertas++;
  }
  return abiertas;
}

// --- Huecos por los que no se pasa -------------------------------------------
//
// EL PROBLEMA, que encontró Sergio jugando: un tabique que se queda a una celda
// de tocar con el muro de al lado. Ocho unidades de hueco; el jugador mide veinte
// y no cabe. No es zona transitable, pero tampoco es una pared cerrada: se ve el
// hueco, se intenta pasar y no se pasa. Queda raro, y con razón.
//
// Salen solos por todas partes: un tabique mal rematado, una galería que corta un
// muro en diagonal y le deja la punta al aire, un túnel de reconexión que pasa
// rozando. Ir tapando los casos de uno en uno es una carrera que no se gana.
//
// LA SOLUCIÓN ES GEOMÉTRICA Y DE UNA VEZ: se tapia todo el suelo por el que no
// quepa el jugador. Formalmente es una apertura morfológica —lo que no sobreviva
// a encoger y volver a crecer con un cuadrado de HOLGURA, se rellena—, y dicho en
// claro: una celda de suelo se queda si forma parte de algún cuadrado de HOLGURA
// celdas enteramente libre. Si no, era una rendija y pasa a ser pared.
//
// HOLGURA = 4 son 32 unidades. El jugador ocupa unas 20, así que por debajo de
// eso no se pasa de todas formas; y el paso más estrecho que el generador abre a
// propósito son 64 (la puerta de una tienda), así que no hay forma de que esto se
// coma nada que sirva para algo.
//
// Y de paso arregla un fallo callado: las comprobaciones de conectividad miran si
// dos celdas se tocan, que NO es lo mismo que si el jugador puede ir de una a
// otra. El mapa se daba por bien comunicado a través de rendijas que nadie puede
// cruzar. Pasando esto ANTES de comprobar, las dos cosas vuelven a significar lo
// mismo.
const HOLGURA = 8;

// LA FRANJA DE PIE, como la calcula el motor (`_pieDe` en
// sistemas/rejillaMapa.js): una celda de suelo es pie si, mirando hacia
// arriba hasta CARA celdas, lo primero sólido que hay es algo cuya cara llega
// hasta ella. Esa franja no se pisa en el juego, así que aquí cuenta como
// sólida para todo lo que mide si se pasa: rendijas, conectividad y el sitio
// de partida. No para excavar: un túnel atraviesa lo que haga falta.
function marcarPie(g, abiertas) {
  const n = ANCHO * ALTO;
  const pie = new Uint8Array(n);
  const alturaDe = (ch) => {
    if (ch === TECHO) return 0;           // un techo no tiene cara
    // Ver CARA_SOLIDA: hoy nada de la cara estorba, así que esto da 0 siempre
    // y `pie` sale vacío. Queda escrito para el día que algo vuelva a tapar.
    if (ch === PARED || ch === ESTANTERIA) return Math.min(CARA, CARA_SOLIDA);
    if (ch === MOSTRADOR) return Math.min(CARA_MOSTRADOR, CARA_SOLIDA);
    return Math.min(CARA_PUERTA, CARA_SOLIDA);
  };
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      if (esSolido(g[y][x], abiertas)) continue;
      for (let k = 1; k <= CARA && y - k >= 0; k++) {
        const ch = g[y - k][x];
        if (!esSolido(ch, abiertas)) continue;
        if (k <= alturaDe(ch)) pie[y * ANCHO + x] = 1;
        break;
      }
    }
  }
  return pie;
}

// Cuántas rendijas quedan, sin tocar nada. Es la comprobación que acompaña a
// `cerrarHuecosEstrechos`: afirmar que no queda ninguna vale más que confiar en
// que la pasada se haya hecho en el sitio correcto.
function contarHuecosEstrechos(g, puertasAbiertas) {
  return cerrarHuecosEstrechos(g, true, puertasAbiertas);
}

// `puertasAbiertas` decide con qué cara del mapa se mide. HAY QUE MIRAR LAS DOS:
// con ellas abiertas, que es por donde se andará al final de la partida; y con
// ellas cerradas, que es como ARRANCA — y una hoja de cierre es una pared más, así
// que puede pinchar contra otra y dejar su propia rendija justo delante de la
// puerta, que es el peor sitio para dejar una.
function cerrarHuecosEstrechos(g, soloContar, puertasAbiertas) {
  const n = ANCHO * ALTO;
  // Se mira el mapa con TODAS las puertas abiertas: lo que hay que validar es
  // por dónde se podrá andar al final de la partida.
  // Y el pie tampoco cuenta como libre: un pasillo de ocho celdas bajo una
  // pared de catorce de cara no se pasa. Las celdas de pie NO se tapian —son
  // suelo pintado de cara, y tapiarlas haría crecer la cara hacia abajo—; lo
  // que se tapia es el suelo de verdad que quede aislado entre ellas.
  const abiertas = puertasAbiertas !== false;
  const pie = marcarPie(g, abiertas);
  const libre = new Uint8Array(n);
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const i = y * ANCHO + x;
      if (!esSolido(g[y][x], abiertas) && !pie[i]) libre[i] = 1;
    }
  }

  // Suma acumulada en dos dimensiones: con ella, preguntar si un cuadrado de
  // HOLGURA está entero libre son cuatro lecturas en vez de dieciséis. Sobre un
  // millón de celdas la diferencia se nota al generar.
  const suma = new Int32Array((ANCHO + 1) * (ALTO + 1));
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      suma[(y + 1) * (ANCHO + 1) + (x + 1)] =
        libre[y * ANCHO + x] +
        suma[y * (ANCHO + 1) + (x + 1)] +
        suma[(y + 1) * (ANCHO + 1) + x] -
        suma[y * (ANCHO + 1) + x];
    }
  }
  const todoLibre = (x0, y0) => {
    const x1 = x0 + HOLGURA, y1 = y0 + HOLGURA;
    if (x0 < 0 || y0 < 0 || x1 > ANCHO || y1 > ALTO) return false;
    const total = suma[y1 * (ANCHO + 1) + x1] - suma[y0 * (ANCHO + 1) + x1] -
                  suma[y1 * (ANCHO + 1) + x0] + suma[y0 * (ANCHO + 1) + x0];
    return total === HOLGURA * HOLGURA;
  };

  // Las celdas que SÍ sobreviven: las que caen dentro de algún cuadrado libre.
  const sobrevive = new Uint8Array(n);
  for (let y0 = 0; y0 + HOLGURA <= ALTO; y0++) {
    for (let x0 = 0; x0 + HOLGURA <= ANCHO; x0++) {
      if (!todoLibre(x0, y0)) continue;
      for (let y = y0; y < y0 + HOLGURA; y++) {
        for (let x = x0; x < x0 + HOLGURA; x++) sobrevive[y * ANCHO + x] = 1;
      }
    }
  }

  let tapiadas = 0;
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const i = y * ANCHO + x;
      if (!libre[i] || sobrevive[i]) continue;
      // Una PUERTA no se toca nunca: es la pieza que abre un jefe, y taparla
      // dejaría un anillo sin entrada. Sus huecos miden 64, así que esto no
      // debería darse; la comprobación está por si algún día dejan de medirlo.
      const ch = g[y][x];
      if (ch === PUERTA_GRIS || ch === PUERTA_AZUL || ch === SALIDA) continue;
      if (!soloContar) g[y][x] = PARED;
      tapiadas++;
    }
  }

  // SEGUNDA PASADA, SOLO CONTRA LO SÓLIDO: la de arriba no toca el pie, y un
  // AGUJERO DE UNA CELDA en una pared —donde un tabique llega a otro y no lo
  // toca por una celda— es pie del tabique de arriba, así que se le escapaba.
  // Aquí una celda no sólida sobrevive si cabe en algún cuadrado de HOLGURA
  // sin nada sólido (pie incluido como libre): el pie de un muro en un
  // pasillo cabe de sobra, y el agujero de una celda no cabe en ninguno.
  libre.fill(0);
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      if (!esSolido(g[y][x], abiertas)) libre[y * ANCHO + x] = 1;
    }
  }
  suma.fill(0);
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      suma[(y + 1) * (ANCHO + 1) + (x + 1)] =
        libre[y * ANCHO + x] +
        suma[y * (ANCHO + 1) + (x + 1)] +
        suma[(y + 1) * (ANCHO + 1) + x] -
        suma[y * (ANCHO + 1) + x];
    }
  }
  sobrevive.fill(0);
  for (let y0 = 0; y0 + HOLGURA <= ALTO; y0++) {
    for (let x0 = 0; x0 + HOLGURA <= ANCHO; x0++) {
      if (!todoLibre(x0, y0)) continue;
      for (let y = y0; y < y0 + HOLGURA; y++) {
        for (let x = x0; x < x0 + HOLGURA; x++) sobrevive[y * ANCHO + x] = 1;
      }
    }
  }
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const i = y * ANCHO + x;
      if (!libre[i] || sobrevive[i]) continue;
      const ch = g[y][x];
      if (ch === PUERTA_GRIS || ch === PUERTA_AZUL || ch === SALIDA) continue;
      if (!soloContar) g[y][x] = PARED;
      tapiadas++;
    }
  }
  return tapiadas;
}

// --- Conectividad -------------------------------------------------------------
// Las puertas se abren por tanteo y alguna hoja puede quedar aislada: un local
// rodeado de otros locales, sin un pasillo al que salir. El trazado NO se da por
// bueno hasta que todo lo transitable es una sola pieza.
// ¿Es sólida esta casilla? Con `puertasAbiertas`, las puertas cuentan como paso
// —que es el estado en el que hay que comprobar que el mapa entero se recorre—;
// sin ello son pared, que es como empieza la partida.
// `abiertas` es `true` (todas), `false`/nada (ninguna) o una lista de símbolos de
// puerta ya abiertos, que es lo que hace falta para comprobar el mapa tramo a
// tramo: tras el jefe del minuto 10 solo están abiertas las grises.
function esSolido(ch, abiertas) {
  if (esMuro(ch)) return true;
  if (ch !== PUERTA_GRIS && ch !== PUERTA_AZUL && ch !== SALIDA) return false;
  if (abiertas === true) return false;
  if (!abiertas) return true;
  return abiertas.indexOf(ch) < 0;
}

function componentes(g, puertasAbiertas) {
  const etiqueta = new Int32Array(ANCHO * ALTO).fill(-1);
  const trozos = [];
  const cola = new Int32Array(ANCHO * ALTO);
  // Las piezas se miden como se pisan: con el pie de las caras como sólido.
  const pie = marcarPie(g, puertasAbiertas);

  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const i = y * ANCHO + x;
      if (esSolido(g[y][x], puertasAbiertas) || pie[i] || etiqueta[i] !== -1) continue;
      const id = trozos.length;
      let fin = 0, ini = 0;
      cola[fin++] = i; etiqueta[i] = id;
      const celdas = [];
      while (ini < fin) {
        const c = cola[ini++];
        celdas.push(c);
        const cx = c % ANCHO, cy = (c / ANCHO) | 0;
        const vec = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of vec) {
          if (!dentro(nx, ny)) continue;
          const ni = ny * ANCHO + nx;
          if (esSolido(g[ny][nx], puertasAbiertas) || pie[ni] || etiqueta[ni] !== -1) continue;
          etiqueta[ni] = id; cola[fin++] = ni;
        }
      }
      trozos.push(celdas);
    }
  }
  return { etiqueta, trozos };
}

// Taladrar desde un trozo aislado hasta el principal por el camino MÁS CORTO
// atravesando pared. Es la excavadora: fea, pero garantiza que no queda ni un
// local al que no se pueda entrar.
// `protegidas` son las celdas que la excavadora NO puede tocar: las barreras
// entre anillos. Sin eso, al reconectar un rincón suelto abriría un boquete en
// un cierre y el jefe del minuto 10 dejaría de servir para nada.
// `zona` ata cada excavación A SU PROPIO ANILLO, y es lo que hace que esto
// funcione con las barreras puestas.
//
// Sin ello, un rincón suelto del anillo de dentro buscaba camino hasta la pieza
// más grande del mapa —que está en el de fuera—, se topaba con la barrera, no
// encontraba ruta y se daba por vencido tapiando el rincón entero. Se comía el
// 6% del centro comercial por partida, y una de las cuatro salidas con él.
//
// Restringiendo la búsqueda a las celdas del mismo anillo, el rincón se une por
// donde tiene que unirse: con el resto de su anillo.
// EL CAMINO DE UNA EXCAVACIÓN, y por qué no es una búsqueda en anchura a
// secas. La anchura da el camino más corto en celdas, y entre dos puntos que no
// están alineados hay MUCHOS caminos más cortos: todos los que van en escalera.
// El que salía era una escalera, y un túnel en escalera es una pared en
// diagonal, que es justo lo que Sergio no quiere en el centro comercial (ni
// diagonales, ni oblicuas, ni curvas: todo a escuadra, como los paneles que ha
// dibujado, que son rectos).
//
// Así que aquí cada GIRO cuesta como veinte celdas de más. Con eso el camino
// más barato entre dos puntos es una L —o una Z si hay que esquivar algo—, y
// el túnel sale a escuadra por construcción. Es Dijkstra sobre (celda,
// dirección), con un montón binario; sobre el millón de celdas del mapa tarda
// décimas de segundo, que es lo que tardaba la anchura.
//
// `semillas` son las celdas de partida (el trozo suelto entero), `esDestino(i)`
// dice cuándo se ha llegado y `puedePisar(i)` por dónde se puede excavar.
// Devuelve la lista de celdas del camino, del destino a la semilla, o null.
const COSTE_GIRO = 20;

function caminoRecto(semillas, esDestino, puedePisar) {
  const n = ANCHO * ALTO;
  const estados = n * 4;
  const coste = new Int32Array(estados).fill(0x7fffffff);
  const previo = new Int32Array(estados).fill(-1);
  // Montón binario de estados por coste.
  let monton = new Int32Array(1 << 16), montonCoste = new Int32Array(1 << 16), tam = 0;
  const meter = (e, c) => {
    if (tam === monton.length) {
      const m2 = new Int32Array(tam * 2); m2.set(monton); monton = m2;
      const c2 = new Int32Array(tam * 2); c2.set(montonCoste); montonCoste = c2;
    }
    let i = tam++;
    while (i > 0) {
      const padre = (i - 1) >> 1;
      if (montonCoste[padre] <= c) break;
      monton[i] = monton[padre]; montonCoste[i] = montonCoste[padre]; i = padre;
    }
    monton[i] = e; montonCoste[i] = c;
  };
  const sacar = () => {
    const e = monton[0];
    const ultimo = monton[--tam], cu = montonCoste[tam];
    let i = 0;
    for (;;) {
      let hijo = i * 2 + 1;
      if (hijo >= tam) break;
      if (hijo + 1 < tam && montonCoste[hijo + 1] < montonCoste[hijo]) hijo++;
      if (montonCoste[hijo] >= cu) break;
      monton[i] = monton[hijo]; montonCoste[i] = montonCoste[hijo]; i = hijo;
    }
    monton[i] = ultimo; montonCoste[i] = cu;
    return e;
  };

  // Semillas: sin dirección aún, así que las cuatro a coste cero.
  for (const c of semillas) {
    for (let d = 0; d < 4; d++) { coste[c * 4 + d] = 0; meter(c * 4 + d, 0); }
  }
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  while (tam > 0) {
    const e = sacar();
    const c = e >> 2, d = e & 3;
    const cc = coste[e];
    if (esDestino(c) && previo[e] !== -1) {
      const camino = [];
      for (let k = e; k !== -1; k = previo[k]) camino.push(k >> 2);
      return camino;
    }
    const cx = c % ANCHO, cy = (c / ANCHO) | 0;
    for (let nd = 0; nd < 4; nd++) {
      const nx = cx + DX[nd], ny = cy + DY[nd];
      if (nx < 1 || ny < 1 || nx >= ANCHO - 1 || ny >= ALTO - 1) continue;
      const ni = ny * ANCHO + nx;
      if (!puedePisar(ni)) continue;
      const nc = cc + 1 + (nd === d ? 0 : COSTE_GIRO);
      const ne = ni * 4 + nd;
      if (nc >= coste[ne]) continue;
      coste[ne] = nc; previo[ne] = e;
      meter(ne, nc);
    }
  }
  return null;
}

function conectar(g, puertasAbiertas, protegidas, zona, abiertos) {
  let vueltas = 0;
  for (;;) {
    const { etiqueta, trozos } = componentes(g, puertasAbiertas);
    if (trozos.length <= 1) return vueltas;

    let principal = 0;
    for (let i = 1; i < trozos.length; i++) {
      if (trozos[i].length > trozos[principal].length) principal = i;
    }
    // El primer trozo que no sea el principal, y a por él.
    const suelto = trozos.findIndex((_, i) => i !== principal);

    // El anillo del rincón: el de su primera celda. Un rincón no puede estar a
    // caballo de dos, porque las barreras los separan.
    const anillo = zona ? zona[trozos[suelto][0]] : -1;

    // El borde del mapa no se taladra (lo mira `caminoRecto`): es la fachada.
    // Ni por dentro de una tienda abierta, salvo que el rincón suelto SEA esa
    // tienda (entonces el túnel sale de ella, y eso es su puerta).
    // Ni por la fachada: la excavadora no la toca, y un camino que pase por
    // ella es un camino que no se abre nunca (y se reintentaba sin fin).
    const enFachada = (i) => {
      const x = i % ANCHO, y = (i / ANCHO) | 0;
      return x < FACHADA || y < FACHADA || x >= ANCHO - FACHADA || y >= ALTO - FACHADA;
    };
    const camino = caminoRecto(trozos[suelto],
      (i) => etiqueta[i] === principal,
      (i) => !enFachada(i) && !(protegidas && protegidas[i]) && !(zona && zona[i] !== anillo) &&
             !(abiertos && abiertos[i] && etiqueta[i] !== suelto));

    if (!camino) {
      // No hay forma de llegar: se tapia el trozo para que no quede suelo
      // inalcanzable donde caiga una gema que nadie va a poder recoger.
      console.warn('    [tapiado] rincón de ' + trozos[suelto].length +
                   ' celdas en el anillo ' + anillo + ': no hay por dónde unirlo');
      for (const c of trozos[suelto]) g[(c / ANCHO) | 0][c % ANCHO] = PARED;
      vueltas++;
      continue;
    }

    // El túnel se abre de PUERTA celdas de ancho MÁS la cara del muro de
    // arriba: en un túnel horizontal la cara se come CARA celdas del hueco, y
    // sin contarlas quedaba un pasadizo de ocho unidades.
    const radio = (PUERTA + CARA) >> 1;
    for (const c of camino) {
      const cx = c % ANCHO, cy = (c / ANCHO) | 0;
      for (let oy = -radio; oy <= radio; oy++) {
        for (let ox = -radio; ox <= radio; ox++) {
          const nx = cx + ox, ny = cy + oy;
          // La fachada no se toca: el agujero de salida lo abre quien toca.
          if (nx < FACHADA || ny < FACHADA ||
              nx >= ANCHO - FACHADA || ny >= ALTO - FACHADA) continue;
          if (protegidas && protegidas[ny * ANCHO + nx]) continue;
          if (esMuro(g[ny][nx])) g[ny][nx] = PASILLO;
        }
      }
    }
    vueltas++;
    if (vueltas > 200) throw new Error('el trazado no converge');
  }
}

// --- Fachada y salidas --------------------------------------------------------
// Las cuatro salidas están en la fachada y se ven desde dentro. Hoy no hacen
// nada: el jefe final entra rompiendo la pared y ganar es vencerlo, así que la
// salida es lo que se PROMETE durante media hora, no una casilla de meta.
function levantarFachada(g) {
  // La fachada es más gorda que un tabique: es el muro del edificio.
  for (let k = 0; k < FACHADA; k++) {
    for (let x = 0; x < ANCHO; x++) { g[k][x] = PARED; g[ALTO - 1 - k][x] = PARED; }
    for (let y = 0; y < ALTO; y++) { g[y][k] = PARED; g[y][ANCHO - 1 - k] = PARED; }
  }
}

// LAS SALIDAS VAN EN EL ANILLO DE FUERA, y no es un detalle de colocación: si
// una cayera en el anillo donde se empieza, estaría a la vista desde el minuto
// cero y el nivel entero —tres jefes para llegar a la calle— se quedaría sin
// sentido. Por eso esto se llama DESPUÉS de repartir los anillos y solo mira los
// tramos de fachada cuyo pasillo de detrás es del anillo 2.
function abrirSalidas(g, zona, rng) {
  const salidas = [];
  const lados = [
    { fijo: FACHADA,            eje: 'y', recorre: ANCHO, dir: [0, -1] },
    { fijo: ALTO - 1 - FACHADA, eje: 'y', recorre: ANCHO, dir: [0,  1] },
    { fijo: FACHADA,            eje: 'x', recorre: ALTO,  dir: [-1, 0] },
    { fijo: ANCHO - 1 - FACHADA, eje: 'x', recorre: ALTO, dir: [ 1, 0] }
  ];

  for (const lado of lados) {
    // Se busca un sitio de la fachada con pasillo justo detrás: una salida que
    // dé al fondo de una tienda no se lee como salida.
    const candidatos = [];
    for (let k = 2; k < lado.recorre - 2; k++) {
      const x = lado.eje === 'y' ? k : lado.fijo;
      const y = lado.eje === 'y' ? lado.fijo : k;
      if (g[y][x] !== PASILLO) continue;
      if (zona[y * ANCHO + x] !== 2) continue;      // tiene que ser el anillo de fuera
      candidatos.push([x, y]);
    }
    if (candidatos.length === 0) continue;
    const [x, y] = candidatos[Math.floor(rng() * candidatos.length)];
    // El boquete atraviesa la fachada entera y mide lo que una puerta doble.
    const media = (PUERTA * 3) >> 1;
    for (let prof = 0; prof <= FACHADA; prof++) {
      for (let k = -media; k <= media; k++) {
        const sx = lado.eje === 'y' ? x + k : x + lado.dir[0] * prof;
        const sy = lado.eje === 'y' ? y + lado.dir[1] * prof : y + k;
        if (dentro(sx, sy)) g[sy][sx] = SALIDA;
      }
    }
    // El punto que se apunta es el del PASILLO DE DENTRO, no el de la hoja de la
    // puerta: la hoja es sólida mientras el cierre esté echado, y anclar ahí deja
    // la salida "inalcanzable" en toda comprobación de conectividad.
    salidas.push({ x: x - lado.dir[0], y: y - lado.dir[1] });
  }
  return salidas;
}


// --- Los tres anillos ---------------------------------------------------------
//
// EL CENTRO COMERCIAL NO SE ABRE ENTERO. Se juega en tres anillos alrededor del
// punto de partida, y de uno al siguiente solo se pasa por unos cierres que
// abre el jefe de turno:
//
//   anillo 0   donde se empieza. Se sale de él cuando cae el jefe del minuto 10
//              (cierres GRISES).
//   anillo 1   se sale de él cuando cae el del minuto 20 (cierres AZULES).
//   anillo 2   el de fuera, con la fachada y sus salidas verdes. Las abre el
//              jefe final, y con él se acaba la fase.
//
// Los anillos se reparten POR DISTANCIA ANDANDO desde el punto de partida, no
// por coordenadas: así el primer tercio es "lo que tienes alrededor" de verdad y
// no un rectángulo que a lo mejor te deja media tienda al otro lado de un muro.
//
// La frontera entre dos anillos se tapia entera y luego se le abren los huecos.
// Tapiar TODAS las celdas de un anillo que tocan al siguiente garantiza que no
// queda un paso suelto por descuido: cualquier camino de uno a otro tiene que
// cruzar por donde nosotros decimos.

// Cuántos cierres hay por frontera. Ocho repartidos por el contorno: con menos,
// el anillo tiene una sola boca y el mapa es un embudo; con muchos más dejan de
// significar nada. Lo fijó Sergio.
const CIERRES_POR_FRONTERA = 8;

// Lo ancho que es un cierre, en celdas a cada lado del punto elegido. 4 celdas
// de radio son 64 unidades de hueco, igual que una puerta de tienda.
const RADIO_CIERRE = 8;

// LA GALERÍA CIRCULAR DE UN ANILLO: el pasillo que le da la vuelta por dentro.
//
// Es lo que hace un centro comercial de verdad —la galería que recorre la planta
// entera— y aquí además es lo que garantiza que se pueda ir de un lado a otro del
// anillo sin salir de él. Sin ella, para cruzar de un brazo al de enfrente habría
// que pasar por el centro, que está cerrado hasta que caiga el jefe de turno.
//
// Como los anillos son cuadrados de verdad (ver `zonificar`), la galería es un
// marco: se abre todo lo que caiga entre dos "radios" de cuadrado, y sale
// recta, a escuadra, en los cuatro lados.
function galeria(g, dist, zona, anillo, desde, hasta, protegidas, abiertos) {
  let abiertas = 0;
  for (let y = FACHADA; y < ALTO - FACHADA; y++) {
    for (let x = FACHADA; x < ANCHO - FACHADA; x++) {
      const i = y * ANCHO + x;
      if (zona[i] !== anillo) continue;
      if (protegidas && protegidas[i]) continue;
      if (abiertos && abiertos[i]) continue;          // las tiendas abiertas, enteras
      const d = dist[i];
      if (d < desde || d > hasta) continue;
      if (!esMuro(g[y][x])) continue;
      g[y][x] = PASILLO;
      abiertas++;
    }
  }
  return abiertas;
}

// LOS TRES ANILLOS, POR DISTANCIA GEOMÉTRICA AL PUNTO DE PARTIDA.
//
// Es decir: círculos concéntricos de verdad, que es como lo quiere Sergio y
// además lo único que funciona.
//
// El primer intento los repartía por distancia ANDANDO, que parece más fino —"lo
// que tienes a tres minutos"— y es una trampa: en un laberinto la curva de nivel
// de la distancia andando no es un círculo ni nada que se le parezca, y el anillo
// de fuera salía roto en lóbulos que solo se comunicaban pasando por el centro.
// O sea, por el anillo de en medio, que está cerrado. Había que darle una puerta
// propia a cada lóbulo —cuarenta y dos puertas— o tapiarlo, y se tapiaban 57.000
// celdas de centro comercial de una sentada.
//
// Con círculos de verdad, cada anillo es una REGIÓN CONEXA del rectángulo por
// definición: un disco, una corona y lo que queda fuera. Y entonces cosen sin
// problema, ocho puertas bastan, y no hay que tapiar nada.
//
// Los radios no se reparten a ojo: se eligen para que cada anillo tenga UN TERCIO
// de la superficie jugable. Con el punto de partida en el centro del mapa, los
// tercios en área no caen ni mucho menos en los tercios del radio.
// LA DISTANCIA QUE HACE LOS ANILLOS: la del tablero (la mayor de las dos
// coordenadas), no la euclídea. Con ella las curvas de nivel son CUADRADOS
// concéntricos, y las fronteras entre anillos —que se tapian enteras y llevan
// los cierres— salen como cuatro paredes rectas. Con la euclídea eran círculos,
// y un círculo en una rejilla es una escalera de celdas: paredes en diagonal
// por todo el centro comercial, que es lo que Sergio ha pedido que no haya.
// Todo lo que decían los comentarios de abajo sobre círculos vale igual para
// cuadrados: un cuadrado también parte el rectángulo en regiones conexas.
const distCuadrado = (x, y, inicio) => Math.max(Math.abs(x - inicio.x), Math.abs(y - inicio.y));

function zonificar(g, inicio, locales) {
  const n = ANCHO * ALTO;
  const radios = [];
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      if (g[y][x] === PARED) continue;
      radios.push(distCuadrado(x, y, inicio));
    }
  }
  radios.sort((a, b) => a - b);
  const r1 = radios[(radios.length / 3) | 0];
  const r2 = radios[((radios.length * 2) / 3) | 0];

  // El anillo de CADA celda, muro incluido: la frontera tiene que ser una curva
  // cerrada que cruce también la pared, o cualquier pasadizo excavado por dentro
  // del muro la rodea por detrás y no separa nada.
  const zona = new Int8Array(n);
  const dist = new Float64Array(n);
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const i = y * ANCHO + x;
      const d = distCuadrado(x, y, inicio);
      dist[i] = d;
      zona[i] = d <= r1 ? 0 : (d <= r2 ? 1 : 2);
    }
  }
  // UNA TIENDA ABIERTA NO SE PARTE EN DOS ANILLOS: la frontera pasaría por
  // dentro y le pondría un muro en medio, y la tienda dejaría de ser un
  // rectángulo. Cada tienda abierta, con su tabique, va entera al anillo en
  // el que cae su centro; la frontera se desvía por los pasillos de alrededor.
  // Las cerradas sí se parten: un techo partido son dos techos.
  for (const l of locales || []) {
    if (l.cerrada) continue;
    const zc = zona[((l.y + (l.h >> 1)) * ANCHO) + l.x + (l.w >> 1)];
    for (let y = l.y - TABIQUE; y < l.y + l.h + TABIQUE; y++) {
      for (let x = l.x - TABIQUE; x < l.x + l.w + TABIQUE; x++) {
        if (dentro(x, y)) zona[y * ANCHO + x] = zc;
      }
    }
  }
  return { zona, dist, u1: r1, u2: r2 };
}

// Tapiar la frontera entre el anillo `k` y los de fuera. Devuelve las celdas
// tapiadas, que son las candidatas a convertirse en cierre, y deja marcada la
// frontera ENTERA —muro incluido— en `protegidas`.
// DOS CELDAS DE GRUESO, no una. Con una, la frontera era un tabique fino, y un
// tabique fino se cruza en cuanto algo empuja: sería colarse al anillo
// siguiente sin esperar al jefe que abre el cierre. Las dos capas entran en la
// lista, así que un cierre abre las dos y sigue siendo una puerta y no media.
function tapiarFrontera(g, zona, k, protegidas) {
  const frontera = [];
  const meter = (i) => {
    protegidas[i] = 1;
    if (g[(i / ANCHO) | 0][i % ANCHO] !== PARED) frontera.push(i);
  };
  for (let y = 1; y < ALTO - 1; y++) {
    for (let x = 1; x < ANCHO - 1; x++) {
      const i = y * ANCHO + x;
      if (zona[i] !== k) continue;
      let toca = false;
      for (let v = 0; v < 4; v++) {
        const nx = x + [1, -1, 0, 0][v], ny = y + [0, 0, 1, -1][v];
        // "Mayor que k" y no "igual a k+1": con los anillos metidos en la pared
        // puede haber un punto donde el 0 toque directamente al 2, y ese punto
        // también hay que cerrarlo.
        const ni = ny * ANCHO + nx;
        if (zona[ni] <= k) continue;
        toca = true;
        meter(ni);                      // la segunda capa, ya del otro anillo
      }
      if (!toca) continue;
      meter(i);
    }
  }
  for (const i of frontera) g[(i / ANCHO) | 0][i % ANCHO] = PARED;
  return frontera;
}

// Abrir un cierre en la celda `centro` de una frontera: todas las celdas de esa
// frontera que le queden cerca pasan a ser puerta.
//
// Y CON SU VESTÍBULO A LOS DOS LADOS, que no es un adorno. El cierre es una hoja
// de una celda de grosor, y con la puerta ECHADA el suelo que tiene delante queda
// pinchado entre ella y lo que hubiera al otro lado: salían rendijas de las que
// no gustan —suelo al que no se puede entrar— justo delante de cada puerta, que
// es el peor sitio posible para dejarlas.
//
// Se despeja un CUADRADO alrededor de la puerta (era un círculo, y un círculo
// deja las esquinas de las paredes en escalera), saltándose la membrana que
// separa los anillos: así el muro no se toca y lo único que comunica los dos
// lados sigue siendo la hoja.
function abrirCierre(g, frontera, centro, simbolo, protegidas) {
  const ex = centro % ANCHO, ey = (centro / ANCHO) | 0;
  for (const i of frontera) {
    const cx = i % ANCHO, cy = (i / ANCHO) | 0;
    if (Math.abs(cx - ex) > RADIO_CIERRE * 2 || Math.abs(cy - ey) > RADIO_CIERRE * 2) continue;
    g[cy][cx] = simbolo;
  }

  const alcance = RADIO_CIERRE * 2 + HOLGURA;
  for (let oy = -alcance; oy <= alcance; oy++) {
    for (let ox = -alcance; ox <= alcance; ox++) {
      const nx = ex + ox, ny = ey + oy;
      if (nx < FACHADA || ny < FACHADA ||
          nx >= ANCHO - FACHADA || ny >= ALTO - FACHADA) continue;
      const ni = ny * ANCHO + nx;
      if (protegidas && protegidas[ni]) continue;    // la membrana no se toca
      if (esMuro(g[ny][nx])) g[ny][nx] = PASILLO;
    }
  }
}

// UNIR UN ANILLO CONSIGO MISMO.
//
// Ésta es la pieza que permite que haya OCHO puertas por frontera y no cuarenta.
//
// El problema: un anillo repartido por distancia no tiene por qué ser una sola
// pieza. Un centro comercial tiene brazos que solo se comunican por el centro,
// así que al tapiar la frontera el anillo de fuera se parte en lóbulos sueltos.
// La primera versión lo resolvía dándole una puerta propia a cada lóbulo, y
// salían cuarenta y dos: el mapa parecía un panal.
//
// Lo correcto es lo contrario: unir los lóbulos ENTRE SÍ, por dentro del propio
// anillo, abriendo pasillos a través del muro. Entonces el anillo es una pieza,
// y con una sola puerta ya se entra en él entero. Las ocho que hay son por
// comodidad y por reparto, no por obligación.
//
// La excavación no puede salirse del anillo ni tocar la membrana que lo separa
// del siguiente (`protegidas`), así que no hay forma de que esto abra un paso
// que el jugador no se haya ganado.
function unirAnillo(g, zona, k, protegidas, abiertos) {
  let tuneles = 0;
  // Lóbulos que ya se ha intentado coser y no se ha podido. Se apuntan porque las
  // piezas se recalculan en cada vuelta y, sin esto, se reintentaría el mismo
  // para siempre.
  const rendidos = new Set();
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    // Piezas transitables DE ESTE ANILLO. Las puertas cuentan como paso: lo que
    // se mira es si el anillo se recorre entero una vez dentro de él. Y el pie
    // de las caras, como sólido, que es como se pisa.
    const pie = marcarPie(g, true);
    const etiqueta = new Int32Array(ANCHO * ALTO).fill(-1);
    const cola = new Int32Array(ANCHO * ALTO);
    const trozos = [];
    for (let y = 0; y < ALTO; y++) {
      for (let x = 0; x < ANCHO; x++) {
        const i = y * ANCHO + x;
        if (zona[i] !== k || etiqueta[i] !== -1) continue;
        if (esSolido(g[y][x], true) || pie[i]) continue;
        const id = trozos.length;
        let fin = 0, ini = 0;
        cola[fin++] = i; etiqueta[i] = id;
        const celdas = [];
        while (ini < fin) {
          const c = cola[ini++];
          celdas.push(c);
          const cx = c % ANCHO, cy = (c / ANCHO) | 0;
          for (let v = 0; v < 4; v++) {
            const nx = cx + [1, -1, 0, 0][v], ny = cy + [0, 0, 1, -1][v];
            if (!dentro(nx, ny)) continue;
            const ni = ny * ANCHO + nx;
            if (zona[ni] !== k || etiqueta[ni] !== -1) continue;
            if (esSolido(g[ny][nx], true) || pie[ni]) continue;
            etiqueta[ni] = id; cola[fin++] = ni;
          }
        }
        trozos.push(celdas);
      }
    }
    if (trozos.length <= 1) return tuneles;

    let principal = 0;
    for (let i = 1; i < trozos.length; i++) {
      if (trozos[i].length > trozos[principal].length) principal = i;
    }
    const suelto = trozos.findIndex((t, i) => i !== principal && !rendidos.has(t[0]));
    if (suelto < 0) return tuneles;      // lo que queda son lóbulos por geometría

    // Camino a escuadra desde el lóbulo suelto hasta el grande, atravesando
    // muro pero SIN salirse del anillo ni tocar la membrana ni la fachada.
    const enFachada = (i) => {
      const x = i % ANCHO, y = (i / ANCHO) | 0;
      return x < FACHADA || y < FACHADA || x >= ANCHO - FACHADA || y >= ALTO - FACHADA;
    };
    const camino = caminoRecto(trozos[suelto],
      (i) => etiqueta[i] === principal,
      (i) => !enFachada(i) && zona[i] === k && !protegidas[i] &&
             !(abiertos[i] && etiqueta[i] !== suelto));

    if (!camino) {
      // UN LÓBULO QUE NO SE PUEDE COSER POR DENTRO DE SU ANILLO, y no es un fallo:
      // es geometría. Con el punto de partida descentrado, el círculo exterior
      // corta el borde del mapa y lo que queda fuera son DOS trozos separados por
      // una cuña del anillo de dentro. No hay forma de ir de uno al otro sin
      // cruzar esa cuña, que está cerrada.
      //
      // No se tapia —eran 109.000 celdas de centro comercial, el 12% del mapa—:
      // se deja, y el reparto de cierres se encarga de que cada lóbulo tenga los
      // suyos. Se entra en cada uno por su propia puerta, que jugando se lee
      // perfectamente.
      rendidos.add(trozos[suelto][0]);
      continue;
    }

    // Y a abrir el pasillo, ancho como una puerta más la cara (ver `conectar`).
    const radio = (PUERTA + CARA) >> 1;
    for (const c of camino) {
      const cx = c % ANCHO, cy = (c / ANCHO) | 0;
      for (let oy = -radio; oy <= radio; oy++) {
        for (let ox = -radio; ox <= radio; ox++) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < FACHADA || ny < FACHADA ||
              nx >= ANCHO - FACHADA || ny >= ALTO - FACHADA) continue;
          const ni = ny * ANCHO + nx;
          if (protegidas[ni] || zona[ni] !== k) continue;
          if (esMuro(g[ny][nx])) g[ny][nx] = PASILLO;
        }
      }
    }
    tuneles++;
  }
  console.warn('  AVISO: el anillo ' + k + ' no ha terminado de unirse');
  return tuneles;
}

// LOS CIERRES DE UNA FRONTERA: `cuantos`, repartidos por ángulo alrededor del
// punto de partida y SIN SOLAPARSE.
//
// Repartir por ángulo es lo natural porque la frontera de un anillo es una curva
// cerrada alrededor del inicio. Un primer intento los elegía por orden de barrido
// de la rejilla y salían todos en la mitad norte: quien estuviera en el sur tenía
// que cruzarse el anillo entero para encontrar una puerta.
//
// Y con distancia mínima entre ellos: dos cierres pegados son, a efectos de
// juego, un cierre ancho, y en el plano se pintan uno encima de otro.
function cierresRepartidos(g, frontera, simbolo, inicio, cuantos, protegidas) {
  const elegidos = [];

  // Separaciones mínimas a probar, de más exigente a menos (en celdas: 150 son
  // 1200 unidades, dos pantallas y media). Se empieza por la buena y solo se
  // afloja si con ella no caben los ocho — más vale un par de cierres algo
  // juntos que quedarse en seis. Con la frontera que sale hoy, la primera basta.
  const SEPARACIONES = [300, 220, 160, 110, 80, 0];

  for (const separacion of SEPARACIONES) {
    for (let q = 0; q < cuantos && elegidos.length < cuantos; q++) {
      const objetivo = (q / cuantos) * Math.PI * 2 - Math.PI;
      let mejor = -1, mejorDif = Infinity;
      for (const i of frontera) {
        const cx = i % ANCHO, cy = (i / ANCHO) | 0;
        if (g[cy][cx] !== PARED) continue;               // ya es puerta
        let pegado = false;
        for (const e of elegidos) {
          const ex = e % ANCHO, ey = (e / ANCHO) | 0;
          const dx = ex - cx, dy = ey - cy;
          if (dx * dx + dy * dy < separacion * separacion) { pegado = true; break; }
        }
        if (pegado) continue;
        const ang = Math.atan2(cy - inicio.y, cx - inicio.x);
        let dif = Math.abs(ang - objetivo);
        if (dif > Math.PI) dif = Math.PI * 2 - dif;
        if (dif < mejorDif) { mejorDif = dif; mejor = i; }
      }
      if (mejor < 0) continue;      // a este ángulo no queda sitio
      elegidos.push(mejor);
      abrirCierre(g, frontera, mejor, simbolo, protegidas);
    }
    if (elegidos.length >= cuantos) break;
  }
  return elegidos.length;
}

// CIERRES DE RESCATE: un cierre más para cada trozo del centro comercial que,
// con todas las puertas abiertas, siga sin poderse alcanzar desde el inicio.
//
// Pasa con los LÓBULOS: un tramo de pasillo entre la fachada, una tienda
// abierta (intocable) y la frontera de un anillo, que no se puede coser por
// dentro de su anillo porque no hay por dónde. Los ocho cierres por frontera
// se reparten por ángulo y no tienen por qué tocarle a ese tramo. Aquí se
// busca, para cada trozo suelto, una celda de frontera que lo toque —contando
// con que bajo una frontera horizontal hay CARA celdas de pie— y se abre ahí
// un cierre del color de esa frontera. Lo que no toque ninguna frontera se
// tapia: es un rincón sin salida posible.
function cierresDeRescate(g, fronteras, inicio, protegidas) {
  let abiertos = 0;
  for (let vuelta = 0; vuelta < 60; vuelta++) {
    const { etiqueta, trozos } = componentes(g, true);
    const raiz = etiqueta[inicio.y * ANCHO + inicio.x];
    let suelto = -1;
    for (let i = 0; i < trozos.length; i++) if (i !== raiz) { suelto = i; break; }
    if (suelto < 0) return abiertos;

    // Caja del trozo, para no mirar toda la frontera contra todo el trozo.
    let x0 = ANCHO, y0 = ALTO, x1 = 0, y1 = 0;
    for (const c of trozos[suelto]) {
      const cx = c % ANCHO, cy = (c / ANCHO) | 0;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
    }
    const M = CARA + 2;
    let hecho = false;
    for (const f of fronteras) {
      for (const i of f.celdas) {
        const cx = i % ANCHO, cy = (i / ANCHO) | 0;
        if (g[cy][cx] !== PARED) continue;
        if (cx < x0 - M || cx > x1 + M || cy < y0 - M || cy > y1 + M) continue;
        // ¿Toca al trozo? Alguna celda suya a M o menos.
        let toca = false;
        for (let oy = -M; oy <= M && !toca; oy++) {
          for (let ox = -M; ox <= M; ox++) {
            const nx = cx + ox, ny = cy + oy;
            if (!dentro(nx, ny)) continue;
            if (etiqueta[ny * ANCHO + nx] === suelto) { toca = true; break; }
          }
        }
        if (!toca) continue;
        abrirCierre(g, f.celdas, i, f.simbolo, protegidas);
        abiertos++;
        hecho = true;
        break;
      }
      if (hecho) break;
    }
    if (!hecho) {
      // Sin frontera que lo toque: se tapia, que un suelo al que no se llega
      // es un sitio donde caen gemas que nadie recoge.
      for (const c of trozos[suelto]) g[(c / ANCHO) | 0][c % ANCHO] = PARED;
    }
  }
  console.warn('  AVISO: quedan trozos sueltos tras sesenta cierres de rescate');
  return abiertos;
}

// ESQUINAS A ESCUADRA. Dos celdas sólidas que se tocan solo por la esquina
// —con suelo en las otras dos de su cuadrado de 2x2— son una pared en
// diagonal de una celda, y es justo lo que no puede haber. Salen donde un
// cierre dobla la esquina de su frontera y donde un tabique llega a otro sin
// tocarlo. Se rellena la celda de suelo del cuadrado que más sólido tenga
// alrededor (nunca una puerta), y se repite hasta que no quede ninguna. Las
// puertas cuentan como sólidas: cerradas es como arranca la partida.
function cuadrarEsquinas(g) {
  let total = 0;
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    let n = 0;
    for (let y = 0; y < ALTO - 1; y++) {
      for (let x = 0; x < ANCHO - 1; x++) {
        const a = esSolido(g[y][x], false), b = esSolido(g[y][x + 1], false);
        const c = esSolido(g[y + 1][x], false), d = esSolido(g[y + 1][x + 1], false);
        let libres;
        if (a && d && !b && !c) libres = [[x + 1, y], [x, y + 1]];
        else if (b && c && !a && !d) libres = [[x, y], [x + 1, y + 1]];
        else continue;
        const vecinos = ([px, py]) => {
          let k = 0;
          if (px > 0 && esSolido(g[py][px - 1], false)) k++;
          if (px < ANCHO - 1 && esSolido(g[py][px + 1], false)) k++;
          if (py > 0 && esSolido(g[py - 1][px], false)) k++;
          if (py < ALTO - 1 && esSolido(g[py + 1][px], false)) k++;
          return k;
        };
        const [p, q] = libres;
        const esPuerta = (ch) => ch === PUERTA_GRIS || ch === PUERTA_AZUL || ch === SALIDA;
        let elegida = vecinos(p) >= vecinos(q) ? p : q;
        if (esPuerta(g[elegida[1]][elegida[0]])) elegida = elegida === p ? q : p;
        if (esPuerta(g[elegida[1]][elegida[0]])) continue;
        g[elegida[1]][elegida[0]] = PARED;
        n++;
      }
    }
    total += n;
    if (n === 0) return total;
  }
  return total;
}

// LAS BOCAS, IGUALADAS AL PIE DEL MURO.
//
// Un muro se dibuja ALTO: su tapa arriba y su cara colgando CARA celdas hacia
// abajo, así que la línea donde la pared toca el suelo está CARA celdas por
// debajo de su tapa. Ese es el borde de verdad entre lo de arriba y lo de
// abajo, y todo el frente de una tienda lo respeta... menos el hueco de la
// puerta: allí no hay muro, no se dibuja cara, y el suelo de dentro asomaba
// por el boquete hasta la TAPA — o sea, catorce celdas más arriba que en el
// resto del frente. Visto desde el pasillo, el suelo de la tienda trepaba por
// la puerta. Lo cazó Sergio.
//
// Aquí se le da al hueco el suelo del lado de ARRIBA del muro, que es el que
// le toca: por una puerta en la pared de arriba de una tienda se ve el suelo
// del pasillo hasta el pie del muro, y por una en la de abajo, el de la
// tienda. Con eso el borde entre los dos suelos es una sola línea recta a lo
// largo de todo el frente, con puerta y sin ella.
//
// Solo se tocan celdas que estén metidas en un hueco —con muro a los dos lados
// a menos de ANCHO_BOCA celdas— y que no tengan muro encima: las que lo tienen
// ya llevan la cara pintada encima y no se ven.
const ANCHO_BOCA = 12;

function uniformarBocas(g) {
  let n = 0;
  // Suelo de verdad: ni muro ni hoja de puerta. Una puerta NO es `esMuro` pero
  // empieza cerrada y es sólida, así que copiar su símbolo a una celda de
  // suelo tapiaba el paso — y el generador cerraba el mapa a cal y canto.
  const esSuelo = (ch) => !esMuro(ch) && ch !== PUERTA_GRIS && ch !== PUERTA_AZUL && ch !== SALIDA;
  // LA SOMBRA DE LAS PAREDES, y solo de ellas: el muro y las CARA celdas que
  // cubre su cara. Las estanterías también tienen cara, pero no cuentan aquí —
  // los pasillos que quedan entre dos lineales son huecos con sombra a los dos
  // lados y se tomaban por bocas: el suelo del pasillo acababa pintado en
  // tiras por dentro de las tiendas.
  const sombra = new Uint8Array(ANCHO * ALTO);
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      if (g[y][x] !== PARED) continue;
      sombra[y * ANCHO + x] = 1;
      for (let k = 1; k <= CARA; k++) {
        const cy = y + k;
        if (cy >= ALTO) break;
        if (g[cy][x] === PARED) break;        // otra pared: su cara empieza ahí
        sombra[cy * ANCHO + x] = 1;
      }
    }
  }
  const enSombra = (x, y) => dentro(x, y) && sombra[y * ANCHO + x] === 1;
  // El suelo que hay por encima de esa sombra, subiendo hasta salir de ella.
  const sueloEncima = (x, y) => {
    for (let k = 0; k <= CARA + 4; k++) {
      const cy = y - k;
      if (cy < 0) return '';
      if (enSombra(x, cy) || esMuro(g[cy][x])) continue;
      return esSuelo(g[cy][x]) ? g[cy][x] : '';
    }
    return '';
  };
  for (let y = 1; y < ALTO - 1; y++) {
    for (let x = 1; x < ANCHO - 1; x++) {
      const ch = g[y][x];
      if (!esSuelo(ch) || enSombra(x, y)) continue;
      let ix = -1, dx = -1;
      for (let k = 1; k <= ANCHO_BOCA && ix < 0; k++) if (enSombra(x - k, y)) ix = x - k;
      if (ix < 0) continue;
      for (let k = 1; k <= ANCHO_BOCA && dx < 0; k++) if (enSombra(x + k, y)) dx = x + k;
      if (dx < 0) continue;
      const suelo = sueloEncima(ix, y) || sueloEncima(dx, y);
      if (!suelo || suelo === ch) continue;
      g[y][x] = suelo;
      n++;
    }
  }
  return n;
}

// --- El trazado completo ------------------------------------------------------
function trazar(semilla) {
  const rng = crearRng(semilla);
  const g = crearRejilla();
  const hojas = [];

  // 7 niveles de partición sobre 316x204 módulos dejan bloques grandes para un
  // centro comercial extenso, pero con tiendas reconocibles y recorrido legible.
  partir(g, FACHADA, FACHADA, ANCHO - FACHADA * 2, ALTO - FACHADA * 2, 7, rng, hojas);

  const locales = [];
  for (const hoja of hojas) carvarLocal(g, hoja, rng, locales);

  // LA PLAZA DE LOS FOOD TRUCKS, en el local mediano más cercano al centro. No
  // se sortea: el sitio de encontrarse está en medio, siempre, y es la única
  // referencia fija que tiene quien se ha perdido.
  let plaza = null, mejor = Infinity;
  for (const l of locales) {
    const area = (l.w * l.h) / (F * F);     // en módulos, como tipoDeLocal
    if (area < 130 || area > 420) continue;
    const dx = l.x + l.w / 2 - ANCHO / 2, dy = l.y + l.h / 2 - ALTO / 2;
    const d = dx * dx + dy * dy;
    if (d < mejor) { mejor = d; plaza = l; }
  }
  if (plaza) {
    plaza.tipo = PLAZA;
    rellenar(g, plaza.x, plaza.y, plaza.w, plaza.h, PLAZA);
  }

  // Las puertas ANTES que el mobiliario: las estanterías de las paredes se
  // apartan de ellas. Solo en las tiendas abiertas; una que no consiga
  // ninguna puerta —rodeada de otras tiendas— se cierra también, que es lo
  // que es.
  if (plaza) plaza.cerrada = false;
  for (const l of locales) {
    if (l.cerrada) continue;
    if (abrirPuerta(g, l, rng) === 0 && l !== plaza) l.cerrada = true;
  }
  for (const l of locales) {
    if (l.cerrada) cerrarLocal(g, l); else amueblar(g, l, rng);
  }
  const abiertos = mascaraAbiertos(locales);

  levantarFachada(g);
  // LAS RENDIJAS, ANTES DE COMPROBAR NADA. Los tabiques y el mobiliario dejan
  // huecos por los que no se pasa, y si se comprueba la conectividad con ellos
  // puestos, el mapa se da por bien comunicado a través de sitios que el jugador
  // no puede cruzar.
  let rendijas = cerrarHuecosEstrechos(g);
  const taladros = conectar(g, false, null, null, abiertos);

  // DÓNDE EMPIEZA LA PARTIDA: la plaza si la hay, y si no el centro del mapa,
  // corrido hasta la celda transitable más cercana. Tiene que decidirse ANTES de
  // repartir los anillos, porque los anillos se miden desde aquí.
  const cx = plaza ? Math.floor(plaza.x + plaza.w / 2) : ANCHO >> 1;
  const cy = plaza ? Math.floor(plaza.y + plaza.h / 2) : ALTO >> 1;
  const inicio = celdaLibreCerca(g, cx, cy);

  // --- Los tres anillos y sus cierres ---------------------------------------
  const { zona, dist, u1, u2 } = zonificar(g, inicio, locales);
  // LAS BARRERAS NO SE TOCAN a partir de aquí: la excavadora que reconecta
  // rincones sueltos abriría un boquete sin enterarse, y con eso el jefe del
  // minuto 10 dejaría de servir para nada.
  const protegidas = new Uint8Array(ANCHO * ALTO);
  const fronteras = [
    { celdas: tapiarFrontera(g, zona, 0, protegidas), simbolo: PUERTA_GRIS },
    { celdas: tapiarFrontera(g, zona, 1, protegidas), simbolo: PUERTA_AZUL }
  ];

  // LAS TRES GALERÍAS CIRCULARES, una por anillo, justo por dentro de su
  // frontera. Son lo que cose cada anillo consigo mismo y lo que permite que los
  // cierres sean ocho y no cuarenta: con el anillo recorrible entero, una sola
  // puerta ya mete en él.
  //
  // El ancho es el de una puerta, que es el de un pasillo estrecho: lo justo para
  // que se lea como una galería y no como una autopista que parte el mapa.
  // Más la cara: los tramos horizontales de la galería pierden CARA celdas
  // bajo la pared de arriba, y sin sumarlas quedaban en ocho unidades de paso.
  const W = PUERTA + CARA;
  // SIN GALERÍAS desde el 21/09/2026: con las tiendas abiertas intocables, la
  // galería solo podía abrirse a través de las cerradas, y se llevaba por
  // delante 270.000 celdas de techo en pasillos que nadie había pedido. Lo
  // que cose cada anillo son los túneles de `unirAnillo`, que abren solo lo
  // justo. La función queda por si se quiere volver a ella.
  const galerias = 0;
  void W;

  // Y la red por debajo: si aun así queda algún lóbulo suelto, se une por dentro
  // del propio anillo. Con las galerías puestas esto casi nunca hace nada.
  const tunelesAnillo = unirAnillo(g, zona, 0, protegidas, abiertos) +
                        unirAnillo(g, zona, 1, protegidas, abiertos) +
                        unirAnillo(g, zona, 2, protegidas, abiertos);

  const cierresGrises = cierresRepartidos(g, fronteras[0].celdas, PUERTA_GRIS,
                                          inicio, CIERRES_POR_FRONTERA, protegidas);
  const cierresAzules = cierresRepartidos(g, fronteras[1].celdas, PUERTA_AZUL,
                                          inicio, CIERRES_POR_FRONTERA, protegidas);
  const cierresRescate = cierresDeRescate(g, fronteras, inicio, protegidas);

  // Y las salidas de la calle, que van en el anillo de fuera.
  const salidas = abrirSalidas(g, zona, rng);

  // Y otra pasada de rendijas: las galerías, los cierres y las salidas han vuelto
  // a abrir y cerrar suelo, y cada uno de esos cortes puede dejar una punta de
  // muro al aire.
  rendijas += cerrarHuecosEstrechos(g);

  // Las salidas tampoco: son la fachada.
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      if (g[y][x] === SALIDA) protegidas[y * ANCHO + x] = 1;
    }
  }

  // Con TODAS las puertas abiertas el centro comercial tiene que recorrerse
  // entero. Es lo que garantiza que no queda una tienda a la que no se llegue
  // nunca, ni siquiera al final de la partida.
  const taladros2 = conectar(g, true, protegidas, zona, abiertos);

  // Y las últimas, después de reconectar: los túneles de repaso también cortan
  // muros y dejan puntas al aire. Primero con las puertas abiertas y luego con
  // ellas cerradas, que es como arranca la partida. A partir de aquí ya no se
  // toca el mapa.
  // Cada techo con su pared alrededor, ya con todos los cortes hechos, y
  // ANTES de la última pasada de rendijas: un techo que se vuelve pared
  // estrena cara, y esa cara puede dejar una rendija nueva debajo.
  amurallarTechos(g);
  const esquinas = cuadrarEsquinas(g);
  rendijas += cerrarHuecosEstrechos(g, false, true);
  rendijas += cerrarHuecosEstrechos(g, false, false);

  // Las bocas, igualadas al pie del muro (ver `uniformarBocas`). Va al final:
  // necesita el mapa con todos sus muros puestos, y lo que cambia es el suelo,
  // no lo que se pisa.
  const bocas = uniformarBocas(g);

  // EL PASILLO DE CADA ANILLO (ver PASILLO_1): ya no se toca nada más del
  // trazado, así que se puede cambiar el símbolo sin que nadie lo eche de
  // menos. Los cierres y las salidas se quedan como están.
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      if (g[y][x] !== PASILLO) continue;
      const z = zona[y * ANCHO + x];
      if (z === 1) g[y][x] = PASILLO_1; else if (z === 2) g[y][x] = PASILLO_2;
    }
  }

  // Y LA ÚLTIMA COMPROBACIÓN, con el mapa ya cerrado del todo: que a cada
  // salida se llegue de verdad. El punto
  // que apunta `abrirSalidas` es el pasillo de detrás de la puerta, y ese pasillo
  // puede haber quedado en un rincón que la excavadora no supo unir —o que ella
  // misma dejó suelto al ensanchar—. Si pasa, la salida se corre a la celda
  // alcanzable más cercana, que sigue estando pegada a su puerta.
  //
  // Sin esto, el fallo es silencioso y de los peores: una puerta de la calle que
  // se pinta en el plano, promete media hora de partida y no lleva a ninguna
  // parte.
  {
    const { etiqueta } = componentes(g, true);
    const raiz = etiqueta[inicio.y * ANCHO + inicio.x];
    for (const sa of salidas) {
      if (etiqueta[sa.y * ANCHO + sa.x] === raiz) continue;
      let mejor = null, mejorD = Infinity;
      for (let r = 1; r <= 40 && !mejor; r++) {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            const nx = sa.x + ox, ny = sa.y + oy;
            if (!dentro(nx, ny)) continue;
            if (etiqueta[ny * ANCHO + nx] !== raiz) continue;
            const d = ox * ox + oy * oy;
            if (d < mejorD) { mejorD = d; mejor = { x: nx, y: ny }; }
          }
        }
        if (mejor) break;
      }
      if (mejor) { sa.x = mejor.x; sa.y = mejor.y; }
      else console.warn('  AVISO: una salida se ha quedado sin camino y no hay adónde correrla');
    }
  }


  return { g, locales, salidas, inicio, zona, tunelesAnillo, galerias, rendijas, cierresRescate, esquinas, bocas,
           taladros: taladros + taladros2, cierresGrises, cierresAzules };
}

function celdaLibreCerca(g, cx, cy) {
  const pie = marcarPie(g, false);
  for (let r = 0; r < Math.max(ANCHO, ALTO); r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!dentro(x, y)) continue;
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (!esMuro(g[y][x]) && !pie[y * ANCHO + x]) return { x, y };
      }
    }
  }
  throw new Error('mapa sin una sola celda transitable');
}

// --- Salidas de fichero -------------------------------------------------------
const filasDe = (g) => g.map((fila) => fila.join(''));

// COMPRIMIR LAS FILAS POR TRAMOS. Con el mapa a su tamaño de verdad, las
// 816x1264 celdas son un fichero de datos de 1 MB, y es un fichero que se
// regenera cada vez que se toca el trazado: en el historial del repositorio eso
// se acumula rápido.
//
// Un centro comercial es casi todo tramos largos de lo mismo —el suelo de un
// hipermercado, un muro, un pasillo—, así que contarlos en vez de escribirlos
// uno a uno lo deja en una fracción. El formato es el mínimo que funciona: el
// símbolo, y detrás cuántos seguidos van (nada si va uno solo). Los símbolos
// nunca son dígitos, así que no hay ambigüedad posible al leerlo.
//
//   '####...#'  ->  '#4.3#'
function comprimirFila(fila) {
  let salida = '';
  let i = 0;
  while (i < fila.length) {
    const ch = fila[i];
    let n = 1;
    while (i + n < fila.length && fila[i + n] === ch) n++;
    salida += n > 1 ? ch + n : ch;
    i += n;
  }
  return salida;
}

// PNG mínimo, escrito a mano con el zlib de node. Son ocho cuadrados de color
// plano: el tileset que Tiled necesita para dibujar algo. No es arte, es una
// leyenda de colores — el arte del centro comercial lo dibujará Sergio y este
// fichero se sustituye entonces sin tocar el .tmj.
function pngTileset() {
  const n = ORDEN.length;
  const w = n * CELDA, h = CELDA;
  const crudo = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const base = y * (1 + w * 3);
    crudo[base] = 0;                                  // filtro "none"
    for (let x = 0; x < w; x++) {
      const color = COLORES[ORDEN[(x / CELDA) | 0]];
      const p = base + 1 + x * 3;
      crudo[p] = color[0]; crudo[p + 1] = color[1]; crudo[p + 2] = color[2];
    }
  }

  const crc = (buf) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const trozo = (tipo, datos) => {
    const cab = Buffer.alloc(4);
    cab.writeUInt32BE(datos.length, 0);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const fin = Buffer.alloc(4);
    fin.writeUInt32BE(crc(cuerpo), 0);
    return Buffer.concat([cab, cuerpo, fin]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // RGB8

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(crudo)),
    trozo('IEND', Buffer.alloc(0))
  ]);
}

function escribirTmj(g, salidas, inicio) {
  // LA CAPA DE TILES VA COMPRIMIDA (base64 + zlib), que es el formato propio de
  // Tiled para mapas grandes. En claro son 1.031.424 números y el .tmj pesa 7 MB:
  // Tiled lo abre, pero es un fichero que no hay quien mueva ni guarde en el
  // repositorio. Comprimido baja a unos 40 KB y Tiled lo lee igual, sin que haya
  // que tocar nada al abrirlo.
  const crudo = Buffer.alloc(ANCHO * ALTO * 4);
  let p = 0;
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      crudo.writeUInt32LE(ORDEN.indexOf(g[y][x]) + 1, p);
      p += 4;
    }
  }
  const datos = zlib.deflateSync(crudo).toString('base64');

  // Los puntos sueltos —las salidas y el arranque— van en una CAPA DE OBJETOS,
  // no en la de tiles: en Tiled se arrastran con el ratón, que es exactamente
  // para lo que están aquí.
  const objetos = [];
  let id = 1;
  for (const s of salidas) {
    objetos.push({ id: id++, name: 'salida', type: 'salida', visible: true,
                   x: s.x * CELDA, y: s.y * CELDA, width: CELDA, height: CELDA, rotation: 0 });
  }
  objetos.push({ id: id++, name: 'inicio', type: 'inicio', visible: true,
                 x: inicio.x * CELDA, y: inicio.y * CELDA, width: CELDA, height: CELDA, rotation: 0 });

  return JSON.stringify({
    compressionlevel: -1, infinite: false,
    width: ANCHO, height: ALTO, tilewidth: CELDA, tileheight: CELDA,
    orientation: 'orthogonal', renderorder: 'right-down',
    type: 'map', version: '1.10', tiledversion: '1.10.2',
    nextlayerid: 3, nextobjectid: id,
    tilesets: [{
      firstgid: 1, name: 'lighthouse', tilewidth: CELDA, tileheight: CELDA,
      tilecount: ORDEN.length, columns: ORDEN.length, margin: 0, spacing: 0,
      image: 'lighthouse-tiles.png', imagewidth: ORDEN.length * CELDA, imageheight: CELDA
    }],
    layers: [
      { id: 1, name: 'suelo', type: 'tilelayer', visible: true, opacity: 1,
        x: 0, y: 0, width: ANCHO, height: ALTO,
        encoding: 'base64', compression: 'zlib', data: datos },
      { id: 2, name: 'puntos', type: 'objectgroup', visible: true, opacity: 1,
        x: 0, y: 0, draworder: 'topdown', objects: objetos }
    ]
  }, null, 1);
}

function escribirDatos(filas, salidas, inicio, semilla) {
  const enComillas = filas.map((f) => "  '" + comprimirFila(f) + "'").join(',\n');
  const pts = (l) => l.map((p) => '{ x: ' + p.x + ', y: ' + p.y + ' }').join(', ');
  return [
    '// EL MAPA DEL CC THE LIGHTHOUSE. Generado — NO se edita a mano.',
    '//',
    '// Sale de `node herramientas/mapa-lighthouse.js generar` (semilla ' + semilla + ') y se',
    '// regenera desde Tiled con `... importar` después de retocar',
    '// resources/mapas/lighthouse.tmj. Ver docs/anadir-un-nivel.md.',
    '//',
    '// Datos puros, como todo lo de datos/: una rejilla de caracteres y dos listas',
    '// de puntos. Quién decide qué significa cada símbolo es sistemas/rejillaMapa.js.',
    '//',
    "// LAS FILAS VAN COMPRIMIDAS POR TRAMOS (`codificacion: 'tramos'`): cada una es",
    '// el símbolo seguido de cuántas celdas iguales van seguidas, y nada si va una',
    "// sola. \"#4.3#\" son cuatro paredes, tres de pasillo y una pared. Sin esto el",
    '// fichero pasa de unos 200 KB a más de un mega, y se regenera cada vez que se',
    '// toca el trazado. Lo descomprime `iniciar` en sistemas/rejillaMapa.js.',
    '',
    '// Lado de la celda en unidades LÓGICAS. Coincide con TILE por comodidad de',
    '// lectura, no por obligación del motor.',
    'export const CELDA = ' + CELDA + ';',
    '',
    '// Qué es cada carácter. `solido` es lo único que mira la simulación; el resto',
    '// es el tipo de suelo, que hoy solo elige un color en el prototipo.',
    'export const LEYENDA = {',
    "  '" + PARED + "': { nombre: 'pared',        solido: true  },",
    "  '" + PASILLO + "': { nombre: 'pasillo',      solido: false },",
    "  '" + HIPER + "': { nombre: 'hipermercado', solido: false },",
    "  '" + IKEA + "': { nombre: 'mueblería',    solido: false },",
    "  '" + TIENDA + "': { nombre: 'tienda',       solido: false },",
    "  '" + OCIO + "': { nombre: 'ocio',         solido: false },",
    "  '" + PLAZA + "': { nombre: 'plaza',        solido: false },",
    '',
    '  // EL MOBILIARIO: sólido como la pared, con dibujo propio.',
    "  '" + ESTANTERIA + "': { nombre: 'estantería',   solido: true  },",
    "  '" + MOSTRADOR + "': { nombre: 'mostrador',    solido: true  },",
    '',
    '  // LAS TIENDAS PEQUEÑAS, cada una de lo suyo: el nombre es lo que elige sus',
    '  // paredes y sus estanterías (ver paredesMapa y estanteriasMapa en',
    '  // lighthouse.js). `c` ya no se genera; se queda por si un mapa viejo lo trae.',
    "  '" + ROPA + "': { nombre: 'ropa',         solido: false },",
    "  '" + JUGUETES + "': { nombre: 'juguetes',     solido: false },",
    "  '" + LIBROS + "': { nombre: 'libros',       solido: false },",
    "  '" + REGALOS + "': { nombre: 'regalos',      solido: false },",
    "  '" + DROGUERIA + "': { nombre: 'droguería',    solido: false },",
    "  '" + TECNOLOGIA + "': { nombre: 'tecnología',   solido: false },",
    "  '" + FRUTERIA + "': { nombre: 'alimentos',    solido: false },",
    '',
    '  // EL TECHO de una tienda cerrada: sólido y sin cara, no se entra ni se ve.',
    "  '" + TECHO + "': { nombre: 'techo',        solido: true  },",
    '',
    '  // EL PASILLO DE LOS ANILLOS 1 y 2: pasillo igual que `.`, con otro suelo.',
    "  '" + PASILLO_1 + "': { nombre: 'pasillo',      solido: false },",
    "  '" + PASILLO_2 + "': { nombre: 'pasillo',      solido: false },",
    '',
    '  // LAS PUERTAS. Empiezan SOLIDAS y las abre quien dice `abre`:',
    "  //   '10min' el jefe intermedio, '20min' el segundo, 'final' el jefe final,",
    '  // y con ese se acaba la fase. Quien avisa de que ha caido es main.js; aqui',
    '  // solo se dice cual abre cual.',
    "  '" + PUERTA_GRIS + "': { nombre: 'cierre gris', solido: true, puerta: 'gris',  abre: '10min' },",
    "  '" + PUERTA_AZUL + "': { nombre: 'cierre azul', solido: true, puerta: 'azul',  abre: '20min' },",
    "  '" + SALIDA + "': { nombre: 'salida',      solido: true, puerta: 'verde', abre: 'final' }",
    '};',
    '',
    'export const MAPA = {',
    "  codificacion: 'tramos',",
    '  ancho: ' + ANCHO + ',',
    '  alto: ' + ALTO + ',',
    '  // Dónde aparecen los jugadores, en celdas.',
    '  inicio: { x: ' + inicio.x + ', y: ' + inicio.y + ' },',
    '  // Las bocas de la fachada, en el anillo de fuera. Están CERRADAS hasta que',
    '  // cae el jefe final, y con él se acaba la fase.',
    '  salidas: [' + pts(salidas) + '],',
    '  filas: [',
    enComillas,
    '  ]',
    '};',
    ''
  ].join('\n');
}

// --- Entrada ------------------------------------------------------------------
function resumen(g, locales, salidas, taladros, zona, trazado) {
  const cuenta = {};
  for (const fila of g) for (const ch of fila) cuenta[ch] = (cuenta[ch] || 0) + 1;
  const total = ANCHO * ALTO;
  const libre = total - (cuenta[PARED] || 0) - (cuenta[ESTANTERIA] || 0) - (cuenta[MOSTRADOR] || 0);
  const tipos = {};
  for (const l of locales) tipos[l.tipo] = (tipos[l.tipo] || 0) + 1;
  console.log('  ' + ANCHO + 'x' + ALTO + ' celdas de ' + CELDA + ' = ' +
              (ANCHO * CELDA) + 'x' + (ALTO * CELDA) + ' unidades');
  console.log('  ' + (ANCHO * CELDA * ALTO * CELDA / (480 * 270)).toFixed(0) + ' pantallas de superficie');
  console.log('  transitable: ' + (libre / total * 100).toFixed(1) + '%  (' + libre + ' celdas)');
  console.log('  locales: ' + locales.length + ' ' + JSON.stringify(tipos));
  console.log('  mobiliario: ' + (cuenta[ESTANTERIA] || 0) + ' celdas de estantería, ' +
              (cuenta[MOSTRADOR] || 0) + ' de mostrador');
  console.log('  salidas: ' + salidas.length + '   taladros de conexión: ' + taladros);
  console.log('  cierres: ' + trazado.cierresGrises + ' grises (min 10), ' +
              trazado.cierresAzules + ' azules (min 20) y ' + salidas.length + ' salidas; ' +
              trazado.cierresRescate + ' cierres de rescate');
  const abiertas = locales.filter((l) => !l.cerrada && l.tipo !== PLAZA);
  const cerradas = locales.filter((l) => l.cerrada).length;
  const sinFila = abiertas.filter((l) => !l.lineales).length;
  console.log('  tiendas: ' + abiertas.length + ' abiertas, ' + cerradas + ' cerradas (techo); ' +
              'abiertas sin filas interiores: ' + sinFila);
  console.log('  esquinas en diagonal rellenadas: ' + trazado.esquinas +
              '; celdas de boca igualadas: ' + trazado.bocas);
  console.log('  galerías: ' + trazado.galerias + ' celdas abiertas; ' +
              'túneles de repaso: ' + trazado.tunelesAnillo);
  const quedanAbierto = contarHuecosEstrechos(g, true);
  const quedanCerrado = contarHuecosEstrechos(g, false);
  const quedan = quedanAbierto + quedanCerrado;
  console.log('  rendijas tapiadas (huecos por los que no cabe el jugador): ' +
              trazado.rendijas + '; quedan ' + quedanAbierto + ' con las puertas ' +
              'abiertas y ' + quedanCerrado + ' con ellas cerradas' +
              (quedan === 0 ? ' (bien)' : ' (MAL: hay paredes sin rematar)'));

  // Lo que ocupa cada anillo, que es lo que de verdad se juega en cada tramo.
  const porZona = [0, 0, 0];
  for (let i = 0; i < zona.length; i++) if (zona[i] >= 0) porZona[zona[i]]++;
  const sumaZ = porZona[0] + porZona[1] + porZona[2];
  console.log('  anillos: ' + porZona.map((v) => Math.round(v / sumaZ * 100) + '%').join(' / ') +
              '  (antes de cada jefe se juega solo su parte)');

  // LA COMPROBACIÓN QUE DE VERDAD IMPORTA: la partida tramo a tramo. En cada
  // uno se mira qué parte del centro comercial se puede recorrer desde el punto
  // de partida, y si las salidas ya se alcanzan. Un tramo que no crezca respecto
  // al anterior es un cierre que no abre nada, y eso no se ve jugando hasta que
  // alguien se pasa media hora dando vueltas.
  const inicio = trazado.inicio;
  // Pisable de verdad: sin el pie de las caras, que es suelo que se ve pero
  // no se pisa (con las caras de 14 celdas es un tercio de cada tienda).
  const pieTodo = marcarPie(g, true);
  let totalPisable = 0;
  for (let i = 0; i < ANCHO * ALTO; i++) {
    if (!esSolido(g[(i / ANCHO) | 0][i % ANCHO], true) && !pieTodo[i]) totalPisable++;
  }

  const tramos = [
    ['al empezar        ', false],
    ['tras el jefe 10min', [PUERTA_GRIS]],
    ['tras el jefe 20min', [PUERTA_GRIS, PUERTA_AZUL]],
    ['tras el jefe final', true]
  ];
  let previo = 0;
  for (const [nombre, abiertas] of tramos) {
    const { etiqueta, trozos } = componentes(g, abiertas);
    const raiz = etiqueta[inicio.y * ANCHO + inicio.x];
    const alcanzable = raiz >= 0 ? trozos[raiz].length : 0;
    const pct = (alcanzable / totalPisable * 100).toFixed(1);
    const crece = alcanzable > previo ? '' : '   <-- NO ABRE NADA';
    // ¿Se llega ya a alguna salida?
    let salidasOk = 0;
    for (const sa of salidas) {
      if (etiqueta[sa.y * ANCHO + sa.x] === raiz) salidasOk++;
    }
    console.log('  ' + nombre + ': ' + pct + '% del mapa, ' +
                salidasOk + '/' + salidas.length + ' salidas' + crece);
    previo = alcanzable;
  }
}

function generar(semilla) {
  const trazado = trazar(semilla);
  const dirMapas = path.join(RAIZ, 'resources', 'mapas');
  fs.mkdirSync(dirMapas, { recursive: true });
  fs.writeFileSync(path.join(dirMapas, 'lighthouse.tmj'),
                   escribirTmj(trazado.g, trazado.salidas, trazado.inicio));
  fs.writeFileSync(path.join(dirMapas, 'lighthouse-tiles.png'), pngTileset());
  fs.writeFileSync(path.join(RAIZ, 'js', 'datos', 'niveles', 'lighthouse-mapa.js'),
                   escribirDatos(filasDe(trazado.g), trazado.salidas, trazado.inicio, semilla));
  console.log('Centro comercial trazado con semilla ' + semilla + ':');
  resumen(trazado.g, trazado.locales, trazado.salidas, trazado.taladros,
          trazado.zona, trazado);
  console.log('');
  console.log('  resources/mapas/lighthouse.tmj       <- abrir en Tiled');
  console.log('  resources/mapas/lighthouse-tiles.png');
  console.log('  js/datos/niveles/lighthouse-mapa.js  <- lo que lee el juego');
}

// El camino de vuelta: lo retocado en Tiled entra en el juego. Solo se leen la
// capa de tiles y la de puntos; cualquier otra capa que Sergio añada se ignora
// sin quejarse, que es lo correcto para un editor donde se dibujan guías.
function importar() {
  const ruta = path.join(RAIZ, 'resources', 'mapas', 'lighthouse.tmj');
  const tmj = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  if (tmj.width !== ANCHO || tmj.height !== ALTO) {
    console.warn('  aviso: el .tmj mide ' + tmj.width + 'x' + tmj.height +
                 ' y este script espera ' + ANCHO + 'x' + ALTO + '.');
  }
  const capa = tmj.layers.find((c) => c.type === 'tilelayer');
  if (!capa) throw new Error('el .tmj no tiene capa de tiles');

  // La capa puede venir en claro (una lista de números) o comprimida, que es
  // como la escribe este mismo script y como la deja Tiled al guardar. Se
  // aceptan las dos: si alguien reguarda el mapa con otros ajustes, sigue
  // entrando.
  let gids;
  if (Array.isArray(capa.data)) {
    gids = capa.data;
  } else {
    let bruto = Buffer.from(capa.data, 'base64');
    if (capa.compression === 'zlib') bruto = zlib.inflateSync(bruto);
    else if (capa.compression === 'gzip') bruto = zlib.gunzipSync(bruto);
    else if (capa.compression) throw new Error('compresión no soportada: ' + capa.compression);
    gids = new Uint32Array(bruto.buffer, bruto.byteOffset, bruto.length / 4);
  }

  const g = [];
  for (let y = 0; y < tmj.height; y++) {
    const fila = [];
    for (let x = 0; x < tmj.width; x++) {
      const gid = gids[y * tmj.width + x];
      // Un hueco sin pintar es pared: es lo seguro. Lo contrario abriría un
      // agujero al vacío por un despiste con el borrador.
      fila.push(gid >= 1 && gid <= ORDEN.length ? ORDEN[gid - 1] : PARED);
    }
    g.push(fila);
  }

  const puntos = tmj.layers.find((c) => c.type === 'objectgroup');
  const salidas = [];
  let inicio = null;
  for (const o of (puntos ? puntos.objects : [])) {
    const p = { x: Math.round(o.x / CELDA), y: Math.round(o.y / CELDA) };
    const clase = o.type || o.class || o.name;
    if (clase === 'salida') salidas.push(p);
    else if (clase === 'inicio') inicio = p;
  }
  if (!inicio) inicio = celdaLibreCerca(g, tmj.width >> 1, tmj.height >> 1);

  // Lo retocado a mano también puede dejar rendijas: un tabique arrastrado un
  // píxel de más es exactamente el caso. Aquí se AVISA en vez de taparlas solas,
  // porque lo que Sergio haya dibujado manda — pero conviene que lo sepa.
  const rendijas = contarHuecosEstrechos(g, true) + contarHuecosEstrechos(g, false);
  if (rendijas > 0) {
    console.warn('  AVISO: ' + rendijas + ' celdas de suelo por las que no cabe el ' +
                 'jugador (paredes que no llegan a tocarse). Se importan tal cual.');
  }

  const piezas = componentes(g, true).trozos.length;
  if (piezas !== 1) {
    console.warn('  AVISO: el mapa tiene ' + piezas + ' piezas transitables sueltas.');
    console.warn('  Hay suelo al que no se puede llegar. Se importa igual, pero revísalo en Tiled.');
  }

  fs.writeFileSync(path.join(RAIZ, 'js', 'datos', 'niveles', 'lighthouse-mapa.js'),
                   escribirDatos(filasDe(g), salidas, inicio, 'editada a mano en Tiled'));
  console.log('Importado de ' + path.relative(RAIZ, ruta) + ':');
  console.log('  ' + salidas.length + ' salidas, inicio en (' + inicio.x + ', ' + inicio.y +
              '), ' + piezas + ' pieza(s)');
  console.log('  js/datos/niveles/lighthouse-mapa.js reescrito');
}

const modo = process.argv[2] || 'generar';
if (modo === 'generar') generar(parseInt(process.argv[3] || '20260919', 10));
else if (modo === 'importar') importar();
else {
  console.log('uso: node herramientas/mapa-lighthouse.js [generar [semilla] | importar]');
  process.exit(1);
}

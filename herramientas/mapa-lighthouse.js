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
const CELDA = 8;

// Todo el trazado se piensa en "módulos" de 32 unidades —que es como se pensó
// cuando la celda medía eso— y se expresa en celdas multiplicando por esto. Así
// los números de abajo siguen leyéndose igual (un pasillo de 3 o 4 módulos) y
// cambiar la finura de la rejilla es cambiar una constante.
const F = 4;                      // celdas por módulo (32 / CELDA)

// EL TAMAÑO, EN MÓDULOS. 316x204 módulos son 10112x6528 unidades: 509 pantallas
// de 480x270, ocho veces la superficie que tenía el primer trazado (64). Es lo
// que pidió Sergio, y es una sola línea si hay que volver atrás — el resto del
// generador no tiene ni un número que dependa del tamaño del mapa.
const ANCHO = 316 * F;
const ALTO = 204 * F;

// Lo que mide de grueso un tabique: UNA celda, que es el mínimo posible. La
// fachada del edificio va aparte y es más gorda, que para eso es la fachada.
const TABIQUE = 1;
const FACHADA = 3;

// El alfabeto del mapa. El juego solo distingue PARED de lo demás; los otros
// símbolos son el TIPO de suelo, y de momento solo sirven para pintarlo de un
// color distinto en el prototipo (y para saber dónde está cada cosa al mirar el
// fichero, que no es poco con 8064 celdas).
const PARED      = '#';
const PASILLO    = '.';
const HIPER      = 'a';   // pasillos de alimentos, estilo Carrefour/Mercadona
const IKEA       = 'b';   // el recorrido largo del que no se sale
const TIENDA     = 'c';   // habitación simple
const OCIO       = 'd';   // cines, bolera, restaurantes
const PLAZA      = 'f';   // food trucks y zona central

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

// El orden es el del tileset: el gid de Tiled es este índice + 1.
const ORDEN = [PARED, PASILLO, HIPER, IKEA, TIENDA, OCIO, PLAZA, SALIDA,
               PUERTA_GRIS, PUERTA_AZUL];
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
  [PUERTA_AZUL]: [0x4f, 0x8f, 0xd8]
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
// Los cortes alternan según el lado más largo, que es lo que da la retícula
// irregular de un centro comercial de verdad en vez de un tablero de ajedrez.
function partir(g, x0, y0, w, h, profundidad, rng, hojas) {
  const MIN = 11 * F;                 // por debajo de esto ya no cabe local + pasillo
  if (profundidad === 0 || (w < MIN * 2 && h < MIN * 2)) {
    hojas.push({ x: x0, y: y0, w, h });
    return;
  }

  // PARAR ANTES DE TIEMPO, A VECES. Partiendo siempre hasta el fondo salen
  // treinta locales del mismo tamaño y un centro comercial no es eso: es dos
  // moles —el IKEA y el hipermercado— y veinte cosas pequeñas colgando de los
  // pasillos. Dejando de partir de vez en cuando cuando la región ya es grande,
  // esas moles aparecen solas.
  const area = w * h;
  if (area >= 520 * F * F && area <= 980 * F * F && rng() < 0.55) {
    hojas.push({ x: x0, y: y0, w, h });
    return;
  }

  // Se corta por el lado LARGO salvo que ese lado ya no dé para dos locales; en
  // ese caso se corta por el otro, que es el único que queda. Que los dos sean
  // demasiado cortos es imposible aquí: eso ya salió por arriba como hoja.
  let porAncho = w >= h;
  if (porAncho && w < MIN * 2) porAncho = false;
  else if (!porAncho && h < MIN * 2) porAncho = true;
  const anchoPasillo = rnd(rng, 3 * F, 4 * F);   // "pasillos anchos": 96 o 128 unidades

  if (porAncho) {
    // El corte no va nunca al 50%: locales todos iguales se leen como un almacén.
    const corte = x0 + Math.floor(w * (0.34 + rng() * 0.32));
    rellenar(g, corte, y0, anchoPasillo, h, PASILLO);
    partir(g, x0, y0, corte - x0, h, profundidad - 1, rng, hojas);
    const dcha = x0 + w - (corte + anchoPasillo);
    partir(g, corte + anchoPasillo, y0, dcha, h, profundidad - 1, rng, hojas);
  } else {
    const corte = y0 + Math.floor(h * (0.34 + rng() * 0.32));
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
  if (area >= 500) return rng() < 0.5 ? IKEA : HIPER;
  if (area >= 260) return rng() < 0.5 ? HIPER : OCIO;
  if (area >= 120) return OCIO;
  return TIENDA;
}

// El local ocupa la hoja menos un anillo de pared. El anillo es lo que separa
// una tienda de la de al lado y del pasillo: sin él, todo sería una nave diáfana.
function carvarLocal(g, hoja, rng, locales) {
  const x0 = hoja.x + TABIQUE, y0 = hoja.y + TABIQUE;
  const w = hoja.w - TABIQUE * 2, h = hoja.h - TABIQUE * 2;
  if (w < 4 * F || h < 4 * F) return;         // hueco residual: se queda macizo

  const tipo = tipoDeLocal(w, h, rng);
  rellenar(g, x0, y0, w, h, tipo);
  locales.push({ x: x0, y: y0, w, h, tipo });
}

// Lo de dentro de cada local. AQUÍ ES DONDE SE DECIDE CUÁNTO ESTORBA EL MAPA, y
// el encargo era no abusar: las estanterías dejan siempre pasillo a los lados y
// ninguna cierra el local de lado a lado.
function amueblar(g, local, rng) {
  const { x, y, w, h, tipo } = local;

  if (tipo === HIPER) {
    // Lineales de estantería en el lado largo, con cabecera libre arriba y abajo
    // para poder cambiar de pasillo sin recorrerlo entero.
    const vertical = h >= w;
    const paso = 3 * F;                        // estantería, y dos módulos de paso
    if (vertical) {
      for (let cx = x + 2 * F; cx < x + w - 2 * F; cx += paso) {
        for (let k = 0; k < TABIQUE; k++) {
          for (let cy = y + 2 * F; cy < y + h - 2 * F; cy++) g[cy][cx + k] = PARED;
        }
      }
    } else {
      for (let cy = y + 2 * F; cy < y + h - 2 * F; cy += paso) {
        for (let k = 0; k < TABIQUE; k++) {
          for (let cx = x + 2 * F; cx < x + w - 2 * F; cx++) g[cy + k][cx] = PARED;
        }
      }
    }
    return;
  }

  if (tipo === IKEA) {
    // El recorrido en serpentina del que no se sale: tabiques largos que dejan
    // el paso alternando de un lado al otro. Es el trozo más laberíntico del
    // mapa a propósito — es lo que hace un IKEA.
    let abierto = 0;
    for (let cy = y + 3 * F; cy < y + h - 3 * F; cy += 4 * F) {
      // El tabique, de lado a lado del local.
      for (let j = 0; j < TABIQUE; j++) {
        for (let cx = x + 1; cx < x + w - 1; cx++) g[cy + j][cx] = PARED;
      }
      // Y el hueco de paso, en un extremo y alternando: eso es la serpentina.
      const bx = abierto % 2 === 0 ? x + 1 : x + w - 1 - 3 * F;
      for (let j = 0; j < TABIQUE; j++) {
        for (let k = 0; k < 3 * F; k++) if (dentro(bx + k, cy + j)) g[cy + j][bx + k] = tipo;
      }
      abierto++;
    }
    return;
  }

  if (tipo === OCIO) {
    // Cines, bolera y restaurantes: cuatro bloques sueltos —una barra, unas
    // butacas— y nada más. Ocupan poco y no cortan ningún paso.
    const n = rnd(rng, 2, 4);
    for (let i = 0; i < n; i++) {
      const bw = rnd(rng, 2 * F, 4 * F), bh = rnd(rng, 2 * F, 3 * F);
      const bx = rnd(rng, x + 2 * F, x + w - bw - 2 * F);
      const by = rnd(rng, y + 2 * F, y + h - bh - 2 * F);
      rellenar(g, bx, by, bw, bh, PARED);
    }
  }
  // TIENDA: habitación simple, vacía. Es el respiro entre las demás.
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
    let px, py, dx = 0, dy = 0, ox = 0, oy = 0;
    if (lado === 0) {
      px = rnd(rng, local.x, local.x + local.w - PUERTA); py = local.y - 1; dy = -1; ox = 1;
    } else if (lado === 1) {
      px = rnd(rng, local.x, local.x + local.w - PUERTA); py = local.y + local.h; dy = 1; ox = 1;
    } else if (lado === 2) {
      px = local.x - 1; py = rnd(rng, local.y, local.y + local.h - PUERTA); dx = -1; oy = 1;
    } else {
      px = local.x + local.w; py = rnd(rng, local.y, local.y + local.h - PUERTA); dx = 1; oy = 1;
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
    for (let k = 0; k <= ALCANCE; k++) {
      const tx = px + dx * k, ty = py + dy * k;
      if (!dentro(tx, ty)) break;
      let tocado = false;
      for (let w = 0; w < PUERTA; w++) {
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
  if (ch === PARED) return true;
  if (ch !== PUERTA_GRIS && ch !== PUERTA_AZUL && ch !== SALIDA) return false;
  if (abiertas === true) return false;
  if (!abiertas) return true;
  return abiertas.indexOf(ch) < 0;
}

function componentes(g, puertasAbiertas) {
  const etiqueta = new Int32Array(ANCHO * ALTO).fill(-1);
  const trozos = [];
  const cola = new Int32Array(ANCHO * ALTO);

  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const i = y * ANCHO + x;
      if (esSolido(g[y][x], puertasAbiertas) || etiqueta[i] !== -1) continue;
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
          if (esSolido(g[ny][nx], puertasAbiertas) || etiqueta[ni] !== -1) continue;
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
function conectar(g, puertasAbiertas, protegidas, zona) {
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

    const previo = new Int32Array(ANCHO * ALTO).fill(-2);
    const cola = new Int32Array(ANCHO * ALTO);
    let fin = 0, ini = 0;
    for (const c of trozos[suelto]) { previo[c] = -1; cola[fin++] = c; }
    // El anillo del rincón: el de su primera celda. Un rincón no puede estar a
    // caballo de dos, porque las barreras los separan.
    const anillo = zona ? zona[trozos[suelto][0]] : -1;

    let destino = -1;
    while (ini < fin && destino === -1) {
      const c = cola[ini++];
      const cx = c % ANCHO, cy = (c / ANCHO) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        // El borde del mapa no se taladra: es la fachada del edificio.
        if (nx < 1 || ny < 1 || nx >= ANCHO - 1 || ny >= ALTO - 1) continue;
        const ni = ny * ANCHO + nx;
        if (protegidas && protegidas[ni]) continue;
        if (zona && zona[ni] !== anillo) continue;
        if (previo[ni] !== -2) continue;
        previo[ni] = c;
        if (etiqueta[ni] === principal) { destino = ni; break; }
        cola[fin++] = ni;
      }
    }

    if (destino === -1) {
      // No hay forma de llegar: se tapia el trozo para que no quede suelo
      // inalcanzable donde caiga una gema que nadie va a poder recoger.
      console.warn('    [tapiado] rincón de ' + trozos[suelto].length +
                   ' celdas en el anillo ' + anillo + ': no hay por dónde unirlo');
      for (const c of trozos[suelto]) g[(c / ANCHO) | 0][c % ANCHO] = PARED;
      vueltas++;
      continue;
    }

    // El túnel se abre de PUERTA celdas de ancho. Con una sola, el pasadizo
    // sería más estrecho que el propio jugador y no se pasaría por él.
    const radio = PUERTA >> 1;
    for (let c = destino; c !== -1; c = previo[c]) {
      const cx = c % ANCHO, cy = (c / ANCHO) | 0;
      for (let oy = -radio; oy <= radio; oy++) {
        for (let ox = -radio; ox <= radio; ox++) {
          const nx = cx + ox, ny = cy + oy;
          // La fachada no se toca: el agujero de salida lo abre quien toca.
          if (nx < FACHADA || ny < FACHADA ||
              nx >= ANCHO - FACHADA || ny >= ALTO - FACHADA) continue;
          if (protegidas && protegidas[ny * ANCHO + nx]) continue;
          if (g[ny][nx] === PARED) g[ny][nx] = PASILLO;
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
const RADIO_CIERRE = 4;

// LA GALERÍA CIRCULAR DE UN ANILLO: el pasillo que le da la vuelta por dentro.
//
// Es lo que hace un centro comercial de verdad —la galería que recorre la planta
// entera— y aquí además es lo que garantiza que se pueda ir de un lado a otro del
// anillo sin salir de él. Sin ella, para cruzar de un brazo al de enfrente habría
// que pasar por el centro, que está cerrado hasta que caiga el jefe de turno.
//
// Como los anillos son círculos de verdad (ver `zonificar`), la galería es un
// anillo geométrico: se abre todo lo que caiga entre dos radios.
function galeria(g, dist, zona, anillo, desde, hasta, protegidas) {
  let abiertas = 0;
  for (let y = FACHADA; y < ALTO - FACHADA; y++) {
    for (let x = FACHADA; x < ANCHO - FACHADA; x++) {
      const i = y * ANCHO + x;
      if (zona[i] !== anillo) continue;
      if (protegidas && protegidas[i]) continue;
      const d = dist[i];
      if (d < desde || d > hasta) continue;
      if (g[y][x] !== PARED) continue;
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
function zonificar(g, inicio) {
  const n = ANCHO * ALTO;
  const radios = [];
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      if (g[y][x] === PARED) continue;
      const dx = x - inicio.x, dy = y - inicio.y;
      radios.push(Math.sqrt(dx * dx + dy * dy));
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
      const dx = x - inicio.x, dy = y - inicio.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      dist[i] = d;
      zona[i] = d <= r1 ? 0 : (d <= r2 ? 1 : 2);
    }
  }
  return { zona, dist, u1: r1, u2: r2 };
}

// Tapiar la frontera entre el anillo `k` y los de fuera. Devuelve las celdas
// tapiadas, que son las candidatas a convertirse en cierre, y deja marcada la
// frontera ENTERA —muro incluido— en `protegidas`.
function tapiarFrontera(g, zona, k, protegidas) {
  const frontera = [];
  for (let y = 1; y < ALTO - 1; y++) {
    for (let x = 1; x < ANCHO - 1; x++) {
      const i = y * ANCHO + x;
      if (zona[i] !== k) continue;
      let toca = false;
      for (let v = 0; v < 4 && !toca; v++) {
        const nx = x + [1, -1, 0, 0][v], ny = y + [0, 0, 1, -1][v];
        // "Mayor que k" y no "igual a k+1": con los anillos metidos en la pared
        // puede haber un punto donde el 0 toque directamente al 2, y ese punto
        // también hay que cerrarlo.
        if (zona[ny * ANCHO + nx] > k) toca = true;
      }
      if (!toca) continue;
      protegidas[i] = 1;
      if (g[y][x] !== PARED) frontera.push(i);
    }
  }
  for (const i of frontera) g[(i / ANCHO) | 0][i % ANCHO] = PARED;
  return frontera;
}

// Abrir un cierre en la celda `centro` de una frontera: todas las celdas de esa
// frontera que le queden cerca pasan a ser puerta.
function abrirCierre(g, frontera, centro, simbolo) {
  const ex = centro % ANCHO, ey = (centro / ANCHO) | 0;
  const r2 = RADIO_CIERRE * RADIO_CIERRE * 4;
  for (const i of frontera) {
    const cx = i % ANCHO, cy = (i / ANCHO) | 0;
    const dx = cx - ex, dy = cy - ey;
    if (dx * dx + dy * dy > r2) continue;
    g[cy][cx] = simbolo;
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
function unirAnillo(g, zona, k, protegidas) {
  let tuneles = 0;
  // Lóbulos que ya se ha intentado coser y no se ha podido. Se apuntan porque las
  // piezas se recalculan en cada vuelta y, sin esto, se reintentaría el mismo
  // para siempre.
  const rendidos = new Set();
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    // Piezas transitables DE ESTE ANILLO. Las puertas cuentan como paso: lo que
    // se mira es si el anillo se recorre entero una vez dentro de él.
    const etiqueta = new Int32Array(ANCHO * ALTO).fill(-1);
    const cola = new Int32Array(ANCHO * ALTO);
    const trozos = [];
    for (let y = 0; y < ALTO; y++) {
      for (let x = 0; x < ANCHO; x++) {
        const i = y * ANCHO + x;
        if (zona[i] !== k || etiqueta[i] !== -1) continue;
        if (esSolido(g[y][x], true)) continue;
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
            if (esSolido(g[ny][nx], true)) continue;
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

    // Camino más corto desde el lóbulo suelto hasta el grande, atravesando muro
    // pero SIN salirse del anillo ni tocar la membrana.
    const previo = new Int32Array(ANCHO * ALTO).fill(-2);
    let fin = 0, ini = 0;
    for (const c of trozos[suelto]) { previo[c] = -1; cola[fin++] = c; }

    let destino = -1;
    while (ini < fin && destino === -1) {
      const c = cola[ini++];
      const cx = c % ANCHO, cy = (c / ANCHO) | 0;
      for (let v = 0; v < 4; v++) {
        const nx = cx + [1, -1, 0, 0][v], ny = cy + [0, 0, 1, -1][v];
        if (nx < FACHADA || ny < FACHADA ||
            nx >= ANCHO - FACHADA || ny >= ALTO - FACHADA) continue;
        const ni = ny * ANCHO + nx;
        if (previo[ni] !== -2) continue;
        if (zona[ni] !== k) continue;              // no se sale del anillo
        if (protegidas[ni]) continue;              // ni toca la membrana
        previo[ni] = c;
        if (etiqueta[ni] === principal) { destino = ni; break; }
        cola[fin++] = ni;
      }
    }

    if (destino === -1) {
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

    // Y a abrir el pasillo, ancho como una puerta.
    const radio = PUERTA >> 1;
    for (let c = destino; c !== -1; c = previo[c]) {
      const cx = c % ANCHO, cy = (c / ANCHO) | 0;
      for (let oy = -radio; oy <= radio; oy++) {
        for (let ox = -radio; ox <= radio; ox++) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < FACHADA || ny < FACHADA ||
              nx >= ANCHO - FACHADA || ny >= ALTO - FACHADA) continue;
          const ni = ny * ANCHO + nx;
          if (protegidas[ni] || zona[ni] !== k) continue;
          if (g[ny][nx] === PARED) g[ny][nx] = PASILLO;
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
function cierresRepartidos(g, frontera, simbolo, inicio, cuantos) {
  const elegidos = [];

  // Separaciones mínimas a probar, de más exigente a menos (en celdas: 150 son
  // 1200 unidades, dos pantallas y media). Se empieza por la buena y solo se
  // afloja si con ella no caben los ocho — más vale un par de cierres algo
  // juntos que quedarse en seis. Con la frontera que sale hoy, la primera basta.
  const SEPARACIONES = [150, 110, 80, 55, 40, 0];

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
      abrirCierre(g, frontera, mejor, simbolo);
    }
    if (elegidos.length >= cuantos) break;
  }
  return elegidos.length;
}

// --- El trazado completo ------------------------------------------------------
function trazar(semilla) {
  const rng = crearRng(semilla);
  const g = crearRejilla();
  const hojas = [];

  // 8 niveles de partición sobre 316x204 módulos dan del orden de 130-180
  // locales, que es lo que le toca a un centro comercial ocho veces mayor que el
  // de 19 locales que tenía el primer trazado.
  partir(g, FACHADA, FACHADA, ANCHO - FACHADA * 2, ALTO - FACHADA * 2, 8, rng, hojas);

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

  for (const l of locales) amueblar(g, l, rng);
  for (const l of locales) abrirPuerta(g, l, rng);

  levantarFachada(g);
  const taladros = conectar(g, false, null, null);

  // DÓNDE EMPIEZA LA PARTIDA: la plaza si la hay, y si no el centro del mapa,
  // corrido hasta la celda transitable más cercana. Tiene que decidirse ANTES de
  // repartir los anillos, porque los anillos se miden desde aquí.
  const cx = plaza ? Math.floor(plaza.x + plaza.w / 2) : ANCHO >> 1;
  const cy = plaza ? Math.floor(plaza.y + plaza.h / 2) : ALTO >> 1;
  const inicio = celdaLibreCerca(g, cx, cy);

  // --- Los tres anillos y sus cierres ---------------------------------------
  const { zona, dist, u1, u2 } = zonificar(g, inicio);
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
  const W = PUERTA;
  const galerias =
    galeria(g, dist, zona, 0, u1 - W * 2, u1 - W, protegidas) +   // borde del anillo 0
    galeria(g, dist, zona, 1, u1 + W, u1 + W * 2, protegidas) +   // cara interior del 1
    galeria(g, dist, zona, 1, u2 - W * 2, u2 - W, protegidas) +   // cara exterior del 1
    galeria(g, dist, zona, 2, u2 + W, u2 + W * 2, protegidas);    // cara interior del 2

  // Y la red por debajo: si aun así queda algún lóbulo suelto, se une por dentro
  // del propio anillo. Con las galerías puestas esto casi nunca hace nada.
  const tunelesAnillo = unirAnillo(g, zona, 0, protegidas) +
                        unirAnillo(g, zona, 1, protegidas) +
                        unirAnillo(g, zona, 2, protegidas);

  const cierresGrises = cierresRepartidos(g, fronteras[0].celdas, PUERTA_GRIS,
                                          inicio, CIERRES_POR_FRONTERA);
  const cierresAzules = cierresRepartidos(g, fronteras[1].celdas, PUERTA_AZUL,
                                          inicio, CIERRES_POR_FRONTERA);

  // Y las salidas de la calle, que van en el anillo de fuera.
  const salidas = abrirSalidas(g, zona, rng);

  // Las salidas tampoco: son la fachada.
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      if (g[y][x] === SALIDA) protegidas[y * ANCHO + x] = 1;
    }
  }

  // Con TODAS las puertas abiertas el centro comercial tiene que recorrerse
  // entero. Es lo que garantiza que no queda una tienda a la que no se llegue
  // nunca, ni siquiera al final de la partida.
  const taladros2 = conectar(g, true, protegidas, zona);

  // Y LA ÚLTIMA COMPROBACIÓN: que a cada salida se llegue de verdad. El punto
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

  return { g, locales, salidas, inicio, zona, tunelesAnillo, galerias,
           taladros: taladros + taladros2, cierresGrises, cierresAzules };
}

function celdaLibreCerca(g, cx, cy) {
  for (let r = 0; r < Math.max(ANCHO, ALTO); r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!dentro(x, y)) continue;
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (g[y][x] !== PARED) return { x, y };
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
  const libre = total - (cuenta[PARED] || 0);
  const tipos = {};
  for (const l of locales) tipos[l.tipo] = (tipos[l.tipo] || 0) + 1;
  console.log('  ' + ANCHO + 'x' + ALTO + ' celdas de ' + CELDA + ' = ' +
              (ANCHO * CELDA) + 'x' + (ALTO * CELDA) + ' unidades');
  console.log('  ' + (ANCHO * CELDA * ALTO * CELDA / (480 * 270)).toFixed(0) + ' pantallas de superficie');
  console.log('  transitable: ' + (libre / total * 100).toFixed(1) + '%  (' + libre + ' celdas)');
  console.log('  locales: ' + locales.length + ' ' + JSON.stringify(tipos));
  console.log('  salidas: ' + salidas.length + '   taladros de conexión: ' + taladros);
  console.log('  cierres: ' + trazado.cierresGrises + ' grises (min 10), ' +
              trazado.cierresAzules + ' azules (min 20) y ' + salidas.length + ' salidas');
  console.log('  galerías circulares: ' + trazado.galerias + ' celdas abiertas; ' +
              'túneles de repaso: ' + trazado.tunelesAnillo);

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
  let totalPisable = 0;
  for (const fila of g) for (const ch of fila) if (!esSolido(ch, true)) totalPisable++;

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

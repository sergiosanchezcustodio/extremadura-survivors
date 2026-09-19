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
const ANCHO = 112 * F;
const ALTO = 72 * F;

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
const SALIDA     = 'S';

// El orden es el del tileset: el gid de Tiled es este índice + 1.
const ORDEN = [PARED, PASILLO, HIPER, IKEA, TIENDA, OCIO, PLAZA, SALIDA];
const COLORES = {
  [PARED]:   [0x3a, 0x3f, 0x4a],
  [PASILLO]: [0xd8, 0xd4, 0xcc],
  [HIPER]:   [0xbd, 0xd6, 0xc0],
  [IKEA]:    [0xe6, 0xdc, 0xa8],
  [TIENDA]:  [0xd6, 0xc6, 0xd8],
  [OCIO]:    [0xc6, 0xbe, 0xe4],
  [PLAZA]:   [0xe8, 0xcf, 0xb0],
  [SALIDA]:  [0x66, 0xd2, 0x78]
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
function componentes(g) {
  const etiqueta = new Int32Array(ANCHO * ALTO).fill(-1);
  const trozos = [];
  const cola = new Int32Array(ANCHO * ALTO);

  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const i = y * ANCHO + x;
      if (g[y][x] === PARED || etiqueta[i] !== -1) continue;
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
          if (g[ny][nx] === PARED || etiqueta[ni] !== -1) continue;
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
function conectar(g) {
  let vueltas = 0;
  for (;;) {
    const { etiqueta, trozos } = componentes(g);
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

    let destino = -1;
    while (ini < fin && destino === -1) {
      const c = cola[ini++];
      const cx = c % ANCHO, cy = (c / ANCHO) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        // El borde del mapa no se taladra: es la fachada del edificio.
        if (nx < 1 || ny < 1 || nx >= ANCHO - 1 || ny >= ALTO - 1) continue;
        const ni = ny * ANCHO + nx;
        if (previo[ni] !== -2) continue;
        previo[ni] = c;
        if (etiqueta[ni] === principal) { destino = ni; break; }
        cola[fin++] = ni;
      }
    }

    if (destino === -1) {
      // No hay forma de llegar: se tapia el trozo para que no quede suelo
      // inalcanzable donde caiga una gema que nadie va a poder recoger.
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
function fachadaYSalidas(g, rng) {
  // La fachada es más gorda que un tabique: es el muro del edificio.
  for (let k = 0; k < FACHADA; k++) {
    for (let x = 0; x < ANCHO; x++) { g[k][x] = PARED; g[ALTO - 1 - k][x] = PARED; }
    for (let y = 0; y < ALTO; y++) { g[y][k] = PARED; g[y][ANCHO - 1 - k] = PARED; }
  }

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
      if (g[y][x] === PASILLO) candidatos.push([x, y]);
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
    salidas.push({ x: x + lado.dir[0] * FACHADA, y: y + lado.dir[1] * FACHADA });
  }
  return salidas;
}

// --- El trazado completo ------------------------------------------------------
function trazar(semilla) {
  const rng = crearRng(semilla);
  const g = crearRejilla();
  const hojas = [];

  // 5 niveles de partición sobre 112x72 dan del orden de 20-32 locales, que es
  // lo que tiene un centro comercial grande de verdad.
  partir(g, FACHADA, FACHADA, ANCHO - FACHADA * 2, ALTO - FACHADA * 2, 5, rng, hojas);

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

  const taladros = conectar(g);
  const salidas = fachadaYSalidas(g, rng);
  // Abrir la fachada puede dejar suelto algún trozo que tocaba el borde.
  conectar(g);

  // DÓNDE EMPIEZA LA PARTIDA: la plaza si la hay, y si no el centro del mapa,
  // corrido hasta la celda transitable más cercana.
  const cx = plaza ? Math.floor(plaza.x + plaza.w / 2) : ANCHO >> 1;
  const cy = plaza ? Math.floor(plaza.y + plaza.h / 2) : ALTO >> 1;
  const inicio = celdaLibreCerca(g, cx, cy);

  return { g, locales, salidas, inicio, taladros };
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
  const datos = [];
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) datos.push(ORDEN.indexOf(g[y][x]) + 1);
  }

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
        x: 0, y: 0, width: ANCHO, height: ALTO, data: datos },
      { id: 2, name: 'puntos', type: 'objectgroup', visible: true, opacity: 1,
        x: 0, y: 0, draworder: 'topdown', objects: objetos }
    ]
  }, null, 1);
}

function escribirDatos(filas, salidas, inicio, semilla) {
  const enComillas = filas.map((f) => "  '" + f + "'").join(',\n');
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
    "  '" + SALIDA + "': { nombre: 'salida',       solido: false }",
    '};',
    '',
    'export const MAPA = {',
    '  ancho: ' + ANCHO + ',',
    '  alto: ' + ALTO + ',',
    '  // Dónde aparecen los jugadores, en celdas.',
    '  inicio: { x: ' + inicio.x + ', y: ' + inicio.y + ' },',
    '  // Las bocas de la fachada. Hoy son señalización: se gana venciendo al jefe',
    '  // final, que entra por una de ellas reventando la pared.',
    '  salidas: [' + pts(salidas) + '],',
    '  filas: [',
    enComillas,
    '  ]',
    '};',
    ''
  ].join('\n');
}

// --- Entrada ------------------------------------------------------------------
function resumen(g, locales, salidas, taladros) {
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
  const piezas = componentes(g).trozos.length;
  console.log('  piezas transitables: ' + piezas + (piezas === 1 ? ' (bien)' : ' (MAL: hay suelo aislado)'));
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
  resumen(trazado.g, trazado.locales, trazado.salidas, trazado.taladros);
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

  const g = [];
  for (let y = 0; y < tmj.height; y++) {
    const fila = [];
    for (let x = 0; x < tmj.width; x++) {
      const gid = capa.data[y * tmj.width + x];
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

  const piezas = componentes(g).trozos.length;
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

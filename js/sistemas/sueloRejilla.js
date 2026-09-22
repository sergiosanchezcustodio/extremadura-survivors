import { ANCHO_LOGICO, ALTO_LOGICO, ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { RejillaMapa } from './rejillaMapa.js';

// EL SUELO DE UN NIVEL DE REJILLA: una textura por símbolo de la leyenda, y un
// caché por trozos para no pintar dos mil celdas por fotograma.
//
// QUÉ SE DIBUJA. Cada símbolo del mapa —pasillo, cada tipo de tienda, pared,
// estantería, mostrador, puertas— lleva una TEXTURA que se repite: una imagen de
// TEXTURA x TEXTURA unidades que se recorta en trozos de una celda (8x8). Una
// celda del pasillo en (cx, cy) pinta el trozo (cx % 4, cy % 4) de la textura
// del pasillo, así que la textura se ve entera cada cuatro celdas y no hay
// costura mientras el dibujo repita bien en los dos ejes.
//
// DE DÓNDE SALEN. De `texturasMapa` en los datos del nivel: símbolo → ruta de
// un PNG. El PNG lo dibuja Sergio, y hasta que exista cada uno se sustituye por
// un dibujo PROCEDURAL hecho aquí a partir del color plano de `coloresMapa`: un
// terrazo, unos tablones, una moqueta. Es arte de relleno y se ve como tal, pero
// distingue un suelo de otro, que es lo que hace falta para leer el mapa. Y no
// entra en assets/: se genera en memoria al cargar el nivel y se va con él.
//
// CUÁNTO CUESTA. En pantalla caben 60x34 celdas: pintarlas de una en una son dos
// mil drawImage por fotograma, que a 60 Hz es más de lo que gasta la horda. Por
// eso se pinta POR TROZOS de 16x16 celdas (128x128 unidades): cada trozo se
// compone una vez en un lienzo pequeño y desde entonces es UN drawImage. Caben
// cinco por cuatro en pantalla, veinte blits, y la cámara en un centro comercial
// se mueve lo bastante despacio como para que en un fotograma cambie un trozo
// como mucho.
//
// PERSPECTIVA 3/4, COMO MÉRIDA. Lo que tiene altura —pared, estantería,
// mostrador, puerta cerrada— se pinta con TAPA y CARA: la tapa es la textura de
// la celda, y la cara es el frente, que se pinta SOBRE LAS CELDAS DE SUELO que
// quedan al sur del tramo, `altura` celdas hacia abajo. Va en la capa del suelo
// a propósito: quien se arrima a una pared por abajo queda delante de su cara,
// que es exactamente lo que pasa en una vista cenital inclinada. Es autotiling
// de una regla: una celda de suelo mira hacia arriba y, si a k celdas hay algo
// con altura y en medio solo hay suelo, pinta la fila k-1 de esa cara.
//
// Los lienzos se reservan al cargar el nivel, no durante la partida: es una
// tabla fija de RANURAS y cada trozo visible va a la suya —(tx % 8, ty % 4)—,
// así que dos trozos que se ven a la vez nunca se pisan y no hace falta buscar.
// Cuando el trozo que hay en la ranura no es el que se pide, se vuelve a
// componer. Es un caché de correspondencia directa, como el de una CPU.

// Lado de la textura de relleno, en unidades. Cuatro celdas: lo bastante para
// que un dibujo respire y lo bastante poco para que repita sin que se note.
export const TEXTURA = 32;

// A LA DENSIDAD DEL ARTE. El mundo se dibuja a ESCALA_ARTE píxeles por unidad
// (4: los personajes y el suelo de Mérida vienen así de finos), y una textura
// tiene que venir igual o se ve cuatro veces más basta que lo que pisa. Así que
// una celda de 8 unidades son 8 * PX = 32 píxeles de textura, y un PNG de 224
// píxeles cubre 56 unidades (7 celdas). Los lienzos de los trozos se reservan
// también a esta densidad y se pintan a su tamaño en unidades: el blit sale 1:1
// con el píxel del monitor, que es la regla de rendimiento de todo el motor.
const PX = ESCALA_ARTE;

// EN UNIDADES, no en celdas: un trozo son 128 unidades de lado sea cual sea la
// celda del nivel (16 celdas de 8, 32 de 4). Así en pantalla siguen cabiendo
// 5x4 trozos y las ranuras de abajo siguen bastando.
const TROZO_UNIDADES = 128;
const RANURAS_X = 8, RANURAS_Y = 4;     // 5x4 visibles caben en 8x4 sin chocar

// --- Dibujos de relleno --------------------------------------------------------
//
// Todos DETERMINISTAS: el ruido sale de un hash de la posición, no de
// Math.random. No es por el lockstep —esto es solo dibujo— sino para que el
// suelo sea el mismo en cada carga y no cambie de motas al recargar la página.
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hexARgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb(c, k = 1, sumar = 0) {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * k + sumar)));
  const g = Math.max(0, Math.min(255, Math.round(c[1] * k + sumar)));
  const b = Math.max(0, Math.min(255, Math.round(c[2] * k + sumar)));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// Una imagen girada 90° sobre su centro. Se usa para la tapa de los muros
// verticales (ver `cargar`): el mismo panel, tumbado.
function girar90(img) {
  const { c, ctx } = lienzo(img.height, img.width);
  ctx.translate(img.height / 2, img.width / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return c;
}

function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

// Motas: puntos sueltos de un tono, repartidos por hash.
function motear(ctx, base, prob, k, sumar, semilla) {
  ctx.fillStyle = rgb(base, k, sumar);
  for (let y = 0; y < TEXTURA; y++) {
    for (let x = 0; x < TEXTURA; x++) {
      if (hash(x, y, semilla) < prob) ctx.fillRect(x, y, 1, 1);
    }
  }
}

// Baldosas de `lado` con junta de un píxel.
function embaldosar(ctx, base, lado, kJunta) {
  ctx.fillStyle = rgb(base, kJunta);
  for (let v = 0; v < TEXTURA; v += lado) {
    ctx.fillRect(0, v, TEXTURA, 1);
    ctx.fillRect(v, 0, 1, TEXTURA);
  }
}

const DIBUJOS = {
  // Hormigón oscuro visto desde arriba, con una arista clara arriba que le da
  // un poco de volumen al tabique.
  pared(ctx, base) {
    ctx.fillStyle = rgb(base); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    motear(ctx, base, 0.10, 1.25, 0, 1);
    motear(ctx, base, 0.08, 0.75, 0, 2);
  },
  // Terrazo: baldosas de dos celdas con junta y motas claras y oscuras.
  pasillo(ctx, base) {
    ctx.fillStyle = rgb(base); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    motear(ctx, base, 0.14, 1.12, 0, 3);
    motear(ctx, base, 0.10, 0.86, 0, 4);
    embaldosar(ctx, base, 16, 0.80);
  },
  // Baldosa blanca y verde de supermercado, a cuadros de una celda.
  hipermercado(ctx, base) {
    ctx.fillStyle = rgb(base, 1.10); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    ctx.fillStyle = rgb(base, 0.94);
    for (let y = 0; y < TEXTURA; y += 8) {
      for (let x = 0; x < TEXTURA; x += 8) if (((x + y) / 8) % 2 === 0) ctx.fillRect(x, y, 8, 8);
    }
    embaldosar(ctx, base, 8, 0.82);
  },
  // Tablones de madera clara, tumbados, con la veta y las juntas corridas.
  mueblería(ctx, base) {
    ctx.fillStyle = rgb(base); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    for (let y = 0; y < TEXTURA; y += 8) {
      ctx.fillStyle = rgb(base, 0.78);
      ctx.fillRect(0, y, TEXTURA, 1);
      const corte = (y / 8) % 2 === 0 ? 10 : 24;     // junta entre tablones
      ctx.fillRect(corte, y, 1, 8);
      ctx.fillStyle = rgb(base, 0.90);                 // la veta
      for (let x = 0; x < TEXTURA; x++) if (hash(x, y, 5) < 0.35) ctx.fillRect(x, y + 3 + ((x >> 2) % 3), 1, 1);
    }
  },
  // Moqueta: grano fino y nada más.
  tienda(ctx, base) {
    ctx.fillStyle = rgb(base); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    motear(ctx, base, 0.25, 1.06, 0, 6);
    motear(ctx, base, 0.20, 0.93, 0, 7);
  },
  // Moqueta de cine: oscura, con un dibujo de puntos en rombo.
  ocio(ctx, base) {
    ctx.fillStyle = rgb(base, 0.92); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    motear(ctx, base, 0.18, 0.84, 0, 8);
    ctx.fillStyle = rgb(base, 1.18);
    for (let y = 0; y < TEXTURA; y += 8) {
      for (let x = 0; x < TEXTURA; x += 8) ctx.fillRect(x + ((y / 8) % 2) * 4 + 1, y + 3, 2, 2);
    }
  },
  // Terracota: baldosas grandes con junta clara.
  plaza(ctx, base) {
    ctx.fillStyle = rgb(base); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    motear(ctx, base, 0.12, 0.88, 0, 9);
    motear(ctx, base, 0.08, 1.10, 0, 10);
    embaldosar(ctx, base, 16, 1.18);
  },
  // Tapa de estantería: chapa oscura lisa con un poco de grano. El género se
  // ve en la CARA (ver CARAS), no en la tapa: desde arriba una estantería es
  // su techo, y un techo lleno de cajitas de colores compite con el frente.
  'estantería'(ctx, base) {
    ctx.fillStyle = rgb(base, 0.55); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    motear(ctx, base, 0.10, 0.65, 0, 11);
    motear(ctx, base, 0.06, 0.48, 0, 12);
  },
  // Mostrador: tablero de madera con el canto claro arriba y la sombra abajo.
  mostrador(ctx, base) {
    ctx.fillStyle = rgb(base); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    for (let y = 0; y < TEXTURA; y++) {
      for (let x = 0; x < TEXTURA; x++) if (hash(x, y, 12) < 0.3) { ctx.fillStyle = rgb(base, 0.92); ctx.fillRect(x, y, 1, 1); }
    }
    ctx.fillStyle = rgb(base, 1.25, 20);
    for (let y = 0; y < TEXTURA; y += 8) ctx.fillRect(0, y, TEXTURA, 1);
    ctx.fillStyle = rgb(base, 0.62);
    for (let y = 7; y < TEXTURA; y += 8) ctx.fillRect(0, y, TEXTURA, 1);
  },
  // Techo de una tienda cerrada, visto desde arriba: placas de cubierta
  // grises con la junta oscura, sin nada más. Provisional hasta que Sergio
  // dibuje uno; se elige por el nombre `techo` de la leyenda.
  techo(ctx, base) {
    ctx.fillStyle = rgb(base); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    motear(ctx, base, 0.08, 1.12, 0, 13);
    motear(ctx, base, 0.06, 0.86, 0, 14);
    embaldosar(ctx, base, 16, 0.70);
  },
  // Puertas: el color plano con rayas diagonales, como una persiana de cierre.
  puerta(ctx, base) {
    ctx.fillStyle = rgb(base); ctx.fillRect(0, 0, TEXTURA, TEXTURA);
    ctx.fillStyle = rgb(base, 0.80);
    for (let y = 0; y < TEXTURA; y++) {
      for (let x = 0; x < TEXTURA; x++) if (((x + y) >> 2) % 2 === 0) ctx.fillRect(x, y, 1, 1);
    }
  }
};

// LAS CARAS DE RELLENO. Se trazan en unidades sobre un lienzo de TEXTURA de
// ancho y `alto` unidades de alto, y repiten solo en horizontal.
const CARAS = {
  // Hormigón visto de frente: más oscuro que la tapa, una arista clara arriba
  // y una sombra al pie.
  pared(ctx, base, alto) {
    ctx.fillStyle = rgb(base, 0.72); ctx.fillRect(0, 0, TEXTURA, alto);
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < TEXTURA; x++) if (hash(x, y, 21) < 0.08) { ctx.fillStyle = rgb(base, 0.6); ctx.fillRect(x, y, 1, 1); }
    }
    ctx.fillStyle = rgb(base, 1.15, 10); ctx.fillRect(0, 0, TEXTURA, 1);
    ctx.fillStyle = rgb(base, 0.45); ctx.fillRect(0, alto - 2, TEXTURA, 2);
  },
  // Estantería de frente: baldas claras cada 8 unidades y el género encima.
  'estantería'(ctx, base, alto) {
    ctx.fillStyle = rgb(base, 0.5); ctx.fillRect(0, 0, TEXTURA, alto);
    const generos = ['#c94a3a', '#3a7fc9', '#e0c34a', '#4aa85e', '#e08a3a', '#d6d6d6'];
    for (let y = 0; y < alto; y += 8) {
      for (let x = 0; x < TEXTURA; x += 4) {
        const g = generos[Math.floor(hash(x, y, 22) * generos.length)];
        ctx.fillStyle = g; ctx.fillRect(x + 1, y + 2, 2, 5);
        ctx.fillStyle = rgb(hexARgb(g), 0.7); ctx.fillRect(x + 1, y + 5, 2, 2);
      }
      ctx.fillStyle = rgb(base, 1.3, 20); ctx.fillRect(0, y + 7, TEXTURA, 1);   // la balda
    }
    ctx.fillStyle = rgb(base, 0.4); ctx.fillRect(0, alto - 1, TEXTURA, 1);
  },
  // Frente de mostrador: tablas verticales con el canto del tablero arriba.
  mostrador(ctx, base, alto) {
    ctx.fillStyle = rgb(base, 0.8); ctx.fillRect(0, 0, TEXTURA, alto);
    ctx.fillStyle = rgb(base, 0.62);
    for (let x = 0; x < TEXTURA; x += 8) ctx.fillRect(x, 0, 1, alto);
    for (let y = 0; y < alto; y++) for (let x = 0; x < TEXTURA; x++) if (hash(x, y, 23) < 0.15) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = rgb(base, 1.3, 20); ctx.fillRect(0, 0, TEXTURA, 2);
    ctx.fillStyle = rgb(base, 0.4); ctx.fillRect(0, alto - 2, TEXTURA, 2);
  },
  // Persiana de frente: lamas horizontales de su color.
  puerta(ctx, base, alto) {
    ctx.fillStyle = rgb(base, 0.85); ctx.fillRect(0, 0, TEXTURA, alto);
    ctx.fillStyle = rgb(base, 0.6);
    for (let y = 3; y < alto; y += 4) ctx.fillRect(0, y, TEXTURA, 1);
    ctx.fillStyle = rgb(base, 1.15, 10);
    for (let y = 0; y < alto; y += 4) ctx.fillRect(0, y, TEXTURA, 1);
  }
};

function caraDeRelleno(def, color, altoUnidades) {
  const { c, ctx } = lienzo(TEXTURA * PX, altoUnidades * PX);
  ctx.scale(PX, PX);
  const f = (def && def.puerta) ? CARAS.puerta : (def && CARAS[def.nombre]) || CARAS.pared;
  f(ctx, hexARgb(color), altoUnidades);
  return c;
}

// Una cara que llega en PNG: se lleva a un lienzo de ancho múltiplo de celda y
// del alto exacto de la cara, repitiendo en horizontal y recortando por arriba
// lo que sobre de alto (o repitiendo, si viene más baja).
function normalizarCara(img, celda, altoUnidades) {
  const paso = celda * PX;
  const ancho = Math.max(TEXTURA * PX, Math.floor(img.width / paso) * paso);
  const alto = altoUnidades * PX;
  const { c, ctx } = lienzo(ancho, alto);
  for (let y = 0; y < alto; y += img.height) {
    for (let x = 0; x < ancho; x += img.width) ctx.drawImage(img, x, y);
  }
  return c;
}

// Qué dibujo de relleno le toca a cada símbolo: por el `nombre` de la leyenda,
// y si no hay uno con ese nombre, la moqueta lisa (que es un color con grano).
function dibujoDe(def) {
  if (def && def.puerta) return DIBUJOS.puerta;
  return (def && DIBUJOS[def.nombre]) || DIBUJOS.tienda;
}

// El dibujo de relleno se traza en unidades y se AMPLÍA a la densidad del
// arte: un píxel del dibujo son PX píxeles de textura, que es lo que lo deja
// con el mismo grano gordo que un sprite a 1:1.
function texturaDeRelleno(def, color) {
  const { c, ctx } = lienzo(TEXTURA * PX, TEXTURA * PX);
  ctx.scale(PX, PX);
  dibujoDe(def)(ctx, hexARgb(color));
  return c;
}

// Una textura que llega en PNG puede medir lo que quiera mientras sea un
// MÚLTIPLO DE LA CELDA y cuadrada: 32, 64, 96... Cada una repite a su ritmo
// —`componer` mira su ancho—, y así una baldosa de 32 unidades cabe entera en
// una textura de 96 sin quedar coja. La que no cumpla se lleva a un lienzo del
// múltiplo más cercano por abajo, recortándola; si es más chica que una celda,
// a la textura de relleno no llega: se repite hasta llenar 32.
function normalizar(img, celda) {
  const paso = celda * PX;                                  // píxeles por celda
  const lado = Math.max(TEXTURA * PX, Math.floor(Math.min(img.width, img.height) / paso) * paso);
  if (img.width === lado && img.height === lado) return img;
  const { c, ctx } = lienzo(lado, lado);
  for (let y = 0; y < lado; y += img.height) {
    for (let x = 0; x < lado; x += img.width) ctx.drawImage(img, x, y);
  }
  return c;
}

// LAS CARAS POR TIENDA (ver `paredesMapa`, `escaparatesMapa` y
// `estanteriasMapa` en datos/niveles/lighthouse.js). Una pared no tiene UNA
// cara: tiene la de la tienda desde la que se mira. Aquí se resuelven a
// arrays por índice de tipo de suelo, que es lo que se tiene a mano al
// componer un trozo, y `_caraPara` elige.
async function cargarPorTipo(rutas, simbolos, celda, altoU) {
  const lista = simbolos.map((ch) => rutas[ch] ? Recursos.cargarSuelta(rutas[ch]) : Promise.resolve(null));
  const imgs = await Promise.all(lista);
  return imgs.map((img) => img ? normalizarCara(img, celda, altoU) : null);
}

async function cargarJuegosPorTipo(rutas, simbolos, celda, altoU) {
  const lista = simbolos.map((ch) => rutas[ch]
    ? Promise.all(rutas[ch].map((r) => Recursos.cargarSuelta(r)))
    : Promise.resolve(null));
  const juegos = await Promise.all(lista);
  return juegos.map((imgs) => {
    if (!imgs) return null;
    const caras = imgs.filter((i) => i).map((img) => normalizarCara(img, celda, altoU));
    return caras.length ? caras : null;
  });
}

export const SueloRejilla = {
  texturas: null,        // una por índice de tipo de RejillaMapa (la tapa)
  caras: null,           // la cara de cada tipo, o null si es plano
  paredes: null,         // cara de pared por tipo de SUELO desde el que se ve
  duenyo: null,          // por celda sólida: tipo de la tienda de la que es (255 = de nadie)
  panelesGirados: null,  // el escaparate de cada tienda, girado 90° (tapa de los muros verticales)
  escaparates: null,     // cara de pared por tipo de suelo que hay DETRÁS (visto desde el pasillo)
  estanterias: null,     // caras de estantería (varias) por tipo de suelo delante
  tipoPared: -1,         // índices de tipo: la pared, la estantería y el pasillo
  tipoEstanteria: -1,
  tipoPasillo: -1,
  esPasillo: null,       // por índice de tipo: ¿es pasillo (de cualquier anillo)?
  suelosTiendas: null,   // texturas de suelo que se reparten entre las tiendas
  variante: null,        // por celda: qué suelo de `suelosTiendas` pisa (una por tienda)
  abiertaComo: null,     // índice de tipo con que se pinta una puerta abierta
  ranuras: null,
  version: -1,           // la de RejillaMapa.versionSuelo con que se compuso
  trozosCompuestos: 0,   // para el panel de depuración
  activo: false,

  // Se llama al cargar el nivel, después de RejillaMapa.iniciar. Pide los PNG
  // declarados y rellena el resto. Los lienzos de las ranuras se reservan aquí,
  // una vez, y se reutilizan de una partida a la siguiente.
  async cargar(nivel) {
    if (!RejillaMapa.activa) { this.activo = false; return; }
    const leyenda = nivel.mapa.leyenda;
    const colores = nivel.coloresMapa || {};
    const rutas = nivel.texturasMapa || {};
    const simbolos = RejillaMapa.simbolos;

    const rutasCara = nivel.carasMapa || {};

    const cargas = simbolos.map((ch) => rutas[ch] ? Recursos.cargarSuelta(rutas[ch]) : Promise.resolve(null));
    const cargasCara = simbolos.map((ch) => rutasCara[ch] ? Recursos.cargarSuelta(rutasCara[ch]) : Promise.resolve(null));
    const imagenes = await Promise.all(cargas);
    const imagenesCara = await Promise.all(cargasCara);

    this.texturas = simbolos.map((ch, k) => imagenes[k]
      ? normalizar(imagenes[k], RejillaMapa.celda)
      : texturaDeRelleno(leyenda[ch], colores[ch] || '#000000'));

    // La altura de cada tipo la tiene RejillaMapa, que es quien decide que la
    // cara no se pisa: aquí solo se pinta lo que allí se mide.
    this.caras = simbolos.map((ch, k) => {
      const def = leyenda[ch];
      const h = RejillaMapa.altura[k];
      if (h === 0) return null;
      const altoU = h * RejillaMapa.celda;
      return imagenesCara[k] ? normalizarCara(imagenesCara[k], RejillaMapa.celda, altoU)
                             : caraDeRelleno(def, colores[ch] || '#000000', altoU);
    });

    // Una puerta abierta se pinta como el pasillo: el hueco es pasillo.
    const pasillo = simbolos.indexOf('.');
    this.abiertaComo = pasillo < 0 ? 0 : pasillo;
    this.tipoPasillo = pasillo;
    // Pasillo es todo lo que la leyenda llame así: el de cada anillo lleva su
    // símbolo y su suelo (ver PASILLO_1 en herramientas/mapa-lighthouse.js).
    this.esPasillo = simbolos.map((ch) => !!(leyenda[ch] && leyenda[ch].nombre === 'pasillo'));

    // LOS SUELOS DE LAS TIENDAS: una lista de texturas que se reparte entre
    // los locales, UNA POR TIENDA y sin mezclar dentro de ninguna (Sergio,
    // 22/09/2026). El mapa no dice qué suelo pisa cada tienda —su símbolo es
    // el tipo, y el suelo es independiente del tipo—, así que se decide aquí:
    // cada trozo conexo de suelo de tienda es una tienda, y le toca el suelo
    // que diga su orden de aparición. Es función del mapa, igual en todas las
    // máquinas de un cooperativo (y solo es dibujo).
    this.suelosTiendas = null;
    this.variante = null;
    if (nivel.suelosTiendas && nivel.suelosTiendas.texturas && nivel.suelosTiendas.texturas.length) {
      const imgs = await Promise.all(nivel.suelosTiendas.texturas.map((r) => Recursos.cargarSuelta(r)));
      this.suelosTiendas = imgs.filter((i) => i).map((img) => normalizar(img, RejillaMapa.celda));
      if (this.suelosTiendas.length) this._repartirSuelos(nivel.suelosTiendas.tipos || []);
    }

    // Las caras por tienda. Se buscan los tipos de pared y estantería por el
    // nombre de la leyenda, que es como los distingue todo lo demás.
    this.tipoPared = simbolos.findIndex((ch) => leyenda[ch] && leyenda[ch].nombre === 'pared');
    this.tipoEstanteria = simbolos.findIndex((ch) => leyenda[ch] && leyenda[ch].nombre === 'estantería');
    const altoPared = this.tipoPared >= 0 ? RejillaMapa.altura[this.tipoPared] * RejillaMapa.celda : 0;
    const altoEst = this.tipoEstanteria >= 0 ? RejillaMapa.altura[this.tipoEstanteria] * RejillaMapa.celda : 0;
    this.paredes = altoPared > 0 && nivel.paredesMapa
      ? await cargarPorTipo(nivel.paredesMapa, simbolos, RejillaMapa.celda, altoPared) : null;
    this.escaparates = altoPared > 0 && nivel.escaparatesMapa
      ? await cargarPorTipo(nivel.escaparatesMapa, simbolos, RejillaMapa.celda, altoPared) : null;
    this.estanterias = altoEst > 0 && nivel.estanteriasMapa
      ? await cargarJuegosPorTipo(nivel.estanteriasMapa, simbolos, RejillaMapa.celda, altoEst) : null;
    // LA TAPA DE UN MURO ES EL MURO, no un techo. Un muro se dibuja con tapa
    // (lo que se ve desde arriba) y cara (el frente). La tapa llevaba una
    // textura gris de hormigón y en una tienda abierta eso se leía como un
    // techo — y una tienda abierta no tiene techo. Ahora la tapa lleva el
    // panel de esa tienda: el de siempre en los muros que van de este a oeste,
    // y GIRADO 90° en los que van de norte a sur, para que se lea como la
    // misma pared vista de lado. Los girados se hornean aquí, una vez.
    this.panelesGirados = this.escaparates ? this.escaparates.map((img) => img ? girar90(img) : null) : null;
    this._calcularDuenyos();

    if (!this.ranuras) {
      this.ranuras = [];
      const lado = TROZO_UNIDADES * PX;
      for (let i = 0; i < RANURAS_X * RANURAS_Y; i++) {
        const { c, ctx } = lienzo(lado, lado);
        this.ranuras.push({ c, ctx, tx: -1, ty: -1, version: -1 });
      }
    } else {
      for (const r of this.ranuras) r.tx = -1;     // nivel nuevo: nada vale
    }
    this.activo = true;
  },

  // Compone un trozo entero en su lienzo: una celda por drawImage, con el
  // recorte de la textura que le toca por su posición.
  _componer(r, tx, ty) {
    const R = RejillaMapa;
    const c = R.celda;
    const tex = this.texturas;
    const ctx = r.ctx;
    const trozoCeldas = TROZO_UNIDADES / c;
    const cx0 = tx * trozoCeldas, cy0 = ty * trozoCeldas;
    ctx.clearRect(0, 0, r.c.width, r.c.height);
    for (let j = 0; j < trozoCeldas; j++) {
      const cy = cy0 + j;
      if (cy >= R.alto) break;
      const fila = cy * R.ancho;
      for (let i = 0; i < trozoCeldas; i++) {
        const cx = cx0 + i;
        if (cx >= R.ancho) break;
        const idx = fila + cx;
        let t = R.tipo[idx];
        // Puerta ya abierta: se pinta como el hueco que es.
        const solido = R.solido[idx] === 1;
        if (R.grupoDe[t] >= 0 && !solido) t = this.abiertaComo;
        // Cada textura repite a su tamaño: celdas por textura = ancho / celda,
        // todo en píxeles de textura (una celda son c * PX).
        const cp = c * PX;
        // El suelo de una tienda es el que le tocó a ESA tienda (ver
        // _repartirSuelos); lo demás, la textura de su símbolo.
        // LA TAPA DE UN MURO lleva el panel de su tienda (ver `cargar`); lo
        // demás, la textura de su símbolo.
        if (solido && t === this.tipoPared && this._tapaDeMuro(ctx, idx, cx, cy, i, j, cp)) {
          // pintada
        } else {
          const textura = this._sueloDe(idx, t);
          const porTextura = textura.width / cp;
          const sx = (cx % porTextura) * cp;
          const sy = (cy % porTextura) * cp;
          ctx.drawImage(textura, sx, sy, cp, cp, i * cp, j * cp, cp, cp);
        }

        // LA CARA. Solo sobre suelo: se mira hacia arriba hasta alturaMax
        // celdas; si en medio hay algo sólido que no llega a esta celda con su
        // altura, tapa la vista y no se pinta nada.
        if (solido || R.alturaMax === 0) continue;
        for (let k = 1; k <= R.alturaMax && cy - k >= 0; k++) {
          const ia = idx - k * R.ancho;
          if (R.solido[ia] !== 1) continue;            // suelo: se sigue mirando
          const ta = R.tipo[ia];
          const h = R.altura[ta];
          if (k <= h) {
            const cara = this._caraPara(ta, ia, t, cx, cy - k);
            // POR UN ESCAPARATE SE VE LA TIENDA, NO EL PASILLO. El cristal es
            // translúcido y se pinta sobre la celda de suelo que tiene
            // delante, así que sin esto se veía a través de él el suelo del
            // pasillo — que es justo lo que no hay detrás de un ventanal. Se
            // repinta esa celda con el suelo de la tienda a la que da el
            // cristal (o con su techo, si está cerrada) y el cristal encima.
            if (this.escaparates && this.duenyo && this.duenyo[ia] !== 255 &&
                this.escaparates[this.duenyo[ia]]) {
              const dentro = this._celdaDetras(ia);
              if (dentro >= 0) {
                const td = this._sueloDe(dentro, R.tipo[dentro]);
                const pd = td.width / cp;
                ctx.drawImage(td, (cx % pd) * cp, (((dentro / R.ancho) | 0) % pd) * cp,
                              cp, cp, i * cp, j * cp, cp, cp);
              }
            }
            const porCara = cara.width / cp;
            const fx = (cx % porCara) * cp;
            ctx.drawImage(cara, fx, (k - 1) * cp, cp, cp, i * cp, j * cp, cp, cp);
          }
          break;                                       // lo sólido tapa lo de más arriba
        }
      }
    }
    r.tx = tx; r.ty = ty; r.version = R.versionSuelo;
    this.trozosCompuestos++;
  },

  // El suelo que pisa la celda `i`: el de su tienda si le tocó uno (ver
  // `_repartirSuelos`), y si no la textura de su símbolo.
  _sueloDe(i, t) {
    if (this.variante && this.variante[i] !== 255) return this.suelosTiendas[this.variante[i]];
    return this.texturas[t];
  },

  // LA CELDA DE DENTRO de la tienda a la que da una pared: subiendo desde la
  // pared, la primera que sea de un tipo con escaparate (suelo de tienda o
  // techo de una cerrada). -1 si no la hay en un tramo razonable.
  _celdaDetras(ia) {
    const R = RejillaMapa;
    for (let k = 1; k <= 24; k++) {
      const i = ia - k * R.ancho;
      if (i < 0) return -1;
      if (this.escaparates[R.tipo[i]]) return i;
    }
    return -1;
  },

  // UNA TIENDA, UN SUELO. Ver `suelosTiendas` en `cargar`.
  _repartirSuelos(tipos) {
    const R = RejillaMapa;
    const n = R.ancho * R.alto;
    const esTienda = R.simbolos.map((ch) => tipos.indexOf(ch) >= 0);
    this.variante = new Uint8Array(n).fill(255);
    const cola = new Int32Array(n);
    const W = R.ancho;
    let tienda = 0;
    for (let s = 0; s < n; s++) {
      if (this.variante[s] !== 255 || R.solido[s] === 1 || !esTienda[R.tipo[s]]) continue;
      const v = tienda % this.suelosTiendas.length;
      tienda++;
      let ini = 0, fin = 0;
      cola[fin++] = s; this.variante[s] = v;
      while (ini < fin) {
        const i = cola[ini++];
        const x = i % W;
        for (let k = 0; k < 4; k++) {
          let j;
          if (k === 0) j = i - W;
          else if (k === 1) j = i + W;
          else if (k === 2) j = x > 0 ? i - 1 : -1;
          else j = x < W - 1 ? i + 1 : -1;
          if (j < 0 || j >= n) continue;
          if (this.variante[j] !== 255 || R.solido[j] === 1 || !esTienda[R.tipo[j]]) continue;
          this.variante[j] = v;
          cola[fin++] = j;
        }
      }
    }
  },

  // DE QUÉ TIENDA ES CADA CELDA SÓLIDA. Una pared enseña al pasillo el
  // escaparate de la tienda que tiene detrás, y "detrás" no es "la celda de
  // arriba": detrás del tabique puede haber la estantería que forra la pared,
  // un trozo de muro de relleno o, en la esquina, la pared vertical de la
  // misma tienda; mirando solo hacia arriba, esas celdas salían con el
  // azulejo del pasillo y el escaparate se veía a trozos. Aquí cada celda
  // sólida (pared, estantería, mostrador) se queda con el tipo de suelo —o de
  // techo— más cercano que tenga escaparate, buscando desde todas las tiendas
  // a la vez a través de lo sólido, hasta DUENYO_ALCANCE celdas. Se calcula
  // una vez al cargar; es un array de bytes del tamaño del mapa.
  _calcularDuenyos() {
    const R = RejillaMapa;
    const n = R.ancho * R.alto;
    this.duenyo = new Uint8Array(n).fill(255);
    if (!this.escaparates) return;
    const DUENYO_ALCANCE = 12;
    const cola = new Int32Array(n);
    const paso = new Uint8Array(n);
    let fin = 0;
    // Fuentes: toda celda cuyo tipo tenga escaparate (suelo de tienda o techo).
    for (let i = 0; i < n; i++) {
      if (this.escaparates[R.tipo[i]]) { this.duenyo[i] = R.tipo[i]; cola[fin++] = i; }
    }
    let ini = 0;
    const W = R.ancho;
    while (ini < fin) {
      const i = cola[ini++];
      const d = paso[i];
      if (d >= DUENYO_ALCANCE) continue;
      const x = i % W;
      for (let k = 0; k < 4; k++) {
        let v;
        if (k === 0) v = i - W;
        else if (k === 1) v = i + W;
        else if (k === 2) v = x > 0 ? i - 1 : -1;
        else v = x < W - 1 ? i + 1 : -1;
        if (v < 0 || v >= n) continue;
        if (this.duenyo[v] !== 255) continue;
        if (R.solido[v] !== 1) continue;          // solo se propaga por lo sólido
        // Una puerta no es de nadie: se pinta como puerta.
        if (R.grupoDe[R.tipo[v]] >= 0) continue;
        this.duenyo[v] = this.duenyo[i];
        paso[v] = d + 1;
        cola[fin++] = v;
      }
    }
  },

  // LA TAPA DE UN MURO. Devuelve si la ha pintado. El panel es el de la tienda
  // de la que es el muro (ver `_calcularDuenyos`); si el muro corre de norte a
  // sur se usa el panel girado, y si va de este a oeste, el normal recortado
  // por su parte de arriba —tantas filas como grueso tenga el muro—, que es lo
  // que se vería de un panel visto desde arriba y un poco de lado.
  _tapaDeMuro(ctx, idx, cx, cy, i, j, cp) {
    if (!this.escaparates || !this.duenyo) return false;
    const dueno = this.duenyo[idx];
    if (dueno === 255) return false;
    const panel = this.escaparates[dueno];
    if (!panel) return false;
    const R = RejillaMapa;
    const arriba = cy > 0 && R.solido[idx - R.ancho] === 1;
    const abajo = cy < R.alto - 1 && R.solido[idx + R.ancho] === 1;
    const izq = cx > 0 && R.solido[idx - 1] === 1;
    const der = cx < R.ancho - 1 && R.solido[idx + 1] === 1;
    if (arriba && abajo && !(izq && der)) {
      const g = this.panelesGirados && this.panelesGirados[dueno];
      if (!g) return false;
      // Tumbado: lo que repite es el alto, y lo que recorta es el grueso.
      const porAlto = g.height / cp;
      let grueso = 0;
      while (grueso < 8 && cx - grueso > 0 && R.solido[idx - grueso - 1] === 1) grueso++;
      ctx.drawImage(g, Math.min(g.width - cp, grueso * cp), (cy % porAlto) * cp,
                    cp, cp, i * cp, j * cp, cp, cp);
      return true;
    }
    const porAncho = panel.width / cp;
    let hondo = 0;
    while (hondo < 8 && cy - hondo > 0 && R.solido[idx - hondo * R.ancho - R.ancho] === 1) hondo++;
    ctx.drawImage(panel, (cx % porAncho) * cp, Math.min(panel.height - cp, hondo * cp),
                  cp, cp, i * cp, j * cp, cp, cp);
    return true;
  },

  // QUÉ CARA ENSEÑA la celda sólida `ia` (de tipo `ta`) a la celda de suelo de
  // tipo `tSuelo` que la mira desde el sur. Es la regla de "cada tienda con lo
  // suyo": la pared enseña el panel del local desde el que se ve; si se ve
  // desde el pasillo y detrás del tabique hay una tienda, enseña el escaparate
  // de esa tienda; y la estantería enseña las de la tienda en la que está,
  // alternando sus dibujos a lo largo del lineal por la posición de la celda
  // sólida (la de arriba, no la que pinta: las tres filas de una misma cara
  // tienen que salir del mismo dibujo). Lo que no tenga panel cae en la cara
  // genérica del tipo, que es la de siempre.
  _caraPara(ta, ia, tSuelo, ax, ay) {
    if (ta === this.tipoPared && this.paredes) {
      if (this.esPasillo[tSuelo] && this.escaparates && this.duenyo) {
        // Desde el pasillo: el escaparate de la tienda de la que es la pared
        // (ver _calcularDuenyos). Sin dueño, el azulejo del pasillo.
        const dueno = this.duenyo[ia];
        if (dueno !== 255) {
          const e = this.escaparates[dueno];
          if (e) return e;
        }
      }
      return this.paredes[tSuelo] || this.caras[ta];
    }
    if (ta === this.tipoEstanteria && this.estanterias) {
      const juego = this.estanterias[tSuelo];
      // Por PANEL, no por celda: un panel de estantería mide 16 unidades de
      // ancho (las celdas que sean), y todas sus celdas tienen que salir del
      // mismo dibujo.
      const panel = Math.floor(ax * RejillaMapa.celda / 16);
      if (juego) return juego[Math.floor(hash(panel, ay, 31) * juego.length)];
    }
    return this.caras[ta];
  },

  // Pinta lo que se ve. `izq`/`arr` es la esquina de la cámara en unidades.
  dibujar(ctx, izq, arr) {
    const R = RejillaMapa;
    const lado = TROZO_UNIDADES;
    const trozoCeldas = lado / R.celda;
    const tx0 = Math.max(0, Math.floor(izq / lado));
    const ty0 = Math.max(0, Math.floor(arr / lado));
    const tx1 = Math.min(Math.ceil((izq + ANCHO_LOGICO) / lado), Math.ceil(R.ancho / trozoCeldas) - 1);
    const ty1 = Math.min(Math.ceil((arr + ALTO_LOGICO) / lado), Math.ceil(R.alto / trozoCeldas) - 1);
    let blits = 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const r = this.ranuras[(ty % RANURAS_Y) * RANURAS_X + (tx % RANURAS_X)];
        if (r.tx !== tx || r.ty !== ty || r.version !== R.versionSuelo) this._componer(r, tx, ty);
        // El lienzo del trozo mide lado * PX píxeles y se pinta en `lado`
        // unidades: bajo la transformación de ESCALA_ARTE eso es 1:1.
        ctx.drawImage(r.c, tx * lado, ty * lado, lado, lado);
        blits++;
      }
    }
    return blits;
  }
};

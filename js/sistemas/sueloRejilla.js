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

// Cuántas celdas de cara enseña cada cosa con altura, por el `nombre` de la
// leyenda. Un nivel lo cambia con `alturasMapa` (símbolo → celdas). Lo que no
// esté aquí ni allí es plano: solo tapa.
const ALTURA_POR_NOMBRE = { pared: 2, 'estantería': 3, mostrador: 2, puerta: 2 };

const TROZO_CELDAS = 16;
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

export const SueloRejilla = {
  texturas: null,        // una por índice de tipo de RejillaMapa (la tapa)
  caras: null,           // la cara de cada tipo, o null si es plano
  altura: null,          // Uint8Array: celdas de cara por tipo (0 = plano)
  alturaMax: 0,
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
    const alturas = nivel.alturasMapa || {};

    const cargas = simbolos.map((ch) => rutas[ch] ? Recursos.cargarSuelta(rutas[ch]) : Promise.resolve(null));
    const cargasCara = simbolos.map((ch) => rutasCara[ch] ? Recursos.cargarSuelta(rutasCara[ch]) : Promise.resolve(null));
    const imagenes = await Promise.all(cargas);
    const imagenesCara = await Promise.all(cargasCara);

    this.texturas = simbolos.map((ch, k) => imagenes[k]
      ? normalizar(imagenes[k], RejillaMapa.celda)
      : texturaDeRelleno(leyenda[ch], colores[ch] || '#000000'));

    // La altura de cada tipo: lo que diga el nivel, si no lo de su nombre, y
    // solo para lo sólido — un suelo con cara no tiene sentido.
    this.altura = new Uint8Array(simbolos.length);
    this.alturaMax = 0;
    this.caras = simbolos.map((ch, k) => {
      const def = leyenda[ch];
      if (!def || !def.solido) return null;
      const h = alturas[ch] !== undefined ? alturas[ch]
        : (def.puerta ? ALTURA_POR_NOMBRE.puerta : (ALTURA_POR_NOMBRE[def.nombre] || 0));
      this.altura[k] = h;
      if (h > this.alturaMax) this.alturaMax = h;
      if (h === 0) return null;
      const altoU = h * RejillaMapa.celda;
      return imagenesCara[k] ? normalizarCara(imagenesCara[k], RejillaMapa.celda, altoU)
                             : caraDeRelleno(def, colores[ch] || '#000000', altoU);
    });

    // Una puerta abierta se pinta como el pasillo: el hueco es pasillo.
    const pasillo = simbolos.indexOf('.');
    this.abiertaComo = pasillo < 0 ? 0 : pasillo;

    if (!this.ranuras) {
      this.ranuras = [];
      const lado = TROZO_CELDAS * RejillaMapa.celda * PX;
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
    const cx0 = tx * TROZO_CELDAS, cy0 = ty * TROZO_CELDAS;
    ctx.clearRect(0, 0, r.c.width, r.c.height);
    for (let j = 0; j < TROZO_CELDAS; j++) {
      const cy = cy0 + j;
      if (cy >= R.alto) break;
      const fila = cy * R.ancho;
      for (let i = 0; i < TROZO_CELDAS; i++) {
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
        const porTextura = tex[t].width / cp;
        const sx = (cx % porTextura) * cp;
        const sy = (cy % porTextura) * cp;
        ctx.drawImage(tex[t], sx, sy, cp, cp, i * cp, j * cp, cp, cp);

        // LA CARA. Solo sobre suelo: se mira hacia arriba hasta alturaMax
        // celdas; si en medio hay algo sólido que no llega a esta celda con su
        // altura, tapa la vista y no se pinta nada.
        if (solido || this.alturaMax === 0) continue;
        for (let k = 1; k <= this.alturaMax && cy - k >= 0; k++) {
          const ia = idx - k * R.ancho;
          if (R.solido[ia] !== 1) continue;            // suelo: se sigue mirando
          const ta = R.tipo[ia];
          const h = this.altura[ta];
          if (k <= h) {
            const cara = this.caras[ta];
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

  // Pinta lo que se ve. `izq`/`arr` es la esquina de la cámara en unidades.
  dibujar(ctx, izq, arr) {
    const R = RejillaMapa;
    const lado = TROZO_CELDAS * R.celda;
    const tx0 = Math.max(0, Math.floor(izq / lado));
    const ty0 = Math.max(0, Math.floor(arr / lado));
    const tx1 = Math.min(Math.ceil((izq + ANCHO_LOGICO) / lado), Math.ceil(R.ancho / TROZO_CELDAS) - 1);
    const ty1 = Math.min(Math.ceil((arr + ALTO_LOGICO) / lado), Math.ceil(R.alto / TROZO_CELDAS) - 1);
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

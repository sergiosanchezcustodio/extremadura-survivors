import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoBorde, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { COLOR_JUGADOR } from './hud.js';
import { Recursos } from '../core/recursos.js';
import { COFRE } from '../entidades/cofre.js';
import { RejillaMapa } from '../sistemas/rejillaMapa.js';

// DOS MAPAS EN UN ARCHIVO, porque hay dos clases de nivel.
//
// En un RECINTO (el CC The Lighthouse) se enseña el PLANO del centro comercial,
// descubierto según se anda — ver `dibujarPlano` al final. Es lo que se abre con
// Bloq Mayús o con el botón Y.
//
// En una CALZADA (Mérida) no hay "mapa entero" que enseñar: el nivel crece sin
// límite hacia el norte. Ahí sigue el radar de siempre, que es lo que hay justo
// debajo.

// Mapa/radar (F4). El nivel es un pasillo que crece sin límite hacia el
// norte —no hay "el mapa entero" que enseñar, como en un nivel cerrado—, así
// que esto es un RADAR local: una franja centrada en la cámara, ancha como la
// calzada y alta unas cuantas pantallas, con jugadores, enemigos y cofres
// como puntos. Sirve sobre todo para lo que el visor no alcanza: saber si el
// jefe sigue de camino, o si se acerca una oleada por detrás.
//
// No pausa la partida —igual que la ficha (Tab)—: es una consulta rápida, no
// un menú.

const ANCHO_PANEL = 130;
const ALTO_PANEL = 380;

// Cuánto mundo entra en el radar, en unidades lógicas por encima y por debajo
// de la cámara. 550 son poco más de dos pantallas de alto (ALTO_LOGICO=270),
// suficiente para ver venir algo que el visor todavía no muestra.
const RANGO_Y = 550;

const COLOR_ENEMIGO = '#c0553f';
const COLOR_ELITE = '#e0a15c';
const COLOR_JEFE = '#e04b4b';
const COLOR_COFRE = '#f0c987';

function punto(ctx, x, y, radio, color) {
  ctx.beginPath();
  ctx.arc(x, y, radio, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function dibujarMapa(ctx, jugadores, enemigos, cofres, camara) {
  // Nivel de rejilla: el plano del recinto, no el radar.
  if (RejillaMapa.activa) { dibujarPlano(ctx, jugadores, camara); return; }

  const t = Tema.actual;
  const px = (ANCHO_UI - ANCHO_PANEL) / 2;
  const py = (ALTO_UI - ALTO_PANEL) / 2;
  const relleno = 10;

  panel(ctx, px, py, ANCHO_PANEL, ALTO_PANEL, t.filo);

  ctx.textAlign = 'center';
  ctx.font = `700 13px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, 'MAPA', px + ANCHO_PANEL / 2, py + 18, 1.5);
  let y = py + 27;
  cenefa(ctx, px + relleno, y, ANCHO_PANEL - relleno * 2);
  y += 8;

  // --- Área del radar, recortada al panel ---------------------------------
  const rx = px + relleno;
  const ry = y;
  const rw = ANCHO_PANEL - relleno * 2;
  const rh = py + ALTO_PANEL - relleno - ry;
  const centroY = camara.yVista || camara.y;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(rx, ry, rw, rh);

  // Ancho real del nivel mapeado al ancho del radar entero —jugadores y
  // enemigos ya están clampados a ese ancho (MARGEN_NIVEL en main.js), así
  // que el propio radar ES el ancho de la calzada, de borde a borde. Sin
  // mapa pintado (suelo procedural de emergencia) no hay ancho de nivel que
  // medir; se usa el del radar tal cual.
  const anchoNivel = Recursos.mapaPintado ? Recursos.anchoSuelo : rw;
  const escalaX = rw / anchoNivel;

  const mundoAY = (wy) => ry + ((wy - (centroY - RANGO_Y)) / (RANGO_Y * 2)) * rh;
  const mundoAX = (wx) => rx + wx * escalaX;

  // Cofres: un cuadrito, se leen distinto de cualquier bicho.
  if (cofres && cofres.pool) {
    const items = cofres.pool.items;
    for (let i = 0; i < cofres.pool.activos; i++) {
      const c = items[i];
      if (c.tipo !== COFRE) continue;
      const cx = mundoAX(c.x), cy = mundoAY(c.y);
      if (cy < ry - 4 || cy > ry + rh + 4) continue;
      ctx.fillStyle = COLOR_COFRE;
      ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
    }
  }

  // Enemigos: puntos pequeños, más grandes y dorados los que imponen. Los
  // objetos del escenario (antorchas, ver datos/enemigos.js `esObjeto`) no
  // son una amenaza y no aparecen: llenarían el radar de puntos quietos que
  // no dicen nada.
  if (enemigos && enemigos.pool) {
    const items = enemigos.pool.items;
    for (let i = 0; i < enemigos.pool.activos; i++) {
      const e = items[i];
      if (e.def.esObjeto) continue;
      const ey = mundoAY(e.y);
      if (ey < ry - 4 || ey > ry + rh + 4) continue;
      const ex = mundoAX(e.x);
      if (e.def.rol === 'jefe') punto(ctx, ex, ey, 4, COLOR_JEFE);
      else if (e.def.cofre) punto(ctx, ex, ey, 3, COLOR_ELITE);
      else punto(ctx, ex, ey, 1.4, COLOR_ENEMIGO);
    }
  }

  // Jugadores: siempre visibles, agarrados al borde del radar si se salen de
  // rango en vez de desaparecer —da igual lo lejos que ande el jefe, quien
  // consulta el mapa quiere verse a sí mismo antes que nada—.
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    if (j.abatido) continue;
    const ex = mundoAX(j.x);
    let ey = mundoAY(j.y);
    if (ey < ry + 3) ey = ry + 3; else if (ey > ry + rh - 3) ey = ry + rh - 3;
    const color = COLOR_JUGADOR[i % COLOR_JUGADOR.length];
    ctx.strokeStyle = 'rgba(6,5,10,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    punto(ctx, ex, ey, 3, color);
  }

  ctx.restore();
  ctx.strokeStyle = t.borde;
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  textoBorde(ctx, 'F4 cerrar', px + ANCHO_PANEL / 2, py + ALTO_PANEL - 6, t.apagado, 2.5);
}

// =============================================================================
// EL PLANO DEL RECINTO
// =============================================================================
//
// El centro comercial NO se enseña entero: se descubre andando. Lo explorado lo
// lleva `RejillaMapa.visto`, una celda de navegación (16 unidades) por píxel de
// plano, y aquí solo se pinta.
//
// LO ÚNICO QUE SE VE DESDE EL PRIMER SEGUNDO SON LAS SALIDAS, y se ven como una
// PUERTA, sin nada alrededor. Es la diferencia entre enseñar el mapa y dar una
// referencia: sabes que hay una salida en el muro norte y no sabes cómo se llega
// hasta ella, que es exactamente lo que tiene que sentir quien está dentro.
//
// POR QUÉ UN LIENZO APARTE Y NO UN fillRect POR CELDA. El plano son 32.256
// celdas; pintarlas de una en una es treinta mil órdenes de dibujo por
// fotograma. Se pinta una vez en un lienzo de 224x144 píxeles —uno por celda— y
// se estampa escalado, que es UNA orden. Y como el mundo está congelado mientras
// el plano está abierto, ese lienzo solo se rehace cuando cambia lo explorado.

// Los aumentos, en píxeles de pantalla por celda del plano.
//
// EL DE ENTRADA ES EL 1, y con él cabe el centro comercial ENTERO —632x408
// celdas de navegación— dentro del panel. Es lo primero que hay que ver al abrir
// el plano en un sitio de 509 pantallas: dónde estás dentro del conjunto. De ahí
// para arriba se acerca sobre el jugador.
//
// No hay aumento por debajo de 1 a propósito: un tabique mide una celda, y
// encogiendo el plano habría filas de píxeles que se pierden por el camino y
// paredes que desaparecen a trozos. Un plano con agujeros que no existen es peor
// que un plano pequeño.
const ZOOMS = [1, 2, 3, 4, 6];
const ZOOM_INICIAL = 0;              // el índice, no el valor: ZOOMS[0] = 1

let iZoom = ZOOM_INICIAL;
let lienzo = null;
let ctxLienzo = null;
let imagen = null;
let selloPintado = -1;               // `celdasVistas` con el que se pintó

// El mando de zoom, que maneja main.js. `d` es +1 acercar, -1 alejar.
export function acercarMapa(d) {
  iZoom = Math.max(0, Math.min(ZOOMS.length - 1, iZoom + d));
}

// Al empezar partida: el aumento vuelve al de entrada y el lienzo se da por
// sucio. Lo segundo importa más de lo que parece — sin ello, la segunda partida
// abre el plano con el centro comercial de la primera ya descubierto.
export function reiniciarZoomMapa() {
  iZoom = ZOOM_INICIAL;
  selloPintado = -1;
  iconosPuerta = null;          // otro nivel puede traer otras puertas
}

// El color de cada celda del plano. No son los del suelo del juego: un plano se
// lee por CONTRASTE entre lo que es paso y lo que es muro, y los ocres y verdes
// del nivel, reducidos a un píxel, se confunden entre ellos.
const COLOR_PARED = [0x1b, 0x1e, 0x24];
const COLOR_SUELO = [0x9a, 0xa4, 0xb4];
const COLOR_FONDO = 'rgba(10, 12, 18, 0.92)';
// El color de cada juego de puertas, por su nombre en la leyenda del mapa. Es la
// única información que el plano da de gratis y toda la lectura del nivel
// depende de que se distingan de un vistazo.
const COLOR_PUERTA = {
  gris:  '#b9c0cb',
  azul:  '#5aa0ea',
  verde: '#4fbf62'
};
const COLOR_SALIDA = COLOR_PUERTA.verde;


function prepararLienzo() {
  const w = RejillaMapa.navAncho, h = RejillaMapa.navAlto;
  if (!lienzo || lienzo.width !== w || lienzo.height !== h) {
    lienzo = document.createElement('canvas');
    lienzo.width = w; lienzo.height = h;
    ctxLienzo = lienzo.getContext('2d');
    imagen = ctxLienzo.createImageData(w, h);
    selloPintado = -1;
  }
  // Nada nuevo que enseñar desde la última vez: se reutiliza lo pintado.
  if (selloPintado === RejillaMapa.celdasVistas) return;

  const datos = imagen.data;
  const visto = RejillaMapa.visto;
  const solido = RejillaMapa.navSolido;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const p = i << 2;
    if (!visto[i]) { datos[p + 3] = 0; continue; }       // sin descubrir: nada
    const c = solido[i] ? COLOR_PARED : COLOR_SUELO;
    datos[p] = c[0]; datos[p + 1] = c[1]; datos[p + 2] = c[2]; datos[p + 3] = 255;
  }
  ctxLienzo.putImageData(imagen, 0, 0);
  selloPintado = RejillaMapa.celdasVistas;
}

// Una puerta: el marco y la hoja, con su pomo. A este tamaño no cabe más
// dibujo, y con menos no se lee como una puerta.
//
// ABIERTA se pinta solo el marco, hueca. Es la diferencia entre "hay un cierre
// ahí" y "ese cierre ya lo abriste", y a partir del minuto diez media lectura
// del plano es esa.
function puerta(ctx, x, y, alto, color, abierta) {
  const ancho = alto * 0.68;
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(x - ancho / 2 - 1, y - alto - 1, ancho + 2, alto + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x - ancho / 2, y - alto, ancho, alto);
  if (abierta) {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(x - ancho / 2 + 1, y - alto + 1, ancho - 2, alto - 2);
    return;
  }
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(x + ancho / 2 - 2.5, y - alto * 0.55, 1.5, 1.5);
}

// DÓNDE PINTAR CADA JUEGO DE PUERTAS. Un cierre son decenas de celdas seguidas y
// pintar un icono por celda sería una fila de puertas; lo que se quiere es UNA
// por cierre. Se agrupan por cercanía en una pasada, y como el mapa no cambia,
// el resultado se guarda y no se vuelve a calcular.
//
// El agrupado es tosco a propósito —la primera celda hace de cabeza y se traga
// todas las que tenga a menos de un radio—: los cierres de un mismo juego están
// a cientos de celdas unos de otros, así que no hay caso dudoso que afinar.
let iconosPuerta = null;

function prepararIconos() {
  if (iconosPuerta) return iconosPuerta;
  iconosPuerta = [];
  const P = RejillaMapa.puertas || [];
  const SEPARACION = 40;           // en celdas finas
  for (const grupo of P) {
    const cabezas = [];
    for (const i of grupo.celdas) {
      const cx = i % RejillaMapa.ancho;
      const cy = (i / RejillaMapa.ancho) | 0;
      let nueva = true;
      for (const c of cabezas) {
        if (Math.abs(c.x - cx) + Math.abs(c.y - cy) < SEPARACION) { nueva = false; break; }
      }
      if (nueva) cabezas.push({ x: cx, y: cy });
    }
    for (const c of cabezas) {
      iconosPuerta.push({ grupo, x: c.x * RejillaMapa.celda, y: c.y * RejillaMapa.celda });
    }
  }
  return iconosPuerta;
}

function dibujarPlano(ctx, jugadores, camara) {
  const t = Tema.actual;
  const relleno = 12;
  // Casi toda la pantalla de interfaz (960x540): el plano del centro comercial
  // entero son 632x408 píxeles y tienen que caber sin encogerlo.
  const ANCHO = 916, ALTO = 512;
  const px = (ANCHO_UI - ANCHO) / 2;
  const py = (ALTO_UI - ALTO) / 2;

  panel(ctx, px, py, ANCHO, ALTO, t.filo);

  ctx.textAlign = 'center';
  ctx.font = `700 13px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, 'PLANO DEL CENTRO', px + ANCHO / 2, py + 19, 1.5);
  let y = py + 28;
  cenefa(ctx, px + relleno, y, ANCHO - relleno * 2);
  y += 9;

  // El hueco donde cabe el plano.
  const vx = px + relleno, vy = y;
  const vw = ANCHO - relleno * 2;
  const vh = py + ALTO - relleno - 16 - vy;

  ctx.save();
  ctx.beginPath();
  ctx.rect(vx, vy, vw, vh);
  ctx.clip();
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(vx, vy, vw, vh);

  prepararLienzo();

  const z = ZOOMS[iZoom];
  const planoW = RejillaMapa.navAncho * z;
  const planoH = RejillaMapa.navAlto * z;

  // Dónde cae la esquina del plano dentro del hueco. Si cabe entero va centrado;
  // si no cabe, se centra en el jugador y se sujeta a los bordes, que es lo
  // mismo que hace la cámara del juego con el mundo.
  const centro = jugadores.length ? jugadores[0] : { x: camara.x, y: camara.y };
  const cxPlano = (centro.x / RejillaMapa.navCelda) * z;
  const cyPlano = (centro.y / RejillaMapa.navCelda) * z;

  let ox, oy;
  if (planoW <= vw) ox = vx + (vw - planoW) / 2;
  else ox = Math.max(vx + vw - planoW, Math.min(vx, vx + vw / 2 - cxPlano));
  if (planoH <= vh) oy = vy + (vh - planoH) / 2;
  else oy = Math.max(vy + vh - planoH, Math.min(vy, vy + vh / 2 - cyPlano));

  // Sin suavizado: es un plano de píxeles y tiene que verse como tal, no como
  // una mancha interpolada.
  const suave = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lienzo, ox, oy, planoW, planoH);
  ctx.imageSmoothingEnabled = suave;

  // TODAS LAS PUERTAS, SIEMPRE, aunque no se haya pisado nunca esa esquina del
  // mapa. Es lo único que el plano regala, y es lo que convierte el laberinto en
  // algo con rumbo: los cierres grises marcan hasta dónde llega tu anillo, los
  // azules el siguiente, y los verdes son la calle.
  for (const ic of prepararIconos()) {
    const sx = ox + (ic.x / RejillaMapa.navCelda) * z;
    const sy = oy + (ic.y / RejillaMapa.navCelda) * z;
    puerta(ctx, sx, sy + 5, 11, COLOR_PUERTA[ic.grupo.nombre] || COLOR_SALIDA,
           ic.grupo.abierta);
  }

  // Y los jugadores, cada uno de su color, como en el HUD.
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    const jx = ox + (j.x / RejillaMapa.navCelda) * z;
    const jy = oy + (j.y / RejillaMapa.navCelda) * z;
    ctx.beginPath();
    ctx.arc(jx, jy, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0d12';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(jx, jy, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = j.abatido ? t.apagado : COLOR_JUGADOR[i % COLOR_JUGADOR.length];
    ctx.fill();
  }

  ctx.restore();

  // El pie: cuánto se lleva explorado y qué teclas hay. El porcentaje es sobre
  // lo TRANSITABLE, no sobre el rectángulo del mapa: "he visto el 40%" tiene que
  // querer decir 40% de lo que se puede andar, no de la superficie del solar.
  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.textAlign = 'left';
  const pct = Math.round((RejillaMapa.transitablesVistas /
                          Math.max(1, RejillaMapa.navTransitables)) * 100);
  textoBorde(ctx, `EXPLORADO ${Math.min(100, pct)}%`, vx, py + ALTO - 7, t.apagado, 2.5);
  ctx.textAlign = 'right';
  textoBorde(ctx, `+ / -  ACERCAR (x${z})     BLOQ MAYÚS O Y  CERRAR`,
             vx + vw, py + ALTO - 7, t.apagado, 2.5);
  ctx.textAlign = 'center';
}

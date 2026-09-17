import { ANCHO_FISICO, ALTO_FISICO, ANCHO_UI, ALTO_UI } from '../core/constantes.js';

// Capa de interfaz: un lienzo APARTE del juego, a resolución de pantalla.
//
// POR QUÉ EXISTE. El lienzo del juego mide 960x540 y CSS lo amplía con
// `image-rendering: pixelated`, que es exactamente lo que mantiene crujiente el
// pixel art. Pero ese ampliado se lo come TODO lo que haya dentro, el texto
// incluido: una letra trazada a 960x540 y ampliada al triple es un bitmap
// ampliado al triple, con sus escalones. Subir el tamaño de la fuente no
// arregla nada, porque el problema no es el tamaño — es que el ampliado ocurre
// DESPUÉS de trazarla.
//
// La única forma de tener texto nítido y pixel art crujiente a la vez es
// separarlos en dos lienzos. Este va al tamaño real en píxeles de dispositivo,
// con el suavizado encendido, y las letras se trazan directamente a esa
// resolución: las rasteriza el navegador con su hinting, como en cualquier
// página web.
//
// SISTEMA DE COORDENADAS. La capa sigue trabajando en unidades de 960x540 y la
// transformación se encarga del resto, así que el trazado de la interfaz no
// sabe nada de zoom ni de densidad de pantalla y las medidas de los paneles
// valen tal cual. Lo que cambia es que un `12px` de fuente ya no son 12 píxeles
// de bitmap ampliados después, sino 12 unidades resueltas a la resolución
// final: en una pantalla 4K con zoom 4 y ratio 1.5, eso son 72 píxeles reales
// de letra.

// Familia funcional: etiquetas, cifras, descripciones. Humanista y ancha, que
// es lo que aguanta bien los tamaños pequeños.
export const FUENTE = '"Segoe UI", "Noto Sans", system-ui, sans-serif';

// Familia de titular. Romana de verdad si la máquina la tiene, y si no una
// serifa robusta. NUNCA una de serifas finas: se deshacen contra el fondo.
export const FUENTE_TITULO = '"Trajan Pro", "Palatino Linotype", "Book Antiqua", Georgia, serif';

// Familia de RELATO: los párrafos largos de la intro. Serifa de estilo romano,
// para que el texto de la historia case con la piedra labrada sobre la que se
// lee, en vez de parecer la interfaz de una aplicación encima de un dibujo.
//
// NO usa FUENTE_TITULO aunque sea la más romana de las dos, y el motivo es
// Trajan: es una tipografía CAPITAL, sin minúsculas de verdad. Un titular de
// cuatro palabras en versales es un titular; tres párrafos en versales no hay
// quien los lea. Así que aquí se empieza directamente por la humanista, que sí
// tiene caja baja, y Trajan se queda para el titular.
export const FUENTE_RELATO = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, "Times New Roman", serif';

// Tope de densidad. La interfaz se dibuja al doble de la resolución CSS como
// mucho, aunque la pantalla dé más.
//
// El motivo es de coste, no de gusto: el lienzo se limpia y se recompone entero
// cada frame, y su área crece con el CUADRADO de este número. En una pantalla
// que declara 3.28 el búfer pasa de 1920x1080 a 3150x1772 — dos veces y media
// más píxeles que mover por frame— y el requisito de 60 fps con 800 entidades
// no admite regalos. A 2x el texto ya es indistinguible de 3x a distancia de
// juego: lo que se nota es el salto de 1x a 2x, no el siguiente.
//
// Si algún día sobra presupuesto, subir esto a 3 es la única línea que tocar.
const MAX_DENSIDAD = 2;

export const Capa = {
  lienzo: null,
  ctx: null,
  escala: 1,             // píxeles de dispositivo por unidad de interfaz

  // Alto REALMENTE VISIBLE, en unidades de interfaz.
  //
  // La capa mide siempre ALTO_UI de alto, pero el lienzo se centra en la ventana
  // y en una más baja se RECORTA por arriba y por abajo: lo que se pinte cerca
  // de un borde no llega a verse. Da igual mientras la interfaz sea un panel en
  // el centro, y deja de dar igual en cuanto una pantalla ocupa el alto entero
  // —la tienda y el resumen final—, que es quien consulta esto para no dejar el
  // pie fuera de la ventana.
  altoVisible: ALTO_UI,

  iniciar(lienzo) {
    this.lienzo = lienzo;
    // `alpha: true` obligatorio: por debajo está el juego y hay que verlo.
    this.ctx = lienzo.getContext('2d');
  },

  // `factor` es el mismo zoom entero que usa el juego. La densidad de pantalla
  // se multiplica encima: el juego la ignora a propósito —romper la rejilla de
  // píxeles emborronaría el arte— pero la interfaz la quiere toda.
  redimensionar(factor) {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DENSIDAD);
    const anchoCss = ANCHO_FISICO * factor;
    const altoCss = ALTO_FISICO * factor;

    this.lienzo.style.width = anchoCss + 'px';
    this.lienzo.style.height = altoCss + 'px';
    this.lienzo.width = Math.round(anchoCss * dpr);
    this.lienzo.height = Math.round(altoCss * dpr);
    // La interfaz dibuja en la rejilla FIJA de ANCHO_UI unidades (ver
    // core/constantes.js), pero el lienzo real mide lo que mida el mundo
    // (ANCHO_FISICO, que varía con ESCALA_ARTE). La escala tiene que cubrir el
    // lienzo entero partiendo de esa rejilla fija, así que se corrige por la
    // proporción entre ambas en vez de asumir que son la misma cosa.
    this.escala = (this.lienzo.width) / ANCHO_UI;

    // Lo que cabe de los `altoCss` píxeles del lienzo dentro de la ventana,
    // devuelto en las mismas unidades en que dibuja todo lo demás.
    const visible = Math.min(window.innerHeight || altoCss, altoCss);
    this.altoVisible = ALTO_UI * visible / altoCss;
  },

  // Se llama al principio de cada frame. Cambiar el tamaño de un lienzo resetea
  // su contexto, así que la transformación se vuelve a poner aquí en vez de en
  // redimensionar: es una asignación por frame y evita toda una clase de fallos
  // por estado perdido.
  limpiar() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.lienzo.width, this.lienzo.height);
    c.setTransform(this.escala, 0, 0, this.escala, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    // Normalización defensiva: `letterSpacing` sobrevive a save/restore, así que
    // si alguna vez alguien lo toca y no lo devuelve, aquí se corta. No se usa
    // para espaciar —para eso está textoEspaciado— pero más vale dejarlo a cero
    // que perseguir después por qué hay una pantalla con el texto abierto.
    if (c.letterSpacing !== undefined) c.letterSpacing = '0px';
  }
};

// Texto con reborde oscuro.
//
// Es lo que sustituye al marco y al fondo del panel. Sin caja detrás, un texto
// claro sobre la arena clara del anfiteatro desaparece; con el reborde se lee
// sobre cualquier cosa, incluida una horda de ochocientos bichos, y no hay que
// tapar el juego con un rectángulo para conseguirlo.
//
// Trazo ANTES que relleno, y con `lineJoin` redondeado: al revés, el trazo se
// comería la mitad del grosor de la letra por dentro y la dejaría anémica.
export function textoBorde(ctx, txt, x, y, color, grosor = 3) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = grosor;
  ctx.strokeStyle = 'rgba(6,5,10,.92)';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = color;
  ctx.fillText(txt, x, y);
}

// Reparte un texto en líneas que no superen `anchoMax`, con la fuente que ya
// tenga asignada `ctx`. Reparto simple por palabras: no hay descripciones de
// personaje tan largas como para necesitar guionado ni nada más fino.
export function envolverTexto(ctx, txt, anchoMax) {
  const palabras = txt.split(' ');
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? actual + ' ' + palabra : palabra;
    if (actual && ctx.measureText(prueba).width > anchoMax) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Titular con aire entre letras, que es lo que da el carácter lapidario sin
// necesidad de tener una romana instalada.
//
// Se traza LETRA A LETRA a mano en vez de usar `ctx.letterSpacing`. Ese atributo
// no entra en la pila de save/restore del canvas —comprobado: tras un
// save/restore conserva el valor que se le puso dentro— así que se filtra al
// resto de la interfaz y acaba saliendo texto corrido donde nadie lo pidió.
// Aquí no hay estado que se escape: se avanza el cursor y ya está. Son dos
// titulares por pantalla, no un bucle caliente.
// Respeta el ctx.textAlign que haya puesto quien llama, porque trazar letra a
// letra obliga a alinear a mano: si no, un texto pedido "a la derecha" se dibuja
// hacia la derecha DESDE el punto dado y se sale por el borde.
// `borde`, si se pasa, es el grosor del reborde oscuro que lleva cada letra:
// mismo criterio que `textoBorde` —trazo antes que relleno, y por letra, que es
// como se traza aquí todo—. Sin él se rellena y ya, que es lo que hacía siempre
// y lo que quieren los titulares sobre fondo oscuro.
export function textoEspaciado(ctx, txt, x, y, extra, borde = 0) {
  const letras = [...txt];
  const anchos = new Array(letras.length);
  let total = 0;
  for (let i = 0; i < letras.length; i++) {
    anchos[i] = ctx.measureText(letras[i]).width;
    total += anchos[i] + extra;
  }
  total -= extra;                       // el último no lleva hueco detrás

  const alineacion = ctx.textAlign;
  let cx = x;
  if (alineacion === 'center') cx = x - total / 2;
  else if (alineacion === 'right' || alineacion === 'end') cx = x - total;

  ctx.textAlign = 'left';
  if (borde > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = borde;
    ctx.strokeStyle = 'rgba(6,5,10,.92)';
  }
  for (let i = 0; i < letras.length; i++) {
    if (borde > 0) ctx.strokeText(letras[i], cx, y);
    ctx.fillText(letras[i], cx, y);
    cx += anchos[i] + extra;
  }
  ctx.textAlign = alineacion;
  return total;
}

// Lo mismo para las formas de los iconos: se pinta primero una copia engordada
// en oscuro y encima la buena.
export function conBorde(ctx, pintar, grosor = 3) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(6,5,10,.92)';
  ctx.fillStyle = 'rgba(6,5,10,.92)';
  ctx.lineWidth = grosor;
  pintar(ctx, true);
  ctx.restore();
  pintar(ctx, false);
}

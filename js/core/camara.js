import { ANCHO_LOGICO, ALTO_LOGICO } from './constantes.js';
import { exp } from './mate.js';

// Cuánto se queda el jugador por dentro del borde al topar con la correa. Es
// medio sprite más un respiro: pegado al filo no se le vería entero.
const MARGEN_CORREA = 22;

// Seguimiento con suavizado exponencial. Guarda el estado anterior para que el
// render pueda interpolar: sin eso, la cámara va a 60 Hz y la imagen a 144 y se
// nota un temblor constante en el fondo.
export class Camara {
  constructor() {
    this.x = 0; this.y = 0;
    this.xPrev = 0; this.yPrev = 0;
    this.xVista = 0; this.yVista = 0;    // posición ya interpolada, para dibujar
    this.suavizado = 8;                  // mayor = más pegada al jugador
  }

  situar(x, y) {
    this.x = this.xPrev = this.xVista = x;
    this.y = this.yPrev = this.yVista = y;
  }

  seguir(objetivoX, objetivoY, dt) {
    this.xPrev = this.x;
    this.yPrev = this.y;
    // Independiente del dt: con timestep fijo da igual, pero así no se rompe
    // si algún día el paso cambia.
    const k = 1 - exp(-this.suavizado * dt);
    this.x += (objetivoX - this.x) * k;
    this.y += (objetivoY - this.y) * k;
  }

  interpolar(alpha) {
    this.xVista = this.xPrev + (this.x - this.xPrev) * alpha;
    this.yVista = this.yPrev + (this.y - this.yPrev) * alpha;
  }

  // Sigue al CENTRO del grupo. Con un solo jugador es exactamente lo de antes.
  seguirGrupo(jugadores, dt) {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < jugadores.length; i++) {
      const j = jugadores[i];
      if (j.abatido) continue;      // un caído no arrastra la cámara
      sx += j.x; sy += j.y; n++;
    }
    if (n === 0) { this.xPrev = this.x; this.yPrev = this.y; return; }
    this.seguir(sx / n, sy / n, dt);
  }

  // Correa: nadie puede salirse de la pantalla.
  //
  // Es la consecuencia de diseño que impone el cooperativo local. El juego corre
  // a 480x270 con escalado ENTERO, que es lo que le da la nitidez; alejar la
  // cámara cuando el grupo se abre rompería esa rejilla de píxeles, y partir la
  // pantalla en cuatro dejaría viewports de 240x135, diminutos para este género.
  // Así que el grupo va junto y quien se queda atrás topa con el borde, como en
  // los beat'em ups cooperativos de toda la vida.
  //
  // Se sujeta la posición, no la velocidad: frenar por velocidad dejaría al
  // rezagado pegado al borde temblando contra el tope.
  sujetar(jugadores) {
    const izq = this.x - ANCHO_LOGICO / 2 + MARGEN_CORREA;
    const der = this.x + ANCHO_LOGICO / 2 - MARGEN_CORREA;
    const arr = this.y - ALTO_LOGICO / 2 + MARGEN_CORREA;
    const aba = this.y + ALTO_LOGICO / 2 - MARGEN_CORREA;
    for (let i = 0; i < jugadores.length; i++) {
      const j = jugadores[i];
      if (j.x < izq) j.x = izq; else if (j.x > der) j.x = der;
      if (j.y < arr) j.y = arr; else if (j.y > aba) j.y = aba;
    }
  }

  // EL TOPE CONTRA LA FACHADA, en los niveles que son un recinto cerrado y no
  // una calzada que sigue de largo (ver sistemas/rejillaMapa.js).
  //
  // Es lo contrario de `sujetar`: allí se sujeta a los JUGADORES contra el borde
  // de la pantalla, y aquí a la PANTALLA contra el borde del mundo. Sin esto, el
  // grupo pega la espalda a una pared y medio visor se llena del vacío de fuera
  // del mapa.
  //
  // Un mundo más pequeño que el visor —que hoy no existe, pero es un mapa de
  // pruebas de nada— se centra en vez de sujetarse: sujetarlo por los dos lados
  // a la vez dejaría la cámara dando saltos entre los dos topes.
  sujetarAlMundo(anchoMundo, altoMundo) {
    const mitadX = ANCHO_LOGICO / 2;
    const mitadY = ALTO_LOGICO / 2;
    if (anchoMundo <= ANCHO_LOGICO) this.x = anchoMundo / 2;
    else if (this.x < mitadX) this.x = mitadX;
    else if (this.x > anchoMundo - mitadX) this.x = anchoMundo - mitadX;

    if (altoMundo <= ALTO_LOGICO) this.y = altoMundo / 2;
    else if (this.y < mitadY) this.y = mitadY;
    else if (this.y > altoMundo - mitadY) this.y = altoMundo - mitadY;
  }

  // Esquina superior izquierda del viewport en coordenadas de mundo.
  // LOS BORDES DE LA CÁMARA, EN DOS SABORES, Y NO ES UN CAPRICHO.
  //
  // `xVista` es la posición INTERPOLADA para pintar: se calcula con lo que
  // sobra en el acumulador del bucle cuando toca dibujar, así que depende de
  // los fotogramas de cada máquina. Vale para dibujar y no vale para nada más.
  //
  // `x` es la posición de la SIMULACIÓN, idéntica en las dos máquinas de un
  // cooperativo. Cualquier cosa que decida algo del mundo tiene que salir de
  // aquí.
  //
  // Los nombres cortos —`izquierda`, `arriba`— son los de simulación A
  // PROPÓSITO: si alguien se equivoca de getter dibujando, el error es de una
  // fracción de píxel durante un fotograma; si se equivoca simulando, dos
  // partidas dejan de ser la misma. Que el descuido caiga del lado barato.
  //
  // Ya pasó: el sismo del cíclope elegía su punto al azar con `izquierda`
  // cuando eso era la vista, y las dos máquinas lo tiraban a sitios distintos.
  // La partida se separaba a los cinco minutos, que es cuando entra el cíclope.
  get izquierda() { return this.x - ANCHO_LOGICO / 2; }
  get arriba()    { return this.y - ALTO_LOGICO / 2; }
  get izquierdaVista() { return this.xVista - ANCHO_LOGICO / 2; }
  get arribaVista()    { return this.yVista - ALTO_LOGICO / 2; }
}

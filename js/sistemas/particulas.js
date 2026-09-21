import { Pool } from '../core/pool.js';
import { sen, cos, atan2, exp } from '../core/mate.js';

// Partículas. Singleton con pool preasignado, como Recursos: hay uno solo y lo
// usa todo el mundo, así que pasarlo por parámetro por media docena de archivos
// solo añadiría ruido.
//
// Se dibujan por código, nunca con sprite. Son cuadrados de uno o dos píxeles
// con rozamiento y gravedad: a esta resolución, un cuadradito bien colocado se
// lee mejor que cualquier textura.
//
// EL COLOR SE PASA YA HECHO, como cadena. La versión obvia sería guardar r,g,b
// y componer `rgba(...)` al dibujar, pero eso construye una cadena por partícula
// y por frame: con 400 partículas son 24.000 cadenas por segundo, justo la
// presión sobre el recolector que el pool existe para evitar. Las cadenas de
// color son constantes de módulo en quien emite, y aquí solo se guarda la
// referencia. La transparencia va por `globalAlpha`, que es un número.

const GRAVEDAD = 90;        // unidades lógicas por segundo al cuadrado
const ROZAMIENTO = 2.6;     // frenado exponencial por segundo

// A partir de esta ocupación del pool, quien emite adorno se recorta.
const UMBRAL_SATURACION = 0.45;

// Paleta de partículas. Constantes, no se construyen nunca en caliente.
export const COLOR_SANGRE  = '#a8323c';
export const COLOR_CHISPA  = '#ffe9a8';
export const COLOR_POLVO   = '#b99b6b';
export const COLOR_CENIZA  = '#6d6a63';
// De qué está hecho lo que no es carne. Ver MATERIALES en entidades/enemigo.js:
// la gárgola es una estatua y no sangra, y a la medusa se le escapa el veneno
// con el que llena sus púas.
export const COLOR_PIEDRA  = '#8f9298';
export const COLOR_VENENO  = '#7fc247';
// Cristal y chapa: lo que salta de una máquina expendedora al reventarla.
export const COLOR_CRISTAL = '#cfe6f2';

// La paleta es CERRADA a propósito: el dibujado agrupa por color y recorre esta
// lista, así que un color nuevo tiene que añadirse aquí o no se pintará.
//
// QUÉ CUESTA AÑADIR UNO. Una pasada más sobre el pool, que son unos cientos de
// comparaciones de puntero por frame: nada. Lo que se está evitando al agrupar
// es asignar `fillStyle`, que obliga a parsear una cadena CSS, y de eso sigue
// habiendo uno por color y no uno por partícula. O sea que la lista puede
// crecer mientras cada color tenga quien lo emita — y hasta ahora COLOR_CENIZA
// no lo tenía: estaba en la paleta sin que nadie lo pidiera nunca, pagando su
// pasada a cambio de nada. Ahora es lo que sueltan las antorchas al apagarse.
const PALETA = [COLOR_SANGRE, COLOR_CHISPA, COLOR_POLVO, COLOR_CENIZA,
                COLOR_PIEDRA, COLOR_VENENO, COLOR_CRISTAL];

function crearParticula() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    vida: 0, vidaMax: 1,
    tam: 1,
    gravedad: 0,
    color: COLOR_CHISPA
  };
}

export const Particulas = {
  pool: null,

  iniciar(capacidad) {
    this.pool = new Pool(crearParticula, capacidad);
  },

  get activas() { return this.pool ? this.pool.activos : 0; },

  // ¿Vamos apretados? Quien emite adorno lo consulta antes para recortarse solo,
  // en vez de pedir mil partículas y que el pool las rechace una a una. La
  // diferencia importa: rechazar es barato, pero DIBUJAR las que sí entraron no,
  // y sin este freno el pool vive siempre lleno.
  saturado() {
    return this.pool.activos > this.pool.capacidad * UMBRAL_SATURACION;
  },

  emitir(x, y, vx, vy, vida, tam, color, gravedad) {
    const p = this.pool.obtener();
    if (!p) return null;                 // lleno: se pierde una chispa, da igual
    p.x = p.xPrev = x;
    p.y = p.yPrev = y;
    p.vx = vx; p.vy = vy;
    p.vida = p.vidaMax = vida;
    p.tam = tam;
    p.gravedad = gravedad;
    p.color = color;
    return p;
  },

  // Estallido radial. Es el efecto de muerte y el de impacto: cambian el
  // número, la velocidad y el color, no la forma.
  estallido(x, y, cantidad, velocidad, vida, tam, color, gravedad, rng) {
    for (let i = 0; i < cantidad; i++) {
      const a = rng() * Math.PI * 2;
      const v = velocidad * (0.35 + rng() * 0.65);
      this.emitir(x, y, cos(a) * v, sen(a) * v,
                  vida * (0.6 + rng() * 0.4), tam, color, gravedad);
    }
  },

  // CHORRO: lo mismo pero HACIA UN LADO, dentro de un cono.
  //
  // Es la diferencia entre "aquí ha pasado algo" y "aquí ha pasado algo QUE
  // VENÍA DE ALLÍ". Un estallido radial es el mismo dibujo lo golpee un pilum
  // por la espalda o una serpiente de frente, y esa información —de dónde vino
  // el golpe— la tiene quien llama (ver `danyar` en entidades/enemigo.js, que
  // recibe la dirección desde el primer día y hasta ahora solo la usaba para
  // empujar).
  //
  // `apertura` es el medio ángulo del cono en radianes: 0 escupe una línea y
  // Math.PI vuelve a ser un estallido redondo.
  chorro(x, y, dirX, dirY, cantidad, velocidad, apertura, vida, tam, color, gravedad, rng) {
    const base = atan2(dirY, dirX);
    for (let i = 0; i < cantidad; i++) {
      const a = base + (rng() * 2 - 1) * apertura;
      const v = velocidad * (0.45 + rng() * 0.55);
      this.emitir(x, y, cos(a) * v, sen(a) * v,
                  vida * (0.6 + rng() * 0.4), tam, color, gravedad);
    }
  },

  actualizar(dt) {
    const items = this.pool.items;
    const frenado = exp(-ROZAMIENTO * dt);
    let k = 0;
    while (k < this.pool.activos) {
      const p = items[k];
      p.xPrev = p.x;
      p.yPrev = p.y;
      p.vx *= frenado;
      p.vy *= frenado;
      p.vy += GRAVEDAD * p.gravedad * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt;
      if (p.vida <= 0) this.pool.liberarEn(k);   // sin avanzar k
      else k++;
    }
  },

  vaciar() { if (this.pool) this.pool.vaciar(); },

  // Un fillRect por partícula, sin rutas ni transformaciones. El alfa cae con la
  // vida restante para que se apaguen en vez de desaparecer de golpe.
  //
  // Se dibuja AGRUPADO POR COLOR, una pasada por color de la paleta. Asignar
  // fillStyle obliga a parsear la cadena CSS, y hacerlo por partícula eran
  // trescientas asignaciones por frame en el orden en que cayeran. Con la
  // paleta cerrada a cuatro colores, agrupar deja cuatro.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    const alfaPrev = ctx.globalAlpha;
    for (let c = 0; c < PALETA.length; c++) {
      const color = PALETA[c];
      let usado = false;
      for (let k = 0; k < n; k++) {
        const p = items[k];
        if (p.color !== color) continue;
        if (!usado) { ctx.fillStyle = color; usado = true; }
        const x = p.xPrev + (p.x - p.xPrev) * alpha;
        const y = p.yPrev + (p.y - p.yPrev) * alpha;
        const t = p.vida / p.vidaMax;
        ctx.globalAlpha = t > 1 ? 1 : t;
        // MENGUAN ADEMÁS DE APAGARSE. Una chispa que solo pierde opacidad se
        // queda del mismo tamaño hasta desaparecer y se lee como un cuadrado
        // que se difumina; encogiendo a la vez se lee como una chispa que se
        // consume. Es una multiplicación por partícula y cambia bastante.
        const lado = p.tam * (0.45 + 0.55 * (t > 1 ? 1 : t));
        ctx.fillRect(x - lado * 0.5, y - lado * 0.5, lado, lado);
      }
    }
    ctx.globalAlpha = alfaPrev;
  }
};

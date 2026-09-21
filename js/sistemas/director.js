import { ANCHO_LOGICO, ALTO_LOGICO } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { tipoConsumible } from '../entidades/cofre.js';
import { Jefes } from './jefes.js';
import { sen, cos, atan2, hipot } from '../core/mate.js';
import { RejillaMapa } from './rejillaMapa.js';

// Mismo margen que MARGEN_NIVEL en main.js: no se importa de ahí porque
// main.js es el arranque, no un módulo pensado para que otros tiren de él.
const MARGEN_NIVEL = 12;

// EL DIRECTOR DE OLEADAS (Fase 5, sección 11 del plan).
//
// Es quien decide qué aparece, cuándo, cuánto y por dónde durante los veinte
// minutos de la partida. No es una herramienta de prueba como lo era el
// simulacro al que sustituye: esto ES el juego. Corre siempre, desde el primer
// frame, y sin él la partida está vacía.
//
// No sabe nada de Mérida. Todo —la curva, los tipos, la densidad, el escalado y
// los hitos— sale de datos/niveles/<nivel>.js. Poner un nivel nuevo es escribir
// otro archivo de datos, y este código no se entera. Lo único que aporta el
// director es la GEOMETRÍA de la aparición y el orden en que se atiende todo.
//
// Los cinco patrones del plan:
//   anillo      distribución uniforme por el perímetro, fuera de cámara
//   linea       muro entrando por un borde
//   oleada      grupo compacto desde una dirección
//   cerco       rodean por los cuatro lados a la vez
//   individual  élites (mantícora y serpiente dorada) y, en la Fase 6, jefes
//
// Lo que TODAVÍA no hace: invocar a los jefes. Cerbero e Hidra son la Fase 6 y
// necesitan sus fases de patrón; hasta entonces el director anuncia el minuto en
// que entran, que es la mitad de la información, y sigue con la curva.

// Margen de aparición fuera de cámara: nadie ve nacer a nadie.
const MARGEN_APARICION = 40;
const DISPERSION = 34;                 // grosor del anillo de entrada

// El cerco entra más cerca que el anillo. Es su gracia: no da tiempo a rodearlo,
// hay que abrirse paso. Aun así queda fuera de pantalla.
const MARGEN_CERCO = 18;

// Semiejes del rectángulo de aparición, medidos desde el centro de la cámara.
const SEMI_X = ANCHO_LOGICO / 2 + MARGEN_APARICION;
const SEMI_Y = ALTO_LOGICO / 2 + MARGEN_APARICION;

// Cuánto dura en pantalla un aviso (hito de jefe, élite que entra).
const DURACION_AVISO = 5;

// --- Cuota del enjambre de fondo ---------------------------------------------
//
// El goteo de masa (patrón `anillo`) no puede gastarse el techo de densidad
// entero: se para al 72% y el resto queda RESERVADO para los acontecimientos —la
// línea de legionarios, el cerco, la travesía—.
//
// Sin esta reserva no salía ninguno, y se descubrió midiendo: al pasar las
// fuentes de masa a goteo continuo, el enjambre mantiene la población pegada al
// techo todo el rato, así que cada vez que a una travesía le tocaba entrar se
// encontraba el cupo lleno y se saltaba. El resultado era una partida hecha solo
// de goteo, justo lo contrario de lo que se buscaba: sin acontecimientos, todos
// los minutos se parecen.
//
// El anillo es el fondo y todo lo demás son sucesos. Esa distinción ya estaba en
// el diseño de los datos; aquí solo se le pone precio.
const CUOTA_FONDO = 0.72;

// Cuánto más lenta entra una fuente de fondo al principio de su ventana. 1.7 =
// suelta un 70% más despacio al abrirse y llega a su cadencia nominal al cerrarse.
const RAMPA_INICIO = 1.7;

// Cada cuánto cae un consumible por el mapa, y a qué distancia de la cámara.
// Lejos a propósito: si cayeran encima, no habría que ir a por ellos y dejarían
// de ser una decisión. A un tercio de pantalla se ven, pero hay que salir a por
// ellos y eso significa meterse donde no estabas.
const CONSUMIBLE_CADA = 38;
const CONSUMIBLE_DIST_MIN = 140;
const CONSUMIBLE_DIST_MAX = 260;

// Cuánto antes del final entra el jefe. Un minuto: el tiempo justo para que la
// horda se retire, se vea llegar y dé para pelear.
const MARGEN_JEFE_FINAL = 60;

// Escalado por minuto, en funciones sueltas para poder pedirlo también fuera del
// bucle de eventos (lo necesita la invocación del jefe).
function escalaVidaDe(nivel, t) {
  const esc = nivel.escalado || { vida: 0 };
  return 1 + esc.vida * (t / 60);
}
function escalaDanyoDe(nivel, t) {
  const esc = nivel.escalado || { danyo: 0 };
  return 1 + esc.danyo * (t / 60);
}

// --- Geometría ---------------------------------------------------------------
// Punto del PERÍMETRO del rectángulo de pantalla a partir de un recorrido
// 0..1. Perímetro y no ángulo: un ángulo uniforme sobre una elipse NO da puntos
// uniformes sobre su borde, se apelotonan en los extremos del eje largo. Medido
// con 500 enemigos, los octantes laterales recibían el doble que los de arriba.
//
// Escribe en `punto` en vez de devolver un objeto: esto se llama cientos de
// veces por oleada y crear un literal por llamada sería asignar en caliente.
const punto = { x: 0, y: 0 };

function perimetro(t, semiX, semiY) {
  const ladoH = semiX * 2;
  const ladoV = semiY * 2;
  const total = (ladoH + ladoV) * 2;
  let d = t * total;
  if (d < ladoH)                    { punto.x = -semiX + d;                     punto.y = -semiY; }
  else if (d < ladoH + ladoV)       { punto.x = semiX;                          punto.y = -semiY + (d - ladoH); }
  else if (d < ladoH * 2 + ladoV)   { punto.x = semiX - (d - ladoH - ladoV);    punto.y = semiY; }
  else                              { punto.x = -semiX;                         punto.y = semiY - (d - ladoH * 2 - ladoV); }
}

// Empujón hacia fuera para que el anillo tenga grosor y no sea una línea de
// enemigos perfectamente alineados, que se lee como un fallo.
function ensanchar(fuera) {
  const nx = punto.x > 0 ? 1 : (punto.x < 0 ? -1 : 0);
  const ny = punto.y > 0 ? 1 : (punto.y < 0 ? -1 : 0);
  punto.x += nx * fuera * (Math.abs(punto.x) === SEMI_X ? 1 : 0.35);
  punto.y += ny * fuera * (Math.abs(punto.y) === SEMI_Y ? 1 : 0.35);
}

// --- Patrones ----------------------------------------------------------------
// Todos reciben ya resueltos el centro de cámara, la mezcla de tipos y las
// escalas de vida y daño del minuto en curso. Devuelven cuántos han llegado a
// aparecer: con el pool lleno la cuenta se queda corta, y el director necesita
// saberlo para no dar por servido un élite que no ha salido.

// Fracción de las apariciones del enjambre que se coloca DELANTE del jugador, en
// el sentido en que avanza. Ver `sesgarHaciaAvance`.
// Bajado de 0.62: con casi dos tercios entrando por delante, moverse en una
// dirección dejaba el resto del campo vacío y todo el mundo apelotonado en el
// lado hacia el que ibas. Con 0.45, la mayoría sigue entrando por delante —que
// es lo que impide arrastrar cola— pero más de la mitad sigue repartiéndose por
// todo el perímetro, así que SIEMPRE llega algo por los cuatro lados.
const SESGO_DELANTE = 0.45;

// Punto del perímetro sesgado hacia la dirección de avance.
//
// ESTO ES LO QUE MÁS ROMPE EL REBAÑO, y es la técnica del género. Con la
// aparición uniforme alrededor, un jugador que se mueve deja atrás a todo lo que
// nace detrás de él y se encuentra de frente solo con una fracción: el resultado
// es que arrastra una cola cada vez más larga y no encuentra nada delante. Con el
// sesgo, la mayoría de lo que entra lo hace HACIA DONDE VA, así que avanzar
// significa meterse en enemigos nuevos y la cola de atrás se queda atrás de
// verdad, se recicla y desaparece.
//
// Dicho de otra forma: sin esto, huir siempre funciona y la horda es un adorno
// que te sigue. Con esto, huir te mete en la siguiente horda, que es la decisión
// que el juego quiere plantear.
//
// `t` es el recorrido 0..1 sobre el perímetro; se remapea al semiperímetro que
// mira hacia el rumbo. Con el jugador quieto (rumbo nulo) no hay sesgo y el
// reparto vuelve a ser uniforme, que es lo correcto: parado no hay "delante".
function puntoDeEntrada(t, rng, rumboX, rumboY) {
  if ((rumboX === 0 && rumboY === 0) || rng() > SESGO_DELANTE) {
    perimetro(t, SEMI_X, SEMI_Y);
    return;
  }
  // Ángulo del rumbo, ±70°: un cono ancho por delante, no un punto. Con un cono
  // estrecho la horda entra en fila por el mismo sitio y se nota el truco.
  const ang = atan2(rumboY, rumboX) + (rng() - 0.5) * 2.44;
  // De ángulo a recorrido del perímetro: se proyecta el rayo sobre el
  // rectángulo, que es lo que evita el apelotonamiento en las esquinas del que
  // habla el comentario de `perimetro`.
  // `cx`/`sy` y no `cos`/`sin`: una local llamada igual que la función
  // importada la tapa dentro de toda la función, y `const cos = cos(ang)` se
  // referencia a sí misma. Revienta en cuanto la horda entra con sesgo.
  const cx = cos(ang), sy = sen(ang);
  const escala = Math.min(
    Math.abs(cx) > 1e-6 ? SEMI_X / Math.abs(cx) : Infinity,
    Math.abs(sy) > 1e-6 ? SEMI_Y / Math.abs(sy) : Infinity);
  punto.x = cx * escala;
  punto.y = sy * escala;
}

function patronAnillo(enemigos, cx, cy, n, tipos, rng, eV, eD, mov, rumboX = 0, rumboY = 0) {
  let puestos = 0;
  for (let i = 0; i < n; i++) {
    puntoDeEntrada(rng(), rng, rumboX, rumboY);
    ensanchar(rng() * DISPERSION);
    const tipo = tipos[(rng() * tipos.length) | 0];
    if (!enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD, mov)) break;
    puestos++;
  }
  return puestos;
}

// Muro por un borde. Se reparten a lo largo de ese lado con separación regular y
// en dos filas: una fila sola se atraviesa por un hueco, dos hay que romperlas.
function patronLinea(enemigos, cx, cy, n, tipos, rng, eV, eD, mov) {
  const lado = (rng() * 4) | 0;        // 0 arriba, 1 derecha, 2 abajo, 3 izquierda
  const horizontal = lado === 0 || lado === 2;
  const largo = horizontal ? SEMI_X * 2 : SEMI_Y * 2;
  const porFila = Math.ceil(n / 2);
  const paso = largo / (porFila + 1);

  let puestos = 0;
  for (let i = 0; i < n; i++) {
    const fila = (i / porFila) | 0;
    const k = i % porFila;
    const a = -largo / 2 + paso * (k + 1) + (rng() - 0.5) * paso * 0.3;
    const b = (horizontal ? SEMI_Y : SEMI_X) + fila * 22;
    if (horizontal) { punto.x = a; punto.y = lado === 0 ? -b : b; }
    else            { punto.x = lado === 3 ? -b : b; punto.y = a; }
    const tipo = tipos[(rng() * tipos.length) | 0];
    if (!enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD, mov)) break;
    puestos++;
  }
  return puestos;
}

// Grupo compacto desde una dirección: un tramo corto del perímetro, no un punto.
// Con un punto salen todos uno encima de otro y la separación los dispara como
// perdigones en cuanto entran.
function patronOleada(enemigos, cx, cy, n, tipos, rng, eV, eD, mov) {
  const centro = rng();
  const arco = 0.10;                   // décima parte del perímetro
  let puestos = 0;
  for (let i = 0; i < n; i++) {
    let t = centro + (rng() - 0.5) * arco;
    t -= Math.floor(t);
    perimetro(t, SEMI_X, SEMI_Y);
    ensanchar(rng() * DISPERSION * 1.5);
    const tipo = tipos[(rng() * tipos.length) | 0];
    if (!enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD, mov)) break;
    puestos++;
  }
  return puestos;
}

// Cerco: reparto REGULAR por todo el perímetro, no aleatorio. La diferencia se
// nota jugando — el azar deja huecos por los que escapar sin pelear, y el cerco
// existe justo para que no los haya.
function patronCerco(enemigos, cx, cy, n, tipos, rng, eV, eD, mov) {
  const semiX = ANCHO_LOGICO / 2 + MARGEN_CERCO;
  const semiY = ALTO_LOGICO / 2 + MARGEN_CERCO;
  const desfase = rng();               // el cerco no empieza siempre en la misma esquina
  let puestos = 0;
  for (let i = 0; i < n; i++) {
    let t = desfase + i / n;
    t -= Math.floor(t);
    perimetro(t, semiX, semiY);
    const tipo = tipos[(rng() * tipos.length) | 0];
    if (!enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD, mov)) break;
    puestos++;
  }
  return puestos;
}

// Última entidad que ha conseguido aparecer con este patrón. Lo consulta
// SOLO el spawn de jefes, justo después de llamar a PATRONES.individual con
// n=1: es lo que le permite registrarla en sistemas/jefes.js sin que este
// archivo tenga que saber nada de fases ni de ataques.
let ultimoIndividual = null;

function patronIndividual(enemigos, cx, cy, n, tipos, rng, eV, eD, mov) {
  let puestos = 0;
  for (let i = 0; i < n; i++) {
    perimetro(rng(), SEMI_X, SEMI_Y);
    const tipo = tipos[(rng() * tipos.length) | 0];
    const e = enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD, mov);
    if (!e) break;
    ultimoIndividual = e;
    puestos++;
  }
  return puestos;
}

// UN JEFE, y por dónde entra. En Mérida es `patronIndividual` tal cual: un
// punto del perímetro de la cámara. En un nivel de recinto ese punto puede
// caer en la tienda de al lado, al otro lado de una pared, y el jefe aparece
// de la nada donde nadie lo ve llegar. Aquí se le pide a la rejilla un punto
// FUERA de la pantalla pero en la misma sala o pasillo que un jugador —uno al
// azar de los vivos, si hay varios— y desde ahí entra andando, como cualquier
// enemigo que sigue el campo de flujo (ver `puntoDeEntradaJefe` en
// sistemas/rejillaMapa.js). Si la rejilla no encuentra sitio, perímetro.
const ENTRADA_JEFE = { x: 0, y: 0 };
function patronJefe(enemigos, cx, cy, tipo, rng, eV, eD, jugadores) {
  if (RejillaMapa.activa && jugadores && jugadores.length > 0) {
    // Los vivos, y entre ellos uno al azar. Sin vivos, el primero: la partida
    // ya está acabando y da igual por dónde entre.
    let vivos = 0;
    for (let i = 0; i < jugadores.length; i++) if (jugadores[i].vida > 0) vivos++;
    let cual = vivos > 0 ? (rng() * vivos) | 0 : 0;
    let j = jugadores[0];
    if (vivos > 0) {
      for (let i = 0; i < jugadores.length; i++) {
        if (jugadores[i].vida <= 0) continue;
        if (cual-- === 0) { j = jugadores[i]; break; }
      }
    }
    if (RejillaMapa.puntoDeEntradaJefe(j.x, j.y, cx, cy, SEMI_X, SEMI_Y, rng, ENTRADA_JEFE)) {
      const e = enemigos.aparecer(tipo, ENTRADA_JEFE.x, ENTRADA_JEFE.y, eV, eD, null);
      if (!e) return 0;
      ultimoIndividual = e;
      return 1;
    }
  }
  return patronIndividual(enemigos, cx, cy, 1, [tipo], rng, eV, eD, null);
}

const PATRONES = {
  anillo: patronAnillo,
  linea: patronLinea,
  oleada: patronOleada,
  cerco: patronCerco,
  individual: patronIndividual
};

// Interpolación lineal sobre las marcas de densidad del nivel.
function topeEn(marcas, t) {
  if (!marcas || marcas.length === 0) return Infinity;
  if (t <= marcas[0].t) return marcas[0].max;
  for (let i = 1; i < marcas.length; i++) {
    if (t <= marcas[i].t) {
      const a = marcas[i - 1], b = marcas[i];
      return a.max + (b.max - a.max) * (t - a.t) / (b.t - a.t);
    }
  }
  return marcas[marcas.length - 1].max;
}

export const Director = {
  // Encendido de serie: esto es la partida, no un extra. El interruptor existe
  // solo para poder probar un arma sin oleada encima (tecla 5).
  activo: true,
  t: 0,                    // segundos de partida
  terminado: false,
  nivel: null,
  rng: null,
  relojes: null,           // acumulador por evento, preasignado en iniciar()
  pendientes: null,        // élites que faltan por salir, por evento
  servidos: null,          // ventanas de élite ya apuntadas (0/1)
  hitosInvocados: null,    // hitos de jefe ya invocados (0/1), preasignado en iniciar()
  tope: 0,
  // Rumbo suavizado de la cámara, para sesgar la aparición hacia donde se avanza.
  // Suavizado y no instantáneo: el desplazamiento de un solo paso es ruido —la
  // cámara tiene correa y corrige— y con él el cono de entrada bailaría.
  rumboX: 0,
  rumboY: 0,
  _camX: 0,
  _camY: 0,
  // ¿Hay ya una posición de cámara anterior con la que comparar? Ver
  // `reiniciar`: el primer paso de una partida no tiene desplazamiento que
  // medir, y darle uno inventado es lo que hacía que dos partidas con la misma
  // semilla no salieran iguales.
  _rumboListo: false,
  // Objetos del suelo (entidades/cofre.js). Lo enchufa main.js: el director
  // decide CUÁNDO cae un consumible, pero no sabe cómo se dibuja ni cómo se
  // recoge.
  objetos: null,
  // Los jugadores, para saber en qué sala está cada uno cuando entra un jefe
  // (ver `patronJefe`). Lo enchufa main.js, como `objetos`.
  jugadores: null,
  relojConsumible: 0,
  jefeInvocado: false,
  ultimoPatron: '',
  aviso: '',               // texto del aviso en curso
  avisoRestante: 0,

  iniciar(nivel, rng) {
    this.nivel = nivel;
    this.rng = rng;
    const n = (nivel.eventos && nivel.eventos.length) || 0;
    this.relojes = new Float32Array(n);
    this.pendientes = new Int32Array(n);
    this.servidos = new Uint8Array(n);
    const nHitos = (nivel.hitos && nivel.hitos.length) || 0;
    this.hitosInvocados = new Uint8Array(nHitos);
    this.reiniciar();
  },

  reiniciar() {
    this.t = 0;
    this.rumboX = 0;
    this.rumboY = 0;
    // EL RUMBO DE LA CÁMARA, A CERO. Se quedaba sin reiniciar, y eso rompía la
    // promesa de "misma semilla, misma partida": `_camX`/`_camY` se LEEN antes
    // de escribirse —el desplazamiento del primer paso se mide contra ellos— así
    // que una segunda partida arrancaba comparando con dónde había acabado la
    // anterior. El cono por el que entran los enemigos apuntaba a otro sitio y
    // la primera oleada salía distinta.
    //
    // Lo cazó la prueba de determinismo (core/determinismo.js): misma semilla y
    // mismas pulsaciones daban 12 enemigos en una pasada y 2 en la otra al
    // primer segundo. En una partida suelta es invisible —nadie nota que la
    // oleada entra veinte grados más a la izquierda— pero para el cooperativo
    // online, donde dos máquinas tienen que simular lo mismo, es fatal.
    this._camX = 0;
    this._camY = 0;
    this._rumboListo = false;
    // Derivado de `t`, se recalcula solo en el primer paso. Se pone a cero
    // igualmente para que el estado del director sea comparable desde el
    // fotograma cero.
    this.tope = 0;
    this.relojConsumible = CONSUMIBLE_CADA * 0.6;
    this.jefeInvocado = false;
    this.terminado = false;
    this.aviso = '';
    this.avisoRestante = 0;
    this.ultimoPatron = '';
    if (this.relojes) this.relojes.fill(0);
    if (this.pendientes) this.pendientes.fill(0);
    if (this.servidos) this.servidos.fill(0);
    if (this.hitosInvocados) this.hitosInvocados.fill(0);
  },

  // Apagar y encender el director. Al encender arranca SIEMPRE desde el minuto
  // 0: un director que continúa por donde iba no sirve para comparar dos
  // ajustes, y poder repetir la misma situación con la misma semilla es el
  // criterio 10 del plan.
  alternar() {
    this.activo = !this.activo;
    if (this.activo) this.reiniciar();
    return this.activo;
  },

  // Salta hacia delante en la línea temporal. Probar el minuto 16 esperando
  // dieciséis minutos no es probar, es esperar.
  saltar(segundos) {
    this.t = Math.max(0, this.t + segundos);
    this.terminado = this.t >= this.nivel.duracion;
    if (this.relojes) this.relojes.fill(0);
    if (this.pendientes) this.pendientes.fill(0);
    // Las marcas de élite se rearman: saltando hacia atrás hay que poder volver
    // a ver la mantícora del minuto 5, que es justo lo que se va a probar.
    if (this.servidos) this.servidos.fill(0);
    this.jefeInvocado = this.t >= this.nivel.duracion - MARGEN_JEFE_FINAL;

    // Hitos de jefe: igual que jefeInvocado, se recalculan según dónde ha caído
    // el salto. Saltando hacia delante de un hito se da por invocado —no vale
    // la pena reconstruir un Cerbero a medio jugar—; saltando hacia atrás se
    // rearma, que es justo lo que se quiere para poder volver a probarlo.
    const hitos = this.nivel.hitos;
    if (this.hitosInvocados && hitos) {
      for (let i = 0; i < hitos.length; i++) {
        if (hitos[i].jefe) this.hitosInvocados[i] = this.t >= hitos[i].t ? 1 : 0;
      }
    }
  },

  anunciar(texto) {
    this.aviso = texto;
    this.avisoRestante = DURACION_AVISO;
  },

  actualizar(dt, enemigos, camara) {
    if (!this.activo || !this.nivel) return;

    this.t += dt;
    if (this.avisoRestante > 0) this.avisoRestante -= dt;

    // Rumbo: media móvil del desplazamiento de la cámara, normalizada. Se apaga
    // sola cuando el grupo se para, y entonces la aparición vuelve a ser
    // uniforme alrededor.
    // El PRIMER paso no tiene desplazamiento que medir: solo apunta dónde está
    // la cámara y deja el rumbo a cero. Antes se restaba contra un `_camX` que
    // valía lo que hubiera quedado de la partida anterior, y salía un tirón
    // inventado justo en el fotograma que decide por dónde entra la primera
    // oleada.
    const vx = this._rumboListo ? camara.x - this._camX : 0;
    const vy = this._rumboListo ? camara.y - this._camY : 0;
    this._camX = camara.x;
    this._camY = camara.y;
    this._rumboListo = true;
    const k = Math.min(1, dt * 2.5);
    this.rumboX += (vx / dt * 0.012 - this.rumboX) * k;
    this.rumboY += (vy / dt * 0.012 - this.rumboY) * k;
    const mag = hipot(this.rumboX, this.rumboY);
    // Por debajo de este umbral se considera que no hay avance: perseguir el
    // ruido de la correa de cámara daría un cono de entrada que da bandazos.
    const rX = mag > 0.25 ? this.rumboX / mag : 0;
    const rY = mag > 0.25 ? this.rumboY / mag : 0;

    // --- JEFE FINAL --------------------------------------------------------
    // Entra en su minuto, y al entrar SE LIMPIA LA PANTALLA: la horda común se
    // borra de golpe y los élites que queden salen huyendo. Durante un tiempo
    // fue solo lo segundo —media vuelta y se van solos, mejor puesta en escena—
    // pero dejaba la pelea del jefe empezando entre una multitud de espaldas.
    // Ahora el sitio se queda para el jefe, que es de lo que va el minuto.
    //
    // Sus fases de patrón siguen siendo la Fase 6. Esto es la puesta en escena y
    // un jefe con su vida, que ya es infinitamente mejor que lo que había: el
    // minuto 19 se quedaba en silencio y la partida terminaba sin pasar nada.
    const jefes = this.nivel.jefes;
    if (!this.jefeInvocado && jefes && jefes.final &&
        this.t >= this.nivel.duracion - MARGEN_JEFE_FINAL) {
      this.jefeInvocado = true;
      const puesto = patronJefe(
        enemigos, camara.x, camara.y, jefes.final, this.rng,
        escalaVidaDe(this.nivel, this.t), escalaDanyoDe(this.nivel, this.t), this.jugadores);
      if (puesto > 0) {
        const entidadJefe = ultimoIndividual;
        enemigos.huidaGeneral();
        if (jefes.escolta) {
          PATRONES.individual(enemigos, camara.x, camara.y, 2, [jefes.escolta],
                              this.rng, escalaVidaDe(this.nivel, this.t),
                              escalaDanyoDe(this.nivel, this.t));
        }
        // Se registra DESPUÉS de soltar la escolta: sistemas/jefes.js toma el
        // número de gemelos vivos en ese instante como referencia para saber,
        // más tarde, cuándo ha caído el primero.
        Jefes.registrar(entidadJefe, jefes.avisoFinal || 'EL JEFE FINAL');
        this.anunciar(jefes.avisoFinal || 'EL JEFE FINAL');
      } else {
        this.jefeInvocado = false;      // sin sprite todavía: se reintenta
      }
    }

    // --- JEFE INTERMEDIO (y cualquier otro hito de jefe) --------------------
    // Mismo trato que el final —huidaGeneral, reintento hasta que hay hueco—
    // pero sin acabar la partida: entra, la horda huye un instante, y la
    // curva sigue por debajo de él como con cualquier otro enemigo.
    const hitosJefe = this.nivel.hitos;
    if (hitosJefe && this.hitosInvocados) {
      for (let i = 0; i < hitosJefe.length; i++) {
        const h = hitosJefe[i];
        if (!h.jefe || this.hitosInvocados[i] === 1 || this.t < h.t) continue;
        this.hitosInvocados[i] = 1;
        const tipoJefe = this.nivel.jefes && this.nivel.jefes[h.jefe];
        if (!tipoJefe) continue;
        const puestoH = patronJefe(
          enemigos, camara.x, camara.y, tipoJefe, this.rng,
          escalaVidaDe(this.nivel, this.t), escalaDanyoDe(this.nivel, this.t), this.jugadores);
        if (puestoH > 0) {
          enemigos.huidaGeneral();
          Jefes.registrar(ultimoIndividual, h.texto);
          this.anunciar(h.texto);
        } else {
          this.hitosInvocados[i] = 0;   // sin sprite todavía: se reintenta
        }
      }
    }

    // Fin de la curva. Ya NO deja de aparecer nada: mientras el jefe siga en
    // pie, el último tramo de eventos sigue vivo (ver `hasta` en los datos). Lo
    // único que hace esta marca es dejar de contar.
    if (!this.terminado && this.t >= this.nivel.duracion) {
      this.terminado = true;
    }

    // --- Consumibles por el mapa ------------------------------------------
    // No salen de matar a nadie: aparecen solos, cada tanto, en algún punto
    // alrededor. Es la única cosa del juego que premia EXPLORAR en vez de
    // pelear, y por eso caen lejos: hay que decidir si merece la pena el viaje.
    if (this.objetos) {
      this.relojConsumible -= dt;
      if (this.relojConsumible <= 0) {
        this.relojConsumible = CONSUMIBLE_CADA * (0.75 + this.rng() * 0.5);
        const ang = this.rng() * Math.PI * 2;
        const d = CONSUMIBLE_DIST_MIN +
                  this.rng() * (CONSUMIBLE_DIST_MAX - CONSUMIBLE_DIST_MIN);
        // El REPARTO vive en entidades/cofre.js, que es de donde salen los
        // objetos. Aquí había una copia con sus propios porcentajes y el otro
        // sitio que reparte —la antorcha que se rompe— tenía otra: al añadir el
        // reloj y las monedas habría hecho falta acertar a tocar las dos.
        const tipo = tipoConsumible(this.rng());
        // Con el nivel de ancho limitado, un punto en anillo alrededor de la
        // cámara puede caer en el hueco vacío de fuera del mapa: se recorta a
        // los límites del suelo igual que se hace con jugadores y enemigos.
        let px = camara.x + cos(ang) * d;
        if (Recursos.mapaPintado) {
          const limIzq = MARGEN_NIVEL;
          const limDer = Recursos.anchoSuelo - MARGEN_NIVEL;
          if (px < limIzq) px = limIzq; else if (px > limDer) px = limDer;
        }
        this.objetos.soltar(px, camara.y + sen(ang) * d, tipo);
      }
    }

    const esc = this.nivel.escalado || { vida: 0, danyo: 0 };
    const minutos = this.t / 60;
    const escalaVida = 1 + esc.vida * minutos;
    const escalaDanyo = 1 + esc.danyo * minutos;

    this.tope = topeEn(this.nivel.densidad, this.t);

    const eventos = this.nivel.eventos;
    for (let i = 0; i < eventos.length; i++) {
      const ev = eventos[i];
      const individual = ev.patron === 'individual';

      // --- Élites: deuda, no ventana ------------------------------------
      // Un evento individual no "se dispara y ya". Apunta lo que debe y no lo
      // olvida hasta haberlo soltado, aunque su ventana de dos segundos haya
      // pasado. Si el pool estaba lleno justo en el minuto 5, la mantícora no
      // puede simplemente no existir: es la vía principal de las evoluciones y
      // la única razón para dejar de huir y plantarse a pelear.
      if (individual) {
        // Se apunta la deuda al ENTRAR en la ventana, una sola vez. Ligarlo a un
        // reloj como los eventos de masa dejaba fuera el caso del salto temporal
        // de depuración: cayendo dentro de una ventana de dos segundos, el reloj
        // no llegaba a completarse antes de que la ventana pasara y el élite no
        // salía nunca. Con una marca, el élite entra caiga como caiga el reloj.
        if (this.servidos[i] === 0 && this.t >= ev.desde && this.t < ev.hasta) {
          this.servidos[i] = 1;
          this.pendientes[i] += ev.cantidad;
        }
        if (this.pendientes[i] > 0) {
          // UNO CADA VEZ. Si ya hay un élite vivo, el siguiente espera su turno
          // sin perder la deuda. Dos a la vez no es el doble de emocionante: son
          // dos sacos de vida compitiendo por la misma atención, y como cada uno
          // suelta cofre, el segundo cofre cae mientras aún estás abriendo el
          // primero. Separarlos es lo que los convierte en un acontecimiento.
          if (enemigos.elitesVivos > 0) continue;

          // El techo de densidad NUNCA frena a un élite. Al revés que la masa:
          // si la mantícora no aparece porque hay cola de serpientes, el jugador
          // pierde la recompensa por un motivo que no puede ni ver.
          const puestos = PATRONES.individual(
            enemigos, camara.x, camara.y, this.pendientes[i], ev.tipos, this.rng,
            escalaVida, escalaDanyo);
          if (puestos > 0) {
            this.pendientes[i] -= puestos;
            this.ultimoPatron = 'individual';
            if (ev.aviso) this.anunciar(ev.aviso);
          }
        }
        continue;
      }

      if (this.t < ev.desde || this.t >= ev.hasta) continue;

      // --- Rampa dentro de la ventana ----------------------------------
      // Cada fuente arranca floja y va apretando hasta su cadencia nominal al
      // final de su ventana. Sin esto, cambiar de tramo es un escalón: el minuto
      // 4 empieza de golpe soltando un tercio más que el 3.9, y se nota como un
      // salto en vez de como una curva. Con la rampa, cada tramo entra por
      // debajo del anterior y lo adelanta por el camino, que es exactamente la
      // sensación de "flujo continuo que se incrementa poco a poco".
      //
      // Solo para el fondo: un cerco o una línea son sucesos y no tienen que
      // entrar a medio gas.
      let cada = ev.cada;
      if (ev.patron === 'anillo') {
        const progreso = (this.t - ev.desde) / (ev.hasta - ev.desde);
        cada *= RAMPA_INICIO - (RAMPA_INICIO - 1) * (progreso > 1 ? 1 : progreso);
      }

      this.relojes[i] += dt;
      if (this.relojes[i] < cada) continue;
      this.relojes[i] -= cada;

      // CON UN JEFE EN PIE NO SALE NADIE MÁS. Lo pidió Sergio y cierra lo que
      // la desbandada dejaba a medias: de poco sirve vaciar la pantalla al
      // entrar el jefe si la curva de fondo la vuelve a llenar a los diez
      // segundos.
      //
      // Antes de esto el director SÍ seguía repartiendo, solo que poniéndoles
      // 'huida' para que salieran corriendo. Era peor de las dos maneras: la
      // pelea del jefe se llenaba igual de bichos —estorbando, tapando y
      // comiéndose los disparos— y encima de bichos que no hacían nada, así que
      // el sitio se ocupaba a cambio de nada.
      //
      // Va DESPUÉS de consumir el reloj a propósito. Saltando antes, los relojes
      // de todos los eventos se acumularían durante los dos minutos que puede
      // durar un jefe y al morir soltarían de golpe todo lo atrasado: la
      // recompensa por matarlo sería una avalancha.
      if (Jefes.hayJefeActivo) continue;

      const techo = ev.patron === 'anillo' ? this.tope * CUOTA_FONDO : this.tope;
      if (enemigos.activos + ev.cantidad > techo) continue;

      const fn = PATRONES[ev.patron];
      if (!fn) continue;
      fn(enemigos, camara.x, camara.y, ev.cantidad, ev.tipos, this.rng,
         escalaVida, escalaDanyo, ev.movimiento, rX, rY);
      this.ultimoPatron = ev.patron;
    }
  },

  // Reloj en mm:ss. Se construye una cadena por frame; es texto de la interfaz,
  // no del bucle de entidades.
  get reloj() {
    const s = Math.floor(this.t);
    return `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
};

// Aparición suelta, para los atajos de prueba 1-4 de main.js. Comparte la
// geometría del anillo con el director: si la aparición de prueba y la de la
// partida usaran códigos distintos, probar una no diría nada de la otra.
export function aparecerTanda(enemigos, camara, cantidad, mezcla, rng) {
  patronAnillo(enemigos, camara.x, camara.y, cantidad, mezcla, rng, 1, 1);
}

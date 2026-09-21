import { JEFES } from '../datos/jefes.js';
import { masCercano } from '../entidades/enemigo.js';
import { Particulas, COLOR_CHISPA, COLOR_POLVO, COLOR_SANGRE, COLOR_VENENO } from './particulas.js';
import { VFX } from './vfx.js';
import { GestorAudio } from './audio.js';
import { sen, cos, atan2, hipot } from '../core/mate.js';

// FASE 6: comportamiento de los jefes. Motor genérico, parametrizado por
// datos/jefes.js — mismo reparto que el resto del juego: aquí solo hay
// lógica, y un nivel nuevo con sus propios jefes se resuelve escribiendo otra
// entrada en ese archivo de datos.
//
// Los tres jefes son ÚNICOS por partida (el director nunca invoca dos a la
// vez, ver sistemas/director.js), así que este sistema no necesita un pool:
// le bastan TRES estados fijos, creados una vez al cargar el módulo y
// reescritos en cada partida. Cero `new` mientras se juega, igual que todo lo
// demás.
//
// `sistemas/director.js` llama a `registrar()` justo después de invocar a
// cada jefe; a partir de ahí este módulo corre solo desde `actualizar()`,
// llamado cada paso de lógica desde main.js.

const estadoCerbero = {
  activo: false, nombre: '', entidad: null, fase: 0,
  relojFuego: 0, cicloFuego: 0,
  relojEmbestida: 0, avisoEmbestida: 0, pausaCadena: 0, cadenaRestante: 0, enCarga: false,
  relojInvocacion: 0,
  velBase: 0, danyoBase: 0
};

const estadoHidra = {
  activo: false, nombre: '', entidad: null,
  relojVeneno: 0, cicloVeneno: 0,
  furiaActiva: false,
  velBase: 0, danyoBase: 0
};

const estadoLoba = {
  activo: false, nombre: '', entidad: null,
  iniciado: false, escoltasPrev: 0, furiaRestante: 0,
  relojAullido: 0,
  velBase: 0, danyoBase: 0
};

// Objeto de salida para la barra de jefe, reutilizado: se lee una vez por
// frame desde main.js y no necesita sobrevivir más que eso.
const _info = { nombre: '', frac: 0, marcas: null, furia: false, regenerando: false };

const MARCAS_CERBERO = JEFES.cerbero.fases.slice();   // [0.66, 0.33], para la barra
const MARCAS_HIDRA = [JEFES.hidra.furia.umbral];      // [0.5]: donde se enfurece

// Def del charco, reutilizada en cada disparo. Igual que `punto` en
// sistemas/director.js: esto se llama varias veces por asalto de fuego y
// crear un literal por llamada sería asignar en caliente durante la partida.
// Descriptor COMPARTIDO, como el resto de este archivo: se rellena entero en
// cada uso. `spriteReventon` es la animación que se suelta cuando el charco
// PRENDE, o sea al acabar su aviso — el charco en sí persiste y no revienta,
// pero el momento en que cae sí es un golpe y hasta ahora no se veía.
const defCharco = { danyo: 0, radio: 0, aviso: 0, duracion: 0, intervalo: 0, color: '', sprite: null, spriteReventon: null };

// --- Cerbero ------------------------------------------------------------

// ¿En qué fase está según su vida? La 0 (100-66%) no tiene comportamiento
// propio: persecución simple y mordisco corto es justo lo que ya hace el
// motor genérico de enemigo.js sin que nadie le añada nada.
function faseDe(frac) {
  const f = JEFES.cerbero.fases;
  if (frac <= f[1]) return 2;
  if (frac <= f[0]) return 1;
  return 0;
}

function actualizarFuego(dt, e, objetivo, disparos, rng) {
  const est = estadoCerbero;
  const cfg = JEFES.cerbero.fuego;
  est.relojFuego -= dt;
  if (est.relojFuego > 0) return;
  est.relojFuego = cfg.cadencia;

  // Alterna el ángulo entre las tres cabezas en vez de escupir las tres a la
  // vez: es lo que hace que se lea como "una cabeza distinta cada vez" sin
  // tener que animar tres cabezas de verdad.
  const dx = objetivo.x - e.x, dy = objetivo.y - e.y;
  const base = atan2(dy, dx) + cfg.angulos[est.cicloFuego % cfg.angulos.length];
  est.cicloFuego++;

  defCharco.danyo = cfg.danyoCharco;
  defCharco.radio = cfg.radioCharco;
  defCharco.aviso = cfg.aviso;
  defCharco.duracion = cfg.duracionCharco;
  defCharco.intervalo = cfg.intervaloCharco;
  defCharco.color = cfg.color;
  defCharco.spriteReventon = 'reventonLlama';
  defCharco.sprite = cfg.sprite || null;

  const cx = cos(base), cy = sen(base);
  // EL CONO LLEGA AL JUGADOR. Empezaba siempre a 26 del jefe, y con tres
  // pasos de 20 se quedaba a 66: en Mérida daba igual, el jefe siempre estaba
  // encima, pero en el centro comercial se pasa media pelea con un pasillo o
  // un mostrador de por medio y el fuego caía a mitad de camino, sin que el
  // jugador lo viera siquiera. Ahora el cono se corre hacia delante lo que
  // haga falta para que su ÚLTIMO charco caiga donde está el jugador. Va a
  // través de paredes, como todo lo que escupe un jefe (lo pidió Sergio).
  const dist = hipot(dx, dy);
  const largo = (cfg.pasos - 1) * cfg.paso;
  const desde = Math.max(26, dist - largo);
  for (let p = 0; p < cfg.pasos; p++) {
    const d = desde + p * cfg.paso;
    disparos.charco(e.x + cx * d, e.y + cy * d, defCharco);
  }
  // DIRIGIDO al cono y no un estallido a los cuatro vientos: esto es un
  // escupitajo, no una chispa que salta sola. `chorro` es lo mismo que usa
  // el fogonazo de las armas de fuego del jugador (sistemas/armas.js), y aquí
  // hace el mismo trabajo -decir "el golpe viene de AQUÍ, hacia ALLÁ"- con más
  // alcance porque la boca de un jefe no es la de una pistola.
  if (!Particulas.saturado()) {
    Particulas.chorro(e.x, e.y - 10, cx, cy, 9, 100, 0.3, 0.32, 1.8, COLOR_CHISPA, 0.3, rng);
  }
  VFX.sacudir(2.1);
}

// Lanza UNA embestida de la cadena en curso: fija dirección y velocidad y
// deja que enemigo.js consuma `embestida` en línea recta (ver el bloque
// nuevo al principio de Enemigos.mover). Apunta a dónde está el jugador AL
// LANZAR, no a donde estaba al empezar el aviso: es la misma regla que el
// sismo del cíclope, y es lo que hace que moverse durante la telegrafía sea
// la defensa real.
function lanzarEmbestida(e, objetivo, cfg) {
  const est = estadoCerbero;
  const dx = objetivo.x - e.x, dy = objetivo.y - e.y;
  const d = hipot(dx, dy) || 1;
  e.dirX = dx / d;
  e.dirY = dy / d;
  e.velocidad = est.velBase * cfg.velocidad;
  e.danyo = est.danyoBase * cfg.multDanyo;
  e.embestida = cfg.duracion;
  est.enCarga = true;
  est.cadenaRestante--;
  est.pausaCadena = est.cadenaRestante > 0 ? cfg.pausaCadena : 0;
  VFX.sacudir(2.4);
}

function actualizarEmbestida(dt, e, objetivo, cfg, rng) {
  const est = estadoCerbero;

  // En plena carga: el motor genérico ya la está consumiendo, aquí no hay
  // nada que decidir hasta que termine.
  if (e.embestida > 0) return;

  // Acaba de terminar esta pasada: restaurar lo que subió `lanzarEmbestida`.
  if (est.enCarga) {
    est.enCarga = false;
    e.velocidad = est.velBase;
    e.danyo = est.danyoBase;
    if (!Particulas.saturado()) {
      Particulas.estallido(e.x, e.y, 6, 90, 0.3, 2, COLOR_POLVO, 0.5, rng);
    }
    VFX.sacudir(3.2);
    return;
  }

  // Pausa entre embestidas de la misma cadena.
  if (est.pausaCadena > 0) {
    est.pausaCadena -= dt;
    if (est.pausaCadena <= 0 && est.cadenaRestante > 0) lanzarEmbestida(e, objetivo, cfg);
    return;
  }

  // Telegrafía de la PRIMERA embestida de la cadena.
  if (est.avisoEmbestida > 0) {
    est.avisoEmbestida -= dt;
    if (est.avisoEmbestida <= 0) lanzarEmbestida(e, objetivo, cfg);
    return;
  }

  // Enfriamiento hasta la próxima cadena.
  est.relojEmbestida -= dt;
  if (est.relojEmbestida <= 0) {
    est.relojEmbestida = cfg.cadencia;
    est.cadenaRestante = cfg.cadenaMin + ((rng() * (cfg.cadenaMax - cfg.cadenaMin + 1)) | 0);
    est.avisoEmbestida = cfg.aviso;
    if (!Particulas.saturado()) {
      Particulas.estallido(e.x, e.y - 8, 4, 30, cfg.aviso, 1.2, COLOR_CHISPA, 0.15, rng);
    }
  }
}

function actualizarInvocacion(dt, e, enemigos, rng) {
  const est = estadoCerbero;
  const cfg = JEFES.cerbero.invocacion;
  est.relojInvocacion -= dt;
  if (est.relojInvocacion > 0) return;
  est.relojInvocacion = cfg.cadencia;

  for (let i = 0; i < cfg.cantidad; i++) {
    const ang = rng() * Math.PI * 2;
    const d = cfg.radio * (0.5 + rng() * 0.5);
    enemigos.aparecer(cfg.tipo, e.x + cos(ang) * d, e.y + sen(ang) * d,
                       cfg.escala, cfg.escala);
  }
  if (!Particulas.saturado()) {
    Particulas.estallido(e.x, e.y, 8, 60, 0.35, 1.5, COLOR_POLVO, 0.4, rng);
  }
}

function actualizarCerbero(dt, enemigos, jugadores, disparos, rng) {
  const est = estadoCerbero;
  const e = est.entidad;
  // El `tipo` desempata contra la reutilización del pool: si Cerbero murió
  // este mismo frame, su hueco puede haber sido reciclado ya para otro
  // enemigo antes de llegar aquí (Enemigos.retirarMuertos corre varias veces
  // por paso). Comprobar solo `vida<=0` leería la vida del intruso, no la suya.
  if (!e || e.tipo !== 'cerbero' || e.vida <= 0) {
    // Si sigue siendo él y se le ha acabado la vida, ha caído. Con el hueco ya
    // reciclado (`!e` o cambio de tipo) no se apunta nada: no se sabe si murió
    // o si el pool lo movió, y apuntar una muerte que no fue abriría las
    // puertas del nivel 2 de balde.
    if (e && e.tipo === 'cerbero' && e.vida <= 0) Jefes.caidos.cerbero = true;
    est.activo = false;
    return;
  }

  const objetivo = masCercano(jugadores, e.x, e.y);
  if (!objetivo) return;

  const fase = faseDe(e.vida / e.vidaMaxima);
  if (fase !== est.fase) {
    est.fase = fase;
    VFX.sacudir(2.6);
    if (!Particulas.saturado()) {
      Particulas.estallido(e.x, e.y - 12, 8, 80, 0.4, 2, COLOR_SANGRE, 0.4, rng);
    }
  }

  // EL FUEGO NO SE APAGA NUNCA. Era solo de la fase 1, y en la 2 Cerbero
  // pasaba a embestidas e invocaciones sin escupir: en un recinto lleno de
  // paredes una embestida es un carrerón contra un muro, y el jugador veía
  // a un jefe que "no ataca". Sergio pidió que estén siempre atacando con su
  // cadencia; la fase 2 SUMA embestida e invocación, no las cambia por el
  // fuego.
  actualizarFuego(dt, e, objetivo, disparos, rng);
  if (fase === 2) {
    actualizarEmbestida(dt, e, objetivo, JEFES.cerbero.embestida, rng);
    actualizarInvocacion(dt, e, enemigos, rng);
  }
}

// --- Hidra ------------------------------------------------------------------

// Veneno constante: dos cabezas alternando, mismo mecanismo que el fuego de
// Cerbero (charcos en cono) pero sin fase que lo active — la Hidra lo hace
// desde que aparece, no tiene tercios de vida.
function actualizarVeneno(dt, e, objetivo, disparos, rng) {
  const est = estadoHidra;
  const cfg = JEFES.hidra.veneno;
  est.relojVeneno -= dt;
  if (est.relojVeneno > 0) return;
  est.relojVeneno = cfg.cadencia;

  const dx = objetivo.x - e.x, dy = objetivo.y - e.y;
  const base = atan2(dy, dx) + cfg.angulos[est.cicloVeneno % cfg.angulos.length];
  est.cicloVeneno++;

  defCharco.danyo = cfg.danyoCharco;
  defCharco.radio = cfg.radioCharco;
  defCharco.aviso = cfg.aviso;
  defCharco.duracion = cfg.duracionCharco;
  defCharco.intervalo = cfg.intervaloCharco;
  defCharco.color = cfg.color;
  defCharco.spriteReventon = 'reventonVeneno';
  defCharco.sprite = cfg.sprite || null;

  const cx = cos(base), cy = sen(base);
  // Y llega hasta el jugador, como el fuego de Cerbero: ver allí el motivo.
  const dist = hipot(dx, dy);
  const largo = (cfg.pasos - 1) * cfg.paso;
  const desde = Math.max(24, dist - largo);
  for (let p = 0; p < cfg.pasos; p++) {
    const d = desde + p * cfg.paso;
    disparos.charco(e.x + cx * d, e.y + cy * d, defCharco);
  }
  // Mismo cambio que el fuego de Cerbero: chorro dirigido al cono, con
  // COLOR_VENENO -verde de veras, no el chispazo genérico- porque esto es
  // ponzoña saliendo de la boca, no una chispa de impacto.
  if (!Particulas.saturado()) {
    Particulas.chorro(e.x, e.y - 10, cx, cy, 8, 85, 0.3, 0.3, 1.7, COLOR_VENENO, 0.3, rng);
  }
  VFX.sacudir(1.8);
}

function actualizarHidra(dt, enemigos, jugadores, disparos, rng) {
  const est = estadoHidra;
  const e = est.entidad;
  if (!e || e.tipo !== 'hidra' || e.vida <= 0) {
    // Si sigue siendo él y se le ha acabado la vida, ha caído. Con el hueco ya
    // reciclado (`!e` o cambio de tipo) no se apunta nada: no se sabe si murió
    // o si el pool lo movió, y apuntar una muerte que no fue abriría las
    // puertas del nivel 2 de balde.
    if (e && e.tipo === 'hidra' && e.vida <= 0) Jefes.caidos.hidra = true;
    est.activo = false;
    return;
  }

  const objetivo = masCercano(jugadores, e.x, e.y);
  if (!objetivo) return;

  actualizarVeneno(dt, e, objetivo, disparos, rng);

  const cfg = JEFES.hidra.furia;

  // Furia de UNA SOLA VEZ, al cruzar el umbral de vida: al revés que la Loba
  // (que se enfurece cada vez que cae un gemelo), aquí no hay un evento que la
  // dispare más de una vez, así que basta un interruptor que no vuelve atrás.
  if (!est.furiaActiva && e.vida / e.vidaMaxima <= cfg.umbral) {
    est.furiaActiva = true;
    e.velocidad = est.velBase * cfg.multVelocidad;
    e.danyo = est.danyoBase * cfg.multDanyo;
    VFX.sacudir(3.0);
    if (!Particulas.saturado()) {
      Particulas.estallido(e.x, e.y - 12, 10, 90, 0.4, 2, COLOR_SANGRE, 0.4, rng);
    }
  }

  // "La herida no cierra": una vez enfurecida, regenera un goteo constante.
  // Sin gemelos ni ventanas que vigilar —es la versión de un solo interruptor
  // de la misma idea que la Loba cuenta con una cadena de eventos.
  if (est.furiaActiva && e.vida < e.vidaMaxima) {
    e.vida = Math.min(e.vidaMaxima, e.vida + e.vidaMaxima * cfg.regenFraccion * dt);
  }
}

// --- La Loba --------------------------------------------------------------

// AULLIDO: un golpe de área centrado en ELLA MISMA, no un cono dirigido -es
// un aullido, no un mordisco, así que no apunta a nadie y castiga por igual a
// quien se queda pegado a su cuerpo. Reutiliza `disparos.charco()`, el mismo
// mecanismo del fuego de Cerbero y el veneno de la Hidra, pero como UN solo
// círculo grande con `duracion`/`intervalo` iguales -un único tic- en vez de
// una mancha que se queda ardiendo: es fuerza pura, no deja nada en el suelo.
function actualizarAullido(dt, e, disparos, rng, objetivo) {
  const est = estadoLoba;
  const cfg = JEFES.loba.aullido;
  const cadencia = est.furiaRestante > 0 ? cfg.cadenciaFuria : cfg.cadencia;
  est.relojAullido -= dt;
  if (est.relojAullido > 0) return;
  est.relojAullido = cadencia;

  defCharco.danyo = cfg.danyo;
  defCharco.radio = cfg.radio;
  defCharco.aviso = cfg.aviso;
  defCharco.duracion = 0.15;
  defCharco.intervalo = 0.2;      // más largo que `duracion`: un solo tic
  defCharco.color = cfg.color;
  defCharco.spriteReventon = cfg.spriteReventon;
  defCharco.sprite = null;        // fuerza pura: no deja mancha en el suelo

  // CENTRADO EN ELLA si el jugador está dentro de su alcance; si está más
  // lejos —al otro lado de un mostrador, en el pasillo de al lado—, el aullido
  // cae DONDE ESTÁ EL JUGADOR. Un aullido es sonido: cruza las paredes y llega
  // a quien lo oye. Sin esto, en el centro comercial la Loba se pasaba la
  // pelea aullando a su alrededor sin alcanzar a nadie.
  let ax = e.x, ay = e.y;
  if (objetivo && hipot(objetivo.x - e.x, objetivo.y - e.y) > cfg.radio * 0.8) {
    ax = objetivo.x; ay = objetivo.y;
  }
  disparos.charco(ax, ay, defCharco);
  if (!Particulas.saturado()) {
    Particulas.estallido(e.x, e.y - 12, 10, 110, 0.35, 2, COLOR_CHISPA, 0.2, rng);
  }
  VFX.sacudir(3.4);
}

function actualizarLoba(dt, enemigos, jugadores, disparos, rng) {
  const est = estadoLoba;
  const e = est.entidad;
  if (!e || e.tipo !== 'loba' || e.vida <= 0) {
    // Si sigue siendo él y se le ha acabado la vida, ha caído. Con el hueco ya
    // reciclado (`!e` o cambio de tipo) no se apunta nada: no se sabe si murió
    // o si el pool lo movió, y apuntar una muerte que no fue abriría las
    // puertas del nivel 2 de balde.
    if (e && e.tipo === 'loba' && e.vida <= 0) Jefes.caidos.loba = true;
    est.activo = false;
    return;
  }

  const cfg = JEFES.loba;
  const vivos = enemigos.escoltasVivos;

  if (!est.iniciado) { est.escoltasPrev = vivos; est.iniciado = true; }

  // Regenera mientras viva algún gemelo: plantarse a pegarle al cuerpo sin
  // arrancárselos antes es perder el tiempo. Están mamando de ella.
  if (vivos > 0 && e.vida < e.vidaMaxima) {
    e.vida = Math.min(e.vidaMaxima, e.vida + e.vidaMaxima * cfg.regenFraccion * dt);
  }

  // Furia: se dispara al detectar que ha CAÍDO un gemelo, no por su cuenta.
  if (vivos < est.escoltasPrev) {
    est.furiaRestante = cfg.furia.duracion;
    e.velocidad = est.velBase * cfg.furia.multVelocidad;
    e.danyo = est.danyoBase * cfg.furia.multDanyo;
    VFX.sacudir(3.5);
    if (!Particulas.saturado()) {
      Particulas.estallido(e.x, e.y - 10, 10, 90, 0.4, 2, COLOR_SANGRE, 0.5, rng);
    }
  }
  est.escoltasPrev = vivos;

  if (est.furiaRestante > 0) {
    est.furiaRestante -= dt;
    if (est.furiaRestante <= 0) {
      e.velocidad = est.velBase;
      e.danyo = est.danyoBase;
    }
  }

  actualizarAullido(dt, e, disparos, rng, masCercano(jugadores, e.x, e.y));
}

// --- API pública ------------------------------------------------------------

export const Jefes = {
  _rng: null,

  // QUÉ JEFES HAN CAÍDO en esta partida, por especie. Lo mira main.js: en el CC
  // The Lighthouse, cada jefe abre un juego de puertas y el último acaba la fase.
  //
  // Va por ESPECIE y no por papel ('intermedio', 'final') porque quien registra a
  // un jefe es el director y ahí lo que hay es la entidad, no su papel. Un nivel
  // que repitiera especie en dos papeles no podría distinguirlos — hoy ninguno lo
  // hace, y si algún día hace falta, el sitio de arreglarlo es `registrar`.
  caidos: { cerbero: false, hidra: false, loba: false },

  // Se pone a false al morir un jefe y lo consume quien lo atienda: así main.js
  // no tiene que acordarse de lo que ya ha visto.
  haCaido(especie) {
    return !!(especie && this.caidos[especie]);
  },

  // Lo consulta el director al repartir una tanda nueva: con un jefe en
  // pantalla, hasta el enemigo recién aparecido tiene que salir corriendo, no
  // solo los que ya estaban cuando huidaGeneral() les dio la vuelta.
  get hayJefeActivo() {
    return estadoCerbero.activo || estadoHidra.activo || estadoLoba.activo;
  },

  iniciar(rng) {
    this._rng = rng;
    this.vaciar();
  },

  vaciar() {
    this.caidos.cerbero = false;
    this.caidos.hidra = false;
    this.caidos.loba = false;
    estadoCerbero.activo = false;
    estadoCerbero.entidad = null;
    estadoCerbero.nombre = '';
    estadoCerbero.fase = 0;
    estadoCerbero.relojFuego = 0;
    estadoCerbero.cicloFuego = 0;
    estadoCerbero.relojEmbestida = 0;
    estadoCerbero.avisoEmbestida = 0;
    estadoCerbero.pausaCadena = 0;
    estadoCerbero.cadenaRestante = 0;
    estadoCerbero.enCarga = false;
    estadoCerbero.relojInvocacion = 0;
    estadoCerbero.velBase = 0;
    estadoCerbero.danyoBase = 0;

    estadoHidra.activo = false;
    estadoHidra.entidad = null;
    estadoHidra.nombre = '';
    estadoHidra.relojVeneno = 0;
    estadoHidra.cicloVeneno = 0;
    estadoHidra.furiaActiva = false;
    estadoHidra.velBase = 0;
    estadoHidra.danyoBase = 0;

    estadoLoba.activo = false;
    estadoLoba.entidad = null;
    estadoLoba.nombre = '';
    estadoLoba.iniciado = false;
    estadoLoba.escoltasPrev = 0;
    estadoLoba.furiaRestante = 0;
    estadoLoba.relojAullido = 0;
    estadoLoba.velBase = 0;
    estadoLoba.danyoBase = 0;
  },

  // Lo llama el director justo después de que un jefe consiga aparecer.
  // Cuál es se decide por `entidad.tipo` —el mismo id con el que se invocó,
  // sale de datos/enemigos.js— así que un nivel nuevo con sus propios jefes
  // solo necesita entradas nuevas en datos/jefes.js y aquí no se toca nada.
  registrar(entidad, nombre) {
    if (entidad.tipo === 'cerbero') {
      const est = estadoCerbero;
      est.activo = true;
      est.entidad = entidad;
      est.nombre = nombre;
      est.fase = 0;
      // Primer ataque no inmediato: que el jugador vea entrar al jefe antes
      // de que empiece a escupir fuego o a invocar.
      est.relojFuego = JEFES.cerbero.fuego.cadencia * 0.6;
      est.cicloFuego = 0;
      est.relojEmbestida = JEFES.cerbero.embestida.cadencia * 0.6;
      est.avisoEmbestida = 0;
      est.pausaCadena = 0;
      est.cadenaRestante = 0;
      est.enCarga = false;
      est.relojInvocacion = JEFES.cerbero.invocacion.cadencia * 0.7;
      est.velBase = entidad.velocidad;
      est.danyoBase = entidad.danyo;
    } else if (entidad.tipo === 'hidra') {
      const est = estadoHidra;
      est.activo = true;
      est.entidad = entidad;
      est.nombre = nombre;
      est.relojVeneno = JEFES.hidra.veneno.cadencia * 0.6;
      est.cicloVeneno = 0;
      est.furiaActiva = false;
      est.velBase = entidad.velocidad;
      est.danyoBase = entidad.danyo;
    } else if (entidad.tipo === 'loba') {
      const est = estadoLoba;
      est.activo = true;
      est.entidad = entidad;
      est.nombre = nombre;
      est.iniciado = false;
      est.furiaRestante = 0;
      // No inmediato, igual que el resto de jefes: que se la vea entrar antes
      // de que empiece a aullar.
      est.relojAullido = JEFES.loba.aullido.cadencia * 0.6;
      est.velBase = entidad.velocidad;
      est.danyoBase = entidad.danyo;
    }
    GestorAudio.avisoJefe();
  },

  actualizar(dt, enemigos, jugadores, disparos) {
    if (estadoCerbero.activo) actualizarCerbero(dt, enemigos, jugadores, disparos, this._rng);
    if (estadoHidra.activo) actualizarHidra(dt, enemigos, jugadores, disparos, this._rng);
    if (estadoLoba.activo) actualizarLoba(dt, enemigos, jugadores, disparos, this._rng);
  },

  // Info para la barra de jefe (ui/hud.js). Devuelve el mismo objeto siempre
  // —se lee y se tira en el momento, no necesita sobrevivir al frame— o null
  // si no hay ningún jefe en pantalla. La Loba manda si coinciden los dos:
  // es la pelea final, la que de verdad importa leer.
  info(enemigos) {
    const l = estadoLoba;
    if (l.activo && l.entidad && l.entidad.tipo === 'loba' && l.entidad.vida > 0) {
      _info.nombre = l.nombre;
      _info.frac = Math.max(0, l.entidad.vida / l.entidad.vidaMaxima);
      _info.marcas = null;
      _info.furia = l.furiaRestante > 0;
      _info.regenerando = enemigos.escoltasVivos > 0;
      return _info;
    }
    const h = estadoHidra;
    if (h.activo && h.entidad && h.entidad.tipo === 'hidra' && h.entidad.vida > 0) {
      _info.nombre = h.nombre;
      _info.frac = Math.max(0, h.entidad.vida / h.entidad.vidaMaxima);
      _info.marcas = MARCAS_HIDRA;
      _info.furia = h.furiaActiva;
      _info.regenerando = false;
      return _info;
    }
    const c = estadoCerbero;
    if (c.activo && c.entidad && c.entidad.tipo === 'cerbero' && c.entidad.vida > 0) {
      _info.nombre = c.nombre;
      _info.frac = Math.max(0, c.entidad.vida / c.entidad.vidaMaxima);
      _info.marcas = MARCAS_CERBERO;
      _info.furia = false;
      _info.regenerando = false;
      return _info;
    }
    return null;
  }
};

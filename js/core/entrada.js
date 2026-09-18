import { hipot } from './mate.js';
import { Controles } from './controles.js';
// Teclado, gamepad y joystick virtual táctil, repartidos POR JUGADOR.
//
// Reparto: el teclado siempre maneja al jugador 1; el mando k maneja al jugador
// k. Jugando solo con mando, el mando 0 y el teclado mandan sobre el mismo
// personaje y no estorban entre sí, porque gana el que más desplace el stick.
// Es la regla más simple que funciona sin pantalla de asignación, y esa
// pantalla llega con los menús de la Fase 7.
//
// Las teclas globales (F3, pausa, depuración) NO son de nadie: se leen del
// teclado directamente, no del control de un jugador.

const ZONA_MUERTA = 0.18;     // radial, nunca por eje
const RADIO_STICK = 42;       // px de pantalla que equivalen a stick al máximo

// LAS TECLAS DE MOVIMIENTO YA NO SON CONSTANTES: la primera de cada par la
// elige el jugador (core/controles.js) y la segunda —la flecha— no se puede
// cambiar, que es la red de seguridad. Se piden en cada fotograma porque
// cambiarlas es tan raro como barato preguntarlo.
function izquierda() { return [Controles.tecla('KeyA'), 'ArrowLeft']; }
function derecha()   { return [Controles.tecla('KeyD'), 'ArrowRight']; }
function arriba()    { return [Controles.tecla('KeyW'), 'ArrowUp']; }
function abajo()     { return [Controles.tecla('KeyS'), 'ArrowDown']; }

// Cruceta en el mapeo estándar del navegador. NO son ejes, son botones.
const CRUZ_ARRIBA = 12, CRUZ_ABAJO = 13, CRUZ_IZQ = 14, CRUZ_DER = 15;

// Umbrales del stick cuando se usa como cruceta en los menús. Dos, no uno:
// hace falta histéresis o el temblor del stick en el límite dispara flancos sin
// parar. Ver Control.flancoEje.
const UMBRAL_MENU = 0.65;
const UMBRAL_SUELTA = 0.4;

// El vector de movimiento de un jugador y el flanco de sus botones. Uno por
// jugador, preasignados: no se crean ni se destruyen durante la partida.
export class Control {
  constructor(indice) {
    this.indice = indice;
    this.ejeX = 0;
    this.ejeY = 0;
    this.fuente = 'teclado';
    this.conectado = false;       // ¿tiene mando propio enchufado?
    this._botonesPrev = 0;
    this._flancoBotones = 0;
    this._ejeXFlanco = 0;
    this._ejeYFlanco = 0;
  }

  consumirBoton(boton) {
    const bit = 1 << boton;
    if (this._flancoBotones & bit) { this._flancoBotones &= ~bit; return true; }
    return false;
  }

  // Flanco del STICK tratado como si fuera una cruceta.
  //
  // Hace falta porque en los menús el stick no servía: la cruceta son botones y
  // tiene flanco, pero el stick es un eje continuo, así que "moverlo a la
  // derecha" no es un evento, es un estado. Sin esto, el jugador que use stick
  // se queda mirando el menú sin poder cambiar de opción.
  //
  // El umbral de vuelta (0.4) es MENOR que el de ida (0.65) a propósito: con un
  // solo umbral, un stick temblando en el límite dispararía una ristra de
  // flancos. Es la misma histéresis de un termostato.
  flancoEje(horizontal) {
    const v = horizontal ? this.ejeX : this.ejeY;
    const prev = horizontal ? this._ejeXFlanco : this._ejeYFlanco;
    let signo = 0;
    if (v > UMBRAL_MENU) signo = 1;
    else if (v < -UMBRAL_MENU) signo = -1;
    else if (Math.abs(v) < UMBRAL_SUELTA) signo = 0;
    else signo = prev;                    // en tierra de nadie, no cambia

    if (horizontal) this._ejeXFlanco = signo; else this._ejeYFlanco = signo;
    return signo !== prev ? signo : 0;    // solo el instante del cruce
  }
}

// Lo que sirve para AVANZAR de pantalla, y nada más. Ver `flancoAvance`.
const TECLAS_AVANCE = ['Space', 'Enter', 'NumpadEnter', 'Escape'];
// A, B, X, Y y Start/Menu del mapeo estándar, como máscara de bits.
const BOTONES_AVANCE = [0, 1, 2, 3, 9];
const MASCARA_AVANCE = BOTONES_AVANCE.reduce((m, b) => m | (1 << b), 0);

export class Entrada {
  constructor(lienzo, maxJugadores) {
    this.controles = new Array(maxJugadores);
    for (let i = 0; i < maxJugadores; i++) this.controles[i] = new Control(i);

    this.hayGamepad = false;
    this.mandosConectados = 0;

    // Estado del joystick virtual (solo jugador 1: el táctil es de un móvil,
    // y en un móvil no hay cooperativo local).
    this.tactilActivo = false;
    this.tactilBaseX = 0;
    this.tactilBaseY = 0;
    this.tactilX = 0;
    this.tactilY = 0;
    this._punteroId = -1;

    this._teclas = new Set();
    this._flanco = new Set();      // pulsadas desde el último paso de lógica

    addEventListener('keydown', (e) => {
      if (e.repeat) { this._teclas.add(e.code); return; }
      this._teclas.add(e.code);
      this._flanco.add(e.code);
      // F3, F4, Tab y las flechas las reclama el navegador; aquí mandamos nosotros.
      // Tab sobre todo: sin esto, abrir la ficha de jugador mueve además el foco
      // fuera del lienzo y la siguiente tecla ya no llega al juego.
      if (e.code === 'F3' || e.code === 'F4' || e.code === 'Escape' || e.code === 'Tab' ||
          e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
    });
    addEventListener('keyup', (e) => this._teclas.delete(e.code));
    addEventListener('blur', () => { this._teclas.clear(); this._flanco.clear(); });

    addEventListener('gamepadconnected', () => { this.hayGamepad = true; });
    addEventListener('gamepaddisconnected', () => {
      // No se apaga `hayGamepad` a la ligera: con varios mandos, desenchufar
      // uno no debe dejar de sondear a los demás.
      this.hayGamepad = this._contarMandos() > 0;
    });

    this._instalarTactil(lienzo);
  }

  _instalarTactil(lienzo) {
    lienzo.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      // Solo la mitad izquierda: la derecha queda libre para futuros gestos.
      if (e.clientX > innerWidth / 2) return;
      this._punteroId = e.pointerId;
      this.tactilActivo = true;
      this.tactilBaseX = this.tactilX = e.clientX;
      this.tactilBaseY = this.tactilY = e.clientY;
      lienzo.setPointerCapture(e.pointerId);
    });

    lienzo.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._punteroId) return;
      this.tactilX = e.clientX;
      this.tactilY = e.clientY;
    });

    const soltar = (e) => {
      if (e.pointerId !== this._punteroId) return;
      this._punteroId = -1;
      this.tactilActivo = false;
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
  }

  // Se llama una vez por PASO DE LÓGICA, no por frame: el gamepad se sondea,
  // no emite eventos, y su instantánea debe alinearse con el timestep fijo.
  actualizar() {
    const lista = this._listaMandos();
    this.mandosConectados = 0;

    for (let i = 0; i < this.controles.length; i++) {
      const c = this.controles[i];
      let x = 0, y = 0, magMax = 0, fuente = 'teclado';

      // --- Teclado y táctil: solo el jugador 1 ----------------------------
      if (i === 0) {
        let tx = 0, ty = 0;
        if (this._algunaTecla(derecha()))   tx += 1;
        if (this._algunaTecla(izquierda())) tx -= 1;
        if (this._algunaTecla(abajo()))     ty += 1;
        if (this._algunaTecla(arriba()))    ty -= 1;
        if (tx !== 0 && ty !== 0) {
          const inv = Math.SQRT1_2;      // 1/raiz(2): nada de ir un 41% más rápido
          tx *= inv; ty *= inv;
        }
        magMax = hipot(tx, ty);
        x = tx; y = ty;

        if (this.tactilActivo) {
          let dx = (this.tactilX - this.tactilBaseX) / RADIO_STICK;
          let dy = (this.tactilY - this.tactilBaseY) / RADIO_STICK;
          const m = hipot(dx, dy);
          if (m > 1) { dx /= m; dy /= m; }
          if (m > magMax) { x = dx; y = dy; magMax = Math.min(m, 1); fuente = 'tactil'; }
        }
      }

      // --- Mando del jugador ---------------------------------------------
      const gp = lista ? lista[i] : null;
      c.conectado = !!(gp && gp.connected);
      let botones = 0;
      if (c.conectado) {
        this.mandosConectados++;

        let gx = gp.axes[0] || 0;
        let gy = gp.axes[1] || 0;
        const m = hipot(gx, gy);
        if (m > ZONA_MUERTA) {
          // Reescalado desde el borde de la zona muerta: el primer milímetro
          // útil del stick vale 0, no 0.18, o el personaje arranca a tirones.
          const util = Math.min(1, (m - ZONA_MUERTA) / (1 - ZONA_MUERTA));
          gx = (gx / m) * util;
          gy = (gy / m) * util;
          // ACOTAR a 1, jamás normalizar a 1: normalizar mataría el control
          // analógico y el personaje iría siempre a velocidad máxima.
          if (util > magMax) { x = gx; y = gy; magMax = util; fuente = 'gamepad'; }
        }

        // Cruceta: digital, así que vale 1 a secas. No hay medias pulsaciones.
        const bs = gp.buttons;
        let cx = 0, cy = 0;
        if (bs.length > CRUZ_DER) {
          if (bs[CRUZ_ARRIBA] && bs[CRUZ_ARRIBA].pressed) cy -= 1;
          if (bs[CRUZ_ABAJO]  && bs[CRUZ_ABAJO].pressed)  cy += 1;
          if (bs[CRUZ_IZQ]    && bs[CRUZ_IZQ].pressed)    cx -= 1;
          if (bs[CRUZ_DER]    && bs[CRUZ_DER].pressed)    cx += 1;
        }
        if (cx !== 0 || cy !== 0) {
          if (cx !== 0 && cy !== 0) { const inv = Math.SQRT1_2; cx *= inv; cy *= inv; }
          if (magMax < 1) { x = cx; y = cy; magMax = 1; fuente = 'gamepad'; }
        }

        for (let b = 0; b < bs.length && b < 32; b++) {
          if (bs[b].pressed) botones |= (1 << b);
        }
      }

      c._flancoBotones = botones & ~c._botonesPrev;
      c._botonesPrev = botones;
      c.ejeX = x;
      c.ejeY = y;
      c.fuente = fuente;
    }

    if (this.mandosConectados > 0) this.hayGamepad = true;
  }

  // --- Teclas globales, no atribuidas a ningún jugador ---------------------
  // Consume el flanco: devuelve true una sola vez por pulsación. Acepta también
  // un botón de mando, que se busca en CUALQUIER control: la pausa la puede
  // pedir quien sea.
  // AQUÍ SE TRADUCE. El juego pregunta por la tecla DE FÁBRICA —'Escape',
  // 'Tab'— y esto mira la que el jugador tenga puesta en su sitio. Por eso
  // remapear no obligó a tocar ni una de las ciento setenta llamadas que hay
  // repartidas por main.js. Ver core/controles.js.
  //
  // `crudo` se salta la traducción, y lo usa la pantalla de controles: ahí hace
  // falta leer la tecla física que se acaba de pulsar, no lo que significa.
  consumirFlanco(codigo, boton = -1, crudo = false) {
    const real = crudo ? codigo : Controles.tecla(codigo);
    let pulsada = this._flanco.has(real);
    if (pulsada) this._flanco.delete(real);
    if (boton >= 0) {
      const b = crudo ? boton : Controles.boton(boton);
      for (let i = 0; i < this.controles.length; i++) {
        if (this.controles[i].consumirBoton(b)) pulsada = true;
      }
    }
    return pulsada;
  }

  limpiarFlanco() { this._flanco.clear(); }

  // "Atrás": B en CUALQUIER mando (botón 1 del mapeo estándar). Es el gesto
  // general para cerrar una pantalla, y a propósito solo CIERRA, nunca abre:
  // Start y Select ya abren cosas distintas según la ventana (pausa, ficha...)
  // y cada una tiene su propio botón para eso. B es el único que hace lo mismo
  // en todas partes, así que no debe además ponerse a abrir la que le toque a
  // cada sitio.
  consumirAtras() {
    const b = Controles.boton(1);
    for (let i = 0; i < this.controles.length; i++) {
      if (this.controles[i].consumirBoton(b)) return true;
    }
    return false;
  }

  // La PRIMERA tecla que se haya pulsado este fotograma, sin traducir y sin
  // consumirla del todo. La pide la pantalla de controles para saber qué se
  // acaba de apretar; el juego normal no la usa.
  teclaCruda() {
    for (const c of this._flanco) return c;
    return '';
  }

  // Y el primer botón de mando, igual. Devuelve -1 si no hay ninguno.
  botonCrudo() {
    for (let i = 0; i < this.controles.length; i++) {
      const c = this.controles[i];
      if (!c._flancoBotones) continue;
      for (let b = 0; b < 32; b++) {
        if (c._flancoBotones & (1 << b)) return b;
      }
    }
    return -1;
  }

  // ¿Se ha pulsado ALGO en este paso? Teclado o cualquier botón de cualquier
  // mando. Lo usa la pantalla del cofre, que no pide una decisión sino un
  // "vale": obligar a buscar la tecla correcta para cerrar un aviso es fricción
  // por nada, y en cooperativo además nadie sabría a quién le toca pulsarla.
  algunFlanco() {
    if (this._flanco.size > 0) return true;
    for (let i = 0; i < this.controles.length; i++) {
      if (this.controles[i]._flancoBotones !== 0) return true;
    }
    return false;
  }

  // --- AVANZAR DE PANTALLA -------------------------------------------------
  //
  // Las teclas y los botones que sirven para pasar de una pantalla a la
  // siguiente. NO vale cualquiera, y esa es la diferencia con `algunFlanco`.
  //
  // Antes valía todo, y el problema no es teórico: entre el arranque y el menú
  // hay cuatro pantallas que se pasan solas o con una pulsación, así que
  // cualquier roce del teclado —o dejar un mando boca abajo en el sofá, que
  // mantiene un gatillo apretado— se llevaba por delante la intro entera sin
  // que nadie hubiera decidido nada. Con tres teclas y cinco botones concretos
  // hay que querer pasar.
  //
  // Los botones son los del mapeo estándar del Gamepad API: 0=A, 1=B, 2=X, 3=Y
  // y 9=Start/Menu. Son los que cualquiera busca para "seguir", y dejan fuera
  // gatillos, sticks y crucetas, que son los que se pulsan sin querer.
  flancoAvance() {
    for (let i = 0; i < TECLAS_AVANCE.length; i++) {
      if (this._flanco.has(TECLAS_AVANCE[i])) return true;
    }
    for (let i = 0; i < this.controles.length; i++) {
      if (this.controles[i]._flancoBotones & MASCARA_AVANCE) return true;
    }
    return false;
  }

  // ¿Hay ahora mismo alguna de esas teclas o botones SOSTENIDA? Es el estado, no
  // el flanco: lo usa la cuenta atrás para saltarse una narración
  // (ver el aro de la esquina en ui/relato.js), que necesita saber si se sigue
  // pulsando, no si se acaba de pulsar.
  avanceMantenido() {
    for (let i = 0; i < TECLAS_AVANCE.length; i++) {
      if (this._teclas.has(TECLAS_AVANCE[i])) return true;
    }
    for (let i = 0; i < this.controles.length; i++) {
      if (this.controles[i]._botonesPrev & MASCARA_AVANCE) return true;
    }
    return false;
  }

  _algunaTecla(lista) {
    for (let i = 0; i < lista.length; i++) {
      if (this._teclas.has(lista[i])) return true;
    }
    return false;
  }

  _listaMandos() {
    // navigator.getGamepads() construye una lista NUEVA en cada llamada, y esto
    // se llama una vez por paso de lógica: son 60 asignaciones por segundo
    // regaladas cuando se juega con teclado. El evento gamepadconnected ya dice
    // si hay mando, así que ni se pregunta hasta entonces.
    if (!this.hayGamepad || !navigator.getGamepads) return null;
    return navigator.getGamepads();
  }

  // VIBRAR EL MANDO DE UN JUGADOR. Lo llama main.js cuando ese jugador pierde
  // una vida.
  //
  // La API es `vibrationActuator.playEffect`, y NO la soportan todos los
  // navegadores ni todos los mandos: Chrome y Edge sí con un mando XInput,
  // Firefox y Safari no, y un mando genérico puede estar conectado y no tener
  // motores. Por eso todo el cuerpo va detrás de comprobaciones y dentro de un
  // try: una vibración que no se puede dar es una cosa que no pasa, no un error
  // —el aviso de verdad es el visual, y ese lo ve todo el mundo—.
  //
  // `playEffect` devuelve una promesa que RECHAZA si el mando desaparece a media
  // vibración (se apaga, se queda sin pila, lo desenchufan). Sin el `.catch` eso
  // sale por consola como un rechazo no gestionado en el peor momento posible.
  //
  // Dos motores: el `strong` es el pesado y el `weak` el agudo. Perder una vida
  // pide el pesado, que es el que se siente como un golpe.
  vibrar(indice, duracion = 260, fuerte = 0.85, suave = 0.4) {
    if (!this.hayGamepad || !navigator.getGamepads) return;
    const lista = navigator.getGamepads();
    const gp = lista && lista[indice];
    if (!gp || !gp.connected || !gp.vibrationActuator) return;
    try {
      const r = gp.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: duracion,
        strongMagnitude: fuerte,
        weakMagnitude: suave
      });
      if (r && r.catch) r.catch(() => {});
    } catch (e) { /* mando sin motores: no pasa nada */ }
  }

  _contarMandos() {
    const lista = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!lista) return 0;
    let n = 0;
    for (let i = 0; i < lista.length; i++) if (lista[i] && lista[i].connected) n++;
    return n;
  }
}

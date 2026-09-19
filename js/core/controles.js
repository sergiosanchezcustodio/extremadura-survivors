// LOS CONTROLES, y de quién es cada tecla. Ajuste de ESTA MÁQUINA, como el
// volumen: no es progreso ganado jugando, así que "empezar de cero" no lo toca.
//
// CÓMO SE REMAPEA SIN TOCAR EL JUEGO. main.js pregunta por teclas y botones
// CONCRETOS —`consumirFlanco('Escape')`, `consumirBoton(0)`— en ciento setenta
// sitios. Cambiarlos todos por un sistema de acciones sería reescribir el
// archivo entero y romper cosas que hoy funcionan.
//
// Así que la traducción se hace EN EL ORIGEN: el juego sigue preguntando por la
// tecla de fábrica, y core/entrada.js la cambia por la que el jugador tenga
// puesta antes de mirar el teclado. El identificador de una acción ES su tecla
// de fábrica. Ni una llamada cambia.
//
// LO QUE ESO IMPONE, y conviene saberlo antes de añadir nada aquí: dos acciones
// que compartan tecla de fábrica no se pueden separar. Pasa con Atrás y Pausa,
// que son Escape las dos: en el mando van a botones distintos —B y MENU— y ahí
// sí son independientes, pero en el teclado son y seguirán siendo la misma
// tecla. La pantalla lo dice.

const CLAVE = 'extremadura-controles-v1';

// LAS ACCIONES QUE SE PUEDEN CAMBIAR, en el orden en que salen en la pantalla.
//
//   tecla    la de fábrica, y a la vez el identificador de la acción
//   alterna  una segunda tecla que NO se puede cambiar. Es la red de seguridad:
//            pase lo que pase con lo que el jugador asigne, las flechas siguen
//            moviendo y por los menús siempre se puede andar. Sin esto, alguien
//            que asigne las cuatro direcciones a teclas que luego no recuerda se
//            queda encerrado en su propia configuración.
//   boton    el del mando, en el mapeo estándar del navegador
//   fijoEnMando  las direcciones. En el mando van al stick y a la cruceta, y
//            "cambiar la cruceta arriba por el botón B" no es una petición que
//            le quepa a nadie en la cabeza: se enseña y no se toca.
export const ACCIONES = [
  { id: 'arriba',    texto: 'Mover arriba',        tecla: 'KeyW', alterna: 'ArrowUp',
    boton: 12, fijoEnMando: true, piezas: ['stickIzq', 'cruceta'] },
  { id: 'abajo',     texto: 'Mover abajo',         tecla: 'KeyS', alterna: 'ArrowDown',
    boton: 13, fijoEnMando: true, piezas: ['stickIzq', 'cruceta'] },
  { id: 'izquierda', texto: 'Mover a la izquierda', tecla: 'KeyA', alterna: 'ArrowLeft',
    boton: 14, fijoEnMando: true, piezas: ['stickIzq', 'cruceta'] },
  { id: 'derecha',   texto: 'Mover a la derecha',  tecla: 'KeyD', alterna: 'ArrowRight',
    boton: 15, fijoEnMando: true, piezas: ['stickIzq', 'cruceta'] },
  { id: 'aceptar',   texto: 'Confirmar y elegir carta', tecla: 'Enter', alterna: 'Space',
    boton: 0, piezas: ['a'] },
  { id: 'atras',     texto: 'Atrás y cerrar',      tecla: 'Escape', alterna: '',
    boton: 1, piezas: ['b'] },
  { id: 'ficha',     texto: 'Ficha del personaje', tecla: 'Tab', alterna: '',
    boton: 8, piezas: ['view'] },
  { id: 'pausa',     texto: 'Pausa',               tecla: 'Escape', alterna: '',
    boton: 9, piezas: ['menu'], comparteTecla: 'atras' },
  { id: 'autosubir', texto: 'Subida automática',   tecla: 'KeyF', alterna: '',
    boton: 2, piezas: ['x'] },
  // EL MAPA DEL NIVEL. Solo hace algo en los niveles que son un recinto (hoy el
  // CC The Lighthouse): en una calzada como Mérida enseña el radar de siempre.
  //
  // La tecla es BLOQ MAYÚS, que la eligió Sergio: está debajo del tabulador —que
  // es la ficha— y no la usa nadie para nada. Que además encienda la lucecita
  // del teclado es un efecto secundario que no molesta; el juego no lee el
  // estado del bloqueo, solo el golpe de tecla.
  { id: 'mapa',      texto: 'Mapa del nivel',      tecla: 'CapsLock', alterna: '',
    boton: 3, piezas: ['y'] }
];

// Lo asignado ahora mismo: id -> { tecla, boton }. Arranca en los de fábrica.
const puesto = {};

// Y las dos tablas que consulta core/entrada.js, en el sentido en que las
// pregunta: de la tecla DE FÁBRICA a la que hay puesta.
const porTecla = new Map();
const porBoton = new Map();

function rehacerTablas() {
  porTecla.clear();
  porBoton.clear();
  for (let i = 0; i < ACCIONES.length; i++) {
    const a = ACCIONES[i];
    const p = puesto[a.id];
    // La alterna no se remapea nunca: por eso NO entra en la tabla. Preguntar
    // por ella la deja pasar tal cual, que es justo lo que se quiere.
    if (p.tecla !== a.tecla) porTecla.set(a.tecla, p.tecla);
    if (p.boton !== a.boton) porBoton.set(a.boton, p.boton);
  }
}

function deFabrica() {
  for (let i = 0; i < ACCIONES.length; i++) {
    const a = ACCIONES[i];
    puesto[a.id] = { tecla: a.tecla, boton: a.boton };
  }
}

export const Controles = {
  // Se llama una vez al arrancar.
  cargar() {
    deFabrica();
    try {
      const crudo = localStorage.getItem(CLAVE);
      if (crudo) {
        const d = JSON.parse(crudo);
        for (let i = 0; i < ACCIONES.length; i++) {
          const a = ACCIONES[i];
          const g = d[a.id];
          if (!g) continue;
          // Se valida lo que entra: un localStorage editado a mano, o de una
          // versión con otras acciones, no puede dejar el juego sin controles.
          if (typeof g.tecla === 'string') puesto[a.id].tecla = g.tecla;
          if (typeof g.boton === 'number' && g.boton >= 0 && g.boton < 32) {
            puesto[a.id].boton = g.boton;
          }
        }
      }
    } catch { /* sin almacenamiento: los de fábrica y a jugar */ }
    rehacerTablas();
  },

  guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(puesto));
    } catch { /* sin almacenamiento: vale para esta sesión */ }
  },

  // Qué tiene puesto una acción. Devuelve una copia: nadie de fuera escribe aquí.
  de(id) {
    const p = puesto[id];
    return p ? { tecla: p.tecla, boton: p.boton } : null;
  },

  // --- Lo que consulta core/entrada.js -------------------------------------
  tecla(codigo) { return porTecla.get(codigo) || codigo; },
  boton(n) { const r = porBoton.get(n); return r === undefined ? n : r; },

  // ¿Alguna acción DISTINTA de `id` tiene puesta esta tecla? Devuelve su id.
  // Hace falta para no dejar dos acciones en la misma tecla: la segunda sería
  // inalcanzable y el jugador no sabría por qué.
  quienTiene(id, tecla) {
    for (let i = 0; i < ACCIONES.length; i++) {
      const a = ACCIONES[i];
      if (a.id === id) continue;
      if (puesto[a.id].tecla === tecla) return a.id;
    }
    return '';
  },

  quienTieneBoton(id, boton) {
    for (let i = 0; i < ACCIONES.length; i++) {
      const a = ACCIONES[i];
      if (a.id === id) continue;
      if (puesto[a.id].boton === boton) return a.id;
    }
    return '';
  },

  // ASIGNAR. Si la tecla la tenía otra acción, esa OTRA se queda sin ninguna y
  // la pantalla la enseña vacía: es preferible un hueco visible a dos acciones
  // peleándose por la misma tecla, que es un fallo que no se ve hasta jugarlo.
  //
  // Y las acciones que comparten tecla de fábrica se mueven juntas: ver la
  // cabecera de este archivo.
  asignarTecla(id, codigo) {
    const otra = this.quienTiene(id, codigo);
    if (otra) puesto[otra].tecla = '';
    puesto[id].tecla = codigo;
    for (let i = 0; i < ACCIONES.length; i++) {
      const a = ACCIONES[i];
      if (a.comparteTecla === id || (a.id === id && a.comparteTecla)) {
        const hermana = a.comparteTecla === id ? a.id : a.comparteTecla;
        puesto[hermana].tecla = codigo;
        puesto[a.id].tecla = codigo;
      }
    }
    rehacerTablas();
    this.guardar();
  },

  asignarBoton(id, boton) {
    const otra = this.quienTieneBoton(id, boton);
    if (otra) puesto[otra].boton = -1;
    puesto[id].boton = boton;
    rehacerTablas();
    this.guardar();
  },

  restablecer() {
    deFabrica();
    rehacerTablas();
    this.guardar();
  },

  // ¿Hay algo cambiado? Lo usa la pantalla para no ofrecer un "restablecer" que
  // no haría nada.
  tocado() {
    for (let i = 0; i < ACCIONES.length; i++) {
      const a = ACCIONES[i];
      if (puesto[a.id].tecla !== a.tecla || puesto[a.id].boton !== a.boton) return true;
    }
    return false;
  }
};

// --- Nombres para la pantalla -------------------------------------------------
//
// El navegador da códigos físicos ('KeyW', 'BracketLeft') y lo que hay que
// enseñar es lo que el jugador ve escrito en su tecla.
const NOMBRES = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter num.', Space: 'Espacio',
  Tab: 'Tab', Backspace: 'Retroceso', ShiftLeft: 'Mayús izq.',
  ShiftRight: 'Mayús der.', ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.',
  AltLeft: 'Alt', AltRight: 'Alt Gr', CapsLock: 'Bloq mayús',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: '\'',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
  Backquote: '`'
};

export function nombreTecla(codigo) {
  if (!codigo) return '—';
  if (NOMBRES[codigo]) return NOMBRES[codigo];
  if (codigo.startsWith('Key')) return codigo.slice(3);
  if (codigo.startsWith('Digit')) return codigo.slice(5);
  if (codigo.startsWith('Numpad')) return 'Num ' + codigo.slice(6);
  return codigo;
}

// Y los botones del mando, con el nombre que lleva escrito un Xbox.
const BOTONES = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'VIEW', 9: 'MENU', 10: 'L3', 11: 'R3',
  12: 'Cruceta ↑', 13: 'Cruceta ↓', 14: 'Cruceta ←', 15: 'Cruceta →'
};

export function nombreBoton(n) {
  if (n === undefined || n === null || n < 0) return '—';
  return BOTONES[n] || ('Botón ' + n);
}

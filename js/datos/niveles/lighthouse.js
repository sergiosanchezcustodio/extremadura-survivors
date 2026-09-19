// Nivel 2 — CC The Lighthouse. DATOS PUROS, cero lógica.
//
// EL PRIMER NIVEL DE REJILLA, y por eso no se parece del todo a merida.js: en
// vez de `suelo` (una imagen que repite sin límite) trae `mapa`, que es un
// recinto CERRADO con paredes. Lo demás —oleadas, densidad, escalado, jefes— es
// el mismo contrato de siempre y lo lee el mismo director.
//
// ESTADO: PROTOTIPO. La geometría es de verdad y ya se juega; los colores son
// planos a propósito (no hay arte todavía) y la curva de oleadas está copiada de
// Mérida y apretada a ojo, sin una sola partida encima. Se ajusta jugando, que
// es la única forma honesta de ajustar una curva.

import { MAPA, LEYENDA, CELDA } from './lighthouse-mapa.js';

export const NIVEL = {
  id: 'lighthouse',
  nombre: 'CC The Lighthouse',
  subtitulo: 'Sin salida',
  duracion: 1800,
  requiere: 'merida',                 // cerrado hasta ganar en Mérida

  historia: [
    '@CAPÍTULO II',
    '#SIN',
    '#SALIDA',
    '',
    '',
    'El centro comercial abrió un',
    'martes y cerró un martes, y entre',
    'los dos martes cabe todo lo que la',
    'ciudad compró sin necesitarlo.',
    '',
    'Las puertas siguen ahí. Se ven',
    'desde dentro, al fondo de los',
    'pasillos, con su letrero verde',
    'encendido por la corriente que',
    'nadie ha cortado.',
    '',
    'Ninguna abre.'
  ],

  // --- EL MAPA DE REJILLA ---------------------------------------------------
  //
  // Un nivel con `mapa` es un RECINTO: tiene tamaño, tiene paredes y no repite.
  // Lo monta sistemas/rejillaMapa.js. Un nivel sin `mapa` —Mérida— sigue
  // funcionando exactamente igual que antes: el campo es opcional y el motor
  // pregunta por él antes de encender nada.
  //
  // La rejilla en sí está en lighthouse-mapa.js, que es GENERADO: sale de
  // herramientas/mapa-lighthouse.js y se retoca en Tiled. No se edita a mano.
  mapa: { rejilla: MAPA, leyenda: LEYENDA, celda: CELDA },

  // Colores planos del prototipo, uno por símbolo de la leyenda. Cuando haya
  // arte esto se sustituye por un tileset y este bloque desaparece.
  coloresMapa: {
    '#': '#2f333c',    // pared
    '.': '#b9b5ad',    // pasillo
    'a': '#93ab97',    // hipermercado
    'b': '#c2b884',    // mueblería
    'c': '#b0a2b3',    // tienda
    'd': '#9c95bd',    // ocio
    'f': '#c4ab8c',    // plaza de los food trucks

    // Las puertas. Se pintan del color de su juego para que, al verlas de lejos
    // en el suelo, se lean igual que en el plano.
    'G': '#8d949f',    // cierre gris   — lo abre el jefe del minuto 10
    'Z': '#3f7ec0',    // cierre azul   — el del minuto 20
    'S': '#2f8f42'     // puerta de la calle — el jefe final, y se acaba la fase
  },

  // Paleta del suelo procedural. Aquí no se usa —el mapa manda—, pero
  // Recursos.cargarNivel la pide y ui/tema.js se apoya en ella.
  paleta: {
    arena:      '#b9b5ad',
    arenaOscura:'#9c988f',
    piedra:     '#6f7480',
    caliza:     '#d6d2c8',
    marmol:     '#eceae4',
    oliva:      '#3d5a4a',
    purpura:    '#7a2f5e',
    cielo:      '#4fbf62'
  },

  // Tema de la interfaz: hormigón y luz de fluorescente en vez de la piedra
  // caliente de Mérida. El acento verde es el de los letreros de salida, que es
  // lo único que alumbra de color aquí dentro.
  interfaz: {
    ornamento:    'romano',            // pendiente: uno propio de centro comercial
    fondo:        '#22262d',
    fondoBajo:    '#14171c',
    fondoCarta:   '#2b3039',
    cartaElegida: '#3b424e',
    fondoClaro:   '#858c99',
    borde:        '#090a0c',
    filo:         '#4fbf62',
    titulo:       '#f0f3f7',
    texto:        '#a9b0ba',
    apagado:      '#767d87'
  },

  // Suelo de repliegue: solo se usa si el mapa de rejilla no cargara.
  suelo: {
    variantes: 4,
    base: 'arena',
    motas: ['arenaOscura', 'piedra', 'caliza'],
    densidadMotas: 30,
    grietas: 3
  },

  // --- Curva de oleadas -----------------------------------------------------
  // Copiada de la forma de Mérida y condensada. MENOS MASA que allí y más cosas
  // que estorban de una en una: en un pasillo de cuatro celdas, veinte
  // serpientes son un tapón, y un tapón no es dificultad, es una pared que se
  // mueve. La densidad la lleva el mapa; la curva solo tiene que alimentarla.
  eventos: [
    { desde:    0, hasta:  120, patron: 'anillo', cada: 0.45, cantidad: 2,
      tipos: ['serpiente'] },
    { desde:   30, hasta:  200, patron: 'oleada', cada: 12,   cantidad: 1,
      tipos: ['gargola'] },
    { desde:   95, hasta:  100, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['minotauro'] },

    { desde:  120, hasta:  300, patron: 'anillo', cada: 0.38, cantidad: 2,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'gargola'] },
    { desde:  150, hasta:  320, patron: 'linea',  cada: 20,   cantidad: 9,
      tipos: ['legionario'] },
    { desde:  200, hasta:  360, patron: 'oleada', cada: 18,   cantidad: 2,
      tipos: ['gladiador'] },
    // Las arpías VUELAN y hoy vuelan por encima de las estanterías igual que de
    // todo lo demás: son el recordatorio de que las paredes te protegen de casi
    // todo, no de todo.
    { desde:  260, hasta:  480, patron: 'oleada', cada: 16,   cantidad: 3,
      tipos: ['arpia'] },

    { desde:  300, hasta:  600, patron: 'anillo', cada: 0.32, cantidad: 2,
      tipos: ['serpiente', 'gargola', 'gargola', 'legionario'] },
    { desde:  420, hasta:  700, patron: 'oleada', cada: 22,   cantidad: 2,
      tipos: ['medusa'] },
    { desde:  480, hasta:  600, patron: 'cerco',  cada: 30,   cantidad: 12,
      tipos: ['gladiador', 'legionario'] },

    { desde:  600, hasta:  900, patron: 'anillo', cada: 0.28, cantidad: 2,
      tipos: ['gargola', 'legionario', 'gladiador', 'serpiente'] },
    { desde:  700, hasta:  980, patron: 'oleada', cada: 25,   cantidad: 1,
      tipos: ['minotauro'] },
    { desde:  840, hasta:  845, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTÍCORA' },

    { desde:  900, hasta: 1200, patron: 'anillo', cada: 0.25, cantidad: 3,
      tipos: ['gargola', 'legionario', 'gladiador', 'arpia'] },
    { desde: 1020, hasta: 1200, patron: 'linea',  cada: 24,   cantidad: 12,
      tipos: ['legionario', 'gladiador'] },
    { desde: 1080, hasta: 1400, patron: 'oleada', cada: 30,   cantidad: 1,
      tipos: ['ciclope'] },

    { desde: 1200, hasta: 1800, patron: 'anillo', cada: 0.22, cantidad: 3,
      tipos: ['gargola', 'gladiador', 'arpia', 'legionario', 'medusa'] },
    { desde: 1320, hasta: 1800, patron: 'cerco',  cada: 35,   cantidad: 16,
      tipos: ['gladiador', 'minotauro'] },
    { desde: 1500, hasta: 1505, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTÍCORA' }
  ],

  // Techo de vivos. POR DEBAJO DEL DE MÉRIDA a propósito: aquí la horda no se
  // reparte por una explanada, se embute en pasillos, y el mismo número se ve y
  // se sufre muchísimo más. Es un freno de rendimiento y también de legibilidad.
  densidad: [
    { t:    0, max:  80 },
    { t:  180, max: 140 },
    { t:  360, max: 220 },
    { t:  600, max: 330 },
    { t:  900, max: 470 },
    { t: 1200, max: 620 },
    { t: 1500, max: 700 }
  ],

  // Un pelín más duro que Mérida, que es el segundo sitio del recorrido.
  escalado: { vida: 0.12, danyo: 0.05 },

  hitos: [
    { t:  600, texto: 'CERBERO', jefe: 'intermedio' },
    { t: 1200, texto: 'HIDRA',   jefe: 'segundo' }
  ],

  // Los tres jefes se REUTILIZAN sin tocar sistemas/jefes.js. El final sigue
  // siendo la Loba, con otro nombre de aviso: entra reventando la fachada, y
  // vencerla es lo que abre la salida. Un jefe propio del centro comercial es
  // trabajo aparte — necesita su `actualizarX` en sistemas/jefes.js.
  jefes: { intermedio: 'cerbero', segundo: 'hidra', final: 'loba', escolta: 'gemelo',
           avisoFinal: 'LO QUE VIVE EN EL CENTRO' }
};

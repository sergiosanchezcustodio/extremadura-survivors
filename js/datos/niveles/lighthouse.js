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
    'E': '#8a5a3a',    // estantería
    'M': '#b8864e',    // mostrador

    // Las siete tiendas pequeñas, en tonos de la `c` para que el plano las siga
    // leyendo como tiendas y a la vez se note dónde acaba una y empieza otra.
    'r': '#b0a2b3',    // ropa
    'j': '#b8a0a0',    // juguetes
    'l': '#a49cb4',    // libros
    'g': '#b4a49c',    // regalos
    'q': '#acacb4',    // droguería
    't': '#9ca4ac',    // tecnología
    'u': '#a8b49c',    // alimentos
    'T': '#4a4d55',    // techo de una tienda cerrada
    ',': '#b5b9bd',    // pasillo del anillo 1
    ';': '#b0bdb3',    // pasillo del anillo 2

    // Las puertas. Se pintan del color de su juego para que, al verlas de lejos
    // en el suelo, se lean igual que en el plano.
    'G': '#8d949f',    // cierre gris   — lo abre el jefe del minuto 10
    'Z': '#3f7ec0',    // cierre azul   — el del minuto 20
    'S': '#2f8f42'     // puerta de la calle — el jefe final, y se acaba la fase
  },

  // LAS TEXTURAS DEL SUELO, símbolo → PNG. Cada una es una imagen que REPITE,
  // de 32x32 unidades (cuatro celdas de 8 u ocho de 4; otro tamaño se repite
  // o se recorta a ese), que el motor trocea por celdas: ver
  // sistemas/sueloRejilla.js. Lo que no esté aquí se sustituye por un dibujo
  // de relleno hecho en código a partir del color de arriba.
  //
  // LOS SUELOS SON DE SERGIO (22/09/2026): `resources/stages/2/sueloN.png`,
  // llevados a 128x128 por herramientas/paneles-lighthouse.ps1. Los tres
  // primeros son LOS PASILLOS, uno por anillo y nunca dentro de una tienda:
  // suelo1 el de partida (`.`), suelo2 el del anillo intermedio (`,`), suelo3
  // el de fuera (`;`). El resto se reparte entre las tiendas, más abajo.
  texturasMapa: {
    '.': 'assets/niveles/lighthouse/suelos/suelo1.png',
    ',': 'assets/niveles/lighthouse/suelos/suelo2.png',
    ';': 'assets/niveles/lighthouse/suelos/suelo3.png',
    'f': 'assets/niveles/lighthouse/plaza.png',
    '#': 'assets/niveles/lighthouse/pared.png',
    'M': 'assets/niveles/lighthouse/mostrador.png',
    'G': 'assets/niveles/lighthouse/cierre_gris.png',
    'Z': 'assets/niveles/lighthouse/cierre_azul.png',
    'S': 'assets/niveles/lighthouse/salida.png'
  },

  // LOS SUELOS DE LAS TIENDAS: los diez que quedan, repartidos por igual entre
  // los locales de estos tipos, UNO POR TIENDA y sin mezclar dentro de una.
  // Qué tienda pisa cuál lo decide el motor al cargar (cada trozo conexo de
  // suelo de tienda es una tienda, y van por turno): el símbolo del mapa es
  // el tipo, no el suelo. Ver `_repartirSuelos` en sistemas/sueloRejilla.js.
  suelosTiendas: {
    tipos: ['a', 'g', 't', 'u', 'q', 'j'],
    texturas: [
      'assets/niveles/lighthouse/suelos/suelo6.png',
      'assets/niveles/lighthouse/suelos/suelo7.png',
      'assets/niveles/lighthouse/suelos/suelo8.png',
      'assets/niveles/lighthouse/suelos/suelo9.png',
      'assets/niveles/lighthouse/suelos/suelo10.png',
      'assets/niveles/lighthouse/suelos/suelo11.png',
      'assets/niveles/lighthouse/suelos/suelo12.png',
      'assets/niveles/lighthouse/suelos/suelo13.png',
      'assets/niveles/lighthouse/suelos/suelo14.png',
      'assets/niveles/lighthouse/suelos/suelo15.png'
    ]
  },

  // LAS CARAS de lo que tiene altura (perspectiva 3/4, ver sueloRejilla.js):
  // símbolo → PNG del frente, que repite en horizontal y se recorta al alto de
  // la cara. Aquí solo queda el mostrador: las paredes y las estanterías van
  // POR TIENDA, más abajo.
  carasMapa: {
    'M': 'assets/niveles/lighthouse/mostrador.png'
  },
  // Celdas de cara por símbolo, EN CELDAS DE 4 (las de este nivel). Paredes y
  // estanterías a 14 celdas = 56 unidades, que es el alto de los paneles de
  // Sergio a su tamaño (213 px = 53 unidades): más de dos personajes de
  // pared, como quiere él. La franja de pie que no se pisa mide lo mismo, y el
  // generador (CARA en herramientas/mapa-lighthouse.js, que TIENE QUE
  // COINCIDIR con esto) ensancha galerías y túneles y separa los lineales
  // contando con ella. Mostradores y puertas, más bajos.
  alturasMapa: { '#': 14, 'E': 14, 'M': 4, 'G': 6, 'Z': 6, 'S': 6 },

  // CUÁNTO DE ESA CARA NO SE PISA se declara aparte, con `pieMapa` (ver
  // PIE_POR_NOMBRE en sistemas/rejillaMapa.js). Aquí no se declara, así que
  // vale lo que dice la altura: la cara entera es sólida y quien sube por el
  // pasillo se para donde el muro toca el suelo, que es el pie de la cara.
  //
  // Se probó a ponerla a cero —cara solo dibujo— y NO es lo que se quiere:
  // dejaba subir al jugador por encima de la pared hasta el otro lado.

  // LOS PANELES DE PARED, POR TIENDA (Sergio, 21/09/2026). SEIS TIPOS DE
  // TIENDA —supermercado, regalos, tecnología, alimentos, droguería,
  // juguetes— y cada una tiene UNA pared y no se mezclan: la cara de una pared
  // se elige por el suelo desde el que se ve —dentro de la juguetería, ositos;
  // en el pasillo, el azulejo del centro comercial—. Son los `pared_tipoN.png` de resources/stages/2,
  // reducidos por herramientas/paneles-lighthouse.ps1 a 64x224 —cuatro celdas
  // de ancho, catorce de alto—; cambiar el número es cambiar la pared de esa
  // tienda.
  //
  // Los que no se usan (2, 3, 10, 12, 13, 16, 22, 23, 24) quedan horneados en
  // assets/niveles/lighthouse/paredes/ para cuando haga falta cambiar uno.
  paredesMapa: {
    '.': 'assets/niveles/lighthouse/paredes/tipo1.png',    // azulejo blanco: el pasillo
    ',': 'assets/niveles/lighthouse/paredes/tipo1.png',    // (el mismo en los tres anillos)
    ';': 'assets/niveles/lighthouse/paredes/tipo1.png',
    'f': 'assets/niveles/lighthouse/paredes/tipo11.png',   // ladrillo arena: la plaza
    'a': 'assets/niveles/lighthouse/paredes/tipo9.png',    // blanco liso: supermercado
    'g': 'assets/niveles/lighthouse/paredes/tipo17.png',   // damasco azul: regalos
    't': 'assets/niveles/lighthouse/paredes/tipo19.png',   // triángulos grises: tecnología
    'u': 'assets/niveles/lighthouse/paredes/tipo20.png',   // hojas: alimentos
    'q': 'assets/niveles/lighthouse/paredes/tipo14.png',   // piedra clara: droguería
    'j': 'assets/niveles/lighthouse/paredes/tipo21.png'    // ositos: juguetes
  },

  // LOS ESCAPARATES: la pared de una tienda vista DESDE EL PASILLO. Son los
  // VENTANALES DE CRISTAL que dibujó Sergio (`pared_tienda1..8.png`), con el
  // cristal al 25% de opacidad —75% transparente, lo pidió él— y el marco
  // opaco: ver herramientas/paneles-lighthouse.ps1. Cada tipo de tienda tiene
  // SU COLOR y no varía nunca: juguetes siempre el rosa. Queda libre el gris
  // (tienda6) por si hace falta un tipo más.
  //
  // El cristal se pinta sobre la celda de suelo que tiene delante, así que a
  // través de él se ve el suelo del pasillo — que es lo que hace un cristal.
  // Y por eso NINGUNA estantería se pega a estas paredes (ver `amueblar` en
  // herramientas/mapa-lighthouse.js): taparía el ventanal.
  //
  // De qué tienda es cada celda de pared lo decide `_calcularDuenyos` en
  // sistemas/sueloRejilla.js. Una tienda CERRADA enseña su techo al otro
  // lado, y su escaparate es el del cristal a oscuras.
  escaparatesMapa: {
    'a': 'assets/niveles/lighthouse/escaparates/tienda4.png',   // verde menta: supermercado
    'g': 'assets/niveles/lighthouse/escaparates/tienda3.png',   // lila: regalos
    't': 'assets/niveles/lighthouse/escaparates/tienda1.png',   // azul: tecnología
    'u': 'assets/niveles/lighthouse/escaparates/tienda2.png',   // crema: alimentos
    'q': 'assets/niveles/lighthouse/escaparates/tienda5.png',   // blanco: droguería
    'j': 'assets/niveles/lighthouse/escaparates/tienda8.png',   // rosa: juguetes
    // LA TIENDA CERRADA NO LLEVA CRISTALERA (Sergio): si el local está cerrado
    // no hay escaparate que mirar, hay tablas. Este es el panel de madera
    // oscura, y de paso es el único que no comparte con ninguna tienda.
    'T': 'assets/niveles/lighthouse/paredes/tipo10.png'         // tablas: tienda cerrada
  },

  // LAS ESTANTERÍAS, POR TIENDA: tres dibujos de cada, que se van alternando a
  // lo largo del lineal. Una estantería enseña las de la tienda en la que
  // está —se elige por el suelo que tiene delante— y nunca las de otra.
  estanteriasMapa: {
    'a': ['assets/niveles/lighthouse/estanterias/supermercado1.png',
          'assets/niveles/lighthouse/estanterias/supermercado2.png',
          'assets/niveles/lighthouse/estanterias/supermercado3.png'],
    'g': ['assets/niveles/lighthouse/estanterias/regalos1.png',
          'assets/niveles/lighthouse/estanterias/regalos2.png',
          'assets/niveles/lighthouse/estanterias/regalos3.png'],
    't': ['assets/niveles/lighthouse/estanterias/tecnologia1.png',
          'assets/niveles/lighthouse/estanterias/tecnologia2.png',
          'assets/niveles/lighthouse/estanterias/tecnologia3.png'],
    'u': ['assets/niveles/lighthouse/estanterias/fruteria1.png',
          'assets/niveles/lighthouse/estanterias/fruteria2.png',
          'assets/niveles/lighthouse/estanterias/fruteria3.png'],
    'q': ['assets/niveles/lighthouse/estanterias/drogueria1.png',
          'assets/niveles/lighthouse/estanterias/drogueria2.png',
          'assets/niveles/lighthouse/estanterias/drogueria3.png'],
    'j': ['assets/niveles/lighthouse/estanterias/juguetes1.png',
          'assets/niveles/lighthouse/estanterias/juguetes2.png',
          'assets/niveles/lighthouse/estanterias/juguetes3.png']
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
  //
  // EL BESTIARIO ES EL DE MÉRIDA, A PROPÓSITO Y DE MOMENTO. El centro comercial
  // tendrá sus propios enemigos —los tiene pendientes Sergio—, pero hasta que
  // existan se juega con los del nivel 1: es la única forma de ajustar la curva,
  // los cierres y el laberinto sin esperar al arte. Cuando lleguen, esto es
  // cambiar los `tipos` de cada línea; el catálogo está en datos/enemigos.js y es
  // global y compartido.
  //
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
           avisoFinal: 'LO QUE VIVE EN EL CENTRO' },

  // La música del centro comercial, las dos que pasó Sergio. Se encadenan y
  // vuelven a empezar, igual que las de Mérida.
  musica: ['assets/musica/lighthouse-1.mp3', 'assets/musica/lighthouse-2.mp3']
};

// Nivel 1 — Emerita Augusta. DATOS PUROS, cero lógica.
// Añadir Cáceres, Trujillo o Alcántara debe ser copiar este archivo y cambiar
// los valores. Si para meter un nivel hay que tocar algo fuera de datos/niveles/,
// el diseño está mal.

export const NIVEL = {
  id: 'merida',
  nombre: 'Emerita Augusta',
  subtitulo: 'Las ruinas del Imperio',
  // AMPLIADA a 30 minutos (petición de Sergio), con un jefe cada diez: Cerbero
  // en el 10, la Hidra en el 20, la Loba (jefe final) en el 30. La curva de
  // los primeros 20 minutos no se toca —sigue siendo la que se jugó y se
  // ajustó— y el tramo 20-30 es nuevo, por debajo.
  duracion: 1800,                      // segundos

  // LA HISTORIA DE ESTE SITIO. Se cuenta en la placa de piedra al elegirlo y
  // antes de jugarlo (ver ui/historia.js). Estaba en la intro, cuando Mérida
  // era el único nivel y presentar el juego era presentarla a ella; la intro
  // presenta ahora el juego entero y cada sitio cuenta lo suyo aquí.
  //
  // Las líneas van PARTIDAS A MANO: el corte de cada renglón es parte del ritmo
  // al que se lee, porque se lee según entra. Una cadena vacía es un renglón en
  // blanco, '#' es titular y '@' antetítulo.
  historia: [
    '@CAPÍTULO I',
    '#LA HORDA',
    '#DE EMERITA',
    '',
    '',
    'Hace veinte siglos Roma levantó',
    'Emerita Augusta sobre el Guadiana',
    'y la nombró capital de Lusitania.',
    '',
    'Durante siglos vivió en paz. Su',
    'teatro, su anfiteatro, su',
    'acueducto y su puente siguen hoy',
    'en pie, y a su sombra duerme la',
    'ciudad de Mérida.',
    '',
    'Pero algo se ha despertado entre',
    'las piedras.',
    '',
    'Cuando cae la noche, la horda',
    'sale del foro y de las cloacas,',
    'cruza el puente romano y se',
    'derrama por las calles. Y no deja',
    'de crecer.',
    '',
    'La gente de Mérida se ha',
    'encerrado en sus casas.',
    'Alguien tiene que salir de las',
    'suyas.',
    '',
    'Aguanta hasta el amanecer.',
    'Treinta minutos. Ni uno menos.',
    '',
    'Y cuando la noche esté a punto de',
    'romper, la Loba Capitolina bajará',
    'del anfiteatro a buscarte.',
    '',
    '',
    'Nadie ha aguantado tanto.'
  ],

  // Ocres, arena tostada, piedra caliza, mármol roto, oliva y púrpura imperial.
  paleta: {
    arena:      '#b99b6b',
    arenaOscura:'#a68a5c',
    piedra:     '#8f8271',
    caliza:     '#cbbfa4',
    marmol:     '#e2dccb',
    oliva:      '#4a5138',
    purpura:    '#6d2743',
    cielo:      '#e0a15c'
  },

  // --- Tema de la interfaz -------------------------------------------------
  // Lo consume ui/tema.js: pausa, derrota y subida de nivel se pintan con esto.
  // Aquí solo hay colores y el NOMBRE de un ornamento; cómo se traza una greca
  // es lógica y vive en ui/.
  //
  // Piedra caliente en vez del morado genérico, marfil para el titular y bronce
  // para el marco y la cenefa. Es el mismo material que el anfiteatro que se ve
  // por debajo del panel, así que al abrir un menú no se sale del sitio.
  // PIEDRA GRIS, no piedra tostada. El marrón competía con la arena del
  // anfiteatro que se ve por debajo de los paneles: dos ocres uno encima de otro
  // hacen que el panel parezca parte del suelo y cuesta separarlo. El gris se
  // despega solo, deja el bronce de los marcos como único color cálido y hace
  // que el retrato y los iconos, que sí son de color, canten.
  interfaz: {
    ornamento:    'romano',
    fondo:        '#2b2e33',           // granito, arriba
    fondoBajo:    '#181a1e',           // sombra, abajo
    fondoCarta:   '#33373d',
    cartaElegida: '#464b53',
    fondoClaro:   '#8b9099',           // hueco del retrato en la ficha
    borde:        '#0a0b0d',
    filo:         '#b08c50',           // bronce, el único acento cálido
    titulo:       '#f2f4f7',
    texto:        '#aeb4bd',
    apagado:      '#7c828b'
  },

  // Configuración del suelo toroidal.
  //
  // `imagen` es el mapa pintado del nivel, ya hecho teselable por
  // herramientas/procesar-assets.ps1 a partir de resources/stages/1/. Es UNA
  // pieza de 240x368 unidades lógicas que se repite en las dos direcciones: la
  // avenida sigue de largo hacia arriba y hacia abajo, y a los lados salen
  // avenidas paralelas con sus templos, arcos y fuentes.
  //
  // El resto de parámetros NO sobran: recursos.js vuelve a ellos si la imagen
  // no carga, y con eso el nivel sigue siendo jugable sin un solo PNG, que es
  // el requisito 7 del plan. Un nivel nuevo que no traiga mapa se queda con su
  // suelo generado y no hay que tocar nada.
  suelo: {
    imagen: 'niveles/merida-suelo.jpg',
    variantes: 4,
    base: 'arena',
    motas: ['arenaOscura', 'piedra', 'caliza'],
    densidadMotas: 42,                 // motas por tile
    grietas: 2                         // trazos de losa por tile
  },

  // --- Curva de oleadas ----------------------------------------------------
  // La lee sistemas/director.js. Sigue la tabla de la sección 11 del plan.
  //
  // Cada evento es una FUENTE de enemigos que está viva entre `desde` y `hasta`
  // (segundos) y suelta `cantidad` bichos cada `cada` segundos con un `patron`
  // de aparición. Varias fuentes conviven: el enjambre de fondo va por su lado y
  // la línea de legionarios entra por encima, que es lo que hace que una oleada
  // se lea como un acontecimiento y no como más de lo mismo.
  //
  // `cantidad` y `cada` son a minuto 0; el escalado por minuto los aprieta.
  //
  // El patrón `individual` es el de los ÉLITES y se comporta distinto: entra una
  // vez al abrirse su ventana, el techo de densidad no lo frena y, si el pool
  // está lleno, el director se lo apunta y lo suelta en cuanto hay sitio. Lleva
  // además un `aviso`, porque un élite que aparece sin que te enteres es un cofre
  // que se pierde por no haberlo visto. Nunca hay dos élites vivos a la vez: el
  // segundo espera a que caiga el primero.
  //
  // --- GOTEO, NO OLEADAS DE GOLPE ------------------------------------------
  //
  // Las fuentes de MASA sueltan de dos en dos o de tres en tres varias veces por
  // segundo, en vez de doce de una tacada cada segundo y pico. El caudal por
  // minuto es el mismo; lo que cambia es que la horda se forma sola, poco a poco
  // y por todos los lados, en vez de aparecer a bloques que llegan juntos, pegan
  // juntos y mueren juntos. Jugado, la diferencia es enorme: la presión sube de
  // forma continua y siempre hay algo entrando por algún borde.
  //
  // Lo que SÍ entra de golpe son los acontecimientos: la línea de legionarios,
  // el cerco y las travesías. Ahí el bloque es el punto — se ven venir, se leen
  // como una unidad y hay que decidir qué se hace con ellos.
  //
  // `movimiento` sobrescribe el del bestiario para esa oleada concreta. Con
  // 'travesia' los enemigos NO persiguen: cruzan en línea recta y siguen de
  // largo. Es medio remedio contra la sensación de rebaño —ver enemigo.js— y
  // además hace que dos oleadas del mismo bicho no se parezcan.
  eventos: [
    // --- 0-2: el enjambre de serpientes, MÁS DENSO -------------------------
    // Antes era "lento a propósito, es donde se aprende a andar". Jugado, era
    // donde no pasaba nada: dos minutos de serpientes sueltas en los que el
    // arsenal automático se basta solo y el jugador mira.
    { desde:    0, hasta:  120, patron: 'anillo', cada: 0.37, cantidad: 2,
      tipos: ['serpiente'] },

    // GOTEO DE SUPERIORES desde el primer minuto. Es la corrección más directa
    // al "llegué al nivel 5 y solo había visto serpientes": la tabla del plan
    // introduce cada rol en su minuto, y eso deja el arranque monótono.
    //
    // De uno en uno y cada bastantes segundos: la masa sigue siendo serpiente y
    // el goteo no cambia la dificultad —cambia lo que hay que MIRAR—. Una
    // gárgola sola entre veinte serpientes se ve, y ver algo distinto es lo que
    // hace que el minuto 1 no sea el minuto 0 otra vez.
    { desde:   30, hasta:  150, patron: 'oleada', cada: 11,  cantidad:  1,
      tipos: ['gargola'] },
    { desde:   70, hasta:  180, patron: 'oleada', cada: 15,  cantidad:  1,
      tipos: ['legionario', 'gargola'] },
    // Y un primer tanque suelto muy pronto. Uno. No para matarlo: para que se
    // vea que existe algo que no muere con lo que llevas y haya que esquivarlo.
    { desde:   95, hasta:  100, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['minotauro'] },

    // Primera travesía del todo: un reguero de serpientes que cruza. Entra en
    // el minuto 1 porque es cuando la horda empieza a tener cuerpo y conviene
    // que lo primero que se aprenda de ella sea que no todo viene a por ti.
    { desde:   60, hasta:  200, patron: 'oleada', cada: 10, cantidad: 8,
      tipos: ['serpiente'], movimiento: 'travesia' },

    // --- 2-4: entran las gárgolas en serio y el primer muro de legionarios.
    { desde:  120, hasta:  240, patron: 'anillo', cada: 0.29, cantidad: 2,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'serpiente', 'gargola'] },
    { desde:  150, hasta:  240, patron: 'linea',  cada: 18,  cantidad: 12,
      tipos: ['legionario'] },
    { desde:  180, hasta:  260, patron: 'oleada', cada: 20,  cantidad:  2,
      tipos: ['gladiador'] },
    // Primera TRAVESÍA: una bandada de gárgolas que cruza de lado a lado sin
    // perseguir a nadie. Entra pronto a propósito — es lo primero que enseña que
    // no todo lo que se mueve viene a por ti, y eso cambia cómo se lee la
    // pantalla el resto de la partida.
    { desde:  140, hasta:  240, patron: 'oleada', cada: 12, cantidad: 10,
      tipos: ['gargola'], movimiento: 'travesia' },

    // --- 4-6: primera presión de velocidad. Gladiadores y arpías.
    { desde:  240, hasta:  360, patron: 'anillo', cada: 0.34, cantidad: 3,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'serpiente', 'serpiente',
              'gargola', 'gargola', 'gargola', 'legionario', 'gladiador'] },
    { desde:  255, hasta:  360, patron: 'oleada', cada: 13,  cantidad:  8,
      tipos: ['arpia'] },
    { desde:  270, hasta:  360, patron: 'oleada', cada: 26,  cantidad:  1,
      tipos: ['ciclope', 'minotauro'] },
    { desde:  300, hasta:  302, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTICORA' },

    // --- 6-8: la medusa introduce la amenaza a distancia.
    { desde:  360, hasta:  480, patron: 'anillo', cada: 0.28, cantidad: 3,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'serpiente', 'serpiente',
              'gargola', 'gargola', 'gargola', 'legionario', 'legionario',
              'gladiador', 'arpia'] },
    { desde:  360, hasta:  480, patron: 'oleada', cada: 15,  cantidad:  4,
      tipos: ['medusa'] },
    { desde:  400, hasta:  480, patron: 'linea',  cada: 24,  cantidad: 14,
      tipos: ['legionario', 'gladiador'] },
    // Estampida de arpías: cruzan rápido y de largo. A 50 de velocidad y sin
    // perseguir, pasan por encima del jugador en un segundo y se van.
    // Desde el minuto 4 y sin hueco con la bandada de gárgolas anterior: medido,
    // en cuanto pasan veinte segundos sin ninguna travesía la horda vuelve a ir
    // toda en la misma dirección y se nota en el acto.
    { desde:  240, hasta:  620, patron: 'oleada', cada: 13, cantidad: 12,
      tipos: ['arpia', 'gargola'], movimiento: 'travesia' },

    // --- 8-10: cíclopes y minotauros. Aquí se nota si el arma escala o no.
    { desde:  480, hasta:  600, patron: 'anillo', cada: 0.32, cantidad: 4,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'serpiente', 'serpiente',
              'gargola', 'gargola', 'gargola', 'legionario', 'legionario',
              'gladiador', 'gladiador', 'arpia', 'medusa'] },
    { desde:  480, hasta:  600, patron: 'oleada', cada: 15,  cantidad:  3,
      tipos: ['ciclope', 'minotauro'] },

    // --- 10-13: todo lo anterior, pero en cerco.
    { desde:  600, hasta:  780, patron: 'cerco',  cada: 10,  cantidad: 30,
      tipos: ['serpiente', 'gargola', 'legionario', 'gladiador', 'arpia', 'medusa'] },
    { desde:  600, hasta:  780, patron: 'anillo', cada: 0.32, cantidad: 4,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'serpiente', 'serpiente',
              'gargola', 'gargola', 'gargola', 'legionario', 'gladiador',
              'gladiador', 'arpia'] },
    { desde:  660, hasta:  662, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTICORA' },
    // Carga de legionarios que atraviesa el cerco: entra por un borde en muro y
    // sigue recto. Con el cerco cerrándose por fuera, la travesía obliga a
    // moverse DENTRO del cerco en vez de quedarse en el centro.
    { desde:  620, hasta:  960, patron: 'linea',  cada: 16, cantidad: 18,
      tipos: ['legionario'], movimiento: 'travesia' },
    { desde:  700, hasta:  780, patron: 'oleada', cada: 24,  cantidad:  3,
      tipos: ['ciclope', 'minotauro'] },

    // --- 13-16: enjambres. Serpientes y arpías en cantidad.
    { desde:  780, hasta:  960, patron: 'anillo', cada: 0.33, cantidad: 5,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'serpiente', 'serpiente',
              'gargola', 'gargola', 'legionario', 'gladiador', 'arpia',
              'arpia', 'medusa'] },
    { desde:  780, hasta:  960, patron: 'cerco',  cada: 14,  cantidad: 30,
      tipos: ['gargola', 'gladiador', 'legionario', 'medusa'] },
    // Enjambre de serpientes en travesía: el suelo entero se mueve en una
    // dirección. Con la horda del minuto 16 encima, esto es lo que impide que
    // todo lo que hay en pantalla vaya hacia el mismo sitio.
    //
    // HASTA 1800, no 1200: con la partida ampliada a 30 minutos, esta fuente
    // —como las otras tres marcadas igual más abajo— sigue viva hasta el
    // final en vez de apagarse en el minuto 20. Es la curva de fondo del
    // tramo final, no un evento que tenga que renovarse.
    { desde:  800, hasta: 1800, patron: 'oleada', cada: 9, cantidad: 18,
      tipos: ['serpiente', 'serpiente', 'gargola'], movimiento: 'travesia' },
    { desde:  840, hasta:  960, patron: 'oleada', cada: 22,  cantidad:  3,
      tipos: ['ciclope', 'minotauro'] },

    // --- 16-20: mezcla total, oleadas superpuestas. HASTA 1800: es la misma
    // razón que la travesía de arriba, con la partida ampliada estas tres
    // fuentes siguen vivas de fondo durante todo el tramo 20-30, y encima de
    // ellas es donde se apilan los eventos nuevos de esa década.
    { desde:  960, hasta: 1800, patron: 'anillo', cada: 0.29, cantidad: 6,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'serpiente', 'serpiente',
              'gargola', 'gargola', 'gargola', 'legionario', 'legionario',
              'gladiador', 'gladiador', 'arpia', 'arpia', 'medusa', 'minotauro'] },
    { desde:  960, hasta: 1800, patron: 'linea',  cada: 20,  cantidad: 20,
      tipos: ['legionario', 'gladiador'] },
    { desde:  980, hasta: 1800, patron: 'cerco',  cada: 15,  cantidad: 34,
      tipos: ['serpiente', 'gargola', 'arpia', 'medusa', 'minotauro'] },
    { desde:  990, hasta:  992, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTICORA' },
    { desde: 1080, hasta: 1082, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTICORA' },

    // --- 20-25: tras la Hidra, un escalón más sobre la misma mezcla. Cíclope
    // entra en el reparto normal (antes solo salía en oleadas propias) porque
    // a estas alturas ya no es un susto, es uno más de la horda.
    { desde: 1200, hasta: 1800, patron: 'anillo', cada: 0.27, cantidad: 6,
      tipos: ['serpiente', 'serpiente', 'serpiente', 'serpiente',
              'gargola', 'gargola', 'gargola', 'legionario', 'legionario',
              'gladiador', 'gladiador', 'arpia', 'arpia', 'medusa', 'medusa',
              'minotauro', 'ciclope'] },
    { desde: 1220, hasta: 1800, patron: 'cerco',  cada: 13,  cantidad: 36,
      tipos: ['serpiente', 'gargola', 'arpia', 'medusa', 'minotauro', 'ciclope'] },
    { desde: 1260, hasta: 1800, patron: 'oleada', cada: 20,  cantidad: 4,
      tipos: ['ciclope', 'minotauro'] },
    { desde: 1350, hasta: 1352, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTICORA' },

    // --- 25-30: el tramo final, de camino a la Loba. Travesía densa: el
    // suelo entero cruza mientras se acerca el jefe final, para que el último
    // tramo no se sienta como una repetición del anterior.
    { desde: 1500, hasta: 1800, patron: 'oleada', cada: 8, cantidad: 20,
      tipos: ['serpiente', 'serpiente', 'gargola', 'arpia'], movimiento: 'travesia' },
    { desde: 1500, hasta: 1800, patron: 'linea',  cada: 18,  cantidad: 22,
      tipos: ['legionario', 'gladiador'] },
    { desde: 1650, hasta: 1652, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTICORA' },

    // --- Serpiente dorada, cada dos minutos (sección 11) -------------------
    // La SEGUNDA vía de las evoluciones, y la única que está siempre a mano: la
    // mantícora sale cuatro veces en toda la partida, así que sin esto quien
    // falle esas cuatro no ve una evolución jamás.
    //
    // Desde el minuto 2 y no desde el 0: en los dos primeros minutos no hay con
    // qué alcanzarla, y lo que toca ahí es aprender a moverse.
    //
    // CADA CUATRO MINUTOS, no cada dos. Nunca hay dos élites vivos a la vez, y
    // midiendo una partida entera se vio que la dorada acaparaba el turno: salían
    // sus nueve apariciones y ni un solo dorado de los otros. Espaciándola, el
    // cupo se reparte entre toda la familia y se ven cosas distintas.
    //
    // NO lleva aviso, al revés que la mantícora, y es deliberado: la mantícora
    // es una amenaza que hay que ver venir, la serpiente dorada es una
    // oportunidad que hay que saber ver. Anunciarla la convertiría en un trámite.
    { desde:  120, hasta:  122, patron: 'individual', cada: 60, cantidad: 1, tipos: ['serpienteDorada'] },
    { desde:  360, hasta:  362, patron: 'individual', cada: 60, cantidad: 1, tipos: ['serpienteDorada'] },
    { desde:  600, hasta:  602, patron: 'individual', cada: 60, cantidad: 1, tipos: ['serpienteDorada'] },
    { desde:  840, hasta:  842, patron: 'individual', cada: 60, cantidad: 1, tipos: ['serpienteDorada'] },
    { desde: 1080, hasta: 1082, patron: 'individual', cada: 60, cantidad: 1, tipos: ['serpienteDorada'] },
    // Sigue cada cuatro minutos en el tramo ampliado: sin esto, la vía de
    // evolución más fiable desaparecería justo en los diez minutos que se han
    // añadido.
    { desde: 1320, hasta: 1322, patron: 'individual', cada: 60, cantidad: 1, tipos: ['serpienteDorada'] },
    { desde: 1560, hasta: 1562, patron: 'individual', cada: 60, cantidad: 1, tipos: ['serpienteDorada'] },

    // --- Gárgola de bronce, cada cuatro minutos desde el 5 -----------------
    // El segundo especial. Menos frecuente que la dorada porque es lo contrario
    // que ella: no huye, se te queda encima pegando mientras la tumbas, y dos
    // de esas seguidas serían castigo en vez de oportunidad.
    { desde:  300, hasta:  302, patron: 'individual', cada: 60, cantidad: 1, tipos: ['gargolaBronce'] },
    { desde:  540, hasta:  542, patron: 'individual', cada: 60, cantidad: 1, tipos: ['gargolaBronce'] },
    { desde:  780, hasta:  782, patron: 'individual', cada: 60, cantidad: 1, tipos: ['gargolaBronce'] },
    { desde: 1020, hasta: 1022, patron: 'individual', cada: 60, cantidad: 1, tipos: ['gargolaBronce'] },
    { desde: 1260, hasta: 1262, patron: 'individual', cada: 60, cantidad: 1, tipos: ['gargolaBronce'] },
    { desde: 1500, hasta: 1502, patron: 'individual', cada: 60, cantidad: 1, tipos: ['gargolaBronce'] },

    // --- DORADOS: cada enemigo tiene su versión con tesoro -----------------
    // Escalonados por poder: el de la gárgola pronto, el del minotauro casi al
    // final. Ver uno es siempre buena noticia y siempre una decisión —dejar de
    // hacer lo que estabas haciendo e ir a por él— y por eso salen de uno en uno
    // y espaciados. Nunca coinciden dos élites vivos: el director lo impide.
    { desde:  420, hasta:  422, patron: 'individual', cada: 60, cantidad: 1, tipos: ['gargolaDorada'] },
    { desde:  660, hasta:  662, patron: 'individual', cada: 60, cantidad: 1, tipos: ['legionarioDorado'] },
    { desde:  900, hasta:  902, patron: 'individual', cada: 60, cantidad: 1, tipos: ['gladiadorDorado'] },
    { desde: 1110, hasta: 1112, patron: 'individual', cada: 60, cantidad: 1, tipos: ['minotauroDorado'] }
  ],

  // Techo de enemigos VIVOS por tramo. No es un objetivo, es un freno: sin él,
  // un jugador que no mata a ritmo acumula la oleada anterior con la siguiente y
  // acaba con la pantalla llena por bloqueo, no por diseño. Interpolado entre
  // marcas, así que la presión sube de forma continua y no a escalones.
  // SUBIDA EN TODO EL TRAMO TEMPRANO. El techo de los primeros diez minutos era
  // lo que hacía que la partida se jugara sola: con 60 vivos como máximo en el
  // minuto 0 y 130 en el 4, el arsenal automático limpiaba más deprisa de lo que
  // entraba y no había cerco que romper. El final se queda donde estaba porque
  // ahí manda el rendimiento, no el diseño: el objetivo del plan son 800
  // entidades a 60 fps.
  densidad: [
    { t:    0, max:  90 },
    { t:  120, max: 150 },
    { t:  240, max: 210 },
    { t:  360, max: 280 },
    { t:  480, max: 360 },
    { t:  600, max: 430 },
    { t:  780, max: 560 },
    { t:  960, max: 750 },
    { t: 1200, max: 850 }
  ],

  // Escalado por minuto. Vida y daño de cada enemigo se multiplican por
  // 1 + factor * minutos al aparecer, así que una serpiente del minuto 15 no es
  // la del minuto 0. La velocidad NO escala: un bestiario en el que todo acelera
  // con el reloj acaba siendo imposible de leer.
  escalado: { vida: 0.11, danyo: 0.05 },

  // Momentos de la línea temporal en los que entra un jefe DE VERDAD (Fase 6):
  // `jefe` es la clave dentro de `jefes` de más abajo, así que el director
  // resuelve el tipo (`jefes[hito.jefe]`) sin saber nada de Cerbero ni de la
  // Loba. El jefe final del nivel (`jefes.final`) no necesita hito propio: lo
  // invoca el director solo, un minuto antes de acabar la partida (ver
  // MARGEN_JEFE_FINAL en sistemas/director.js) y su aviso sale de
  // `jefes.avisoFinal`.
  hitos: [
    { t:  600, texto: 'CERBERO', jefe: 'intermedio' },
    { t: 1200, texto: 'HIDRA',   jefe: 'segundo' }
  ],

  // --- Decoración sólida ---------------------------------------------------
  // Columnas, antorchas, estatuas y ruinas a los lados de la calzada. Sistemas
  // (sistemas/obstaculos.js) repite esta plantilla cada vez que el suelo
  // repite su tile, así que las coordenadas son LOCALES a un tile de suelo
  // (0..361 de ancho, 0..430 de alto una vez procesado por
  // herramientas/procesar-assets.ps1), no coordenadas de mundo.
  //
  // DÓNDE ESTÁ EL BORDE DE LA CALZADA, medido y no a ojo.
  //
  // Las cifras viejas —186 y 367— eran a ojo y daban por hecho que la calzada
  // estaba CENTRADA en el tile. No lo está: medida sobre el propio
  // niveles/merida-suelo.jpg, que son 2212x1720 px y a 4 px por unidad lógica
  // dan exactamente este tile de 553x430, la piedra va de x=181 a x=395. O sea
  // centrada en 288 cuando el tile lo está en 276,5, corrida once unidades y
  // media a la derecha.
  //
  // Con las cifras simétricas, el lado izquierdo acertaba de casualidad —186
  // cae 5 dentro del filo, que es lo que hace que se vea bien apoyado— y el
  // derecho se quedaba 28 unidades DENTRO de la calzada, que es lo que Sergio
  // veía. El carril derecho pasa a 390: el mismo pellizco de 5 hacia dentro que
  // el izquierdo, contado desde el borde de verdad.
  //
  // El borde ondula un par de unidades según la fila, así que 390 es el centro
  // de una franja buena, no un filo exacto al píxel.
  //
  // Columnas, antorchas y estatuas van justo sobre ese borde; las ruinas, más
  // adentro en la hierba (72 y 474, que siguen fuera de la piedra por mucho).
  // Deliberadamente disperso —diez piezas en 430 unidades de alto— para que no
  // sature.
  //
  // ENSANCHADO un 50% (pedido de Sergio): herramientas/procesar-assets.ps1
  // ya no procesa mapa_emerita_survivor.png directamente, sino una copia
  // ensanchada por reflejo de los bordes (`Procesador.Ensanchar`, sin IA —los
  // intentos con Gemini/ChatGPT/Bing se descartaron, ver comentario en el
  // propio script). El tile pasó de 361 a 553 unidades lógicas de ancho, +96
  // simétricos a cada lado; las cifras de aquí abajo son las de siempre +96,
  // así que la calzada queda exactamente donde estaba y lo nuevo es margen.
  // A propósito NO se ha metido decoración en la franja añadida, la más
  // externa: es la que sale del espejo y tiene su propio pliegue visible, y
  // llenarla de objetos solo llamaría la atención hacia él.
  // LAS ANTORCHAS, POCAS Y SEPARADAS. Han ido 2 -> 6 -> 24 -> 12 por tile, y el
  // recorte de 24 a 12 lo pidió Sergio después de verlo: con veinticuatro salían
  // quince a la vez en pantalla y aquello era una verbena. Lo que quiere es que
  // aparezcan CADA CIERTA DISTANCIA, no en racimo.
  //
  // Y doce sigue siendo el doble de las seis de antes, aunque se vean menos a la
  // vez. La razón es que el problema de verdad no era la cantidad sino que el
  // mapa se quedaba pelado por detrás, y eso ya está resuelto en otro sitio (ver
  // `_olvidarFilasLejanas` en sistemas/obstaculos.js): una fila vuelve a
  // poblarse cuando te alejas y regresas. Con el suministro arreglado, la
  // densidad puede bajar sin que falten antorchas en toda la partida.
  //
  // EN CUATRO CARRILES, que es lo que permite separarlas de verdad. Doce en los
  // dos carriles de la calzada volverían a apelotonarlas sobre el borde; en
  // cuatro, cada carril lleva pocas y muy espaciadas. Los dos de hierba están en
  // 130 y 430, entre la piedra (181..395) y las ruinas (39..105 y 441..507), sin
  // rozar ninguna de las dos.
  //
  // El reparto NO es igual por carril: los dos de la calzada llevan solo DOS
  // cada uno porque ya tienen su columna y su estatua ocupando sitio, y los dos
  // de hierba llevan CUATRO porque están vacíos. Así la separación mínima entre
  // dos piezas cualesquiera del mismo carril no baja de 75, contando la costura
  // donde el patrón se repite.
  //
  // La antorcha es DESTRUIBLE y suelta un consumible al caer (ver `esObjeto` en
  // datos/enemigos.js), así que esta lista es también el grifo de los
  // consumibles. Si hay que retocarlo, se retoca aquí.
  decoracion: [
    // Carril de hierba izquierdo: cuatro, cada 108.
    { tipo: 'antorcha1', x: 130, y:  20 },
    { tipo: 'antorcha2', x: 130, y: 128 },
    { tipo: 'antorcha1', x: 130, y: 236 },
    { tipo: 'antorcha2', x: 130, y: 344 },

    // Borde izquierdo de la calzada: dos, en los huecos que dejan la columna
    // (y=50) y la estatua (y=200).
    { tipo: 'columna',   x: 186, y:  50 },
    { tipo: 'antorcha2', x: 186, y: 125 },
    { tipo: 'antorcha1', x: 186, y: 320 },

    // Borde derecho: dos, esquivando la estatua (y=195) y la columna (y=350).
    { tipo: 'antorcha1', x: 390, y: 110 },
    { tipo: 'antorcha2', x: 390, y: 270 },
    { tipo: 'columna',   x: 390, y: 350 },

    // Carril de hierba derecho: cuatro, cada 108 y a contrapié de las del
    // carril de enfrente, para que no queden dos a la misma altura.
    { tipo: 'antorcha2', x: 430, y:  74 },
    { tipo: 'antorcha1', x: 430, y: 182 },
    { tipo: 'antorcha2', x: 430, y: 290 },
    { tipo: 'antorcha1', x: 430, y: 398 },

    // LAS ESTATUAS, AL BORDE DE LA CALZADA como las columnas (lo pidió Sergio).
    // Estaban a 141 y 412, o sea en mitad de la hierba: ahí se leían como parte
    // del paisaje y no como lo que son. En el borde —186 y 367— hacen calle con
    // las columnas y las antorchas, que es lo que ordena la avenida.
    //
    // Las `y` salen de los huecos que dejan las antorchas de su mismo lado:
    // 200 cae entre las de 150 y 250, y 195 entre las de 130 y 260. Ninguna
    // queda a menos de 50 de su vecina, que con 48 de alto es aire de sobra.
    //
    // Y las `x` son las de su carril, 186 y 390: ver la nota del borde de la
    // calzada, arriba. El carril derecho estaba en 367, que es piedra.
    { tipo: 'estatua2',  x: 186, y: 200 },
    { tipo: 'estatua4',  x: 390, y: 195 },

    // LAS RUINAS, EN DOS CARRILES EXTERIORES Y SEPARADAS.
    //
    // Llegaron a estar las diez y el escenario quedaba saturado: son el objeto
    // más grande del nivel —110 de alto y hasta 124 de ancho— y puestas de tres
    // en tres por carril convertían los laterales en un muro. Se quedan CINCO.
    //
    // Los carriles a 72 y 474 salen de una cuenta, no del ojo: el radio sólido
    // de una ruina se saca de su recorte (ver `huellaDe` en
    // sistemas/obstaculos.js) y con el tamaño de hoy son unas 33 unidades de
    // semieje, así que sus bordes interiores caen en 105 y 441 — la calzada va
    // de 181 a 395, o sea que ninguna la pisa ni de lejos.
    //
    // Y la separación vertical es de 145 como mínimo, contando que el patrón se
    // REPITE cada 430: la de más abajo de un carril tiene que quedar lejos de
    // la de más arriba del tile siguiente, o al avanzar aparecerían pegadas
    // justo en la costura. Dos radios son 77, así que 145 deja 68 de hueco
    // limpio para pasar entre una y otra.
    // TRES, y no cinco. Un 40% menos, que es lo que se pidió después de verlo:
    // ahora que son sólidas de verdad —caja, no círculo— cada una estorba
    // muchísimo más que cuando se podían atravesar, así que la misma cantidad
    // ya no se siente igual.
    //
    // Repartidas 1 - 2 - 1 entre los dos carriles y a media altura de tile unas
    // de otras: la separación mínima entre dos ruinas cualesquiera, contando la
    // costura donde el patrón se repite, es de 215.
    { tipo: 'ruinas1',   x:  72, y: 100 },
    { tipo: 'ruinas7',   x: 474, y: 240 },
    { tipo: 'ruinas9',   x:  72, y: 340 }
  ],
  // El jefe final del nivel 1 es LA LOBA CAPITOLINA con los gemelos, no la
  // hidra del plan: ver el bloque de jefes de datos/enemigos.js y sus fases
  // en datos/jefes.js y sistemas/jefes.js (Fase 6). La hidra no desaparece
  // del todo: con la partida ampliada a 30 minutos recupera su papel, ahora
  // como jefe SEGUNDO (minuto 20), entre Cerbero y la Loba.
  jefes:      { intermedio: 'cerbero', segundo: 'hidra', final: 'loba', escolta: 'gemelo',
                avisoFinal: 'LA LOBA CAPITOLINA' }
  // Sin campo `musica`: la Fase 7 sustituyó los ficheros de audio previstos en
  // el plan por síntesis procedural (ver sistemas/audio.js) — no hay pistas
  // que referenciar desde aquí, ni para este nivel ni para los siguientes.
};

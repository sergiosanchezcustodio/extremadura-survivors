// Catálogo global de enemigos. DATOS PUROS, cero lógica.
//
// Todas las medidas van en unidades LÓGICAS (rejilla de 480x270). El PNG de
// assets/ es el doble, pero eso solo lo sabe el atlas: aquí no aparece ni una
// constante de arte.
//
// Añadir un enemigo nuevo es añadir una entrada a este objeto y su sprite al
// atlas. Nada de esto obliga a tocar el motor.
//
// - vida / velocidad / danyo / radio: sección 10 del plan, a minuto 0.
// - xp: experiencia que suelta al morir, en la gema del escalón que le toque.
// - radio: círculo de COLISIÓN, no del sprite. (Tercera pasada de tamaños el
//   21/09/2026: todo x0,8 y los jefes x0,75, a la par que los sprites.) Sale de min(0.35*alto, 0.45*ancho)
//   para que rozar un ala o un cuerno no cuente como impacto.
// - masa: reparte el empuje. Un cíclope no sale despedido como una serpiente.
//   No es un peso realista, es un divisor de empuje.
// - vuela: ignora la decoración del suelo y flota en vez de pisar.
// - inmuneEmpuje: el empuje por daño no le afecta (la separación entre bichos
//   sí, o se apilarían en un punto).
// - sprite: id en el atlas. Existe aparte del id de la entrada porque las
//   variantes tintadas (la serpiente dorada de la sección 11) reutilizan arte.
// - spriteBase + tinte: variante de COLOR. El motor genera al cargar una copia
//   teñida del sprite base y la registra con el id de `sprite`, así que a partir
//   de ahí la variante se dibuja exactamente igual que cualquier otro enemigo.
//   Es lo que permite que la serpiente dorada no necesite arte propio.
// - cofre: suelta un cofre al morir, además de su gema. Solo los élites.
// - persistente: el culling lo perdona hasta el doble de distancia. Un élite
//   que se recicla por haberse alejado se lleva con él su cofre, y con él la
//   vía de las evoluciones.
// - ataque: si lo lleva, DISPARA. Ver el bloque de la medusa más abajo.
// - movimiento: cómo se acerca. Ver el bloque de patrones al final de esta
//   cabecera.

// === SEGUNDO AJUSTE, CONTRA PARTIDA JUGADA ===================================
//
// Sergio jugó la curva entera y el diagnóstico fue claro: se llega al nivel 12
// sin esfuerzo, casi sin moverse, y los enemigos "superiores" mueren igual de
// fácil que la serpiente del minuto 0. Tres cambios, y los tres a la vez, porque
// por separado ninguno arregla nada:
//
//   1. VIDA MUY ARRIBA, y sobre todo SEPARADA POR ROL. Antes, entre la serpiente
//      (12) y el gladiador (75) había seis veces; con cuatro armas a nivel medio
//      las dos morían en el mismo golpe, así que el bestiario entero se sentía
//      igual. Ahora hay del orden de doce veces entre la masa y la base, y
//      cuarenta hasta el tanque. Ver un cíclope tiene que dar pereza.
//
//   2. VELOCIDAD ABAJO, otra vez. Parece contradictorio con "más difícil", pero
//      es justo al revés: en este género la masa amenaza por NÚMERO, y lo que
//      mata es quedar rodeado. Un enemigo lento y duro cierra el cerco y no se
//      puede atravesar; uno rápido y blando se disuelve al tocarlo. Además hace
//      legible al que sí corre: la arpía sigue siendo la única de la que no se
//      escapa en línea recta.
//
//   3. DAÑO DE CONTACTO ARRIBA. Con enemigos más lentos hay menos contactos, y
//      sin subir el daño la vida del jugador dejaba de ser un recurso.
//
// La otra mitad del ajuste no está aquí: la densidad, la variedad temprana y el
// escalado por minuto viven en datos/niveles/merida.js.
//
// --- ESPECIALES ---------------------------------------------------------------
//
// `especial` marca la variante potente de un enemigo corriente. La regla es de
// Sergio y es buena: MISMA VELOCIDAD que su versión básica, pero muy por encima
// en todo lo demás. Un especial no se distingue por correr más —eso solo genera
// persecuciones frustrantes— sino por aguantar, y por lo que suelta al caer.
//
// --- AJUSTE ANTERIOR (se conserva por qué se hizo) ---------------------------
// AJUSTE DE VELOCIDAD Y VIDA respecto a la tabla original del plan.
//
// Velocidades: dos correcciones, no una.
//
// La primera, bajarlo todo. El jugador va a 85 y el plan ponía a la masa en 68,
// un 80% de tu velocidad: asfixiante. En este género la masa es LENTA y amenaza
// por número, no por alcance; lo que mata es quedar rodeado.
//
// La segunda, y la que más se notaba: SEPARARLAS ENTRE SÍ. Con casi todo entre
// 28 y 40 daba igual qué bicho te persiguiera, y un bestiario en el que todos se
// mueven igual es un bestiario de un solo enemigo con once sprites. Ahora el
// abanico va del 12% de tu velocidad (cíclope, un muro que camina) al 78%
// (arpía, la única de la que no puedes escapar en línea recta). Entre la
// serpiente del minuto 0 y el gladiador hay más del doble.
//
// El arranque tiene que ser MUY lento: serpiente y gárgola son lo primero que
// se ve.
//
// --- TERCERA BAJADA: TODO UN 25% MÁS LENTO ----------------------------------
//
// Petición de Sergio tras jugar: "todo se mueve demasiado rápido, tanto jugadores
// como enemigos". Baja el bestiario ENTERO y también el jugador (BASE.velocidad
// en entidades/jugador.js), así que la proporción entre ambos no cambia y lo que
// se ha aprendido sobre huir sigue valiendo. Lo que cambia es el ritmo: hay más
// tiempo para leer la pantalla y decidir, y el agobio pasa a venir de que el
// cerco se cierra, no de que no da tiempo a reaccionar.
//
// Tabla VIGENTE. Porcentaje sobre los 64 del jugador:
//
//   ciclope     7   11%      medusa       8   13%
//   serpiente  10   16%      serp. dorada 11  17%
//   legionario 13   20%      loba        12   19%
//   minotauro  15   23%      gargola     16   25%
//   gladiador  24   38%      gemelo      25   39%
//   manticora  28   44%      arpia       32   50%
//
// Vida: también estaba baja. Con el Pilum a 10 de daño, casi todo moría de un
// disparo y no se sentía ningún peso. (Ese ajuste se quedó corto y es lo que
// corrige el bloque de arriba: ver "SEGUNDO AJUSTE".)
//
// Estos números se afinarán contra la curva real en la Fase 8; lo que buscan de
// momento es que el minuto 0 se sienta como debe.
// RADIOS REDUCIDOS AL 70%, en la misma proporción que el arte (ver el catálogo
// de herramientas/procesar-assets.ps1). Se encogieron los cuerpos para que
// quepa más campo en pantalla; si el radio de colisión no bajara con ellos,
// los enemigos golpearían desde fuera de su propia silueta.
//
// --- CÓMO SE MUEVE CADA UNO --------------------------------------------------
//
// `movimiento` es lo que rompe la sensación de REBAÑO. Con todos persiguiendo
// en línea recta al mismo objetivo, doscientos enemigos se comportan como un
// solo bloque que se desliza: no hay nada que leer en la horda, solo una masa
// que avanza, y esquivar deja de ser una decisión. Cada patrón mete una
// trayectoria distinta, y encima cada individuo lleva su fase, su sentido de
// giro y su velocidad (±14%), así que dos serpientes del mismo enjambre nunca
// van sincronizadas.
//
//   directo    — recto al jugador más cercano. Los disciplinados y los muros.
//   zigzag     — culebrea de lado a lado mientras avanza.
//   revoloteo  — vuelo errático: dos ondas de periodo distinto, así que no se
//                le ve la repetición, y la velocidad también oscila.
//   orbita     — se acerca en espiral y da vueltas buscando el hueco.
//   acecho     — avanza a tirones: se para y embiste.
//   huida      — se aleja del jugador y le da vueltas a distancia. El único que
//                no quiere alcanzarte: hay que ir a por él.
//
// Todos tiran RECTO en el último tramo, o un enemigo que culebrea pegado a ti
// no llegaría a tocarte nunca y el combate sería incomprensible.
// --- DE QUÉ ESTÁ HECHO CADA UNO ----------------------------------------------
//
// `restos` dice qué suelta al morir. Sin él todo el bestiario reventaba EN
// SANGRE: una gárgola es una estatua de piedra y sangraba, una antorcha es un
// palo ardiendo y sangraba, y con veinte bichos distintos en pantalla todas las
// muertes eran la misma mancha roja. Es lo único que distingue de qué está hecho
// lo que acabas de romper.
//
// Aquí solo se declara el NOMBRE del material; qué color y qué peso tiene cada
// uno vive en MATERIALES, en entidades/enemigo.js, que es donde están los
// colores. Igual que `movimiento:'zigzag'`: el dato dice cuál, el motor sabe
// cómo. Lo que no se declara es carne, que es la inmensa mayoría.
//
//   piedra — la gárgola y sus variantes. Lascas grises que caen rápido.
//   veneno — la medusa, la misma sustancia con la que llena sus púas.
//   ceniza — las antorchas, que no mueren: se apagan.
export const ENEMIGOS = {
  // --- Masa: carne de cañón, aparecen en enjambres -------------------------
  // La serpiente ya no muere de un solo disparo del Pilum base (10). Es el
  // enemigo del minuto 0 y tiene que enseñar que aquí las cosas hay que
  // matarlas; con un golpe por bicho, los dos primeros minutos se juegan solos.
  //
  // Su RADIO baja a la mitad con su sprite (ver el catálogo de la herramienta):
  // el círculo de daño no puede sobrar por fuera de la silueta, o el bicho muerde
  // desde donde no está.
  serpiente:  { sprite:'serpiente',  rol:'masa',      xp:1, vida:16,    velocidad:10, danyo:4,  radio:2.9,  masa:1.0,  vuela:false, inmuneEmpuje:false, movimiento:'zigzag'    },
  gargola:    { sprite:'gargola',    rol:'masa',      xp:2, vida:40,    velocidad:16, danyo:5,  radio:5.2,  masa:1.6,  vuela:true,  inmuneEmpuje:false, movimiento:'revoloteo', restos:'piedra' },

  // --- Base: los guardianes humanos ---------------------------------------
  // Casi diez veces la serpiente. Un legionario no es "otra serpiente con
  // casco": es un muro que hay que decidir si rodear o romper. Sus radios suben
  // con el sprite, que ahora es un 40% más alto.
  legionario: { sprite:'legionario', rol:'base',      xp:6, vida:140,   velocidad:13, danyo:9,  radio:6.2,  masa:3.5,  vuela:false, inmuneEmpuje:false, movimiento:'directo'   },
  gladiador:  { sprite:'gladiador',  rol:'base',      xp:8, vida:190,   velocidad:24, danyo:11, radio:7,  masa:4.5,  vuela:false, inmuneEmpuje:false, movimiento:'orbita'    },

  // --- Rápido: el único que te alcanza si huyes en línea recta ------------
  // Bajada EXTRA por encima del 25% general: a 50 se hacía insoportable, porque
  // vuela errática y no hay forma de anticiparla. A 32 sigue siendo la más rápida
  // del bestiario y la única que gana terreno si huyes en línea recta, pero da
  // tiempo a verla llegar.
  arpia:      { sprite:'arpia',      rol:'rapido',    xp:5, vida:70,    velocidad:32, danyo:8,  radio:5.7,  masa:2.2,  vuela:true,  inmuneEmpuje:false, movimiento:'revoloteo' },

  // --- Distancia: los que NO matan por contacto ---------------------------
  //
  // `ataque` es lo que convierte a un enemigo en amenaza a distancia. Hasta ahora
  // TODO el bestiario mataba pegándose a ti, y eso hace que solo exista una
  // pregunta: cuánta gente tengo encima. Con enemigos que disparan hay que mirar
  // la pantalla entera, y además aparece una decisión nueva: los disparos SE
  // PUEDEN DESTRUIR con cualquier arma, así que un proyectil que viene se puede
  // esquivar o reventar.
  //
  // Solo lo llevan los poderosos. La masa nunca dispara: si la carne de cañón
  // tuviera alcance, no habría ningún sitio seguro y el mapa dejaría de importar.
  //
  //   danyo       daño del proyectil al jugador
  //   cadencia    segundos entre disparos
  //   alcance     a partir de aquí deja de disparar (y nunca dispara desde fuera
  //               de la pantalla: sería un golpe llegado de la nada)
  //   velocidad   la del proyectil. Lenta a propósito en los grandes: un disparo
  //               que no se puede ver venir no es un ataque, es un impuesto
  //   proyectiles + dispersion   abanico, en grados entre uno y otro
  //   vida        impactos que aguanta antes de romperse
  medusa:     { sprite:'medusa',     rol:'distancia', xp:8, vida:160,   velocidad:8,  danyo:7,  radio:6.1,  masa:3.5,  vuela:false, inmuneEmpuje:false, movimiento:'acecho',
                // ESCUPITAJO. Verde de veneno con el corazón claro y una cola
                // de gotas que se deshace por detrás (ver Disparos.dibujar):
                // lo que sale de la boca de una medusa es líquido, y un líquido
                // lanzado se separa en el aire.
                ataque: { danyo:12, cadencia:2.8, alcance:190, velocidad:78, proyectiles:1, dispersion:0, radio:4.5, color:'#6cc93a', estela:'#3f8a22', nucleo:'#dcf7a8', vida:1, spriteReventon:'reventonVeneno',
                          // Y DIBUJADO por Sergio (septiembre de 2026): la gota de veneno con
                          // su cola. El color, la estela y el núcleo se quedan para el reventón
                          // y por si faltara la hoja (ver entidades/disparo.js).
                          spriteDisparo:'disparoMedusa' },
                // Muere en el mismo verde con el que dispara: lo que le sale del
                // cuerpo es lo que llevaban sus púas, y eso se lee sin leer nada.
                restos:'veneno' },

  // --- Tanques: cuestan de verdad, y no son jefes -------------------------
  // Cuarenta veces una serpiente. Con el arsenal del minuto 8 son varios
  // segundos de fuego concentrado, y ese es el punto: mientras le pegas a un
  // cíclope, el resto de la oleada te está rodeando.
  // El CÍCLOPE ya no es solo un muro que pega al tocarlo: levanta una roca y la
  // estampa contra el suelo donde estás. `tipo:'sismo'` no vuela hacia ti como un
  // proyectil —marca un círculo en el suelo, avisa, y revienta—, así que no se
  // puede destruir en el aire: se esquiva saliendo del círculo.
  //
  // Es el enemigo que obliga a MOVERSE aunque le estés dando. Con daño solo por
  // contacto, un cíclope se resolvía quedándose a dos pasos y disparando.
  // AJUSTADO tras jugarlo: radio 46 no tenía comparación en el resto del
  // bestiario (el propio cuerpo del cíclope mide 11.8 de radio; hasta las
  // charcas de fuego de Cerbero son 15-18) y encima apuntaba siempre al
  // pixel exacto del jugador, así que un único sismo cubría casi cualquier
  // intento de esquivarlo en el sitio. 46->30 de radio, 34->24 de daño, y
  // `azarObjetivo` (entidades/enemigo.js) hace que una vez de cada tres el
  // sismo caiga en un punto al azar de la pantalla en vez de sobre el
  // jugador: sigue habiendo que estar atento, pero deja de ser una trampa
  // perfecta cada vez.
  //
  // SEGUNDA REBAJA, jugándolo otra vez: 30 -> 22,5, un cuarto menos. Treinta
  // seguía siendo un círculo del que no se sale andando si te pilla en el sitio
  // equivocado, y con varios cíclopes a la vez el suelo era casi todo zona de
  // impacto. A 22,5 el aviso de 0,85 s da de sobra para salirse: el sismo pasa
  // de castigar dónde estabas a castigar quedarse quieto, que es lo que se le
  // pedía desde el principio.
  ciclope:    { sprite:'ciclope',    rol:'tanque',    xp:45, vida:950,   velocidad:7,  danyo:30, radio:9.4, masa:20.0, vuela:false, inmuneEmpuje:true,  movimiento:'directo',
                // `tonos`: la rampa del aviso, del canto al centro. Seis pasos
                // de arena clara a brasa oscura, que es lo que hace el suelo
                // cuando va a reventar. Van escritos y no interpolados en
                // caliente para no crear cadenas dentro del bucle de dibujado
                // (ver el sismo en entidades/disparo.js).
                ataque: { tipo:'sismo', danyo:24, cadencia:4.2, alcance:230, aviso:0.85, radio:22.5, azarObjetivo:0.33, color:'#c98a3a',
                          tonos:['#e8c894','#d8a95e','#c98a3a','#a86524','#7d4415','#52290c'],
                          spriteReventon:'reventonTierra',
                          // La roca que vuela de la mano al círculo, dibujada por Sergio.
                          spritePiedra:'rocaCiclope' } },
  minotauro:  { sprite:'minotauro',  rol:'tanque',    xp:24, vida:520,   velocidad:15, danyo:21, radio:8.7, masa:14.0, vuela:false, inmuneEmpuje:false, movimiento:'acecho'    },

  // --- Élite: suelta cofre garantizado ------------------------------------
  // La mantícora dispara el abanico de tres púas que pedía la sección 10 del
  // plan. Desde lejos y en abanico: es lo que la convierte en un enemigo al que
  // hay que acercarse con cuidado, en vez de un saco de vida al que rodear.
  manticora:  { sprite:'manticora',  rol:'elite',     xp:120, vida:2600,  velocidad:28, danyo:13, radio:12, masa:30.0, vuela:true,  inmuneEmpuje:false, movimiento:'orbita',  cofre:true, persistente:true,
                // BOLA DE FUEGO. Mismo mecanismo que el escupitajo de la
                // medusa y a propósito: la cola de gotas vale igual para un
                // líquido que para algo que arde soltando lo que le sobra. Lo
                // que las separa es el color — aquí naranja con el corazón
                // amarillo pálido y el rastro rojo apagándose.
                ataque: { danyo:14, cadencia:2.5, alcance:260, velocidad:105, proyectiles:3, dispersion:16, radio:4, color:'#ff8a1a', estela:'#c43a08', nucleo:'#fff0a8', vida:1, spriteReventon:'reventonLlama',
                          // Y la bola de fuego dibujada, como el escupitajo de la medusa.
                          spriteDisparo:'disparoManticora' } },

  // Serpiente dorada (sección 11 del plan): la SEGUNDA vía de las evoluciones.
  // Variante de color de la serpiente, así que no cuesta ni un PNG.
  //
  // CORREGIDA tras jugarla. Iba a 78 sobre los 85 del jugador y la sensación era
  // mala: se pasaba la aparición entera escapándose, y alcanzarla dependía de
  // arrinconarla, no de decidir nada. Ahora es al revés y sigue la regla de los
  // especiales — misma velocidad que la serpiente corriente, todo lo demás por
  // las nubes:
  //
  //   velocidad 11  — uno por encima de la serpiente básica. Se la alcanza
  //                   andando, sin perseguirla.
  //   vida 1400     — casi noventa veces la serpiente de la que sale, y más que
  //                   dos cíclopes. AQUÍ está el reto: no es cazarla, es aguantar
  //                   plantado el tiempo que cuesta tumbarla mientras la oleada
  //                   sigue llegando. Esa es la decisión que plantea el cofre.
  //   danyo 2       — huye, no muerde. Si además pegara, quedarse a matarla sería
  //                   un castigo y nadie lo haría.
  //
  // `persistente` sigue haciendo falta: aunque se aleje despacio, se aleja.
  serpienteDorada: { sprite:'serpienteDorada', spriteBase:'serpiente', tinte:'#e8b73a',
                     rol:'elite', especial:'serpiente', xp:70, vida:1400, velocidad:11, danyo:2,
                     radio:2.9, masa:10.0,
                     vuela:false, inmuneEmpuje:false, movimiento:'huida', cofre:true, persistente:true },

  // Gárgola de bronce: el segundo especial, para que el recurso no sea "la
  // serpiente dorada y nada más". Misma gárgola, mismo vuelo errático, misma
  // velocidad, pero aguanta como un tanque y suelta cofre. No huye: esta se te
  // queda encima, así que el dilema es el contrario que con la dorada —no hay
  // que ir a buscarla, hay que sobrevivir a ella mientras la tumbas.
  gargolaBronce:   { sprite:'gargolaBronce', spriteBase:'gargola', tinte:'#c9822f',
                     rol:'elite', especial:'gargola', xp:90, vida:1800, velocidad:16, danyo:12,
                     radio:5.2, masa:14.0,
                     vuela:true, inmuneEmpuje:false, movimiento:'revoloteo', cofre:true, persistente:true, restos:'piedra' },

  // === DORADOS: la versión que suelta tesoro ================================
  //
  // Cualquier enemigo puede tener su dorado. Son variantes de color con la MISMA
  // velocidad que su original —la regla de los especiales— pero muchísima más
  // vida, mucha más experiencia y un cofre garantizado.
  //
  // Aparecen poco, y los de los enemigos poderosos aparecen TARDE: ver un
  // legionario dorado en el minuto 3 sería ver un muro imposible; verlo en el 11,
  // cuando ya tienes arsenal, es una oportunidad. La escala de aparición está en
  // datos/niveles/merida.js.
  //
  // La serpiente dorada de más arriba es el primero de la familia y se queda
  // donde está por su papel especial: es la única que HUYE.
  gargolaDorada:    { sprite:'gargolaDorada', spriteBase:'gargola', tinte:'#e8c23a',
                      rol:'elite', especial:'gargola', xp:110, vida:2000, velocidad:16, danyo:7,
                      radio:5.2, masa:12.0,
                      vuela:true, inmuneEmpuje:false, movimiento:'revoloteo', cofre:true, persistente:true, restos:'piedra' },
  legionarioDorado: { sprite:'legionarioDorado', spriteBase:'legionario', tinte:'#e8c23a',
                      rol:'elite', especial:'legionario', xp:150, vida:3200, velocidad:13, danyo:12,
                      radio:6.2, masa:18.0,
                      vuela:false, inmuneEmpuje:false, movimiento:'directo', cofre:true, persistente:true },
  gladiadorDorado:  { sprite:'gladiadorDorado', spriteBase:'gladiador', tinte:'#e8c23a',
                      rol:'elite', especial:'gladiador', xp:190, vida:4000, velocidad:24, danyo:14,
                      radio:7, masa:22.0,
                      vuela:false, inmuneEmpuje:false, movimiento:'orbita', cofre:true, persistente:true },
  minotauroDorado:  { sprite:'minotauroDorado', spriteBase:'minotauro', tinte:'#e8c23a',
                      rol:'elite', especial:'minotauro', xp:280, vida:6500, velocidad:15, danyo:22,
                      radio:8.7, masa:40.0,
                      vuela:false, inmuneEmpuje:false, movimiento:'acecho', cofre:true, persistente:true },

  // --- Jefes --------------------------------------------------------------
  // La velocidad y el daño de contacto de los jefes son provisionales: el plan
  // solo les fija vida, sprite y radio porque su amenaza real está en las fases
  // de patrón, que llegan en la Fase 6. Estos valores solo sirven para que se
  // puedan invocar y probar antes.
  //
  // EL JEFE FINAL DEL NIVEL 1 CAMBIA: la Hidra del plan la sustituye LA LOBA
  // CAPITOLINA con los gemelos, por decisión de Sergio. Y es mejor decisión que
  // la del plan: la hidra es un monstruo griego genérico que podría cerrar
  // cualquier nivel de cualquier juego; la loba amamantando a Rómulo y Remo es
  // LA imagen de Roma, y verla deformada en algo monstruoso cierra un nivel que
  // se llama Emerita Augusta y transcurre en un anfiteatro romano.
  //
  // El diseño que sostiene esa imagen (para la Fase 6): la loba pelea con los
  // dos gemelos colgados. Mientras siga alguno vivo, ella se regenera —están
  // mamando de ella— así que hay que arrancárselos primero, y cada vez que cae
  // uno, ella se enfurece. Es el control de DPS que el plan pedía para la hidra,
  // pero contado con una imagen en vez de con una regla.
  //
  // LA PARTIDA SE AMPLÍA A 30 MINUTOS (petición de Sergio) y hacía falta un
  // segundo jefe intermedio para el minuto 20, entre Cerbero (10) y la Loba
  // (30, ahora jefe final de verdad). La Hidra vuelve para ese hueco: no se
  // sustituye a nadie, se recupera un sprite que llevaba desde la Fase 1 sin
  // usar. Ver el diseño de sus dos rasgos (veneno constante y una furia de una
  // sola vez a media vida) en datos/jefes.js.
  //
  // Los tres jefes escalan en vida, daño y radio de Cerbero a Hidra a Loba: el
  // que entra más tarde tiene que imponer más que el anterior.
  //
  // Sus MASAS son enormes a propósito: el empuje por daño es inverso a la masa,
  // así que un jefe apenas se inmuta y una serpiente sale despedida. Ver el
  // comentario de `danyar` en entidades/enemigo.js.
  // AJUSTADO tras jugarlo: quitaba demasiada vida por contacto y de golpe con
  // el cono de fuego, y a la vez se sentía corto de vida para ser el primer
  // jefe. 34->26 de daño de contacto, 9000->13000 de vida. El resto del
  // ajuste —charcos de fuego más pequeños y con más aviso— vive en
  // datos/jefes.js, junto a su propio comportamiento.
  //
  // SEGUNDA PASADA tras jugarlo de nuevo: 26 por contacto, sin telegrafía —es
  // el daño de contacto genérico del motor, no un ataque especial— y con el
  // radio de Cerbero (21, el más grande del juego salvo la Loba) resultaba en
  // "casi imposible no estar tocándolo" mientras se pelea cuerpo a cuerpo:
  // ~52/s sostenidos son medio jugador cada segundo. 26->15 para que el
  // contacto duela pero no mate solo por quedarse cerca; la carga (embestida,
  // más abajo en datos/jefes.js) sigue siendo el pico de daño real del jefe.
  // LO QUE DEJA UN JEFE AL CAER, y va aquí porque es un dato del bicho, no una
  // regla del motor: entidades/enemigo.js solo lee estos dos campos y no sabe
  // quién es Cerbero ni quién la Loba.
  //
  //   `cofreDorado` — suelta un cofre ESPECIAL garantizado, el de tres niveles.
  //     Lo llevan los dos jefes de en medio (minutos 10 y 20). Un jefe que tarda
  //     dos minutos en caer no puede pagar lo mismo que un élite, y el cofre
  //     normal sale de un sorteo al 10%: tocaba dejarlo al azar justo en el
  //     único combate que no es azar.
  //
  //   `denariosAlMorir` — denarios al progreso META, que sobreviven a la
  //     partida. Es el premio del jefe FINAL: cuando cae la Loba la partida se
  //     acaba, así que un cofre de niveles no le serviría a nadie —no queda
  //     partida donde gastarlo—. Lo único que vale a esas alturas es lo que te
  //     llevas a mañana.
  cerbero:    { sprite:'cerbero',    rol:'jefe',      xp:600,  vida:13000, velocidad:34, danyo:15, radio:15.8,   masa:80.0,  vuela:false, inmuneEmpuje:true,  movimiento:'directo', cofreDorado:true },
  hidra:      { sprite:'hidra',      rol:'jefe',      xp:1000, vida:16000, velocidad:29, danyo:36, radio:21,   masa:100.0, vuela:false, inmuneEmpuje:true,  movimiento:'directo', cofreDorado:true },
  // UN 50% MÁS RÁPIDOS (Sergio, 21/09/2026): 18/15/12 -> 27/23/18. Eran los
  // más lentos del bestiario con diferencia y en el centro comercial, con
  // rodeos por pasillos, no llegaban nunca. Los gemelos no se tocan: son
  // escolta, no jefe, y ya iban a 30.
  // Y OTRO 25% (Sergio, mismo día, tras jugarlo): 27/23/18 -> 34/29/23. La
  // Loba queda ya a la altura de un gladiador (24) y Cerbero por encima de la
  // arpía (32): un jefe tiene que alcanzarte si te limitas a correr.
  // `directo` y no `acecho`: el acecho se para y mira antes de embestir, y
  // Sergio quiere a los jefes persiguiendo sin descanso. Sus embestidas ya
  // las lleva sistemas/jefes.js.
  loba:       { sprite:'loba',       rol:'jefe',      xp:1500, vida:26000, velocidad:23, danyo:38, radio:23.6, masa:120.0, vuela:false, inmuneEmpuje:true,  movimiento:'directo', denariosAlMorir:1000 },
  // `escolta` es lo que sistemas/jefes.js vigila para saber cuándo cae un
  // gemelo: mientras alguno siga vivo, la loba regenera; cada vez que uno cae,
  // se enfurece. Ver datos/jefes.js.
  // velocidad 25->30 (petición de Sergio jugándolo): rondaba la de un
  // gladiador (24); ahora queda por delante de todo el bestiario base salvo
  // la arpía (32), acorde a ser la escolta del jefe final.
  gemelo:     { sprite:'gemelo',     rol:'jefe',      xp:200,  vida:3000,  velocidad:30, danyo:18, radio:7.1,  masa:16.0,  vuela:false, inmuneEmpuje:false, movimiento:'zigzag', escolta:true },

  // --- Objetos destruibles del escenario -----------------------------------
  // Las antorchas del nivel (sistemas/obstaculos.js las coloca junto a
  // columnas y estatuas) NO son decoración pura: se pueden romper a golpes.
  // En vez de montar un sistema de daño aparte, se dan de alta como un
  // enemigo más —quieto, sin ataque, sin daño de contacto— para heredar GRATIS
  // todo lo que ya existe: cualquier arma las alcanza (todas apuntan a
  // sistemas/colisiones.js sobre la rejilla de enemigos), el choque sólido
  // contra jugadores y enemigos sale del mismo solucionador de separación de
  // siempre (con `inmuneEmpuje` y masa alta no las mueve nadie), y morir ya
  // sabe soltar algo y avisar con partículas. `esObjeto` es la única marca
  // nueva: le dice a `Enemigos.danyar` (entidades/enemigo.js) que esto no es
  // una baja de verdad —nada de gema de XP ni de sumar al contador de
  // enemigos eliminados— y que reparta un consumible al azar en vez de sangre.
  // `vida:0` en `xp` porque no da experiencia; `radio` sale de la misma
  // fórmula que el resto de la decoración (sección 10 del plan).
  antorcha1:  { sprite:'antorcha1',  rol:'objeto', xp:0, vida:30, velocidad:0, danyo:0, radio:2.7, masa:999, vuela:false, inmuneEmpuje:true, movimiento:'directo', esObjeto:true, restos:'ceniza' },
  antorcha2:  { sprite:'antorcha2',  rol:'objeto', xp:0, vida:30, velocidad:0, danyo:0, radio:2.7, masa:999, vuela:false, inmuneEmpuje:true, movimiento:'directo', esObjeto:true, restos:'ceniza' },

  // LAS MÁQUINAS EXPENDEDORAS DEL NIVEL 2. Mismo trato que las antorchas
  // —objeto con vida, sin XP, suelta un consumible al romperse— con tres
  // diferencias: aguantan bastante más (una máquina no es una tea), su radio
  // es el de un armatoste de 24 de ancho, y al caer revientan en cristal
  // (`restos`) con su reventón de chispas y vidrio (`spriteReventon`). Dónde
  // van y qué queda cuando se rompen lo lleva sistemas/expendedoras.js.
  expendedora1: { sprite:'expendedora1', rol:'objeto', xp:0, vida:140, velocidad:0, danyo:0, radio:11, masa:999, vuela:false, inmuneEmpuje:true, movimiento:'directo', esObjeto:true, restos:'cristal', spriteReventon:'reventonChatarra', radioReventon:24 },
  expendedora2: { sprite:'expendedora2', rol:'objeto', xp:0, vida:140, velocidad:0, danyo:0, radio:11, masa:999, vuela:false, inmuneEmpuje:true, movimiento:'directo', esObjeto:true, restos:'cristal', spriteReventon:'reventonChatarra', radioReventon:24 },
  expendedora3: { sprite:'expendedora3', rol:'objeto', xp:0, vida:140, velocidad:0, danyo:0, radio:11, masa:999, vuela:false, inmuneEmpuje:true, movimiento:'directo', esObjeto:true, restos:'cristal', spriteReventon:'reventonChatarra', radioReventon:24 },
  expendedora4: { sprite:'expendedora4', rol:'objeto', xp:0, vida:140, velocidad:0, danyo:0, radio:11, masa:999, vuela:false, inmuneEmpuje:true, movimiento:'directo', esObjeto:true, restos:'cristal', spriteReventon:'reventonChatarra', radioReventon:24 }
};

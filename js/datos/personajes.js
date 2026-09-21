// Los cuatro personajes jugables. DATOS PUROS, cero lógica.
//
// `sprite` es el id del atlas. `arma` es SU arma, la que lleva siempre y la que
// nadie más puede llevar: en cooperativo eso garantiza que los cuatro arrancan
// distintos, y el sorteo de subida de nivel se encarga de que sigan sin
// repetirse ni las armas ni los objetos.
//
// Elegidas por Sergio, y cada una define una forma de jugar distinta: Eric va
// pegado con los escudos girando, Vicky tiene que meterse en el montón para
// barrer con la katana, Lucy abre pasillo a bocajarro y Sara no apunta a nada.
//
// `mods` son multiplicadores sobre las estadísticas base de la sección 6 del
// plan (vida 100, velocidad 85, recogida 40). Se aplican al crear el personaje,
// antes que cualquier pasivo. Se han dejado suaves a propósito: la identidad de
// cada uno tiene que venir del arma inicial, que es lo que cambia cómo juegas,
// no de un 15% de vida que no se nota.

// `coste` es lo que cuesta desbloquearlo en la tienda de personajes.
//
// LOS CUATRO ESTÁN A CERO, es decir, gratis y desbloqueados desde el principio.
// Es una decisión de Sergio que sigue en pie: sus hijas ya juegan con Lucy,
// Sara y Vicky, y poner precio ahora sería quitarles personajes que ya tienen.
// La sección de la tienda existe igualmente, preparada, y convertir cualquiera
// en comprable es poner aquí un número mayor que cero — no hay que tocar ni la
// tienda ni el progreso.
export const PERSONAJES = {
  eric: {
    nombre: 'Eric',
    sprite: 'eric',
    descripcion: 'Coraje y Corazón.',
    arma: 'scutum',
    coste: 0,
    mods: { vidaMaxima: 1.15, velocidad: 0.95, radioRecogida: 1.0 }
  },
  lucy: {
    nombre: 'Lucy',
    sprite: 'lucy',
    descripcion: 'Divierte, sonríe, y sigue pintándote los labios.',
    // LA RECORTADA, no la pistola. Cambia por completo cómo se juega con ella:
    // la pistola dispara sola al más cercano desde donde estés, y la recortada
    // tiene 82 de alcance —hay que ir— a cambio de nueve perdigones en un cono
    // de 78 grados que abre pasillo.
    //
    // Encaja con sus `mods`, que ya eran los de un personaje frágil y rápido:
    // poca vida obliga a no quedarse y la velocidad es lo que te saca después de
    // haber entrado. Con la pistola esos números no pedían nada; con la
    // recortada son el arma.
    arma: 'recortada',
    coste: 0,
    mods: { vidaMaxima: 0.85, velocidad: 1.15, radioRecogida: 1.0 }
  },
  sara: {
    nombre: 'Sara',
    sprite: 'sara',
    descripcion: 'A veces, perderse en la sombra es la única forma de descubrir la luz que llevas dentro.',
    arma: 'campoElectrico',
    coste: 0,
    mods: { vidaMaxima: 1.0, velocidad: 1.0, radioRecogida: 1.45 }
  },
  vicky: {
    nombre: 'Vicky',
    sprite: 'vicky',
    descripcion: 'La fuerza de voluntad lo es todo en esta vida, sin ella nos rendiríamos en la primera caída.',
    arma: 'katana',
    coste: 0,
    mods: { vidaMaxima: 0.95, velocidad: 1.05, radioRecogida: 1.0 }
  },

  // --- LAS CUATRO DE PAGO ----------------------------------------------------
  //
  // YA DIBUJADAS. Estos cuatro huecos existían antes de que hubiera arte, con
  // arte prestado y nombres de relleno —Quinto era Eric con otro nombre, Livia
  // era Lucy— y `provisional: true` para que la pantalla de selección lo dijera
  // en voz alta. Sergio las ha dibujado y los nombres de relleno se han ido con
  // el arte prestado; lo que NO se ha tocado es el arma, los `mods` y el precio,
  // que ya estaban puestos y jugados.
  //
  // De `sprite` cuelga TODO el arte —el muñeco del mundo, el retrato de la
  // ficha, la cara del HUD y el ataúd— porque los cuatro salen del mismo id del
  // atlas. Ver `personaje` en entidades/jugador.js.
  //
  // Las cuatro tienen ya su ataúd propio (`<Nombre>_ataud.png`, 21/09/2026),
  // que en cooperativo es lo que dice a quién hay que ir a levantar sin leer
  // un nombre. Hasta entonces caían sobre un sarcófago genérico provisional,
  // que se retiró ese mismo día.
  //
  // EL PRECIO SUBE CON LA LISTA (1500 / 2500 / 3500 / 5000). Una partida deja
  // unos dos mil denarios, así que el primero cae en la segunda o tercera y el
  // último se nota. Están por encima de la mascota más cara —1500— a propósito:
  // un héroe cambia con qué juegas, una mascota te da un porcentaje.
  helen: {
    nombre: 'Helen',
    sprite: 'helen',
    descripcion: 'Nunca falla el primer tiro. El segundo tampoco.',
    // Osito Dinamito: suelta juguetes con la mecha encendida que salen
    // corriendo en zigzag a buscar al más cercano. Se juega COLOCÁNDOSE —el
    // osito apunta por ti, pero tarda en llegar—, que con su vida baja y su
    // velocidad alta es justo lo que pide: soltar la camada y no estar donde
    // reviente.
    arma: 'ositoDinamito',
    coste: 1500,
    mods: { vidaMaxima: 0.9, velocidad: 1.1, radioRecogida: 1.15 }
  },
  julie: {
    nombre: 'Julie',
    sprite: 'julie',
    descripcion: 'El fuego no pregunta, y ella tampoco.',
    // Lanzallamas: 78 de alcance y sin descanso. Es el reverso de Helen —hay
    // que meterse dentro y quedarse—, y por eso lleva la vida más alta de los
    // ocho y la velocidad más baja.
    arma: 'lanzallamas',
    coste: 2500,
    mods: { vidaMaxima: 1.2, velocidad: 0.9, radioRecogida: 1.0 }
  },
  say: {
    nombre: 'Say',
    sprite: 'say',
    descripcion: 'Cada libro que abre ya no vuelve a cerrarse.',
    // Códice Infernal: un libro orbitando al empezar y diez al nivel 10, cada
    // vez más rápidos. Se juega colocándose, no disparando, y con la recogida
    // alta para que el nivel llegue sin tener que ir a por las gemas — que en
    // ella no es un lujo, es su arma: cada subida es un libro más.
    //
    // Los Satélites, que llevaba antes, se quedan en el catálogo como un arma
    // más del sorteo. Eran suyos porque eran el orbital que había.
    arma: 'codiceInfernal',
    coste: 3500,
    mods: { vidaMaxima: 1.1, velocidad: 1.0, radioRecogida: 1.2 }
  },
  sofi: {
    nombre: 'Sofi',
    sprite: 'sofi',
    descripcion: 'Tira una, tira diez. Alguna le da a alguien.',
    // RainbowMazas: mazas al azar, una por nivel y cada una de su color, que se
    // llevan por delante a dos enemigos y se deshacen. No apunta a nada, así
    // que su arma no premia la puntería sino el bulto: cuanta más horda
    // alrededor, menos mazas se van a donde no hay nadie.
    //
    // Encaja con sus `mods`, que ya eran los de alguien rápido y frágil: para
    // que haya bultos alrededor hay que estar dentro, y la velocidad es lo que
    // te saca cuando ya no queda nada que lanzar.
    arma: 'rainbowMazas',
    coste: 5000,
    mods: { vidaMaxima: 0.9, velocidad: 1.2, radioRecogida: 1.0 }
  }
};

// Orden en el que entran los jugadores al sumarse a la partida, y TAMBIEN el
// orden de la tira del carrusel de la pantalla de selección (ver ui/pantallas.js).
//
// LOS GRATIS PRIMERO, y no es cosmético: la partida en red reparte los puestos
// con `i % 4` cuando nadie ha elegido (ver `jugar` en red/consola.js), así que
// las cuatro primeras casillas tienen que ser las que todo el mundo tiene.
export const ORDEN_PERSONAJES = ['eric', 'lucy', 'sara', 'vicky',
                                 'helen', 'julie', 'say', 'sofi'];

import { ESCALA_ARTE } from '../core/constantes.js';
import { Pool } from '../core/pool.js';
import { Recursos } from '../core/recursos.js';
import { enemigosEnRadio } from '../sistemas/colisiones.js';
import { sen, cos, hipot } from '../core/mate.js';
import { RejillaMapa } from '../sistemas/rejillaMapa.js';

// Zonas de daño: charcos, trampas, auras, explosiones y ondas expansivas.
//
// Un solo pool para todas porque, por debajo, son lo mismo: un círculo que hace
// daño a lo que tiene dentro durante un tiempo. Lo que cambia es CÓMO trata ese
// círculo al enemigo, y eso son tres modos:
//
//   'zona'  — radio fijo, daña por TICS cada `intervalo`. Charcos, trampas,
//             auras. Si `seguir` apunta a un jugador, se mueve con él.
//   'onda'  — el radio CRECE de `radioIni` a `radio` durante su vida y daña a
//             cada enemigo UNA sola vez, al pasarle por encima. Explosiones y
//             ondas expansivas.
//
// La distinción importa: una explosión que dañara por tics mataría lo que pilla
// dentro varias veces en el mismo instante, y un charco que dañara una sola vez
// dejaría de ser un charco.

const MAX_ALCANZADOS = 256;

// CALCOMANÍAS DE SUELO. Las zonas de modo 'zona' pueden llevar un dibujo en vez
// del círculo de color. Salen todas de una misma hoja plana (assets/efectos/
// zonas.png, ver herramientas/procesar-assets.ps1), así que la zona guarda
// solo el ÍNDICE de su fotograma y el dibujado hace un drawImage con recorte.
//
// El índice se resuelve UNA vez, al crear la zona, y no por frame: buscar una
// cadena en un Map sesenta veces por segundo por charco es justo el tipo de
// trabajo que este motor evita en todas partes.
// Se exportan la hoja y el resolutor porque los charcos de los JEFES no viven
// en este pool —son `Disparos`, que es lo que hace daño al jugador— pero salen
// de la misma hoja y son la misma clase de cosa: una mancha en el suelo. Ver
// entidades/disparo.js.
export const HOJA_ZONAS = 'efectosZonas';
let huecos = null;

export function huecoDe(id) {
  if (huecos === null) {
    huecos = new Map();
    const meta = Recursos.meta(HOJA_ZONAS);
    // Sin hoja no hay reparto: el mapa se queda vacío y todo cae al círculo
    // trazado de siempre. Es la misma red que los placeholders del atlas — el
    // juego tiene que seguir siendo jugable sin un solo PNG.
    if (meta && meta.orden && Recursos.imagen(HOJA_ZONAS)) {
      for (let i = 0; i < meta.orden.length; i++) huecos.set(meta.orden[i], i);
    }
  }
  const h = huecos.get(id);
  return h === undefined ? -1 : h;
}

function crearZona() {
  return {
    x: 0, y: 0,
    radio: 0, radioIni: 0, radioActual: 0,
    vida: 0, vidaMax: 1,
    danyo: 0, intervalo: 0, reloj: 0,
    empuje: 0, ralentiza: 0,
    modo: 'zona',
    sello: 0,                 // para que una onda no golpee dos veces
    seguir: null,             // jugador al que se pega (auras)
    // De quién es la zona, para apuntarle las bajas. Ver el campo del mismo
    // nombre en entidades/proyectil.js.
    duenyo: null,
    // El arma que la creó, para el recuento del resumen. Ver `danyar`.
    arma: null,
    // Cuánto se sube la zona sobre la posición de aquel al que sigue. La `y` de
    // un jugador es su LÍNEA DE PIES, así que una zona centrada ahí deja medio
    // cuerpo fuera por arriba; subiéndola media altura del sprite, la figura
    // entera queda dentro del área. Lo calcula quien la crea, porque es quien
    // sabe de qué sprite se trata.
    desvioY: 0,
    color: '#fff', relleno: 0.18,
    sprite: -1,               // fotograma en la hoja compartida; -1 = sin dibujo
    // Hoja propia: cuando el efecto tiene su PNG en vez de una celda de la hoja
    // compartida, aquí va su id del atlas y `sprite` se ignora.
    hoja: null,
    // Giro en radianes por segundo. 0 = quieto, que es lo normal: un charco no
    // gira. Lo usan los campos y auras, donde la rotación es lo que los hace
    // parecer vivos sin necesitar fotogramas.
    giro: 0,
    fase: 0,
    // MINA. `radioGatillo` es lo que hay que pisar para que salte; `radio` es
    // lo que revienta después, y es bastante mayor. `hojaOnda` es con qué se
    // dibuja ese reventón: se guarda al sembrarla porque al detonar ya no hay
    // arma a la que preguntárselo.
    radioGatillo: 0,
    hojaOnda: null,
    // ONDA QUE VA POR EL SUELO. Las ondas se dibujan por encima de todo porque
    // una explosión está en el AIRE y tiene que tapar lo que pilla debajo. Pero
    // no todas lo están: el Sismo es la tierra abriéndose, y una grieta que pasa
    // por delante de una columna de dos metros no se lee como una grieta.
    //
    // Con esto puesto, la onda se pinta con las calcomanías —entre el terreno y
    // las entidades— en vez de encima de la horda.
    enSuelo: false,
    // ZONA HECHA DE PIEZAS SUELTAS, en vez de una calcomanía estirada.
    //
    // Casi todas las zonas son una mancha: un charco de aceite es UNA cosa que
    // cubre un círculo, y se dibuja con un PNG escalado al radio. El Tribulus no
    // — son abrojos, piezas de hierro independientes tiradas por el suelo, y lo
    // que hay entre una y otra es suelo limpio.
    //
    // Con `hojaPieza` puesto, la zona se dibuja como `piezas` copias de ese
    // sprite repartidas por su círculo, cada una a tamaño fijo. Y LLEGAN
    // VOLANDO desde quien las lanzó: `origenX/origenY` es dónde estaba el
    // jugador al sembrarlas y `vuelo` lo que tardan en posarse.
    hojaPieza: null,
    piezas: 0,
    origenX: 0, origenY: 0,
    vuelo: 0,
    // ¿PARA LOS PROYECTILES ENEMIGOS? Casi todas sí: `Disparos.barrer` deshace
    // lo que toque cualquier arma del jugador, y esa es media idea de los
    // disparos enemigos —no estás obligado a esquivar, puedes limpiar el aire—.
    // Pero un charco es SUELO, y algo que vuela por encima de un charco no lo
    // toca. Ver entidades/disparo.js.
    bloquea: true,
    // SI DAÑA A TRAVÉS DE LAS PAREDES del nivel. Lo normal es que no: una
    // explosión o un charco no cruzan un muro, y a cada enemigo dentro del
    // radio se le pide línea de visión desde el centro de la zona. Lo llevan
    // a true las que van por debajo o por encima de las paredes —el Sismo, los
    // rayos que caen, el Grito de guerra, las minas—. Ver `atraviesaParedes`
    // en datos/armas.js.
    atraviesaParedes: false,
    // CUÁNTO TAPA su calcomanía, de 0 a 1. Sale de los datos del arma porque no
    // todas piden lo mismo: un charco de aceite y un aura pegada al cuerpo se
    // ven sobre fondos distintos y compiten con cosas distintas. Ver
    // OPACIDAD_ZONA, aquí abajo, para el porqué del valor por defecto.
    opacidad: 0,
    // PROPAGACIÓN. Fracción del radio con la que brota un charco hijo donde cae
    // un enemigo que estaba dentro. 0 = no se propaga, que es lo normal.
    //
    // El hijo nace SIEMPRE con `propaga` a cero, y eso no es un detalle de
    // ajuste sino lo que acota la cosa: con propagación heredada, un charco en
    // mitad de la horda se reproduciría mientras siga matando, y en dos segundos
    // el pool entero sería fuego. Una generación, y se acabó.
    propaga: 0,
    // Y cuántas veces le queda por prender. Una generación acota la CADENA,
    // esto acota la ANCHURA: sin ello, un charco plantado en mitad de la horda
    // deja un hijo por cada baja —medido en el banco: doce muertes, doce
    // charcos— y con cuatro charcos cada 1,6 s eso llena el pool y tapa la
    // pantalla de fuego. Tres brotes es que el incendio se note extenderse sin
    // que sustituya al suelo.
    brotes: 0
  };
}

// CUÁNTO TAPA UNA CALCOMANÍA DE ZONA, por defecto.
//
// Estaban al 92% y con nueve armas de área a la vez la pantalla acababa siendo
// una mancha: el charco tapaba el terreno, los cuerpos y los otros charcos. Una
// zona tiene que decir DÓNDE quema, no sustituir al suelo.
//
// Es EL número a tocar si se ven poco: subirlo devuelve la pantalla manchada,
// bajarlo hace que un charco de alquitrán sobre losa oscura desaparezca. Y se
// puede tocar arma por arma con `opacidad` en datos/armas.js, que es lo que
// usan las tres que se ven sobre fondo claro.
const OPACIDAD_ZONA = 0.40;

// Cuántas veces puede prender un mismo charco.
const BROTES_MAX = 3;

// Y por encima de esta ocupación del pool no se propaga nada. Las zonas son un
// recurso compartido: nueve armas de área tiran del mismo pool, y un incendio
// que se lo coma entero deja al resto del arsenal sin dibujar y sin dañar. El
// fuego cede antes que el arma de al lado.
const OCUPACION_MAXIMA = 0.75;

let contadorSello = 1;

// SE REINICIA CON EL POOL, al empezar cada partida.
//
// Es un contador de módulo que solo subía, así que dos partidas seguidas
// repartían sellos en rangos distintos. Para una sola partida da igual —lo que
// se compara son igualdades dentro de la misma tanda— pero deja el estado
// dependiendo de cuántas partidas lleves jugadas, y eso es justo lo que hace
// que "misma semilla, misma partida" deje de ser cierto.
function reiniciarSellos() { contadorSello = 1; }

export class Zonas {
  constructor(capacidad) {
    this.pool = new Pool(crearZona, capacidad);
    this._alcanzados = new Int32Array(MAX_ALCANZADOS);
  }

  get activas() { return this.pool.activos; }

  // ¿Cabe una mina en (x, y) sin pisar ninguna de las que ya hay? Lo pregunta
  // la siembra antes de plantar cada una: las minas se dibujan a TAMAÑO FIJO
  // —el `radioDibujo` del atlas, que no crece con el nivel— así que dos centros
  // a menos de un diámetro se solapan el dibujo, y un montón de chapas
  // superpuestas se lee como una sola. Y lo que cobra es la que pisas, no las
  // que hay debajo: apilarlas es tirar minas.
  //
  // Mira TODAS las minas vivas y no solo las de la tanda en curso, porque el
  // arma vuelve a sembrar cada recarga sobre el campo que ya está puesto.
  //
  // Recorrido lineal, sin hash espacial: son unas decenas de zonas vivas y esto
  // se pregunta un puñado de veces por recarga, no una vez por fotograma.
  minaLibre(x, y, separacion) {
    const items = this.pool.items;
    const n = this.pool.activos;
    const minimo = separacion * separacion;
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'mina') continue;
      const dx = z.x - x, dy = z.y - y;
      if (dx * dx + dy * dy < minimo) return false;
    }
    return true;
  }

  crear(def) {
    const z = this.pool.obtener();
    if (!z) return null;
    z.x = def.x; z.y = def.y;
    z.radio = def.radio;
    z.radioIni = def.radioIni || 0;
    z.radioActual = z.radioIni;
    z.vida = z.vidaMax = def.duracion;
    z.danyo = def.danyo;
    z.intervalo = def.intervalo || 0.4;
    // EL PRIMER TIC ESPERA A QUE LAS PIEZAS SE POSEN. Sin `vuelo` es 0 y entra
    // ya, que es lo de siempre. Con vuelo, los abrojos harían daño mientras
    // todavía van por el aire, y eso es exactamente la clase de mentira que
    // este motor evita: lo que se ve tiene que ser lo que mata.
    //
    // No toca la cadencia del arma: el vuelo son dos décimas sobre una zona que
    // dura entre tres y seis segundos y una recarga de tres.
    z.reloj = def.vuelo || 0;
    z.empuje = def.empuje || 0;
    z.ralentiza = def.ralentiza || 0;
    z.modo = def.modo || 'zona';
    z.seguir = def.seguir || null;
    z.duenyo = def.duenyo || null;
    z.arma = def.arma || null;
    z.color = def.color;
    z.relleno = def.relleno === undefined ? 0.18 : def.relleno;
    // Un efecto puede venir de la hoja compartida (una celda de un catálogo) o
    // traer su PNG propio. Se distingue por si `sprite` nombra una entrada del
    // atlas: si la nombra, es hoja propia; si no, se busca como celda.
    if (def.sprite && Recursos.meta(def.sprite)) {
      z.hoja = def.sprite;
      z.sprite = 0;
    } else {
      z.hoja = null;
      z.sprite = def.sprite ? huecoDe(def.sprite) : -1;
    }
    z.giro = def.giro || 0;
    z.fase = 0;
    z.radioGatillo = def.radioGatillo || 0;
    z.hojaOnda = (def.spriteOnda && Recursos.meta(def.spriteOnda)) ? def.spriteOnda : null;
    z.desvioY = def.desvioY || 0;
    z.enSuelo = !!def.enSuelo;
    z.hojaPieza = (def.hojaPieza && Recursos.meta(def.hojaPieza)) ? def.hojaPieza : null;
    z.piezas = def.piezas || 0;
    z.origenX = def.origenX === undefined ? def.x : def.origenX;
    z.origenY = def.origenY === undefined ? def.y : def.origenY;
    z.vuelo = def.vuelo || 0;
    z.bloquea = def.bloquea !== false;
    z.atraviesaParedes = !!def.atraviesaParedes;
    z.opacidad = def.opacidad || OPACIDAD_ZONA;
    z.propaga = def.propaga || 0;
    z.brotes = z.propaga > 0 ? BROTES_MAX : 0;
    z.sello = contadorSello++;
    return z;
  }

  actualizar(dt, enemigos) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const z = items[k];
      z.vida -= dt;
      if (z.vida <= 0) { this.pool.liberarEn(k); continue; }   // sin avanzar k

      if (z.seguir) { z.x = z.seguir.x; z.y = z.seguir.y - z.desvioY; }

      // La fase de giro avanza con el PASO DE LÓGICA, no con el reloj: dt es
      // fijo, así que dos partidas con la misma semilla giran igual. Es la
      // misma regla que la sacudida de cámara y las fases de los disparos.
      if (z.giro !== 0) z.fase += z.giro * dt;

      const t = 1 - z.vida / z.vidaMax;      // 0 recién nacida, 1 al expirar
      // MINA ARMADA: no hace nada hasta que algo la pisa. No daña por tics, no
      // crece, solo mira. En cuanto entra un enemigo en su gatillo, detona.
      if (z.modo === 'mina') {
        z.radioActual = z.radioGatillo;
        if (enemigosEnRadio(enemigos, z.x, z.y, z.radioGatillo, this._alcanzados) > 0) {
          this._detonar(z);
        }
        k++;
        continue;
      }
      if (z.modo === 'onda') {
        // El radio crece deprisa al principio y frena al final: es lo que hace
        // que una explosión se sienta como un golpe y no como un globo.
        z.radioActual = z.radioIni + (z.radio - z.radioIni) * Math.sqrt(t);
        this._danyar(z, enemigos, true);
      } else {
        z.radioActual = z.radio;
        z.reloj -= dt;
        if (z.reloj <= 0) {
          z.reloj = z.intervalo;
          this._danyar(z, enemigos, false);
        }
      }
      k++;
    }
  }

  // La mina se convierte en onda EN SU SITIO. Ni se libera ni se pide otra
  // zona: mutar el objeto que ya está en el pool evita tocar la lista mientras
  // se la está recorriendo, que es la clase de cosa que rompe un bucle de
  // pool, y además no asigna nada. La mina y su explosión son la misma cosa en
  // dos momentos distintos, así que también es lo que mejor lo describe.
  _detonar(z) {
    z.modo = 'onda';
    z.radioIni = z.radio * 0.15;
    z.radioActual = z.radioIni;
    z.vida = z.vidaMax = 0.32;
    z.relleno = 0.3;
    z.hoja = z.hojaOnda;      // el dibujo pasa de ser la mina a ser el reventón
    z.sprite = z.hojaOnda ? 0 : -1;
    // Sello nuevo: una onda golpea UNA vez a cada enemigo, y el reparto de
    // sellos es lo que lo garantiza. Sin renovarlo, heredaría el de la mina.
    z.sello = contadorSello++;
  }

  // EL FUEGO SALTA AL QUE CAE DENTRO. Un charco hijo en el sitio exacto donde
  // ha muerto un enemigo, más pequeño y más corto que su padre.
  //
  // Se copia del padre en vez de pedirle los datos al arma, porque aquí ya no
  // hay arma: la zona lleva puesto todo lo que la define —daño, tics, color,
  // hoja, giro— y lo que cambia son tres números. Y se toma el objeto del pool
  // a mano, sin pasar por `crear`, para no volver a resolver el hueco del atlas
  // ni el resto de la ficha: es un clon, no una zona nueva.
  //
  // Nace después del índice que recorre `actualizar`, así que este mismo paso ya
  // hace su primer tic. Es lo correcto: el fuego prende en el instante en que
  // el cuerpo cae, no un frame más tarde.
  //
  // HAY QUE ESCRIBIR TODOS LOS CAMPOS, uno por uno, y no solo los que cambian.
  // El objeto sale del pool y trae puesto lo de la zona anterior que ocupó ese
  // hueco, así que un campo que no se escriba aquí se hereda de un charco que
  // no tiene nada que ver. Ya pasó con `opacidad` y `bloquea`: se añadieron a
  // `crear` y este clon se quedó atrás, y el hijo de un incendio podía salir
  // con la opacidad de un aura. Añadir un campo a `crearZona` obliga a añadirlo
  // aquí.
  _propagar(padre, x, y) {
    if (this.pool.activos >= this.pool.capacidad * OCUPACION_MAXIMA) return;
    const h = this.pool.obtener();
    if (!h) return;                    // pool lleno: se pierde y no pasa nada
    padre.brotes--;
    h.x = x; h.y = y;
    h.radio = h.radioActual = padre.radio * padre.propaga;
    h.radioIni = 0;
    // Más corto que el padre, y contado sobre lo que al padre le quedaba de
    // vida MÁXIMA, no de la que le resta: un charco moribundo tiene que poder
    // dejar un hijo que se vea.
    h.vida = h.vidaMax = padre.vidaMax * 0.55;
    h.danyo = padre.danyo;
    h.intervalo = padre.intervalo;
    h.reloj = 0;
    h.empuje = padre.empuje;
    h.ralentiza = padre.ralentiza;
    h.modo = 'zona';
    h.seguir = null;
    h.desvioY = 0;
    h.color = padre.color;
    h.relleno = padre.relleno;
    h.opacidad = padre.opacidad;
    h.bloquea = padre.bloquea;
    h.atraviesaParedes = padre.atraviesaParedes;
    h.enSuelo = padre.enSuelo;
    h.hojaPieza = padre.hojaPieza;
    h.piezas = padre.piezas;
    h.origenX = x; h.origenY = y;   // el hijo brota donde cae el cuerpo
    h.vuelo = 0;                    // y sin vuelo: no lo ha lanzado nadie
    h.sprite = padre.sprite;
    h.hoja = padre.hoja;
    h.giro = padre.giro;
    h.fase = 0;
    h.radioGatillo = 0;
    h.hojaOnda = null;
    h.propaga = 0;                     // una generación: ver `crearZona`
    h.brotes = 0;
    h.sello = contadorSello++;
  }

  _danyar(z, enemigos, unaVez) {
    const n = enemigosEnRadio(enemigos, z.x, z.y, z.radioActual, this._alcanzados);
    const items = enemigos.pool.items;
    // Si hay que mirar las paredes: solo en un nivel de recinto y solo para
    // las zonas que no las cruzan. Se decide una vez por zona, fuera del bucle.
    const paredes = RejillaMapa.activa && !z.atraviesaParedes;
    for (let i = 0; i < n; i++) {
      const e = items[this._alcanzados[i]];
      // La pared se mira ANTES del sello: un enemigo tapado hoy puede asomar
      // mañana, y con el sello ya puesto la onda no le daría al asomar.
      if (paredes && !RejillaMapa.lineaLibre(z.x, z.y, e.x, e.y)) continue;
      if (unaVez) {
        if (e.ultimoSello === z.sello) continue;
        e.ultimoSello = z.sello;
      }
      let dx = e.x - z.x;
      let dy = e.y - z.y;
      const d = hipot(dx, dy) || 1;
      // `danyar` devuelve true SOLO en el golpe que lo mata, así que sirve de
      // aviso de muerte con posición sin tener que inventar ninguno: el sistema
      // de zonas ya está mirando al enemigo justo cuando cae.
      const muerto = enemigos.danyar(e, z.danyo, dx / d, dy / d, z.empuje, z.duenyo, z.arma);
      if (muerto && z.propaga > 0 && z.brotes > 0) this._propagar(z, e.x, e.y);
      if (z.ralentiza > 0) e.frenado = Math.max(e.frenado, z.ralentiza);
    }
  }

  vaciar() { this.pool.vaciar(); reiniciarSellos(); }

  // Las zonas de este jugador, fuera. Mismo motivo y mismo recorrido hacia atrás
  // que `retirarDe` en entidades/proyectil.js, y aquí se nota más todavía: una
  // zona no se mueve ni caduca por alejarse, así que un charco de veneno de
  // alguien que lleva medio minuto en el suelo seguiría ahí, quieto y matando.
  retirarDe(duenyo) {
    if (!duenyo) return;
    const items = this.pool.items;
    for (let k = this.pool.activos - 1; k >= 0; k--) {
      if (items[k].duenyo === duenyo) this.pool.liberarEn(k);
    }
  }

  // EL DIBUJADO VA EN DOS CAPAS, Y NO ES UNA SUTILEZA DE ORDEN.
  //
  // Antes esto era un solo método que se llamaba después de las entidades, con
  // este motivo: los efectos tienen que leerse aunque haya ochocientos cuerpos
  // encima. El motivo sigue siendo cierto, pero el resultado era que un charco
  // de aceite se pintaba POR ENCIMA de los cuerpos, y un charco es una mancha
  // en el suelo: lo correcto es que se pise.
  //
  // Se resuelve partiendo la zona, no moviéndola entera:
  //
  //   dibujarSuelo — las zonas persistentes, entre el terreno y las entidades.
  //     Es la calcomanía: el aceite, el fuego, el campo. Se pisa.
  //   dibujarAire  — las ondas, por encima de todo: una explosión no está en el
  //     suelo y tiene que tapar lo que pilla debajo.
  //
  // El reparto era antes por RELLENO y CANTO, con el canto siempre arriba para
  // que la frontera del daño no quedara enterrada bajo la horda. Ya no hay
  // canto: ver el punto 3 de cada método.
  //
  // Y hay una segunda división, por `modo`, que sale sola: una explosión no
  // está en el suelo, está en el aire. Las ondas se quedan arriba enteras.

  // Capa de SUELO: el relleno de las zonas persistentes. Va justo encima del
  // terreno, antes que las gemas y que cualquier entidad.
  dibujarSuelo(ctx) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    // 1. Las que tienen calcomanía, en composición NORMAL.
    //
    // Normal y no 'lighter' por dos motivos. Uno, las láminas vienen sobre
    // blanco y no sobre negro, así que sumarlas lavaría la pantalla en vez de
    // encenderla. Y dos, una mancha en el suelo TAPA el suelo: sumar luz es lo
    // que hace un fuego, no lo que hace un charco de alquitrán.
    {
      // BASE TENUE BAJO LA CALCOMANÍA. La silueta de un charco no es un disco:
      // tiene entrantes, y por esos entrantes se ve suelo limpio DENTRO del
      // aro. Pero el aro es la zona de daño entera, así que ese suelo limpio
      // quema igual — y el jugador que mete el pie ahí lee que está a salvo.
      //
      // Un velo del color de la zona lo tapa. Va bajo a propósito: no tiene que
      // verse como un charco, solo tiene que impedir que dentro del aro haya un
      // solo píxel que parezca terreno normal. La calcomanía sigue siendo lo
      // que se ve; esto es la red debajo.
      //
      // 0.20 y no 0.14, que fue el primer valor: con el Rete —zarzas sobre gris
      // pálido, y que solo cubre el 78% del aro— el velo no se veía y quedaba
      // corona de suelo desnudo. Es EL número a tocar si el velo ensucia: subirlo
      // devuelve el disco lavado que la calcomanía vino a quitar.
      //
      // Y NO se pone bajo las hojas propias. El velo existe porque una celda
      // recortada de un catálogo tiene silueta irregular y deja entrantes; un
      // efecto con su PNG propio está dibujado para llenar su cuadro, así que
      // el velo solo añadiría un disco de color encima del suelo — y en un aura,
      // que está siempre en pantalla, eso se nota mucho más que en un charco que
      // dura cuatro segundos.
      ctx.save();
      for (let k = 0; k < n; k++) {
        const z = items[k];
        if (z.modo !== 'zona' || z.sprite < 0 || z.hoja || z.hojaPieza) continue;
        const t = z.vida / z.vidaMax;
        ctx.globalAlpha = (t > 0.25 ? 1 : t / 0.25) * 0.20;
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let k = 0; k < n; k++) {
        const z = items[k];
        // Las de piezas se han dibujado aparte, más abajo: no tienen calcomanía.
        if (z.modo !== 'zona' || z.sprite < 0 || z.hojaPieza) continue;
        // La hoja se resuelve por zona: puede ser la compartida —una celda de
        // un catálogo— o el PNG propio del efecto. Ver `crear`.
        const idHoja = z.hoja || HOJA_ZONAS;
        const img = Recursos.imagen(idHoja);
        const meta = Recursos.meta(idHoja);
        if (!img || !meta) continue;

        const t = z.vida / z.vidaMax;
        // Entra a plena opacidad y solo se apaga en el último cuarto de vida:
        // un charco no se desvanece mientras quema, desaparece cuando se
        // consume. Aparecer ya translúcido lo haría parecer un fantasma.
        // Cuánto tapa, por zona y no por igual: ver OPACIDAD_ZONA arriba y
        // `opacidad` en datos/armas.js.
        ctx.globalAlpha = (t > 0.25 ? 1 : t / 0.25) * z.opacidad;

        // CHARCO ANIMADO EN BUCLE. Una hoja con `bucle` trae un hervor cíclico
        // —el fotograma último enlaza con el primero por construcción, ver
        // Pirotecnia.Charco— y se recorre a `fps` fijos, no repartido sobre la
        // vida de la zona: un charco de 2,6 s y otro de 5 s tienen que hervir
        // al mismo ritmo, porque es el mismo líquido. Repartir sobre la vida
        // haría que el Alquitrán burbujeara a cámara lenta solo por durar más.
        //
        // El reloj sale del tiempo YA VIVIDO y no de un contador propio, así
        // que no hay estado nuevo que guardar ni que reproducir con la semilla.
        let hueco = z.sprite;
        if (meta.bucle && meta.frames > 1) {
          const vivido = z.vidaMax - z.vida;
          hueco = ((vivido * (meta.fps || 11)) | 0) % meta.frames;
        }

        // El margen de la celda, igual que en las ondas: la mancha llega al
        // radio de daño y lo que sobresale es el borde irregular. Sin esto la
        // calcomanía se dibujaría un 18% pequeña y volvería a dejar corona de
        // suelo limpio dentro de la zona, que es el defecto que retiró las
        // cinco calcomanías del intento anterior.
        const r = z.radioActual * (meta.margen || 1);

        // BLIT ESCALADO, y aquí sí se puede. El radio de una zona crece con el
        // nivel del arma —el Alquitrán va de 46 a 77— así que no existe un
        // tamaño horneado que sirva. La regla de dejar los blits a 1:1 se
        // escribió para el bucle de los setecientos enemigos; aquí son tres o
        // cuatro charcos en pantalla y el coste no se nota.
        if (z.giro !== 0) {
          // GIRAR es lo que da vida a un efecto de UNA sola imagen sin pedirle
          // fotogramas al artista. Y funciona porque el recorte se hizo
          // centrado en el centro de simetría del dibujo: al rotar, ninguna
          // parte entra o sale del cuadro.
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(z.fase);
          ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h,
                        -r, -r, r * 2, r * 2);
          ctx.restore();
        } else {
          ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h,
                        z.x - r, z.y - r, r * 2, r * 2);
        }
      }
      ctx.restore();
    }

    // 1.ter LAS ZONAS HECHAS DE PIEZAS.
    //
    // Un puñado de abrojos repartidos por el círculo, cada uno a tamaño fijo —
    // una pieza de hierro no crece porque el arma suba de nivel, lo que crece es
    // cuánto suelo cubren entre todas.
    //
    // EL REPARTO ES EN ESPIRAL ÁUREA, no al azar. Con azar puro salían corros y
    // un cuadrante vacío, y en una zona que se ve entera de un vistazo un hueco
    // así no se lee como reparto irregular sino como que ahí no hay nada — y en
    // una zona que hace daño, eso es información falsa. El ángulo áureo reparte
    // por el disco sin que ninguno se alinee con otro; es como se colocan las
    // pipas de un girasol.
    //
    // Y sale de la posición en la lista, no de un sorteo guardado: la zona no
    // necesita recordar dónde va cada pieza, se recalcula igual cada frame.
    {
      ctx.save();
      ctx.globalAlpha = 1;
      for (let k = 0; k < n; k++) {
        const z = items[k];
        if (z.modo !== 'zona' || !z.hojaPieza || z.piezas <= 0) continue;
        const img = Recursos.imagen(z.hojaPieza);
        const meta = Recursos.meta(z.hojaPieza);
        if (!img || !meta) continue;

        const aw = meta.w / ESCALA_ARTE, ah = meta.h / ESCALA_ARTE;
        const vivido = z.vidaMax - z.vida;
        const t = z.vida / z.vidaMax;
        // Se apaga en el último cuarto, como las calcomanías: los abrojos no se
        // desvanecen mientras pinchan, desaparecen cuando se acaban.
        const alfaZona = t > 0.25 ? 1 : t / 0.25;

        for (let i = 0; i < z.piezas; i++) {
          const ang = i * 2.39996;                       // ángulo áureo
          const dist = Math.sqrt((i + 0.5) / z.piezas) * z.radioActual * 0.92;
          const dx = z.x + cos(ang) * dist;
          const dy = z.y + sen(ang) * dist;

          let px = dx, py = dy, giro = 0, alfa = alfaZona;
          if (z.vuelo > 0) {
            // Van saliendo escalonadas, no todas de golpe: un puñado lanzado a
            // mano sale en abanico, y con todas a la vez se lee como un bloque.
            const retardo = i * (z.vuelo * 0.35 / z.piezas);
            let v = (vivido - retardo) / z.vuelo;
            if (v < 0) { alfa = 0; v = 0; } else if (v > 1) v = 1;
            if (v < 1) {
              px = z.origenX + (dx - z.origenX) * v;
              py = z.origenY + (dy - z.origenY) * v;
              // Sube y baja: lo que lanzas a mano hace una parábola, y sin ella
              // los abrojos se deslizarían por el suelo en vez de volar.
              py -= sen(v * Math.PI) * 22;
              // Y voltean mientras vuelan, hasta quedarse quietos al posarse.
              giro = (1 - v) * 9 + i;
            }
          }

          if (alfa <= 0) continue;
          ctx.globalAlpha = alfa;
          if (giro !== 0) {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(giro);
            ctx.drawImage(img, 0, 0, meta.w, meta.h, -aw / 2, -ah / 2, aw, ah);
            ctx.restore();
          } else {
            ctx.drawImage(img, 0, 0, meta.w, meta.h, px - aw / 2, py - ah / 2, aw, ah);
          }
        }
      }
      ctx.restore();
    }

    // 1.bis LAS MINAS ARMADAS.
    //
    // Van aparte de las calcomanías por una razón concreta: se dibujan a TAMAÑO
    // FIJO. Una mina es un objeto que hay en el suelo, y su tamaño no tiene
    // nada que ver con lo que revienta al pisarla; el radio del arma crece con
    // el nivel y la mina no. El tamaño sale de `radioDibujo` del atlas, que lo
    // fija quien la horneó.
    //
    // Opacas, y en composición normal: es chapa, no luz.
    {
      ctx.save();
      ctx.globalAlpha = 1;
      for (let k = 0; k < n; k++) {
        const z = items[k];
        if (z.modo !== 'mina' || !z.hoja) continue;
        const img = Recursos.imagen(z.hoja);
        const meta = Recursos.meta(z.hoja);
        if (!img || !meta) continue;

        const fases = meta.frames || 1;
        let hueco = 0;
        if (meta.bucle && fases > 1) {
          const vivido = z.vidaMax - z.vida;
          hueco = ((vivido * (meta.fps || 9)) | 0) % fases;
        }
        // Parpadea más deprisa cuando le queda poco: es un aviso de que se va
        // a desarmar sola, y le da al arma una lectura que no tenía.
        const r = meta.radioDibujo || 9;
        ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h,
                      z.x - r, z.y - r, r * 2, r * 2);
      }
      ctx.restore();
    }

    // 1.ter EL OJO DEL DETONADOR, respirando encima del disco.
    //
    // El dibujo horneado es plano y estático -es el sprite de Sergio, no la
    // tira de 12 fotogramas que generaba el parpadeo por código- así que la
    // luz vuelve como una capa aparte: un círculo liso en aditivo sobre el
    // punto rojo del centro, sin `createRadialGradient` -eso asigna, y esto se
    // pinta una vez por mina y por frame- porque a esta escala un disco con
    // alfa ya se lee como brillo.
    //
    // INTERMITENTE Y SUAVE: aparece un tramo corto del ciclo (el resto
    // apagado, que es lo que hace que "intermitente" no sea "siempre
    // encendido a media potencia") y dentro de ese tramo sube y baja con un
    // seno, no de golpe. Sale de `vivido` -tiempo desde que se plantó, no
    // reloj real- por lo mismo que ya usaba el parpadeo antiguo: dos minas
    // sembradas en el mismo fotograma laten a la vez, y la reproducibilidad
    // de la partida no depende de cuándo mira el reloj el navegador.
    {
      const CICLO_LUZ = 2.2, DURA_LUZ = 0.5;
      // DÓNDE VA LA LUZ: en el círculo rojo del dibujo, no en el centro del
      // cuadro. El sprite mide 72x72 con el ancla en (36, 36), y ese círculo
      // está pintado alrededor de (34, 23) -medido sobre el PNG-, o sea dos
      // píxeles a la izquierda y trece MÁS ARRIBA que el ancla. Puesta en el
      // ancla, la luz latía por debajo del punto rojo, sobre la chapa.
      //
      // En fracciones del radio de dibujo porque el blit escala los 72 píxeles
      // del sprite a 2r: un píxel del dibujo son r/36 de pantalla.
      const DESVIO_LUZ_X = -2 / 36, DESVIO_LUZ_Y = -13 / 36;
      // Y el disco de luz se estrecha dos píxeles de diámetro —píxeles del
      // lienzo interno, los de 480x270— para que quepa DENTRO del punto rojo
      // en vez de desbordarlo: el dibujo ya es la luz apagada, y lo que pone
      // esta capa encima es solo el destello.
      const RECORTE_LUZ = 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ff4a35';
      for (let k = 0; k < n; k++) {
        const z = items[k];
        if (z.modo !== 'mina' || !z.hoja) continue;
        const meta = Recursos.meta(z.hoja);
        if (!meta) continue;

        const vivido = z.vidaMax - z.vida;
        const t = vivido % CICLO_LUZ;
        if (t >= DURA_LUZ) continue;
        const brillo = sen((t / DURA_LUZ) * Math.PI);   // sube y baja, nunca de golpe

        const r = meta.radioDibujo || 9;
        ctx.globalAlpha = brillo * 0.8;
        ctx.beginPath();
        const radioLuz = r * 0.22 - RECORTE_LUZ;
        if (radioLuz <= 0) continue;
        ctx.arc(z.x + r * DESVIO_LUZ_X, z.y + r * DESVIO_LUZ_Y, radioLuz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. Y las que NO la tienen, con el círculo aditivo de siempre. Es el
    //    repliegue: mientras el catálogo de calcomanías no esté completo, la
    //    mayoría de las armas de zona pasan por aquí y se ven igual que antes.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'zona' || z.sprite >= 0 || z.hojaPieza || z.relleno <= 0) continue;
      const t = z.vida / z.vidaMax;          // 1 al nacer, 0 al morir
      ctx.globalAlpha = (0.35 + t * 0.35) * z.relleno;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Y EL CANTO YA NO SE DIBUJA.
    //
    // Aquí hubo un aro por zona, con dos argumentos buenos detrás: que marca la
    // frontera del daño, y que esa frontera es la única información que una
    // zona da. Los dos siguen siendo ciertos y aun así el aro sobra, porque la
    // premisa cambió: cuando se escribieron, la mayoría de las armas de área no
    // tenían dibujo y el círculo ERA el efecto. Hoy las nueve lo tienen, y cada
    // hoja está horneada para llenar su cuadro justo hasta el radio que mata —
    // o sea que el dibujo YA es la frontera. El aro encima era pintar dos veces
    // el mismo borde, y de las dos ganaba la trazada.
    //
    // Lo que se lee en pantalla con el aro puesto no es "hasta aquí quema": es
    // una circunferencia de editor de niveles encima del juego. Petición de
    // Sergio, y de las que se ven en cuanto se quitan.
    //
    // Queda el relleno aditivo de más arriba para las zonas sin hoja, que es su
    // única marca: eso no es un aro orientativo, es el efecto entero.
  }

  // Capa de AIRE: solo las ONDAS, relleno y canto. Una explosión no está en el
  // suelo, está en el aire, y tiene que tapar lo que pilla debajo.
  // `deSuelo` elige la pasada: con `true` pinta las ondas marcadas como de
  // suelo —el Sismo— y con `false` todas las demás. main.js la llama dos veces,
  // una antes de las entidades y otra después, y cada pasada salta lo que no le
  // toca. Es el mismo reparto que ya tienen los reventones (ver VFX).
  dibujarAire(ctx, deSuelo = false) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    // 1. Las ondas CON HOJA PROPIA: la explosión dibujada, en aditivo.
    //
    // La hoja trae la secuencia entera —la bola creciendo, vaciándose y
    // apagándose— así que el blit es de TAMAÑO CONSTANTE y quien crece es el
    // dibujo de dentro. Es al revés que las calcomanías de suelo, que son una
    // imagen fija escalada al radio del momento.
    //
    // Y por eso el radio de la hoja tiene que abrirse con la MISMA curva que
    // el daño. Lo hace: generar-efectos.ps1 hornea la bola con el
    // `0.15 + 0.85*sqrt(t)` de `actualizar`, que es el sitio donde se calcula
    // `radioActual`. Si las dos curvas se separan, el fuego va por delante o
    // por detrás de lo que mata.
    ctx.save();
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'onda' || !z.hoja || z.enSuelo !== deSuelo) continue;
      const img = Recursos.imagen(z.hoja);
      const meta = Recursos.meta(z.hoja);
      if (!img || !meta) continue;

      // LA COMPOSICIÓN LA DECIDE LA HOJA, no este bucle. Casi todas son luz
      // —fuego, veneno, ondas de choque— y van sumando, que es lo que hace que
      // dos explosiones solapadas se vean más calientes. Pero el reventón de
      // TIERRA no es luz: es polvo y cascotes, y tiene que tapar lo que hay
      // detrás en vez de sumarse a ello.
      //
      // Se montó todo aditivo y la tierra sencillamente no se veía: aporta un
      // tercio de la luz que aporta el fuego, y sobre un suelo claro eso es
      // nada. El error no era el brillo, era la premisa.
      ctx.globalCompositeOperation = meta.aditivo === false ? 'source-over' : 'lighter';

      const t = 1 - z.vida / z.vidaMax;        // 0 al nacer, 1 al expirar
      const fases = meta.frames || 1;

      // EL FOTOGRAMA SE ELIGE POR RADIO, NO POR RELOJ, y se busca el MÁS
      // CERCANO en la tabla de la hoja.
      //
      // Por radio, porque con el reparto por reloj el primer fotograma se comía
      // el 26% del radio de golpe —sqrt es empinadísima al principio— y el
      // fuego se quedaba muy por detrás de lo que ya estaba matando.
      //
      // Y por tabla en vez de por fórmula, porque así el motor NO necesita
      // saber cómo repartió los fotogramas quien horneó la hoja. Hoy es una
      // progresión geométrica; si mañana es otra cosa, esto sigue valiendo. Son
      // diez comparaciones sobre las dos o tres explosiones que hay en pantalla.
      const objetivo = z.radio > 0 ? z.radioActual / z.radio : 1;
      let f = 0;
      if (meta.radios) {
        let mejor = Infinity;
        for (let i = 0; i < meta.radios.length; i++) {
          // Distancia en PROPORCIÓN y no en diferencia: lo que se quiere
          // minimizar es cuánto hay que ampliar o encoger la celda, y eso es un
          // cociente. Con la diferencia, los fotogramas pequeños salían siempre
          // perdiendo y se ampliaban de más.
          const rr = meta.radios[i];
          const d = rr > objetivo ? rr / objetivo : objetivo / rr;
          if (d < mejor) { mejor = d; f = i; }
        }
      }
      if (f >= fases) f = fases - 1;
      if (f < 0) f = 0;

      // Un desvanecido corto al final. La hoja termina a poco más de un tercio
      // de su brillo de pico, pero no en cero: sin esto la explosión se
      // cortaría en seco. Mismo remate que el tajo de la Katana.
      ctx.globalAlpha = t > 0.82 ? (1 - t) / 0.18 : 1;

      // MEDIO LADO. La celda se escala para que el filo del fuego caiga
      // EXACTAMENTE sobre el radio que mata en este instante, no en el del
      // fotograma más cercano: `radios[f]` dice a qué radio se horneó esta
      // fase, y dividir por él quita el error de cuantización que dejaría el
      // salto de un fotograma al siguiente. Lo que sobresale del cuadro son el
      // desgarro de la silueta y las chispas, y para eso está `margen`.
      const rn = (meta.radios && meta.radios[f]) || 1;
      const r = z.radioActual * (meta.margen || 1) / rn;
      ctx.drawImage(img, f * meta.w, 0, meta.w, meta.h,
                    z.x - r, z.y - r, r * 2, r * 2);
    }
    ctx.restore();

    // 2. Y las que NO la tienen, con el círculo aditivo de siempre. Dos
    //    explosiones solapadas se ven más calientes, y eso es correcto.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'onda' || z.hoja || z.enSuelo !== deSuelo || z.relleno <= 0) continue;
      const t = z.vida / z.vidaMax;
      ctx.globalAlpha = t * 0.75 * z.relleno;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Y LA ONDA TAMPOCO LLEVA CANTO.
    //
    // Mismo caso y mismo motivo que en `dibujarSuelo`: el aro de la onda existía
    // para decir dónde acaba el daño cuando lo de dentro no lo decía, y una
    // explosión horneada al radio de daño ya lo dice. Ver allí el razonamiento
    // entero.

  }
}

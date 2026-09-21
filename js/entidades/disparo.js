import { Pool } from '../core/pool.js';
import { Recursos } from '../core/recursos.js';
import { Particulas, COLOR_CHISPA } from '../sistemas/particulas.js';
import { VFX } from '../sistemas/vfx.js';
import { HOJA_ZONAS, huecoDe } from './zonaDanyo.js';
import { sen, cos, hipot, atan2 } from '../core/mate.js';
import { ESCALA_ARTE } from '../core/constantes.js';

// DISPAROS ENEMIGOS. Los sueltan los enemigos que llevan `ataque` en su ficha
// (medusa y mantícora, de momento): los poderosos, nunca la masa.
//
// POR QUÉ EXISTEN. Hasta ahora todo el bestiario mataba por contacto, así que la
// única pregunta que hacía el juego era "cuánta gente tengo encima" y la única
// respuesta era moverse. Con enemigos que disparan aparecen dos preguntas más:
// dónde está el que dispara, y qué hago con lo que ya viene de camino.
//
// SE PUEDEN DESTRUIR, y eso es la mitad de la idea. Casi cualquier arma que los
// toque —un proyectil, una explosión, un tajo de melé, un orbital, un aura— los
// rompe. Así el jugador no está obligado a esquivar: puede plantarse y limpiar
// el aire, que es una decisión distinta y a veces mejor.
//
// LOS CHARCOS NO. Lo que está en el suelo no toca lo que vuela por encima: ver
// `bloquea` en el barrido y `bloqueaDisparos` en datos/armas.js.
//
// Pool propio y no el de los proyectiles del jugador: van en sentido contrario,
// chocan contra cosas distintas y se dibujan distinto. Meterlos en el mismo pool
// obligaría a preguntar de quién es cada uno en todos los bucles calientes.

// Cuánto vive un disparo si no toca nada. Es un seguro: el culling normal es por
// distancia a la cámara, y un disparo lento podría quedarse dando vueltas.
const VIDA_MAXIMA = 6;

// A cuánto de la cámara se recicla. Generoso, porque un disparo que sale de
// pantalla y vuelve sería peor que uno que desaparece.
const CULL = 700;

// Discos de la estela de un proyectil enemigo. Cinco bastan para leer la cola;
// más es gastar relleno en algo que se ve medio segundo.
const GOTAS_ESTELA = 5;

function crearDisparo() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    danyo: 0, radio: 0, vida: 0, restante: 0,
    // Sismo: segundos de aviso antes de estallar. 0 = proyectil normal.
    aviso: 0, sismo: false,
    // Charco (Fase 6, los conos de fuego de Cerbero): igual que el sismo
    // avisa y luego se activa, pero en vez de reventar una vez se queda
    // dañando por tics durante `duracion`. Es la versión "ataca al jugador"
    // del modo 'zona' de sistemas/zonaDanyo.js, que solo daña enemigos.
    charco: false, duracion: 0, intervalo: 0, relojTic: 0,
    color: '#ffffff', fase: 0,
    // TONOS DEL AVISO. Un aviso de area se dibujaba con un solo color a alfa
    // plano, o sea un disco de plastilina. Con varios tonos se pinta en anillos
    // concentricos y sale un degradado: del mas claro por fuera al mas caliente
    // en el centro. Ver el bloque del sismo en `dibujar`.
    //
    // Son cadenas ya escritas en datos/enemigos.js y NO se interpolan en
    // caliente: componer un `rgba(...)` por anillo y por fotograma seria crear
    // cadenas dentro del bucle de dibujado, que es justo lo que este motor
    // evita en todas partes.
    tonos: null,
    // ESTELA Y NÚCLEO. `estela` es el color del rastro que va dejando y
    // `nucleo` el del brillo de dentro. Sin ellos se usa el color del disparo,
    // que es lo que hacían todos hasta ahora: una bola lisa con una raya
    // detrás. Con los dos puestos, un escupitajo de veneno y una bola de fuego
    // dejan de ser el mismo dibujo en dos colores.
    estela: null, nucleo: null,
    // Calcomanía de suelo del charco, cuando la tiene. Misma hoja y mismo
    // resolutor que las zonas del jugador (ver entidades/zonaDanyo.js).
    sprite: -1,
    // Hoja propia del charco, si la tiene (id de atlas). Ver `charco`.
    hoja: null,
    // Hoja del REVENTÓN: la animación que se suelta al estallar. Es id de
    // atlas, no índice, porque cada una es su propia tira (ver VFX.reventon).
    // Sin ella el estallido se queda en las cuatro chispas de siempre.
    reventon: null,
    // Radio al que se dibuja ese reventón. Se guarda aparte de `radio` porque
    // un proyectil que muere al chocar no tiene radio de área: el suyo es un
    // salpicón pequeño y fijo, no el círculo de daño de un sismo.
    radioReventon: 0,
    // DE DÓNDE SALIÓ. Solo lo usa el sismo, y solo para dibujar: con el punto
    // de partida se puede pintar la piedra volando de la mano del cíclope al
    // sitio donde va a caer.
    //
    // `piedra` dice si hay origen, y es un BOOLEANO y no un centinela en la
    // coordenada. Lo era —un -1 en `origenX`— y estaba mal: el mundo es infinito
    // y la mitad de él tiene la x negativa, así que un cíclope a la izquierda
    // del origen del mapa pasaba por "sin origen" y tiraba su piedra invisible.
    // Una coordenada válida no puede servir de bandera.
    piedra: false,
    origenX: 0, origenY: 0,
    // DIBUJO PROPIO (id de atlas), si el ataque lo declara. Para el proyectil
    // es `spriteDisparo` y sustituye al disco trazado entero, estela incluida
    // —el escupitajo de la medusa ya trae sus gotas dibujadas—; para el sismo
    // es `spritePiedra` y sustituye al polígono de PERFIL_ROCA. Los dos vienen
    // mirando a la izquierda, como las balas del jugador, y se orientan aquí.
    dibujo: null
  };
}

// LA PIEDRA DEL CÍCLOPE. Silueta irregular fija, en radios sobre la unidad: una
// roca no es un círculo, y siete vértices desiguales bastan para que se lea como
// piedra a los seis píxeles que mide. Va en una constante de módulo porque se
// dibuja sesenta veces por segundo y sortearla por fotograma la haría hervir en
// vez de girar.
const PERFIL_ROCA = [1.0, 0.82, 1.06, 0.88, 1.12, 0.8, 0.95];

export class Disparos {
  constructor(capacidad, rng) {
    this.pool = new Pool(crearDisparo, capacidad);
    this._rng = rng;
    this.destruidos = 0;      // por armas del jugador
    this.impactos = 0;        // los que han llegado a dar
  }

  get activos() { return this.pool.activos; }

  // `def` es el bloque `ataque` de datos/enemigos.js.
  lanzar(x, y, dirX, dirY, def) {
    const d = this.pool.obtener();
    if (!d) return null;
    d.x = d.xPrev = x;
    d.y = d.yPrev = y;
    d.vx = dirX * def.velocidad;
    d.vy = dirY * def.velocidad;
    d.danyo = def.danyo;
    d.radio = def.radio;
    d.vida = def.vida || 1;
    d.restante = VIDA_MAXIMA;
    d.color = def.color;
    d.estela = def.estela || null;
    d.nucleo = def.nucleo || null;
    d.tonos = null;             // campo compartido: solo lo usa el sismo
    d.piedra = false;           // ídem
    d.aviso = 0;
    d.sismo = false;
    d.charco = false;           // por si este hueco del pool venía de un charco
    d.hoja = null;
    d.fase = this._rng() * Math.PI * 2;
    d.reventon = def.spriteReventon || null;
    d.dibujo = def.spriteDisparo || null;
    // El salpicón de un proyectil no es su radio de impacto —que son 4-6 px y
    // no se vería— sino algo mayor: lo que se quiere enseñar es DÓNDE ha caído
    // el veneno de la medusa, no cuánto medía la bola.
    d.radioReventon = (def.radio || 4) * 3.2;
    return d;
  }

  // SISMO: un círculo marcado en el suelo que revienta tras su aviso. No se
  // mueve, no se puede destruir y hace daño UNA vez, a todo el que esté dentro
  // cuando estalla.
  //
  // Vive en el pool de disparos y no en el de zonas por un motivo práctico: las
  // zonas son del jugador y dañan enemigos; esto es al revés. Compartir el pool
  // que ya sabe golpear al jugador ahorra un sistema entero.
  // `origenX/origenY` son de dónde sale la piedra, o sea el cíclope. Van al
  // final y son opcionales porque sirven SOLO para el dibujo: sin ellos el
  // sismo funciona igual que siempre, marcando el suelo y reventando.
  //
  // Que haya o no origen lo dice `piedra`, no el valor de la coordenada: ver la
  // nota de `crearDisparo`.
  sismo(x, y, def, origenX, origenY) {
    const d = this.pool.obtener();
    if (!d) return null;
    d.x = d.xPrev = x;
    d.y = d.yPrev = y;
    d.piedra = origenX !== undefined;
    d.origenX = origenX || 0;
    d.origenY = origenY || 0;
    d.vx = 0; d.vy = 0;
    d.danyo = def.danyo;
    d.radio = def.radio;
    d.vida = 9999;              // indestructible: se esquiva, no se limpia
    d.restante = def.aviso;
    d.aviso = def.aviso;
    d.sismo = true;
    d.charco = false;           // por si este hueco del pool venía de un charco
    d.estela = null; d.nucleo = null;   // campos compartidos: ver `lanzar`
    d.tonos = def.tonos || null;
    d.hoja = null;
    d.color = def.color;
    // Fase de giro, sorteada al lanzarla: dos piedras seguidas no pueden salir
    // volteando igual. Del RNG de la partida, que es reproducible.
    d.fase = this._rng() * Math.PI * 2;
    d.reventon = def.spriteReventon || null;
    d.dibujo = def.spritePiedra || null;
    d.radioReventon = def.radio;   // el sismo revienta exactamente su círculo
    return d;
  }

  // CHARCO: aviso y luego zona activa que daña por tics durante `duracion`, sin
  // moverse. Es lo que dejan los conos de fuego de Cerbero (Fase 6, datos/jefes.js).
  // Comparte pool con el proyectil y el sismo porque las tres cosas son "un
  // enemigo hace daño al jugador desde un punto del suelo", y ya sabe dibujarse,
  // reciclarse y quedar fuera del alcance de las armas del jugador.
  charco(x, y, def) {
    const d = this.pool.obtener();
    if (!d) return null;
    d.x = d.xPrev = x;
    d.y = d.yPrev = y;
    d.vx = 0; d.vy = 0;
    d.danyo = def.danyo;
    d.radio = def.radio;
    d.vida = 9999;              // indestructible, como el sismo: es terreno, no un proyectil
    d.restante = def.aviso;
    d.aviso = def.aviso;
    d.duracion = def.duracion;
    d.intervalo = def.intervalo;
    d.relojTic = 0;             // el primer tic entra en cuanto se activa
    d.charco = true;
    d.dibujo = null;            // campo compartido: solo proyectil y sismo
    d.sismo = false;
    d.estela = null; d.nucleo = null;   // campos compartidos: ver `lanzar`
    d.tonos = null;
    d.piedra = false;
    d.color = def.color;
    d.fase = 0;
    // Mismo criterio que Zonas.crear: si `sprite` nombra una entrada del atlas
    // es una HOJA PROPIA —su PNG, con sus fotogramas— y si no, se busca como
    // celda de la hoja compartida. Los charcos de jefe salen ahora de su hoja
    // propia generada, igual que los del jugador.
    if (def.sprite && Recursos.meta(def.sprite)) {
      d.hoja = def.sprite;
      d.sprite = 0;
    } else {
      d.hoja = null;
      d.sprite = def.sprite ? huecoDe(def.sprite) : -1;
    }
    // Explícito aunque hoy ningún charco reviente: es campo COMPARTIDO del
    // pool, y lo que no se escribe aquí se hereda del disparo anterior. Es el
    // mismo cuidado que ya tienen `sismo` y `charco` dos líneas más arriba.
    d.reventon = def.spriteReventon || null;
    d.radioReventon = def.radio;
    return d;
  }

  // Capa de SUELO: la calcomanía de los charcos YA ACTIVOS.
  //
  // Los disparos enemigos se dibujan por encima de todo el mundo a propósito
  // —uno que viene tiene que verse aunque cruce por detrás de un cíclope— pero
  // un charco no viene: está. El propio `charco()` lo dice, "es terreno, no un
  // proyectil". Así que se parte igual que las zonas del jugador: la mancha va
  // al suelo y el canto se queda arriba marcando dónde acaba el daño.
  //
  // El AVISO no baja: sigue arriba del todo con el resto de disparos. Es lo
  // único que da tiempo a apartarse, y enterrarlo bajo la horda sería quitarlo.
  dibujarSuelo(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;
    ctx.save();

    // EL AVISO DEL SISMO, DEBAJO DE TODO LO QUE PISA EL SUELO.
    //
    // Estaba en `dibujar`, que va por encima de la horda entera, y eso lo ponía
    // por delante de los cuerpos, de las estatuas y de las columnas. Un aviso de
    // área no está en el aire: está pintado en el suelo, y lo que hay de pie
    // encima tiene que taparlo.
    //
    // Y con el aviso por delante pasaba algo peor que ser feo: escondía a los
    // enemigos que había DENTRO del círculo, que son justo los que hay que ver
    // para decidir por dónde salir.
    //
    // Sigue leyéndose porque lo que se ve es el suelo cambiando de color, que es
    // exactamente lo que el aviso quiere decir. El reventón sí se queda arriba
    // (VFX.reventon): eso ya no es un aviso, es el golpe.
    for (let k = 0; k < n; k++) {
      const d = items[k];
      if (!d.sismo || d.restante <= 0) continue;
      const x = d.xPrev + (d.x - d.xPrev) * alpha;
      const y = d.yPrev + (d.y - d.yPrev) * alpha;

      const prog = 1 - d.restante / d.aviso;
      const rMax = d.radio * prog;
      if (d.tonos) {
        const nt = d.tonos.length;
        for (let t = 0; t < nt; t++) {
          // El más claro ocupa el círculo entero y cada siguiente uno menor, así
          // que en el centro se han sumado los seis y en el filo solo el
          // primero. La rampa sale de la SUMA, no de una interpolación.
          const f = 1 - t / nt;
          // EL ALFA POR CAPA NO ES EL QUE SE VE: seis capas se componen, así que
          // lo que hay que fijar es el resultado. Con 0,0165-0,045 por capa el
          // centro llega a 0,200 y el filo a 0,045 — un 30% menos que la tanda
          // anterior, que a su vez ya era un 30% menos que la de antes.
          ctx.globalAlpha = (0.0165 + 0.0285 * prog) * (0.55 + 0.45 * f);
          ctx.fillStyle = d.tonos[t];
          ctx.beginPath();
          ctx.arc(x, y, rMax * f, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.globalAlpha = 0.096 + 0.103 * prog;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(x, y, rMax, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // EL AVISO DE CHARCO, TAMBIÉN DEBAJO DE TODO. Mismo caso que el del sismo:
    // el veneno del Cérbero y el de la Hidra se anuncian con una mancha que
    // crece en el suelo, y una mancha del suelo pintada por encima de los
    // cuerpos tapa justo a quien la está pisando — que es el que necesita verla.
    for (let k = 0; k < n; k++) {
      const d = items[k];
      if (!d.charco || d.restante <= 0) continue;
      const x = d.xPrev + (d.x - d.xPrev) * alpha;
      const y = d.yPrev + (d.y - d.yPrev) * alpha;
      // Solo la mancha que crece, sin el aro que la enmarcaba.
      const prog = 1 - d.restante / d.aviso;
      ctx.globalAlpha = 0.28 + 0.3 * prog;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, d.radio * prog, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Base tenue bajo la calcomanía, por el mismo motivo que en zonaDanyo.js:
    // los entrantes de la silueta dejarían ver suelo limpio dentro del aro, y
    // dentro del aro se hace daño.
    //
    // Y NO bajo las hojas propias, que es la excepción que zonaDanyo.js ya
    // tenía escrita y a esta copia se le había pasado: un efecto con su PNG
    // está dibujado para llenar su cuadro, así que el velo no tapa ningún
    // entrante — solo pone un disco de color sobre el suelo. Los charcos de
    // los dos jefes son justo eso desde que tienen hoja generada, o sea que
    // esto era un círculo de más en pantalla durante todo el combate.
    for (let k = 0; k < n; k++) {
      const d = items[k];
      if (!d.charco || d.sprite < 0 || d.hoja || d.restante > 0) continue;
      ctx.globalAlpha = 0.20;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radio, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < n; k++) {
      const d = items[k];
      if (!d.charco || d.sprite < 0 || d.restante > 0) continue;
      const x = d.xPrev + (d.x - d.xPrev) * alpha;
      const y = d.yPrev + (d.y - d.yPrev) * alpha;
      // Late con la misma fase que usaba el relleno trazado: el charco de un
      // jefe respira, y esa es la diferencia entre "hay una mancha" y "esa
      // mancha sigue viva".
      // La hoja se resuelve por charco: la suya propia o la compartida.
      const idHoja = d.hoja || HOJA_ZONAS;
      const img = Recursos.imagen(idHoja);
      const meta = Recursos.meta(idHoja);
      if (!img || !meta) continue;

      // Fotograma del hervor, en bucle y a fps fijos. Mismo criterio que las
      // zonas del jugador (ver zonaDanyo.dibujarSuelo): el veneno de la Hidra y
      // el fuego de Cerbero duran distinto y tienen que borbotear igual.
      let hueco = d.sprite;
      if (meta.bucle && meta.frames > 1) {
        hueco = ((d.fase * (meta.fps || 11) / 9) | 0) % meta.frames;
      }

      const r = d.radio * (1 + sen(d.fase) * 0.06) * (meta.margen || 1);
      // Translúcido, mismo criterio y mismo número que las zonas del jugador
      // (ver OPACIDAD_ZONA en entidades/zonaDanyo.js).
      ctx.globalAlpha = 0.40;
      ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h,
                    x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // Mueve, comprueba impacto contra jugadores y recicla lo que caduca o se aleja.
  actualizar(dt, jugadores, camara) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const d = items[k];
      d.xPrev = d.x;
      d.yPrev = d.y;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.restante -= dt;
      d.fase += dt * 9;

      let fuera = d.restante <= 0 ||
                  Math.abs(d.x - camara.x) > CULL || Math.abs(d.y - camara.y) > CULL;

      // El sismo no golpea al tocarte: golpea CUANDO REVIENTA, y a todo el que
      // siga dentro del círculo. Salirse a tiempo es la única defensa, y por eso
      // el aviso se dibuja bien grande.
      if (d.sismo) {
        if (d.restante <= 0) {
          for (let i = 0; i < jugadores.length; i++) {
            const j = jugadores[i];
            if (j.abatido) continue;
            const dx = j.x - d.x, dy = j.y - d.y;
            if (dx * dx + dy * dy < d.radio * d.radio) {
              // El sismo empuja hacia AFUERA desde su centro: es el suelo
              // reventando bajo los pies, y lo que sale despedido sale en la
              // dirección en la que estabas respecto al reventón. A quien pille
              // justo en el centro le sale redondo, que es lo que toca.
              j.recibirDanyo(d.danyo, dx, dy);
              this.impactos++;
            }
          }
          this._reventar(d);
          this.pool.liberarEn(k);
          continue;
        }
        k++;
        continue;
      }

      // CHARCO: mismo aviso que el sismo, pero al activarse no revienta una vez
      // y se queda: daña por tics durante `duracion`, que es su propio
      // cronómetro de caducidad (el `restante` de arriba solo cubre el aviso).
      if (d.charco) {
        if (d.restante > 0) { k++; continue; }   // sigue avisando
        d.duracion -= dt;
        d.relojTic -= dt;
        if (d.relojTic <= 0) {
          // EL PRIMER TIC ES EL MOMENTO EN QUE PRENDE, y se marca con su
          // reventón. `relojTic` arranca en 0 justo para que el primer tic
          // entre ya, así que este es el instante exacto en que el aviso deja
          // de ser aviso — que es lo que hay que enseñar. Después no se repite
          // porque el reventón se consume aquí mismo.
          if (d.reventon) {
            // Y VA EN LA CAPA DE SUELO, como el del sismo. Un charco de veneno
            // del Cérbero o de la Hidra es algo que PASA EN EL SUELO: pintado
            // por encima, tapa a quien lo está pisando justo cuando el jugador
            // necesita ver dónde se mete. Lo que revienta en el aire —el veneno
            // de una medusa, la bola de la mantícora— sigue tapando.
            VFX.reventon(d.x, d.y, d.radio, d.reventon, 0.3, this._rng, true);
            d.reventon = null;
          }
          d.relojTic = d.intervalo;
          for (let i = 0; i < jugadores.length; i++) {
            const j = jugadores[i];
            if (j.abatido) continue;
            const dx = j.x - d.x, dy = j.y - d.y;
            if (dx * dx + dy * dy < d.radio * d.radio) {
              // Como el sismo: hacia afuera desde el centro del charco.
              j.recibirDanyo(d.danyo, dx, dy);
              this.impactos++;
            }
          }
        }
        if (d.duracion <= 0) { this.pool.liberarEn(k); continue; }
        k++;
        continue;
      }

      if (!fuera) {
        for (let i = 0; i < jugadores.length; i++) {
          const j = jugadores[i];
          if (j.abatido) continue;
          const dx = j.x - d.x;
          const dy = j.y - d.y;
          const r = d.radio + j.radio;
          if (dx * dx + dy * dy < r * r) {
            // El proyectil sí trae dirección de serie: la suya. La sangre sale
            // en la línea que traía el disparo, que es lo que dice de dónde te
            // están tirando cuando no has visto salir el tiro.
            j.recibirDanyo(d.danyo, d.vx, d.vy);
            this.impactos++;
            this._reventar(d);
            fuera = true;
            break;
          }
        }
      }

      if (fuera) this.pool.liberarEn(k);      // sin avanzar k
      else k++;
    }
  }

  // --- Destrucción por las armas del jugador -------------------------------
  //
  // Un solo barrido central en vez de meter la comprobación dentro de cada
  // comportamiento de arma. Son doce comportamientos y crecerán; con la
  // comprobación repartida, cada arma nueva tendría que acordarse de limpiar el
  // aire y la mitad se olvidaría.
  //
  // Se mira contra las tres familias que cubren el catálogo entero:
  //   - proyectiles del jugador (incluidos rayos y virotes)
  //   - zonas activas: charcos, auras, ondas y explosiones
  //   - tajos de melé recientes
  //
  // El coste es el producto de dos números pequeños —rara vez pasan de veinte
  // disparos y unas decenas de proyectiles— y solo se paga cuando hay disparos
  // en el aire, que es cuando hay medusas o mantícoras vivas.
  barrer(proyectiles, zonas, arsenales, jugadores) {
    if (this.pool.activos === 0) return;
    const items = this.pool.items;

    let k = 0;
    while (k < this.pool.activos) {
      const d = items[k];
      if (d.sismo || d.charco) { k++; continue; }   // terreno: no se destruye, se esquiva
      let tocado = false;

      // Proyectiles del jugador
      const pi = proyectiles.pool.items;
      for (let q = 0; q < proyectiles.pool.activos && !tocado; q++) {
        const p = pi[q];
        const dx = p.x - d.x, dy = p.y - d.y;
        const r = p.radio + d.radio;
        if (dx * dx + dy * dy < r * r) tocado = true;
      }

      // Zonas: auras, ondas, explosiones. `radioActual` es el que crece en las
      // ondas; las zonas fijas no lo mueven y vale igual.
      //
      // MENOS LOS CHARCOS, que no paran nada. Se colaron aquí con el resto por
      // ser todos `Zonas`, y es un error de categoría: una explosión y un campo
      // eléctrico ocupan el AIRE por el que vuela el proyectil, pero el fuego
      // griego, el alquitrán y el aceite son una mancha en el SUELO. Que una
      // flecha se deshiciera al sobrevolar un charco no lo entiende nadie —y
      // menos desde que las zonas se dibujan bajo las entidades justamente para
      // decir que están en el suelo. Lo declara cada arma con `bloqueaDisparos`.
      if (!tocado) {
        const zi = zonas.pool.items;
        for (let q = 0; q < zonas.pool.activos && !tocado; q++) {
          const z = zi[q];
          if (!z.bloquea) continue;
          const dx = z.x - d.x, dy = z.y - d.y;
          const r = (z.radioActual || z.radio) + d.radio;
          if (dx * dx + dy * dy < r * r) tocado = true;
        }
      }

      // ORBITALES: escudos, satélites, discos y sierras. Se les olvidaba, y era
      // el fallo más visible de los cuatro: un escudo que gira a tu alrededor es
      // justo lo que uno espera que pare un proyectil, y las púas de la medusa
      // le atravesaban como si no estuviera.
      //
      // Hay que recalcular dónde está cada escudo porque el arsenal no guarda su
      // posición: la deriva del ángulo y el radio bastan, son los mismos dos
      // números con los que se dibujan.
      if (!tocado) {
        for (let a = 0; a < arsenales.length && !tocado; a++) {
          const j = jugadores[a];
          if (!j) continue;
          const eq = arsenales[a].equipadas;
          for (let w = 0; w < eq.length && !tocado; w++) {
            const arma = eq[w];
            if (!arma.orbitalActivo) continue;
            const s = arma.stats;
            for (let e = 0; e < s.escudos && !tocado; e++) {
              const ang = arma.anguloOrbital + (e / s.escudos) * Math.PI * 2;
              const ox = j.x + cos(ang) * s.radioOrbita;
              const oy = j.y - 6 + sen(ang) * s.radioOrbita;
              const dx = ox - d.x, dy = oy - d.y;
              const r = s.radioEscudo + d.radio;
              if (dx * dx + dy * dy < r * r) tocado = true;
            }
          }
        }
      }

      // Tajos de melé. El arsenal guarda los últimos con su centro y alcance;
      // se aprovechan tal cual en vez de recalcular el arco.
      if (!tocado) {
        for (let a = 0; a < arsenales.length && !tocado; a++) {
          const tajos = arsenales[a].tajos;
          for (let q = 0; q < tajos.length && !tocado; q++) {
            const t = tajos[q];
            if (t.vida <= 0) continue;
            const dx = t.x - d.x, dy = t.y - d.y;
            const r = t.alcance + d.radio;
            if (dx * dx + dy * dy < r * r) tocado = true;
          }
        }
      }

      // Rayos: son segmentos, así que se mide la distancia del disparo al
      // segmento y no a su centro. Un haz que cruza media pantalla tiene que
      // limpiar todo lo que hay en su camino, no solo lo que pase por el medio.
      if (!tocado) {
        for (let a = 0; a < arsenales.length && !tocado; a++) {
          const rayos = arsenales[a].rayos;
          for (let q = 0; q < rayos.length && !tocado; q++) {
            const r = rayos[q];
            if (r.vida <= 0) continue;
            const ex = cos(r.ang) * r.largo;
            const ey = sen(r.ang) * r.largo;
            const px = d.x - r.x, py = d.y - r.y;
            const largo2 = ex * ex + ey * ey;
            let t = largo2 > 0 ? (px * ex + py * ey) / largo2 : 0;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            const cx = px - ex * t, cy = py - ey * t;
            const alcance = r.grosor * 0.5 + d.radio;
            if (cx * cx + cy * cy < alcance * alcance) tocado = true;
          }
        }
      }

      if (tocado) {
        d.vida--;
        if (d.vida <= 0) {
          this.destruidos++;
          this._reventar(d);
          this.pool.liberarEn(k);            // sin avanzar k
          continue;
        }
      }
      k++;
    }
  }

  // LO QUE SE VE CUANDO ESTALLA.
  //
  // Antes eran cuatro chispas y ya. Para un proyectil da igual, pero para el
  // sismo del cíclope era un fallo de bulto: telegrafía casi un segundo con un
  // círculo que se va llenando —lo único que da tiempo a apartarse— y luego el
  // golpe no se veía. La mitad que dice "ha llegado" no existía.
  //
  // Las chispas se quedan, y no como redundancia: pasan por el racionamiento de
  // Particulas y desaparecen con la pantalla llena, mientras que el reventón no.
  _reventar(d) {
    // EL DEL SISMO VA EN EL SUELO, el resto en el aire. Un sismo es la tierra
    // levantándose bajo los pies, así que lo que hay de pie encima —cuerpos,
    // columnas, estatuas— tiene que taparlo; el veneno de una medusa revienta
    // en el proyectil, a la altura del pecho, y ese sí tapa.
    //
    // Es la misma división que ya tiene el aviso, que se dibuja con las
    // calcomanías (ver `dibujarSuelo`): las dos mitades del ataque del cíclope
    // están pintadas en el suelo y solo la piedra vuela.
    VFX.reventon(d.x, d.y, d.radioReventon || d.radio, d.reventon,
                 d.sismo ? 0.42 : 0.28, this._rng, d.sismo);
    if (Particulas.saturado()) return;
    Particulas.estallido(d.x, d.y, 4, 60, 0.25, 1.5, COLOR_CHISPA, 0.8, this._rng);
  }

  vaciar() { this.pool.vaciar(); }

  // Bola con halo y núcleo claro, latiendo. Se dibuja POR ENCIMA de todo lo
  // demás del mundo: un disparo que viene tiene que verse aunque cruce por
  // detrás de un cíclope, porque la decisión de esquivarlo o reventarlo se toma
  // en menos de un segundo.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    ctx.save();
    for (let k = 0; k < n; k++) {
      const d = items[k];
      const x = d.xPrev + (d.x - d.xPrev) * alpha;
      const y = d.yPrev + (d.y - d.yPrev) * alpha;
      if (d.sismo) {
        // EL AVISO YA NO SE PINTA AQUÍ: se ha bajado a `dibujarSuelo`, que va
        // por debajo de las entidades. Lo que sigue en esta capa es la PIEDRA,
        // y con motivo — está en el aire, así que tiene que pasar por encima de
        // los cuerpos y de las columnas igual que pasaría una piedra de verdad.
        //
        // Que las dos mitades del mismo ataque vivan en capas distintas no es un
        // descuido: una está pintada en el suelo y la otra vuela.
        const prog = 1 - d.restante / d.aviso;
        // Y LA PIEDRA, VOLANDO.
        //
        // El sismo era un ataque sin proyectil: se marcaba el suelo y reventaba.
        // Funcionaba, pero no contaba de dónde venía el golpe — un cíclope que
        // levanta el brazo y hace temblar el suelo a treinta unidades de
        // distancia es un efecto sin causa. Ahora se ve salir la roca de su mano
        // y caer donde estaba marcado.
        //
        // Y no es solo adorno: la piedra es el MISMO aviso contado por otro
        // canal. Sale a la vez, vuela durante todo el aviso y toca el suelo en
        // el fotograma exacto en que revienta, así que mirando el aire se sabe
        // cuánto falta igual que mirando la mancha. Quien no está mirando al
        // suelo ve la piedra, y al revés.
        if (d.piedra) {
          // Parábola: interpola de la mano al blanco y le resta altura con un
          // seno. La altura sale de la DISTANCIA —un tiro largo se levanta más—
          // con tope, o el arco se saldría de cuadro por arriba.
          const dx = x - d.origenX, dy = y - d.origenY;
          const alto = Math.min(hipot(dx, dy) * 0.34, 62);
          const px = d.origenX + dx * prog;
          const py = d.origenY + dy * prog - sen(prog * Math.PI) * alto;

          // Crece hacia el punto alto del arco y se encoge al bajar. Es
          // perspectiva barata y es lo que hace legible en qué momento del vuelo
          // va: sin ella, una piedra que sube y baja parece que se desplaza en
          // línea recta.
          const r = 4.6 * (1 + sen(prog * Math.PI) * 0.45);
          // Voltea mientras vuela. Media vuelta y pico en todo el trayecto:
          // más y se lee como una peonza, menos y parece arrastrada.
          const giro = d.fase + prog * 4.2;

          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(giro);
          // CON DIBUJO: la roca de Sergio, al mismo tamaño que tendría el
          // polígono (40x37 físicos son 10 lógicos de ancho, o sea el diámetro
          // de la de radio 4,6), creciendo y encogiendo con el arco igual.
          const imgP = d.dibujo ? Recursos.imagen(d.dibujo) : null;
          const metaP = d.dibujo ? Recursos.meta(d.dibujo) : null;
          if (imgP && metaP) {
            const esc = r / 4.6;
            const aw = metaP.w / ESCALA_ARTE * esc, ah = metaP.h / ESCALA_ARTE * esc;
            ctx.drawImage(imgP, 0, 0, metaP.w, metaP.h, -aw / 2, -ah / 2, aw, ah);
            ctx.restore();
            continue;
          }
          ctx.beginPath();
          for (let v = 0; v < PERFIL_ROCA.length; v++) {
            const a = (v / PERFIL_ROCA.length) * Math.PI * 2;
            const rv = r * PERFIL_ROCA[v];
            const vx = cos(a) * rv, vy = sen(a) * rv;
            if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
          }
          ctx.closePath();
          // Contorno oscuro y grueso, como los proyectiles enemigos: sobre una
          // pantalla llena de destellos del jugador, lo que va perfilado en
          // negro es lo que te puede matar.
          ctx.lineJoin = 'round';
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(14,8,10,.85)';
          ctx.stroke();
          ctx.fillStyle = '#8a7f6d';
          ctx.fill();
          // Cara iluminada: un triángulo hacia arriba y a la izquierda, que es
          // de donde viene la luz en todo el juego.
          ctx.beginPath();
          ctx.moveTo(-r * 0.75, -r * 0.2);
          ctx.lineTo(-r * 0.1, -r * 0.85);
          ctx.lineTo(r * 0.35, -r * 0.15);
          ctx.closePath();
          ctx.fillStyle = '#b5a892';
          ctx.fill();
          ctx.restore();
        }
        continue;
      }

      if (d.charco) {
        if (d.restante > 0) {
          // AVISANDO TODAVÍA: no se pinta nada aquí. La mancha que crece la
          // dibuja `dibujarSuelo`, con las calcomanías, igual que la del sismo.
        } else {
          // Activo: el charco y nada más. Sin aviso, porque ya no hay nada que
          // anunciar —el peligro ES el charco— y ahora tampoco canto.
          //
          // El canto se defendía como "la frontera del daño". Pero con la
          // calcomanía puesta, el charco animado YA dice hasta dónde llega, y
          // el aro encima era el círculo de siempre pintado sobre el dibujo
          // nuevo: dos veces el mismo borde, y el trazado ganándole al dibujado.
          //
          // Sin calcomanía sigue habiendo relleno, porque entonces es lo único
          // que hay: quitarlo dejaría un charco invisible que quema.
          if (d.sprite < 0) {
            const late = 1 + sen(d.fase) * 0.15;
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = d.color;
            ctx.beginPath();
            ctx.arc(x, y, d.radio * late, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        continue;
      }

      // CON DIBUJO PROPIO: el sprite orientado al vuelo y nada más. Ni gotas ni
      // halo ni filo: el dibujo ya trae su cola y su contorno negro, que es lo
      // que lo separa de los efectos del jugador. Mismo convenio que
      // entidades/proyectil.js —mira a la izquierda, se espeja y se ancla por
      // la punta— para que una hoja valga en los dos sitios.
      if (d.dibujo) {
        const img = Recursos.imagen(d.dibujo);
        const meta = Recursos.meta(d.dibujo);
        if (img && meta) {
          const aw = meta.w / ESCALA_ARTE, ah = meta.h / ESCALA_ARTE;
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.translate(x, y);
          ctx.rotate(atan2(d.vy, d.vx));
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, meta.w, meta.h, -aw * 0.2, -ah / 2, aw, ah);
          ctx.restore();
          continue;
        }
      }

      const late = 1 + sen(d.fase) * 0.12;

      // ESTELA HACIA ATRÁS. Un disco no dice a dónde va, y saber a dónde va un
      // proyectil enemigo es media esquiva: con la pantalla llena, para cuando
      // deduces el rumbo mirándolo dos frames ya te ha dado. La cola apunta de
      // dónde viene, así que la línea de peligro se lee en un vistazo.
      //
      // Y NO ES UNA RAYA, SON GOTAS. Era un solo trazo de grosor constante, que
      // se lee como una barra pegada detrás. Ahora es una hilera de discos cada
      // vez más pequeños y más transparentes: eso es lo que hace un líquido
      // lanzado —el escupitajo de la medusa— y también una bola de fuego, que
      // va soltando lo que le sobra. La misma forma sirve para las dos porque
      // la diferencia está en el color, no en el gesto.
      const v = hipot(d.vx, d.vy);
      if (v > 1) {
        const ux = d.vx / v, uy = d.vy / v;
        ctx.fillStyle = d.estela || d.color;
        for (let g = 1; g <= GOTAS_ESTELA; g++) {
          const t = g / GOTAS_ESTELA;               // 1 = la más lejana
          // Se separan un poco más de lo que encogen, para que la cola se vea
          // deshacerse en vez de ser un cono macizo.
          ctx.globalAlpha = 0.42 * (1 - t) * (1 - t * 0.5);
          const dist = d.radio * 1.5 * g;
          const r = d.radio * (1 - t * 0.78);
          ctx.beginPath();
          ctx.arc(x - ux * dist, y - uy * dist, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 0.30;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, d.radio * 2.1 * late, 0, Math.PI * 2);
      ctx.fill();

      // FILO OSCURO. Es lo que impide que un proyectil enemigo se confunda con
      // los efectos del jugador, que se dibujan sumando luz: sobre una pantalla
      // llena de destellos claros, lo que tiene contorno negro es lo que te
      // puede matar.
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, d.radio * late + 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(14,8,10,.85)';
      ctx.fill();

      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, d.radio * late, 0, Math.PI * 2);
      ctx.fill();

      // El brillo de dentro. Blanco por defecto —es un reflejo— pero las armas
      // que lo declaran mandan: el corazón de una bola de fuego es amarillo
      // pálido y el de un escupitajo, verde claro.
      ctx.fillStyle = d.nucleo || '#ffffff';
      ctx.beginPath();
      ctx.arc(x - d.radio * 0.25, y - d.radio * 0.25, d.radio * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

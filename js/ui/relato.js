import { ANCHO_FISICO, ALTO_FISICO, ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE_TITULO, FUENTE_RELATO, textoEspaciado } from './capa.js';
import { fondoTitulo } from './pantallas.js';

// EL MOTOR DEL RELATO: un texto que sube por el hueco de una placa de piedra.
//
// Estaba dentro de ui/intro.js, que era el único sitio donde se contaba algo.
// Ahora hay dos: la intro presenta EL JUEGO, y cada nivel cuenta SU historia
// antes de empezar (ver ui/historia.js). Las dos pantallas son la misma placa
// con otro guion, así que lo que se saca aquí es todo salvo el guion.
//
// EL RELATO NO VA EN PERSPECTIVA. La primera versión era un rótulo estilo Star
// Wars, con el texto alejándose hacia un horizonte, y se cambió por texto PLANO
// que sube sin encoger. La perspectiva tenía sentido sobre un cielo abierto;
// dentro del hueco rectangular de una placa, el texto que mengua hacia el fondo
// pelea con el marco en vez de acompañarlo — y además obligaba a leer lo que
// venía cada vez más pequeño. Lo que queda es más simple y se lee mejor: entra
// por abajo, sube a tamaño constante y sale por arriba.
//
// EN DOS LIENZOS, como el resto de la interfaz (ver ui/capa.js): las
// ilustraciones van al lienzo del MUNDO y TODO el texto a la capa de interfaz,
// que va a la resolución real del monitor.

// EL RITMO: cada cuántos segundos asoma un renglón nuevo por abajo.
//
// Es el único número que gobierna la velocidad, y se expresa así —y no como una
// duración total— porque es lo que de verdad se percibe. Reescribir el guion
// cambia lo que dura la pantalla, no el ritmo al que se lee, que es justo lo
// que hay que conservar.
//
// Ojo con confundirlo con el tiempo de lectura: un renglón tarda 1,4 s en
// aparecer detrás del anterior, pero se pasa DOCE SEGUNDOS cruzando el hueco de
// la placa antes de salir por arriba. Tiempo para leerlo sobra.
const SEGUNDOS_POR_LINEA = 1.4;

// Lo que "pesa" un renglón EN BLANCO a la hora de repartir el tiempo de la voz.
//
// Una línea vacía separa párrafos, y el narrador hace ahí una pausa — pero una
// pausa corta, no el tiempo de leer diez caracteres. Doce es lo que dura ese
// respiro medido contra el ritmo de las dos narraciones que hay: a los doce
// caracteres por segundo a los que habla, algo menos de un segundo.
const PESO_PAUSA = 12;

// LA VOZ ENTRA TARDE A PROPÓSITO, tres segundos después que el texto.
//
// Un renglón tiene que estar LEGIBLE cuando se narra, y para eso ha tenido que
// entrar antes: si los dos arrancan a la vez, el narrador dice la primera frase
// mientras esa frase todavía está asomando por abajo, y para ponerla a tiempo el
// texto tendría que pegar un acelerón al principio que se ve como un tirón.
//
// Con tres segundos de ventaja el texto entra a su ritmo, y cuando el primer
// renglón está en mitad de la placa es cuando empieza a sonar. Es lo mismo que
// hace cualquier rótulo narrado: primero se ve, luego se oye.
export const RETARDO_VOZ = 3;

// --- SALTARSE UNA NARRACIÓN: UN SEGUNDO Y PICO SOSTENIDO ------------------------
//
// Una pulsación suelta ya no vale para saltarse el relato, y el motivo es que
// ahora hay VOZ. Un rótulo que se salta con un roce es una molestia; una
// narración de un minuto que se salta con un roce es el trabajo de la pantalla
// entero tirado por un botón mal apoyado, y encima sin forma de volver.
//
// Un segundo y dos décimas: bastante más de lo que dura cualquier pulsación
// accidental y bastante menos de lo que cansa a quien ha visto esto diez veces
// y quiere entrar a jugar. Empezó en tres, bajó a dos y seguía haciéndose largo
// aguantando; Sergio lo dejó en 1,2.
//
// Y SE VE MIENTRAS SE PULSA. Sin el aro, mantener pulsado no se le ocurre a
// nadie: pulsas, no pasa nada, y concluyes que la pantalla no se puede saltar.
// El aro aparece al primer contacto y se cierra según se aguanta, que es el
// gesto que ya conoce todo el mundo de otros juegos.
export const AGUANTE_SALTO = 1.2;

// Se VACÍA más rápido de lo que se llena. Soltar un momento sin querer no puede
// costar el aguante entero otra vez, pero soltar del todo tiene que deshacerlo
// en un instante o el aro se quedaría ahí medio lleno sin que nadie lo esté
// pulsando.
const VACIADO = 2.5;

// El aro, en la esquina INFERIOR DERECHA. Es donde menos estorba: el relato sube
// por el centro de la placa y el ojo va ahí, así que un aro en esa esquina se ve
// por el rabillo y no tapa ni una letra.
const ARO_MARGEN = 26;
const ARO_RADIO = 13;
const ARO_GROSOR = 3;

// Cuánto lleva aguantado, de 0 a 1. Lo llevan las pantallas que narran y se lo
// pasan a `dibujarAguante`; vive fuera de aquí porque cada pantalla tiene su
// propio reloj y su propia forma de terminar.
export function avanzarAguante(actual, mantenido, dt) {
  const v = mantenido ? 1 / AGUANTE_SALTO : -VACIADO;
  return Math.max(0, Math.min(1, actual + v * dt));
}

// EL ARO. Un carril oscuro y encima el arco de lo que llevas, desde arriba y en
// el sentido del reloj.
export function dibujarAguante(ctx, fraccion) {
  if (fraccion <= 0.001) return;
  // ANCHO_UI y no ANCHO_FISICO: el aro va en la CAPA DE INTERFAZ, igual que el
  // texto del relato. Hoy los dos pares de constantes valen lo mismo (960x540) y
  // por eso da igual, pero se separaron a propósito para que la interfaz deje de
  // depender de la escala del arte — usar aquí las del mundo sería atarlas otra
  // vez por accidente.
  const cx = ANCHO_UI - ARO_MARGEN - ARO_RADIO;
  const cy = ALTO_UI - ARO_MARGEN - ARO_RADIO;

  ctx.save();
  // Entra desvaneciéndose: al primer roce el aro asoma en vez de aparecer de
  // golpe, que a esa escala se lee como un parpadeo.
  ctx.globalAlpha = Math.min(1, fraccion * 6);

  ctx.lineWidth = ARO_GROSOR;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(10,8,6,.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, ARO_RADIO, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = ORO_CLARO;
  ctx.beginPath();
  ctx.arc(cx, cy, ARO_RADIO, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraccion);
  ctx.stroke();

  // Y el aviso de qué se está haciendo, una vez. Solo cuando ya se lleva un
  // poco: puesto desde el primer fotograma, parpadearía con cada roce.
  if (fraccion > 0.12) {
    ctx.globalAlpha = Math.min(1, (fraccion - 0.12) * 4);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `600 13px ${FUENTE_RELATO}`;
    ctx.fillStyle = 'rgba(10,8,6,.75)';
    ctx.fillText('saltar', cx - ARO_RADIO - 7, cy + 1);
    ctx.fillStyle = ORO;
    ctx.fillText('saltar', cx - ARO_RADIO - 8, cy);
  }
  ctx.restore();
}

// EL FINAL, en dos tiempos. Cuando el último renglón sale por arriba la placa
// se queda un rato vacía —ESPERA— y solo después empieza el fundido. Sin esa
// espera, el negro pisa la última frase justo cuando se acaba de leer, y lo que
// queda es sensación de prisa.
export const ESPERA = 2;
export const FUNDIDO = 1.5;

// Entrada desde el negro que deja la pantalla anterior. Es la contrapartida del
// fundido de salida: si una se apaga y la siguiente aparece de golpe, el corte
// se nota más que si no hubiera fundido ninguno.
export const ENTRADA = 0.6;

const ORO = '#e8b73a';
const ORO_CLARO = '#f7dc9a';

// --- El hueco de la placa ----------------------------------------------------
//
// Medido sobre la ilustración recorriendo desde el centro hacia fuera hasta
// salir de lo oscuro, y quedándose con la MAYOR extensión que contiene al
// centro: los lazos de la bandera cruzan el panel, así que una sola fila o una
// sola columna se corta contra un lazo y devuelve un hueco más pequeño que el
// que hay.
//
// LO QUE HAY QUE MEDIR NO ES EL AGUJERO, ES LA BANDA LIMPIA, y esto costó una
// captura con el relato montado encima de un lazo.
//
// La primera medida cogió la mayor extensión oscura que contiene al centro y
// dio y=156..726 en píxeles: 90 a 417 en unidades. Con esos números el texto
// bajaba hasta el lazo de abajo y se leía por encima de la tricolor. El barrido
// se había colado POR el lazo, que también tiene partes oscuras.
//
// Lo que vale es dónde cabe una línea CENTRADA sin tocar nada, y eso se saca
// mirando el hueco de cinco columnas del centro a la vez y quedándose con lo
// común a las cinco: y=287..661 en píxeles de la lámina (1672x941), o sea
// 165..379 en unidades.
//
// A lo ancho manda el mismo criterio de siempre —el texto va centrado en el
// hueco— y la placa tiene su centro en 481.
const PANEL = { x0: 241, x1: 721, y0: 165, y1: 379 };
const PANEL_CX = (PANEL.x0 + PANEL.x1) / 2;

// Aire entre la piedra y el texto, para que el relato no roce el labrado.
const MARGEN = 10;

// Ancho de la columna de texto. El hueco de la placa mide 480, así que quedan
// diez unidades de respiro a cada lado.
const ANCHO_TEXTO = 460;

// Y un pelo más de guarda para el AJUSTE A LO ANCHO (ver `escalaQueEntra`): si
// se apurara hasta el borde exacto, un carácter con un adorno que se salga de
// su caja tocaría el canto del lienzo.
const GUARDA = 8;

// Por dónde entra y sale el texto. Un corte limpio contra el borde del hueco
// partiría las letras por la mitad; con este desvanecido, el renglón asoma y se
// apaga como si la piedra tuviera sombra en los bordes.
const DESVANECE = 26;

// Alto de las tiras en que se dibuja el texto. Al no haber perspectiva no hacen
// falta para deformar nada: son solo para que el desvanecido de los bordes
// pueda variar de una a otra.
const PASO = 2;

// El texto se traza al doble para que al pasarlo a pantalla siga estando fino.
const RES = 2;

// --- Cuerpos de letra, en unidades de interfaz -------------------------------
//
// Sin perspectiva, lo que se escribe aquí es LO QUE SE VE: un cuerpo de 19 se
// dibuja de 19 unidades de alto, siempre, esté el renglón donde esté.
//
// Son un tope, no una promesa: si la fuente que le toque a la máquina mide más
// de la cuenta, `escalaQueEntra` los baja hasta que el renglón entre.
const CUERPO = 19, SALTO = 27;
const CUERPO_TITULAR = 32, SALTO_TITULAR = 44;
const CUERPO_ANTE = 14, SALTO_ANTE = 24;
const SALTO_BLANCO = 15;

// Separación entre letras del titular y del antetítulo. Una inscripción romana
// va espaciada; un párrafo no.
const ESPACIADO_TITULAR = 3;
const ESPACIADO_ANTE = 6;

// UN RELATO PREPARADO: el guion ya trazado en su lienzo, con lo que tarda en
// cruzar la placa entera.
//
// El guion son líneas PARTIDAS A MANO, no envueltas por `envolverTexto`: en un
// texto que se lee renglón a renglón según entra, el corte de cada línea es
// parte del ritmo, y un reparto automático deja líneas viudas de dos palabras
// justo donde más se ven. Una cadena vacía es un renglón en blanco.
//
// Los prefijos: '#' es el titular y '@' el antetítulo. Un carácter en vez de
// una estructura con tipos porque son dos casos y solo se usan aquí.
//
// Se prepara UNA VEZ por guion. Lo que cambia cada fotograma es por dónde se
// corta el lienzo, no lo que pone.
export function prepararRelato(guion) {
  const ancho = ANCHO_TEXTO * RES;

  // Primero se suma el alto, para saber de qué tamaño hace falta el lienzo. No
  // hace falta medir con el contexto: el alto de cada renglón lo fija su tipo
  // de línea, no lo que ponga en ella.
  let alto = 0;
  for (let i = 0; i < guion.length; i++) alto += altoLinea(guion[i]);

  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = Math.ceil(alto * RES) + 40;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // AJUSTE A LO ANCHO, antes de trazar nada.
  //
  // Hace falta porque el cuerpo de letra que se escribe aquí no dice cuánto va
  // a MEDIR la línea: eso lo decide la fuente que tenga la máquina. Trajan Pro
  // no está instalada en casi ningún sitio, así que el titular cae en la
  // primera de repuesto, y las de repuesto no miden todas igual — medidas
  // sobre el guion de la intro, Georgia pide un 14% más de ancho que Palatino.
  //
  // Sin esto, "LA HORDA DE EMERITA" a cuerpo 32 pedía 1378 píxeles de los 860
  // que había, y se dibujaba centrada: se perdían la L del principio y la A del
  // final. Los párrafos también se salían, solo que se notaba menos.
  //
  // Se calcula UN factor por tipo de renglón, no uno por línea: encoger solo la
  // frase larga dejaría un párrafo con dos tamaños distintos, que se lee como
  // un error de maquetación.
  const cabe = ancho - GUARDA * RES;
  const escTitular = escalaQueEntra(ctx, guion, cabe, '#');
  const escAnte = escalaQueEntra(ctx, guion, cabe, '@');
  const escCuerpo = escalaQueEntra(ctx, guion, cabe, '');

  // Lo que hace falta para acompasar el texto a una narración: dónde cae cada
  // renglón y cuánto tarda la voz en decirlo. Ver `acompasarAVoz`.
  const renglones = [];

  let y = 0;
  for (let i = 0; i < guion.length; i++) {
    const linea = guion[i];
    const salto = altoLinea(linea);
    renglones.push({
      centro: y + salto / 2,
      // EL PESO ES EN CARACTERES, que es lo que tarda en decirse. No en
      // renglones: "Hoy vuelven a ser verdad." y "Nadie sabe por qué. Quizá
      // porque" ocupan lo mismo en la placa y no se tarda lo mismo en leerlos en
      // voz alta, y repartir el tiempo por igual entre los dos es exactamente lo
      // que hacía que el texto y la voz se separaran según avanzaba la pantalla.
      //
      // La marca inicial no cuenta: '@' y '#' son de maquetación, no se dicen.
      peso: linea.length ? linea.replace(/^[@#]/, '').length : PESO_PAUSA
    });
    if (linea.length > 0) {
      // La base del renglón, no su borde de arriba: por eso el 0,78.
      const base = (y + salto * 0.78) * RES;
      if (linea[0] === '#') {
        // El titular SÍ va en la romana capital: dos palabras en versales son
        // una inscripción, que es exactamente lo que pide una placa de piedra.
        ctx.font = fuente('#', escTitular);
        ctx.fillStyle = ORO_CLARO;
        textoEspaciado(ctx, linea.slice(1), ancho / 2, base,
                       ESPACIADO_TITULAR * escTitular * RES);
      } else if (linea[0] === '@') {
        ctx.font = fuente('@', escAnte);
        ctx.fillStyle = ORO;
        textoEspaciado(ctx, linea.slice(1), ancho / 2, base,
                       ESPACIADO_ANTE * escAnte * RES);
      } else {
        ctx.font = fuente('', escCuerpo);
        ctx.fillStyle = ORO;
        ctx.fillText(linea, ancho / 2, base);
      }
    }
    y += salto;
  }

  // Velocidad: la que hace que asome un renglón cada SEGUNDOS_POR_LINEA.
  const velocidad = SALTO / SEGUNDOS_POR_LINEA;
  // Y se guarda lo que mide el hueco, que hace falta fuera para recalcular la
  // velocidad cuando manda la voz. Ver `acompasarAVoz`.

  // Y la duración: lo que tarda el guion entero en cruzar el hueco de punta a
  // punta —su propio alto MÁS el alto del hueco, porque el primer renglón
  // todavía tiene que subirlo entero—, la espera con la placa ya vacía y el
  // fundido.
  const util = (PANEL.y1 - MARGEN) - (PANEL.y0 + MARGEN);
  const duracion = (y + util) / velocidad + ESPERA + FUNDIDO;

  return { texto: c, altoTexto: y, velocidad, duracion, renglones, curva: null };
}

// ACOMPASAR EL RELATO A LA NARRACIÓN.
//
// Cuando hay voz, MANDA LA VOZ: el texto deja de subir a ritmo fijo y pasa a
// seguir al narrador renglón por renglón.
//
// LA PRIMERA VERSIÓN SOLO CUADRABA EL TOTAL —misma duración, velocidad
// constante— y no bastaba. El texto y la voz coincidían al empezar y al acabar,
// y entre medias se separaban y se volvían a juntar: en la intro el texto se
// adelantaba y en la de Mérida se quedaba atrás, hasta el punto de que el último
// renglón se iba de la placa mientras el narrador todavía lo estaba diciendo.
//
// El motivo es que un renglón ocupa lo mismo en la placa se diga en un segundo o
// en tres. Repartir el recorrido a partes iguales entre renglones es suponer que
// todos se tardan lo mismo en decir, y eso es falso en cuanto una línea lleva
// cuatro palabras y la siguiente ocho.
//
// AHORA SE REPARTE POR CARACTERES. A cada renglón le toca el trozo de narración
// que le corresponde por lo que cuesta decirlo, y el scroll va de un renglón al
// siguiente a la velocidad que haga falta —variable, no constante—, de forma que
// CADA UNO ESTÉ EN MITAD DE LA PLACA CUANDO SE ESTÁ NARRANDO. El punto de
// lectura es el centro del hueco y no otro sitio porque es donde el ojo va solo.
//
// Es una estimación, no una transcripción: sin marcas de tiempo reales del
// audio, lo que hay es el número de letras. Pero corrige la deriva, que era el
// problema — un error de medio renglón no se nota; uno de seis, sí.
//
// Con `duracionVoz` a cero —no hay MP3, o el navegador todavía no lo deja
// sonar— se devuelve el relato tal cual y todo sigue como siempre.
export function acompasarAVoz(relato, duracionVoz) {
  if (!relato || !relato.renglones) return relato;
  if (!(duracionVoz > 0)) { relato.curva = null; return relato; }

  const util = (PANEL.y1 - MARGEN) - (PANEL.y0 + MARGEN);
  let total = 0;
  for (const r of relato.renglones) total += r.peso;
  if (total <= 0) return relato;

  // La curva es una lista de (instante, cuánto ha subido el texto). El primer
  // punto es el arranque: texto abajo del todo y nada subido todavía.
  const curva = [{ t: 0, d: 0 }];
  let acum = 0;
  for (const r of relato.renglones) {
    // El instante en que la voz va por la MITAD de este renglón.
    const t = RETARDO_VOZ + duracionVoz * (acum + r.peso / 2) / total;
    // Y lo que tiene que haber subido el texto para que ese renglón caiga
    // justo en el centro del hueco en ese instante.
    const d = util / 2 + r.centro;
    const ultimo = curva[curva.length - 1];
    // Solo si avanza en los dos ejes: dos renglones con el mismo peso podrían
    // dar el mismo instante, y un tramo de duración cero haría una división
    // por cero al interpolar.
    if (t > ultimo.t + 0.001 && d > ultimo.d) curva.push({ t, d });
    acum += r.peso;
  }
  if (curva.length < 2) { relato.curva = null; return relato; }

  // LA COLA: cuando el narrador se calla, el último renglón está en mitad de la
  // placa y todavía tiene que salir por arriba. Se termina de sacar a la
  // velocidad del último tramo, para que no se note el cambio.
  const fin = curva[curva.length - 1];
  const previo = curva[curva.length - 2];
  const vFinal = (fin.d - previo.d) / (fin.t - previo.t);
  const dSalida = relato.altoTexto + util;     // todo el texto por encima del hueco
  if (dSalida > fin.d && vFinal > 0) {
    curva.push({ t: fin.t + (dSalida - fin.d) / vFinal, d: dSalida });
  }

  relato.curva = curva;
  // Y la pantalla dura lo que tarde el texto en irse del todo, MÁS el silencio
  // con la placa vacía y el fundido. Antes se cortaba al acabar la voz, y por
  // eso el final se comía el último renglón.
  relato.duracion = curva[curva.length - 1].t + ESPERA + FUNDIDO;
  return relato;
}

// Cuánto ha subido el texto en el instante `t`. Con curva, interpolando entre
// sus puntos; sin ella, la recta de siempre.
//
// La búsqueda es lineal y no binaria a propósito: son treinta y tantos puntos y
// esto se llama una vez por fotograma, no por renglón.
function subidoEn(relato, t) {
  const c = relato.curva;
  if (!c) return t * relato.velocidad;
  if (t <= 0) return 0;
  for (let i = 1; i < c.length; i++) {
    if (t < c[i].t) {
      const a = c[i - 1], b = c[i];
      return a.d + (b.d - a.d) * (t - a.t) / (b.t - a.t);
    }
  }
  // Pasado el último punto ya no queda texto, pero se sigue subiendo por si
  // alguien dibuja durante la espera: parar en seco dejaría el renglón final
  // clavado en el borde de arriba.
  const fin = c[c.length - 1], previo = c[c.length - 2];
  const v = (fin.d - previo.d) / (fin.t - previo.t);
  return fin.d + (t - fin.t) * v;
}

// El texto sube a TAMAÑO CONSTANTE. Se dibuja en tiras horizontales, pero al
// revés que en la versión en perspectiva: aquí todas las tiras miden lo mismo y
// van a escala 1:1, y lo único que cambia de una a otra es la opacidad cerca de
// los bordes del hueco.
export function dibujarRelato(ctx, relato, reloj) {
  if (!relato || !relato.texto) return;
  const arriba = PANEL.y0 + MARGEN;
  const abajo = PANEL.y1 - MARGEN;

  // Dónde cae la primera fila del texto: pegada al borde de abajo al empezar, y
  // subiendo a partir de ahí.
  const origen = abajo - subidoEn(relato, reloj);
  const x = PANEL_CX - ANCHO_TEXTO / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (let y = arriba; y < abajo; y += PASO) {
    const alto = Math.min(PASO, abajo - y);
    const fila = y - origen;
    if (fila < 0 || fila + alto > relato.altoTexto) continue;

    const borde = Math.min(y - arriba, abajo - y);
    const a = Math.max(0, Math.min(1, borde / DESVANECE));
    if (a <= 0.01) continue;

    ctx.globalAlpha = a;
    ctx.drawImage(relato.texto,
                  0, fila * RES, relato.texto.width, alto * RES,
                  x, y, ANCHO_TEXTO, alto);
  }

  ctx.restore();
}

// La fuente de un tipo de renglón a una escala dada. En un solo sitio, porque
// el ajuste tiene que medir con EXACTAMENTE la misma fuente con la que después
// se traza; si se escribieran en dos sitios, un día dejarían de coincidir y la
// medida mentiría.
function fuente(tipo, esc) {
  if (tipo === '#') return '700 ' + (CUERPO_TITULAR * esc * RES).toFixed(2) + 'px ' + FUENTE_TITULO;
  if (tipo === '@') return '600 ' + (CUERPO_ANTE * esc * RES).toFixed(2) + 'px ' + FUENTE_TITULO;
  return (CUERPO * esc * RES).toFixed(2) + 'px ' + FUENTE_RELATO;
}

// Cuánto hay que encoger un tipo de renglón para que el más largo de los suyos
// entre en la columna. Devuelve 1 si ya entran todos, que es el caso normal.
//
// El ancho crece proporcional al cuerpo, así que basta medir una vez al tamaño
// nominal y dividir: no hace falta probar tamaños uno a uno.
function escalaQueEntra(ctx, guion, cabe, tipo) {
  let peor = 0;
  for (let i = 0; i < guion.length; i++) {
    const linea = guion[i];
    if (linea.length === 0) continue;
    const suyo = (linea[0] === '#' || linea[0] === '@') ? linea[0] : '';
    if (suyo !== tipo) continue;
    ctx.font = fuente(tipo, 1);
    const w = tipo === ''
      ? ctx.measureText(linea).width
      : anchoEspaciado(ctx, linea.slice(1), espaciadoDe(tipo) * RES);
    if (w > peor) peor = w;
  }
  return peor > cabe ? cabe / peor : 1;
}

function espaciadoDe(tipo) {
  return tipo === '#' ? ESPACIADO_TITULAR : ESPACIADO_ANTE;
}

// Lo que va a ocupar `textoEspaciado`, sin dibujar nada. Repite su cuenta letra
// a letra a propósito: medir la cadena entera daría OTRO número, porque el
// navegador aplica kerning entre pares y el trazado letra a letra no.
function anchoEspaciado(ctx, txt, extra) {
  const letras = [...txt];
  if (letras.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < letras.length; i++) total += ctx.measureText(letras[i]).width + extra;
  return total - extra;
}

function altoLinea(linea) {
  if (linea.length === 0) return SALTO_BLANCO;
  if (linea[0] === '#') return SALTO_TITULAR;
  if (linea[0] === '@') return SALTO_ANTE;
  return SALTO;
}

// --- Las ilustraciones -------------------------------------------------------
//
// Se hornean UNA VEZ al tamaño de la pantalla. Sin hornear, cada fotograma
// repetiría un reescalado con suavizado alto para una imagen que no cambia
// nunca — la misma lección que el fondo del título (ver tituloVivo.js).
//
// `estirar` decide qué hacer con la diferencia de proporción, y las dos piden
// cosas distintas:
//
//   - EL SPLASH se estira a 1920x1080. Mide 1672x941, que es 16:9 salvo por un
//     0,06%: la deformación es invisible y así llena la pantalla.
//   - LA PLACA DE LA HISTORIA va por el otro camino: se encaja ENTERA a lo alto
//     y lo que sobre a los lados se rellena con la propia imagen estirada y
//     apagada por detrás. Es un MARCO, y a un marco cortarle los bordes es
//     quitarle lo que es; y las bandas negras, en una pantalla de presentación,
//     se leen como que algo ha fallado.
//
//     Hoy da igual cuál de los dos se use —la placa también es 1672x941, así
//     que encajarla a lo alto la deja llenando la pantalla y el telón de detrás
//     no se ve—, pero la placa anterior era 1248x832, o sea 3:2 contra 16:9, y
//     estirarla un 18% ensanchaba las calaveras y las cintas. El camino se
//     queda puesto por eso: la próxima placa puede volver a no ser 16:9, y esto
//     lo aguanta sin tocar nada.
export function hornearPantalla(img, estirar) {
  const c = document.createElement('canvas');
  c.width = ANCHO_FISICO;
  c.height = ALTO_FISICO;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';

  if (estirar) {
    cx.drawImage(img, 0, 0, ANCHO_FISICO, ALTO_FISICO);
    return c;
  }

  // El telón: la misma imagen a todo lo ancho y apagada, solo para que los
  // lados no queden vacíos.
  cx.drawImage(img, 0, 0, ANCHO_FISICO, ALTO_FISICO);
  cx.fillStyle = 'rgba(4,3,8,0.66)';
  cx.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);

  // Y encima el marco entero, sin recortar, centrado.
  const esc = ALTO_FISICO / img.height;
  const ancho = img.width * esc;
  cx.drawImage(img, (ANCHO_FISICO - ancho) / 2, 0, ancho, ALTO_FISICO);
  return c;
}

export function fondoPantalla(ctxMundo, horneada) {
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  if (horneada) {
    ctxMundo.imageSmoothingEnabled = false;
    ctxMundo.drawImage(horneada, 0, 0);
    return;
  }
  // Sin ilustración: la del título con un velo. Fea de reserva, pero arranca.
  fondoTitulo(ctxMundo);
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  ctxMundo.fillStyle = 'rgba(6,6,12,0.80)';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);
}

// El negro que entra al principio y sale al final de cada pantalla. `sobra` es
// lo que le queda de vida a la pantalla; `fundido`, cuánto de eso es apagarse.
export function velo(ctxMundo, reloj, sobra, fundido) {
  let a = 0;
  if (reloj < ENTRADA) a = 1 - reloj / ENTRADA;
  if (sobra < fundido) a = Math.max(a, Math.min(1, 1 - sobra / fundido));
  if (a <= 0.002) return;
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  ctxMundo.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);
}

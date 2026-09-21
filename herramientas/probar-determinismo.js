// LAS TRES PRUEBAS DE DETERMINISMO, SIN ABRIR EL NAVEGADOR A MANO.
//
//   node herramientas\probar-determinismo.js
//
// Las tres existian ya en el juego (core/determinismo.js) pero solo se podian
// lanzar escribiendo en la consola del navegador con la partida cargada, que es
// justo el tipo de comprobacion que no se hace: hay que acordarse, abrir, pegar
// tres lineas y leer tres tablas. Aqui se pasan solas.
//
//   1. repetir()    la misma partida DOS VECES en la misma pestana. Caza el
//                   estado que no se reinicia y cualquier azar sin semilla.
//   2. contraste()  la misma partida con los pools RECIEN PUESTOS A CERO contra
//                   los pools sucios de haber jugado. Es literalmente el caso
//                   del cooperativo online: uno acaba de abrir el juego y el
//                   otro lleva tres partidas. Cazo cinco fugas de estado.
//   3. firmar()     una huella de 3600 fotogramas. Comparada con la de otro
//                   navegador dice si las matematicas coinciden; comparada
//                   consigo misma ANTES Y DESPUES de tocar el motor, dice si un
//                   cambio ha alterado la partida o solo su velocidad.
//
// LA HUELLA ESPERADA ESTA ESCRITA ABAJO. Si cambia, hay que mirar por que: o se
// ha tocado la simulacion a proposito —y entonces se copia la nueva— o se ha
// tocado sin querer, que es de lo que avisa. No es lo mismo que las otras dos:
// esas comprueban una propiedad, esta compara con lo que habia.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8143;

// Huella de la semilla por defecto (0xE3E21A), 3600 fotogramas de seis en seis
// centenas. Rehecha el 7 de septiembre de 2026, al empezar a contar el daño.
//
// POR QUE CAMBIA, que es lo unico que hay que saber para no asustarse: esta vez
// se movio ENTERA, desde el primer grupo, y no solo la cola. El resumen de
// partida enseña ahora cuanto ha pegado cada jugador y cada arma, asi que hay
// contadores nuevos —`danyoHecho` en el jugador y en cada arma del arsenal, y
// `bajas` por arma— y esos numeros entran en la foto del mundo desde el primer
// golpe. Antes solo se movia la cola porque lo que cambiaba era el sorteo de la
// subida de nivel, que no llega hasta el minuto cuarenta.
//
// La simulacion NO se ha tocado: nadie pega mas ni menos que ayer, solo se
// apunta lo que pega. Las dos primeras pruebas de este mismo archivo siguen
// diciendo que la misma partida jugada dos veces sale igual, que es la
// propiedad; esta tercera solo compara con lo que habia.
// Y rehecha otra vez el 7 de septiembre al entrar tres armas de golpe
// —Cartas, Cayado y Campana—: mas candidatos en el sorteo, el azar se gasta en
// otro orden a partir de la primera subida de nivel. Los cuatro primeros grupos
// no se mueven, que es la firma de este tipo de cambio.
// Y otra vez el 7 de septiembre, al entrar siete objetos nuevos. Esta se movio
// ENTERA, desde el primer grupo, no solo la cola: los objetos traen SEIS CAMPOS
// NUEVOS en el jugador -alcance, velocidad de proyectil, duracion de zona,
// perforacion, dano de contacto y denarios- y esos numeros entran en la foto
// del mundo desde el primer fotograma, aunque valgan cero. Es la misma firma
// que dejo el contador de dano de la semana pasada.
// Y al entrar los Aros de ritmica: un arma mas en el sorteo. Se movio UN SOLO
// grupo de los siete, el sexto — o sea que la partida de la prueba solo se
// desvia en un tramo y vuelve a coincidir despues. Es lo normal cuando lo que
// cambia es el reparto del azar y no lo que se hace con el.
// Y con los cinco objetos que enganchan en un golpe. Entera otra vez, desde el
// primer grupo: traen cinco campos nuevos en el jugador y una marca nueva en
// CADA ENEMIGO (`golpeado`, la de la Cruz del Gigante), y el pool de enemigos
// entra en la foto desde el primer fotograma aunque el objeto no lo lleve
// nadie. Nadie pega distinto: se apunta una cosa más.
// Y con los cuatro objetos que van por reloj: cuatro campos y cuatro relojes
// mas en el jugador, que entran en la foto desde el primer fotograma aunque
// valgan cero. Otra vez entera y por el mismo motivo de siempre.
// Y con los cuatro objetos de cooperativo: cuatro campos mas, el reloj del
// Grial y `auraEquipo`, que se recalcula en cada paso aunque no lo lleve nadie.
// Y con los cinco de la tienda: cinco campos mas, el reloj del Manto y las dos
// RANURAS, que dejan de ser constantes del juego para ser numeros del jugador.
// Y con el Libro de las Sombras, que cierra la lista: el reloj en el jugador y
// DOS CAMPOS MAS EN CADA ENEMIGO (`poseido` y a quien pertenece). El pool del
// bestiario es lo mas gordo de la foto, asi que esta se movio entera.
// Y rehecha el 10 de septiembre por DOS cambios del catalogo a la vez: siete
// armas apartadas del sorteo (`retirada`, ver datos/armas.js) y el Osito
// Dinamito entrando en el. Se movieron los tres ultimos grupos y los cuatro
// primeros no, que es la firma de siempre cuando lo que cambia es QUIEN entra
// en el sorteo: hasta la primera subida de nivel las dos partidas son la
// misma, y a partir de ahi el azar se gasta en otro orden.
// Y rehecha otra vez el 10 de septiembre, esta desde el SEGUNDO grupo, que es
// otra firma distinta: no cambia quien entra en el sorteo, cambia el mundo.
// Los proyectiles traen campos nuevos -el Osito y su carrerilla- que entran en
// la foto desde el primer fotograma aunque nadie lleve el arma, y la decoracion
// del nivel se ha movido: estatuas al borde de la calzada y ruinas un 20% mas
// pequenas, o sea otras cajas solidas y otras colisiones desde el primer paso.
// Y otra vez, por el mismo tipo de cambio: la decoracion del nivel se movio al
// borde de verdad de la calzada -el carril derecho estaba 28 unidades dentro de
// la piedra- y las dos armas de sierra pegan un 25% menos. Cajas solidas en
// otro sitio y otros numeros de dano: el mundo cambia desde el primer paso.
// Y otra vez (septiembre de 2026): estaba caducada de alguna tanda anterior
// sobre Merida -salia la misma huella nueva con y sin los cambios de paredes
// del nivel 2, que en Merida no tocan nada-, y se copio la que daba.
// Y otra vez (21 de septiembre de 2026), y esta solo desde el cuarto grupo: el
// proyectil dirigido dispara aunque no tenga blanco -al rumbo del jugador, lo
// pidio Sergio- asi que el Pilum de salida suelta jabalinas donde antes
// esperaba, y hay campos nuevos en el proyectil (`arco`, el obus de la
// Artilleria). Los tres primeros grupos no se mueven porque ahi la horda ya
// esta encima y el Pilum tenia blanco de todas formas.
// Y el mismo dia, otra vez desde el segundo grupo: cada enemigo lleva un campo
// nuevo (`expendedora`, el sitio de la maquina expendedora que representa, -1
// para todo lo demas) y entra en la foto del mundo en cuanto hay horda.
// Y otra vez el mismo dia: el bestiario entero un 20% mas pequeno (radios de
// colision incluidos) y campos nuevos de atasco en cada enemigo.
// Y otra vez (misma tarde): los muertos ya no se retiran en el acto, se
// disuelven en ceniza durante 0,75 s y sueltan particulas con el rng, asi que
// el pool y el rng van distintos desde la primera baja.
const HUELLA_ESPERADA = '6c8a0fbd 313b15a0 3c13d141 325829f5 c7193914 931f92c4 337d8b2b';

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

const servidor = spawn(process.execPath, ['-e', `
  const http = require('http'), fs = require('fs'), path = require('path');
  const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
              '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
              '.gif':'image/gif', '.mp3':'audio/mpeg' };
  http.createServer((q, r) => {
    const l = decodeURIComponent(q.url.split('?')[0]);
    const f = path.join(${JSON.stringify(RAIZ)}, l === '/' ? 'index.html' : l);
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  }).listen(${PUERTO});
`], { stdio: 'ignore' });

await new Promise((r) => setTimeout(r, 500));
const nav = await chromium.launch();
const pagina = await (await nav.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));

try {
  console.log('DETERMINISMO\n');
  await pagina.goto(`http://localhost:${PUERTO}/index.html`);
  await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.determinismo,
                               null, { timeout: 30000 });

  const r = await pagina.evaluate(() => {
    // Las tres hablan mucho por consola y aqui solo interesa el veredicto.
    const consola = console.log, tabla = console.table, aviso = console.warn;
    console.log = () => {}; console.table = () => {}; console.warn = () => {};
    const t0 = performance.now();
    const huella = window.EMERITA.determinismo.firmar();
    const ms = performance.now() - t0;
    const rep = window.EMERITA.determinismo.repetir(1800, 60);
    const con = window.EMERITA.determinismo.contraste(600, 60);
    console.log = consola; console.table = tabla; console.warn = aviso;
    return { huella, ms, repetir: rep.igual, repFot: rep.fotograma,
             contraste: con.igual, conFot: con.fotograma };
  });

  comprobar(r.repetir,
            r.repetir ? 'la misma partida dos veces sale igual'
                      : `dos pasadas difieren en el fotograma ${r.repFot}`);
  comprobar(r.contraste,
            r.contraste ? 'con los pools sucios de otra partida, sale igual'
                        : `los pools sucios cambian la partida en el fotograma ${r.conFot}`);
  comprobar(r.huella === HUELLA_ESPERADA,
            r.huella === HUELLA_ESPERADA
              ? 'la huella de 3600 fotogramas es la de siempre'
              : `LA HUELLA HA CAMBIADO\n       esperada: ${HUELLA_ESPERADA}\n       ahora:    ${r.huella}`);
  comprobar(errores.length === 0,
            errores.length === 0 ? 'sin excepciones' : 'EXCEPCIONES: ' + errores.slice(0, 3).join(' | '));
  console.log(`\n  3600 pasos simulados en ${r.ms.toFixed(0)} ms ` +
              `(${(r.ms / 3600).toFixed(3)} ms por paso, sin horda encima)`);
} finally {
  await nav.close().catch(() => {});
  servidor.kill();
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos ? 1 : 0);

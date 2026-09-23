// LAS PAREDES DEL CC THE LIGHTHOUSE, en un navegador de verdad y CON LAS
// TECLAS.
//
//   node herramientas\probar-nivel2.js
//
// POR QUÉ EXISTE. Los muros del nivel 2 se dibujan altos: además de su tapa,
// cada pared pinta su CARA sobre las celdas que tiene delante, y esa cara es la
// pared vista de frente —no es suelo, y no se pisa—. Eso hace que el mapa tenga
// mucha más pared de la que parece, y que un fallo ahí no dé error, no escriba
// nada en la consola y solo lo vea quien está jugando:
//
//   1. que se entre a una tienda atravesando una pared, sin pasar por su
//      puerta (pasó por las esquinas de abajo, por las paredes verticales);
//   2. que las puertas dejen de funcionar como el único paso;
//   3. y la peor: que se cruce de un anillo al siguiente sin abrir su cierre,
//      con lo que los tres jefes dejan de cerrar nada.
//
// Las tres pasaron, y se arreglaba una y volvía otra porque se comprobaban a
// mano y a ojo.
//
// Y SE MUEVE CON LAS TECLAS, que es la única forma de que esto valga. Antes se
// probaba poniéndole al jugador las coordenadas a dedo, y eso pisa justo la
// variable de la que depende la colisión —dónde estaba al empezar el paso—:
// las pruebas daban por bueno un juego que no existía. Aquí se pulsa y se mira
// dónde acaba, como cuando juegas.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8129;

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

function arrancarServidor() {
  return spawn(process.execPath, ['-e', `
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
}

async function principal() {
  console.log('LAS PAREDES DEL NIVEL 2\n');
  const servidor = arrancarServidor();
  await new Promise((r) => setTimeout(r, 500));
  const nav = await chromium.launch();
  const pagina = await (await nav.newContext()).newPage();
  const excepciones = [];
  pagina.on('pageerror', (e) => excepciones.push(e.message));

  try {
    await pagina.goto(`http://localhost:${PUERTO}/index.html`);
    await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.niveles,
                                 null, { timeout: 30000 });

    // Al nivel 2 directamente, sin pasar por los menús: esto no prueba menús.
    await pagina.evaluate(async () => {
      const E = window.EMERITA;
      E.puestos.fill(null);
      E.puestos[0] = { personaje: 0, listo: true };
      E.mascotasElegidas.fill('');
      await E.usarNivel(E.niveles.lista.find((n) => n.id === 'lighthouse'));
      E.empezarPartida();
      E.jugador.inmortal = true;      // esto prueba paredes, no combate
    });
    // El foco del teclado va al lienzo: sin esto las teclas no llegan y todo
    // "pasa" porque el personaje no se mueve.
    await pagina.mouse.click(480, 300);

    // --- Herramientas ---------------------------------------------------------
    const donde = () => pagina.evaluate(() => {
      const E = window.EMERITA, R = E.rejilla, j = E.jugador, c = R.celda;
      return { x: j.x, y: j.y, cx: (j.x / c) | 0, cy: (j.y / c) | 0 };
    });
    // Deja al jugador en una celda concreta SIN moverlo con las teclas. Solo se
    // usa para COLOCARLO antes de cada prueba; lo que se mide siempre es el
    // movimiento posterior, que va con teclas.
    const colocar = (cx, cy) => pagina.evaluate(([cx, cy]) => {
      const E = window.EMERITA, j = E.jugador, c = E.rejilla.celda;
      j.x = cx * c + c / 2; j.y = cy * c + c / 2;
      j.xPrev = j.xVista = j.x; j.yPrev = j.yVista = j.y;
      E.camara.situar(j.x, j.y);
      E.avanzar(2);
    }, [cx, cy]);
    const andar = async (tecla, ms) => {
      await pagina.keyboard.down(tecla);
      await pagina.waitForTimeout(ms);
      await pagina.keyboard.up(tecla);
      await pagina.waitForTimeout(80);
    };

    // --- Dónde probar ---------------------------------------------------------
    //
    // Los sitios NO se eligen a mano: se buscan en el mapa por su forma, así que
    // esto sigue valiendo cuando se regenera el trazado con otra semilla.
    const sitios = await pagina.evaluate(() => {
      const R = window.EMERITA.rejilla, W = R.ancho;
      const tiendas = 'agtuqjrl';
      const suelo = (i) => R.solido[i] !== 1 && R.pie[i] !== 1;
      const esTienda = (i) => tiendas.includes(R.simbolos[R.tipo[i]]) && suelo(i);

      // 1. UNA PARED HORIZONTAL con el pasillo despejado encima y el interior
      //    de una tienda debajo, lejos de cualquier hueco de puerta. Bajando
      //    contra ella hay que quedarse fuera.
      let pared = null;
      for (let cy = 250; cy < 1300 && !pared; cy++) {
        for (let cx = 600; cx < 1900; cx++) {
          const i = cy * W + cx;
          if (R.solido[i] !== 1) continue;
          if (R.solido[i - 1] !== 1 || R.solido[i + 1] !== 1) continue;   // horizontal
          let arribaLibre = true;
          for (let k = 1; k <= 6 && arribaLibre; k++) if (R.solidoEnCelda(cx, cy - k)) arribaLibre = false;
          if (!arribaLibre) continue;
          // Interior de tienda por debajo de la cara, y pared maciza a lo ancho.
          let dentro = -1;
          for (let k = 1; k <= 24; k++) {
            const v = i + k * W;
            if (R.solido[v] !== 1 && R.pie[v] !== 1) { dentro = cy + k; break; }
          }
          if (dentro < 0 || !esTienda(dentro * W + cx)) continue;
          let maciza = true;
          for (let k = -20; k <= 20 && maciza; k++) if (R.solido[i + k] !== 1) maciza = false;
          if (!maciza) continue;
          pared = { cx, cy, dentro };
          break;
        }
      }

      // 2. PAREDES VERTICALES CON SUELO A LOS DOS LADOS, que es exactamente
      //    el agujero que encontró Sergio: la cara que cuelga de la punta de
      //    una pared vertical hacía atravesables sus celdas de abajo, y con
      //    suelo pisable a izquierda y derecha eso es pasar de un lado al otro.
      //    Están en las dos esquinas inferiores de todas las tiendas.
      const esquinas = [];
      const pisable = (i) => R.solido[i] !== 1 && R.pie[i] !== 1;
      for (let cy = 260; cy < 1400 && esquinas.length < 8; cy += 7) {
        for (let cx = 600; cx < 1900; cx++) {
          const i = cy * W + cx;
          if (R.solido[i] !== 1) continue;
          if (R.solido[i - W] !== 1 || R.solido[i + W] !== 1) continue;   // vertical
          if (!pisable(i - 1) || !pisable(i + 1)) continue;               // suelo a los dos lados
          if (!pisable(i - 2) || !pisable(i + 2)) continue;
          esquinas.push({ muroX: cx, muroY: cy });
          break;
        }
      }
      return { pared, esquinas };
    });

    comprobar(!!sitios.pared, 'hay un tramo de pared maciza de tienda donde probar');
    comprobar(sitios.esquinas.length > 0,
              `y ${sitios.esquinas.length} esquina(s) de tienda con pasillo por fuera`);

    // --- 1. BAJANDO CONTRA UNA PARED SE PARA FUERA ----------------------------
    //
    // Es la regla de la perspectiva: la franja donde se pinta la cara de un muro
    // es el muro visto de frente, no el suelo del otro lado. Nadie entra ahí.
    await colocar(sitios.pared.cx, sitios.pared.cy - 5);
    for (let k = 0; k < 14; k++) await andar('ArrowDown', 120);
    const dondeAcaba = await pagina.evaluate(() => {
      const E = window.EMERITA, R = E.rejilla;
      return (E.jugador.y / R.celda) | 0;
    });
    comprobar(dondeAcaba < sitios.pared.cy,
              `bajando contra una pared el jugador se queda fuera ` +
              `(fila ${dondeAcaba}, pared en ${sitios.pared.cy})`);

    // --- 2. NO SE ATRAVIESAN LAS PAREDES -------------------------------------
    //
    // Desde el pasillo, pegado a la pared VERTICAL de una esquina de abajo, se
    // empuja contra ella. Solo cuenta si acaba dentro SIN ALEJARSE: con cuerda
    // suficiente el personaje se va andando a la puerta y entra por ella, que
    // es lo que tiene que poder hacer.
    let coladas = 0;
    for (const e of sitios.esquinas) {
      let entro = false;
      for (const [desde, tecla] of [[-3, 'ArrowRight'], [3, 'ArrowLeft']]) {
        await colocar(e.muroX + desde, e.muroY);
        for (let k = 0; k < 10 && !entro; k++) {
          await andar(tecla, 120);
          entro = await pagina.evaluate(([mx, my, lado]) => {
            const E = window.EMERITA, R = E.rejilla, j = E.jugador, c = R.celda;
            const cx = (j.x / c) | 0;
            // Ha pasado al otro lado del muro sin alejarse: eso es atravesarlo.
            if (Math.abs(j.y - (my * c + c / 2)) > 40) return false;
            return lado < 0 ? cx > mx : cx < mx;
          }, [e.muroX, e.muroY, desde]);
        }
        if (entro) break;
      }
      if (entro) coladas++;
    }
    comprobar(coladas === 0,
              `no se atraviesa ninguna pared vertical de esquina ` +
              `(${coladas} de ${sitios.esquinas.length} probadas)`);

    // --- 3. LAS PUERTAS SIGUEN SIENDO EL PASO --------------------------------
    //
    // Lo contrario de lo de arriba: que al arreglar las paredes no se hayan
    // tapiado las entradas. Se mira que cada tienda abierta tenga al menos un
    // hueco por el que se pueda pasar.
    const sinEntrada = await pagina.evaluate(() => {
      const R = window.EMERITA.rejilla, W = R.ancho, n = R.ancho * R.alto;
      const suelo = (i) => R.solido[i] !== 1 && R.pie[i] !== 1;
      const tiendas = 'agtuqjrl';
      // Trozos de suelo de tienda, y si cada uno toca suelo que no sea suyo.
      const visto = new Uint8Array(n), cola = new Int32Array(n);
      let sueltas = 0, total = 0;
      for (let s0 = 0; s0 < n; s0++) {
        if (visto[s0] || !suelo(s0) || !tiendas.includes(R.simbolos[R.tipo[s0]])) continue;
        let fin = 0, ini = 0, sale = false;
        cola[fin++] = s0; visto[s0] = 1;
        const mio = R.tipo[s0];
        while (ini < fin) {
          const i = cola[ini++], x = i % W;
          for (let k = 0; k < 4; k++) {
            let v;
            if (k === 0) v = i - W; else if (k === 1) v = i + W;
            else if (k === 2) v = x > 0 ? i - 1 : -1; else v = x < W - 1 ? i + 1 : -1;
            if (v < 0 || v >= n || !suelo(v)) continue;
            if (R.tipo[v] === mio) { if (!visto[v]) { visto[v] = 1; cola[fin++] = v; } }
            else sale = true;
          }
        }
        if (fin < 400) continue;                 // rincones sueltos, no tiendas
        total++;
        if (!sale) sueltas++;
      }
      return { sueltas, total };
    });
    comprobar(sinEntrada.sueltas === 0,
              `todas las tiendas tienen por dónde entrar ` +
              `(${sinEntrada.sueltas} sin entrada de ${sinEntrada.total})`);

    // --- 4. LOS CIERRES DE LOS JEFES SIGUEN CERRANDO -------------------------
    //
    // Nada más empezar, y con los cierres puestos, desde la entrada solo se
    // llega al primer anillo. Si algún muro se puede rodear, esto se dispara:
    // el mapa entero pasa a ser alcanzable y los tres jefes dejan de cerrar
    // nada. Llegó a estar en el 99,7%.
    const alcance = await pagina.evaluate(() => {
      const R = window.EMERITA.rejilla, W = R.ancho, n = R.ancho * R.alto;
      const suelo = (i) => R.solido[i] !== 1 && R.pie[i] !== 1;
      const visto = new Uint8Array(n), cola = new Int32Array(n);
      let fin = 0, ini = 0;
      const i0 = ((R.inicio.y / R.celda) | 0) * W + ((R.inicio.x / R.celda) | 0);
      cola[fin++] = i0; visto[i0] = 1;
      while (ini < fin) {
        const i = cola[ini++], x = i % W;
        for (let k = 0; k < 4; k++) {
          let v;
          if (k === 0) v = i - W; else if (k === 1) v = i + W;
          else if (k === 2) v = x > 0 ? i - 1 : -1; else v = x < W - 1 ? i + 1 : -1;
          if (v < 0 || v >= n || visto[v] || !suelo(v)) continue;
          visto[v] = 1; cola[fin++] = v;
        }
      }
      let total = 0;
      for (let i = 0; i < n; i++) if (suelo(i)) total++;
      return Math.round((fin / total) * 1000) / 10;
    });
    comprobar(alcance < 55,
              `con los cierres puestos solo se llega a parte del mapa ` +
              `(${alcance}% del suelo)`);

    // --- 5. LA GARANTÍA, en números -------------------------------------------
    //
    // La cara de una pared no se pisa: ni una sola de sus celdas puede estar
    // marcada como transitable. Es lo que dice que la pared es pared.
    const caraPisable = await pagina.evaluate(() => {
      const R = window.EMERITA.rejilla, n = R.ancho * R.alto;
      let malas = 0;
      for (let i = 0; i < n; i++) if (R.pie[i] === 1 && !R.solidoEnCelda(i % R.ancho, (i / R.ancho) | 0)) malas++;
      return malas;
    });
    comprobar(caraPisable === 0,
              `ninguna celda de cara de muro es transitable (${caraPisable})`);

    comprobar(excepciones.length === 0,
              excepciones.length === 0 ? 'sin excepciones por el camino'
                                       : 'EXCEPCIONES: ' + excepciones.join(' | '));
  } finally {
    await nav.close().catch(() => {});
    servidor.kill();
  }

  console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error('\nLa prueba ha reventado: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

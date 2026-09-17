# ---------------------------------------------------------------------------
# procesar-assets.ps1 - Convierte las ilustraciones de resources/ en sprites.
#
# Herramienta OFFLINE. No forma parte del juego: se ejecuta a mano, produce
# PNG y JSON planos, y el motor solo consume su salida. La regla de cero
# dependencias del proyecto se refiere al juego, no a este utillaje.
#
# Pasos: recorte de fondo -> medicion de silueta -> encuadre -> reduccion.
#
#   .\herramientas\procesar-assets.ps1
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class Procesador {

    // Estado del recorte de una imagen. Se pasa entero para no arrastrar diez
    // parametros por todas las funciones.
    class Contexto {
        public byte[] px; public int stride, w, h;
        public int[] pal;          // tonos dominantes del borde
        public int umbral;         // tolerancia de coincidencia con la paleta
    }

    // Devuelve: siluetaW|siluetaH|ratio|frameW|frameH|anclaX|anclaY|pctOpaco|fondo
    public static string Procesar(string entrada, string salida, int altoLog,
                                  int escala, int tol, int anchoLogFijo,
                                  bool dominante, bool centrado, bool huecos) {
        return Procesar(entrada, salida, altoLog, escala, tol, anchoLogFijo,
                        dominante, centrado, huecos, null);
    }

    // `alfaSalida`: ademas del sprite, guarda la ilustracion A TAMANO COMPLETO
    // con el fondo ya recortado. Null para no guardarla, que es lo normal.
    //
    // Existe por los RETRATOS. RecortarCabeza y RecortarCuerpo miden la silueta
    // por el canal alfa de la ilustracion ORIGINAL, y hay dibujos que llegan
    // opacos, con el fondo pintado de blanco en vez de vacio: Helen y Say. En
    // esos, la "silueta" es el rectangulo entero, el encuadre sale del centro
    // de la imagen y con el ancho de la imagen, y el retrato acaba siendo la
    // ilustracion entera vista de lejos en vez de un busto. Se veia al lado de
    // los otros seis en la tienda: dos caras diminutas entre seis bustos.
    //
    // El recorte por color YA FUNCIONA aqui —a Helen le quita el 76% del
    // lienzo—, asi que lo que faltaba no era saber recortar, era poder mirar
    // ese resultado a resolucion completa. En vez de repetir la inundacion en
    // las funciones de retrato, esta escribe lo que ya ha calculado.
    public static string Procesar(string entrada, string salida, int altoLog,
                                  int escala, int tol, int anchoLogFijo,
                                  bool dominante, bool centrado, bool huecos,
                                  string alfaSalida) {

        // --- 1. Carga normalizada a 32bpp ARGB -----------------------------
        Contexto c = new Contexto();
        using (Bitmap orig = new Bitmap(entrada)) {
            c.w = orig.Width; c.h = orig.Height;
            using (Bitmap src = new Bitmap(c.w, c.h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, c.w, c.h); }
                BitmapData d = src.LockBits(new Rectangle(0, 0, c.w, c.h),
                    ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                c.stride = d.Stride;
                c.px = new byte[c.stride * c.h];
                Marshal.Copy(d.Scan0, c.px, 0, c.px.Length);
                src.UnlockBits(d);
            }
        }
        byte[] b = c.px;
        int w = c.w, h = c.h, stride = c.stride;

        // --- 2. ¿La fuente ya trae transparencia? --------------------------
        // Si la trae, se respeta tal cual y NO se toca el color. Meter aqui el
        // recorte por color solo puede estropearlo: con el borde ya vacio la
        // paleta se muestrearia sobre pixeles transparentes y acabaria borrando
        // partes de la figura que casualmente coincidan.
        int transparentes = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (b[y * stride + x * 4 + 3] < 16) transparentes++;
            }
        }
        bool alfaPropia = transparentes * 100L > (long)w * h * 3;

        bool[] fondo = new bool[w * h];
        Queue<int> cola = new Queue<int>();

        if (alfaPropia) {
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    if (b[y * stride + x * 4 + 3] < 16) fondo[y * w + x] = true;
                }
            }
        } else {
            // --- 3. Recorte por inundacion desde los bordes ----------------
            c.pal = PaletaBorde(c);
            c.umbral = tol * 3;
            for (int x = 0; x < w; x++) {
                Sembrar(c, fondo, cola, x, 0);
                Sembrar(c, fondo, cola, x, h - 1);
            }
            for (int y = 0; y < h; y++) {
                Sembrar(c, fondo, cola, 0, y);
                Sembrar(c, fondo, cola, w - 1, y);
            }
            Inundar(c, fondo, cola);

            // Segunda pasada: bolsas de fondo que la figura encierra (entre las
            // piernas, bajo un brazo). El relleno desde el borde no las alcanza.
            // Se siembra solo con coincidencia casi exacta para no comerse detalle.
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    if (fondo[y * w + x]) continue;
                    if (EsFondo(c, x, y, 12)) { fondo[y * w + x] = true; cola.Enqueue(y * w + x); }
                }
            }
            Inundar(c, fondo, cola);
        }

        // Aplica el alfa y suaviza el halo del antialias del borde
        int minX = w, minY = h, maxX = -1, maxY = -1, opacos = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int p = y * stride + x * 4;
                if (fondo[y * w + x]) { b[p + 3] = 0; continue; }
                if (!alfaPropia) {
                    // Suaviza el halo del antialias contra el fondo recortado.
                    // Con alfa propia no hace falta: ya viene bien resuelto.
                    int dist = DistFondo(c, x, y);
                    if (dist < c.umbral && Vecino(fondo, w, h, x, y)) {
                        int a = dist * 255 / c.umbral;
                        if (a < b[p + 3]) b[p + 3] = (byte)a;
                    }
                }
                if (b[p + 3] > 8) {
                    opacos++;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return "VACIA";

        // La ilustracion con su alfa, a tamano completo, para quien tenga que
        // medir la silueta de verdad (ver la nota de `alfaSalida` arriba).
        // IsNullOrEmpty y no `!= null`: PowerShell convierte un $null a CADENA
        // VACIA al pasarlo a un parametro string, asi que las entradas que no
        // piden retrato -ataudes, mascotas, objetos- llegaban aqui con "" y se
        // iban a guardar en una ruta vacia. Reventaron todas de golpe.
        if (!string.IsNullOrEmpty(alfaSalida)) {
            using (Bitmap conAlfa = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                BitmapData da = conAlfa.LockBits(new Rectangle(0, 0, w, h),
                    ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                for (int y = 0; y < h; y++)
                    Marshal.Copy(b, y * stride, (IntPtr)(da.Scan0.ToInt64() + y * da.Stride), w * 4);
                conAlfa.UnlockBits(da);
                conAlfa.Save(alfaSalida, ImageFormat.Png);
            }
        }

        int silW = maxX - minX + 1, silH = maxY - minY + 1;
        double ratio = (double)silW / silH;

        // --- 4. Encuadre ---------------------------------------------------
        int frameW, frameH, destW, destH, offX, offY;
        frameH = altoLog * escala;
        if (anchoLogFijo > 0) {
            // Marco fijo comun, la silueta se ajusta dentro. Lo usan los
            // personajes y cualquier grupo que deba OCUPAR TODOS LO MISMO
            // independientemente de lo que mida cada dibujo.
            frameW = anchoLogFijo * escala;
            double fit = Math.Min((double)frameW / silW, (double)frameH / silH);
            destW = Math.Max(1, (int)Math.Round(silW * fit));
            destH = Math.Max(1, (int)Math.Round(silH * fit));
            offX = (frameW - destW) / 2;
            // `centrado` decide donde se apoya dentro del marco, y son dos casos
            // distintos de verdad: un personaje se apoya en la LINEA DE PIES
            // -si no, flota- y un objeto que se dibuja centrado en su posicion
            // (las gemas, ver entidades/recogible.js) tiene que ir centrado en
            // el marco o aparecera desplazado hacia arriba.
            offY = centrado ? (frameH - destH) / 2 : frameH - destH;
        } else {
            // Enemigos: el ancho sale de la proporcion real medida
            int anchoLog = (int)Math.Round(altoLog * ratio);
            if (anchoLog % 2 != 0) anchoLog++;
            if (anchoLog < 2) anchoLog = 2;
            frameW = anchoLog * escala;
            destW = frameW; destH = frameH; offX = 0; offY = 0;
        }

        // --- 5. Reduccion ---------------------------------------------------
        // Dos metodos, y la eleccion la hace el catalogo con `dominante`:
        //
        //   media de area  — lo normal. Para ilustraciones con volumen y
        //     degradados, que es casi todo el bestiario.
        //   color dominante — para dibujo de TINTAS PLANAS con detalle fino,
        //     donde promediar inventa colores que no estan y lo emborrona.
        //     Ver EscalarDominante: es lo que salva el escudo del ataud.
        //
        // Este bucle estaba escrito aqui a mano y era el mismo que
        // EscalarBloque, asi que ahora se llama a la funcion y no hay dos
        // copias de la misma reduccion que puedan separarse.
        byte[] dst = new byte[frameW * 4 * frameH];
        int dStride = frameW * 4;

        if (dominante) {
            EscalarDominante(b, stride, w, h, minX, minY, silW, silH,
                             dst, dStride, offX, offY, destW, destH);
        } else {
            EscalarBloque(b, stride, w, h, minX, minY, silW, silH,
                          dst, dStride, offX, offY, destW, destH);
        }

        // --- 6. Remate: endurecer el alfa y (si procede) tapar agujeros ----
        // `huecos` = el dibujo tiene huecos CERRADOS de verdad y hay que
        // respetarlos. Ver la cabecera de Rematar.
        Rematar(dst, frameW, frameH, dStride, !huecos);

        using (Bitmap salidaBmp = new Bitmap(frameW, frameH, PixelFormat.Format32bppArgb)) {
            BitmapData dd = salidaBmp.LockBits(new Rectangle(0, 0, frameW, frameH),
                ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < frameH; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            salidaBmp.UnlockBits(dd);
            salidaBmp.Save(salida, ImageFormat.Png);
        }

        // El indicador util es cuanto fondo se elimino, no el area de la caja:
        // una silueta puede tocar los cuatro bordes y estar bien recortada.
        // --- 7. NUCLEO SOLIDO ----------------------------------------------
        //
        // Que parte del sprite es masa de verdad y no fleco. Lo consume el juego
        // para decidir por donde NO se pasa (ver `huellaDe` en
        // sistemas/obstaculos.js): un obstaculo bloqueaba su recuadro entero, y
        // una ruina solo llena el 60-69% de el, asi que bloqueaba esquinas y
        // aire donde no hay piedra.
        //
        // POR PERCENTILES DE MASA, no por el primer pixel opaco ni por umbral de
        // cobertura. Las tres formas se probaron y solo esta hace lo que hace
        // falta:
        //
        //   Primer pixel opaco (el recuadro de siempre): una punta de escombro
        //     de tres pixeles asomando por un lado ensancha el bloqueo tanto
        //     como un muro entero.
        //
        //   Umbral de cobertura: se queda corto en un monton de escombro, donde
        //     casi todas las filas tienen ALGO. Medido con el umbral al 22%,
        //     recortaba un misero 6-8% — el bloqueo seguia siendo el recuadro.
        //
        //   Percentiles: se tira el DESCARTE% de la masa por cada lado y se
        //     conserva el resto. Corta el fleco disperso sin depender de si el
        //     dibujo es denso o ralo, que es la propiedad que hacia falta.
        int[] porCol = new int[frameW];
        int[] porFil = new int[frameH];
        long masa = 0;
        for (int y = 0; y < frameH; y++)
            for (int x = 0; x < frameW; x++)
                if (dst[y * dStride + x * 4 + 3] > 128) { porCol[x]++; porFil[y]++; masa++; }

        int sx0 = 0, sx1 = frameW - 1, sy0 = 0, sy1 = frameH - 1;
        if (masa > 0) {
            long corte = (long)(masa * DESCARTE);
            long acum = 0;
            while (sx0 < sx1 && acum + porCol[sx0] <= corte) { acum += porCol[sx0]; sx0++; }
            acum = 0;
            while (sx1 > sx0 && acum + porCol[sx1] <= corte) { acum += porCol[sx1]; sx1--; }
            acum = 0;
            while (sy0 < sy1 && acum + porFil[sy0] <= corte) { acum += porFil[sy0]; sy0++; }
            acum = 0;
            while (sy1 > sy0 && acum + porFil[sy1] <= corte) { acum += porFil[sy1]; sy1--; }
        }

        int pctOpaco = (int)Math.Round(100.0 * opacos / ((double)w * h));
        // El ancla vertical sigue al encuadre: abajo para lo que se apoya en la
        // linea de pies, y en medio para lo que se encuadro centrado. Publicar
        // frameH en un asset centrado seria un metadato falso esperando a que
        // alguien lo use.
        int anclaY = centrado ? frameH / 2 : frameH;
        return silW + "|" + silH + "|" + Math.Round(ratio, 2) + "|" +
               frameW + "|" + frameH + "|" + (frameW / 2) + "|" + anclaY + "|" + pctOpaco +
               "|" + sx0 + "|" + sy0 + "|" + (sx1 - sx0 + 1) + "|" + (sy1 - sy0 + 1);
    }

    // ---------------------------------------------------------------------
    // Retrato: recorte de la cabeza desde la ILUSTRACION ORIGINAL
    // ---------------------------------------------------------------------
    //
    // Del original, no del sprite del juego. El sprite mide 28x64 y su cabeza
    // son 20 pixeles: ampliarla para el panel daria una mancha. Aqui se recorta
    // de la fuente a resolucion completa (650x1492 en Eric) y se reduce una sola
    // vez al tamano final, asi que el retrato sale nitido y con detalle.
    //
    // Y NO se endurece el alfa ni se cuantiza: el panel de informacion es
    // interfaz, no pixel art. El juego va pixelado y las ventanas no tienen por
    // que; un retrato suave al lado de un mundo crujiente no desentona, se lee
    // como una ficha de personaje.
    //
    // Encuadre: se toma la franja superior de la silueta y se centra en el
    // centroide horizontal de ESA franja, no en el de la figura entera. Importa
    // porque un brazo estirado desplaza el centro del cuerpo pero no el de la
    // cabeza, y el retrato saldria descentrado.
    public static string RecortarCabeza(string entrada, string salida,
                                        int anchoSal, int altoSal,
                                        double fraccionAlto, double margen) {
        int w, h, stride;
        byte[] px;
        using (Bitmap orig = new Bitmap(entrada)) {
            w = orig.Width; h = orig.Height;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, w, h); }
                BitmapData d = src.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly,
                                            PixelFormat.Format32bppArgb);
                stride = d.Stride;
                px = new byte[stride*h];
                Marshal.Copy(d.Scan0, px, 0, px.Length);
                src.UnlockBits(d);
            }
        }

        // Silueta completa
        int minY = h, maxY = -1, minX = w, maxX = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                if (px[y*stride + x*4 + 3] > 40) {
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                }
        if (maxY < 0) return "VACIA";

        int altoSil = maxY - minY + 1;
        int yFin = minY + (int)(altoSil * fraccionAlto);

        // Centroide horizontal SOLO de la franja de la cabeza
        long suma = 0; int cuenta = 0;
        int hMinX = w, hMaxX = -1;
        for (int y = minY; y <= yFin; y++)
            for (int x = minX; x <= maxX; x++)
                if (px[y*stride + x*4 + 3] > 40) {
                    suma += x; cuenta++;
                    if (x < hMinX) hMinX = x; if (x > hMaxX) hMaxX = x;
                }
        if (cuenta == 0) return "VACIA";
        int cx = (int)(suma / cuenta);

        // Caja de recorte. El ANCHO lo fija la cabeza; el ALTO sale de la
        // proporcion pedida y crece hacia ABAJO, hacia los hombros.
        //
        // Es un BUSTO, no una cabeza recortada en cuadrado. La ficha de jugador
        // reserva una columna alta y estrecha para el retrato, y meter ahi una
        // imagen cuadrada obliga a elegir entre dejar huecos o recortar media
        // cara. Encuadrando cabeza y hombros desde el principio, el retrato
        // llena su hueco tal cual y ademas se lee mejor: una cabeza flotando
        // sin cuello parece un icono, un busto parece una ficha de personaje.
        int altoCabeza = yFin - minY + 1;
        int anchoCabeza = hMaxX - hMinX + 1;
        int anchoCaja = (int)(Math.Max(altoCabeza, anchoCabeza) * (1.0 + margen));
        int altoCaja = (int)((long)anchoCaja * altoSal / anchoSal);
        int x0 = cx - anchoCaja / 2;
        int y0 = minY - (int)(altoCabeza * margen * 0.5);

        int dStride = anchoSal * 4;
        byte[] dst = new byte[dStride * altoSal];
        EscalarBloque(px, stride, w, h, x0, y0, anchoCaja, altoCaja,
                      dst, dStride, 0, 0, anchoSal, altoSal);

        using (Bitmap sal = new Bitmap(anchoSal, altoSal, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,anchoSal,altoSal),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < altoSal; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return anchoSal + "|" + altoSal + "|1";
    }

    // ---------------------------------------------------------------------
    // Retrato de CUERPO ENTERO, para la ficha de jugador
    // ---------------------------------------------------------------------
    //
    // Misma idea que RecortarCabeza y por los mismos motivos —se reduce UNA vez
    // desde la ilustracion original, sin endurecer alfa ni cuantizar— pero aqui
    // entra la figura completa: la ficha que se abre con Select ensena al
    // personaje de arriba abajo.
    //
    // La imagen sale AJUSTADA A LA SILUETA y centrada en su caja, con relleno
    // transparente por donde sobra. Asi la interfaz puede dibujarla sin mas: no
    // tiene que adivinar donde empieza la figura dentro del PNG ni recortar
    // margenes al vuelo, y todos los personajes ocupan su hueco igual aunque uno
    // sea mas ancho que otro.
    public static string RecortarCuerpo(string entrada, string salida,
                                        int anchoSal, int altoSal) {
        int w, h, stride;
        byte[] px;
        using (Bitmap orig = new Bitmap(entrada)) {
            w = orig.Width; h = orig.Height;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, w, h); }
                BitmapData d = src.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly,
                                            PixelFormat.Format32bppArgb);
                stride = d.Stride;
                px = new byte[stride*h];
                Marshal.Copy(d.Scan0, px, 0, px.Length);
                src.UnlockBits(d);
            }
        }

        int minY = h, maxY = -1, minX = w, maxX = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                if (px[y*stride + x*4 + 3] > 40) {
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                }
        if (maxY < 0) return "VACIA";

        int silW = maxX - minX + 1;
        int silH = maxY - minY + 1;

        // Encaje "contener": manda el lado que se quede corto, para que no se
        // recorte nada. Un personaje no puede salir sin pies en su propia ficha.
        double escala = Math.Min((double)anchoSal / silW, (double)altoSal / silH);
        int dw = Math.Max(1, (int)(silW * escala));
        int dh = Math.Max(1, (int)(silH * escala));
        int dx0 = (anchoSal - dw) / 2;
        int dy0 = altoSal - dh;          // apoyado abajo: los pies en el suelo

        int dStride = anchoSal * 4;
        byte[] dst = new byte[dStride * altoSal];
        EscalarBloque(px, stride, w, h, minX, minY, silW, silH,
                      dst, dStride, dx0, dy0, dw, dh);

        using (Bitmap sal = new Bitmap(anchoSal, altoSal, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,anchoSal,altoSal),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < altoSal; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        // El tercer numero es LO QUE MIDE LA FIGURA DENTRO del lienzo, que no
        // es el lienzo: el encaje "contener" deja aire arriba en cuanto el
        // dibujo es mas ancho de la cuenta -Sara ocupa 624 de los 760- y sin
        // este dato quien la dibuje no tiene forma de saberlo. Lo necesita la
        // pantalla de seleccion para que las ocho salgan con SU estatura y no
        // con la que les toque segun lo anchas que sean. Ver `alto` en la
        // entrada <id>Cuerpo del atlas.
        return anchoSal + "|" + altoSal + "|1|" + dh;
    }

    // ---------------------------------------------------------------------
    // Animacion horneada de personajes
    // ---------------------------------------------------------------------
    //
    // Convierte el sprite de un fotograma que acaba de escribir Procesar() en
    // una tira de 6: 2 de quieto y 4 de andar. Deforma la unica pose que hay,
    // igual que hacia el motor en tiempo real, pero OFFLINE, que cambia dos
    // cosas importantes:
    //
    //   - Se puede afinar por personaje (donde empiezan las piernas no es igual
    //     en Eric que en Vicky) y revisar el resultado fotograma a fotograma.
    //   - El juego se queda con un drawImage por entidad y cero matematicas de
    //     deformacion. Mas rapido y, sobre todo, sin el hormigueo que provoca
    //     reescalar en fracciones de pixel cada frame.
    //
    // Un paso de verdad es ANTISIMETRICO: una pierna sube mientras la otra
    // apoya. El apano que tenia el motor ensanchaba las dos a la vez y salia
    // patizambo. Aqui se levanta una sola, con el desplazamiento creciendo de
    // cero en la cadera a maximo en el pie, para que no aparezca un escalon.
    //
    // Ciclo: paso izquierdo, pase alto, paso derecho, pase alto. En un andar
    // real el cuerpo esta MAS ALTO en el pase, cuando ninguna pierna apoya del
    // todo, y por eso los fotogramas 1 y 3 del ciclo suben el cuerpo un pixel.
    //
    // modo "falda": Lucy lleva vestido hasta los tobillos y no tiene piernas
    // que separar. Se le balancea el bajo en horizontal, que es lo que hace una
    // falda al andar.
    // Fraccion del alto a la que estan los hombros. La inclinacion lateral deja
    // de crecer aqui: de los hombros para arriba la cabeza se desplaza ENTERA,
    // como un bloque. Si el desplazamiento siguiera creciendo hasta la coronilla,
    // la cara se cizallaria contra el cuello y se veria un tajo; ya paso en el
    // primer intento y en Vicky, con el pelo suelto, era escandaloso.
    const double HOMBROS = 0.28;

    public static string AnimarPersonaje(string archivo, double cadera,
                                         int ampPierna, bool falda, int ampEscora) {
        int w, h, stride;
        byte[] px;
        using (Bitmap b = new Bitmap(archivo)) {
            w = b.Width; h = b.Height;
            BitmapData d = b.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly,
                                      PixelFormat.Format32bppArgb);
            stride = d.Stride;
            px = new byte[stride*h];
            Marshal.Copy(d.Scan0, px, 0, px.Length);
            b.UnlockBits(d);
        }

        // 0-1 quieto, 2-5 andar de frente, 6-9 andar de lado (escorado).
        const int FRAMES = 10;
        int yCadera = (int)Math.Round(h * cadera);
        if (yCadera < 1) yCadera = 1;
        if (yCadera > h - 2) yCadera = h - 2;
        int yHombros = (int)Math.Round(h * HOMBROS);
        int centro = w / 2;

        int tiraW = w * FRAMES;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * h];

        for (int f = 0; f < FRAMES; f++) {
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int sx = x, sy = y;

                    // t: 0 en la cadera, 1 en los pies. Fuera de las piernas es 0.
                    double t = y > yCadera ? (double)(y - yCadera) / (h - yCadera) : 0.0;
                    // u: 1 en la coronilla, 0 en la cadera. Para el torso.
                    double u = y < yCadera ? (double)(yCadera - y) / yCadera : 0.0;

                    // Los fotogramas laterales reutilizan el ciclo frontal y le
                    // suman la escora. El pie que apoya no se inclina.
                    int paso = f >= 6 ? f - 4 : f;

                    switch (paso) {
                        case 0:                       // quieto, pose original
                            break;
                        case 1:                       // quieto, respirando
                            sy = y - (int)Math.Round(u);
                            break;
                        case 2:                       // paso: apoya izquierda
                            if (falda) sx = x - (int)Math.Round(t);
                            else if (x < centro) sy = y + (int)Math.Round(ampPierna * t);
                            break;
                        // Pase: las dos piernas juntas y el cuerpo un pixel mas
                        // alto. NO se balancea el torso en horizontal: la
                        // deformacion crecia hasta la coronilla y despegaba la
                        // cabeza de los hombros, que en pelo suelto se veia como
                        // un tajo. Un pixel de cizalla lateral en una cara de 20
                        // pixeles es medio rostro movido.
                        case 3:
                        case 5:
                            sy = y + 1;
                            break;
                        case 4:                       // paso: apoya derecha
                            if (falda) sx = x + (int)Math.Round(t);
                            else if (x >= centro) sy = y + (int)Math.Round(ampPierna * t);
                            break;
                    }

                    // --- Escora lateral --------------------------------
                    // Solo en los fotogramas 6-9. Crece de cero en los pies a
                    // maximo en los hombros, y de ahi arriba se mantiene: el
                    // cuerpo se inclina hacia donde va y la cabeza le acompana
                    // entera. Es lo que quita la sensacion de patinar de lado
                    // que da un sprite frontal desplazandose en horizontal.
                    if (f >= 6 && ampEscora > 0) {
                        double v = y >= h - 1 ? 0.0
                                 : Math.Min(1.0, (double)(h - 1 - y) / (h - 1 - yHombros));
                        sx -= (int)Math.Round(ampEscora * v);
                    }

                    int q = y * dStride + (f * w + x) * 4;
                    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;   // queda transparente
                    int s = sy * stride + sx * 4;
                    dst[q]     = px[s];
                    dst[q + 1] = px[s + 1];
                    dst[q + 2] = px[s + 2];
                    dst[q + 3] = px[s + 3];
                }
            }
        }

        using (Bitmap sal = new Bitmap(tiraW, h, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,tiraW,h), ImageLockMode.WriteOnly,
                                         PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(archivo, ImageFormat.Png);
        }
        return w + "|" + h + "|" + FRAMES;
    }

    // ---------------------------------------------------------------------
    // GIF animado
    // ---------------------------------------------------------------------
    //
    // Devuelve: frameW|frameH|frames|factorNativo|silueta
    //
    // Tres decisiones que no son obvias:
    //
    // 1. CAJA COMUN. El recorte se hace con la union de las siluetas de TODOS
    //    los fotogramas, nunca con la de cada uno. Recortando por fotograma, un
    //    aleteo que sube y baja quedaria centrado en todos y la animacion se
    //    perderia: el bicho se quedaria quieto dando tirones de tamano.
    //
    // 2. MUESTREO EN LA REJILLA NATIVA. Estos GIF suelen ser pixel art pequeno
    //    ampliado por bloques (este es 48x48 escalado 8x). Si se detecta el
    //    factor, se coge UN pixel por bloque en vez de promediar: el resultado
    //    es identico al original que dibujo el artista, sin un solo pixel
    //    inventado. Promediar sobre una rejilla exacta daria lo mismo, pero solo
    //    si los bordes caen justo; asi no hay que confiar en que caigan.
    //
    // 3. VOLTEO. El motor asume que todo mira a la DERECHA. Voltear aqui, una
    //    vez, es gratis; voltear en el juego costaria una copia espejo mas.
    // `deCada` DIEZMA los fotogramas: 3 se queda con uno de cada tres. Vale 1
    // para casi todos los GIF y solo hace falta cuando el arte viene a mas
    // fotogramas por segundo de los que el juego reproduce.
    //
    // El juego anima TODO enemigo a 10 fps fijos (SEG_POR_FRAME en
    // entidades/enemigo.js), asi que el numero de fotogramas no decide solo el
    // detalle: decide LO QUE DURA LA VUELTA. La gargola llego con 155
    // fotogramas a 33,3 fps -4,65 segundos de animacion- y a 10 fps eso son
    // 15,5 segundos por vuelta, o sea la misma animacion a un tercio de
    // velocidad. Quedandose uno de cada tres, las 52 restantes duran 5,2
    // segundos: practicamente lo que se dibujo.
    public static string ProcesarGif(string entrada, string salida, int escala,
                                     int altoLogMax, bool voltear, int deCada) {
        using (Image gif = Image.FromFile(entrada)) {
            FrameDimension fd = new FrameDimension(gif.FrameDimensionsList[0]);
            int nf = gif.GetFrameCount(fd);
            int w = gif.Width, h = gif.Height;

            // --- Volcar todos los fotogramas ya compuestos -----------------
            // GDI+ aplica el metodo de descarte al seleccionar, asi que cada
            // fotograma sale entero aunque el GIF lo guarde como delta.
            byte[][] marcos = new byte[nf][];
            int stride = 0;
            for (int f = 0; f < nf; f++) {
                gif.SelectActiveFrame(fd, f);
                using (Bitmap b = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                    using (Graphics g = Graphics.FromImage(b)) { g.DrawImage(gif, 0, 0, w, h); }
                    BitmapData d = b.LockBits(new Rectangle(0, 0, w, h),
                        ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                    stride = d.Stride;
                    marcos[f] = new byte[stride * h];
                    Marshal.Copy(d.Scan0, marcos[f], 0, marcos[f].Length);
                    b.UnlockBits(d);
                }
            }

            // Diezmado, ANTES de medir nada: lo que se tira no debe influir en
            // la caja comun ni en el factor nativo.
            if (deCada > 1 && nf > deCada) {
                int m = (nf + deCada - 1) / deCada;
                byte[][] pocos = new byte[m][];
                for (int i = 0; i < m; i++) pocos[i] = marcos[i * deCada];
                marcos = pocos;
                nf = m;
            }

            int factor = FactorNativo(marcos, w, h, stride);

            // El GIF puede venir SIN alfa util: todo el lienzo pintado de un
            // color claro y solo un reborde transparente. Se le quita antes de
            // medir nada -- si no, la caja comun sale del lienzo entero y el
            // bicho se guarda con su recuadro blanco puesto.
            QuitarFondoOpaco(marcos, w, h, stride);

            // --- Caja comun a todos los fotogramas -------------------------
            int minX = w, minY = h, maxX = -1, maxY = -1;
            for (int f = 0; f < nf; f++) {
                byte[] px = marcos[f];
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++) {
                        if (px[y * stride + x * 4 + 3] < 128) continue;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
            }
            if (maxX < 0) return "VACIA";

            // Cuadrar la caja a la rejilla nativa: si el muestreo empieza a
            // media celda, se coge el pixel equivocado y la silueta sale
            // desplazada medio bloque.
            minX = (minX / factor) * factor;
            minY = (minY / factor) * factor;
            maxX = ((maxX / factor) + 1) * factor - 1;
            maxY = ((maxY / factor) + 1) * factor - 1;
            if (maxX >= w) maxX = w - 1;
            if (maxY >= h) maxY = h - 1;

            int cajaW = maxX - minX + 1, cajaH = maxY - minY + 1;
            int frameW = cajaW / factor, frameH = cajaH / factor;

            // Red de seguridad para GIF que no sean pixel art: si al tamano
            // nativo sigue siendo enorme, se reduce al alto pedido.
            int topeH = altoLogMax * escala;
            double extra = 1.0;
            if (frameH > topeH) {
                extra = (double)topeH / frameH;
                frameH = topeH;
                frameW = Math.Max(1, (int)Math.Round(frameW * extra));
            } else if (frameH < topeH) {
                // AMPLIAR por bloques ENTEROS: mismo principio que ESCALA_ARTE
                // en el resto del motor -- sin interpolar, cada pixel nativo se
                // convierte en un bloque de mul x mul. Antes esta rama no
                // existia, y un GIF cuya rejilla nativa se quedara corta
                // respecto al alto pedido (la gargola, con su rejilla de 8x a
                // 37px) se quedaba SIEMPRE en su tamano nativo pasara lo que
                // pasara con `alto`: la red de seguridad solo sabia reducir.
                //
                // PERO el bloque entero solo vale si cae CERCA del alto pedido.
                // La regla se penso para pixel art diminuto, donde el multiplo
                // es 2 o 3 y redondear cuesta poco. Con los GIF de los jefes la
                // rejilla nativa ya es casi tan grande como el sprite final, y
                // ahi redondear a un entero es un disparate: la hidra pedia 320
                // y el bloque x2 la dejaba en 408, la loba pedia 360 y el x1 la
                // dejaba en 249. El jefe FINAL salia mas pequeno que el
                // intermedio, que es exactamente lo contrario de lo que el
                // catalogo dice. Manda el alto pedido; el bloque entero es una
                // optimizacion, no la verdad.
                int mul = Math.Max(1, (int)Math.Round((double)topeH / frameH));
                int conBloques = frameH * mul;
                if (Math.Abs(conBloques - topeH) * 100 <= topeH * 8) {
                    frameH = conBloques;
                    frameW *= mul;
                } else {
                    frameW = Math.Max(1, (int)Math.Round((double)frameW * topeH / frameH));
                    frameH = topeH;
                }
            }

            // --- Componer la tira ------------------------------------------
            int tiraW = frameW * nf;
            byte[] dst = new byte[tiraW * 4 * frameH];
            int dStride = tiraW * 4;

            for (int f = 0; f < nf; f++) {
                byte[] px = marcos[f];
                for (int y = 0; y < frameH; y++) {
                    for (int x = 0; x < frameW; x++) {
                        // Pixel de origen: centro del bloque nativo
                        int sx = minX + (int)((x + 0.5) * cajaW / frameW);
                        int sy = minY + (int)((y + 0.5) * cajaH / frameH);
                        if (sx > maxX) sx = maxX;
                        if (sy > maxY) sy = maxY;
                        int s = sy * stride + sx * 4;

                        int xd = voltear ? (frameW - 1 - x) : x;
                        int q = y * dStride + (f * frameW + xd) * 4;
                        dst[q]     = px[s];
                        dst[q + 1] = px[s + 1];
                        dst[q + 2] = px[s + 2];
                        dst[q + 3] = px[s + 3] < 128 ? (byte)0 : (byte)255;
                    }
                }
            }

            using (Bitmap sal = new Bitmap(tiraW, frameH, PixelFormat.Format32bppArgb)) {
                BitmapData dd = sal.LockBits(new Rectangle(0, 0, tiraW, frameH),
                    ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                for (int y = 0; y < frameH; y++)
                    Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
                sal.UnlockBits(dd);
                sal.Save(salida, ImageFormat.Png);
            }

            return frameW + "|" + frameH + "|" + nf + "|" + factor + "|" + cajaW + "x" + cajaH;
        }
    }

    // ---------------------------------------------------------------------
    // Reposo aniadido a una tira ya escrita
    // ---------------------------------------------------------------------
    //
    // Los GIF de personaje que dibuja Sergio son ciclo de andar y solo eso: no
    // traen pose de reposo. Y un personaje parado que se queda clavado en un
    // fotograma del paso parece congelado, no quieto — se ve enseguida, porque
    // en este juego se pasa mucho rato parado disparando.
    //
    // Misma solucion que ya usa RecortarHoja con las hojas dibujadas a mano: se
    // copian nQuieto fotogramas del `idle` al final de la tira y el segundo baja
    // UN pixel. Un solo pixel a 2 fps es lo justo para que se lea como peso, y
    // no hay que pedirle al artista una animacion de reposo por personaje.
    //
    // Va aparte de ProcesarGif y no dentro: ProcesarGif lo usan los trece
    // enemigos y esta probado, y un bicho no tiene reposo que anadir.
    public static string AnyadirReposo(string archivo, int nFrames, int idle, int nQuieto) {
        byte[] px; int w, h, stride;
        CargarPx(archivo, out px, out w, out h, out stride);
        int frameW = w / nFrames;

        int total = nFrames + nQuieto;
        int dStride = frameW * total * 4;
        byte[] dst = new byte[dStride * h];

        for (int y = 0; y < h; y++)
            for (int f = 0; f < nFrames; f++)
                Array.Copy(px, y * stride + f * frameW * 4,
                           dst, y * dStride + f * frameW * 4, frameW * 4);

        int origen = Math.Max(0, Math.Min(nFrames - 1, idle)) * frameW;
        for (int k = 0; k < nQuieto; k++) {
            int destino = (nFrames + k) * frameW;
            for (int y = 0; y < h; y++) {
                int sy = y - k;                    // 0, 1, 2... pixeles hacia abajo
                if (sy < 0) continue;
                Array.Copy(dst, sy * dStride + origen * 4,
                           dst, y * dStride + destino * 4, frameW * 4);
            }
        }

        using (Bitmap sal = new Bitmap(frameW * total, h, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, frameW * total, h),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(archivo, ImageFormat.Png);
        }
        return frameW + "|" + h + "|" + total;
    }

    // ---------------------------------------------------------------------
    // Fondo opaco de un GIF exportado sin transparencia
    // ---------------------------------------------------------------------
    //
    // El GIF de Plinio el Buho viene con su alfa y se ve perfecto; los de Oreo
    // el Conejo y el Pollito Fantasma vienen con el lienzo entero pintado de
    // blanco y solo un reborde de un pixel transparente. Como todo lo demas
    // esta opaco, la caja comun salia siendo el lienzo entero y el bicho se
    // guardaba con su recuadro blanco -- que es como se veian en la tienda.
    //
    // POR INUNDACION DESDE EL BORDE, no por color. Es LA decision de esta
    // funcion: el conejo es blanco. Borrar "todo lo que se parezca al blanco"
    // le comeria la barriga, el rabo y media cara. Inundando desde fuera solo
    // se borra el blanco que se puede alcanzar sin cruzar el contorno del
    // dibujo, y el de dentro se queda donde esta.
    //
    // No hace falta decir que GIF lo necesita y cual no: si el borde ya viene
    // transparente no hay color de fondo que inundar y la funcion no toca nada.
    // Asi Plinio pasa por aqui sin enterarse.
    //
    // TOLERANCIA PEQUENA (12 por canal). Estos GIF son pixel art ampliado por
    // bloques enteros, sin interpolar, asi que el fondo es UN color plano y el
    // contorno del bicho es un salto brusco: no hay degradado que perseguir, y
    // una tolerancia grande solo sirve para colarse por un pixel claro del
    // contorno y vaciar el sprite por dentro.
    const int TOL_FONDO = 12;

    static void QuitarFondoOpaco(byte[][] marcos, int w, int h, int stride) {
        for (int m = 0; m < marcos.Length; m++) {
            byte[] px = marcos[m];

            // Color del fondo: el opaco mas repetido del borde del lienzo.
            // Contarlos y no fiarse de la esquina evita que una firma, una
            // sombra o un pixel suelto en la esquina decidan por todo el marco.
            Dictionary<int, int> votos = new Dictionary<int, int>();
            int opacos = 0, borde = 0;
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++) {
                    if (x != 0 && y != 0 && x != w - 1 && y != h - 1) continue;
                    borde++;
                    int p = y * stride + x * 4;
                    if (px[p + 3] < 128) continue;
                    opacos++;
                    int llave = (px[p + 2] << 16) | (px[p + 1] << 8) | px[p];
                    int n; votos.TryGetValue(llave, out n);
                    votos[llave] = n + 1;
                }

            // Borde practicamente transparente: el GIF ya trae su alfa.
            if (opacos * 100 < borde * 10) continue;

            int ganador = -1, mejor = 0;
            foreach (KeyValuePair<int, int> v in votos)
                if (v.Value > mejor) { mejor = v.Value; ganador = v.Key; }
            if (ganador < 0) continue;

            int fr = (ganador >> 16) & 255, fg = (ganador >> 8) & 255, fb = ganador & 255;

            // Inundacion en cuatro direcciones desde todo el borde. Solo avanza
            // por pixeles que sean fondo (o que ya estuvieran transparentes),
            // asi que se para en cuanto toca el contorno del dibujo.
            bool[] visto = new bool[w * h];
            Queue<int> cola = new Queue<int>();
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++) {
                    if (x != 0 && y != 0 && x != w - 1 && y != h - 1) continue;
                    int i = y * w + x;
                    if (visto[i]) continue;
                    if (!EsFondo(px, y * stride + x * 4, fr, fg, fb)) continue;
                    visto[i] = true;
                    cola.Enqueue(i);
                }

            while (cola.Count > 0) {
                int i = cola.Dequeue();
                int x = i % w, y = i / w;
                px[y * stride + x * 4 + 3] = 0;
                for (int d = 0; d < 4; d++) {
                    int nx = x + (d == 0 ? 1 : d == 1 ? -1 : 0);
                    int ny = y + (d == 2 ? 1 : d == 3 ? -1 : 0);
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    int j = ny * w + nx;
                    if (visto[j]) continue;
                    if (!EsFondo(px, ny * stride + nx * 4, fr, fg, fb)) continue;
                    visto[j] = true;
                    cola.Enqueue(j);
                }
            }
        }
    }

    static bool EsFondo(byte[] px, int p, int fr, int fg, int fb) {
        if (px[p + 3] < 128) return true;                  // ya transparente
        return Math.Abs(px[p + 2] - fr) <= TOL_FONDO &&
               Math.Abs(px[p + 1] - fg) <= TOL_FONDO &&
               Math.Abs(px[p]     - fb) <= TOL_FONDO;
    }

    // ---------------------------------------------------------------------
    // Bandera de la intro: fuera el fondo, y a la medida
    // ---------------------------------------------------------------------
    //
    // La ilustracion viene en JPEG sobre fondo blanco, y el JPEG no sabe de
    // transparencia.
    //
    // Quitar ese fondo NO es "borrar todo lo blanco": LA FRANJA CENTRAL DE LA
    // BANDERA EXTREMENA TAMBIEN ES BLANCA -medido, el 60% del dibujo es casi
    // blanco- y un borrado por color se la llevaria por delante, dejando un
    // agujero en mitad del pano por donde se veria el cielo.
    //
    // Asi que se INUNDA DESDE EL BORDE: se parte de los pixeles del marco y se
    // avanza a los vecinos mientras se sigan pareciendo al fondo. Lo que no se
    // alcanza desde fuera se queda, y la franja blanca del centro esta rodeada
    // de verde y de negro, asi que la inundacion nunca llega hasta ella.
    //
    // Y el JPEG deja HALO: alrededor del dibujo quedan pixeles a medio camino
    // entre el blanco y el color, que ni son fondo ni son tela. A esos se les
    // da alfa PARCIAL segun lo lejos que esten del fondo, que es lo que evita
    // el diente de sierra blanco al recortar contra un cielo oscuro.
    //
    // Devuelve: anchoFinal|altoFinal|pctOpaco
    public static string RecortarBandera(string entrada, string salida, int anchoDest) {
        int w, h, stride;
        byte[] px;
        using (Bitmap orig = new Bitmap(entrada)) {
            w = orig.Width; h = orig.Height;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) g.DrawImage(orig, 0, 0, w, h);
                BitmapData bd = src.LockBits(new Rectangle(0, 0, w, h),
                                             ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                stride = bd.Stride;
                px = new byte[stride * h];
                Marshal.Copy(bd.Scan0, px, 0, px.Length);
                src.UnlockBits(bd);
            }
        }

        // Color del fondo: el mas repetido del BORDE del lienzo. Contarlos y no
        // fiarse de la esquina es la misma precaucion que en QuitarFondoOpaco:
        // una firma o un pixel suelto en una esquina no debe decidir por todo.
        Dictionary<int, int> votos = new Dictionary<int, int>();
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                if (x != 0 && y != 0 && x != w - 1 && y != h - 1) continue;
                int p = y * stride + x * 4;
                int llave = (px[p + 2] << 16) | (px[p + 1] << 8) | px[p];
                int n; votos.TryGetValue(llave, out n); votos[llave] = n + 1;
            }
        int mejor = 0xFFFFFF, mejorN = -1;
        foreach (KeyValuePair<int, int> kv in votos)
            if (kv.Value > mejorN) { mejorN = kv.Value; mejor = kv.Key; }
        int fr = (mejor >> 16) & 255, fg = (mejor >> 8) & 255, fb = mejor & 255;

        // Tolerancia mas ancha que TOL_FONDO: esto es un JPEG, y su fondo
        // "blanco" no es 255,255,255 uniforme sino un blanco que respira un par
        // de puntos por la compresion.
        const int TOL = 26;

        bool[] fuera = new bool[w * h];
        Queue<int> cola = new Queue<int>();
        for (int x = 0; x < w; x++) {
            SembrarFondo(px, stride, fuera, cola, x, 0, w, fr, fg, fb, TOL);
            SembrarFondo(px, stride, fuera, cola, x, h - 1, w, fr, fg, fb, TOL);
        }
        for (int y = 0; y < h; y++) {
            SembrarFondo(px, stride, fuera, cola, 0, y, w, fr, fg, fb, TOL);
            SembrarFondo(px, stride, fuera, cola, w - 1, y, w, fr, fg, fb, TOL);
        }
        while (cola.Count > 0) {
            int idx = cola.Dequeue();
            int x = idx % w, y = idx / w;
            if (x > 0)     SembrarFondo(px, stride, fuera, cola, x - 1, y, w, fr, fg, fb, TOL);
            if (x < w - 1) SembrarFondo(px, stride, fuera, cola, x + 1, y, w, fr, fg, fb, TOL);
            if (y > 0)     SembrarFondo(px, stride, fuera, cola, x, y - 1, w, fr, fg, fb, TOL);
            if (y < h - 1) SembrarFondo(px, stride, fuera, cola, x, y + 1, w, fr, fg, fb, TOL);
        }

        // Alfa: fuera a cero, y el contorno a medio camino segun su distancia al
        // color del fondo. `fuera` es la autoridad, no el alfa, asi que da igual
        // el orden en que se recorra.
        long opacos = 0;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                int idx = y * w + x, p = y * stride + x * 4;
                if (fuera[idx]) { px[p + 3] = 0; continue; }
                opacos++;
                bool toca = (x > 0 && fuera[idx - 1]) || (x < w - 1 && fuera[idx + 1]) ||
                            (y > 0 && fuera[idx - w]) || (y < h - 1 && fuera[idx + w]);
                if (!toca) continue;
                int d = Math.Max(Math.Abs(px[p + 2] - fr),
                        Math.Max(Math.Abs(px[p + 1] - fg), Math.Abs(px[p] - fb)));
                int a = d * 255 / (TOL * 3);
                px[p + 3] = (byte)(a > 255 ? 255 : a);
            }

        // Encuadre a lo que ha quedado opaco: el original trae 443 pixeles de
        // blanco por arriba y 130 por abajo, y cargarlos seria pagar por nada.
        int minx = w, maxx = -1, miny = h, maxy = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                if (px[y * stride + x * 4 + 3] > 8) {
                    if (x < minx) minx = x;
                    if (x > maxx) maxx = x;
                    if (y < miny) miny = y;
                    if (y > maxy) maxy = y;
                }
        if (maxx < minx) return "0|0|0";
        int cw = maxx - minx + 1, ch = maxy - miny + 1;

        using (Bitmap full = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
            BitmapData bd = full.LockBits(new Rectangle(0, 0, w, h),
                                          ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++)
                Marshal.Copy(px, y * stride, (IntPtr)(bd.Scan0.ToInt64() + y * bd.Stride), w * 4);
            full.UnlockBits(bd);

            int destW = anchoDest > 0 ? anchoDest : cw;
            int destH = (int)Math.Round(ch * (double)destW / cw);
            using (Bitmap sal = new Bitmap(destW, destH, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(sal)) {
                    g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                    g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
                    g.DrawImage(full, new Rectangle(0, 0, destW, destH),
                                minx, miny, cw, ch, GraphicsUnit.Pixel);
                }
                Guardar(sal, salida, 90);
            }
            int pct = (int)(100L * opacos / (w * (long)h));
            return destW + "|" + destH + "|" + pct;
        }
    }

    static void SembrarFondo(byte[] px, int stride, bool[] fuera, Queue<int> cola,
                             int x, int y, int w, int fr, int fg, int fb, int tol) {
        int idx = y * w + x;
        if (fuera[idx]) return;
        int p = y * stride + x * 4;
        if (Math.Abs(px[p + 2] - fr) > tol) return;
        if (Math.Abs(px[p + 1] - fg) > tol) return;
        if (Math.Abs(px[p]     - fb) > tol) return;
        fuera[idx] = true;
        cola.Enqueue(idx);
    }

    // ---------------------------------------------------------------------
    // Ruleta del cofre: se guarda SOLO EL ARMAZON
    // ---------------------------------------------------------------------
    //
    // La ilustracion trae la rueda entera -aro, puntero, soporte y las ocho
    // porciones de color- en un solo dibujo. Para animarla hay que girar solo la
    // cara; si se girase la imagen entera, el soporte daria vueltas con ella y el
    // puntero dejaria de apuntar a nada.
    //
    // El primer intento fue partirla en dos por un circulo: disco que gira y
    // marco que no. No funciono, y el motivo es que LA RUEDA DIBUJADA NO ES UN
    // CIRCULO. Su canto va de 528 a 541 pixeles segun por donde se mida y el
    // borde interior del aro es todavia mas irregular, asi que cualquier corte
    // circular deja al disco con una silueta ondulada: al girar, el canto se
    // movia, el aro parecia doble y aparecia una costura recorriendo la rueda.
    // Se probaron cuatro radios y dos remiendos por simetria; ninguno lo arregla,
    // porque el problema no es el corte sino que se esta girando un dibujo hecho
    // a mano que no es simetrico de revolucion.
    //
    // Asi que aqui se guarda SOLO EL ARMAZON -aro, tachones, puntero y soporte-,
    // que es la parte con caracter y la que NO gira, y la cara de colores la
    // traza el juego con ocho sectores (ver ui/cofre.js). Un sector trazado es
    // perfectamente circular por definicion: gire lo que gire, no hay silueta que
    // ondule ni pixel que remuestrear. Y el dibujo de Sergio sigue siendo lo que
    // se ve, porque el aro y el puntero son lo que se mira.
    //
    // Medidas tomadas sobre el original (1205x1305): centro (600,5, 615,5). El
    // recorte se queda con TODO lo que este a mas de RADIO_HUECO del centro, y
    // nada mas: sin filtros de color ni excepciones.
    //
    // El corte cae por DENTRO del aro pero por FUERA de donde su borde interior
    // llega en el sitio en que mas se mete (el dibujo lo tiene entre el radio 419
    // y el 466 segun el angulo). Se pierden unos pixeles del labio interior del
    // aro por arriba, y a cambio el hueco es un circulo exacto: el borde de la
    // cara queda perfectamente redondo en vez de heredar la ondulacion del
    // dibujo, que es de lo que se quejaba Sergio.
    const double CENTRO_X = 600.5 / 1205.0;
    const double CENTRO_Y = 615.5 / 1305.0;

    // Radio EXTERIOR, el del canto de la rueda. Solo se publica para que el juego
    // sepa a que escala colocar los iconos; el recorte no lo usa.
    const double RADIO = 530.0 / 1205.0;

    // Desde aqui hacia afuera es aro en TODOS los angulos.
    const double RADIO_HUECO = 466.0 / 1205.0;

    // Hasta aqui traza el juego la cara. Se pasa de largo a proposito por encima
    // del hueco: donde el aro dibujado empieza mas tarde, la cara llega por
    // debajo y no queda ni una rendija.
    const double RADIO_CARA = 472.0 / 1205.0;

    public static string RecortarRuleta(string entrada, string salida, int anchoDest) {
        using (Bitmap src = new Bitmap(entrada)) {
            int w = src.Width, h = src.Height;
            BitmapData d = src.LockBits(new Rectangle(0, 0, w, h),
                ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            int stride = d.Stride;
            byte[] px = new byte[stride * h];
            Marshal.Copy(d.Scan0, px, 0, px.Length);
            src.UnlockBits(d);

            double cx = w * CENTRO_X, cy = h * CENTRO_Y;
            double hueco = w * RADIO_HUECO;
            double hueco2 = hueco * hueco;

            byte[] marco = new byte[px.Length];
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int p = y * stride + x * 4;
                    double dx = x - cx, dy = y - cy;
                    if (dx * dx + dy * dy < hueco2) continue;          // cara: la traza el juego
                    marco[p]     = px[p];
                    marco[p + 1] = px[p + 1];
                    marco[p + 2] = px[p + 2];
                    marco[p + 3] = px[p + 3];
                }
            }

            int altoDest = (int)Math.Round((double)h * anchoDest / w);
            Reducir(marco, w, h, stride, salida, anchoDest, altoDest);

            return anchoDest + "|" + altoDest + "|" +
                   (int)Math.Round(anchoDest * CENTRO_X) + "|" +
                   (int)Math.Round(altoDest * CENTRO_Y) + "|" +
                   (int)Math.Round(anchoDest * RADIO) + "|" +
                   (int)Math.Round(anchoDest * RADIO_CARA);
        }
    }

    // Reduccion por media de area con alfa PREMULTIPLICADO. Sin premultiplicar,
    // los pixeles transparentes del borde arrastran su color al promedio y la
    // silueta sale con una orla del color del vacio.
    static void Reducir(byte[] px, int w, int h, int stride,
                        string salida, int dw, int dh) {
        int dStride = dw * 4;
        byte[] dst = new byte[dStride * dh];
        for (int y = 0; y < dh; y++) {
            int y0 = y * h / dh, y1 = Math.Max(y0 + 1, (y + 1) * h / dh);
            for (int x = 0; x < dw; x++) {
                int x0 = x * w / dw, x1 = Math.Max(x0 + 1, (x + 1) * w / dw);
                double sa = 0, sr = 0, sg = 0, sb = 0;
                int n = 0;
                for (int sy = y0; sy < y1; sy++)
                    for (int sx = x0; sx < x1; sx++) {
                        int p = sy * stride + sx * 4;
                        double a = px[p + 3] / 255.0;
                        sb += px[p] * a; sg += px[p + 1] * a; sr += px[p + 2] * a;
                        sa += a; n++;
                    }
                if (sa <= 0.0001 || n == 0) continue;      // hueco: se queda a cero
                int q = y * dStride + x * 4;
                dst[q]     = (byte)Math.Min(255, Math.Round(sb / sa));
                dst[q + 1] = (byte)Math.Min(255, Math.Round(sg / sa));
                dst[q + 2] = (byte)Math.Min(255, Math.Round(sr / sa));
                dst[q + 3] = (byte)Math.Min(255, Math.Round(sa / n * 255));
            }
        }
        using (Bitmap sal = new Bitmap(dw, dh, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, dw, dh),
                ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < dh; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
    }

    // Mayor N tal que la imagen sea un escalado entero NxN de otra mas pequena.
    // 1 significa "no es pixel art ampliado, tratalo tal cual".
    static int FactorNativo(byte[][] marcos, int w, int h, int stride) {
        int[] cand = { 16, 12, 10, 8, 6, 5, 4, 3, 2 };
        foreach (int f in cand) {
            if (w % f != 0 || h % f != 0) continue;
            bool ok = true;
            for (int m = 0; m < marcos.Length && ok; m++) {
                byte[] px = marcos[m];
                for (int by = 0; by < h && ok; by += f)
                    for (int bx = 0; bx < w && ok; bx += f) {
                        int p0 = by * stride + bx * 4;
                        for (int y = 0; y < f && ok; y++)
                            for (int x = 0; x < f; x++) {
                                int p = (by + y) * stride + (bx + x) * 4;
                                if (px[p] != px[p0] || px[p+1] != px[p0+1] ||
                                    px[p+2] != px[p0+2] || px[p+3] != px[p0+3]) { ok = false; break; }
                            }
                    }
            }
            if (ok) return f;
        }
        return 1;
    }

    // ---------------------------------------------------------------------
    // Remate del sprite ya reducido
    // ---------------------------------------------------------------------
    //
    // La media de area es lo correcto para reducir, pero con factores grandes
    // deja el borde hecho un degradado. La gargola se reduce 20 veces (1575px de
    // silueta a 76) y cada membrana de ala fina acaba siendo un pixel medio
    // transparente: de sus ~1000 pixeles con opacidad, 577 quedaban a medias y
    // el bicho se veia translucido. Esto no es un fallo del arte de origen, que
    // entra opaco al 100%: es lo que hace promediar 528 pixeles de origen por
    // cada pixel de destino.
    //
    // Dos remates, ambos imprescindibles para pixel art:
    //   1. Endurecer el alfa. Con imageSmoothingEnabled = false un borde difuso
    //      no aporta suavidad, solo ensucia. Se empuja a 0 o a 255 dejando una
    //      rampa estrecha para que la silueta no quede dentada.
    //   2. Tapar agujeros interiores. Los que sobreviven al recorte son bolsas
    //      que la reduccion abrio en mitad del cuerpo, nunca huecos legitimos:
    //      un hueco de verdad (entre las piernas) toca el exterior y se inunda
    //      desde el borde.
    //
    // ESE SEGUNDO SUPUESTO NO VALE SIEMPRE, y por eso `taparHuecos` es un
    // parametro. Se escribio pensando en bichos y personajes, donde el unico
    // hueco posible se abre hacia fuera. Una RUINA no: un arco, un ventanal o
    // un boquete en un muro son huecos CERRADOS, no tocan el borde, y el
    // relleno se los comia pintandolos con la media de sus vecinos.
    //
    // Medido sobre las tres que fallaban: ruinas4 pasaba de llenar el 61,9% de
    // su caja a llenar el 66,2%, ruinas5 de 64,7 a 69,1 y ruinas7 de 43,8 a 49.
    // Las que no tienen huecos cerrados no se movian ni un punto y medio.
    const int CORTE_BAJO = 100;
    const int CORTE_ALTO = 165;

    // Fraccion de la masa que se tira por cada lado al medir el nucleo solido.
    // Con 0.10 el nucleo conserva el 80% del dibujo y suelta el fleco de los
    // bordes, que es justo lo que se pedia que fuera transitable.
    const double DESCARTE = 0.10;

    static void Rematar(byte[] dst, int w, int h, int stride) {
        Rematar(dst, w, h, stride, true);
    }

    static void Rematar(byte[] dst, int w, int h, int stride, bool taparHuecos) {
        // --- 1. Endurecer el alfa --------------------------------------
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int q = y * stride + x * 4 + 3;
                int a = dst[q];
                if (a <= CORTE_BAJO) dst[q] = 0;
                else if (a >= CORTE_ALTO) dst[q] = 255;
                else dst[q] = (byte)((a - CORTE_BAJO) * 255 / (CORTE_ALTO - CORTE_BAJO));
            }
        }

        if (!taparHuecos) return;

        // --- 2. Marcar el exterior inundando desde el borde -------------
        bool[] fuera = new bool[w * h];
        Queue<int> cola = new Queue<int>();
        for (int x = 0; x < w; x++) { SembrarHueco(dst, stride, fuera, cola, w, h, x, 0);
                                      SembrarHueco(dst, stride, fuera, cola, w, h, x, h - 1); }
        for (int y = 0; y < h; y++) { SembrarHueco(dst, stride, fuera, cola, w, h, 0, y);
                                      SembrarHueco(dst, stride, fuera, cola, w, h, w - 1, y); }
        while (cola.Count > 0) {
            int i = cola.Dequeue();
            int x = i % w, y = i / w;
            if (x > 0)     SembrarHueco(dst, stride, fuera, cola, w, h, x - 1, y);
            if (x < w - 1) SembrarHueco(dst, stride, fuera, cola, w, h, x + 1, y);
            if (y > 0)     SembrarHueco(dst, stride, fuera, cola, w, h, x, y - 1);
            if (y < h - 1) SembrarHueco(dst, stride, fuera, cola, w, h, x, y + 1);
        }

        // --- 3. Rellenar lo transparente que no sea exterior ------------
        // El color sale de la media de los vecinos ya opacos. Varias pasadas
        // porque un agujero de varios pixeles se rellena de fuera hacia dentro.
        for (int pasada = 0; pasada < 4; pasada++) {
            bool queda = false;
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int i = y * w + x, q = y * stride + x * 4;
                    if (fuera[i] || dst[q + 3] >= 128) continue;

                    long sR = 0, sG = 0, sB = 0; int n = 0;
                    for (int dy = -1; dy <= 1; dy++) {
                        for (int dx = -1; dx <= 1; dx++) {
                            int nx = x + dx, ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                            int p = ny * stride + nx * 4;
                            if (dst[p + 3] < 128) continue;
                            sB += dst[p]; sG += dst[p + 1]; sR += dst[p + 2]; n++;
                        }
                    }
                    if (n == 0) { queda = true; continue; }
                    dst[q]     = (byte)(sB / n);
                    dst[q + 1] = (byte)(sG / n);
                    dst[q + 2] = (byte)(sR / n);
                    dst[q + 3] = 255;
                }
            }
            if (!queda) break;
        }
    }

    static void SembrarHueco(byte[] dst, int stride, bool[] fuera, Queue<int> cola,
                             int w, int h, int x, int y) {
        int i = y * w + x;
        if (fuera[i]) return;
        if (dst[y * stride + x * 4 + 3] >= 128) return;   // opaco: corta la inundacion
        fuera[i] = true;
        cola.Enqueue(i);
    }

    // ---------------------------------------------------------------------
    // Predicados de fondo
    // ---------------------------------------------------------------------
    static int DistFondo(Contexto c, int x, int y) {
        return DistPaleta(c.px, y * c.stride + x * 4, c.pal);
    }

    static bool EsFondo(Contexto c, int x, int y, int umbral) {
        return DistFondo(c, x, y) <= umbral;
    }

    static void Sembrar(Contexto c, bool[] fondo, Queue<int> cola, int x, int y) {
        int i = y * c.w + x;
        if (fondo[i]) return;
        if (c.px[y * c.stride + x * 4 + 3] < 16) { fondo[i] = true; cola.Enqueue(i); return; }
        if (EsFondo(c, x, y, c.umbral)) { fondo[i] = true; cola.Enqueue(i); }
    }

    static void Inundar(Contexto c, bool[] fondo, Queue<int> cola) {
        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        while (cola.Count > 0) {
            int idx = cola.Dequeue();
            int x = idx % c.w, y = idx / c.w;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < 0 || ny < 0 || nx >= c.w || ny >= c.h) continue;
                Sembrar(c, fondo, cola, nx, ny);
            }
        }
    }

    // Colores dominantes del borde exterior, en cubos de 32 niveles.
    // Devuelve tripletas r,g,b planas de los cubos que superen el 2% del borde.
    static int[] PaletaBorde(Contexto c) {
        Dictionary<int, long[]> cubos = new Dictionary<int, long[]>();
        int total = 0;
        int w = c.w, h = c.h;
        for (int i = 0; i < w + w + h + h; i++) {
            int x, y;
            if (i < w)              { x = i;         y = 0; }
            else if (i < w + w)     { x = i - w;     y = h - 1; }
            else if (i < w + w + h) { x = 0;         y = i - w - w; }
            else                    { x = w - 1;     y = i - w - w - h; }

            int p = y * c.stride + x * 4;
            int r = c.px[p + 2], g = c.px[p + 1], bl = c.px[p];
            int clave = (r / 32) * 1024 + (g / 32) * 32 + (bl / 32);
            if (!cubos.ContainsKey(clave)) cubos[clave] = new long[4];
            cubos[clave][0] += r; cubos[clave][1] += g; cubos[clave][2] += bl; cubos[clave][3]++;
            total++;
        }

        List<int[]> orden = new List<int[]>();
        foreach (KeyValuePair<int, long[]> kv in cubos) {
            long n = kv.Value[3];
            if (n * 100 >= total * 2) {
                orden.Add(new int[] { (int)n, (int)(kv.Value[0] / n), (int)(kv.Value[1] / n), (int)(kv.Value[2] / n) });
            }
        }
        orden.Sort(delegate (int[] a, int[] d) { return d[0].CompareTo(a[0]); });

        int cuantos = Math.Min(6, orden.Count);
        if (cuantos == 0) return new int[] { c.px[2], c.px[1], c.px[0] };
        int[] pal = new int[cuantos * 3];
        for (int i = 0; i < cuantos; i++) {
            pal[i * 3] = orden[i][1]; pal[i * 3 + 1] = orden[i][2]; pal[i * 3 + 2] = orden[i][3];
        }
        return pal;
    }

    static int DistPaleta(byte[] b, int p, int[] pal) {
        int mejor = int.MaxValue;
        for (int i = 0; i < pal.Length; i += 3) {
            int d = Math.Abs(b[p + 2] - pal[i]) + Math.Abs(b[p + 1] - pal[i + 1]) + Math.Abs(b[p] - pal[i + 2]);
            if (d < mejor) mejor = d;
        }
        return mejor;
    }

    static bool Vecino(bool[] fondo, int w, int h, int x, int y) {
        if (x > 0 && fondo[y * w + x - 1]) return true;
        if (x < w - 1 && fondo[y * w + x + 1]) return true;
        if (y > 0 && fondo[(y - 1) * w + x]) return true;
        if (y < h - 1 && fondo[(y + 1) * w + x]) return true;
        return false;
    }

    // ---------------------------------------------------------------------
    // Hojas de animacion dibujadas a mano (rejilla de celdas)
    // ---------------------------------------------------------------------
    //
    // Formato de entrada: una rejilla de cols x filas celdas iguales, con los
    // fotogramas en orden de lectura y fondo transparente. Es lo que sale de
    // cualquier exportador de sprites, asi que no se le pide nada raro al arte.
    //
    // LA CAJA DE RECORTE ES COMUN A TODOS LOS FOTOGRAMAS, y ademas comun a las
    // dos hojas (derecha e izquierda) del mismo personaje. Si cada fotograma se
    // recortara por su cuenta, la figura quedaria centrada en su propia silueta
    // y el personaje daria un brinco en cada paso: al abrir las piernas la caja
    // se ensancha, el centro se desplaza y el sprite se mueve sin que nadie lo
    // haya movido. Por eso la medicion va aparte del recorte.

    static void CargarPx(string ruta, out byte[] px, out int w, out int h, out int stride) {
        using (Bitmap orig = new Bitmap(ruta)) {
            w = orig.Width; h = orig.Height;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, w, h); }
                BitmapData d = src.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly,
                                            PixelFormat.Format32bppArgb);
                stride = d.Stride;
                px = new byte[stride*h];
                Marshal.Copy(d.Scan0, px, 0, px.Length);
                src.UnlockBits(d);
            }
        }
    }

    // Caja que envuelve la silueta de TODAS las celdas, en coordenadas de celda.
    // Devuelve: minX|minY|maxX|maxY|celdaW|celdaH
    public static string MedirHoja(string entrada, int cols, int filas) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);
        int cw = w / cols, ch = h / filas;

        int minX = cw, minY = ch, maxX = -1, maxY = -1;
        for (int r = 0; r < filas; r++) {
            for (int c = 0; c < cols; c++) {
                int ox = c*cw, oy = r*ch;
                for (int y = 0; y < ch; y++) {
                    int fila = (oy+y)*stride + ox*4 + 3;
                    for (int x = 0; x < cw; x++) {
                        if (px[fila + x*4] <= 40) continue;
                        if (x < minX) minX = x; if (x > maxX) maxX = x;
                        if (y < minY) minY = y; if (y > maxY) maxY = y;
                    }
                }
            }
        }
        if (maxY < 0) return "VACIA";
        return minX + "|" + minY + "|" + maxX + "|" + maxY + "|" + cw + "|" + ch;
    }

    // Recorta la rejilla a una TIRA HORIZONTAL con la caja dada, reducida al alto
    // fisico pedido. Anade al final nQuieto fotogramas de reposo copiados del
    // fotograma idle: la hoja trae solo el ciclo de andar, y un personaje parado
    // que no respira parece congelado, no quieto. La segunda copia baja un
    // pixel — un solo pixel a 2 fps, que es lo justo para que se lea como peso.
    //
    // Devuelve: frameW|frameH|nFrames
    public static string RecortarHoja(string entrada, string salida, int cols, int filas,
                                      int minX, int minY, int maxX, int maxY,
                                      int altoFis, int idle, int nQuieto) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);
        int cw = w / cols, ch = h / filas;

        int cajaW = maxX - minX + 1;
        int cajaH = maxY - minY + 1;
        int frameH = altoFis;
        // Ancho PAR: el ancla horizontal es frameW/2 y con impar caeria en medio
        // pixel, que con el suavizado apagado hace hervir el sprite.
        int frameW = (int)Math.Round((double)cajaW * altoFis / cajaH);
        if ((frameW & 1) == 1) frameW++;

        int nCeldas = cols * filas;
        int nFrames = nCeldas + nQuieto;
        int tiraW = frameW * nFrames;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * frameH];

        for (int f = 0; f < nCeldas; f++) {
            int ox = (f % cols) * cw + minX;
            int oy = (f / cols) * ch + minY;
            EscalarBloque(px, stride, w, h, ox, oy, cajaW, cajaH,
                          dst, dStride, f * frameW, 0, frameW, frameH);
        }

        // Reposo: copias del fotograma elegido, la segunda desplazada un pixel.
        int origen = Math.Max(0, Math.Min(nCeldas - 1, idle)) * frameW;
        for (int k = 0; k < nQuieto; k++) {
            int destino = (nCeldas + k) * frameW;
            int desvio = k;                       // 0, 1, 2... pixeles hacia abajo
            for (int y = 0; y < frameH; y++) {
                int sy = y - desvio;
                if (sy < 0) continue;
                Array.Copy(dst, sy*dStride + origen*4,
                           dst, y*dStride + destino*4, frameW*4);
            }
        }

        using (Bitmap sal = new Bitmap(tiraW, frameH, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,tiraW,frameH),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < frameH; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return frameW + "|" + frameH + "|" + nFrames;
    }

    // ---------------------------------------------------------------------
    // Ensanchar el mapa reflejando los bordes
    // ---------------------------------------------------------------------
    //
    // Ensanchar el escenario (pedido de Sergio) generando arte nuevo con IA no
    // salió adelante: ChatGPT, Bing y Gemini solo devuelven un puñado de
    // resoluciones/proporciones propias, nunca el ancho exacto en píxeles que
    // hacía falta, así que las dos veces el resultado llegaba más pequeño que
    // el original en vez de más ancho (ver herramientas/candidatos/calzada-ancha,
    // descartada). Esto no depende de ningún servicio externo: coge una franja
    // de cada borde y la refleja hacia fuera.
    //
    // La costura es EXACTA y no una mezcla: la columna de la franja reflejada
    // que queda pegada al original es, pixel a pixel, la MISMA columna que el
    // original tiene ahí (reflejar alrededor del borde implica que ese punto
    // coincide consigo mismo). Funciona bien aquí porque los márgenes de este
    // mapa son un patrón de hierba/árboles sin ningún elemento único y
    // reconocible que delate el espejo — los objetos que sí lo son (columnas,
    // estatuas, ruinas) no están pintados en esta imagen, los coloca
    // datos/niveles/merida.js por encima.
    public static string Ensanchar(string entrada, string salida, int pxPorLado, int unidad) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);
        if (pxPorLado <= 0 || pxPorLado >= w) return "RANGO";
        if (unidad <= 0 || unidad > pxPorLado) unidad = pxPorLado;

        int w2 = w + pxPorLado * 2;
        int stride2 = w2 * 4;
        byte[] dst = new byte[stride2 * h];

        for (int y = 0; y < h; y++) {
            int filaSrc = y * stride;
            int filaDst = y * stride2;

            // Centro: el original, intacto.
            Array.Copy(px, filaSrc, dst, filaDst + pxPorLado * 4, w * 4);

            // Franja izquierda, en ESPEJO DE ACORDEÓN: no un solo pliegue del
            // ancho entero (eso deja un rombo enorme y evidente pegado a la
            // calzada, que es justo lo que se ve mal), sino varios pliegues
            // del ancho de `unidad`, alternando dirección. Cada juntura entre
            // pliegues sigue siendo exacta por el mismo motivo de siempre —la
            // columna de un lado de la juntura es la misma columna física que
            // la del otro—, solo que ahora el patrón se repite en una escala
            // más parecida a la de un árbol suelto que a la de todo el margen.
            for (int x = 0; x < pxPorLado; x++) {
                int distancia = pxPorLado - x;                  // 1..pxPorLado
                int enTramo = (distancia - 1) % unidad;         // 0..unidad-1
                bool par = ((distancia - 1) / unidad) % 2 == 0;
                int xo = par ? enTramo : (unidad - 1 - enTramo);
                if (xo >= w) xo = w - 1;
                Array.Copy(px, filaSrc + xo * 4, dst, filaDst + x * 4, 4);
            }

            // Franja derecha: la misma idea en espejo.
            for (int x = 0; x < pxPorLado; x++) {
                int distancia = x + 1;                          // 1..pxPorLado
                int enTramo = (distancia - 1) % unidad;
                bool par = ((distancia - 1) / unidad) % 2 == 0;
                int xo = par ? (w - 1 - enTramo) : (w - unidad + enTramo);
                if (xo < 0) xo = 0;
                int xd = w2 - pxPorLado + x;
                Array.Copy(px, filaSrc + xo * 4, dst, filaDst + xd * 4, 4);
            }
        }

        using (Bitmap sal = new Bitmap(w2, h, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, w2, h),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++)
                Marshal.Copy(dst, y * stride2, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), stride2);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return w2 + "|" + h;
    }

    // ---------------------------------------------------------------------
    // Suelo del nivel: hacer teselable un mapa que no lo es
    // ---------------------------------------------------------------------
    //
    // El mundo de este juego es INFINITO y con scroll toroidal (ver
    // dibujarSuelo en main.js): no hay bordes de mapa, así que cualquier
    // imagen de suelo se repite, y si sus lados no casan se ve una rejilla de
    // costuras por toda la pantalla. Medido en el mapa de Emerita que ha
    // dibujado Sergio, el salto de color en la costura es de 35 sobre 255,
    // contra 7-12 entre dos píxeles vecinos cualesquiera del interior: tres
    // veces lo normal, o sea perfectamente visible.
    //
    // Se arregla RECORTANDO un margen y fundiéndolo en el arranque, que es la
    // forma que no inventa contenido:
    //
    //   salida[x] = mezcla(origen[x + w - m], origen[x])  para x < m
    //   salida[x] = origen[x]                             para el resto
    //
    // La imagen se queda en w-m de ancho, y ahora su última columna
    // (origen[w-m-1]) y la primera (origen[w-m]) eran VECINAS en el original,
    // así que al repetirse encajan exactamente. No es un truco de suavizado:
    // es cerrar el bucle por donde ya estaba cerrado.
    //
    // Con la avenida cruzando de arriba abajo esto sale especialmente bien: el
    // borde superior y el inferior son los dos empedrado, así que la fusión
    // vertical mezcla losa con losa y la calzada sigue de largo.
    // Guarda como JPEG si la extension del destino es .jpg (con la calidad
    // dada) y como PNG en cualquier otro caso. El suelo teselado sale siempre
    // opaco (ver los tmp[q+3]=255 mas abajo), asi que el canal alfa que PNG
    // conservaria no aporta nada y JPEG pesa una fraccion.
    public static void Guardar(Bitmap bmp, string ruta, long calidadJpg) {
        string ext = System.IO.Path.GetExtension(ruta).ToLowerInvariant();
        if (ext == ".jpg" || ext == ".jpeg") {
            ImageCodecInfo codec = null;
            foreach (ImageCodecInfo ci in ImageCodecInfo.GetImageEncoders())
                if (ci.MimeType == "image/jpeg") codec = ci;
            EncoderParameters ps = new EncoderParameters(1);
            ps.Param[0] = new EncoderParameter(Encoder.Quality, calidadJpg);
            bmp.Save(ruta, codec, ps);
        } else {
            bmp.Save(ruta, ImageFormat.Png);
        }
    }

    // Reencodea a PNG INDEXADO (8bpp, paleta propia) cuando es matematicamente
    // sin perdida: cero pixeles de alfa parcial (todo pixel es 0 o 255, lo que
    // ver-assets.ps1 llama alfa "binaria") y 255 colores opacos como mucho -el
    // hueco 256 lo ocupa la entrada transparente-. En vertical -PNG truecolor
    // de 32bpp- cada pixel de un sprite de pocos colores gasta 4 bytes para
    // repetir uno de un puñado de valores; en indexado gasta 1 byte y la
    // paleta entera pesa unas pocas decenas de bytes. Es EL MISMO dibujo, pixel
    // a pixel: no hay aproximacion ni redondeo de color.
    //
    // Si el sprite no cumple las dos condiciones (tiene degradado de alfa, o
    // mas colores de los que caben en una paleta), no se toca: se deja el PNG
    // truecolor tal cual y se informa por que.
    public static string Indexar(string entrada, string salida) {
        int w, h;
        using (Bitmap orig = new Bitmap(entrada)) {
            w = orig.Width; h = orig.Height;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(src)) {
                g.DrawImage(orig, 0, 0, w, h);

                BitmapData sd = src.LockBits(new Rectangle(0, 0, w, h),
                                              ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                byte[] px = new byte[sd.Stride * h];
                Marshal.Copy(sd.Scan0, px, 0, px.Length);
                src.UnlockBits(sd);
                int stride = sd.Stride;

                Dictionary<int, int> paletaIdx = new Dictionary<int, int>();
                List<int> paleta = new List<int>();
                paleta.Add(0); // indice 0 = transparente; el valor RGB es indiferente
                byte[] indices = new byte[w * h];
                bool demasiados = false;

                for (int y = 0; y < h && !demasiados; y++) {
                    int fila = y * stride;
                    for (int x = 0; x < w; x++) {
                        int i = fila + x * 4;
                        int a = px[i + 3];
                        if (a > 0 && a < 255) return "SUAVE";
                        int idx;
                        if (a == 0) {
                            idx = 0;
                        } else {
                            int c = (px[i + 2] << 16) | (px[i + 1] << 8) | px[i];
                            if (!paletaIdx.TryGetValue(c, out idx)) {
                                paleta.Add(c);
                                idx = paleta.Count - 1;
                                if (idx > 255) { demasiados = true; break; }
                                paletaIdx[c] = idx;
                            }
                        }
                        indices[y * w + x] = (byte)idx;
                    }
                }
                if (demasiados) return "DEMASIADOS_COLORES";

                using (Bitmap sal = new Bitmap(w, h, PixelFormat.Format8bppIndexed)) {
                    ColorPalette pal = sal.Palette;
                    for (int i = 0; i < 256; i++) {
                        if (i == 0) { pal.Entries[i] = Color.FromArgb(0, 0, 0, 0); continue; }
                        if (i < paleta.Count) {
                            int c = paleta[i];
                            pal.Entries[i] = Color.FromArgb(255, (c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF);
                        } else {
                            pal.Entries[i] = Color.FromArgb(0, 0, 0, 0);
                        }
                    }
                    sal.Palette = pal;
                    BitmapData dd = sal.LockBits(new Rectangle(0, 0, w, h),
                                                  ImageLockMode.WriteOnly, PixelFormat.Format8bppIndexed);
                    for (int y = 0; y < h; y++)
                        Marshal.Copy(indices, y * w, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), w);
                    sal.UnlockBits(dd);
                    sal.Save(salida, ImageFormat.Png);
                }
                return "OK|" + (paleta.Count - 1);
            }
        }
    }

    public static string HacerTeselable(string entrada, string salida, int margen, int escala) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);
        if (margen * 3 > w || margen * 3 > h) return "MARGEN";

        // El tile tiene que medir un multiplo EXACTO de ESCALA_ARTE, porque el
        // motor lo dibuja en unidades logicas y la transformacion lo multiplica
        // por esa escala. Si no divide, el blit deja de ir a 1:1 y el suelo
        // entero pasa por un remuestreo cada frame — que es justo el cuello de
        // botella que se corrigio en la Fase 3. El margen se agranda lo justo
        // para cuadrarlo; son unos pocos pixeles.
        int mx = margen, my = margen;
        while ((w - mx) % escala != 0) mx++;
        while ((h - my) % escala != 0) my++;

        int w2 = w - mx, h2 = h - my;

        // --- Paso en X: de w a w2, fundiendo la banda derecha en la izquierda
        int tStride = w2 * 4;
        byte[] tmp = new byte[tStride * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w2; x++) {
                int q = y * tStride + x * 4;
                int p = y * stride + x * 4;
                if (x < mx) {
                    int p2 = y * stride + (x + w - mx) * 4;
                    double t = (double)x / mx;
                    for (int c = 0; c < 3; c++)
                        tmp[q + c] = (byte)(px[p2 + c] * (1 - t) + px[p + c] * t);
                } else {
                    tmp[q] = px[p]; tmp[q + 1] = px[p + 1]; tmp[q + 2] = px[p + 2];
                }
                tmp[q + 3] = 255;
            }
        }

        // --- Paso en Y: lo mismo con las filas
        int dStride = w2 * 4;
        byte[] dst = new byte[dStride * h2];
        for (int y = 0; y < h2; y++) {
            for (int x = 0; x < w2; x++) {
                int q = y * dStride + x * 4;
                int p = y * tStride + x * 4;
                if (y < my) {
                    int p2 = (y + h - my) * tStride + x * 4;
                    double t = (double)y / my;
                    for (int c = 0; c < 3; c++)
                        dst[q + c] = (byte)(tmp[p2 + c] * (1 - t) + tmp[p + c] * t);
                } else {
                    dst[q] = tmp[p]; dst[q + 1] = tmp[p + 1]; dst[q + 2] = tmp[p + 2];
                }
                dst[q + 3] = 255;
            }
        }

        using (Bitmap sal = new Bitmap(w2, h2, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, w2, h2),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < h2; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            Guardar(sal, salida, 90);
        }

        // Costura medida sobre el RESULTADO, para no fiarse de la teoría.
        // Se compara el salto al repetir contra el salto entre dos columnas
        // (o filas) del interior: si el primero no es mayor, no hay costura.
        return w2 + "|" + h2 + "|" +
               Salto(dst, dStride, w2, h2, true) + "|" + Salto(dst, dStride, w2, h2, false);
    }

    // Salto medio al repetir menos el salto medio del interior, por canal.
    static string Salto(byte[] px, int stride, int w, int h, bool enX) {
        long costura = 0, interior = 0;
        int n = enX ? h : w;
        for (int i = 0; i < n; i++) {
            int a, b, c, d;
            if (enX) { a = i * stride + (w - 1) * 4; b = i * stride; c = i * stride + (w / 2) * 4; d = c + 4; }
            else     { a = (h - 1) * stride + i * 4; b = i * 4; c = (h / 2) * stride + i * 4; d = c + stride; }
            for (int k = 0; k < 3; k++) {
                costura  += Math.Abs(px[a + k] - px[b + k]);
                interior += Math.Abs(px[c + k] - px[d + k]);
            }
        }
        return Math.Round((double)costura / n / 3, 1) + " vs " + Math.Round((double)interior / n / 3, 1);
    }

    // ---------------------------------------------------------------------
    // Hojas de ICONOS: armas y objetos
    // ---------------------------------------------------------------------
    //
    // Dos hojas con formatos distintos y un solo recortador, porque el trabajo
    // de fondo es el mismo: encontrar N siluetas EN ORDEN DE LECTURA y meter
    // cada una centrada en su celda cuadrada de una tira horizontal.
    //
    // El orden de lectura es el CONTRATO con datos/armas.js y datos/pasivos.js
    // — ver $ICONOS_ARMAS más abajo, que es donde se declara qué id ocupa cada
    // hueco. Aquí solo se garantiza que la fila manda sobre la columna.
    //
    // Dos modos, porque las dos hojas que ha dibujado Sergio no se parecen:
    //
    //   "rejilla" (objetos.png) — trae ALFA de verdad y los ocho objetos caen
    //     limpiamente en 4x2 celdas iguales. Se parte la imagen y se mide la
    //     silueta dentro de cada celda. Nada más.
    //
    //   "marco" (armas.png) — viene OPACA, sin un solo píxel transparente: 52
    //     iconos enmarcados sobre negro, cada marco con su reborde gris. Y la
    //     rejilla NO es regular: medida, la separación entre filas va de 132 a
    //     140 píxeles y acumula deriva, así que partir en 8x7 iguales recorta
    //     media fila por abajo. Hay que encontrar los marcos.
    //
    // Cómo se encuentran los marcos, que es lo único no obvio de todo esto: el
    // hueco ENTRE marcos es negro puro y está conectado con el borde de la
    // imagen, mientras que el negro de DENTRO de cada marco está encerrado por
    // su reborde gris. Inundando el negro desde el borde se pinta el hueco y
    // solo el hueco; lo que queda sin pintar son 52 islas, una por marco. No
    // hace falta saber ni cuántas columnas hay ni dónde empieza cada una.

    // Luminancia por debajo de la cual un pixel cuenta como fondo.
    //
    // 28 y no 12, que era el valor obvio para "negro puro". El reborde inferior
    // de cada marco no acaba en seco: derrama una sombra tenue que cruza el
    // hueco hasta el marco de al lado. Medida, esa sombra deja el hueco entre
    // 13 y 22 de luminancia en siete filas de toda la hoja — suficiente para
    // que la inundacion no pase y dos marcos vecinos salgan como una sola
    // celda. Pasaba en siete sitios y se llevaba ocho iconos por delante.
    //
    // Se puede subir tanto sin comerse dibujo porque el reborde del marco esta
    // en 84 y el negro de dentro en 0-5: entre el fondo y lo que hay que
    // conservar no hay nada, es un salto limpio.
    const int NEGRO = 28;

    static int Lum(byte[] px, int p) { return (px[p] + px[p+1] + px[p+2]) / 3; }

    // Inunda `marca` a partir de las semillas ya encoladas, avanzando solo por
    // píxeles que cumplan "es negro".
    static void InundarNegro(byte[] px, int stride, int w, int h,
                             bool[] marca, Queue<int> cola,
                             int x0, int y0, int x1, int y1) {
        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        while (cola.Count > 0) {
            int i = cola.Dequeue();
            int x = i % w, y = i / w;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
                int ni = ny * w + nx;
                if (marca[ni]) continue;
                if (Lum(px, ny * stride + nx * 4) > NEGRO) continue;
                marca[ni] = true;
                cola.Enqueue(ni);
            }
        }
    }

    // Inunda por todo lo que NO este ya marcado, sin mirar el color. Sirve para
    // barrer el reborde del marco: ver el comentario de RecortarIconos.
    static void InundarLibre(bool[] marca, Queue<int> cola, int w,
                             int x0, int y0, int x1, int y1) {
        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        while (cola.Count > 0) {
            int i = cola.Dequeue();
            int x = i % w, y = i / w;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
                int ni = ny * w + nx;
                if (marca[ni]) continue;
                marca[ni] = true;
                cola.Enqueue(ni);
            }
        }
    }

    static void Semilla(byte[] px, int stride, int w, bool[] marca, Queue<int> cola, int x, int y) {
        int i = y * w + x;
        if (marca[i]) return;
        if (Lum(px, y * stride + x * 4) > NEGRO) return;
        marca[i] = true;
        cola.Enqueue(i);
    }

    // Cajas de los 52 marcos, sin suponer nada sobre la rejilla.
    static List<int[]> CajasDeMarco(byte[] px, int stride, int w, int h) {
        bool[] hueco = new bool[w * h];
        Queue<int> cola = new Queue<int>();
        for (int x = 0; x < w; x++) { Semilla(px, stride, w, hueco, cola, x, 0);
                                      Semilla(px, stride, w, hueco, cola, x, h - 1); }
        for (int y = 0; y < h; y++) { Semilla(px, stride, w, hueco, cola, 0, y);
                                      Semilla(px, stride, w, hueco, cola, w - 1, y); }
        InundarNegro(px, stride, w, h, hueco, cola, 0, 0, w - 1, h - 1);

        // Componentes de lo que NO es hueco: cada una es un marco entero
        // (reborde gris + negro de dentro + icono).
        bool[] visto = new bool[w * h];
        List<int[]> cajas = new List<int[]>();
        Queue<int> q = new Queue<int>();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int i = y * w + x;
                if (visto[i] || hueco[i]) continue;
                int ax = x, bx = x, ay = y, by = y, n = 0;
                visto[i] = true; q.Enqueue(i);
                while (q.Count > 0) {
                    int k = q.Dequeue(); int kx = k % w, ky = k / w; n++;
                    if (kx < ax) ax = kx; if (kx > bx) bx = kx;
                    if (ky < ay) ay = ky; if (ky > by) by = ky;
                    for (int dy = -1; dy <= 1; dy++)
                        for (int dx = -1; dx <= 1; dx++) {
                            int nx = kx + dx, ny = ky + dy;
                            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                            int ni = ny * w + nx;
                            if (visto[ni] || hueco[ni]) continue;
                            visto[ni] = true; q.Enqueue(ni);
                        }
                }
                // Un marco ocupa miles de píxeles; lo que baje de ahí es una
                // mota del fondo, no una celda.
                if (n > 2000) cajas.Add(new int[] { ax, ay, bx, by });
            }
        }
        return cajas;
    }

    // Orden de lectura con filas que no están alineadas al píxel. Se agrupa por
    // BANDAS: se recorre por centro vertical y se abre banda nueva cuando el
    // salto pasa de media altura de celda. Ordenar por `y` a secas mezclaría
    // columnas de filas contiguas, porque la hoja está dibujada a mano y dentro
    // de una misma fila los marcos bailan varios píxeles.
    static void OrdenarLectura(List<int[]> cajas) {
        if (cajas.Count == 0) return;
        int altoMedio = 0;
        foreach (int[] c in cajas) altoMedio += c[3] - c[1] + 1;
        altoMedio /= cajas.Count;
        int umbral = altoMedio / 2;

        cajas.Sort(delegate (int[] a, int[] b) {
            int ca = (a[1] + a[3]) / 2, cb = (b[1] + b[3]) / 2;
            if (Math.Abs(ca - cb) > umbral) return ca.CompareTo(cb);
            return a[0].CompareTo(b[0]);
        });
    }

    // Manchas OPACAS conexas, con su caja. Es la misma idea que CajasDeMarco
    // pero sobre el alfa en vez de sobre el hueco negro: sirve para las hojas
    // que ya vienen recortadas, donde cada icono es una isla y no hay marco que
    // buscar. `minArea` descarta el sangrado de un icono vecino, que son unas
    // decenas de pixeles sueltos contra los miles de un icono de verdad.
    static List<int[]> IslasOpacas(byte[] px, int stride, int w, int h, int minArea) {
        bool[] visto = new bool[w * h];
        List<int[]> cajas = new List<int[]>();
        Queue<int> cola = new Queue<int>();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int i = y * w + x;
                if (visto[i] || px[y * stride + x * 4 + 3] <= 128) continue;
                int ax = x, bx = x, ay = y, by = y, n = 0;
                visto[i] = true; cola.Enqueue(i);
                while (cola.Count > 0) {
                    int k = cola.Dequeue(); int kx = k % w, ky = k / w; n++;
                    if (kx < ax) ax = kx; if (kx > bx) bx = kx;
                    if (ky < ay) ay = ky; if (ky > by) by = ky;
                    for (int dy = -1; dy <= 1; dy++)
                        for (int dx = -1; dx <= 1; dx++) {
                            int nx = kx + dx, ny = ky + dy;
                            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                            int ni = ny * w + nx;
                            if (visto[ni] || px[ny * stride + nx * 4 + 3] <= 128) continue;
                            visto[ni] = true; cola.Enqueue(ni);
                        }
                }
                if (n >= minArea) cajas.Add(new int[] { ax, ay, bx, by });
            }
        }
        return cajas;
    }

    // Caja de la silueta dentro de una región, con el fondo ya resuelto.
    // Devuelve null si la región está vacía.
    static int[] CajaSilueta(bool[] fondo, int w, int x0, int y0, int x1, int y1) {
        int ax = x1 + 1, ay = y1 + 1, bx = x0 - 1, by = y0 - 1;
        for (int y = y0; y <= y1; y++)
            for (int x = x0; x <= x1; x++) {
                if (fondo[y * w + x]) continue;
                if (x < ax) ax = x; if (x > bx) bx = x;
                if (y < ay) ay = y; if (y > by) by = y;
            }
        if (bx < ax) return null;
        return new int[] { ax, ay, bx, by };
    }

    // Devuelve: n|lado|informe por icono
    // `huecos` = el dibujo tiene AGUJEROS CERRADOS de verdad y hay que
    // respetarlos. Es el mismo parametro que ya tenia Procesar y por el mismo
    // motivo, solo que aqui costo mas verlo: `Rematar` rellena con la media de
    // sus vecinos todo lo transparente que no toque el borde, porque se escribio
    // para tapar los boquetes que la REDUCCION abre en mitad de un cuerpo.
    //
    // Un aro de ritmica es todo agujero. Su centro salia relleno de un magenta
    // oscuro -la media del propio aro- y el sprite era un disco macizo, aunque
    // la lamina de Sergio lo trae vacio y bien vacio. Lo mismo le pasaria a una
    // rosquilla, a una herradura o a una llave.
    public static string RecortarIconos(string entrada, string salida, int n,
                                        int lado, string modo, int cols, int filas,
                                        bool huecos) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);

        bool[] fondo = new bool[w * h];
        List<int[]> regiones = new List<int[]>();

        if (modo == "rejilla") {
            // La hoja ya trae alfa: el fondo es, literalmente, lo transparente.
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * stride + x * 4 + 3] < 128) fondo[y * w + x] = true;

            // POR ISLAS, no por celdas de rejilla. Los iconos NO respetan su
            // casilla: la corona de laurel mide de x=156 a x=402 y su celda
            // acaba en 383, así que el arco derecho cae dentro de la casilla
            // vecina. Partir la hoja en rectángulos iguales se lo cortaba, y
            // encima descuadraba el centrado, porque media corona centrada en
            // su celda no está centrada.
            //
            // Antes esto se intentó arreglar metiendo la zona de medida 30px
            // hacia dentro —el problema que se veía entonces era el contrario:
            // un par de píxeles del icono de al lado ensanchaban la caja—, pero
            // ese margen es justo lo que remata de cortar a los anchos.
            //
            // Con islas se resuelven los dos a la vez: se buscan las manchas
            // opacas conexas y cada una se asigna a la celda donde cae su
            // CENTRO. Un icono que se desborda sigue siendo suyo entero, porque
            // su centro no se ha movido; y un sangrado del vecino es una isla
            // diminuta que el área mínima descarta. Los iconos de varias piezas
            // (la corona son dos arcos que se tocan por abajo) se recomponen
            // porque se unen todas las islas de la misma celda.
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * stride + x * 4 + 3] < 128) fondo[y * w + x] = true;

            int cw = w / cols, ch = h / filas;
            int[][] caja = new int[cols * filas][];
            foreach (int[] isla in IslasOpacas(px, stride, w, h, 600)) {
                int mx = (isla[0] + isla[2]) / 2, my = (isla[1] + isla[3]) / 2;
                int c = Math.Min(cols - 1, Math.Max(0, mx / cw));
                int r = Math.Min(filas - 1, Math.Max(0, my / ch));
                int k = r * cols + c;
                if (caja[k] == null) caja[k] = new int[] { isla[0], isla[1], isla[2], isla[3] };
                else {
                    if (isla[0] < caja[k][0]) caja[k][0] = isla[0];
                    if (isla[1] < caja[k][1]) caja[k][1] = isla[1];
                    if (isla[2] > caja[k][2]) caja[k][2] = isla[2];
                    if (isla[3] > caja[k][3]) caja[k][3] = isla[3];
                }
            }
            for (int k = 0; k < cols * filas; k++) {
                // Celda sin isla: se emite su rectángulo entero y CajaSilueta
                // devolverá "vacía", que es lo que hay que ver en el informe.
                regiones.Add(caja[k] != null ? caja[k] : new int[] {
                    (k % cols) * cw, (k / cols) * ch,
                    (k % cols) * cw + cw - 1, (k / cols) * ch + ch - 1 });
            }
        } else {
            List<int[]> marcos = CajasDeMarco(px, stride, w, h);
            OrdenarLectura(marcos);

            foreach (int[] m in marcos) {
                // Dentro del marco, el reborde gris envuelve un rectángulo de
                // negro. Se busca por dónde empieza ese negro entrando desde
                // cada lado por la mitad de la celda: eso da el rectángulo
                // interior sin tener que medir el grosor del reborde, que no es
                // el mismo en todos.
                int my = (m[1] + m[3]) / 2, mx = (m[0] + m[2]) / 2;
                int ix0 = m[0], ix1 = m[2], iy0 = m[1], iy1 = m[3];
                while (ix0 < mx && Lum(px, my * stride + ix0 * 4) > NEGRO) ix0++;
                while (ix1 > mx && Lum(px, my * stride + ix1 * 4) > NEGRO) ix1--;
                while (iy0 < my && Lum(px, iy0 * stride + mx * 4) > NEGRO) iy0++;
                while (iy1 > my && Lum(px, iy1 * stride + mx * 4) > NEGRO) iy1--;

                // Inundar el negro DE DENTRO, sembrando por el borde interior.
                Queue<int> cola = new Queue<int>();
                for (int x = ix0; x <= ix1; x++) { Semilla(px, stride, w, fondo, cola, x, iy0);
                                                   Semilla(px, stride, w, fondo, cola, x, iy1); }
                for (int y = iy0; y <= iy1; y++) { Semilla(px, stride, w, fondo, cola, ix0, y);
                                                   Semilla(px, stride, w, fondo, cola, ix1, y); }
                InundarNegro(px, stride, w, h, fondo, cola, ix0, iy0, ix1, iy1);

                // Y ahora el REBORDE, que es lo único que queda por tirar.
                //
                // Con un rectángulo no vale: el marco está dibujado a mano y su
                // reborde ondula un par de píxeles, así que recortar por la
                // recta que se midió en la fila central deja tramos de gris
                // dentro. Y esos tramos no solo se ven: al entrar en la caja de
                // la silueta ensanchan el icono y lo encogen al encajarlo, que
                // es de lo que salían los iconos pequeños y descentrados.
                //
                // Se tira por INUNDACIÓN desde el borde de la celda, avanzando
                // por lo que aún no sea fondo y sin mirar el color. El negro de
                // dentro ya está marcado del paso anterior, así que la
                // inundación recorre el anillo del reborde entero —ondas
                // incluidas— y se para en seco contra ese negro. Al icono no
                // llega: lo rodea el negro por los cuatro lados.
                cola.Clear();
                for (int x = m[0]; x <= m[2]; x++) {
                    if (!fondo[m[1] * w + x]) { fondo[m[1] * w + x] = true; cola.Enqueue(m[1] * w + x); }
                    if (!fondo[m[3] * w + x]) { fondo[m[3] * w + x] = true; cola.Enqueue(m[3] * w + x); }
                }
                for (int y = m[1]; y <= m[3]; y++) {
                    if (!fondo[y * w + m[0]]) { fondo[y * w + m[0]] = true; cola.Enqueue(y * w + m[0]); }
                    if (!fondo[y * w + m[2]]) { fondo[y * w + m[2]] = true; cola.Enqueue(y * w + m[2]); }
                }
                InundarLibre(fondo, cola, w, m[0], m[1], m[2], m[3]);

                regiones.Add(new int[] { m[0], m[1], m[2], m[3] });
            }
        }

        // --- Componer la tira -------------------------------------------------
        int tiraW = lado * n;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * lado];
        System.Text.StringBuilder informe = new System.Text.StringBuilder();

        for (int i = 0; i < n; i++) {
            if (i >= regiones.Count) { informe.Append(i + ":FALTA "); continue; }
            int[] r = regiones[i];
            int[] caja = CajaSilueta(fondo, w, r[0], r[1], r[2], r[3]);
            if (caja == null) { informe.Append(i + ":VACIA "); continue; }

            int silW = caja[2] - caja[0] + 1, silH = caja[3] - caja[1] + 1;
            // Encaje "contener" y CENTRADO en los dos ejes: un icono no se apoya
            // en ningún suelo, al revés que un sprite del mundo.
            double esc = Math.Min((double)lado / silW, (double)lado / silH);
            int dw = Math.Max(1, (int)Math.Round(silW * esc));
            int dh = Math.Max(1, (int)Math.Round(silH * esc));

            // Se escala desde un búfer donde el fondo va con alfa 0, para que la
            // media de área no arrastre el negro del marco al borde del icono.
            byte[] recorte = new byte[silW * 4 * silH];
            int rStride = silW * 4;
            for (int y = 0; y < silH; y++)
                for (int x = 0; x < silW; x++) {
                    int p = (caja[1] + y) * stride + (caja[0] + x) * 4;
                    int q = y * rStride + x * 4;
                    bool esFondo = fondo[(caja[1] + y) * w + (caja[0] + x)];
                    recorte[q]     = px[p];
                    recorte[q + 1] = px[p + 1];
                    recorte[q + 2] = px[p + 2];
                    recorte[q + 3] = esFondo ? (byte)0 : px[p + 3];
                }

            EscalarBloque(recorte, rStride, silW, silH, 0, 0, silW, silH,
                          dst, dStride, i * lado + (lado - dw) / 2, (lado - dh) / 2, dw, dh);
            informe.Append(i + ":" + silW + "x" + silH + " ");
        }

        // Mismo remate que los sprites del mundo: alfa dura y agujeros tapados.
        // Un icono de 32 píxeles con el borde a medio gas se lee como sucio.
        Rematar(dst, tiraW, lado, dStride, !huecos);

        using (Bitmap sal = new Bitmap(tiraW, lado, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, tiraW, lado),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < lado; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return regiones.Count + "|" + lado + "|" + informe.ToString();
    }

    // ---------------------------------------------------------------------
    // Iconos de arma, UN ARCHIVO POR ARMA
    // ---------------------------------------------------------------------
    //
    // Sergio ha vuelto a dibujar las 52 armas, pero esta vez sueltas: un PNG
    // por arma en resources/armas/, con el nombre del arma. Esto compone la
    // tira a partir de esa lista, en el orden que se le pase.
    //
    // Es la version FACIL del problema que resolvia RecortarIconos con la hoja
    // unica: no hay que adivinar donde acaba un icono y empieza el vecino, ni
    // desmontar el marco dibujado a mano. Cada archivo es un icono y ya esta.
    // A cambio hay que quitar el fondo de cada uno, y no todos lo tienen igual:
    //
    //   - los que ya traen alfa (pilum, gladius, pistola) se respetan tal cual;
    //     meter ahi el recorte por color solo puede estropearlo, que es la
    //     misma decision que toma Procesar en su paso 2.
    //   - el resto vienen sobre BLANCO OPACO, y se quita por INUNDACION desde
    //     el borde, no por umbral a secas: hay armas con brillos casi blancos
    //     -el laser, el aspa de luz, el campo electrico- y un umbral global les
    //     agujerearia el dibujo. Inundando, un blanco rodeado de dibujo no se
    //     toca porque no se llega a el desde fuera.
    //
    // Las dos pasadas de erosion son las de RecortarCeldas y por lo mismo: el
    // blanco del original no es blanco puro en el contorno y sin erosionarlo
    // queda una orla clara pegada al icono, que a 96 se ve como un halo.
    //
    // `huecosIcono` (opcional, uno por entrada) dice CUALES de los iconos de la
    // tira son todo agujero y no admiten el relleno. Aqui no vale un bool para
    // la hoja entera como en las otras dos: en una tira de 59 armas conviven el
    // aro -que es un agujero con borde- y cincuenta y ocho siluetas macizas a
    // las que la reduccion SI les abre boquetes que hay que tapar. Con el bool
    // solo se podia elegir entre un aro relleno o cincuenta y ocho armas
    // agujereadas.
    public static string RecortarIconosSueltos(string[] entradas, string salida, int lado,
                                               bool huecos) {
        return RecortarIconosSueltos(entradas, salida, lado, huecos, null);
    }

    public static string RecortarIconosSueltos(string[] entradas, string salida, int lado,
                                               bool huecos, bool[] huecosIcono) {
        int n = entradas.Length;
        int tiraW = lado * n;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * lado];
        System.Text.StringBuilder informe = new System.Text.StringBuilder();
        int hallados = 0;

        for (int i = 0; i < n; i++) {
            if (!System.IO.File.Exists(entradas[i])) { informe.Append(i + ":FALTA "); continue; }
            byte[] px; int w, h, stride;
            CargarPx(entradas[i], out px, out w, out h, out stride);

            bool[] fondo = new bool[w * h];

            // Trae alfa propia? Con el borde ya vacio no hay nada que recortar.
            int transparentes = 0;
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * stride + x * 4 + 3] < 16) transparentes++;

            if (transparentes * 100L > (long)w * h * 3) {
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++)
                        if (px[y * stride + x * 4 + 3] < 16) fondo[y * w + x] = true;
            } else {
                int umbral = 232;
                Queue<int> cola = new Queue<int>();
                for (int x = 0; x < w; x++) {
                    SembrarBlanco(px, stride, w, fondo, cola, x, 0, umbral);
                    SembrarBlanco(px, stride, w, fondo, cola, x, h - 1, umbral);
                }
                for (int y = 0; y < h; y++) {
                    SembrarBlanco(px, stride, w, fondo, cola, 0, y, umbral);
                    SembrarBlanco(px, stride, w, fondo, cola, w - 1, y, umbral);
                }
                while (cola.Count > 0) {
                    int p = cola.Dequeue();
                    int x = p % w, y = p / w;
                    if (x + 1 < w)  SembrarBlanco(px, stride, w, fondo, cola, x + 1, y, umbral);
                    if (x - 1 >= 0) SembrarBlanco(px, stride, w, fondo, cola, x - 1, y, umbral);
                    if (y + 1 < h)  SembrarBlanco(px, stride, w, fondo, cola, x, y + 1, umbral);
                    if (y - 1 >= 0) SembrarBlanco(px, stride, w, fondo, cola, x, y - 1, umbral);
                }
                for (int pase = 0; pase < 2; pase++) {
                    List<int> orla = new List<int>();
                    for (int y = 0; y < h; y++)
                        for (int x = 0; x < w; x++) {
                            if (fondo[y * w + x]) continue;
                            if (Lum(px, y * stride + x * 4) <= umbral - 34) continue;
                            if (!Vecino(fondo, w, h, x, y)) continue;
                            orla.Add(y * w + x);
                        }
                    for (int q = 0; q < orla.Count; q++) fondo[orla[q]] = true;
                }

                // AGUJERO CERRADO EN UN ORIGINAL SIN ALFA.
                //
                // La inundacion de arriba entra SOLO por el borde de la imagen,
                // asi que un blanco encerrado -el centro del aro de la corona de
                // espinas, el lazo de la cadena del amuleto- no lo alcanza nunca
                // y sale del recorte como una mancha opaca.
                //
                // `arosRitmica` no daba este problema porque su lamina ya trae
                // alfa y entra por la rama de arriba. Los dibujos nuevos de
                // resources/objetos/pasivos/ llegan opacos, con el fondo pintado
                // de blanco, y para esos hay que ir a buscar el hueco.
                //
                // Solo se hace para los iconos declarados en ICONOS_CON_AGUJERO:
                // vaciar todo blanco encerrado a ciegas se comeria los brillos
                // del metal de los otros veintisiete. Y aun ahi se pide que la
                // mancha ocupe al menos el 3 por mil de la imagen, que es lo que
                // separa un agujero de un reflejo.
                if (huecosIcono != null && i < huecosIcono.Length && huecosIcono[i]) {
                    bool[] visto = new bool[w * h];
                    for (int y = 0; y < h; y++)
                        for (int x = 0; x < w; x++) {
                            int idx = y * w + x;
                            if (fondo[idx] || visto[idx]) continue;
                            if (Lum(px, y * stride + x * 4) < umbral) continue;
                            List<int> comp = new List<int>();
                            Queue<int> cerrada = new Queue<int>();
                            cerrada.Enqueue(idx); visto[idx] = true;
                            while (cerrada.Count > 0) {
                                int p = cerrada.Dequeue();
                                comp.Add(p);
                                int cx = p % w, cy = p / w;
                                for (int d = 0; d < 4; d++) {
                                    int nx = cx + (d == 0 ? 1 : d == 1 ? -1 : 0);
                                    int ny = cy + (d == 2 ? 1 : d == 3 ? -1 : 0);
                                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                                    int ni = ny * w + nx;
                                    if (visto[ni] || fondo[ni]) continue;
                                    if (Lum(px, ny * stride + nx * 4) < umbral) continue;
                                    visto[ni] = true;
                                    cerrada.Enqueue(ni);
                                }
                            }
                            if (comp.Count * 1000L >= (long)w * h * 3)
                                for (int c = 0; c < comp.Count; c++) fondo[comp[c]] = true;
                        }
                    // Y la misma orla que el fondo de fuera, por el borde suave
                    // que el dibujo deja al otro lado del agujero.
                    for (int pase = 0; pase < 2; pase++) {
                        List<int> orla = new List<int>();
                        for (int y = 0; y < h; y++)
                            for (int x = 0; x < w; x++) {
                                if (fondo[y * w + x]) continue;
                                if (Lum(px, y * stride + x * 4) <= umbral - 34) continue;
                                if (!Vecino(fondo, w, h, x, y)) continue;
                                orla.Add(y * w + x);
                            }
                        for (int q = 0; q < orla.Count; q++) fondo[orla[q]] = true;
                    }
                }
            }

            int[] caja = CajaSilueta(fondo, w, 0, 0, w - 1, h - 1);
            if (caja == null) { informe.Append(i + ":VACIA "); continue; }

            int silW = caja[2] - caja[0] + 1, silH = caja[3] - caja[1] + 1;
            // Encaje "contener" y CENTRADO en los dos ejes, igual que en la hoja
            // unica: un icono no se apoya en ningun suelo. Y el mismo motivo
            // para escalar desde un bufer con el fondo a alfa 0: si no, la media
            // de area arrastra el blanco al borde del dibujo.
            double esc = Math.Min((double)lado / silW, (double)lado / silH);
            int dw = Math.Max(1, (int)Math.Round(silW * esc));
            int dh = Math.Max(1, (int)Math.Round(silH * esc));

            byte[] recorte = new byte[silW * 4 * silH];
            int rStride = silW * 4;
            for (int y = 0; y < silH; y++)
                for (int x = 0; x < silW; x++) {
                    int p = (caja[1] + y) * stride + (caja[0] + x) * 4;
                    int q = y * rStride + x * 4;
                    bool esFondo = fondo[(caja[1] + y) * w + (caja[0] + x)];
                    recorte[q]     = px[p];
                    recorte[q + 1] = px[p + 1];
                    recorte[q + 2] = px[p + 2];
                    recorte[q + 3] = esFondo ? (byte)0 : px[p + 3];
                }

            EscalarBloque(recorte, rStride, silW, silH, 0, 0, silW, silH,
                          dst, dStride, i * lado + (lado - dw) / 2, (lado - dh) / 2, dw, dh);
            informe.Append(i + ":" + silW + "x" + silH + " ");
            hallados++;
        }

        // Los que llevan agujero de verdad se rehacen DESPUES, desde una copia
        // del antes: `Rematar` trabaja sobre la tira entera de un tiron -inunda
        // desde su borde- y no sabe pararse en la casilla de un icono. Asi que
        // primero pasa por toda la tira como siempre, y luego cada icono
        // marcado se vuelve a rematar solo, en un bufer de su tamano, con el
        // relleno apagado, y se copia encima.
        //
        // El bufer de un icono suelto es exactamente lo que hace falta para que
        // esto salga bien: su borde es el borde de la casilla, que en un icono
        // centrado siempre es transparente, asi que la inundacion entra por
        // donde tiene que entrar y el centro del aro se queda vacio.
        bool alguno = false;
        if (huecosIcono != null)
            for (int i = 0; i < n && i < huecosIcono.Length; i++) if (huecosIcono[i]) alguno = true;

        byte[] previo = alguno ? (byte[])dst.Clone() : null;

        Rematar(dst, tiraW, lado, dStride, !huecos);

        if (alguno) {
            int cStride = lado * 4;
            byte[] celda = new byte[cStride * lado];
            for (int i = 0; i < n && i < huecosIcono.Length; i++) {
                if (!huecosIcono[i]) continue;
                for (int y = 0; y < lado; y++)
                    Array.Copy(previo, y * dStride + i * lado * 4, celda, y * cStride, cStride);
                Rematar(celda, lado, lado, cStride, false);
                for (int y = 0; y < lado; y++)
                    Array.Copy(celda, y * cStride, dst, y * dStride + i * lado * 4, cStride);
            }
        }

        using (Bitmap sal = new Bitmap(tiraW, lado, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, tiraW, lado),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < lado; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return hallados + "|" + lado + "|" + informe.ToString();
    }

    // ---------------------------------------------------------------------
    // Celdas sueltas de una lamina sobre BLANCO
    // ---------------------------------------------------------------------
    //
    // Las laminas de efectos (resources/armas/efectos/) son catalogos de pixel
    // art sobre fondo blanco puro y rejilla regular. Esto recorta las celdas
    // PEDIDAS -no la lamina entera- y las deja en una tira, igual que
    // RecortarIconos. Va aparte por dos motivos que no son cosmeticos:
    //
    // 1. EL FONDO SE QUITA POR INUNDACION, no por umbral a secas. Es la misma
    //    decision que QuitarFondoOpaco tomo con el conejo blanco, y aqui hace
    //    la misma falta: el charco de lava tiene brillos casi blancos y el
    //    anillo de escarcha es blanco entero. Un umbral plano los agujerearia
    //    por dentro; inundando desde el borde de la celda solo se borra el
    //    blanco al que se llega sin cruzar el contorno del dibujo.
    //
    // 2. SE ELIGE QUE CELDAS. De la lamina de 32 solo interesan tres. `indices`
    //    son los huecos en orden de lectura, base 0, separados por comas, y el
    //    orden de la tira es el orden en que se piden.
    //
    // Devuelve: pedidas|lado|detalle por celda
    // `huecos`, igual que en las otras dos. Esta no la llama nadie hoy —quedo de
    // reserva para el proximo catalogo, ver su cabecera— pero se le pone el
    // mismo parametro para que no vuelva a nacer con el mismo fallo.
    public static string RecortarCeldas(string entrada, string salida,
                                        int cols, int filas, string indices,
                                        int lado, int umbral, bool estirar,
                                        bool huecos) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);

        string[] trozos = indices.Split(',');
        int n = trozos.Length;
        int cw = w / cols, ch = h / filas;

        int tiraW = lado * n;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * lado];
        System.Text.StringBuilder informe = new System.Text.StringBuilder();

        for (int i = 0; i < n; i++) {
            int k = int.Parse(trozos[i].Trim());
            int c = k % cols, r = k / cols;
            int x0 = c * cw, y0 = r * ch;
            int x1 = x0 + cw - 1, y1 = y0 + ch - 1;
            if (x1 >= w) x1 = w - 1;
            if (y1 >= h) y1 = h - 1;

            // VENTANA AMPLIADA, y esta es la pieza que hace que la rejilla
            // nominal deje de mandar.
            //
            // El dibujo no cabe en su casilla, y se desborda EN LOS DOS
            // SENTIDOS: el de la fila de arriba se mete aqui (medido: una tira
            // de 35x3 en la celda 16) y el de aqui se sale por la derecha
            // (medido: 24 pixeles pegados al borde de la celda 22 y 481 mas en
            // los doce pixeles siguientes). Trabajando solo dentro del
            // rectangulo de la casilla, lo primero ensucia y lo segundo se
            // pierde -- el charco de alquitran salia con un tajo recto en el
            // flanco derecho, y a radio grande se veia.
            //
            // Asi que se mira una ventana mas ancha que la casilla y despues se
            // decide por CENTRO: se queda lo que tenga el suyo dentro de la
            // casilla de verdad. Lo que se desborda es suyo y viene entero
            // porque su centro no se ha movido; lo del vecino se cae porque el
            // suyo esta en otra casilla. Es la misma regla que RecortarIconos
            // usa con las hojas de iconos, y resuelve los dos desbordes con un
            // solo criterio.
            int mx = (int)(cw * MARGEN_CELDA), my = (int)(ch * MARGEN_CELDA);
            int ex0 = Math.Max(0, x0 - mx), ey0 = Math.Max(0, y0 - my);
            int ex1 = Math.Min(w - 1, x1 + mx), ey1 = Math.Min(h - 1, y1 + my);

            // --- Inundacion del blanco desde el borde de la ventana ---------
            bool[] fondo = new bool[w * h];
            Queue<int> cola = new Queue<int>();
            for (int x = ex0; x <= ex1; x++) {
                SembrarBlanco(px, stride, w, fondo, cola, x, ey0, umbral);
                SembrarBlanco(px, stride, w, fondo, cola, x, ey1, umbral);
            }
            for (int y = ey0; y <= ey1; y++) {
                SembrarBlanco(px, stride, w, fondo, cola, ex0, y, umbral);
                SembrarBlanco(px, stride, w, fondo, cola, ex1, y, umbral);
            }
            while (cola.Count > 0) {
                int p = cola.Dequeue();
                int x = p % w, y = p / w;
                for (int d = 0; d < 4; d++) {
                    int nx = x + (d == 0 ? 1 : d == 1 ? -1 : 0);
                    int ny = y + (d == 2 ? 1 : d == 3 ? -1 : 0);
                    if (nx < ex0 || ny < ey0 || nx > ex1 || ny > ey1) continue;
                    SembrarBlanco(px, stride, w, fondo, cola, nx, ny, umbral);
                }
            }

            // El halo de compresion del JPG deja un reborde de blanco sucio que
            // el umbral no alcanza y que se ve como una orla clara pegada al
            // contorno. Se erosiona contra el fondo: solo cae lo que YA toca
            // fondo y sigue siendo casi blanco, asi que el dibujo no pierde
            // nada suyo.
            //
            // DOS PASADAS y no una. Con una sola quedaba orla visible en cuanto
            // la calcomania se ampliaba: el halo del JPG es de dos pixeles, no
            // de uno, y al estirar el sprite el segundo se convierte en un
            // reborde blanco de seis o siete pixeles de pantalla.
            for (int pase = 0; pase < 2; pase++) {
                List<int> orla = new List<int>();
                for (int y = ey0; y <= ey1; y++)
                    for (int x = ex0; x <= ex1; x++) {
                        if (fondo[y * w + x]) continue;
                        if (Lum(px, y * stride + x * 4) <= umbral - 34) continue;
                        if (!Vecino(fondo, w, h, x, y)) continue;
                        orla.Add(y * w + x);
                    }
                for (int q = 0; q < orla.Count; q++) fondo[orla[q]] = true;
            }

            // --- Solo lo que es SUYO ---------------------------------------
            //
            // Es la misma leccion que RecortarIconos ya aprendio con las hojas
            // de iconos, y aqui hacia la misma falta: EL DIBUJO NO RESPETA SU
            // CASILLA. La rejilla de la lamina es nominal, y el efecto de la
            // fila de arriba sangra unos pixeles dentro de esta celda.
            //
            // Medido: en la celda 16 la isla buena mide 127x84 y el sangrado es
            // una tira de 35x3 pegada al borde superior. Con la tira dentro, la
            // caja de la silueta pasa a 126x104 -veinte filas de aire- y al
            // encajar "contener" en el marco cuadrado el charco sale ENCOGIDO y
            // DESCENTRADO. Un solo defecto que se ve como tres.
            //
            // Se queda la isla mayor y las que sean suyas de verdad: al menos un
            // 12% de su area y con el centro dentro del 80% central de la
            // casilla. Un sangrado del vecino tiene el centro pegado al borde
            // por definicion, asi que ese criterio lo descarta sin tocar los
            // dibujos de varias piezas -un charco con sus gotas sueltas-, que
            // son lo unico que un "quedarse solo con la mayor" habria roto.
            SoloIslasPropias(fondo, w, ex0, ey0, ex1, ey1, x0, y0, x1, y1);

            int[] caja = CajaSilueta(fondo, w, ex0, ey0, ex1, ey1);
            if (caja == null) { informe.Append(k + ":VACIA "); continue; }

            int silW = caja[2] - caja[0] + 1, silH = caja[3] - caja[1] + 1;

            // ENCAJE. Dos maneras, y para las calcomanias de zona manda
            // `estirar`, que llena el marco deformando la silueta.
            //
            // Suena mal y es lo correcto. El encaje "contener" -el que usan los
            // iconos- respeta la proporcion, y estos charcos estan dibujados
            // como elipses muy achatadas: 130x66, casi 2:1. Metidas en un marco
            // cuadrado llenaban a lo ancho y dejaban media corona de suelo
            // desnudo arriba y abajo... suelo que SI HACE DANO, porque la zona
            // es el circulo entero. Medido en la revision: la mancha cubria el
            // 45% del aro. Un jugador con los pies en el borde de arriba juraria
            // que esta fuera, y esa es la peor mentira que puede contar un
            // efecto de suelo.
            //
            // Deformar no cuesta nada aqui porque UN CHARCO ES AMORFO: no hay
            // proporcion verdadera que respetar en una mancha de brea. Y a los
            // dibujos que si son redondos -el anillo de escarcha, el sello de
            // piedra- no les pasa nada, porque su silueta ya es cuadrada y
            // estirarla al marco es la identidad.
            int dw, dh, offX, offY;
            if (estirar) {
                dw = lado; dh = lado; offX = 0; offY = 0;
            } else {
                double esc = Math.Min((double)lado / silW, (double)lado / silH);
                dw = Math.Max(1, (int)Math.Round(silW * esc));
                dh = Math.Max(1, (int)Math.Round(silH * esc));
                offX = (lado - dw) / 2; offY = (lado - dh) / 2;
            }

            byte[] recorte = new byte[silW * 4 * silH];
            int rStride = silW * 4;
            for (int y = 0; y < silH; y++)
                for (int x = 0; x < silW; x++) {
                    int sxp = caja[0] + x, syp = caja[1] + y;
                    int p = syp * stride + sxp * 4;
                    int q = y * rStride + x * 4;
                    bool esFondo = fondo[syp * w + sxp];
                    recorte[q]     = px[p];
                    recorte[q + 1] = px[p + 1];
                    recorte[q + 2] = px[p + 2];
                    recorte[q + 3] = esFondo ? (byte)0 : (byte)255;

                    // QUITAR EL TIMBRE DEL FILO. Tras las dos erosiones queda un
                    // reborde claro perfilando la silueta: es el ringing del
                    // JPG, y canta porque sigue el contorno en vez de responder
                    // a una luz.
                    //
                    // No se erosiona una tercera vez: se comeria dibujo de
                    // verdad, y en una silueta de 66 pixeles tres filas ya son
                    // un 5%. Y tampoco se OSCURECE, que fue el primer intento y
                    // no vale: bajar el brillo un 30% convierte el blanco en
                    // gris claro, que sobre la losa azul del nivel se sigue
                    // viendo igual de bien. Bajaba la medida, no el defecto.
                    //
                    // Se COPIA HACIA DENTRO: el pixel del filo toma el color de
                    // un vecino que ya no toque el fondo, o sea dibujo limpio.
                    // Asi el contorno hereda el color que le corresponde en vez
                    // de un tono inventado, y funciona sea la calcomania oscura
                    // (el alquitran) o clara (el anillo de escarcha), cosa que
                    // oscurecer no hacia.
                    if (esFondo) continue;
                    if (!Vecino(fondo, w, h, sxp, syp)) continue;
                    int limpio = -1;
                    for (int d = 0; d < 8 && limpio < 0; d++) {
                        int nx = sxp + VEC8X[d], ny = syp + VEC8Y[d];
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        if (fondo[ny * w + nx]) continue;
                        if (Vecino(fondo, w, h, nx, ny)) continue;   // tambien es filo
                        limpio = ny * stride + nx * 4;
                    }
                    if (limpio < 0) continue;      // silueta de un pixel de ancho
                    recorte[q]     = px[limpio];
                    recorte[q + 1] = px[limpio + 1];
                    recorte[q + 2] = px[limpio + 2];
                }

            // DOMINANTE y no media de area: la lamina es pixel art de paleta
            // corta y contorno grueso, justo el caso para el que se escribio
            // EscalarDominante (ver su cabecera). Promediar inventaria colores
            // que no estan y emborronaria el contorno, que es lo unico que
            // sostiene la silueta cuando el charco se dibuje pequeno.
            EscalarDominante(recorte, rStride, silW, silH, 0, 0, silW, silH,
                             dst, dStride, i * lado + offX, offY, dw, dh);
            informe.Append(k + ":" + silW + "x" + silH + " ");
        }

        Rematar(dst, tiraW, lado, dStride, !huecos);

        using (Bitmap sal = new Bitmap(tiraW, lado, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, tiraW, lado),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < lado; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return n + "|" + lado + "|" + informe.ToString();
    }

    // Marca como fondo todo lo que no pertenezca al dibujo de esta celda. Ver
    // el comentario largo en RecortarCeldas: separa las manchas conexas, se
    // queda con la mayor y con las que sean claramente suyas, y tira el resto.
    const double ISLA_MINIMA = 0.12;   // fraccion del area de la isla mayor
    const double MARGEN_CELDA = 0.30;  // cuanto se ensancha la ventana de busqueda

    // Los ocho vecinos, para la copia hacia dentro del filo.
    static readonly int[] VEC8X = { 1, -1, 0, 0, 1, 1, -1, -1 };
    static readonly int[] VEC8Y = { 0, 0, 1, -1, 1, -1, 1, -1 };

    // (x0..y1) es la VENTANA en la que se busca; (cx0..cy1) la casilla de
    // verdad, la que decide de quien es cada mancha.
    static void SoloIslasPropias(bool[] fondo, int w, int x0, int y0, int x1, int y1,
                                 int cx0, int cy0, int cx1, int cy1) {
        int cw = x1 - x0 + 1, ch = y1 - y0 + 1;
        int[] etiqueta = new int[cw * ch];      // 0 = sin visitar
        List<long> area = new List<long>();
        List<long> sumX = new List<long>();
        List<long> sumY = new List<long>();
        area.Add(0); sumX.Add(0); sumY.Add(0);  // hueco de la etiqueta 0

        Queue<int> cola = new Queue<int>();
        for (int y = 0; y < ch; y++) {
            for (int x = 0; x < cw; x++) {
                if (etiqueta[y * cw + x] != 0) continue;
                if (fondo[(y0 + y) * w + (x0 + x)]) continue;

                int id = area.Count;
                long n = 0, sx = 0, sy = 0;
                etiqueta[y * cw + x] = id;
                cola.Enqueue(y * cw + x);
                while (cola.Count > 0) {
                    int p = cola.Dequeue();
                    int qx = p % cw, qy = p / cw;
                    n++; sx += qx; sy += qy;
                    for (int d = 0; d < 4; d++) {
                        int nx = qx + (d == 0 ? 1 : d == 1 ? -1 : 0);
                        int ny = qy + (d == 2 ? 1 : d == 3 ? -1 : 0);
                        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
                        if (etiqueta[ny * cw + nx] != 0) continue;
                        if (fondo[(y0 + ny) * w + (x0 + nx)]) continue;
                        etiqueta[ny * cw + nx] = id;
                        cola.Enqueue(ny * cw + nx);
                    }
                }
                area.Add(n); sumX.Add(sx); sumY.Add(sy);
            }
        }
        if (area.Count <= 1) return;

        // DE QUIEN ES CADA MANCHA: de la casilla donde cae su centro. Se calcula
        // primero quien es de aqui, y solo entre esas se busca la mayor -- si la
        // referencia fuese la mayor de la ventana, un vecino grande asomando por
        // el borde subiria el liston y se llevaria por delante los trozos
        // legitimos de este dibujo.
        bool[] esDeAqui = new bool[area.Count];
        long mayor = 0;
        for (int i = 1; i < area.Count; i++) {
            double cx = x0 + (double)sumX[i] / area[i];
            double cy = y0 + (double)sumY[i] / area[i];
            if (cx < cx0 || cx > cx1 || cy < cy0 || cy > cy1) continue;
            esDeAqui[i] = true;
            if (area[i] > mayor) mayor = area[i];
        }
        if (mayor == 0) return;      // nada con centro aqui: mejor no tocar nada

        bool[] vale = new bool[area.Count];
        for (int i = 1; i < area.Count; i++) {
            if (!esDeAqui[i]) continue;
            vale[i] = area[i] == mayor || area[i] >= mayor * ISLA_MINIMA;
        }

        for (int y = 0; y < ch; y++)
            for (int x = 0; x < cw; x++) {
                int id = etiqueta[y * cw + x];
                if (id != 0 && !vale[id]) fondo[(y0 + y) * w + (x0 + x)] = true;
            }
    }

    // ---------------------------------------------------------------------
    // Rejilla fija de una hoja QUE YA TRAE ALFA
    // ---------------------------------------------------------------------
    //
    // Para hojas de ANIMACION, que son otra cosa que los catalogos de efectos.
    // Tres diferencias con RecortarCeldas, y las tres son el mismo principio:
    //
    // 1. CAJA COMUN, NO CAJA POR FOTOGRAMA. Se recorta el mismo cuadro en todas
    //    las celdas -centrado en el pivote y con medio lado `medio`- y jamas se
    //    ajusta a la silueta de cada una. Es la leccion que ProcesarGif ya tiene
    //    escrita: ajustando por fotograma, una animacion que CRECE queda
    //    centrada y del mismo tamano en todos, y el crecimiento desaparece. En
    //    esta hoja el tajo va de 211 a 237 de radio; recortando ajustado, los
    //    seis saldrian identicos.
    //
    // 2. NO SE TOCA EL ALFA. Ni umbral, ni inundacion, ni Rematar. La hoja trae
    //    su transparencia y ademas es una ilustracion con bloom y semitrans-
    //    parencias: endurecer el alfa -que es justo lo que hace bien con un
    //    sprite de pixel art- aqui la destrozaria.
    //
    // 3. EL PIVOTE MANDA. Se recorta centrado en el, asi que el pivote acaba
    //    siendo el centro del fotograma de salida y el juego puede dibujarlo
    //    con un drawImage centrado, sin desplazamientos por fotograma.
    //
    // Y `medio` se elige midiendo: si vale el radio del contenido mas lejano de
    // toda la hoja, el borde del dibujo cae en el borde del fotograma, y
    // entonces dibujarlo con medio lado = alcance del arma pone el filo del tajo
    // exactamente en el radio que hace dano. Sin factores de correccion.
    //
    // Devuelve: celdas|lado
    public static string RecortarRejilla(string entrada, string salida,
                                         int cols, int filas,
                                         int pivX, int pivY, int medio, int lado) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);

        int cw = w / cols, ch = h / filas;
        int n = cols * filas;
        int tiraW = lado * n;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * lado];

        for (int i = 0; i < n; i++) {
            int cx = (i % cols) * cw, cy = (i / cols) * ch;
            int sx = cx + pivX - medio, sy = cy + pivY - medio;
            int lo = medio * 2;
            // Recorte al lienzo: si el cuadro se sale, se encoge la fuente y el
            // destino a la vez, para no desplazar el pivote.
            if (sx < 0) sx = 0;
            if (sy < 0) sy = 0;
            if (sx + lo > w) lo = w - sx;
            if (sy + lo > h) lo = h - sy;
            EscalarBloque(px, stride, w, h, sx, sy, lo, lo,
                          dst, dStride, i * lado, 0, lado, lado);
        }

        // Sin Rematar, a proposito: ver el punto 2 de la cabecera.
        using (Bitmap sal = new Bitmap(tiraW, lado, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, tiraW, lado),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < lado; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return n + "|" + lado;
    }

    // ---------------------------------------------------------------------
    // Dibujo suelto NO CUADRADO, ajustado a su silueta
    // ---------------------------------------------------------------------
    //
    // Para lo que no es un disco. RecortarRejilla recorta un CUADRADO centrado
    // en el pivote, que es lo correcto para lo que gira -un aura, un escudo, un
    // barrido- porque asi nada entra ni sale del cuadro al rotar. Pero una bala
    // mide 430x190: el cuadrado que la contuviera necesitaria 215 de medio lado
    // y por arriba solo hay 155, o sea que la cortaria.
    //
    // Aqui se recorta la silueta y punto, y el destino lleva su propia
    // proporcion. Quien lo dibuje decide donde cae el punto de anclaje.
    //
    // SIN Rematar: puede ser pixel art de alfa dura -que no lo necesita- o un
    // dibujo con bordes suaves -al que se los estropearia-.
    //
    // Devuelve: anchoSal|altoSal|siluetaW|siluetaH
    public static string RecortarSuelto(string entrada, string salida,
                                        int anchoSal, int altoSal) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);

        int minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                if (px[y * stride + x * 4 + 3] <= 24) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        if (maxX < 0) return "VACIA";

        int silW = maxX - minX + 1, silH = maxY - minY + 1;
        int dStride = anchoSal * 4;
        byte[] dst = new byte[dStride * altoSal];
        EscalarBloque(px, stride, w, h, minX, minY, silW, silH,
                      dst, dStride, 0, 0, anchoSal, altoSal);

        using (Bitmap sal = new Bitmap(anchoSal, altoSal, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, anchoSal, altoSal),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < altoSal; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return anchoSal + "|" + altoSal + "|" + silW + "|" + silH;
    }

    // ---------------------------------------------------------------------
    // UNA CELDA DE UNA HOJA, A UN ARCHIVO SUELTO
    // ---------------------------------------------------------------------
    //
    // Existe por la PORTADA del Codice Infernal. Los diez libros vienen en una
    // sola lamina y el icono del arma tiene que ser el primero de ellos, pero
    // la tira de iconos se monta desde ARCHIVOS SUELTOS, uno por arma (ver
    // RecortarIconosSueltos). Esto saca la celda que haga falta a un PNG
    // aparte, que es lo unico que faltaba para que las dos cosas encajen.
    //
    // CORTE RECTANGULAR y no por islas, al reves que RecortarIconos: aqui la
    // lamina tiene los diez libros con calles limpias entre ellos -medidas: las
    // columnas opacas van 18-227, 249-461, 479-688, 710-920 y 942-1156 sobre
    // celdas de 233- asi que ninguna celda puede robarle un pixel a la vecina.
    // Y quien recibe este archivo recorta la silueta por su cuenta.
    public static string ExtraerCelda(string entrada, string salida,
                                      int cols, int filas, int celda) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);

        int cw = w / cols, ch = h / filas;
        int x0 = (celda % cols) * cw, y0 = (celda / cols) * ch;

        int dStride = cw * 4;
        byte[] dst = new byte[dStride * ch];
        EscalarBloque(px, stride, w, h, x0, y0, cw, ch, dst, dStride, 0, 0, cw, ch);

        using (Bitmap sal = new Bitmap(cw, ch, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, cw, ch),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < ch; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return cw + "|" + ch;
    }

    static void SembrarBlanco(byte[] px, int stride, int w, bool[] fondo,
                              Queue<int> cola, int x, int y, int umbral) {
        int i = y * w + x;
        if (fondo[i]) return;
        if (Lum(px, y * stride + x * 4) < umbral) return;
        fondo[i] = true;
        cola.Enqueue(i);
    }

    // ---------------------------------------------------------------------
    // Reduccion por COLOR DOMINANTE
    // ---------------------------------------------------------------------
    //
    // Alternativa a la media de area para dibujo de COLORES PLANOS. En vez de
    // promediar el bloque de origen, se queda con el color que mas se repite
    // dentro de el.
    //
    // Por que hace falta: promediar inventa colores que no estan en el dibujo.
    // En una ilustracion con volumen y degradados eso es justo lo que se
    // quiere, pero en una de tintas planas destroza los detalles pequenos. El
    // escudo del Atleti del ataud de Eric es el caso de libro: mide unos
    // 130x150 en el original y acaba en 28x32, asi que cada pixel de destino
    // promedia mas de veinte de origen. Con rayas rojas y blancas de dos
    // pixeles y estrellas blancas de tres, la media daba un rosa sucio uniforme
    // y el escudo se volvia una mancha. Con el dominante, cada pixel del
    // resultado es un color que EXISTE en el escudo, asi que la diagonal se
    // mantiene azul, las rayas rojas y las estrellas blancas.
    //
    // Los colores se agrupan en cubos de 16 niveles por canal antes de votar: a
    // pelo, dos rojos que difieren en un valor contarian como colores distintos
    // y ninguno ganaria. Se devuelve la MEDIA de los pixeles del cubo ganador,
    // no el centro del cubo, para no cuantizar la paleta de paso.
    //
    // El alfa NO se vota, se promedia: es lo que mantiene el borde suave que
    // luego endurece Rematar. Votarlo daria un contorno dentado.
    static void EscalarDominante(byte[] px, int stride, int w, int h,
                                 int sx0, int sy0, int sw, int sh,
                                 byte[] dst, int dStride, int dx0, int dy0, int dw, int dh) {
        Dictionary<int, long[]> votos = new Dictionary<int, long[]>();
        for (int y = 0; y < dh; y++) {
            int ay0 = sy0 + (int)((long)y * sh / dh);
            int ay1 = sy0 + (int)((long)(y + 1) * sh / dh);
            if (ay1 <= ay0) ay1 = ay0 + 1;
            for (int x = 0; x < dw; x++) {
                int ax0 = sx0 + (int)((long)x * sw / dw);
                int ax1 = sx0 + (int)((long)(x + 1) * sw / dw);
                if (ax1 <= ax0) ax1 = ax0 + 1;

                votos.Clear();
                long sumaA = 0; int n = 0;
                for (int sy = ay0; sy < ay1; sy++) {
                    if (sy < 0 || sy >= h) { n++; continue; }
                    for (int sx = ax0; sx < ax1; sx++) {
                        if (sx < 0 || sx >= w) { n++; continue; }
                        int p = sy * stride + sx * 4;
                        int a = px[p + 3];
                        sumaA += a; n++;
                        if (a < 128) continue;          // lo transparente no vota color
                        int clave = (px[p + 2] / 16) * 4096 + (px[p + 1] / 16) * 64 + (px[p] / 16);
                        long[] v;
                        if (!votos.TryGetValue(clave, out v)) { v = new long[4]; votos[clave] = v; }
                        v[0] += px[p + 2]; v[1] += px[p + 1]; v[2] += px[p]; v[3]++;
                    }
                }

                int q = (dy0 + y) * dStride + (dx0 + x) * 4;
                long mejor = 0; long[] ganador = null;
                foreach (KeyValuePair<int, long[]> kv in votos) {
                    if (kv.Value[3] > mejor) { mejor = kv.Value[3]; ganador = kv.Value; }
                }
                if (ganador == null) { dst[q] = 0; dst[q+1] = 0; dst[q+2] = 0; dst[q+3] = 0; }
                else {
                    dst[q]     = (byte)(ganador[2] / ganador[3]);   // B
                    dst[q + 1] = (byte)(ganador[1] / ganador[3]);   // G
                    dst[q + 2] = (byte)(ganador[0] / ganador[3]);   // R
                    dst[q + 3] = (byte)(sumaA / n);
                }
            }
        }
    }

    // Reduccion por media de area con alfa premultiplicado. Premultiplicar no es
    // un detalle: sin ello, los pixeles transparentes aportan su color (a menudo
    // negro) a la media y el sprite sale con un halo oscuro en todo el contorno.
    static void EscalarBloque(byte[] px, int stride, int w, int h,
                              int sx0, int sy0, int sw, int sh,
                              byte[] dst, int dStride, int dx0, int dy0, int dw, int dh) {
        for (int y = 0; y < dh; y++) {
            int ay0 = sy0 + (int)((long)y * sh / dh);
            int ay1 = sy0 + (int)((long)(y+1) * sh / dh);
            if (ay1 <= ay0) ay1 = ay0 + 1;
            for (int x = 0; x < dw; x++) {
                int ax0 = sx0 + (int)((long)x * sw / dw);
                int ax1 = sx0 + (int)((long)(x+1) * sw / dw);
                if (ax1 <= ax0) ax1 = ax0 + 1;

                long sA=0, sR=0, sG=0, sB=0; int n=0;
                for (int sy = ay0; sy < ay1; sy++) {
                    if (sy < 0 || sy >= h) { n++; continue; }
                    for (int sx = ax0; sx < ax1; sx++) {
                        if (sx < 0 || sx >= w) { n++; continue; }
                        int p = sy*stride + sx*4;
                        int a = px[p+3];
                        sA += a;
                        sB += px[p]*a; sG += px[p+1]*a; sR += px[p+2]*a;
                        n++;
                    }
                }
                int q = (dy0+y)*dStride + (dx0+x)*4;
                if (sA == 0) { dst[q]=0; dst[q+1]=0; dst[q+2]=0; dst[q+3]=0; }
                else {
                    dst[q]   = (byte)(sB / sA);
                    dst[q+1] = (byte)(sG / sA);
                    dst[q+2] = (byte)(sR / sA);
                    dst[q+3] = (byte)(sA / n);
                }
            }
        }
    }
}
"@

# --- Configuracion ---------------------------------------------------------
$RAIZ    = Split-Path -Parent $PSScriptRoot
$ORIGEN  = Join-Path $RAIZ 'resources'
$DESTINO = Join-Path $RAIZ 'assets'
$ESCALA  = 4      # ESCALA_ARTE: 1 unidad logica = 4 pixeles fisicos
$TOL     = 30

# alto = alto LOGICO en unidades de 480x270. anchoFijo 0 => sale del ratio real.
# tol 0 => usa $TOL. Se sube solo en los que traen fondo sombreado o degradado.
#
# placeholder = la fuente no es recuperable automaticamente; se emite entrada de
# atlas sin archivo para que recursos.js genere su silueta. Ninguna lo necesita
# ahora: los cuatro personajes se re-exportaron con alfa real.
#
# --- TODO EL CATALOGO SE REDUJO AL 70% ---------------------------------------
#
# Se veia poco campo. El jugador medida 32 de alto sobre una pantalla de 270, o
# sea 8,4 alturas de personaje en vertical: con cuatro jugadores y varios
# cientos de bichos, no cabe la informacion que hace falta para decidir por
# donde salir. A 22 son 12,3 alturas, un 46% mas de campo util.
#
# Se reduce el ARTE y no se amplia el lienzo, y la diferencia importa. El lienzo
# fisico son 960x540 justamente porque en un monitor de 1080p entra por un
# factor entero exacto (x2); subirlo a 1280x720 dejaria el factor en 1 y el
# juego saldria en una ventana mas pequena rodeada de negro — mas campo, si,
# pero todo mas chico en pantalla, que es lo contrario de lo que se busca.
#
# Solo encogen los CUERPOS. Velocidades, alcances de arma y radio de recogida
# siguen en las mismas unidades logicas, asi que cruzar la pantalla cuesta lo
# mismo que antes y no se siente lento: lo que cambia es que ahora cabe mas
# alrededor. Los radios de colision de datos/enemigos.js bajan en la misma
# proporcion.
$CATALOGO = @(
    # SEGUNDA PASADA DE TAMAÑOS, por petición de Sergio tras jugar: la primera
    # (comentario histórico más abajo) encogió todo el bestiario al 70% del plan
    # original para que cupiera más campo en pantalla, y la serpiente encima se
    # cortó a la MITAD de eso (14->7) porque salía tan alta como un legionario.
    # Jugada la partida entera, se ha ido demasiado lejos: la serpiente y la
    # gárgola, que son lo primero que se ve en el minuto 0, casi no se
    # distinguen. Esta pasada las sube más que al resto —proporcionalmente son
    # las que más han crecido— y da un empujón general al resto del bestiario y
    # a los cuatro personajes. El radio de colisión de datos/enemigos.js sube en
    # la misma proporción que el alto de cada uno, para que la silueta y el
    # golpe seguido coincidiendo.
    @{ src='enemies\serpiente.gif';         dst='enemigos\serpiente.png'; id='serpiente'; alto=12;  anchoFijo=0;  tol=0; gif=$true }
    # GIF animado de 7 fotogramas, pixel art nativo de 48x48 ampliado 8x.
    # voltear porque el original mira a la izquierda y el motor asume derecha.
    @{ src='enemies\gargoyle.gif';         dst='enemigos\gargola.png';   id='gargola';   alto=18;  anchoFijo=0;  tol=0; gif=$true; voltear=$true; deCada=3 }
    # El legionario tambien pasa a GIF ANIMADO: el esqueleto de legionario.gif
    # sustituye a la ilustracion estatica. No lleva voltear porque ya mira a la
    # derecha, que es lo que asume el motor.
    @{ src='enemies\legionario.gif';       dst='enemigos\legionario.png';id='legionario';alto=28;  anchoFijo=0;  tol=0; gif=$true }
    @{ src='enemies\gladiador.gif';        dst='enemigos\gladiador.png'; id='gladiador'; alto=27;  anchoFijo=0;  tol=0; gif=$true }
    # La arpía pasa a GIF ANIMADO: bate las alas, que es lo único que hacía falta
    # para que el rol "rápido" se lea desde lejos. No lleva voltear: la pose es
    # frontal con las dos alas abiertas y no mira a ningún lado.
    @{ src='enemies\arpia.gif';            dst='enemigos\arpia.png';     id='arpia';     alto=19;  anchoFijo=0;  tol=0; gif=$true }
    # También en GIF. Frontal —encarada, con las serpientes del pelo moviéndose—
    # así que no lleva voltear.
    @{ src='enemies\medusa.gif';           dst='enemigos\medusa.png';    id='medusa';    alto=24;  anchoFijo=0;  tol=0; gif=$true }
    @{ src='enemies\minotauro.gif';        dst='enemigos\minotauro.png'; id='minotauro'; alto=30;  anchoFijo=0;  tol=0; gif=$true }
    # El cíclope cierra el bestiario: ya no queda un solo enemigo estático. Su
    # `tol=45` desaparece con la ilustración —era la tolerancia del recorte por
    # color, y un GIF trae su propio alfa, así que no hay fondo que adivinar—.
    @{ src='enemies\ciclope.gif';          dst='enemigos\ciclope.png';   id='ciclope';   alto=35;  anchoFijo=0;  tol=0; gif=$true }
    # Animada a mano en GIF (antes era una ilustración estática): mira a la
    # derecha en el original, así que no lleva voltear.
    @{ src='enemies\masticore.gif';        dst='enemigos\manticora.png'; id='manticora'; alto=43;  anchoFijo=0;  tol=0; gif=$true }
    @{ src='enemies\cerberus.gif';         dst='enemigos\cerbero.png';   id='cerbero';   alto=70;  anchoFijo=0;  tol=0; gif=$true }
    # La hidra deja de ser un sprite huérfano: recupera su papel de jefe, ahora
    # como el segundo de tres (minuto 20), entre Cerbero y la Loba. Ver el
    # bloque de jefes en datos/enemigos.js y datos/jefes.js.
    # Ya en GIF: las cabezas se mueven por su cuenta. Sin voltear, las bocas
    # miran a la derecha en el original.
    @{ src='enemies\hidra.gif';            dst='enemigos\hidra.png';     id='hidra';     alto=80;  anchoFijo=0;  tol=0; gif=$true }
    # JEFE FINAL DEL NIVEL 1 (minuto 30): la loba capitolina y los gemelos, en
    # version monstruosa. La loba mide más que la hidra (es el jefe final y
    # tiene que imponer más que el segundo). Los gemelos, algo más que un
    # gladiador: son criaturas, no adultos, pero tienen que verse desde lejos
    # porque hay que ir a por ellos.
    # Los dos en GIF. La loba va de frente —encarada al jugador, que es como
    # tiene que verse un jefe final— así que voltearla no cambiaría nada.
    @{ src='enemies\loba_capitolina.gif';  dst='enemigos\loba.png';      id='loba';      alto=90;  anchoFijo=0;  tol=0; gif=$true }
    @{ src='enemies\gemelo.gif';           dst='enemigos\gemelo.png';    id='gemelo';    alto=26;  anchoFijo=0;  tol=0; gif=$true }
    # Personajes: MISMO ALTO logico, ancho derivado de su silueta. Encajar
    # la figura dentro de un cuadrado comun hacia que las poses anchas salieran
    # mas bajas: a Vicky, con ratio 1.43, la limitaba el ancho y se quedaba más
    # baja que Eric con el mismo número.
    #
    # LOS CUATRO YA ANIMADOS A MANO, en GIF. Es la tercera y ultima forma de
    # animar un personaje que ha tenido este proyecto, y sustituye a las dos
    # anteriores:
    #
    #   1. Procedural (AnimarPersonaje): deformar la unica pose que habia. Lo
    #      llevaban Lucy, Sara y Vicky.
    #   2. Hojas dibujadas en rejilla 4x3 (hojaDer/hojaIzq). Solo Eric.
    #   3. GIF de 16 fotogramas. Los cuatro.
    #
    # Que Sergio dibujara tambien el de Eric, que YA tenia hojas, es lo que dice
    # que el GIF las sustituye y no que convivan. Los dos caminos viejos siguen
    # en la herramienta y funcionan: un personaje nuevo sin GIF se anima solo, y
    # devolverle a Eric sus hojas es cambiar esta linea. Pero no se usan.
    #
    # `gifAnim` es el SPRITE; `src` sigue siendo la ilustracion grande porque de
    # ahi salen el retrato y el cuerpo entero de la ficha, a resolucion completa
    # (650x1492 en Eric). Recortarlos de un fotograma del GIF seria cambiar un
    # busto nitido por una miniatura ampliada.
    #
    # No hay `hojaIzq` ni equivalente: sin `<id>Izq` en el atlas, jugador.js cae
    # en la copia espejada que ya precachea recursos.js. Con arte FRONTAL como
    # este el espejo casi no se nota —es lo que ya hacian Lucy, Sara y Vicky—.
    #
    # `idle` es el fotograma del que se copia el reposo: el 0, que es el unico
    # con los dos pies en el suelo. Cualquier otro deja al personaje parado a
    # media zancada.
    @{ src='characters\Eric.png';  dst='personajes\eric.png';  id='eric';  alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Eric.gif';  idle=0; nQuieto=2; fpsAndar=14 }
    @{ src='characters\Lucy.png';  dst='personajes\lucy.png';  id='lucy';  alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Lucy.gif';  idle=0; nQuieto=2; fpsAndar=14 }
    @{ src='characters\Sara.png';  dst='personajes\sara.png';  id='sara';  alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Sara.gif';  idle=0; nQuieto=2; fpsAndar=14 }
    @{ src='characters\Vicky.png'; dst='personajes\vicky.png'; id='vicky'; alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Vicky.gif'; idle=0; nQuieto=2; fpsAndar=14 }

    # LAS CUATRO DE PAGO, YA DIBUJADAS. Ocupan los cuatro huecos que hasta ahora
    # llevaban arte prestado (ver datos/personajes.js): Quinto era Eric con otro
    # nombre, Livia era Lucy, y asi. Sergio las ha dibujado y esos nombres de
    # relleno se han ido con el arte prestado.
    #
    # CADA UNA CON SU ESTATURA, y esto es una decision de Sergio, no un ajuste
    # tecnico: Helen es la mas baja de las ocho, Julie un poco mas baja que
    # Sara, Say mide lo que Vicky y Sofi es la mas alta de todas, un poco por
    # encima de Lucy. Los cuatro de arriba se quedan los cuatro en 26, que es de
    # donde salen las referencias.
    #
    # NO TOCA NADA DEL JUEGO. `alto` es el tamano del DIBUJO; el circulo de
    # colision del jugador es una constante fija (`radio: 8` en BASE, ver
    # entidades/jugador.js) y no se deriva del sprite. Una heroina mas alta no
    # recibe mas golpes ni ocupa mas sitio: solo se ve mas alta.
    #
    # Los numeros salen de las propias ilustraciones. Sergio las redibujo sobre
    # el mismo lienzo -408x612 las tres, 435x573 Helen- y ahi la altura del
    # contenido ES la estatura: Helen 501, Julie 527, Say 559, Sofi 594. Con Say
    # anclada al 26 de Vicky, las demas caen solas en 23, 25 y 28.
    #
    # TODAVIA SIN ATAUD: no hay `<Nombre>_ataud.png` para estas cuatro. El juego
    # aguanta -ver `dibujar` en entidades/jugador.js, que sin ataud sigue
    # pintando el reloj de la reanimacion- pero se nota en cooperativo, que es
    # donde el ataud dice a quien hay que ir a levantar. Cuando existan, son
    # cuatro filas mas en la tabla de ATAUDES de aqui abajo.
    @{ src='characters\Helen.png'; dst='personajes\helen.png'; id='helen'; alto=23; anchoFijo=0; tol=0
       gifAnim='characters\Helen.gif'; idle=0; nQuieto=2; fpsAndar=14; caraMargen=0.60 }
    @{ src='characters\Julie.png'; dst='personajes\julie.png'; id='julie'; alto=25; anchoFijo=0; tol=0
       gifAnim='characters\Julie.gif'; idle=0; nQuieto=2; fpsAndar=14 }
    @{ src='characters\Say.png';   dst='personajes\say.png';   id='say';   alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Say.gif';   idle=0; nQuieto=2; fpsAndar=14 }
    @{ src='characters\Sofi.png';  dst='personajes\sofi.png';  id='sofi';  alto=28; anchoFijo=0; tol=0
       gifAnim='characters\Sofi.gif';  idle=0; nQuieto=2; fpsAndar=14 }

    # ATAUDES. Uno por personaje, y cada uno cuenta quien iba dentro: el del
    # Atleti con su balon, el del hamster, el del capibara y el de la katana.
    # Es lo que hace que valga la pena dibujar cuatro en vez de uno generico —
    # en cooperativo, ver de quien es el ataud desde el otro lado de la pantalla
    # dice a quien hay que ir a levantar sin tener que leer un nombre.
    #
    # Entradas SUELTAS, sin `cadera` ni `gifAnim`: no llevan retrato ni ciclo de
    # animacion. Son un dibujo quieto que sustituye al sprite mientras el
    # jugador esta caido, asi que caen por Procesar() como cualquier
    # ilustracion. `plano` porque un ataud ni mira a un lado ni recibe golpes.
    #
    # `tol=6`, MUCHISIMO mas bajo que el 30 por defecto, y es lo que arregla que
    # el ataud de Eric saliera gris y emborronado.
    #
    # Estos dibujos no traen alfa: son opacos con FONDO BLANCO. Y el ataud de
    # Eric es blanco tambien. Con la tolerancia normal el recorte por color
    # entra con un umbral de 90 sobre la suma de los tres canales, o sea que
    # cualquier gris claro cuenta como fondo: se comia el cuerpo del ataud por
    # dentro, y despues Rematar rellenaba esos huecos con la media de los
    # vecinos. De ahi el gris sucio y el aspecto de tener transparencias. Con
    # umbral 18 solo desaparece el blanco de verdad y el contorno negro para la
    # inundacion donde tiene que pararla.
    #
    # Y suben de 26 a 34 de alto. A 26 el original -448x595, con las rayas del
    # Atleti de ocho pixeles- se reducia 5,7 veces y esas rayas quedaban en 1,3
    # pixeles: no hay metodo de reduccion que las salve, se funden en un
    # borron rojo. A 34 la reduccion baja a 4,4 y el escudo y las rayas
    # sobreviven. Ademas un ataud es mas voluminoso que quien iba dentro, asi
    # que verlo mas alto que el personaje se lee bien.
    @{ src='characters\Eric_ataud.png';  dst='personajes\eric-ataud.png';  id='ericAtaud';  alto=34; anchoFijo=0; tol=6; plano=$true; dominante=$true }
    @{ src='characters\Lucy_ataud.png';  dst='personajes\lucy-ataud.png';  id='lucyAtaud';  alto=34; anchoFijo=0; tol=6; plano=$true; dominante=$true }
    @{ src='characters\Sara_ataud.png';  dst='personajes\sara-ataud.png';  id='saraAtaud';  alto=34; anchoFijo=0; tol=6; plano=$true; dominante=$true }
    @{ src='characters\Vicky_ataud.png'; dst='personajes\vicky-ataud.png'; id='vickyAtaud'; alto=34; anchoFijo=0; tol=6; plano=$true; dominante=$true }

    # EL ATAUD GENERICO, para los cuatro heroes que todavia no tienen el suyo
    # (ver datos/personajes.js). ARTE PROVISIONAL: no lo ha dibujado Sergio, se
    # pidio a la API de imagenes -herramientas/generar-imagen.js- y esta aqui
    # solo para que el sitio donde ha caido alguien se vea. El dibujado prueba
    # SIEMPRE primero el ataud propio, asi que en cuanto exista el de un heroe
    # este deja de usarse para el sin tocar una linea.
    #
    # OJO: el fuente NO es como los cuatro de Sergio. Viene del generador con
    # FONDO ROSA -no blanco- y ACOSTADO, asi que necesita dos cosas que los
    # otros no: un `tol` mucho mas alto, porque ese rosa no es plano y trae ruido
    # de compresion, y GIRAR 90 GRADOS, porque el modelo dibuja el sarcofago
    # tumbado por mas que se le pida vertical y lo que hace falta es un
    # rectangulo de arriba abajo.
    #
    # `girar90` NO EXISTE todavia en Procesar: el PNG de assets/ se genero a
    # mano esta vez. Esta fila queda escrita para que, cuando alguien vuelva a
    # pasar el procesador, sepa exactamente que hace falta -o para borrarla
    # entera el dia que los cuatro ataudes que faltan existan, que es lo que de
    # verdad tiene que pasar.
    @{ src='characters\Generico_ataud.png'; dst='personajes\generico-ataud.png'; id='ataudGenerico'; alto=34; anchoFijo=0; tol=30; plano=$true; dominante=$true; girar90=$true }

    # EL OSITO DINAMITO, que es un PROYECTIL y no un bicho, pero sale por aqui
    # porque lo que necesita es exactamente lo que hace esta rama: un GIF de
    # dieciseis fotogramas convertido en tira, con la caja de recorte comun a
    # todos ellos. Un proyectil que corre necesita su ciclo de carrera igual que
    # un enemigo.
    #
    # 11 de alto: por debajo de las mascotas mas bajas (10) y muy por debajo de
    # un personaje (26). Es un juguete que sale corriendo de entre tus pies, y
    # a partir de ahi deja de leerse como algo que TU has lanzado.
    #
    # `plano` a proposito: el motor lo espeja segun hacia donde corre (ver
    # `sinRotar` en entidades/proyectil.js) y no necesita la copia -izq que se
    # hornea para lo que gira con su duenyo.
    @{ src='armas\efectos\osito_dinamito_sprite.gif'; dst='efectos\osito-dinamito.png'
       id='proyOsito'; alto=11; anchoFijo=0; tol=0; gif=$true; plano=$true }

    # MASCOTAS. El `id` es el mismo de datos/mascotas.js, con el prefijo
    # `mascota` para no chocar con nada del bestiario.
    #
    # Todas MIRAN A LA DERECHA en el original, que es lo que asume el motor, y
    # NO llevan `plano`: la mascota gira con su jugador, así que necesita la
    # copia espejada que precachea recursos.js. Se le cuela de paso la del
    # destello de impacto, que no usa nadie, pero son ocho lienzos diminutos y
    # no hay un `plano` a medias que diga "espejo sí, destello no".
    #
    # Los altos van entre 10 y 14 contra los 26 del personaje: tienen que
    # leerse como una mascota que acompaña, no como otro personaje. La tortuga
    # es la más baja y el perro el más alto, que es lo que dice cada dibujo.
    #
    # `gifSiExiste`: si al lado del PNG hay un GIF con el MISMO nombre, se usa
    # el GIF y la mascota queda animada; si no, se usa el PNG y se queda quieta.
    #
    # Existe porque Sergio está entregando las animaciones DE UNA EN UNA —hoy
    # solo está la del búho— y sin esto cada GIF nuevo obligaría a venir aquí a
    # cambiar una línea. Con esto, dejar el archivo en resources/mascotas/ y
    # volver a ejecutar la herramienta basta. Es la única regla implícita de
    # todo el catálogo y se limita a las mascotas a propósito: en el bestiario,
    # donde conviven PNG y GIF del mismo bicho, la elección está escrita a mano
    # entrada por entrada y así se queda.
    @{ src='mascotas\Hamster.png'; dst='mascotas\heladio.png';  id='mascotaHeladio';  alto=11; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Tortuga.png'; dst='mascotas\escipion.png'; id='mascotaEscipion'; alto=10; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Buho.png';    dst='mascotas\plinio.png';   id='mascotaPlinio';   alto=13; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Gato.png';    dst='mascotas\neron.png';    id='mascotaNeron';    alto=12; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\PErro.png';   dst='mascotas\karim.png';    id='mascotaKarim';    alto=14; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Gallina.png'; dst='mascotas\cleopatra.png';id='mascotaCleopatra';alto=13; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Conejo.png';  dst='mascotas\oreo.png';     id='mascotaOreo';     alto=11; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Pollito.png'; dst='mascotas\pollito.png';  id='mascotaPollito';  alto=12; anchoFijo=0; tol=0; gifSiExiste=$true }

    # RETRATO DE MENU, uno por mascota. El mismo bicho otra vez, pero SIEMPRE
    # desde el PNG —nunca desde el GIF— y a 40 de alto en vez de a 11.
    #
    # Son dos cosas distintas y por eso son dos entradas. El sprite de arriba es
    # para el MUNDO: mide once unidades porque tiene que leerse como un bicho
    # pequeno trotando al lado del personaje, y va animado. Esto es para los
    # MENUS —la tienda y la pantalla de elegir mascota—, donde no hay nada que
    # animar y lo que hace falta es reconocer al bicho y que se vea bien.
    #
    # Reutilizar el sprite del mundo era lo que habia y se veia mal, y no por el
    # fondo: a once unidades de alto, encajarlo en la casilla de la tienda es
    # reescalarlo por un factor roto -0,77 en la tienda, 1,18 en la seleccion- y
    # ahi el pixel art pierde filas enteras o las dobla a medias. Con el retrato
    # a 40, la casilla siempre REDUCE desde algo mas grande, que es la unica
    # direccion en la que una imagen no se estropea.
    #
    # Desde el PNG y no desde el GIF porque los PNG los ha dibujado Sergio con
    # su fondo transparente y con mas detalle; los GIF de Oreo y el Pollito
    # traen el lienzo pintado de blanco y hay que recortarselo (ver
    # QuitarFondoOpaco), y por bien que salga el recorte no le devuelve el
    # acabado del original.
    #
    # `plano` porque un retrato de menu ni gira ni recibe destello: se ahorra el
    # espejo y el tinte que precachea recursos.js.
    @{ src='mascotas\Hamster.png'; dst='mascotas\heladio-ficha.png';  id='mascotaHeladioFicha';  alto=40; anchoFijo=0; tol=0; plano=$true }
    @{ src='mascotas\Tortuga.png'; dst='mascotas\escipion-ficha.png'; id='mascotaEscipionFicha'; alto=40; anchoFijo=0; tol=0; plano=$true }
    @{ src='mascotas\Buho.png';    dst='mascotas\plinio-ficha.png';   id='mascotaPlinioFicha';   alto=40; anchoFijo=0; tol=0; plano=$true }
    @{ src='mascotas\Gato.png';    dst='mascotas\neron-ficha.png';    id='mascotaNeronFicha';    alto=40; anchoFijo=0; tol=0; plano=$true }
    @{ src='mascotas\PErro.png';   dst='mascotas\karim-ficha.png';    id='mascotaKarimFicha';    alto=40; anchoFijo=0; tol=0; plano=$true }
    @{ src='mascotas\Gallina.png'; dst='mascotas\cleopatra-ficha.png';id='mascotaCleopatraFicha';alto=40; anchoFijo=0; tol=0; plano=$true }
    @{ src='mascotas\Conejo.png';  dst='mascotas\oreo-ficha.png';     id='mascotaOreoFicha';     alto=40; anchoFijo=0; tol=0; plano=$true }
    @{ src='mascotas\Pollito.png'; dst='mascotas\pollito-ficha.png';  id='mascotaPollitoFicha';  alto=40; anchoFijo=0; tol=0; plano=$true }

    # OBJETOS DEL SUELO: los dos cofres y los cinco consumibles que sueltan las
    # antorchas al romperse. Hasta ahora se dibujaban por codigo -una caja de 14
    # pixeles con herrajes, una llama de curvas- porque no habia arte; ahora lo
    # hay, y un dibujo de Sergio se lee de un vistazo con la pantalla llena de
    # bichos, que es exactamente donde hay que encontrarlos.
    #
    # DOS COFRES distintos porque son dos premios distintos: el sencillo sube un
    # nivel y el especial sube TRES. Antes los dos se veian igual y cual te habia
    # tocado solo se sabia al abrirlo; ahora se sabe desde que cae al suelo, que
    # es cuando decides si merece la pena ir a por el.
    #
    # `plano` en todos: son objetos del suelo, no giran con nadie ni reciben
    # destello al ser golpeados, asi que se ahorran la copia espejada y la
    # blanqueada que precachea recursos.js.
    @{ src='objetos\cofre_sencillo.png'; dst='objetos\cofre-simple.png';   id='cofreSimple';   alto=16; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\cofre_especial.png'; dst='objetos\cofre-especial.png'; id='cofreEspecial'; alto=18; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\fuego.png';          dst='objetos\obj-fuego.png';      id='objFuego';      alto=14; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\cupcake.png';        dst='objetos\obj-comida.png';     id='objComida';     alto=14; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\iman.png';           dst='objetos\obj-iman.png';       id='objIman';       alto=14; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\reloj.png';          dst='objetos\obj-reloj.png';      id='objReloj';      alto=15; anchoFijo=0; tol=0; plano=$true }
    # CUENTA ATRAS DEL RELOJ, animada. GIF de Sergio (720x404, 81 fotogramas) para
    # sustituir a los digitos de siete segmentos que hud.js dibuja a mano mientras
    # la horda esta helada. 60 de alto: el mismo que tienen hoy esas cifras
    # (RELOJ_DIGITO_H) en la capa de interfaz, que va a 960x540. `deCada=2`
    # porque con los 81 la tira salia de 34.668 px de ancho, mas de los 32.767
    # que admite una imagen en el navegador. No se pierde nada: hud.js no la
    # reproduce a un fps fijo, la ESTIRA sobre los segundos que dura el efecto
    # (ver dibujarCuentaAtrasReloj), asi que 41 fotogramas cuentan igual.
    @{ src='objetos\animaciones\cuenta_atras_reloj.gif'; dst='objetos\cuenta-atras-reloj.png'
       id='cuentaAtrasReloj'; alto=60; anchoFijo=0; tol=0; gif=$true; plano=$true; deCada=2 }
    @{ src='objetos\monedas.png';        dst='objetos\obj-monedas.png';    id='objMonedas';    alto=13; anchoFijo=0; tol=0; plano=$true }

    # LA MONEDA DEL CONTADOR, la que sale arriba a la derecha en los menus junto
    # a los denarios que llevas. No es un objeto del suelo: no se recoge ni se
    # dibuja en el mundo, vive en la capa de interfaz.
    #
    # Y por eso va mas grande que los demas -20 en vez de 13-: la interfaz se
    # dibuja a la resolucion real del monitor, no a la del arte, asi que un icono
    # de 13 tendria que ampliarse para acompanar a un numero de 18 pixeles.
    @{ src='objetos\moneda.png';         dst='objetos\moneda-hud.png';     id='monedaHud';     alto=20; anchoFijo=0; tol=0; plano=$true }

    # LOS CORAZONES DE LAS VIDAS (ver dibujarVidas en ui/hud.js). Entraron en el
    # atlas A MANO con el narrador, sin pasar por aqui, y la siguiente pasada de
    # esta herramienta los borro del atlas.json: lo que no esta en este catalogo
    # no existe. 8 de alto = los 32 fisicos que tenian; `centrado` porque el HUD
    # los pinta desde su centro, no desde los pies. El de muerte es SOLO EL
    # PERIMETRO, con el interior vacio: sin `huecos`, Rematar lo rellena.
    @{ src='characters\corazon_vida.png';   dst='interfaz\corazon-vida.png';   id='corazonVida';   alto=8; anchoFijo=0; tol=0; plano=$true; centrado=$true }
    @{ src='characters\corazon_muerte.png'; dst='interfaz\corazon-muerte.png'; id='corazonMuerte'; alto=8; anchoFijo=0; tol=0; plano=$true; centrado=$true; huecos=$true }

    # LAS CUATRO GEMAS DE EXPERIENCIA. Se dibujaban por codigo -un rombo de
    # cuatro puntos con un brillo- porque no habia arte; ya lo hay.
    #
    # El ORDEN ES EL VALOR: gema1 es la de 1 punto y gema4 la de 100.
    #
    # TODAS DEL MISMO TAMANO. Antes crecian con el valor (alto 8, 9, 11, 13)
    # razonando que en un suelo sembrado de gemas el tamano se ve antes que el
    # color. Sergio lo descarto viendolo: lo que distingue a una gema de otra es
    # QUE GEMA ES, no lo grande que sea, y escalarlas por valor hacia que las
    # buenas parecieran objetos distintos en vez de la misma cosa mejor.
    #
    # MARCO FIJO Y CENTRADO, no solo el mismo `alto`. Con el alto igual y el
    # ancho libre no bastaba: los cuatro dibujos tienen proporciones muy
    # distintas -de 0,75 a 1,27 de relacion- asi que a igual altura la ancha
    # seguia pareciendo el doble de grande. Con `anchoFijo` las cuatro se
    # encajan en la misma caja de 10x10 y ocupan lo mismo pase lo que pase con
    # el dibujo. Y `centrado` porque una gema se dibuja centrada en su posicion,
    # no apoyada en una linea de pies como un personaje.
    #
    # 5 y no 10: se probaron a 10 (40x40 fisicos) y ocupaban demasiado para lo
    # que son. La mitad justa, que deja la caja en 20x20.
    @{ src='objetos\gema1.png';          dst='objetos\gema1.png';          id='gema1';         alto=5;  anchoFijo=5;  tol=0; plano=$true; centrado=$true }
    @{ src='objetos\gema2.png';          dst='objetos\gema2.png';          id='gema2';         alto=5;  anchoFijo=5;  tol=0; plano=$true; centrado=$true }
    @{ src='objetos\gema3.png';          dst='objetos\gema3.png';          id='gema3';         alto=5;  anchoFijo=5;  tol=0; plano=$true; centrado=$true }
    @{ src='objetos\gema4.png';          dst='objetos\gema4.png';          id='gema4';         alto=5;  anchoFijo=5;  tol=0; plano=$true; centrado=$true }

    # LOS DIEZ POTENCIADORES DE LA TIENDA. Cada uno con su dibujo, todos de
    # Sergio y en su propia carpeta.
    #
    # Antes ocho de ellos reutilizaban el icono de su pasivo gemelo -la
    # Vitalidad salia con el anfora, la Coraza con la lorica- porque no habia
    # arte y compartir dibujo se leia mejor que inventarse diez glifos. Ya lo
    # hay, y un potenciador que se compra para siempre merece no parecer un
    # objeto de partida.
    #
    # A 28 de alto, mas del doble que un objeto del suelo, porque no van al
    # mundo: se dibujan en la casilla de la tienda, que esta en la capa de
    # interfaz y va a la resolucion real del monitor.
    #
    # El `id` de cada uno es `pot` + el del catalogo de datos/potenciadores.js,
    # que es lo que espera el campo `arte` de ese mismo fichero. El nombre del
    # PNG de origen no tiene por que coincidir -"clepsida_eterna" le falta una
    # erre y "moneda_caronte" es el nombre del premio y no el del id- y no pasa
    # nada: esta tabla es justamente donde se traduce lo uno a lo otro.
    @{ src='objetos\potenciadores_tienda\vitalidad.png';      dst='objetos\pot-vitalidad.png'; id='potVitalidad'; alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\premura.png';        dst='objetos\pot-premura.png';   id='potPremura';   alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\coraza.png';         dst='objetos\pot-coraza.png';    id='potCoraza';    alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\codicia.png';        dst='objetos\pot-codicia.png';   id='potCodicia';   alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\furia.png';          dst='objetos\pot-furia.png';     id='potFuria';     alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\clepsida_eterna.png';dst='objetos\pot-clepsidra.png'; id='potClepsidra'; alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\onda_expansiva.png'; dst='objetos\pot-onda.png';      id='potOnda';      alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\panacea.png';        dst='objetos\pot-panacea.png';   id='potPanacea';   alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\egida.png';          dst='objetos\pot-egida.png';     id='potEgida';     alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\moneda_caronte.png'; dst='objetos\pot-caronte.png';   id='potCaronte';   alto=28; anchoFijo=0; tol=0; plano=$true }

    # Y LOS CINCO DE LA ULTIMA TANDA. Salieron reutilizando el dibujo del
    # potenciador mas parecido -el Manto con el anfora de la Vitalidad, la
    # Bandolera con la onda- porque no habia arte, y en la tienda se veian dos
    # casillas distintas con la misma ilustracion. Fueron provisionales de
    # Replicate una temporada; desde septiembre de 2026 son dibujos de Sergio.
    @{ src='objetos\potenciadores_tienda\manto_peregrino.png'; dst='objetos\pot-manto.png'; id='potManto'; alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\bellota_de_oro.png'; dst='objetos\pot-bellota.png'; id='potBellota'; alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\ultimo_aliento.png'; dst='objetos\pot-aliento.png'; id='potAliento'; alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\zurron.png'; dst='objetos\pot-zurron.png'; id='potZurron'; alto=28; anchoFijo=0; tol=0; plano=$true }
    @{ src='objetos\potenciadores_tienda\bandolera.png'; dst='objetos\pot-bandolera.png'; id='potBandolera'; alto=28; anchoFijo=0; tol=0; plano=$true }

    # --- Decoracion solida del nivel 1: columnas, antorchas, estatuas y
    # ruinas de resources/stages/1/objetos/. Ilustraciones estaticas sueltas
    # (sin gif/cadera/hoja), asi que caen directas por Procesar():
    # quitar fondo, recortar a silueta, ancla centro-inferior, un fotograma.
    # `plano=$true` porque nunca giran ni reciben destello de impacto —ni
    # espejo ni tinte les hacen falta, igual que a las hojas de iconos.
    @{ src='stages\1\objetos\columna.png';   dst='objetos\columna.png';   id='columna';   alto=80; anchoFijo=0; tol=0;  plano=$true }
    # SIN plano: a diferencia de columna/estatuas/ruinas (decoracion pura),
    # las antorchas se pueden destruir (datos/enemigos.js) y necesitan la
    # copia blanqueada de destello al recibir un golpe, igual que cualquier
    # enemigo.
    @{ src='stages\1\objetos\antorcha1.png'; dst='objetos\antorcha1.png'; id='antorcha1'; alto=26; anchoFijo=0; tol=0 }
    @{ src='stages\1\objetos\antorcha2.png'; dst='objetos\antorcha2.png'; id='antorcha2'; alto=26; anchoFijo=0; tol=0 }
    @{ src='stages\1\objetos\estatua1.png';  dst='objetos\estatua1.png';  id='estatua1';  alto=48; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\estatua2.png';  dst='objetos\estatua2.png';  id='estatua2';  alto=48; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\estatua3.png';  dst='objetos\estatua3.png';  id='estatua3';  alto=48; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\estatua4.png';  dst='objetos\estatua4.png';  id='estatua4';  alto=48; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\estatua5.png';  dst='objetos\estatua5.png';  id='estatua5';  alto=48; anchoFijo=0; tol=0;  plano=$true }
    # Ruinas a proposito MAS GRANDES que columnas/antorchas/estatuas (peticion
    # de Sergio jugando la Fase 8): son edificios, no mobiliario, y tienen que
    # imponer en el margen de hierba en vez de leerse como un adorno mas.
    #
    # 110 -> 88, un 20% menos, pedido despues de verlas con el dibujo nuevo:
    # seguian siendo lo mas grande del nivel pero se comian el margen. Encogen
    # con ellas su parte solida —la huella sale del recorte del atlas en
    # proporcion al tamano (ver `huellaDe` en sistemas/obstaculos.js)—, asi que
    # los carriles de datos/niveles/merida.js siguen valiendo: lo que cambia es
    # que dejan MAS sitio para pasar, nunca menos.
    @{ src='stages\1\objetos\ruinas1.png';   dst='objetos\ruinas1.png';   id='ruinas1';   alto=88;  anchoFijo=0; tol=0;  plano=$true; huecos=$true }
    @{ src='stages\1\objetos\ruinas2.png';   dst='objetos\ruinas2.png';   id='ruinas2';   alto=88;  anchoFijo=0; tol=0;  plano=$true; huecos=$true }
    @{ src='stages\1\objetos\ruinas4.png';   dst='objetos\ruinas4.png';   id='ruinas4';   alto=88;  anchoFijo=0; tol=0;  plano=$true; huecos=$true }
    @{ src='stages\1\objetos\ruinas5.png';   dst='objetos\ruinas5.png';   id='ruinas5';   alto=88;  anchoFijo=0; tol=0;  plano=$true; huecos=$true }
    # ruinas6..11 salieron de recortar a mano ruinas3.png (una hoja de
    # contacto con seis ruinas juntas, no un objeto en si). El tol sube a 40:
    # el recorte dejo cerca del borde la rejilla clara de la hoja original y
    # el tolerancia por defecto (30) no bastaba para tragarsela entera.
    @{ src='stages\1\objetos\ruinas7.png';   dst='objetos\ruinas7.png';   id='ruinas7';   alto=88;  anchoFijo=0; tol=40; plano=$true; huecos=$true }
    @{ src='stages\1\objetos\ruinas9.png';   dst='objetos\ruinas9.png';   id='ruinas9';   alto=88;  anchoFijo=0; tol=40; plano=$true; huecos=$true }
    @{ src='stages\1\objetos\ruinas10.png';  dst='objetos\ruinas10.png';  id='ruinas10';  alto=88;  anchoFijo=0; tol=40; plano=$true; huecos=$true }
)

# Retrato de la ficha de jugador. CUADRADO: de los hombros a la cabeza y nada
# mas. El busto largo que llegaba al pecho encajaba en la columna vertical del
# diseno anterior, pero en el de ahora el retrato va en un recuadro casi
# cuadrado dentro de su tarjeta, y ahi un busto obliga a alejar la camara: la
# cara, que es lo unico que identifica al jugador de un vistazo, se quedaba
# pequena para dejar sitio a una camiseta que no dice nada.
#
# 288 y no 192 porque esta imagen se dibuja en la capa de interfaz, a la
# resolucion real del monitor: 36 unidades de ancho con zoom 3x y densidad 2x
# son 216 pixeles de verdad, y de 192 habria que ampliar.
$CARA_W = 288
$CARA_H = 288
# Cuerpo entero para la ficha de jugador (Select / Tab). Alto y estrecho, como
# las ilustraciones: Eric es 650x1492. Se pide GRANDE porque la ficha se dibuja
# en la capa de interfaz, que va a la resolucion real del monitor.
$CUERPO_W = 340
$CUERPO_H = 760

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'enemigos')   | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'personajes') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'objetos')    | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'mascotas')   | Out-Null

$informe = @()
$atlas = [ordered]@{}

foreach ($e in $CATALOGO) {
    $rutaSrc = Join-Path $ORIGEN $e.src
    $rutaDst = Join-Path $DESTINO $e.dst

    # `gifSiExiste`: la entrada apunta a un PNG, pero si al lado hay un GIF con
    # el mismo nombre manda el GIF. Ver la nota del bloque de mascotas: sirve
    # para que las animaciones que van llegando de una en una entren solas.
    if ($e.gifSiExiste) {
        $candidato = [System.IO.Path]::ChangeExtension($rutaSrc, '.gif')
        if (Test-Path $candidato) {
            $rutaSrc = $candidato
            $e = $e.Clone()      # no se toca el catálogo, solo esta pasada
            $e.gif = $true
        }
    }

    if (-not (Test-Path $rutaSrc)) {
        $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='NO EXISTE' }
        continue
    }

    # Fuente irrecuperable: entrada de atlas SIN archivo. El motor dibuja su
    # placeholder y el juego sigue siendo jugable, que es el requisito 7.
    if ($e.placeholder) {
        if (Test-Path $rutaDst) { Remove-Item $rutaDst -Force }
        $lado = $e.alto * $ESCALA
        $anchoLog = if ($e.anchoFijo -gt 0) { $e.anchoFijo } else { $e.alto }
        $anchoFis = $anchoLog * $ESCALA
        $atlas[$e.id] = [ordered]@{
            w = $anchoFis; h = $lado; anclaX = [int]($anchoFis / 2); anclaY = $lado; frames = 1
        }
        $informe += [PSCustomObject]@{
            Id=$e.id; Silueta='-'; Ratio='-'; Sprite="${anchoFis}x${lado}"
            Quitado='-'; Estado='PLACEHOLDER'
        }
        continue
    }

    # --- GIF animado -------------------------------------------------------
    # Sale por su propia rama: la caja de recorte es comun a todos los
    # fotogramas y el muestreo va en la rejilla nativa, nada que ver con el
    # recorte por color de las ilustraciones estaticas.
    if ($e.gif) {
        try {
            # Tope = el alto logico pedido, en pixeles fisicos. Antes era el
            # triple, para respetar la rejilla nativa del GIF aunque saliera mas
            # grande de lo declarado. Con el catalogo reducido al 70% eso dejaba
            # a la gargola en 18,5 unidades frente a las 14 de la serpiente: mas
            # de un tercio mas grande que el otro enemigo de su mismo rol, que se
            # lee como que pega mas fuerte. Vale mas un remuestreo algo blando
            # que un bestiario que miente sobre lo que tienes delante.
            $deCada = if ($null -ne $e.deCada) { [int]$e.deCada } else { 1 }
            $r = [Procesador]::ProcesarGif($rutaSrc, $rutaDst, $ESCALA, $e.alto, [bool]$e.voltear, $deCada)
        } catch {
            $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='ERROR GIF' }
            continue
        }
        $p = $r -split '\|'
        if ($p.Count -ne 5) {
            $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='VACIA' }
            continue
        }
        $fw=[int]$p[0]; $fh=[int]$p[1]; $nf=[int]$p[2]; $fac=[int]$p[3]
        $atlas[$e.id] = [ordered]@{
            archivo = $e.dst.Replace('\', '/')
            w = $fw; h = $fh; anclaX = [int]($fw / 2); anclaY = $fh; frames = $nf
        }
        $informe += [PSCustomObject]@{
            Id=$e.id; Silueta=$p[4]; Ratio=[math]::Round($fw/$fh,2)
            Sprite="${fw}x${fh} x$nf"; Quitado="nativo /$fac"; Estado='GIF OK'
        }
        continue
    }

    $tolAsset = if ($e.tol -gt 0) { $e.tol } else { $TOL }

    # SOLO PARA LOS PERSONAJES: ademas del sprite, la ilustracion entera con el
    # fondo ya recortado. De ella salen el retrato y el cuerpo de la ficha unas
    # lineas mas abajo, y tiene que salir de AQUI y no del original porque hay
    # ilustraciones que llegan opacas -Helen, Say-, sin un alfa que medir. Ver
    # el comentario de `alfaSalida` en Procesar.
    $rutaAlfa = $null
    if ($null -ne $e.cadera -or $null -ne $e.gifAnim) {
        $rutaAlfa = Join-Path ([System.IO.Path]::GetTempPath()) ("emerita-alfa-" + $e.id + ".png")
    }

    try {
        $r = [Procesador]::Procesar($rutaSrc, $rutaDst, $e.alto, $ESCALA, $tolAsset, $e.anchoFijo, [bool]$e.dominante, [bool]$e.centrado, [bool]$e.huecos, $rutaAlfa)
    } catch {
        $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='ERROR' }
        continue
    }

    $p = if ($r) { $r -split '\|' } else { @() }
    # -lt y no -ne: el retorno de Procesar CRECIO al publicar el nucleo solido,
    # y un -ne 8 daba por vacia toda entrada que llegara bien. Con -lt la
    # guarda sigue cazando un retorno corto sin romperse cada vez que se anade un
    # campo al final.
    if ($r -eq 'VACIA' -or $p.Count -lt 8) {
        $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='VACIA' }
        continue
    }
    $silW=[int]$p[0]; $silH=[int]$p[1]; $ratio=$p[2]
    $fw=[int]$p[3]; $fh=[int]$p[4]; $ax=[int]$p[5]; $ay=[int]$p[6]; $opaco=[int]$p[7]

    # Lo que importa es cuanto fondo se elimino, no el area de la caja: una
    # silueta puede tocar los cuatro bordes y estar perfectamente recortada.
    $quitado = 100 - $opaco
    $estado = if ($quitado -lt 5) { 'FALLO' } elseif ($quitado -lt 15) { 'DUDOSO' } else { 'OK' }

    # Retrato para el panel de informacion, recortado del ORIGINAL a resolucion
    # completa. Ver el comentario de RecortarCabeza: es un busto, no una cabeza
    # en cuadrado, porque la ficha le reserva una columna alta y estrecha.
    #
    # La condicion es "esto es un personaje". Antes bastaba mirar `cadera`, que
    # solo tienen los personajes, pero los cuatro han pasado a GIF y ya no la
    # llevan: con la comprobacion vieja los cuatro se quedaban de golpe sin
    # retrato ni cuerpo, y la ficha de jugador con dos huecos vacios.
    if ($null -ne $e.cadera -or $null -ne $e.gifAnim) {
        # La copia con alfa que acaba de dejar Procesar, si la dejo. El original
        # solo como ultimo recurso: con una ilustracion opaca, la silueta que
        # mide RecortarCabeza es el rectangulo entero y el "retrato" acaba
        # siendo el dibujo completo visto de lejos.
        $fuenteRetrato = if ($rutaAlfa -and (Test-Path $rutaAlfa)) { $rutaAlfa } else { $rutaSrc }
        $rutaCara = Join-Path $DESTINO ("personajes\" + $e.id + "-cara.png")
        try {
            # fraccionAlto 0.30 sigue siendo la franja que se usa para ENCUADRAR
            # (centroide y ancho de la cabeza); el alto de la caja sale despues
            # de la proporcion pedida y baja hasta el pecho.
            # EL ENCUADRE, AJUSTABLE POR PERSONAJE.
            #
            # `caraMargen` es cuanto se abre la caja alrededor de la cabeza:
            # subirlo aleja el plano y entra mas cuerpo. El 0,22 vale para siete
            # de los ocho.
            #
            # HELEN VA POR 0,60, y el motivo esta en su dibujo. La caja se calcula
            # dando por hecho que la cabeza ocupa el 30% de la figura (el
            # `fraccionAlto` de aqui abajo), que es lo que miden las otras siete;
            # a Helen la cabeza le llega al 35% —esta dibujada mas cabezona y con
            # el cuerpo mas estrecho: 174x486 frente a los 530x1321 de Sara—, asi
            # que con el 0,22 la caja se le queda corta y el retrato la cortaba
            # POR LA BARBILLA, sin nada de pecho, mientras las demas ensenan
            # hasta la camiseta.
            #
            # Y NO PUEDE TENER LAS DOS COSAS. El marco es cuadrado en los dos
            # sitios donde se usa —la tarjeta de la ficha y el circulo de la
            # tienda—, y para llegarle al pecho hay que bajar unos 290 pixeles
            # desde la coronilla cuando su figura mide 174 de ancho: el cuadrado
            # de 290 deja 116 de aire a los lados. A las otras no les pasa porque
            # estan dibujadas anchas y con la cabeza pequena. O sea que con este
            # dibujo es aire lateral O barbilla, no hay tercer camino sin cambiar
            # los marcos de dos pantallas.
            #
            # 0,60 es el punto que eligio Sergio entre las dos: hombros enteros y
            # el arranque del pecho, con la mitad del aire que dejaba el encuadre
            # completo. Se ve casi tan grande como las demas y ya no la corta por
            # la barbilla.
            #
            # Es el aviso de que este numero va con el DIBUJO: si se redibuja un
            # personaje, hay que volver a mirar su retrato. Este ya ha cambiado
            # dos veces con el suyo.
            #
            # Es un numero por personaje y no una regla automatica a proposito:
            # "cuanto cuerpo se ve" es una decision de encuadre, y una formula
            # que la adivine acertaria en unas y fallaria en otras sin que nadie
            # pueda corregirla sin tocar el algoritmo.
            $margenCara = if ($null -ne $e.caraMargen) { [double]$e.caraMargen } else { 0.22 }
            [Procesador]::RecortarCabeza($fuenteRetrato, $rutaCara, $CARA_W, $CARA_H, 0.30, $margenCara) | Out-Null
            $atlas[$e.id + 'Cara'] = [ordered]@{
                archivo = "personajes/$($e.id)-cara.png"
                w = $CARA_W; h = $CARA_H; anclaX = [int]($CARA_W/2); anclaY = $CARA_H; frames = 1
            }
        } catch {
            Write-Host "  aviso: no se pudo recortar la cabeza de $($e.id)"
        }

        # Cuerpo entero para la ficha de jugador.
        $rutaCuerpo = Join-Path $DESTINO ("personajes\" + $e.id + "-cuerpo.png")
        try {
            $rc = [Procesador]::RecortarCuerpo($fuenteRetrato, $rutaCuerpo, $CUERPO_W, $CUERPO_H)
            $pc = $rc -split '\|'
            # `alto`: lo que mide la FIGURA dentro del lienzo, apoyada abajo. El
            # lienzo siempre mide $CUERPO_H; la figura, no. Ver el comentario
            # del retorno de RecortarCuerpo.
            $atlas[$e.id + 'Cuerpo'] = [ordered]@{
                archivo = "personajes/$($e.id)-cuerpo.png"
                w = $CUERPO_W; h = $CUERPO_H; anclaX = [int]($CUERPO_W/2); anclaY = $CUERPO_H; frames = 1
                alto = [int]$pc[3]
            }
        } catch {
            Write-Host "  aviso: no se pudo recortar el cuerpo de $($e.id)"
        }

        # La copia con alfa era para esto y nada mas: fuera.
        if ($rutaAlfa -and (Test-Path $rutaAlfa)) { Remove-Item $rutaAlfa -Force }
    }

    $nFrames = 1
    $clips = $null

    # --- GIF de personaje ---------------------------------------------------
    # Manda sobre las otras dos formas de animar, por el mismo motivo por el que
    # las hojas mandaban sobre la procedural: si el artista ha dibujado el ciclo
    # entero, cualquier cosa que haga el codigo solo puede empeorarlo.
    #
    # Sobrescribe el sprite de un fotograma que acaba de escribir Procesar()
    # desde la ilustracion. Ese paso NO sobra aunque su resultado se tire: es lo
    # que comprueba que la ilustracion sigue recortandose bien —de ella salen el
    # retrato y el cuerpo de la ficha— y lo que llena la columna `Quitado` del
    # informe, que es donde se ve si el arte de origen se ha estropeado.
    if ($null -ne $e.gifAnim) {
        $rutaGif = Join-Path $ORIGEN $e.gifAnim
        $rg = [Procesador]::ProcesarGif($rutaGif, $rutaDst, $ESCALA, $e.alto, [bool]$e.voltear, 1)
        $pg = $rg -split '\|'
        $nAndar = [int]$pg[2]
        $nQuieto = [int]$e.nQuieto
        $ra = [Procesador]::AnyadirReposo($rutaDst, $nAndar, [int]$e.idle, $nQuieto) -split '\|'

        $fw = [int]$ra[0]; $fh = [int]$ra[1]; $nFrames = [int]$ra[2]
        $ax = [int]($fw/2); $ay = $fh
        # `andar_lateral` NO se declara: el GIF es un ciclo frontal y no trae uno
        # escorado. jugador.js cae solo en `andar` si no existe, y declararlo
        # apuntando al mismo tramo seria un nombre que no significa nada.
        $clips = [ordered]@{
            andar  = [ordered]@{ desde = 0;       n = $nAndar;  fps = $e.fpsAndar }
            quieto = [ordered]@{ desde = $nAndar; n = $nQuieto; fps = 2 }
        }
    }
    # --- Hojas dibujadas a mano --------------------------------------------
    # Mandan sobre la animacion procedural: si el artista ha dibujado el ciclo,
    # deformar una pose por codigo solo puede empeorarlo.
    #
    # La caja de recorte se mide sobre las DOS hojas y se unen: con una caja por
    # hoja, la figura quedaria centrada de forma distinta a cada lado y el
    # personaje daria un salto lateral cada vez que gira, que es justo lo que
    # mas se hace en este juego.
    elseif ($null -ne $e.hojaDer) {
        $rd = Join-Path $ORIGEN $e.hojaDer
        $ri = Join-Path $ORIGEN $e.hojaIzq
        $md = [Procesador]::MedirHoja($rd, $e.cols, $e.filas) -split '\|'
        $mi = [Procesador]::MedirHoja($ri, $e.cols, $e.filas) -split '\|'
        $bx0 = [Math]::Min([int]$md[0], [int]$mi[0]); $by0 = [Math]::Min([int]$md[1], [int]$mi[1])
        $bx1 = [Math]::Max([int]$md[2], [int]$mi[2]); $by1 = [Math]::Max([int]$md[3], [int]$mi[3])

        $rutaIzq = Join-Path $DESTINO ("personajes\" + $e.id + "-izq.png")
        $altoFis = $e.alto * $ESCALA
        $hd = [Procesador]::RecortarHoja($rd, $rutaDst, $e.cols, $e.filas,
                                         $bx0, $by0, $bx1, $by1, $altoFis, $e.idle, 2) -split '\|'
        [Procesador]::RecortarHoja($ri, $rutaIzq, $e.cols, $e.filas,
                                   $bx0, $by0, $bx1, $by1, $altoFis, $e.idle, 2) | Out-Null

        $fw = [int]$hd[0]; $fh = [int]$hd[1]; $nFrames = [int]$hd[2]
        $ax = [int]($fw/2); $ay = $fh
        $andar = $e.cols * $e.filas
        # `andar_lateral` NO se declara: la hoja no trae un ciclo escorado y
        # jugador.js cae solo en `andar` si no existe. Inventarlo apuntando al
        # mismo tramo solo anadiria un nombre que no significa nada.
        $clips = [ordered]@{
            andar  = [ordered]@{ desde = 0;      n = $andar; fps = $e.fpsAndar }
            quieto = [ordered]@{ desde = $andar; n = 2;      fps = 2 }
        }
        $atlas[$e.id + 'Izq'] = [ordered]@{
            archivo = "personajes/$($e.id)-izq.png"
            w = $fw; h = $fh; anclaX = $ax; anclaY = $ay; frames = $nFrames
            clips = $clips
        }
    }
    # Personajes sin hoja: expandir la pose unica a una tira de 10.
    elseif ($null -ne $e.cadera) {
        $ra = [Procesador]::AnimarPersonaje($rutaDst, [double]$e.cadera,
                                            [int]$e.ampPierna, [bool]$e.falda,
                                            [int]$e.ampEscora)
        $nFrames = [int](($ra -split '\|')[2])
        $clips = [ordered]@{
            quieto        = [ordered]@{ desde = 0; n = 2; fps = 3 }
            andar         = [ordered]@{ desde = 2; n = 4; fps = 8 }
            andar_lateral = [ordered]@{ desde = 6; n = 4; fps = 8 }
        }
    }

    $atlas[$e.id] = [ordered]@{
        archivo = $e.dst.Replace('\', '/')
        w = $fw; h = $fh; anclaX = $ax; anclaY = $ay; frames = $nFrames
    }
    if ($clips) { $atlas[$e.id].clips = $clips }
    # Decoracion estatica: sin espejo ni destello de impacto (ver CATALOGO).
    if ($e.plano) { $atlas[$e.id].plano = $true }

    # NUCLEO SOLIDO, en pixeles del propio sprite. Solo se publica si de verdad
    # recorta algo: si coincide con el recuadro entero no aporta nada y el
    # motor ya sabe qué hacer sin el campo.
    if ($p.Count -ge 12) {
        $nx = [int]$p[8]; $ny = [int]$p[9]; $nw = [int]$p[10]; $nh = [int]$p[11]
        if ($nx -gt 0 -or $ny -gt 0 -or $nw -lt $fw -or $nh -lt $fh) {
            $atlas[$e.id].solido = @($nx, $ny, $nw, $nh)
        }
    }

    $informe += [PSCustomObject]@{
        Id      = $e.id
        Silueta = "${silW}x${silH}"
        Ratio   = $ratio
        Sprite  = if ($nFrames -gt 1) { "${fw}x${fh} x$nFrames" } else { "${fw}x${fh}" }
        Quitado = "$quitado%"
        Estado  = $estado
    }
}

$informe | Format-Table -AutoSize

# ---------------------------------------------------------------------------
# HOJAS DE ICONOS
# ---------------------------------------------------------------------------
#
# Los 8 objetos siguen viniendo en UNA hoja, cada icono en su hueco. Las 52
# armas ya no: Sergio las volvió a dibujar SUELTAS, un PNG por arma en
# resources/armas/ con el nombre del arma. La lista de ids sigue siendo el
# contrato del hueco —el hueco `i` de la tira es el id `i` de la lista— y
# $ARCHIVO_ICONO_ARMA dice de qué archivo sale cada uno.
#
# El nombre del archivo NO se deduce del id: el arma `agujas` está dibujada en
# Lluvia_de_agujas.png y `rayoHorizontal` en Rayo_de_Jupiter.png. Deducirlo a
# base de quitar acentos y juntar palabras habría funcionado en cuarenta armas y
# fallado en silencio en las otras doce, así que va escrito.
#
# Sí, los ids están dos veces —aquí y en datos/armas.js—. Es a propósito y es lo
# mismo que ya hace $CATALOGO con los enemigos: mapear un archivo de arte a un id
# del juego es justo el trabajo de esta herramienta. La alternativa era que el
# motor dedujera el hueco por la posición en ARMAS, y entonces meter un arma
# nueva EN MEDIO del catálogo correría en silencio el icono de las treinta que
# vienen detrás. Así, lo peor que pasa es que a un arma nueva le falte su icono y
# salga con el glifo de siempre, que es un fallo que se ve.
#
# Las EVOLUCIONES no están: no salen en el sorteo y heredan en ui/hud.js el icono
# del arma de la que salen, así que dibujarlas era trabajo de más.
$ICONOS_ARMAS = @(
    'pilum','gladius','pistola','escopeta','lanzasGemelas','columnaDoble','rosaDeVientos','metralla',
    'lanzagranadas','bombardeo','ondaExpansiva','aquila','fuegoGriego','rete','rayoHorizontal','rayoCruzado',
    'scutum','ballista','tribulus','arcoCorto','honda','fusil','subfusil','revolver',
    'hacha','maza','latigo','motosierra','guadanya','lanzallamas','recortada','aspa',
    'enfilada','agujas','muroDeLanzas','enjambre','molotov','lanzacohetes','artilleria','lluviaDeFlechas',
    'gritoDeGuerra','sismo','aceiteHirviendo','minas','alquitran','campoElectrico','laser','aspaDeLuz',
    'satelites','discosDeSierra','katana','sierrasVotivas','codiceInfernal','rainbowMazas',
    'petanca','cartasEspanolas','cayadoSanIsidro','campanaSilencio','arosRitmica',
    'ositoDinamito'
)

# Un archivo por arma, en resources/armas/. Se resuelve con -Filter, así que
# admite comodines: la guadaña lleva `?` en el sitio de la eñe porque este .ps1
# no tiene BOM y PowerShell 5.1 lo lee como ANSI —los acentos sobreviven en los
# comentarios, pero una eñe dentro de una CADENA no abriría el archivo—.
$ARCHIVO_ICONO_ARMA = @{
    # Los tres primeros FUERON provisionales (la bola de generar-efectos.ps1 y
    # dos salidas de Replicate) hasta septiembre de 2026; ya son de Sergio, con
    # el mismo nombre de archivo.
    petanca         = 'Petanca.png';             cayadoSanIsidro = 'Cayado.png'
    campanaSilencio = 'Campana.png'
    pilum           = 'pilum.png';               gladius         = 'Gladius.png'
    pistola         = 'Pistola.png';             escopeta        = 'Escopeta.png'
    lanzasGemelas   = 'Lanzas_gemelas.png';      columnaDoble    = 'Columna_doble.png'
    rosaDeVientos   = 'Rosa_de_los_vientos.png'; metralla        = 'Metralla.png'
    lanzagranadas   = 'Lanzagranadas.png';       bombardeo       = 'Bombardeo.png'
    ondaExpansiva   = 'Onda_expansiva.png';      aquila          = 'Aquila.png'
    fuegoGriego     = 'Fuego_griego.png';        rete            = 'Rete.png'
    rayoHorizontal  = 'Rayo_de_Jupiter.png';     rayoCruzado     = 'Rayo_cruzado.png'
    scutum          = 'Scutum.png';              ballista        = 'Ballista.png'
    tribulus        = 'Tribulus.png';            arcoCorto       = 'Arco_corto.png'
    honda           = 'Honda_balear.png';        fusil           = 'Fusil.png'
    subfusil        = 'subfusil.png';            revolver        = 'revolver.png'
    hacha           = 'Hacha.png';               maza            = 'Maza.png'
    latigo          = 'Latigo.png';              motosierra      = 'Motosierra.png'
    guadanya        = 'Guada?a.png';             lanzallamas     = 'Lanzallamas.png'
    recortada       = 'Recortada.png';           aspa            = 'Aspa.png'
    enfilada        = 'Enfilada.png';            agujas          = 'Lluvia_de_agujas.png'
    muroDeLanzas    = 'Muro_de_lanzas.png';      enjambre        = 'Enjambre.png'
    molotov         = 'Coctel_molotov.png';      lanzacohetes    = 'Lanzacohetes.png'
    artilleria      = 'Artilleria.png';          lluviaDeFlechas = 'Lluvia_de_flechas.png'
    gritoDeGuerra   = 'Grito_de_guerra.png';     sismo           = 'Sismo.png'
    aceiteHirviendo = 'Aceite_hirviendo.png';    minas           = 'Minas.png'
    alquitran       = 'Alquitran.png';           campoElectrico  = 'Campo_electrico.png'
    laser           = 'Laser.png';               aspaDeLuz       = 'Aspa_de_luz.png'
    satelites       = 'Satelites.png';           discosDeSierra  = 'Discos_de_sierra.png'
    katana          = 'Katana.png';              sierrasVotivas  = 'Sierras_votivas.png'
    ositoDinamito   = 'osito_dinamito.png'
}
# LOS VEINTINUEVE OBJETOS PASIVOS, en el orden en que van a la tira.
#
# Eran ocho y cabian en una lamina de 4x2 que dibujo Sergio. Con veintinueve ya
# no: ampliar la rejilla obligaria a rehacer la lamina entera cada vez que entra
# un objeto, y lo que hace falta es poder anadir uno sin tocar lo que hay.
#
# Asi que esta hoja pasa a `sueltos`, como la de armas: un archivo por objeto.
# Los ocho primeros siguen saliendo de la lamina de Sergio -se les saca su celda
# con ExtraerCelda, ver $ICONO_DESDE_HOJA- y los veintiuno nuevos son archivos
# en resources/objetos/pasivos/. Nadie tiene que redibujar nada para que entre
# el numero treinta.
$ICONOS_OBJETOS = @(
    'sandalias','lorica','anilloAugusto','clepsidra',
    'coronaLaurel','antorcha','piedraIman','anfora',
    'campanaMilagrosa','alaDeMercurio','amuletoAzogue','astaEscornao',
    'lagartoCalzadilla','becerroDeOro','musa','sanguijuelasGuadiana',
    'capaErizo','cruzDelGigante','piraFuneraria','lagrimaDeLaMora',
    'virgenNegra','balsamoFierabras','cencerrosSanAnton','diademaAliseda',
    'selloMagacela','coronaEspinas','grialAlconetar','llaveDelPerdon',
    'libroSombras'
)

# Los ocho de la lamina original, cada uno con su celda. El orden de la rejilla
# 4x2 es el de lectura, y coincide con el de la lista de arriba.
$CELDA_OBJETO = @{
    sandalias = 0; lorica = 1; anilloAugusto = 2; clepsidra = 3
    coronaLaurel = 4; antorcha = 5; piedraIman = 6; anfora = 7
}

# 32 y no 20 —la rejilla a la que se rasterizaban los glifos vectoriales— porque
# ahora hay dibujo de verdad que perder. Y no más de 32: el sitio más pequeño
# donde se ve un icono es la ranura del panel de la esquina, que a zoom 1 son
# unos 24 píxeles de pantalla. Una hoja más fina que eso obligaría a REDUCIR con
# el suavizado apagado, o sea a tirar filas enteras de píxeles, que es lo que
# de verdad ensucia un icono.
$LADO_ICONO = 32

# ICONOS QUE SON TODO AGUJERO.
#
# `Rematar` rellena con la media de sus vecinos todo lo transparente que no
# toque el borde de la tira, porque se escribio para tapar los boquetes que la
# REDUCCION abre en mitad de un cuerpo. Un aro de gimnasia ritmica no es un
# cuerpo: es un agujero con borde, y salia como un disco macizo en la ficha, en
# la tienda y en la carta de subida de nivel, aunque la lamina de Sergio lo trae
# vacio y bien vacio.
#
# Es exactamente el mismo caso que ya estaba resuelto en la hoja del PROYECTIL
# (ver `huecos` en $EFECTOS_HOJA), solo que alli el aro va solo en su lamina y
# bastaba un interruptor para la hoja entera. Aqui comparte tira con cincuenta y
# ocho armas macizas que SI necesitan el relleno, asi que va por id.
#
# Vale igual para la tira de OBJETOS: la corona de espinas es un aro de
# ramas y el amuleto de azogue lleva la cadena en lazo, y a los dos les
# tapaba el hueco de blanco.
#
# Y para tres armas que son puro hueco: el Arco y la Ballesta son un vano
# entre la pala y la cuerda -en el Arco, un tercio del icono- y el Latigo
# lleva el ojo de la espiral. Esas tres SI traen alfa en su dibujo, asi que
# el hueco llegaba bien hasta el rematado y era Rematar quien lo tapaba con
# la media de sus vecinos: por eso salian oscuras y no blancas.
#
# Para anadir otro -una rosquilla, una herradura, una llave- basta escribir su
# id aqui.
$ICONOS_CON_AGUJERO = @('arosRitmica', 'coronaEspinas', 'amuletoAzogue',
                        'arcoCorto', 'ballista', 'latigo')

# Y una SEGUNDA hoja de armas a 96, para donde el icono se ve grande.
#
# Los 32 valen para las ranuras de la ficha, que miden eso. Pero en la ruleta
# del cofre el mismo icono se dibuja a 26 unidades de interfaz, que en un
# monitor de densidad doble son mas de cien pixeles reales: ampliar 32 a 104 es
# multiplicar por 3,25, y a vecino mas proximo eso son bloques de tres y de
# cuatro pixeles mezclados. Es lo que Sergio veia como "se distorsionan, como si
# tuvieran transparencias".
#
# 96 y no 128 porque 96 es tres veces 32: las dos hojas salen del mismo recorte
# y la grande contiene exactamente la misma silueta, sin decisiones nuevas.
$LADO_ICONO_HD = 96

# LOS DIEZ LIBROS DEL CODICE INFERNAL, en una sola lamina de 5x2.
#
# No son iconos: es el SPRITE del arma, el libro que orbita al personaje. Va por
# aqui porque el recorte que hace falta es exactamente el de una hoja en
# rejilla -cada libro a su celda, recortado a su silueta y centrado- y montarlo
# en una tira de fotogramas es lo que espera dibujarOrbitales (ver `frames` en
# sistemas/armas.js).
#
# 128 como las lunas de los Satelites (orbLuna), que es el otro orbital con
# hoja propia: a ese tamano un libro dibujado a 29 unidades logicas todavia va
# sobrado y no hay que ampliar nada.
$LADO_LIBRO = 128

# Los nombres son para el informe y para `orden` en el atlas: el motor elige el
# libro por el NUMERO de orbital, no por el nombre (ver `fotogramaPorEscudo`).
$LIBROS_CODICE = @('libro1','libro2','libro3','libro4','libro5',
                   'libro6','libro7','libro8','libro9','libro10')

# LAS DIEZ MAZAS DEL RAINBOWMAZAS, en otra lamina de 5x2.
#
# Mismo caso que los libros y por el mismo camino: no son iconos, es el sprite
# del PROYECTIL, y el arma reparte una maza distinta por cada una que lanza
# —una al nivel 1 y diez al 10, cada una de su color—.
#
# 56 y no 128 como los libros porque esto vuela por el mapa, no orbita: los
# sprites de proyectil del juego andan entre 16 y 52 px (ver proyAbeja,
# proyLanza), y a 56 la maza mide 14 unidades logicas, la mitad de un
# personaje. Mas grande dejaria de leerse como algo lanzado.
$LADO_MAZA = 56

$MAZAS_RAINBOW = @('maza1','maza2','maza3','maza4','maza5',
                   'maza6','maza7','maza8','maza9','maza10')

# LAS DIEZ CARTAS DE LA BARAJA, tercera lamina de 5x2 con el mismo tratamiento
# que los libros y las mazas.
#
# 44 y no 56 como las mazas: una carta lanzada es mas pequena que una maza y va
# a salir de veinte en veinte, asi que a mayor tamano lo unico que se consigue
# es tapar la pantalla. A 44 la carta mide 11 unidades logicas de alto, poco mas
# de un tercio de un personaje.
$LADO_CARTA = 44

$CARTAS_BARAJA = @('carta1','carta2','carta3','carta4','carta5',
                   'carta6','carta7','carta8','carta9','carta10')

# LOS DIEZ AROS DE RITMICA, cuarta lamina de 5x2 con el mismo tratamiento.
#
# 72 y no 56 como las mazas: el aro es el arma de AREA de las dos, asi que su
# dibujo tiene que ser visiblemente mas grande que el de la maza o la promesa
# no se cumple mirandolo. A 72 mide 18 unidades logicas, dos tercios de un
# personaje.
$LADO_ARO = 72

$AROS_RITMICA = @('aro1','aro2','aro3','aro4','aro5',
                  'aro6','aro7','aro8','aro9','aro10')

# La PORTADA de un arma que no tiene archivo propio, sino una celda de una hoja.
# Se extrae a un temporal antes de montar la tira de iconos. Ver ExtraerCelda.
$ICONO_DESDE_HOJA = @{
    codiceInfernal = @{ hoja = 'armas\libros.png'; cols = 5; filas = 2; celda = 0 }
    rainbowMazas   = @{ hoja = 'armas\mazas.png';  cols = 5; filas = 2; celda = 0 }
    cartasEspanolas = @{ hoja = 'armas\cartas.png'; cols = 5; filas = 2; celda = 0 }
    arosRitmica     = @{ hoja = 'armas\aros.png';   cols = 5; filas = 2; celda = 0 }
}

$HOJAS_ICONOS = @(
    # `modo` rejilla: la hoja trae alfa y los iconos caen en celdas iguales.
    @{ src='objetos\pasivos'; dst='iconos\objetos.png'; id='iconosObjetos'
       ids=$ICONOS_OBJETOS; modo='sueltos'; cols=0; filas=0; lado=$LADO_ICONO }
    # Y la de objetos a 96, por el mismo motivo que la de armas: desde que
    # ui/hud.js tira SIEMPRE de la hoja grande (ver RADIO_HD), un objeto sin
    # gemela de 96 se quedaria dibujandose desde los 32 en todas partes.
    @{ src='objetos\pasivos'; dst='iconos\objetos-hd.png'; id='iconosObjetosHd'
       ids=$ICONOS_OBJETOS; modo='sueltos'; cols=0; filas=0; lado=$LADO_ICONO_HD }
    # `modo` sueltos: no hay hoja, hay un archivo por arma dentro de `src`. Ver
    # RecortarIconosSueltos.
    @{ src='armas';               dst='iconos\armas.png';    id='iconosArmas'
       ids=$ICONOS_ARMAS;   modo='sueltos'; cols=0; filas=0; lado=$LADO_ICONO }
    @{ src='armas';               dst='iconos\armas-hd.png'; id='iconosArmasHd'
       ids=$ICONOS_ARMAS;   modo='sueltos'; cols=0; filas=0; lado=$LADO_ICONO_HD }
    # El sprite del Codice: diez libros, uno por nivel del arma.
    @{ src='armas\libros.png';    dst='efectos\orb-codice.png'; id='orbCodice'
       ids=$LIBROS_CODICE;  modo='rejilla'; cols=5; filas=2; lado=$LADO_LIBRO }
    # Y el del RainbowMazas: diez mazas, una por cada una que se lanza.
    @{ src='armas\mazas.png';     dst='efectos\proy-mazas.png'; id='proyMazas'
       ids=$MAZAS_RAINBOW;  modo='rejilla'; cols=5; filas=2; lado=$LADO_MAZA }
    # Y las diez cartas de la baraja espanola.
    @{ src='armas\cartas.png';    dst='efectos\proy-cartas.png'; id='proyCartas'
       ids=$CARTAS_BARAJA;  modo='rejilla'; cols=5; filas=2; lado=$LADO_CARTA }
    # Y los diez aros de ritmica.
    # `huecos`: UN ARO ES TODO AGUJERO. Sin esto, `Rematar` le rellena el centro
    # con la media de sus vecinos -se escribio para tapar los boquetes que abre la
    # reduccion en mitad de un cuerpo- y el sprite sale disco macizo.
    @{ src='armas\aros.png';      dst='efectos\proy-aros.png'; id='proyAros'
       ids=$AROS_RITMICA;   modo='rejilla'; cols=5; filas=2; lado=$LADO_ARO
       huecos=$true }
)

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'iconos')  | Out-Null
# La hoja de libros sale a efectos/, con los demas orbitales, y este bucle corre
# antes de que la seccion de efectos cree esa carpeta.
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'efectos') | Out-Null

$informeIconos = @()
foreach ($hoja in $HOJAS_ICONOS) {
    $rutaSrc = Join-Path $ORIGEN $hoja.src
    $rutaDst = Join-Path $DESTINO $hoja.dst
    $n = $hoja.ids.Count
    if (-not (Test-Path $rutaSrc)) {
        $informeIconos += [PSCustomObject]@{ Hoja=$hoja.id; Pedidos=$n; Hallados='-'; Tira='-'; Estado='NO EXISTE' }
        continue
    }
    try {
        if ($hoja.modo -eq 'sueltos') {
            # Un archivo por id, EN EL ORDEN DE LA LISTA. El que no aparezca se
            # pasa igualmente como ruta inexistente: RecortarIconosSueltos lo
            # cuenta como FALTA y deja su hueco vacío, que es lo que hay que ver
            # en el informe. Saltárselo aquí correría los iconos siguientes.
            $entradas = foreach ($id in $hoja.ids) {
                # Portada sacada de una celda de una lamina, no de un archivo
                # propio. Se extrae a un temporal y se pasa como si lo fuera.
                $deHoja = $ICONO_DESDE_HOJA[$id]
                if ($deHoja) {
                    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "emerita-portada-$id.png"
                    [Procesador]::ExtraerCelda((Join-Path $ORIGEN $deHoja.hoja), $tmp,
                                               $deHoja.cols, $deHoja.filas, $deHoja.celda) | Out-Null
                    $tmp
                    continue
                }
                # Los ocho pasivos originales viven en la lamina 4x2 que dibujo
                # Sergio, cada uno en su celda. Mismo camino que las portadas
                # sacadas de hoja, con la celda en otra tabla porque son otra
                # cosa: aquella es "de que lamina sale este icono de arma" y
                # esta es "que celda de la lamina de objetos es este pasivo".
                $celda = $CELDA_OBJETO[$id]
                if ($null -ne $celda) {
                    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "emerita-objeto-$id.png"
                    [Procesador]::ExtraerCelda((Join-Path $ORIGEN 'objetos\objetos.png'), $tmp,
                                               4, 2, [int]$celda) | Out-Null
                    $tmp
                    continue
                }
                $patron = $ARCHIVO_ICONO_ARMA[$id]
                $f = $null
                if ($patron) {
                    $f = Get-ChildItem -Path $rutaSrc -Filter $patron -File |
                         Select-Object -First 1
                }
                # Y si no hay patron declarado, el archivo se llama como el id.
                # Es lo que usan los veintiun objetos nuevos, que salen de
                # herramientas/generar-imagen.js con ese nombre exacto.
                if (-not $f) {
                    $suelto = Join-Path $rutaSrc "$id.png"
                    if (Test-Path $suelto) { $suelto; continue }
                }
                if ($f) { $f.FullName } else { Join-Path $rutaSrc "$id.NO-DECLARADO" }
            }
            # Uno por icono, en el MISMO orden que $entradas, que es el orden
            # de `ids` y por tanto el de los huecos de la tira.
            $conAgujero = @($hoja.ids | ForEach-Object { $ICONOS_CON_AGUJERO -contains $_ })
            $r = [Procesador]::RecortarIconosSueltos([string[]]$entradas, $rutaDst, $hoja.lado,
                                                     [bool]$hoja.huecos, [bool[]]$conAgujero)
        } else {
            $r = [Procesador]::RecortarIconos($rutaSrc, $rutaDst, $n, $hoja.lado,
                                              $hoja.modo, $hoja.cols, $hoja.filas,
                                              [bool]$hoja.huecos)
        }
    } catch {
        $informeIconos += [PSCustomObject]@{ Hoja=$hoja.id; Pedidos=$n; Hallados='-'; Tira='-'; Estado='ERROR' }
        continue
    }
    $p = $r -split '\|'
    $hallados = [int]$p[0]

    # `plano`: esta entrada NO es un sprite del mundo. Le dice a core/recursos.js
    # que no genere ni la copia espejada ni la del destello de impacto — un icono
    # ni mira a un lado ni recibe golpes, y son dos lienzos de 1664x32 por hoja
    # que no iba a usar nadie.
    $atlas[$hoja.id] = [ordered]@{
        archivo = $hoja.dst.Replace('\', '/')
        w = $hoja.lado; h = $hoja.lado
        anclaX = [int]($hoja.lado / 2); anclaY = [int]($hoja.lado / 2)
        frames = $n
        plano = $true
        orden = $hoja.ids
    }

    $informeIconos += [PSCustomObject]@{
        Hoja    = $hoja.id
        Pedidos = $n
        Hallados= $hallados
        Tira    = "$($hoja.lado * $n)x$($hoja.lado)"
        Estado  = if ($hallados -eq $n) { 'OK' } else { 'DESCUADRE' }
    }
    # Con la cuenta descuadrada el número solo dice que algo falla; lo que hace
    # falta para arreglarlo es VER qué silueta cayó en cada hueco, porque un
    # recorte que junta dos celdas se delata por el tamaño.
    if ($hallados -ne $n) { "  detalle $($hoja.id): $($p[2])" }
}
$informeIconos | Format-Table -AutoSize
"DESCUADRE = la hoja no tiene tantos iconos como ids declarados; revisar el recorte."

# ---------------------------------------------------------------------------
# EFECTOS DE ZONA  (retirado)
# ---------------------------------------------------------------------------
#
# Aqui se recortaban calcomanias de suelo de resources/armas/efectos/efectos6.jpg
# para las armas de `zonaPersistente`. Se probaron cinco celdas y se retiraron
# todas: cuatro por el dibujo -relieve, canto propio compitiendo con el aro- y
# las dos ultimas por como quedaban jugando. Las laminas de origen ya no estan
# en el repositorio.
#
# Se conservan en el bloque C# de arriba `RecortarCeldas` y `SoloIslasPropias`,
# sin nadie que las llame. No es descuido: resuelven un problema real -recortar
# celdas de un catalogo sobre blanco, con el dibujo desbordando su casilla por
# los dos lados- y la historia de por que estan escritas asi vale mas que las
# lineas que ocupan. Si aparece otro catalogo, la vuelta es declarar la lamina.
#
# Lo que SI sobrevive del experimento esta en el motor: las zonas del jugador se
# dibujan bajo las entidades (ver entidades/zonaDanyo.js).

# ---------------------------------------------------------------------------
# TAJOS DE ARMA CUERPO A CUERPO
# ---------------------------------------------------------------------------
#
# sprite_katana.png es una hoja de ANIMACION, no un catalogo: seis fases del
# mismo barrido, rejilla 3x2 de celdas de 512, en orden de lectura. Y trae su
# propio alfa, asi que no pasa por nada del recorte de las laminas sobre blanco.
#
# MEDIDO sobre la hoja, no estimado:
#   - el pivote (el punto donde va el jugador) cae DENTRO del dibujo, en el
#     hueco del anillo, en (256, 240) de cada celda. El centroide de brillo de
#     los fotogramas cerrados sale en (258, 246), que lo confirma.
#   - el contenido mas lejano al pivote esta a 237,3 px (fotograma 3). Con
#     MEDIO = 240 entra la hoja entera y el filo del dibujo queda pegado al
#     borde del fotograma, que es lo que permite dibujarlo en el juego con
#     medio lado = alcance del arma y que el tajo acabe donde acaba el dano.
# CADA HOJA, SU PNG Y SU ENTRADA DE ATLAS, y el arma nombra la entrada tal cual
# en `spriteTajo` (datos/armas.js). Es lo que hace que anadir la siguiente sea
# UNA linea aqui y otra en los datos, sin tocar el motor ni renumerar nada.
#
# Se penso en meterlas todas en una tira compartida, como las zonas, y no
# compensa: cada hoja trae su rejilla, su pivote y su numero de fases, asi que
# una tira comun obligaria a llevar la cuenta de donde empieza cada arma y
# cuantos fotogramas gasta. Un PNG por arma no tiene esa contabilidad.
#
# `pivX`/`pivY` y `medio` SE MIDEN, no se estiman. Para eso esta
# herramientas/medir-hoja-tajo.ps1: dice la rejilla, propone el pivote y da el
# radio del contenido mas lejano, que es el `medio` correcto.
#
# `lado` es el tamano al que se hornea, y debe ser el que el arma usa en el caso
# base: alcance * 2 * ESCALA. Asi el blit sale 1:1 al nivel 1 (ver abajo).
$HOJAS_ALFA = @(
    @{ src='armas\efectos\sprite_katana.png'; dst='efectos\tajo-katana.png'
       id='tajoKatana'; cols=3; filas=2; pivX=256; pivY=240; medio=240; lado=304 }

    # Campo electrico: UNA sola imagen, sin rejilla, y no se anima -- GIRA (ver
    # `giro` en datos/armas.js). Por eso el pivote es el CENTRO DEL LIENZO y no
    # el centroide de brillo que propone medir-hoja-tajo.ps1: lo que hace falta
    # en algo que rota es el centro de simetria, no donde mas ilumina.
    #
    # Medido sobre la version actual (702x700, tintas planas): desde el centro
    # del lienzo el dibujo llega a radio 331 y caben 349, asi que entra entero
    # con holgura y nada se corta al girar.
    #
    # `medio` = el radio del contenido, no el hueco disponible. Es lo que hace
    # que el filo del dibujo caiga en el borde del fotograma y, dibujandolo con
    # medio lado = radio del arma, el efecto acabe donde acaba el dano.
    @{ src='armas\efectos\sprite_campoElectrico.png'; dst='efectos\aura-campoElectrico.png'
       id='auraCampoElectrico'; cols=1; filas=1; pivX=351; pivY=350; medio=332; lado=272 }

    # ORBITALES. Imagen suelta y centrada, `lado` = radioEscudo * 2 * 4.
    #
    # El Scutum NO gira sobre si mismo (lleva emblema con un arriba claro, y
    # rotandolo las alas quedarian boca abajo media vuelta); los discos SI, y
    # ademas al reves y mas rapido que su orbita, que es lo que los lee como
    # que cortan. Eso lo dice `giroOrbital` en datos/armas.js.
    @{ src='armas\efectos\sprite_scutum.png'; dst='efectos\orb-scutum.png'
       id='orbScutum'; cols=1; filas=1; pivX=151; pivY=153; medio=151; lado=64 }
    @{ src='armas\efectos\sprite_discosDeSierra.png'; dst='efectos\orb-discos.png'
       id='orbDiscos'; cols=1; filas=1; pivX=154; pivY=153; medio=153; lado=72 }
    # Sierras votivas: orbital pulsante, radioEscudo 10 -> lado 80. Gira sobre
    # su eje como los discos, que para eso es una sierra.
    @{ src='armas\efectos\sprite_sierrasVotivas.png'; dst='efectos\orb-sierras.png'
       id='orbSierras'; cols=1; filas=1; pivX=144; pivY=144; medio=144; lado=80 }

    # Aquila: aura pasiva, radio 24 -> lado 192. SI GIRA (ver `giro` en
    # datos/armas.js), asi que el pivote es el CENTRO DEL LIENZO y no el
    # centroide del dibujo: en algo que rota hace falta el centro de simetria.
    # El comentario de aqui decia "NO gira" y estaba obsoleto -- gira desde que
    # se probo en el juego, porque un aura permanente quieta parece una
    # calcomania pegada al suelo.
    #
    # REMEDIDO sobre la version nueva de Sergio, que es de 1024x1024 (la
    # anterior era de 473x466, de ahi que pivote y medio cambien enteros):
    # desde el centro del lienzo el contenido llega a radio 506,4 y caben 512,
    # asi que entra completo y no se corta nada al dar la vuelta. `medio` = 507,
    # el radio del contenido, para que el filo del dibujo caiga en el borde del
    # fotograma y, dibujandolo con medio lado = radio del arma, el aura acabe
    # exactamente donde acaba el dano.
    @{ src='armas\efectos\sprite_aquila.png'; dst='efectos\aura-aquila.png'
       id='auraAquila'; cols=1; filas=1; pivX=512; pivY=512; medio=507; lado=192 }

    # Aceite hirviendo: charco, radio 38 -> lado 304. Es una calcomania de
    # suelo, no un aura, pero se hornea igual: cuadrada y centrada.
)

# Sobre el `lado` de la Katana, 304 y no un redondo: es el tamano al que se
# dibuja en el caso base -alcance 38, o sea 38*2*4 = 304 pixeles de pantalla-,
# asi que el blit sale 1:1 al nivel 1, que es la regla de rendimiento del
# proyecto. Horneando a 256 el juego ampliaba 1,19x, y ampliar por vecino mas
# proximo una ilustracion de degradados deja el borde dentado que se vio en la
# revision. Ademas sale del recorte de 480 REDUCIENDO, sin inventar un pixel.
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'efectos') | Out-Null

# ---------------------------------------------------------------------------
# PROYECTILES CON DIBUJO
# ---------------------------------------------------------------------------
#
# sprite_pistola.png no es una pistola ni un fogonazo: es LA BALA EN VUELO, con
# su llama de propulsion detras. Va en la posicion del proyectil.
#
# Y es PIXEL ART con rejilla de 10 px: sus 430x190 de contenido son en realidad
# 43x19 pixeles dibujados. Por eso se hornea justo a 43x19 y no al tamano del
# trazo que sustituye (32 px): reducir pixel art de alfa dura por un factor que
# no sea entero descuadra la rejilla, se come filas y deja el contorno a
# trozos. Con 43x19 el blit va 1:1 y no se pierde ni un pixel del dibujo.
#
# El dibujo mira a la IZQUIERDA; se le da la vuelta al dibujarlo, no aqui (ver
# entidades/proyectil.js), porque espejar en el motor es una transformacion mas
# de las que ya se hacen para orientarlo al vuelo.
$DIBUJOS_SUELTOS = @(
    @{ src='armas\efectos\sprite_pistola.png'; dst='efectos\bala-pistola.png'
       id='balaPistola'; ancho=43; alto=19 }

    # UN ABROJO SUELTO, para el Tribulus. No es una calcomania de zona como el
    # aceite: es UNA pieza, y el motor dibuja veinte copias repartidas por el
    # area (ver `hojaPieza` en entidades/zonaDanyo.js). Por eso se hornea al
    # tamano de una sola y pequena, no al de la zona entera.
    #
    # 24x22 conserva la proporcion del original (146x132) y son 6 unidades
    # logicas de lado: lo justo para que se distinga la forma de cuatro puntas
    # sin que veinte de ellas tapen el suelo.
    @{ src='armas\efectos\sprite_abrojos.png'; dst='efectos\abrojo.png'
       id='abrojo'; ancho=24; alto=22 }

    # Aceite hirviendo. Va por aqui y no por $HOJAS_ALFA porque su dibujo es
    # ANCHO (588x401): un recorte cuadrado centrado le cortaria 94 px por cada
    # lado. Aqui se recorta su silueta y se estira al cuadro que el motor pinta,
    # y estirar no cuesta nada en un charco -no hay proporcion verdadera en una
    # mancha-, que es la misma razon por la que se estiran las calcomanias de
    # zona (ver `estirar` en RecortarCeldas).
    #
    # 304 = radio 38 * 2 * 4, el tamano al que se dibuja en el caso base.
    @{ src='armas\efectos\sprite_aceiteHirviendo.png'; dst='efectos\zona-aceite.png'
       id='zonaAceite'; ancho=304; alto=304 }
)

foreach ($p in $DIBUJOS_SUELTOS) {
    $rutaSrc = Join-Path $ORIGEN $p.src
    if (-not (Test-Path $rutaSrc)) { "PROYECTIL $($p.id): no existe $rutaSrc"; continue }
    try {
        $r = [Procesador]::RecortarSuelto($rutaSrc, (Join-Path $DESTINO $p.dst), $p.ancho, $p.alto)
        $q = $r -split '\|'
        $atlas[$p.id] = [ordered]@{
            archivo = $p.dst.Replace('\', '/')
            w = $p.ancho; h = $p.alto
            anclaX = [int]($p.ancho / 2); anclaY = [int]($p.alto / 2)
            frames = 1
            plano  = $true
        }
        "PROYECTIL $($p.id): silueta $($q[2])x$($q[3]) -> $($q[0])x$($q[1])"
    } catch {
        "PROYECTIL $($p.id): ERROR - $($_.Exception.Message)"
    }
}

# ---------------------------------------------------------------------------
# EFECTOS GENERADOS POR CODIGO
# ---------------------------------------------------------------------------
#
# Las explosiones no salen de resources/: las fabrica herramientas/
# generar-efectos.ps1 directamente sobre assets/, porque una secuencia de
# explosion es aritmetica y no hay lamina que recortar (ver efectos-mapa.md,
# donde el hueco de la explosion quedo medido y sin llenar).
#
# Aqui solo se FUNDE su ficha en el atlas. Ni se generan ni se validan desde
# esta herramienta: cada una declara lo que sabe, y asi retocar una paleta no
# obliga a repasar los 259 assets. Si la ficha no esta, no pasa nada — el
# motor cae al circulo trazado de siempre, igual que con cualquier hueco del
# atlas.
$fichaEfectos = Join-Path $DESTINO 'efectos\explosiones.json'
if (Test-Path $fichaEfectos) {
    $gen = Get-Content $fichaEfectos -Raw | ConvertFrom-Json
    $n = 0
    foreach ($prop in $gen.PSObject.Properties) {
        $e = [ordered]@{}
        foreach ($c in $prop.Value.PSObject.Properties) { $e[$c.Name] = $c.Value }
        $atlas[$prop.Name] = $e
        $n++
    }
    "EFECTOS GENERADOS: $n hojas fundidas desde efectos\explosiones.json"
} else {
    "EFECTOS GENERADOS: sin ficha (correr herramientas\generar-efectos.ps1)"
}

$informeAlfa = @()
foreach ($hoja in $HOJAS_ALFA) {
    $rutaSrc = Join-Path $ORIGEN $hoja.src
    if (-not (Test-Path $rutaSrc)) {
        $informeAlfa += [PSCustomObject]@{ Hoja=$hoja.id; Fotogramas='-'; Lado='-'; Estado='NO EXISTE' }
        continue
    }
    try {
        $r = [Procesador]::RecortarRejilla($rutaSrc, (Join-Path $DESTINO $hoja.dst),
                                           $hoja.cols, $hoja.filas,
                                           $hoja.pivX, $hoja.pivY, $hoja.medio, $hoja.lado)
    } catch {
        $informeAlfa += [PSCustomObject]@{ Hoja=$hoja.id; Fotogramas='-'; Lado='-'; Estado="ERROR $($_.Exception.Message)" }
        continue
    }
    $p = $r -split '\|'
    # anclaX/anclaY en el CENTRO: el recorte se hizo centrado en el pivote, asi
    # que el pivote ES el centro del fotograma y el juego no necesita ningun
    # desplazamiento al dibujar.
    $atlas[$hoja.id] = [ordered]@{
        archivo = $hoja.dst.Replace('\', '/')
        w = $hoja.lado; h = $hoja.lado
        anclaX = [int]($hoja.lado / 2); anclaY = [int]($hoja.lado / 2)
        frames = [int]$p[0]
        plano  = $true
    }
    $informeAlfa += [PSCustomObject]@{
        Hoja = $hoja.id; Fotogramas = [int]$p[0]; Lado = $hoja.lado; Estado = 'OK'
    }
}
if ($informeAlfa.Count -gt 0) {
    "HOJAS CON ALFA (tajos y auras):"
    $informeAlfa | Format-Table -AutoSize
}

# ---------------------------------------------------------------------------
# SUELO DE NIVEL
# ---------------------------------------------------------------------------
#
# Un mapa por nivel, en resources/stages/<n>/. Sale a assets/niveles/ y lo
# declara el propio nivel en `suelo.imagen` (datos/niveles/merida.js), que es
# lo que mantiene el contrato: un nivel nuevo sigue siendo copiar un archivo de
# datos y dejar su mapa, sin tocar el motor.
#
# El margen de fusión es el 6% del lado corto: bastante para que la mezcla no
# se note como una banda, poco para no tirar arte. Con la calzada nocturna
# (1536x1815 de origen) son 92 píxeles.
#
# Antes de teselar, el mapa de Emerita pasa por Ensanchar (más arriba en este
# mismo archivo): +384 px reflejados a cada lado, 768 en total —el 50% pedido—,
# sin tocar el original. Es lo que hace que el nivel, que hasta ahora salía
# más estrecho que la pantalla (480 unidades lógicas), tenga ya sitio de sobra
# a los lados de la calzada.
$rutaMapaOriginal = Join-Path $ORIGEN 'stages\1\mapa_emerita_survivor.png'
$rutaMapaAncho = Join-Path $ORIGEN 'stages\1\mapa_emerita_survivor_ancho.png'
if (Test-Path $rutaMapaOriginal) {
    # `unidad` a pliegue único (=pxPorLado): se probó a trocear el pliegue en
    # unidades más pequeñas (128, 192) para que el rombo del espejo pesara
    # menos, y salió AL REVÉS -- el patrón de árboles ya es tan regular que
    # trocear el espejo solo multiplica el número de rombos visibles en vez
    # de esconderlos. Un solo pliegue por lado es, de las tres, la que menos
    # se nota.
    $rEnsanchar = [Procesador]::Ensanchar($rutaMapaOriginal, $rutaMapaAncho, 384, 384)
    "Ensanchar mapa nivel 1: $rEnsanchar"
}

$SUELOS = @(
    @{ src='stages\1\mapa_emerita_survivor_ancho.png'; dst='niveles\merida-suelo.jpg'; margen=92 }
)

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'niveles') | Out-Null

$informeSuelo = @()
foreach ($s in $SUELOS) {
    $rutaSrc = Join-Path $ORIGEN $s.src
    $rutaDst = Join-Path $DESTINO $s.dst
    if (-not (Test-Path $rutaSrc)) {
        $informeSuelo += [PSCustomObject]@{ Mapa=$s.dst; Tile='-'; CosturaX='-'; CosturaY='-'; Estado='NO EXISTE' }
        continue
    }
    try {
        $r = [Procesador]::HacerTeselable($rutaSrc, $rutaDst, $s.margen, $ESCALA)
    } catch {
        $informeSuelo += [PSCustomObject]@{ Mapa=$s.dst; Tile='-'; CosturaX='-'; CosturaY='-'; Estado='ERROR' }
        continue
    }
    $p = $r -split '\|'
    if ($p.Count -ne 4) {
        $informeSuelo += [PSCustomObject]@{ Mapa=$s.dst; Tile='-'; CosturaX='-'; CosturaY='-'; Estado=$r }
        continue
    }
    $informeSuelo += [PSCustomObject]@{
        Mapa     = $s.dst
        Tile     = "$($p[0])x$($p[1])  ($([int]$p[0]/$ESCALA)x$([int]$p[1]/$ESCALA) logicas)"
        CosturaX = $p[2]
        CosturaY = $p[3]
        Estado   = 'OK'
    }
}
$informeSuelo | Format-Table -AutoSize
"Costura = salto medio al repetir VS salto entre dos pixeles del interior."
"Si el primer numero no supera al segundo, la union no se ve."

# ---------------------------------------------------------------------------
# ILUSTRACIONES DE MENU
# ---------------------------------------------------------------------------
#
# Titulo y seleccion de personaje. Estas NO se procesan: se copian tal cual y
# solo se les cambia el nombre a algo que el motor pueda escribir sin comillas.
#
# No se recortan porque no hay nada que recortar —son pantallas completas, sin
# silueta ni fondo que quitar— y no se reducen porque el juego las AMPLIA: la
# del titulo mide 1536 de ancho y el lienzo 1920. Reducirlas aqui seria tirar
# detalle para volver a estirarlo despues.
#
# La copia existe igualmente para que se mantenga la regla del proyecto: el
# juego lee de assets/ y de ningun otro sitio, y resources/ es solo la fuente.
#
# La del TITULO es ahora `Main_menu.jpg`, que trae las cinco opciones ya
# pintadas en su placa -JUGAR, JUGAR EN RED, TIENDA, CONFIGURACION y SALIR- y
# las dos antorchas encendidas. Se copia como .jpg y no se convierte: un fondo
# de pantalla completa no necesita canal alfa.
#
# OJO AL REPINTARLA: si cambia de TAMANO, todo lo medido sobre ella deja de
# valer -las cinco opciones del menu y las antorchas en js/ui/, y el recorte del
# icono en empaquetar.ps1- y no salta ningun error, simplemente el recuadro de
# luz cae donde no hay palabra. Ha pasado dos veces: al ir de 1376x768 a
# 1672x941, y al volver a 1360x768, que es lo que mide ahora. Se vuelve a medir
# con herramientas\medir-lapida.ps1, con la ventana pisando los dos rieles de la
# placa (-X0 522 -X1 882 -Y0 505 -Y1 745): por dentro de ellos los cuenta como
# texto y los cinco renglones salen del ancho de la ventana.
#
# Sustituyo a `Nueva_Pantalla_Start.jpg`, que sustituyo a `Pantalla_Start.png`.
# Las dos siguen en resources/ y ninguna se copia ya a assets/: el juego lee la
# que diga esta tabla y solo esa.
#
# La ilustracion ANTIGUA (Pantalla_Start.png) ya NO EXISTE: la borro Sergio el
# 17/09/2026, tres relevos despues de dejar de usarse. Dejo de copiarse a
# assets/ mucho antes -no la leia el juego y eran 2,7 MB de peso muerto en cada
# build de empaquetar.ps1, que copia assets/ entero- y lo ultimo que la
# referenciaba era la portada del manual del jugador, que usa ya Main_menu_pre.
#
# SELECCION sigue el mismo razonamiento que el titulo nuevo: opaca, sin
# recorte que perder, y ver-assets.ps1 confirmo que no tiene alfa real.
# Convertida a JPEG calidad 90 cae de 2,6 MB a 0,4 MB sin diferencia visible.
#
# EL SPLASH y LA PLACA DE LA HISTORIA siguen el mismo criterio: opacas, sin
# recorte que perder, y convertidas a JPEG calidad 90 al copiarlas. La placa se
# deja a su tamano original (1536x1024) porque la intro la AMPLIA a lo alto del
# lienzo, igual que el titulo.
#
# `ancho` y `recorte` son opcionales -reduccion y quitado de fondo- y ahora
# mismo no los usa nadie: los estreno la bandera de Extremadura, que dejo de
# hacer falta cuando Sergio dibujo esta placa con la tricolor ya integrada. Se
# quedan porque el siguiente menu con fondo blanco los va a querer.
$MENUS = @(
    @{ src='menus\Main_menu.jpg'; dst='menus\titulo.jpg' }
    # La PORTADA: la misma escena sin la lapida, con el logo pintado. El aviso
    # de pulsar YA NO VIENE EN EL DIBUJO -lo quito Sergio- y lo escribe el juego
    # encima, latiendo (ver dibujarPulsa en ui/intro.js). Cierra la intro y
    # espera antes de elegir partida.
    #
    # Lo unico medido sobre ella es donde cae ese texto, y va en unidades de
    # interfaz y no en pixeles de la imagen, asi que un repintado del mismo
    # encuadre no lo mueve.
    @{ src='menus\Main_menu_pre.jpg'; dst='menus\titulo-pre.jpg' }
    @{ src='menus\seleccion_jugador.png'; dst='menus\seleccion.jpg' }
    @{ src='menus\splash_screen.png'; dst='menus\splash.jpg' }
    @{ src='menus\intro_historia.jpg'; dst='menus\intro-historia.jpg' }
)

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'menus') | Out-Null

$informeMenus = @()
foreach ($m in $MENUS) {
    $rutaSrc = Join-Path $ORIGEN $m.src
    $rutaDst = Join-Path $DESTINO $m.dst
    if (-not (Test-Path $rutaSrc)) {
        $informeMenus += [PSCustomObject]@{ Menu=$m.dst; Tamano='-'; Estado='NO EXISTE' }
        continue
    }
    $srcExt = [System.IO.Path]::GetExtension($rutaSrc).ToLowerInvariant()
    $dstExt = [System.IO.Path]::GetExtension($rutaDst).ToLowerInvariant()
    $estado = 'COPIADA'
    if ($m.ContainsKey('recorte')) {
        # Fondo fuera, encuadre a la silueta y reduccion, todo en una pasada.
        $r = [Procesador]::RecortarBandera($rutaSrc, $rutaDst, $m.ancho) -split '\|'
        $estado = "RECORTADA ($($r[2])% opaco)"
    } elseif ($m.ContainsKey('ancho')) {
        # Reduccion con bicubica de calidad: es una fotografia, no pixel art, y
        # el vecino mas proximo solo dejaria dientes de sierra en el asta.
        $orig = [System.Drawing.Bitmap]::FromFile($rutaSrc)
        $alto = [int][Math]::Round($orig.Height * ($m.ancho / $orig.Width))
        $red = New-Object System.Drawing.Bitmap $m.ancho, $alto
        $g = [System.Drawing.Graphics]::FromImage($red)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($orig, 0, 0, $m.ancho, $alto)
        $g.Dispose()
        [Procesador]::Guardar($red, $rutaDst, 90)
        $red.Dispose()
        $orig.Dispose()
        $estado = 'REDUCIDA'
    } elseif ($srcExt -ne $dstExt -and $dstExt -eq '.jpg') {
        # Cambia de formato (normalmente PNG opaco -> JPEG): reencodear, no copiar.
        $bmp = [System.Drawing.Bitmap]::FromFile($rutaSrc)
        [Procesador]::Guardar($bmp, $rutaDst, 90)
        $bmp.Dispose()
        $estado = 'CONVERTIDA'
    } else {
        Copy-Item $rutaSrc $rutaDst -Force
    }
    $img = [System.Drawing.Image]::FromFile($rutaDst)
    $informeMenus += [PSCustomObject]@{
        Menu   = $m.dst
        Tamano = "$($img.Width)x$($img.Height)"
        Estado = $estado
    }
    $img.Dispose()
}
$informeMenus | Format-Table -AutoSize

# ---------------------------------------------------------------------------
# ICONO DE PESTANA
#
# De `resources/menus/favicon.png` salen los dos tamanos que declara
# index.html: 32 para la pestana y 180 para "anadir a la pantalla de inicio"
# de iOS.
#
# SE REDUCE AQUI Y NO EN EL NAVEGADOR. Dandole el original de 1254x1254 al
# `<link rel="icon">`, cada pestana se descarga 1,5 MB para pintar 32 pixeles
# y ademas lo reduce con el filtro que le parezca. Reducido offline con
# bicubica de calidad, el de 32 pesa 2 KB.
#
# PNG Y NO JPEG, que es la excepcion a lo que se hace con los menus: un icono
# de pestana necesita FONDO TRANSPARENTE -se pinta sobre la barra del
# navegador, que es clara en un tema y oscura en otro- y JPEG no tiene canal
# alfa. Por eso este bloque no usa `Guardar`, que hornea JPEG.
#
# OJO AL CAMBIAR EL DIBUJO: hay que subir a mano el `?v=` de index.html. Un
# favicon es de lo que mas se agarra el navegador, porque lo pide una vez y lo
# reutiliza en todas las pestanas; sin subir ese numero, el icono viejo puede
# quedarse semanas.
$FAVICON_SRC = Join-Path $ORIGEN 'menus\favicon.png'
$informePestana = @()
if (Test-Path $FAVICON_SRC) {
    $origenIcono = [System.Drawing.Bitmap]::FromFile($FAVICON_SRC)

    # SE RECORTA AL DIBUJO ANTES DE REDUCIR, y no es un adorno: a 32 pixeles cada
    # uno cuenta. La lamina viene con margenes transparentes -111 arriba, 170
    # abajo, distintos entre si- y reduciendo la imagen ENTERA el dibujo sale mas
    # pequeno de lo que cabe y encima descentrado un pixel. Recortado a su caja y
    # centrado, ocupa la casilla entera.
    #
    # Se conserva la proporcion: la corona es mas ancha que alta, y estirarla a
    # cuadrado la deformaria.
    $iw = $origenIcono.Width; $ih = $origenIcono.Height
    $bits = $origenIcono.LockBits(
        (New-Object System.Drawing.Rectangle -ArgumentList @(0, 0, $iw, $ih)),
        [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $paso = $bits.Stride
    $bytes = New-Object byte[] ($paso * $ih)
    [System.Runtime.InteropServices.Marshal]::Copy($bits.Scan0, $bytes, 0, $bytes.Length)
    $origenIcono.UnlockBits($bits)
    $cx0 = $iw; $cx1 = -1; $cy0 = $ih; $cy1 = -1
    for ($y = 0; $y -lt $ih; $y++) {
        for ($x = 0; $x -lt $iw; $x++) {
            # 12 y no 0: el borde de un PNG suavizado arrastra alfas de valor 1 o
            # 2 que no se ven y estirarian la caja hasta los bordes.
            if ($bytes[$y * $paso + $x * 4 + 3] -gt 12) {
                if ($x -lt $cx0) { $cx0 = $x }
                if ($x -gt $cx1) { $cx1 = $x }
                if ($y -lt $cy0) { $cy0 = $y }
                if ($y -gt $cy1) { $cy1 = $y }
            }
        }
    }
    if ($cx1 -lt 0) { $cx0 = 0; $cy0 = 0; $cx1 = $iw - 1; $cy1 = $ih - 1 }   # opaca entera
    $cw = $cx1 - $cx0 + 1; $ch = $cy1 - $cy0 + 1

    foreach ($lado in 32, 180) {
        $destinoIcono = Join-Path $DESTINO "favicon-$lado.png"
        $chico = New-Object System.Drawing.Bitmap $lado, $lado, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($chico)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $esc = $lado / [Math]::Max($cw, $ch)
        $nw = [float]($cw * $esc); $nh = [float]($ch * $esc)
        # OJO: la coma de PowerShell aprieta mas que la resta, asi que los
        # argumentos se calculan antes y se pasan en un array. En linea, `(32-$nw)/2`
        # dentro de un New-Object se lee como una division de arrays y revienta.
        $cajaDst = New-Object System.Drawing.RectangleF -ArgumentList @(
            [float](($lado - $nw) / 2), [float](($lado - $nh) / 2), $nw, $nh)
        $cajaSrc = New-Object System.Drawing.RectangleF -ArgumentList @(
            [float]$cx0, [float]$cy0, [float]$cw, [float]$ch)
        $g.DrawImage($origenIcono, $cajaDst, $cajaSrc, [System.Drawing.GraphicsUnit]::Pixel)
        $g.Dispose()
        $chico.Save($destinoIcono, [System.Drawing.Imaging.ImageFormat]::Png)
        $chico.Dispose()
        $informePestana += [PSCustomObject]@{
            Icono  = "favicon-$lado.png"
            Tamano = "${lado}x${lado}"
            KB     = "{0:N1}" -f ((Get-Item $destinoIcono).Length / 1KB)
        }
    }
    $origenIcono.Dispose()
} else {
    $informePestana += [PSCustomObject]@{ Icono='favicon.png'; Tamano='-'; KB='NO EXISTE' }
}
$informePestana | Format-Table -AutoSize


# ---------------------------------------------------------------------------
# RULETA DEL COFRE
# ---------------------------------------------------------------------------
#
# Se guarda solo el ARMAZON: aro, tachones, puntero y soporte. La cara de
# colores la traza el juego. Ver RecortarRuleta, que es donde esta explicado por
# que girar el dibujo no funcionaba.
#
# 640 de ancho y no el tamano original (1205): la ruleta se dibuja en la capa de
# interfaz, que va a la resolucion real del monitor, y la mayor de las tres que
# caben en la ventana del cofre pide unos 800 pixeles reales en una pantalla de
# densidad doble. 640 es el punto en que deja de notarse la reduccion sin cargar
# un PNG de un mega para una ventana que sale cinco veces por partida.
$rutaRuleta = Join-Path $ORIGEN 'menus\ruleta.png'
if (Test-Path $rutaRuleta) {
    $r = [Procesador]::RecortarRuleta($rutaRuleta,
            (Join-Path $DESTINO 'menus\ruleta-marco.png'), 640)
    $rp = $r -split '\|'
    # `plano`: ni gira con nadie ni recibe destello, asi que se ahorra la copia
    # espejada y la blanqueada que precachea recursos.js.
    #
    # `centroX`/`centroY`/`radio`/`radioCara` son la geometria del circulo YA EN
    # PIXELES del PNG generado. Van en el atlas y no como constantes en el JS a
    # proposito: la medida se tomo sobre el dibujo, asi que vive con el dibujo. Si
    # Sergio reexporta la ruleta a otro tamano, el juego no se entera.
    $atlas['ruletaMarco'] = [ordered]@{
        archivo='menus/ruleta-marco.png'; w=[int]$rp[0]; h=[int]$rp[1]
        anclaX=[int]$rp[2]; anclaY=[int]$rp[3]; frames=1; plano=$true
        centroX=[int]$rp[2]; centroY=[int]$rp[3]; radio=[int]$rp[4]; radioCara=[int]$rp[5]
    }
    Remove-Item (Join-Path $DESTINO 'menus\ruleta-disco.png') -ErrorAction SilentlyContinue
    "Ruleta recortada: $($rp[0])x$($rp[1])  centro ($($rp[2]),$($rp[3]))  radio $($rp[4])  cara $($rp[5])"
} else {
    "AVISO: no esta resources/menus/ruleta.png; la ventana del cofre saldra sin rueda."
}

# ---------------------------------------------------------------------------
# MUSICA
# ---------------------------------------------------------------------------
#
# Las dos canciones del nivel 1, mas la del menu. Los .mp3 que entrega Sergio
# vienen a ~185 kbps con la caratula incrustada (un JPEG dentro del propio
# fichero, que ffprobe ve como un segundo "stream" de video mjpeg); eso ni
# suena ni se ve en el juego, es peso muerto en cada partida que se carga.
#
# Si hay `ffmpeg` en el PATH se reencodea a 128 kbps -bitrate habitual para
# musica de fondo en bucle, cae un 30% y no se nota- y se descarta la
# caratula. Si no hay `ffmpeg`, se copia tal cual: es mejor una musica mas
# pesada que un pipeline que se rompe por no tener instalada una herramienta
# de terceros.
#
# El ORDEN de esta lista es el orden en que suenan, y de ahi vuelven a empezar.
# Lo lee sistemas/audio.js por las rutas de assets/musica/.
#
$MUSICA = @(
    @{ src='musica\Musica_emerita_1.mp3'; dst='musica\emerita-1.mp3' }
    @{ src='musica\Musica_emerita_2.mp3'; dst='musica\emerita-2.mp3' }
)

# Y aparte de esas dos van las SUELTAS: las de antes de jugar, que no se
# encadenan entre si porque cada una se repite sobre si misma hasta que el juego
# cambia de pantalla. Son dos y el corte entre ellas es la PORTADA de la intro,
# que es donde se ve por primera vez el titulo del juego:
#
#   intro.mp3  Ruinas de Menu, la de siempre. Suena desde que arranca el juego
#              -el logo y el relato del narrador, por debajo del cual se agacha
#              al 10%- y se acaba cuando aparece la portada.
#   menu.mp3   Music_main_title, el tema del titulo. Entra EN la portada y se
#              queda para elegir partida, el menu, la tienda y lo demas.
#
# La de Ruinas se busca por comodin y no por su nombre entero porque el fichero
# lleva tilde ("Ruinas de Menu.mp3") y este .ps1 se guarda en UTF-8 sin BOM:
# PowerShell 5.1 lo lee como ANSI y la tilde de un literal no sobreviviria a la
# comparacion.
$SUELTAS = @(
    @{ src='musica\Ruinas*.mp3';          dst='musica\intro.mp3' }
    @{ src='musica\Music_main_title.mp3'; dst='musica\menu.mp3'  }
)

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'musica') | Out-Null

# Copia o reencodea segun haya ffmpeg. Devuelve el ESTADO para la tabla; el
# fichero destino ya queda escrito en los dos casos.
function Resolver-Pista($rutaSrc, $rutaDst) {
    if ($ffmpeg) {
        & $ffmpeg.Source -y -v error -i $rutaSrc -map 0:a -map_metadata -1 `
            -id3v2_version 0 -codec:a libmp3lame -b:a 128k $rutaDst
        if ($LASTEXITCODE -eq 0) { return '128k' }
        # ffmpeg fallo (formato raro, etc.): mejor una copia que nada.
    }
    Copy-Item $rutaSrc $rutaDst -Force
    return 'COPIADA'
}

$informeMusica = @()
foreach ($m in $MUSICA) {
    $rutaSrc = Join-Path $ORIGEN $m.src
    $rutaDst = Join-Path $DESTINO $m.dst
    if (-not (Test-Path $rutaSrc)) {
        $informeMusica += [PSCustomObject]@{ Pista=$m.dst; Tamano='-'; Estado='NO EXISTE' }
        continue
    }
    $estado = Resolver-Pista $rutaSrc $rutaDst
    $informeMusica += [PSCustomObject]@{
        Pista  = $m.dst
        Tamano = "{0:N1} MB" -f ((Get-Item $rutaDst).Length / 1MB)
        Estado = $estado
    }
}
foreach ($m in $SUELTAS) {
    # -Path admite comodin; para un nombre entero devuelve ese fichero y ya.
    $rutaSrc = Get-ChildItem -Path (Join-Path $ORIGEN $m.src) -ErrorAction SilentlyContinue |
               Select-Object -First 1
    if (-not $rutaSrc) {
        $informeMusica += [PSCustomObject]@{ Pista=$m.dst; Tamano='-'; Estado='NO EXISTE' }
        continue
    }
    $rutaDst = Join-Path $DESTINO $m.dst
    $estado = Resolver-Pista $rutaSrc.FullName $rutaDst
    $informeMusica += [PSCustomObject]@{
        Pista  = $m.dst
        Tamano = "{0:N1} MB" -f ((Get-Item $rutaDst).Length / 1MB)
        Estado = $estado
    }
}
$informeMusica | Format-Table -AutoSize

# ---------------------------------------------------------------------------
# OPTIMIZACION: PNG A INDEXADO SIN PERDIDA
# ---------------------------------------------------------------------------
#
# Pasada final sobre TODO lo que se acaba de generar en enemigos/, efectos/,
# personajes/, objetos/, iconos/ y mascotas/: [Procesador]::Indexar reencodea
# a PNG de 8bpp con paleta propia cuando es matematicamente sin perdida (ver
# el comentario de la funcion) y deja el fichero tal cual en cualquier otro
# caso. No hace falta mantener una lista de que sprites cumplen -eso cambia
# cada vez que se dibuja algo nuevo-, se prueban todos y solo se tocan los
# que de verdad ganan sin arriesgar un pixel.
$carpetasIndexables = @('enemigos', 'efectos', 'personajes', 'objetos', 'iconos', 'mascotas')
$informeIndexado = @()
$ahorroIndexado = 0
foreach ($carpeta in $carpetasIndexables) {
    $ruta = Join-Path $DESTINO $carpeta
    if (-not (Test-Path $ruta)) { continue }
    Get-ChildItem -Path $ruta -Filter '*.png' -File | ForEach-Object {
        $antes = $_.Length
        $tmp = $_.FullName + '.tmp'
        $r = [Procesador]::Indexar($_.FullName, $tmp)
        if ($r -like 'OK|*') {
            $despues = (Get-Item $tmp).Length
            if ($despues -lt $antes) {
                Move-Item $tmp $_.FullName -Force
                $ahorroIndexado += ($antes - $despues)
                $informeIndexado += [PSCustomObject]@{
                    Fichero = "$carpeta\$($_.Name)"
                    Colores = $r.Split('|')[1]
                    Antes   = "{0:N0} KB" -f ($antes / 1KB)
                    Despues = "{0:N0} KB" -f ($despues / 1KB)
                }
            } else {
                # Paso raro pero posible en sprites minusculos: la paleta +
                # cabecera PNG pesa mas que los pocos bytes que ya tenia.
                Remove-Item $tmp -Force
            }
        } elseif (Test-Path $tmp) {
            Remove-Item $tmp -Force
        }
    }
}
if ($informeIndexado.Count -gt 0) {
    $informeIndexado | Format-Table -AutoSize
}
"{0} sprites pasados a indexado, {1:N1} MB ahorrados." -f $informeIndexado.Count, ($ahorroIndexado / 1MB)

# `version` es el SELLO ANTICACHE, y es la razon por la que existe este campo:
# el juego se sirve con `python -m http.server`, que no manda ninguna cabecera
# de caducidad, asi que el navegador aplica su heuristica y se queda con el PNG
# que ya tiene sin llegar a preguntar si hay uno nuevo. Resultado: se hornea un
# efecto, se recarga la pagina y se sigue viendo el dibujo viejo. Paso de
# verdad, con el aura del Aquila.
#
# core/recursos.js cuelga este sello de cada URL de imagen (`?v=...`), asi que
# despues de cada horneado las rutas son OTRAS y el navegador no tiene nada
# cacheado que reutilizar. Cuesta un campo en el JSON y quita para siempre el
# "recarga con Ctrl+Shift+R a ver si ahora si".
$sello = (Get-Date).ToString('yyyyMMddHHmmss')
$json = [ordered]@{ escalaArte = $ESCALA; version = $sello; entidades = $atlas } | ConvertTo-Json -Depth 5
# UTF-8 SIN BOM: Set-Content -Encoding utf8 lo añade en PowerShell 5.1 y deja un
# JSON que algunos parsers rechazan de plano.
[System.IO.File]::WriteAllText(
    (Join-Path $DESTINO 'atlas.json'), $json,
    (New-Object System.Text.UTF8Encoding $false))

"", "Atlas escrito en assets/atlas.json"
"FALLO/DUDOSO = apenas se quito fondo; requiere retoque manual."

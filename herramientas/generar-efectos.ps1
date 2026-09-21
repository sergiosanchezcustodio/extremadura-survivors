# ---------------------------------------------------------------------------
# generar-efectos.ps1 - Fabrica hojas de efectos POR CODIGO.
#
# Herramienta OFFLINE, como procesar-assets.ps1 y ver-assets.ps1: no forma
# parte del juego. Produce PNG planos y el motor solo consume su salida.
#
# POR QUE EXISTE. efectos-mapa.md dejo medido el hueco mas grande del juego
# -la explosion, 7 armas- y tambien por que no se pudo llenar recortando de
# las laminas de catalogo: "no existe ninguna secuencia en las laminas", y
# hornear la rampa de escala a mano era "el caso caro". De las cinco celdas de
# zona que se probaron recortadas no sobrevivio ninguna.
#
# Una secuencia, sin embargo, es ARITMETICA. Un fotograma de explosion es el
# mismo dibujo con el radio, la temperatura y el desgarro evaluados en otro
# instante. Generarla por codigo no es un apano por no tener al artista: es
# que aqui el codigo es el medio correcto, igual que el trazo por codigo gana
# a cualquier sprite en los proyectiles de 8 px.
#
# Lo que se gana frente a una lamina: la secuencia existe de verdad, el color
# es un parametro (cuatro explosiones distintas son cuatro paletas, no cuatro
# dibujos), es DETERMINISTA -misma semilla, mismo PNG byte a byte- y se puede
# reajustar mil veces sin coste.
#
# EL PIXEL SE DIBUJA A TAMANO LOGICO Y SE AMPLIA POR VECINO MAS PROXIMO. Es la
# decision que hace que esto sea pixel art y no una ilustracion suave: el
# juego corre a 480x270 con ESCALA_ARTE 4, asi que un pixel de arte son 4
# pixeles fisicos. Dibujando directo a 320 saldrian degradados finos que
# cantarian contra todo lo demas.
#
#   .\herramientas\generar-efectos.ps1
#   .\herramientas\generar-efectos.ps1 -Solo fuego
# ---------------------------------------------------------------------------
param(
    [string]$Solo = '',
    [string]$Destino = 'assets\efectos'
)

Add-Type -AssemblyName System.Drawing

# LOS ENSAMBLADOS QUE HAY QUE REFERENCIAR NO SON LOS MISMOS EN LAS DOS
# POWERSHELL, y por eso se eligen aqui en vez de escribirlos fijos.
#
#   - En PowerShell 7 (.NET Core) la familia "System.Drawing" esta partida:
#     Bitmap, BitmapData, PixelFormat, ImageLockMode e ImageFormat viven en
#     Common y en Primitives, asi que hay que nombrar los tres.
#   - En Windows PowerShell 5.1 (.NET Framework) esta todo junto en
#     System.Drawing, y System.Drawing.Common NO EXISTE: nombrarlo revienta la
#     compilacion entera con "no se puede encontrar el archivo de metadatos".
#
# Y eso es lo que pasaba: en esta maquina solo hay 5.1, asi que la herramienta
# no compilaba y no generaba un solo PNG. Lo llamativo es que NO se caia: seguia
# hasta el final y escribia la ficha del atlas con las medidas -que se calculan
# en PowerShell, no en C#-, asi que el atlas quedaba anunciando dibujos que no
# existian. Un efecto nuevo entraba en el atlas y no aparecia en el disco.
$ensamblados = if ($PSVersionTable.PSEdition -eq 'Core') {
    @('System.Drawing', 'System.Drawing.Common', 'System.Drawing.Primitives')
} else {
    @('System.Drawing')
}
Add-Type -ReferencedAssemblies $ensamblados -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;

public class Pirotecnia {

    // RNG propio y no System.Random, por el mismo motivo que el juego tiene su
    // core/rng.js: que la salida sea reproducible entre maquinas y versiones.
    // System.Random no garantiza la misma secuencia entre runtimes.
    class Az {
        uint s;
        public Az(uint semilla) { s = semilla == 0 ? 1u : semilla; }
        public uint U() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
        public double D() { return (U() & 0xFFFFFF) / 16777216.0; }
        public double R(double a, double b) { return a + (b - a) * D(); }
    }

    static int[] LeerPaleta(string txt) {
        string[] p = txt.Split(',');
        int[] c = new int[p.Length];
        for (int i = 0; i < p.Length; i++)
            c[i] = (int)uint.Parse(p[i].Trim(), NumberStyles.HexNumber);
        return c;
    }

    // Escribe en el buffer logico quedandose con lo MAS OPACO. No se mezcla
    // por alfa: el destino final es composicion aditiva en el juego, y ahi
    // mezclar aqui solo emborrona el escalon de paleta que da el aspecto.
    // CUIDADO: ESTO NO ES PINTAR ENCIMA, ES QUEDARSE CON EL MAS OPACO.
    //
    // Solo escribe si el alfa nuevo SUPERA al que ya habia. Es lo que quieren
    // las explosiones -donde se superponen decenas de chispas y manda la mas
    // brillante- y por eso esta asi.
    //
    // Pero convierte en trampa cualquier dibujo por capas: una segunda capa
    // OPACA sobre otra capa OPACA se descarta en silencio, porque 255 no supera
    // a 255. Le paso a la lampara de la mina, que se dibujaba despues del
    // cuerpo con alfa 1 y nunca llego al PNG — y no salto ninguna alarma porque
    // la comprobacion medía la variable del brillo, no los pixeles.
    //
    // Si una pieza va tapando a otra, hay que decidir el color ANTES y llamar
    // aqui UNA sola vez por pixel. Ver Mina.
    static void Poner(byte[] al, int[] rgb, int lado, int x, int y, int color, double a) {
        if (x < 0 || y < 0 || x >= lado || y >= lado) return;
        if (a <= 0) return;
        if (a > 1) a = 1;
        int i = y * lado + x;
        byte b = (byte)(a * 255.0 + 0.5);
        if (b <= al[i]) return;
        al[i] = b; rgb[i] = color;
    }

    // Devuelve una linea de medidas por fotograma para poder verificar la hoja
    // SIN abrirla: "opacos|radioBola" separados por ';'. Ver ver-assets.ps1 y la
    // regla de coste de contexto del CLAUDE.md.
    //
    // Y se mide el radio de LA BOLA, calculado, no el del pixel encendido mas
    // lejano. La primera version medio lo segundo y dio radio no monotono en
    // las cuatro explosiones: lo que estaba midiendo eran las CHISPAS, que
    // mueren cada una a su hora. Es la misma leccion que efectos-mapa.md ya
    // aprendio en su ronda 3 con la orla -medir lo que se puede contar no es
    // lo mismo que medir lo que importa- asi que la metrica mide ahora la
    // silueta del fuego, que es lo unico que tiene que crecer siempre.
    //
    // OJO: nada de acentos graves en este bloque. Va dentro de un here-string
    // de PowerShell, donde el acento grave es el caracter de escape: un
    // "radios" entre acentos graves se convirtio en un retorno de carro y
    // rompio la compilacion del C# con un error que senalaba a otra linea.
    //
    // El parametro margen es cuanto sobresale la celda del radio de dano.
    // Existe porque el desgarro de la silueta y las chispas se salen de la
    // bola, y sin holgura el cuadro se las comeria. El motor tiene que dibujar
    // la celda con medio lado = radioDeDano * margen; por eso viaja al atlas.
    //
    // TRES FAMILIAS, UN SOLO ALGORITMO. La explosion, la onda expansiva y el
    // reventon de tierra o veneno no son tres funciones: son esta con otros
    // numeros. Es el argumento entero de generar por codigo, y es lo que hace
    // que la tercera variante cueste una fila de tabla y no un dibujo.
    //
    //   explosion -> huecoIni 0, nucleo 1     : bola llena que se vacia al final
    //   onda      -> huecoIni alto, nucleo 1  : cascara desde el primer momento
    //   reventon  -> nucleo bajo, chispas     : poca bola y mucha metralla
    public static string Explosion(string salida, int radioDanyo, double margen,
                                   int nFrames, int escala,
                                   uint semilla, string paletaTxt, int nChispas,
                                   double huecoIni, double huecoMax,
                                   double rugosidad, double anillo,
                                   double nucleo, double chispaTam) {

        int[] pal = LeerPaleta(paletaTxt);
        int radioLog = (int)Math.Round(radioDanyo * margen);   // medio lado de la celda
        int lado = radioLog * 2;
        Az az = new Az(semilla);

        // ARMONICOS DE LA SILUETA, fijos para toda la explosion. Que sean fijos
        // es lo que hace que los fotogramas sean LA MISMA bola creciendo y no
        // ocho manchas distintas: si el desgarro cambiara de forma cada
        // fotograma, la animacion herviria en vez de expandirse.
        int[] arm = new int[3]; double[] amp = new double[3]; double[] fase = new double[3];
        for (int k = 0; k < 3; k++) {
            arm[k] = 3 + k * 2;                    // 3, 5, 7 lobulos
            amp[k] = az.R(0.05, 0.13) / (k + 1);   // los altos, mas suaves
            fase[k] = az.R(0, Math.PI * 2);
        }

        // CHISPAS. Se sortean una vez y se evaluan en cada instante, que es lo
        // mismo que hace el motor con las particulas: la trayectoria es una
        // funcion del tiempo, no un estado que se acumula.
        double[] cAng = new double[nChispas], cVel = new double[nChispas];
        double[] cIni = new double[nChispas], cFin = new double[nChispas];
        int[] cTam = new int[nChispas];
        for (int k = 0; k < nChispas; k++) {
            cAng[k] = az.R(0, Math.PI * 2);
            cVel[k] = az.R(0.55, 1.15);
            cIni[k] = az.R(0.0, 0.22);
            cFin[k] = az.R(0.55, 1.0);
            cTam[k] = (int)Math.Round((az.D() < 0.72 ? 1 : 2) * chispaTam);
            if (cTam[k] < 1) cTam[k] = 1;
        }

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];

        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];   // BGRA, que es como lo quiere 32bppArgb
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            // DOS VARIABLES, NO UNA, y es la correccion mas importante de esta
            // herramienta.
            //
            //   p = progreso de RADIO, repartido lineal entre los fotogramas
            //   t = tiempo real correspondiente a ese radio, o sea p*p
            //
            // El motivo. zonaDanyo.js abre el radio de una onda con
            // radioIni + (radio - radioIni)*sqrt(t), y sqrt es empinadisima al
            // principio: repartiendo los fotogramas lineal en el TIEMPO, el
            // primero cubria de golpe el 26% del radio y el dibujo se quedaba
            // muy por detras de lo que ya estaba matando. Medido: 26,2% del
            // radio de desfase en t=0,095, igual en las siete armas.
            //
            // Repartiendo lineal en el RADIO, cada fotograma vale un escalon
            // igual de radio, que es lo que el ojo sigue, y el tiempo se apreta
            // solo al principio -que es justo como revienta una explosion-.
            // El motor elige fotograma por radio, no por reloj: ver dibujarAire.
            // EL REPARTO DE FOTOGRAMAS: media de lineal en el radio y
            // geometrico. Con la tabla de radios en el atlas el desfase contra
            // el radio de dano es CERO se reparta como se reparta, asi que el
            // reparto solo decide dos cosas, y estan en conflicto:
            //
            //   - cuanto tiene que ampliar el motor la celda (deforma el pixel)
            //   - cuanta vida se come un solo fotograma (congela la animacion)
            //
            // El lineal da escalones enormes EN PROPORCION en la parte pequena
            // -del 0,15 al 0,24 hay un +63%- y ampliaba el pixel. El geometrico
            // los iguala en proporcion pero amontona los fotogramas al
            // principio y deja el ultimo cubriendo el 40% de la vida, o sea la
            // explosion congelada al final. Medido con las dos leyes a 10, 14 y
            // 18 fotogramas, la media a 18 es el mejor punto: amplia 1,106x
            // como mucho y ningun fotograma pasa del 16% de la vida.
            double p = nFrames == 1 ? 1 : (double)f / (nFrames - 1);
            double rn = 0.5 * (0.15 + 0.85 * p) + 0.5 * (0.15 * Math.Pow(1.0 / 0.15, p));
            double R = radioDanyo * rn;

            // El TIEMPO que le corresponde a ese radio, invirtiendo la curva de
            // zonaDanyo.actualizar: rn = 0.15 + 0.85*sqrt(t). De aqui salen la
            // temperatura, el hueco y las chispas, que van con el reloj y no
            // con el tamano.
            double q = (rn - 0.15) / 0.85;
            double t = q * q;
            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            // El hueco central: a partir de media vida la bola se vacia y pasa
            // a ser cascara. Es lo que separa una explosion de un globo que
            // crece, y es tambien lo que deja ver lo que hay debajo justo
            // cuando el jugador necesita volver a leer el campo.
            // El hueco va de huecoIni a huecoMax. Una explosion empieza llena
            // (huecoIni 0) y se vacia pasada media vida; una onda expansiva
            // nace ya siendo cascara, porque eso es una onda.
            double h = huecoIni + (huecoMax - huecoIni) * Math.Max(0, (t - 0.40) / 0.60);
            if (h > 0.97) h = 0.97;

            // El desvanecido va por p y NO baja hasta cero. Con la primera
            // version el ultimo fotograma caia en desvanecido nulo y la celda
            // salia VACIA (se vio en la ocupacion, que daba 0). La hoja tiene
            // que acabar en un fotograma que todavia se vea -a poco mas de un
            // tercio de su brillo- y es el motor quien remata el apagado, igual
            // que hace el tajo de la Katana en sistemas/armas.js.
            double fadeG = p < 0.72 ? 1.0 : 1.0 - 0.62 * ((p - 0.72) / 0.28);

            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d > R * 1.35) continue;
                    double ang = Math.Atan2(dy, dx);

                    double def = 0;
                    for (int k = 0; k < 3; k++) def += amp[k] * Math.Sin(arm[k] * ang + fase[k]);
                    // El desgarro CRECE con la vida: al nacer es una bola casi
                    // limpia y al disiparse esta rota. Al reves se leeria como
                    // que se recompone.
                    double Rq = R * (1 + def * rugosidad * (0.35 + 0.65 * t));
                    if (d > Rq) continue;

                    double u = d / Rq;
                    if (u < h) continue;
                    double v = (u - h) / (1 - h);
                    if (v < 0) v = 0;
                    if (v > 1) v = 1;

                    // TEMPERATURA. Cae hacia fuera (el nucleo es lo mas
                    // caliente) y cae con la vida (todo se enfria). El maximo
                    // esta en el borde del hueco, no en el centro geometrico:
                    // cuando la bola es cascara, lo caliente es la cascara.
                    double temp = (1 - v) * (1 - 0.68 * t);
                    int idx = (int)((1 - temp) * pal.Length);
                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;

                    Poner(alfa, rgb, lado, x, y, pal[idx], nucleo * fadeG * (0.58 + 0.42 * (1 - v)));
                }
            }

            // ONDA DE CHOQUE: un aro fino por delante del fuego, solo al
            // principio. Es lo que da el golpe seco; sin el, la explosion
            // empieza como una flor que se abre.
            if (anillo > 0 && t < 0.62) {
                double Rs = radioDanyo * (0.34 + 0.66 * Math.Sqrt(t));
                double gr = 0.9 + 1.5 * (1 - t);
                double aA = anillo * (1 - t / 0.62) * fadeG;
                for (int y = 0; y < lado; y++) {
                    for (int x = 0; x < lado; x++) {
                        double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                        double d = Math.Sqrt(dx * dx + dy * dy);
                        if (Math.Abs(d - Rs) > gr) continue;
                        Poner(alfa, rgb, lado, x, y, pal[0], aA);
                    }
                }
            }

            // CHISPAS, encima de todo.
            for (int k = 0; k < nChispas; k++) {
                if (t < cIni[k] || t > cFin[k]) continue;
                double tt = (t - cIni[k]) / (cFin[k] - cIni[k]);
                double pr = radioDanyo * (0.12 + cVel[k] * 0.98 * Math.Pow(tt, 0.55));
                int cx = (int)(radioLog + Math.Cos(cAng[k]) * pr);
                int cy = (int)(radioLog + Math.Sin(cAng[k]) * pr);
                double aC = (1 - tt) * fadeG;
                int col = pal[tt < 0.5 ? 0 : Math.Min(2, pal.Length - 1)];
                for (int oy = 0; oy < cTam[k]; oy++)
                    for (int ox = 0; ox < cTam[k]; ox++)
                        Poner(alfa, rgb, lado, cx + ox, cy + oy, col, aC);
            }

            // AMPLIACION POR BLOQUES. Cada pixel logico se escribe como un
            // cuadrado de escala x escala. Es exactamente lo que hace el juego
            // con imageSmoothingEnabled=false, hecho aqui de una vez para que
            // el blit del caso base salga 1:1.
            int opacos = 0; long masa = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    byte a = alfa[y * lado + x];
                    if (a == 0) continue;
                    opacos++; masa += a;
                    int c = rgb[y * lado + x];
                    byte rr = (byte)((c >> 16) & 255), gg = (byte)((c >> 8) & 255), bb = (byte)(c & 255);
                    int bx = f * lado * escala + x * escala, by = y * escala;
                    for (int oy = 0; oy < escala; oy++) {
                        int fila = (by + oy) * stride + bx * 4;
                        for (int ox = 0; ox < escala; ox++) {
                            int o = fila + ox * 4;
                            buf[o] = bb; buf[o + 1] = gg; buf[o + 2] = rr; buf[o + 3] = a;
                        }
                    }
                }
            }

            // El radio de la bola se CALCULA barriendo la silueta, no se saca
            // del pixel encendido mas lejano: ver el comentario de la firma.
            double rBola = 0;
            for (int s = 0; s < 720; s++) {
                double ang = s * Math.PI / 360.0;
                double def = 0;
                for (int k = 0; k < 3; k++) def += amp[k] * Math.Sin(arm[k] * ang + fase[k]);
                double Rq = R * (1 + def * rugosidad * (0.35 + 0.65 * t));
                if (Rq > rBola) rBola = Rq;
            }
            medidas += (f > 0 ? ";" : "") + opacos
                     + "|" + rBola.ToString("0.0", CultureInfo.InvariantCulture)
                     + "|" + (masa / 255);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // CHARCOS. Otra familia, y esta si es otro algoritmo.
    //
    // Un charco no se parece a una explosion en nada de lo que importa:
    //
    //   - NO CRECE. El radio es fijo, asi que la animacion no es una rampa de
    //     escala sino un hervor: manchas que se mueven por dentro.
    //   - SE REPITE. Dura de 2,6 a 5 segundos y la tira son 18 fotogramas, o
    //     sea que tiene que poder darse en bucle SIN COSTURA. Por eso todo lo
    //     que se mueve va con sin/cos de una fase que da la vuelta entera en la
    //     tira: el fotograma 18 es identico al 0 por construccion.
    //   - VA EN COMPOSICION NORMAL, no aditiva. Una mancha en el suelo TAPA el
    //     suelo; sumar luz es lo que hace un fuego. Y por eso su paleta SI
    //     lleva tonos oscuros, al reves que las de arriba.
    //   - LLENA SU CIRCULO. La zona de dano es el circulo entero, asi que si la
    //     mancha no llega al borde queda suelo limpio DENTRO de lo que quema y
    //     el jugador lee que ahi esta a salvo. Fue el defecto medido que hundio
    //     el intento anterior de calcomanias (cobertura del 45%, ver
    //     efectos-mapa.md): aqui el borde se genera entre 0,93 y 1,0 del radio
    //     por construccion, no se recorta de un dibujo que ya venia como venia.
    public static string Charco(string salida, int radioDanyo, double margen,
                                int nFrames, int escala,
                                uint semilla, string paletaTxt,
                                double rugosidad, double hervor, int nBurbujas) {

        int[] pal = LeerPaleta(paletaTxt);
        int radioLog = (int)Math.Round(radioDanyo * margen);
        int lado = radioLog * 2;
        Az az = new Az(semilla);

        // Borde: armonicos fijos, amplitud PEQUENA. El charco tiene que llegar
        // al aro; un borde muy roto deja calvas de suelo dentro de la zona.
        int[] arm = new int[3]; double[] amp = new double[3]; double[] fase = new double[3];
        for (int k = 0; k < 3; k++) {
            arm[k] = 3 + k * 2;
            amp[k] = az.R(0.02, 0.05) / (k + 1);
            fase[k] = az.R(0, Math.PI * 2);
        }

        // Burbujas: cada una es una onda plana con su direccion, su frecuencia
        // y su sentido de giro. Sumadas dan un campo que hierve sin repetirse a
        // ojo, y como todas dan una vuelta entera en la tira, el bucle cierra.
        double[] bAng = new double[nBurbujas], bFrec = new double[nBurbujas];
        double[] bFase = new double[nBurbujas]; double[] bDir = new double[nBurbujas];
        for (int k = 0; k < nBurbujas; k++) {
            bAng[k] = az.R(0, Math.PI * 2);
            bFrec[k] = az.R(0.18, 0.55);
            bFase[k] = az.R(0, Math.PI * 2);
            bDir[k] = az.D() < 0.5 ? -1 : 1;
        }

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            double giro = 2 * Math.PI * f / nFrames;    // vuelta entera = bucle
            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            int dentro = 0, cubiertos = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d <= radioDanyo) dentro++;         // pixel del aro de dano
                    double ang = Math.Atan2(dy, dx);

                    double def = 0;
                    for (int k = 0; k < 3; k++) def += amp[k] * Math.Sin(arm[k] * ang + fase[k]);
                    // VALOR ABSOLUTO: el borde se deforma solo HACIA AFUERA.
                    // Con el seno a pelo, los lobulos negativos metian el filo
                    // por dentro del radio de dano y dejaban una una de suelo
                    // limpio que quema igual — el defecto exacto que retiro las
                    // cinco calcomanias anteriores, que llegaron a cubrir un
                    // 45%. Asi la cobertura es del 100% por construccion y lo
                    // unico que hace la irregularidad es sobresalir, que no
                    // engaña a nadie.
                    double Rq = radioDanyo * (1 + Math.Abs(def) * rugosidad);
                    if (d > Rq) continue;
                    if (d <= radioDanyo) cubiertos++;

                    double u = d / Rq;

                    // El campo de hervor, en coordenadas del mundo del charco.
                    double campo = 0;
                    for (int k = 0; k < nBurbujas; k++) {
                        double px = dx * Math.Cos(bAng[k]) + dy * Math.Sin(bAng[k]);
                        campo += Math.Sin(px * bFrec[k] + bFase[k] + giro * bDir[k]);
                    }
                    campo /= nBurbujas;

                    // Tono: el hervor lo mueve y el borde lo oscurece. Que el
                    // filo sea MAS OSCURO que el relleno es lo que da contorno
                    // sin dibujarlo — y es justo la metrica que el intento
                    // anterior tuvo que aprender a medir (filo vs interior).
                    double temp = 0.58 + hervor * campo - 0.42 * u * u;
                    int idx = (int)((1 - temp) * pal.Length);
                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;
                    Poner(alfa, rgb, lado, x, y, pal[idx], 1.0);
                }
            }

            Ampliar(buf, stride, alfa, rgb, lado, escala, f);
            // COBERTURA DEL ARO en tanto por ciento: cuantos pixeles del circulo
            // de dano tienen mancha encima. Es LA medida de este efecto.
            medidas += (f > 0 ? ";" : "") + (dentro > 0 ? (100 * cubiertos / dentro) : 0);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // TAJOS. El barrido de un arma cuerpo a cuerpo.
    //
    // Es la tercera familia y tampoco sale de las anteriores: no es un circulo
    // que crece ni una mancha que hierve, es un FILO QUE RECORRE UN ARCO. Lo
    // que anima no es el radio sino el angulo.
    //
    // CONVENIO DE ENCUADRE, y hay que respetarlo porque el motor ya lo da por
    // hecho (ver dibujarTajos en sistemas/armas.js): medio lado de la celda =
    // ALCANCE del arma, y el barrido apunta al angulo 0, o sea a la derecha.
    // El motor dibuja con medio lado = t.alcance y gira la celda con la
    // direccion del golpe, asi que el filo del dibujo cae exactamente donde
    // acaba el dano. Es el mismo convenio con el que se horneo la Katana.
    //
    // semi es la MITAD de la apertura del arma en radianes: el Gladius abre
    // 90 grados, o sea semi = 45. Cada arma tiene la suya, asi que aqui hay una
    // hoja por arma y no una compartida.
    public static string Tajo(string salida, int alcance, double semi,
                              int nFrames, int escala,
                              uint semilla, string paletaTxt,
                              double grosor, double estela, string forma = "") {

        int[] pal = LeerPaleta(paletaTxt);
        int radioLog = alcance;                 // medio lado = alcance, sin margen
        int lado = radioLog * 2;
        Az az = new Az(semilla);

        // Dentado del filo: rompe un poco el arco para que no sea una cinta
        // perfecta. Muy suave, porque un barrido tiene que leerse como UN gesto.
        double[] amp = new double[2]; double[] fs = new double[2];
        for (int k = 0; k < 2; k++) { amp[k] = az.R(0.03, 0.08); fs[k] = az.R(0, Math.PI * 2); }

        double estelaRad = estela * 2 * semi;   // cuanto rastro deja por detras

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            double p = nFrames == 1 ? 1 : (double)f / (nFrames - 1);
            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            // EL FILO NACE YA DENTRO DEL ARCO, con un trozo de estela hecho.
            //
            // La primera version lo hacia arrancar en -semi menos la estela
            // entera, o sea completamente fuera de la apertura. Como todo lo
            // que cae fuera del arco se recorta -el dibujo no puede dar a
            // entender que se golpea donde no se golpea- los primeros
            // fotogramas salian VACIOS: entre cinco y ocho de dieciocho en las
            // seis armas. En el juego eso es un golpe que parpadea y no aparece
            // hasta media animacion.
            //
            // Ahora entra con un 30% de estela ya dentro y termina sacando la
            // cola por el otro lado, que es como se ve un mandoble: cuando lo
            // percibes ya ha empezado.
            // Y NO TERMINA DE SALIR. Sacando la cola entera, el ultimo
            // fotograma quedaba vacio otra vez —mismo fallo que tuvieron las
            // explosiones— y el tajo se cortaba en seco. Acaba con parte de la
            // estela todavia dentro del arco y es el motor quien la apaga.
            double aFilo = -semi + 0.30 * estelaRad + p * (2 * semi + 0.25 * estelaRad);
            // Se apaga al final, que es cuando el gesto ya ha pasado.
            double fade = p < 0.72 ? 1.0 : 1.0 - 0.72 * ((p - 0.72) / 0.28);

            int opacos = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d > alcance) continue;             // nada fuera del alcance
                    double ang = Math.Atan2(dy, dx);

                    // Cuanto queda ESTE pixel por detras del filo. Normalizado
                    // a [-PI, PI] porque el arco puede cruzar el corte de atan2.
                    double atras = aFilo - ang;
                    while (atras > Math.PI) atras -= 2 * Math.PI;
                    while (atras < -Math.PI) atras += 2 * Math.PI;
                    if (atras < 0 || atras > estelaRad) continue;
                    // Y nunca fuera de la apertura del arma: el dibujo no puede
                    // dar a entender que se golpea donde no se golpea.
                    if (ang < -semi || ang > semi) continue;

                    double q = estelaRad > 0 ? atras / estelaRad : 0;   // 0 filo, 1 cola

                    // SILUETA POR ARMA. Sin esto todo tajo es la MISMA cuna
                    // barrida con otro color -medido a ojo: Hacha y Maza salian
                    // practicamente el mismo dibujo. `angT` es DONDE dentro del
                    // GOLPE cae este pixel (0 al empezar el arco, 1 al acabar) y
                    // `dT` es DONDE dentro del ALCANCE, del pivote (0) a la
                    // punta (1) -- son los dos ejes con los que se esculpe una
                    // silueta sin tocar el resto del algoritmo.
                    double angT = (ang + semi) / (2 * semi);
                    double dT = d / alcance;
                    double wMul = 1.0, dentMul = 1.0, bend = 0.0;

                    if (forma == "hacha") {
                        // Se nota mas pesada segun avanza el golpe -filo que
                        // CRECE, no una cinta uniforme- y el filo mellado, no
                        // ondulado: el doble de dentado de lo normal.
                        wMul = 0.55 + 0.75 * angT;
                        dentMul = 2.4;
                    } else if (forma == "maza") {
                        // Una bola pesada viajando por EL CENTRO del arco:
                        // delgada al entrar y al salir, gorda a mitad de
                        // camino. Lisa -una maza no tiene filo que mellar.
                        wMul = 0.5 + 1.15 * Math.Sin(Math.PI * angT);
                        dentMul = 0.15;
                    } else if (forma == "latigo") {
                        // Serpentea a lo largo del alcance en vez de trazar un
                        // radio recto: el chasquido de una correa, no una
                        // aguja. Suave -la banda ya es finisima (grosor 0.16)
                        // y un `dent` grande la cierra del todo en fotogramas
                        // con poca cola.
                        bend = 0.045 * Math.Sin(dT * Math.PI * 2.6);
                    } else if (forma == "guadanya") {
                        // Astil fino y GANCHO en el ultimo tercio: la hoja
                        // curva vive del 68% del alcance en adelante, lo de
                        // antes es solo el paso del asta.
                        wMul = dT > 0.68 ? 0.55 + 2.0 * ((dT - 0.68) / 0.32) : 0.35;
                    }

                    // La banda es mas gruesa en el filo y se adelgaza hacia la
                    // cola: es lo que lo lee como un gesto y no como un sector.
                    double w = grosor * Math.Pow(1 - q, 0.55) * wMul;
                    if (w > 0.92) w = 0.92;             // nunca cierra el hueco entero
                    double dent = bend;
                    for (int k = 0; k < 2; k++) dent += amp[k] * dentMul * Math.Sin((3 + k * 4) * ang + fs[k]);
                    double rIn = alcance * (1 - w) * (1 + dent);
                    if (d < rIn) continue;

                    double u = (alcance - d) / Math.Max(1e-6, alcance - rIn);  // 0 filo exterior
                    double temp = (1 - q) * (1 - 0.45 * u);
                    int idx = (int)((1 - temp) * pal.Length);
                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;

                    Poner(alfa, rgb, lado, x, y, pal[idx], fade * Math.Pow(1 - q, 0.7));
                    opacos++;
                }
            }

            Ampliar(buf, stride, alfa, rgb, lado, escala, f);
            medidas += (f > 0 ? ";" : "") + opacos + "|" + aFilo.ToString("0.000", CultureInfo.InvariantCulture);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // MINA. Un objeto, no un efecto, y por eso rompe con todo lo de arriba:
    // tiene tamano FIJO -no crece con el nivel del arma- va en composicion
    // normal y es opaca. Lo unico que anima es la luz roja del centro, que
    // late en bucle: es lo que dice que sigue armada.
    //
    // Vista cenital, como todo el juego: un disco de metal con su reborde, sus
    // remaches y el detonador en medio. Es la mina clasica de tablero, la que
    // se lee de un vistazo a treinta pixeles.
    public static string Mina(string salida, int radio, int nFrames, int escala,
                              uint semilla, string paletaTxt, string paletaLuz,
                              int remaches) {

        int[] pal = LeerPaleta(paletaTxt);      // cuerpo, de claro a oscuro
        int[] luz = LeerPaleta(paletaLuz);      // la lampara, de blanco a rojo
        int lado = radio * 2;
        Az az = new Az(semilla);

        double faseRemache = az.R(0, Math.PI * 2);

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            // Una vuelta entera en la tira: el bucle cierra por construccion,
            // igual que en los charcos.
            double giro = 2 * Math.PI * f / nFrames;
            // El parpadeo NO es un seno suave: es un destello corto y una
            // espera larga, que es como parpadea un piloto de verdad. Con un
            // seno parecia que respiraba.
            double ciclo = 0.5 + 0.5 * Math.Sin(giro);
            double brillo = Math.Pow(ciclo, 3.0);

            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            int opacos = 0, rojos = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radio, dy = y + 0.5 - radio;
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d > radio - 0.5) continue;
                    double u = d / radio;                 // 0 centro, 1 canto
                    double ang = Math.Atan2(dy, dx);

                    int idx;
                    if (u > 0.82) {
                        // REBORDE, el tono mas oscuro. Da el canto sin dibujar
                        // una linea: el contorno es un cambio de material.
                        idx = pal.Length - 1;
                    } else {
                        // Cuerpo con luz cenital desde arriba-izquierda. Es lo
                        // unico que lo lee como un domo y no como un disco.
                        double lz = 0.5 - 0.5 * (dx * 0.7071 + dy * 0.7071) / radio;
                        idx = (int)((1 - lz) * (pal.Length - 1));
                        // Remaches: ocho bultos claros repartidos por el aro.
                        double rr = 0.66;
                        double sep = 2 * Math.PI / remaches;
                        double resto = ((ang - faseRemache) % sep + sep) % sep;
                        double dAng = Math.Min(resto, sep - resto);
                        if (Math.Abs(u - rr) < 0.10 && dAng * rr * radio < 1.6 * (radio / 16.0)) idx = 0;
                    }
                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;
                    int color = pal[idx];

                    // EL DETONADOR, la luz roja del centro. Su color sale del
                    // brillo del instante: apagado es rojo oscuro, encendido es
                    // casi blanco.
                    //
                    // SE DECIDE AQUI, ANTES DE PINTAR, y no con un segundo
                    // Poner encima. Con dos llamadas opacas la segunda se
                    // descartaba entera -ver el comentario de Poner- y la mina
                    // llevaba desde que existe sin lampara: cero pixeles rojos
                    // en el PNG, medido.
                    // LA CUARTA PARTE DE GRANDE que antes: de 0,30 del radio
                    // a 0,075. Estaba puesta a ojo cuando la lampara no llegaba
                    // siquiera al PNG, y una vez visible resulto ser un ojo de
                    // buey — se comia el centro de la chapa entera. Una mina es
                    // un objeto con un piloto, no un piloto con una carcasa.
                    if (u < 0.075) {
                        int li = (int)((1 - brillo) * (luz.Length - 1));
                        if (li < 0) li = 0;
                        if (li >= luz.Length) li = luz.Length - 1;
                        color = luz[li];
                        rojos++;
                    }

                    Poner(alfa, rgb, lado, x, y, color, 1.0);
                    opacos++;
                }
            }

            Ampliar(buf, stride, alfa, rgb, lado, escala, f);
            // Se devuelve el numero de pixeles de LAMPARA de este fotograma
            // ademas del brillo. La comprobacion de antes miraba solo el brillo,
            // que es la intencion; con los pixeles se comprueba el resultado,
            // que es lo que fallaba.
            medidas += (f > 0 ? ";" : "") + opacos + "|" +
                       brillo.ToString("0.000", CultureInfo.InvariantCulture) + "|" + rojos;
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // Cada pixel logico como un cuadrado de escala x escala en la tira.
    // AURA SUELTA: un resplandor radial que se apaga hacia afuera, sin nada
    // dentro. Se dibuja DETRAS de otra cosa —hoy, los escudos del Testudo— para
    // encenderla sin tener que rehornear su hoja.
    //
    // Existe como pieza aparte justo por eso: el Testudo comparte el escudo con
    // el Scutum, asi que un aura horneada en el PNG la llevarian los dos y la
    // evolucion dejaria de distinguirse de su arma base.
    //
    // Igual que el halo de la luna, se hace con ALFA y no con color: lo que lo
    // convierte en resplandor es volverse transparente, no oscurecerse. La caida
    // va al cuadrado porque lineal deja un canto visible donde termina.
    public static string Aura(string salida, int radio, int escala,
                              int color, double fuerza, double nucleo) {
        int lado = radio * 2;
        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];

        int pixeles = 0;
        double suma = 0;
        for (int y = 0; y < lado; y++) {
            for (int x = 0; x < lado; x++) {
                double dx = x + 0.5 - radio, dy = y + 0.5 - radio;
                double d = Math.Sqrt(dx * dx + dy * dy) / radio;
                if (d > 1) continue;
                // Meseta plana en el centro y caida al cuadrado a partir de ahi:
                // sin meseta, el aura tiene un pico en un solo pixel y lo que se
                // ve es un punto, no un resplandor.
                double u = d < nucleo ? 0 : (d - nucleo) / (1 - nucleo);
                double a = (1 - u) * (1 - u) * fuerza;
                if (a < 0.02) continue;
                Poner(alfa, rgb, lado, x, y, color, a);
                pixeles++;
                suma += a;
            }
        }

        Ampliar(buf, stride, alfa, rgb, lado, escala, 0);
        Volcar(salida, buf, anchoTira, altoTira, stride);
        double medio = pixeles > 0 ? suma / pixeles : 0;
        return pixeles + "|" + medio.ToString("0.000", CultureInfo.InvariantCulture);
    }

    // --- Proyectiles con dibujo propio -----------------------------------
    //
    // Celdas RECTANGULARES, al contrario que todo lo demas del generador: una
    // abeja es mas larga que alta, y cuadrarla obligaria a dejar media celda
    // vacia. No es solo desperdicio: el motor ancla estos dibujos por su borde
    // izquierdo, asi que el aire de sobra descoloca ese anclaje.
    //
    // De ahi PonerR y AmpliarR, los mismos de siempre pero con ancho y alto por
    // separado. No se tocan los cuadrados, para no mover lo que ya funciona.
    // Mismo criterio -y misma trampa- que Poner: ver el comentario de alli.
    static void PonerR(byte[] al, int[] rgb, int ancho, int alto, int x, int y, int color, double a) {
        if (x < 0 || y < 0 || x >= ancho || y >= alto) return;
        if (a <= 0) return;
        if (a > 1) a = 1;
        int i = y * ancho + x;
        byte b = (byte)(a * 255.0 + 0.5);
        if (b <= al[i]) return;
        al[i] = b;
        rgb[i] = color;
    }

    static void AmpliarR(byte[] buf, int stride, byte[] alfa, int[] rgb,
                         int ancho, int alto, int escala) {
        for (int y = 0; y < alto; y++) {
            for (int x = 0; x < ancho; x++) {
                byte a = alfa[y * ancho + x];
                if (a == 0) continue;
                int c = rgb[y * ancho + x];
                byte r = (byte)((c >> 16) & 0xFF), g = (byte)((c >> 8) & 0xFF), b = (byte)(c & 0xFF);
                for (int sy = 0; sy < escala; sy++) {
                    int fy = y * escala + sy;
                    for (int sx = 0; sx < escala; sx++) {
                        int fx = x * escala + sx;
                        int o = fy * stride + fx * 4;
                        buf[o] = (byte)(b * a / 255);
                        buf[o + 1] = (byte)(g * a / 255);
                        buf[o + 2] = (byte)(r * a / 255);
                        buf[o + 3] = a;
                    }
                }
            }
        }
    }

    // ABEJA. Para el Enjambre, que son avispas y salian dibujadas como un dardo.
    //
    // MIRA A LA IZQUIERDA, y no es capricho: el motor espeja el dibujo y lo
    // ancla por su borde izquierdo (ver entidades/proyectil.js), asi que la
    // cabeza dibujada a la izquierda acaba siendo la punta que va por delante y
    // el abdomen lo que arrastra. Mismo convenio que la bala de la pistola.
    public static string Abeja(string salida, int ancho, int alto, int escala,
                               string paletaTxt, int colorAla) {
        int[] pal = LeerPaleta(paletaTxt);
        byte[] alfa = new byte[ancho * alto];
        int[] rgb = new int[ancho * alto];
        int stride = ancho * escala * 4;
        byte[] buf = new byte[stride * alto * escala];

        // El cuerpo se aplana un poco y baja: las alas se dibujan antes que el
        // cuerpo, asi que todo lo que solape el ovalo queda tapado. Con el
        // cuerpo a 0,32 de medio alto no asomaba ni un pixel de ala y la abeja
        // salia siendo un abejorro rayado.
        double cyCuerpo = alto * 0.62;
        double cxCuerpo = ancho * 0.60, aCuerpo = ancho * 0.38, bCuerpo = alto * 0.26;
        double cxCabeza = ancho * 0.20, rCabeza = alto * 0.23;

        int pixeles = 0, pixAla = 0;
        for (int y = 0; y < alto; y++) {
            for (int x = 0; x < ancho; x++) {
                double px = x + 0.5, py = y + 0.5;

                // 1. ALAS, por detras del cuerpo y por arriba. Dos ovalos
                // palidos y translucidos: a este tamano no hay nervadura que
                // dibujar, lo que dice ala es que se transparente.
                for (int w = 0; w < 2; w++) {
                    double wx = ancho * (w == 0 ? 0.46 : 0.72);
                    double wy = alto * 0.24;
                    double ax = (px - wx) / (ancho * 0.17), ay = (py - wy) / (alto * 0.24);
                    if (ax * ax + ay * ay < 1) {
                        PonerR(alfa, rgb, ancho, alto, x, y, colorAla, 0.62);
                        pixAla++;
                    }
                }

                // 2. CUERPO: ovalo con bandas alternas por el eje largo. Es lo
                // unico que hace falta para que se lea abeja y no mosca.
                double ex = (px - cxCuerpo) / aCuerpo, ey = (py - cyCuerpo) / bCuerpo;
                if (ex * ex + ey * ey < 1) {
                    double u = (px - (cxCuerpo - aCuerpo)) / (2 * aCuerpo);
                    int banda = (int)(u * 5.0);
                    int idx = (banda % 2 == 0) ? 0 : pal.Length - 1;
                    if (ey > 0.5) idx = pal.Length - 1;   // filo de abajo en sombra
                    PonerR(alfa, rgb, ancho, alto, x, y, pal[idx], 1.0);
                    pixeles++;
                }

                // 3. CABEZA, oscura y redonda, en la punta.
                double hx = px - cxCabeza, hy = py - cyCuerpo;
                if (hx * hx + hy * hy < rCabeza * rCabeza) {
                    PonerR(alfa, rgb, ancho, alto, x, y, pal[pal.Length - 1], 1.0);
                    pixeles++;
                }

                // 4. AGUIJON: un pico oscuro por detras.
                if (px > ancho * 0.93 && Math.Abs(py - cyCuerpo) < 0.9) {
                    PonerR(alfa, rgb, ancho, alto, x, y, pal[pal.Length - 1], 1.0);
                    pixeles++;
                }
            }
        }

        AmpliarR(buf, stride, alfa, rgb, ancho, alto, escala);
        Volcar(salida, buf, ancho * escala, alto * escala, stride);
        return pixeles + "|" + pixAla;
    }

    // FLECHA. Para el Arco corto, que se dibujaba con el dardo trazado.
    //
    // Las tres piezas de siempre y ni una mas: punta, astil y plumas. A once
    // unidades de largo no cabe nada mas, y lo que hace que se lea flecha no es
    // el detalle sino la SILUETA — un triangulo delante, una linea, y algo que
    // se abre detras.
    //
    // Mira a la izquierda, como la abeja y la bala: el motor la espeja y la
    // ancla por ese borde, asi que la punta va por delante (ver
    // entidades/proyectil.js).
    public static string Flecha(string salida, int ancho, int alto, int escala,
                                string maderaTxt, string aceroTxt, int pluma) {
        int[] mad = LeerPaleta(maderaTxt);
        int[] ace = LeerPaleta(aceroTxt);
        byte[] alfa = new byte[ancho * alto];
        int[] rgb = new int[ancho * alto];
        int stride = ancho * escala * 4;
        byte[] buf = new byte[stride * alto * escala];

        double cy = alto / 2.0;
        double xPunta = 0, xCuello = ancho * 0.26;      // la cabeza
        double xAstil = ancho * 0.94;                   // hasta donde llega la cana
        double xPluma = ancho * 0.66;                   // donde empiezan las plumas

        int pixPunta = 0, pixAstil = 0, pixPluma = 0;
        for (int y = 0; y < alto; y++) {
            for (int x = 0; x < ancho; x++) {
                double px = x + 0.5, py = y + 0.5;
                double dy = Math.Abs(py - cy);

                // 1. PLUMAS: dos triangulos que se abren hacia atras desde el
                // astil. Van primero porque el astil las cruza por el medio y
                // tiene que verse por encima.
                if (px >= xPluma && px <= ancho) {
                    double t = (px - xPluma) / (ancho - xPluma);
                    double abre = alto * 0.46 * t;
                    if (dy < abre && dy > 0.4) {
                        PonerR(alfa, rgb, ancho, alto, x, y, pluma, 1.0);
                        pixPluma++;
                    }
                }

                // 2. ASTIL: la cana, de la punta a la culata. Dos pixeles de
                // grueso con el de abajo mas oscuro, que es lo que le da
                // volumen de vara redonda.
                if (px >= xCuello * 0.6 && px <= xAstil && dy < 1.0) {
                    int idx = (py > cy) ? mad.Length - 1 : 0;
                    PonerR(alfa, rgb, ancho, alto, x, y, mad[idx], 1.0);
                    pixAstil++;
                }

                // 3. PUNTA: triangulo de acero que se abre del morro al cuello.
                if (px >= xPunta && px < xCuello) {
                    double t = (px - xPunta) / (xCuello - xPunta);
                    double abre = alto * 0.34 * t;
                    if (dy < abre + 0.5) {
                        // Filo claro arriba y sombra abajo: a esta escala es lo
                        // unico que separa el acero de la madera.
                        int idx = (py < cy) ? 0 : ace.Length - 1;
                        PonerR(alfa, rgb, ancho, alto, x, y, ace[idx], 1.0);
                        pixPunta++;
                    }
                }
            }
        }

        AmpliarR(buf, stride, alfa, rgb, ancho, alto, escala);
        Volcar(salida, buf, ancho * escala, alto * escala, stride);
        return pixPunta + "|" + pixAstil + "|" + pixPluma;
    }

    // ASTA: todo lo que es punta sobre palo. Cubre el pilum, la lanza y el
    // virote de ballista con los mismos cuatro tramos y otros numeros.
    //
    // Son tres armas distintas y una sola funcion porque lo que las separa NO
    // es el dibujo, son las PROPORCIONES: un pilum es una punta pequena sobre un
    // vastago de hierro largo y fino -esa cana blanda que se doblaba al clavarse
    // y dejaba el escudo enemigo inservible, que es la mitad de por que el pilum
    // es famoso-, una lanza es una hoja de laurel ancha sobre madera, y un
    // virote es un tocho corto con plumas. Con la silueta bien puesta se
    // distinguen a diez pixeles.
    //
    // Miran a la izquierda, como todos: el motor espeja y ancla por ese borde.
    public static string Asta(string salida, int ancho, int alto, int escala,
                              string maderaTxt, string aceroTxt, int pluma,
                              double fracPunta, double anchoPunta,
                              double fracVastago, double anchoAsta, double fracPluma) {
        int[] mad = LeerPaleta(maderaTxt);
        int[] ace = LeerPaleta(aceroTxt);
        byte[] alfa = new byte[ancho * alto];
        int[] rgb = new int[ancho * alto];
        int stride = ancho * escala * 4;
        byte[] buf = new byte[stride * alto * escala];

        double cy = alto / 2.0;
        double xPunta = ancho * fracPunta;
        double xVastago = ancho * fracVastago;      // 0 = no lleva
        double xPluma = ancho * (1 - fracPluma);
        double xCola = ancho * 0.97;

        int pixAcero = 0, pixMadera = 0, pixPluma = 0;
        for (int y = 0; y < alto; y++) {
            for (int x = 0; x < ancho; x++) {
                double px = x + 0.5, py = y + 0.5;
                double dy = Math.Abs(py - cy);

                // 1. PLUMAS, si las lleva. Primero, para que el asta las cruce.
                if (fracPluma > 0 && px >= xPluma) {
                    double t = (px - xPluma) / (ancho - xPluma);
                    double abre = alto * 0.44 * t;
                    if (dy < abre && dy > 0.4) {
                        PonerR(alfa, rgb, ancho, alto, x, y, pluma, 1.0);
                        pixPluma++;
                    }
                }

                // 2. ASTA de madera, del vastago (o de la punta) a la cola.
                double xIni = xVastago > 0 ? xVastago : xPunta;
                if (px >= xIni && px <= xCola && dy < alto * anchoAsta) {
                    int idx = (py > cy) ? mad.Length - 1 : 0;
                    PonerR(alfa, rgb, ancho, alto, x, y, mad[idx], 1.0);
                    pixMadera++;
                }

                // 3. VASTAGO: la cana de hierro del pilum, entre la punta y la
                // madera. Fina a proposito: es lo que lo distingue de una lanza.
                if (xVastago > 0 && px >= xPunta && px < xVastago && dy < 0.9) {
                    PonerR(alfa, rgb, ancho, alto, x, y, ace[0], 1.0);
                    pixAcero++;
                }

                // 4. PUNTA: triangulo de hierro que abre del morro al cuello.
                if (px < xPunta) {
                    double t = px / xPunta;
                    double abre = alto * anchoPunta * t;
                    if (dy < abre + 0.5) {
                        int idx = (py < cy) ? 0 : ace.Length - 1;
                        PonerR(alfa, rgb, ancho, alto, x, y, ace[idx], 1.0);
                        pixAcero++;
                    }
                }
            }
        }

        AmpliarR(buf, stride, alfa, rgb, ancho, alto, escala);
        Volcar(salida, buf, ancho * escala, alto * escala, stride);
        return pixAcero + "|" + pixMadera + "|" + pixPluma;
    }

    // TROZO: un pedazo irregular. Sirve para la metralla y para la piedra de la
    // honda, que son la misma cosa con otra rugosidad — un casco de hierro tiene
    // aristas y un canto de rio no.
    //
    // El contorno es una estrella: un radio por vertice y el borde interpolado
    // entre ellos. Al ser todos los radios desde el centro, la figura siempre
    // sale valida y el relleno se resuelve con una sola comparacion por pixel,
    // sin tener que probar dentro-fuera de un poligono cualquiera.
    public static string Trozo(string salida, int ancho, int alto, int escala,
                               uint semilla, string paletaTxt, int vertices,
                               double irregular) {
        int[] pal = LeerPaleta(paletaTxt);
        Az az = new Az(semilla);
        byte[] alfa = new byte[ancho * alto];
        int[] rgb = new int[ancho * alto];
        int stride = ancho * escala * 4;
        byte[] buf = new byte[stride * alto * escala];

        double cx = ancho / 2.0, cy = alto / 2.0;
        double rx = ancho * 0.46, ry = alto * 0.46;

        double[] radios = new double[vertices];
        for (int i = 0; i < vertices; i++) radios[i] = az.R(1 - irregular, 1 + irregular);

        int pixeles = 0;
        for (int y = 0; y < alto; y++) {
            for (int x = 0; x < ancho; x++) {
                double dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
                double d = Math.Sqrt(dx * dx + dy * dy);
                double ang = Math.Atan2(dy, dx);
                if (ang < 0) ang += Math.PI * 2;

                double paso = Math.PI * 2 / vertices;
                int v0 = (int)(ang / paso) % vertices;
                int v1 = (v0 + 1) % vertices;
                double t = (ang - v0 * paso) / paso;
                double rBorde = radios[v0] + (radios[v1] - radios[v0]) * t;
                if (d > rBorde) continue;

                // Luz cenital desde arriba-izquierda y canto oscuro. Es lo
                // mismo que la mina y la luna: a este tamano, lo que da volumen
                // es el degradado, y lo que separa la pieza del fondo es el filo.
                double u = d / rBorde;
                double lz = 0.5 - 0.5 * (dx * 0.7071 + dy * 0.7071) / Math.Max(rBorde, 0.001);
                int idx = (int)(lz * (pal.Length - 1));
                if (u > 0.80) idx = pal.Length - 1;
                if (idx < 0) idx = 0;
                if (idx >= pal.Length) idx = pal.Length - 1;
                PonerR(alfa, rgb, ancho, alto, x, y, pal[idx], 1.0);
                pixeles++;
            }
        }

        AmpliarR(buf, stride, alfa, rgb, ancho, alto, escala);
        Volcar(salida, buf, ancho * escala, alto * escala, stride);
        return pixeles.ToString();
    }

    // LENGUA DE FUEGO. Para el Lanzallamas, cuyos proyectiles eran balas
    // trazadas: un chorro de fuego hecho de puntitos redondos.
    //
    // Gota apuntando a la izquierda, con el nucleo claro en el eje. El color no
    // sale de la distancia al centro sino de la distancia AL EJE, que es lo que
    // hace que se lea como llama y no como bola: una llama es caliente por
    // dentro a todo lo largo, no solo en un punto.
    public static string Lengua(string salida, int ancho, int alto, int escala,
                                string paletaTxt) {
        int[] pal = LeerPaleta(paletaTxt);
        byte[] alfa = new byte[ancho * alto];
        int[] rgb = new int[ancho * alto];
        int stride = ancho * escala * 4;
        byte[] buf = new byte[stride * alto * escala];

        double cy = alto / 2.0;
        int pixeles = 0;
        for (int y = 0; y < alto; y++) {
            for (int x = 0; x < ancho; x++) {
                double px = x + 0.5, py = y + 0.5;
                double t = px / ancho;
                // Se abre deprisa desde la punta y se cierra despacio hacia la
                // cola: el exponente por debajo de uno es lo que adelanta el
                // punto mas ancho, y una llama es mas gorda por delante.
                double medio = alto * 0.48 * Math.Sin(Math.PI * Math.Pow(t, 0.62));
                double dy = Math.Abs(py - cy);
                if (medio < 0.4 || dy > medio) continue;

                int idx = (int)((dy / medio) * (pal.Length - 1));
                if (idx < 0) idx = 0;
                if (idx >= pal.Length) idx = pal.Length - 1;
                PonerR(alfa, rgb, ancho, alto, x, y, pal[idx], 1.0);
                pixeles++;
            }
        }

        AmpliarR(buf, stride, alfa, rgb, ancho, alto, escala);
        Volcar(salida, buf, ancho * escala, alto * escala, stride);
        return pixeles.ToString();
    }

    // ROSA DE LOS VIENTOS. Ocho puntas: cuatro largas a los rumbos cardinales y
    // cuatro cortas en las diagonales, que es LA figura — un cuatro puntas es
    // una estrella cualquiera, y lo que convierte una estrella en una rosa de
    // los vientos es precisamente la segunda serie mas corta.
    //
    // Y cada punta va partida en dos caras, una clara y otra oscura, por su
    // eje. Es como se han grabado siempre en las cartas de navegar y es lo que
    // le da relieve sin dibujar ni una sombra.
    //
    // El contorno sale de dos perfiles polares superpuestos, uno girado 45
    // grados respecto al otro, quedandose con el mayor de los dos en cada
    // angulo. Mismo truco que el shuriken, dos veces.
    public static string Rosa(string salida, int radio, int escala, string paletaTxt,
                              double afilado, double cuerpo, double corta) {
        int[] pal = LeerPaleta(paletaTxt);
        int lado = radio * 2;
        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];

        double octavo = Math.PI / 4;
        int pixeles = 0;
        for (int y = 0; y < lado; y++) {
            for (int x = 0; x < lado; x++) {
                double dx = x + 0.5 - radio, dy = y + 0.5 - radio;
                double d = Math.Sqrt(dx * dx + dy * dy);
                if (d < 0.0001) continue;
                double ang = Math.Atan2(dy, dx);

                double pLargo = Math.Pow(Math.Abs(Math.Cos(2 * ang)), afilado);
                double pCorto = Math.Pow(Math.Abs(Math.Cos(2 * (ang - octavo))), afilado);
                double rLargo = cuerpo + (1 - cuerpo) * pLargo;
                double rCorto = cuerpo + (corta - cuerpo) * pCorto;
                double rBorde = radio * Math.Max(rLargo, rCorto);
                if (d > rBorde - 0.5) continue;

                // A que punta pertenece este pixel y de que lado de su eje cae.
                // El lado decide la cara: una clara y otra en sombra.
                double rel = ang / octavo;
                double resto = rel - Math.Floor(rel);
                bool caraClara = resto < 0.5;

                int idx = caraClara ? 1 : pal.Length - 2;
                // Nucleo: un boton mas claro en el centro, que es donde se
                // juntan las ocho puntas y sin el queda un revoltijo.
                if (d < radio * cuerpo * 1.5) idx = 0;
                // Y el canto exterior al tono mas oscuro, para recortarse.
                if (d > rBorde - 1.2) idx = pal.Length - 1;

                if (idx < 0) idx = 0;
                if (idx >= pal.Length) idx = pal.Length - 1;
                Poner(alfa, rgb, lado, x, y, pal[idx], 1.0);
                pixeles++;
            }
        }

        Ampliar(buf, stride, alfa, rgb, lado, escala, 0);
        Volcar(salida, buf, anchoTira, altoTira, stride);
        double llenado = pixeles / (Math.PI * radio * radio);
        return pixeles + "|" + llenado.ToString("0.000", CultureInfo.InvariantCulture);
    }

    // KUNAI. Para la Lluvia de agujas, que eran puas trazadas.
    //
    // Tres piezas y la silueta lo dice todo: hoja de rombo alargado, mango
    // envuelto y anilla al final. La anilla es lo que separa un kunai de un
    // cuchillo cualquiera, asi que a este tamano se dibuja como un aro hueco
    // aunque cueste dos pixeles.
    //
    // Mira a la izquierda, como la flecha, la abeja y la bala.
    public static string Kunai(string salida, int ancho, int alto, int escala,
                               string aceroTxt, int mango, int anilla) {
        int[] ace = LeerPaleta(aceroTxt);
        byte[] alfa = new byte[ancho * alto];
        int[] rgb = new int[ancho * alto];
        int stride = ancho * escala * 4;
        byte[] buf = new byte[stride * alto * escala];

        double cy = alto / 2.0;
        double xHombro = ancho * 0.30;    // donde la hoja es mas ancha
        double xGuarda = ancho * 0.56;    // fin de la hoja
        double xMango = ancho * 0.86;     // fin del mango
        double rAnilla = alto * 0.30;
        double cxAnilla = ancho - rAnilla - 0.5;

        int pixHoja = 0, pixMango = 0, pixAnilla = 0;
        for (int y = 0; y < alto; y++) {
            for (int x = 0; x < ancho; x++) {
                double px = x + 0.5, py = y + 0.5;
                double dy = Math.Abs(py - cy);

                // 1. HOJA: rombo alargado. Se abre deprisa desde la punta y se
                // cierra despacio hacia la guarda, que es el perfil de hoja de
                // kunai y no el de un puñal recto.
                if (px < xGuarda) {
                    double ancho2;
                    if (px < xHombro) ancho2 = (px / xHombro) * alto * 0.42;
                    else ancho2 = (1 - (px - xHombro) / (xGuarda - xHombro)) * alto * 0.42 * 0.55
                                  + alto * 0.10;
                    if (dy < ancho2) {
                        // Filo claro arriba, sombra abajo, y una linea central
                        // mas clara que es el nervio de la hoja.
                        int idx = (py < cy) ? 0 : ace.Length - 1;
                        if (dy < 0.8) idx = 0;
                        PonerR(alfa, rgb, ancho, alto, x, y, ace[idx], 1.0);
                        pixHoja++;
                    }
                }

                // 2. MANGO: envuelto, mas fino que la hoja.
                if (px >= xGuarda && px < xMango && dy < alto * 0.17) {
                    PonerR(alfa, rgb, ancho, alto, x, y, mango, 1.0);
                    pixMango++;
                }

                // 3. ANILLA: aro hueco al final. Es la pieza que dice kunai.
                double da = Math.Sqrt((px - cxAnilla) * (px - cxAnilla) + (py - cy) * (py - cy));
                if (da < rAnilla && da > rAnilla * 0.42) {
                    PonerR(alfa, rgb, ancho, alto, x, y, anilla, 1.0);
                    pixAnilla++;
                }
            }
        }

        AmpliarR(buf, stride, alfa, rgb, ancho, alto, escala);
        Volcar(salida, buf, ancho * escala, alto * escala, stride);
        return pixHoja + "|" + pixMango + "|" + pixAnilla;
    }

    // COLUMNA ROMANA. Para la Columna doble, que dispara arriba y abajo.
    //
    // Se dibuja TUMBADA, con el capitel en el borde izquierdo, porque el motor
    // orienta estos sprites al rumbo del disparo y ancla por ese borde: al
    // salir hacia arriba la columna se pone de pie con el capitel por delante,
    // y hacia abajo lo mismo del reves. Ver entidades/proyectil.js.
    //
    // Las ESTRIAS van en bandas a lo largo del eje del fuste -o sea variando
    // con la y de la celda, ya que aqui la columna esta tumbada- y son lo unico
    // que la separa de un rodillo: una columna dorica sin acanaladuras es un
    // tubo.
    public static string Columna(string salida, int ancho, int alto, int escala,
                                 string marmolTxt, int estrias) {
        int[] mar = LeerPaleta(marmolTxt);
        byte[] alfa = new byte[ancho * alto];
        int[] rgb = new int[ancho * alto];
        int stride = ancho * escala * 4;
        byte[] buf = new byte[stride * alto * escala];

        double cy = alto / 2.0;
        double xAbaco = ancho * 0.09;      // la losa plana del capitel
        double xCapitel = ancho * 0.20;    // el resto del capitel
        double xFuste = ancho * 0.82;      // hasta donde llega el fuste
        double xBasa = ancho;              // y la basa cierra por atras

        int pixeles = 0;
        for (int y = 0; y < alto; y++) {
            for (int x = 0; x < ancho; x++) {
                double px = x + 0.5, py = y + 0.5;
                double dy = Math.Abs(py - cy);

                double medio;              // medio ancho de la pieza en este x
                bool esFuste = false;
                if (px < xAbaco) {
                    medio = alto * 0.50;                       // abaco, lo mas ancho
                } else if (px < xCapitel) {
                    // El equino: del abaco al fuste, cerrandose.
                    double t = (px - xAbaco) / (xCapitel - xAbaco);
                    medio = alto * (0.50 - 0.13 * t);
                } else if (px < xFuste) {
                    // FUSTE con entasis: se estrecha hacia el capitel, que es la
                    // curva que tienen las de verdad y lo que impide que parezca
                    // un tubo cortado.
                    double t = (px - xCapitel) / (xFuste - xCapitel);
                    medio = alto * (0.34 + 0.03 * t);
                    esFuste = true;
                } else {
                    double t = (px - xFuste) / (xBasa - xFuste);
                    medio = alto * (0.37 + 0.13 * t);          // basa
                }
                if (dy > medio - 0.5) continue;

                // Volumen cilindrico: claro arriba y oscuro abajo, con el borde
                // al tono mas oscuro para que se recorte.
                double u = (py - (cy - medio)) / (2 * medio);   // 0 arriba, 1 abajo
                int idx = (int)(Math.Abs(u - 0.34) * 2.1 * (mar.Length - 1));

                // ESTRIAS, solo en el fuste: bandas a lo largo del eje.
                if (esFuste && estrias > 0) {
                    double banda = u * estrias;
                    double resto = banda - Math.Floor(banda);
                    if (resto < 0.22) idx = Math.Min(mar.Length - 1, idx + 2);
                }

                if (dy > medio - 1.0) idx = mar.Length - 1;
                if (idx < 0) idx = 0;
                if (idx >= mar.Length) idx = mar.Length - 1;
                PonerR(alfa, rgb, ancho, alto, x, y, mar[idx], 1.0);
                pixeles++;
            }
        }

        AmpliarR(buf, stride, alfa, rgb, ancho, alto, escala);
        Volcar(salida, buf, ancho * escala, alto * escala, stride);
        return pixeles.ToString();
    }

    // SHURIKEN. Estrella de cuatro puntas con el ojo en medio.
    //
    // La silueta sale de una sola formula: el radio del borde en cada angulo es
    // el maximo por el coseno del doble del angulo, en valor absoluto y elevado
    // a un exponente. En las puntas -0, 90, 180 y 270 grados- vale uno y en los
    // valles cero, y el exponente decide si los flancos son rectos o comidos
    // hacia dentro, que es lo que da la silueta afilada.
    public static string Shuriken(string salida, int radio, int escala,
                                  string paletaTxt, double afilado, double hueco,
                                  double cuerpo) {
        int[] pal = LeerPaleta(paletaTxt);
        int lado = radio * 2;
        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];

        int pixeles = 0;
        for (int y = 0; y < lado; y++) {
            for (int x = 0; x < lado; x++) {
                double dx = x + 0.5 - radio, dy = y + 0.5 - radio;
                double d = Math.Sqrt(dx * dx + dy * dy);
                if (d < 0.0001) continue;
                double ang = Math.Atan2(dy, dx);

                double perfil = Math.Pow(Math.Abs(Math.Cos(2 * ang)), afilado);
                double rBorde = radio * (cuerpo + (1 - cuerpo) * perfil);
                if (d > rBorde - 0.5) continue;          // fuera de la estrella
                if (d < radio * hueco) continue;         // el ojo del centro

                // Acero: claro por el filo de las hojas y oscuro hacia el eje.
                // Y el canto exterior al tono mas oscuro, como la luna y la mina.
                double u = d / rBorde;
                int idx = (int)((1 - u) * (pal.Length - 1));
                if (u > 0.86 || d < radio * hueco * 1.4) idx = pal.Length - 1;
                if (idx < 0) idx = 0;
                if (idx >= pal.Length) idx = pal.Length - 1;
                Poner(alfa, rgb, lado, x, y, pal[idx], 1.0);
                pixeles++;
            }
        }

        Ampliar(buf, stride, alfa, rgb, lado, escala, 0);
        Volcar(salida, buf, anchoTira, altoTira, stride);
        double llenado = pixeles / (Math.PI * radio * radio);
        return pixeles + "|" + llenado.ToString("0.000", CultureInfo.InvariantCulture);
    }

    // COCTEL MOLOTOV: botellin de cerveza con el trapo ardiendo en la boca.
    //
    // La primera version salio leyendose como una vela: cuerpo estrecho, cuello
    // corto y una llama encima. Un botellin tiene proporciones muy concretas y
    // son ellas las que lo hacen reconocible de un vistazo — cuello LARGO y
    // fino, hombro que se abre de golpe, cuerpo recto y ancho, y una etiqueta
    // cruzada por el medio. Sin la etiqueta sigue pareciendo un frasco.
    //
    // Celda CUADRADA aunque la botella no lo sea, y aqui si hace falta: este
    // proyectil gira sobre si mismo, y en una celda rectangular las esquinas se
    // saldrian del cuadro al rotar. La botella se dibuja de pie en el centro.
    public static string Molotov(string salida, int lado, int escala,
                                 string vidrioTxt, string fuegoTxt, int trapo,
                                 int etiqueta) {
        int[] vid = LeerPaleta(vidrioTxt);
        int[] fue = LeerPaleta(fuegoTxt);
        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int stride = lado * escala * 4;
        byte[] buf = new byte[stride * lado * escala];

        double cx = lado / 2.0;
        // Reparto vertical de un botellin. Los numeros son fracciones de la
        // celda y estan puestos a ojo de botella real, no repartidos por igual.
        // El trapo empieza mas abajo de lo que parece razonable, y es para dejar
        // sitio a la LLAMA: con el reparto anterior salian ocho pixeles de fuego
        // y desde lejos el proyectil era una botella a secas. Lo que tiene que
        // leerse de un molotov en vuelo es que va ardiendo.
        double yTrapo = lado * 0.26, yCuello = lado * 0.34;
        double yHombro = lado * 0.54, yCuerpo = lado * 0.66;
        double yFondo = lado * 0.94;
        double anchoCuerpo = lado * 0.34, anchoCuello = lado * 0.10;
        double yEtiqueta0 = lado * 0.73, yEtiqueta1 = lado * 0.86;

        int pixVidrio = 0, pixFuego = 0, pixEtiqueta = 0;
        for (int y = 0; y < lado; y++) {
            for (int x = 0; x < lado; x++) {
                double px = x + 0.5, py = y + 0.5;
                double dxc = Math.Abs(px - cx);

                // LLAMA: una gota que se estrecha hacia arriba. Va primero y por
                // debajo, para que el trapo la tape donde se tocan.
                if (py < yTrapo) {
                    double t = py / yTrapo;
                    double anchoLlama = lado * 0.135 * Math.Sin(t * Math.PI * 0.95);
                    if (anchoLlama > 0.4 && dxc < anchoLlama) {
                        int idx = (int)((dxc / anchoLlama) * (fue.Length - 1));
                        if (idx < 0) idx = 0;
                        if (idx >= fue.Length) idx = fue.Length - 1;
                        PonerR(alfa, rgb, lado, lado, x, y, fue[idx], 1.0);
                        pixFuego++;
                    }
                }

                // TRAPO: el tapon de tela metido en el gollete, asomando por
                // fuera. Mas ancho que el cuello, que es lo que dice que esta
                // metido a presion.
                if (py >= yTrapo && py < yCuello && dxc < anchoCuello * 1.9) {
                    PonerR(alfa, rgb, lado, lado, x, y, trapo, 1.0);
                    pixVidrio++;
                }

                // CUELLO, largo y fino. Es la pieza que hace que se lea botellin
                // y no frasco, asi que se lleva casi un cuarto de la altura.
                if (py >= yCuello && py < yHombro && dxc < anchoCuello) {
                    int idx = (int)((dxc / anchoCuello) * (vid.Length - 1));
                    if (idx >= vid.Length) idx = vid.Length - 1;
                    PonerR(alfa, rgb, lado, lado, x, y, vid[idx], 1.0);
                    pixVidrio++;
                }

                // HOMBRO: del cuello al cuerpo, abriendo con una raiz para que
                // sea curva y no chaflan.
                // CUERPO: recto hasta el fondo.
                if (py >= yHombro && py <= yFondo) {
                    double w;
                    if (py < yCuerpo) {
                        double t = (py - yHombro) / (yCuerpo - yHombro);
                        w = anchoCuello + (anchoCuerpo - anchoCuello) * Math.Sqrt(t);
                    } else {
                        w = anchoCuerpo;
                    }
                    if (dxc < w) {
                        // Vidrio verde: brillo vertical a la izquierda y sombra
                        // a la derecha. Es lo que lo lee como cristal.
                        double u = (px - (cx - w)) / (2 * w);
                        int idx = (int)(Math.Abs(u - 0.30) * 2.4 * (vid.Length - 1));
                        if (idx < 0) idx = 0;
                        if (idx >= vid.Length) idx = vid.Length - 1;
                        // Contorno oscuro, para recortarse contra el suelo.
                        if (dxc > w - 1.0 || py > yFondo - 1.0) idx = vid.Length - 1;
                        int color = vid[idx];

                        // ETIQUETA: banda clara cruzada por el medio del cuerpo,
                        // con el mismo brillo a la izquierda. Es el detalle que
                        // convierte un frasco verde en una cerveza.
                        if (py >= yEtiqueta0 && py <= yEtiqueta1 && dxc < w - 0.8) {
                            color = etiqueta;
                            pixEtiqueta++;
                        }
                        PonerR(alfa, rgb, lado, lado, x, y, color, 1.0);
                        pixVidrio++;
                    }
                }
            }
        }

        AmpliarR(buf, stride, alfa, rgb, lado, lado, escala);
        Volcar(salida, buf, lado * escala, lado * escala, stride);
        return pixVidrio + "|" + pixFuego + "|" + pixEtiqueta;
    }

    // OJO AL BACKTICK: en este bloque no puede haber ni uno. El C# viaja dentro
    // de una cadena de PowerShell, que trata el backtick como escape (el de la
    // letra r es un retorno de carro), asi que un comentario que cite un
    // identificador entre backticks se parte en dos y el fichero deja de
    // compilar. Ya paso una vez.
    //
    // RED DE PESCA. Para el Rete, que es literalmente eso -una red de gladiador
    // retiarius- y venia usando el charco de zarzas por no tener la suya.
    //
    // Es una malla de rombos: dos familias de rectas paralelas cruzadas a 45
    // grados, con un nudo en cada cruce, recortada en circulo. Se dibuja
    // MIDIENDO DISTANCIA A LA RECTA en vez de trazando lineas, que es lo que la
    // deja con el grosor exacto que se pida y sin escalones: para cada pixel se
    // mira lo cerca que esta del cordel mas proximo de cada familia.
    //
    // No hierve ni se anima: una red esta quieta. Un solo fotograma.
    public static string Red(string salida, int radioDanyo, double margen, int escala,
                             uint semilla, string paletaTxt, double paso,
                             double grosor, double nudo) {

        int[] pal = LeerPaleta(paletaTxt);
        int radioLog = (int)Math.Round(radioDanyo * margen);
        int lado = radioLog * 2;
        // El radio de DANO, que es hasta donde llega la malla. Lo de fuera es
        // el margen que se reserva para que los flecos no se corten rectos.
        double rDanyo = radioDanyo;
        Az az = new Az(semilla);

        // Giro global de la malla, sorteado: dos redes seguidas en el suelo no
        // pueden salir alineadas al pixel.
        double giro = az.R(0, Math.PI / 2);
        double cg = Math.Cos(giro), sg = Math.Sin(giro);

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];

        double pasoPx = paso * radioDanyo;      // separacion entre cordeles
        int cubiertos = 0, dentro = 0;

        for (int y = 0; y < lado; y++) {
            for (int x = 0; x < lado; x++) {
                double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                double d = Math.Sqrt(dx * dx + dy * dy);
                if (d > rDanyo) continue;               // fuera de la zona
                dentro++;

                // Coordenadas en el sistema de la malla, ya girada.
                double u = dx * cg - dy * sg;
                double v = dx * sg + dy * cg;

                // Distancia al cordel mas cercano de cada familia. El resto de
                // la division dice cuanto se ha pasado del ultimo cordel; el
                // minimo con paso - resto da la distancia al de al lado.
                double ru = ((u % pasoPx) + pasoPx) % pasoPx;
                double rv = ((v % pasoPx) + pasoPx) % pasoPx;
                double du = Math.Min(ru, pasoPx - ru);
                double dv = Math.Min(rv, pasoPx - rv);
                double dCordel = Math.Min(du, dv);

                // Grosor del cordel, en fraccion del PASO de la malla y no del
                // radio. Atado al radio, la primera version salio con cordeles
                // de 9,6 px sobre huecos de 20,8 y la medicion canto: 69% de
                // ocupacion, o sea un disco con agujeritos en vez de una red.
                // Atado al paso, la proporcion cordel/hueco es la misma se
                // hornee al tamano que se hornee.
                double g = grosor * pasoPx;
                if (dCordel > g) continue;               // hueco de la malla

                // NUDO: donde se cruzan los dos cordeles, un bulto mas claro y
                // mas gordo. Es lo que lo lee como red anudada y no como una
                // rejilla dibujada.
                bool esNudo = du < g * nudo && dv < g * nudo;

                // El cordel va mas claro por el centro y oscuro por el filo,
                // que es lo que le da volumen de cuerda.
                double t = dCordel / g;                  // 0 centro, 1 canto
                int idx = (int)(t * (pal.Length - 1));
                if (esNudo) idx = 0;
                // Y la red se deshilacha por el borde de la zona: los cordeles
                // de fuera se apagan en vez de cortarse en redondo.
                double desvanece = 1.0;
                if (d > rDanyo * 0.86) desvanece = 1.0 - (d - rDanyo * 0.86) / (rDanyo * 0.14);
                if (desvanece <= 0.05) continue;
                if (idx < 0) idx = 0;
                if (idx >= pal.Length) idx = pal.Length - 1;

                Poner(alfa, rgb, lado, x, y, pal[idx], desvanece);
                cubiertos++;
            }
        }

        Ampliar(buf, stride, alfa, rgb, lado, escala, 0);
        Volcar(salida, buf, anchoTira, altoTira, stride);
        // Lo medible de una red: que la malla ocupe una fraccion razonable del
        // aro. Toda llena seria un disco; muy vacia no se veria.
        double ocupa = dentro > 0 ? (double)cubiertos / dentro : 0;
        return cubiertos + "|" + dentro + "|" +
               ocupa.ToString("0.000", CultureInfo.InvariantCulture);
    }

    // LUNA CON SUS FASES. Para los Satelites.
    //
    // Una tira de nFases fotogramas que recorre el ciclo lunar entero: luna
    // nueva, creciente, cuarto creciente, gibosa, llena, y de vuelta por el otro
    // lado hasta la menguante. El motor elige el fotograma por la posicion de
    // cada luna en su orbita (ver dibujarOrbitales en sistemas/armas.js), asi
    // que una vuelta al jugador es un ciclo lunar completo.
    //
    // LA GEOMETRIA DE UNA FASE es una circunferencia y una ELIPSE, no dos
    // circunferencias. El terminador —la linea que separa el dia de la noche—
    // es un circulo visto en escorzo, y en escorzo un circulo es una elipse: por
    // eso el borde interior de una luna creciente es curvo y no recto, y por eso
    // el cuarto creciente si tiene el borde recto (la elipse vista de canto).
    //
    // Con el radio R, la fase p de 0 a 1 y a = cos(2*pi*p):
    //
    //   p <= 0,5 (creciendo)  iluminado donde  x >  a * raiz(R2 - y2)
    //   p >  0,5 (menguando)  iluminado donde  x < -a * raiz(R2 - y2)
    //
    // Se comprueba solo: p=0 da a=1 y no ilumina nada (luna nueva), p=0,5 da
    // a=-1 e ilumina el disco entero (llena), y p=0,25 da a=0, o sea la mitad
    // derecha (cuarto creciente).
    //
    // LA CARA OSCURA NO SE BORRA, SE OSCURECE. Una luna nueva de verdad es
    // invisible, y aqui la luna es un ESCUDO QUE HACE DANO: si desaparece un
    // cuarto de cada vuelta, el jugador pierde de vista donde esta protegido.
    // Se pinta con la parte baja de la paleta —la sombra que ya tenia el
    // canto— asi que se ve el disco entero y la fase se lee por contraste, que
    // es como se ve una luna real con luz cenicienta.
    public static string Luna(string salida, int radio, int escala, uint semilla,
                              string paletaTxt, double fraccion, int aura,
                              double fuerzaAura, int crateres, int nFases) {

        int[] pal = LeerPaleta(paletaTxt);
        int lado = radio * 2;
        Az az = new Az(semilla);

        double rLuna = radio * fraccion;

        // Mares y crateres: sorteados UNA vez y compartidos por todas las fases.
        // Es la misma luna en momentos distintos, asi que sus manchas no pueden
        // moverse de un fotograma a otro.
        double[] cx = new double[crateres], cy = new double[crateres], cr = new double[crateres];
        for (int i = 0; i < crateres; i++) {
            double ang = az.R(0, Math.PI * 2);
            double dist = az.R(0.10, 0.62) * rLuna;
            cx[i] = radio + Math.Cos(ang) * dist;
            cy[i] = radio + Math.Sin(ang) * dist;
            cr[i] = az.R(0.10, 0.22) * rLuna;
        }

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala * nFases, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];
        string medidas = "";

        for (int f = 0; f < nFases; f++) {
            double p = (double)f / nFases;
            double a = Math.Cos(2 * Math.PI * p);
            bool creciendo = p <= 0.5;

            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            int iluminados = 0, disco = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radio, dy = y + 0.5 - radio;
                    double d = Math.Sqrt(dx * dx + dy * dy);

                    // 1. EL AURA, por debajo y en todas las fases: es lo que
                    // mantiene visible el satelite cuando la luna esta nueva.
                    if (d <= radio - 0.5 && d > rLuna * 0.80) {
                        double u = (d - rLuna * 0.80) / (radio - rLuna * 0.80);
                        if (u < 0) u = 0;
                        if (u > 1) u = 1;
                        double av = (1 - u) * (1 - u) * fuerzaAura;
                        if (av > 0.02) Poner(alfa, rgb, lado, x, y, aura, av);
                    }

                    // 2. EL DISCO.
                    if (d > rLuna - 0.5) continue;
                    disco++;
                    double u2 = d / rLuna;

                    // ¿De dia o de noche en este punto? El terminador es la
                    // elipse de arriba.
                    double borde = a * Math.Sqrt(Math.Max(0, rLuna * rLuna - dy * dy));
                    bool iluminado = creciendo ? (dx > borde) : (dx < -borde);

                    int idx;
                    if (iluminado) {
                        // Luz cenital MUY suave: la cara iluminada de una luna
                        // se ve de frente al sol y casi no tiene sombra propia.
                        double lz = 0.5 - 0.5 * (dx * 0.7071 + dy * 0.7071) / rLuna;
                        idx = (int)(lz * (pal.Length - 2) * 0.75);
                        iluminados++;
                    } else {
                        // CARA EN SOMBRA, DEL MISMO TONO QUE EL CANTO.
                        //
                        // Llevaba el penultimo de la paleta y el canto el
                        // ultimo, asi que la parte oscura tenia dentro un
                        // segundo borde mas oscuro todavia — dos fronteras en
                        // una pieza que solo tiene una. Con el mismo tono, la
                        // sombra y el canto se funden por ese lado y el filo
                        // solo se ve donde hace falta: contra la cara iluminada.
                        idx = pal.Length - 1;
                    }

                    // CANTO DE UN PIXEL. Era una banda del 12% del radio, unos
                    // cinco pixeles de origen, y a tamano de juego se comia el
                    // disco por fuera: la luna parecia una moneda con reborde en
                    // vez de una esfera. Un pixel basta para recortarla contra
                    // el suelo, que es para lo unico que esta.
                    if (d > rLuna - 1.5) idx = pal.Length - 1;

                    // Los crateres solo se ven donde da la luz, como en la luna
                    // de verdad: en la parte oscura no hay relieve que mirar.
                    if (iluminado) {
                        for (int i = 0; i < crateres; i++) {
                            double dc = Math.Sqrt((x + 0.5 - cx[i]) * (x + 0.5 - cx[i]) +
                                                  (y + 0.5 - cy[i]) * (y + 0.5 - cy[i]));
                            if (dc < cr[i] && u2 < 0.86) { idx = Math.Min(pal.Length - 1, idx + 2); break; }
                        }
                    }

                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;
                    Poner(alfa, rgb, lado, x, y, pal[idx], 1.0);
                }
            }

            Ampliar(buf, stride, alfa, rgb, lado, escala, f);
            double frac = disco > 0 ? (double)iluminados / disco : 0;
            medidas += (f > 0 ? ";" : "") + frac.ToString("0.000", CultureInfo.InvariantCulture);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // SISMO. Otra familia y otro algoritmo, y no una fila mas de Explosion.
    //
    // El Sismo del jugador salia con reventonTierra, que es CASCOTES: chispas
    // gordas y una bola rota, pensada para el golpe de la roca del ciclope.
    // Sergio lo quiere de otra manera: ondas sismicas que se abren desde el
    // centro, una detras de otra, en tonos tierra y SIN SALTOS, ni de color ni
    // de fotograma. De ahi tres decisiones que lo separan de todo lo de arriba:
    //
    //   - EL COLOR SE INTERPOLA, no se escalona. Las explosiones eligen un
    //     tono de la paleta por umbral, que es lo que les da el aspecto de
    //     pixel art; aqui cada pixel mezcla entre dos tonos vecinos de una
    //     rampa de ocho, asi que un anillo va del ocre claro al pardo sin que
    //     se vea donde cambia.
    //   - LAS CAPAS SE COMPONEN ENCIMA (over), no con el mas opaco. Poner()
    //     se queda con el pixel mas opaco y eso es correcto para chispas, pero
    //     un anillo que pasa por encima de una grieta tiene que mezclarse con
    //     ella, no borrarla ni ser borrado.
    //   - EL DOBLE DE FOTOGRAMAS. El motor elige el fotograma por radio y con
    //     doce el salto entre uno y el siguiente se veia en un circulo de
    //     media pantalla; con veinticuatro cada salto es la mitad.
    //
    // Que hay en cada fotograma, de fuera adentro: un halo de polvo claro por
    // delante del frente; el frente mismo, que es el anillo mas claro y mas
    // ancho; nOndas anillos mas por detras, cada uno un poco mas oscuro y mas
    // fino, que son las ondas que ya han pasado; un relleno tenue de tierra
    // removida; y nGrietas grietas radiales que se abren con el tiempo. Todo
    // se mueve con el frente -las ondas van a fracciones fijas del radio-, asi
    // que la animacion es LA MISMA figura creciendo, igual que en Explosion.
    //
    // La silueta lleva tres armonicos de amplitud pequena, fijos para toda la
    // hoja: un sismo no es un circulo de compas, pero tampoco una explosion
    // rota. Composicion NORMAL en el motor (aditivo=false en la ficha): es
    // tierra, tapa.
    static int ColorEn(int[] pal, double u) {
        if (u < 0) u = 0; if (u > 1) u = 1;
        double s = u * (pal.Length - 1);
        int i = (int)Math.Floor(s); if (i >= pal.Length - 1) i = pal.Length - 2;
        double t = s - i;
        int a = pal[i], b = pal[i + 1];
        int r = (int)Math.Round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
        int g = (int)Math.Round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
        int bl = (int)Math.Round((a & 255) * (1 - t) + (b & 255) * t);
        return (r << 16) | (g << 8) | bl;
    }

    static void Encima(double[] cr, double[] cg, double[] cb, double[] ca, int i, int color, double a) {
        if (a <= 0) return; if (a > 1) a = 1;
        double r = ((color >> 16) & 255) / 255.0, g = ((color >> 8) & 255) / 255.0, b = (color & 255) / 255.0;
        double na = a + ca[i] * (1 - a);
        if (na <= 0) return;
        cr[i] = (r * a + cr[i] * ca[i] * (1 - a)) / na;
        cg[i] = (g * a + cg[i] * ca[i] * (1 - a)) / na;
        cb[i] = (b * a + cb[i] * ca[i] * (1 - a)) / na;
        ca[i] = na;
    }

    public static string Sismo(string salida, int radioDanyo, double margen,
                               int nFrames, int escala, uint semilla,
                               string paletaTxt, int nOndas, int nGrietas) {
        int[] pal = LeerPaleta(paletaTxt);
        int radioLog = (int)Math.Round(radioDanyo * margen);
        int lado = radioLog * 2;
        Az az = new Az(semilla);

        int[] arm = new int[3]; double[] amp = new double[3]; double[] fase = new double[3];
        for (int k = 0; k < 3; k++) {
            arm[k] = 3 + k * 2;
            amp[k] = az.R(0.02, 0.05) / (k + 1);
            fase[k] = az.R(0, Math.PI * 2);
        }
        // Las grietas: angulo de salida, hasta donde llegan, y tres armonicos
        // de culebreo cada una, fijos para toda la hoja.
        double[] gAng = new double[nGrietas], gLen = new double[nGrietas];
        double[,] gAmp = new double[nGrietas, 3], gFas = new double[nGrietas, 3];
        for (int g = 0; g < nGrietas; g++) {
            gAng[g] = (g + az.R(0.15, 0.85)) * Math.PI * 2 / nGrietas;
            gLen[g] = az.R(0.55, 0.92);
            for (int k = 0; k < 3; k++) { gAmp[g, k] = az.R(0.015, 0.045) / (k + 1); gFas[g, k] = az.R(0, Math.PI * 2); }
        }

        int n = lado * lado;
        double[] cr = new double[n], cg = new double[n], cb = new double[n], ca = new double[n];
        byte[] alfa = new byte[n]; int[] rgb = new int[n];
        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            double p = nFrames > 1 ? (double)f / (nFrames - 1) : 1;
            // El mismo reparto de radios que la ficha escribe en el atlas.
            double rn = 0.5 * (0.15 + 0.85 * p) + 0.5 * (0.15 * Math.Pow(1.0 / 0.15, p));
            double R = radioDanyo * rn;
            Array.Clear(ca, 0, n);
            // Se apaga al final SUAVEMENTE y desde dentro: lo ultimo que se ve
            // es el frente, que es lo ultimo que mata.
            double fin = p > 0.7 ? 0.12 + 0.88 * (1 - p) / 0.3 : 1;

            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                    double dist = Math.Sqrt(dx * dx + dy * dy);
                    double ang = Math.Atan2(dy, dx);
                    double def = 0;
                    for (int k = 0; k < 3; k++) def += amp[k] * Math.Sin(arm[k] * ang + fase[k]);
                    double Rq = R * (1 + def);
                    if (Rq < 1) Rq = 1;
                    double q = dist / Rq;              // 1 = el frente
                    if (q > 1.16) continue;
                    int i = y * lado + x;

                    // Relleno: tierra removida, mas cargada hacia el centro y
                    // que se va asentando con el tiempo.
                    if (q < 1) {
                        double aF = 0.14 * Math.Pow(1 - q, 0.6) * (1 - 0.55 * p) * fin;
                        Encima(cr, cg, cb, ca, i, ColorEn(pal, 0.62 + 0.2 * q), aF);
                    }

                    // Grietas: se abren con el tiempo (alfa que sube con p) y
                    // solo hasta donde ya ha pasado el frente.
                    if (q < 0.97 && dist > 2) {
                        double abre = Math.Min(1, p * 1.5) * fin;
                        for (int g = 0; g < nGrietas; g++) {
                            if (q > gLen[g]) continue;
                            double da = ang - gAng[g];
                            while (da > Math.PI) da -= Math.PI * 2;
                            while (da < -Math.PI) da += Math.PI * 2;
                            double curva = 0;
                            for (int k = 0; k < 3; k++) curva += gAmp[g, k] * Math.Sin((k + 1) * 5.0 * q + gFas[g, k]);
                            // distancia perpendicular a la grieta, en pixeles
                            double perp = Math.Abs(da - curva) * dist;
                            double grosor = 1.1 + 1.2 * (1 - q / gLen[g]);
                            if (perp > grosor + 1.5) continue;
                            double aG = perp < grosor ? 1 : 1 - (perp - grosor) / 1.5;
                            // se estrecha y se desvanece hacia la punta
                            aG *= abre * 0.85 * (1 - Math.Pow(q / gLen[g], 3));
                            Encima(cr, cg, cb, ca, i, ColorEn(pal, 0.93 - 0.1 * q), aG);
                        }
                    }

                    // Las ondas que ya han pasado, de dentro afuera: cada una
                    // un poco mas oscura y mas fina que la siguiente.
                    for (int k = nOndas; k >= 1; k--) {
                        double qk = 1 - k * 0.17;
                        if (qk <= 0.05) continue;
                        double w = 0.05 + 0.01 * k;
                        double dq = (q - qk) / w;
                        if (dq > 3 || dq < -3) continue;
                        double I = Math.Exp(-dq * dq);
                        double aK = I * (0.95 - 0.08 * k) * (1 - 0.25 * p) * fin;
                        // color: se oscurece hacia dentro y con el tiempo
                        double u = 0.36 + 0.16 * k + 0.1 * p;
                        Encima(cr, cg, cb, ca, i, ColorEn(pal, u), aK);
                    }

                    // El frente: el anillo mas claro y mas ancho, con el borde
                    // exterior mas duro que el interior.
                    {
                        double w = q < 1 ? 0.07 : 0.035;
                        double dq = (q - 1) / w;
                        if (dq < 3 && dq > -3) {
                            double I = Math.Exp(-dq * dq);
                            double aFr = I * 0.95 * fin * (1 - 0.15 * p);
                            Encima(cr, cg, cb, ca, i, ColorEn(pal, 0.1 + 0.15 * p), aFr);
                        }
                    }

                    // Polvo por delante del frente: un halo claro que se
                    // difumina hacia fuera.
                    if (q > 1) {
                        double aH = (1 - (q - 1) / 0.16) * 0.38 * fin * (1 - 0.3 * p);
                        Encima(cr, cg, cb, ca, i, ColorEn(pal, 0.02), aH);
                    }
                }
            }

            int opacos = 0;
            for (int i = 0; i < n; i++) {
                double a = ca[i];
                if (a <= 0.004) { alfa[i] = 0; rgb[i] = 0; continue; }
                // Cuantizado a 32 niveles por canal y 64 de alfa: sin esto la
                // tira pesaba 2,8 MB por tener cien mil colores distintos, y a
                // estos tonos el escalon de 8 no se ve.
                alfa[i] = (byte)(((int)Math.Round(Math.Min(1, a) * 255)) & ~3);
                if (alfa[i] == 0) alfa[i] = 4;
                int r = ((int)Math.Round(cr[i] * 255)) & ~7, g = ((int)Math.Round(cg[i] * 255)) & ~7, b = ((int)Math.Round(cb[i] * 255)) & ~7;
                rgb[i] = (r << 16) | (g << 8) | b;
                opacos++;
            }
            Ampliar(buf, stride, alfa, rgb, lado, escala, f);
            medidas += (f > 0 ? ";" : "") + opacos + "|" + R.ToString("0.0", CultureInfo.InvariantCulture);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    static void Ampliar(byte[] buf, int stride, byte[] alfa, int[] rgb,
                        int lado, int escala, int f) {
        for (int y = 0; y < lado; y++) {
            for (int x = 0; x < lado; x++) {
                byte a = alfa[y * lado + x];
                if (a == 0) continue;
                int c = rgb[y * lado + x];
                byte rr = (byte)((c >> 16) & 255), gg = (byte)((c >> 8) & 255), bb = (byte)(c & 255);
                int bx = f * lado * escala + x * escala, by = y * escala;
                for (int oy = 0; oy < escala; oy++) {
                    int fila = (by + oy) * stride + bx * 4;
                    for (int ox = 0; ox < escala; ox++) {
                        int o = fila + ox * 4;
                        buf[o] = bb; buf[o + 1] = gg; buf[o + 2] = rr; buf[o + 3] = a;
                    }
                }
            }
        }
    }

    // Volcado de una vez. SetPixel sobre el millon y medio de pixeles de la
    // tira tardaba lo suyo sin ninguna razon; es el mismo LockBits que ya usan
    // procesar-assets.ps1 y ver-assets.ps1.
    static void Volcar(string salida, byte[] buf, int ancho, int alto, int stride) {
        using (Bitmap tira = new Bitmap(ancho, alto, PixelFormat.Format32bppArgb)) {
            BitmapData d = tira.LockBits(new Rectangle(0, 0, ancho, alto),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < alto; y++)
                Marshal.Copy(buf, y * stride, (IntPtr)(d.Scan0.ToInt64() + y * d.Stride), stride);
            tira.UnlockBits(d);
            tira.Save(salida, ImageFormat.Png);
        }
    }
}
"@

# --- Catalogo ---------------------------------------------------------------
#
# Cuatro explosiones que son el MISMO algoritmo con otros parametros. Ese es el
# argumento entero de generar por codigo: una lamina nueva por variante costaba
# un dibujo; aqui cuesta una fila de tabla.
#
# Las paletas van de lo mas caliente a lo mas frio y NO llevan tonos oscuros,
# a proposito: en el juego esto se dibuja en composicion aditiva (ver
# dibujarAire en zonaDanyo.js), y en aditivo un pixel oscuro es un pixel
# invisible. Una explosion se apaga desvaneciendose, no volviendose humo negro.
#
# atlas es el ID con el que el motor la pide. Va explicito y no derivado del
# nombre del fichero: los datos de armas.js y jefes.js nombran esta cadena, y
# que renombrar un PNG pudiera romper una referencia seria una trampa.
$CATALOGO = @(
    # --- Explosiones: bola llena que revienta ------------------------------
    @{ id = 'fuego';   atlas = 'explosionFuego';   archivo = 'explosion-fuego.png';   semilla = 20250819
       paleta = 'fff6e0,ffe9a0,ffc247,ff8c1a,ef5417,b52d16'
       chispas = 26; huecoIni = 0; hueco = 0.52; rugosidad = 1.0; anillo = 0.85; nucleo = 1.0; chispaTam = 1.0 }

    @{ id = 'cohete';  atlas = 'explosionCohete';  archivo = 'explosion-cohete.png';  semilla = 771144
       paleta = 'ffd9b0,ff9b3a,f2621c,c93412,8f2410,5e1a0c'
       chispas = 34; huecoIni = 0; hueco = 0.60; rugosidad = 1.35; anillo = 0.55; nucleo = 1.0; chispaTam = 1.0 }

    @{ id = 'molotov'; atlas = 'explosionMolotov'; archivo = 'explosion-molotov.png'; semilla = 480270
       paleta = 'fff2c4,ffd257,ffa322,f06a12,c4400f,7d2409'
       chispas = 20; huecoIni = 0; hueco = 0.74; rugosidad = 1.15; anillo = 0.35; nucleo = 1.0; chispaTam = 1.0 }

    @{ id = 'jupiter'; atlas = 'explosionJupiter'; archivo = 'explosion-jupiter.png'; semilla = 133777
       paleta = 'ffffff,dff0ff,9fd4ff,5aa8ff,3b6ee0,2a3fa8'
       chispas = 44; huecoIni = 0; hueco = 0.46; rugosidad = 1.55; anillo = 1.0; nucleo = 1.0; chispaTam = 1.0 }

    # --- Ondas expansivas: cascara desde el primer fotograma ---------------
    #
    # Para `ondaCircular` (Onda expansiva, Grito de guerra, Sismo, Gladius
    # Hispaniensis). efectos-mapa.md las dejo SIN sprite porque el material de
    # las laminas eran anillos concentricos de 1 px que se perdian al reducir, y
    # concluyo que el aro trazado era mejor. Eso valia para aquel material: aqui
    # el grosor del anillo es un parametro y no se reduce nada.
    #
    # `anillo` alto y `nucleo` moderado: lo que se ve es el filo, no el relleno.
    # Es lo que separa una onda de una explosion — una onda es un borde que
    # viaja, y por dentro ya ha pasado todo.
    @{ id = 'choque';  atlas = 'ondaChoque';  archivo = 'onda-choque.png';  semilla = 606060
       paleta = 'ffffff,eef4ff,c6d8f2,93b0da,6484b8,3f5688'
       radioRef = 80; chispas = 10; huecoIni = 0.62; hueco = 0.90; rugosidad = 0.55; anillo = 1.0; nucleo = 0.55; chispaTam = 1.0 }

    # ONDA REDONDA, y redonda de verdad: `rugosidad` a cero. Todas las demas
    # llevan el borde algo roto porque son explosiones, y una explosion perfecta
    # no existe; esta es el golpe de una andanada de flechas clavandose a la vez
    # en un circulo, asi que la circunferencia limpia es lo correcto.
    #
    # `radioRef` 28 y no el 50 por defecto: el radio de la Lluvia de flechas va
    # de 22 a 28, y hornear al tamano al que se dibuja evita ampliar en caliente.
    @{ id = 'aurea';   atlas = 'ondaAurea';   archivo = 'onda-aurea.png';   semilla = 141414
       paleta = 'fffbe0,ffee9c,ffd94e,f0b41c,c08610,8a5c08'
       radioRef = 28; chispas = 8; huecoIni = 0.58; hueco = 0.92; rugosidad = 0.0; anillo = 1.0; nucleo = 0.45; chispaTam = 1.0 }

    # EN ROJO, lo pidio Sergio: un grito de guerra es sangre y garganta, no la
    # luz dorada del choque. Del rosa casi blanco del centro al granate del
    # borde; en aditivo el granate se apaga solo.
    @{ id = 'grito';   atlas = 'ondaGrito';   archivo = 'onda-grito.png';   semilla = 909090
       paleta = 'ffe4dc,ffb0a0,ff6f5a,e8382a,b81e18,7a100e'
       radioRef = 80; chispas = 14; huecoIni = 0.55; hueco = 0.88; rugosidad = 0.85; anillo = 0.9; nucleo = 0.60; chispaTam = 1.0 }

    # --- Reventones de enemigo: poca bola y mucha metralla -----------------
    #
    # `nucleo` bajo y chispas gordas. Un sismo no es una bola de fuego: es el
    # suelo saltando por los aires, o sea sobre todo cascotes.
    # TIERRA: el unico que NO es aditivo, y no es un ajuste de gusto.
    #
    # Se monto aditivo como los demas y en el juego no se veia. Medido: aporta
    # 7,4 de luz por pixel del cuadro frente a los 22,7 de la explosion de
    # fuego, o sea un tercio, y sumado sobre un suelo ya claro eso es nada. El
    # fallo estaba en la premisa: el polvo y los cascotes NO SON LUZ. Un fuego
    # se suma al fondo, una nube de tierra lo TAPA.
    #
    # Con composicion normal la paleta oscura pasa de ser un problema a ser lo
    # correcto -es tierra, es marron- y `nucleo` sube porque en normal el alfa
    # ya no es brillo sino cuanto cubre.
    @{ id = 'tierra';  atlas = 'reventonTierra';  archivo = 'reventon-tierra.png';  semilla = 314159
       paleta = 'e8d3a8,c9a86a,a8813f,86612c,5f4420,3d2b14'; aditivo = $false
       radioRef = 80; chispas = 46; huecoIni = 0.20; hueco = 0.72; rugosidad = 1.45; anillo = 0.45; nucleo = 0.88; chispaTam = 1.8 }

    @{ id = 'veneno';  atlas = 'reventonVeneno';  archivo = 'reventon-veneno.png';  semilla = 271828
       paleta = 'e6ffc4,b9f07a,86d44a,5fae32,3d7d22,275316'
       chispas = 38; huecoIni = 0.16; hueco = 0.70; rugosidad = 1.30; anillo = 0.35; nucleo = 0.55; chispaTam = 1.6 }

    @{ id = 'llama';   atlas = 'reventonLlama';   archivo = 'reventon-llama.png';   semilla = 161803
       paleta = 'fff0cc,ffbe66,ff8a2a,e85a14,ad3a0e,73230a'
       chispas = 40; huecoIni = 0.18; hueco = 0.68; rugosidad = 1.40; anillo = 0.40; nucleo = 0.62; chispaTam = 1.5 }

    # --- Chatarra: una maquina expendedora reventando ------------------------
    #
    # Cristal y chapa saltando: blanco frio, azul de vidrio y gris de acero,
    # con muchas chispas gordas y poca bola. Es el reventon que se ve al romper
    # una maquina del nivel 2 (datos/enemigos.js, `spriteReventon`), justo
    # antes de que quede la rota. radioRef 28: se dibuja a 24 de radio.
    @{ id = 'chatarra'; atlas = 'reventonChatarra'; archivo = 'reventon-chatarra.png'; semilla = 240924
       paleta = 'ffffff,e2f4ff,a9dcf5,74aacc,b8c0c8,6f7a86'
       radioRef = 28; chispas = 44; huecoIni = 0.12; hueco = 0.66; rugosidad = 1.5; anillo = 0.35; nucleo = 0.5; chispaTam = 1.7 }

    # --- Chispazo del rayo: donde toca tierra la tormenta -------------------
    #
    # El unico efecto de area del arsenal que seguia siendo un circulo trazado:
    # `caerRayo` (sistemas/armas.js) creaba su onda SIN hoja mientras las otras
    # seis explosivas ya tenian la suya. Se veia como lo que era, un aro de
    # color al final de un haz muy trabajado.
    #
    # Y hoja propia en vez de reusar `explosionJupiter`, que es del Pilum: una
    # detonacion se ABRE -bola llena, hueco que crece- y un chispazo se
    # DESCARGA, o sea nucleo pequeno y todo lo demas repartido en brazos. Por
    # eso lleva las chispas mas altas del catalogo y la rugosidad tambien.
    #
    # radioRef 28 y no el de 50 por defecto: el radio del arma va de 22 a 29, y
    # hornear al tamano al que de verdad se dibuja es lo que evita ampliar en
    # caliente (ver la seccion de Resolucion mas abajo).
    @{ id = 'chispazo'; atlas = 'reventonChispa'; archivo = 'reventon-chispa.png'; semilla = 224466
       paleta = 'ffffff,eaf6ff,b9e2ff,7ec2ff,4f8ce8,3352b4'
       radioRef = 28; chispas = 52; huecoIni = 0.08; hueco = 0.62; rugosidad = 1.70; anillo = 0.70; nucleo = 0.80; chispaTam = 1.3 }

    # AULLIDO DE LA LOBA (datos/jefes.js). De la familia ONDA -cascara, no bola
    # llena- porque es fuerza pura y no fuego ni veneno: no deja nada ardiendo
    # en el suelo. Paleta plata-lavanda a propósito, para no repetir el azul de
    # `choque` (Onda expansiva) ni el verde de `veneno`: un aullido bajo la luna,
    # no una detonación. `radioRef` 120 porque es un radio de jefe, no de arma
    # del jugador -hornear a otro tamaño habría ampliado el pixel en caliente.
    @{ id = 'aullido'; atlas = 'ondaAullido'; archivo = 'onda-aullido.png'; semilla = 505050
       # MAS SATURADA que el primer intento (que salía gris-lavanda casi
       # invisible sobre el suelo verdoso del mapa): violeta espectral de
       # verdad, para que se lea a la primera contra cualquier terreno.
       paleta = 'ffffff,f0dcff,d9a8ff,b96eff,8c3fd6,5a2496'
       radioRef = 120; chispas = 16; huecoIni = 0.60; hueco = 0.88; rugosidad = 0.45; anillo = 0.95; nucleo = 0.40; chispaTam = 1.2 }
)

# --- Sismo ------------------------------------------------------------------
#
# Ondas sismicas para el Sismo del jugador (datos/armas.js), ver Pirotecnia.Sismo.
# Paleta de OCHO tonos tierra, de la arena clara del polvo al pardo casi negro
# de la grieta, y el color se interpola entre ellos: ocho puntos y mezcla
# continua es lo que quita los saltos.
#
# radioRef 60 y 24 fotogramas. El radio del arma va de 140 a 220 -media
# pantalla- y se hornea mas pequeno que eso a proposito: la tira son
# lado x 24, y a radioRef 80 pasaria de los 16384 px que algunos navegadores
# aceptan como ancho de imagen. A 60 son 648 x 24 = 15552. El motor la amplia
# 2-3x, y como el dibujo es de degradados y no de pixel art, ampliarlo no le
# hace dano.
$FOTOGRAMAS_SISMO = 24
$SISMOS = @(
    @{ id = 'sismo'; atlas = 'ondaSismo'; archivo = 'onda-sismo.png'; semilla = 424242
       paleta = 'f4e8cc,e2cd9c,cbab6c,ad8a4b,8f6a34,6f4e24,4e3517,2c1c0b'
       radioRef = 60; ondas = 3; grietas = 9 }
)

# --- Charcos ----------------------------------------------------------------
#
# Otra funcion, y con motivo: no crecen, van en bucle y se dibujan en
# composicion normal. Ver el comentario de Pirotecnia.Charco.
#
# HAY QUE LEER efectos-mapa.md ANTES DE TOCAR ESTO. Alli se probaron CINCO
# calcomanias de zona recortadas de un catalogo y se retiraron las cinco. Los
# motivos medidos fueron: cobertura del aro del 45% (quedaba suelo limpio
# dentro de lo que quema), orla clara del recorte, y siluetas que mentian sobre
# el arma. Los tres son de RECORTAR, no de la idea:
#
#   - la cobertura aqui es por construccion, el borde se genera entre 0,95 y
#     1,0 del radio y la medicion de mas abajo lo comprueba fotograma a fotograma
#   - no hay orla porque no hay JPG del que recortar
#   - la silueta la elige uno: un charco de brea es una mancha, no un crater
#
# Pero el cuarto motivo del descarte NO lo arregla nada de esto: fallaban EN
# MOVIMIENTO, y eso no lo dice ni un numero ni una imagen fija. Estos siete
# siguen pendientes de ese juicio.
$RADIO_CHARCO = 40          # radios reales van de 10 a 40; se escala
# 1.18: el borde solo sobresale (ver Math.Abs en Charco), y lo maximo que
# puede sobresalir es la suma de amplitudes por la rugosidad, ~0,147.
$MARGEN_CHARCO = 1.18

$CHARCOS = @(
    @{ id = 'lava';      atlas = 'charcoLava';      archivo = 'charco-lava.png';      semilla = 5150
       paleta = 'ffe9a0,ffa63a,ef5a17,b8340f,7a2109,451406'; rugosidad = 1.0; hervor = 0.30; burbujas = 5 }

    @{ id = 'alquitran'; atlas = 'charcoAlquitran'; archivo = 'charco-alquitran.png'; semilla = 8080
       paleta = '6a6270,4e4756,3a3442,2a2531,1d1a23,121017'; rugosidad = 1.3; hervor = 0.26; burbujas = 4 }

    @{ id = 'zarza';     atlas = 'charcoZarza';     archivo = 'charco-zarza.png';     semilla = 3210
       paleta = 'b8b49a,918c74,6e6a55,52503e,3a382b,26251c'; rugosidad = 1.6; hervor = 0.34; burbujas = 6 }

    @{ id = 'acero';     atlas = 'charcoAcero';     archivo = 'charco-acero.png';     semilla = 4444
       paleta = 'e4ecf4,bcc9d8,94a4b8,6f7d94,505b6e,343c4a'; rugosidad = 1.1; hervor = 0.22; burbujas = 5 }

    @{ id = 'piedra';    atlas = 'charcoPiedra';    archivo = 'charco-piedra.png';    semilla = 9001
       paleta = 'd0c4a8,ab9c7e,86795d,635942,463f2e,2c2820'; rugosidad = 0.9; hervor = 0.18; burbujas = 4 }

    @{ id = 'ponzona';   atlas = 'charcoPonzona';   archivo = 'charco-ponzona.png';   semilla = 6174
       paleta = 'd6f78e,9ede55,6cb434,4d8526,355e1a,213b11'; rugosidad = 1.2; hervor = 0.32; burbujas = 6 }
)

# --- Resolucion -------------------------------------------------------------
#
# DOS COSAS DISTINTAS PIXELAN UN EFECTO, y conviene no confundirlas:
#
#   1. DETALLE: cuantos pixeles fisicos ocupa cada pixel de origen.
#   2. AMPLIACION en caliente: la hoja se hornea a un radio y el arma la dibuja
#      a otro. Un Sismo de radio 140 sobre una hoja horneada a 64 la amplia 2,2x.
#
# (nota: el tamano del PNG sale del radio LOGICO y del numero de fotogramas,
# NO del detalle. Bajar el detalle sube la resolucion sin costar un byte: solo
# mete mas pixeles de origen dentro del mismo cuadro.)
#
# DETALLE era 4, o sea el mismo grano que los sprites del juego (ESCALA_ARTE).
# Se veia excesivamente pixelado justo donde mas se nota —los efectos de area,
# que ademas crecen con el nivel del arma— asi que baja a 2. Los efectos quedan
# con grano mas fino que los personajes, que es una decision deliberada: un
# fuego o una onda no son materia dibujada a mano, y a doble tamano el bloque
# de 4 cantaba.
#
# Medido, pixeles fisicos por pixel de origen en el peor caso de cada familia:
#
#              antes   solo detalle 2   y ademas radio mayor
#   explosion    9,0        4,5                3,6
#   onda/sismo   8,8        4,4                3,5
#   charco       5,3        2,7                2,0
$ESCALA_ARTE = 4    # el del juego, core/constantes.js
$DETALLE     = 2    # px fisicos por px de origen. Menos = mas fino.

# Pixeles de ORIGEN por unidad logica del juego. De aqui sale el tamano al que
# hay que generar para que el cuadro acabe midiendo lo que tiene que medir.
$FUENTE_POR_LOGICO = $ESCALA_ARTE / $DETALLE

# Radio de dano de REFERENCIA, en unidades LOGICAS del juego (las mismas que
# usa datos/armas.js). No es el de ningun arma en concreto -van de 24 a 54 en
# el nivel 1 y suben hasta ~90- sino el tamano al que se hornea; el motor
# escala. Sube de 40 a 50 para recortar la ampliacion en caliente.
$RADIO_DANYO = 50
# Cuanto sobresale la celda del radio de dano. La bola NOMINAL llega justo al
# radio de dano; lo que se sale son el desgarro de la silueta y las chispas.
# 1.35 y no 1.25: con 1.25 el desgarro del cohete llegaba a 49,1 sobre un medio
# lado de 50 y estaba a punto de comerse las puntas. Subirlo no cambia donde
# cae el filo del fuego -el motor divide por `radios[f]`-, solo da holgura.
$MARGEN      = 1.35
# 18 y no 10: una explosion dura 0,32-0,40 s, o sea 19-24 fotogramas
# renderizados, asi que con 18 no se repite practicamente ninguno. Y ademas es
# lo que baja el reparto a 1,106x de ampliacion (ver el bucle de fotogramas).
# 12 y no 18: la memoria de una hoja va con el cuadrado del radio por el numero
# de fotogramas, y hacia falta presupuesto para subir los radios. Se cambia
# resolucion TEMPORAL por resolucion ESPACIAL, que es lo que se estaba pidiendo.
# A 12 fotogramas una explosion de 0,32 s sigue teniendo uno por cada dos
# fotogramas renderizados.
$FOTOGRAMAS  = 12

if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Force $Destino | Out-Null }

# Radio en pixeles de ORIGEN, que es en lo que trabaja el generador. El lado
# del cuadro en pixeles FISICOS no depende del detalle: sale del radio logico.
$radioFuenteBase = [int][math]::Round($RADIO_DANYO * $FUENTE_POR_LOGICO)
$medioLado = [math]::Round($radioFuenteBase * $MARGEN)
$lado = $medioLado * 2 * $DETALLE
Write-Host ""
Write-Host "Explosiones: celda $lado x $lado, $FOTOGRAMAS fotogramas, tira de $($lado * $FOTOGRAMAS) px"
Write-Host "Radio de dano $RADIO_DANYO art-px, margen $MARGEN -> el motor dibuja con medio lado = radio * $MARGEN"
Write-Host ""

foreach ($e in $CATALOGO) {
    if ($Solo -and $e.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $e.archivo
    # RADIO DE REFERENCIA POR EFECTO. El motor escala la hoja al radio real del
    # arma, y escalar mucho hacia arriba engorda el pixel: el Sismo tiene radio
    # 140 y con una hoja horneada a 40 su pixel triplicaria al del suelo.
    # efectos-mapa.md dejo esto anotado como reserva sin salida -"haria falta
    # arte de origen mayor"- porque con una lamina recortada no la habia. Aqui
    # el arte de origen se fabrica, asi que basta con pedirlo mas grande.
    $radioLogico = if ($e.radioRef) { [int]$e.radioRef } else { $RADIO_DANYO }
    $radioRef = [int][math]::Round($radioLogico * $FUENTE_POR_LOGICO)
    $m = [Pirotecnia]::Explosion($ruta, $radioRef, [double]$MARGEN, $FOTOGRAMAS, $DETALLE,
                                 [uint32]$e.semilla, $e.paleta, $e.chispas,
                                 [double]$e.huecoIni, [double]$e.hueco,
                                 [double]$e.rugosidad, [double]$e.anillo,
                                 [double]$e.nucleo, [double]$e.chispaTam)

    # Verificacion POR TEXTO. Tres cosas que tienen que cumplirse y que se
    # pueden contar sin abrir el PNG:
    #   - el radio de la bola CRECE siempre (si no, no hay animacion)
    #   - ningun fotograma sale vacio (fue el primer fallo de esta herramienta)
    #   - la ocupacion sube y luego baja: la bola crece y despues se vacia
    $frames = $m -split ';'
    $ocup = @(); $rad = @(); $masa = @()
    foreach ($fr in $frames) {
        $p = $fr -split '\|'
        $ocup += [int]$p[0]
        $rad  += [double]$p[1]
        $masa += [int]$p[2]
    }
    # El pico se mide sobre la MASA LUMINOSA (suma del alfa), no sobre el area.
    # El area de una bola que crece sube hasta el final aunque la bola se este
    # apagando, asi que con ella dos de las cuatro explosiones daban pico en el
    # ultimo fotograma y parecia que no se disipaban nunca. Lo que se apaga es
    # el brillo, y eso es lo que hay que contar.
    $pico = 0
    for ($i = 1; $i -lt $masa.Count; $i++) { if ($masa[$i] -gt $masa[$pico]) { $pico = $i } }
    $creceR = $true
    for ($i = 1; $i -lt $rad.Count; $i++) { if ($rad[$i] -le $rad[$i-1]) { $creceR = $false } }
    $vacios = @($ocup | Where-Object { $_ -eq 0 }).Count
    $ultima = if ($masa[-1] -gt 0) { [math]::Round(100 * $masa[-1] / $masa[$pico]) } else { 0 }

    Write-Host ("  {0,-8} {1}" -f $e.id, $e.archivo)
    Write-Host ("           radio  {0}" -f (($rad | ForEach-Object { $_.ToString('0.0') }) -join ' '))
    Write-Host ("           masa   {0}" -f ($masa -join ' '))
    # Se disipa de verdad si el pico NO es el ultimo fotograma y ademas ha
    # perdido brillo desde el: si acaba igual de encendida que en su maximo,
    # desaparecera de golpe.
    $ok = $creceR -and $vacios -eq 0 -and $pico -lt ($masa.Count - 1) -and $ultima -lt 80
    Write-Host ("           radio creciente: {0}   vacios: {1}   pico de brillo en {2}/{3}   ultimo = {4}% del pico   -> {5}" -f `
                $creceR, $vacios, $pico, ($masa.Count - 1), $ultima, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

# --- Tajos ------------------------------------------------------------------
#
# UNA HOJA POR ARMA, y no una tira compartida, porque cada una tiene SU
# apertura y SU alcance: el Gladius abre 90 grados y la Guadaña 145, y un
# barrido dibujado con otro angulo mentiria sobre donde se hace daño.
#
# `alcance` y `angulo` se copian de datos/armas.js y tienen que seguir
# coincidiendo. El alcance es el del NIVEL 1: es el tamaño al que el motor
# dibuja el caso base, así que ahí el blit sale 1:1. Al subir el arma de nivel
# el alcance crece y la hoja se amplía, igual que ya le pasa a la Katana.
# `forma`: qué silueta esculpe Pirotecnia.Tajo por encima de la cinta base
# (ver el switch dentro de la función). Vacía = la cinta de siempre, que es lo
# que siguen siendo Gladius, Motosierra y Katana -no lo pidió nadie tocarlas.
$TAJOS = @(
    @{ id = 'gladius';    atlas = 'tajoGladius';    archivo = 'tajo-gladius.png'
       alcance = 46; angulo = 90;  semilla = 11101; forma = ''
       paleta = 'ffffff,eef3fb,cfdcee,a8bcd8,7d93b4,55688a'; grosor = 0.34; estela = 0.55 }

    @{ id = 'hacha';      atlas = 'tajoHacha';      archivo = 'tajo-hacha.png'
       alcance = 42; angulo = 70;  semilla = 22202; forma = 'hacha'
       paleta = 'fff6e4,f0dcb8,d8bc8a,b8945f,8d6c3f,5f4626'; grosor = 0.46; estela = 0.45 }

    @{ id = 'maza';       atlas = 'tajoMaza';       archivo = 'tajo-maza.png'
       alcance = 40; angulo = 60;  semilla = 33303; forma = 'maza'
       paleta = 'fbf4ea,e2d6c4,c2b3a0,9c8d7c,74665a,4c423a'; grosor = 0.58; estela = 0.38 }

    @{ id = 'latigo';     atlas = 'tajoLatigo';     archivo = 'tajo-latigo.png'
       alcance = 74; angulo = 38;  semilla = 44404; forma = 'latigo'
       paleta = 'fff0dc,f2d0a4,dcae74,bc8850,8f6336,5e4122'; grosor = 0.16; estela = 0.80 }

    @{ id = 'motosierra'; atlas = 'tajoMotosierra'; archivo = 'tajo-motosierra.png'
       alcance = 32; angulo = 55;  semilla = 55505; forma = ''
       paleta = 'ffe8e0,ffb49e,ff7f63,e8523a,b03422,761f13'; grosor = 0.52; estela = 0.62 }

    @{ id = 'guadanya';   atlas = 'tajoGuadanya';   archivo = 'tajo-guadanya.png'
       alcance = 54; angulo = 145; semilla = 66606; forma = 'guadanya'
       paleta = 'f4fbf4,d6ecd8,aed4b4,84b48e,5c8a67,3a5c44'; grosor = 0.30; estela = 0.50 }
)

# --- Sismo: se genera aqui, con $DETALLE y $MARGEN ya definidos ------------
Write-Host "Sismo: $FOTOGRAMAS_SISMO fotogramas, ondas interpoladas"
foreach ($sm in $SISMOS) {
    if ($Solo -and $sm.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $sm.archivo
    $radioRef = [int][math]::Round([int]$sm.radioRef * $FUENTE_POR_LOGICO)
    try {
        $m = [Pirotecnia]::Sismo($ruta, $radioRef, [double]$MARGEN, $FOTOGRAMAS_SISMO, $DETALLE,
                                 [uint32]$sm.semilla, $sm.paleta, [int]$sm.ondas, [int]$sm.grietas)
    } catch {
        # El mensaje de GDI+ ("el parametro no es valido") no dice donde; la
        # pila interior si.
        $ex = $_.Exception; while ($ex.InnerException) { $ex = $ex.InnerException }
        Write-Host "  ERROR sismo: $($ex.Message)"; Write-Host $ex.StackTrace
        continue
    }
    $frames = $m -split ';'
    $vacios = @($frames | Where-Object { ([int]($_ -split '\|')[0]) -eq 0 }).Count
    $ultimo = ($frames[-1] -split '\|')
    Write-Host ("  {0,-8} {1} fotogramas, {2} vacios, radio final {3}" -f $sm.id, $frames.Count, $vacios, $ultimo[1])
}
Write-Host ""

$ladoTajo = 0
Write-Host "Tajos: una hoja por arma, medio lado = alcance, $FOTOGRAMAS fotogramas"
Write-Host ""

foreach ($t in $TAJOS) {
    if ($Solo -and $t.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $t.archivo
    $semi = [double]$t.angulo * [math]::PI / 360.0     # mitad de la apertura, en radianes
    # El alcance del catalogo es LOGICO (el mismo de datos/armas.js); el
    # generador trabaja en pixeles de origen.
    $alcanceFuente = [int][math]::Round([int]$t.alcance * $FUENTE_POR_LOGICO)
    $m = [Pirotecnia]::Tajo($ruta, $alcanceFuente, $semi, $FOTOGRAMAS, $DETALLE,
                            [uint32]$t.semilla, $t.paleta,
                            [double]$t.grosor, [double]$t.estela, [string]$t.forma)

    # Lo que tiene que cumplirse: ningun fotograma vacio (si no, el golpe
    # parpadea) y el filo AVANZANDO siempre (si no, el barrido no barre).
    $op = @(); $filo = @()
    foreach ($fr in ($m -split ';')) {
        $p = $fr -split '\|'
        $op += [int]$p[0]
        $filo += [double]$p[1]
    }
    $vacios = @($op | Where-Object { $_ -eq 0 }).Count
    $avanza = $true
    for ($i = 1; $i -lt $filo.Count; $i++) { if ($filo[$i] -le $filo[$i-1]) { $avanza = $false } }
    $lado = $alcanceFuente * 2 * $DETALLE
    Write-Host ("  {0,-12} {1,-24} celda {2}x{2}  apertura {3}deg" -f $t.id, $t.archivo, $lado, $t.angulo)
    Write-Host ("               ocupacion  {0}" -f ($op -join ' '))
    Write-Host ("               filo avanza: {0}   vacios: {1}   -> {2}" -f `
                $avanza, $vacios, $(if ($avanza -and $vacios -eq 0) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

# --- Charcos ----------------------------------------------------------------
$radioCharcoFuente = [int][math]::Round($RADIO_CHARCO * $FUENTE_POR_LOGICO)
$ladoCharco = [int]([math]::Round($radioCharcoFuente * $MARGEN_CHARCO)) * 2 * $DETALLE
Write-Host "Charcos: celda $ladoCharco x $ladoCharco, $FOTOGRAMAS fotogramas en BUCLE"
Write-Host ""

foreach ($c in $CHARCOS) {
    if ($Solo -and $c.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $c.archivo
    $m = [Pirotecnia]::Charco($ruta, $radioCharcoFuente, [double]$MARGEN_CHARCO,
                              $FOTOGRAMAS, $DETALLE, [uint32]$c.semilla, $c.paleta,
                              [double]$c.rugosidad, [double]$c.hervor, [int]$c.burbujas)

    # LA medida de un charco es la COBERTURA DEL ARO: que porcentaje del circulo
    # de dano queda tapado por la mancha. El intento anterior se hundio aqui
    # -llego a estar en el 35-45%- y el motivo importa: el suelo que queda
    # limpio dentro del aro QUEMA IGUAL, asi que el jugador que mete el pie ahi
    # lee que esta a salvo y no lo esta. Por debajo de 95 hay que revisar.
    $cob = @($m -split ';' | ForEach-Object { [int]$_ })
    $min = ($cob | Measure-Object -Minimum).Minimum
    Write-Host ("  {0,-10} {1}" -f $c.id, $c.archivo)
    Write-Host ("             cobertura del aro  min {0}%  max {1}%" -f $min, ($cob | Measure-Object -Maximum).Maximum)
    Write-Host ("             -> {0}" -f $(if ($min -ge 95) { 'OK' } else { 'REVISAR: deja suelo limpio dentro de la zona' }))
    Write-Host ""
}

# --- Minas ------------------------------------------------------------------
#
# Objeto, no efecto: tamano FIJO y opaca. El radio es el del DIBUJO, no el del
# daño — una mina es pequeña y su explosion no, asi que el motor la dibuja
# siempre igual de grande pase lo que pase con el nivel del arma.
$RADIO_MINA = 9        # unidades logicas: se lee a un golpe de vista y no estorba

# VACIA A PROPOSITO. La mina generada aqui (12 fotogramas de parpadeo) la
# sustituyo la de Sergio, resources/armas/efectos/sprite_mina.png, que hornea
# procesar-assets.ps1 sobre el mismo efectos/mina-explosiva.png con UN
# fotograma y `radioDibujo` 9 (ver $DIBUJOS_SUELTOS). Mientras esta lista
# siguio declarandola, cada pasada de procesar-assets fundia esta ficha de 12
# fotogramas sobre un PNG de uno solo, y el motor recorria once huecos vacios:
# la mina PARPADEABA sin parar. El generador de minas se queda por si vuelve a
# hacer falta; la entrada, no.
$MINAS = @()

# --- Auras -------------------------------------------------------------------
#
# NOTA: aqui hubo un catalogo de PINCHOS —cuarenta y cuatro triangulos de hierro
# repartidos en espiral aurea— que hacia la calcomania del Tribulus. Se retiro
# al llegar sprite_abrojos.png: el arma pasa a dibujarse con copias de ESE
# abrojo, una por una y llegando volando desde el jugador (ver `hojaPieza` en
# entidades/zonaDanyo.js), asi que ya no hay una lamina que hornear.
#
# Lo que sobrevivio del experimento es el reparto: la espiral aurea con temblor
# esta ahora en el dibujado de la zona, y por el mismo motivo por el que se
# escribio aqui — al azar puro salian corros y un cuadrante vacio.

# Las AURAS son resplandores sueltos que se dibujan detras de otra cosa.
$RADIO_AURA = 16          # fuente; 64x64 fisicos, como la luna
$AURAS = @(
    @{ id = 'auraRoja'; atlas = 'auraRoja'; archivo = 'aura-roja.png'
       # Rojo encendido, no granate: en aditivo lo oscuro no aporta nada.
       color = 'ff2a1a'; fuerza = 0.72; nucleo = 0.30 }
)

$radioAuraFuente = $RADIO_AURA
$ladoAura = $RADIO_AURA * 2 * $DETALLE

# --- Proyectiles con dibujo propio -------------------------------------------
#
# Tres armas que se dibujaban con el trazo generico y piden algo suyo. Las tres
# son geometria: una abeja son dos ovalos y unas bandas, un shuriken es una
# formula polar y una botella son cuatro tramos apilados.
#
# EL TAMANO DEL PNG ES EL TAMANO EN PANTALLA. El motor dibuja estos sprites a
# `meta.w / ESCALA_ARTE` unidades logicas, o sea 1:1 en pixeles fisicos, que es
# la regla de los blits del proyecto. La referencia es la bala de la pistola:
# 43x19 fisicos. Con DETALLE 2, la fuente va a la mitad.
$RADIO_SHURIKEN = 8      # fuente; el PNG sale de 32x32 fisicos
$LADO_MOLOTOV  = 18      # fuente; 36x36 fisicos
$ABEJA_ANCHO   = 20      # fuente; 40x22 fisicos
$ABEJA_ALTO    = 11
$FLECHA_ANCHO  = 22      # fuente; 44x16 fisicos, o sea 11x4 unidades logicas
$FLECHA_ALTO   = 8
$KUNAI_ANCHO   = 20      # fuente; 40x16 fisicos
$KUNAI_ALTO    = 8
# Las tres astas. La del Pilum es con diferencia la mas larga y la mas fina: 72
# de fuente por 7 de alto, o sea una proporcion de DIEZ A UNO. El virote, al
# otro extremo: corto y gordo.
#
# Se alargo dos veces -26, 36 y ahora 72- y siempre a lo LARGO, sin tocar el
# alto: es lo que la va convirtiendo en lanza en vez de en jabalina gorda. Una
# lanza no es un dardo grande, es un dardo estirado.
$PILUM_ANCHO   = 72; $PILUM_ALTO   = 7      # 144x14 fisicos
$LANZA_ANCHO   = 26; $LANZA_ALTO   = 8      # 52x16
$VIROTE_ANCHO  = 22; $VIROTE_ALTO  = 10     # 44x20
# Pedazos sueltos: casco de metralla y canto de honda.
$METRALLA_LADO = 8                          # 16x16
$PIEDRA_ANCHO  = 10; $PIEDRA_ALTO  = 9      # 20x18
# Lengua de fuego del lanzallamas.
$LENGUA_ANCHO  = 16; $LENGUA_ALTO  = 9      # 32x18
# La rosa de los vientos: misma figura que el shuriken con otros numeros.
# La rosa de los vientos crece con el nivel del arma hasta cuadruplicar su
# tamano, asi que se hornea generosa: 40x40 fisicos. Lo que se amplia en caliente
# es la escala, no la hoja, y partir de una hoja chica se notaria al maximo.
$RADIO_ROSA    = 10                         # 40x40
# La columna es la pieza mas grande del lote y tiene que serlo: es un fuste de
# marmol, no un dardo. 68x24 fisicos son 17x6 unidades logicas.
$COLUMNA_ANCHO = 34
$COLUMNA_ALTO  = 12

$PROYECTILES = @(
    @{ id = 'abeja'; tipo = 'abeja'; atlas = 'proyAbeja'; archivo = 'proy-abeja.png'
       # Banda clara primero: el indice 0 es la franja amarilla y el ultimo el
       # negro del abdomen, la cabeza y el aguijon.
       paleta = 'f2d24a,c9a52a,8a6a18,2a2418'
       ala = 'dfeaf5' }

    @{ id = 'shuriken'; tipo = 'shuriken'; atlas = 'proyShuriken'; archivo = 'proy-shuriken.png'
       paleta = 'f0f4f8,ccd6e0,a3b0bd,76828f,4a545e,272d33'
       # `afilado` por debajo de 1 come los flancos hacia dentro y afila la
       # punta; `hueco` es el ojo central y `cuerpo` el radio minimo que
       # garantiza que las cuatro hojas siguen unidas por el medio.
       afilado = 0.55; hueco = 0.17; cuerpo = 0.30 }

    @{ id = 'molotov'; tipo = 'molotov'; atlas = 'proyMolotov'; archivo = 'proy-molotov.png'
       # VERDE DE BOTELLA DE CERVEZA, que es un verde concreto y no un verde
       # cualquiera: oscuro, con el reflejo tirando a amarillo y la sombra casi
       # negra. Del brillo al contorno.
       paleta = 'e2f2c8,a8d489,6fa554,44712f,29491d,10200a'
       # El fuego del trapo, del nucleo blanco al filo rojo.
       fuego = 'fff6d8,ffd257,ff9a22,e85a14'
       trapo = 'd8c9a8'
       # La etiqueta. Papel viejo, no blanco: el blanco puro a este tamano se
       # come el resto de la botella.
       etiqueta = 'ded2b0' }

    # --- Astas: punta sobre palo, tres proporciones -----------------------
    @{ id = 'pilum'; tipo = 'asta'; atlas = 'proyPilum'; archivo = 'proy-pilum.png'
       paleta = 'b99a63,5c4726'          # fresno
       acero = 'dfe4ea,4e5762'
       pluma = '000000'
       # LANZA LARGA, no el pilum historico.
       #
       # Llevaba la firma del arma de verdad: punta pequena, vastago de hierro
       # largo y fino hasta la mitad, y asta gruesa detras. Es lo que distingue
       # a un pilum... y a tamano de juego lo que se leia era un palo con un
       # nudo en medio: el vastago es una linea de un pixel y rompe la silueta
       # en dos trozos en vez de dar una pieza.
       #
       # Asi que se cambia por lo que se lee: hoja de laurel al frente y un
       # fuste largo y fino detras, de una pieza. Sin vastago.
       #
       # `fracPunta` BAJA A LA MITAD al doblarse el ancho de la celda, y es a
       # proposito: es una fraccion del largo total, asi que dejandola en 0,22
       # la hoja habria crecido tambien al doble y saldria una alabarda. Lo que
       # tiene que alargarse es el FUSTE; la hoja de una lanza mide lo que mide.
       fracPunta = 0.11; anchoPunta = 0.32; fracVastago = 0
       anchoAsta = 0.13; fracPluma = 0 }

    @{ id = 'lanza'; tipo = 'asta'; atlas = 'proyLanza'; archivo = 'proy-lanza.png'
       paleta = 'c2a468,634d2a'
       acero = 'e8edf3,566070'
       pluma = '000000'
       # Hoja de laurel ancha y larga, sin vastago: es una lanza de mano.
       fracPunta = 0.30; anchoPunta = 0.34; fracVastago = 0
       anchoAsta = 0.15; fracPluma = 0 }

    @{ id = 'virote'; tipo = 'asta'; atlas = 'proyVirote'; archivo = 'proy-virote.png'
       paleta = 'a98a58,503d24'
       acero = 'd8dee6,464e58'
       pluma = 'cfc7b4'
       # Cabeza gorda, asta gruesa y plumas cortas: un virote es un tocho que
       # atraviesa, no un dardo que pincha.
       fracPunta = 0.22; anchoPunta = 0.40; fracVastago = 0
       anchoAsta = 0.22; fracPluma = 0.20 }

    # --- Pedazos ----------------------------------------------------------
    # La metralla ya no sale de aqui: Sergio dibujo treinta y dos cascos en
    # resources/armas/efectos/sprite_metralla.png y los hornea procesar-assets
    # (ver $CASCOS_METRALLA) sobre el mismo efectos/proy-metralla.png. Si
    # volviera a declararse aqui, las dos herramientas se pisarian el archivo.

    @{ id = 'piedra'; tipo = 'trozo'; atlas = 'proyPiedra'; archivo = 'proy-piedra.png'
       semilla = 90210
       paleta = 'd6cfc0,b2a894,8d8371,675f50,474135,2b271f'
       # Casi redonda: un canto de rio elegido para la honda, no un pedrusco.
       vertices = 9; irregular = 0.16 }

    @{ id = 'petanca'; tipo = 'trozo'; atlas = 'proyPetanca'; archivo = 'proy-petanca.png'
       semilla = 31415
       # Acero pulido, no piedra: la bola de petanca es metal torneado y lo que
       # la delata es el brillo, asi que la paleta va del blanco del reflejo al
       # azul apagado de la sombra. Nada de ocres, que es lo que la haria canto
       # de rio (comparar con `piedra`, aqui arriba).
       paleta = 'ffffff,dfe6ee,a9b4c0,72808f,45505d,232a33'
       # DOCE VERTICES Y CASI NADA DE IRREGULARIDAD: es una esfera torneada. El
       # `trozo` esta pensado para pedazos con aristas -de ahi los 7 vertices de
       # la metralla- y subiendolos con la irregularidad casi a cero da un
       # circulo, que es justo lo que hace falta y sin escribir una forma nueva.
       vertices = 12; irregular = 0.03 }

    # --- Otros ------------------------------------------------------------
    @{ id = 'lengua'; tipo = 'lengua'; atlas = 'proyLengua'; archivo = 'proy-lengua.png'
       # Del nucleo blanco al filo rojo, sin tonos oscuros: es fuego.
       paleta = 'fffbe8,ffe9a0,ffb43c,ff7a18,e04510' }

    @{ id = 'rosa'; tipo = 'rosa'; atlas = 'proyRosa'; archivo = 'proy-rosa.png'
       # Bronce de instrumento, no acero: una rosa de los vientos es una pieza
       # de laton grabada.
       paleta = 'fff3cd,e8c877,c19a45,8f6f2c,5c4718,2e2208'
       # `corta` es lo que alcanzan las cuatro puntas diagonales frente a las
       # cardinales. 0,52 es la proporcion de las rosas de las cartas nauticas:
       # se ven claramente como una segunda serie y no compiten con las largas.
       afilado = 0.40; cuerpo = 0.14; corta = 0.52 }

    @{ id = 'kunai'; tipo = 'kunai'; atlas = 'proyKunai'; archivo = 'proy-kunai.png'
       # Acero pavonado. La sombra es un gris MEDIO y no casi negro: a ocho
       # pixeles de alto, media hoja en negro no se lee como una cara en sombra,
       # se lee como un borron. El contraste tiene que caber en la silueta.
       paleta = 'e6ecf2,7c8794'
       # Mango envuelto en cuerda y anilla de hierro.
       mango = '4a3f33'; anilla = '8e939a' }

    @{ id = 'columna'; tipo = 'columna'; atlas = 'proyColumna'; archivo = 'proy-columna.png'
       # Marmol de Emerita: blanco hueso con la sombra en gris calido, nunca
       # azulada. Del brillo del canto iluminado al contorno.
       paleta = 'f4efe2,ded6c3,c0b6a0,9b917d,706857,463f33'
       # Acanaladuras del fuste. Cinco bandas: menos parece un tubo y mas se
       # convierte en trama al reducir.
       estrias = 5 }

    @{ id = 'flecha'; tipo = 'flecha'; atlas = 'proyFlecha'; archivo = 'proy-flecha.png'
       # Madera de la cana: iluminada arriba y en sombra abajo.
       paleta = 'c9a870,6b5330'
       # Acero de la punta.
       acero = 'eef2f6,5a6570'
       # Y la pluma, gris de ganso.
       pluma = 'ded9cc' }
)

$ANCHO_ABEJA_FUENTE = $ABEJA_ANCHO
$ALTO_ABEJA_FUENTE  = $ABEJA_ALTO

# --- Redes -------------------------------------------------------------------
#
# Para el Rete, que es la red del retiarius y venia prestada del charco de
# zarzas por no tener la suya. Una malla de rombos es geometria pura, asi que
# entra en el generador por la puerta grande.
#
# Comparte medidas con los charcos -mismo radio de horneado y mismo margen-
# porque es lo mismo: una calcomania de suelo que se escala al radio de la zona.
$REDES = @(
    @{ id = 'red'; atlas = 'redPesca'; archivo = 'red-pesca.png'; semilla = 71355
       # Cordel de esparto: del reflejo del hilo a la sombra entre vueltas.
       paleta = 'e8dcc0,cdbc99,ab9873,857358,5f5340,3d3529'
       # `paso` es la separacion entre cordeles en fracciones del radio de dano:
       # 0,26 da una malla de unos ocho rombos de lado a lado, que a 25-43 de
       # radio se lee como red y no como trama. `grosor` es el del cordel y
       # `nudo` cuanto engorda en los cruces.
       paso = 0.26; grosor = 0.09; nudo = 1.6 }
)

$radioRedFuente = $radioCharcoFuente
$ladoRed = $ladoCharco

# --- Lunas -------------------------------------------------------------------
#
# Para los Satelites, que eran el ultimo orbital sin dibujo: los otros tres
# -Scutum, Discos y Sierras- salen de laminas de resources/, y este no tenia.
#
# Se genera en vez de dibujarse porque una luna es dos circunferencias y una
# resta. Ver el comentario de Pirotecnia.Luna.
#
# El RADIO va en unidades logicas y sale del arma: `radioEscudo` de los
# Satelites es 7, y se hornea a 8 para que crezca con `bonusArea` sin tener que
# ampliar. Con FUENTE_POR_LOGICO=2 y DETALLE=2 son 64 px de lado, exactamente
# los mismos que el escudo del Scutum.
$RADIO_LUNA = 8

# FINURA: cuantos pixeles de origen se usan de mas, SIN cambiar el tamano en
# pantalla. Es un multiplicador de resolucion y nada mas.
#
# Funciona porque el motor NO saca el tamano de un orbital de su hoja: lo saca
# de radioEscudo del arma y de `escalaOrbital` (ver dibujarOrbitales en
# sistemas/armas.js). La hoja solo aporta detalle. Y falta hacia: la luna se
# dibuja a 17,5 unidades de radio, o sea 140 pixeles fisicos, y horneada a 64
# cada pixel de origen cubria cuatro y pico de pantalla.
#
# A 2 son 128 px de hoja para 140 de pantalla: practicamente 1:1, que es la
# regla de los blits del proyecto.
$FINURA_LUNA = 2

$LUNAS = @(
    @{ id = 'luna'; atlas = 'orbLuna'; archivo = 'orb-luna.png'; semilla = 27091
       # De la cara al sol a la sombra del canto. Gris de piedra tirando a hueso,
       # no blanco puro: el blanco puro sobre arena clara desaparece.
       paleta = 'fdfbf2,ece7d8,d2ccb8,ada693,807a69,504b41'
       # `fraccion`: cuanto de la celda ocupa el disco. El resto es aura, y la
       # celda entera es lo que el motor dibuja al radio del escudo, asi que el
       # halo se apaga justo donde acaba el dano. 0,68 deja luna de sobra y un
       # tercio de celda para que el degradado tenga sitio donde caer.
       fraccion = 0.68
       # El azul del aura y su fuerza en el arranque. 0,55 es visible sin
       # convertirse en un disco: por encima de 0,7 deja de leerse como halo.
       aura = '6fb4ff'; fuerzaAura = 0.55; crateres = 5
       # FOTOGRAMAS DEL CICLO LUNAR. 16 como los sprites de los bichos: con 8 el
       # salto entre fases se nota, y por encima de 16 no se distingue una de la
       # siguiente a 30 px de pantalla.
       nFases = 16 }
)

$radioLunaFuente = [int][math]::Round($RADIO_LUNA * $FUENTE_POR_LOGICO * $FINURA_LUNA)
$ladoLuna = $radioLunaFuente * 2 * $DETALLE

$radioMinaFuente = [int][math]::Round($RADIO_MINA * $FUENTE_POR_LOGICO)
$ladoMina = $radioMinaFuente * 2 * $DETALLE
Write-Host "Minas: celda $ladoMina x $ladoMina, $FOTOGRAMAS fotogramas en BUCLE"
Write-Host ""

foreach ($mn in $MINAS) {
    if ($Solo -and $mn.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $mn.archivo
    $m = [Pirotecnia]::Mina($ruta, $radioMinaFuente, $FOTOGRAMAS, $DETALLE,
                            [uint32]$mn.semilla, $mn.paleta, $mn.luz, [int]$mn.remaches)

    # Lo que hay que comprobar de una mina: que el cuerpo sea SIEMPRE el mismo
    # -es un objeto solido, no puede cambiar de tamano- y que la luz de verdad
    # parpadee, o sea que el brillo recorra un rango amplio.
    $op = @(); $br = @(); $ro = @()
    foreach ($fr in ($m -split ';')) { $q = $fr -split '\|'; $op += [int]$q[0]; $br += [double]$q[1]; $ro += [int]$q[2] }
    $cuerpoFijo = (($op | Measure-Object -Minimum).Minimum -eq ($op | Measure-Object -Maximum).Maximum)
    $rango = ($br | Measure-Object -Maximum).Maximum - ($br | Measure-Object -Minimum).Minimum
    # LA LAMPARA, CONTADA EN PIXELES. Antes solo se miraba el rango del brillo,
    # o sea la intencion, y la lampara podia no llegar al PNG sin que saltara
    # nada — y no llego durante toda su vida. Si esto sale a cero, no hay luz.
    $luzMin = ($ro | Measure-Object -Minimum).Minimum
    # Se exige un minimo de pixeles y no solo "mas de cero": la lampara es ahora
    # muy pequena y el riesgo ya no es que no llegue al PNG -eso esta arreglado-
    # sino que se quede en un punto suelto que no se lea.
    $ok = $cuerpoFijo -and ($rango -gt 0.8) -and ($luzMin -ge 4)
    Write-Host ("  {0,-10} {1}" -f $mn.id, $mn.archivo)
    Write-Host ("             brillo de la luz  {0}" -f (($br | ForEach-Object { $_.ToString('0.00') }) -join ' '))
    Write-Host ("             lampara: {0} px por fotograma   cuerpo fijo: {1}   rango del parpadeo: {2:N2}  -> {3}" -f `
                $luzMin, $cuerpoFijo, $rango, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

Write-Host "Auras"
Write-Host ""

foreach ($au in $AURAS) {
    if ($Solo -and $au.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $au.archivo
    $col = [int]([uint32]::Parse($au.color, [Globalization.NumberStyles]::HexNumber))
    $m = [Pirotecnia]::Aura($ruta, $radioAuraFuente, $DETALLE, $col,
                            [double]$au.fuerza, [double]$au.nucleo)
    $q = $m -split '\|'
    $medio = [double]$q[1]
    # Un aura tiene que ser un DEGRADADO: si el alfa medio se va arriba es un
    # disco de color, y si se va abajo no se ve.
    $ok = ($medio -gt 0.12) -and ($medio -lt 0.55)
    Write-Host ("  {0,-10} {1}" -f $au.id, $au.archivo)
    Write-Host ("             {0} px de resplandor, alfa medio {1:N2} -> {2}" -f `
                $q[0], $medio, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

Write-Host "Proyectiles: dibujo propio, 1 fotograma, a tamano de pantalla"
Write-Host ""

foreach ($pr in $PROYECTILES) {
    if ($Solo -and $pr.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $pr.archivo

    if ($pr.tipo -eq 'abeja') {
        $colorAla = [int]([uint32]::Parse($pr.ala, [Globalization.NumberStyles]::HexNumber))
        $m = [Pirotecnia]::Abeja($ruta, $ABEJA_ANCHO, $ABEJA_ALTO, $DETALLE, $pr.paleta, $colorAla)
        $q = $m -split '\|'
        $ok = ([int]$q[0] -gt 0) -and ([int]$q[1] -gt 0)
        Write-Host ("  {0,-10} {1}   {2}x{3} px" -f $pr.id, $pr.archivo, ($ABEJA_ANCHO * $DETALLE), ($ABEJA_ALTO * $DETALLE))
        Write-Host ("             cuerpo {0} px, alas {1} px -> {2}" -f $q[0], $q[1], $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    elseif ($pr.tipo -eq 'shuriken') {
        $m = [Pirotecnia]::Shuriken($ruta, $RADIO_SHURIKEN, $DETALLE, $pr.paleta,
                                    [double]$pr.afilado, [double]$pr.hueco, [double]$pr.cuerpo)
        $q = $m -split '\|'
        $llenado = [double]$q[1]
        # Una estrella de cuatro puntas ocupa bastante menos que su circulo: si
        # se acerca al lleno es que las puntas se han fundido en un disco, y si
        # baja mucho es que se ha quedado en cuatro pelos.
        $ok = ($llenado -gt 0.25) -and ($llenado -lt 0.70)
        Write-Host ("  {0,-10} {1}   {2}x{2} px" -f $pr.id, $pr.archivo, ($RADIO_SHURIKEN * 2 * $DETALLE))
        Write-Host ("             acero {0} px, {1:P0} del circulo -> {2}" -f $q[0], $llenado, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    elseif ($pr.tipo -eq 'asta') {
        if ($pr.id -eq 'pilum') { $w = $PILUM_ANCHO; $h = $PILUM_ALTO }
        elseif ($pr.id -eq 'lanza') { $w = $LANZA_ANCHO; $h = $LANZA_ALTO }
        else { $w = $VIROTE_ANCHO; $h = $VIROTE_ALTO }
        $colorPluma = [int]([uint32]::Parse($pr.pluma, [Globalization.NumberStyles]::HexNumber))
        $m = [Pirotecnia]::Asta($ruta, $w, $h, $DETALLE, $pr.paleta, $pr.acero, $colorPluma,
                                [double]$pr.fracPunta, [double]$pr.anchoPunta,
                                [double]$pr.fracVastago, [double]$pr.anchoAsta,
                                [double]$pr.fracPluma)
        $q = $m -split '\|'
        # Hierro y madera tienen que estar los dos: sin punta es un palo y sin
        # asta es un cuchillo volando.
        $ok = ([int]$q[0] -gt 0) -and ([int]$q[1] -gt 0)
        Write-Host ("  {0,-10} {1}   {2}x{3} px" -f $pr.id, $pr.archivo, ($w * $DETALLE), ($h * $DETALLE))
        Write-Host ("             hierro {0} px, madera {1} px, plumas {2} px -> {3}" -f $q[0], $q[1], $q[2], $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    elseif ($pr.tipo -eq 'trozo') {
        if ($pr.id -eq 'metralla') { $w = $METRALLA_LADO; $h = $METRALLA_LADO }
        else { $w = $PIEDRA_ANCHO; $h = $PIEDRA_ALTO }
        $m = [Pirotecnia]::Trozo($ruta, $w, $h, $DETALLE, [uint32]$pr.semilla, $pr.paleta,
                                 [int]$pr.vertices, [double]$pr.irregular)
        $ocupa = [double]([int]$m) / ($w * $h)
        # Un pedazo llena buena parte de su celda pero nunca toda: si se acerca
        # a uno es que ha salido un rectangulo.
        $ok = ($ocupa -gt 0.35) -and ($ocupa -lt 0.85)
        Write-Host ("  {0,-10} {1}   {2}x{3} px" -f $pr.id, $pr.archivo, ($w * $DETALLE), ($h * $DETALLE))
        Write-Host ("             {0} px, {1:P0} de la celda -> {2}" -f $m, $ocupa, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    elseif ($pr.tipo -eq 'lengua') {
        $m = [Pirotecnia]::Lengua($ruta, $LENGUA_ANCHO, $LENGUA_ALTO, $DETALLE, $pr.paleta)
        $ocupa = [double]([int]$m) / ($LENGUA_ANCHO * $LENGUA_ALTO)
        $ok = ($ocupa -gt 0.25) -and ($ocupa -lt 0.75)
        Write-Host ("  {0,-10} {1}   {2}x{3} px" -f $pr.id, $pr.archivo, ($LENGUA_ANCHO * $DETALLE), ($LENGUA_ALTO * $DETALLE))
        Write-Host ("             {0} px de fuego, {1:P0} de la celda -> {2}" -f $m, $ocupa, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    elseif ($pr.tipo -eq 'rosa') {
        $m = [Pirotecnia]::Rosa($ruta, $RADIO_ROSA, $DETALLE, $pr.paleta,
                                [double]$pr.afilado, [double]$pr.cuerpo, [double]$pr.corta)
        $q = $m -split '\|'
        $llenado = [double]$q[1]
        # Ocho puntas ocupan mas que cuatro, pero sigue siendo una estrella: si
        # se acerca al lleno es que las puntas se han fundido en un disco.
        $ok = ($llenado -gt 0.20) -and ($llenado -lt 0.70)
        Write-Host ("  {0,-10} {1}   {2}x{2} px" -f $pr.id, $pr.archivo, ($RADIO_ROSA * 2 * $DETALLE))
        Write-Host ("             bronce {0} px, {1:P0} del circulo -> {2}" -f $q[0], $llenado, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    elseif ($pr.tipo -eq 'kunai') {
        $colorMango = [int]([uint32]::Parse($pr.mango, [Globalization.NumberStyles]::HexNumber))
        $colorAnilla = [int]([uint32]::Parse($pr.anilla, [Globalization.NumberStyles]::HexNumber))
        $m = [Pirotecnia]::Kunai($ruta, $KUNAI_ANCHO, $KUNAI_ALTO, $DETALLE,
                                 $pr.paleta, $colorMango, $colorAnilla)
        $q = $m -split '\|'
        # La anilla es la pieza que lo distingue de un puñal: si no sale, no hay
        # kunai. Las otras dos van con ella.
        $ok = ([int]$q[0] -gt 0) -and ([int]$q[1] -gt 0) -and ([int]$q[2] -gt 0)
        Write-Host ("  {0,-10} {1}   {2}x{3} px" -f $pr.id, $pr.archivo, ($KUNAI_ANCHO * $DETALLE), ($KUNAI_ALTO * $DETALLE))
        Write-Host ("             hoja {0} px, mango {1} px, anilla {2} px -> {3}" -f $q[0], $q[1], $q[2], $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    elseif ($pr.tipo -eq 'columna') {
        $m = [Pirotecnia]::Columna($ruta, $COLUMNA_ANCHO, $COLUMNA_ALTO, $DETALLE,
                                   $pr.paleta, [int]$pr.estrias)
        $celda = $COLUMNA_ANCHO * $COLUMNA_ALTO
        $ocupa = [double]([int]$m) / $celda
        # Una columna es maciza y llena casi toda su celda: lo unico que sobra
        # son las cuatro esquinas del fuste, que es mas estrecho que el capitel.
        $ok = ($ocupa -gt 0.55) -and ($ocupa -lt 0.95)
        Write-Host ("  {0,-10} {1}   {2}x{3} px" -f $pr.id, $pr.archivo, ($COLUMNA_ANCHO * $DETALLE), ($COLUMNA_ALTO * $DETALLE))
        Write-Host ("             {0} px de marmol, {1:P0} de la celda -> {2}" -f $m, $ocupa, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    elseif ($pr.tipo -eq 'flecha') {
        $colorPluma = [int]([uint32]::Parse($pr.pluma, [Globalization.NumberStyles]::HexNumber))
        $m = [Pirotecnia]::Flecha($ruta, $FLECHA_ANCHO, $FLECHA_ALTO, $DETALLE,
                                  $pr.paleta, $pr.acero, $colorPluma)
        $q = $m -split '\|'
        # Las tres piezas tienen que estar. Una flecha sin plumas es un palo y
        # una sin punta es una cana.
        $ok = ([int]$q[0] -gt 0) -and ([int]$q[1] -gt 0) -and ([int]$q[2] -gt 0)
        Write-Host ("  {0,-10} {1}   {2}x{3} px" -f $pr.id, $pr.archivo, ($FLECHA_ANCHO * $DETALLE), ($FLECHA_ALTO * $DETALLE))
        Write-Host ("             punta {0} px, astil {1} px, plumas {2} px -> {3}" -f $q[0], $q[1], $q[2], $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    else {
        $colorTrapo = [int]([uint32]::Parse($pr.trapo, [Globalization.NumberStyles]::HexNumber))
        $colorEtiqueta = [int]([uint32]::Parse($pr.etiqueta, [Globalization.NumberStyles]::HexNumber))
        $m = [Pirotecnia]::Molotov($ruta, $LADO_MOLOTOV, $DETALLE, $pr.paleta, $pr.fuego,
                                   $colorTrapo, $colorEtiqueta)
        $q = $m -split '\|'
        # Tienen que estar las tres cosas: si falta la llama es una botella, si
        # falta la botella es una antorcha, y sin etiqueta es un frasco.
        $ok = ([int]$q[0] -gt 0) -and ([int]$q[1] -gt 0) -and ([int]$q[2] -gt 0)
        Write-Host ("  {0,-10} {1}   {2}x{2} px" -f $pr.id, $pr.archivo, ($LADO_MOLOTOV * $DETALLE))
        Write-Host ("             botella {0} px, llama {1} px, etiqueta {2} px -> {3}" -f $q[0], $q[1], $q[2], $(if ($ok) { 'OK' } else { 'REVISAR' }))
    }
    Write-Host ""
}

Write-Host "Redes: celda $ladoRed x $ladoRed, 1 fotograma (una red esta quieta)"
Write-Host ""

foreach ($rd in $REDES) {
    if ($Solo -and $rd.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $rd.archivo
    $m = [Pirotecnia]::Red($ruta, $radioRedFuente, [double]$MARGEN_CHARCO, $DETALLE,
                           [uint32]$rd.semilla, $rd.paleta, [double]$rd.paso,
                           [double]$rd.grosor, [double]$rd.nudo)
    $q = $m -split '\|'
    $cub = [int]$q[0]; $dentro = [int]$q[1]; $ocupa = [double]$q[2]
    # Una red es MALLA: ni disco ni telarana. Si ocupa casi todo el aro es que
    # los cordeles se han comido los huecos, y si ocupa poco no se vera.
    $ok = ($ocupa -gt 0.18) -and ($ocupa -lt 0.60)
    Write-Host ("  {0,-10} {1}" -f $rd.id, $rd.archivo)
    Write-Host ("             cordel {0} px de {1} del aro, malla al {2:P0} -> {3}" -f `
                $cub, $dentro, $ocupa, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

Write-Host "Lunas: celda $ladoLuna x $ladoLuna, una tira con el ciclo lunar entero"
Write-Host ""

foreach ($ln in $LUNAS) {
    if ($Solo -and $ln.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $ln.archivo
    $colorAura = [int]([uint32]::Parse($ln.aura, [Globalization.NumberStyles]::HexNumber))
    $m = [Pirotecnia]::Luna($ruta, $radioLunaFuente, $DETALLE, [uint32]$ln.semilla,
                            $ln.paleta, [double]$ln.fraccion, $colorAura,
                            [double]$ln.fuerzaAura, [int]$ln.crateres, [int]$ln.nFases)
    # LO QUE HAY QUE COMPROBAR DE UN CICLO LUNAR es la curva de iluminacion: la
    # fraccion de disco iluminado tiene que salir de 0 (nueva), subir hasta 1
    # (llena) a mitad de la tira y volver a 0. Si sale plana, las fases no se
    # estan dibujando; si no vuelve a bajar, solo se ha hecho media vuelta.
    $luz = @($m -split ';' | ForEach-Object { [double]$_ })
    $mitad = [int]($luz.Count / 2)
    $nueva = $luz[0]
    $llena = $luz[$mitad]
    $sube = $true
    for ($i = 1; $i -le $mitad; $i++) { if ($luz[$i] -lt $luz[$i-1] - 0.01) { $sube = $false } }
    $baja = $true
    for ($i = $mitad + 1; $i -lt $luz.Count; $i++) { if ($luz[$i] -gt $luz[$i-1] + 0.01) { $baja = $false } }
    $ok = ($nueva -lt 0.05) -and ($llena -gt 0.95) -and $sube -and $baja
    Write-Host ("  {0,-10} {1}   {2} fases" -f $ln.id, $ln.archivo, $ln.nFases)
    Write-Host ("             iluminacion  {0}" -f (($luz | ForEach-Object { $_.ToString('0.00') }) -join ' '))
    Write-Host ("             nueva {0:N2}  llena {1:N2}  sube: {2}  baja: {3}  -> {4}" -f `
                $nueva, $llena, $sube, $baja, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

# --- Ficha para el atlas ----------------------------------------------------
#
# El atlas lo genera procesar-assets.ps1 a partir de resources/, y estas hojas
# no salen de resources/: salen de aqui. Para no acoplar las dos herramientas
# -ni obligar a que la pesada corra cada vez que se retoca una paleta- el
# generador deja al lado un JSON con SUS medidas y procesar-assets.ps1 se
# limita a fundirlo en el atlas. Cada herramienta declara lo que sabe.
#
# Se escribe con el catalogo ENTERO aunque se haya usado -Solo: las medidas son
# las mismas para las cuatro y no dependen de haber regenerado el PNG. Si se
# escribiera solo lo regenerado, un `-Solo fuego` borraria del atlas las otras
# tres.
$ficha = [ordered]@{}
foreach ($e in $CATALOGO) {
    # `if` como expresion embebida no vale en PowerShell 5.1: va en dos pasos.
    $rl = if ($e.radioRef) { [int]$e.radioRef } else { $RADIO_DANYO }
    $rr = [int][math]::Round($rl * $FUENTE_POR_LOGICO)
    $lado = [int]([math]::Round($rr * $MARGEN)) * 2 * $DETALLE
    $ficha[$e.atlas] = [ordered]@{
        archivo = 'efectos/' + $e.archivo
        w = $lado; h = $lado
        anclaX = [int]($lado / 2); anclaY = [int]($lado / 2)
        frames = $FOTOGRAMAS
        plano  = $true
        # Cuanto sobresale la celda del radio de dano. Sin este numero el
        # efecto mentiria sobre donde acaba lo que mata.
        margen = $MARGEN
        # COMO SE COMPONE EN PANTALLA. Casi todos son luz -fuego, veneno,
        # ondas- y van sumando; la tierra no lo es y va en normal, tapando.
        # Lo decide quien hornea la hoja porque depende de la paleta que le
        # haya puesto, no del sitio donde se dibuje.
        aditivo = if ($e.ContainsKey('aditivo')) { [bool]$e.aditivo } else { $true }
        # RADIO DE LA BOLA EN CADA FOTOGRAMA, normalizado al radio de dano.
        # Va en el atlas y no como constante en el JS porque lo decide quien
        # hornea la hoja: si aqui se cambia el reparto de fotogramas, el motor
        # se entera por el dato y no hay dos sitios que se puedan desincronizar.
        # Con el, el motor escala la celda para que el filo del fuego caiga
        # EXACTAMENTE sobre el radio que mata, sin error de cuantizacion.
        # Reparto: media de lineal y geometrico. Ver el comentario del bucle de
        # fotogramas, donde estan los numeros que llevaron a elegirlo.
        radios = @(0..($FOTOGRAMAS - 1) | ForEach-Object {
            $p = $_ / ($FOTOGRAMAS - 1)
            [math]::Round(0.5 * (0.15 + 0.85 * $p) + 0.5 * (0.15 * [math]::Pow(1.0 / 0.15, $p)), 5)
        })
    }
}
# El sismo: como las explosiones (margen, radios, sin aditivo) pero con sus
# propios fotogramas. El reparto de radios es EL MISMO que usa Pirotecnia.Sismo
# al dibujar; si se cambia uno hay que cambiar el otro.
foreach ($sm in $SISMOS) {
    $rr = [int][math]::Round([int]$sm.radioRef * $FUENTE_POR_LOGICO)
    $lado = [int]([math]::Round($rr * $MARGEN)) * 2 * $DETALLE
    $ficha[$sm.atlas] = [ordered]@{
        archivo = 'efectos/' + $sm.archivo
        w = $lado; h = $lado
        anclaX = [int]($lado / 2); anclaY = [int]($lado / 2)
        frames = $FOTOGRAMAS_SISMO
        plano  = $true
        margen = $MARGEN
        aditivo = $false
        radios = @(0..($FOTOGRAMAS_SISMO - 1) | ForEach-Object {
            $p = $_ / ($FOTOGRAMAS_SISMO - 1)
            [math]::Round(0.5 * (0.15 + 0.85 * $p) + 0.5 * (0.15 * [math]::Pow(1.0 / 0.15, $p)), 5)
        })
    }
}

# Los charcos van a la misma ficha. Llevan `bucle` en vez de `radios`: no hay
# radio que seguir —no crecen— y en cambio el motor necesita saber que la tira
# se puede repetir, porque un charco dura hasta cinco segundos y la tira son
# dieciocho fotogramas. Sin `bucle`, el dibujado se quedaria en el ultimo.
foreach ($c in $CHARCOS) {
    $ficha[$c.atlas] = [ordered]@{
        archivo = 'efectos/' + $c.archivo
        w = $ladoCharco; h = $ladoCharco
        anclaX = [int]($ladoCharco / 2); anclaY = [int]($ladoCharco / 2)
        frames = $FOTOGRAMAS
        plano  = $true
        margen = $MARGEN_CHARCO
        aditivo = $false
        bucle  = $true
        fps    = 11
    }
}

# Los tajos: sin `margen` ni `radios`. El convenio de encuadre es distinto y ya
# lo conoce el motor —medio lado = alcance— así que no hay nada que negociar.
# Aditivos: un filo de acero o una sierra son un destello.
foreach ($t in $TAJOS) {
    $l = [int][math]::Round([int]$t.alcance * $FUENTE_POR_LOGICO) * 2 * $DETALLE
    $ficha[$t.atlas] = [ordered]@{
        archivo = 'efectos/' + $t.archivo
        w = $l; h = $l
        anclaX = [int]($l / 2); anclaY = [int]($l / 2)
        frames = $FOTOGRAMAS
        plano  = $true
        aditivo = $true
    }
}

# Las minas: `bucle` como los charcos, pero SIN `margen`. El motor las dibuja a
# tamano fijo, no ajustadas a ningun radio de daño.
foreach ($mn in $MINAS) {
    $ficha[$mn.atlas] = [ordered]@{
        archivo = 'efectos/' + $mn.archivo
        w = $ladoMina; h = $ladoMina
        anclaX = [int]($ladoMina / 2); anclaY = [int]($ladoMina / 2)
        frames = $FOTOGRAMAS
        plano  = $true
        aditivo = $false
        bucle  = $true
        # UN PARPADEO CADA MEDIO SEGUNDO. La tira son 12 fotogramas y trae UN
        # destello completo por vuelta, asi que los fps deciden el ritmo del
        # piloto: 12 / 24 = 0,5 s por ciclo. Estaba a 9, o sea un parpadeo cada
        # 1,33 s, y a ese ritmo una mina sembrada parecia apagada.
        fps    = 24
        # Radio del dibujo en unidades LOGICAS. Lo lee el motor para dibujarla
        # a su tamano real sin depender del radio del arma.
        radioDibujo = $RADIO_MINA
    }
}

# Las auras: ficha minima. El motor las escala a lo que le diga el arma.
foreach ($au in $AURAS) {
    $ficha[$au.atlas] = [ordered]@{
        archivo = 'efectos/' + $au.archivo
        w = $ladoAura; h = $ladoAura
        anclaX = [int]($ladoAura / 2); anclaY = [int]($ladoAura / 2)
        frames = 1
        plano  = $true
    }
}

# Los proyectiles: ficha minima -sin margen, sin bucle, sin radios- porque el
# motor los dibuja a su tamano en pixeles y no ajustados a ningun radio de dano.
foreach ($pr in $PROYECTILES) {
    if ($pr.tipo -eq 'abeja') { $w = $ABEJA_ANCHO * $DETALLE; $h = $ABEJA_ALTO * $DETALLE }
    elseif ($pr.tipo -eq 'flecha') { $w = $FLECHA_ANCHO * $DETALLE; $h = $FLECHA_ALTO * $DETALLE }
    elseif ($pr.tipo -eq 'kunai') { $w = $KUNAI_ANCHO * $DETALLE; $h = $KUNAI_ALTO * $DETALLE }
    elseif ($pr.tipo -eq 'asta') {
        if ($pr.id -eq 'pilum') { $w = $PILUM_ANCHO * $DETALLE; $h = $PILUM_ALTO * $DETALLE }
        elseif ($pr.id -eq 'lanza') { $w = $LANZA_ANCHO * $DETALLE; $h = $LANZA_ALTO * $DETALLE }
        else { $w = $VIROTE_ANCHO * $DETALLE; $h = $VIROTE_ALTO * $DETALLE }
    }
    elseif ($pr.tipo -eq 'trozo') {
        if ($pr.id -eq 'metralla') { $w = $METRALLA_LADO * $DETALLE; $h = $w }
        else { $w = $PIEDRA_ANCHO * $DETALLE; $h = $PIEDRA_ALTO * $DETALLE }
    }
    elseif ($pr.tipo -eq 'lengua') { $w = $LENGUA_ANCHO * $DETALLE; $h = $LENGUA_ALTO * $DETALLE }
    elseif ($pr.tipo -eq 'rosa') { $w = $RADIO_ROSA * 2 * $DETALLE; $h = $w }
    elseif ($pr.tipo -eq 'columna') { $w = $COLUMNA_ANCHO * $DETALLE; $h = $COLUMNA_ALTO * $DETALLE }
    elseif ($pr.tipo -eq 'shuriken') { $w = $RADIO_SHURIKEN * 2 * $DETALLE; $h = $w }
    else { $w = $LADO_MOLOTOV * $DETALLE; $h = $w }
    $ficha[$pr.atlas] = [ordered]@{
        archivo = 'efectos/' + $pr.archivo
        w = $w; h = $h
        anclaX = [int]($w / 2); anclaY = [int]($h / 2)
        frames = 1
        plano  = $true
    }
}

# Las redes: ficha de charco -mismo encuadre y mismo margen, porque son la misma
# clase de cosa- pero con UN fotograma y sin `bucle`: una red no hierve.
foreach ($rd in $REDES) {
    $ficha[$rd.atlas] = [ordered]@{
        archivo = 'efectos/' + $rd.archivo
        w = $ladoRed; h = $ladoRed
        anclaX = [int]($ladoRed / 2); anclaY = [int]($ladoRed / 2)
        frames = 1
        plano  = $true
        margen = $MARGEN_CHARCO
        aditivo = $false
    }
}

# Las lunas: como los orbitales que ya vienen de resources/ —un solo fotograma,
# sin margen, sin bucle— porque el motor las dibuja igual que a aquellos, a
# `radioEscudo` del arma y sin animar. Ver dibujarOrbitales en sistemas/armas.js.
foreach ($ln in $LUNAS) {
    $ficha[$ln.atlas] = [ordered]@{
        archivo = 'efectos/' + $ln.archivo
        w = $ladoLuna; h = $ladoLuna
        anclaX = [int]($ladoLuna / 2); anclaY = [int]($ladoLuna / 2)
        # Los fotogramas son FASES, no una animacion por reloj: no lleva `bucle`
        # ni `fps` porque no se recorren solos. Lo elige el motor por donde este
        # cada luna en su orbita (ver dibujarOrbitales en sistemas/armas.js).
        frames = [int]$ln.nFases
        plano  = $true
    }
}

$rutaFicha = Join-Path $Destino 'explosiones.json'
# CON '\' A MANO Y NO $rutaFicha: en Mac/Linux el separador es '/', y la
# concatenacion literal escribia "assets/efectos\explosiones.json" -un
# fichero suelto con esa barra invertida en el NOMBRE, no una carpeta- en vez
# de sobreescribir el real. $rutaFicha ya sale bien formado de Join-Path.
[System.IO.File]::WriteAllText((Resolve-Path $Destino).Path + [System.IO.Path]::DirectorySeparatorChar + 'explosiones.json',
    ($ficha | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding $false))
Write-Host "Ficha de atlas: $rutaFicha"
Write-Host ""
Write-Host "Hecho. Comprobar con: .\herramientas\ver-assets.ps1 $Destino"

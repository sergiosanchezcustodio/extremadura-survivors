# Empaqueta el juego como aplicacion de escritorio para Windows.
#
# Sale una carpeta que se copia a cualquier PC con Windows y funciona a doble
# clic: sin navegador, sin servidor, sin instalar nada. Es lo que pidio Sergio.
#
# COMO. El juego es una pagina web y sigue siendolo; lo que se hace es meterla
# dentro de NW.js, que es Chromium empaquetado como aplicacion. El codigo del
# juego NO se toca ni se compila: los mismos index.html, js/ y assets/ que sirve
# `python -m http.server` van tal cual dentro del ejecutable. Si algun dia se
# quiere dejar de empaquetar, se borra esta carpeta y no hay nada mas que
# deshacer, porque nada del juego sabe que esto existe.
#
# POR QUE NW.js Y NO ELECTRON. Los dos hacen lo mismo y ocupan lo mismo. NW.js
# se monta copiando ficheros y ya; Electron obliga a instalar Node y npm en la
# maquina para empaquetar, y este proyecto lleva desde el primer dia sin cadena
# de compilacion. Empaquetar no era razon para estrenar una.
#
# TAMANO: unos 530 MB en disco, 200 MB comprimido. No es el juego —que son 30
# MB— sino Chromium entero, que es lo que le permite funcionar en un PC donde no
# hay navegador. Es el precio de la opcion autosuficiente.
#
# NO ENTRA EN GIT. Una sola DLL de Chromium pesa 297 MB y GitHub rechaza
# cualquier fichero de mas de 100. Ademas un binario en el historial se queda
# ahi para siempre y cada version nueva suma otros tantos. Lo que se versiona es
# ESTE script; el ejecutable se genera cuando hace falta y se distribuye como
# release o por donde convenga. Ver .gitignore.
#
#   powershell -ExecutionPolicy Bypass -File herramientas\empaquetar.ps1
#
# La primera vez descarga NW.js (200 MB) y lo deja en cache; las siguientes
# tardan segundos.

param(
    # Version de NW.js. La lista esta en https://nwjs.io/versions.json
    [string]$Version = 'v0.114.2',
    # Comprimir el resultado en un zip listo para enviar. Tarda un par de
    # minutos, asi que no se hace salvo que se pida.
    [switch]$Zip,
    # Refrescar SOLO el juego dentro de una build que ya existe, sin volver a
    # copiar el runtime de NW.js.
    [switch]$Actualizar
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$RAIZ    = Split-Path -Parent $PSScriptRoot
$CACHE   = Join-Path $PSScriptRoot 'lanzador\cache'
$SALIDA  = Join-Path $RAIZ 'dist\extremadura-survivors-win64'
$APP     = Join-Path $SALIDA 'package.nw'

# ---------------------------------------------------------------------------
# ACTUALIZAR: solo el juego, sin tocar el runtime
# ---------------------------------------------------------------------------
#
# El ejecutable son 520 MB de los que 519 son Chromium y uno es el juego. Cuando
# lo unico que ha cambiado es el juego -que es SIEMPRE, salvo la primera vez-
# rehacerlo entero es copiar medio giga para nada.
#
# Y hace falta un atajo porque si no pasa lo que ya paso: se prueba con el .exe
# de hace dias, se ve el fallo que ya estaba arreglado, y se busca en el sitio
# equivocado. Una build vieja miente igual que un dato viejo.
if ($Actualizar) {
    if (-not (Test-Path $APP)) {
        throw "No hay build que actualizar en $APP. Genera una primero sin -Actualizar."
    }
    foreach ($d in @('css', 'js', 'assets')) {
        $dst = Join-Path $APP $d
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
        Copy-Item (Join-Path $RAIZ $d) $APP -Recurse -Force
    }
    Copy-Item (Join-Path $RAIZ 'index.html') $APP -Force
    "Juego actualizado dentro de $APP"
    "El runtime de NW.js no se ha tocado."
    return
}

$EXE     = 'Extremadura Survivors.exe'

# Recorte del icono sobre la ilustracion del titulo: el templo con la espada y
# la corona de laurel, arriba del todo. Medido sobre `Main_menu.jpg` (1672x941),
# igual que las posiciones del menu en js/ui/pantallas.js.
#
# APUNTA A LA LAMINA QUE USA EL JUEGO, y esto ya se rompio una vez: sacaba el
# icono de `Nueva_Pantalla_Start.jpg`, una ilustracion que dejo de usarse hace
# dos relevos y que un dia desaparecio de resources/. Empaquetar habria fallado
# al llegar aqui, con el runtime de NW.js ya descargado.
#
# Al repintar el titulo hay que volver a mirar este recorte: son pixeles de la
# imagen, como todo lo demas que se mide sobre ella.
$ICONO_SRC = Join-Path $RAIZ 'resources\menus\Main_menu.jpg'
$ICONO_X = 678; $ICONO_Y = 14; $ICONO_LADO = 288

# ---------------------------------------------------------------------------
# 1. Runtime de NW.js
# ---------------------------------------------------------------------------
$zipNw = Join-Path $CACHE "nwjs-$Version-win-x64.zip"
New-Item -ItemType Directory -Force -Path $CACHE | Out-Null

if (-not (Test-Path $zipNw)) {
    $url = "https://dl.nwjs.io/$Version/nwjs-$Version-win-x64.zip"
    "Descargando NW.js $Version (200 MB, solo la primera vez)..."
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $zipNw -TimeoutSec 1800 -UseBasicParsing
}
"Runtime en cache: {0:N0} MB" -f ((Get-Item $zipNw).Length / 1MB)

# El juego no puede estar corriendo o no se deja sobrescribir el ejecutable.
Get-Process nw -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process 'Extremadura Survivors' -ErrorAction SilentlyContinue | Stop-Process -Force

if (Test-Path $SALIDA) { Remove-Item $SALIDA -Recurse -Force }
New-Item -ItemType Directory -Force -Path $SALIDA | Out-Null

$tmp = Join-Path $CACHE 'extraido'
if (-not (Test-Path $tmp)) {
    Expand-Archive -Path $zipNw -DestinationPath $tmp -Force
}
$runtime = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
Copy-Item "$runtime\*" $SALIDA -Recurse -Force

# Idiomas. NW.js trae los cincuenta y pico de Chromium y el juego esta en
# espanol; se queda con el espanol y el ingles, que es lo que puede pedir el
# sistema operativo si esta en otro idioma. Son diez megas de nada, pero son
# diez megas de ficheros que no se van a abrir nunca.
Get-ChildItem (Join-Path $SALIDA 'locales') -Filter '*.pak' |
    Where-Object { $_.BaseName -notin @('es', 'es-419', 'en-US', 'en-GB') } |
    Remove-Item -Force

# ---------------------------------------------------------------------------
# 2. El juego, dentro de package.nw
# ---------------------------------------------------------------------------
# `package.nw` es donde NW.js busca la aplicacion. Va como CARPETA y no como zip
# para que se pueda entrar a mirar -y a parchear una linea- sin desempaquetar
# nada, que en un juego que se sigue tocando cada semana vale mas que los pocos
# megas que ahorraria comprimirlo.
New-Item -ItemType Directory -Force -Path $APP | Out-Null
foreach ($d in @('css', 'js', 'assets')) {
    Copy-Item (Join-Path $RAIZ $d) $APP -Recurse -Force
}
Copy-Item (Join-Path $RAIZ 'index.html') $APP -Force
Copy-Item (Join-Path $PSScriptRoot 'lanzador\package.json') $APP -Force

# El manual, al lado del ejecutable y no dentro de la aplicacion: es para leerlo
# desde el escritorio, no desde el juego.
$manual = Join-Path $RAIZ 'manual'
if (Test-Path $manual) { Copy-Item $manual $SALIDA -Recurse -Force }

# ---------------------------------------------------------------------------
# 3. Icono
# ---------------------------------------------------------------------------
# Se recorta de la propia ilustracion del titulo. Salen dos cosas: un PNG que
# usa la ventana (barra de tareas y esquina) y un ICO que se incrusta en el
# ejecutable para que el Explorador tampoco ensene el icono de NW.js.
$src = New-Object System.Drawing.Bitmap($ICONO_SRC)
$rect = New-Object System.Drawing.Rectangle($ICONO_X, $ICONO_Y, $ICONO_LADO, $ICONO_LADO)
$crop = $src.Clone($rect, $src.PixelFormat)

$pngs = @{}
foreach ($lado in @(256, 64, 48, 32, 16)) {
    $b = New-Object System.Drawing.Bitmap($lado, $lado)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($crop, 0, 0, $lado, $lado)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs[$lado] = $ms.ToArray()
    $ms.Dispose(); $b.Dispose()
}
$crop.Dispose(); $src.Dispose()
[System.IO.File]::WriteAllBytes((Join-Path $APP 'icono.png'), $pngs[256])

# ICO con los cinco tamanos. El formato admite PNG dentro desde Windows Vista,
# asi que no hay que convertir a mapa de bits ni montar mascaras.
$icoPath = Join-Path $CACHE 'icono.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$lados = @(256, 64, 48, 32, 16)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$lados.Count)
$offset = 6 + 16 * $lados.Count
foreach ($lado in $lados) {
    $bw.Write([byte]($(if ($lado -ge 256) { 0 } else { $lado })))
    $bw.Write([byte]($(if ($lado -ge 256) { 0 } else { $lado })))
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$pngs[$lado].Length)
    $bw.Write([uint32]$offset)
    $offset += $pngs[$lado].Length
}
foreach ($lado in $lados) { $bw.Write($pngs[$lado]) }
$bw.Close(); $fs.Close()

# ---------------------------------------------------------------------------
# 4. El ejecutable
# ---------------------------------------------------------------------------
Rename-Item (Join-Path $SALIDA 'nw.exe') $EXE
$rutaExe = Join-Path $SALIDA $EXE

# Se le cambia el icono al ejecutable con la API de recursos de Windows, sin
# herramientas de terceros: rcedit haria esto mismo, pero seria un binario mas
# que descargar y que confiar cada vez que se compila.
#
# El grupo de iconos con ID 1 es el que Windows ensena para el fichero. Se
# reescribe entero -el grupo y las cinco imagenes- en una sola transaccion.
$firma = @'
using System;
using System.Runtime.InteropServices;
public static class Recursos {
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr BeginUpdateResource(string file, bool deleteExisting);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool UpdateResource(IntPtr h, IntPtr type, IntPtr name,
        ushort lang, byte[] data, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool EndUpdateResource(IntPtr h, bool discard);
}
'@
if (-not ('Recursos' -as [type])) { Add-Type -TypeDefinition $firma }

$RT_ICON = [IntPtr]3
$RT_GROUP_ICON = [IntPtr]14
$LANG = 1033

# GRPICONDIR: la cabecera del ICO pero con un ID de recurso de dos bytes en
# lugar del desplazamiento de cuatro.
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$lados.Count)
for ($i = 0; $i -lt $lados.Count; $i++) {
    $lado = $lados[$i]
    $bw.Write([byte]($(if ($lado -ge 256) { 0 } else { $lado })))
    $bw.Write([byte]($(if ($lado -ge 256) { 0 } else { $lado })))
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$pngs[$lado].Length)
    $bw.Write([uint16]($i + 1))
}
$bw.Flush()
$grupo = $ms.ToArray()
$bw.Close(); $ms.Close()

$h = [Recursos]::BeginUpdateResource($rutaExe, $false)
if ($h -eq [IntPtr]::Zero) { throw "No se pudo abrir $EXE para escribir recursos" }
for ($i = 0; $i -lt $lados.Count; $i++) {
    $datos = $pngs[$lados[$i]]
    [void][Recursos]::UpdateResource($h, $RT_ICON, [IntPtr]($i + 1), $LANG, $datos, $datos.Length)
}
[void][Recursos]::UpdateResource($h, $RT_GROUP_ICON, [IntPtr]1, $LANG, $grupo, $grupo.Length)
if (-not [Recursos]::EndUpdateResource($h, $false)) { throw 'Fallo al escribir el icono en el ejecutable' }

# ---------------------------------------------------------------------------
# 5. Nota para quien reciba la carpeta
# ---------------------------------------------------------------------------
@"
EMERITA SURVIVORS
=================

Doble clic en "$EXE" y a jugar. No hay que instalar nada.

La carpeta entera es el juego: si se copia a otro PC con Windows, funciona
igual. No hace falta navegador ni conexion.

  - El progreso (denarios, potenciadores, mascotas) se guarda solo, en el
    perfil del usuario de Windows. Se conserva al actualizar la carpeta.
  - Mandos: se detectan al pulsar A. Hasta cuatro jugadores.
  - El manual esta en manual\manual-jugador.pdf

Generado con herramientas\empaquetar.ps1 desde el codigo fuente.
"@ | Out-File (Join-Path $SALIDA 'LEEME.txt') -Encoding utf8

# ---------------------------------------------------------------------------
# 6. Resumen
# ---------------------------------------------------------------------------
$total = (Get-ChildItem $SALIDA -Recurse -File | Measure-Object Length -Sum).Sum
"", "Aplicacion en: $SALIDA"
"Ejecutable:    $EXE"
"Tamano:        {0:N0} MB" -f ($total / 1MB)

if ($Zip) {
    $rutaZip = Join-Path $RAIZ 'dist\extremadura-survivors-win64.zip'
    if (Test-Path $rutaZip) { Remove-Item $rutaZip -Force }
    "Comprimiendo..."
    Compress-Archive -Path $SALIDA -DestinationPath $rutaZip -CompressionLevel Optimal
    "Zip:           {0}  ({1:N0} MB)" -f $rutaZip, ((Get-Item $rutaZip).Length / 1MB)
}

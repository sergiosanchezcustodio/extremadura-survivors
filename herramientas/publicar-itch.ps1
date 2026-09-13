# Publica la build WEB en itch.io.
#
#   powershell -ExecutionPolicy Bypass -File herramientas\publicar-itch.ps1
#
# A DIFERENCIA de subir el zip a mano por el navegador, esto sube la CARPETA y
# butler solo manda lo que ha cambiado: la primera vez son 27 MB, y a partir de
# ahi cambiar una ilustracion sube esa ilustracion, no el juego entero.
#
# LA PRIMERA VEZ HAY QUE IDENTIFICARSE, y eso no lo puede hacer el script:
#
#   herramientas\butler\butler.exe login
#
# Abre el navegador para que autorices. Vale la cuenta de itch.io con la que
# entras normalmente -si entras con GitHub, esa-, porque lo que autorizas es a
# butler, no a GitHub. La credencial queda guardada en tu perfil de usuario y no
# hay que repetirlo.
#
# OJO CON LO QUE SIGNIFICA ESTE COMANDO: al terminar, el juego que hay publicado
# en itch.io ES el de esta carpeta. No hay paso intermedio ni borrador.

param(
    # Que subir. Por defecto la build web recien hecha.
    [string]$Origen = '',
    # Solo preparar y decir que se subiria, sin subir nada.
    [switch]$Simular
)

$ErrorActionPreference = 'Stop'
$RAIZ = Split-Path -Parent $PSScriptRoot
$OBJETIVO = 'sergiosanchezcustodio/extremadura-survivors:html5'

# El canal se llama `html5` a proposito: itch.io mira el nombre del canal para
# decidir que una build se juega EN EL NAVEGADOR. Un canal llamado `web` o
# `windows` daria una descarga, no un juego jugable en la pagina.

$BUTLER = Join-Path $PSScriptRoot 'butler\butler.exe'

# --- butler, si no esta ------------------------------------------------------
if (-not (Test-Path $BUTLER)) {
    "butler no esta; bajandolo de itch.io..."
    $dir = Split-Path -Parent $BUTLER
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $zip = Join-Path $dir 'butler.zip'
    # El host es broth.itch.ZONE. El .ovh que aparece en tutoriales viejos ya no
    # existe -devuelve dominio inexistente en cualquier DNS-, y el error que da
    # parece un corte de red cuando en realidad es una direccion muerta.
    Invoke-WebRequest -Uri 'https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default' `
                      -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $dir -Force
    Remove-Item $zip -Force
}

& $BUTLER version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "butler no arranca: $BUTLER" }

# --- ¿hay sesion? ------------------------------------------------------------
#
# Se mira PRIMERO el fichero de credenciales y solo despues se pregunta a la
# API. El motivo es que `butler status` sobre un juego publico responde aunque
# no haya sesion, asi que por si solo no distingue "no estoy identificado" de
# "ese canal todavia no existe" -- que es justo lo que contesta antes de la
# primera subida.
$CREDS = Join-Path $env:USERPROFILE '.config\itch\butler_creds'
& $BUTLER status $OBJETIVO 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $CREDS)) {
    ""
    "No hay sesion de butler. Ejecuta UNA vez:"
    ""
    "    $BUTLER login"
    ""
    "y vuelve a lanzar este script."
    exit 1
}

# --- La build ----------------------------------------------------------------
if ($Origen -eq '') {
    $Origen = Join-Path $RAIZ 'dist\web'
    "Generando la build web..."
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'empaquetar-web.ps1') | Out-Null
}
if (-not (Test-Path (Join-Path $Origen 'index.html'))) {
    throw "En $Origen no hay index.html: itch.io no sabria que abrir."
}

# --- La version --------------------------------------------------------------
#
# Sale del commit, no de un numero a mano: asi lo que aparece en itch.io se
# puede volver a encontrar en el historial. Si hay cambios sin commitear se
# marca, porque entonces lo subido NO corresponde a ningun commit.
$sha = (& git -C $RAIZ rev-parse --short HEAD).Trim()
$sucio = (& git -C $RAIZ status --porcelain) -ne $null
$version = (Get-Date -Format 'yyyy.MM.dd') + '-' + $sha
if ($sucio) {
    $version += '-sucio'
    "AVISO: hay cambios sin commitear. La version subida no correspondera a ningun commit."
}

"", "Origen:   $Origen", "Destino:  $OBJETIVO", "Version:  $version", ""

if ($Simular) {
    "Simulacion: no se sube nada."
    exit 0
}

& $BUTLER push $Origen $OBJETIVO --userversion $version
if ($LASTEXITCODE -ne 0) { throw "butler push fallo" }

""
"Subido. El estado del procesado:"
& $BUTLER status $OBJETIVO
""
"Si es la PRIMERA subida, queda un paso en la web que butler no puede dar:"
"  itch.io > Edit game > el tamano del embed a 960x540 (o multiplo de 480x270)."

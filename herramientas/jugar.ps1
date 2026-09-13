# Arranca el juego en este PC: levanta el servidor local y abre el navegador.
#
# El juego usa modulos ES6 nativos, y el navegador los bloquea si la pagina se
# abre con doble clic sobre index.html (file://). Por eso hace falta servirlo por
# http, aunque sea desde la propia maquina. Esto es lo unico que hace el script:
# `python -m http.server` en la raiz del repo y abrir la pagina.
#
#   powershell -ExecutionPolicy Bypass -File herramientas\jugar.ps1
#
# O doble clic en herramientas\jugar.bat, que es lo mismo sin escribir nada.
#
# Al cerrar la ventana (Ctrl+C) se para el servidor. Si el puerto ya esta
# ocupado por un servidor anterior, se reutiliza en lugar de fallar.
#
# Esto es para DESARROLLO. La version que se le pasa a alguien sin Python ni
# navegador sale de herramientas\empaquetar.ps1, que mete el juego dentro de
# NW.js; con -App este script abre ese ejecutable si ya esta generado.

param(
    [int]$Puerto = 8000,
    # No abrir el navegador, solo dejar el servidor puesto.
    [switch]$SinNavegador,
    # Abrir la aplicacion empaquetada (dist\) en vez del navegador.
    [switch]$App
)

$ErrorActionPreference = 'Stop'
$RAIZ = Split-Path -Parent $PSScriptRoot

# ---------------------------------------------------------------------------
# Aplicacion empaquetada
# ---------------------------------------------------------------------------
if ($App) {
    $exe = Join-Path $RAIZ 'dist\extremadura-survivors-win64\Extremadura Survivors.exe'
    if (-not (Test-Path $exe)) {
        throw "No hay version empaquetada. Generala con: herramientas\empaquetar.ps1"
    }
    Start-Process $exe
    "Abriendo la aplicacion empaquetada."
    return
}

# ---------------------------------------------------------------------------
# Servidor
# ---------------------------------------------------------------------------
# ¿Hay ya algo escuchando en el puerto? Puede ser un servidor de una sesion
# anterior; se aprovecha en lugar de reventar con "address already in use".
$ocupado = $null -ne (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue)

$servidor = $null
if ($ocupado) {
    "Puerto $Puerto ya en uso: se reutiliza el servidor que hay levantado."
} else {
    # `python` a secas puede ser el alias de la Store que abre la tienda en vez
    # de ejecutar nada; el lanzador `py` es el fiable cuando esta.
    $python = $null
    foreach ($c in @('py', 'python', 'python3')) {
        $cmd = Get-Command $c -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -notlike '*WindowsApps*') { $python = $cmd.Source; break }
    }
    if (-not $python) {
        throw "No se encuentra Python. Instalalo desde https://python.org o usa -App."
    }

    $servidor = Start-Process -FilePath $python `
        -ArgumentList '-m', 'http.server', $Puerto `
        -WorkingDirectory $RAIZ -WindowStyle Hidden -PassThru

    # Esperar a que acepte conexiones antes de abrir el navegador; si no, la
    # primera carga sale en blanco y hay que refrescar a mano.
    $listo = $false
    foreach ($i in 1..40) {
        Start-Sleep -Milliseconds 100
        if ($servidor.HasExited) { throw "El servidor se cerro solo (puerto $Puerto)." }
        if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) {
            $listo = $true; break
        }
    }
    if (-not $listo) { throw "El servidor no respondio en el puerto $Puerto." }
    "Servidor en http://localhost:$Puerto  (PID $($servidor.Id))"
}

if (-not $SinNavegador) { Start-Process "http://localhost:$Puerto" }

# ---------------------------------------------------------------------------
# Esperar y recoger
# ---------------------------------------------------------------------------
# Solo se para el servidor si lo ha arrancado este script: si se reutilizo uno
# de otra sesion, no es nuestro para cerrarlo.
if ($servidor) {
    "Ctrl+C para parar el servidor."
    try {
        while (-not $servidor.HasExited) { Start-Sleep -Seconds 1 }
    } finally {
        if (-not $servidor.HasExited) {
            Stop-Process -Id $servidor.Id -Force -ErrorAction SilentlyContinue
            "", "Servidor parado."
        }
    }
}

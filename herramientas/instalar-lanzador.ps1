# ---------------------------------------------------------------------------
# instalar-lanzador.ps1 - Deja el comando `extremadura` listo en esta maquina.
#
# SE LLAMABA `emerita` y cambio con el nombre del juego. El .cmd viejo NO se
# borra solo: si sigue en la carpeta de destino, seguira funcionando y apuntando
# a la ruta ANTIGUA del repositorio, que ya no existe. Hay que borrarlo a mano
# una vez (ver el aviso del final).
#
# POR QUE ESTA AQUI. El lanzador vive en %USERPROFILE%\.local\bin, fuera del
# repositorio, asi que no lo respalda GitHub: una reinstalacion de Windows o un
# ordenador nuevo se lo llevan por delante. Lo que se versiona es este script,
# que lo GENERA; asi no hay dos copias que puedan desincronizarse.
#
# La ruta del repo no esta escrita a mano: sale de donde esta este fichero, asi
# que el lanzador funciona igual si el repo se clona en otro sitio.
#
#   .\herramientas\instalar-lanzador.ps1
#   .\herramientas\instalar-lanzador.ps1 -AgregarAlPath   si .local\bin no esta en el PATH
#   .\herramientas\instalar-lanzador.ps1 -Ajustes         ademas fija el esfuerzo recomendado
#   .\herramientas\instalar-lanzador.ps1 -Agente codex    el lanzador abre Codex y no Claude
#
# CON QUE AGENTE. Por defecto `extremadura` abre Claude Code; con `-Agente codex`
# abre el CLI de Codex de OpenAI, que lee AGENTS.md igual que Claude lee
# CLAUDE.md (ver docs/migrar-a-codex.md). Se reinstala con el otro valor para
# volver. En los dos, `extremadura -c` retoma la ultima sesion.
# ---------------------------------------------------------------------------
param(
    [string]$Destino = (Join-Path $env:USERPROFILE '.local\bin'),
    [switch]$AgregarAlPath,
    [switch]$Ajustes,
    [ValidateSet('claude', 'codex')]
    [string]$Agente = 'claude'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

# --- 1. El lanzador ---------------------------------------------------------
# Sin argumentos abre sesion NUEVA. Es lo contrario de lo que hacia hasta el
# 15/08/2026, y el cambio no es capricho: con `--continue` por defecto nunca se
# empezaba limpio, una sola sesion vivio trece dias y su contexto llego a 940k
# tokens que se releian en cada llamada. Ver "Coste de contexto" en CLAUDE.md.
if ($Agente -eq 'codex') {
# `-c` en Codex es otra cosa (sobrescribir una clave de config), asi que aqui se
# traduce: `extremadura -c` es `codex resume --last`, como en el de Claude.
$cmd = @"
@echo off
REM Lanzador de Codex para Extremadura Survivors.
REM GENERADO por herramientas\instalar-lanzador.ps1 -Agente codex - no editar a mano.
REM Sin argumentos: abre una sesion NUEVA, con el contexto limpio.
REM   extremadura -c        retoma la ultima sesion (codex resume --last)
REM   extremadura resume    elige sesion de una lista
REM Cualquier otro argumento se pasa tal cual a codex.
cd /d "$repo"
if "%~1"=="" (codex) else if "%~1"=="-c" (codex resume --last) else (codex %*)
"@
} else {
$cmd = @"
@echo off
REM Lanzador de Claude Code para Extremadura Survivors.
REM GENERADO por herramientas\instalar-lanzador.ps1 - no editar a mano.
REM Sin argumentos: abre una sesion NUEVA, con el contexto limpio.
REM   extremadura -c        retoma la ultima sesion (contexto acumulado: caro)
REM   extremadura --resume  elige sesion de una lista
REM Cualquier otro argumento se pasa tal cual a claude.
cd /d "$repo"
if "%~1"=="" (claude --permission-mode auto) else (claude --permission-mode auto %*)
"@
}

if (-not (Test-Path -LiteralPath $Destino)) {
    New-Item -ItemType Directory -Force -Path $Destino | Out-Null
    Write-Output "Creada la carpeta $Destino"
}

$ruta = Join-Path $Destino 'extremadura.cmd'
$previo = if (Test-Path -LiteralPath $ruta) { Get-Content -LiteralPath $ruta -Raw } else { $null }

# ASCII y no UTF8: un .cmd con BOM hace que cmd.exe se atragante en la primera
# linea. Por eso los comentarios de arriba van sin tildes.
Set-Content -LiteralPath $ruta -Value $cmd -Encoding ascii

if ($null -eq $previo)            { Write-Output "Instalado  $ruta" }
elseif ($previo -ne ($cmd + "`r`n")) { Write-Output "Actualizado $ruta" }
else                              { Write-Output "Sin cambios $ruta" }
Write-Output "  apunta a $repo, y abre $Agente"

# --- 2. El PATH -------------------------------------------------------------
# Se comprueba contra el PATH PERSISTENTE del usuario y no contra $env:PATH: el
# de la sesion actual puede tenerlo por herencia y aun asi faltar en el registro,
# que es lo que veria una consola nueva.
$pathUsuario = [Environment]::GetEnvironmentVariable('Path', 'User')
$enPath = ($pathUsuario -split ';' | Where-Object { $_.TrimEnd('\') -ieq $Destino.TrimEnd('\') }).Count -gt 0

if ($enPath) {
    Write-Output "PATH: ya contiene $Destino"
} elseif ($AgregarAlPath) {
    [Environment]::SetEnvironmentVariable('Path', ($pathUsuario.TrimEnd(';') + ';' + $Destino), 'User')
    Write-Output "PATH: anadido $Destino (abre una consola nueva para que aplique)"
} else {
    Write-Output "PATH: FALTA $Destino"
    Write-Output "      vuelve a ejecutar con -AgregarAlPath, o anadelo a mano."
}

# --- 3. Ajustes de Claude Code (opcional) -----------------------------------
# Solo con Claude: Codex guarda los suyos en %USERPROFILE%\.codex\config.toml y
# el proyecto trae su parte en .codex\config.toml.
# Solo se toca la clave del esfuerzo y se respeta todo lo demas: este fichero es
# GLOBAL del usuario, no del proyecto, y sobrescribirlo entero se llevaria por
# delante la configuracion de los otros repos.
if ($Ajustes -and $Agente -eq 'claude') {
    $cfg = Join-Path $env:USERPROFILE '.claude\settings.json'
    if (Test-Path -LiteralPath $cfg) {
        $j = Get-Content -LiteralPath $cfg -Raw | ConvertFrom-Json
        $antes = $j.effortLevel
        if ($j.PSObject.Properties.Name -contains 'effortLevel') { $j.effortLevel = 'high' }
        else { $j | Add-Member -NotePropertyName effortLevel -NotePropertyValue 'high' }
        $j | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $cfg -Encoding utf8
        Write-Output "Ajustes: effortLevel $antes -> high"
    } else {
        Write-Output "Ajustes: no existe $cfg, no se toca nada."
    }
}

Write-Output ""
Write-Output "Listo. `extremadura` abre sesion nueva; `extremadura -c` retoma la anterior."

# El lanzador viejo, si sigue ahi, apunta a una carpeta que ya no existe.
$viejo = Join-Path $Destino 'emerita.cmd'
if (Test-Path -LiteralPath $viejo) {
    Write-Output ""
    Write-Output "OJO: sigue existiendo $viejo, del nombre anterior, y apunta a la"
    Write-Output "     ruta vieja del repositorio. Borralo:  Remove-Item '$viejo'"
}

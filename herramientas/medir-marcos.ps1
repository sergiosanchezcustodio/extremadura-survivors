# DONDE CAEN LOS CUATRO MARCOS de la pantalla de seleccion de personaje.
#
#   .\herramientas\medir-marcos.ps1
#   .\herramientas\medir-marcos.ps1 -Ruta assets\menus\seleccion.jpg
#
# La hermana de medir-lapida.ps1, y existe por el mismo motivo. La ilustracion
# de seleccion (assets\menus\seleccion.jpg) trae cuatro marcos
# pintados y VACIOS; dentro de cada uno el juego dibuja por codigo el retrato
# del heroe que toque (ver ui/pantallas.js). Para eso hacen falta cuatro
# rectangulos en pixeles de la imagen, y sacarlos a ojo con un editor es como
# se llega a un retrato descentrado que nadie sabe explicar.
#
# ESTO SE VUELVE A PASAR CADA VEZ QUE SERGIO REPINTE LA LAMINA. Un repintado que
# mueva los marcos -o que reexporte a otro tamano- no da ningun error: los
# retratos siguen saliendo, solo que fuera de su hueco.
#
# COMO LOS ENCUENTRA. El interior de un marco es NEGRO PLANO, y es lo unico de
# la escena que lo es: el cielo es azul saturado, la piedra es gris calido y las
# ruinas del fondo, aun oscuras, tienen color. Asi que un pixel cuenta como
# "interior" si es muy oscuro Y casi gris (poca diferencia entre sus canales) Y
# ademas CALIDO -su rojo no baja de su azul-. Lo tercero es lo que de verdad
# separa: medido sobre la lamina, el interior de un marco es (32,29,24) y todo
# lo oscuro que NO es marco tira a azul -el cielo (8,22,47), la pilastra
# (17,24,33), la escalera del fondo (43,57,73)-. Con esa mascara, las columnas
# con muchos pixeles de interior son los marcos y los valles entre ellas son
# las pilastras.
param(
    # LA LAMINA HORNEADA, no la fuente de resources/. Es donde viven de verdad
    # los numeros: ARCO_* en js/ui/pantallas.js son pixeles de la imagen que
    # CARGA EL JUEGO, y desde que procesar-assets.ps1 reduce la fuente a 1920 esa
    # ya no mide lo mismo que el original de Sergio.
    [string]$Ruta = 'assets\menus\seleccion.jpg',
    # Umbrales de la mascara. Se exponen porque son lo primero que hay que tocar
    # si algun dia la lamina cambia de iluminacion.
    # 34 y no mas: el empedrado del suelo mide (37,34,36) y tambien es casi
    # gris, asi que es el vecino mas cercano que hay que dejar fuera.
    [int]$MaxBrillo = 34,
    [int]$MaxColor  = 16
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($Ruta)) { $Ruta = Join-Path $raiz $Ruta }
if (-not (Test-Path $Ruta)) { throw "No existe: $Ruta" }

$bmp = [System.Drawing.Bitmap]::FromFile($Ruta)
$an = $bmp.Width; $al = $bmp.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $an, $al
$datos = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                       [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($datos.Stride * $al)
[System.Runtime.InteropServices.Marshal]::Copy($datos.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($datos)
$paso = $datos.Stride

# --- Mascara de interior, columna a columna ---------------------------------
# `porColumna[x]` = cuantas filas de esa columna son interior de marco.
$porColumna = New-Object int[] $an
$mascara = New-Object bool[] ($an * $al)
for ($y = 0; $y -lt $al; $y++) {
    $fila = $y * $paso
    for ($x = 0; $x -lt $an; $x++) {
        $i = $fila + $x * 4
        $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]
        $max = [Math]::Max($r, [Math]::Max($g, $b))
        $min = [Math]::Min($r, [Math]::Min($g, $b))
        if ($max -le $MaxBrillo -and ($max - $min) -le $MaxColor -and $r -ge $b) {
            $porColumna[$x]++
            $mascara[$y * $an + $x] = $true
        }
    }
}

# --- Los cuatro grupos de columnas ------------------------------------------
# Se pide un minimo de altura para que una sombra suelta del suelo no cuente
# como marco: un marco de verdad ocupa cientos de filas.
$minAlto = [int]($al * 0.25)
$grupos = @()
$dentro = $false
$desde = 0
for ($x = 0; $x -lt $an; $x++) {
    $vale = $porColumna[$x] -ge $minAlto
    if ($vale -and -not $dentro) { $dentro = $true; $desde = $x }
    elseif (-not $vale -and $dentro) {
        $dentro = $false
        # Un grupo estrecho no es un marco: es una sombra del decorado. Los
        # marcos miden unos 210 de ancho, asi que 150 los coge a los cuatro y
        # deja fuera lo que se cuela por los bordes de la lamina.
        # El parentesis de ($x - 1) no sobra: sin el, la coma se lleva los dos
        # numeros a un array y PowerShell intenta restarle 1 al array entero.
        if (($x - $desde) -ge 150) { $grupos += ,@($desde, ($x - 1)) }
    }
}
if ($dentro -and ($an - $desde) -ge 150) { $grupos += ,@($desde, ($an - 1)) }

Write-Host ""
Write-Host "MARCOS DE $([System.IO.Path]::GetFileName($Ruta))  ($an x $al)" -ForegroundColor Cyan
Write-Host ""
if ($grupos.Count -ne 4) {
    Write-Host "  ATENCION: encontrados $($grupos.Count) marcos, no 4." -ForegroundColor Yellow
    Write-Host "  Prueba a mover -MaxBrillo (hoy $MaxBrillo) o -MaxColor (hoy $MaxColor)."
    Write-Host ""
}

# --- Y el alto de cada uno ---------------------------------------------------
# POR FILAS ENTERAS, no por una columna. El interior no es un negro liso sino
# piedra oscura con grano, asi que una columna sola se rompe en rachas de
# ochenta filas y no dice nada. Contando cuantos pixeles de CADA FILA caen
# dentro de la mascara, el hueco del marco sale como un bloque de filas
# cubiertas casi de punta a punta, y el grano deja de importar.
#
# Se pide el 60% de la fila. Por debajo entrarian las filas del arco -donde la
# boveda se cierra y el hueco es estrecho- y por encima se perderian las que
# cruza algun adorno claro.
$filas = @()
foreach ($gr in $grupos) {
    $x0 = $gr[0]; $x1 = $gr[1]
    $ancho = $x1 - $x0 + 1
    $minFila = [int]($ancho * 0.6)
    $y0 = -1; $y1 = -1
    $desdeRacha = -1
    for ($y = 0; $y -le $al; $y++) {
        $cuenta = 0
        if ($y -lt $al) {
            $base = $y * $an
            for ($x = $x0; $x -le $x1; $x++) { if ($mascara[$base + $x]) { $cuenta++ } }
        }
        if ($cuenta -ge $minFila) { if ($desdeRacha -lt 0) { $desdeRacha = $y } }
        elseif ($desdeRacha -ge 0) {
            if (($y - $desdeRacha) -gt ($y1 - $y0 + 1)) { $y0 = $desdeRacha; $y1 = $y - 1 }
            $desdeRacha = -1
        }
    }
    $filas += [PSCustomObject]@{
        x0 = $x0; x1 = $x1; ancho = $ancho
        centroX = [Math]::Round(($x0 + $x1) / 2.0, 1)
        y0 = $y0; y1 = $y1; alto = $y1 - $y0 + 1
    }
}
$filas | Format-Table -AutoSize

# --- Lo que hay que copiar a ui/pantallas.js --------------------------------
if ($filas.Count -eq 4) {
    $pasos = @()
    for ($i = 1; $i -lt 4; $i++) { $pasos += ($filas[$i].centroX - $filas[$i - 1].centroX) }
    $pasoMedio = [Math]::Round((($pasos | Measure-Object -Average).Average), 1)
    $anchoMedio = [int][Math]::Round((($filas | Measure-Object -Property ancho -Average).Average))
    $yArriba = ($filas | Measure-Object -Property y0 -Maximum).Maximum
    $yAbajo  = ($filas | Measure-Object -Property y1 -Minimum).Minimum

    Write-Host "  paso entre marcos: $($pasos -join ', ')  (medio $pasoMedio)"
    Write-Host ""
    Write-Host "  Para js/ui/pantallas.js:" -ForegroundColor Green
    Write-Host "    const ARCO_X0    = $($filas[0].centroX);"
    Write-Host "    const ARCO_PASO  = $pasoMedio;"
    Write-Host "    const ARCO_ANCHO = $anchoMedio;"
    Write-Host "    const ARCO_Y     = $yArriba;"
    Write-Host "    const ARCO_ALTO  = $($yAbajo - $yArriba + 1);"
    Write-Host ""
    Write-Host "  (ARCO_Y y ARCO_ALTO son el hueco COMUN a los cuatro: el mas"
    Write-Host "   bajo de los techos y el mas alto de los suelos. Un rectangulo"
    Write-Host "   por marco dejaria los cuatro retratos a alturas distintas.)"
}
Write-Host ""

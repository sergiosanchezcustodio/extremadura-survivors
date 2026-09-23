# Rendimiento: el escalado era el cuello

> Los sprites deben dibujarse a escala 1:1; escalar en cada frame era lo que hundía los fps
>
> Tipo: decisión del proyecto.

En la Fase 3 el juego dejó de ir fluido con enemigos en pantalla. La causa era que **cada enemigo de suelo se dibujaba con un `drawImage` escalado**: el squash & stretch procedural cambiaba el ancho y el alto de destino un par de píxeles cada frame. Pasarlo a desplazamiento vertical puro (blit 1:1) lo resolvió — 1000 enemigos a 120 fps estables, verificado por Sergio el 2026-08-03.

**Por qué:** un `drawImage` con destino de distinto tamaño que el origen no entra por la ruta rápida del navegador. Con 700 sprites por frame, eso se paga entero. Además, medir el coste desde JavaScript engaña: Canvas 2D encola las órdenes y rasteriza después, así que `performance.now()` alrededor del dibujado mide "tiempo en pedir", no tiempo de frame.

**Cómo aplicarlo:** cualquier efecto que quiera deformar un sprite (squash, escora, zoom) tiene que hornearse en la hoja de fotogramas offline, no aplicarse al dibujar. Para medir de verdad, usar el tiempo de frame real (intervalos de `requestAnimationFrame`) y la línea `navegador` del overlay F3, que es la diferencia entre ese tiempo y lo que suman lógica y render. Los interruptores Y/P/N/O apagan suelo, partículas, números y efectos para aislar. Relacionado: [Dirección artística: todo animado](direccion-artistica-animada.md).

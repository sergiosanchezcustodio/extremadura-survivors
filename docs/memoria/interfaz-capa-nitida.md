# Interfaz en capa nítida

> La interfaz debe salir del lienzo del juego a una capa propia a resolución de pantalla; textos nunca pixelados
>
> Tipo: decisión del proyecto.

**HECHO**: vive en `js/ui/capa.js` (y `ANCHO_UI`/`ALTO_UI` en `js/core/constantes.js`). Se conserva porque las reglas siguen valiendo para cualquier pantalla nueva. Sergio pidió expresamente (y ya van tres veces sobre lo mismo, así que es importante):

- **Los textos NO deben verse pixelados** en ninguna ventana ni menú del juego. Quiere tipografía de calidad, fácil de leer.
- **Más resolución, calidad y nitidez** en menús y en la ventana de información del jugador.
- **La ventana de información del jugador va SIN MARCO y SIN FONDO.**

**Por qué:** todo se dibuja en un lienzo de 960x540 que el navegador amplía por factor entero con `image-rendering: pixelated`. Eso es lo que da nitidez al pixel art del mundo, pero destroza cualquier tipografía: por muy "en píxeles físicos" que se dibuje el texto, después se multiplica por 2 o 3 sin interpolar. No se arregla eligiendo otra fuente ni otro tamaño — mientras la interfaz viva en ese lienzo, sale pixelada por construcción.

**Cómo aplicarlo:** montar un **segundo lienzo superpuesto** dimensionado a la resolución real de pantalla (`innerWidth/innerHeight` por `devicePixelRatio`), con suavizado normal y sin `image-rendering: pixelated`. Ahí se dibuja toda la interfaz —paneles, menú de nivel, pausa, abatido, overlay F3— a tamaño de fuente nativo. El lienzo del juego se queda solo con el mundo. Hace falta convertir coordenadas de mundo a ese lienzo para los números de daño, que hoy se dibujan en el lienzo del juego. Sin fondo ni marco, el panel necesitará sombra o contorno en el texto para leerse sobre la arena. Relacionado: [Rendimiento: el escalado era el cuello](rendimiento-blits-1a1.md).

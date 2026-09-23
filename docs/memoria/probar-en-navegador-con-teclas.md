# Probar con teclas en el navegador

> Las pruebas de movimiento se hacen pulsando teclas en el navegador, nunca moviendo al jugador a dedo.
>
> Tipo: forma de trabajar.

Para probar colisiones o movimiento hay que mover al personaje con teclas
reales (`keyboard.down/up` en Playwright), como en
`herramientas/probar-nivel2.js` (`npm run probar-nivel2`).

**Por qué:** asignarle las coordenadas al jugador pisa `yPrev`/`xPrev`, que es
justo lo que lee la colisión al resolver el paso. Se dieron por buenas pruebas
de un juego que no existía, y Sergio acabó encontrando a mano todos los fallos
que la prueba decía que no estaban.

**Cómo aplicarlo:** colocar al jugador solo para situarlo antes de empezar,
y a partir de ahí pulsar y mirar dónde acaba. Sergio dio permiso explícito para
construir estas pruebas de navegador en lugar de pedirle a él que compruebe.
Ver [La cara de un muro es pared](perspectiva-la-cara-es-pared.md).

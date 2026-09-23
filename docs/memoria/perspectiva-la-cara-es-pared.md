# La cara de un muro es pared

> La franja de la cara de un muro es la pared vista de frente, no suelo; nadie puede estar dentro.
>
> Tipo: forma de trabajar.

En la perspectiva del juego (cenital con ligera inclinación) la CARA que dibuja
un muro sobre las celdas de delante es el cuerpo de la pared, no el suelo del
otro lado. Un personaje puede quedar DETRÁS de una pared y verse tapado por
ella —eso es dibujo—, pero nunca dentro.

**Por qué:** los días 21 y 22/09/2026 se implementó lo contrario ("hundirse":
entrar en la cara llegando desde arriba) y salió un agujero tras otro —entrar a
las tiendas por las esquinas de abajo, cruzar bajo la punta de una pared
vertical y recorrer el 99,7% del mapa con los cierres de los jefes cerrados—.
Cada parche tapaba uno y abría el siguiente. Se quitó entero y costó muchísimo
contexto y paciencia de Sergio.

**Cómo aplicarlo:** `pie` marca la cara como sólida y `colisionar` no lleva
excepciones. Lo que sigue pendiente, y es otra cosa, es la oclusión (que la
pared tape a quien está detrás): eso se resuelve dibujando, jamás dejando
entrar en el muro. Ver [Probar con teclas en el navegador](probar-en-navegador-con-teclas.md) y
docs/anadir-un-nivel.md.

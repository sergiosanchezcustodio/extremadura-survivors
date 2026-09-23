# Dificultad: vida y densidad, no velocidad

> Subir la dificultad va por vida y densidad, nunca por velocidad; y los enemigos \"especiales\" llevan la velocidad de su versión básica.
>
> Tipo: forma de trabajar.

Cuando Sergio pide más dificultad, la palanca es **vida y densidad**, no velocidad. De hecho pide expresamente que los enemigos básicos vayan **más lentos**, y aun así que cueste más matarlos.

La regla de los enemigos **especiales** (serpiente dorada, gárgola de bronce) es suya y es explícita: **misma velocidad que su versión básica**, y todo lo demás muy por encima. Un especial se distingue por aguantar y por lo que suelta, nunca por correr más.

**Por qué:** la primera serpiente dorada iba a 78 sobre los 85 del jugador y la sensación fue mala — se pasaba la aparición escapándose y cazarla dependía de arrinconarla, no de decidir nada. Con velocidad 15 y 1400 de vida el reto pasa a ser quedarse quieto pegándole mientras la oleada llega, que sí es una decisión.

**Cómo aplicarlo:** al calibrar, mover vidas, densidad de la curva de oleadas (`oleadas` en `js/datos/niveles/merida.js`) y daño de contacto; dejar las velocidades donde están o bajarlas. Medir siempre con un jugador quieto y mortal: si sobrevive indefinidamente sin moverse, está demasiado fácil. Relacionado: [Visión de armas](vision-de-armas.md).

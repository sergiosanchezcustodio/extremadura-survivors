# Visión de armas

> Decisiones tomadas sobre el catálogo de armas: ambientación mezclada, 3 opciones al subir nivel, armas únicas por jugador
>
> Tipo: decisión del proyecto.

Decidido con Sergio el 2026-08-03:

- **Ambientación mezclada sin complejos.** Pistolas, escopetas y granadas se llaman así, conviviendo con lo romano. Descartado el reskin (Libros Sibilinos, manojo de pila) y descartado cambiar de mundo.
- **3 opciones al subir de nivel**, no las 4 del plan, elegidas al azar del catálogo.
- **6 armas simultáneas** por jugador, como el plan.
- **Las armas no se repiten entre jugadores**: si uno lleva la escopeta, a los demás no se les ofrece. Con 4 jugadores x 6 ranuras son **24 armas repartidas**, así que el catálogo debe tener **30 como mínimo** o los últimos se quedan sin ofertas.
- Efectos muy distintos entre sí. Comportamientos que faltan por implementar: `bombardeoAleatorio` (granadas que estallan en un punto aleatorio de la pantalla), `conoCorto` (escopeta), y los cinco del plan que quedaron declarados sin implementar (orbital, trampaSuelo, zonaPersistente, proyectilLineal, auraPasiva).
- **Cada personaje empieza con su propia arma.** Hecho: vive en `js/datos/personajes.js`. (El catálogo pasó de largo las 30: hoy son 58 armas en juego; ver `docs/armas-y-objetos.md`.)

**Por qué:** con solo Pilum y Gladius el sistema de armas acumulativas no se aprecia y le pareció soso. No es problema de arquitectura sino de catálogo.

**Cómo aplicarlo:** un comportamiento nuevo es una función en el objeto `COMPORTAMIENTOS` de `js/sistemas/armas.js`; un arma que reutilice uno existente es solo una entrada en `js/datos/armas.js`. Relacionado: [Cooperativo local](cooperativo-local.md).

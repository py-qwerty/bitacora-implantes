# Bitácora Implantes

App móvil personal para estudiar implantología a partir de las clases: un **tema digital** por sesión (resumen explicado, ejemplos y glosario) y **30 preguntas por tema** con explicación. Reutiliza el motor y el diseño de [Bitácora Ciber](https://github.com/py-qwerty/bitacora-ciberseguridad) y de [Bitácora PER](https://github.com/py-qwerty/bitacora-per); detalles en UPSTREAM.md.

**[Abrir Bitácora Implantes](https://py-qwerty.github.io/bitacora-implantes/)**

## Estudiar

Asignatura → tema → tres tests de 10 preguntas o test completo de 30. Una pregunta por pantalla; «Comprobar respuesta» muestra la solución y su explicación. El progreso se guarda solo en el navegador (`localStorage`), sin servidor ni analítica. Los temas aún sin redactar aparecen como «En preparación».

## Ejecutar

Sin dependencias ni compilación:

```sh
npm run dev      # http://127.0.0.1:4174
npm run check    # pruebas de motor, banco e interfaz
```

## Contenido

`dist/bank.json` contiene asignaturas, temas y preguntas; `dist/temas/` los temas digitales, que se generan con `npm run temas` desde `content/temas/<asignatura>/tema-NN.json`. Cada pregunta indica su fuente: `clase` (explicada en la sesión) o `practice` (ejercicio añadido).

## Privacidad y procedencia

Son apuntes de estudio personales elaborados a partir de las clases; no son material oficial de la universidad ni del profesorado y pueden contener errores. **No se publican grabaciones ni transcripciones**, solo el resumen y las preguntas redactados. No hay cuentas, credenciales ni seguimiento. Fuentes Manrope y Barlow Condensed servidas localmente (licencias en FONT-LICENSES/).

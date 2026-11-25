# PathPulse · Dijkstra Urbano

Aplicación web educativa e interactiva sobre el **algoritmo de Dijkstra** aplicado a la vida real:
cálculo de la ruta más rápida para unidades de emergencia en una ciudad con tráfico variable y calles bloqueadas.

**Demo:** https://esauur.github.io/proyecto-dijkstra-web/

## Secciones

1. **Introducción**: portada con simulación rápida (origen → destino → simular) y métricas medidas en vivo.
2. **Definición del problema**: congestión, bloqueos y planteamiento formal.
3. **Objetivo general** y objetivos específicos.
4. **Marco teórico**: grafos ponderados, relajación, complejidad `O((V+E) log V)` y pseudocódigo.
5. **Simulador en vivo** (HTML5 Canvas):
   - 10 zonas urbanas con calles ponderadas en minutos.
   - **Hora pico** (núcleo urbano ×2, resto ×1.3) y **accidente** (cierra una calle de la ruta actual).
   - Clic sobre una calle para editar sus minutos o cerrarla; clic sobre una zona para fijar el origen (Mayús + clic: destino).
   - **Nueva ciudad**: genera un grafo aleatorio conectado y sin cruces (árbol de expansión mínima + calles extra).
   - Ejecución **instantánea** o **paso a paso** con nodos visitados, cola de prioridad, registro de relajaciones y tabla de distancias.
   - **Unidad animada** que recorre la ruta óptima con estela y partículas.
   - Panel **Ahorro de tiempo**: Dijkstra frente a la ruta con menos saltos (BFS sin pesos).
   - Tooltips y halos al pasar el cursor sobre zonas y calles.
6. **Conclusiones**.

## Métricas en vivo

- **Rendimiento:** Dijkstra se ejecuta sobre un grafo aleatorio de 20 000 nodos en el navegador del visitante para medir los nodos procesados por segundo.
- **Precisión:** cada ruta de 120 ciudades aleatorias se compara con Floyd-Warshall.

## Uso

No requiere instalación: abre `index.html` en cualquier navegador moderno.
Si el sistema tiene activada la opción de reducir animaciones, la unidad aparece directamente en el destino.

## Tecnologías

HTML5 · CSS3 (modo oscuro por defecto y modo claro, diseño responsivo) · JavaScript sin dependencias · Canvas 2D · SVG.

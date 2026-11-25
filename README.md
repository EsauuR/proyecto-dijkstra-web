# Dijkstra Urbano: optimización de rutas y despacho de emergencias

Aplicación web educativa e interactiva sobre el **algoritmo de Dijkstra** aplicado a la vida real:
cálculo de la ruta más rápida en una ciudad con tráfico variable y calles bloqueadas.

## Contenido

1. **Introducción**: el problema del tráfico urbano.
2. **Definición del problema**: congestión, bloqueos y planteamiento formal.
3. **Objetivo general** y objetivos específicos.
4. **Marco teórico**: grafos ponderados, relajación, complejidad `O((V+E) log V)` y pseudocódigo.
5. **Simulador en vivo** (HTML5 Canvas):
   - 10 zonas urbanas y 19 calles con pesos en minutos.
   - Selección de origen y destino (también con clic sobre el mapa; Mayús + clic para el destino).
   - Escenarios de **hora pico** (centro ×2, resto ×1.3) y **accidente** (cierra una calle de la ruta actual).
   - Clic sobre una calle para editar sus minutos o cerrarla.
   - Ejecución **instantánea** o **paso a paso** (manual o automática), con nodos visitados, cola de prioridad,
     registro de relajaciones, ruta final y tabla de distancias mínimas.
6. **Conclusiones**.

## Cómo usarla

No requiere instalación: abre `index.html` en cualquier navegador moderno.

## Tecnologías

HTML5 · CSS3 (modo claro/oscuro, diseño responsivo) · JavaScript sin dependencias · Canvas 2D.
Dijkstra está implementado con un montículo binario propio en `app.js`.

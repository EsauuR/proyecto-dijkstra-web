/* =========================================================
   PathPulse · Dijkstra Urbano — lógica de la aplicación
   - Grafo urbano de 10 zonas (predeterminado o aleatorio)
   - Dijkstra con montículo binario (generador paso a paso)
   - BFS sin pesos para comparar el ahorro de tiempo
   - Canvas: unidad animada, tooltips y halos al pasar el cursor
   - Métricas del hero medidas en vivo (velocidad y precisión)
   ========================================================= */
'use strict';

/* =========================================================
   1. DATOS DE LA CIUDAD
   Lienzo lógico de 1000 × 620
   ========================================================= */
const W = 1000, H = 620;
const CODES = 'ABCDEFGHIJ';
const NODE_R = 26;

const DEFAULT_CITY = {
  nodes: [
    { name: 'Hospital Central',  icon: '🏥', x: 140, y: 120 },
    { name: 'Universidad',       icon: '🎓', x: 430, y: 95  },
    { name: 'Parque Norte',      icon: '🌳', x: 720, y: 110 },
    { name: 'Aeropuerto',        icon: '✈️', x: 895, y: 265 },
    { name: 'Estación Bomberos', icon: '🚒', x: 105, y: 365 },
    { name: 'Centro Histórico',  icon: '🏛️', x: 385, y: 310 },
    { name: 'Plaza Mayor',       icon: '⛲', x: 640, y: 325 },
    { name: 'Mercado Municipal', icon: '🛒', x: 230, y: 530 },
    { name: 'Zona Industrial',   icon: '🏭', x: 525, y: 525 },
    { name: 'Estadio',           icon: '🏟️', x: 845, y: 510 }
  ],
  // [u, v, minutos, nombre]
  edges: [
    [0, 1, 7, 'Av. Universitaria'], [0, 4, 9, 'Calle del Socorro'], [0, 5, 12, 'Av. Central'],
    [1, 2, 10, 'Paseo Norte'], [1, 5, 6, 'Calle Colegio'], [1, 6, 14, 'Diagonal Norte'],
    [2, 3, 8, 'Autopista Aérea'], [2, 6, 7, 'Calle Jardines'], [3, 6, 11, 'Av. Aeropuerto'],
    [3, 9, 9, 'Periférico Este'], [4, 5, 8, 'Calle Bomberos'], [4, 7, 6, 'Calle Ribera'],
    [5, 6, 5, 'Bulevar Mayor'], [5, 7, 10, 'Calle Comercio'], [5, 8, 9, 'Av. Fábricas'],
    [6, 8, 6, 'Calle Obreros'], [6, 9, 10, 'Av. Deportes'], [7, 8, 11, 'Vía Sur'],
    [8, 9, 8, 'Periférico Sur']
  ],
  origin: 4,   // Estación Bomberos
  dest: 2      // Parque Norte
};

const ZONE_POOL = [
  ['Hospital General', '🏥'], ['Clínica del Sur', '🩺'], ['Estación Bomberos', '🚒'],
  ['Comisaría Central', '🚓'], ['Universidad', '🎓'], ['Biblioteca', '📚'],
  ['Parque Central', '🌳'], ['Aeropuerto', '✈️'], ['Puerto', '⚓'],
  ['Estación de Tren', '🚉'], ['Terminal de Buses', '🚌'], ['Centro Histórico', '🏛️'],
  ['Plaza Mayor', '⛲'], ['Mercado', '🛒'], ['Zona Industrial', '🏭'],
  ['Estadio', '🏟️'], ['Barrio Residencial', '🏘️'], ['Centro Financiero', '🏦'],
  ['Museo de Arte', '🖼️'], ['Colegio Público', '🏫'], ['Centro Comercial', '🛍️'],
  ['Torre Corporativa', '🏢'], ['Hotel Plaza', '🏨'], ['Teatro Municipal', '🎭'],
  ['Ayuntamiento', '🏤'], ['Planta Eléctrica', '⚡'], ['Mirador', '🌄'], ['Mercado de Flores', '💐']
];
const EMERGENCY_ICONS = ['🚒', '🏥', '🚓', '🩺'];
const STREET_PREFIX = ['Av.', 'Calle', 'Paseo', 'Bulevar', 'Vía', 'Diagonal', 'Carrera', 'Ronda'];
const STREET_NAME = [
  'del Sol', 'Libertad', 'Reforma', 'Las Flores', 'Central', 'Los Pinos', 'Las Acacias', 'del Río',
  'Constitución', 'Independencia', 'Primavera', 'Los Robles', 'La Paz', 'Norte', 'Sur', 'Oriente',
  'Poniente', 'del Parque', 'Universitaria', 'Industrial', 'del Puerto', 'Las Palmas', 'El Prado',
  'San José', 'Santa Ana', 'Los Olivos', 'del Mar', 'La Estación', 'El Mirador', 'Las Lomas'
];

/* Hora pico: las calles del núcleo urbano sufren más */
const PEAK_CORE = 2.0;
const PEAK_OTHER = 1.3;

/* =========================================================
   2. ESTADO
   ========================================================= */
const state = {
  nodes: [], edges: [], template: null, core: new Set(),
  peak: false, origin: 0, dest: 1,
  vis: null,        // estado visual del algoritmo
  bfs: null,        // ruta con menos saltos { path, time }
  stepper: null, stepCount: 0, timer: null,
  hoverEdge: -1, hoverNode: -1, editing: -1,
  anim: null        // animación de la unidad
};

function loadCity(city) {
  cancelStepper();
  stopAnim();
  state.template = city;
  state.nodes = city.nodes.map((n, i) => ({ ...n, id: i, code: CODES[i] }));
  state.edges = freshEdges();
  state.core = computeCore();
  state.peak = false;
  state.vis = null;
  state.bfs = null;
  state.origin = city.origin;
  state.dest = city.dest;
  logLines = [];
  syncPeakButton();
  fillSelects();
  updateChips();
}
function freshEdges() {
  return state.template.edges.map(([u, v, w, name], i) => ({ id: i, u, v, base: w, name, blocked: false }));
}
function computeCore() {
  // Las dos zonas más cercanas al centro del mapa forman el "núcleo"
  return new Set(state.nodes
    .map(n => [Math.hypot(n.x - W / 2, n.y - H / 2), n.id])
    .sort((a, b) => a[0] - b[0]).slice(0, 2).map(p => p[1]));
}
function peakFactor(e) {
  if (!state.peak) return 1;
  return (state.core.has(e.u) || state.core.has(e.v)) ? PEAK_CORE : PEAK_OTHER;
}
function weight(e) { return e.blocked ? Infinity : Math.round(e.base * peakFactor(e)); }
function findEdge(a, b) {
  return state.edges.find(e => (e.u === a && e.v === b) || (e.u === b && e.v === a));
}
function adjFrom(n, list) {
  const adj = Array.from({ length: n }, () => []);
  for (const e of list) {
    adj[e.u].push({ v: e.v, w: e.w, edge: e.id });
    adj[e.v].push({ v: e.u, w: e.w, edge: e.id });
  }
  return adj;
}
function buildAdjacency() {
  return adjFrom(state.nodes.length,
    state.edges.filter(e => !e.blocked).map(e => ({ u: e.u, v: e.v, w: weight(e), id: e.id })));
}

/* =========================================================
   3. ALGORITMOS
   ========================================================= */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {                       // item = [prioridad, nodo]
    const a = this.a; a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  items() { return this.a.slice().sort((x, y) => x[0] - y[0]); }
}

/** Dijkstra como generador: cada `yield` es un paso observable */
function* dijkstra(adj, src, dst) {
  const n = adj.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  const order = [];
  const heap = new MinHeap();
  dist[src] = 0;
  heap.push([0, src]);

  const snap = (extra) => ({
    dist: dist.slice(), prev: prev.slice(), done: done.slice(),
    order: order.slice(), queue: heap.items(), ...extra
  });

  yield snap({ type: 'init', u: src });

  while (heap.size) {
    const [d, u] = heap.pop();
    if (done[u]) { yield snap({ type: 'stale', u, d }); continue; }   // entrada obsoleta
    done[u] = true;
    order.push(u);
    yield snap({ type: 'extract', u, d });

    if (u === dst) { yield snap({ type: 'found', u }); return; }     // parada temprana

    for (const { v, w, edge } of adj[u]) {
      if (done[v]) continue;
      const old = dist[v];
      const nd = d + w;
      const improved = nd < old;
      if (improved) { dist[v] = nd; prev[v] = u; heap.push([nd, v]); } // relajación
      yield snap({ type: 'relax', u, v, w, edge, old, nd, improved });
    }
  }
  yield snap({ type: 'unreachable' });
}

/** Versión compacta, sin pasos intermedios, para la prueba de rendimiento */
function dijkstraFast(adj, src) {
  const n = adj.length;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const heap = new MinHeap();
  dist[src] = 0; heap.push([0, src]);
  let extracted = 0;
  while (heap.size) {
    const [d, u] = heap.pop();
    if (done[u]) continue;
    done[u] = 1; extracted++;
    const list = adj[u];
    for (let k = 0; k < list.length; k++) {
      const e = list[k], nd = d + e.w;
      if (nd < dist[e.v]) { dist[e.v] = nd; heap.push([nd, e.v]); }
    }
  }
  return extracted;
}

function reconstructPath(prev, dst) {
  const path = [];
  for (let v = dst; v !== -1; v = prev[v]) path.unshift(v);
  return path;
}

/** BFS sin pesos: la ruta con menos calles (saltos), sin mirar los minutos */
function bfsRoute(adj, s, t) {
  const n = adj.length;
  const prev = new Array(n).fill(-1), seen = new Array(n).fill(false);
  const q = [s]; seen[s] = true;
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    if (u === t) break;
    for (const { v } of adj[u]) if (!seen[v]) { seen[v] = true; prev[v] = u; q.push(v); }
  }
  if (!seen[t]) return null;
  const path = reconstructPath(prev, t);
  let time = 0;
  for (let i = 0; i < path.length - 1; i++) time += weight(findEdge(path[i], path[i + 1]));
  return { path, time };
}

/** Floyd-Warshall de referencia para la verificación de precisión */
function floydWarshall(n, list) {
  const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 0 : Infinity));
  for (const e of list) { const w = Math.min(D[e.u][e.v], e.w); D[e.u][e.v] = w; D[e.v][e.u] = w; }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
  return D;
}

/* =========================================================
   4. GENERADOR DE CIUDADES ALEATORIAS
   Árbol de expansión mínima euclidiano (garantiza conexión
   y calles sin cruces) + calles extra sin intersecciones.
   ========================================================= */
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function segmentsCross(p1, p2, p3, p4) {
  if (p1 === p3 || p1 === p4 || p2 === p3 || p2 === p4) return false;
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  return (d1 * d2 < 0) && (d3 * d4 < 0);
}
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function generateCity() {
  // 1) Posiciones separadas entre sí
  let pts = [];
  for (let minD = 180; pts.length < 10; minD -= 8) {
    pts = [];
    for (let tries = 0; pts.length < 10 && tries < 5000; tries++) {
      const p = { x: rand(110, 890), y: rand(95, 520) };
      if (pts.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= minD)) pts.push(p);
    }
  }
  pts.sort((a, b) => (Math.floor(a.y / 210) - Math.floor(b.y / 210)) || (a.x - b.x));
  pts = pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));

  // 2) Pares candidatos ordenados por longitud
  const pairs = [];
  for (let i = 0; i < 10; i++)
    for (let j = i + 1; j < 10; j++)
      pairs.push({ i, j, len: Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) });
  pairs.sort((a, b) => a.len - b.len);

  // 3) Kruskal: árbol de expansión mínima → ciudad conectada
  const parent = [...Array(10).keys()];
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const chosen = [];
  const degree = new Array(10).fill(0);
  for (const p of pairs) {
    const a = find(p.i), b = find(p.j);
    if (a !== b) { parent[a] = b; chosen.push(p); degree[p.i]++; degree[p.j]++; }
  }

  // 4) Calles adicionales: sin cruces, sin pasar encima de otras zonas
  const target = 15 + Math.floor(Math.random() * 5);
  for (const p of pairs) {
    if (chosen.length >= target) break;
    if (chosen.includes(p) || p.len > 430 || degree[p.i] >= 5 || degree[p.j] >= 5) continue;
    const A = pts[p.i], B = pts[p.j];
    if (chosen.some(c => segmentsCross(A, B, pts[c.i], pts[c.j]))) continue;
    if (pts.some((q, k) => k !== p.i && k !== p.j && distToSegment(q, A, B) < 55)) continue;
    chosen.push(p); degree[p.i]++; degree[p.j]++;
  }

  // 5) Nombres, iconos y pesos
  const zones = shuffle(ZONE_POOL).slice(0, 10);
  const usedStreets = new Set();
  const streetName = () => {
    let s;
    do { s = `${STREET_PREFIX[Math.floor(Math.random() * STREET_PREFIX.length)]} ${STREET_NAME[Math.floor(Math.random() * STREET_NAME.length)]}`; }
    while (usedStreets.has(s));
    usedStreets.add(s);
    return s;
  };
  const nodes = pts.map((p, i) => ({ name: zones[i][0], icon: zones[i][1], x: p.x, y: p.y }));
  const edges = chosen.map(c => [c.i, c.j,
    Math.max(2, Math.min(30, Math.round(c.len / 36 * rand(0.75, 1.45)))), streetName()]);

  // 6) Origen: una base de emergencias si existe; destino: la zona más lejana
  let origin = nodes.findIndex(n => EMERGENCY_ICONS.includes(n.icon));
  if (origin === -1) origin = nodes.reduce((b, n, i) => n.x < nodes[b].x ? i : b, 0);
  const dest = nodes.reduce((b, n, i) =>
    Math.hypot(n.x - nodes[origin].x, n.y - nodes[origin].y) >
    Math.hypot(nodes[b].x - nodes[origin].x, nodes[b].y - nodes[origin].y) ? i : b, origin === 0 ? 1 : 0);

  return { nodes, edges, origin, dest };
}

/* =========================================================
   5. REFERENCIAS DOM
   ========================================================= */
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const canvas = $('mapCanvas');
const ctx = canvas.getContext('2d');
const originSel = $('originSelect'), destSel = $('destSelect');
const heroOrigin = $('heroOrigin'), heroDest = $('heroDest');
const btnPeak = $('btnPeak'), btnAccident = $('btnAccident'), btnReset = $('btnReset'), btnNewCity = $('btnNewCity');
const btnRun = $('btnRun'), btnStepStart = $('btnStepStart'), btnStep = $('btnStep'), btnPlay = $('btnPlay'), btnFinish = $('btnFinish');
const speedRange = $('speedRange');
const routeText = $('routeText'), routeMeta = $('routeMeta'), savingsBody = $('savingsBody');
const visitedList = $('visitedList'), queueList = $('queueList'), stepLog = $('stepLog');
const distBody = document.querySelector('#distTable tbody');
const dialog = $('edgeDialog');
const tip = $('mapTip');
const logoSvg = $('logoSvg');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* =========================================================
   6. EJECUCIÓN DEL ALGORITMO
   ========================================================= */
let logLines = [];

function describe(ev) {
  const N = (i) => state.nodes[i].code;
  switch (ev.type) {
    case 'init': return { cls: 'ext', text: `Inicio: d[${N(ev.u)}] = 0, resto = ∞. Se inserta ${N(ev.u)} en la cola.` };
    case 'stale': return { cls: 'no', text: `Sale (${N(ev.u)}, ${ev.d}), pero ${N(ev.u)} ya es definitivo: se descarta.` };
    case 'extract': return { cls: 'ext', text: `Extraer mínimo: ${N(ev.u)} con d = ${ev.d}. Distancia fijada.` };
    case 'relax': {
      const o = ev.old === Infinity ? '∞' : ev.old;
      return ev.improved
        ? { cls: 'ok', text: `Relajar ${N(ev.u)}→${N(ev.v)}: ${ev.nd - ev.w} + ${ev.w} = ${ev.nd} < ${o} ✓` }
        : { cls: 'no', text: `Relajar ${N(ev.u)}→${N(ev.v)}: ${ev.nd - ev.w} + ${ev.w} = ${ev.nd} ≥ ${o} ✗` };
    }
    case 'found': return { cls: 'fin', text: `Destino ${N(ev.u)} alcanzado: ${ev.dist[ev.u]} min. Unidad despachada.` };
    case 'unreachable': return { cls: 'fin', text: 'Cola vacía: el destino es inalcanzable con las calles abiertas.' };
  }
  return { cls: '', text: '' };
}

function applyEvent(ev, stats) {
  const prevVis = state.vis;
  state.vis = {
    ...ev,
    path: ev.type === 'found' ? reconstructPath(ev.prev, state.dest) : [],
    current: (ev.type === 'extract' || ev.type === 'relax' || ev.type === 'stale') ? ev.u : -1,
    relaxEdge: ev.type === 'relax' ? ev.edge : -1,
    updated: (ev.type === 'relax' && ev.improved) ? ev.v : -1,
    finished: ev.type === 'found' || ev.type === 'unreachable',
    stats: stats || (prevVis && prevVis.stats) || null
  };
  logLines.push(describe(ev));
}

function onFinished() {
  const v = state.vis;
  v.relaxEdge = -1; v.current = -1; v.updated = -1;
  if (v.type === 'found') {
    state.bfs = bfsRoute(buildAdjacency(), state.origin, state.dest);
    startVehicle(v.path);
  } else {
    state.bfs = null;
    stopAnim();
  }
}

function runInstant(silent) {
  cancelStepper();
  if (!validSelection()) return;
  logLines = [];
  const t0 = performance.now();
  const events = [];
  for (const ev of dijkstra(buildAdjacency(), state.origin, state.dest)) events.push(ev);
  const ms = performance.now() - t0;
  for (const ev of events) applyEvent(ev);
  state.vis.stats = { ms, steps: events.length };
  onFinished();
  renderAll();
  if (!silent) toast(state.vis.type === 'found'
    ? `Ruta óptima en ${ms.toFixed(2)} ms · unidad en camino`
    : 'No existe ruta disponible');
}

function startStepper() {
  cancelStepper();
  if (!validSelection()) return;
  stopAnim();
  state.bfs = null;
  logLines = [];
  state.stepper = dijkstra(buildAdjacency(), state.origin, state.dest);
  state.stepCount = 0;
  setStepButtons(true);
  nextStep();
}
function nextStep() {
  if (!state.stepper) return;
  const r = state.stepper.next();
  if (r.done) { cancelStepper(); return; }
  state.stepCount++;
  applyEvent(r.value, { ms: null, steps: state.stepCount });
  if (state.vis.finished) { cancelStepper(); onFinished(); }
  renderAll();
}
function finishStepper() {
  if (!state.stepper) return;
  let r;
  while (!(r = state.stepper.next()).done) {
    state.stepCount++;
    applyEvent(r.value, { ms: null, steps: state.stepCount });
  }
  cancelStepper();
  onFinished();
  renderAll();
}
function togglePlay() {
  if (state.timer) { stopTimer(); return; }
  btnPlay.textContent = '⏸ Pausa';
  state.timer = setInterval(() => { nextStep(); if (!state.stepper) stopTimer(); }, +speedRange.value);
  updateComputing();
}
function stopTimer() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  btnPlay.textContent = '▶ Auto';
  updateComputing();
}
function setStepButtons(on) { btnStep.disabled = btnPlay.disabled = btnFinish.disabled = !on; }
function cancelStepper() { stopTimer(); state.stepper = null; setStepButtons(false); }

function validSelection() {
  if (state.origin === state.dest) {
    state.vis = null; state.bfs = null; logLines = [];
    stopAnim();
    renderAll();
    routeText.className = 'route-text error';
    routeText.textContent = 'El origen y el destino son la misma zona. Elige zonas distintas.';
    return false;
  }
  return true;
}
function recalcIfShown() { if (state.vis) runInstant(true); else draw(); }

/* =========================================================
   7. ESCENARIOS
   ========================================================= */
function syncPeakButton() {
  btnPeak.setAttribute('aria-pressed', String(state.peak));
  btnPeak.textContent = state.peak ? '🚦 Pico: ON' : '🚦 Hora pico';
}
function togglePeak() {
  state.peak = !state.peak;
  syncPeakButton();
  toast(state.peak ? `Hora pico: núcleo urbano ×${PEAK_CORE}, resto ×${PEAK_OTHER}` : 'Tráfico normal restablecido');
  updateChips();
  recalcIfShown();
}
function simulateAccident() {
  const open = state.edges.filter(e => !e.blocked);
  if (!open.length) { toast('Todas las calles ya están cerradas'); return; }
  // Se prefiere bloquear una calle de la ruta óptima actual
  let candidates = [];
  let last;
  for (const ev of dijkstra(buildAdjacency(), state.origin, state.dest)) last = ev;
  if (last && last.type === 'found') {
    const path = reconstructPath(last.prev, state.dest);
    for (let i = 0; i < path.length - 1; i++) {
      const e = findEdge(path[i], path[i + 1]);
      if (e && !e.blocked) candidates.push(e);
    }
  }
  if (!candidates.length) candidates = open;
  const e = candidates[Math.floor(Math.random() * candidates.length)];
  e.blocked = true;
  toast(`💥 Accidente en ${e.name} (${state.nodes[e.u].code}–${state.nodes[e.v].code}): vía cerrada`);
  updateChips();
  runInstant(true);
}
function resetTraffic() {
  cancelStepper();
  state.edges = freshEdges();
  state.peak = false;
  syncPeakButton();
  updateChips();
  toast('Tráfico y calles restablecidos');
  recalcIfShown();
  renderAll();
}
function newCity() {
  const city = generateCity();
  loadCity(city);
  toast(`🎲 Nueva ciudad: ${city.nodes.length} zonas y ${city.edges.length} calles`);
  runInstant(true);
}
function updateChips() {
  $('chipPeak').hidden = !state.peak;
  const blocked = state.edges.filter(e => e.blocked).length;
  $('chipBlocked').hidden = blocked === 0;
  $('blockedCount').textContent = blocked;
}

/* =========================================================
   8. ANIMACIÓN DE LA UNIDAD DE EMERGENCIA
   ========================================================= */
let rafId = 0;
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const LOOP_PAUSE = 1100;   // ms de pausa en el destino antes de volver a salir

/**
 * Lanza la unidad desde el origen sobre la ruta óptima.
 * - loop = false (Ejecutar / recálculos): un recorrido completo y se detiene en el destino.
 * - loop = true («Repetir envío»): recorre la ruta en bucle continuo.
 * Siempre se anima, aunque el sistema pida reducir animaciones.
 */
function startVehicle(path, loop = false) {
  if (path.length < 2) { stopAnim(); return; }
  const pts = path.map(i => ({ x: state.nodes[i].x, y: state.nodes[i].y }));
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lens.push(l); total += l;
  }
  const now = performance.now();
  state.anim = {
    pts, lens, total, t0: now, last: now,
    dur: Math.max(2600, Math.min(6500, total / 200 * 1000)),
    minutes: state.vis && state.vis.dist ? state.vis.dist[state.dest] : 0,
    trail: [], particles: [],
    moving: true,
    loop: !!loop,
    lap: 1,
    progress: 0,
    arrivedAt: 0,
    pos: { ...pts[0], ang: 0 }
  };
  updateComputing();
  kick();
}
function stopAnim() {
  state.anim = null;
  updateComputing();
}
function pointAt(a, d) {
  let acc = 0;
  for (let i = 0; i < a.lens.length; i++) {
    if (d <= acc + a.lens[i]) {
      const t = (d - acc) / a.lens[i], p = a.pts[i], q = a.pts[i + 1];
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, ang: Math.atan2(q.y - p.y, q.x - p.x) };
    }
    acc += a.lens[i];
  }
  const L = a.pts[a.pts.length - 1];
  return { x: L.x, y: L.y, ang: 0 };
}
function stepAnim(now) {
  const a = state.anim;
  if (!a) return false;
  const dt = Math.min(0.05, (now - a.last) / 1000);
  a.last = now;
  let active = false;

  // Nueva vuelta tras la pausa en el destino
  if (!a.moving && a.loop && a.arrivedAt && now - a.arrivedAt >= LOOP_PAUSE) {
    a.moving = true;
    a.t0 = now;
    a.arrivedAt = 0;
    a.progress = 0;
    a.trail = [];
    a.lap++;
  }

  if (a.moving) {
    const p = Math.min(1, (now - a.t0) / a.dur);
    a.progress = easeInOut(p);
    a.pos = pointAt(a, a.progress * a.total);
    a.trail.push({ x: a.pos.x, y: a.pos.y });
    if (a.trail.length > 70) a.trail.shift();
    // Estela de partículas: chispas que salen hacia atrás
    for (let k = 0; k < 4; k++) {
      const back = a.pos.ang + Math.PI + rand(-0.7, 0.7), sp = rand(20, 70);
      a.particles.push({ x: a.pos.x + rand(-4, 4), y: a.pos.y + rand(-4, 4), vx: Math.cos(back) * sp, vy: Math.sin(back) * sp, life: 1, size: rand(1.4, 3.4) });
    }
    if (p >= 1) {
      a.moving = false;
      a.arrivedAt = now;
      for (let k = 0; k < 48; k++) {
        const ang = rand(0, Math.PI * 2), sp = rand(50, 190);
        a.particles.push({ x: a.pos.x, y: a.pos.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, size: rand(1.6, 3.6) });
      }
      if (!a.loop) updateComputing();   // recorrido único terminado: la unidad queda en el destino
    }
    active = true;
  } else if (a.trail.length) {
    a.trail.splice(0, 3);
    active = true;
  }
  const drag = Math.pow(0.95, dt * 60);   // frenado independiente de los FPS
  for (const pt of a.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= drag; pt.vy *= drag;
    pt.life -= dt * 1.4;
  }
  if (a.particles.length > 400) a.particles.splice(0, a.particles.length - 400);
  a.particles = a.particles.filter(pt => pt.life > 0);
  if (a.loop || a.particles.length) active = true;
  if (a.arrivedAt && now - a.arrivedAt < 1100) active = true;
  return active;
}

/* El bucle solo pinta mientras el mapa está en pantalla y la pestaña visible */
let mapOnScreen = true;
function kick() { if (!rafId && mapOnScreen && !document.hidden) rafId = requestAnimationFrame(frame); }
function frame(now) {
  rafId = 0;
  const active = stepAnim(now);
  draw(now);
  if (active) kick();
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([en]) => {
    mapOnScreen = en.isIntersecting;
    if (mapOnScreen && state.anim) { state.anim.last = performance.now(); kick(); }
  }).observe(canvas);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.anim) { state.anim.last = performance.now(); kick(); }
});

/** Botón «Repetir envío»: relanza la unidad desde el origen */
function replayDispatch() {
  if (!state.vis || state.vis.type !== 'found') {
    if (state.stepper) { toast('Termina primero la ejecución paso a paso'); return; }
    runInstant(true);
  }
  if (state.vis && state.vis.type === 'found') {
    startVehicle(state.vis.path, true);   // bucle continuo
    toast(`🚑 Unidad en servicio continuo: ${state.nodes[state.origin].name} → ${state.nodes[state.dest].name}`);
  } else {
    toast('No hay ruta disponible para enviar la unidad');
  }
}

/* Logo dinámico: el punto de luz recorre la curva al pasar el cursor
   o mientras el simulador está calculando / la unidad está en ruta */
let brandHover = false;
function updateComputing() {
  const enRuta = !!(state.anim && (state.anim.moving || state.anim.loop));
  root.classList.toggle('computing', !!state.timer || enRuta);
  const live = $('chipLive');
  if (live) live.hidden = !enRuta;
  syncLogo();
}
function syncLogo() {
  if (!logoSvg || typeof logoSvg.pauseAnimations !== 'function') return;
  if (brandHover || root.classList.contains('computing')) logoSvg.unpauseAnimations();
  else logoSvg.pauseAnimations();
}

/* =========================================================
   9. DIBUJO EN CANVAS
   ========================================================= */
let scale = 1, dpr = 1;
const C = {};
function readColors() {
  const cs = getComputedStyle(root);
  ['map-bg', 'map-grid', 'edge', 'edge-label', 'node', 'path', 'frontier', 'visited', 'origin', 'dest', 'bfs',
    'danger', 'text', 'text-2', 'muted', 'line', 'line-strong', 'surface-3', 'badge-ink', 'bg']
    .forEach(k => { C[k] = cs.getPropertyValue('--' + k).trim(); });
  C.gold = '#C8A951';
  C.light = root.getAttribute('data-theme') === 'light';
}
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  dpr = window.devicePixelRatio || 1;
  scale = rect.width / W;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.width * (H / W) * dpr);
  draw();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function pathEdgeSet(path) {
  const s = new Set();
  for (let i = 0; i < path.length - 1; i++) { const e = findEdge(path[i], path[i + 1]); if (e) s.add(e.id); }
  return s;
}

function draw(now = performance.now()) {
  const N = state.nodes;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Fondo con cuadrícula técnica y puntos
  ctx.fillStyle = C['map-bg']; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C['map-grid']; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const vis = state.vis;
  const pathEdges = vis ? pathEdgeSet(vis.path) : new Set();
  const bfsEdges = (state.bfs && vis && vis.type === 'found') ? pathEdgeSet(state.bfs.path) : new Set();
  const treeEdges = new Set();
  if (vis) vis.prev.forEach((p, v) => { if (p !== -1) { const e = findEdge(p, v); if (e) treeEdges.add(e.id); } });

  // ---- Aristas ----
  for (const e of state.edges) {
    const a = N[e.u], b = N[e.v];
    const onPath = pathEdges.has(e.id);
    const relaxing = vis && vis.relaxEdge === e.id;
    const hover = state.hoverEdge === e.id;

    // Halo dorado al pasar el cursor
    if (hover) {
      ctx.save();
      ctx.strokeStyle = C.gold; ctx.globalAlpha = 0.35; ctx.lineWidth = 20; ctx.lineCap = 'round';
      ctx.shadowColor = C.gold; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.lineCap = 'round';
    if (e.blocked) {
      ctx.strokeStyle = C.danger; ctx.lineWidth = 5; ctx.setLineDash([12, 10]);
    } else if (onPath) {
      ctx.strokeStyle = C.path; ctx.lineWidth = 9;
      ctx.shadowColor = C.path; ctx.shadowBlur = C.light ? 6 : 18;
    } else if (relaxing) {
      ctx.strokeStyle = vis.improved ? C.visited : C.frontier; ctx.lineWidth = 8;
    } else if (treeEdges.has(e.id)) {
      ctx.strokeStyle = C.visited; ctx.globalAlpha = 0.6; ctx.lineWidth = 6;
    } else {
      ctx.strokeStyle = C.edge; ctx.lineWidth = 5;
    }
    if (hover && !onPath && !e.blocked) { ctx.strokeStyle = C.gold; ctx.globalAlpha = 1; }
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();

    // Ruta con menos saltos (BFS), discontinua
    if (bfsEdges.has(e.id) && !onPath && !e.blocked) {
      ctx.save();
      ctx.strokeStyle = C.bfs; ctx.lineWidth = 2.5; ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    }
  }

  // ---- Etiquetas de peso ----
  for (const e of state.edges) {
    const a = N[e.u], b = N[e.v];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const onPath = pathEdges.has(e.id);
    const hover = state.hoverEdge === e.id;
    const raised = state.peak && !e.blocked && peakFactor(e) > 1;
    const label = e.blocked ? '✕' : `${weight(e)}'`;
    ctx.font = '600 14px "JetBrains Mono", ui-monospace, monospace';
    const tw = Math.max(36, ctx.measureText(label).width + 16), th = 24;
    roundRect(mx - tw / 2, my - th / 2, tw, th, 12);
    ctx.fillStyle = onPath ? C.path : C['edge-label']; ctx.fill();
    ctx.lineWidth = hover ? 2 : 1.2;
    ctx.strokeStyle = e.blocked ? C.danger : (hover || onPath) ? C.gold : raised ? C.path : C['line-strong'];
    ctx.stroke();
    ctx.fillStyle = onPath ? '#101820' : e.blocked ? C.danger : raised ? C.path : C.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, my + 1);
  }

  // ---- Estela y partículas de la unidad ----
  const anim = state.anim;
  if (anim) {
    ctx.save();
    ctx.lineCap = 'round';
    // Flujo de luz que avanza sobre la ruta óptima mientras la unidad está en servicio
    if (anim.loop && anim.pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(anim.pts[0].x, anim.pts[0].y);
      for (let i = 1; i < anim.pts.length; i++) ctx.lineTo(anim.pts[i].x, anim.pts[i].y);
      ctx.strokeStyle = '#FFF3CF'; ctx.globalAlpha = 0.55; ctx.lineWidth = 2.5;
      ctx.setLineDash([3, 22]); ctx.lineDashOffset = -now / 28;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Estela dorada
    for (let i = 1; i < anim.trail.length; i++) {
      const t = i / anim.trail.length;
      ctx.strokeStyle = C.gold; ctx.globalAlpha = t * 0.95; ctx.lineWidth = 3 + 11 * t;
      ctx.shadowColor = C.gold; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.moveTo(anim.trail[i - 1].x, anim.trail[i - 1].y); ctx.lineTo(anim.trail[i].x, anim.trail[i].y); ctx.stroke();
    }
    // Partículas
    ctx.shadowBlur = 10; ctx.shadowColor = C.gold;
    for (const p of anim.particles) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.95;
      ctx.fillStyle = p.life > 0.6 ? '#FFF3CF' : C.gold;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---- Nodos ----
  for (const n of N) {
    const isO = n.id === state.origin, isD = n.id === state.dest;
    let ring = C['line-strong'], fill = C.node, ringW = 2.5;
    if (vis) {
      if (vis.done[n.id]) { fill = C.visited; ring = C.visited; }
      else if (vis.dist[n.id] < Infinity) { fill = C.frontier; ring = C.frontier; }
    }
    if (vis && vis.path.includes(n.id)) ring = C.path;
    if (isO) { ring = C.origin; ringW = 4.5; }
    if (isD) { ring = C.dest; ringW = 4.5; }

    if (vis && vis.current === n.id) {
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 13, 0, Math.PI * 2);
      ctx.fillStyle = C.gold; ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1;
    }
    if (vis && vis.updated === n.id) {
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 8, 0, Math.PI * 2);
      ctx.strokeStyle = C.visited; ctx.lineWidth = 2.5; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (state.hoverNode === n.id) {
      ctx.save();
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 8, 0, Math.PI * 2);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.shadowColor = C.gold; ctx.shadowBlur = 24; ctx.stroke();
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 16, 0, Math.PI * 2);
      ctx.globalAlpha = 0.18; ctx.fillStyle = C.gold; ctx.fill();
      ctx.restore();
    }
    // Destino alcanzado: anillo de llegada
    if (isD && anim && anim.arrivedAt) {
      const t = Math.min(1, (now - anim.arrivedAt) / 1100);
      if (t < 1) {
        ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 6 + 46 * t, 0, Math.PI * 2);
        ctx.strokeStyle = C.gold; ctx.globalAlpha = 1 - t; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 6, 0, Math.PI * 2);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2.5; ctx.shadowColor = C.gold; ctx.shadowBlur = 16; ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.globalAlpha = fill === C.node ? 1 : 0.92; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = ringW; ctx.strokeStyle = ring; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '21px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(n.icon, n.x, n.y + 1);

    // Código de zona
    const bx = n.x + NODE_R * 0.8, by = n.y - NODE_R * 0.8;
    ctx.beginPath(); ctx.arc(bx, by, 10.5, 0, Math.PI * 2);
    ctx.fillStyle = isO ? C.origin : isD ? C.dest : C['surface-3']; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = C['line-strong']; ctx.stroke();
    ctx.fillStyle = (isO || isD) ? '#101820' : C.text;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText(n.code, bx, by + 1);

    // Nombre (con contorno para que se lea sobre las calles)
    const below = n.y < H - 75;
    const ly = below ? n.y + NODE_R + 17 : n.y - NODE_R - 32;
    ctx.font = '600 13.5px "Space Grotesk", Inter, sans-serif';
    ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = C['map-bg'];
    ctx.strokeText(n.name, n.x, ly);
    ctx.fillStyle = C.text;
    ctx.fillText(n.name, n.x, ly);

    // Distancia
    if (vis && vis.dist[n.id] < Infinity) {
      const txt = `d = ${vis.dist[n.id]}`;
      ctx.font = '700 11.5px "JetBrains Mono", monospace';
      const tw = ctx.measureText(txt).width + 14;
      roundRect(n.x - tw / 2, ly + 10, tw, 19, 9.5);
      ctx.fillStyle = vis.done[n.id] ? C.visited : C.frontier; ctx.fill();
      ctx.fillStyle = C['badge-ink'];
      ctx.fillText(txt, n.x, ly + 20);
    }
  }

  // ---- Marcador de la unidad ----
  if (anim) {
    const p = anim.pos;
    const ph = now / 1000;
    const parked = !anim.moving && !anim.loop;          // recorrido único ya terminado
    const pulse = parked ? 0.5 : 0.5 + 0.5 * Math.sin(ph * 6);
    ctx.save();
    // Ondas expansivas del halo (dos anillos desfasados); en reposo no se dibujan
    for (let k = 0; k < (parked ? 0 : 2); k++) {
      const t = ((ph * 1.2) + k * 0.5) % 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 16 + 34 * t, 0, Math.PI * 2);
      ctx.strokeStyle = C.gold; ctx.globalAlpha = 0.6 * (1 - t); ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Halo luminoso
    const halo = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 34 + 6 * pulse);
    halo.addColorStop(0, 'rgba(255,243,207,0.95)');
    halo.addColorStop(0.35, 'rgba(200,169,81,0.55)');
    halo.addColorStop(1, 'rgba(200,169,81,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(p.x, p.y, 34 + 6 * pulse, 0, Math.PI * 2); ctx.fill();
    // Cuerpo del marcador
    ctx.shadowColor = C.gold; ctx.shadowBlur = 34;
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = C.gold; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#101820'; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 5.5 + 1.5 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF8E1'; ctx.fill();
    // Indicador de dirección
    if (anim.moving) {
      ctx.translate(p.x, p.y); ctx.rotate(p.ang);
      ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(16, -6); ctx.lineTo(16, 6); ctx.closePath();
      ctx.fillStyle = '#FFF8E1'; ctx.shadowColor = C.gold; ctx.shadowBlur = 12; ctx.fill();
    }
    ctx.restore();
    // Etiqueta con tiempo restante
    const eta = Math.max(0, Math.round(anim.minutes * (1 - anim.progress)));
    const lbl = anim.moving ? `🚑 UNIDAD 01 · ETA ${eta} min` : '🚑 UNIDAD 01 · EN DESTINO';
    ctx.font = '700 11.5px "JetBrains Mono", monospace';
    const tw = ctx.measureText(lbl).width + 20;
    const ly = p.y - 56;
    roundRect(p.x - tw / 2, ly, tw, 24, 12);
    ctx.fillStyle = '#101820'; ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#F4F1EA'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(lbl, p.x, ly + 12.5);
  }

  // Indicador de hora pico
  if (state.peak) {
    ctx.font = '600 12px "JetBrains Mono", monospace';
    const t = '● HORA PICO ACTIVA';
    const tw = ctx.measureText(t).width + 24;
    roundRect(W - tw - 14, H - 38, tw, 26, 13);
    ctx.fillStyle = C.gold; ctx.fill();
    ctx.fillStyle = '#101820'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, W - tw / 2 - 14, H - 24);
  }
}

/* =========================================================
   10. PANELES DE RESULTADOS
   ========================================================= */
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt1 = (x) => x.toLocaleString('es', { maximumFractionDigits: 1 });
const metaBox = (v, l, hl) => `<div class="meta-box${hl ? ' hl' : ''}"><b>${v}</b><span>${l}</span></div>`;

function renderAll() {
  draw();
  renderRoute();
  renderSavings();
  renderVisited();
  renderTable();
  renderLog();
}

function renderRoute() {
  const vis = state.vis, N = state.nodes;
  routeMeta.innerHTML = '';
  if (!vis) {
    routeText.className = 'route-text muted';
    routeText.textContent = 'Pulsa «Ejecutar» o «Paso a paso» para calcular la ruta.';
    return;
  }
  if (vis.type === 'found') {
    const p = vis.path;
    routeText.className = 'route-text';
    const streets = [];
    for (let i = 0; i < p.length - 1; i++) streets.push(findEdge(p[i], p[i + 1]).name);
    routeText.innerHTML = p.map(i => `<span class="hop">${N[i].icon} ${esc(N[i].name)}</span>`).join('<span class="arrow">→</span>')
      + `<p class="route-streets">Por: ${streets.map(esc).join(' → ')}</p>`;
    const comp = vis.stats && vis.stats.ms != null;
    routeMeta.innerHTML = metaBox(vis.dist[state.dest] + ' min', 'Tiempo total', true)
      + metaBox(p.length - 1, 'Calles recorridas')
      + metaBox(vis.order.length, 'Nodos visitados')
      + metaBox(comp ? vis.stats.ms.toFixed(2) + ' ms' : (vis.stats ? vis.stats.steps : '—'), comp ? 'Tiempo de cómputo' : 'Pasos ejecutados');
  } else if (vis.type === 'unreachable') {
    routeText.className = 'route-text error';
    routeText.textContent = `⛔ No hay ruta entre ${N[state.origin].name} y ${N[state.dest].name} con las calles abiertas. Reabre alguna calle o restablece el tráfico.`;
    routeMeta.innerHTML = metaBox('∞', 'Tiempo total') + metaBox(vis.order.length, 'Nodos visitados');
  } else {
    routeText.className = 'route-text muted';
    routeText.textContent = `Calculando… paso ${vis.stats ? vis.stats.steps : ''}. Usa «Siguiente» o «Auto» para avanzar.`;
    routeMeta.innerHTML = metaBox(vis.order.length, 'Nodos fijados') + metaBox(vis.queue.length, 'En la cola');
  }
}

function renderSavings() {
  const vis = state.vis, N = state.nodes;
  if (!vis || vis.type !== 'found' || !state.bfs) {
    savingsBody.innerHTML = !vis
      ? '<p class="muted">Compara la ruta de Dijkstra con la ruta de <strong>menos saltos</strong> (BFS sin pesos). Aparecerá al calcular la ruta.</p>'
      : vis.type === 'unreachable'
        ? '<p class="muted">Sin ruta disponible: no hay nada que comparar.</p>'
        : '<p class="muted">Disponible cuando termine la ejecución paso a paso.</p>';
    return;
  }
  const dT = vis.dist[state.dest];
  const b = state.bfs;
  const saved = b.time - dT;
  const pct = b.time > 0 ? saved / b.time * 100 : 0;
  const max = Math.max(dT, b.time, 1);
  const names = (path) => path.map(i => N[i].code).join(' → ');
  savingsBody.innerHTML = `
    <div class="savings-big">${saved > 0 ? '−' + fmt1(pct) + '%' : '0%'}<small>${saved > 0 ? `${saved} min ahorrados` : 'misma duración'}</small></div>
    <div class="bar-row">
      <header><span>Dijkstra (óptima)</span><b>${dT} min</b></header>
      <div class="bar"><i class="b-dij" style="width:0" data-w="${dT / max * 100}"></i></div>
    </div>
    <div class="bar-row">
      <header><span>BFS (menos saltos)</span><b>${b.time} min</b></header>
      <div class="bar"><i class="b-bfs" style="width:0" data-w="${b.time / max * 100}"></i></div>
    </div>
    <p class="savings-route">${saved > 0
      ? `La ruta de menos calles (<b>${names(b.path)}</b>, ${b.path.length - 1} calles) tarda ${b.time} min. Dijkstra usa ${vis.path.length - 1} calles y llega <b>${saved} min antes</b>.`
      : `Aquí la ruta con menos calles (<b>${names(b.path)}</b>) ya es la más rápida. Prueba la hora pico o un accidente.`}</p>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    savingsBody.querySelectorAll('.bar i').forEach(i => { i.style.width = i.dataset.w + '%'; });
  }));
}

function renderVisited() {
  const vis = state.vis, N = state.nodes;
  if (!vis) {
    visitedList.innerHTML = queueList.innerHTML = '<span class="muted">—</span>';
    return;
  }
  visitedList.innerHTML = vis.order.length
    ? vis.order.map((i, k) => `<span class="tag">${k + 1}. ${N[i].code} ${esc(N[i].name)}</span>`).join('')
    : '<span class="muted">Ninguno todavía</span>';
  queueList.innerHTML = vis.queue.length
    ? vis.queue.map(([d, v]) => `<span class="tag q ${vis.done[v] ? 'stale' : ''}" title="${vis.done[v] ? 'Entrada obsoleta (ya visitado)' : ''}">(${N[v].code}, ${d})</span>`).join('')
    : '<span class="muted">Vacía</span>';
}

function renderTable() {
  const vis = state.vis, N = state.nodes;
  const onPath = new Set(vis ? vis.path : []);
  distBody.innerHTML = N.map(n => {
    const d = vis ? vis.dist[n.id] : Infinity;
    const p = vis ? vis.prev[n.id] : -1;
    let badge = '<span class="badge none">Sin explorar</span>';
    if (vis && vis.done[n.id]) badge = '<span class="badge final">Definitiva</span>';
    else if (vis && d < Infinity) badge = '<span class="badge tent">Tentativa</span>';
    const cls = [onPath.has(n.id) ? 'on-path' : '', vis && vis.updated === n.id ? 'updated' : ''].join(' ');
    const role = n.id === state.origin ? ' <small class="muted">· origen</small>' : n.id === state.dest ? ' <small class="muted">· destino</small>' : '';
    return `<tr class="${cls}">
      <td><span class="zone-dot">${n.code}</span>${esc(n.name)}${role}</td>
      <td class="num">${d === Infinity ? '∞' : d}</td>
      <td>${p === -1 ? '—' : N[p].code + ' · ' + esc(N[p].name)}</td>
      <td>${badge}</td></tr>`;
  }).join('');
}

function renderLog() {
  if (!logLines.length) {
    stepLog.innerHTML = '<li class="muted">Aún no se ha ejecutado el algoritmo.</li>';
    return;
  }
  stepLog.innerHTML = logLines.map(l => `<li class="${l.cls}">${l.text}</li>`).join('');
  stepLog.scrollTop = stepLog.scrollHeight;
}

/* =========================================================
   11. INTERACCIÓN CON EL MAPA: hover, tooltip, clic
   ========================================================= */
function toLogical(evt) {
  const r = canvas.getBoundingClientRect();
  return { x: (evt.clientX - r.left) / scale, y: (evt.clientY - r.top) / scale };
}
function hitNode(p) {
  for (const n of state.nodes) if (Math.hypot(p.x - n.x, p.y - n.y) <= NODE_R + 5) return n.id;
  return -1;
}
function hitEdge(p) {
  let best = -1, bestD = 14;
  for (const e of state.edges) {
    const d = distToSegment(p, state.nodes[e.u], state.nodes[e.v]);
    if (d < bestD) { bestD = d; best = e.id; }
  }
  return best;
}

function nodeTip(id) {
  const n = state.nodes[id], vis = state.vis;
  let status = 'Sin explorar';
  if (vis && vis.done[id]) status = 'Definitiva';
  else if (vis && vis.dist[id] < Infinity) status = 'Tentativa (en cola)';
  const role = id === state.origin ? 'Origen' : id === state.dest ? 'Destino' : 'Zona';
  const d = vis ? vis.dist[id] : Infinity;
  const p = vis ? vis.prev[id] : -1;
  const streets = state.edges.filter(e => e.u === id || e.v === id);
  const open = streets.filter(e => !e.blocked).length;
  return `<div class="tt-title"><span>${n.icon}</span>${esc(n.name)}</div>
    <div class="tt-row"><span>Código · rol</span><b>${n.code} · ${role}</b></div>
    <div class="tt-row"><span>Distancia acumulada</span><b>${d === Infinity ? '∞' : d + ' min'}</b></div>
    <div class="tt-row"><span>Predecesor</span><b>${p === -1 ? '—' : state.nodes[p].code}</b></div>
    <div class="tt-row"><span>Estado</span><b>${status}</b></div>
    <div class="tt-row"><span>Calles abiertas</span><b>${open}/${streets.length}</b></div>
    <div class="tt-hint">Clic: origen · Mayús + clic: destino</div>`;
}
function edgeTip(id) {
  const e = state.edges[id], N = state.nodes;
  const onPath = state.vis && pathEdgeSet(state.vis.path).has(id);
  const f = peakFactor(e);
  let status = 'Fluida';
  if (e.blocked) status = '⛔ Cerrada';
  else if (onPath) status = '★ En ruta óptima';
  else if (f > 1) status = `Congestionada ×${f}`;
  return `<div class="tt-title"><span>🛣️</span>${esc(e.name)}</div>
    <div class="tt-row"><span>Conecta</span><b>${N[e.u].code} ↔ ${N[e.v].code}</b></div>
    <div class="tt-row"><span>Tiempo actual</span><b>${e.blocked ? '—' : weight(e) + ' min'}</b></div>
    <div class="tt-row"><span>Tiempo base</span><b>${e.base} min</b></div>
    <div class="tt-row"><span>Estado de la vía</span><b>${status}</b></div>
    <div class="tt-hint">Clic para editar minutos o cerrar</div>`;
}
function showTip(html, evt) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 16, tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + tw > window.innerWidth - 8) x = evt.clientX - tw - pad;
  if (y + th > window.innerHeight - 8) y = evt.clientY - th - pad;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}
function hideTip() { tip.hidden = true; }

canvas.addEventListener('mousemove', (evt) => {
  const p = toLogical(evt);
  const n = hitNode(p);
  const e = n === -1 ? hitEdge(p) : -1;
  if (n !== state.hoverNode || e !== state.hoverEdge) {
    state.hoverNode = n; state.hoverEdge = e;
    canvas.style.cursor = (n !== -1 || e !== -1) ? 'pointer' : 'default';
    if (!rafId) draw();
  }
  if (n !== -1) showTip(nodeTip(n), evt);
  else if (e !== -1) showTip(edgeTip(e), evt);
  else hideTip();
});
canvas.addEventListener('mouseleave', () => {
  state.hoverNode = -1; state.hoverEdge = -1; hideTip();
  if (!rafId) draw();
});
window.addEventListener('scroll', hideTip, { passive: true });
canvas.addEventListener('click', (evt) => {
  const p = toLogical(evt);
  const n = hitNode(p);
  if (n !== -1) { if (evt.shiftKey) setDest(n); else setOrigin(n); return; }
  const e = hitEdge(p);
  if (e !== -1) { hideTip(); openEdgeDialog(e); }
});

function setOrigin(n) {
  if (n === state.dest) state.dest = state.origin;
  state.origin = n;
  syncSelects();
  toast(`Origen: ${state.nodes[n].name}`);
  onSelectionChange();
}
function setDest(n) {
  if (n === state.origin) state.origin = state.dest;
  state.dest = n;
  syncSelects();
  toast(`Destino: ${state.nodes[n].name}`);
  onSelectionChange();
}
function onSelectionChange() {
  cancelStepper();
  if (state.vis) runInstant(true);
  else if (validSelection()) renderAll();
}

/* ---- Diálogo de edición ---- */
function openEdgeDialog(id) {
  const e = state.edges[id], N = state.nodes;
  state.editing = id;
  $('edgeDialogTitle').textContent = e.name;
  $('edgeDialogSub').textContent = `${N[e.u].code} · ${N[e.u].name}  ↔  ${N[e.v].code} · ${N[e.v].name}`;
  $('edgeMinutes').value = e.base;
  $('edgeBlocked').checked = e.blocked;
  updatePeakNote();
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  $('edgeMinutes').focus();
  $('edgeMinutes').select();
}
function updatePeakNote() {
  const e = state.edges[state.editing];
  if (!e) return;
  const v = Math.max(1, +$('edgeMinutes').value || 1);
  $('edgePeakNote').textContent = state.peak
    ? `Con hora pico se aplica ×${peakFactor(e)} → ${Math.round(v * peakFactor(e))} min efectivos.` : '';
}
function closeDialog() {
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  state.editing = -1;
}
$('edgeMinutes').addEventListener('input', updatePeakNote);
$('edgeCancel').addEventListener('click', closeDialog);
$('edgeForm').addEventListener('submit', (evt) => {
  evt.preventDefault();
  const e = state.edges[state.editing];
  if (!e) { closeDialog(); return; }
  const v = Math.round(+$('edgeMinutes').value);
  if (!Number.isFinite(v) || v < 1 || v > 99) { toast('Introduce un valor entre 1 y 99 minutos'); return; }
  const wasBlocked = e.blocked;
  e.base = v;
  e.blocked = $('edgeBlocked').checked;
  closeDialog();
  updateChips();
  toast(e.blocked ? `${e.name} cerrada` : wasBlocked ? `${e.name} reabierta (${weight(e)} min)` : `${e.name}: ${weight(e)} min`);
  cancelStepper();
  recalcIfShown();
});

/* =========================================================
   12. CONTROLES, HERO Y SELECTORES
   ========================================================= */
function fillSelects() {
  const opts = state.nodes.map(n => `<option value="${n.id}">${n.icon} ${n.code} · ${esc(n.name)}</option>`).join('');
  [originSel, destSel, heroOrigin, heroDest].forEach(s => { s.innerHTML = opts; });
  syncSelects();
}
function syncSelects() {
  originSel.value = heroOrigin.value = state.origin;
  destSel.value = heroDest.value = state.dest;
}
originSel.addEventListener('change', () => { state.origin = +originSel.value; syncSelects(); onSelectionChange(); });
destSel.addEventListener('change', () => { state.dest = +destSel.value; syncSelects(); onSelectionChange(); });

$('quickbar').addEventListener('submit', (evt) => {
  evt.preventDefault();
  const o = +heroOrigin.value, d = +heroDest.value;
  if (o === d) { toast('Elige un origen y un destino distintos'); return; }
  state.origin = o; state.dest = d;
  syncSelects();
  cancelStepper();
  $('simulador').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => runInstant(false), reduceMotion.matches ? 0 : 700);
});

btnPeak.addEventListener('click', togglePeak);
btnAccident.addEventListener('click', simulateAccident);
btnReset.addEventListener('click', resetTraffic);
btnNewCity.addEventListener('click', newCity);
btnRun.addEventListener('click', () => runInstant(false));
btnStepStart.addEventListener('click', startStepper);
btnStep.addEventListener('click', () => { stopTimer(); nextStep(); });
btnPlay.addEventListener('click', togglePlay);
btnFinish.addEventListener('click', finishStepper);
$('btnReplay').addEventListener('click', replayDispatch);

/* ---- Guía rápida (?) ---- */
const helpDialog = $('helpDialog');
function openHelp() {
  hideTip();
  if (typeof helpDialog.showModal === 'function') helpDialog.showModal(); else helpDialog.setAttribute('open', '');
}
function closeHelp() {
  if (typeof helpDialog.close === 'function') helpDialog.close(); else helpDialog.removeAttribute('open');
}
document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', openHelp));
$('helpClose').addEventListener('click', closeHelp);
$('helpStart').addEventListener('click', closeHelp);
helpDialog.addEventListener('click', (evt) => { if (evt.target === helpDialog) closeHelp(); });  // clic fuera
speedRange.addEventListener('input', () => { if (state.timer) { stopTimer(); togglePlay(); } });

/* ---- Toast ---- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---- Tema (oscuro por defecto) ---- */
$('themeToggle').addEventListener('click', () => {
  const light = root.getAttribute('data-theme') !== 'light';
  if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
  try { localStorage.setItem('tema', light ? 'light' : 'dark'); } catch (e) { /* sin almacenamiento */ }
  readColors();
  draw();
});

/* ---- Logo: hover ---- */
const brand = $('brand');
brand.addEventListener('mouseenter', () => { brandHover = true; syncLogo(); });
brand.addEventListener('mouseleave', () => { brandHover = false; syncLogo(); });
brand.addEventListener('focus', () => { brandHover = true; syncLogo(); });
brand.addEventListener('blur', () => { brandHover = false; syncLogo(); });

/* ---- Menú móvil ---- */
const navLinks = $('navLinks'), menuBtn = $('menuToggle');
menuBtn.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  navLinks.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
}));

/* ---- Indicador de sección 0X/06 y enlace activo ---- */
const sections = [...document.querySelectorAll('main section[id]')];
function setSection(idx) {
  const num = String(idx + 1).padStart(2, '0');
  $('navSection').textContent = `${num}/06`;
  $('metricSection').textContent = num;
  $('metricSectionName').textContent = sections[idx].dataset.name;
  document.querySelectorAll('#secDots i').forEach((d, k) => d.classList.toggle('on', k <= idx));
  navLinks.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + sections[idx].id));
}
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) setSection(sections.indexOf(en.target)); });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));

  const ro = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); ro.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => ro.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
}

/* =========================================================
   13. RED ANIMADA DEL HERO
   ========================================================= */
function initHeroNet() {
  const c = $('heroNet');
  const g = c.getContext('2d');
  let w = 0, h = 0, pts = [], pulses = [], visible = true, raf = 0;

  function resize() {
    const r = c.getBoundingClientRect();
    const k = window.devicePixelRatio || 1;
    w = r.width; h = r.height;
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    g.setTransform(k, 0, 0, k, 0, 0);
    const n = Math.round(Math.min(70, Math.max(24, w * h / 20000)));
    pts = Array.from({ length: n }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-0.18, 0.18), vy: rand(-0.18, 0.18) }));
    pulses = [];
    paint();
  }
  function paint() {
    const light = root.getAttribute('data-theme') === 'light';
    const lineRGB = light ? '11,93,74' : '31,111,91';
    const dotCol = light ? 'rgba(11,93,74,0.45)' : 'rgba(230,213,184,0.45)';
    g.clearRect(0, 0, w, h);
    const R = 150;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < R) {
          g.strokeStyle = `rgba(${lineRGB},${(1 - d / R) * (light ? 0.35 : 0.55)})`;
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[j].x, pts[j].y); g.stroke();
        }
      }
    }
    g.fillStyle = dotCol;
    for (const p of pts) { g.beginPath(); g.arc(p.x, p.y, 1.8, 0, Math.PI * 2); g.fill(); }
    for (const p of pulses) {
      const a = pts[p.a], b = pts[p.b];
      const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
      g.save();
      g.shadowColor = '#C8A951'; g.shadowBlur = 12;
      g.fillStyle = `rgba(200,169,81,${Math.sin(p.t * Math.PI)})`;
      g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  function tick() {
    raf = 0;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    if (pulses.length < 6 && Math.random() < 0.05) {
      const a = Math.floor(Math.random() * pts.length);
      let best = -1, bd = 150;
      pts.forEach((q, k) => { const d = Math.hypot(q.x - pts[a].x, q.y - pts[a].y); if (k !== a && d < bd && Math.random() < 0.7) { bd = d; best = k; } });
      if (best !== -1) pulses.push({ a, b: best, t: 0 });
    }
    pulses.forEach(p => { p.t += 0.012; });
    pulses = pulses.filter(p => p.t < 1);
    paint();
    if (visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function start() { if (!raf && !reduceMotion.matches) raf = requestAnimationFrame(tick); }

  resize();
  window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }).observe(c);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) start(); });
  $('themeToggle').addEventListener('click', paint);
  start();
}

/* =========================================================
   14. MÉTRICAS EN VIVO DEL HERO
   ========================================================= */
function compact(n) {
  if (n >= 1e6) return (Math.floor(n / 1e5) / 10).toLocaleString('es') + 'M+';
  if (n >= 1e3) return Math.floor(n / 1e3) + 'K+';
  return String(Math.round(n));
}
function countUp(el, to, formatter, ms = 1200) {
  if (reduceMotion.matches) { el.textContent = formatter(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = formatter(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Velocidad: Dijkstra sobre un grafo aleatorio de 20 000 nodos */
function runBenchmark() {
  const N = 20000;
  const adj = Array.from({ length: N }, () => []);
  const link = (u, v, w) => { adj[u].push({ v, w }); adj[v].push({ v: u, w }); };
  for (let i = 0; i < N; i++) {
    if (i + 1 < N) link(i, i + 1, 1 + Math.floor(Math.random() * 30));
    for (let k = 0; k < 2; k++) link(i, Math.floor(Math.random() * N), 1 + Math.floor(Math.random() * 30));
  }
  const edges = adj.reduce((s, l) => s + l.length, 0) / 2;
  const samples = [];
  let processed = 0, elapsed = 0, runs = 0;
  const once = () => {
    const t0 = performance.now();
    processed += dijkstraFast(adj, Math.floor(Math.random() * N));
    const dt = performance.now() - t0;
    elapsed += dt; runs++;
    samples.push(N / (dt / 1000));
    if (runs < 12 && elapsed < 600) { setTimeout(once, 0); return; }
    const rate = processed / (elapsed / 1000);
    if (!Number.isFinite(rate) || elapsed < 1) {   // reloj sin resolución suficiente
      $('metricSpeedNote').textContent = 'No se pudo medir el tiempo en este navegador.';
      return;
    }
    countUp($('metricSpeed'), rate, compact);
    $('metricSpeedNote').textContent =
      `${runs} ejecuciones sobre ${N.toLocaleString('es')} nodos y ${Math.round(edges).toLocaleString('es')} aristas, medidas ahora en tu navegador.`;
    const max = Math.max(...samples), min = Math.min(...samples);
    const d = samples.map((s, i) => `${i ? 'L' : 'M'}${(i / (samples.length - 1 || 1)) * 300},${36 - ((s - min) / (max - min || 1)) * 30}`).join(' ');
    $('sparkPath').setAttribute('d', d);
  };
  setTimeout(once, 0);
}

/** Precisión: Dijkstra vs Floyd-Warshall en ciudades aleatorias */
function runVerification() {
  const CITIES = 120;
  let done = 0, total = 0, ok = 0;
  const batch = () => {
    for (let b = 0; b < 10 && done < CITIES; b++, done++) {
      const city = generateCity();
      const list = city.edges
        .map(([u, v, w], id) => ({ u, v, w: Math.round(w * (Math.random() < 0.3 ? 2 : 1)), id }))
        .filter(() => Math.random() > 0.12);           // cierra ~12 % de calles al azar
      const adj = adjFrom(10, list);
      const D = floydWarshall(10, list);
      for (let s = 0; s < 10; s++) {
        let last;
        for (const ev of dijkstra(adj, s, -1)) last = ev;
        for (let t = 0; t < 10; t++) {
          if (t === s) continue;
          total++;
          if (last.dist[t] === D[s][t]) ok++;
        }
      }
    }
    if (done < CITIES) { setTimeout(batch, 0); return; }
    const pct = ok / total * 100;
    countUp($('metricPrecision'), pct, (x) => (x >= 99.95 ? Math.round(x) : fmt1(x)) + '%');
    $('metricPrecisionNote').textContent =
      `${ok.toLocaleString('es')} de ${total.toLocaleString('es')} rutas idénticas a Floyd-Warshall en ${CITIES} ciudades aleatorias.`;
  };
  setTimeout(batch, 0);
}

/* =========================================================
   15. ARRANQUE
   ========================================================= */
readColors();
loadCity(DEFAULT_CITY);
window.addEventListener('resize', resizeCanvas);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
resizeCanvas();
renderAll();
syncLogo();
initHeroNet();
setTimeout(() => { runBenchmark(); runVerification(); }, 500);

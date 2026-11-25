/* =========================================================
   Dijkstra Urbano — lógica del simulador
   - Grafo de 10 zonas urbanas y 19 calles (no dirigido)
   - Dijkstra con montículo binario (cola de prioridad mínima)
   - Ejecución instantánea y paso a paso (generador)
   - Visualización en HTML5 Canvas
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   1. MODELO DE LA CIUDAD
   Coordenadas en un lienzo lógico de 1000 × 620
--------------------------------------------------------- */
const W = 1000, H = 620;

const NODES = [
  { id: 0, code: 'A', name: 'Hospital Central',  icon: '🏥', x: 140, y: 120 },
  { id: 1, code: 'B', name: 'Universidad',       icon: '🎓', x: 430, y: 95  },
  { id: 2, code: 'C', name: 'Parque Norte',      icon: '🌳', x: 720, y: 110 },
  { id: 3, code: 'D', name: 'Aeropuerto',        icon: '✈️', x: 895, y: 265 },
  { id: 4, code: 'E', name: 'Estación Bomberos', icon: '🚒', x: 105, y: 365 },
  { id: 5, code: 'F', name: 'Centro Histórico',  icon: '🏛️', x: 385, y: 310 },
  { id: 6, code: 'G', name: 'Plaza Mayor',       icon: '⛲', x: 640, y: 325 },
  { id: 7, code: 'H', name: 'Mercado Municipal', icon: '🛒', x: 230, y: 530 },
  { id: 8, code: 'I', name: 'Zona Industrial',   icon: '🏭', x: 525, y: 525 },
  { id: 9, code: 'J', name: 'Estadio',           icon: '🏟️', x: 845, y: 510 }
];

// [u, v, minutos, nombre]
const EDGE_DATA = [
  [0, 1, 7,  'Av. Universitaria'],
  [0, 4, 9,  'Calle del Socorro'],
  [0, 5, 12, 'Av. Central'],
  [1, 2, 10, 'Paseo Norte'],
  [1, 5, 6,  'Calle Colegio'],
  [1, 6, 14, 'Diagonal Norte'],
  [2, 3, 8,  'Autopista Aérea'],
  [2, 6, 7,  'Calle Jardines'],
  [3, 6, 11, 'Av. Aeropuerto'],
  [3, 9, 9,  'Periférico Este'],
  [4, 5, 8,  'Calle Bomberos'],
  [4, 7, 6,  'Calle Ribera'],
  [5, 6, 5,  'Bulevar Mayor'],
  [5, 7, 10, 'Calle Comercio'],
  [5, 8, 9,  'Av. Fábricas'],
  [6, 8, 6,  'Calle Obreros'],
  [6, 9, 10, 'Av. Deportes'],
  [7, 8, 11, 'Vía Sur'],
  [8, 9, 8,  'Periférico Sur']
];

// Las calles que tocan el núcleo urbano (Centro y Plaza) sufren más en hora pico
const CORE = new Set([5, 6]);
const PEAK_CORE = 2.0;
const PEAK_OTHER = 1.3;

const makeEdges = () => EDGE_DATA.map(([u, v, w, name], i) => ({
  id: i, u, v, base: w, name, blocked: false
}));

const state = {
  edges: makeEdges(),
  peak: false,
  origin: 4,      // Estación de Bomberos
  dest: 3,        // Aeropuerto
  vis: null,      // estado visual actual del algoritmo
  stepper: null,  // generador activo en modo paso a paso
  timer: null,
  hoverEdge: -1,
  hoverNode: -1,
  editing: -1
};

function peakFactor(e) {
  if (!state.peak) return 1;
  return (CORE.has(e.u) || CORE.has(e.v)) ? PEAK_CORE : PEAK_OTHER;
}
function weight(e) {
  return e.blocked ? Infinity : Math.round(e.base * peakFactor(e));
}
function buildAdjacency() {
  const adj = NODES.map(() => []);
  for (const e of state.edges) {
    if (e.blocked) continue;
    const w = weight(e);
    adj[e.u].push({ v: e.v, w, edge: e.id });
    adj[e.v].push({ v: e.u, w, edge: e.id });
  }
  return adj;
}
const nodeLabel = (i) => `${NODES[i].code} · ${NODES[i].name}`;

/* ---------------------------------------------------------
   2. COLA DE PRIORIDAD (montículo binario mínimo)
--------------------------------------------------------- */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {               // item = [prioridad, nodo]
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

/* ---------------------------------------------------------
   3. ALGORITMO DE DIJKSTRA (generador de eventos)
   Cada `yield` es un paso observable del algoritmo.
--------------------------------------------------------- */
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
    if (done[u]) {                       // entrada obsoleta en el montículo
      yield snap({ type: 'stale', u, d });
      continue;
    }
    done[u] = true;
    order.push(u);
    yield snap({ type: 'extract', u, d });

    if (u === dst) {                     // destino fijado: parada temprana
      yield snap({ type: 'found', u });
      return;
    }

    for (const { v, w, edge } of adj[u]) {
      if (done[v]) continue;
      const old = dist[v];
      const nd = d + w;
      const improved = nd < old;
      if (improved) {                    // relajación
        dist[v] = nd;
        prev[v] = u;
        heap.push([nd, v]);
      }
      yield snap({ type: 'relax', u, v, w, edge, old, nd, improved });
    }
  }
  yield snap({ type: 'unreachable' });
}

function reconstructPath(prev, dst) {
  const path = [];
  for (let v = dst; v !== -1; v = prev[v]) path.unshift(v);
  return path;
}

/* ---------------------------------------------------------
   4. REFERENCIAS DOM
--------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const canvas = $('mapCanvas');
const ctx = canvas.getContext('2d');
const originSel = $('originSelect');
const destSel = $('destSelect');
const btnPeak = $('btnPeak');
const btnAccident = $('btnAccident');
const btnReset = $('btnReset');
const btnRun = $('btnRun');
const btnStepStart = $('btnStepStart');
const btnStep = $('btnStep');
const btnPlay = $('btnPlay');
const btnFinish = $('btnFinish');
const speedRange = $('speedRange');
const routeText = $('routeText');
const routeMeta = $('routeMeta');
const visitedList = $('visitedList');
const queueList = $('queueList');
const stepLog = $('stepLog');
const distBody = document.querySelector('#distTable tbody');
const dialog = $('edgeDialog');

/* ---------------------------------------------------------
   5. EJECUCIÓN
--------------------------------------------------------- */
let logLines = [];

function describe(ev) {
  const N = (i) => NODES[i].code;
  switch (ev.type) {
    case 'init':
      return { cls: 'ext', text: `Inicio: d[${N(ev.u)}] = 0, el resto = ∞. Se inserta ${N(ev.u)} en la cola.` };
    case 'stale':
      return { cls: 'no', text: `Se extrae (${N(ev.u)}, ${ev.d}), pero ${N(ev.u)} ya era definitivo: se descarta.` };
    case 'extract':
      return { cls: 'ext', text: `Extraer mínimo: ${N(ev.u)} con d = ${ev.d}. Su distancia queda fija.` };
    case 'relax': {
      const o = ev.old === Infinity ? '∞' : ev.old;
      return ev.improved
        ? { cls: 'ok', text: `Relajar ${N(ev.u)}→${N(ev.v)}: ${ev.nd - ev.w} + ${ev.w} = ${ev.nd} < ${o} ✓ actualizar` }
        : { cls: 'no', text: `Relajar ${N(ev.u)}→${N(ev.v)}: ${ev.nd - ev.w} + ${ev.w} = ${ev.nd} ≥ ${o} ✗ sin cambio` };
    }
    case 'found':
      return { cls: 'fin', text: `¡Destino ${N(ev.u)} alcanzado! Tiempo mínimo: ${ev.dist[ev.u]} min.` };
    case 'unreachable':
      return { cls: 'fin', text: `Cola vacía: el destino es inalcanzable con las calles disponibles.` };
  }
  return { cls: '', text: '' };
}

function applyEvent(ev, stats) {
  const prevVis = state.vis;
  const path = (ev.type === 'found') ? reconstructPath(ev.prev, state.dest) : [];
  state.vis = {
    ...ev,
    path,
    current: (ev.type === 'extract' || ev.type === 'relax' || ev.type === 'stale') ? ev.u : -1,
    relaxEdge: ev.type === 'relax' ? ev.edge : -1,
    updated: (ev.type === 'relax' && ev.improved) ? ev.v : -1,
    finished: ev.type === 'found' || ev.type === 'unreachable',
    stats: stats || (prevVis && prevVis.stats) || null
  };
  logLines.push(describe(ev));
}

function stopTimer() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  btnPlay.textContent = '▶ Auto';
}

function setStepButtons(active) {
  btnStep.disabled = !active;
  btnPlay.disabled = !active;
  btnFinish.disabled = !active;
}

function cancelStepper() {
  stopTimer();
  state.stepper = null;
  setStepButtons(false);
}

/** Ejecución instantánea: corre el generador hasta el final */
function runInstant(silent) {
  cancelStepper();
  if (!validSelection()) return;
  logLines = [];
  const t0 = performance.now();
  const gen = dijkstra(buildAdjacency(), state.origin, state.dest);
  const events = [];
  for (const ev of gen) events.push(ev);
  const ms = performance.now() - t0;
  for (const ev of events) applyEvent(ev);
  state.vis.stats = { ms, steps: events.length };
  state.vis.relaxEdge = -1;
  state.vis.updated = -1;
  state.vis.current = -1;
  renderAll();
  if (!silent) toast(state.vis.type === 'found'
    ? `Ruta calculada en ${ms.toFixed(2)} ms`
    : 'No existe ruta disponible');
}

/** Modo paso a paso */
function startStepper() {
  cancelStepper();
  if (!validSelection()) return;
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
  renderAll();
  if (state.vis.finished) cancelStepper();
}

function finishStepper() {
  if (!state.stepper) return;
  stopTimer();
  let r;
  while (!(r = state.stepper.next()).done) {
    state.stepCount++;
    applyEvent(r.value, { ms: null, steps: state.stepCount });
  }
  state.vis.relaxEdge = -1; state.vis.current = -1; state.vis.updated = -1;
  cancelStepper();
  renderAll();
}

function togglePlay() {
  if (state.timer) { stopTimer(); return; }
  btnPlay.textContent = '⏸ Pausa';
  state.timer = setInterval(() => {
    nextStep();
    if (!state.stepper) stopTimer();
  }, +speedRange.value);
}

function validSelection() {
  if (state.origin === state.dest) {
    state.vis = null; logLines = [];
    routeText.className = 'route-text error';
    routeText.textContent = 'El origen y el destino son la misma zona. Elige zonas distintas.';
    routeMeta.innerHTML = '';
    draw();
    return false;
  }
  return true;
}

/** Recalcula al instante si ya había un resultado visible (tiempo real) */
function recalcIfShown() {
  if (state.vis) runInstant(true);
  else draw();
}

/* ---------------------------------------------------------
   6. ESCENARIOS
--------------------------------------------------------- */
function togglePeak() {
  state.peak = !state.peak;
  btnPeak.setAttribute('aria-pressed', String(state.peak));
  btnPeak.textContent = state.peak ? '🚦 Pico: ON' : '🚦 Hora pico';
  toast(state.peak
    ? `Hora pico: calles del centro ×${PEAK_CORE}, resto ×${PEAK_OTHER}`
    : 'Tráfico normal restablecido');
  updateChips();
  recalcIfShown();
}

function simulateAccident() {
  const open = state.edges.filter(e => !e.blocked);
  if (!open.length) { toast('Todas las calles ya están cerradas'); return; }

  // Para que el escenario sea interesante, se prefiere bloquear una calle de la ruta óptima actual
  let candidates = [];
  const adj = buildAdjacency();
  let last;
  for (const ev of dijkstra(adj, state.origin, state.dest)) last = ev;
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
  toast(`💥 Accidente en ${e.name} (${NODES[e.u].code}–${NODES[e.v].code}): vía cerrada`);
  updateChips();
  runInstant(true);
}

function resetCity() {
  cancelStepper();
  state.edges = makeEdges();
  state.peak = false;
  btnPeak.setAttribute('aria-pressed', 'false');
  btnPeak.textContent = '🚦 Hora pico';
  state.vis = null;
  logLines = [];
  updateChips();
  renderAll();
  toast('Ciudad restablecida a sus valores iniciales');
}

function findEdge(a, b) {
  return state.edges.find(e => (e.u === a && e.v === b) || (e.u === b && e.v === a));
}

function updateChips() {
  $('chipPeak').hidden = !state.peak;
  const blocked = state.edges.filter(e => e.blocked).length;
  $('chipBlocked').hidden = blocked === 0;
  $('blockedCount').textContent = blocked;
}

/* ---------------------------------------------------------
   7. DIBUJO EN CANVAS
--------------------------------------------------------- */
let scale = 1, dpr = 1;
const NODE_R = 26;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
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

function draw() {
  const C = {
    bg: cssVar('--map-bg'), grid: cssVar('--map-grid'), edge: cssVar('--edge'),
    text: cssVar('--text'), muted: cssVar('--muted'), surface: cssVar('--surface'),
    node: cssVar('--node'), border: cssVar('--border'), path: cssVar('--path'),
    frontier: cssVar('--frontier'), visited: cssVar('--visited'),
    origin: cssVar('--origin'), dest: cssVar('--dest'),
    danger: cssVar('--danger'), warning: cssVar('--warning'), accent: cssVar('--accent')
  };
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Fondo con cuadrícula tipo plano urbano
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const vis = state.vis;
  const pathEdges = new Set();
  if (vis && vis.path.length > 1) {
    for (let i = 0; i < vis.path.length - 1; i++) {
      const e = findEdge(vis.path[i], vis.path[i + 1]);
      if (e) pathEdges.add(e.id);
    }
  }
  // Aristas del árbol de caminos mínimos (predecesores)
  const treeEdges = new Set();
  if (vis) {
    vis.prev.forEach((p, v) => { if (p !== -1) { const e = findEdge(p, v); if (e) treeEdges.add(e.id); } });
  }

  // ---- Aristas ----
  for (const e of state.edges) {
    const a = NODES[e.u], b = NODES[e.v];
    const onPath = pathEdges.has(e.id);
    const relaxing = vis && vis.relaxEdge === e.id;
    const hover = state.hoverEdge === e.id;

    ctx.save();
    ctx.lineCap = 'round';
    if (e.blocked) {
      ctx.strokeStyle = C.danger; ctx.lineWidth = 5; ctx.setLineDash([12, 10]);
    } else if (onPath) {
      ctx.strokeStyle = C.path; ctx.lineWidth = 11;
      ctx.shadowColor = C.path; ctx.shadowBlur = 14;
    } else if (relaxing) {
      ctx.strokeStyle = vis.improved ? C.visited : C.frontier; ctx.lineWidth = 9;
    } else if (treeEdges.has(e.id)) {
      ctx.strokeStyle = C.visited; ctx.globalAlpha = 0.55; ctx.lineWidth = 7;
    } else {
      ctx.strokeStyle = C.edge; ctx.lineWidth = 6;
    }
    if (hover && !onPath) { ctx.lineWidth += 3; ctx.globalAlpha = 1; }
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();

    // Etiqueta de peso
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const w = weight(e);
    const label = e.blocked ? '✕' : `${w}'`;
    ctx.font = '700 15px Inter, system-ui, sans-serif';
    const tw = Math.max(34, ctx.measureText(label).width + 16);
    const th = 24;
    roundRect(mx - tw / 2, my - th / 2, tw, th, 8);
    ctx.fillStyle = C.surface; ctx.fill();
    ctx.lineWidth = hover ? 2.5 : 1.5;
    const raised = state.peak && !e.blocked && peakFactor(e) > 1;
    ctx.strokeStyle = e.blocked ? C.danger : onPath ? C.path : raised ? C.warning : C.border;
    ctx.stroke();
    ctx.fillStyle = e.blocked ? C.danger : raised ? C.warning : C.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, my + 1);
  }

  // ---- Nodos ----
  for (const n of NODES) {
    const isO = n.id === state.origin, isD = n.id === state.dest;
    let ring = C.border, fill = C.node, ringW = 3;
    if (vis) {
      if (vis.done[n.id]) { fill = C.visited; ring = C.visited; }
      else if (vis.dist[n.id] < Infinity) { fill = C.frontier; ring = C.frontier; }
    }
    if (vis && vis.path.includes(n.id)) ring = C.path;
    if (isO) { ring = C.origin; ringW = 5; }
    if (isD) { ring = C.dest; ringW = 5; }

    // Halo del nodo actual
    if (vis && vis.current === n.id) {
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 12, 0, Math.PI * 2);
      ctx.fillStyle = C.accent; ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
    }
    if (vis && vis.updated === n.id) {
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 8, 0, Math.PI * 2);
      ctx.strokeStyle = C.visited; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    if (fill !== C.node) { ctx.globalAlpha = 0.9; }
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = state.hoverNode === n.id ? ringW + 2 : ringW;
    ctx.strokeStyle = ring; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '22px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(n.icon, n.x, n.y + 1);

    // Código de zona
    ctx.beginPath(); ctx.arc(n.x + NODE_R * 0.78, n.y - NODE_R * 0.78, 11, 0, Math.PI * 2);
    ctx.fillStyle = isO ? C.origin : isD ? C.dest : C.text; ctx.fill();
    ctx.fillStyle = C.bg; ctx.font = '800 12px Inter, sans-serif';
    ctx.fillText(n.code, n.x + NODE_R * 0.78, n.y - NODE_R * 0.78 + 1);

    // Nombre
    const below = n.y < H - 70;
    const ly = below ? n.y + NODE_R + 18 : n.y - NODE_R - 30;
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(n.name, n.x, ly);

    // Distancia provisional/definitiva
    if (vis && vis.dist[n.id] < Infinity) {
      const txt = `d = ${vis.dist[n.id]}`;
      ctx.font = '700 12px "JetBrains Mono", monospace';
      const tw = ctx.measureText(txt).width + 12;
      roundRect(n.x - tw / 2, ly + 10, tw, 19, 6);
      ctx.fillStyle = vis.done[n.id] ? C.visited : C.frontier; ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.fillText(txt, n.x, ly + 20);
    }
  }

  // Indicador de hora pico
  if (state.peak) {
    ctx.font = '700 14px Inter, sans-serif';
    const t = '🚦 HORA PICO ACTIVA';
    const tw = ctx.measureText(t).width + 24;
    roundRect(W - tw - 14, H - 40, tw, 28, 8);
    ctx.fillStyle = C.warning; ctx.fill();
    ctx.fillStyle = '#1a1200'; ctx.textAlign = 'center';
    ctx.fillText(t, W - tw / 2 - 14, H - 25);
  }
}

/* ---------------------------------------------------------
   8. PANELES DE RESULTADOS
--------------------------------------------------------- */
function renderAll() {
  draw();
  renderRoute();
  renderVisited();
  renderTable();
  renderLog();
}

function renderRoute() {
  const vis = state.vis;
  routeMeta.innerHTML = '';
  if (!vis) {
    routeText.className = 'route-text muted';
    routeText.textContent = 'Pulsa «Ejecutar» o «Paso a paso» para calcular la ruta.';
    return;
  }
  if (vis.type === 'found') {
    const p = vis.path;
    routeText.className = 'route-text';
    routeText.innerHTML = p.map(i => `<span class="hop">${NODES[i].icon} ${NODES[i].name}</span>`)
      .join('<span class="arrow">→</span>');
    const streets = [];
    for (let i = 0; i < p.length - 1; i++) streets.push(findEdge(p[i], p[i + 1]).name);
    const streetsTxt = document.createElement('p');
    streetsTxt.className = 'muted small';
    streetsTxt.style.margin = '10px 0 0';
    streetsTxt.textContent = 'Por: ' + streets.join(' → ');
    routeText.appendChild(streetsTxt);
    routeMeta.innerHTML = metaBox(vis.dist[state.dest] + ' min', 'Tiempo total')
      + metaBox(p.length - 1, 'Calles recorridas')
      + metaBox(vis.order.length, 'Nodos visitados')
      + metaBox(vis.stats && vis.stats.ms != null ? vis.stats.ms.toFixed(2) + ' ms' : (vis.stats ? vis.stats.steps + ' pasos' : '—'),
        vis.stats && vis.stats.ms != null ? 'Tiempo de cómputo' : 'Pasos ejecutados');
  } else if (vis.type === 'unreachable') {
    routeText.className = 'route-text error';
    routeText.textContent = `⛔ No existe ninguna ruta entre ${NODES[state.origin].name} y ${NODES[state.dest].name} con las calles abiertas. Reabre alguna calle o restablece la ciudad.`;
    routeMeta.innerHTML = metaBox(vis.order.length, 'Nodos visitados') + metaBox('∞', 'Tiempo total');
  } else {
    routeText.className = 'route-text muted';
    routeText.textContent = `Calculando… paso ${vis.stats ? vis.stats.steps : ''}. Usa «Siguiente» para avanzar.`;
    routeMeta.innerHTML = metaBox(vis.order.length, 'Nodos fijados')
      + metaBox(vis.queue.length, 'En la cola');
  }
}
const metaBox = (v, l) => `<div class="meta-box"><b>${v}</b><span>${l}</span></div>`;

function renderVisited() {
  const vis = state.vis;
  if (!vis) {
    visitedList.innerHTML = '<span class="muted">—</span>';
    queueList.innerHTML = '<span class="muted">—</span>';
    return;
  }
  visitedList.innerHTML = vis.order.length
    ? vis.order.map((i, k) => `<span class="tag">${k + 1}. ${NODES[i].code} ${NODES[i].name}</span>`).join('')
    : '<span class="muted">Ninguno todavía</span>';
  queueList.innerHTML = vis.queue.length
    ? vis.queue.map(([d, v]) => `<span class="tag q ${vis.done[v] ? 'stale' : ''}" title="${vis.done[v] ? 'Entrada obsoleta (ya visitado)' : ''}">(${NODES[v].code}, ${d})</span>`).join('')
    : '<span class="muted">Vacía</span>';
}

function renderTable() {
  const vis = state.vis;
  const onPath = new Set(vis ? vis.path : []);
  distBody.innerHTML = NODES.map(n => {
    const d = vis ? vis.dist[n.id] : Infinity;
    const p = vis ? vis.prev[n.id] : -1;
    let badge = '<span class="badge none">Sin explorar</span>';
    if (vis && vis.done[n.id]) badge = '<span class="badge final">Definitiva</span>';
    else if (vis && d < Infinity) badge = '<span class="badge tent">Tentativa</span>';
    const cls = [onPath.has(n.id) ? 'on-path' : '', vis && vis.updated === n.id ? 'updated' : ''].join(' ');
    const role = n.id === state.origin ? ' <small class="muted">(origen)</small>' : n.id === state.dest ? ' <small class="muted">(destino)</small>' : '';
    return `<tr class="${cls}">
      <td><span class="zone-dot">${n.code}</span>${n.name}${role}</td>
      <td class="num">${d === Infinity ? '∞' : d}</td>
      <td>${p === -1 ? '—' : NODES[p].code + ' · ' + NODES[p].name}</td>
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

/* ---------------------------------------------------------
   9. INTERACCIÓN CON EL MAPA
--------------------------------------------------------- */
function toLogical(evt) {
  const r = canvas.getBoundingClientRect();
  return { x: (evt.clientX - r.left) / scale, y: (evt.clientY - r.top) / scale };
}
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function hitNode(p) {
  for (const n of NODES) if (Math.hypot(p.x - n.x, p.y - n.y) <= NODE_R + 4) return n.id;
  return -1;
}
function hitEdge(p) {
  let best = -1, bestD = 14;
  for (const e of state.edges) {
    const d = distToSegment(p, NODES[e.u], NODES[e.v]);
    if (d < bestD) { bestD = d; best = e.id; }
  }
  return best;
}

canvas.addEventListener('mousemove', (evt) => {
  const p = toLogical(evt);
  const n = hitNode(p);
  const e = n === -1 ? hitEdge(p) : -1;
  if (n !== state.hoverNode || e !== state.hoverEdge) {
    state.hoverNode = n; state.hoverEdge = e;
    canvas.style.cursor = (n !== -1 || e !== -1) ? 'pointer' : 'default';
    canvas.title = e !== -1
      ? `${state.edges[e].name}: ${state.edges[e].blocked ? 'cerrada' : weight(state.edges[e]) + ' min'} (clic para editar)`
      : n !== -1 ? `${NODES[n].name} (clic: origen · Mayús+clic: destino)` : '';
    draw();
  }
});
canvas.addEventListener('mouseleave', () => {
  state.hoverNode = -1; state.hoverEdge = -1; draw();
});
canvas.addEventListener('click', (evt) => {
  const p = toLogical(evt);
  const n = hitNode(p);
  if (n !== -1) {
    if (evt.shiftKey) setDest(n); else setOrigin(n);
    return;
  }
  const e = hitEdge(p);
  if (e !== -1) openEdgeDialog(e);
});

function setOrigin(n) {
  if (n === state.dest) { state.dest = state.origin; destSel.value = state.dest; }
  state.origin = n; originSel.value = n;
  toast(`Origen: ${NODES[n].name}`);
  onSelectionChange();
}
function setDest(n) {
  if (n === state.origin) { state.origin = state.dest; originSel.value = state.origin; }
  state.dest = n; destSel.value = n;
  toast(`Destino: ${NODES[n].name}`);
  onSelectionChange();
}
function onSelectionChange() {
  cancelStepper();
  if (state.vis) runInstant(true);
  else { validSelection(); renderAll(); }
}

/* ---- Diálogo de edición de calle ---- */
function openEdgeDialog(id) {
  const e = state.edges[id];
  state.editing = id;
  $('edgeDialogTitle').textContent = e.name;
  $('edgeDialogSub').textContent = `${nodeLabel(e.u)}  ↔  ${nodeLabel(e.v)}`;
  $('edgeMinutes').value = e.base;
  $('edgeBlocked').checked = e.blocked;
  updatePeakNote();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  $('edgeMinutes').focus();
  $('edgeMinutes').select();
}
function updatePeakNote() {
  const e = state.edges[state.editing];
  const v = Math.max(1, +$('edgeMinutes').value || 1);
  $('edgePeakNote').textContent = state.peak
    ? `Con la hora pico activa se aplica ×${peakFactor(e)} → ${Math.round(v * peakFactor(e))} min efectivos.`
    : '';
}
$('edgeMinutes').addEventListener('input', updatePeakNote);
function closeDialog() {
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  state.editing = -1;
}
$('edgeCancel').addEventListener('click', closeDialog);
$('edgeForm').addEventListener('submit', (evt) => {
  evt.preventDefault();
  const e = state.edges[state.editing];
  if (!e) return closeDialog();
  const v = Math.round(+$('edgeMinutes').value);
  if (!Number.isFinite(v) || v < 1 || v > 99) {
    toast('Introduce un valor entre 1 y 99 minutos');
    return;
  }
  const wasBlocked = e.blocked;
  e.base = v;
  e.blocked = $('edgeBlocked').checked;
  closeDialog();
  updateChips();
  toast(e.blocked ? `${e.name} cerrada` : wasBlocked ? `${e.name} reabierta (${weight(e)} min)` : `${e.name}: ${weight(e)} min`);
  cancelStepper();
  recalcIfShown();
});

/* ---------------------------------------------------------
   10. CONTROLES Y ARRANQUE
--------------------------------------------------------- */
function fillSelects() {
  const opts = NODES.map(n => `<option value="${n.id}">${n.icon} ${n.code} · ${n.name}</option>`).join('');
  originSel.innerHTML = opts; destSel.innerHTML = opts;
  originSel.value = state.origin; destSel.value = state.dest;
}
originSel.addEventListener('change', () => { state.origin = +originSel.value; onSelectionChange(); });
destSel.addEventListener('change', () => { state.dest = +destSel.value; onSelectionChange(); });
btnPeak.addEventListener('click', togglePeak);
btnAccident.addEventListener('click', simulateAccident);
btnReset.addEventListener('click', resetCity);
btnRun.addEventListener('click', () => runInstant(false));
btnStepStart.addEventListener('click', startStepper);
btnStep.addEventListener('click', () => { stopTimer(); nextStep(); });
btnPlay.addEventListener('click', togglePlay);
btnFinish.addEventListener('click', finishStepper);
speedRange.addEventListener('input', () => {
  if (state.timer) { stopTimer(); togglePlay(); }
});

/* ---- Toast ---- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- Tema claro / oscuro ---- */
function currentTheme() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr) return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
$('themeToggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('tema', next); } catch (e) { /* almacenamiento no disponible */ }
  draw();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

/* ---- Menú móvil y enlace activo ---- */
const navLinks = $('navLinks');
const menuBtn = $('menuToggle');
menuBtn.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  navLinks.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
}));
const sections = document.querySelectorAll('main section[id]');
const linkFor = (id) => navLinks.querySelector(`a[href="#${id}"]`);
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        navLinks.querySelectorAll('a').forEach(a => a.classList.remove('active'));
        const l = linkFor(en.target.id); if (l) l.classList.add('active');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));
}

/* ---- Inicio ---- */
fillSelects();
updateChips();
window.addEventListener('resize', resizeCanvas);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
resizeCanvas();
renderAll();

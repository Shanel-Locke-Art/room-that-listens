/* ==========================================================
   A SMALL LOOP LEAKS - sketch.js (CLEAN REWRITE)

   This rewrite removes duplicate function declarations and fixes:
   - act variable declared once
   - focus view zoom applies to the inspected sprite
   - mouseWheel zoom works reliably in focus mode
   - hiddenAction + getHiddenFocusCard signatures match
   - setup() initialization only runs once
   - chunky pixel-art sprites with light animation (procedural)

   Folder structure (do not rename):
   /index.html
   /style.css
   /sketch.js
   /lib/p5.min.js
   /lib/p5.sound.min.js
   /shaders/passthrough.vert
   /shaders/mandelbrot.frag
   /shaders/filter.frag
========================================================== */

/* =========================
   CONFIG: paths
========================= */
const PATHS = {
  shaders: {
    vert: "shaders/passthrough.vert",
    mandel: "shaders/mandelbrot.frag",
    filter: "shaders/filter.frag"
  }
};

/* =========================
   CANVAS + SCALING
========================= */
const BASE_W = 960;
const BASE_H = 540;
let CW = BASE_W, CH = BASE_H, S = 1;
let cnv;
let frameRO = null; // ResizeObserver for #game-frame

/* =========================
   DOM UI
========================= */
let promptEl = null;
let poemEl = null;

/* =========================
   WORLD / CAMERA / PLAYER
========================= */
let world = { w: 2800, h: 1900, pad: 180 };
let camera = { x: 0, y: 0 };
let player = { x: 0, y: 0, r: 10, speed: 2.6, vx: 0, vy: 0, speed01: 0, energy: 0 };

let INTERACT_RADIUS = 86;
let REVEAL_RADIUS_MULT = 2.8;
let EXTRA_HIDDEN = 10;

/* =========================
   STATIONS (objects)
========================= */
const CORE_IDS = ["lamp", "mirror", "desk", "door"];
const SIG_TYPES = ["KEY","EYE","KNOT","SPARK","WAVE","MASK"];
let stations = [];

/* =========================
   MODES
========================= */
let mode = "world";        // world | focus
let paused = false;
let showFinalModal = false;

let focusId = null;
let focusImg = null;
let focusZoom = 1.35;
let focusZoomTarget = 1.35;

/* =========================
   ACTS
========================= */
let act = 1;                // 1 = The Room, 2 = The Machine Notices You
let actBannerFrames = 0;    // overlay countdown frames

// Act 2 objective tracking
let act2SigCollected = 0;
let act2Calibrated = false;
let act2Seq = []; // last few core interactions (excluding door)

/* =========================
   SIGNAL + DOOR GUIDANCE
========================= */
let signal = 0;
let pulse = { active: false, r: 0, speed: 18, hit: false };
let doorTrail = { t: 0, maxT: 260 };

/* =========================
   SHADERS / BUFFERS
========================= */
let fractalLayer = null;     // WEBGL
let filteredLayer = null;    // WEBGL
let imageLayer = null;       // 2D base for filter

let mandelShader = null;
let filterShader = null;

// Shader sources
let _vertSrcLines, _mandelFragLines, _filterFragLines;

/* =========================
   FRACTAL STATE
========================= */
let runSeed = 0;

let fractal = {
  baseCenter: { x: -0.6, y: 0.0 },
  baseZoom: 2.2,
  baseWarp: 0.35,
  iters: 240,

  center: { x: -0.6, y: 0.0 },
  zoom: 2.2,
  warp: 0.35
};

let fractAnim = {
  zoomPulse: 0.18,
  driftAmp: 0.12,
  driftSpeed: 0.14,
  warpPulse: 0.18,
  growAmount: 0.92,
  paletteSpeed: 0.06
};

/* =========================
   POETRY
========================= */
let history = [];
let usedLines = new Set();

const LINES = {
  lamp: [
    "Light arrives like a soft decision.",
    "A filament remembers being fire.",
    "Brightness behaves like a careful assistant."
  ],
  mirror: [
    "Reflection is a rumor you cannot stop hearing.",
    "Glass makes honesty feel optional.",
    "A second self nods, late and familiar."
  ],
  desk: [
    "Dust lifts like a thought you almost kept.",
    "The desk holds the weight of almosts.",
    "Wood grain keeps your pressure like a memory."
  ],
  hidden: [
    "A private vocabulary opens like a drawer that was never locked.",
    "The machine offers a word it was hiding.",
    "You proved you can notice. It stops pretending it is alone."
  ],
  door: [
    "The door waits. It prefers you arrive with a little story first.",
    "A threshold pretends to be a wall.",
    "The hinge holds its breath."
  ]
};

const CONNECTORS = [
  "Meanwhile, the pattern keeps listening.",
  "Because you touched it, it becomes truer.",
  "The room rearranges itself in the background.",
  "You blink and the meaning moves."
];

const GLITCH_LINES = [
  "The fractal swells like a screensaver from another century.",
  "A neon bruise spreads across the edges.",
  "The image blooms outward, trying to escape the frame."
];

const ENDING_LINES = [
  "You leave with a light that learns your pace.",
  "Your name follows, slightly rearranged.",
  "Dust settles behind you like soft applause.",
  "The room keeps computing you back."
];

const SIGNAL_LINES = [
  "A withheld word clicks into place.",
  "The room learns a synonym for your silence.",
  "A secret token appears between breaths.",
  "The machine stops pretending it forgot you.",
  "A stray adjective escapes containment.",
  "The loop leaks a brighter verb.",
  "A hidden grammar unfolds, careful and cold.",
  "The computer admits it has been remixing you too."
];

const MUTATION_LINES = [
  "Your last touch changes what the next line can be.",
  "Order is a lever. You pulled it without noticing.",
  "The poem rearranges itself around your footsteps.",
  "Choice becomes syntax. Syntax becomes meaning."
];

/* =========================
   TYPEWRITER UI
========================= */
let poemQueue = [];
let typingLine = "";
let typingIndex = 0;
let isTyping = false;
let heldLine = "";

let cursorOn = true;
let cursorTimer = 0;

const TYPE_DELAY_MS = 120;
const TYPE_TICK_EVERY = 4;
const CURSOR_BLINK_FRAMES = 26;
let lastTypeTime = 0;

/* =========================
   FINAL POEM
========================= */
let finalPoemText = "";

/* =========================
   HIDDEN FOCUS CACHE
========================= */
let hiddenFocusCache = new Map();

/* =========================
   TTS
========================= */
const ttsEnabled = ("speechSynthesis" in window);
let speaking = false;

/* =========================
   AUDIO (p5.sound)
========================= */
let audioArmed = false;

let blipOsc = null;
let windNoise = null;
let lp = null;
let envBlip = null;
let envNoise = null;

// procedural music
let musicOn = true;
let music = {
  bpmBase: 72,
  bpm: 72,
  stepMs: 120,
  lastStepAt: 0,
  step: 0,
  speedSmoothed: 0,

  lead: null,
  bass: null,
  hat: null,

  filter: null,
  reverb: null,
  delay: null
};

let lastNearId = null;

/* =========================
   SPRITES (procedural)
========================= */
let itemSpriteCache = new Map(); // base sprites only, not animated frames

/* ==========================================================
   PRELOAD
========================================================== */
function preload() {
  _vertSrcLines = loadStrings("./" + PATHS.shaders.vert);
  _mandelFragLines = loadStrings("./" + PATHS.shaders.mandel);
  _filterFragLines = loadStrings("./" + PATHS.shaders.filter);
}

/* ==========================================================
   SETUP
========================================================== */
function setup() {
  promptEl = document.getElementById("prompt");
  poemEl = document.getElementById("poem");

  computeCanvasSize();

  cnv = createCanvas(CW, CH);
  const frame = document.getElementById("game-frame");
  if (frame) cnv.parent(frame);

  // Keep p5 canvas sized to the actual #game-frame box (CSS/grid changes do not always trigger windowResized)
  if (frame && "ResizeObserver" in window) {
    frameRO = new ResizeObserver(() => {
      computeCanvasSize();
      resizeCanvas(CW, CH);
      createBuffersAndShaders();
    });
    frameRO.observe(frame);
  }

  window.addEventListener("resize", windowResized);

  pixelDensity(window.devicePixelRatio || 1);
  noSmooth();

  // Make canvas focusable
  cnv.elt.setAttribute("tabindex", "0");
  cnv.elt.style.outline = "none";
  cnv.elt.focus();

  // ESC closes modal even if focus shifts
  window.addEventListener("keydown", (e) => {
    if (showFinalModal && e.key === "Escape") {
      e.preventDefault();
      closeFinalModal();
    }
  });

  createBuffersAndShaders();

  runSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  resetRun();
}

function windowResized() {
  const frame = document.getElementById("game-frame");
  const rect = frame.getBoundingClientRect();

  const size = Math.min(rect.width, rect.height);

  resizeCanvas(size, size);
}

/* ==========================================================
   CANVAS SIZE
========================================================== */
function computeCanvasSize() {
  const frame = document.getElementById("game-frame");

  // fallback
  let w = Math.max(320, window.innerWidth - 40);
  let h = Math.max(240, window.innerHeight - 220);

  if (frame) {
    const rect = frame.getBoundingClientRect();
    const cs = getComputedStyle(frame);

    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop)  || 0) + (parseFloat(cs.paddingBottom) || 0);

    const fw = Math.max(320, Math.floor(rect.width  - padX));
    const fh = Math.max(240, Math.floor(rect.height - padY));

    const side = Math.floor(Math.min(fw, fh)); // force square canvas to fit
    w = side;
    h = side;
  }

  CW = w;
  CH = h;
}

/* ==========================================================
   BUFFERS + SHADERS
========================================================== */
function createBuffersAndShaders() {
  fractalLayer = createGraphics(CW, CH, WEBGL);
  filteredLayer = createGraphics(CW, CH, WEBGL);

  fractalLayer.noStroke();
  filteredLayer.noStroke();
  fractalLayer.noSmooth();
  filteredLayer.noSmooth();

  imageLayer = createGraphics(CW, CH);
  imageLayer.pixelDensity(1);
  imageLayer.noSmooth();

  const vertSrc = Array.isArray(_vertSrcLines) ? _vertSrcLines.join("\n") : "";
  const mandelFrag = Array.isArray(_mandelFragLines) ? _mandelFragLines.join("\n") : "";
  const filterFrag = Array.isArray(_filterFragLines) ? _filterFragLines.join("\n") : "";

  mandelShader = null;
  filterShader = null;

  if (vertSrc && mandelFrag && fractalLayer && typeof fractalLayer.createShader === "function") {
    mandelShader = fractalLayer.createShader(vertSrc, mandelFrag);
  }

  if (vertSrc && filterFrag && filteredLayer && typeof filteredLayer.createShader === "function") {
    filterShader = filteredLayer.createShader(vertSrc, filterFrag);
  }
}

function nearestStationWorld(preferHidden = false) {
  let best = null;
  let bestD = 1e9;

  for (const s of stations) {
    if (s.hidden && !s.revealed) continue; // unrevealed SIG can't be interacted with
    if (preferHidden && s.kind !== "hidden") continue;

    const d = dist(player.x, player.y, s.x, s.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return { s: best, d: bestD };
}

function pickInteractTarget() {
  // Prefer SIG if one is in range
  const h = nearestStationWorld(true);
  if (h.s && h.d <= INTERACT_RADIUS) return h;

  // Otherwise nearest interactable
  return nearestStationWorld(false);
}

/* ==========================================================
   RESET RUN
========================================================== */
function resetRun() {
  stopTTS();

  paused = false;
  showFinalModal = false;
  finalPoemText = "";

  mode = "world";
  focusId = null;
  focusImg = null;
  focusZoom = 1.35;
  focusZoomTarget = 1.35;

  act = 1;
  actBannerFrames = 0;

  history = [];
  usedLines = new Set();
  resetTypewriterState();

  signal = 0;
  doorTrail.t = 0;
  doorTrail.maxT = 260;

  pulse.active = false;
  pulse.r = 0;
  pulse.hit = false;
  pulse.speed = 18;

  // Randomize world dimensions
  world.w = Math.floor(2400 + random(0, 1400));
  world.h = Math.floor(1700 + random(0, 1000));
  world.pad = Math.floor(170 + random(0, 130));

  // Start player center
  player.x = world.w * 0.5;
  player.y = world.h * 0.5;
  camera.x = player.x;
  camera.y = player.y;

  // Fractal baseline
  fractal.baseCenter.x = -0.6;
  fractal.baseCenter.y = 0.0;
  fractal.baseZoom = 2.2;
  fractal.baseWarp = 0.35;
  fractal.iters = 240;

  fractal.center.x = fractal.baseCenter.x;
  fractal.center.y = fractal.baseCenter.y;
  fractal.zoom = fractal.baseZoom;
  fractal.warp = fractal.baseWarp;

  // Stations
  generateStations();

  // Instructions
  queuePoemLine("A room shimmers in green phosphor.");
  queuePoemLine("You and the machine co-write a poem by moving through it.");
  queuePoemLine("Interact with 2 objects, then the door. The order becomes the poem.");
  queuePoemLine("Hidden SIG nodes are withheld words. Find them to deepen SIGNAL.");
  queuePoemLine("Controls: WASD or arrows move. E interact. Q ping door. ESC close. R restart.");

  if (cnv && cnv.elt) cnv.elt.focus();
}

/* ==========================================================
   MAIN LOOP
========================================================== */
function draw() {
  updateTypewriter();
  rebuildPoemDisplay();

  updatePulse();
  updateProceduralMusic();
  updateFractalAnimation();

  if (actBannerFrames > 0) actBannerFrames--;

  const inWorldPlay = (!showFinalModal && !paused && mode === "world");
  if (inWorldPlay) {
    updateMovement();
    updateFootsteps();
  }

  updateCamera();

  if (mandelShader && fractalLayer) renderFractalLayer();

  if (showFinalModal) drawFinalModal();
  else if (mode === "world") drawWorldMode();
  else drawFocusMode();

  updateUI();
}

/* ==========================================================
   STATION GENERATION
========================================================== */
function generateStations() {
  stations = [];
  const placed = [];

  const minDist = 310 * S;
  const avoidPlayerDist = 460 * S;

  for (const id of CORE_IDS) {
    const pos = pickPositionWithSpacing(minDist, avoidPlayerDist, placed);
    placed.push(pos);

    stations.push({
      kind: "core",
      id,
      label: id.toUpperCase(),
      x: pos.x, y: pos.y,
      hidden: false,
      revealed: true,
      glyphSeed: 0,
      spriteId: id,
      fn: () => coreAction(id)
    });
  }

  const spritePool = ["lamp", "mirror", "desk"];
  for (let i = 0; i < EXTRA_HIDDEN; i++) {
    const pos = pickPositionWithSpacing(minDist * 0.72, avoidPlayerDist * 0.28, placed);
    placed.push(pos);

    const glyphSeed = (runSeed ^ (i * 99991) ^ (pos.x * 13) ^ (pos.y * 7)) >>> 0;
    const spriteId = spritePool[i % spritePool.length];

    const sigType = SIG_TYPES[(glyphSeed ^ (i * 131)) % SIG_TYPES.length];

    stations.push({
      kind: "hidden",
      id: "hidden_" + i,
      label: "SIG",
      x: pos.x, y: pos.y,
      hidden: true,
      revealed: false,
      revealRadius: INTERACT_RADIUS * REVEAL_RADIUS_MULT,
      glyphSeed,
      spriteId,
      sigType,
      fn: () => hiddenAction(glyphSeed, spriteId, sigType)
    });
  }
}

function pickPositionWithSpacing(minDist, avoidPlayerDist, placed) {
  const tries = 260;
  for (let t = 0; t < tries; t++) {
    const x = random(world.pad, world.w - world.pad);
    const y = random(world.pad, world.h - world.pad);

    if (dist(x, y, player.x, player.y) < avoidPlayerDist) continue;

    let ok = true;
    for (const p of placed) {
      if (dist(x, y, p.x, p.y) < minDist) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return { x: random(world.pad, world.w - world.pad), y: random(world.pad, world.h - world.pad) };
}

/* ==========================================================
   MOVEMENT + REVEALS
========================================================== */
function updateMovement() {
  const left = keyIsDown(LEFT_ARROW) || keyIsDown(65);
  const right = keyIsDown(RIGHT_ARROW) || keyIsDown(68);
  const up = keyIsDown(UP_ARROW) || keyIsDown(87);
  const down = keyIsDown(DOWN_ARROW) || keyIsDown(83);

  let vx = (right ? 1 : 0) - (left ? 1 : 0);
  let vy = (down ? 1 : 0) - (up ? 1 : 0);

  const mag = Math.hypot(vx, vy);
  if (mag > 0) {
    vx = (vx / mag) * player.speed;
    vy = (vy / mag) * player.speed;
  } else {
    vx = 0;
    vy = 0;
  }

  // ------------------------------------
  // NEW: store real movement for music
  // ------------------------------------
  player.vx = vx;
  player.vy = vy;

  const speedNow = Math.hypot(vx, vy);
  const speed01 = constrain(speedNow / Math.max(player.speed, 0.0001), 0, 1);

  const d = Math.abs(speed01 - (player.speed01 || 0));
  player.speed01 = speed01;

  // energy spikes on starts/stops/changes
  player.energy = lerp(player.energy || 0, constrain(speed01 * 0.7 + d * 2.2, 0, 1), 0.18);

  player.x += vx;
  player.y += vy;

  player.x = constrain(player.x, player.r, world.w - player.r);
  player.y = constrain(player.y, player.r, world.h - player.r);

  fractal.baseCenter.x += vx * 0.00055 / Math.max(fractal.baseZoom, 0.001);
  fractal.baseCenter.y += vy * 0.00055 / Math.max(fractal.baseZoom, 0.001);

  for (const s of stations) {
    if (!s.hidden || s.revealed) continue;

    if (dist(player.x, player.y, s.x, s.y) <= s.revealRadius) {
      s.revealed = true;
      gainSignal("reveal");
      sfxProximity();
      queuePoemLine(pickUniqueLine(GLITCH_LINES, 0xA11CE));
    }
  }
}

function updateCamera() {
  camera.x = lerp(camera.x, player.x, 0.10);
  camera.y = lerp(camera.y, player.y, 0.10);

  const halfW = CW * 0.5;
  const halfH = CH * 0.5;

  camera.x = constrain(camera.x, halfW, world.w - halfW);
  camera.y = constrain(camera.y, halfH, world.h - halfH);
}

function worldToScreen(wx, wy) {
  return { x: wx - camera.x + CW * 0.5, y: wy - camera.y + CH * 0.5 };
}

function isOnScreen(wx, wy, pad = 120) {
  const s = worldToScreen(wx, wy);
  return s.x >= -pad && s.x <= CW + pad && s.y >= -pad && s.y <= CH + pad;
}

/* ==========================================================
   DRAW: WORLD MODE
========================================================== */
function drawWorldMode() {
  drawCRTBackground();

  if (fractalLayer) {
    if (act === 2) {
      const a = 220 + 20 * sin(frameCount * 0.06);
      tint(180, 255, 255, a);
    } else {
      tint(120, 255, 170, 210);
    }
    image(fractalLayer, 0, 0);
    noTint();
  }

  push();
  translate(CW * 0.5 - camera.x, CH * 0.5 - camera.y);

  drawWorldGrid();
  drawWorldBorder();
  drawStationsWorld();
  drawPlayerWorld();

  pop();

  drawPulseRing();
  drawDoorTrail();
  drawCompassArrow();
  drawSignalMeter();
  drawActBanner();
}

function drawCRTBackground() {
  if (act === 2) background(0, 10, 18);
  else background(0, 18, 0);

  noStroke();
  for (let r = Math.max(CW, CH) * 1.2; r > 0; r -= 34) {
    const a = map(r, 0, Math.max(CW, CH) * 1.2, 26, 0);
    fill(0, 255, 120, a);
    ellipse(CW * 0.5, CH * 0.5, r * 1.25, r);
  }

  fill(0, 0, 0, 70);
  rect(0, 0, CW, CH);

  if (act === 2) {
    noStroke();
    fill(0, 0, 0, 35);
    rect(0, 0, CW, CH);
  }

  for (let y = 0; y < CH; y += 3) {
    stroke(0, 255, 120, (act === 2) ? 18 : 10);
    line(0, y, CW, y);
  }
}

function drawWorldGrid() {
  const step = Math.max(60 * S, 56);
  stroke(0, 255, 120, 22);
  strokeWeight(1);

  for (let x = 0; x <= world.w; x += step) line(x, 0, x, world.h);
  for (let y = 0; y <= world.h; y += step) line(0, y, world.w, y);

  stroke(0, 255, 120, 36);
  for (let x = 0; x <= world.w; x += step * 5) line(x, 0, x, world.h);
  for (let y = 0; y <= world.h; y += step * 5) line(0, y, world.w, y);
}

function drawWorldBorder() {
  noFill();
  stroke(0, 255, 120, 160);
  strokeWeight(Math.max(2.0 * S, 2));
  rect(12 * S, 12 * S, world.w - 24 * S, world.h - 24 * S, 18 * S);
}

function drawStationsWorld() {
  const near = pickInteractTarget();

  for (const s of stations) {
    if (!isOnScreen(s.x, s.y, 260)) continue;

    const dToPlayer = dist(player.x, player.y, s.x, s.y);
    const active = near.s && near.s === s && near.d <= INTERACT_RADIUS;

    if (s.kind === "hidden" && !s.revealed) {
      drawHiddenShimmerField(s, dToPlayer);
      continue;
    }

    if (s.kind === "hidden") {
      drawHiddenGlyph(s, active);
      continue;
    }

    stroke(active ? color(0, 255, 170, 240) : color(0, 255, 120, 140));
    strokeWeight(Math.max(2.0 * S, 2.8));
    fill(active ? color(0, 255, 140, 60) : color(0, 255, 120, 30));

    const plate = 104 * S;
    rect(s.x - plate / 2, s.y - plate / 2, plate, plate, 12 * S);

    const img = getItemSpriteFrame(s.id);

    push();
    imageMode(CENTER);
    noSmooth();

    const p = active ? (1.0 + 0.07 * sin(frameCount * 0.18)) : 1.0;

    if (s.id === "door") image(img, s.x, s.y, 70 * S * p, 112 * S * p);
    else image(img, s.x, s.y, 88 * S * p, 88 * S * p);

    pop();

    noStroke();
    fill(active ? color(0, 255, 170, 255) : color(0, 255, 120, 210));
    textAlign(CENTER, CENTER);
    textSize(14 * S);
    text(s.label, s.x, s.y + 74 * S);
  }
}

function drawPlayerWorld() {
  noStroke();
  fill(180, 255, 210, 245);
  circle(player.x, player.y, player.r * 2);

  stroke(0, 255, 170, 120);
  strokeWeight(6 * S);
  noFill();
  circle(player.x, player.y, player.r * 2 + 14 * S);
}

/* ==========================================================
   HIDDEN VISUALS
========================================================== */
function drawHiddenShimmerField(s, dToPlayer) {
  const t = millis() * 0.002;
  const closeness = 1.0 - constrain(dToPlayer / (s.revealRadius * 1.2), 0, 1);
  const a = 18 + 80 * closeness;

  push();
  translate(s.x, s.y);

  noFill();
  stroke(0, 255, 170, a * 0.55);
  strokeWeight(1.6);

  const wob = 9 * S * sin(t * 2.2 + s.glyphSeed * 0.001);
  circle(0, 0, (34 * S) + wob);

  stroke(0, 255, 120, a * 0.35);
  circle(0, 0, (56 * S) + wob * 0.6);

  noStroke();
  fill(0, 255, 170, a * 0.7);
  for (let i = 0; i < 7; i++) {
    const ang = t * 1.6 + i * (TAU / 7) + (s.glyphSeed % 97) * 0.01;
    const rr = (20 + 16 * sin(t + i)) * S;
    circle(cos(ang) * rr, sin(ang) * rr, 2.4 * S);
  }

  pop();
}

function makeGlyphPoints(seed, count) {
  const rand = mulberry32(seed);
  const pts = [];
  const baseR = 22 * S;

  for (let i = 0; i < count; i++) {
    const ang = (i / count) * TAU + rand() * 0.35;
    const rr = baseR * (0.75 + rand() * 0.75);
    pts.push({ x: cos(ang) * rr, y: sin(ang) * rr });
  }
  return pts;
}

function drawHiddenGlyph(s, active) {
  const t = millis() * 0.002;
  const flicker = 0.85 + 0.15 * sin(t * 6.0 + s.glyphSeed * 0.0009);
  const glowA = (active ? 230 : 180) * flicker;

  push();
  translate(s.x, s.y);

  noFill();
  stroke(0, 255, 170, glowA);
  strokeWeight(active ? 3.2 : 2.4);

  const halo = 78 * S + 10 * S * sin(t * 4.0 + s.glyphSeed * 0.001);
  circle(0, 0, halo);

  stroke(0, 255, 120, glowA * 0.55);
  strokeWeight(1.5);
  circle(0, 0, halo * 0.72);

  const pts = makeGlyphPoints(s.glyphSeed, 8);
  const jitter = (active ? 2.7 : 1.6) * S;
  const phase = t * 3.4;

  noStroke();
  fill(0, 255, 170, 210 * flicker);
  beginShape();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const jx = jitter * sin(phase + i * 1.7);
    const jy = jitter * cos(phase * 0.9 + i * 1.3);
    vertex(p.x + jx, p.y + jy);
  }
  endShape(CLOSE);

  // Distinct SIG type symbol
  stroke(0, 255, 170, 180 * flicker);
  strokeWeight(2.2 * S);
  noFill();

  const w = 26 * S;
  const h = 18 * S;
  const bob = (active ? 2.5 : 1.3) * S * sin(t * 5.0 + s.glyphSeed * 0.002);

  switch (s.sigType || "EYE") {
    case "KEY":
      circle(0, -4 * S + bob, 14 * S);
      line(7 * S, -4 * S + bob, 18 * S, -4 * S + bob);
      line(14 * S, -7 * S + bob, 14 * S, -1 * S + bob);
      break;

    case "EYE":
      beginShape();
      vertex(-w, 0 + bob);
      quadraticVertex(0, -h + bob, w, 0 + bob);
      quadraticVertex(0, h + bob, -w, 0 + bob);
      endShape();
      noStroke();
      fill(0, 255, 170, 180 * flicker);
      circle(0, 0 + bob, 6 * S);
      break;

    case "KNOT":
      stroke(0, 255, 170, 200 * flicker);
      noFill();
      beginShape();
      for (let a = 0; a <= TAU; a += TAU / 24) {
        const r = 14 * S + 3 * S * sin(2 * a);
        vertex(cos(a) * r, sin(a) * (10 * S) + bob);
      }
      endShape();
      break;

    case "SPARK":
      for (let i = 0; i < 8; i++) {
        const ang = i * (TAU / 8);
        const rr = (i % 2 === 0 ? 18 : 10) * S;
        line(0, 0 + bob, cos(ang) * rr, sin(ang) * rr + bob);
      }
      break;

    case "WAVE":
      beginShape();
      for (let x = -20; x <= 20; x += 4) {
        const y = sin((x * 0.18) + t * 3.0) * 6 * S + bob;
        vertex(x * S, y);
      }
      endShape();
      break;

    case "MASK":
      rect(-16 * S, -10 * S + bob, 32 * S, 20 * S, 6 * S);
      line(-6 * S, -2 * S + bob, -2 * S, -2 * S + bob);
      line(2 * S, -2 * S + bob, 6 * S, -2 * S + bob);
      break;
  }

noStroke();
  fill(0, 255, 170, active ? 220 : 170);
  textAlign(CENTER, CENTER);
  textSize(12 * S);
  text("SIG", 0, 60 * S);

  pop();
}

/* ==========================================================
   ACT BANNER
========================================================== */
function drawActBanner() {
  if (actBannerFrames <= 0) return;

  const t = actBannerFrames / 180;
  const alpha = 255 * constrain(t, 0, 1);

  noStroke();
  fill(0, 0, 0, 90);
  rect(0, 0, CW, CH);

  textAlign(CENTER, CENTER);
  fill(0, 255, 170, alpha);
  textSize(42 * S);
  text("ACT 2", CW * 0.5, CH * 0.42);

  fill(0, 255, 170, alpha * 0.75);
  textSize(18 * S);
  text("THE MACHINE NOTICES YOU", CW * 0.5, CH * 0.52);
}

/* ==========================================================
   DOOR PULSE / TRAIL / COMPASS / SIGNAL HUD
========================================================== */
function getDoor() {
  return stations.find(s => s.kind === "core" && s.id === "door");
}

function updatePulse() {
  if (!pulse.active) return;

  pulse.r += pulse.speed;
  const door = getDoor();
  if (!door) { pulse.active = false; return; }

  const maxR = Math.max(world.w, world.h);
  if (pulse.r > maxR) { pulse.active = false; return; }

  const d = dist(player.x, player.y, door.x, door.y);
  if (!pulse.hit && pulse.r >= d) {
    pulse.hit = true;
    doorTrail.t = doorTrail.maxT;
    sfxBlip(820, 0.001, 0.08, 0.38);
    sfxNoise(1200, 0.06, 0.24);
  }
}

function drawPulseRing() {
  if (!pulse.active) return;
  const p = worldToScreen(player.x, player.y);

  noFill();
  stroke(0, 255, 170, 120);
  strokeWeight(2);
  circle(p.x, p.y, pulse.r * 2);

  stroke(0, 255, 120, 60);
  strokeWeight(1);
  circle(p.x, p.y, pulse.r * 2 + 10);
}

function drawDoorTrail() {
  if (doorTrail.t <= 0) return;
  const door = getDoor();
  if (!door) return;

  doorTrail.t -= 1;

  const a = map(doorTrail.t, 0, doorTrail.maxT, 0, 200);
  const p = worldToScreen(player.x, player.y);
  const d = worldToScreen(door.x, door.y);

  stroke(0, 255, 170, a);
  strokeWeight(3);
  line(p.x, p.y, d.x, d.y);

  noFill();
  stroke(0, 255, 170, a);
  strokeWeight(3);
  circle(d.x, d.y, 78 + (signal * 14) + 10 * sin(frameCount * 0.15));
}

function canEnterDoorState() {
  const nonDoorCount = history.filter(h => h !== "door").length;
  return nonDoorCount >= 2;
}

function canFinalizePoem() {
  const hasDoor = history.includes("door");
  const nonDoorCount = history.filter(h => h !== "door").length;
  return hasDoor && nonDoorCount >= 2;
}

function drawCompassArrow() {
  const door = getDoor();
  if (!door) return;

  const eligible = canEnterDoorState() || signal >= 2;
  const target = eligible ? door : nearestNonDoorCore();
  if (!target) return;
  if (isOnScreen(target.x, target.y, 0)) return;

  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const angle = atan2(dy, dx);

  const cx = CW * 0.5;
  const cy = CH * 0.5;

  const edgePad = 22;
  const ex = constrain(cx + cos(angle) * (Math.min(CW, CH) * 0.45), edgePad, CW - edgePad);
  const ey = constrain(cy + sin(angle) * (Math.min(CW, CH) * 0.45), edgePad, CH - edgePad);

  push();
  translate(ex, ey);
  rotate(angle);

  noStroke();
  fill(0, 255, 170, eligible ? 230 : 160);
  triangle(0, 0, -16, -9, -16, 9);

  pop();
}

function nearestNonDoorCore() {
  const list = stations.filter(s => s.kind === "core" && s.id !== "door");
  let best = null, bestD = 1e9;
  for (const s of list) {
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function drawSignalMeter() {
  const w = 160 * S;
  const h = 18 * S;
  const x = 14 * S;
  const y = 14 * S;

  noFill();
  stroke(0, 255, 170, 180);
  strokeWeight(2);
  rect(x, y, w, h);

  noStroke();
  fill(0, 255, 170, 90);
  rect(x, y, (w * signal) / 6, h);

  noStroke();
  fill(0, 255, 170, 220);
  textAlign(LEFT, CENTER);
  textSize(12 * S);
  text("SIGNAL " + signal + "/6", x + 6 * S, y + h * 0.5);
}

function coreAction(id) {
  addInteractionPoetry(id);

  // -------------------------
  // DOOR
  // -------------------------
  if (id === "door") {

    // ACT 1: door transitions to ACT 2
    if (act === 1) {
      if (!canEnterDoorState()) {
        queuePoemLine("The door refuses entry. Bring it more lines first.");
        sfxDenied();
        enterFocus("door");
        return;
      }

      act = 2;

      // reset Act 2 objective tracking
      act2SigCollected = 0;
      act2Calibrated = false;
      act2Seq = [];

      mutateRoom();
      actBannerFrames = 180;
      queuePoemLine("The room shifts. It was listening.");
      sfxDoorRumble();
      return;
    }

    // ACT 2: door requires objective before focus
    if (!canEnterDoorState()) {
      queuePoemLine("The door wants more from you.");
      sfxDenied();
      enterFocus("door");
      return;
    }

    if (!act2Calibrated || act2SigCollected < 2) {
      const needSig = Math.max(0, 2 - act2SigCollected);
      queuePoemLine(
        "The door refuses. Calibrate (Lamp, Mirror, Desk) and harvest " + needSig + " more SIG."
      );
      sfxDenied();
      enterFocus("door");
      return;
    }

    // Objective complete, proceed
    doorTrail.t = Math.max(doorTrail.t, Math.floor(190 + signal * 35));
    sfxDoorRumble();
    enterFocus("door");
    return;
  }

  // -------------------------
  // NON-DOOR OBJECTS
  // -------------------------
  if (id === "lamp") {
    fractal.baseWarp = clamp01(fractal.baseWarp + 0.10);
    fractal.baseZoom = constrain(fractal.baseZoom * 1.10, 0.6, 18.0);
    sfxInteractHigh();
  } else if (id === "mirror") {
    fractal.baseCenter.x += random(-0.08, 0.08) / Math.max(fractal.baseZoom, 0.001);
    fractal.baseCenter.y += random(-0.08, 0.08) / Math.max(fractal.baseZoom, 0.001);
    fractal.baseZoom = constrain(fractal.baseZoom * 1.06, 0.6, 18.0);
    sfxInteractMid();
  } else if (id === "desk") {
    fractal.iters = Math.min(520, fractal.iters + 28);
    fractal.baseZoom = constrain(fractal.baseZoom * 1.06, 0.6, 18.0);
    sfxInteractLow();
  }

  // Act 2 calibration sequence: lamp -> mirror -> desk
  if (act === 2) {
    act2Seq.push(id);
    if (act2Seq.length > 3) act2Seq.shift();

    const seq = act2Seq.join(",");
    if (!act2Calibrated && seq === "lamp,mirror,desk") {
      act2Calibrated = true;
      queuePoemLine("Calibration complete. The room stops resisting your order.");
      sfxBlip(980, 0.001, 0.06, 0.22);
    }
  }

  enterFocus(id);
}


function hiddenAction(glyphSeed, spriteId, sigType) {
  gainSignal("open");
  if (act === 2) act2SigCollected++;

  queuePoemLine(pickUniqueLine(LINES.hidden, 0x1DD33));
  sfxInteractMid();

  focusId = "hidden";
  focusImg = getHiddenFocusCard(glyphSeed, spriteId, sigType);
  mode = "focus";
  focusZoom = 1.35;
  focusZoomTarget = 1.35;
}

function mutateRoom() {
  fractal.baseWarp += 0.2;
  fractal.iters += 60;

  signal = Math.min(signal + 1, 6);

  for (const s of stations) {
    if (s.kind === "core" && s.id !== "door") {
      s.x += random(-120, 120);
      s.y += random(-120, 120);
    }
  }
}

function enterFocus(id) {
  mode = "focus";
  focusId = id;
  focusImg = null;
  focusZoom = 1.35;
  focusZoomTarget = 1.35;
  sfxFocusOpen();
}

function exitFocus() {
  mode = "world";
  focusId = null;
  focusImg = null;
  focusZoom = 1.35;
  focusZoomTarget = 1.35;
  sfxFocusClose();
}

/* ==========================================================
   INPUT
========================================================== */
function keyPressed() {
  armAudioIfNeeded();
  if (cnv && cnv.elt) cnv.elt.focus();

  if (showFinalModal) {
    if (keyCode === 32) {
      if (ttsEnabled) {
        if (speaking) stopTTS();
        else speakText(finalPoemText);
      }
      return false;
    }
    if (keyCode === ESCAPE) { closeFinalModal(); return false; }
    if (key === "r" || key === "R") { restartRun(); return false; }
    return false;
  }

  if (keyCode === ESCAPE) {
    if (mode === "focus") exitFocus();
    else paused = !paused;
    return false;
  }

  if (key === "r" || key === "R") { restartRun(); return false; }

  if (key === "q" || key === "Q") {
    if (mode === "world" && !paused) {
      pulse.active = true;
      pulse.r = 0;
      pulse.hit = false;
      sfxBlip(420, 0.001, 0.06, 0.30);
    }
    return false;
  }

  if (key === "e" || key === "E") {
    if (paused) return false;

    if (mode === "focus") {
      if (focusId === "door" && canFinalizePoem()) {
        finalPoemText = buildFinalPoemText();
        showFinalModal = true;
        paused = true;
        exitFocus();
        return false;
      }
      exitFocus();
      return false;
    }

    const near = pickInteractTarget();
    if (near.s && near.d <= INTERACT_RADIUS) near.s.fn();
    else sfxTap();
    return false;
  }

  return false;
}

function mousePressed() {
  armAudioIfNeeded();
  if (cnv && cnv.elt) cnv.elt.focus();
}

function mouseWheel(event) {
  if (mode !== "focus") return false;

  if (cnv && cnv.elt) cnv.elt.focus();
  if (event && event.preventDefault) event.preventDefault();

  const delta = event.deltaY;
  const step = (Math.abs(delta) > 40) ? 0.12 : 0.06;
  if (delta > 0) focusZoomTarget -= step;
  else focusZoomTarget += step;

  sfxZoomTick(delta > 0);
  return false;
}

function restartRun() {
  runSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  resetRun();
}

function closeFinalModal() {
  stopTTS();
  showFinalModal = false;
  paused = false;
  mode = "world";
  focusId = null;
  focusImg = null;
  focusZoom = 1.35;
  focusZoomTarget = 1.35;
  if (cnv && cnv.elt) cnv.elt.focus();
}

/* ==========================================================
   DRAW: FOCUS MODE
========================================================== */
function drawFocusMode() {
  drawCRTBackground();

  imageLayer.clear();
  imageLayer.background(0, 18, 0);

  // Zoomed inspected sprite, animated
  imageLayer.push();
  imageLayer.imageMode(CENTER);
  imageLayer.noSmooth();
  const test = (focusId === "hidden") ? focusImg : getItemSpriteFrame(focusId || "door");
  const spr = 360 * S * focusZoom;
  imageLayer.image(test, CW * 0.5, CH * 0.5, spr, spr);
  imageLayer.pop();

  if (filteredLayer && filterShader && fractalLayer) {
    filteredLayer.shader(filterShader);

    safeUniform(filterShader, "u_tex0", imageLayer);
    safeUniform(filterShader, "u_tex1", fractalLayer);
    safeUniform(filterShader, "tex0", imageLayer);
    safeUniform(filterShader, "tex1", fractalLayer);

    safeUniform(filterShader, "u_resolution", [CW, CH]);
    safeUniform(filterShader, "u_time", millis() / 1000.0);
    safeUniform(filterShader, "u_amount", 0.78);
    safeUniform(filterShader, "u_fractMix", 0.94);

    filteredLayer.rect(-CW / 2, -CH / 2, CW, CH);

    push();
    resetMatrix();
    imageMode(CORNER);
    image(filteredLayer, 0, 0);
    pop();
  } else {
    push();
    resetMatrix();
    imageMode(CORNER);
    image(imageLayer, 0, 0);
    pop();
  }

  noStroke();
  fill(0, 255, 170, 210);
  textAlign(LEFT, TOP);
  textSize(16 * S);
  text("VIEWING: " + (focusId ? focusId.toUpperCase() : "OBJECT"), 16 * S, 12 * S);

  fill(0, 255, 170, 170);
  textSize(13 * S);
  text("Mouse wheel zoom. E or ESC closes. Q pings door.", 16 * S, 34 * S);

  if (focusId === "door" && canFinalizePoem()) {
    fill(0, 255, 170, 230);
    text("Press E to seal the final poem.", 16 * S, 54 * S);
  }
}

/* ==========================================================
   DRAW: FINAL MODAL
========================================================== */
function drawFinalModal() {
  imageLayer.clear();
  imageLayer.background(0, 18, 0);

  if (filteredLayer && filterShader && fractalLayer) {
    filteredLayer.shader(filterShader);

    safeUniform(filterShader, "u_tex0", imageLayer);
    safeUniform(filterShader, "u_tex1", fractalLayer);
    safeUniform(filterShader, "tex0", imageLayer);
    safeUniform(filterShader, "tex1", fractalLayer);

    safeUniform(filterShader, "u_resolution", [CW, CH]);
    safeUniform(filterShader, "u_time", millis() / 1000.0);
    safeUniform(filterShader, "u_amount", 0.95);
    safeUniform(filterShader, "u_fractMix", 0.98);

    filteredLayer.rect(-CW / 2, -CH / 2, CW, CH);
    image(filteredLayer, 0, 0);
  } else {
    image(imageLayer, 0, 0);
  }

  noStroke();
  fill(0, 0, 0, 160);
  rect(0, 0, CW, CH);

  const panelW = Math.min(CW * 0.84, 940 * S);
  const panelH = Math.min(CH * 0.82, 660 * S);
  const px = (CW - panelW) * 0.5;
  const py = (CH - panelH) * 0.5;

  fill(0, 28, 0, 240);
  stroke(0, 255, 170, 150);
  strokeWeight(Math.max(2.0 * S, 2));
  rect(px, py, panelW, panelH, 10 * S);

  const pad = 18 * S;
  const tx = px + pad;
  const ty = py + pad;

  noStroke();
  fill(0, 255, 170, 240);
  textAlign(LEFT, TOP);
  textSize(18 * S);
  text("FINAL POEM", tx, ty);

  textSize(12 * S);
  fill(0, 255, 170, 170);
  const hint = ttsEnabled
    ? "SPACE: SPEAK OR STOP   ESC: CLOSE   R: RESTART"
    : "ESC: CLOSE   R: RESTART";
  text(hint, tx, ty + 26 * S);

  fill(0, 255, 170, 235);
  textSize(14 * S);
  const bodyY = ty + 54 * S;
  text(finalPoemText, tx, bodyY, panelW - pad * 2, panelH - (bodyY - py) - pad);
}

/* ==========================================================
   SIGNAL GAIN
========================================================== */
function gainSignal(reason = "sig") {
  const before = signal;
  signal = Math.min(6, signal + 1);
  if (signal === before) return;

  doorTrail.maxT = 260 + signal * 50;
  pulse.speed = 18 + signal * 2;

  queuePoemLine(pickUniqueLine(SIGNAL_LINES, 0x51A1A1));
  if (random() < 0.45) queuePoemLine(pickUniqueLine(MUTATION_LINES, 0xA73A73));
  if (random() < 0.22) queuePoemLine(pickUniqueLine(MUTATION_LINES, 0xA73A73));

  fractal.baseWarp = clamp01(fractal.baseWarp + 0.05);
  fractal.iters = Math.min(520, fractal.iters + 12);

  musicAccent();
}

/* ==========================================================
   POETRY ENGINE
========================================================== */
function addInteractionPoetry(id) {
  history.push(id);

  if (history.length >= 2 && random() < 0.45) {
    queuePoemLine(pickUniqueLine(CONNECTORS, 0xC0FFEE));
  }

  const bucket = LINES[id] || ["Something responds, quietly."];
  queuePoemLine(pickUniqueLine(bucket, idHash(id)));

  if (random() < 0.25) queuePoemLine(pickUniqueLine(GLITCH_LINES, 0xA117C));
}

function buildFinalPoemText() {
  const rand = mulberry32((runSeed ^ 0xABCDEF) >>> 0);

  const stanza = [
    pickFrom(ENDING_LINES, rand),
    pickFrom(ENDING_LINES, rand),
    pickFrom(ENDING_LINES, rand)
  ];

  const nonDoorCount = history.filter(h => h !== "door").length;

  const header = [
    "A SMALL LOOP LEAKS",
    "Act: " + act + "   Signal: " + signal + "/6",
    "Objects: " + nonDoorCount + " plus door",
    ""
  ].join("\n");

  const machineBonus = [];
  if (signal >= 1) machineBonus.push("A withheld word clicks into place.");
  if (signal >= 3) machineBonus.push("The room admits it has been editing you too.");
  if (signal >= 5) machineBonus.push("A private vocabulary opens, and it does not close politely.");

  return [
    header,
    stanza.join("\n"),
    "",
    ...(machineBonus.length ? ["SIGNAL:", ...machineBonus, ""] : []),
    "Press ESC to return."
  ].join("\n");
}

function pickUniqueLine(bucket, salt) {
  const saltN = (typeof salt === "string") ? idHash(salt) : salt;
  const rand = mulberry32((runSeed ^ (history.length * 1337) ^ saltN) >>> 0);

  for (let k = 0; k < 10; k++) {
    const candidate = pickFrom(bucket, rand);
    if (!usedLines.has(candidate)) {
      usedLines.add(candidate);
      return candidate;
    }
  }
  const fallback = pickFrom(bucket, rand);
  usedLines.add(fallback);
  return fallback;
}

/* ==========================================================
   TYPEWRITER
========================================================== */
function resetTypewriterState() {
  poemQueue = [];
  typingLine = "";
  typingIndex = 0;
  isTyping = false;
  heldLine = "";
  cursorOn = true;
  cursorTimer = 0;
  lastTypeTime = 0;
}

function queuePoemLine(line) {
  if (line == null) return;
  const s = String(line);
  if (!s.length) return;
  poemQueue.push(s);
}

function updateTypewriter() {
  const now = millis();

  cursorTimer++;
  if (cursorTimer >= CURSOR_BLINK_FRAMES) {
    cursorTimer = 0;
    cursorOn = !cursorOn;
  }

  if (!isTyping && poemQueue.length > 0) {
    typingLine = poemQueue.shift();
    typingIndex = 0;
    isTyping = true;
    lastTypeTime = now;
  }

  if (!isTyping) return;

  if ((now - lastTypeTime) < TYPE_DELAY_MS) return;
  lastTypeTime = now;

  if (typingIndex < typingLine.length) {
    typingIndex++;
    heldLine = typingLine.slice(0, typingIndex);

    if (audioArmed && !showFinalModal && (typingIndex % TYPE_TICK_EVERY === 0)) {
      const f = 420 + (typingIndex % 9) * 12;
      sfxBlip(f, 0.001, 0.02, 0.10);
    }
  } else {
    isTyping = false;
  }
}

function rebuildPoemDisplay() {
  if (!poemEl) return;

  const rand = mulberry32(runSeed);
  const titleA = pickFrom(["A ROOM", "A PATTERN", "A SMALL LOOP", "A SOFT MACHINE"], rand);
  const titleB = pickFrom(["LISTENS", "SHIMMERS", "REPEATS", "FORGETS", "LEAKS"], rand);

  const nonDoorCount = history.filter(h => h !== "door").length;
  const hasDoor = history.includes("door");
  const need = Math.max(0, 2 - nonDoorCount);

  let subtitle = "";
  if (need > 0) subtitle = "Interact with " + need + " more object(s), then find the door.";
  else if (!hasDoor) subtitle = "You have enough lines. Find the door to seal the poem.";
  else subtitle = "Door visited. View it and press E to seal the final poem.";

  const signalLine = (signal > 0)
    ? ("SIGNAL " + signal + "/6: withheld words unlocked.")
    : "No SIGNAL yet: SIG nodes are withheld words.";

  const cursor = cursorOn ? "█" : " ";
  const focused = (heldLine || "") + cursor;

  poemEl.textContent = [
    titleA + " " + titleB + ".",
    subtitle,
    signalLine,
    "",
    focused
  ].join("\n");
}

/* ==========================================================
   UI PROMPT
========================================================== */
function updateUI() {
  if (!promptEl) return;

  promptEl.classList.remove("urgent");
  const actTag = (act === 2) ? "[ACT 2] " : "[ACT 1] ";

  if (showFinalModal) {
    promptEl.textContent = actTag + "Final poem. ESC closes. R restarts. Space speaks.";
    return;
  }

  if (mode === "focus") {
    if (focusId === "door" && canFinalizePoem()) {
      promptEl.textContent = actTag + "Door ready. Press E to seal. Mouse wheel zoom.";
    } else {
      promptEl.textContent = actTag + "Focus view. Mouse wheel zoom. E or ESC closes. Q pings door.";
    }
    return;
  }

  if (paused) {
    promptEl.textContent = actTag + "Paused. ESC returns. R restarts.";
    return;
  }

  const nonDoorCount = history.filter(h => h !== "door").length;
  const need = Math.max(0, 2 - nonDoorCount);

  // UI only: determine if something is in range (do NOT call near.s.fn here)
  const near = pickInteractTarget();
  const inRange = near.s && near.d <= INTERACT_RADIUS;

  // Act 2 task prompt has priority in world mode
  if (act === 2 && !history.includes("door")) {
    const needSig = Math.max(0, 2 - act2SigCollected);
    const cal = act2Calibrated ? "DONE" : "Lamp, Mirror, Desk";
    promptEl.textContent = actTag + "ACT 2 TASKS: SIG +" + needSig + " and CALIBRATE: " + cal + ".";
    if (!act2Calibrated || needSig > 0) promptEl.classList.add("urgent");
    return;
  }

  if (inRange) {
    if (act === 1 && need > 0 && near.s && near.s.id === "door") {
      promptEl.textContent = actTag + "The door wants more. Find " + need + " more object(s).";
      promptEl.classList.add("urgent");
    } else {
      promptEl.textContent = actTag + "Press E to interact. Q pings the door.";
    }
    return;
  }

  if (act === 1 && need > 0) {
    promptEl.textContent =
      actTag + "EXPLORE. FIND " + need + " MORE OBJECT" + (need > 1 ? "S." : ".") + " Hidden SIG nodes deepen SIGNAL.";
    promptEl.classList.add("urgent");
  } else if (!history.includes("door")) {
    promptEl.textContent = actTag + "You have enough lines. Find the door. Press Q to ping it.";
  } else {
    promptEl.textContent = actTag + "Return to the door. View it and press E to seal.";
  }
}

/* ==========================================================
   FRACTAL ANIMATION + RENDER
========================================================== */
function updateFractalAnimation() {
  const t = millis() / 1000;

  const growBoost = 0.045 * signal;
  fractAnim.growAmount = constrain(0.92 + growBoost, 0.92, 1.20);

  const pulseZ = 1.0 + fractAnim.zoomPulse * sin(t * 0.85) * (0.65 + 0.35 * sin(t * 0.33));
  const driftScale = fractAnim.driftAmp / Math.max(fractal.baseZoom, 0.001);

  const dx = driftScale * cos(t * fractAnim.driftSpeed);
  const dy = driftScale * sin(t * fractAnim.driftSpeed * 1.17);
  const wp = fractAnim.warpPulse * sin(t * 0.72);

  fractal.zoom = lerp(fractal.zoom, fractal.baseZoom * pulseZ, 0.06);
  fractal.center.x = lerp(fractal.center.x, fractal.baseCenter.x + dx, 0.06);
  fractal.center.y = lerp(fractal.center.y, fractal.baseCenter.y + dy, 0.06);
  fractal.warp = lerp(fractal.warp, clamp01(fractal.baseWarp + wp), 0.06);

  focusZoomTarget = constrain(focusZoomTarget, 0.70, 3.20);
  focusZoom = lerp(focusZoom, focusZoomTarget, 0.12);
}

function renderFractalLayer() {
  const t = millis() / 1000;
  const palettePhase = (t * fractAnim.paletteSpeed) % 1.0;

  fractalLayer.shader(mandelShader);

  safeUniform(mandelShader, "u_resolution", [CW, CH]);
  safeUniform(mandelShader, "u_time", t);
  safeUniform(mandelShader, "u_center", [fractal.center.x, fractal.center.y]);
  safeUniform(mandelShader, "u_zoom", fractal.zoom);
  safeUniform(mandelShader, "u_iter", Math.min(700, Math.max(1, fractal.iters + signal * 18)));
  safeUniform(mandelShader, "u_warp", clamp01(fractal.warp + signal * 0.02));

  safeUniform(mandelShader, "u_grow", fractAnim.growAmount);
  safeUniform(mandelShader, "u_palette", palettePhase);

  fractalLayer.rect(-CW / 2, -CH / 2, CW, CH);
}

/* ==========================================================
   HIDDEN FOCUS CARD
========================================================== */
function getHiddenFocusCard(glyphSeed, spriteId, sigType) {
  const key = glyphSeed + ":" + spriteId + ":" + CW + "x" + CH;
  if (hiddenFocusCache.has(key)) return hiddenFocusCache.get(key);

  const g = createGraphics(CW, CH);
  g.pixelDensity(1);
  g.noSmooth();
  g.background(0, 18, 0);

  if (act === 2) {
    g.noStroke();
    g.fill(0, 0, 0, 35);
    g.rect(0, 0, CW, CH);
  }

  // Big SIG glyph
  g.push();
  g.translate(CW * 0.5, CH * 0.5);
  g.noFill();
  g.stroke(0, 255, 170, 220);
  g.strokeWeight(4 * S);
  g.circle(0, 0, 260 * S);

  g.stroke(0, 255, 120, 160);
  g.strokeWeight(2 * S);
  g.circle(0, 0, 190 * S);

  g.stroke(0, 255, 170, 180);
  g.strokeWeight(3 * S);
  g.line(-80 * S, 0, 80 * S, 0);
  g.line(-56 * S, -40 * S, 56 * S, 40 * S);

  g.noStroke();
  g.fill(0, 255, 170, 220);
  g.textAlign(CENTER, CENTER);
  g.textSize(42 * S);
  g.text("SIG", 0, 120 * S);

  g.pop();

  // Small item sprite badge
  const badge = getItemSpriteFrame(spriteId);
  g.imageMode(CENTER);
  g.image(badge, CW * 0.5, CH * 0.5 - 160 * S, 180 * S, 180 * S);

  hiddenFocusCache.set(key, g);
  return g;
}

/* ==========================================================
   SPRITES: CHUNKY PIXEL ART + LIGHT ANIMATION
========================================================== */
function getItemSpriteBase(id) {
  if (itemSpriteCache.has(id)) return itemSpriteCache.get(id);

  const g = createGraphics(24, 24);
  g.pixelDensity(1);
  g.noSmooth();
  g.clear();

  const ON  = [0, 255, 170, 230];
  const DIM = [0, 200, 120, 200];

  const px = (x, y, c = ON) => { g.noStroke(); g.fill(...c); g.rect(x, y, 2, 2); };

  if (id === "lamp") {
    px(10, 18); px(12, 18); px(14, 18);
    px(12, 16); px(12, 14);
    for (let x = 6; x <= 16; x += 2) px(x, 10, DIM);
    for (let x = 8; x <= 14; x += 2) px(x, 8, DIM);
    px(10, 6, DIM); px(12, 6, DIM);
    px(12, 12); px(10, 12, DIM); px(14, 12, DIM);
  } else if (id === "mirror") {
    for (let x = 6; x <= 16; x += 2) { px(x, 6); px(x, 16); }
    for (let y = 8; y <= 14; y += 2) { px(6, y); px(16, y); }
    for (let y = 8; y <= 14; y += 2) for (let x = 8; x <= 14; x += 2) px(x, y, DIM);
  } else if (id === "desk") {
    for (let x = 4; x <= 18; x += 2) px(x, 10);
    for (let x = 6; x <= 16; x += 2) px(x, 12);
    for (let y = 14; y <= 20; y += 2) { px(6, y, DIM); px(16, y, DIM); }
  } else if (id === "door") {
    for (let y = 4; y <= 18; y += 2) { px(10, y); px(12, y); px(14, y); }
    for (let y = 4; y <= 18; y += 2) { px(8, y, DIM); px(16, y, DIM); }
    px(16, 12);
  } else {
    for (let y = 8; y <= 14; y += 2) for (let x = 8; x <= 14; x += 2) px(x, y);
  }

  itemSpriteCache.set(id, g);
  return g;
}

function getItemSpriteFrame(id) {
  const base = getItemSpriteBase(id);

  const g = createGraphics(24, 24);
  g.pixelDensity(1);
  g.noSmooth();
  g.clear();
  g.image(base, 0, 0);

  const ON  = [0, 255, 170, 235];
  const HOT = [180, 255, 220, 235];
  const DIM = [0, 200, 120, 210];

  const px = (x, y, c = ON) => { g.noStroke(); g.fill(...c); g.rect(x, y, 2, 2); };

  if (id === "lamp") {
    const t = frameCount % 12;
    if (t < 6) { px(12, 12, HOT); px(10, 12, DIM); }
    else { px(12, 12, ON); px(14, 12, HOT); }
  }

  if (id === "mirror") {
    const step = (frameCount % 16);
    const x = 8 + (step % 4) * 2;
    const y = 8 + Math.floor(step / 4) * 2;
    px(x, y, HOT);
    px(x + 2, y + 2, DIM);
  }

  if (id === "desk") {
    const y = (frameCount % 10 < 5) ? 10 : 12;
    for (let x = 6; x <= 16; x += 2) px(x, y, DIM);
  }

  if (id === "door") {
    const blink = (frameCount % 20 < 3);
    if (blink) px(16, 12, HOT);
    if (frameCount % 18 < 9) { px(8, 8, DIM); px(16, 8, DIM); }
  }

  return g;
}

/* ==========================================================
   UTILITIES
========================================================== */
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function idHash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom(arr, randFn) {
  const i = Math.floor(randFn() * arr.length);
  return arr[Math.max(0, Math.min(arr.length - 1, i))];
}

/* ==========================================================
   SAFE UNIFORMS
========================================================== */
function safeUniform(sh, name, val) {
  try { if (sh && typeof sh.setUniform === "function") sh.setUniform(name, val); }
  catch (e) { /* ignore */ }
}

/* ==========================================================
   AUDIO
========================================================== */
function armAudioIfNeeded() {
  if (audioArmed) return;
  userStartAudio();
  audioArmed = true;

  blipOsc = new p5.Oscillator("sine");
  blipOsc.start();
  blipOsc.amp(0);

  windNoise = new p5.Noise("pink");
  windNoise.start();
  windNoise.amp(0);

  lp = new p5.LowPass();
  windNoise.disconnect();
  windNoise.connect(lp);
  lp.freq(800);
  lp.res(10);

  envBlip = new p5.Envelope();
  envBlip.setADSR(0.001, 0.06, 0.0, 0.08);
  envBlip.setRange(0.6, 0);

  envNoise = new p5.Envelope();
  envNoise.setADSR(0.001, 0.08, 0.0, 0.12);
  envNoise.setRange(0.35, 0);

  initProceduralMusic();
}

function sfxBlip(freq, a, d, amp) {
  if (!audioArmed || !blipOsc || !envBlip) return;
  blipOsc.freq(freq);
  envBlip.setADSR(a, d, 0.0, d);
  envBlip.setRange(amp, 0);
  envBlip.play(blipOsc);
}

function sfxNoise(freq, d, amp) {
  if (!audioArmed || !windNoise || !envNoise || !lp) return;
  lp.freq(freq);
  envNoise.setADSR(0.001, d, 0.0, d);
  envNoise.setRange(amp, 0);
  envNoise.play(windNoise);
}

function sfxTap() { sfxBlip(520, 0.001, 0.03, 0.14); }
function sfxDenied() { sfxBlip(180, 0.001, 0.08, 0.22); sfxNoise(320, 0.10, 0.20); }
function sfxProximity() { sfxBlip(740, 0.001, 0.02, 0.10); }
function sfxDoorRumble() { sfxNoise(160, 0.18, 0.35); sfxBlip(260, 0.002, 0.10, 0.20); }
function sfxInteractHigh() { sfxBlip(920, 0.001, 0.05, 0.22); }
function sfxInteractMid() { sfxBlip(640, 0.001, 0.06, 0.22); }
function sfxInteractLow() { sfxBlip(360, 0.001, 0.08, 0.22); }
function sfxFocusOpen() { sfxBlip(820, 0.001, 0.05, 0.16); }
function sfxFocusClose() { sfxBlip(520, 0.001, 0.05, 0.14); }
function sfxZoomTick(down) { sfxBlip(down ? 420 : 560, 0.001, 0.02, 0.10); }

function initProceduralMusic() {
  // Instruments (no noise)
  music.lead = new p5.Oscillator("triangle");
  music.bass = new p5.Oscillator("square");
  music.hatOsc = new p5.Oscillator("square"); // clicky hat

  music.lead.start(); music.bass.start(); music.hatOsc.start();
  music.lead.amp(0);  music.bass.amp(0);  music.hatOsc.amp(0);

  // FX chain
  music.filter = new p5.LowPass();
  music.reverb = new p5.Reverb();
  music.delay  = new p5.Delay();

  // Route into filter
  music.lead.disconnect();
  music.bass.disconnect();
  music.hatOsc.disconnect();

  music.lead.connect(music.filter);
  music.bass.connect(music.filter);
  music.hatOsc.connect(music.filter);

  music.reverb.process(music.filter, 1.2, 1.0);
  music.delay.process(music.filter, 0.12, 0.22, 1600);

  music.filter.freq(1500);
  music.filter.res(9);

  // Timing + pep
  music.lastStepAt = 0;
  music.step = 0;
  music.bpmBase = 112;
  music.bpm = 112;

  music.speedSmoothed = 0;
  music._energySmoothed = 0;
}

function updateProceduralMusic() {
  if (!audioArmed || !musicOn) return;

  const targetSpeed  = (mode === "world" && !paused && !showFinalModal) ? (player.speed01 || 0) : 0;
  const targetEnergy = (mode === "world" && !paused && !showFinalModal) ? (player.energy  || 0) : 0;

  music.speedSmoothed = lerp(music.speedSmoothed, targetSpeed, 0.10);
  music._energySmoothed = lerp(music._energySmoothed || 0, targetEnergy, 0.12);

  const groove = music.speedSmoothed || 0;
  const energy = music._energySmoothed || 0;
  const drive  = constrain(groove * 0.85 + energy * 0.55, 0, 1);

  // Faster when moving
  music.bpm = lerp(music.bpmBase, music.bpmBase + 38, drive);

  const t = millis();
  const stepMs = 60000 / music.bpm;
  if (t - music.lastStepAt < stepMs) return;
  music.lastStepAt = t;

  music.step = (music.step + 1) % 16;

  // Notes
  const scale = [0, 2, 4, 7, 9, 12]; // more upbeat than minor-ish
  const root = 220;

  const leadDeg = scale[music.step % scale.length];
  const leadF = root * Math.pow(2, leadDeg / 12);

  const bassPattern = [0,0,0,0, 4,4,0,0, 7,7,4,4, 0,0,9,9];
  const bassDeg = bassPattern[music.step];
  const bassF = (root / 2) * Math.pow(2, bassDeg / 12);

  // Amps
  const leadAmp = 0.030 + 0.12 * drive;
  const bassAmp = 0.025 + 0.11 * drive;

  music.lead.freq(leadF);
  music.bass.freq(bassF);

  music.lead.amp(leadAmp, 0.03);
  music.bass.amp(bassAmp, 0.03);

  // Hat "click" (no noise): short ticks with accents
  let hatAmp = 0;

  // offbeats
  if (music.step % 2 === 1) hatAmp += 0.08;

  // extra pep when moving
  if (drive > 0.55 && (music.step === 6 || music.step === 14)) hatAmp += 0.07;

  // backbeat accent
  if (music.step === 4 || music.step === 12) hatAmp += 0.10 * (0.4 + 0.6 * energy);

  // set hat frequency to feel like a tight click
  const hatF = 1800 + 1200 * drive;
  music.hatOsc.freq(hatF);

  // super fast decay via amp ramp
  music.hatOsc.amp(hatAmp, 0.005);
  music.hatOsc.amp(0, 0.03);

  // Filter brightness follows movement + signal
  music.filter.freq(lerp(1400, 4200, drive) + 120 * signal);
}

function musicAccent() {
  if (!audioArmed || !musicOn) return;
  sfxBlip(980, 0.001, 0.03, 0.10);
}

/* ==========================================================
   FOOTSTEPS (very light)
========================================================== */
function updateFootsteps() { /* optional placeholder */ }

/* ==========================================================
   TTS
========================================================== */
function speakText(txt) {
  if (!ttsEnabled) return;
  stopTTS();
  const u = new SpeechSynthesisUtterance(txt);
  u.rate = 0.92;
  u.pitch = 0.96;
  speaking = true;
  u.onend = () => { speaking = false; };
  speechSynthesis.speak(u);
}

function stopTTS() {
  if (!ttsEnabled) return;
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  speaking = false;
}

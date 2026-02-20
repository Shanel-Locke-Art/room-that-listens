// ----- p5 global aliases (fixes random/createCanvas undefined) -----
if (typeof window.createCanvas !== "function" && typeof window.p5 === "function") {
  // Grab the active p5 instance if one exists, otherwise create one.
  // This keeps your existing "global mode" style sketch working.
  const inst = window._p5Instance || new window.p5(() => {});
  window._p5Instance = inst;

  // Map commonly used functions/properties to window
  const fns = [
    "createCanvas","resizeCanvas","createGraphics","loadImage","loadStrings","loadShader",
    "background","image","tint","noTint","push","pop","translate","rotate","scale",
    "stroke","noStroke","fill","noFill","strokeWeight","rect","circle","ellipse","line",
    "text","textSize","textAlign","textFont","noSmooth","smooth","pixelDensity",
    "random","noise","dist","constrain","lerp","map","sin","cos","tan","atan2","pow",
    "min","max","floor","ceil","abs","sqrt","keyIsDown","keyPressed","mousePressed",
    "mouseWheel","windowResized","width","height","frameCount","millis"
  ];

  for (const k of fns) {
    if (typeof window[k] === "undefined" && typeof inst[k] !== "undefined") {
      window[k] = inst[k].bind ? inst[k].bind(inst) : inst[k];
    }
  }
}
/* ==========================================================
   A SMALL LOOP LEAKS - sketch.js (FULL REWRITE, ERROR-SAFE)

   Goals (everything working, no missing pieces):
   - p5.js + LOCAL LIBRARIES (downloaded): p5.min.js + p5.sound.min.js
   - Mandelbrot fractal shader background (animated, screensaver grow + palette cycle)
   - Optional object-reactive field (u_obj1..u_obj4, u_objStrength) if your shader supports it
   - Filter shader overlay for focus/final views (distorts base image w/ fractal)
   - Larger game area (auto camera scroll) + random placement + hidden SIG nodes
   - Hidden SIG nodes have DISTINCT SYMBOL (procedural glyph), reveal by proximity
   - Interactables are BIGGER
   - Audio: louder SFX + procedural reactive background music (movement reactive)
   - Poetry: randomized, depends on order; typewriter single-line hold + blinking cursor
   - Final poem: centered modal, DOOR image as background, ESC closes (no freeze)
   - Player starts center
   - Q ping door, arrow hint for door if eligible (>=2 objects)
   - Text-to-speech (Space in final modal), if browser supports it

   IMPORTANT FOLDER STRUCTURE (do not rename):
   /index.html
   /style.css
   /sketch.js
   /assets/lamp.png mirror.png desk.png door.png   (your sprite images)
   /shaders/passthrough.vert
   /shaders/mandelbrot.frag
   /shaders/filter.frag

========================================================== */

/* =========================
   CONFIG: paths (do not rename)
========================= */
const PATHS = {
  assets: {
    lamp: "assets/lamp.png",
    mirror: "assets/mirror.png",
    desk: "assets/desk.png",
    door: "assets/door.png"
  },
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

/* =========================
   DOM UI (optional)
========================= */
let promptEl = null;
let poemEl = null;

/* =========================
   WORLD / CAMERA / PLAYER
========================= */
let world = { w: 2800, h: 1900, pad: 180 };
let camera = { x: 0, y: 0 };
let player = { x: 0, y: 0, r: 10, speed: 2.6 };

let INTERACT_RADIUS = 86;
let REVEAL_RADIUS_MULT = 2.8;
let EXTRA_HIDDEN = 10;

/* =========================
   STATIONS (objects)
========================= */
const CORE_IDS = ["lamp", "mirror", "desk", "door"];
let sprites = {};
let stations = [];

/* =========================
   MODES
========================= */
let mode = "world"; // world | focus
let paused = false;
let showFinalModal = false;

let focusId = null;
let focusImg = null;
let focusZoom = 0.95;
let focusZoomTarget = 0.95;

/* =========================
   SIGNAL + DOOR GUIDANCE
========================= */
let signal = 0;
let pulse = { active: false, r: 0, speed: 18, hit: false };
let doorTrail = { t: 0, maxT: 260 };

/* =========================
   SHADERS / BUFFERS
========================= */
let fractalLayer = null;    // WEBGL
let filteredLayer = null;   // WEBGL
let imageLayer = null;      // 2D for focus/final base

let mandelShader = null;
let filterShader = null;

let vertSrc = "";
let mandelFrag = "";
let filterFrag = "";

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
   POETRY (randomized)
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
   TYPEWRITER UI (single-line hold + cursor)
========================= */
let poemQueue = [];
let typingLine = "";
let typingIndex = 0;
let isTyping = false;
let heldLine = "";

let cursorOn = true;
let cursorTimer = 0;

/* =========================
   FINAL POEM
========================= */
let finalPoemText = "";

/* =========================
   HIDDEN FOCUS CARDS CACHE
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
let stepTimer = 0;

/* ==========================================================
   PRELOAD
========================================================== */
function preload() {
  mandelShader = loadShader("shaders/passthrough.vert", "shaders/mandelbrot.frag");
  filterShader = loadShader("shaders/passthrough.vert", "shaders/filter.frag");

  sprites.lamp = loadImage("assets/lamp.png");
  sprites.mirror = loadImage("assets/mirror.png");
  sprites.desk = loadImage("assets/desk.png");
  sprites.door = loadImage("assets/door.png");
}

/* ==========================================================
   SETUP
========================================================== */
function setup() {
  promptEl = document.getElementById("prompt");
  poemEl = document.getElementById("poem");

  computeCanvasSize();
  cnv = createCanvas(CW, CH);
  pixelDensity(1);
  noSmooth();

  // Make canvas focusable (prevents “keys not working” issues)
  cnv.elt.setAttribute("tabindex", "0");
  cnv.elt.style.outline = "none";
  cnv.elt.focus();

  // Ensure ESC closes modal even if focus weirdness
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
  computeCanvasSize();
  resizeCanvas(CW, CH);
  createBuffersAndShaders();
  hiddenFocusCache.clear();
}

/* ==========================================================
   CANVAS SIZE (fills window, leaves DOM bars alone)
========================================================== */
function computeCanvasSize() {
  const margin = 14;

  // Try to respect optional UI bars if present
  const topHUD = document.querySelector(".hud-top");
  const bottomHUD = document.querySelector(".meaning-bar");

  const topH = topHUD ? topHUD.offsetHeight : 0;
  const botH = bottomHUD ? bottomHUD.offsetHeight : 0;

  const maxW = Math.max(320, windowWidth - margin * 2);
  const maxH = Math.max(240, windowHeight - topH - botH - margin * 2);

  CW = Math.floor(maxW);
  CH = Math.floor(maxH);

  S = Math.min(CW / BASE_W, CH / BASE_H);

  INTERACT_RADIUS = 92 * S;      // BIGGER interactables
  player.r = 10 * S;
  player.speed = 2.7 * S;
}

/* ==========================================================
   BUFFERS + SHADERS (fixes “different context” error)
========================================================== */
function createBuffersAndShaders() {
  fractalLayer = createGraphics(CW, CH, WEBGL);
  filteredLayer = createGraphics(CW, CH, WEBGL);
  fractalLayer.noStroke();
  filteredLayer.noStroke();

  imageLayer = createGraphics(CW, CH);
  imageLayer.pixelDensity(1);
  imageLayer.noSmooth();
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
  focusZoom = 0.95;
  focusZoomTarget = 0.95;

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

  // Randomize world dimensions (big)
  world.w = Math.floor(2400 + random(0, 1400));
  world.h = Math.floor(1700 + random(0, 1000));
  world.pad = Math.floor(170 + random(0, 130));

  // Start player in center
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

  // Instructions (meaningful + old-school vibe)
  queuePoemLine("A room shimmers in green phosphor.");
  queuePoemLine("You and the machine co-write a poem by moving through it.");
  queuePoemLine("Interact with 2 objects, then the door. The order becomes the poem.");
  queuePoemLine("Hidden SIG nodes are withheld words. Find them to deepen SIGNAL.");
  queuePoemLine("Controls: WASD/Arrows move. E interact. Q ping door. ESC close/pause.");

  if (cnv && cnv.elt) cnv.elt.focus();
}

/* ==========================================================
   MAIN LOOP
========================================================== */
function draw() {
  // Always update UI typing + HUD, even if paused/modal
  updateTypewriter();
  rebuildPoemDisplay();

  // Always animate the pulse (door ping) and music/fractal so the world feels alive
  updatePulse();
  updateProceduralMusic();
  updateFractalAnimation();

  // Only update player/world simulation when actually playing the world
  const inWorldPlay = (!showFinalModal && !paused && mode === "world");
  if (inWorldPlay) {
    updateMovement();
    updateFootsteps();
  }

  // Camera should still ease even in focus/modal so transitions feel smooth
  updateCamera();

  // Render fractal layer (safe guard)
  if (mandelShader && fractalLayer) {
    renderFractalLayer();
  }

  // Draw current view
  if (showFinalModal) {
    // Final poem overlay takes priority visually
    // (It will draw its own background + filter)
    drawFinalModal();
  } else if (mode === "world") {
    drawWorldMode();
  } else {
    drawFocusMode();
  }

  // HUD prompt text
  updateUI();
}

/* ==========================================================
   WORLD GENERATION
========================================================== */
function generateStations() {
  stations = [];
  const placed = [];

  const minDist = 310 * S;
  const avoidPlayerDist = 460 * S;

  // Place core objects
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

  // Hidden SIG nodes (procedural symbol)
  const spritePool = ["lamp", "mirror", "desk"];
  for (let i = 0; i < EXTRA_HIDDEN; i++) {
    const pos = pickPositionWithSpacing(minDist * 0.72, avoidPlayerDist * 0.28, placed);
    placed.push(pos);

    const glyphSeed = (runSeed ^ (i * 99991) ^ (pos.x * 13) ^ (pos.y * 7)) >>> 0;
    const spriteId = spritePool[i % spritePool.length];

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
      fn: () => hiddenAction(glyphSeed, spriteId)
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
    vx = 0; vy = 0;
  }

  player.x += vx;
  player.y += vy;

  // keep in world
  player.x = constrain(player.x, player.r, world.w - player.r);
  player.y = constrain(player.y, player.r, world.h - player.r);

  // Movement nudges fractal baseline a tiny bit
  fractal.baseCenter.x += vx * 0.00055 / Math.max(fractal.baseZoom, 0.001);
  fractal.baseCenter.y += vy * 0.00055 / Math.max(fractal.baseZoom, 0.001);

  // Reveal hidden by proximity
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

  // Fractal as glowing background layer
  if (fractalLayer) {
    tint(120, 255, 170, 210);
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
}

function drawCRTBackground() {
  background(0, 18, 0);

  // radial glow
  noStroke();
  for (let r = Math.max(CW, CH) * 1.2; r > 0; r -= 34) {
    const a = map(r, 0, Math.max(CW, CH) * 1.2, 26, 0);
    fill(0, 255, 120, a);
    ellipse(CW * 0.5, CH * 0.5, r * 1.25, r);
  }

  fill(0, 0, 0, 70);
  rect(0, 0, CW, CH);

  // scanlines
  for (let y = 0; y < CH; y += 3) {
    stroke(0, 255, 120, 10);
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

function nearestStationWorld() {
  let best = null;
  let bestD = 1e9;

  for (const s of stations) {
    if (s.hidden && !s.revealed) continue;
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return { s: best, d: bestD };
}

function drawStationsWorld() {
  const near = nearestStationWorld();

  for (const s of stations) {
    if (!isOnScreen(s.x, s.y, 260)) continue;

    const dToPlayer = dist(player.x, player.y, s.x, s.y);
    const active = near.s && near.s === s && near.d <= INTERACT_RADIUS;

    // hidden unrevealed shows shimmer field only
    if (s.kind === "hidden" && !s.revealed) {
      drawHiddenShimmerField(s, dToPlayer);
      continue;
    }

    if (s.kind === "hidden") {
      drawHiddenGlyph(s, active);
      continue;
    }

    // Core plates
    stroke(active ? color(0, 255, 170, 240) : color(0, 255, 120, 140));
    strokeWeight(Math.max(2.0 * S, 2.8));
    fill(active ? color(0, 255, 140, 60) : color(0, 255, 120, 30));

    const plate = 104 * S; // bigger
    rect(s.x - plate / 2, s.y - plate / 2, plate, plate, 12 * S);

    const img = sprites[s.id];
    if (img) {
      push();
      imageMode(CENTER);
      noSmooth();
      const p = active ? (1.0 + 0.07 * sin(frameCount * 0.18)) : 1.0;

      tint(180, 255, 210, 255);

      if (s.id === "door") {
        image(img, s.x, s.y, 70 * S * p, 112 * S * p);
      } else {
        image(img, s.x, s.y, 88 * S * p, 88 * S * p);
      }

      noTint();
      pop();
    } else {
      noStroke();
      fill(0, 255, 170, 220);
      textAlign(CENTER, CENTER);
      textSize(12 * S);
      text("MISSING " + s.id, s.x, s.y);
    }

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

  // Distinct symbol: an "eye" slash
  stroke(0, 255, 170, 180 * flicker);
  strokeWeight(2.0 * S);
  line(-20 * S, 0, 20 * S, 0);
  line(-14 * S, -10 * S, 14 * S, 10 * S);

  noStroke();
  fill(0, 255, 170, active ? 220 : 170);
  textAlign(CENTER, CENTER);
  textSize(12 * S);
  text("SIG", 0, 60 * S);

  pop();
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

  // easiest way to find the door: arrow appears once eligible
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

/* ==========================================================
   INTERACTIONS
========================================================== */
function coreAction(id) {
  addInteractionPoetry(id);

  if (id === "door") {
    if (!canEnterDoorState()) {
      queuePoemLine("The door refuses. Bring it more lines first.");
      sfxDenied();
      enterFocus("door");
      return;
    }
    doorTrail.t = Math.max(doorTrail.t, Math.floor(190 + signal * 35));
    sfxDoorRumble();
    enterFocus("door");
    return;
  }

  // Fractal reacts by object type
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

  enterFocus(id);
}

function hiddenAction(glyphSeed, spriteId) {
  gainSignal("open");
  queuePoemLine(pickUniqueLine(LINES.hidden, 0x1DD33));
  sfxInteractMid();

  focusId = "hidden";
  focusImg = getHiddenFocusCard(glyphSeed, spriteId);
  mode = "focus";
  focusZoom = 0.95;
  focusZoomTarget = 0.95;
}

function enterFocus(id) {
  mode = "focus";
  focusId = id;
  focusImg = sprites[id] || null;
  focusZoom = 0.95;
  focusZoomTarget = 0.95;
  sfxFocusOpen();
}

function exitFocus() {
  mode = "world";
  focusId = null;
  focusImg = null;
  focusZoom = 0.95;
  focusZoomTarget = 0.95;
  sfxFocusClose();
}

/* ==========================================================
   INPUT
========================================================== */
function keyPressed() {
  armAudioIfNeeded();
  if (cnv && cnv.elt) cnv.elt.focus();

  // Final modal controls
  if (showFinalModal) {
    if (keyCode === 32) { // SPACE
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

  // ESC behavior
  if (keyCode === ESCAPE) {
    if (mode === "focus") {
      exitFocus();
    } else {
      paused = !paused;
    }
    return false;
  }

  // Restart
  if (key === "r" || key === "R") {
    restartRun();
    return false;
  }

  // Door ping
  if (key === "q" || key === "Q") {
    if (mode === "world" && !paused) {
      pulse.active = true;
      pulse.r = 0;
      pulse.hit = false;
      sfxBlip(420, 0.001, 0.06, 0.30);
    }
    return false;
  }

  // Interact / close focus / seal poem at door
  if (key === "e" || key === "E") {
    if (paused) return false;

    if (mode === "focus") {
      if (focusId === "door" && canFinalizePoem()) {
        finalPoemText = buildFinalPoemText();
        showFinalModal = true;
        paused = true;
        exitFocus(); // ensure character doesn't freeze with focus state
        return false;
      }
      exitFocus();
      return false;
    }

    const near = nearestStationWorld();
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
  if (mode !== "focus") return;
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
  focusZoom = 0.95;
  focusZoomTarget = 0.95;
  if (cnv && cnv.elt) cnv.elt.focus();
}

/* ==========================================================
   DRAW: FOCUS MODE (filter shader + fractal overlay)
========================================================== */
function drawFocusMode() {
  drawCRTBackground();

  // Base image for filtering
  imageLayer.clear();
  if (focusImg) drawContain(imageLayer, focusImg, 0, 0, CW, CH, focusZoom, 0.88);
  else imageLayer.background(0, 18, 0);

  // Filtered composite
  if (filteredLayer && filterShader && fractalLayer) {
    filteredLayer.shader(filterShader);

    // Most p5 examples use tex0/tex1, but support u_tex0/u_tex1 too
    safeUniform(filterShader, "u_tex0", imageLayer);
    safeUniform(filterShader, "u_tex1", fractalLayer);
    safeUniform(filterShader, "tex0", imageLayer);
    safeUniform(filterShader, "tex1", fractalLayer);

    safeUniform(filterShader, "u_resolution", [CW, CH]);
    safeUniform(filterShader, "u_time", millis() / 1000.0);
    safeUniform(filterShader, "u_amount", 0.78);
    safeUniform(filterShader, "u_fractMix", 0.94);

    filteredLayer.rect(-CW / 2, -CH / 2, CW, CH);
    image(filteredLayer, 0, 0);
  } else {
    image(imageLayer, 0, 0);
  }

  // Focus UI
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
   DRAW: FINAL MODAL (door bg + fractal filter)
========================================================== */
function drawFinalModal() {
  // Base is DOOR image cover
  imageLayer.clear();
  const doorImg = sprites.door || null;
  if (doorImg) drawCover(imageLayer, doorImg, 0, 0, CW, CH);
  else imageLayer.background(0, 18, 0);

  // Filter on top
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

  // Dim
  noStroke();
  fill(0, 0, 0, 160);
  rect(0, 0, CW, CH);

  // Panel
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
   SIGNAL GAIN (poetry returns)
========================================================== */
function gainSignal(reason = "sig") {
  const before = signal;
  signal = Math.min(6, signal + 1);
  if (signal === before) return;

  doorTrail.maxT = 260 + signal * 50;
  pulse.speed = 18 + signal * 2;

  queuePoemLine(pickUniqueLine(SIGNAL_LINES, 0x51A1A1));       // fixed
  if (random() < 0.45) queuePoemLine(pickUniqueLine(MUTATION_LINES, 0xA73A73));
  if (random() < 0.22) queuePoemLine(pickUniqueLine(MUTATION_LINES, 0xA73A73)); // fixed typo

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
    queuePoemLine(pickUniqueLine(CONNECTORS, 0xC0FFEE));      // fixed
  }

  const bucket = LINES[id] || ["Something responds, quietly."];
  queuePoemLine(pickUniqueLine(bucket, idHash(id)));

  if (random() < 0.25) queuePoemLine(pickUniqueLine(GLITCH_LINES, 0xA117C)); // fixed
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
    "Signal: " + signal + "/6",
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

queuePoemLine(pickUniqueLine(SIGNAL_LINES, "SIGNAL"));
if (random() < 0.45) queuePoemLine(pickUniqueLine(CONNECTORS, "CONNECT"));
if (random() < 0.22) queuePoemLine(pickUniqueLine(MUTATION_LINES, "MUTATE"));
if (random() < 0.25) queuePoemLine(pickUniqueLine(GLITCH_LINES, "GLITCH"));

/* ==========================================================
   TYPEWRITER (line hold + cursor)  [TIME-BASED]
   - One line at a time (heldLine stays until next line starts)
   - Cursor blinks continuously
   - Typing speed controlled by TYPE_DELAY_MS
   - Optional: typing tick sound every TYPE_TICK_EVERY chars
========================================================== */

// Tune these:
const TYPE_DELAY_MS = 120;        // bigger = slower typing (try 55–90)
const TYPE_TICK_EVERY = 4;       // play a tick every N characters
const CURSOR_BLINK_FRAMES = 26;  // cursor blink rate

let lastTypeTime = 0;

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

  // Cursor blink
  cursorTimer++;
  if (cursorTimer >= CURSOR_BLINK_FRAMES) {
    cursorTimer = 0;
    cursorOn = !cursorOn;
  }

  // If we're idle, start the next queued line
  if (!isTyping && poemQueue.length > 0) {
    typingLine = poemQueue.shift();
    typingIndex = 0;
    isTyping = true;

    // Keep whatever was last on screen until the first new char arrives
    // (heldLine will update as soon as typing begins)
    lastTypeTime = now;
  }

  // Nothing to type
  if (!isTyping) return;

  // Type exactly 1 character per TYPE_DELAY_MS
  if ((now - lastTypeTime) < TYPE_DELAY_MS) return;
  lastTypeTime = now;

  // Advance typing
  if (typingIndex < typingLine.length) {
    typingIndex++;
    heldLine = typingLine.slice(0, typingIndex);

    // Optional typing tick sound
    if (audioArmed && !showFinalModal && (typingIndex % TYPE_TICK_EVERY === 0)) {
      const f = 420 + (typingIndex % 9) * 12;
      sfxBlip(f, 0.001, 0.02, 0.10);
    }
  } else {
    // Finished this line; it remains on screen until the next line begins
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

  // default styling
  promptEl.classList.remove("urgent");

  if (showFinalModal) {
    promptEl.textContent = "Final poem. ESC closes. R restarts. Space speaks.";
    return;
  }

  if (mode === "focus") {
    if (focusId === "door" && canFinalizePoem()) {
      promptEl.textContent = "Door ready. Press E to seal. Mouse wheel zoom.";
    } else {
      promptEl.textContent = "Focus view. Mouse wheel zoom. E or ESC closes. Q pings door.";
    }
    return;
  }

  if (paused) {
    promptEl.textContent = "Paused. ESC returns. R restarts.";
    return;
  }

  const nonDoorCount = history.filter(h => h !== "door").length;
  const need = Math.max(0, 2 - nonDoorCount);

  const near = nearestStationWorld();
  const inRange = near.s && near.d <= INTERACT_RADIUS;

  if (inRange && near.s) {
    if (near.s.kind === "core" && near.s.id === "door" && need > 0) {
      promptEl.textContent = "The door wants more input. Find " + need + " more object(s).";
      promptEl.classList.add("urgent");
    } else {
      promptEl.textContent = "Press E to interact. Q pings the door.";
    }

    if (near.s.id && near.s.id !== lastNearId) {
      sfxProximity();
      musicAccent();
    }
    lastNearId = near.s.id;
    return;
  }

  lastNearId = null;

  if (need > 0) {
    promptEl.textContent = "EXPLORE. FIND " + need + " MORE OBJECT" + (need > 1 ? "S." : ".") + " Hidden SIG nodes deepen SIGNAL.";
    promptEl.classList.add("urgent");
  } else if (!history.includes("door")) {
    promptEl.textContent = "You have enough lines. Find the door. Press Q to ping it.";
  } else {
    promptEl.textContent = "Return to the door. View it and press E to seal.";
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

  // core fractal uniforms
  safeUniform(mandelShader, "u_resolution", [CW, CH]);
  safeUniform(mandelShader, "u_time", t);
  safeUniform(mandelShader, "u_center", [fractal.center.x, fractal.center.y]);
  safeUniform(mandelShader, "u_zoom", fractal.zoom);
  safeUniform(mandelShader, "u_iter", Math.min(700, Math.max(1, fractal.iters + signal * 18)));
  safeUniform(mandelShader, "u_warp", clamp01(fractal.warp + signal * 0.02));

  // screensaver controls
  safeUniform(mandelShader, "u_grow", fractAnim.growAmount);
  safeUniform(mandelShader, "u_palette", palettePhase);

  // Object-reactive uniforms (UV space)
  // (If your shader doesn't use them, safeUniform will just fail silently)
  const uv = coreObjectUVs();
  safeUniform(mandelShader, "u_obj1", uv[0]);
  safeUniform(mandelShader, "u_obj2", uv[1]);
  safeUniform(mandelShader, "u_obj3", uv[2]);
  safeUniform(mandelShader, "u_obj4", uv[3]);

  const strengths = objectStrengths();
  safeUniform(mandelShader, "u_objStrength", strengths);

  fractalLayer.rect(-CW / 2, -CH / 2, CW, CH);
}

function coreObjectUVs() {
  // Convert world positions of core objects to on-screen UV (0..1)
  // This makes the “field” follow where objects appear relative to camera.
  const arr = [];
  for (const id of CORE_IDS) {
    const s = stations.find(st => st.kind === "core" && st.id === id);
    if (!s) { arr.push([0.5, 0.5]); continue; }
    const sc = worldToScreen(s.x, s.y);
    const u = constrain(sc.x / CW, 0, 1);
    const v = constrain(1.0 - (sc.y / CH), 0, 1); // flip Y for shader UVs
    arr.push([u, v]);
  }
  return arr;
}

function objectStrengths() {
  // Strength increases when near / interacted / signal high
  const vals = [];

  for (const id of CORE_IDS) {
    const s = stations.find(st => st.kind === "core" && st.id === id);
    if (!s) { vals.push(0.0); continue; }

    const d = dist(player.x, player.y, s.x, s.y);
    const near = 1.0 - constrain(d / (INTERACT_RADIUS * 2.2), 0, 1);
    const interacted = history.includes(id) ? 0.7 : 0.0;
    const base = (id === "door") ? 0.35 : 0.45;

    vals.push(clamp01(base * near + interacted * 0.6));
  }

  // Return vec4
  return [vals[0], vals[1], vals[2], vals[3]];
}

/* ==========================================================
   HIDDEN FOCUS CARD (close-up not blank)
========================================================== */
function getHiddenFocusCard(glyphSeed, spriteId) {
  const key = glyphSeed + ":" + spriteId + ":" + CW + "x" + CH;
  if (hiddenFocusCache.has(key)) return hiddenFocusCache.get(key);

  const g = createGraphics(CW, CH);
  g.pixelDensity(1);
  g.noSmooth();

  g.background(0, 18, 0);

  // scanlines
  g.noStroke();
  g.fill(0, 0, 0, 60);
  g.rect(0, 0, CW, CH);
  for (let y = 0; y < CH; y += 3) {
    g.stroke(0, 255, 120, 10);
    g.line(0, y, CW, y);
  }

  const pad = 28 * S;
  const w = CW - pad * 2;
  const h = CH - pad * 2;

  g.stroke(0, 255, 170, 170);
  g.strokeWeight(3 * S);
  g.fill(0, 28, 0, 230);
  g.rect(pad, pad, w, h, 12 * S);

  g.noStroke();
  g.fill(0, 255, 170, 240);
  g.textAlign(LEFT, TOP);
  g.textSize(22 * S);
  g.text("SIG NODE", pad + 18 * S, pad + 14 * S);

  g.fill(0, 255, 170, 170);
  g.textSize(12 * S);
  g.text("A withheld word from the machine layer.", pad + 18 * S, pad + 46 * S);

  // center box with sprite
  const img = sprites[spriteId];
  const box = 240 * S;
  const cx = CW * 0.5;
  const cy = CH * 0.50;

  g.stroke(0, 255, 170, 120);
  g.noFill();
  g.rect(cx - box / 2, cy - box / 2, box, box, 10 * S);

  if (img) {
    g.push();
    g.imageMode(CENTER);
    g.tint(180, 255, 210, 255);
    g.image(img, cx, cy, box * 0.82, box * 0.82);
    g.noTint();
    g.pop();
  } else {
    g.noStroke();
    g.fill(0, 255, 170, 160);
    g.textAlign(CENTER, CENTER);
    g.textSize(14 * S);
    g.text("MISSING SPRITE", cx, cy);
  }

  // glyph at bottom
  const pts = makeGlyphPoints(glyphSeed, 10);
  g.push();
  g.translate(CW * 0.5, CH * 0.78);

  g.noFill();
  g.stroke(0, 255, 170, 140);
  g.strokeWeight(2.5 * S);
  g.circle(0, 0, 200 * S);

  g.noStroke();
  g.fill(0, 255, 170, 200);
  g.beginShape();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    g.vertex(p.x * 3.0, p.y * 3.0);
  }
  g.endShape(CLOSE);

  g.fill(0, 255, 170, 170);
  g.textAlign(CENTER, TOP);
  g.textSize(12 * S);
  g.text("SIGNAL deepens the poem and strengthens door guidance.", 0, 120 * S);

  g.pop();

  hiddenFocusCache.set(key, g);
  return g;
}

/* ==========================================================
   FOOTSTEPS
========================================================== */
function updateFootsteps() {
  const moving =
    keyIsDown(LEFT_ARROW) || keyIsDown(RIGHT_ARROW) || keyIsDown(UP_ARROW) || keyIsDown(DOWN_ARROW) ||
    keyIsDown(65) || keyIsDown(68) || keyIsDown(87) || keyIsDown(83);

  if (!moving) { stepTimer = 0; return; }

  stepTimer += 1;
  const cadence = Math.max(10, Math.floor(18 / Math.max(S, 0.6)));
  if (stepTimer >= cadence) {
    stepTimer = 0;
    sfxStep();
  }
}

/* ==========================================================
   TTS
========================================================== */
function stopTTS() {
  if (!ttsEnabled) return;
  window.speechSynthesis.cancel();
  speaking = false;
}

function speakText(text) {
  if (!ttsEnabled) return;
  stopTTS();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1.0;
  utter.volume = 1.0;

  utter.onend = () => { speaking = false; };
  utter.onerror = () => { speaking = false; };

  speaking = true;
  window.speechSynthesis.speak(utter);
}

/* ==========================================================
   AUDIO ARM + SFX (louder)
========================================================== */
function armAudioIfNeeded() {
  if (audioArmed) return;

  // If p5.sound not loaded, fail gracefully
  if (typeof p5 === "undefined" || typeof p5.Envelope === "undefined") {
    console.warn("p5.sound not loaded. Audio disabled.");
    audioArmed = true;
    return;
  }

  userStartAudio();

  // FIX: use p5.sound masterVolume function (only exists if p5.sound loaded)
  if (typeof masterVolume === "function") masterVolume(1.0);

  blipOsc = new p5.Oscillator("triangle");
  blipOsc.freq(440);
  blipOsc.amp(0);

  windNoise = new p5.Noise("pink");
  windNoise.amp(0);

  lp = new p5.LowPass();
  lp.freq(1400);
  lp.res(6);

  blipOsc.disconnect();
  windNoise.disconnect();

  blipOsc.connect(lp);
  windNoise.connect(lp);
  lp.connect();

  envBlip = new p5.Envelope();
  envBlip.setADSR(0.001, 0.06, 0.0, 0.06);
  envBlip.setRange(0.45, 0.0);

  envNoise = new p5.Envelope();
  envNoise.setADSR(0.001, 0.06, 0.0, 0.08);
  envNoise.setRange(0.28, 0.0);

  blipOsc.start();
  windNoise.start();

  audioArmed = true;
  initMusic();
}

function sfxBlip(freq, attack, release, amp) {
  if (!audioArmed || !envBlip || !blipOsc) return;
  blipOsc.freq(freq);
  envBlip.setADSR(attack, release, 0.0, 0.01);
  envBlip.setRange(amp, 0.0);
  envBlip.play(blipOsc);
}

function sfxNoise(freq, dur, amp) {
  if (!audioArmed || !envNoise || !windNoise || !lp) return;
  lp.freq(freq);
  envNoise.setADSR(0.001, dur, 0.0, 0.02);
  envNoise.setRange(amp, 0.0);
  envNoise.play(windNoise);
}

function sfxStep() { sfxNoise(520, 0.018, 0.10); }
function sfxProximity() { sfxBlip(720, 0.001, 0.04, 0.28); }
function sfxTap() { sfxBlip(220, 0.001, 0.05, 0.28); }
function sfxDenied() { sfxBlip(150, 0.001, 0.08, 0.36); sfxNoise(320, 0.06, 0.22); }
function sfxInteractHigh() { sfxBlip(880, 0.001, 0.06, 0.38); sfxNoise(1200, 0.08, 0.22); }
function sfxInteractMid() { sfxBlip(520, 0.001, 0.07, 0.36); sfxNoise(950, 0.08, 0.22); }
function sfxInteractLow() { sfxBlip(260, 0.001, 0.08, 0.34); sfxNoise(750, 0.10, 0.22); }
function sfxDoorRumble() { sfxNoise(180, 0.30, 0.30); sfxBlip(90, 0.001, 0.18, 0.30); }
function sfxFocusOpen() { sfxBlip(980, 0.001, 0.08, 0.28); sfxNoise(1400, 0.10, 0.18); }
function sfxFocusClose() { sfxBlip(360, 0.001, 0.08, 0.28); sfxNoise(700, 0.08, 0.18); }
function sfxZoomTick(zoomingOut) { sfxBlip(zoomingOut ? 300 : 520, 0.001, 0.04, 0.22); }

/* ==========================================================
   PROCEDURAL MUSIC (movement reactive)
========================================================== */
function initMusic() {
  if (!musicOn || !audioArmed) return;
  if (typeof p5 === "undefined" || typeof p5.Oscillator === "undefined") return;
  if (music.lead) return;

  music.filter = new p5.LowPass();
  music.filter.freq(1200);
  music.filter.res(3);

  music.reverb = new p5.Reverb();
  music.delay = new p5.Delay();

  music.lead = new p5.Oscillator("triangle");
  music.lead.amp(0);
  music.lead.start();

  music.bass = new p5.Oscillator("sine");
  music.bass.amp(0);
  music.bass.start();

  music.hat = new p5.Noise("white");
  music.hat.amp(0);
  music.hat.start();

  music.lead.disconnect();
  music.bass.disconnect();
  music.hat.disconnect();

  music.lead.connect(music.filter);
  music.bass.connect(music.filter);
  music.hat.connect(music.filter);

  music.delay.process(music.filter, 0.22, 0.42, 1800);
  music.reverb.process(music.filter, 3.5, 2.0);

  music.step = 0;
  music.lastStepAt = millis();
  updateMusicTiming();
}

function updateMusicTiming() {
  const bps = music.bpm / 60;
  music.stepMs = 1000 / (bps * 4);
}

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function scaleNote(rootMidi, degree) {
  const scale = [0, 2, 3, 5, 7, 8, 10]; // minor-ish
  const oct = Math.floor(degree / scale.length);
  const idx = degree % scale.length;
  return rootMidi + scale[idx] + oct * 12;
}

function playEnv(oscOrNoise, attack, decay, level) {
  const env = new p5.Envelope();
  env.setADSR(attack, decay, 0, 0.001);
  env.setRange(level, 0);
  env.play(oscOrNoise);
}

function musicAccent() {
  if (!musicOn || !audioArmed || !music.lead) return;
  const root = 57;
  const note = scaleNote(root, Math.floor(random(0, 10)));
  music.lead.freq(midiToFreq(note));
  playEnv(music.lead, 0.002, 0.08, 0.16);
}

function updateProceduralMusic() {
  if (!musicOn || !audioArmed || !music.lead) return;

  const moving =
    keyIsDown(LEFT_ARROW) || keyIsDown(RIGHT_ARROW) || keyIsDown(UP_ARROW) || keyIsDown(DOWN_ARROW) ||
    keyIsDown(65) || keyIsDown(68) || keyIsDown(87) || keyIsDown(83);

  const targetSpeed = moving ? 1.0 : 0.0;
  music.speedSmoothed = lerp(music.speedSmoothed, targetSpeed, 0.06);

  music.filter.freq(lerp(650, 2400, music.speedSmoothed));
  music.bpm = lerp(music.bpmBase, music.bpmBase + 18, music.speedSmoothed);
  updateMusicTiming();

  const focusAmt = (mode === "focus" || showFinalModal) ? 1 : 0;
  music.delay.feedback(lerp(0.34, 0.50, focusAmt));

  const now = millis();
  while (now - music.lastStepAt >= music.stepMs) {
    music.lastStepAt += music.stepMs;
    music.step = (music.step + 1) % 16;
    musicTick(music.step);
  }
}

function musicTick(step) {
  const root = 57 + (history.length % 3) * 2;

  const leadPattern = [0, -1, 3, -1, 5, -1, 3, -1, 7, -1, 5, -1, 3, -1, 2, -1];
  const deg = leadPattern[step];

  if (deg >= 0) {
    const note = scaleNote(root, deg);
    music.lead.freq(midiToFreq(note));
    const amp = lerp(0.10, 0.20, music.speedSmoothed);
    playEnv(music.lead, 0.004, 0.12, amp);
  }

  if (step % 4 === 0) {
    const bassNote = scaleNote(root - 12, 0);
    music.bass.freq(midiToFreq(bassNote));
    playEnv(music.bass, 0.002, 0.18, 0.22);
  }

  if (step % 2 === 1) {
    playEnv(music.hat, 0.001, 0.03, 0.10);
  }
}

/* ==========================================================
   HELPERS + SAFE UNIFORMS
========================================================== */
const TAU = 6.28318530718;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom(arr, randFn) {
  return arr[Math.floor(randFn() * arr.length)];
}

function idHash(id) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function safeUniform(shaderObj, name, value) {
  // Prevents hard crashes if uniform doesn't exist in shader
  try { shaderObj.setUniform(name, value); } catch (e) {}
}

function drawContain(g, img, x, y, w, h, zoom = 1.0, padScale = 0.90) {
  const availW = w * padScale;
  const availH = h * padScale;

  const ir = img.width / img.height;
  const rr = availW / availH;

  let dw, dh;
  if (ir > rr) { dw = availW; dh = availW / ir; }
  else { dh = availH; dw = availH * ir; }

  dw *= zoom;
  dh *= zoom;

  const dx = x + (w - dw) * 0.5;
  const dy = y + (h - dh) * 0.5;

  g.imageMode(CORNER);
  g.image(img, dx, dy, dw, dh);
}

function drawCover(g, img, x, y, w, h) {
  const ir = img.width / img.height;
  const rr = w / h;

  let dw, dh;
  if (ir > rr) { dh = h; dw = h * ir; }
  else { dw = w; dh = w / ir; }

  const dx = x + (w - dw) * 0.5;
  const dy = y + (h - dh) * 0.5;

  g.imageMode(CORNER);
  g.image(img, dx, dy, dw, dh);
}

/* ==========================================================
   NOTE: If your filter.frag expects different uniform names,
   it will still render base image (no crash), but without filter.
   Paste filter.frag if you want me to align it precisely.
========================================================== */
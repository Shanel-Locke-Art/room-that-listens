// Fractal Room (Responsive + Focus Popups + Focus Zoom + Screensaver Fractal + Procedural Poem + Final Modal + TTS)
// Focus images now use CONTAIN (fit inside) instead of COVER (fill/crop).

const BASE_W = 960;
const BASE_H = 540;

let promptEl, poemEl;

let CW = BASE_W;
let CH = BASE_H;
let S = 1.0;

let INTERACT_RADIUS = 46;

let room;
let player;
let stations = [];

let sprites = {};

let mandelShader, filterShader;
let fractalLayer;
let filteredLayer;
let imageLayer;

let mode = "room";        // "room" | "focus"
let focusId = null;
let focusImg = null;

let paused = false;
let ended = false;

// Final modal overlay
let showFinalModal = false;
let finalPoemText = "";

// Focus zoom
let focusZoom = 0.95;
let focusZoomTarget = 0.95;

// Sound
let audioArmed = false;
let humOsc, blipOsc, windNoise;
let envHum, envBlip, envNoise;
let lp;

let stepTimer = 0;
let lastNearId = null;

let fx = { amount: 0.65, fractMix: 0.90 };

// Fractal state
let fractal = {
  baseCenter: { x: -0.6, y: 0.0 },
  baseZoom: 2.2,
  baseWarp: 0.35,
  iters: 220,

  center: { x: -0.6, y: 0.0 },
  zoom: 2.2,
  warp: 0.35
};

let fractAnim = {
  zoomPulse: 0.14,
  driftAmp: 0.08,
  driftSpeed: 0.11,
  warpPulse: 0.12,
  growAmount: 0.85,
  paletteSpeed: 0.03
};

/* -------------------------
   PROCEDURAL POEM SYSTEM
   ------------------------- */

let runSeed = 0;

let history = [];
let poemLines = [];
let usedLines = new Set();

const POEM_MAX_LINES = 18;

const LINES = {
  lamp: [
    "Light arrives like a soft decision.",
    "The lamp teaches the dark to sit politely.",
    "Brightness agrees to exist for you.",
    "A warm halo pretends to be certainty.",
    "The room breathes brighter when you look away.",
    "Electric hush, small sun, controlled miracle.",
    "Your shadow gets edited at the edges.",
    "A filament remembers being fire."
  ],
  mirror: [
    "In the mirror, your name becomes a smaller sound.",
    "Your face is a sentence with missing punctuation.",
    "Something behind your eyes remembers tomorrow.",
    "Reflection: a rumor you cannot stop hearing.",
    "You look back and the room looks first.",
    "The mirror keeps a spare version of you.",
    "Glass makes honesty feel optional.",
    "A second self nods, late and familiar."
  ],
  desk: [
    "Dust lifts like a thought you almost kept.",
    "You find a comma of silence under your fingertip.",
    "The desk holds the weight of almosts.",
    "Paper ghosts wait for permission to exist.",
    "The grain of wood learns your patience.",
    "A drawer coughs up yesterday.",
    "There is a map made of scratches and pressure.",
    "Every surface is a diary if you listen."
  ],
  door: [
    "The door waits. It prefers you arrive with a little story first.",
    "A threshold pretends to be a wall.",
    "The knob is a tiny moon you can turn.",
    "Leaving is another kind of reading.",
    "The room holds its breath at the hinge.",
    "The door does not open. It negotiates."
  ]
};

const CONNECTORS = [
  "Meanwhile, the pattern keeps listening.",
  "And then the room rearranges itself again.",
  "Because you touched it, it becomes truer.",
  "Somewhere in the pixels, a thought repeats.",
  "The air changes its mind mid-sentence.",
  "You blink and the meaning moves.",
  "The silence adds a second layer.",
  "Nothing explains itself, but everything responds."
];

const GLITCH_LINES = [
  "The colors cycle like a memory you cannot close.",
  "A neon bruise spreads across the edges.",
  "The image blooms outward, as if trying to escape the frame.",
  "A ripple passes through the room, pretending to be a breeze.",
  "The pattern grows teeth, then laughs and becomes gentle again.",
  "The fractal swells like a screensaver from another century."
];

const ENDINGS = {
  light: [
    "You leave with a light that learns your pace.",
    "You carry brightness like borrowed weather.",
    "A small sun follows you without asking why."
  ],
  name: [
    "Your name follows, slightly rearranged.",
    "You exit as a different spelling of yourself.",
    "Something calls you softly from behind the glass."
  ],
  dust: [
    "Dust settles behind you like soft applause.",
    "The room closes its book of particles.",
    "Everything you touched remembers you for a moment."
  ],
  none: [
    "You leave anyway. The room keeps listening.",
    "You go. The pattern continues without needing you.",
    "You step out and the colors keep changing behind the door."
  ],
};

/* -------------------------
   TTS (Text-to-Speech)
   ------------------------- */

let ttsEnabled = ("speechSynthesis" in window);
let speaking = false;

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

/* -------------------------
   p5 preload/setup
   ------------------------- */

function preload() {
  mandelShader = loadShader("passthrough.vert", "mandelbrot.frag");
  filterShader = loadShader("passthrough.vert", "filter.frag");

  sprites.lamp = loadImage("assets/lamp.png");
  sprites.mirror = loadImage("assets/mirror.png");
  sprites.desk = loadImage("assets/desk.png");
  sprites.door = loadImage("assets/door.png");
}

function setup() {
  promptEl = document.getElementById("prompt");
  poemEl = document.getElementById("poem");

  computeCanvasSize();
  createCanvas(CW, CH);
  pixelDensity(1);
  imageMode(CORNER);

  createBuffers();
  setLayout();

  runSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;

  resetGame();
}

function draw() {
  // Better zoom bounds now that we "contain" by default
  focusZoomTarget = constrain(focusZoomTarget, 0.70, 3.20);
  focusZoom = lerp(focusZoom, focusZoomTarget, 0.12);

  const gameplayFrozen = showFinalModal || paused || ended;

  if (!gameplayFrozen && mode === "room") {
    updateMovement();
    updateFootsteps();
  } else {
    stepTimer = 0;
  }

  updateFractalAnimation();
  renderFractalLayer();

  if (mode === "room") drawRoomMode();
  else drawFocusMode();

  if (showFinalModal) drawFinalModal();

  updateUI();
}

/* -------------------------
   FRACTAL AUTO ANIMATION
   ------------------------- */

function updateFractalAnimation() {
  const t = millis() / 1000;

  const pulse = 1.0 + fractAnim.zoomPulse * sin(t * 0.85) * (0.65 + 0.35 * sin(t * 0.33));

  const driftScale = fractAnim.driftAmp / max(fractal.baseZoom, 0.001);
  const dx = driftScale * cos(t * fractAnim.driftSpeed);
  const dy = driftScale * sin(t * fractAnim.driftSpeed * 1.17);

  const wp = fractAnim.warpPulse * sin(t * 0.72);

  fractal.zoom = lerp(fractal.zoom, fractal.baseZoom * pulse, 0.06);
  fractal.center.x = lerp(fractal.center.x, fractal.baseCenter.x + dx, 0.06);
  fractal.center.y = lerp(fractal.center.y, fractal.baseCenter.y + dy, 0.06);
  fractal.warp = lerp(fractal.warp, clamp01(fractal.baseWarp + wp), 0.06);
}

/* -------------------------
   RESPONSIVE
   ------------------------- */

function computeCanvasSize() {
  const hudSpace = 170;
  const margin = 20;

  const maxW = max(320, windowWidth - margin * 2);
  const maxH = max(240, windowHeight - hudSpace - margin * 2);

  CW = floor(maxW);
  CH = floor(maxH);

  S = min(CW / BASE_W, CH / BASE_H);
  INTERACT_RADIUS = 46 * S;
}

function createBuffers() {
  fractalLayer = createGraphics(CW, CH, WEBGL);
  filteredLayer = createGraphics(CW, CH, WEBGL);
  fractalLayer.noStroke();
  filteredLayer.noStroke();

  imageLayer = createGraphics(CW, CH);
  imageLayer.pixelDensity(1);
}

function setLayout() {
  const padX = max(50 * S, CW * 0.06);
  const padY = max(50 * S, CH * 0.08);

  room = {
    x: padX,
    y: padY,
    w: CW - padX * 2,
    h: CH - padY * 2
  };

  player = {
    x: room.x + room.w * 0.50,
    y: room.y + room.h * 0.50,
    r: 10 * S,
    speed: 2.35 * S
  };

  stations = [
    makeStation("lamp",   room.x + room.w * 0.20, room.y + room.h * 0.25, "LAMP", lampAction),
    makeStation("mirror", room.x + room.w * 0.82, room.y + room.h * 0.25, "MIRROR", mirrorAction),
    makeStation("desk",   room.x + room.w * 0.25, room.y + room.h * 0.78, "DESK", deskAction),
    makeStation("door",   room.x + room.w * 0.90, room.y + room.h * 0.72, "DOOR", doorAction)
  ];

  clampPlayerToRoom();
}

function windowResized() {
  computeCanvasSize();
  resizeCanvas(CW, CH);
  createBuffers();
  setLayout();
}

/* -------------------------
   POEM GENERATION
   ------------------------- */

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

function pickUniqueLine(bucket, salt) {
  const rand = mulberry32((runSeed ^ (history.length * 1337) ^ salt) >>> 0);

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

function maybeAddConnector() {
  if (history.length < 2) return;
  const rand = mulberry32((runSeed ^ (history.length * 99991)) >>> 0);
  if (rand() < 0.55) pushPoemLine(pickUniqueLine(CONNECTORS, 777));
}

function maybeAddGlitch() {
  const rand = mulberry32((runSeed ^ (poemLines.length * 424242)) >>> 0);
  if (rand() < 0.30) pushPoemLine(pickUniqueLine(GLITCH_LINES, 31337));
}

function pushPoemLine(line) {
  poemLines.push(line);
  if (poemLines.length > POEM_MAX_LINES) poemLines.shift();
  rebuildPoemDisplay();
}

function rebuildPoemDisplay() {
  const rand = mulberry32(runSeed);
  const titleA = pickFrom(["A ROOM", "A PATTERN", "A SMALL LOOP", "A SOFT MACHINE"], rand);
  const titleB = pickFrom(["LISTENS", "SHIMMERS", "REPEATS", "FORGETS", "BREATHES"], rand);

  poemEl.textContent = [
    `${titleA} ${titleB}.`,
    "Touch objects. Let the order write you back.",
    "",
    ...poemLines
  ].join("\n");
}

function addInteractionPoetry(id) {
  history.push(id);
  maybeAddConnector();
  const bucket = LINES[id] || ["Something responds, quietly."];
  pushPoemLine(pickUniqueLine(bucket, idHash(id)));
  maybeAddGlitch();
}

function shuffleInPlace(arr, randFn) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildFinalPoemText() {
  const rand = mulberry32((runSeed ^ 0xABCDEF) >>> 0);

  const hasLight = history.includes("lamp");
  const hasName = history.includes("mirror");
  const hasDust = history.includes("desk");

  const a = hasLight ? pickFrom(ENDINGS.light, rand) : pickFrom(ENDINGS.none, rand);
  const b = hasName ? pickFrom(ENDINGS.name, rand) : pickFrom(ENDINGS.none, rand);
  const c = hasDust ? pickFrom(ENDINGS.dust, rand) : pickFrom(ENDINGS.none, rand);

  const stanza = [a, b, c];
  shuffleInPlace(stanza, rand);

  const baseText = poemEl.textContent || "";
  return [
    baseText,
    "",
    "FINAL:",
    ...stanza,
    "The door closes. The pattern keeps listening."
  ].join("\n");
}

/* -------------------------
   STATION ACTIONS
   ------------------------- */

function lampAction() {
  addInteractionPoetry("lamp");
  fractal.baseWarp = clamp01(fractal.baseWarp + 0.12);
  fx.amount = clamp01(fx.amount + 0.08);
  zoomNudge(1.12);
  sfxInteractHigh();
  enterFocus("lamp");
}

function mirrorAction() {
  addInteractionPoetry("mirror");
  fractal.baseCenter.x += random(-0.08, 0.08) / max(fractal.baseZoom, 0.001);
  fractal.baseCenter.y += random(-0.08, 0.08) / max(fractal.baseZoom, 0.001);
  fx.amount = clamp01(fx.amount + 0.08);
  zoomNudge(1.06);
  sfxInteractMid();
  enterFocus("mirror");
}

function deskAction() {
  addInteractionPoetry("desk");
  fractal.iters = Math.min(420, fractal.iters + 35);
  sfxInteractLow();
  zoomNudge(1.08);
  enterFocus("desk");
}

function doorAction() {
  addInteractionPoetry("door");
  if (history.length < 2) {
    sfxDenied();
    enterFocus("door");
    return;
  }
  sfxDoorRumble();
  enterFocus("door");
  ended = true;
  paused = true;
}

/* -------------------------
   RENDER MODES
   ------------------------- */

function drawRoomMode() {
  background(6, 7, 12);
  image(fractalLayer, room.x, room.y, room.w, room.h, 0, 0, CW, CH);
  drawRoomFrame();
  drawStations();
  drawPlayer();
}

function drawFocusMode() {
  background(6, 7, 12);

  imageLayer.clear();

  // IMPORTANT CHANGE: CONTAIN instead of COVER
  if (focusImg) {
    // fit to 88% of screen, then apply focusZoom
    drawContain(imageLayer, focusImg, 0, 0, CW, CH, focusZoom, 0.88);
  } else {
    imageLayer.background(12);
  }

  filteredLayer.shader(filterShader);
  filterShader.setUniform("u_tex0", imageLayer);
  filterShader.setUniform("u_tex1", fractalLayer);
  filterShader.setUniform("u_resolution", [CW, CH]);
  filterShader.setUniform("u_time", millis() / 1000.0);
  filterShader.setUniform("u_amount", fx.amount);
  filterShader.setUniform("u_fractMix", fx.fractMix);
  filteredLayer.rect(-CW / 2, -CH / 2, CW, CH);

  image(filteredLayer, room.x, room.y, room.w, room.h, 0, 0, CW, CH);
  drawRoomFrame();

  noStroke();
  fill(255, 255, 255, 160);
  textAlign(LEFT, TOP);
  textSize(14 * S);
  text(`Viewing: ${focusId ? focusId.toUpperCase() : "OBJECT"}`, room.x + 14 * S, room.y + 12 * S);
}

function renderFractalLayer() {
  const lampUV = [stations[0].x / CW, stations[0].y / CH];
  const mirrUV = [stations[1].x / CW, stations[1].y / CH];
  const deskUV = [stations[2].x / CW, stations[2].y / CH];
  const doorUV = [stations[3].x / CW, stations[3].y / CH];

  const sLamp = history.includes("lamp") ? 1.0 : 0.35;
  const sMirr = history.includes("mirror") ? 1.0 : 0.35;
  const sDesk = history.includes("desk") ? 1.0 : 0.35;
  const sDoor = history.length >= 2 ? 1.0 : 0.35;

  const t = millis() / 1000;
  const palettePhase = (t * fractAnim.paletteSpeed) % 1.0;

  mandelShader.setUniform("u_resolution", [CW, CH]);
  mandelShader.setUniform("u_time", t);
  mandelShader.setUniform("u_center", [fractal.center.x, fractal.center.y]);
  mandelShader.setUniform("u_zoom", fractal.zoom);
  mandelShader.setUniform("u_iter", fractal.iters);
  mandelShader.setUniform("u_warp", fractal.warp);

  mandelShader.setUniform("u_grow", fractAnim.growAmount);
  mandelShader.setUniform("u_palette", palettePhase);

  mandelShader.setUniform("u_obj1", lampUV);
  mandelShader.setUniform("u_obj2", mirrUV);
  mandelShader.setUniform("u_obj3", deskUV);
  mandelShader.setUniform("u_obj4", doorUV);
  mandelShader.setUniform("u_objStrength", [sLamp, sMirr, sDesk, sDoor]);

  fractalLayer.shader(mandelShader);
  fractalLayer.rect(-CW / 2, -CH / 2, CW, CH);
}

/* -------------------------
   ROOM DECOR
   ------------------------- */

function drawRoomFrame() {
  noFill();
  stroke(255, 255, 255, 70);
  strokeWeight(max(1.5 * S, 2));
  rect(room.x, room.y, room.w, room.h, 18 * S);

  stroke(255, 255, 255, 18);
  strokeWeight(max(1, 1 * S));
  const step = max(22 * S, 26 * S);
  for (let y = room.y + 24 * S; y < room.y + room.h; y += step) {
    line(room.x + 14 * S, y, room.x + room.w - 14 * S, y);
  }
}

function drawStations() {
  const near = nearestStation();

  for (const s of stations) {
    const active = near.s && near.s.id === s.id && near.d <= INTERACT_RADIUS;

    stroke(active ? color(255, 215, 161, 220) : color(255, 255, 255, 100));
    strokeWeight(max(1.5 * S, 2));
    fill(active ? color(255, 215, 161, 60) : color(255, 255, 255, 20));

    const plate = 56 * S;
    rect(s.x - plate / 2, s.y - plate / 2, plate, plate, 12 * S);

    const img = sprites[s.id];
    if (img) {
      push();
      imageMode(CENTER);
      if (active) tint(255, 245); else tint(255, 215);
      const pulse = active ? (1.0 + 0.06 * sin(frameCount * 0.18)) : 1.0;
      const size = 46 * S * pulse;
      image(img, s.x, s.y, size, size);
      noTint();
      pop();
    }

    noStroke();
    fill(active ? color(255, 215, 161, 240) : color(255, 255, 255, 170));
    textAlign(CENTER, CENTER);
    textSize(12 * S);
    text(s.label, s.x, s.y + 48 * S);
  }
}

function drawPlayer() {
  noStroke();
  fill(245, 246, 255, 245);
  circle(player.x, player.y, player.r * 2);

  stroke(154, 215, 255, 120);
  strokeWeight(6 * S);
  noFill();
  circle(player.x, player.y, player.r * 2 + 14 * S);
}

/* -------------------------
   FINAL MODAL OVERLAY
   ------------------------- */

function drawFinalModal() {
  push();

  noStroke();
  fill(0, 0, 0, 180);
  rect(0, 0, CW, CH);

  const panelW = min(CW * 0.78, 760 * S + 200);
  const panelH = min(CH * 0.78, 520 * S + 160);
  const px = (CW - panelW) * 0.5;
  const py = (CH - panelH) * 0.5;

  fill(12, 14, 25, 235);
  stroke(255, 255, 255, 60);
  strokeWeight(max(1.0, 1.5 * S));
  rect(px, py, panelW, panelH, 18 * S);

  noStroke();
  fill(255, 255, 255, 235);
  textAlign(LEFT, TOP);

  const pad = 18 * S;
  const tx = px + pad;
  const ty = py + pad;

  textSize(18 * S);
  text("FINAL POEM", tx, ty);

  textSize(12 * S);
  fill(255, 255, 255, 170);
  const hint = ttsEnabled
    ? "Space: Speak/Stop  |  Esc: Close  |  R: Restart"
    : "Esc: Close  |  R: Restart   (Text-to-speech not supported in this browser)";
  text(hint, tx, ty + 26 * S);

  fill(255, 255, 255, 230);
  textSize(14 * S);
  const bodyY = ty + 54 * S;
  text(finalPoemText, tx, bodyY, panelW - pad * 2, panelH - (bodyY - py) - pad);

  pop();
}

/* -------------------------
   INPUT / UI
   ------------------------- */

function updateMovement() {
  const left = keyIsDown(LEFT_ARROW) || keyIsDown(65);
  const right = keyIsDown(RIGHT_ARROW) || keyIsDown(68);
  const up = keyIsDown(UP_ARROW) || keyIsDown(87);
  const down = keyIsDown(DOWN_ARROW) || keyIsDown(83);

  let vx = (right ? 1 : 0) - (left ? 1 : 0);
  let vy = (down ? 1 : 0) - (up ? 1 : 0);

  const mag = Math.hypot(vx, vy) || 1;
  vx = (vx / mag) * player.speed;
  vy = (vy / mag) * player.speed;

  player.x += vx;
  player.y += vy;

  fractal.baseCenter.x += vx * 0.00055 / max(fractal.baseZoom, 0.001);
  fractal.baseCenter.y += vy * 0.00055 / max(fractal.baseZoom, 0.001);

  clampPlayerToRoom();
}

function clampPlayerToRoom() {
  player.x = constrain(player.x, room.x + player.r, room.x + room.w - player.r);
  player.y = constrain(player.y, room.y + player.r, room.y + room.h - player.r);
}

function updateFootsteps() {
  const moving =
    keyIsDown(LEFT_ARROW) || keyIsDown(RIGHT_ARROW) || keyIsDown(UP_ARROW) || keyIsDown(DOWN_ARROW) ||
    keyIsDown(65) || keyIsDown(68) || keyIsDown(87) || keyIsDown(83);

  if (!moving) { stepTimer = 0; return; }

  stepTimer += 1;
  const cadence = max(10, floor(18 / max(S, 0.6)));
  if (stepTimer >= cadence) {
    stepTimer = 0;
    sfxStep();
  }
}

function updateUI() {
  if (showFinalModal) {
    setPrompt("Final poem shown. Space to speak, Esc to close, R to restart.");
    return;
  }

  if (mode === "focus") {
    setPrompt("Focus mode: Mouse wheel to zoom. Press E or Esc to close. R to restart.");
    return;
  }
  if (ended) {
    setPrompt("Door remembers you. Press E to complete the poem, or R to restart.");
    return;
  }
  if (paused) {
    setPrompt("Paused. Press Esc to return. Press R to restart.");
    return;
  }

  const near = nearestStation();
  const inRange = near.s && near.d <= INTERACT_RADIUS;
  const id = inRange ? near.s.id : null;

  if (id && id !== lastNearId) sfxProximity();
  lastNearId = id;

  if (inRange) setPrompt(`Press E to interact with the ${near.s.label}.`);
  else setPrompt("Move through the room. Look for an object that feels like a word.");
}

function keyPressed() {
  armAudioIfNeeded();

  // Final modal controls
  if (showFinalModal) {
    if (keyCode === 32) { // Space
      if (ttsEnabled) {
        if (speaking) stopTTS();
        else speakText(finalPoemText);
      }
      return false;
    }
    if (keyCode === ESCAPE) {
      stopTTS();
      showFinalModal = false;
      return false;
    }
    if (key === "r" || key === "R") {
      stopTTS();
      runSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
      resetGame();
      return false;
    }
  }

  if (keyCode === ESCAPE) {
    if (mode === "focus") {
      exitFocus();
    } else if (!ended) {
      paused = !paused;
    }
    return false;
  }

  if (key === "r" || key === "R") {
    stopTTS();
    runSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    resetGame();
    return false;
  }

  if (key === "e" || key === "E") {
    if (mode === "focus") {
      if (focusId === "door" && history.length >= 2 && ended) {
        finalPoemText = buildFinalPoemText();
        showFinalModal = true;
        paused = true;
        exitFocus();
        return false;
      }

      exitFocus();
      return false;
    }

    if (!paused && !ended) {
      const near = nearestStation();
      if (near.s && near.d <= INTERACT_RADIUS) near.s.fn();
      else sfxTap();
      return false;
    }
  }

  return false;
}

function mousePressed() {
  armAudioIfNeeded();
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

/* -------------------------
   GAME FLOW
   ------------------------- */

function resetGame() {
  paused = false;
  ended = false;
  showFinalModal = false;
  finalPoemText = "";

  mode = "room";
  focusId = null;
  focusImg = null;

  // Start slightly zoomed-out so images don't feel huge
  focusZoom = 0.95;
  focusZoomTarget = 0.95;

  stepTimer = 0;
  lastNearId = null;

  player.x = room.x + room.w * 0.50;
  player.y = room.y + room.h * 0.50;

  history = [];
  poemLines = [];
  usedLines = new Set();

  fractal.baseCenter.x = -0.6;
  fractal.baseCenter.y = 0.0;
  fractal.baseZoom = 2.2;
  fractal.baseWarp = 0.35;
  fractal.iters = 220;

  fractal.center.x = fractal.baseCenter.x;
  fractal.center.y = fractal.baseCenter.y;
  fractal.zoom = fractal.baseZoom;
  fractal.warp = fractal.baseWarp;

  fx.amount = 0.65;
  fx.fractMix = 0.90;

  rebuildPoemDisplay();
  setPrompt("Click once if keys do not respond. Sound starts on first input.");
}

/* -------------------------
   HELPERS
   ------------------------- */

function makeStation(id, x, y, label, fn) {
  return { id, x, y, label, fn };
}

function nearestStation() {
  let best = null;
  let bestD = 1e9;
  for (const s of stations) {
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return { s: best, d: bestD };
}

function zoomNudge(mult) {
  fractal.baseZoom = constrain(fractal.baseZoom * mult, 0.6, 18.0);
}

function setPrompt(t) { promptEl.textContent = t || ""; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * CONTAIN: Fit image entirely inside the box (no cropping).
 * padScale (0..1) gives breathing room. e.g. 0.88 = fit into 88% of the area.
 */
function drawContain(g, img, x, y, w, h, zoom = 1.0, padScale = 0.90) {
  const availW = w * padScale;
  const availH = h * padScale;

  const ir = img.width / img.height;
  const rr = availW / availH;

  let dw, dh;
  if (ir > rr) {
    dw = availW;
    dh = availW / ir;
  } else {
    dh = availH;
    dw = availH * ir;
  }

  dw *= zoom;
  dh *= zoom;

  const dx = x + (w - dw) * 0.5;
  const dy = y + (h - dh) * 0.5;

  g.imageMode(CORNER);
  g.image(img, dx, dy, dw, dh);
}

/* -------------------------
   FOCUS
   ------------------------- */

function enterFocus(id) {
  mode = "focus";
  focusId = id;
  focusImg = sprites[id] || null;

  // Start calm, not huge
  focusZoom = 0.95;
  focusZoomTarget = 0.95;

  sfxFocusOpen();
}

function exitFocus() {
  mode = "room";
  focusId = null;
  focusImg = null;

  focusZoom = 0.95;
  focusZoomTarget = 0.95;

  sfxFocusClose();
}

/* -------------------------
   FRACTAL SHADER LAYER
   ------------------------- */

function renderFractalLayer() {
  // Ensure stations exist before first draw
  if (!stations || stations.length < 4) return;

  const lampUV = [stations[0].x / CW, stations[0].y / CH];
  const mirrUV = [stations[1].x / CW, stations[1].y / CH];
  const deskUV = [stations[2].x / CW, stations[2].y / CH];
  const doorUV = [stations[3].x / CW, stations[3].y / CH];

  const sLamp = history.includes("lamp") ? 1.0 : 0.35;
  const sMirr = history.includes("mirror") ? 1.0 : 0.35;
  const sDesk = history.includes("desk") ? 1.0 : 0.35;
  const sDoor = history.length >= 2 ? 1.0 : 0.35;

  const t = millis() / 1000;
  const palettePhase = (t * fractAnim.paletteSpeed) % 1.0;

  mandelShader.setUniform("u_resolution", [CW, CH]);
  mandelShader.setUniform("u_time", t);
  mandelShader.setUniform("u_center", [fractal.center.x, fractal.center.y]);
  mandelShader.setUniform("u_zoom", fractal.zoom);
  mandelShader.setUniform("u_iter", fractal.iters);
  mandelShader.setUniform("u_warp", fractal.warp);

  mandelShader.setUniform("u_grow", fractAnim.growAmount);
  mandelShader.setUniform("u_palette", palettePhase);

  mandelShader.setUniform("u_obj1", lampUV);
  mandelShader.setUniform("u_obj2", mirrUV);
  mandelShader.setUniform("u_obj3", deskUV);
  mandelShader.setUniform("u_obj4", doorUV);
  mandelShader.setUniform("u_objStrength", [sLamp, sMirr, sDesk, sDoor]);

  fractalLayer.shader(mandelShader);
  fractalLayer.rect(-CW / 2, -CH / 2, CW, CH);
}

/* -------------------------
   SOUND
   ------------------------- */

function armAudioIfNeeded() {
  if (audioArmed) return;

  userStartAudio();

  humOsc = new p5.Oscillator("sine");
  humOsc.freq(55);
  humOsc.amp(0);

  blipOsc = new p5.Oscillator("triangle");
  blipOsc.freq(440);
  blipOsc.amp(0);

  windNoise = new p5.Noise("pink");
  windNoise.amp(0);

  lp = new p5.LowPass();
  lp.freq(900);
  lp.res(6);

  humOsc.disconnect();
  blipOsc.disconnect();
  windNoise.disconnect();

  humOsc.connect(lp);
  blipOsc.connect(lp);
  windNoise.connect(lp);
  lp.connect();

  envHum = new p5.Envelope();
  envHum.setADSR(0.6, 0.6, 0.25, 1.2);
  envHum.setRange(0.08, 0.0);

  envBlip = new p5.Envelope();
  envBlip.setADSR(0.001, 0.06, 0.0, 0.06);
  envBlip.setRange(0.18, 0.0);

  envNoise = new p5.Envelope();
  envNoise.setADSR(0.001, 0.06, 0.0, 0.08);
  envNoise.setRange(0.10, 0.0);

  humOsc.start();
  blipOsc.start();
  windNoise.start();

  envHum.play(humOsc);

  audioArmed = true;
}

function sfxBlip(freq, attack, release, amp) {
  if (!audioArmed) return;
  blipOsc.freq(freq);
  envBlip.setADSR(attack, release, 0.0, 0.01);
  envBlip.setRange(amp, 0.0);
  envBlip.play(blipOsc);
}

function sfxNoise(freq, dur, amp) {
  if (!audioArmed) return;
  lp.freq(freq);
  envNoise.setADSR(0.001, dur, 0.0, 0.02);
  envNoise.setRange(amp, 0.0);
  envNoise.play(windNoise);
}

function sfxStep() { sfxNoise(520, 0.018, 0.030); }
function sfxProximity() { sfxBlip(720, 0.001, 0.04, 0.08); }
function sfxTap() { sfxBlip(220, 0.001, 0.05, 0.08); }
function sfxDenied() { sfxBlip(150, 0.001, 0.08, 0.12); sfxNoise(320, 0.06, 0.05); }
function sfxInteractHigh() { sfxBlip(880, 0.001, 0.06, 0.16); sfxNoise(1200, 0.08, 0.06); }
function sfxInteractMid() { sfxBlip(520, 0.001, 0.07, 0.16); sfxNoise(950, 0.08, 0.06); }
function sfxInteractLow() { sfxBlip(260, 0.001, 0.08, 0.16); sfxNoise(750, 0.10, 0.06); }
function sfxDoorRumble() { sfxNoise(180, 0.30, 0.10); sfxBlip(90, 0.001, 0.18, 0.12); }
function sfxFocusOpen() { sfxBlip(980, 0.001, 0.08, 0.10); sfxNoise(1400, 0.10, 0.05); }
function sfxFocusClose() { sfxBlip(360, 0.001, 0.08, 0.10); sfxNoise(700, 0.08, 0.05); }
function sfxZoomTick(zoomingOut) { sfxBlip(zoomingOut ? 300 : 520, 0.001, 0.04, 0.06); }

/* -------------------------
   NOTE:
   This sketch assumes your filter.frag + mandelbrot.frag are set up as previously.
   mandelbrot.frag must include uniforms u_grow and u_palette.
   ------------------------- */
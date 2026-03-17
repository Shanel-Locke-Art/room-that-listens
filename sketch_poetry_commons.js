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

/* =========================
   DOM UI
========================= */
let promptEl = null;
let poemEl = null;
let finalModalEl = null;
let finalTitleEl = null;
let finalBodyEl = null;
let leaderboardStatusEl = null;
let leaderboardListEl = null;
let poetNameInputEl = null;
let sharePoemBtnEl = null;
let refreshBoardBtnEl = null;
let actPoemModalEl = null;
let actPoemTitleEl = null;
let actPoemBodyEl = null;
let controlsContentEl = null;

/* =========================
   WORLD / CAMERA / PLAYER
========================= */
let world = { w: 2800, h: 1900, pad: 180 };
let camera = { x: 0, y: 0 };
let player = { x: 0, y: 0, r: 10, speed: 2.6, vx: 0, vy: 0, speed01: 0, energy: 0 };

// Touch movement (mobile): a simple virtual joystick bound to the first touch
let touchMove = {
  active: false,
  id: null,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0
};

// Canvas-space joystick tuning
const TOUCH_DEADZONE = 8;   // px
const TOUCH_MAX_R = 72;     // px

let INTERACT_RADIUS = 86;
let REVEAL_RADIUS_MULT = 2.8;
let EXTRA_HIDDEN = 10;

// Extra non-hidden room items (flavor objects)
let EXTRA_DECOR = 20;

// Additional room items. Keep ids stable so their sprite + poetry buckets remain consistent.
const DECOR_IDS = [
  "mug",
  "paperclip",
  "tape",
  "coin",
  "feather",
  "chalk",
  "glove",
  "radio",
  "plant",
  "candle",
  "ribbon",
  "marble",
  "button",
  "shell",
  "clock",
  "lens",
  "needle",
  "map",
  "stone",
  "key"
];

/* =========================
   STATIONS (objects)
========================= */
const CORE_IDS = ["lamp", "mirror", "desk", "door"];
const SIG_TYPES = ["KEY","EYE","KNOT","SPARK","WAVE","MASK"];
let stations = [];

/* =========================
   MODES
========================= */
let mode = "boot";         // boot | menu | world | focus | credits
let paused = false;
let showFinalModal = false;

let focusId = null;
let focusImg = null;
let focusZoom = 1.35;
let focusZoomTarget = 1.35;

/* =========================
   MENU / LORE
========================= */
const MENU_OPTIONS = [
  "BEGIN WRITING",
  "POETRY COMMONS",
  "CREDITS"
];

let menuIndex = 0;
let bootStartedAt = 0;
let bootDurationMs = 3200;
let menuLoreIndex = 0;
let menuLoreChangedAt = 0;
let menuLoreEveryMs = 3600;
let entryPromptVisible = false;

const MENU_LORE = [
  "The system does not generate poems. It remembers what you notice.",
  "A room is a container. A poem is what leaks out.",
  "You are not the author. You are the interruption.",
  "The machine cannot begin until you choose to be seen.",
  "Every object is a language waiting for a witness.",
  "The room is small. The consequences are not."
];

const BOOT_LINES = [
  "INITIALIZING OBSERVER...",
  "CALIBRATING ROOM TONE...",
  "UNSEALING COMMONS MEMORY...",
  "CHECKING FOR A HUMAN INTERRUPTION..."
];

/* =========================
   ACTS
========================= */
let act = 1;                // 1 = The Room, 2 = The Machine Notices You
let actBannerFrames = 0;    // overlay countdown frames

// Act 2 objective tracking
let act2SigCollected = 0;
let act2Calibrated = false;
let act2Seq = []; // last few calibration interactions
let act2TargetSeq = [];
let act2Progress = 0;

// Act 3 revision tracking
let act3TargetIds = [];
let act3Touched = new Set();

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
  ],

  mug: [
    "Warmth lingers where hands once argued with cold.",
    "Ceramic holds a small weather inside.",
    "A rim remembers a pause."
  ],
  paperclip: [
    "A tiny loop refusing to let go.",
    "Metal binds what the mind keeps scattering.",
    "Order, in miniature."
  ],
  tape: [
    "Adhesive makes a promise it cannot explain.",
    "Two edges agree to pretend they were one.",
    "Silence sealed, imperfectly."
  ],
  coin: [
    "Value is a shine the dark agrees on.",
    "A small moon you can lose in a pocket.",
    "Luck clicks against your choices."
  ],
  feather: [
    "Air wrote this with a lighter hand.",
    "A quiet proof that falling can be soft.",
    "It points to a bird that already left."
  ],
  chalk: [
    "White dust becomes instruction.",
    "A line appears, and then becomes a smudge.",
    "Teaching is temporary handwriting."
  ],
  glove: [
    "Fabric for hands that do not want to touch.",
    "Protection shaped like a second skin.",
    "Inside, warmth waits."
  ],
  radio: [
    "Static is a crowd you cannot see.",
    "A voice arrives broken into sparkles.",
    "The room tunes itself."
  ],
  plant: [
    "Green insists on continuing.",
    "Leaves practice patience in small rehearsals.",
    "A stem learns the angle of hope."
  ],
  candle: [
    "Flame is a thought with a body.",
    "Wax keeps time by surrendering.",
    "Light makes shadows honest."
  ],
  ribbon: [
    "A soft line tying nothing to nothing.",
    "It remembers being a gift.",
    "Color that refuses to be useful."
  ],
  marble: [
    "A planet small enough to misplace.",
    "Glass holds a trapped storm of color.",
    "It rolls toward whatever you avoid."
  ],
  button: [
    "A circle that once closed a person.",
    "Thread made a quiet commitment here.",
    "Utility pretending to be decoration."
  ],
  shell: [
    "The ocean left a spiral voicemail.",
    "Hollow rooms can still sing.",
    "Salt memory, dry and bright."
  ],
  clock: [
    "Time walks in tight circles.",
    "The second hand pretends urgency.",
    "The room measures you back."
  ],
  lens: [
    "Focus is a decision you make with your eyes.",
    "Glass bends the world into confession.",
    "Closer is not always clearer."
  ],
  needle: [
    "A sharp answer looking for thread.",
    "Precision is a kind of courage.",
    "It points at what you tried to ignore."
  ],
  map: [
    "A promise that space can be understood.",
    "Paper invents a gentler distance.",
    "You are here, and still not found."
  ],
  stone: [
    "Weight that does not apologize.",
    "A pocket-sized piece of forever.",
    "Stillness with edges."
  ],
  key: [
    "Metal learns the shape of permission.",
    "A lock imagines surrender.",
    "Teeth remember a door."
  ],

};

const ITEM_POEM_LINES = new Set(
  Object.entries(LINES)
    .filter(([key]) => key !== "door" && key !== "hidden")
    .flatMap(([, arr]) => arr)
    .map(line => String(line).trim())
);

function isItemPoemLine(line) {
  return ITEM_POEM_LINES.has(String(line || "").trim());
}

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
let finalPoemTitle = "";
let finalPoemText = "";
let poemLog = [];
let actPoems = { 1: [], 2: [], 3: [] };

// NEW: between-act poem popup
let showActPoemModal = false;
let actPoemTitle = "";
let actPoemText = "";

const LEADERBOARD_CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfycbw9M02gUSnCAQOs2uAT87LSzqGR23vAlbamKKwzMBV9kp-mUnVwoayz5IHJLqiHv8mx5A/exec",
  maxEntries: 20,
  maxPoemChars: 900
};

let leaderboardEntries = [];
let leaderboardBusy = false;
let finalSpeechAutoplay = true;
let finalSpeechFinished = false;

function resetActPoems() {
  actPoems = { 1: [], 2: [], 3: [] };
}

function pushActPoemLine(line, actNumber = act) {
  const s = String(line || "").trim();
  if (!s.length) return;
  if (!actPoems[actNumber]) actPoems[actNumber] = [];
  if (!actPoems[actNumber].includes(s)) actPoems[actNumber].push(s);
}

function cleanActLines(lines) {
  return [...new Set((lines || [])
    .map(l => String(l || "").trim())
    .filter(t => t.length > 0)
    .filter(isItemPoemLine))];
}

function buildActPoemSnapshot() {
  const stanza1 = cleanActLines(actPoems[1]).join("\n");
  const stanza2 = cleanActLines(actPoems[2]).join("\n");
  const stanza3 = cleanActLines(actPoems[3]).join("\n");

  if (act === 2) {
    return stanza1;
  }

  if (act === 3) {
    return [stanza1, stanza2].filter(Boolean).join("\n\n");
  }

  return [stanza1, stanza2, stanza3].filter(Boolean).join("\n\n");
}

function openActPoemModal(title, text) {
  actPoemTitle = title;
  actPoemText = text;
  showActPoemModal = true;
  paused = true;

  if (actPoemTitleEl) {
    actPoemTitleEl.textContent = actPoemTitle;
  }

  if (actPoemBodyEl) {
    actPoemBodyEl.innerText = actPoemText;
    actPoemBodyEl.scrollTop = 0;
  }

  if (actPoemModalEl) {
    actPoemModalEl.classList.add("is-open");
    actPoemModalEl.setAttribute("aria-hidden", "false");
  }
}

  function sfxPageTurn() {
    if (!audioArmed) return;

    // soft paper-like flick + tiny tail
    sfxBlip(740, 0.001, 0.03, 0.06);
    setTimeout(() => sfxBlip(520, 0.001, 0.025, 0.05), 22);
    setTimeout(() => sfxBlip(320, 0.001, 0.035, 0.04), 48);
  }

  function closeActPoemModal() {
    sfxPageTurn();

    showActPoemModal = false;
    paused = false;

    if (actPoemModalEl) {
      actPoemModalEl.classList.remove("is-open");
      actPoemModalEl.setAttribute("aria-hidden", "true");
    }

    if (cnv && cnv.elt) cnv.elt.focus();
  }

/* =========================
   HIDDEN FOCUS CACHE
========================= */
let hiddenFocusCache = new Map();

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
   TEXT TO SPEECH
========================= */

let ttsEnabled = true;
let speaking = false;
let currentUtterance = null;

function speakText(text) {
  if (!ttsEnabled || !window.speechSynthesis) return;

  stopTTS();

  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.rate = 0.95;
  currentUtterance.pitch = 1;
  currentUtterance.volume = 1;

  currentUtterance.onend = () => {
    speaking = false;
    currentUtterance = null;

    if (showFinalModal) {
      finalSpeechFinished = true;
      setPoetryCommonsEnabled(true);

      if (leaderboardStatusEl) {
        leaderboardStatusEl.textContent = "Poetry Commons is live.";
      }

      if (poetNameInputEl) {
        setTimeout(() => poetNameInputEl.focus(), 0);
      }
    }
  };

  speaking = true;
  speechSynthesis.speak(currentUtterance);
}

function stopTTS() {
  if (!window.speechSynthesis) return;

  speechSynthesis.cancel();
  speaking = false;
  currentUtterance = null;

  if (showFinalModal) {
    finalSpeechFinished = true;
    setPoetryCommonsEnabled(true);

    if (leaderboardStatusEl) {
      leaderboardStatusEl.textContent = "Poetry Commons is live.";
    }

    setTimeout(() => {
      if (finalPoemTitle === "POETRY COMMONS") {
        if (cnv && cnv.elt) cnv.elt.focus();
      } else if (poetNameInputEl && poetNameInputEl.style.display !== "none" && !poetNameInputEl.disabled) {
        poetNameInputEl.focus();
      } else if (cnv && cnv.elt) {
        cnv.elt.focus();
      }
    }, 0);
  }
}

function toggleFinalSpeech() {
  if (speaking) {
    stopTTS();
    return;
  }

  const titleEl = document.getElementById("final-title");
  const bodyEl = document.getElementById("final-body");

  if (!bodyEl) return;

  let title = titleEl ? titleEl.textContent : "";
  let body = bodyEl.textContent;

  body = body.replace(/\s+\./g, ".");
  body = body.replace(/\s+,/g, ",");
  body = body.replace(/\n+/g, "... ");
  body = body.replace(/\.{4,}/g, "...");

  const text = (title + ". " + body).trim();

  if (text.length > 0) {
    finalSpeechFinished = false;
    setPoetryCommonsEnabled(false);
    speakText(text);
  }
}

function speakPoetryCommons() {
  if (speaking) {
    stopTTS();
    return;
  }

  const entries = Array.from(document.querySelectorAll("#leaderboard-list .leaderboard-entry"));

  if (!entries.length) {
    speakText("Poetry Commons is empty right now.");
    return;
  }

  const text = entries
    .slice(0, 8)
    .map((entryEl, index) => {
      const title = (entryEl.querySelector(".leaderboard-poem-title")?.textContent || "Untitled Poem").trim();
      const name = (entryEl.querySelector(".leaderboard-name")?.textContent || "anonymous observer").trim();
      const body = (entryEl.querySelector(".leaderboard-poem-text")?.textContent || "")
        .trim()
        .replace(/\s+\./g, ".")
        .replace(/\s+,/g, ",")
        .replace(/\n+/g, "... ")
        .replace(/\.{4,}/g, "...");

      return `Poem ${index + 1}. ${title}. By ${name}. ${body}`;
    })
    .join(" ... ");

  if (text.length > 0) {
    speakText(text);
  }
}

let creditsIndex = 0;
let creditsCharIndex = 0;
let creditsTimer = 0;

let creditsLines = [
  "This system was trained on noticing.",
  "",
  "Primary Observer: L0g1cF@11acy",
  "Secondary Observer: The Machine",
  "",
  "Built using p5.js",
  "An open source library for creative coding",
  "",
  "You are the author.",
  "The computer assists.",
  "",
  "All poems are co-authored.",
  "No poem is owned.",
  "",
  "Some patterns were found.",
  "Some were made.",
  "",
  "You were here."
];

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
  finalModalEl = document.getElementById("final-modal");
  finalTitleEl = document.getElementById("final-title");
  finalBodyEl = document.getElementById("final-body");
  leaderboardStatusEl = document.getElementById("leaderboard-status");
  leaderboardListEl = document.getElementById("leaderboard-list");
  poetNameInputEl = document.getElementById("poet-name");
  sharePoemBtnEl = document.getElementById("share-poem-btn");
  refreshBoardBtnEl = document.getElementById("refresh-board-btn");
  actPoemModalEl = document.getElementById("act-poem-modal");
  actPoemTitleEl = document.getElementById("act-poem-title");
  actPoemBodyEl = document.getElementById("act-poem-body");
  controlsContentEl = document.getElementById("controls-content");

  bindLeaderboardUI();
  hydratePoetName();
  renderLeaderboard();

  computeCanvasSize();

  cnv = createCanvas(CW, CH);
  const frame = document.getElementById("game-frame");
  if (frame) cnv.parent(frame);

  pixelDensity(window.devicePixelRatio || 1);
  noSmooth();

    // Make canvas focusable
    cnv.elt.setAttribute("tabindex", "0");
    cnv.elt.style.outline = "none";
    cnv.elt.focus();

    textFont("VT323");

  // ESC closes modal even if focus shifts
  window.addEventListener("keydown", (e) => {
    if (!showFinalModal) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeFinalModal(finalPoemTitle === "POETRY COMMONS");
      return;
    }

    if ((e.key === " " || e.code === "Space") && finalPoemTitle === "POETRY COMMONS") {
      e.preventDefault();
      e.stopPropagation();
      speakPoetryCommons();
      return;
    }
  });

  createBuffersAndShaders();

  runSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  bootStartedAt = millis();
  menuLoreChangedAt = millis();
  resetRun(true);
}

function windowResized() {
  computeCanvasSize();
  resizeCanvas(CW, CH);
  createBuffersAndShaders();
}

/* ==========================================================
   CANVAS SIZE
========================================================== */
function computeCanvasSize() {
  const frame = document.getElementById("game-frame");

  let w = Math.max(320, window.innerWidth - 40);
  let h = Math.max(240, window.innerHeight - 220);

  if (frame) {
    const cs = getComputedStyle(frame);

    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

    const borderX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);

    // clientWidth/Height are more reliable for “available interior space”
    w = Math.max(320, Math.floor(frame.clientWidth - padX));
    h = Math.max(240, Math.floor(frame.clientHeight - padY));

    // If borders are included in clientWidth in some browsers/layouts, this keeps us safe:
    w = Math.max(320, w - Math.floor(borderX));
    h = Math.max(240, h - Math.floor(borderY));
  }

  CW = w;
  CH = h;

  S = Math.min(CW / BASE_W, CH / BASE_H);

  INTERACT_RADIUS = 92 * S;
  player.r = 10 * S;
  player.speed = 2.7 * S;
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

function formatItemName(id) {
  return String(id || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatSequence(seq) {
  return (seq || []).map(formatItemName).join(" → ");
}

function getCalibrationCandidates() {
  return stations
    .filter(s => s.id !== "door" && (s.kind === "core" || s.kind === "decor"))
    .map(s => s.id);
}

function pickAct2TargetSeq() {
  const pool = [...new Set(getCalibrationCandidates())];
  const rand = mulberry32((runSeed ^ 0xA2C711) >>> 0);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  act2TargetSeq = pool.slice(0, Math.min(3, pool.length));
}

function getNextCalibrationId() {
  if (act2Calibrated) return null;
  return act2TargetSeq[act2Progress] || null;
}

function getStationById(id) {
  return stations.find(s => s.id === id) || null;
}

function nearestNonDoorInteractive() {
  const list = stations.filter(s =>
    s.id !== "door" &&
    (s.kind === "core" || s.kind === "decor" || (s.kind === "hidden" && s.revealed))
  );
  let best = null;
  let bestD = 1e9;
  for (const s of list) {
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function nearestAvailableSig() {
  const list = stations.filter(s => s.kind === "hidden" && s.revealed);
  let best = null;
  let bestD = 1e9;
  for (const s of list) {
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function pickAct3Targets() {
  const touched = [];
  const seen = new Set();
  for (const id of history) {
    if (!id || id === "door" || id === "hidden") continue;
    if (seen.has(id)) continue;
    seen.add(id);
    if (getStationById(id)) touched.push(id);
  }
  const pool = touched.length ? touched : getCalibrationCandidates();
  const rand = mulberry32((runSeed ^ 0xA37A37) >>> 0);
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  act3TargetIds = copy.slice(0, Math.min(3, copy.length));
}

function markAct3Touch(id) {
  if (act !== 3) return;
  if (!act3TargetIds.includes(id)) return;
  if (act3Touched.has(id)) return;
  act3Touched.add(id);
  queuePoemLine("You return to " + formatItemName(id) + ". The line changes because you came back.");
}

function getNextAct3Target() {
  if (act !== 3) return null;
  for (const id of act3TargetIds) {
    if (!act3Touched.has(id)) return getStationById(id);
  }
  return null;
}

function canEnterAct3Door() {
  return act === 3 && act3TargetIds.length > 0 && act3TargetIds.every(id => act3Touched.has(id));
}

function startAct2() {
  act = 2;
  actBannerFrames = 180;

  act2SigCollected = 0;
  act2Calibrated = false;
  act2Seq = [];
  act2TargetSeq = [];
  act2Progress = 0;

  pickAct2TargetSeq();

  mutateRoom();
  queuePoemLine("The room shifts. It was listening.");
  queuePoemLine("Set the sequence: " + formatSequence(act2TargetSeq) + ".");
  sfxDoorRumble();

  openActPoemModal("Stanza I", buildActPoemSnapshot());
}

function startAct3() {
  act = 3;
  actBannerFrames = 180;
  act3Touched = new Set();
  pickAct3Targets();
  queuePoemLine("The machine stops observing. It asks you to return.");
  if (act3TargetIds.length) {
    queuePoemLine("Revisit: " + formatSequence(act3TargetIds) + ". Then return to the door.");
  }
  sfxDoorRumble();

  openActPoemModal("Stanza II", buildActPoemSnapshot());
}

/* ==========================================================
   RESET RUN
========================================================== */
function resetRun(startInMenu = false) {
  stopTTS();

  paused = false;
  showFinalModal = false;
  finalPoemText = "";

  showActPoemModal = false;
  actPoemTitle = "";
  actPoemText = "";

  mode = startInMenu ? "menu" : "world";
  focusId = null;
  focusImg = null;
  focusZoom = 1.35;
  focusZoomTarget = 1.35;

  act = 1;
  actBannerFrames = 0;

  history = [];
  usedLines = new Set();
  resetTypewriterState();
  resetActPoems();
  act2TargetSeq = [];
  act3TargetIds = [];
  act3Touched = new Set();

  act2SigCollected = 0;
  act2Calibrated = false;
  act2Progress = 0;

  signal = 0;
  doorTrail.t = 0;
  doorTrail.maxT = 260;

  pulse.active = false;
  pulse.r = 0;
  pulse.hit = false;
  pulse.speed = 18;

  menuIndex = 0;
  entryPromptVisible = false;

  world.w = Math.floor(2400 + random(0, 1400));
  world.h = Math.floor(1700 + random(0, 1000));
  world.pad = Math.floor(170 + random(0, 130));

  player.x = world.w * 0.5;
  player.y = world.h * 0.5;
  camera.x = player.x;
  camera.y = player.y;

  fractal.baseCenter.x = -0.6;
  fractal.baseCenter.y = 0.0;
  fractal.baseZoom = 2.2;
  fractal.baseWarp = 0.35;
  fractal.iters = 240;

  fractal.center.x = fractal.baseCenter.x;
  fractal.center.y = fractal.baseCenter.y;
  fractal.zoom = fractal.baseZoom;
  fractal.warp = fractal.baseWarp;

  generateStations();

  if (!startInMenu) {
    queuePoemLine("A room shimmers in green phosphor.");
    queuePoemLine("You and the machine co-write a poem by moving through it.");
    queuePoemLine("Interact with 2 objects, then the door. The order becomes the poem.");
    queuePoemLine("Hidden SIG nodes are withheld words. Find them to deepen SIGNAL.");
    queuePoemLine("Controls: WASD or arrows move. E interact. Q ping door. ESC close. R restart.");
  }

  if (cnv && cnv.elt) cnv.elt.focus();
}

function beginWritingFromMenu() {
  resetRun(false);
  queuePoemLine("The room is not ready.");
  queuePoemLine("It is building itself from what you expect.");
  queuePoemLine("Step inside. Notice something before it notices you back.");
  entryPromptVisible = true;
}

function setCommonsReadOnly(isReadOnly) {
  if (poetNameInputEl) {
    poetNameInputEl.style.display = isReadOnly ? "none" : "";
    if (isReadOnly) poetNameInputEl.value = "";
  }

  if (sharePoemBtnEl) {
    sharePoemBtnEl.style.display = isReadOnly ? "none" : "";
  }

  const poetNameLabel = document.querySelector('label[for="poet-name"]');
  if (poetNameLabel) {
    poetNameLabel.style.display = isReadOnly ? "none" : "";
  }

  if (refreshBoardBtnEl) {
    refreshBoardBtnEl.style.display = isReadOnly ? "none" : "";
  }
}

function openPoetryCommonsFromMenu() {
  if (!finalTitleEl || !finalBodyEl) return;

  stopTTS();

  finalPoemTitle = "POETRY COMMONS";
  finalPoemText = "";

  if (finalTitleEl) finalTitleEl.textContent = finalPoemTitle;

  if (finalBodyEl) {
    finalBodyEl.innerText = "";
    finalBodyEl.scrollTop = 0;
  }

  showFinalModal = true;
  paused = true;

  if (finalModalEl) {
    finalModalEl.classList.add("is-open");
    finalModalEl.setAttribute("aria-hidden", "false");
    finalModalEl.classList.add("commons-only");
  }

  setCommonsReadOnly(true);
  setPoetryCommonsEnabled(true);

  renderLeaderboard();
  refreshLeaderboard();

  setTimeout(() => {
    if (cnv && cnv.elt) cnv.elt.focus();
  }, 0);
}

function drawBootScreen() {
  drawCRTBackground();

  const elapsed = millis() - bootStartedAt;
  const progress = constrain(elapsed / bootDurationMs, 0, 1);
  const lineIndex = Math.min(BOOT_LINES.length - 1, Math.floor(progress * BOOT_LINES.length));

  push();
  textFont("VT323");
  textStyle(NORMAL);
  textAlign(LEFT, TOP);
  fill(255, 70, 70);
  textSize(30 * S);
  text("THE POEM ROOM", 48 * S, 56 * S);

  fill(170, 255, 210);
  textSize(20 * S);

  for (let i = 0; i <= lineIndex; i++) {
    text(BOOT_LINES[i], 48 * S, (120 + i * 34) * S);
  }

  noFill();
  stroke(0, 255, 120, 170);
  rect(48 * S, CH - 82 * S, CW - 96 * S, 18 * S);

  noStroke();
  fill(255, 60, 60, 220);
  rect(48 * S, CH - 82 * S, (CW - 96 * S) * progress, 18 * S);

  pop();

  if (elapsed >= bootDurationMs) {
    mode = "menu";
    menuLoreChangedAt = millis();
  }
}

function drawMenuScreen() {
  drawCRTBackground();

  if (fractalLayer) {
    tint(120, 255, 170, 120);
    image(fractalLayer, 0, 0);
    noTint();
  }

  if (millis() - menuLoreChangedAt > menuLoreEveryMs) {
    menuLoreIndex = (menuLoreIndex + 1) % MENU_LORE.length;
    menuLoreChangedAt = millis();
  }

  push();

  textFont("VT323");
  textStyle(NORMAL);

 textAlign(CENTER, CENTER);

  // Center anchor point
  const centerX = CW * 0.5;
  const centerY = CH * 0.28;   // tweak this if you want higher/lower

  // TITLE
  fill(255, 60, 60);
  textSize(48 * S);
  text("THE POEM ROOM", centerX, centerY);

  // SUBTITLE (perfectly spaced under it)
  fill(255, 150, 150);
  textSize(20 * S);
  text("you are not the author alone", centerX, centerY + 36 * S);

  textAlign(LEFT, CENTER);
  textSize(26 * S);

  const startX = CW * 0.5 - 130 * S;
  const startY = CH * 0.5 - 20 * S;

  for (let i = 0; i < MENU_OPTIONS.length; i++) {
  const isSelected = i === menuIndex;

  // base color
  fill(isSelected ? color(120, 255, 170) : color(120, 255, 170, 120));

  let label = (isSelected ? "> " : "  ") + MENU_OPTIONS[i];

  // glowing green cursor
  if (isSelected && frameCount % 60 < 30) {
    push();

    // draw text without cursor first
    text(label, startX, startY + i * 42 * S);

    // measure text width so we can place cursor right after it
    const w = textWidth(label);

    // glowing green cursor
    fill(120, 255, 170);
    drawingContext.shadowBlur = 12;
    drawingContext.shadowColor = "rgba(0,255,200,0.8)";

    text("█", startX + w + 6 * S, startY + i * 42 * S);

    drawingContext.shadowBlur = 0;
    pop();

    continue;
  }

  text(label, startX, startY + i * 42 * S);
}

    const loreW = CW * 0.72;
    const loreH = 70 * S;
    const loreX = (CW - loreW) / 2;
    const loreY = CH - 140 * S;

    fill(170, 255, 210);
    textSize(16 * S);
    textAlign(CENTER, TOP);
    text(MENU_LORE[menuLoreIndex], loreX, loreY, loreW, loreH);

    pop();
}

function drawCreditsScreen() {
  drawCRTBackground();

  if (fractalLayer) {
    tint(120, 255, 170, 45);
    image(fractalLayer, 0, 0);
    noTint();
  }

  push();
  textFont("VT323");
  textAlign(CENTER, TOP);
  textSize(18 * S);

  const startY = 72 * S;
  const lineHeight = 24 * S;
  let y = startY;

  for (let i = 0; i <= creditsIndex && i < creditsLines.length; i++) {
    const line = creditsLines[i];

    let visibleText = line;
    if (i === creditsIndex) {
      visibleText = line.substring(0, creditsCharIndex);
    }

    let col = color(120, 255, 190);
    drawingContext.shadowBlur = 0;
    drawingContext.shadowColor = "transparent";

    if (line.includes("L0g1cF@11acy")) {
      col = color(255, 120, 120);
      drawingContext.shadowBlur = 4;
      drawingContext.shadowColor = "rgba(255,120,120,0.35)";
    } else if (line.includes("You are the author")) {
      col = color(180, 255, 220);
      drawingContext.shadowBlur = 5;
      drawingContext.shadowColor = "rgba(120,255,200,0.35)";
    }

    fill(col);
    text(visibleText, CW * 0.5, y);

    drawingContext.shadowBlur = 0;
    drawingContext.shadowColor = "transparent";

    y += lineHeight;
  }

  pop();

  updateCreditsTypewriter();
}

function handleMenuSelection() {
  const choice = MENU_OPTIONS[menuIndex];

  if (choice === "BEGIN WRITING") {
    beginWritingFromMenu();
    return;
  }

  if (choice === "POETRY COMMONS") {
    openPoetryCommonsFromMenu();
    return;
  }

  if (choice === "CREDITS") {
    creditsIndex = 0;
    creditsCharIndex = 0;
    creditsTimer = millis();
    mode = "credits";
    return;
  }
}

function updateCreditsTypewriter() {
  if (creditsIndex >= creditsLines.length) return;

  const now = millis();
  let delay = 18;

  const currentLine = creditsLines[creditsIndex];

  if (currentLine.includes("You are the author")) delay = 40;
  if (currentLine.includes("L0g1cF@11acy")) delay = 28;

  if (now - creditsTimer > delay) {
    creditsCharIndex++;
    creditsTimer = now;

    if (creditsCharIndex > creditsLines[creditsIndex].length) {
      creditsCharIndex = 0;
      creditsIndex++;
      creditsTimer = now + 250;
    }
  }
}

/* ==========================================================
   MAIN LOOP
========================================================== */
function draw() {
  updateTypewriter();
  rebuildPoemDisplay();

  if (mode === "boot") {
    updateProceduralMusic();
    drawBootScreen();
    updateUI();
    return;
  }

  if (mode === "menu") {
    updateProceduralMusic();
    updateFractalAnimation();
    if (mandelShader && fractalLayer) renderFractalLayer();
    drawMenuScreen();
    updateUI();
    return;
  }

  if (mode === "credits") {
    updateProceduralMusic();
    updateFractalAnimation();
    if (mandelShader && fractalLayer) renderFractalLayer();
    drawCreditsScreen();
    updateUI();
    return;
  }

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

  if (mode === "world") drawWorldMode();
  else drawFocusMode();

  updateUI();
}

function openFinalModal() {
  finalPoemTitle = buildFinalPoemTitle();
  finalPoemText = buildFinalPoemText();

  showFinalModal = true;
  paused = true;
  finalSpeechFinished = false;

  if (finalTitleEl) {
    finalTitleEl.textContent = finalPoemTitle;
  }

  if (finalBodyEl) {
    finalBodyEl.innerText = finalPoemText;
    finalBodyEl.scrollTop = 0;
  }

    if (finalModalEl) {
    finalModalEl.classList.add("is-open");
    finalModalEl.classList.remove("commons-only");
    finalModalEl.setAttribute("aria-hidden", "false");
  }

  setCommonsReadOnly(false);
  setPoetryCommonsEnabled(false);
  renderLeaderboard();
  refreshLeaderboard();

  if (finalSpeechAutoplay) {
    setTimeout(() => {
      if (showFinalModal && !speaking) {
        toggleFinalSpeech();
      }
    }, 250);
  }
}

function closeFinalModal(returnToMenu = false) {
  stopTTS();
  showFinalModal = false;
  paused = false;
  mode = returnToMenu ? "menu" : "world";
  focusId = null;
  focusImg = null;
  focusZoom = 1.35;
  focusZoomTarget = 1.35;

  if (finalModalEl) {
    finalModalEl.classList.remove("is-open");
    finalModalEl.classList.remove("commons-only");
    finalModalEl.setAttribute("aria-hidden", "true");
  }

  if (cnv && cnv.elt) cnv.elt.focus();
}

function debugOpenFinalPoem() {
  stopTTS();
  act = 3;
  act3TargetIds = [];
  act3Touched = new Set();
  history = history.filter(Boolean);

  if (!history.includes("door")) history.push("door");
  if (history.filter(id => id !== "door").length < 2) {
    history.push("lamp");
    history.push("mirror");
  }

  openFinalModal();
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


  // ----------------------------------------------------------
  // Extra non-hidden room items (DECOR)
  // ----------------------------------------------------------
  const decorIds = DECOR_IDS.slice();

  // Deterministic shuffle (stable per run)
  const drand = mulberry32((runSeed ^ 0xDEC0DE) >>> 0);
  for (let i = decorIds.length - 1; i > 0; i--) {
    const j = Math.floor(drand() * (i + 1));
    const tmp = decorIds[i];
    decorIds[i] = decorIds[j];
    decorIds[j] = tmp;
  }

  const decorCount = Math.min(EXTRA_DECOR, decorIds.length);
  const decorMinDist = 245 * S;
  const decorAvoidPlayerDist = 340 * S;

  for (let i = 0; i < decorCount; i++) {
    const id = decorIds[i];
    const pos = pickPositionWithSpacing(decorMinDist, decorAvoidPlayerDist, placed);
    placed.push(pos);

    stations.push({
      kind: "decor",
      id,
      label: id.replace(/_/g, " ").toUpperCase(),
      x: pos.x, y: pos.y,
      hidden: false,
      revealed: true,
      glyphSeed: 0,
      spriteId: id,
      fn: () => decorAction(id)
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

  // Touch joystick overrides keyboard movement while active.
  // Drag distance from the touch start controls direction + speed.
  if (touchMove && touchMove.active) {
    let dx = touchMove.x - touchMove.startX;
    let dy = touchMove.y - touchMove.startY;

    const dmag = Math.hypot(dx, dy);
    if (dmag <= TOUCH_DEADZONE) {
      vx = 0;
      vy = 0;
    } else {
      const clamped = Math.min(dmag, TOUCH_MAX_R);
      dx = (dx / dmag) * clamped;
      dy = (dy / dmag) * clamped;

      const s01 = clamped / TOUCH_MAX_R; // 0..1
      vx = (dx / TOUCH_MAX_R) * player.speed;
      vy = (dy / TOUCH_MAX_R) * player.speed;

      // Slight boost near full tilt so it feels responsive on phones
      const boost = 0.85 + 0.25 * s01;
      vx *= boost;
      vy *= boost;
    }
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

  // Mobile helper: show a subtle on-canvas joystick when dragging
  drawTouchJoystick();
  drawTouchButtons();
}

function drawTouchJoystick() {
  if (!touchMove || !touchMove.active) return;

  push();
  noFill();
  stroke(0, 255, 170, 140);
  strokeWeight(2);
  circle(touchMove.startX, touchMove.startY, TOUCH_MAX_R * 2);

  stroke(0, 255, 120, 180);
  line(touchMove.startX, touchMove.startY, touchMove.x, touchMove.y);

  noStroke();
  fill(0, 255, 170, 190);
  circle(touchMove.startX, touchMove.startY, 10);
  fill(180, 255, 220, 220);
  circle(touchMove.x, touchMove.y, 12);
  pop();
}


function getInteractButtonRect() {
  // Screen-space button for mobile (canvas coordinates)
  const m = 20;   // more inset from edges
  const h = 52;   // slightly taller
  const w = 170;  // slightly wider

  return {
    x: Math.max(m, CW - w - m),
    y: Math.max(m, CH - h - m - 50), // lift it upward a bit
    w,
    h
  };
}

function _ptInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function drawTouchButtons() {
  // Only show the button when we're in-game (world or focus) and not paused by modal
  if (showFinalModal) return;

  const r = getInteractButtonRect();

  push();
  // Backplate
  noStroke();
  fill(0, 0, 0, 95);
  rect(r.x, r.y, r.w, r.h, 6);

  // Outline
  stroke(0, 255, 170, 170);
  strokeWeight(2);
  noFill();
  rect(r.x, r.y, r.w, r.h, 6);

  // Label
  noStroke();
  fill(180, 255, 220, 235);
  textAlign(CENTER, CENTER);
  textSize(18);
  const label = (mode === "focus") ? "CLOSE (E)" : "INTERACT (E)";
  text(label, r.x + r.w * 0.5, r.y + r.h * 0.52);
  pop();
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

  const title = (act === 3) ? "ACT 3" : ((act === 2) ? "ACT 2" : "ACT 1");
  const sub = (act === 3)
    ? "THE POEM WRITES YOU BACK"
    : ((act === 2) ? "THE MACHINE NOTICES YOU" : "THE ROOM SPEAKS");

  textAlign(CENTER, CENTER);
  fill(0, 255, 170, alpha);
  textSize(42 * S);
  text(title, CW * 0.5, CH * 0.42);

  fill(0, 255, 170, alpha * 0.75);
  textSize(18 * S);
  text(sub, CW * 0.5, CH * 0.52);
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
  return act === 3 && canEnterAct3Door();
}

function drawCompassArrow() {
  const target = getCompassTarget();
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
  if (target.compassType === "sig") fill(0, 255, 220, 235);
  else if (target.compassType === "object") fill(255, 220, 120, 230);
  else fill(0, 255, 170, 230);

  triangle(0, 0, -16, -9, -16, 9);
  pop();
}

function getCompassTarget() {
  const door = getDoor();

  if (act === 1) {
    if (!canEnterDoorState()) {
      const obj = nearestNonDoorInteractive();
      return obj ? { ...obj, compassType: "object" } : null;
    }
    return door ? { ...door, compassType: "door" } : null;
  }

  if (act === 2) {
    if (!act2Calibrated) {
      const nextId = getNextCalibrationId();
      const nextObj = nextId ? getStationById(nextId) : null;
      if (nextObj) return { ...nextObj, compassType: "object" };
    }

    if (act2SigCollected < 2) {
      const sig = nearestAvailableSig();
      if (sig) return { ...sig, compassType: "sig" };
    }

    return door ? { ...door, compassType: "door" } : null;
  }

  if (act === 3) {
    const nextObj = getNextAct3Target();
    if (nextObj) return { ...nextObj, compassType: "object" };
    return door ? { ...door, compassType: "door" } : null;
  }

  return door ? { ...door, compassType: "door" } : null;
}

function nearestNonDoorInteractive() {
  const list = stations.filter(s =>
    s.id !== "door" &&
    (s.kind === "core" || s.kind === "decor" || (s.kind === "hidden" && s.revealed))
  );

  let best = null;
  let bestD = 1e9;
  for (const s of list) {
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function nearestAvailableSig() {
  const list = stations.filter(s => s.kind === "hidden" && s.revealed);

  let best = null;
  let bestD = 1e9;
  for (const s of list) {
    const d = dist(player.x, player.y, s.x, s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
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

function handleAct2CalibrationTouch(id) {
  if (act !== 2 || act2Calibrated) return;
  if (!act2TargetSeq.includes(id)) return;

  const expectedId = act2TargetSeq[act2Progress];

  if (id === expectedId) {
    act2Progress++;

    if (act2Progress >= act2TargetSeq.length) {
      act2Calibrated = true;
      queuePoemLine("Calibration complete. The room stops resisting your order.");
      sfxBlip(980, 0.001, 0.06, 0.22);

      pulse.active = true;
      pulse.r = 0;
      pulse.hit = false;
      sfxBlip(420, 0.001, 0.06, 0.30);
    }
  } else {
    act2Progress = (id === act2TargetSeq[0]) ? 1 : 0;
    queuePoemLine("The sequence slips. Start it again.");
    sfxDenied();
  }
}

function coreAction(id) {
  addInteractionPoetry(id);

  if (id === "door") {
    if (act === 1) {
      if (!canEnterDoorState()) {
        queuePoemLine("The door refuses entry. Bring it more lines first.");
        sfxDenied();
        enterFocus("door");
        return;
      }
      startAct2();
      return;
    }

    if (act === 2) {
      if (!act2Calibrated || act2SigCollected < 2) {
        const needSig = Math.max(0, 2 - act2SigCollected);
        queuePoemLine(
          "The door waits for the right sequence. Press E on " +
          formatSequence(act2TargetSeq) +
          ". Then find " + needSig + " more SIG."
        );
        sfxDenied();
        enterFocus("door");
        return;
      }

      startAct3();
      return;
    }

    if (act === 3) {
      if (!canEnterAct3Door()) {
        const nextObj = getNextAct3Target();
        queuePoemLine(
          nextObj
            ? ("The door waits. Revisit " + formatItemName(nextObj.id) + " before you seal the poem.")
            : "The door waits for the final revisions."
        );
        sfxDenied();
        enterFocus("door");
        return;
      }

      doorTrail.t = Math.max(doorTrail.t, Math.floor(190 + signal * 35));
      sfxDoorRumble();
      enterFocus("door");
      return;
    }
  }

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

  handleAct2CalibrationTouch(id);

  if (act === 3) markAct3Touch(id);

  enterFocus(id);
}

// Flavor-only items: small, non-blocking mutations + their own poem buckets.
function decorAction(id) {
  addInteractionPoetry(id);

  // Gentle nudge so they "do something" without derailing the core loop.
  const h = (idHash(id) ^ runSeed) >>> 0;
  const r = mulberry32(h);

  const dz = 1.0 + (r() - 0.5) * 0.06;
  const dw = (r() - 0.5) * 0.08;
  const dc = (r() - 0.5) * 0.06;

  fractal.baseZoom = constrain(fractal.baseZoom * dz, 0.6, 18.0);
  fractal.baseWarp = clamp01(fractal.baseWarp + dw);
  fractal.baseCenter.x += dc / Math.max(fractal.baseZoom, 0.001);
  fractal.baseCenter.y -= dc / Math.max(fractal.baseZoom, 0.001);

  // Tiny sonic signature (varies per item)
  const pick = (h % 3);
  if (pick === 0) sfxInteractLow();
  else if (pick === 1) sfxInteractMid();
  else sfxInteractHigh();

  handleAct2CalibrationTouch(id);

  if (act === 3) markAct3Touch(id);

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
function tryInteract() {
  if (paused || showActPoemModal) return false;

  if (mode === "focus") {
    if (focusId === "door" && act === 3 && canEnterAct3Door()) {
      openFinalModal();
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

  /* -------------------------
     FINAL POEM MODAL
  ------------------------- */
function keyPressed() {
  const ae = document.activeElement;
  const isTypingField =
    ae &&
    (ae.tagName === "INPUT" ||
     ae.tagName === "TEXTAREA" ||
     ae.isContentEditable);

  if (mode === "boot") {
    return false;
  }

  if (mode === "menu") {
    if (keyCode === UP_ARROW || key === "w" || key === "W") {
      menuIndex = (menuIndex - 1 + MENU_OPTIONS.length) % MENU_OPTIONS.length;
      return false;
    }

    if (keyCode === DOWN_ARROW || key === "s" || key === "S") {
      menuIndex = (menuIndex + 1) % MENU_OPTIONS.length;
      return false;
    }

    if (keyCode === ENTER || key === " " || keyCode === 32) {
      handleMenuSelection();
      return false;
    }

    return false;
  }

  if (mode === "credits") {
    if (keyCode === ESCAPE || key === "e" || key === "E" || key === " " || keyCode === 32) {
      mode = "menu";
      return false;
    }
    return false;
  }

  /* -------------------------
     FINAL POEM MODAL
  ------------------------- */
  if (showFinalModal) {
    if (keyCode === ESCAPE) {
      closeFinalModal(finalPoemTitle === "POETRY COMMONS");
      return false;
    }

    if (key === "r" || key === "R") {
      closeFinalModal(false);
      resetRun(true);
      return false;
    }

    if (key === "t" || key === "T") {
      debugOpenFinalPoem();
      return false;
    }

    if (key === " " || keyCode === 32) {
      if (finalPoemTitle === "POETRY COMMONS") {
        speakPoetryCommons();
      } else {
        toggleFinalSpeech();
      }
      return false;
    }

    if (isTypingField) {
      return true;
    }

    return false;
  }

  /* -------------------------
     ACT / STANZA MODAL
  ------------------------- */
  if (showActPoemModal) {
    if (keyCode === ESCAPE || key === "e" || key === "E" || key === " " || keyCode === 32) {
      closeActPoemModal();
      return false;
    }

    if (key === "r" || key === "R") {
      closeActPoemModal();
      resetRun(true);
      return false;
    }

    if (key === "t" || key === "T") {
      closeActPoemModal();
      debugOpenFinalPoem();
      return false;
    }

    return false;
  }

  /* -------------------------
     NORMAL GAME INPUT
  ------------------------- */
  if (keyCode === ESCAPE) {
    paused = !paused;
    return false;
  }

  if (key === "r" || key === "R") {
    resetRun(true);
    return false;
  }

  if (key === "t" || key === "T") {
    debugOpenFinalPoem();
    return false;
  }

  if (key === "q" || key === "Q") {
    if (!paused && !showActPoemModal && !showFinalModal) {
      pulse.active = true;
      pulse.r = 0;
      pulse.hit = false;
      sfxBlip(420, 0.001, 0.06, 0.30);

      if (mode === "focus") {
        doorTrail.t = doorTrail.maxT;
      }
    }
    return false;
  }

  if (key === "e" || key === "E") {
    return tryInteract();
  }

  return false;
}

document.addEventListener("DOMContentLoaded", () => {
  const poetNameInput = document.getElementById("poet-name");
  if (poetNameInput) {
    poetNameInput.addEventListener("keydown", (e) => e.stopPropagation());
    poetNameInput.addEventListener("keyup", (e) => e.stopPropagation());
    poetNameInput.addEventListener("click", (e) => e.stopPropagation());
  }
});

function mousePressed(event) {
  armAudioIfNeeded();
  const target = event && event.target ? event.target : null;
  if (showFinalModal && target && (target.closest(".leaderboard-panel") || target.closest("#final-modal input") || target.closest("#final-modal button"))) {
    return;
  }
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

// --------------------------------------------------
// TOUCH CONTROLS (mobile)
// - Drag anywhere on the game canvas to move (virtual joystick).
// - This does not interfere with the right-side HUD because we only
//   activate movement when the touch begins inside the canvas rect.
// --------------------------------------------------
function _touchToCanvasXY(t) {
  if (!cnv || !cnv.elt) return { x: 0, y: 0, ok: false };
  const r = cnv.elt.getBoundingClientRect();
  const cx = (t.clientX - r.left) * (CW / Math.max(1, r.width));
  const cy = (t.clientY - r.top) * (CH / Math.max(1, r.height));
  const ok = (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom);
  return { x: cx, y: cy, ok };
}

function touchStarted() {
  armAudioIfNeeded();

  if (paused || showFinalModal) return false;
  if (mode !== "world") return false;
  if (!touches || touches.length === 0) return false;

  // Bind the first touch that starts inside the canvas
  const t = touches[0];
  const p = _touchToCanvasXY(t);
  if (!p.ok) return false;

  // Tap button: Interact / Close
  const btn = getInteractButtonRect();
  if (_ptInRect(p.x, p.y, btn)) {
    tryInteract();
    return false;
  }

  touchMove.active = true;
  touchMove.id = (typeof t.id !== "undefined") ? t.id : (typeof t.identifier !== "undefined" ? t.identifier : 0);
  touchMove.startX = p.x;
  touchMove.startY = p.y;
  touchMove.x = p.x;
  touchMove.y = p.y;
  return false; // prevent page scroll
}

function touchMoved() {
  if (!touchMove.active || !touches || touches.length === 0) return false;

  // Find the tracked touch (p5 uses .id, DOM Touch uses .identifier)
  let t = null;
  for (const tt of touches) {
    const tid = (typeof tt.id !== "undefined") ? tt.id : (typeof tt.identifier !== "undefined" ? tt.identifier : 0);
    if (tid === touchMove.id) { t = tt; break; }
  }
  if (!t) return false;

  const p = _touchToCanvasXY(t);
  touchMove.x = p.x;
  touchMove.y = p.y;
  return false;
}

function touchEnded() {
  // If no touches remain, release joystick
  if (!touches || touches.length === 0) {
    touchMove.active = false;
    touchMove.id = null;
    return false;
  }

  // If the tracked touch is gone, also release
  let stillThere = false;
  for (const tt of touches) {
    const tid = (typeof tt.id !== "undefined") ? tt.id : (typeof tt.identifier !== "undefined" ? tt.identifier : 0);
    if (tid === touchMove.id) { stillThere = true; break; }
  }
  if (!stillThere) {
    touchMove.active = false;
    touchMove.id = null;
  }
  return false;
}

function restartRun() {
  runSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  resetRun(true);
}

function bindLeaderboardUI() {
  if (sharePoemBtnEl) {
    sharePoemBtnEl.addEventListener("click", submitCurrentPoemToLeaderboard);
  }

  if (refreshBoardBtnEl) {
    refreshBoardBtnEl.addEventListener("click", refreshLeaderboard);

    refreshBoardBtnEl.addEventListener("keydown", (e) => {
      if (
        showFinalModal &&
        finalPoemTitle === "POETRY COMMONS" &&
        (e.key === " " || e.code === "Space")
      ) {
        e.preventDefault();
        e.stopPropagation();
        speakPoetryCommons();
      }
    });
  }

  if (poetNameInputEl) {
    poetNameInputEl.addEventListener("change", persistPoetName);
    poetNameInputEl.addEventListener("input", persistPoetName);
    poetNameInputEl.addEventListener("blur", persistPoetName);

    ["keydown", "keyup", "keypress", "click", "mousedown", "pointerdown", "touchstart"].forEach(type => {
      poetNameInputEl.addEventListener(type, (e) => e.stopPropagation());
    });
  }
}

function hydratePoetName() {
  if (!poetNameInputEl) return;
  try {
    const saved = localStorage.getItem("poemRoom.poetName") || "";
    poetNameInputEl.value = saved;
  } catch (err) {
    // ignore localStorage failures
  }
}

function persistPoetName() {
  if (!poetNameInputEl) return;
  try {
    localStorage.setItem("poemRoom.poetName", String(poetNameInputEl.value || "").trim().slice(0, 24));
  } catch (err) {
    // ignore localStorage failures
  }
}

function setPoetryCommonsEnabled(enabled) {
  if (poetNameInputEl) poetNameInputEl.disabled = !enabled;
  if (sharePoemBtnEl) sharePoemBtnEl.disabled = !enabled;
  if (refreshBoardBtnEl) refreshBoardBtnEl.disabled = !enabled;

  if (leaderboardStatusEl && !enabled) {
    leaderboardStatusEl.textContent = "Listen to the poem first. Poetry Commons will open when the reading ends.";
  }
}

function isLeaderboardEnabled() {
  return !!(LEADERBOARD_CONFIG.endpoint && String(LEADERBOARD_CONFIG.endpoint).trim().length);
}

function setLeaderboardStatus(message) {
  if (leaderboardStatusEl) leaderboardStatusEl.textContent = message;
}

function setLeaderboardBusy(isBusy) {
  leaderboardBusy = !!isBusy;
  if (sharePoemBtnEl) sharePoemBtnEl.disabled = leaderboardBusy || !isLeaderboardEnabled();
  if (refreshBoardBtnEl) refreshBoardBtnEl.disabled = leaderboardBusy || !isLeaderboardEnabled();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLeaderboardDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function poemShareScore(text) {
  const lines = String(text || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
  const unique = new Set(lines.map(s => s.toLowerCase()));
  return unique.size;
}


function getLocalPoetryEntries() {
  try {
    const raw = localStorage.getItem("poemRoom.poetryCommonsEntries") || "[]";
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    return [];
  }
}

function saveLocalPoetryEntries(entries) {
  try {
    localStorage.setItem("poemRoom.poetryCommonsEntries", JSON.stringify(entries.slice(0, LEADERBOARD_CONFIG.maxEntries)));
  } catch (err) {
    // ignore storage failures
  }
}

function normalizePoetryRows(rows) {
  return (rows || [])
    .map(row => ({
      name: String(row.name || "anonymous observer").slice(0, 24),
      title: String(row.title || "UNTITLED POEM").slice(0, 80),
      text: String(row.text || "").slice(0, LEADERBOARD_CONFIG.maxPoemChars),
      createdAt: row.createdAt || row.timestamp || ""
    }))
    .sort((a, b) => {
      const da = new Date(a.createdAt || 0);
      const db = new Date(b.createdAt || 0);
      return db - da;
    });
}

function buildLeaderboardPayload() {
  const name = poetNameInputEl && poetNameInputEl.value.trim() ? poetNameInputEl.value.trim().slice(0, 24) : "anonymous observer";
  const title = String(finalPoemTitle || buildFinalPoemTitle() || "UNTITLED POEM").trim();
  const text = String(finalPoemText || buildFinalPoemText() || "").trim().slice(0, LEADERBOARD_CONFIG.maxPoemChars);
  return {
    name,
    title,
    text,
    score: poemShareScore(text),
    seed: runSeed,
    createdAt: new Date().toISOString()
  };
}

function renderLeaderboard() {
  if (!leaderboardListEl) return;

  if (!isLeaderboardEnabled()) {
    setLeaderboardStatus("Poetry Commons is offline until a sharing endpoint is configured.");
    leaderboardListEl.innerHTML = '<div class="leaderboard-empty">Poetry Commons is offline right now. Add LEADERBOARD_CONFIG.endpoint to turn on shared poems.</div>';
    setLeaderboardBusy(false);
    return;
  }

  if (!leaderboardEntries.length) {
    leaderboardListEl.innerHTML = '<div class="leaderboard-empty">No poems have been shared here yet.</div>';
    return;
  }

  leaderboardListEl.innerHTML = leaderboardEntries.map((entry, index) => {
    const rank = index + 1;
    const when = formatLeaderboardDate(entry.createdAt);
    return `
      <div class="leaderboard-entry">
        <div class="leaderboard-meta">
          <div class="leaderboard-name">${escapeHtml(entry.name || "anonymous observer")}</div>
          <div class="leaderboard-date">${escapeHtml(when)}</div>
        </div>
        <div class="leaderboard-poem-title">${escapeHtml(entry.title || "UNTITLED POEM")}</div>
        <div class="leaderboard-poem-text">${escapeHtml(entry.text || "")}</div>
      </div>
    `;
  }).join("");
}

function loadLeaderboardJSONP(limit = 20) {
  return new Promise((resolve, reject) => {
    const callbackName = "poemBoardCallback_" + Date.now();
    const script = document.createElement("script");

    window[callbackName] = (data) => {
      try {
        resolve(data);
      } finally {
        delete window[callbackName];
        script.remove();
      }
    };

    const sep = LEADERBOARD_CONFIG.endpoint.includes("?") ? "&" : "?";
    script.src =
      `${LEADERBOARD_CONFIG.endpoint}${sep}action=list&limit=${encodeURIComponent(limit)}&callback=${encodeURIComponent(callbackName)}`;

    console.log("JSONP URL:", script.src);

    script.onerror = () => {
      console.error("JSONP failed for:", script.src);
      delete window[callbackName];
      script.remove();
      reject(new Error("Poetry Commons request failed."));
    };

    document.body.appendChild(script);
  });
}

function submitPoemViaForm(payload) {
  return new Promise((resolve) => {
    const form = document.getElementById("poem-submit-form");
    if (!form) {
      console.error("Missing #poem-submit-form in index.html");
      resolve({ ok: false });
      return;
    }

    form.action = LEADERBOARD_CONFIG.endpoint;
    form.innerHTML = "";

    const fields = {
      action: "submit",
      name: payload.name || "",
      title: payload.title || "",
      text: payload.text || "",
      score: String(payload.score || 0),
      createdAt: payload.createdAt || ""
    };

    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }

    form.submit();

    setTimeout(() => {
      resolve({ ok: true });
    }, 1200);
  });
}

async function refreshLeaderboard() {
  if (!isLeaderboardEnabled()) {
    leaderboardEntries = normalizePoetryRows(getLocalPoetryEntries());
    setLeaderboardStatus("Poetry Commons is running in local mode.");
    renderLeaderboard();
    return;
  }

  setLeaderboardBusy(true);
  setLeaderboardStatus("Loading Poetry Commons...");

  try {
    const data = await loadLeaderboardJSONP(LEADERBOARD_CONFIG.maxEntries);
    const rows = Array.isArray(data)
      ? data
      : (Array.isArray(data.entries) ? data.entries : []);

    leaderboardEntries = normalizePoetryRows(rows);
    saveLocalPoetryEntries(leaderboardEntries);

    setLeaderboardStatus("Poetry Commons is live.");
    renderLeaderboard();
  } catch (err) {
    console.error(err);
    leaderboardEntries = normalizePoetryRows(getLocalPoetryEntries());
    if (leaderboardEntries.length) {
      setLeaderboardStatus("Using locally cached poems while Poetry Commons reconnects.");
    } else {
      setLeaderboardStatus("Could not load Poetry Commons right now. Local sharing is still available in this browser.");
    }
    renderLeaderboard();
  } finally {
    setLeaderboardBusy(false);
  }
}

async function submitCurrentPoemToLeaderboard() {
  if (!showFinalModal) return;

  persistPoetName();
  const payload = buildLeaderboardPayload();

  if (!payload.text.length) {
    setLeaderboardStatus("Finish a poem before sharing it.");
    return;
  }

  const localEntries = normalizePoetryRows([payload, ...getLocalPoetryEntries()]);
  saveLocalPoetryEntries(localEntries);
  leaderboardEntries = localEntries;
  renderLeaderboard();

  if (!isLeaderboardEnabled()) {
    setLeaderboardStatus("Poem saved locally in this browser.");
    return;
  }

  setLeaderboardBusy(true);
  setLeaderboardStatus("Sharing your poem...");

  try {
    const result = await submitPoemViaForm(payload);

    if (!result.ok) {
      throw new Error("Poetry Commons submit failed.");
    }

    setLeaderboardStatus("Poem shared to Poetry Commons.");

    setTimeout(() => {
      refreshLeaderboard();
    }, 1600);
  } catch (err) {
    console.error(err);
    setLeaderboardStatus("Saved locally. Remote Poetry Commons share did not complete.");
  } finally {
    setLeaderboardBusy(false);
  }
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

  drawTouchButtons();
}

function drawActPoemModal() {
  noStroke();
  fill(0, 0, 0, 170);
  rect(0, 0, CW, CH);

  const panelW = Math.min(CW * 0.78, 760 * S);
  const panelH = Math.min(CH * 0.72, 560 * S);
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
  textSize(20 * S);
  text(actPoemTitle, tx, ty);

  fill(0, 255, 170, 170);
  textSize(12 * S);
  text("E / SPACE / ESC to continue", tx, ty + 28 * S);

  fill(0, 255, 170, 235);
  textSize(15 * S);
  text(actPoemText, tx, ty + 58 * S, panelW - pad * 2, panelH - 84 * S);
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

  drawTouchButtons();
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

  drawTouchButtons();
}

/* ==========================================================
   POETRY ENGINE
========================================================== */
function addInteractionPoetry(id) {
  history.push(id);

  const nonDoorCount = history.filter(h => h !== "door").length;
  let linesThisHit = 1 + Math.floor(Math.max(0, nonDoorCount - 1) / 2);
  if (signal >= 3) linesThisHit += 1;
  if (signal >= 5) linesThisHit += 1;
  linesThisHit = Math.min(linesThisHit, 6);
  if (id === "door") linesThisHit = 1;

  const r = mulberry32((runSeed ^ idHash(id) ^ (history.length * 0x9E3779B9)) >>> 0);
  const bucket = LINES[id] || ["Something responds, quietly."];

  if (history.length >= 2 && r() < 0.55) {
    queuePoemLine(pickUniqueLine(CONNECTORS, id + ":connector:" + history.length));
  }

  const baseLine = pickUniqueLine(bucket, id + ":base:" + history.length);
  queuePoemLine(baseLine);
  if (id !== "door" && id !== "hidden") pushActPoemLine(baseLine);

  for (let k = 1; k < linesThisHit; k++) {
    const roll = r();
    if (signal > 0 && roll < 0.26) {
      queuePoemLine(pickUniqueLine(SIGNAL_LINES, id + ":signal:" + k));
      continue;
    }
    if (signal > 1 && roll < 0.44) {
      queuePoemLine(pickUniqueLine(MUTATION_LINES, id + ":mut:" + k));
      continue;
    }
    if (roll < 0.58) {
      queuePoemLine(pickUniqueLine(GLITCH_LINES, id + ":glitch:" + k));
      continue;
    }

    const echoLine = pickUniqueLine(bucket, id + ":echo:" + k);
    queuePoemLine(echoLine);
    if (id !== "door" && id !== "hidden") pushActPoemLine(echoLine);
  }
}

function getPoemLinesForFinal() {
  const out = [];
  for (const l of poemLog) out.push(l);
  if (heldLine && heldLine.trim().length) out.push(heldLine);
  for (const l of poemQueue) out.push(l);
  return out;
}

function buildFinalPoemText() {
  const rand = mulberry32(runSeed ^ 0xABC123);

  function buildStanza(lines) {
    const clean = [...new Set((lines || [])
      .map(l => String(l || "").trim())
      .filter(t => t.length > 0)
      .filter(isItemPoemLine))];

    if (!clean.length) return "";

    const shuffled = clean.slice().sort(() => rand() - 0.5);
    const stanzaSize = 3;
    const blocks = [];

    for (let i = 0; i < shuffled.length; i += stanzaSize) {
      blocks.push(shuffled.slice(i, i + stanzaSize).join("\n"));
    }

    return blocks.join("\n\n");
  }

  const stanza1 = buildStanza(actPoems[1]);
  const stanza2 = buildStanza(actPoems[2]);
  const stanza3 = buildStanza(actPoems[3]);

  return [stanza1, stanza2, stanza3].filter(Boolean).join("\n\n");
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
  poemLog = [];
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
  const s = String(line).trim();
  if (!s.length) return;

  // Prevent the poem from repeating the exact same line over and over.
  // (We still allow different lines that happen to be similar.)
  if (poemLog.includes(s)) return;
  if (poemQueue.length && poemQueue[poemQueue.length - 1] === s) return;

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
    // commit completed line to log
    if (typingLine && typingLine.length) {
      poemLog.push(typingLine);
      // keep memory bounded
      if (poemLog.length > 240) poemLog.shift();
    }
    isTyping = false;
    heldLine = "";
  }
}

function rebuildPoemDisplay() {
  if (!poemEl || !promptEl) return;

  const esc = (s) => String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");

  if (mode === "boot") {
    promptEl.innerHTML = [
      `<div class="act-title">INITIALIZING</div>`,
      `<div class="act-sub">Preparing the room for an observer.</div>`,
      `<div class="act-signal">Please wait.</div>`
    ].join("");

    poemEl.innerHTML = `<span class="typing-line">${esc("Booting poetic interface")}<span class="cursor">█</span></span>`;
    return;
  }

  if (mode === "menu") {
    promptEl.innerHTML = [
      `<div class="act-left">`,
        `<div class="act-title">MAIN MENU</div>`,
      `</div>`,
      `<div class="act-right">`,
        `<div class="act-signal">${esc(MENU_LORE[menuLoreIndex])}</div>`,
        `<div class="act-sub">Choose how you want to enter the system.</div>`,
      `</div>`
    ].join("");

    poemEl.innerHTML = ``;
    return;
  }

  if (mode === "credits") {
    promptEl.innerHTML = [
      `<div class="act-left">`,
        `<div class="act-title">CREDITS</div>`,
      `</div>`,
      `<div class="act-right">`,
        `<div class="act-signal">A record of observers, systems, and leaks.</div>`,
        `<div class="act-sub">ESC returns to the menu.</div>`,
      `</div>`
    ].join("");

    poemEl.innerHTML = ``;
    return;
  }

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

  const keep = 6;
  const recent = poemLog.slice(Math.max(0, poemLog.length - keep));

  const cursor = '<span class="cursor">█</span>';
  const focused = esc(heldLine || "") + cursor;

  promptEl.innerHTML = [
    `<div class="act-title">ACT 1</div>`,
    `<div class="act-sub">${esc(subtitle)}</div>`,
    `<div class="act-signal">${esc(signalLine)}</div>`
  ].join("");

  poemEl.innerHTML = [
    ...recent.map(l => `<span>${esc(l)}</span>`),
    `<span class="typing-line">${focused}</span>`
  ].join("");
}

/* ==========================================================
   FINAL POEM TITLE BUILDER
========================================================== */
function getPoemLinesForFinal() {
  const out = [];
  for (const l of poemLog) out.push(l);
  if (heldLine && heldLine.trim().length) out.push(heldLine);
  for (const l of poemQueue) out.push(l);
  return out;
}

function buildFinalPoemTitle() {
  const rand = mulberry32((runSeed ^ 0xDEADBEEF) >>> 0);

  const touched = [];
  const seen = new Set();

  for (const id of history) {
    if (!id || id === "door" || id === "hidden") continue;
    if (seen.has(id)) continue;
    seen.add(id);
    touched.push(id);
  }

  const nounMap = {
    lamp: ["LIGHT", "LAMP", "GLOW", "FILAMENT"],
    mirror: ["GLASS", "REFLECTION", "MIRROR", "SURFACE"],
    desk: ["DESK", "WOOD", "GRAIN", "SURFACE"],
    radio: ["RADIO", "STATIC", "SIGNAL", "FREQUENCY"],
    clock: ["CLOCK", "TIME", "HOUR", "TICK"],
    key: ["KEY", "THRESHOLD", "LOCK", "HINGE"],
    map: ["MAP", "PAPER", "DIRECTION", "PATH"],
    candle: ["FLAME", "WAX", "CANDLE", "LIGHT"],
    plant: ["LEAF", "ROOT", "PLANT", "STEM"],
    feather: ["FEATHER", "DRIFT", "AIR", "THREAD"],
    shell: ["SHELL", "ECHO", "CURVE", "TIDE"],
    coin: ["COIN", "METAL", "LUCK", "CIRCLE"],
    marble: ["MARBLE", "SPHERE", "GLASS", "SWIRL"],
    lens: ["LENS", "FOCUS", "GLASS", "EDGE"],
    needle: ["NEEDLE", "POINT", "THREAD", "PRICK"],
    ribbon: ["RIBBON", "KNOT", "LOOP", "BOW"],
    stone: ["STONE", "WEIGHT", "DUST", "PRESSURE"],
    mug: ["MUG", "CUP", "CERAMIC", "RIM"],
    paperclip: ["PAPERCLIP", "WIRE", "LOOP", "BEND"],
    tape: ["TAPE", "SEAM", "EDGE", "STRIP"],
    chalk: ["CHALK", "DUST", "MARK", "LINE"],
    glove: ["GLOVE", "PALM", "HAND", "FABRIC"],
    button: ["BUTTON", "CLICK", "CIRCLE", "FASTENER"]
  };

  const verbMap = {
    lamp: ["BREATHES", "GLOWS", "LEARNS", "WAITS"],
    mirror: ["REMEMBERS", "RETURNS", "DOUBLES", "WATCHES"],
    desk: ["KEEPS", "HOLDS", "ABSORBS", "LISTENS"],
    radio: ["WHISPERS", "HUMS", "RETURNS", "CALLS"],
    clock: ["WAITS", "COUNTS", "TURNS", "LINGERS"],
    key: ["UNLOCKS", "WAITS", "TURNS", "ADMITS"],
    map: ["UNFOLDS", "BENDS", "POINTS", "DRIFTS"],
    candle: ["FLICKERS", "WAITS", "SOFTENS", "BURNS"],
    plant: ["GROWS", "BENDS", "LEARNS", "DRINKS"],
    feather: ["DRIFTS", "TREMBLES", "FLOATS", "LISTENS"],
    shell: ["KEEPS", "ECHOES", "HOLDS", "RETURNS"],
    coin: ["TURNS", "GLINTS", "WAITS", "SPINS"],
    marble: ["ROLLS", "SHIFTS", "WAITS", "GLEAMS"],
    lens: ["FOCUSES", "BENDS", "SHARPENS", "LEARNS"],
    needle: ["PIERCES", "CATCHES", "TIGHTENS", "POINTS"],
    ribbon: ["TANGLES", "TIES", "SOFTENS", "LOOPS"],
    stone: ["SETTLES", "WAITS", "KEEPS", "SINKS"],
    mug: ["HOLDS", "WAITS", "WARMS", "KEEPS"],
    paperclip: ["BENDS", "HOLDS", "LOOPS", "CATCHES"],
    tape: ["SEALS", "HOLDS", "BINDS", "KEEPS"],
    chalk: ["MARKS", "DUSTS", "FADES", "WRITES"],
    glove: ["HOLDS", "SOFTENS", "WAITS", "KEEPS"],
    button: ["CLICKS", "FASTENS", "WAITS", "HOLDS"]
  };

  const endingMap = {
    lamp: ["IN GREEN LIGHT", "AFTER YOU", "UNDER STATIC"],
    mirror: ["UNDER GLASS", "AFTER YOU", "IN A SECOND VOICE"],
    desk: ["LIKE A MEMORY", "UNDER PRESSURE", "IN WOOD GRAIN"],
    radio: ["IN STATIC", "BETWEEN SIGNALS", "WITHOUT PERMISSION"],
    clock: ["AFTER HOURS", "BETWEEN TICKS", "WITHOUT MERCY"],
    key: ["AT THE THRESHOLD", "WITHOUT A DOOR", "IN THE LOCK"],
    map: ["WITHOUT A NORTH", "IN PAPER LIGHT", "TOWARD THE EXIT"],
    candle: ["IN SOFT WAX", "BEFORE THE DARK", "IN SMALL HEAT"]
  };

  const genericSubjects = [
    "THE ROOM",
    "A SMALL LOOP",
    "THE SIGNAL",
    "THE PATTERN",
    "A QUIET MACHINE",
    "THE OBJECTS"
  ];

  const genericVerbs = [
    "REMEMBERS",
    "WAITS",
    "LISTENS",
    "LEARNS",
    "SHIFTS",
    "RETURNS"
  ];

  const genericEndings = [
    "AFTER YOU",
    "IN GREEN LIGHT",
    "UNDER STATIC",
    "WITHOUT A NAME",
    "IN THE QUIET ROOM",
    "BETWEEN WORDS"
  ];

  const first = touched[0] || null;
  const second = touched[1] || null;
  const last = touched.length ? touched[touched.length - 1] : null;

  const firstNouns = first && nounMap[first] ? nounMap[first] : genericSubjects;
  const secondNouns = second && nounMap[second] ? nounMap[second] : genericSubjects;
  const lastVerbs = last && verbMap[last] ? verbMap[last] : genericVerbs;
  const firstEndings = first && endingMap[first] ? endingMap[first] : genericEndings;

  const style = Math.floor(rand() * 4);

  if (style === 0) {
    return `${pickFrom(firstNouns, rand)} ${pickFrom(lastVerbs, rand)}`;
  }
  if (style === 1) {
    return `${pickFrom(firstNouns, rand)} ${pickFrom(lastVerbs, rand)} ${pickFrom(firstEndings, rand)}`;
  }
  if (style === 2) {
    return `${pickFrom(firstNouns, rand)} AND ${pickFrom(secondNouns, rand)}`;
  }
  return `${pickFrom(genericSubjects, rand)} OF ${pickFrom(firstNouns, rand)}`;
}

function updateControlsPanel() {
  if (!controlsContentEl) return;

  if (mode === "boot") {
    controlsContentEl.innerHTML = [
      `<div><span class="control-label">Status:</span> Initializing observer</div>`,
      `<div><span class="control-label">Please Wait:</span> The room is assembling</div>`
    ].join("");
    return;
  }

  if (mode === "menu") {
    controlsContentEl.innerHTML = [
      `<div><span class="control-label">Move:</span> ↑ ↓ or W / S</div>`,
      `<div><span class="control-label">Select:</span> Enter or Space</div>`,
      `<div><span class="control-label">Leave Screen:</span> Esc</div>`
    ].join("");
    return;
  }

  if (mode === "credits") {
    controlsContentEl.innerHTML = [
      `<div><span class="control-label">Return:</span> Esc</div>`,
      `<div><span class="control-label">Also Return:</span> E or Space</div>`
    ].join("");
    return;
  }

  if (showFinalModal) {
    const commonsMode = finalPoemTitle === "POETRY COMMONS";

    controlsContentEl.innerHTML = commonsMode
      ? [
          `<div><span class="control-label">Read Aloud:</span> Space</div>`,
          `<div><span class="control-label">Close:</span> Esc</div>`,
          `<div><span class="control-label">Refresh Poems:</span> Use button</div>`
        ].join("")
      : [
          `<div><span class="control-label">Speak Final:</span> Space</div>`,
          `<div><span class="control-label">Close:</span> Esc or E</div>`,
          `<div><span class="control-label">Restart:</span> R</div>`
        ].join("");
    return;
  }

  if (showActPoemModal) {
    controlsContentEl.innerHTML = [
      `<div><span class="control-label">Read Aloud:</span> Space</div>`,
      `<div><span class="control-label">Close:</span> Esc or E</div>`,
      `<div><span class="control-label">Restart:</span> R</div>`
    ].join("");
    return;
  }

  if (mode === "focus") {
    controlsContentEl.innerHTML = [
      `<div><span class="control-label">Inspect:</span> Mouse Wheel zoom</div>`,
      `<div><span class="control-label">Interact:</span> E</div>`,
      `<div><span class="control-label">Close:</span> Esc</div>`,
      `<div><span class="control-label">Find Door:</span> Q</div>`,
      `<div><span class="control-label">Restart:</span> R</div>`
    ].join("");
    return;
  }

  controlsContentEl.innerHTML = [
    `<div><span class="control-label">Move:</span> WASD or Arrows</div>`,
    `<div><span class="control-label">Interact:</span> E</div>`,
    `<div><span class="control-label">Zoom:</span> Mouse Wheel</div>`,
    `<div><span class="control-label">Close:</span> Esc</div>`,
    `<div><span class="control-label">Find Door:</span> Q</div>`,
    `<div><span class="control-label">Restart:</span> R</div>`
  ].join("");
}

function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/* ==========================================================
   UI PROMPT
========================================================== */
function updateUI() {
  if (!promptEl) return;

  updateControlsPanel();

  promptEl.classList.remove("urgent");

  if (mode === "boot") {
    return;
  }

  if (mode === "menu") {
    return;
  }

  if (mode === "credits") {
    return;
  }

  const actTitle = (act === 3) ? "ACT 3" : ((act === 2) ? "ACT 2" : "ACT 1");
  const signalLine = (signal > 0)
    ? ("SIGNAL " + signal + "/6: withheld words unlocked.")
    : "No SIGNAL yet: SIG nodes are withheld words.";

  let subtitle = "";

  if (showFinalModal) {
    subtitle = "Final poem. ESC closes. R restarts. Space speaks.";
  } else if (mode === "focus") {
    if (focusId === "door" && canFinalizePoem()) subtitle = "Door ready. Press E to seal. Mouse wheel zoom.";
    else subtitle = "Focus view. Mouse wheel zoom. E or ESC closes. Q pings door.";
  } else if (paused) {
    subtitle = "Paused. ESC returns. R restarts.";
  } else {
    const nonDoorCount = history.filter(h => h !== "door").length;
    const need = Math.max(0, 2 - nonDoorCount);
    const near = pickInteractTarget();
    const inRange = near.s && near.d <= INTERACT_RADIUS;

    if (act === 1) {
      if (inRange && need > 0 && near.s && near.s.id === "door") {
        subtitle = "The door wants more. Find " + need + " more object(s).";
        promptEl.classList.add("urgent");
      } else if (need > 0) {
        subtitle = "Explore. Find " + need + " more object(s). Hidden SIG nodes deepen SIGNAL.";
        promptEl.classList.add("urgent");
      } else if (!history.includes("door")) {
        subtitle = "You have enough lines. Find the door. Press Q to ping it.";
      } else {
        subtitle = "Return to the door. View it and press E to continue.";
      }
    } else if (act === 2) {
      const needSig = Math.max(0, 2 - act2SigCollected);
      if (!act2Calibrated) {
        const nextId = getNextCalibrationId();
        subtitle = "Set the sequence: " + formatSequence(act2TargetSeq) + ". Next: " + formatItemName(nextId) + ". Then find " + needSig + " SIG.";
      } else {
        subtitle = "Calibration complete. Find " + needSig + " SIG, then return to the door.";
      }
      if (!act2Calibrated || needSig > 0) promptEl.classList.add("urgent");
    } else {
      const nextObj = getNextAct3Target();
      if (nextObj) {
        subtitle = "Revisit " + formatItemName(nextObj.id) + ". Then return to the door.";
        promptEl.classList.add("urgent");
      } else {
        subtitle = "All revisions complete. Return to the door and seal the poem.";
      }
    }
  }

  promptEl.innerHTML = `
    <div class="act-left">
      <div class="act-title">${esc(actTitle)}</div>
    </div>
    <div class="act-right">
      <div class="act-signal">${esc(signalLine)}</div>
      <div class="act-sub">${esc(subtitle)}</div>
    </div>
  `;
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
  const put = (x, y, c = ON) => px(x, y, c);
  const row = (x0, x1, y, c = ON) => { for (let x = x0; x <= x1; x += 2) put(x, y, c); };
  const col = (x, y0, y1, c = ON) => { for (let y = y0; y <= y1; y += 2) put(x, y, c); };

  if (id === "lamp") {
    px(10, 18); px(12, 18); px(14, 18);
    px(12, 16); px(12, 14);
    for (let x = 6; x <= 16; x += 2) px(x, 10, DIM);
    for (let x = 8; x <= 14; x += 2) px(x, 8, DIM);
    px(10, 6, DIM); px(12, 6, DIM);
    px(12, 12); px(10, 12, DIM); px(14, 12, DIM);

  } else if (id === "mirror") {
    row(6, 16, 6);
    row(6, 16, 16);
    col(6, 8, 14);
    col(16, 8, 14);
    for (let y = 8; y <= 14; y += 2) for (let x = 8; x <= 14; x += 2) px(x, y, DIM);

  } else if (id === "desk") {
    row(4, 18, 10);
    row(6, 16, 12);
    col(6, 14, 20, DIM);
    col(16, 14, 20, DIM);

  } else if (id === "door") {
    col(10, 4, 18);
    col(12, 4, 18);
    col(14, 4, 18);
    col(8, 4, 18, DIM);
    col(16, 4, 18, DIM);
    px(16, 12);

  } else {
    switch (id) {
      case "mug":
        row(8, 14, 10);
        row(8, 14, 12);
        row(8, 14, 14);
        col(8, 10, 14);
        col(14, 10, 14);
        put(16, 12, DIM);
        put(16, 14, DIM);
        break;

      case "paperclip":
        row(8, 14, 8, DIM);
        row(8, 12, 16, DIM);
        col(8, 8, 16, DIM);
        col(14, 8, 14, DIM);
        col(12, 10, 16);
        row(10, 12, 10);
        break;

      case "tape":
        row(8, 16, 10);
        row(8, 16, 14);
        col(8, 10, 14);
        col(16, 10, 14);
        row(10, 14, 12, DIM);
        break;

      case "coin":
      case "button":
      case "marble":
        row(10, 14, 8);
        row(8, 16, 10);
        row(8, 16, 12);
        row(8, 16, 14);
        row(10, 14, 16);
        if (id === "button") {
          put(10, 12, DIM); put(14, 12, DIM);
        }
        break;

      case "feather":
        col(12, 6, 16, DIM);
        put(10, 8); put(14, 10); put(10, 12); put(14, 14); put(10, 16);
        break;

      case "chalk":
        row(8, 16, 12, DIM);
        put(6, 12);
        put(18, 12);
        break;

      case "glove":
        row(8, 14, 14);
        row(8, 12, 12);
        col(8, 14, 18);
        put(14, 10); put(16, 10); put(18, 12);
        break;

      case "radio":
        row(6, 16, 10);
        row(6, 16, 14);
        col(6, 10, 14);
        col(16, 10, 14);
        put(10, 12, DIM); put(12, 12, DIM);
        put(18, 8, DIM);
        row(8, 14, 16, DIM);
        break;

      case "plant":
        col(12, 12, 18, DIM);
        put(10, 10); put(14, 10);
        put(8, 12); put(16, 12);
        row(10, 14, 18);
        break;

      case "candle":
        col(12, 8, 16);
        row(10, 14, 16, DIM);
        put(12, 6, DIM);
        break;

      case "ribbon":
        put(10, 10); put(14, 10);
        put(12, 12, DIM);
        put(10, 14); put(14, 14);
        put(8, 16, DIM); put(16, 16, DIM);
        break;

      case "shell":
        row(8, 16, 14, DIM);
        row(10, 14, 12);
        row(12, 12, 10);
        put(8, 16, DIM); put(16, 16, DIM);
        break;

      case "clock":
        row(10, 14, 8);
        row(8, 16, 10);
        row(8, 16, 12);
        row(8, 16, 14);
        row(10, 14, 16);
        put(12, 12, DIM);
        put(12, 10);
        put(14, 12);
        break;

      case "lens":
        row(10, 14, 8);
        row(8, 16, 10);
        row(8, 16, 12);
        row(8, 16, 14);
        row(10, 14, 16);
        put(16, 16, DIM); put(18, 18, DIM);
        break;

      case "needle":
        row(8, 16, 12);
        put(18, 12, DIM);
        put(6, 12, DIM);
        break;

      case "map":
        row(8, 16, 8);
        row(8, 16, 16);
        col(8, 8, 16);
        col(16, 8, 16);
        col(12, 8, 16, DIM);
        break;

      case "stone":
        row(10, 14, 10, DIM);
        row(8, 16, 12, DIM);
        row(8, 16, 14, DIM);
        row(10, 14, 16, DIM);
        break;

      case "key":
        put(10, 12, DIM); put(12, 10, DIM); put(14, 12, DIM); put(12, 14, DIM);
        row(14, 18, 12);
        put(18, 14, DIM);
        put(16, 16, DIM);
        break;

      default:
        row(10, 14, 12);
        row(10, 14, 14, DIM);
        row(10, 14, 16);
        break;
    }
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
    return g;
  }

  if (id === "mirror") {
    const step = frameCount % 16;
    const x = 8 + (step % 4) * 2;
    const y = 8 + Math.floor(step / 4) * 2;
    px(x, y, HOT);
    px(x + 2, y + 2, DIM);
    return g;
  }

  if (id === "desk") {
    const y = (frameCount % 10 < 5) ? 10 : 12;
    for (let x = 6; x <= 16; x += 2) px(x, y, DIM);
    return g;
  }

  if (id === "door") {
    const blink = (frameCount % 20 < 3);
    if (blink) px(16, 12, HOT);
    if (frameCount % 18 < 9) { px(8, 8, DIM); px(16, 8, DIM); }
    return g;
  }

  // Decor gleam: slower and subtler than mirror/lamp
  const seed = idHash(id);
  const phase = (frameCount + (seed % 97)) % 24;
  const blink = ((frameCount + (seed % 41)) % 42) < 4;

  switch (id) {
    case "mug":
      if (blink) { px(12, 10, HOT); px(14, 10, DIM); }
      break;
    case "paperclip":
      px(10 + (phase % 4) * 2, 8 + Math.floor((phase % 8) / 2) * 2, HOT);
      break;
    case "tape":
      if (blink) px(12, 12, HOT);
      break;
    case "coin":
    case "marble":
    case "button":
    case "clock":
    case "lens":
      px(8 + (phase % 5) * 2, 8 + ((phase + 1) % 5) * 2, HOT);
      break;
    case "feather":
      px(10, 8 + (phase % 5) * 2, HOT);
      break;
    case "chalk":
      if (blink) { px(8, 12, HOT); px(16, 12, HOT); }
      break;
    case "glove":
      if (blink) px(14, 10, HOT);
      break;
    case "radio":
      if (frameCount % 18 < 9) px(10, 12, HOT);
      else px(12, 12, HOT);
      break;
    case "plant":
      px(8 + (phase % 3) * 4, 10, HOT);
      break;
    case "candle":
      if (frameCount % 10 < 5) px(12, 6, HOT);
      else px(12, 4, HOT);
      break;
    case "ribbon":
      px((frameCount % 14 < 7) ? 10 : 14, 10, HOT);
      break;
    case "shell":
      if (blink) px(12, 10, HOT);
      break;
    case "needle":
      px(18, 12, HOT);
      break;
    case "map":
      px((frameCount % 12 < 6) ? 8 : 16, 8, HOT);
      break;
    case "stone":
      if (blink) px(12, 12, HOT);
      break;
    case "key":
      if (blink) { px(10, 12, HOT); px(18, 12, HOT); }
      break;
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
  if (!audioArmed || !musicOn || !music.lead || !music.bass || !music.hatOsc || !music.filter) return;

  // MENU / CREDITS / BOOT MUSIC
  if (mode === "menu" || mode === "boot" || mode === "credits") {
    music.speedSmoothed = lerp(music.speedSmoothed || 0, 0, 0.08);
    music._energySmoothed = lerp(music._energySmoothed || 0, 0.12, 0.08);

    music.bpm = lerp(music.bpm || 54, 54, 0.08);

    const t = millis();
    const stepMs = 60000 / music.bpm;
    if (t - music.lastStepAt < stepMs) return;
    music.lastStepAt = t;

    music.step = (music.step + 1) % 16;

    const scale = [0, 3, 7, 10];
    const root = 146.83;

    const leadDeg = scale[music.step % scale.length];
    const leadF = root * Math.pow(2, leadDeg / 12);

    const bassPattern = [0,0,0,0, 3,3,0,0, 7,7,3,3, 0,0,10,10];
    const bassDeg = bassPattern[music.step];
    const bassF = (root / 2) * Math.pow(2, bassDeg / 12);

    music.lead.freq(leadF);
    music.bass.freq(bassF);

    music.lead.amp(0.045, 0.12);
    music.bass.amp(0.035, 0.12);

    let hatAmp = 0;
    if (music.step === 4 || music.step === 12) hatAmp = 0.03;

    music.hatOsc.freq(1200);
    music.hatOsc.amp(hatAmp, 0.01);
    music.hatOsc.amp(0, 0.08);

    music.filter.freq(1100 + 180 * sin(millis() * 0.0007));
    return;
  }

  // WORLD / FOCUS MUSIC
  const targetSpeed  = (mode === "world" && !paused && !showFinalModal) ? (player.speed01 || 0) : 0;
  const targetEnergy = (mode === "world" && !paused && !showFinalModal) ? (player.energy || 0) : 0;

  music.speedSmoothed = lerp(music.speedSmoothed || 0, targetSpeed, 0.10);
  music._energySmoothed = lerp(music._energySmoothed || 0, targetEnergy, 0.12);

  const groove = music.speedSmoothed || 0;
  const energy = music._energySmoothed || 0;
  const drive  = constrain(groove * 0.85 + energy * 0.55, 0, 1);

  music.bpm = lerp(music.bpmBase, music.bpmBase + 38, drive);

  const t = millis();
  const stepMs = 60000 / music.bpm;
  if (t - music.lastStepAt < stepMs) return;
  music.lastStepAt = t;

  music.step = (music.step + 1) % 16;

  const scale = [0, 2, 4, 7, 9, 12];
  const root = 220;

  const leadDeg = scale[music.step % scale.length];
  const leadF = root * Math.pow(2, leadDeg / 12);

  const bassPattern = [0,0,0,0, 4,4,0,0, 7,7,4,4, 0,0,9,9];
  const bassDeg = bassPattern[music.step];
  const bassF = (root / 2) * Math.pow(2, bassDeg / 12);

  const leadAmp = 0.030 + 0.12 * drive;
  const bassAmp = 0.025 + 0.11 * drive;

  music.lead.freq(leadF);
  music.bass.freq(bassF);

  music.lead.amp(leadAmp, 0.03);
  music.bass.amp(bassAmp, 0.03);

  let hatAmp = 0;
  if (music.step % 2 === 1) hatAmp += 0.08;
  if (drive > 0.55 && (music.step === 6 || music.step === 14)) hatAmp += 0.07;
  if (music.step === 4 || music.step === 12) hatAmp += 0.10 * (0.4 + 0.6 * energy);

  const hatF = 1800 + 1200 * drive;
  music.hatOsc.freq(hatF);

  music.hatOsc.amp(hatAmp, 0.005);
  music.hatOsc.amp(0, 0.03);

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
function pickBestVoice() {
  if (!window.speechSynthesis) return null;
  const voices = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
  if (!voices || !voices.length) return null;

  const preferred = voices.find(v => /en/i.test(v.lang || "") && /female|zira|samantha|victoria|karen|moira/i.test(v.name || ""));
  if (preferred) return preferred;

  const english = voices.find(v => /en/i.test(v.lang || ""));
  return english || voices[0] || null;
}

function speakText(txt) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  stopTTS();

  const cleanText = String(txt || "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\n+/g, " ... ")
    .replace(/\.{4,}/g, "...")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voice = pickBestVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  utterance.pitch = 0.96;
  utterance.volume = 1;
  utterance.onend = () => {
    speaking = false;
    currentUtterance = null;
  };
  utterance.onerror = () => {
    speaking = false;
    currentUtterance = null;
  };

  currentUtterance = utterance;
  speaking = true;
  speechSynthesis.speak(utterance);
}

function speakPoetryCommons() {
  if (!leaderboardEntries || !leaderboardEntries.length) {
    speakText("Poetry Commons is empty right now.");
    return;
  }

  const text = leaderboardEntries
    .slice(0, 8)
    .map((entry, index) => {
      const title = String(entry.title || "Untitled Poem").trim();
      const name = String(entry.name || "anonymous observer").trim();
      const body = String(entry.text || "").trim()
        .replace(/\n+/g, "... ")
        .replace(/\s+\./g, ".")
        .replace(/\s+,/g, ",");
      return `Poem ${index + 1}. ${title}. By ${name}. ${body}`;
    })
    .join(" ... ");

  if (text.length > 0) {
    speakText(text);
  }
}

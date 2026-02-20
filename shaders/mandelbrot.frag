#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

varying vec2 vTexCoord;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_center;
uniform float u_zoom;
uniform float u_iter;
uniform float u_warp;

// screensaver controls
uniform float u_grow;       // 0..~1 outward growth
uniform float u_palette;    // 0..1 palette phase

// Object positions in UV space (0..1)
uniform vec2 u_obj1;
uniform vec2 u_obj2;
uniform vec2 u_obj3;
uniform vec2 u_obj4;

// Per-object strength (0..1 recommended)
uniform vec4 u_objStrength;

const float TAU = 6.28318530718;

float saturate(float x) { return clamp(x, 0.0, 1.0); }

// Bright “screensaver” cosine palette
vec3 palette(float t, float phase) {
  // t expected 0..1
  vec3 a = vec3(0.10, 0.10, 0.12);
  vec3 b = vec3(0.65, 0.55, 0.95);
  vec3 c = vec3(1.00, 0.85, 0.65);
  vec3 d = vec3(0.00, 0.33, 0.67);
  return a + b * cos(TAU * (c * (t + phase) + d));
}

float objField(vec2 uv) {
  // Distance-based glow fields around objects
  float d1 = distance(uv, u_obj1);
  float d2 = distance(uv, u_obj2);
  float d3 = distance(uv, u_obj3);
  float d4 = distance(uv, u_obj4);

  float f1 = u_objStrength.x * exp(-d1 * 10.0);
  float f2 = u_objStrength.y * exp(-d2 * 10.0);
  float f3 = u_objStrength.z * exp(-d3 * 10.0);
  float f4 = u_objStrength.w * exp(-d4 * 10.0);

  return f1 + f2 + f3 + f4;
}

void main() {
  // vTexCoord is usually 0..1 in p5 passthrough.vert
  vec2 uv = vTexCoord;

  // Safety: avoid divide-by-zero if resolution is weird during resize
  vec2 res = max(u_resolution, vec2(1.0, 1.0));
  float aspect = res.x / res.y;

  // Object reaction field
  float field = objField(uv);

  // Centered coordinates w/ aspect correction
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // --- SCREENSAVER "GROW OUTWARD" ---
  float r = length(p);
  float edgeBoost = smoothstep(0.15, 0.95, r);

  float ripple = sin(r * 10.0 - u_time * 1.2) * 0.012;
  float growWave = 1.0 + u_grow * (0.10 + 0.06 * sin(u_time * 0.45)) + ripple;

  // stronger near edges
  p *= mix(1.0, growWave, edgeBoost);

  // --- Warp (stronger near objects) ---
  float tt = u_time * 0.25;
  float wobble = sin(tt + p.x * 2.0) * cos(tt * 1.35 + p.y * 2.0);

  float warpAmt = (u_warp + field * 0.9);
  p += warpAmt * 0.02 * vec2(wobble, -wobble);

  // Subtle drift so it never feels static
  vec2 drift = 0.020 * vec2(cos(u_time * 0.10), sin(u_time * 0.085));

  // Complex plane coordinate
  float zzoom = max(u_zoom, 0.0001);
  vec2 cplx = u_center + drift + (p / zzoom);

  // Mandelbrot
  vec2 z = vec2(0.0);
  float escaped = 0.0;
  float m = 0.0;

  // Clamp iterations to a safe integer range for WebGL1
  float iterF = clamp(u_iter, 1.0, 700.0);
  int maxIter = int(iterF + 0.5);

  // Fixed upper bound loop is the safest pattern in GLSL ES 1.00
  for (int j = 0; j < 700; j++) {
    if (j >= maxIter) break;

    // z = z^2 + c
    float x = (z.x * z.x - z.y * z.y) + cplx.x;
    float y = (2.0 * z.x * z.y) + cplx.y;
    z = vec2(x, y);

    float r2 = dot(z, z);
    if (r2 > 16.0) {
      escaped = 1.0;

      // Smooth iteration count (guard against log issues)
      float safeR2 = max(r2, 1.000001);
      float log_zn = 0.5 * log(safeR2);
      float nu = log(max(log_zn / log(2.0), 1e-6)) / log(2.0);

      m = float(j) + 1.0 - nu;
      break;
    }
  }

  if (escaped < 0.5) {
    m = float(maxIter);
  }

  float n = m / iterF;         // normalized 0..1-ish
  n = saturate(n);

  // Palette cycling
  vec3 col = palette(n, fract(u_palette));

  // Interior shading
  if (escaped < 0.5) col *= 0.12;

  // Edge glow
  float edge = pow(1.0 - n, 2.3);
  col += edge * vec3(0.15, 0.25, 0.45);

  // Extra neon pop toward edges
  col += edgeBoost * 0.12;

  // Object glow and contrast
  col += field * vec3(0.20, 0.12, 0.32);
  col = mix(col, pow(col, vec3(0.82)), saturate(field));

  // Gentle gamma
  col = pow(col, vec3(0.95));

  gl_FragColor = vec4(col, 1.0);
}
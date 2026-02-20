#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_center;
uniform float u_zoom;
uniform float u_iter;
uniform float u_warp;

// NEW: screensaver controls
uniform float u_grow;       // 0..1 amount of outward growth effect
uniform float u_palette;    // palette phase 0..1

// Object positions in UV space (0..1)
uniform vec2 u_obj1;
uniform vec2 u_obj2;
uniform vec2 u_obj3;
uniform vec2 u_obj4;

// Per-object strength
uniform vec4 u_objStrength;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

// Palette: cosine palette with phase shifting (screensaver vibes)
vec3 palette(float t, float phase) {
  // "2000s screensaver" bright neon-ish
  vec3 a = vec3(0.10, 0.10, 0.12);
  vec3 b = vec3(0.65, 0.55, 0.95);
  vec3 c = vec3(1.00, 0.85, 0.65);
  vec3 d = vec3(0.00, 0.33, 0.67);

  // phase rotates the hues
  return a + b * cos(6.2831853 * (c * (t + phase) + d));
}

void main() {
  vec2 uv = vTexCoord;

  // Object reaction field
  float d1 = distance(uv, u_obj1);
  float d2 = distance(uv, u_obj2);
  float d3 = distance(uv, u_obj3);
  float d4 = distance(uv, u_obj4);

  float f1 = u_objStrength.x * exp(-d1 * 10.0);
  float f2 = u_objStrength.y * exp(-d2 * 10.0);
  float f3 = u_objStrength.z * exp(-d3 * 10.0);
  float f4 = u_objStrength.w * exp(-d4 * 10.0);

  float field = f1 + f2 + f3 + f4;

  // Center coords with aspect correction
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

  // --- SCREENSAVER "GROW OUTWARD" ---
  // Radial distance from center
  float r = length(p);

  // A slow expanding ripple (like screensaver bloom)
  float ripple = sin(r * 10.0 - u_time * 1.2) * 0.012;

  // Outward push: expand p away from center over time
  // This creates the feeling of the fractal "growing outward"
  float growWave = 1.0 + u_grow * (0.10 + 0.06 * sin(u_time * 0.45)) + ripple;

  // Apply outward growth (stronger near edges, classic screensaver)
  float edgeBoost = smoothstep(0.15, 0.95, r);
  p *= mix(1.0, growWave, edgeBoost);

  // --- Warp (stronger near objects) ---
  float tt = u_time * 0.25;
  float wobble = sin(tt + p.x * 2.0) * cos(tt * 1.35 + p.y * 2.0);
  float warpAmt = (u_warp + field * 0.9);
  p += warpAmt * 0.02 * vec2(wobble, -wobble);

  // Slight drift so it never "stops"
  vec2 drift = 0.020 * vec2(cos(u_time * 0.10), sin(u_time * 0.085));

  // Complex plane coordinate
  vec2 cplx = u_center + drift + (p / u_zoom);

  // Mandelbrot iteration
  vec2 z = vec2(0.0);
  float m = 0.0;
  float escaped = 0.0;

  int maxIter = int(u_iter);

  for (int j = 0; j < 700; j++) {
    if (j >= maxIter) break;

    float x = (z.x * z.x - z.y * z.y) + cplx.x;
    float y = (2.0 * z.x * z.y) + cplx.y;
    z = vec2(x, y);

    float r2 = dot(z, z);
    if (r2 > 16.0) {
      escaped = 1.0;

      // Smooth iteration count
      float log_zn = log(r2) / 2.0;
      float nu = log(log_zn / log(2.0)) / log(2.0);

      m = float(j) + 1.0 - nu;
      break;
    }
  }

  if (escaped < 0.5) {
    m = float(maxIter);
  }

  float n = m / u_iter;

  // Palette cycling using u_palette phase
  vec3 col = palette(n, u_palette);

  // Interior shading
  if (escaped < 0.5) col *= 0.12;

  // Edge glow (screensaver glow)
  float edge = pow(1.0 - n, 2.3);
  col += edge * vec3(0.15, 0.25, 0.45);

  // Extra neon pop toward edges
  col += edgeBoost * 0.12;

  // Object glow and contrast
  col += field * vec3(0.20, 0.12, 0.32);
  col = mix(col, pow(col, vec3(0.82)), clamp(field, 0.0, 1.0));

  // Gentle gamma
  col = pow(col, vec3(0.95));

  gl_FragColor = vec4(col, 1.0);
}
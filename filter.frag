#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

varying vec2 vTexCoord;

uniform sampler2D u_tex0;     // base image (linocut)
uniform sampler2D u_tex1;     // fractal texture (distortion + overlay)
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_amount;       // effect strength
uniform float u_fractMix;     // how much fractal contributes

float rand(vec2 co){
  return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vTexCoord;

  // Use fractal as a distortion map
  vec3 f = texture2D(u_tex1, uv).rgb;

  // Signed flow vector from fractal
  vec2 flow = (f.rg - 0.5) * 2.0;

  // Distortion
  float wob = sin(u_time * 2.0 + uv.y * 18.0) * 0.0015;
  vec2 duv = uv + (flow * 0.018 * u_amount * u_fractMix) + vec2(wob, 0.0);

  // Scanline wobble
  float scan = sin((duv.y * u_resolution.y) * 0.06 + u_time * 6.0) * 0.002 * u_amount;
  duv.x += scan;

  // Chromatic split (subtle)
  float ca = 0.0025 * u_amount;
  float r = texture2D(u_tex0, duv + vec2(ca, 0.0)).r;
  float g = texture2D(u_tex0, duv).g;
  float b = texture2D(u_tex0, duv + vec2(-ca, 0.0)).b;
  vec3 col = vec3(r, g, b);

  // Fractal shimmer overlay
  vec3 fractOverlay = f * 0.35;
  col = mix(col, col + fractOverlay, 0.25 * u_fractMix);

  // Grain
  float grain = (rand(duv + u_time) - 0.5) * 0.10 * u_amount;
  col += grain;

  // Vignette
  vec2 p = duv - 0.5;
  float v = smoothstep(0.82, 0.18, dot(p, p));
  col *= v;

  gl_FragColor = vec4(col, 1.0);
}
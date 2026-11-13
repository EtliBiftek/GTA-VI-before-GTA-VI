// Final fullscreen pass: exposure + ACES filmic tone mapping + colour grade (S-curve, split toning, saturation) +
// vignette + film grain, with optional edge chromatic aberration, CAS-like sharpen and sun god-rays (high).
// Replaces OutputPass (does the sRGB conversion itself).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`
precision highp float;
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
attribute vec3 position; attribute vec2 uv; varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform float uVignette, uGrain, uTime, uSat, uContrast, uAberr, uSharpen, uRays, uNight;
uniform vec2 uTexel, uSunUV; uniform vec3 uCool, uWarm, uRayCol;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p+19.19); return fract(p.x*p.y); }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
void main(){
  vec2 uv = vUv; vec3 col;
  #ifdef HIGH
    vec2 dc = uv - 0.5; float r2 = dot(dc,dc);
    vec2 off = dc * r2 * uAberr;
    col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
    if (uSharpen > 0.0) {
      vec3 a = texture2D(tDiffuse, uv + vec2(0.0, uTexel.y)).rgb, b = texture2D(tDiffuse, uv - vec2(0.0, uTexel.y)).rgb;
      vec3 c = texture2D(tDiffuse, uv + vec2(uTexel.x, 0.0)).rgb, d = texture2D(tDiffuse, uv - vec2(uTexel.x, 0.0)).rgb;
      vec3 mn = min(min(a,b), min(c,d)), mx = max(max(a,b), max(c,d));
      vec3 blur = (a+b+c+d)*0.25;
      vec3 sharp = col + (col - blur) * uSharpen;
      col = clamp(sharp, min(mn, col), max(mx, col));
    }
    if (uRays > 0.001) {
      vec2 dir = (uSunUV - uv); float dl = length(dir);
      vec2 stepv = dir / 14.0 * 0.85; vec2 p = uv; vec3 acc = vec3(0.0); float w = 1.0;
      for (int i = 0; i < 14; i++) {
        p += stepv; vec3 s = texture2D(tDiffuse, p).rgb;
        float l = max(luma(s) - 1.6, 0.0);
        acc += min(l, 6.0) * w; w *= 0.93;
      }
      col += uRayCol * acc * (uRays / 14.0) * (1.0 - smoothstep(0.2, 1.4, dl));
    }
  #else
    col = texture2D(tDiffuse, uv).rgb;
  #endif
  col = ACESFilmicToneMapping(col);
  // split toning: cool shadows, warm highlights, then gentle saturation
  float l = luma(col);
  col *= mix(uCool, uWarm, smoothstep(0.1, 0.75, l));
  col = mix(vec3(l), col, uSat);
  col = clamp(col, 0.0, 1.0);
  col = sRGBTransferOETF(vec4(col, 1.0)).rgb;
  // S-curve contrast in display space
  col = mix(col, col*col*(3.0-2.0*col), uContrast);
  // vignette
  vec2 q = vUv - 0.5; q.x *= 1.15;
  col *= 1.0 - uVignette * smoothstep(0.25, 0.95, length(q) * 1.25);
  // film grain (stronger in shadows) + dither
  float g = hash(vUv * (1.0/uTexel) + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain * (1.0 - 0.6*luma(col)) + (hash(vUv*1733.1 + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

export class GradePass extends Pass {
  constructor(renderer, high) {
    super();
    this.renderer = renderer;
    this.material = new THREE.RawShaderMaterial({
      name: 'GradeShader',
      defines: high ? { HIGH: '', ACES_FILMIC_TONE_MAPPING: '' } : { ACES_FILMIC_TONE_MAPPING: '' },
      uniforms: {
        tDiffuse: { value: null }, toneMappingExposure: { value: 1 },
        uVignette: { value: 0.22 }, uGrain: { value: 0.025 }, uTime: { value: 0 }, uSat: { value: 1.06 }, uContrast: { value: 0.3 },
        uAberr: { value: 0.012 }, uSharpen: { value: 0.18 }, uRays: { value: 0 }, uNight: { value: 0 },
        uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
        uCool: { value: new THREE.Color(0.97, 1.0, 1.04) }, uWarm: { value: new THREE.Color(1.04, 1.0, 0.95) },
        uRayCol: { value: new THREE.Color(1.0, 0.8, 0.55) },
      },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    this.u = this.material.uniforms;
    this.quad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.u.uTexel.value.set(1 / w, 1 / h); }
  render(renderer, writeBuffer, readBuffer) {
    this.u.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}

/**
 * Der Fragment-Shader des Feldgenerators.
 *
 * Statisch, nicht erzeugt: alle Werte kommen als Uniforms herein, die Formanzahl als
 * Zaehler. Damit wird nie im Bedienweg uebersetzt (Spec §4). Die Schleife hat eine
 * konstante Obergrenze und bricht am Zaehler ab -- die uebliche Bauweise fuer
 * GLSL ES 1.00, das keine dynamischen Schleifengrenzen kennt.
 *
 * Die Farbrampe kommt als Textur, weil Lab-Interpolation pro Pixel teuer waere und
 * die Mathematik ein zweites Mal fuehren muesste.
 */

import { FIELD_GLSL } from './field.ts';
import { SHAPE_GLSL } from './shapes.ts';
import { MAX_SHAPES } from './graph.ts';

export const FIELD_VERTEX = `
attribute vec2 _p;
varying vec2 vUv;
void main() {
  gl_Position = vec4(_p, 0.0, 1.0);
  vUv = 0.5 * (_p + vec2(1.0));
}`;

export const FIELD_FRAGMENT = `
precision highp float;
varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;

uniform vec4 uShapeA[${MAX_SHAPES}];
uniform vec4 uShapeB[${MAX_SHAPES}];
uniform int uShapeKind[${MAX_SHAPES}];
uniform int uShapeCount;
uniform int uCombineMode;
uniform float uSmoothness;
uniform int uMirror;

uniform float uSpacing;
uniform float uCurve;
uniform float uHardness;
uniform float uLine;
uniform float uStagger;

uniform sampler2D uRamp;
uniform float uRepeat;
uniform vec3 uBackgroundA;
uniform vec3 uBackgroundB;
uniform float uBackgroundGradient;
uniform vec3 uSeparator;
uniform float uHasSeparator;
uniform float uGlow;

${SHAPE_GLSL}
${FIELD_GLSL}

/**
 * Die Werte kommen herein, nicht der Index.
 *
 * GLSL ES 1.00 erlaubt das Indizieren von Uniform-Arrays nur mit Konstanten oder
 * Schleifenvariablen — ein Funktionsparameter ist beides nicht. Der Zugriff passiert
 * deshalb im Aufrufer, wo der Schleifenindex gilt.
 *
 * halfLength statt half: "half" ist in GLSL ein reserviertes Wort.
 */
float shapeDistance(int kind, vec4 a, vec4 b, vec2 p) {
  if (kind == 1) {
    float halfLength = a.z * 0.5;
    vec2 d = vec2(cos(b.y), sin(b.y)) * halfLength;
    return sdCapsule(p, a.xy - d, a.xy + d, a.w);
  }
  if (kind == 2) {
    return sdRing(p, a.xy, a.z, a.w);
  }
  return sdSuperellipse(p, a.xy, a.zw, b.x, b.y);
}

void main() {
  // Bildkoordinaten in ein seitenverhaeltnistreues System, Ursprung in der Mitte.
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;
  p = fieldMirror(p, uMirror);

  float distance = 1e9;
  for (int i = 0; i < ${MAX_SHAPES}; i++) {
    if (i >= uShapeCount) break;
    float d = shapeDistance(uShapeKind[i], uShapeA[i], uShapeB[i], p);
    if (i == 0) {
      distance = d;
    } else if (uCombineMode == 0) {
      distance = fieldUnion(distance, d);
    } else if (uCombineMode == 1) {
      distance = fieldSubtract(distance, d);
    } else if (uCombineMode == 2) {
      distance = fieldIntersect(distance, d);
    } else {
      distance = fieldSmoothUnion(distance, d, uSmoothness);
    }
  }

  vec3 background = mix(uBackgroundA, uBackgroundB, vUv.y * uBackgroundGradient);

  // Stagger: der Zeitversatz haengt am Bandindex, deshalb erst grob abtasten,
  // dann den Abstand verschieben und noch einmal auswerten.
  vec3 rough = fieldRings(distance, uSpacing, uCurve, uHardness, uLine);
  float shifted = distance - uStagger * rough.x * uSpacing;
  vec3 rings = fieldRings(shifted, uSpacing, uCurve, uHardness, uLine);

  float cycle = max(1.0, uRepeat);
  float t = mod(rings.x, cycle) / max(1.0, cycle - 1.0);
  vec3 banded = texture2D(uRamp, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  vec3 colour = mix(banded, uSeparator, uHasSeparator * step(0.5, rings.z));

  if (distance <= 0.0) {
    gl_FragColor = vec4(colour, 1.0);
    return;
  }

  float falloff = uGlow <= 0.0
    ? 0.0
    : exp(-distance / max(1e-4, uGlow * uSpacing * 4.0));
  gl_FragColor = vec4(mix(background, colour, falloff), 1.0);
}`;

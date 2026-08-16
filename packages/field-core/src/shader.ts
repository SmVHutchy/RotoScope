/**
 * Der Fragment-Shader des Feldgenerators.
 *
 * Statisch, nicht erzeugt: alle Werte kommen als Uniforms herein, die Formanzahl als
 * Zaehler. Damit wird nie im Bedienweg uebersetzt (Spec §4).
 *
 * **GLSL ES 3.00, anders als der Transition-Shader.** ADR 004 haelt ES 1.00 fest,
 * damit die 125 gl-transitions unveraendert laufen -- das gilt fuer deren Shader.
 * Dieser hier ist unser eigener und teilt keinen Code mit ihnen, und er braucht
 * `fwidth` fuer die Kantenglaettung. In ES 1.00 gibt es das nur ueber eine
 * Erweiterung, die WebGL2 nicht anbietet.
 *
 * Die Farbrampe kommt als Textur, weil Lab-Interpolation pro Pixel teuer waere und
 * die Mathematik ein zweites Mal fuehren muesste.
 */

import { FIELD_GLSL } from './field.ts';
import { MAX_COPIES, REPEAT_GLSL } from './repeat.ts';
import { RASTER_GLSL } from './raster.ts';
import { MOTION_GLSL } from './motion.ts';
import { SHAPE_GLSL } from './shapes.ts';
import { MAX_SHAPES } from './graph.ts';

export const FIELD_VERTEX = `#version 300 es
in vec2 _p;
out vec2 vUv;
void main() {
  gl_Position = vec4(_p, 0.0, 1.0);
  vUv = 0.5 * (_p + vec2(1.0));
}`;

export const FIELD_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

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

uniform int uRepeatCount;
uniform vec2 uRepeatOffset;
uniform float uRepeatScale;
uniform float uRepeatRotation;
uniform int uRampSource;

uniform int uRasterMode;
uniform float uRasterCell;
uniform float uRasterAngle;
uniform float uGrain;

uniform float uPhase;
uniform float uDrift;
uniform float uPulse;
uniform float uSpin;
uniform float uWobble;

${SHAPE_GLSL}
${FIELD_GLSL}
${REPEAT_GLSL}
${RASTER_GLSL}
${MOTION_GLSL}

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
  vec3 moved = fieldMotion(p, uPhase, uSpin, uPulse, uWobble);
  p = fieldMirror(moved.xy, uMirror);

  // Aeussere Schleife ueber die Kopien, innere ueber die Formen. Der Kopienindex
  // der naechstgelegenen Kopie faellt mit ab -- die Palette kann ihn lesen (Bild 3).
  float distance = 1e9;
  float nearestCopy = 0.0;

  for (int c = 0; c < ${MAX_COPIES}; c++) {
    if (c >= uRepeatCount) break;
    vec3 transformed = fieldCopyTransform(p, float(c), uRepeatOffset, uRepeatScale, uRepeatRotation);
    vec2 q = transformed.xy;

    float local = 1e9;
    for (int i = 0; i < ${MAX_SHAPES}; i++) {
      if (i >= uShapeCount) break;
      float d = shapeDistance(uShapeKind[i], uShapeA[i], uShapeB[i], q);
      if (i == 0) {
        local = d;
      } else if (uCombineMode == 0) {
        local = fieldUnion(local, d);
      } else if (uCombineMode == 1) {
        local = fieldSubtract(local, d);
      } else if (uCombineMode == 2) {
        local = fieldIntersect(local, d);
      } else {
        local = fieldSmoothUnion(local, d, uSmoothness);
      }
    }

    local *= transformed.z;
    if (local < distance) {
      distance = local;
      nearestCopy = float(c);
    }
  }

  // Stauchung zurueckrechnen; die Baenderwanderung wirkt im Bandraum (siehe field.ts).
  distance = distance * moved.z;
  float driftBands = uDrift * uPhase;

  vec3 background = mix(uBackgroundA, uBackgroundB, vUv.y * uBackgroundGradient);

  // Stagger: der Zeitversatz haengt am Bandindex, deshalb erst grob abtasten,
  // dann den Abstand verschieben und noch einmal auswerten.
  // Kantenglaettung aus der Bildschirmableitung: wie schnell sich der Abstand von
  // einem Pixel zum naechsten aendert. Das ist der uebliche Weg bei Abstandsfeldern
  // und billiger als mehrfaches Abtasten.
  float aa = max(fwidth(distance), 1e-6);

  vec3 rough = fieldRings(distance, uSpacing, uCurve, uHardness, uLine, driftBands, aa);
  float shifted = distance - uStagger * rough.x * uSpacing;
  vec3 rings = fieldRings(shifted, uSpacing, uCurve, uHardness, uLine, driftBands, aa);

  float cycle = max(1.0, uRepeat);
  float t = uRampSource == 1
    ? nearestCopy / max(1.0, float(uRepeatCount) - 1.0)
    : mod(rings.x, cycle) / max(1.0, cycle - 1.0);
  vec3 banded = texture(uRamp, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  vec3 colour = mix(banded, uSeparator, uHasSeparator * step(0.5, rings.z));

  // Auch die Silhouette weich: ein hartes if an der Nullstelle ist die zweite
  // Treppenquelle neben den Bandkanten.
  float inside = 1.0 - smoothstep(-aa, aa, distance);
  float falloff = uGlow <= 0.0
    ? 0.0
    : exp(-max(distance, 0.0) / max(1e-4, uGlow * uSpacing * 4.0));
  vec3 result = mix(mix(background, colour, falloff), colour, inside);

  // Das Raster kommt zuletzt: es liest die fertige Flaeche, nicht das rohe Feld.
  fragColor = vec4(
    fieldRaster(result, background, gl_FragCoord.xy, uRasterMode, uRasterCell, uRasterAngle, uGrain),
    1.0
  );
}`;

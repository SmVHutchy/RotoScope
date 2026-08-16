/**
 * WebGL2-Renderer fuer den Feldgenerator.
 *
 * Der Shader ist statisch (field-core/shader.ts) — hier werden nur Uniforms gesetzt.
 * Damit wird nie im Bedienweg uebersetzt, und ein Reglerzug kostet einen Draw-Call.
 */

import {
  FIELD_FRAGMENT,
  FIELD_VERTEX,
  MAX_SHAPES,
  bakeRamp,
  packShapes,
  COMBINE_INDEX,
  MIRROR_INDEX,
  copyCount,
  RASTER_INDEX,
  type FieldGraph,
} from '@rotoscope/field-core';

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Shader konnte nicht angelegt werden.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Feld-Shader: ${log}`);
  }
  return shader;
}

export class FieldRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private rampTex: WebGLTexture;
  private locations = new Map<string, WebGLUniformLocation | null>();
  private rampKey = '';

  constructor(private canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: der Export liest den Canvas aus, siehe gl/transition.ts.
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 steht nicht zur Verfügung.');
    this.gl = gl;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const program = gl.createProgram();
    if (!program) throw new Error('Programm konnte nicht angelegt werden.');
    const vs = compile(gl, gl.VERTEX_SHADER, FIELD_VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FIELD_FRAGMENT);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Feld-Programm: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;

    gl.useProgram(program);
    const attribute = gl.getAttribLocation(program, '_p');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

    this.rampTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.rampTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  setSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Programm und Textur freigeben.
   *
   * Notwendig, nicht hoeflich: ein Canvas hat genau einen GL-Kontext. Lebt eine
   * zweite Instanz darauf (React StrictMode montiert in der Entwicklung doppelt),
   * schreibt jede ihre Uniforms am Programm der anderen vorbei — sichtbar als
   * gemischter Zustand aus zwei Feldern.
   */
  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteTexture(this.rampTex);
    this.locations.clear();
  }

  private location(name: string): WebGLUniformLocation | null {
    if (!this.locations.has(name)) {
      this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.locations.get(name) ?? null;
  }

  /** Rampe nur neu backen, wenn sich die Farben aendern — Lab-Interpolation ist nicht gratis. */
  private ensureRamp(graph: FieldGraph): void {
    const key = graph.palette.stops.map((c) => c.join(',')).join('|');
    if (key === this.rampKey) return;
    this.rampKey = key;

    const gl = this.gl;
    const data = bakeRamp(graph.palette.stops, 256);
    gl.bindTexture(gl.TEXTURE_2D, this.rampTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  render(graph: FieldGraph, time = 0): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.ensureRamp(graph);

    const { a, b, kinds, count } = packShapes(graph);
    gl.uniform4fv(this.location('uShapeA'), a);
    gl.uniform4fv(this.location('uShapeB'), b);
    gl.uniform1iv(this.location('uShapeKind'), kinds);
    gl.uniform1i(this.location('uShapeCount'), Math.min(count, MAX_SHAPES));
    gl.uniform1i(this.location('uCombineMode'), COMBINE_INDEX[graph.combineMode]);
    gl.uniform1f(this.location('uSmoothness'), graph.smoothness);
    gl.uniform1i(this.location('uMirror'), MIRROR_INDEX[graph.mirrorAxis]);

    gl.uniform2f(this.location('uResolution'), this.canvas.width, this.canvas.height);
    gl.uniform1f(this.location('uTime'), time);
    gl.uniform1f(this.location('uSpacing'), graph.rings.spacing);
    gl.uniform1f(this.location('uCurve'), graph.rings.curve);
    gl.uniform1f(this.location('uHardness'), graph.rings.hardness);
    gl.uniform1f(this.location('uLine'), graph.rings.line);
    gl.uniform1f(this.location('uStagger'), graph.rings.stagger);
    gl.uniform1f(this.location('uGlow'), graph.glow);

    const repeat = graph.repeat;
    gl.uniform1i(this.location('uRepeatCount'), copyCount(repeat));
    gl.uniform2f(this.location('uRepeatOffset'), repeat.offset[0], repeat.offset[1]);
    gl.uniform1f(this.location('uRepeatScale'), repeat.scale);
    gl.uniform1f(this.location('uRepeatRotation'), repeat.rotation);
    gl.uniform1i(this.location('uRampSource'), graph.palette.source === 'index' ? 1 : 0);

    const raster = graph.raster;
    gl.uniform1i(this.location('uRasterMode'), RASTER_INDEX[raster.mode]);
    gl.uniform1f(this.location('uRasterCell'), raster.cell);
    gl.uniform1f(this.location('uRasterAngle'), raster.angle);
    gl.uniform1f(this.location('uGrain'), raster.grain);

    const palette = graph.palette;
    const gradient = Array.isArray(palette.background[0]);
    const backgroundA = (gradient ? palette.background[0] : palette.background) as number[];
    const backgroundB = (gradient ? palette.background[1] : palette.background) as number[];
    gl.uniform3f(this.location('uBackgroundA'), backgroundA[0], backgroundA[1], backgroundA[2]);
    gl.uniform3f(this.location('uBackgroundB'), backgroundB[0], backgroundB[1], backgroundB[2]);
    gl.uniform1f(this.location('uBackgroundGradient'), gradient ? 1 : 0);

    const separator = palette.separator ?? [0, 0, 0];
    gl.uniform3f(this.location('uSeparator'), separator[0], separator[1], separator[2]);
    gl.uniform1f(this.location('uHasSeparator'), palette.separator ? 1 : 0);
    gl.uniform1f(this.location('uRepeat'), palette.repeat ?? palette.stops.length);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.rampTex);
    gl.uniform1i(this.location('uRamp'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

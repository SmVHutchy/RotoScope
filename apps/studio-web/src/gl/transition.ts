/**
 * WebGL2-Runtime fuer gl-transitions.
 *
 * Bewusst GLSL ES 1.00 und nicht WebGPU/WGSL: die 125 Uebergaenge der Sammlung sind
 * GLSL-Fragmentfunktionen. In WebGL2 laufen sie unveraendert, fuer WebGPU muesste
 * jeder einzelne transpiliert werden. Ein Uebersetzungsschritt weniger im Projekt,
 * und die Bibliothek ist ab Tag eins vollstaendig nutzbar.
 *
 * Der Vertrag ist immer derselbe: `vec4 transition(vec2 uv)`, dazu die Helfer
 * getFromColor/getToColor und die Uniform `progress`. Genau dieser Vertrag wird
 * spaeter die Node-Signatur in MOTIF.
 */

import type { GlTransition } from 'gl-transitions';

const VERTEX = `
attribute vec2 _p;
varying vec2 _uv;
void main() {
  gl_Position = vec4(_p, 0.0, 1.0);
  _uv = vec2(0.5, 0.5) * (_p + vec2(1.0, 1.0));
}`;

/** Der Standard-Rahmen der gl-transitions-Spezifikation, inklusive Seitenverhaeltnis-Korrektur. */
const FRAGMENT_HEAD = `
precision highp float;
varying vec2 _uv;
uniform sampler2D from, to;
uniform float progress, ratio, _fromR, _toR;

vec4 getFromColor(vec2 uv) {
  return texture2D(from, 0.5 + (uv - 0.5) * vec2(min(ratio / _fromR, 1.0), min(_fromR / ratio, 1.0)));
}
vec4 getToColor(vec2 uv) {
  return texture2D(to, 0.5 + (uv - 0.5) * vec2(min(ratio / _toR, 1.0), min(_toR / ratio, 1.0)));
}
`;

const FRAGMENT_TAIL = `
void main() {
  gl_FragColor = transition(_uv);
}`;

export type ParamValue = number | boolean | number[];

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Shader konnte nicht angelegt werden.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader-Fehler: ${log}`);
  }
  return shader;
}

function makeTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Textur konnte nicht angelegt werden.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // CLAMP_TO_EDGE, weil viele Uebergaenge ueber den Rand hinaus abtasten und
  // REPEAT dort das Bild gespiegelt einblenden wuerde.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

export class TransitionRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private transition: GlTransition | null = null;
  private fromTex: WebGLTexture;
  private toTex: WebGLTexture;
  private fromRatio = 1;
  private toRatio = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL2 steht nicht zur Verfügung.');
    this.gl = gl;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.fromTex = makeTexture(gl);
    this.toTex = makeTexture(gl);
  }

  /** Uebergang laden und uebersetzen. Wirft mit der Shader-Fehlermeldung, wenn er nicht baut. */
  use(transition: GlTransition): void {
    const gl = this.gl;
    const fragment = FRAGMENT_HEAD + transition.glsl + FRAGMENT_TAIL;

    const program = gl.createProgram();
    if (!program) throw new Error('Programm konnte nicht angelegt werden.');
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Linker-Fehler in "${transition.name}": ${log}`);
    }

    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.transition = transition;

    gl.useProgram(program);
    const loc = gl.getAttribLocation(program, '_p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  setImages(from: TexImageSource, to: TexImageSource, width: number, height: number): void {
    const gl = this.gl;
    this.canvas.width = width;
    this.canvas.height = height;

    for (const [texture, image] of [
      [this.fromTex, from],
      [this.toTex, to],
    ] as const) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
    this.fromRatio = width / height;
    this.toRatio = width / height;
  }

  render(progress: number, params: Record<string, ParamValue>): void {
    const gl = this.gl;
    const program = this.program;
    const transition = this.transition;
    if (!program || !transition) return;

    gl.useProgram(program);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fromTex);
    gl.uniform1i(gl.getUniformLocation(program, 'from'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.toTex);
    gl.uniform1i(gl.getUniformLocation(program, 'to'), 1);

    gl.uniform1f(gl.getUniformLocation(program, 'progress'), progress);
    gl.uniform1f(gl.getUniformLocation(program, 'ratio'), this.canvas.width / this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, '_fromR'), this.fromRatio);
    gl.uniform1f(gl.getUniformLocation(program, '_toR'), this.toRatio);

    for (const [name, type] of Object.entries(transition.paramsTypes)) {
      this.setUniform(program, name, type, params[name] ?? transition.defaultParams[name]);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setUniform(
    program: WebGLProgram,
    name: string,
    type: string,
    value: ParamValue | undefined,
  ): void {
    const gl = this.gl;
    const location = gl.getUniformLocation(program, name);
    if (!location || value === undefined) return;

    switch (type) {
      case 'float':
        gl.uniform1f(location, Number(value));
        break;
      case 'bool':
      case 'int':
        gl.uniform1i(location, Number(value));
        break;
      case 'vec2':
        gl.uniform2fv(location, value as number[]);
        break;
      case 'vec3':
        gl.uniform3fv(location, value as number[]);
        break;
      case 'vec4':
        gl.uniform4fv(location, value as number[]);
        break;
      case 'ivec2':
        gl.uniform2iv(location, (value as number[]).map(Number));
        break;
      default:
        // Kein stilles Ignorieren: ein unbekannter Typ heisst, dass ein Parameter
        // im Inspector fehlt und der Uebergang anders aussieht als gedacht.
        console.warn(`[motif] Unbekannter Uniform-Typ "${type}" fuer "${name}"`);
    }
  }
}

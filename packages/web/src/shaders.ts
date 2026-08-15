const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

type ShaderName = "frosted-glass" | "iridescence" | "liquid" | "grain";

interface ShaderSurface {
  readonly foreign: SVGForeignObjectElement;
  seek(time: number): void;
  dispose(): void;
}

/** Live-only GPU enhancement. The SVG filter beneath it remains the export and no-WebGL fallback. */
export class ShaderSurfaceManager {
  readonly #surfaces: readonly ShaderSurface[];

  constructor(surfaces: readonly ShaderSurface[]) {
    this.#surfaces = surfaces;
  }

  seek(time: number): void {
    for (const surface of this.#surfaces) surface.seek(time);
  }

  dispose(): void {
    for (const surface of this.#surfaces) surface.dispose();
  }
}

export function mountShaderSurfaces(
  stage: HTMLElement,
  initialTime: number,
): ShaderSurfaceManager | undefined {
  const surfaces: ShaderSurface[] = [];
  const shapes = stage.querySelectorAll<SVGGraphicsElement>("[data-shader]");
  for (const shape of shapes) {
    const name = shaderName(shape.dataset.shader?.split(/\s+/)[0]);
    if (name === undefined || shape.tagName.toLowerCase() !== "rect") continue;
    const surface = mountRectShader(shape as SVGRectElement, name);
    if (surface !== undefined) {
      surface.seek(initialTime);
      surfaces.push(surface);
    }
  }
  return surfaces.length === 0 ? undefined : new ShaderSurfaceManager(surfaces);
}

function mountRectShader(shape: SVGRectElement, name: ShaderName): ShaderSurface | undefined {
  const width = positiveAttribute(shape, "width");
  const height = positiveAttribute(shape, "height");
  if (width === undefined || height === undefined) return undefined;
  const doc = shape.ownerDocument;
  const foreign = doc.createElementNS(SVG_NS, "foreignObject");
  for (const attribute of ["x", "y", "width", "height"]) {
    const value = shape.getAttribute(attribute);
    if (value !== null) foreign.setAttribute(attribute, value);
  }
  foreign.setAttribute("aria-hidden", "true");
  foreign.setAttribute("focusable", "false");
  foreign.setAttribute("data-kineglyph-shader-surface", name);
  foreign.style.pointerEvents = "none";
  foreign.style.overflow = "hidden";
  const radius = Math.max(0, numericAttribute(shape, "rx") ?? 0);
  if (radius > 0) foreign.style.borderRadius = `${radius}px`;

  const canvas = doc.createElementNS(XHTML_NS, "canvas") as unknown as HTMLCanvasElement;
  const ratio = Math.min(2, Math.max(1, shape.ownerDocument.defaultView?.devicePixelRatio ?? 1));
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.pointerEvents = "none";
  canvas.setAttribute("aria-hidden", "true");
  foreign.append(canvas);

  let gl: WebGLRenderingContext | null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
  } catch {
    return undefined;
  }
  if (gl === null) return undefined;
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  if (program === undefined) return undefined;
  const buffer = gl.createBuffer();
  if (buffer === null) {
    gl.deleteProgram(program);
    return undefined;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const timeLocation = gl.getUniformLocation(program, "u_time");
  const modeLocation = gl.getUniformLocation(program, "u_mode");
  const strengthLocation = gl.getUniformLocation(program, "u_strength");
  gl.uniform1i(modeLocation, shaderMode(name));
  gl.uniform1f(strengthLocation, shaderStrength(shape, name));

  shape.before(foreign);
  return {
    foreign,
    seek(time) {
      gl?.useProgram(program);
      gl?.uniform1f(timeLocation, Math.max(0, time) / 1000);
      gl?.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      foreign.remove();
      gl?.deleteBuffer(buffer);
      gl?.deleteProgram(program);
      gl = null;
    },
  };
}

function shaderName(value: string | undefined): ShaderName | undefined {
  return value === "frosted-glass" ||
    value === "iridescence" ||
    value === "liquid" ||
    value === "grain"
    ? value
    : undefined;
}

function shaderMode(name: ShaderName): number {
  return name === "frosted-glass" ? 0 : name === "iridescence" ? 1 : name === "liquid" ? 2 : 3;
}

function shaderStrength(shape: SVGGraphicsElement, name: ShaderName): number {
  let values: Record<string, unknown> = {};
  try {
    const source = shape.getAttribute("data-shader-uniforms");
    const parsed: unknown = source === null ? {} : JSON.parse(source);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
      values = parsed as Record<string, unknown>;
  } catch {
    values = {};
  }
  const keys =
    name === "frosted-glass"
      ? ["refraction", "grain", "strength"]
      : name === "grain"
        ? ["grain", "strength"]
        : ["strength", "intensity"];
  for (const key of keys) {
    const value = values[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  }
  return name === "iridescence" ? 0.16 : name === "liquid" ? 2.5 : 0.08;
}

function numericAttribute(element: Element, name: string): number | undefined {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : undefined;
}

function positiveAttribute(element: Element, name: string): number | undefined {
  const value = numericAttribute(element, name);
  return value !== undefined && value > 0 ? value : undefined;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | undefined {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (vertex === undefined || fragment === undefined) {
    if (vertex !== undefined) gl.deleteShader(vertex);
    if (fragment !== undefined) gl.deleteShader(fragment);
    return undefined;
  }
  const program = gl.createProgram();
  if (program === null) return undefined;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return undefined;
  }
  return program;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | undefined {
  const shader = gl.createShader(type);
  if (shader === null) return undefined;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return undefined;
  }
  return shader;
}

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_strength;
uniform int u_mode;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = v_uv;
  float grain = hash(floor(uv * 420.0) + floor(u_time * 12.0));
  vec3 color;
  float alpha;
  if (u_mode == 0) {
    float caustic = sin((uv.x * 5.0 + uv.y * 3.0 + u_time * 0.22) * 6.28318) * 0.5 + 0.5;
    color = mix(vec3(0.64, 0.82, 1.0), vec3(0.92, 0.72, 1.0), caustic);
    alpha = 0.035 + grain * min(0.11, u_strength * 0.7);
  } else if (u_mode == 1) {
    vec3 phase = vec3(0.0, 0.33, 0.67);
    color = 0.5 + 0.5 * cos(6.28318 * (phase + uv.x * 0.8 + uv.y * 0.35 + u_time * 0.04));
    alpha = min(0.24, 0.055 + u_strength * 0.55);
  } else if (u_mode == 2) {
    float wave = sin(uv.x * 18.0 + sin(uv.y * 11.0 + u_time * 0.4) * 1.8 + u_time * 0.3);
    color = mix(vec3(0.18, 0.64, 0.95), vec3(0.66, 0.34, 0.94), wave * 0.5 + 0.5);
    alpha = min(0.22, 0.045 + u_strength * 0.025);
  } else {
    color = vec3(grain);
    alpha = min(0.18, 0.025 + u_strength);
  }
  gl_FragColor = vec4(color * alpha, alpha);
}`;

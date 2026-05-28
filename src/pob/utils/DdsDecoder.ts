import * as fzstd from "fzstd";

const DDS_MAGIC = 0x20534444; // "DDS "
const DDPF_FOURCC = 0x4;
const FOURCC_DX10 = 0x30315844; // "DX10"
const FOURCC_DXT1 = 0x31545844; // "DXT1"
const FOURCC_DXT5 = 0x35545844; // "DXT5"

const DXGI_FORMAT_R8G8B8A8_UNORM = 28;
const DXGI_FORMAT_BC1_UNORM = 71;
const DXGI_FORMAT_BC1_UNORM_SRGB = 72;
const DXGI_FORMAT_BC3_UNORM = 77;
const DXGI_FORMAT_BC3_UNORM_SRGB = 78;
const DXGI_FORMAT_BC7_UNORM = 98;
const DXGI_FORMAT_BC7_UNORM_SRGB = 99;

type DdsTextureFormat = "bc1" | "bc3" | "bc7" | "rgba8";
type DdsGl = WebGLRenderingContext | WebGL2RenderingContext;

interface BptcExtension {
  COMPRESSED_RGBA_BPTC_UNORM_EXT: number;
}

interface S3tcExtension {
  COMPRESSED_RGBA_S3TC_DXT1_EXT: number;
  COMPRESSED_RGBA_S3TC_DXT5_EXT: number;
}

export interface DdsHeader {
  width: number;
  height: number;
  mipMapCount: number;
  arraySize: number;
  dataOffset: number;
  format: DdsTextureFormat;
  dxgiFormat: number | null;
  fourCC: number;
}

export interface DdsLayerRange {
  offset: number;
  size: number;
  width: number;
  height: number;
}

let gl: DdsGl | null = null;
let bptcExt: BptcExtension | null = null;
let s3tcExt: S3tcExtension | null = null;
let program: WebGLProgram | null = null;
let positionBuffer: WebGLBuffer | null = null;
let texCoordBuffer: WebGLBuffer | null = null;

const toBytes = (buffer: ArrayBuffer | Uint8Array): Uint8Array =>
  buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

const readU32 = (view: DataView, offset: number): number => {
  if (offset + 4 > view.byteLength) {
    throw new Error("Truncated DDS header");
  }
  return view.getUint32(offset, true);
};

const dxgiToFormat = (dxgiFormat: number): DdsTextureFormat => {
  switch (dxgiFormat) {
    case DXGI_FORMAT_R8G8B8A8_UNORM:
      return "rgba8";
    case DXGI_FORMAT_BC1_UNORM:
    case DXGI_FORMAT_BC1_UNORM_SRGB:
      return "bc1";
    case DXGI_FORMAT_BC3_UNORM:
    case DXGI_FORMAT_BC3_UNORM_SRGB:
      return "bc3";
    case DXGI_FORMAT_BC7_UNORM:
    case DXGI_FORMAT_BC7_UNORM_SRGB:
      return "bc7";
    default:
      throw new Error(`Unsupported DXGI format: ${dxgiFormat}`);
  }
};

const fourCcToFormat = (fourCC: number): DdsTextureFormat => {
  switch (fourCC) {
    case FOURCC_DXT1:
      return "bc1";
    case FOURCC_DXT5:
      return "bc3";
    default:
      throw new Error(`Unsupported DDS FourCC: ${fourCC.toString(16)}`);
  }
};

export const parseDdsHeader = (buffer: ArrayBuffer | Uint8Array): DdsHeader => {
  const bytes = toBytes(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readU32(view, 0) !== DDS_MAGIC) {
    throw new Error("Invalid DDS magic");
  }

  const height = readU32(view, 12);
  const width = readU32(view, 16);
  const mipMapCount = Math.max(1, readU32(view, 28) || 1);
  const pfFlags = readU32(view, 80);
  const fourCC = readU32(view, 84);

  if ((pfFlags & DDPF_FOURCC) === 0) {
    throw new Error("Unsupported DDS pixel format");
  }

  if (fourCC !== FOURCC_DX10) {
    return {
      width,
      height,
      mipMapCount,
      arraySize: 1,
      dataOffset: 128,
      format: fourCcToFormat(fourCC),
      dxgiFormat: null,
      fourCC,
    };
  }

  const dxgiFormat = readU32(view, 128);
  const arraySize = Math.max(1, readU32(view, 140) || 1);
  return {
    width,
    height,
    mipMapCount,
    arraySize,
    dataOffset: 148,
    format: dxgiToFormat(dxgiFormat),
    dxgiFormat,
    fourCC,
  };
};

const getMipSize = (
  format: DdsTextureFormat,
  width: number,
  height: number,
): number => {
  if (format === "rgba8") return width * height * 4;

  const blockSize = format === "bc1" ? 8 : 16;
  const blockCountX = Math.max(1, Math.ceil(width / 4));
  const blockCountY = Math.max(1, Math.ceil(height / 4));
  return blockCountX * blockCountY * blockSize;
};

const getMipDimensions = (
  header: DdsHeader,
  mipLevel: number,
): { width: number; height: number } => ({
  width: Math.max(1, header.width >> mipLevel),
  height: Math.max(1, header.height >> mipLevel),
});

export const getDdsLayerRange = (
  header: DdsHeader,
  layerIndex: number,
  mipLevel = 0,
): DdsLayerRange => {
  if (layerIndex < 0 || layerIndex >= header.arraySize) {
    throw new Error(
      `DDS layer ${layerIndex + 1} is outside array size ${header.arraySize}`,
    );
  }
  if (mipLevel < 0 || mipLevel >= header.mipMapCount) {
    throw new Error(
      `DDS mip ${mipLevel} is outside mip count ${header.mipMapCount}`,
    );
  }

  let layerSize = 0;
  for (let mip = 0; mip < header.mipMapCount; mip += 1) {
    const size = getMipDimensions(header, mip);
    layerSize += getMipSize(header.format, size.width, size.height);
  }

  let mipOffset = 0;
  for (let mip = 0; mip < mipLevel; mip += 1) {
    const size = getMipDimensions(header, mip);
    mipOffset += getMipSize(header.format, size.width, size.height);
  }

  const mipSize = getMipDimensions(header, mipLevel);
  return {
    offset: header.dataOffset + layerIndex * layerSize + mipOffset,
    size: getMipSize(header.format, mipSize.width, mipSize.height),
    width: mipSize.width,
    height: mipSize.height,
  };
};

const compileShader = (
  glContext: DdsGl,
  type: number,
  source: string,
): WebGLShader => {
  const shader = glContext.createShader(type);
  if (!shader) throw new Error("Failed to create WebGL shader");
  glContext.shaderSource(shader, source);
  glContext.compileShader(shader);
  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    const log = glContext.getShaderInfoLog(shader) || "unknown shader error";
    glContext.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
};

const initWebGL = (): DdsGl => {
  if (gl) return gl;

  const canvas = document.createElement("canvas");
  const context =
    canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ||
    canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (!context) throw new Error("WebGL not supported");

  gl = context;
  bptcExt = (gl.getExtension("EXT_texture_compression_bptc") ||
    gl.getExtension(
      "WEBKIT_EXT_texture_compression_bptc",
    )) as BptcExtension | null;
  s3tcExt = (gl.getExtension("WEBGL_compressed_texture_s3tc") ||
    gl.getExtension(
      "WEBKIT_WEBGL_compressed_texture_s3tc",
    )) as S3tcExtension | null;

  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position.x, a_position.y, 0, 1);
        v_texCoord = a_texCoord;
      }
    `,
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      uniform sampler2D u_image;
      varying vec2 v_texCoord;
      void main() {
        gl_FragColor = texture2D(u_image, v_texCoord);
      }
    `,
  );

  program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL link failed");
  }

  positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
    ]),
    gl.STATIC_DRAW,
  );

  texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0,
    ]),
    gl.STATIC_DRAW,
  );

  return gl;
};

const getCompressedTextureFormat = (format: DdsTextureFormat): number => {
  if (format === "bc1") {
    if (!s3tcExt) throw new Error("BC1/DXT1 textures are not supported");
    return s3tcExt.COMPRESSED_RGBA_S3TC_DXT1_EXT;
  }
  if (format === "bc3") {
    if (!s3tcExt) throw new Error("BC3/DXT5 textures are not supported");
    return s3tcExt.COMPRESSED_RGBA_S3TC_DXT5_EXT;
  }
  if (format === "bc7") {
    if (!bptcExt) throw new Error("BC7 textures are not supported");
    return bptcExt.COMPRESSED_RGBA_BPTC_UNORM_EXT;
  }
  throw new Error(`Unsupported compressed DDS format: ${format}`);
};

const decodeCompressedLayer = (
  decompressed: Uint8Array,
  header: DdsHeader,
  range: DdsLayerRange,
): HTMLCanvasElement => {
  const glContext = initWebGL();
  const canvas = glContext.canvas as HTMLCanvasElement;
  canvas.width = range.width;
  canvas.height = range.height;
  glContext.viewport(0, 0, range.width, range.height);
  glContext.clearColor(0, 0, 0, 0);
  glContext.clear(glContext.COLOR_BUFFER_BIT);

  const texture = glContext.createTexture();
  if (!texture) throw new Error("Failed to create WebGL texture");
  glContext.bindTexture(glContext.TEXTURE_2D, texture);
  glContext.texParameteri(
    glContext.TEXTURE_2D,
    glContext.TEXTURE_WRAP_S,
    glContext.CLAMP_TO_EDGE,
  );
  glContext.texParameteri(
    glContext.TEXTURE_2D,
    glContext.TEXTURE_WRAP_T,
    glContext.CLAMP_TO_EDGE,
  );
  glContext.texParameteri(
    glContext.TEXTURE_2D,
    glContext.TEXTURE_MIN_FILTER,
    glContext.LINEAR,
  );
  glContext.texParameteri(
    glContext.TEXTURE_2D,
    glContext.TEXTURE_MAG_FILTER,
    glContext.LINEAR,
  );

  const data = new Uint8Array(
    decompressed.buffer,
    decompressed.byteOffset + range.offset,
    range.size,
  );
  glContext.compressedTexImage2D(
    glContext.TEXTURE_2D,
    0,
    getCompressedTextureFormat(header.format),
    range.width,
    range.height,
    0,
    data,
  );
  const uploadError = glContext.getError();
  if (uploadError !== glContext.NO_ERROR) {
    glContext.deleteTexture(texture);
    throw new Error(`WebGL compressed texture upload failed: ${uploadError}`);
  }

  glContext.useProgram(program);
  const positionLocation = glContext.getAttribLocation(program!, "a_position");
  glContext.enableVertexAttribArray(positionLocation);
  glContext.bindBuffer(glContext.ARRAY_BUFFER, positionBuffer);
  glContext.vertexAttribPointer(
    positionLocation,
    2,
    glContext.FLOAT,
    false,
    0,
    0,
  );

  const texCoordLocation = glContext.getAttribLocation(program!, "a_texCoord");
  glContext.enableVertexAttribArray(texCoordLocation);
  glContext.bindBuffer(glContext.ARRAY_BUFFER, texCoordBuffer);
  glContext.vertexAttribPointer(
    texCoordLocation,
    2,
    glContext.FLOAT,
    false,
    0,
    0,
  );

  glContext.drawArrays(glContext.TRIANGLES, 0, 6);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = range.width;
  outCanvas.height = range.height;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  ctx.drawImage(canvas, 0, 0);
  glContext.deleteTexture(texture);
  return outCanvas;
};

const decodeRgbaLayer = (
  decompressed: Uint8Array,
  range: DdsLayerRange,
): HTMLCanvasElement => {
  const outCanvas = document.createElement("canvas");
  outCanvas.width = range.width;
  outCanvas.height = range.height;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");

  const source = new Uint8ClampedArray(range.size);
  source.set(
    new Uint8Array(
      decompressed.buffer,
      decompressed.byteOffset + range.offset,
      range.size,
    ),
  );
  ctx.putImageData(new ImageData(source, range.width, range.height), 0, 0);
  return outCanvas;
};

const decodeLayer = (
  decompressed: Uint8Array,
  header: DdsHeader,
  layer: number,
): HTMLCanvasElement => {
  if (!Number.isInteger(layer) || layer < 1) {
    throw new Error(`DDS layer must be a positive integer, got ${layer}`);
  }

  const range = getDdsLayerRange(header, layer - 1);
  if (range.offset + range.size > decompressed.byteLength) {
    throw new Error("DDS layer data exceeds file size");
  }

  if (header.format === "rgba8") return decodeRgbaLayer(decompressed, range);
  return decodeCompressedLayer(decompressed, header, range);
};

export async function decodeDdsZst(
  buffer: ArrayBuffer,
  layer = 1,
): Promise<HTMLCanvasElement> {
  const decompressed = fzstd.decompress(new Uint8Array(buffer));
  const header = parseDdsHeader(decompressed);
  return decodeLayer(decompressed, header, layer);
}

export async function decodeDdsZstLayers(
  buffer: ArrayBuffer,
  layers: number[],
): Promise<Map<number, HTMLCanvasElement>> {
  const decompressed = fzstd.decompress(new Uint8Array(buffer));
  const header = parseDdsHeader(decompressed);
  const out = new Map<number, HTMLCanvasElement>();
  for (const layer of new Set(layers)) {
    out.set(layer, decodeLayer(decompressed, header, layer));
  }
  return out;
}

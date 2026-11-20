/**
 * Pure JavaScript polyfills for browser geometry/canvas globals (`DOMMatrix`, `ImageData`, `Path2D`)
 * required by `pdfjs-dist` v5 / `pdf-parse` v2 inside serverless Node.js environments (Vercel)
 * where native `@napi-rs/canvas` binaries may not be available.
 */

class PolyfillDOMMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  m11: number;
  m12: number;
  m21: number;
  m22: number;
  m41: number;
  m42: number;
  is2D = true;
  isIdentity = true;

  constructor(init?: number[] | Float32Array | Float64Array | string) {
    if (
      Array.isArray(init) ||
      init instanceof Float32Array ||
      init instanceof Float64Array
    ) {
      this.a = init[0] ?? 1;
      this.b = init[1] ?? 0;
      this.c = init[2] ?? 0;
      this.d = init[3] ?? 1;
      this.e = init[4] ?? 0;
      this.f = init[5] ?? 0;
    } else {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }
    this.m11 = this.a;
    this.m12 = this.b;
    this.m21 = this.c;
    this.m22 = this.d;
    this.m41 = this.e;
    this.m42 = this.f;
    this.updateFlags();
  }

  private syncAliases() {
    this.m11 = this.a;
    this.m12 = this.b;
    this.m21 = this.c;
    this.m22 = this.d;
    this.m41 = this.e;
    this.m42 = this.f;
    this.updateFlags();
    return this;
  }

  private updateFlags() {
    this.isIdentity =
      this.a === 1 &&
      this.b === 0 &&
      this.c === 0 &&
      this.d === 1 &&
      this.e === 0 &&
      this.f === 0;
  }

  private static toMatrix(
    other?: PolyfillDOMMatrix | number[] | Record<string, number>
  ): PolyfillDOMMatrix {
    if (other instanceof PolyfillDOMMatrix) return other;
    if (Array.isArray(other)) return new PolyfillDOMMatrix(other);
    if (other && typeof other === "object") {
      return new PolyfillDOMMatrix([
        other.a ?? other.m11 ?? 1,
        other.b ?? other.m12 ?? 0,
        other.c ?? other.m21 ?? 0,
        other.d ?? other.m22 ?? 1,
        other.e ?? other.m41 ?? 0,
        other.f ?? other.m42 ?? 0,
      ]);
    }
    return new PolyfillDOMMatrix();
  }

  multiplySelf(other?: PolyfillDOMMatrix | number[] | Record<string, number>) {
    const m = PolyfillDOMMatrix.toMatrix(other);
    const a = this.a * m.a + this.c * m.b;
    const b = this.b * m.a + this.d * m.b;
    const c = this.a * m.c + this.c * m.d;
    const d = this.b * m.c + this.d * m.d;
    const e = this.a * m.e + this.c * m.f + this.e;
    const f = this.b * m.e + this.d * m.f + this.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this.syncAliases();
  }

  preMultiplySelf(
    other?: PolyfillDOMMatrix | number[] | Record<string, number>
  ) {
    const m = PolyfillDOMMatrix.toMatrix(other);
    const a = m.a * this.a + m.c * this.b;
    const b = m.b * this.a + m.d * this.b;
    const c = m.a * this.c + m.c * this.d;
    const d = m.b * this.c + m.d * this.d;
    const e = m.a * this.e + m.c * this.f + m.e;
    const f = m.b * this.e + m.d * this.f + m.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this.syncAliases();
  }

  multiply(other?: PolyfillDOMMatrix | number[] | Record<string, number>) {
    return new PolyfillDOMMatrix([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e,
      this.f,
    ]).multiplySelf(other);
  }

  translateSelf(tx = 0, ty = 0) {
    this.e += this.a * tx + this.c * ty;
    this.f += this.b * tx + this.d * ty;
    return this.syncAliases();
  }

  translate(tx = 0, ty = 0) {
    return new PolyfillDOMMatrix([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e,
      this.f,
    ]).translateSelf(tx, ty);
  }

  scaleSelf(scaleX = 1, scaleY = scaleX, scaleZ = 1, originX = 0, originY = 0) {
    void scaleZ;
    if (originX !== 0 || originY !== 0) {
      this.translateSelf(originX, originY);
    }
    this.a *= scaleX;
    this.b *= scaleX;
    this.c *= scaleY;
    this.d *= scaleY;
    if (originX !== 0 || originY !== 0) {
      this.translateSelf(-originX, -originY);
    }
    return this.syncAliases();
  }

  scale(scaleX = 1, scaleY = scaleX, scaleZ = 1, originX = 0, originY = 0) {
    return new PolyfillDOMMatrix([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e,
      this.f,
    ]).scaleSelf(scaleX, scaleY, scaleZ, originX, originY);
  }

  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    if (!det) {
      this.a = Number.NaN;
      this.b = Number.NaN;
      this.c = Number.NaN;
      this.d = Number.NaN;
      this.e = Number.NaN;
      this.f = Number.NaN;
      return this.syncAliases();
    }
    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const e = (this.c * this.f - this.d * this.e) / det;
    const f = (this.b * this.e - this.a * this.f) / det;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this.syncAliases();
  }

  inverse() {
    return new PolyfillDOMMatrix([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e,
      this.f,
    ]).invertSelf();
  }

  transformPoint(point?: { x?: number; y?: number; z?: number; w?: number }) {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: point?.z ?? 0,
      w: point?.w ?? 1,
    };
  }
}

class PolyfillImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = "srgb";

  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    height?: number
  ) {
    if (typeof dataOrWidth === "number") {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height =
        height ?? Math.max(1, Math.floor(dataOrWidth.length / (4 * widthOrHeight)));
    }
  }
}

class PolyfillPath2D {
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
}

export function ensurePdfDomPolyfills(): {
  domMatrixInstalled: boolean;
  imageDataInstalled: boolean;
  path2DInstalled: boolean;
} {
  const g = globalThis as unknown as Record<string, unknown>;

  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = PolyfillDOMMatrix;
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = PolyfillImageData;
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = PolyfillPath2D;
  }

  return {
    domMatrixInstalled: typeof g.DOMMatrix !== "undefined",
    imageDataInstalled: typeof g.ImageData !== "undefined",
    path2DInstalled: typeof g.Path2D !== "undefined",
  };
}

// Auto-install on module import
ensurePdfDomPolyfills();

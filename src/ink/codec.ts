import { POINT_STRIDE, type PageObject, type Points, type StrokeObject } from './types.ts';

/**
 * Points are stored as zigzag varint deltas: x and y in 1/16 page units, pressure in 1/255, time in ms.
 * This averages about 5 bytes per point against 16 for raw Float32, and stays lossless at a precision
 * far below what the screen can show.
 */
const XY = 16;

function zigzag(n: number) {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}
function unzigzag(n: number) {
  return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
}

export function encodePoints(pts: Points): Uint8Array {
  const count = pts.length / POINT_STRIDE;
  const out = new Uint8Array(count * 16 + 5);
  let o = 0;
  const put = (v: number) => {
    let n = v;
    while (n >= 128) {
      out[o++] = (n % 128) | 128;
      n = Math.floor(n / 128);
    }
    out[o++] = n;
  };
  put(count);
  let px = 0, py = 0, pp = 0, pt = 0;
  for (let i = 0; i < pts.length; i += POINT_STRIDE) {
    const x = Math.round(pts[i] * XY), y = Math.round(pts[i + 1] * XY);
    const p = Math.round(pts[i + 2] * 255), t = Math.round(pts[i + 3]);
    put(zigzag(x - px));
    put(zigzag(y - py));
    put(zigzag(p - pp));
    put(zigzag(t - pt));
    px = x; py = y; pp = p; pt = t;
  }
  return out.slice(0, o);
}

export function decodePoints(bytes: Uint8Array): Points {
  let o = 0;
  const get = () => {
    let result = 0, mult = 1, b: number;
    do {
      b = bytes[o++];
      result += (b & 127) * mult;
      mult *= 128;
    } while (b >= 128);
    return result;
  };
  const count = get();
  const pts = new Float32Array(count * POINT_STRIDE);
  let x = 0, y = 0, p = 0, t = 0;
  for (let i = 0; i < count; i++) {
    x += unzigzag(get());
    y += unzigzag(get());
    p += unzigzag(get());
    t += unzigzag(get());
    pts[i * POINT_STRIDE] = x / XY;
    pts[i * POINT_STRIDE + 1] = y / XY;
    pts[i * POINT_STRIDE + 2] = p / 255;
    pts[i * POINT_STRIDE + 3] = t;
  }
  return pts;
}

export type StoredObject = Omit<StrokeObject, 'pts'> & { pts: Uint8Array } | Exclude<PageObject, StrokeObject>;

export function toStored(o: PageObject): StoredObject {
  return o.type === 'stroke' ? { ...o, pts: encodePoints(o.pts) } : o;
}

export function fromStored(s: StoredObject): PageObject {
  return s.type === 'stroke' ? { ...s, pts: decodePoints(s.pts) } : s;
}

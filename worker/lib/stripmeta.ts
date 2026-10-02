// Strip EXIF/XMP/text metadata from uploads: phone photos carry GPS, and an
// anonymous poster shouldn't publish where they stood. Container-level only
// (no re-encode), so pixels are byte-identical. Malformed tails are copied
// verbatim rather than rejected — real camera files are well-formed.
// ponytail: GIF passes through untouched (XMP app-extensions possible, but
// cameras don't write GIF); add a GIF walker if that changes.

const cat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, (o += p.length) - p.length);
  return out;
};
const ascii = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

// EXIF Orientation (tag 0x0112) from an APP1 body, or 0 if absent/unreadable.
function orientation(body: Uint8Array): number {
  if (ascii(body, 0) !== "Exif") return 0;
  try {
    const t = new DataView(body.buffer, body.byteOffset + 6, body.length - 6);
    const le = t.getUint8(0) === 0x49; // "II"
    const ifd = t.getUint32(4, le);
    const n = t.getUint16(ifd, le);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + 12 * k;
      if (t.getUint16(e, le) === 0x0112) return t.getUint16(e + 8, le);
    }
  } catch {} // out-of-range offsets in a broken EXIF: treat as no orientation
  return 0;
}

// Minimal big-endian EXIF APP1 holding only Orientation, so rotated phone
// photos still display upright after the original EXIF is dropped.
const orientationApp1 = (o: number) =>
  new Uint8Array([
    0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, // APP1, len 34, "Exif\0\0"
    0x4d, 0x4d, 0, 42, 0, 0, 0, 8, // "MM", 42, IFD0 at 8
    0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, // 1 entry: Orientation SHORT = o
    0, 0, 0, 0, // no next IFD
  ]);

function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  let orient = 0;
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; } // fill byte
    if (m === 0xda || m === 0xd9) break; // SOS/EOI: the rest is image data
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
    if (end > b.length) break;
    if (m === 0xe1) orient ||= orientation(b.subarray(i + 4, end)); // EXIF / XMP
    else if (m !== 0xed) out.push(b.subarray(i, end)); // 0xED = Photoshop/IPTC
    i = end;
  }
  if (orient > 1 && orient <= 8) out.splice(out[1]?.[1] === 0xe0 ? 2 : 1, 0, orientationApp1(orient)); // after JFIF APP0
  out.push(b.subarray(i));
  return cat(out);
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);
function stripPng(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  const v = new DataView(b.buffer, b.byteOffset, b.length);
  let i = 8;
  while (i + 12 <= b.length) {
    const end = i + 12 + v.getUint32(i);
    if (end > b.length) break;
    if (!PNG_DROP.has(ascii(b, i + 4))) out.push(b.subarray(i, end));
    i = end;
  }
  out.push(b.subarray(i));
  return cat(out);
}

function stripWebp(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.slice(0, 12)];
  const v = new DataView(b.buffer, b.byteOffset, b.length);
  let i = 12;
  while (i + 8 <= b.length) {
    const size = v.getUint32(i + 4, true);
    const end = Math.min(b.length, i + 8 + size + (size & 1));
    const type = ascii(b, i);
    if (type === "VP8X") {
      const c = b.slice(i, end);
      c[8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
      out.push(c);
    } else if (type !== "EXIF" && type !== "XMP ") out.push(b.subarray(i, end));
    i = end;
  }
  out.push(b.subarray(i));
  const r = cat(out);
  new DataView(r.buffer).setUint32(4, r.length - 8, true); // RIFF size
  return r;
}

export function stripMeta(b: Uint8Array, ext: string): Uint8Array {
  if (ext === "jpg") return stripJpeg(b);
  if (ext === "png") return stripPng(b);
  if (ext === "webp") return stripWebp(b);
  return b;
}

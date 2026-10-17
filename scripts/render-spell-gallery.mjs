/**
 * Deterministic art contact sheet; no browser, downloaded assets or extra packages.
 * Run after npm ci: node scripts/render-spell-gallery.mjs [output-directory]
 * Each cell contains native-resolution frames 0 and 4, left to right.
 * Set SPELL_REVIEW_LOG=1 to emit chunked PNG/GIF data for remote CI inspection.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createServer } from 'vite';

// A deliberately small review-only bitmap font keeps the output self-contained.
const FONT = {
  ' ': ['000','000','000','000','000'],
  '+': ['000','010','111','010','000'],
  '0': ['111','101','101','101','111'],
  '4': ['101','101','111','001','001'],
  A: ['010','101','111','101','101'],
  B: ['110','101','110','101','110'],
  C: ['011','100','100','100','011'],
  D: ['110','101','101','101','110'],
  E: ['111','100','110','100','111'],
  F: ['111','100','110','100','100'],
  G: ['011','100','101','101','011'],
  H: ['101','101','111','101','101'],
  I: ['111','010','010','010','111'],
  J: ['001','001','001','101','010'],
  K: ['101','101','110','101','101'],
  L: ['100','100','100','100','111'],
  M: ['101','111','111','101','101'],
  N: ['101','111','111','111','101'],
  O: ['010','101','101','101','010'],
  P: ['110','101','110','100','100'],
  Q: ['010','101','101','111','011'],
  R: ['110','101','110','101','101'],
  S: ['011','100','010','001','110'],
  T: ['111','010','010','010','010'],
  U: ['101','101','101','101','111'],
  V: ['101','101','101','101','010'],
  W: ['101','101','111','111','101'],
  X: ['101','101','010','101','101'],
  Y: ['101','101','010','010','010'],
  Z: ['111','001','010','100','111'],
};


const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root, configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const { renderPixelScene, PW, PH } = await server.ssrLoadModule('/src/ui/pixel-scene.ts');
  const being = (elements, extra = {}) => ({
    elements, shapes: ['forma_esfera'], concepts: [], placement: 'front',
    projectile: false, orbit: false, direction: null, guards: [],
    estado: false, linked: false, merged: false, bond: null, closed: false,
    ...extra,
  });
  const single = (elements, extra) => ({ beings: [being(elements, extra)], orbitCount: 0 });
  const intended = (elements, intentForm, extra = {}) => single(elements, {
    shapes: [], intentForm, bond: intentForm, ...extra,
  });
  const flying = { placement: 'flight', projectile: true, direction: 'forward' };
  const orbit = [
    being(['fogo'], { shapes: [], intentForm: 'lanca', bond: 'lanca', ...flying }),
    ...Array.from({ length: 4 }, () => being(['gelo'], { orbit: true, closed: true })),
  ];
  const examples = [
    ['FIRE SPHERE', single(['fogo'])],
    ['FIRE LANCE', intended(['fogo'], 'lanca', flying)],
    ['LIGHTNING RING', intended(['raio'], 'anel')],
    ['WATER SPHERE', single(['agua'])],
    ['ICE SPHERE', single(['gelo'])],
    ['WATER DRAGON', intended(['agua'], 'dragao')],
    ['LIGHTNING SPHERE', single(['raio'])],
    ['METAL SPHERE', single(['metal'])],
    ['FIRE + LIGHTNING', single(['fogo', 'raio'], { linked: true, merged: true })],
    ['METAL + LIGHTNING', single(['metal', 'raio'], { linked: true })],
    ['WATER + ICE DRAGON', intended(['agua', 'gelo'], 'dragao', { linked: true, merged: true })],
    ['ORBIT + WAKE', { beings: orbit, orbitCount: 4 }],
  ];

  const gap = 8, caption = 13, pairGap = 3;
  const cellW = PW * 2 + pairGap, cellH = PH + caption;
  const width = gap + (cellW + gap) * 3;
  const height = gap + (cellH + gap) * 4;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 12; data[i + 1] = 16; data[i + 2] = 23; data[i + 3] = 255;
  }

  const motionWidth = gap + (PW + gap) * 3;
  const motionFrames = Array.from({ length: 8 }, () => {
    const frame = Buffer.alloc(motionWidth * height * 4);
    for (let i = 0; i < frame.length; i += 4) {
      frame[i] = 12; frame[i + 1] = 16; frame[i + 2] = 23; frame[i + 3] = 255;
    }
    return frame;
  });
  const report = [];
  for (const [index, [title, appearance]] of examples.entries()) {
    const original = structuredClone(appearance);
    const frames = Array.from({ length: 8 }, (_, frame) =>
      renderPixelScene(appearance, true, frame).pix);
    const still = renderPixelScene(appearance, true, 8).pix;
    assert.deepEqual(appearance, original, title + ': appearance mutated');
    assert.deepEqual(still.data, frames[0].data, title + ': loop does not close');
    assert.equal(frames[0].w, PW);
    assert.equal(frames[0].h, PH);
    const signatures = new Set(frames.map(pix => Buffer.from(pix.data).toString('base64')));
    assert.ok(signatures.size > 1, title + ': expected visible animation');

    const x = gap + (index % 3) * (cellW + gap);
    const y = gap + Math.floor(index / 3) * (cellH + gap);
    drawText(data, width, x, y + 2, title, [219, 202, 161]);
    drawText(data, width, x + PW + pairGap, y + 2, 'FRAME 4', [122, 158, 180]);
    for (const [column, frame] of [0, 4].entries()) {
      const source = frames[frame];
      for (let sy = 0; sy < PH; sy++) {
        const start = ((y + caption + sy) * width + x + column * (PW + pairGap)) * 4;
        data.set(source.data.subarray(sy * PW * 4, (sy + 1) * PW * 4), start);
      }
    }
    const motionX = gap + (index % 3) * (PW + gap);
    for (const [frameIndex, target] of motionFrames.entries()) {
      drawText(target, motionWidth, motionX, y + 2, title, [219, 202, 161]);
      for (let sy = 0; sy < PH; sy++) {
        const start = ((y + caption + sy) * motionWidth + motionX) * 4;
        target.set(frames[frameIndex].data.subarray(sy * PW * 4, (sy + 1) * PW * 4), start);
      }
    }
    report.push({ title, uniqueFrames: signatures.size });
  }

  const png = encodePng(width, height, data);
  const gif = encodeGif(motionWidth, height, motionFrames);
  if (process.argv[2]) {
    const output = resolve(process.argv[2]);
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'spell-gallery.png'), png);
    await writeFile(join(output, 'spell-gallery.gif'), gif);
  }
  console.log('SPELL_GALLERY_CASES=' + JSON.stringify(report));
  console.log('SPELL_GALLERY_SIZE=' + width + 'x' + height);
  if (process.env.SPELL_REVIEW_LOG === '1') {
    logImage('PNG', png);
    logImage('GIF', gif);
  }
} finally {
  await server.close();
}


function drawText(target, width, x, y, text, color) {
  for (const [index, letter] of [...text].entries()) {
    const glyph = FONT[letter] ?? FONT[' '];
    for (let gy = 0; gy < glyph.length; gy++) for (let gx = 0; gx < 3; gx++) {
      if (glyph[gy][gx] !== '1') continue;
      const pixel = ((y + gy) * width + x + index * 4 + gx) * 4;
      target[pixel] = color[0]; target[pixel + 1] = color[1]; target[pixel + 2] = color[2];
    }
  }
}

function encodePng(width, height, rgba) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 4 + 1);
    rows[start] = 0;
    rgba.copy(rows, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, payload) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(payload.length + 12);
  result.writeUInt32BE(payload.length, 0);
  name.copy(result, 4); payload.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, payload])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}


// GIF uses one adaptive palette across the loop; PNG retains exact source colours.
function encodeGif(width, height, rgbaFrames) {
  const word = value => Buffer.from([value & 255, value >>> 8 & 255]);
  const { palette, indicesFor } = adaptiveGifPalette(rgbaFrames);
  const parts = [
    Buffer.from('GIF89a', 'ascii'), word(width), word(height),
    Buffer.from([0xf7, 0, 0]), Buffer.from(palette),
    Buffer.from([0x21, 0xff, 11]), Buffer.from('NETSCAPE2.0', 'ascii'),
    Buffer.from([3, 1, 0, 0, 0]),
  ];
  for (const [frame, rgba] of rgbaFrames.entries()) {
    const indices = indicesFor(rgba);
    parts.push(
      Buffer.from([0x21, 0xf9, 4, 4]), word(frame % 2 ? 13 : 12), Buffer.from([0, 0]),
      Buffer.from([0x2c]), word(0), word(0), word(width), word(height), Buffer.from([0, 8]),
    );
    const compressed = gifLzw(indices);
    for (let index = 0; index < compressed.length; index += 255) {
      const block = compressed.subarray(index, index + 255);
      parts.push(Buffer.from([block.length]), Buffer.from(block));
    }
    parts.push(Buffer.from([0]));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

/**
 * One adaptive palette for the entire loop avoids per-frame colour flicker.
 * Weighted median-cut boxes spend colours on both broad planes and rare ranges;
 * nearest-colour lookup is cached once per source RGB value across all frames.
 */
function adaptiveGifPalette(rgbaFrames) {
  const histogram = new Map();
  for (const rgba of rgbaFrames) for (let offset = 0; offset < rgba.length; offset += 4) {
    const key = (rgba[offset] << 16) | (rgba[offset + 1] << 8) | rgba[offset + 2];
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  const colours = [...histogram].map(([key, count]) => ({
    key, count, rgb: [key >>> 16, key >>> 8 & 255, key & 255],
  }));
  const box = entries => {
    const low = [255, 255, 255], high = [0, 0, 0];
    let count = 0;
    for (const entry of entries) {
      count += entry.count;
      for (let channel = 0; channel < 3; channel++) {
        low[channel] = Math.min(low[channel], entry.rgb[channel]);
        high[channel] = Math.max(high[channel], entry.rgb[channel]);
      }
    }
    let axis = 0;
    for (let channel = 1; channel < 3; channel++)
      if (high[channel] - low[channel] > high[axis] - low[axis]) axis = channel;
    return { entries, count, axis, priority: (high[axis] - low[axis]) * Math.sqrt(count) };
  };

  const boxes = colours.length ? [box(colours)] : [];
  while (boxes.length < 256) {
    let selected = -1;
    for (let index = 0; index < boxes.length; index++) {
      if (boxes[index].entries.length < 2) continue;
      if (selected < 0 || boxes[index].priority > boxes[selected].priority) selected = index;
    }
    if (selected < 0) break;
    const current = boxes[selected], entries = current.entries;
    entries.sort((a, b) => a.rgb[current.axis] - b.rgb[current.axis] || a.key - b.key);
    let halfway = 0, split = 0;
    while (split < entries.length - 1) {
      halfway += entries[split].count;
      split++;
      if (halfway >= current.count / 2) break;
    }
    boxes.splice(selected, 1, box(entries.slice(0, split)), box(entries.slice(split)));
  }
  const paletteColours = boxes.map(current => {
    const total = [0, 0, 0];
    for (const entry of current.entries) for (let channel = 0; channel < 3; channel++)
      total[channel] += entry.rgb[channel] * entry.count;
    return total.map(value => Math.round(value / current.count));
  });
  if (!paletteColours.length) paletteColours.push([0, 0, 0]);
  const palette = new Uint8Array(768);
  for (let index = 0; index < 256; index++)
    palette.set(paletteColours[Math.min(index, paletteColours.length - 1)], index * 3);

  const cache = new Map();
  const indicesFor = rgba => {
    const indices = new Uint8Array(rgba.length / 4);
    for (let offset = 0, pixel = 0; offset < rgba.length; offset += 4, pixel++) {
      const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
      const key = (r << 16) | (g << 8) | b;
      let nearest = cache.get(key);
      if (nearest === undefined) {
        let distance = Infinity;
        nearest = 0;
        for (const [index, candidate] of paletteColours.entries()) {
          const dr = r - candidate[0], dg = g - candidate[1], db = b - candidate[2];
          const error = dr * dr * 3 + dg * dg * 6 + db * db * 2;
          if (error < distance) { distance = error; nearest = index; }
        }
        cache.set(key, nearest);
      }
      indices[pixel] = nearest;
    }
    return indices;
  };
  return { palette, indicesFor };
}

function gifLzw(indices) {
  const bytes = [];
  let datum = 0, used = 0, size = 9, next = 258, dictionary = new Map();
  const emit = code => {
    datum |= code << used;
    used += size;
    while (used >= 8) {
      bytes.push(datum & 255);
      datum >>>= 8;
      used -= 8;
    }
  };
  emit(256);
  let prefix = indices[0];
  for (let index = 1; index < indices.length; index++) {
    const byte = indices[index], key = prefix * 256 + byte, found = dictionary.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) {
      dictionary.set(key, next++);
      // The encoder has one dictionary entry more than a decoder at this point.
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(256);
      dictionary = new Map(); next = 258; size = 9;
    }
    prefix = byte;
  }
  emit(prefix); emit(257);
  if (used) bytes.push(datum & 255);
  return Uint8Array.from(bytes);
}

function logImage(format, data) {
  const base64 = data.toString('base64'), chunkLength = 6000;
  for (let start = 0, part = 0; start < base64.length; start += chunkLength, part++) {
    console.log('SPELL_GALLERY_' + format + '_PART=' + String(part).padStart(4, '0') + ':' +
      base64.slice(start, start + chunkLength));
  }
  console.log('SPELL_GALLERY_' + format + '_END=' + base64.length);
}

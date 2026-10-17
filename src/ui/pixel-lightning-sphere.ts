import { Pix, type RGB } from './pixel';
import type { IntentionBox } from './pixel-intention';

type Point = [number, number];
const cycle = (value: number, length = 8): number => ((value % length) + length) % length;
const phaseOf = (frame: number): number => Number.isFinite(frame) ? cycle(Math.floor(frame)) : 0;
const radiusOf = (s: number): number => Math.max(1.2, s * .82);
const toneColor = (ramp: RGB[], tone: number): RGB => ramp[Math.round(Math.max(0, Math.min(1, tone)) * (ramp.length - 1))];

// One jagged discharge is wrapped around a dark spherical volume. Unequal
// elbows and two inward forks distinguish this from the open electrical ring.
const CIRCUIT: Point[] = [[-.72, -.18], [-.65, -.48], [-.34, -.64], [-.18, -.85],
  [.13, -.67], [.4, -.72], [.53, -.43], [.75, -.18], [.59, .02], [.76, .25],
  [.47, .42], [.34, .66], [.07, .56], [-.15, .76], [-.35, .48], [-.61, .42],
  [-.52, .13], [-.72, -.18]];
const DISTANCE = [0];
for (let i = 1; i < CIRCUIT.length; i++) {
  const a = CIRCUIT[i - 1], b = CIRCUIT[i];
  DISTANCE.push(DISTANCE[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
}
const LENGTH = DISTANCE[DISTANCE.length - 1];
const HEAD = [0, .06, .2, .33, .4, .57, .73, .88];
const SURGE = [1, .84, 1, .9, 1, .84, 1, .9];
const FORKS: { root: number; path: Point[] }[] = [
  { root: 3, path: [CIRCUIT[3], [-.16, -.46], [.13, -.34], [-.03, -.12], [.19, -.04]] },
  { root: 12, path: [CIRCUIT[12], [-.08, .34], [.17, .24], [.09, .02]] }
];
const SEGMENTS = [
  ...CIRCUIT.slice(1).map((b, i) => ({ a: CIRCUIT[i], b, at: DISTANCE[i], root: 0, fork: false })),
  ...FORKS.flatMap(({ root, path }) => {
    let distance = 0;
    return path.slice(1).map((b, i) => {
      const a = path[i], at = distance;
      distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
      return { a, b, at, root: DISTANCE[root], fork: true };
    });
  })
].map(segment => {
  const dx = segment.b[0] - segment.a[0], dy = segment.b[1] - segment.a[1];
  return { ...segment, dx, dy, length: Math.hypot(dx, dy) };
});

/** The compact fixed envelope is shared by packing, mixed materials and raster. */
export function lightningSphereBounds(s: number): IntentionBox {
  const r = Math.ceil(radiusOf(s));
  return { l: -r, t: -r, r, b: r };
}

function dischargeTone(age: number, core: boolean, surge: number): number {
  if (age < .62) return core ? surge : .7;
  if (age < 1.35) return core ? .8 : .53;
  if (age < 2.25) return core ? .59 : .38;
  if (age < 3.4) return core ? .39 : .25;
  return core ? .24 : .14;
}

/**
 * An original electric sphere: a narrow head travels through attached channels,
 * then each channel cools from pale cyan into blue and indigo. The dark centre,
 * shoulder planes and ink contour stay still; no random shimmer or extra aura.
 */
export function paintCoherentLightningSphere(pix: Pix, x: number, y: number, s: number,
  ramp: RGB[], frame: number): IntentionBox {
  const q = lightningSphereBounds(s), box = { l: x + q.l, t: y + q.t, r: x + q.r, b: y + q.b };
  if (!ramp.length || ![x, y, s].every(Number.isFinite) || s <= 0
    || box.r < 0 || box.b < 0 || box.l >= pix.w || box.t >= pix.h) return box;
  const r = radiusOf(s), phase = phaseOf(frame), head = HEAD[phase] * LENGTH, tiny = s < 6;
  const channelWidth = Math.max(.058, .6 / r), coreWidth = Math.max(.025, .29 / r);
  for (let py = Math.max(0, Math.ceil(box.t)); py <= Math.min(pix.h - 1, Math.floor(box.b)); py++)
    for (let px = Math.max(0, Math.ceil(box.l)); px <= Math.min(pix.w - 1, Math.floor(box.r)); px++) {
      const u = (px - x) / r, v = (py - y) / r, d = Math.hypot(u, v);
      if (d > 1) continue;
      // Broad quiet planes leave real room between the electrical filaments.
      // The lower/right hemisphere remains dark even as the front passes.
      let tone = .17;
      if (Math.hypot((u + .19) * .97, (v + .25) * 1.08) < .78) tone = .36;
      if (u > .5) tone = .19;
      if (v > .32 - u * .18) tone = .07;
      if (Math.hypot((u - .08) * 1.15, (v + .02) * .95) < .39) tone = .025;
      let nearest = Infinity, age = 0, fork = false;
      for (const segment of SEGMENTS) {
        const t = Math.max(0, Math.min(1, ((u - segment.a[0]) * segment.dx + (v - segment.a[1]) * segment.dy) / (segment.length * segment.length)));
        const distance = Math.hypot(u - segment.a[0] - segment.dx * t, v - segment.a[1] - segment.dy * t);
        if (distance >= nearest) continue;
        nearest = distance; fork = segment.fork;
        const along = segment.at + t * segment.length;
        age = segment.fork
          ? cycle(cycle(head - segment.root, LENGTH) / LENGTH * 8 - along * 1.8)
          : cycle(head - along, LENGTH) / LENGTH * 8;
      }
      if (nearest <= channelWidth * (fork ? .82 : 1)) {
        tone = Math.max(tone, dischargeTone(age, nearest < coreWidth * (fork ? .85 : 1), SURGE[phase]));
      }
      // A small dark nucleus survives even in dense numeric/orbit copies.
      if (Math.hypot(u - .015, v + .01) < (tiny ? .24 : .12)) tone = .025;
      // Inside contour: the mask never expands, flashes or breaks into sparks.
      const edge = Math.hypot(u + 1 / r, v) > 1 || Math.hypot(u - 1 / r, v) > 1
        || Math.hypot(u, v + 1 / r) > 1 || Math.hypot(u, v - 1 / r) > 1;
      if (edge) tone = Math.min(tone, tiny && u + v < -.4 ? .34 : .12);
      pix.set(px, py, toneColor(ramp, tone));
    }
  return box;
}

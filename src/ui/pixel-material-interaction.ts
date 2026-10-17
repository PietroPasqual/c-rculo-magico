import { familyOf } from '../core/structural';
import { clamp01, inPoly, mixRGB, type Pix, type RGB } from './pixel';

export interface InteractionBounds { l: number; t: number; r: number; b: number }
export interface InteractionMaterial { element: string; ramp: readonly RGB[] }
export interface MaterialInteractionOptions {
  linked?: boolean;
  merged?: boolean;
  frame?: number;
  seed?: number;
  /** Follow the authored object's local axis when its tip faces left. */
  reverse?: boolean;
  /** Known authored geometry, used only for anatomy-aware ice plates. */
  form?: string;
  /** Stable local-coordinate envelope; never expands the actual paint bounds. */
  surfaceBounds?: InteractionBounds;
  /** Actual palette used for the authored body, if distinct from its first material. */
  authoredRamp?: readonly RGB[];
}

interface Swatch {
  material: InteractionMaterial; tone: number;
  reflection?: { material: InteractionMaterial; tone: number };
  surfaceOcclusion?: boolean;
}
interface Surface {
  u: number; v: number; px: number; py: number; tone: number;
  turn: number; phase: number; wide: boolean; fused: boolean; broad: boolean;
  form?: string;
}

const TAU = Math.PI * 2;
const DARK = new Set(['sombra', 'vazio', 'morte']);
const SPACE = new Set(['espaco', 'infinito', 'gravidade', 'pressao']);
const STONE = new Set(['terra', 'materia', 'gravidade']);
const luma = (c: ArrayLike<number>): number => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
const swatch = (material: InteractionMaterial, tone: number): Swatch => ({ material, tone });
/** One restrained reflected-light step, only at an actual material contact. */
const contact = (material: InteractionMaterial, tone: number, reflected: InteractionMaterial, reflectedTone: number): Swatch =>
  ({ material, tone, reflection: { material: reflected, tone: reflectedTone } });

type Point = [number, number];
// Fixed crystal geometry. Liquid moves in the gaps, never through these faces.
const ICE_PLATE_LEFT: Point[] = [[.27, .34], [.47, .2], [.57, .43], [.44, .59], [.3, .47]];
const ICE_PLATE_RIGHT: Point[] = [[.66, .28], [.8, .43], [.75, .65], [.6, .57], [.57, .43]];
const ICE_PLATE_FOOT: Point[] = [[.4, .73], [.57, .64], [.74, .76], [.61, .87], [.43, .85]];
const DRAGON_ICE_WING: Point[] = [[-12, -18], [-18, -8], [-13, -9], [-9, -5], [-7, -3], [-8, -10]];
const DRAGON_ICE_BACK: Point[] = [[-7, 4], [-2, 2], [4, 4], [0, 9], [-5, 8]];
const WING_FOLD = [0, .48, 1, .86, .65, .42, .2, .06] as const;

function frozenWater(a: InteractionMaterial, b: InteractionMaterial, s: Surface): Swatch | null {
  const ice = a.element === 'gelo' ? a : b, water = a.element === 'agua' ? a : b;
  const { u, v, phase, turn, fused, broad } = s;
  const pulse = clamp01(1 - Math.abs(v - (.51 + Math.sin(phase) * .25)) / .18);
  const plate = (tone: number): Swatch => ({
    ...(fused && tone < .4 ? contact(ice, tone, water, .7) : swatch(ice, tone)),
    surfaceOcclusion: s.form === 'esfera' || s.form === 'dragao'
  });
  if (s.form === 'dragao') {
    // These are the authored dragon's wing and shoulder coordinates. Applying
    // its affine wing fold keeps each ice face planar as the wing closes.
    const x = (u - .5) * 54, y = (v - .5) * 46;
    const frame = Math.round(turn * 8 / TAU) % 8, fold = WING_FOLD[frame], lift = -.85 * Math.sin(turn);
    const wx = 1 + (x - 1) / (1 - .22 * fold), wy = 5 + (y - lift - 5) / (1 - .24 * fold);
    let by = y;
    for (let i = 0; i < 2; i++) by = y - lift * clamp01((18 - by) / 13) * clamp01((x + 14) / 8);
    if (broad && inPoly(DRAGON_ICE_WING, wx, wy)) {
      const spine = -12 + (wy + 18) * .25;
      if (Math.abs(wx - spine) < .6) return plate(.99);
      if (wx > spine) return plate(.34);
      return plate(wy < -12 ? .93 : .81);
    }
    if (broad && inPoly(DRAGON_ICE_BACK, x, by)) {
      const ridge = 3.4 + (x + 2) * .22;
      return plate(by < ridge ? .96 : x + by < 3 ? .8 : .34);
    }
    // Keep the face entirely out of the plate treatment; the original water
    // current remains visible along the neck, belly and curling tail.
    if (x > -9 && x < 8 && by > 8 && by < 11 && broad) return swatch(water, .55 + pulse * .24);
    return null;
  }

  if (broad && inPoly(ICE_PLATE_LEFT, u, v)) {
    const ridge = .47 - (v - .2) * .075;
    if (Math.abs(u - ridge) < Math.max(s.px * .55, .014)) return plate(.99);
    if (u > ridge) return plate(.34);
    return plate(v < .34 ? .94 : .81);
  }
  if (broad && inPoly(ICE_PLATE_RIGHT, u, v)) {
    const ridge = .66 + (v - .28) * .1;
    if (Math.abs(u - ridge) < Math.max(s.px * .5, .012)) return plate(.97);
    return plate(u < ridge ? .8 : .35);
  }
  if (broad && inPoly(ICE_PLATE_FOOT, u, v)) {
    const ridge = .73 + (u - .4) * .17;
    return plate(v < ridge ? .82 : .34);
  }
  // Cyan liquid threads between clearly separate opaque plates. The moving
  // crest is confined to these channels and cannot wash over the frozen faces.
  const channel = .56 + Math.sin(v * 6 + phase) * .022;
  const inChannel = Math.abs(u - channel) < (fused ? .065 : .038) && v > .28 && v < .78;
  const lower = Math.abs(v - (.65 - (u - .4) * .18 + Math.sin(phase + u * 4) * .018)) < .035 && u > .26 && u < .79;
  if (inChannel || lower) return swatch(water, .48 + pulse * .27);
  if (a === ice && broad && u > .21 && u < .55 && v > .48 && v < .7) return swatch(water, .36 + pulse * .18);
  return null;
}

/** Distance to a short authored polyline, measured in normalized body space. */
function pathDistance(u: number, v: number, points: readonly (readonly [number, number])[]): number {
  let result = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp01(((u - a[0]) * dx + (v - a[1]) * dy) / Math.max(.0001, dx * dx + dy * dy));
    result = Math.min(result, Math.hypot(u - a[0] - t * dx, v - a[1] - t * dy));
  }
  return result;
}

function sharedSurface(a: InteractionMaterial, b: InteractionMaterial, s: Surface): Swatch | null {
  const { u, v, tone, phase, turn, fused, broad } = s;
  const has = (id: string): boolean => a.element === id || b.element === id;
  const of = (id: string): InteractionMaterial => a.element === id ? a : b;
  const grain = Math.sin(phase) * .018;
  const one = Math.max(.018, Math.min(.055, s.px * .7));
  const volume = .14 + tone * .68;

  if (has('fogo') && has('raio')) {
    const fire = of('fogo'), electric = of('raio');
    const along = s.wide ? u : v, across = s.wide ? v : u;
    // One front conducts from root to tip, cools, then returns through the
    // shared eight-frame loop. Its orange response follows one frame later;
    // it never reverses direction like a sinusoidal highlight.
    const progress = clamp01((along - .14) / .74);
    const age = ((phase / TAU - progress) % 1 + 1) % 1;
    const responseAge = ((phase / TAU - 1 / 8 - progress) % 1 + 1) % 1;
    const pulse = clamp01(1 - age / .19);
    const after = clamp01(1 - responseAge / .24);
    const center = s.wide ? .51 : fused ? .46 : .61;
    const bend = s.wide ? .035 : .08;
    const bolt = pathDistance(across, along, [
      [center + .02, .14], [center - bend + grain * .5, .34], [center + bend * .7, .42],
      [center - bend * .5, .6], [center + bend - grain * .5, .7], [center + .02, .88]
    ]);
    const branch = s.wide ? 1 : pathDistance(across, along, [[center + .01, .51], [center + .16, .42], [center + .12, .29]]);
    const d = Math.min(bolt, branch), pixel = s.wide ? s.py : s.px;
    const core = Math.max(.018, Math.min(.055, pixel * .65));
    if (d < core * (.65 + pulse * .35) && along > .16 && along < .86) return swatch(electric, .24 + pulse * .72);
    if (d < core * (1.6 + after * .9) && along > .18 && along < .85) {
      return pulse > .5 && d < core * 1.6 ? contact(fire, .65 + tone * .1, electric, .81) : swatch(fire, .43 + after * .31 + tone * .12);
    }
    if (!broad) return null;
    if (b === fire) {
      const tongue = center + Math.sin(along * 5.2 + Math.sin(phase) * .3) * .06;
      if (across > tongue && across < .8 && along > .23 && along < .84) return swatch(fire, volume + after * .13);
    } else if (!fused && !s.wide && across > .64 && across < .8 && along > .28 && along < .73) {
      return swatch(electric, volume - .13);
    }
    return null;
  }

  if (has('agua') && has('gelo')) {
    return frozenWater(a, b, s);
  }

  if (has('fogo') && (STONE.has(a.element) || STONE.has(b.element))) {
    const fire = of('fogo'), rock = a === fire ? b : a;
    const cut = .55 + (v < .37 ? (.37 - v) * .48 : v < .61 ? 0 : (v - .61) * -.55);
    const crack = Math.min(Math.abs(u - cut), v > .43 && v < .64 ? Math.abs(u - (.55 - (v - .43) * 1.3)) : 1);
    if (v > .2 && v < .84 && crack < one * 1.4) return swatch(fire, crack < one * .62 ? .8 : .43 + Math.sin(turn) * .04);
    if (b === rock && broad && u > .46 + v * .15 && u < .87) return swatch(rock, volume - .08);
    return null;
  }

  if (has('metal') && has('raio')) {
    const metal = of('metal'), electric = of('raio');
    const reflection = u + v * .24;
    // Current bends at one reflection plane and has a darker conductive rail.
    const rail = .61 + (v > .53 ? (v - .53) * .55 : 0) + grain;
    const d = Math.abs(reflection - rail);
    // A discharge runs along the conductive rail instead of illuminating its
    // entire length continuously. The dark socket remains visible after it;
    // only the nearby metal plane catches a brief reflected cyan step.
    const progress = clamp01((v - .17) / .66);
    const age = ((phase / TAU - progress) % 1 + 1) % 1;
    const pulse = clamp01(1 - age / .2);
    if (v > .17 && v < .83 && d < one * .85) return swatch(electric, .2 + pulse * .76);
    if (v > .2 && v < .8 && d < one * 2.8) {
      if (d < one * 1.6) return swatch(metal, .14 + pulse * .08);
      return pulse > .3 ? contact(metal, .58 + tone * .17, electric, .5 + pulse * .4) : swatch(metal, .58 + tone * .17);
    }
    if (b === metal && broad && reflection > .52 && reflection < .88) return swatch(metal, volume);
    return null;
  }

  if (has('raio')) {
    const electric = of('raio');
    const along = s.wide ? u : v, across = s.wide ? v : u;
    const d = pathDistance(across, along, [[.59, .18], [.48 + grain, .38], [.65, .43], [.51, .64], [.6, .8]]);
    if (d < one * .85) return swatch(electric, .8);
    if (d < one * 1.7) return swatch(electric, .46 + tone * .2);
    if (b !== electric && broad && u > .58 - v * .12 && v > .16 && v < .84) return swatch(b, volume - .04);
    return null;
  }

  if (DARK.has(a.element) || DARK.has(b.element) || SPACE.has(a.element) || SPACE.has(b.element)) {
    const secondaryDark = DARK.has(b.element);
    const primaryDark = DARK.has(a.element);
    // Two open, interlocking folds share one volume. The secondary current
    // narrows at the poles and curls back beneath the primary at its foot;
    // the far flank remains primary material instead of becoming half a ball.
    const edge = .54 + Math.sin(v * 8 - 1.65 + Math.sin(phase) * .48) * .115;
    const d = u - edge;
    const pulseAt = .5 + Math.sin(phase) * .25;
    const pulse = clamp01(1 - Math.abs(v - pulseAt) / .16);
    const following = clamp01(1 - Math.abs(v - (.5 + Math.sin(phase - TAU / 8) * .25)) / .16);
    // The lower fold opens into the outer flank, preventing an isolated
    // crescent mark in the center. Its returning tip stays connected to it.
    const width = .095 + Math.sin(clamp01((v - .13) / .76) * Math.PI) * .095 + clamp01((v - .52) / .2) * .24;
    const curl = Math.sin(phase) * .025;
    const tongue = pathDistance(u, v, [[.59, .65], [.47 + curl, .72], [.35 + curl, .69], [.32 + curl, .61]]);
    const returnWidth = .035 + clamp01(1 - Math.abs(pulseAt - .66) / .23) * .025;
    const inFold = d > .005 && d < width && v > .17 && v < .86;
    const inReturn = tongue < returnWidth && u < .59;
    if (broad && (inFold || inReturn)) {
      const recess = inFold && d > width * .6 ? -.12 : .035;
      const lit = secondaryDark ? .13 + tone * .24 : .2 + tone * .49;
      return swatch(b, lit + recess + pulse * (secondaryDark ? .06 : .15));
    }
    // Pressure visibly compresses the blue ridge against the purple fold.
    // Only this small touching ridge borrows reflected colour from its peer.
    if (d > -.055 - following * .035 && d <= .005 && v > .24 && v < .8) {
      return contact(a, primaryDark ? .27 + tone * .16 : tone + .12 + following * .1, b, secondaryDark ? .3 : .56);
    }
    if (!fused && d > width && d < width + one && v > .27 && v < .75) return swatch(a, Math.max(.12, tone - .17));
    if (fused && tongue > returnWidth && tongue < returnWidth + .025 && u < .54) return contact(a, primaryDark ? .25 : tone + .04, b, .42);
    return null;
  }

  // Other combinations use a single interlocking material plane. This is a
  // partition of the existing silhouette, never another shape pasted on top.
  const edge = .59 - (v - .5) * .2 + (fused ? Math.sin(v * 5.4 + phase) * .105 : v < .43 ? (v - .43) * .24 : 0);
  const d = u - edge;
  if (broad && d > .02 && v > .14 && v < .87) return swatch(b, volume + (v < .42 ? .06 : -.06));
  if (Math.abs(d) < one && v > .24 && v < .77) return swatch(b, .48 + tone * .25);
  return null;
}

/**
 * Paint material contact into an isolated, already-painted body. Inputs are
 * ordered: the first is the authored base. No global averaging of palettes,
 * semantic changes, external particles, extra objects, or persistent caches.
 * Alpha and dark cuts stay exact. Contour colours stay exact except up to two
 * existing wing pixels on a known miniature water/ice dragon. Peak highlights
 * stay exact except nonsemantic water glints occluded by a known ice plate.
 * Call before exterior accents/compositing.
 */
export function paintMaterialInteraction(
  body: Pix, bounds: InteractionBounds, materials: readonly InteractionMaterial[],
  options: MaterialInteractionOptions = {}
): void {
  const unique = materials.filter((m, i) => m.ramp.length && materials.findIndex(o => o.element === m.element) === i);
  if (unique.length < 2 || ![bounds.l, bounds.t, bounds.r, bounds.b].every(Number.isFinite)) return;
  const surface = options.surfaceBounds && [options.surfaceBounds.l, options.surfaceBounds.t, options.surfaceBounds.r, options.surfaceBounds.b].every(Number.isFinite)
    ? options.surfaceBounds : bounds;
  const w = surface.r - surface.l, h = surface.b - surface.t;
  if (w <= 1 || h <= 1) return;
  const l = Math.max(1, Math.ceil(bounds.l)), r = Math.min(body.w - 2, Math.floor(bounds.r));
  const t = Math.max(1, Math.ceil(bounds.t)), b = Math.min(body.h - 2, Math.floor(bounds.b));
  const frame = Number.isFinite(options.frame) ? ((Math.floor(options.frame!) % 8) + 8) % 8 : 0;
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed!) : 0;
  const turn = frame * TAU / 8;
  const phase = turn + (((Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * TAU;
  const base = unique[0], authored = options.authoredRamp?.length ? options.authoredRamp : base.ramp;
  const low = luma(authored[0]), high = luma(authored[authored.length - 1]);
  const first = authored[0], peak = authored[authored.length - 1], data = body.data;
  const tinyWing = new Map<number, number>();
  const tinyIce = options.form === 'dragao' && base.element === 'agua' && w <= 16 && h <= 14
    ? unique.find(m => m.element === 'gelo') : undefined;
  if (tinyIce) {
    // An authored miniature has no two-pixel-deep wing interior. Recolour only
    // its existing tip and one touching wing pixel; never add alpha or reach
    // the head. Selection follows the occupied wing as its small stroke moves.
    const onWing = (x: number, y: number): boolean => {
      const local = (x - surface.l) / w, u = options.reverse ? 1 - local : local, v = (y - surface.t) / h;
      const i = (y * body.w + x) * 4;
      return x >= l && x <= r && y >= t && y <= b && u >= .14 && u <= .46 && v >= .05 && v <= .48 &&
        data[i + 3] > 0 && luma(data.subarray(i, i + 3)) > low + 1;
    };
    let tip: Point | undefined;
    for (let y = t; y <= b && !tip; y++) for (let k = 0; k <= r - l; k++) {
      const x = options.reverse ? r - k : l + k;
      if (onWing(x, y)) { tip = [x, y]; break; }
    }
    if (tip) {
      const [x, y] = tip, dir = options.reverse ? -1 : 1;
      tinyWing.set((y * body.w + x) * 4, .98);
      for (const [dx, dy] of [[0, 1], [-dir, 1], [dir, 1], [dir, 0]]) if (onWing(x + dx, y + dy)) {
        tinyWing.set(((y + dy) * body.w + x + dx) * 4, .76); break;
      }
    }
  }

  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
    const i = (y * body.w + x) * 4;
    // Never grow a silhouette, fill a hole, or erase its inner contour.
    if (!data[i + 3] || (!tinyWing.has(i) && (!data[i - 4 + 3] || !data[i + 4 + 3] || !data[i - body.w * 4 + 3] || !data[i + body.w * 4 + 3] ||
      !data[i - body.w * 4 - 4 + 3] || !data[i - body.w * 4 + 4 + 3] || !data[i + body.w * 4 - 4 + 3] || !data[i + body.w * 4 + 4 + 3]))) continue;
    const red = data[i], green = data[i + 1], blue = data[i + 2];
    const near = (color: RGB): boolean => Math.max(Math.abs(red - color[0]), Math.abs(green - color[1]), Math.abs(blue - color[2])) <= 5;
    const illumination = luma([red, green, blue]);
    if (Math.max(red, green, blue) < 22 || illumination <= low + 1 || near(first)) continue;
    const peakHighlight = illumination >= high - 1 || near(peak);
    const tone = clamp01((illumination - low) / Math.max(1, high - low));
    const localU = (x - surface.l) / w, u = options.reverse ? 1 - localU : localU, v = (y - surface.t) / h;
    let sample: Swatch | null = null;
    for (let k = 1; k < unique.length; k++) {
      const secondary = unique[k];
      // A compact body has at most two broad domains. Extra constituents get
      // short attached contacts on that interface, not ever-thinner stripes.
      if (k > 1 && (v < .2 + ((k - 2) % 4) * .14 || v > .36 + ((k - 2) % 4) * .14)) continue;
      const candidate = sharedSurface(base, secondary, {
        u, v, px: 1 / w, py: 1 / h, tone, phase: phase + (k - 1) * .7, turn,
        wide: w > h * 1.55, fused: !!options.linked && !!options.merged && familyOf(base.element) === familyOf(secondary.element), broad: k === 1, form: options.form
      });
      if (candidate) sample = candidate;
    }
    if (tinyIce && tinyWing.has(i)) sample = { material: tinyIce, tone: tinyWing.get(i)!, surfaceOcclusion: true };
    if (!sample || (peakHighlight && !sample.surfaceOcclusion)) continue;
    let color = sample.material.ramp[Math.round(clamp01(sample.tone) * (sample.material.ramp.length - 1))];
    if (sample.reflection) {
      const { material, tone: reflectedTone } = sample.reflection;
      const reflected = material.ramp[Math.round(clamp01(reflectedTone) * (material.ramp.length - 1))];
      color = mixRGB(color, reflected, .25);
    }
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2];
  }
}

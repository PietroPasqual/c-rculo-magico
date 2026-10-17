import type { Appearance, Being } from '../core/appearance';
import { spellRamp as rampOf } from './pixel-spell-palette';
import { clamp01, darken, fbm, inPoly, lighten, mixRGB, Pix, rgb, type RGB } from './pixel';
import { jitter, seeded, type Rand } from './sketch';
import { materialPixel, type SpellMaterial } from './pixel-materials';
import { paintMaterialInteraction } from './pixel-material-interaction';
import { paintElementAccents } from './pixel-element-fx';
import { familyOf } from '../core/structural';
import { paintGuard, paintOrbitArc, paintState, paintSurfaceContact } from './pixel-structure-fx';
import { appearanceForScene, layoutParts, layoutScene, type Pose } from './pixel-scene-layout';
import { paintIntention } from './pixel-intention';
import { paintIntentionGlyph } from './pixel-intention-glyph';
import { paintIntentionAura } from './pixel-intention-aura';
import { paintEmbers, paintEnergyAccents, paintFireWisps, paintRadiance } from './pixel-radiance-fx';
import { paintSpellWake, paintSpellTransport } from './pixel-motion-fx';
import { paintSpellSprite, spellSpriteBounds, spellSpriteOf } from './pixel-spell-sprites';

// Aparência da Magia em pixel art (estilo jogo 16-bit).
// A tela tem 180×105 pixels; o painel mostra cada pixel como um quadradinho (2×2 do viewBox).
// Quem lança fica à esquerda, a magia no centro, a frente é para a direita, o chão embaixo.

export const PW = 180;
export const PH = 105;
const G = 97;

type P2 = [number, number];
const R = Math.round;

// ---------- cores ----------

const FIRE = rampOf('fogo');
const WHITE: RGB = [255, 255, 255];
const top = (r: RGB[]): RGB => r[r.length - 1];
const mid = (r: RGB[]): RGB => r[Math.floor(r.length / 2)];
const light = (r: RGB[]): RGB => r[r.length - 2];
const ink = (r: RGB[]): RGB => darken(r[0], 0.45);

/** Only a family actually fused by Ligação shares a continuous material palette. */
function fusedElements(b: Being): string[] {
  const first = b.elements[0];
  return first && b.linked && b.merged ? b.elements.filter(e => familyOf(e) === familyOf(first)) : b.elements.slice(0, 1);
}

function beingRamp(b: Being): RGB[] {
  const primary = rampOf(b.elements[0] ?? b.concepts[0]);
  const fused = fusedElements(b);
  if (fused.length < 2) return primary;
  // Warm flame planes and cold electricity need distinct hues even in one
  // fused volume. The shared surface carries the secondary channel and its
  // delayed response; averaging these complementary ramps erases both.
  if ((fused[0] === 'fogo' || fused[0] === 'raio') && fused.includes('fogo') && fused.includes('raio')) return primary;
  const ramps = fused.map(rampOf);
  return primary.map((_, i) => ramps.reduce((color, r, j) => mixRGB(color, r[R(i / (primary.length - 1) * (r.length - 1))], 1 / (j + 1)), primary[i]));
}

type Mat = SpellMaterial;
const MAT: Record<string, Mat> = {
  fogo: 'fire', raio: 'plasma', luz: 'plasma', agua: 'water', acido: 'water', gelo: 'ice',
  terra: 'stone', materia: 'stone', gravidade: 'stone', metal: 'metal', vento: 'wind', som: 'wind'
};

// ---------- formas ----------

/** Caixa de um objeto desenhado */
interface Box { l: number; t: number; r: number; b: number }
const cxOf = (q: Box): number => (q.l + q.r) / 2;
const cyOf = (q: Box): number => (q.t + q.b) / 2;
const union = (list: Box[]): Box => ({ l: Math.min(...list.map(q => q.l)), t: Math.min(...list.map(q => q.t)), r: Math.max(...list.map(q => q.r)), b: Math.max(...list.map(q => q.b)) });

interface Ctx { pix: Pix; ramp: RGB[]; mat: Mat; flight: boolean; seed: number; element?: string; reverse?: boolean }

function surface(c: Ctx, px: number, py: number, q: Box, light: number): RGB {
  const sample = materialPixel(c.ramp, c.mat, px, py, (px - q.l) / Math.max(1, q.r - q.l), (py - q.t) / Math.max(1, q.b - q.t), light, c.seed, c.element);
  // The texture sits on a volume: a reflection cannot flatten the unlit face.
  // Reuse palette entries so bevels stay crisp at the native pixel resolution.
  const last = c.ramp.length - 1;
  if (last < 1) return sample;
  const texture = c.ramp.indexOf(sample) / last;
  const shadow = c.mat === 'energy' && (c.element === 'sombra' || c.element === 'morte' || c.element === 'vazio');
  const solid = c.mat === 'stone' || c.mat === 'metal' || c.mat === 'ice';
  const faceWeight = shadow ? .12 : solid ? .28 : .12;
  const face = shadow ? .02 + light * (c.element === 'vazio' ? .2 : .36) : .04 + light * .92;
  return c.ramp[R(clamp01(texture * (1 - faceWeight) + face * faceWeight) * last)];
}

/** Esfera com luz de cima à esquerda, brilho e contorno */
function sphere(c: Ctx, x: number, y: number, r: number): Box {
  const { pix, ramp } = c;
  const L = [-0.5, -0.62, 0.6];
  const q = { l: x - r, t: y - r, r: x + r, b: y + r };
  const shadow = c.mat === 'energy' && (c.element === 'sombra' || c.element === 'morte' || c.element === 'vazio');
  pix.shape(x - r, y - r, x + r, y + r, (px, py) => {
    const dx = (px - x) / r, dy = (py - y) / r, d2 = dx * dx + dy * dy;
    if (d2 > 1) return null;
    const z = Math.sqrt(1 - d2);
    const light = clamp01((dx * L[0] + dy * L[1] + z * L[2]) * 0.85 + 0.2);
    if (shadow && d2 > .68 && d2 < .94 && dx < -.12 && dy < -.08) {
      // A broken smoke fold describes the dark sphere without a silver rim.
      const tone = c.element === 'vazio' ? .24 : c.element === 'morte' ? .45 : .39;
      return ramp[R(tone * (ramp.length - 1))];
    }
    // A short reflected crescent separates the underside from the core without
    // drawing a complete bright ring around every elemental sphere.
    const bounce = d2 > .72 && d2 < .92 && dx > .15 && dy > .12 ? .13 : 0;
    const glint = c.mat !== 'fire' && r >= 5 && Math.hypot(dx + .34, (dy + .42) * 1.3) < .13 ? .94 : light + bounce;
    return surface(c, px, py, q, glint);
  }, ink(ramp));
  return q;
}

/** Caixa com frente, topo e lateral (Cubo e Paralelepípedo) */
function cube(c: Ctx, x: number, y: number, w: number, h: number): Box {
  const { pix, ramp } = c;
  const d = R(Math.min(w, h) * 0.38);
  const fx = R(x - w / 2 - d / 2), fy = R(y - h / 2 + d / 2), W = R(w), H = R(h);
  const topP: P2[] = [[fx, fy], [fx + d, fy - d], [fx + W + d, fy - d], [fx + W, fy]];
  const sideP: P2[] = [[fx + W, fy], [fx + W + d, fy - d], [fx + W + d, fy + H - d], [fx + W, fy + H]];
  const q = { l: fx, t: fy - d, r: fx + W + d, b: fy + H };
  pix.shape(fx, fy - d, fx + W + d, fy + H, (px, py) => {
    const inFront = px >= fx && px < fx + W && py >= fy && py < fy + H;
    if (inFront) {
      if (py === fy || px === fx) return surface(c, px, py, q, .92);
      const v = (py - fy) / H, u = (px - fx) / W;
      const bevel = W >= 7 && H >= 7 && (px === fx + W - 1 || py === fy + H - 1);
      return surface(c, px, py, q, bevel ? .27 : .74 - v * .23 - u * .1);
    }
    if (inPoly(topP, px + 0.5, py + 0.5)) {
      const backEdge = py <= fy - d + 1;
      return surface(c, px, py, q, backEdge ? .98 : .87 + (fx + W - px) / Math.max(1, W + d) * .08);
    }
    if (inPoly(sideP, px + 0.5, py + 0.5)) {
      const edge = px >= fx + W + d - 1;
      return surface(c, px, py, q, edge ? .4 : .3 - ((py - fy) / H) * .12);
    }
    return null;
  }, ink(ramp));
  return q;
}

/** Pirâmide: em pé (duas faces) ou deitada como ponta de lança para a frente */
function pyramid(c: Ctx, x: number, y: number, r: number): Box {
  const { pix, ramp } = c;
  if (c.flight) {
    const dir = c.reverse ? -1 : 1;
    const tip: P2 = [x + dir * r * 1.3, y], up: P2 = [x - dir * r * 0.8, y - r * 0.85], dn: P2 = [x - dir * r * 0.8, y + r * 0.85], m: P2 = [x - dir * r * 0.5, y];
    const box = { l: Math.min(up[0], tip[0]), t: up[1], r: Math.max(up[0], tip[0]), b: dn[1] };
    pix.shape(box.l, up[1], box.r, dn[1], (px, py) => {
      const q: P2 = [px + 0.5, py + 0.5];
      if (inPoly([tip, up, m], ...q)) {
        const u = (px - up[0]) / (tip[0] - up[0]);
        const ridge = Math.abs(py - y) < Math.max(.6, (1 - u) * 1.4);
        return surface(c, px, py, box, ridge ? .97 : .91 - u * .16);
      }
      if (inPoly([tip, m, dn], ...q)) return surface(c, px, py, box, .34 - (py - y) / Math.max(1, r) * .12);
      return null;
    }, ink(ramp));
    return box;
  }
  const apex: P2 = [x + r * 0.1, y - r * 1.15], bl: P2 = [x - r, y + r * 0.8], bm: P2 = [x + r * 0.3, y + r * 0.95], br: P2 = [x + r, y + r * 0.65];
  const box = { l: bl[0], t: apex[1], r: br[0], b: bm[1] };
  pix.shape(bl[0], apex[1], br[0], bm[1], (px, py) => {
    const q: P2 = [px + 0.5, py + 0.5];
    if (inPoly([apex, bl, bm], ...q)) {
      const v = (py - apex[1]) / (bm[1] - apex[1]);
      const ridgeX = apex[0] + (bm[0] - apex[0]) * v;
      const ridge = Math.abs(px - ridgeX) < .8;
      const foot = py > bl[1] + (px - bl[0]) / (bm[0] - bl[0]) * (bm[1] - bl[1]) - 1.5;
      return surface(c, px, py, box, ridge ? .98 : foot ? .58 : .94 - v * .22);
    }
    if (inPoly([apex, bm, br], ...q)) return surface(c, px, py, box, .36 - (py - apex[1]) / (bm[1] - apex[1]) * .12);
    return null;
  }, ink(ramp));
  return box;
}

/** Sem formato: uma massa de energia ondulada */
function blob(c: Ctx, x: number, y: number, r: number): Box {
  const { pix, ramp, seed } = c;
  const q = { l: x - r, t: y - r, r: x + r, b: y + r };
  pix.shape(x - r * 1.2, y - r * 1.2, x + r * 1.2, y + r * 1.2, (px, py) => {
    const a = Math.atan2(py - y, px - x), d = Math.hypot(px - x, py - y);
    const rr = r * (.9 + .07 * Math.sin(a * 5 + seed) + (fbm(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, seed) - .5) * .12);
    if (d > rr) return null;
    const u = (px - x) / r, v = (py - y) / r;
    const fold = Math.abs(u - (.16 + Math.sin(v * 3 + seed) * .2)) < .1 && v > -.45 && v < .65;
    const crest = Math.abs(v + .28 + u * .42) < .12 && u > -.55 && u < .1;
    const light = .86 - d / rr * .4 - (u + v) / 6;
    return surface(c, px, py, q, crest ? .97 : fold ? light - .23 : light);
  }, ink(ramp));
  return q;
}

// ---------- efeitos ----------

/**
 * Fogo em pixel: três línguas conectadas, planos quentes e dobras escuras.
 * Parado, as chamas sobem; em voo, viram uma cauda para trás.
 */
function flames(pix: Pix, q: Box, flight: boolean, seed: number, ramp: RGB[] = FIRE, rise = .62, phase = 0): void {
  const cx = cxOf(q), cy = cyOf(q);
  const rx = Math.max(4, (q.r - q.l) / 2), ry = Math.max(4, (q.b - q.t) / 2);
  const compact = rise >= 1, turn = (phase + seed % 8) * Math.PI / 4;
  const l = flight ? q.l - rx * 2 : q.l - rx * .4, r = q.r + rx * .4;
  const t = q.t - ry * (compact ? .7 : 1.05), b = q.b + ry * .2;
  const tongues = [[-.4, 1.48, .32], [.05, 1.92, .38], [.48, 1.2, .3]]
    .map(([offset, height, width], i) => ({ offset, width, h: height * (compact ? .8 : 1) + Math.sin(turn + i * 2) * .08, twist: i * 1.7 + turn }));
  for (let y = Math.floor(t); y <= b; y++) for (let x = Math.floor(l); x <= r; x++) {
    // A real flame silhouette: three connected, tapered lobes with quiet gaps.
    // No random grain. Their tips roll at different moments of the same loop.
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    const u = flight ? -dy : dx, v = flight ? dx * .8 : dy;
    const bend = Math.sin(turn + v * 2) * .07;
    let heat = 1 - Math.hypot((u + bend) / .88, (v - .22) / .84);
    for (const { offset, width, h, twist } of tongues) {
      const progress = (v + h) / (h + .45);
      if (progress <= 0 || progress > 1) continue;
      const curve = offset + Math.sin(progress * 3.5 + twist) * .15 * (1 - progress);
      const taper = width * Math.pow(progress, .7);
      heat = Math.max(heat, (1 - Math.abs(u - curve) / taper) * Math.min(1, progress * 1.7) * .86);
    }
    if (heat <= 0) continue;
    // Warm planes wrap a bright lower heart. The crimson seam keeps the two
    // large hot folds separate even at native thumbnail resolution.
    let tone = heat < .16 ? .15 : heat < .4 ? .34 : heat < .66 ? .53 : .72;
    const seam = .18 + Math.sin(v * 3 + turn) * .08;
    if (v > -.9 && v < .2 && Math.abs(u - seam) < .07) tone = Math.max(.16, tone - .22);
    if (Math.hypot((u + .18) * 1.5, (v - .43) * 1.25) < .22 && heat > .56) tone = .99;
    else if (u < -.04 && u > -.32 && v > -.45 && v < .6 && heat > .5) tone = .84;
    pix.set(x, y, ramp[R(clamp01(tone) * (ramp.length - 1))]);
  }
}

/** Runas de conceito: anel pontilhado e o símbolo de cada uma */
function aura(pix: Pix, concept: string, cx: number, cy: number, r: number, glow = true, phase = 0, ring = true): void {
  const ramp = rampOf(concept), c = mid(ramp), hi = light(ramp), turn = phase * Math.PI / 4;
  if (glow) pix.halo(cx, cy, r, r, c, 0.25);
  if (ring) pix.ellipse(cx, cy, r, r, c, 'all', 2);
  if (concept === 'tempo') for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + turn; pix.line(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * (r - (i % 3 ? 1 : 3)), cy + Math.sin(a) * (r - (i % 3 ? 1 : 3)), hi); }
  if (concept === 'movimento') for (let i = 0; i < 3; i++) for (let k = 0; k < 8; k++) { const a = i * 2.1 + k * 0.1 + turn; pix.set(cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2), hi); }
  if (concept === 'pressao') for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4 + Math.sin(turn) * .12; pix.line(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5), cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1), hi); }
  if (concept === 'caos') for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + turn; pix.set(cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2), hi); pix.set(cx + Math.cos(a + 0.2) * (r - 2), cy + Math.sin(a + 0.2) * (r - 2), hi); }
  if (concept === 'vazio') pix.halo(cx, cy, r * 0.7, r * 0.7, [0, 0, 0], 0.5);
  if (concept === 'infinito') for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; pix.set(cx + Math.sin(a) * 6, cy - r - 4 + Math.sin(a * 2 + turn) * 2, hi); }
  if (concept === 'vida') { const y = cy + r + 3; pix.line(cx - 6, y, cx - 2, y, hi); pix.line(cx - 2, y, cx, y - 3, hi); pix.line(cx, y - 3, cx + 2, y + 2, hi); pix.line(cx + 2, y + 2, cx + 3, y, hi); pix.line(cx + 3, y, cx + 6, y, hi); }
  if (concept === 'morte') for (let i = 0; i < 3; i++) for (let k = 0; k < 6; k++) pix.set(cx - 4 + i * 4 + (k % 2), cy - r - 1 - k, darken(c, 0.2));
}

// ---------- um ser ----------

export interface Label { x: number; y: number; text: string }

/** Native pixel layers keep decoration outside the sprite's authored details. */
function copySpellLayer(destination: Pix, layer: Pix, allowed?: Uint8Array, clip?: Box): void {
  const left = Math.max(0, Math.floor(clip?.l ?? 0)), top = Math.max(0, Math.floor(clip?.t ?? 0));
  const right = Math.min(layer.w - 1, Math.ceil(clip?.r ?? layer.w - 1));
  const bottom = Math.min(layer.h - 1, Math.ceil(clip?.b ?? layer.h - 1));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const pixel = y * layer.w + x, i = pixel * 4;
    if (layer.data[i + 3] && (!allowed || allowed[pixel]))
      destination.data.set(layer.data.subarray(i, i + 4), i);
  }
}

function paintBeing(pix: Pix, b: Being, pose: Pose, idx: number, labels: Label[], phase = 0): Box {
  const { x, y, s } = pose;
  const el = b.elements[0] ?? b.concepts[0];
  const ramp = beingRamp(b);
  const mat: Mat = (el ? MAT[el] : undefined) ?? 'energy';
  const flight = b.projectile || b.placement === 'flight';
  const reverse = flight && b.direction === 'back', travel = b.placement === 'flight' && !reverse;
  const moving = !!pose.orbit || b.placement === 'flight' || (b.direction === 'forward' && b.placement === 'front');
  const seed = idx * 17 + 3;
  const c: Ctx = { pix, ramp, mat, flight, seed, element: el, reverse };

  // Assembly and destination are independent: a projected projectile keeps its shape.
  const arrangement = layoutParts(b, s), shapes = arrangement.parts.map(p => p.shape);
  const molded = !!(b.intentForm || b.intentGlyph);
  const coherent = spellSpriteOf(b);
  const interacting = new Set(b.elements).size > 1;
  const incorporeal = !b.elements.length && !b.shapes.length && b.concepts.length > 0;
  const spellBody = !incorporeal ? new Pix(pix.w, pix.h) : null;
  const bodyTarget = spellBody ?? pix;
  const effectsTarget = spellBody ? new Pix(pix.w, pix.h) : pix;
  // caixa aproximada antes de desenhar (para o brilho e as chamas de trás)
  const guess: Box = { l: x - arrangement.width / 2, t: y + arrangement.top, r: x + arrangement.width / 2, b: y + arrangement.bottom };
  const grounded = guess.b >= G - 6;
  const gcx = cxOf(guess), gcy = cyOf(guess), gw = guess.r - guess.l, gh = guess.b - guess.t;

  // atrás: aura de conceito, selo, brilho, chamas
  b.concepts.forEach((cn, i) => aura(pix, cn, gcx, gcy, Math.max(gw, gh) / 2 + 3 + Math.min(i, 2) * 2, !spellBody, phase, !interacting || !spellBody));
  if (incorporeal)
    pix.halo(gcx, gcy, gw / 2 + s * 0.9, gh / 2 + s * 0.8, mat === 'stone' || mat === 'metal' ? light(ramp) : mat === 'fire' ? FIRE[3] : ramp[ramp.length - 2], .12);
  const fireIn = mat === 'fire' || b.elements.slice(1).some(e => MAT[e] === 'fire');
  const unshapedFire = mat === 'fire' && !shapes.length && !molded;
  if (fireIn && !unshapedFire && !coherent && !moving && !interacting) {
    // The material may flicker, but the intended weapon must keep its silhouette.
    if (!molded) flames(effectsTarget, guess, travel, seed, FIRE, 1.05, phase);
    paintFireWisps(effectsTarget, guess, travel, seed, FIRE, phase);
  }

  // o corpo
  const boxes: Box[] = [];
  if (incorporeal) {
    // Concepts have observable auras, but do not acquire an invented solid body.
    boxes.push(guess);
  } else if (coherent) {
    boxes.push(paintSpellSprite(coherent, bodyTarget, x, y, s, ramp, seed, (phase + idx * 3) % 8, reverse, b.placement === 'flight' && !b.orbit));
  } else if (b.intentForm) {
    boxes.push(paintIntention(bodyTarget, b.intentForm, x, y, s, ramp, mat, seed, el, reverse));
  } else if (b.intentGlyph) {
    boxes.push(paintIntentionGlyph(bodyTarget, b.intentGlyph, x, y, s, ramp, mat, seed, el, reverse));
  } else if (unshapedFire) {
    const q = { l: x - s * .8, t: y - s * .8, r: x + s * .8, b: y + s * .8 };
    flames(bodyTarget, q, travel, seed, FIRE, .62, phase); boxes.push(q);
  } else {
    arrangement.parts.forEach((part, i) => {
      const cx = x + (reverse ? -part.x : part.x), q = part.shape, material = { ...c, pix: bodyTarget, seed: seed + i * 97 };
      if (q === 'forma_cubo') boxes.push(cube(material, cx, y, s * 1.3, s * 1.3));
      else if (q === 'forma_paralelepipedo') boxes.push(flight ? cube(material, cx, y, s * 2.2, s * 1.05) : cube(material, cx, y, s * 1.1, s * 2.45));
      else if (q === 'forma_piramide') boxes.push(pyramid(material, cx, y, s));
      else boxes.push(sphere(material, cx, y, s * 0.82));
    });
    if (!boxes.length) boxes.push(mat === 'plasma' || mat === 'water' || mat === 'ice' ? sphere({ ...c, pix: bodyTarget }, x, y, s * 0.78) : blob({ ...c, pix: bodyTarget }, x, y, s * 0.8));
  }
  const all = union(boxes);

  // ligação: faixa de luz entre as peças
  if ((b.linked || flight) && boxes.length > 1) {
    const col = b.merged ? mid(c.ramp) : light(c.ramp);
    const joined = [...boxes].sort((a, b2) => a.l - b2.l);
    for (let i = 1; i < joined.length; i++) {
      const a = joined[i - 1].r - 1, z = joined[i].l + 1;
      // Join the seams rather than washing a white beam over every material.
      for (let px = Math.min(a, z); px <= Math.max(a, z); px++) {
        if (b.merged) bodyTarget.line(px, y - 2, px, y + 2, col);
        else { bodyTarget.set(px, y - 1, mid(c.ramp)); bodyTarget.set(px, y, col); }
      }
      if (b.linked && !b.merged) {
        const seam = (a + z) / 2;
        bodyTarget.set(seam, y - 2, light(c.ramp)); bodyTarget.set(seam, y + 2, light(c.ramp));
      }
    }
  }

  // Constituents share the authored surface instead of pasting a second ball
  // onto its face. Separate formats retain their own material contacts; only an
  // actually merged assembly receives one continuous surface across its seams.
  if (spellBody && interacting) {
    const materials = b.elements.map(element => ({ element, ramp: rampOf(element) }));
    const domains = boxes.length > 1 && !b.merged ? boxes : [all];
    // Rigid ice faces use a fixed local volume, not the water crest's changing
    // occupied rectangle. The liquid can then move around a stable crystal.
    const iceWater = b.elements.includes('agua') && b.elements.includes('gelo');
    const fixed = iceWater && (coherent === 'water-sphere' || coherent === 'ice-sphere') ? spellSpriteBounds(coherent, s) : undefined;
    domains.forEach(bounds => paintMaterialInteraction(spellBody, bounds, materials, {
      linked: b.linked, merged: b.merged, frame: coherent ? (phase + idx * 3) % 8 : phase, seed, reverse, authoredRamp: ramp,
      // Anatomy coordinates belong only to the authored dragon, not to the
      // differently proportioned generic form used by other primary elements.
      form: coherent === 'water-dragon' ? 'dragao' : coherent?.endsWith('-sphere') ? 'esfera' : undefined,
      surfaceBounds: fixed ? { l: x + fixed.l, t: y + fixed.t, r: x + fixed.r, b: y + fixed.b } : undefined
    }));
  }

  // na frente: o efeito do material
  const fx = (m: Mat, r2: RGB[], e: string): void => {
    if (m === 'fire') paintEmbers(effectsTarget, all, FIRE, seed, travel, phase);
    else if (m === 'plasma') paintRadiance(effectsTarget, all, r2, seed, e === 'luz', phase);
    else if (!paintElementAccents(effectsTarget, e, all, r2, seed, grounded, travel, phase)) paintEnergyAccents(effectsTarget, e, all, r2, seed, phase);
  };
  if (!incorporeal && !coherent) fx(mat, c.ramp, el ?? '');
  // The shared surface already expresses secondary materials. Layering each
  // one's full exterior FX again would recreate the disconnected stack.
  if (spellBody) {
    // The wake joins the actual trailing silhouette and is covered by its own
    // body. Orbital paths use the ellipse tangent instead of a fixed left tail.
    if (moving && coherent !== 'fire-lance') {
      const direction: P2 = pose.orbit?.tangent ?? [reverse ? -1 : 1, 0];
      paintSpellWake(pix, spellBody, all, ramp, el, phase, direction, pose.orbit);
    }
    // Basic and authored shapes return their occupied bounds; keep the outline
    // too. Free flames have animated tips outside their nominal attachment box.
    const bodyBounds = unshapedFire ? undefined : { l: all.l - 2, t: all.t - 2, r: all.r + 2, b: all.b + 2 };
    const exterior = paintIntentionAura(pix, spellBody, ramp, mat, el, bodyBounds);
    // Tiny copies retain local accents instead of emitting full-size bolts
    // across their neighbours. Only decoration is clipped; the body is intact.
    const compact = molded && Math.max(all.r - all.l, all.b - all.t) < 20;
    const accentClip = compact || interacting ? { l: all.l - 3, t: all.t - 3, r: all.r + 3, b: all.b + 3 } : undefined;
    // The joined wake owns the trailing junction. Keep material accents on the
    // forward part instead of piling three unrelated emissions onto its root.
    if (moving) {
      const u = pose.orbit?.tangent ?? [reverse ? -1 : 1, 0];
      const centerX = cxOf(all), centerY = cyOf(all);
      const rear = -(Math.abs(u[0]) * (all.r - all.l) + Math.abs(u[1]) * (all.b - all.t)) * .2;
      for (let yy = Math.max(0, Math.floor(all.t - 18)); yy <= Math.min(pix.h - 1, Math.ceil(all.b + 18)); yy++) {
        for (let xx = Math.max(0, Math.floor(all.l - 18)); xx <= Math.min(pix.w - 1, Math.ceil(all.r + 18)); xx++) {
          if ((xx - centerX) * u[0] + (yy - centerY) * u[1] < rear) effectsTarget.data[(yy * pix.w + xx) * 4 + 3] = 0;
        }
      }
    }
    copySpellLayer(pix, effectsTarget, exterior, accentClip);
    copySpellLayer(pix, spellBody, undefined, bodyBounds);
  }
  if (b.estado) paintState(pix, all, G);
  b.guards.forEach(g => paintGuard(pix, all, g));
  if (b.bond) labels.push({ x: cxOf(all), y: all.t - 6, text: b.bond });
  return all;
}

// ---------- cenário ----------

function sky(pix: Pix, night: boolean, rand: Rand): void {
  const zenith = rgb(night ? '#111c2a' : '#8caaa9');
  const horizon = rgb(night ? '#455259' : '#e6d6af');
  // Broad, quiet bands keep the silhouettes and the magic readable at small sizes.
  for (let y = 0; y < G; y++) {
    const color = mixRGB(zenith, horizon, Math.pow(Math.min(1, Math.floor(y / 3) * 3 / 87), .85));
    for (let x = 0; x < PW; x++) pix.set(x, y, color);
  }
  if (night) {
    for (let i = 0; i < 21; i++) {
      const x = R(5 + rand() * (PW - 10)), y = R(5 + rand() * 46);
      if (i % 11 === 0) pix.sparkle(x, y, 1, rgb('#748d96'), rgb('#c9d7d0'));
      else pix.set(x, y, i % 3 ? rgb('#7d949c') : rgb('#b4c2ba'));
    }
    // A small ivory crescent, without the bright yellow outline of an effect.
    pix.halo(151, 17, 12, 12, rgb('#c9d2ba'), .12);
    pix.shape(144, 10, 158, 24, (x, y) => (Math.hypot(x - 151, y - 17) <= 6.5 && Math.hypot(x - 154, y - 15) > 5.5 ? (x < 149 ? rgb('#e6e1bf') : rgb('#b9c3ac')) : null));
    return;
  }
  pix.halo(151, 18, 17, 15, rgb('#f4dfac'), .18);
  pix.shape(145, 12, 157, 24, (x, y) => Math.hypot(x - 151, y - 18) <= 5.5 ? rgb('#f5e6bc') : null);
  // Low, elongated cloud banks instead of high-contrast white puffs.
  const cloud = (cx: number, cy: number, k: number): void => {
    const blobs: [number, number, number][] = [[-10, 1, 4], [-4, -1, 5], [3, 0, 4.5], [10, 1, 3]].map(([a, b2, r]) => [cx + a * k, cy + b2 * k, r * k]);
    pix.shape(cx - 15 * k, cy - 6 * k, cx + 15 * k, cy + 4 * k, (x, y) => {
      if (y > cy + 2 * k) return null;
      const hit = blobs.some(([bx, by, r]) => Math.hypot(x - bx, (y - by) * 1.5) <= r);
      if (!hit) return null;
      return y >= cy ? rgb('#c2c7b2') : rgb('#d5d6bf');
    });
  };
  cloud(35, 21, 1.1); cloud(102, 31, .8);
}

function mountains(pix: Pix, night: boolean, rand: Rand): void {
  const ridge = (peaks: P2[], base: number): number[] => {
    const hs: number[] = [];
    for (let x = 0; x < PW; x++) {
      let y = base;
      for (let i = 0; i < peaks.length - 1; i++) {
        const [x0, y0] = peaks[i], [x1, y1] = peaks[i + 1];
        if (x >= x0 && x <= x1) y = y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
      }
      hs.push(y + (fbm(x * 0.045, 3, 5) - 0.5) * 1.5);
    }
    return hs;
  };
  const far = ridge([[0, 75], [17, 65], [31, 71], [48, 54], [66, 70], [85, 62], [104, 73], [126, 58], [146, 71], [163, 62], [180, 72]], 78);
  const near = ridge([[0, 87], [22, 79], [44, 85], [69, 75], [91, 82], [115, 77], [140, 86], [161, 79], [180, 85]], 88);
  const paint = (hs: number[], cols: string[], snowLine: number): void => {
    const [lit, base, shade, edge] = cols.map(rgb);
    for (let x = 0; x < PW; x++) {
      const h = hs[x], slope = (hs[Math.min(PW - 1, x + 1)] - hs[Math.max(0, x - 1)]) / 2;
      for (let y = Math.ceil(h); y < G; y++) {
        const depth = y - h;
        let c = slope < -0.15 ? (depth < 9 ? lit : base) : slope > 0.15 ? shade : base;
        if (y < snowLine && depth < 3) c = night ? rgb('#657375') : rgb('#d3d2b9');
        pix.set(x, y, depth < 1 ? edge : c);
      }
    }
  };
  paint(far, night ? ['#45555d', '#3b4b53', '#34444d', '#4c5c62'] : ['#a5b4a8', '#96a89e', '#899f98', '#b1bdac'], 60);
  // Haze separates the broad ridges; no stippled texture across the whole sky.
  const haze = rgb(night ? '#536367' : '#d3cfac');
  for (let y = 65; y < G; y++) for (let x = 0; x < PW; x++) if (y > far[x]) pix.blend(x, y, haze, .08 + (y - 65) * .004);
  paint(near, night ? ['#304548', '#293d40', '#23363b', '#35494b'] : ['#788d7c', '#6b8272', '#60786b', '#82917c'], 0);
  // A distant tree line frames the clearing without competing with the spell.
  const tree = rgb(night ? '#203436' : '#536f5f');
  for (let i = 0; i < 14; i++) {
    const x = R(i * 14 + jitter(rand, 3)), base = 89 + R(rand() * 3), h = 5 + R(rand() * 4);
    const points: P2[] = [[x, base - h], [x - 3, base - 3], [x - 1, base - 3], [x - 4, base], [x + 4, base], [x + 1, base - 3], [x + 3, base - 3]];
    pix.shape(x - 4, base - h, x + 4, base, (px, py) => inPoly(points, px + .5, py + .5) ? tree : null);
  }
  const clearing = rgb(night ? '#2b3d3c' : '#7b8768');
  for (let y = 92; y < G; y++) for (let x = 0; x < PW; x++) pix.set(x, y, mixRGB(clearing, haze, (G - y) * .035));
}

function ground(pix: Pix, night: boolean, rand: Rand): void {
  const [g1, g2, g3, d1, d2, d3] = (night ? ['#526050', '#3c4b42', '#2c3d36', '#2a3030', '#22292a', '#40453b'] : ['#9a9e70', '#737e50', '#5e6c45', '#786a4d', '#62583f', '#928262']).map(rgb);
  for (let y = G; y < PH; y++) for (let x = 0; x < PW; x++) {
    const tuft = fbm(x * .12, 2, 4) > .55;
    let c: RGB = y === G ? (tuft ? g1 : g2) : y < G + 3 ? (tuft ? g2 : g3) : d1;
    if (y > G + 3 && fbm(x * .16, y * .3, 4) > .62) c = d2;
    if (y > G + 4 && fbm(x * .15, y * .3, 8) > .72) c = d3;
    pix.set(x, y, c);
  }
  // Sparse moss and grass, leaving an even silhouette for grounded objects.
  for (let i = 0; i < 15; i++) {
    const x = R(3 + i * 12 + jitter(rand, 3)), hgt = 1 + R(rand() * 2);
    pix.set(x, G - 1, g2); for (let k = 1; k <= hgt; k++) pix.set(x + (k > 1 ? (i % 2 ? 1 : -1) : 0), G - k, k === hgt ? g1 : g2);
    pix.set(x + 2, G - 1, g3); pix.set(x + 2, G - 2, g2);
  }
  // pedrinhas
  for (const [x, r] of [[11, 3], [75, 2], [131, 2.5]] as [number, number][]) {
    pix.shape(x - r, G - r, x + r, G, (px, py) => (Math.hypot((px - x) / r, (py - G) / r) <= 1 && py < G ? (py < G - r / 2 ? rgb(night ? '#68716a' : '#aaa486') : rgb(night ? '#444e48' : '#807b63')) : null), rgb(night ? '#26342f' : '#515845'));
  }
}

/** Reflected spell light only touches scenery, before characters and effects are painted. */
function groundLight(pix: Pix, x: number, radius: number, color: RGB, strength: number): void {
  for (let py = G - 2; py < PH; py++) for (let px = Math.floor(x - radius); px <= x + radius; px++) {
    const d = Math.hypot((px - x) / radius, (py - G) / 7);
    if (d < 1) pix.blend(px, py, color, (1 - d) * strength);
  }
}

/** Monte de pedras (o alvo das magias que vão longe) */
function rockPile(pix: Pix): void {
  const rocks: [number, number, number][] = [[176, G - 27, 8], [169, G - 16, 9], [178, G - 11, 7.5], [161, G - 6, 6.5], [172, G - 4, 5.5], [175, G - 39, 6]];
  const ramp = ['#4e4a43', '#6f6a61', '#8f8a80', '#b0aa9e', '#cfc9bd'].map(rgb);
  rocks.forEach(([x, y, r], i) => {
    pix.shape(x - r, y - r, x + r, y + r, (px, py) => {
      const a = Math.atan2(py - y, px - x), d = Math.hypot(px - x, py - y), rr = r * (0.85 + 0.15 * Math.cos(a * 3 + i));
      if (d > rr) return null;
      return pix.pick(px, py, 0.75 - (px - x + (py - y) * 1.3) / (r * 3) - (fbm(px * 0.4, py * 0.4, i) - 0.5) * 0.5, ramp);
    }, rgb('#2e2b27'));
  });
}

/** Boneco de treino com alvo */
function dummy(pix: Pix, x: number): void {
  const wood = rgb('#8b5e34'), woodL = rgb('#b07a45'), out = rgb('#3b2414');
  pix.shape(x - 1, G - 32, x + 1, G, (px) => (px === x - 1 ? woodL : wood), out);
  pix.shape(x - 8, G - 27, x + 8, G - 25, (_px, py) => (py === G - 27 ? woodL : wood), out);
  pix.shape(x - 5, G - 26, x + 5, G - 12, (px, py) => (px < x - 2 ? rgb('#f1cf7e') : py > G - 15 ? rgb('#c99a3e') : rgb('#e0b96a')), out);
  pix.shape(x - 4, G - 37, x + 4, G - 29, (px, py) => (Math.hypot(px - x, py - (G - 33)) <= 4 ? (px < x ? rgb('#f1cf7e') : rgb('#d9ad55')) : null), out);
  for (const dx of [-3, -1, 1, 3]) pix.set(x + dx, G - 38 - (dx % 2 ? 0 : 1), rgb('#c99a2e'));
  // alvo
  pix.shape(x - 4, G - 23, x + 4, G - 15, (px, py) => {
    const d = Math.hypot(px - x, py - (G - 19));
    return d > 4 ? null : d > 3 ? rgb('#e03131') : d > 2 ? WHITE : d > 1 ? rgb('#e03131') : WHITE;
  }, rgb('#7a1414'));
  pix.halo(x, G + 1, 6, 1.5, [0, 0, 0], 0.4);
}

// ---------- quem lança ----------

/** Mago de capuz e capa, com cajado e a mão estendida */
const casterHand = (x: number): P2 => [x + 12, G - 20];

function mage(pix: Pix, x0: number, eyes: RGB, night: boolean): P2 {
  const robe = (night ? ['#1d2b36', '#2e4651', '#4a626b', '#778a88'] : ['#253641', '#3a515b', '#596f74', '#8a9890']).map(rgb);
  const cape = rgb(night ? '#352632' : '#51343c'), capeL = rgb(night ? '#513c46' : '#6f4d50');
  const gold = rgb('#c7af79'), goldD = rgb('#87704a'), leather = rgb('#604a35');
  const out = rgb('#141f25');
  const hand = casterHand(x0);
  pix.halo(x0, G + 1, 12, 2, rgb('#111b1d'), .4);
  // Crooked ash staff, brass bindings and a small inlaid stone.
  pix.line(x0 - 9, G - 34, x0 - 8, G - 2, out);
  pix.line(x0 - 8, G - 34, x0 - 7, G - 1, rgb('#8a7652'));
  pix.line(x0 - 7, G - 32, x0 - 6, G - 2, rgb('#5b4b36'));
  for (const dy of [28, 17, 7]) pix.line(x0 - 8, G - dy, x0 - 6, G - dy, goldD);
  pix.line(x0 - 10, G - 37, x0 - 11, G - 34, goldD);
  pix.line(x0 - 11, G - 34, x0 - 8, G - 31, gold);
  pix.line(x0 - 8, G - 31, x0 - 4, G - 35, goldD);
  pix.set(x0 - 5, G - 37, gold);
  // capa, corpo, capuz, braço
  const capeP: P2[] = [[x0 - 3, G - 22], [x0 - 12, G - 1], [x0 + 2, G - 2]];
  const body: P2[] = [[x0 - 4, G - 20], [x0 + 4, G - 20], [x0 + 8, G], [x0 - 8, G]];
  const hoodTip: P2[] = [[x0 - 6, G - 22], [x0 - 5, G - 30], [x0 - 1, G - 31], [x0 + 3, G - 26]];
  const arm: P2[] = [[x0 + 1, G - 19], [x0 + 10, G - 22], [x0 + 11, G - 19], [x0 + 2, G - 15]];
  pix.shape(x0 - 12, G - 32, x0 + 12, G - 1, (px, py) => {
    const q: P2 = [px + 0.5, py + 0.5];
    const hood = Math.hypot(px + 0.5 - (x0 + 1), py + 0.5 - (G - 23)) <= 5.2;
    if (px >= x0 + 9 && px <= x0 + 11 && py >= G - 22 && py <= G - 19) return null; // a mão é desenhada depois
    if (inPoly(arm, ...q)) return px >= x0 + 7 ? goldD : py <= G - 20 ? robe[3] : robe[2];
    if (hood) {
      const face = Math.hypot((px + 0.5 - (x0 + 3)) / 2.6, (py + 0.5 - (G - 22.5)) / 3);
      if (face <= 1) return rgb('#152027');
      if (face <= 1.3 && px >= x0 + 1 && py < G - 20) return goldD;
      return px < x0 ? robe[3] : px < x0 + 3 ? robe[2] : robe[1];
    }
    if (inPoly(hoodTip, ...q)) return robe[2];
    if (inPoly(body, ...q)) {
      if (py >= G - 2) return py === G - 2 ? goldD : out;
      if (py === G - 12) return px === x0 + 1 ? gold : leather;
      if (px === x0 || px === x0 + 1) return robe[0];
      return px < x0 - 3 ? robe[2] : px < x0 + 3 ? robe[1] : robe[2];
    }
    if (inPoly(capeP, ...q)) return px < x0 - 6 ? capeL : cape;
    return null;
  }, out);
  // Folded cape, shoulder clasp and a travel pouch give the silhouette a story.
  pix.line(x0 - 4, G - 18, x0 - 9, G - 3, capeL);
  pix.line(x0 - 3, G - 9, x0 - 5, G - 3, robe[3]);
  pix.line(x0 + 3, G - 9, x0 + 5, G - 3, robe[0]);
  pix.set(x0 + 1, G - 18, gold); pix.set(x0 + 2, G - 18, goldD);
  pix.line(x0 - 3, G - 18, x0 - 5, G - 11, leather);
  pix.shape(x0 - 6, G - 10, x0 - 3, G - 6, (px, py) => px < x0 - 6 || px > x0 - 3 || py < G - 10 || py > G - 6 ? null : py === G - 10 ? rgb('#9b835c') : px === x0 - 6 ? rgb('#7e6547') : leather, out);
  // olhos brilhando na sombra do capuz
  pix.set(x0 + 3, G - 23, eyes); pix.set(x0 + 5, G - 23, eyes);
  // mão
  pix.shape(hand[0] - 2, hand[1] - 2, hand[0], hand[1], (px, py) => (px === hand[0] - 2 && py === hand[1] - 2 ? rgb('#dfc8a3') : rgb('#bfa17e')), out);
  // pedra do cajado
  pix.shape(x0 - 10, G - 38, x0 - 5, G - 33, (px, py) => (Math.abs(px - (x0 - 7.5)) + Math.abs(py - (G - 35.5)) <= 2.3 ? (px < x0 - 7 ? lighten(eyes, .25) : eyes) : null), out);
  pix.halo(x0 - 7.5, G - 35.5, 5, 5, eyes, .25);
  return hand;
}

/** Círculo mágico na mão, de perfil, brilhando na cor da magia */
function disc(pix: Pix, hand: P2, ramp: RGB[]): void {
  const x = hand[0] + 4, y = hand[1] - 1;
  const seal = new Pix(pix.w, pix.h);
  seal.ellipse(x, y, 3, 9, mid(ramp));
  seal.ellipse(x, y, 2, 6.5, light(ramp), 'all', 2);
  seal.line(x, y - 4, x, y + 4, top(ramp));
  seal.set(x - 1, y, top(ramp)); seal.set(x + 1, y, top(ramp));
  for (const dy of [-9, 9]) seal.set(x, y + dy, WHITE);
  const bounds = { l: x - 4, t: y - 10, r: x + 4, b: y + 10 };
  paintIntentionAura(pix, seal, ramp, 'plasma', undefined, bounds);
  copySpellLayer(pix, seal, undefined, bounds);
}

// ---------- a cena ----------

export interface PixelScene { pix: Pix; labels: Label[] }

/** Frame zero is the still preview; the existing eight-frame clock drives authored material flow. */
export function renderPixelScene(appearance: Appearance, night: boolean, animationFrame = 0): PixelScene {
  const phase = Number.isFinite(animationFrame) ? ((Math.floor(animationFrame) % 8) + 8) % 8 : 0;
  const ap = appearanceForScene(appearance);
  const pix = new Pix(PW, PH);
  const rand = seeded('pixel');
  const labels: Label[] = [];

  sky(pix, night, rand);
  mountains(pix, night, rand);
  ground(pix, night, rand);

  const far = ap.beings.filter(b => b.placement === 'far');
  const aimed = !far.length && ap.beings.some(b => b.direction === 'forward' || b.placement === 'flight');
  if (far.length) rockPile(pix);
  if (aimed) dummy(pix, 166);

  const planned = layoutScene(ap, phase), cx = planned.casterX, poses = planned.poses;
  const rings = planned.rings.map(r => ({ ...r, color: light(rampOf(r.element)) }));
  const firstRamp = ap.beings.length ? beingRamp(ap.beings[0]) : rampOf('vento').map(c => mixRGB(c, [200, 200, 200], .6));

  // Discreet reflected light anchors luminous magic to the clearing.
  ap.beings.forEach(b => {
    const p = poses.get(b), element = b.elements[0] ?? b.concepts[0];
    if (!p || !element) return;
    const material = MAT[element] ?? 'energy';
    if (material !== 'fire' && material !== 'plasma' && material !== 'energy') return;
    const height = Math.max(0, G - p.y), ramp = rampOf(element);
    groundLight(pix, p.x, p.s * 2, light(ramp), (night ? .2 : .11) * (1 - Math.min(.6, height / 120)));
  });

  // sombras no chão
  ap.beings.forEach(b => {
    const p = poses.get(b);
    if (!p || b.placement === 'self') return;
    const hgt = Math.max(0, G - p.y);
    pix.halo(p.x, G, p.s * (1.2 - hgt / 150), 1.8, [0, 0, 0], Math.max(0.12, 0.45 - hgt / 150));
  });

  // anel de órbita (metade de trás), o mago, e os seres de trás
  rings.forEach(r => paintOrbitArc(pix, r.c, r.rx, r.ry, r.color, 'back'));
  const behind = (b: Being): boolean => {
    const p = poses.get(b);
    return p?.orbit?.behind ?? (!!p && b.placement === 'escort' && rings.some(r => r.members.includes(b) && p.y < r.c[1] - 2));
  };
  const boxes = new Map<Being, Box>();
  // Every trajectory passes behind bodies and the robe, including a returning
  // spell that starts inside its own shape. The caster keeps its scene lighting.
  const HAND = casterHand(cx);
  ap.beings.forEach(b => {
    const p = poses.get(b);
    if (!p || p.orbit) return;
    const ramp = beingRamp(b), element = b.elements[0] ?? b.concepts[0];
    if (b.placement === 'flight' && !p.orbit) {
      const joinedLance = b.intentForm === 'lanca' && b.direction !== 'back';
      const a: P2 = [HAND[0] + 6, HAND[1] - 1];
      const z: P2 = spellSpriteOf(b) === 'fire-lance' && joinedLance ? [p.x - p.s * 1.2, p.y - p.s / 15] : [p.x - layoutParts(b, p.s).width / 2, p.y];
      const ctl: P2 = [(a[0] + z[0]) / 2, z[1]];
      paintSpellTransport(pix, a, ctl, z, ramp, 'flight', element, phase, true);
    }
    if (b.placement === 'far') {
      const a: P2 = [HAND[0] + 6, HAND[1] - 2], z: P2 = [p.x - 2, p.y - p.s];
      const ctl: P2 = [(a[0] + z[0]) / 2, 8];
      paintSpellTransport(pix, a, ctl, z, ramp, 'projection', element, phase);
    }
    if (b.placement === 'self') {
      paintSpellTransport(pix, [cx + 47, G - 41], [cx + 18, G - 52], [cx + 7, G - 25], ramp, 'return', element, phase);
    } else if (b.direction === 'back') {
      paintSpellTransport(pix, [p.x, p.y], [(p.x + cx) / 2, p.y - 20], [cx + 7, G - 25], ramp, 'return', element, phase);
    }
  });
  const renderOrder = ap.beings.map((b, index) => ({ b, index, p: poses.get(b) }))
    .filter((entry): entry is { b: Being; index: number; p: Pose } => !!entry.p);
  const byDepth = (a: { p: Pose; index: number }, b: { p: Pose; index: number }): number =>
    a.p.y - b.p.y || a.index - b.index;
  renderOrder.filter(({ b }) => behind(b)).sort(byDepth).forEach(({ b, index, p }) =>
    boxes.set(b, paintBeing(pix, b, p, p.orbit?.renderIndex ?? index, labels, phase)));
  mage(pix, cx, light(firstRamp), night);

  // The quiet near-side guide stays behind foreground sprites and their wakes.
  rings.forEach(r => paintOrbitArc(pix, r.c, r.rx, r.ry, r.color, 'front'));

  // os seres da frente
  renderOrder.filter(({ b }) => !behind(b)).sort((a, b) => Number(!!a.p.orbit) - Number(!!b.p.orbit) || (a.p.orbit && b.p.orbit ? byDepth(a, b) : a.index - b.index)).forEach(({ b, index, p }) => {
    if (b.placement === 'self') {
      const ramp = beingRamp(b);
      pix.halo(cx, G - 14, 12, 19, light(ramp), .25);
    }
    boxes.set(b, paintBeing(pix, b, p, p.orbit?.renderIndex ?? index, labels, phase));
  });

  // movimento e contato com a superfície
  ap.beings.forEach(b => {
    const p = poses.get(b), q = boxes.get(b);
    if (!p || !q) return;
    const ramp = beingRamp(b);
    if (b.placement === 'far') {
      paintSurfaceContact(pix, q, 'far', ramp, G);
    }
    if (b.placement === 'touch') {
      paintSurfaceContact(pix, q, 'touch', ramp, G);
    }
  });

  if (ap.beings.length) disc(pix, HAND, firstRamp);

  // moldura de pixel
  const frame = night ? rgb('#142127') : rgb('#4b4233'), corner = rgb('#b39a67');
  for (let x = 0; x < PW; x++) { pix.set(x, 0, frame); pix.set(x, PH - 1, frame); }
  for (let y = 0; y < PH; y++) { pix.set(0, y, frame); pix.set(PW - 1, y, frame); }
  for (const [x, y] of [[2, 2], [PW - 3, 2], [2, PH - 3], [PW - 3, PH - 3]]) { pix.set(x, y, corner); pix.set(x + (x < 9 ? 1 : -1), y, corner); pix.set(x, y + (y < 9 ? 1 : -1), corner); }
  return { pix, labels };
}

import { describe, expect, it } from 'vitest';
import { darken, mixRGB, Pix, rgb, type RGB } from '../src/ui/pixel';
import { paintIntention } from '../src/ui/pixel-intention';
import { paintCoherentWaterDragon } from '../src/ui/pixel-coherent-dragon';
import { elementalSphereBounds, paintElementalSphere } from '../src/ui/pixel-elemental-spheres';
import { paintMaterialInteraction, type InteractionMaterial, type MaterialInteractionOptions } from '../src/ui/pixel-material-interaction';

const ramps: Record<string, RGB[]> = Object.fromEntries(Object.entries({
  fogo: ['#32142b', '#762040', '#c63a48', '#f66c42', '#ffb65f', '#ffe4a4', '#fff7df'],
  raio: ['#1b204d', '#3b4d9d', '#438fd3', '#5adce4', '#b6f9ee', '#f3fff5'],
  agua: ['#122346', '#17466a', '#237e9b', '#4dbac5', '#9de5df', '#ecfff1'],
  gelo: ['#26345e', '#3d6294', '#619dc9', '#90d8e7', '#c5f1ef', '#f4ffff'],
  terra: ['#302632', '#57403a', '#8a6343', '#bb955d', '#e0c68d'],
  metal: ['#202b43', '#45526c', '#8196a4', '#c8d8d6', '#f5fff1'],
  gravidade: ['#1b2266', '#2f3fa8', '#4c6ef5', '#91a7ff', '#dbe4ff'],
  pressao: ['#18286b', '#253c9c', '#4263eb', '#91a7ff', '#e7f0ff'],
  sombra: ['#10101d', '#242039', '#48415e', '#766b8d', '#b8adcf'],
  espaco: ['#1a0f45', '#3b2390', '#5f3dc4', '#9775fa', '#ece4ff']
}).map(([id, colors]) => [id, colors.map(rgb)]));

const pairs = [
  ['gravidade', 'espaco'], ['pressao', 'espaco'], ['fogo', 'raio'],
  ['agua', 'gelo'], ['terra', 'fogo'], ['metal', 'raio'], ['sombra', 'espaco']
];
const materials = (elements: string[]): InteractionMaterial[] => elements.map(element => ({ element, ramp: ramps[element] }));
const copy = (p: Pix): Pix => { const out = new Pix(p.w, p.h); out.data.set(p.data); return out; };
const countChanged = (a: Pix, b: Pix): number => {
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) count++;
  return count;
};
const at = (p: Pix, x: number, y: number): number[] => Array.from(p.data.slice((y * p.w + x) * 4, (y * p.w + x) * 4 + 4));
const bounds = { l: 8, t: 8, r: 40, b: 40 };

function body(element: string, radius = 16): Pix {
  const p = new Pix(48, 48), ramp = ramps[element];
  p.shape(24 - radius, 24 - radius, 24 + radius, 24 + radius, (x, y) => {
    if (Math.hypot(x - 24, y - 24) > radius) return null;
    return ramp[Math.round((x < 24 ? .68 : .46) * (ramp.length - 1))];
  }, darken(ramp[0], .45));
  return p;
}

function render(elements: string[], options: MaterialInteractionOptions = {}, source = body(elements[0])): Pix {
  const p = copy(source);
  paintMaterialInteraction(p, bounds, materials(elements), { seed: 3, ...options });
  return p;
}

function assertMaskAndEdgePreserved(before: Pix, after: Pix): void {
  for (let y = 0; y < before.h; y++) for (let x = 0; x < before.w; x++) {
    const i = (y * before.w + x) * 4;
    expect(after.data[i + 3]).toBe(before.data[i + 3]);
    let edge = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx < 0 || y + dy < 0 || x + dx >= before.w || y + dy >= before.h || !before.data[((y + dy) * before.w + x + dx) * 4 + 3]) edge = true;
    }
    if (edge || !before.data[i + 3]) expect(at(after, x, y)).toEqual(at(before, x, y));
  }
}

describe('Material contact inside one authored spell body', () => {
  it.each(pairs)('%s + %s preserves alpha and all silhouette / hole edges through eight frames', (a, b) => {
    const p = body(a);
    // A true hole and carved eye/face marks must survive under a contact plane.
    for (let y = 21; y <= 23; y++) for (let x = 28; x <= 30; x++) p.data[(y * p.w + x) * 4 + 3] = 0;
    p.set(29, 27, ramps[a][0]); p.set(29, 28, darken(ramps[a][0], .45));
    p.set(28, 29, ramps[a][ramps[a].length - 1]);
    for (let frame = 0; frame < 8; frame++) {
      const next = render([a, b], { frame, linked: true, merged: true }, p);
      assertMaskAndEdgePreserved(p, next);
      for (const [x, y] of [[29, 27], [29, 28], [28, 29]]) expect(at(next, x, y)).toEqual(at(p, x, y));
      expect(countChanged(p, next)).toBeGreaterThan(4);
    }
  });

  it.each(pairs)('%s + %s has deterministic bounded normalized frames', (a, b) => {
    for (let frame = 0; frame < 8; frame++) {
      expect(render([a, b], { frame }).data).toEqual(render([a, b], { frame: frame + 8 }).data);
      expect(render([a, b], { frame }).data).toEqual(render([a, b], { frame: frame - 16 }).data);
      expect(render([a, b], { frame }).data).toEqual(render([a, b], { frame: frame + .9 }).data);
    }
    expect(render([a, b], { frame: Infinity }).data).toEqual(render([a, b], { frame: 0 }).data);
    expect(render([a, b], { frame: NaN }).data).toEqual(render([a, b], { frame: 0 }).data);
  });

  it.each([['gravidade', 'espaco'], ['pressao', 'espaco'], ['terra', 'fogo'], ['metal', 'raio']])(
    '%s + %s never falsely fuses different semantic families', (a, b) => {
      for (let frame = 0; frame < 8; frame++) {
        const joined = render([a, b], { frame, linked: true, merged: false });
        expect(render([a, b], { frame, linked: true, merged: true }).data).toEqual(joined.data);
        expect(render([a, b], { frame, linked: false, merged: true }).data).toEqual(joined.data);
      }
    }
  );

  it.each([['fogo', 'raio'], ['agua', 'gelo'], ['sombra', 'espaco']])(
    '%s + %s keeps joined and actually fused contact visibly different', (a, b) => {
      const joined = render([a, b], { linked: true, merged: false });
      const fused = render([a, b], { linked: true, merged: true });
      expect(countChanged(joined, fused)).toBeGreaterThan(8);
      expect(render([a, b], { linked: false, merged: true }).data).toEqual(joined.data);
    }
  );

  it.each(pairs)('%s + %s keeps original palettes with only localized pairwise reflected light', (a, b) => {
    const p = body(a), before = new Set<string>(), next = render([a, b], {}, p);
    for (let i = 0; i < p.data.length; i += 4) before.add(Array.from(p.data.slice(i, i + 3)).join(','));
    const original = new Set([...before, ...ramps[a].map(c => c.join(',')), ...ramps[b].map(c => c.join(','))]);
    const reflections = ramps[a].flatMap(c => ramps[b].flatMap(d => [mixRGB(c, d, .25), mixRGB(d, c, .25)]))
      .map(c => Array.from(new Uint8ClampedArray(c)).join(','));
    const allowed = new Set([...original, ...reflections]);
    let reflectedPixels = 0;
    for (let i = 0; i < next.data.length; i += 4) {
      const color = Array.from(next.data.slice(i, i + 3)).join(',');
      expect(allowed.has(color)).toBe(true);
      if (!original.has(color)) reflectedPixels++;
    }
    expect(reflectedPixels).toBeLessThan(32 * 32 * .12);
    expect(countChanged(p, next)).toBeLessThan(32 * 32 * .6);
  });

  it('keeps material-specific geometry even when pairs are given the same palette', () => {
    const palette = ramps.agua, p = body('agua');
    const signatures = pairs.map(pair => {
      const next = copy(p);
      paintMaterialInteraction(next, bounds, pair.map(element => ({ element, ramp: palette })), { linked: true, merged: true, seed: 3 });
      return Array.from(next.data).join(',');
    });
    // Gravity and pressure intentionally share the same field-depth grammar.
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(pairs.length - 1);
  });

  it('keeps a third constituent as a bounded attached contact without a third broad field', () => {
    const pair = render(['gravidade', 'espaco']);
    const triple = render(['gravidade', 'espaco', 'raio']);
    expect(countChanged(pair, triple)).toBeGreaterThan(1);
    expect(countChanged(pair, triple)).toBeLessThan(45);
    assertMaskAndEdgePreserved(pair, triple);
  });

  it('retains both input order and seed as meaningful choices without mutating inputs', () => {
    const input = materials(['agua', 'gelo']), saved = structuredClone(input);
    paintMaterialInteraction(body('agua'), bounds, input, { seed: 3, linked: true, merged: true });
    expect(input).toEqual(saved);
    expect(render(['agua', 'gelo'], { seed: 3, linked: true, merged: true }).data)
      .not.toEqual(render(['agua', 'gelo'], { seed: 981, linked: true, merged: true }).data);
    expect(render(['agua', 'gelo']).data).not.toEqual(render(['gelo', 'agua']).data);
  });

  it('recognizes exact authored cuts and peak highlights under a different fused base ramp', () => {
    const authored = ['#34224f', '#67518b', '#aa82aa', '#f5ddd4'].map(rgb), p = body('fogo');
    for (const [x, y, color] of [[29, 24, authored[0]], [29, 25, darken(authored[0], .4)], [29, 26, authored[3]]] as [number, number, RGB][]) p.set(x, y, color);
    const next = render(['fogo', 'raio'], { linked: true, merged: true, authoredRamp: authored }, p);
    for (const y of [24, 25, 26]) expect(at(next, 29, y)).toEqual(at(p, 29, y));
  });

  it.each(['lanca', 'dragao', 'anel'] as const)('%s keeps its authored facial cuts, highlights and opening', form => {
    const p = new Pix(96, 80), ramp = ramps.agua;
    const q = paintIntention(p, form, 48, 40, 14, ramp, 'water', 3, 'agua');
    const next = copy(p);
    paintMaterialInteraction(next, q, materials(['agua', 'gelo']), { frame: 5, seed: 3, linked: true, merged: true });
    assertMaskAndEdgePreserved(p, next);
    for (let i = 0; i < p.data.length; i += 4) {
      const color = Array.from(p.data.slice(i, i + 3)).join(',');
      if (color === ramp[0].join(',') || color === ramp[ramp.length - 1].join(',')) expect(Array.from(next.data.slice(i, i + 4))).toEqual(Array.from(p.data.slice(i, i + 4)));
    }
  });

  it('keeps the folded space plane cyclic at the last-to-first frame transition', () => {
    const frames = Array.from({ length: 8 }, (_, frame) => render(['gravidade', 'espaco'], { frame }));
    const transitions = frames.map((p, i) => countChanged(p, frames[(i + 1) % 8]));
    expect(transitions[7]).toBeLessThanOrEqual(Math.max(...transitions.slice(0, 7)));
    expect(new Set(frames.map(p => Array.from(p.data).join(','))).size).toBeGreaterThan(3);
  });

  it('keeps a broad connected purple lower flank with native-pixel motion instead of an inset emblem', () => {
    const p = render(['gravidade', 'espaco']), purple = new Set(ramps.espaco.map(c => c.join(',')));
    const occupied = new Set<number>();
    let lowerFlank = 0;
    for (let y = 8; y <= 40; y++) for (let x = 8; x <= 40; x++) {
      if (!purple.has(at(p, x, y).slice(0, 3).join(','))) continue;
      occupied.add(y * p.w + x);
      if (x >= 28 && y >= 28) lowerFlank++;
    }
    expect(lowerFlank).toBeGreaterThan(20);
    const remaining = new Set(occupied), sizes: number[] = [];
    while (remaining.size) {
      const first = remaining.values().next().value!, stack = [first]; remaining.delete(first);
      let size = 0;
      while (stack.length) {
        const i = stack.pop()!; size++;
        for (const next of [i - 1, i + 1, i - p.w, i + p.w]) if (remaining.delete(next)) stack.push(next);
      }
      sizes.push(size);
    }
    expect(Math.max(...sizes)).toBeGreaterThan(occupied.size * .9);
    expect(countChanged(render(['gravidade', 'espaco'], { frame: 2 }), render(['gravidade', 'espaco'], { frame: 6 }))).toBeGreaterThan(35);
  });

  it('keeps the ice facet rigid while its water contact moves', () => {
    const frames = Array.from({ length: 8 }, (_, frame) => render(['agua', 'gelo'], { frame, linked: true, merged: true }));
    for (let y = 19; y <= 21; y++) for (let x = 19; x <= 22; x++) {
      for (const p of frames) expect(at(p, x, y)).toEqual(at(frames[0], x, y));
    }
    expect(countChanged(frames[1], frames[5])).toBeGreaterThan(5);
  });

  it.each(['agua', 'gelo'])('%s-first sphere has substantial fixed crystal faces while water moves between them', primary => {
    const frames: Pix[] = [], raw: Pix[] = [], elements = primary === 'agua' ? ['agua', 'gelo'] : ['gelo', 'agua'];
    const local = elementalSphereBounds(15, primary);
    const surfaceBounds = { l: 32 + local.l, t: 32 + local.t, r: 32 + local.r, b: 32 + local.b };
    for (let frame = 0; frame < 8; frame++) {
      const source = new Pix(64, 64), q = paintElementalSphere(source, 32, 32, 15, ramps[primary], primary, frame), next = copy(source);
      paintMaterialInteraction(next, q, materials(elements), { frame, seed: 3, form: 'esfera', surfaceBounds });
      assertMaskAndEdgePreserved(source, next); frames.push(next); raw.push(source);
    }
    const iceColors = new Set(ramps.gelo.map(c => c.join(',')));
    let stableCrystal = 0, changed = 0;
    for (let i = 0; i < frames[0].data.length; i += 4) {
      const color = Array.from(frames[0].data.slice(i, i + 3)).join(',');
      const fixed = frames.every(p => p.data[i] === frames[0].data[i] && p.data[i + 1] === frames[0].data[i + 1] && p.data[i + 2] === frames[0].data[i + 2]);
      if (iceColors.has(color) && fixed) stableCrystal++;
      if (raw[0].data[i] !== frames[0].data[i] || raw[0].data[i + 1] !== frames[0].data[i + 1] || raw[0].data[i + 2] !== frames[0].data[i + 2]) changed++;
    }
    expect(stableCrystal).toBeGreaterThan(45);
    expect(changed).toBeGreaterThan(55);
    expect(countChanged(frames[1], frames[5])).toBeGreaterThan(20);
  });

  it('lets known ice faces occlude water glints without touching cuts or an unrelated highlight', () => {
    const p = body('agua'), peak = ramps.agua[ramps.agua.length - 1];
    p.set(21, 20, peak); p.set(22, 20, ramps.agua[0]); p.set(35, 16, peak);
    const unknown = render(['agua', 'gelo'], {}, p), known = render(['agua', 'gelo'], { form: 'esfera' }, p);
    expect(at(unknown, 21, 20)).toEqual(at(p, 21, 20));
    expect(at(known, 21, 20)).not.toEqual(at(p, 21, 20));
    expect(at(known, 22, 20)).toEqual(at(p, 22, 20));
    expect(at(known, 35, 16)).toEqual(at(p, 35, 16));
  });

  it.each([false, true])('freezes the authored dragon wing/shoulder while preserving its face, reverse=%s', reverse => {
    for (let frame = 0; frame < 8; frame++) {
      const p = new Pix(96, 80), q = paintCoherentWaterDragon(p, 48, 40, 15, ramps.agua, 3, frame, reverse), next = copy(p);
      paintMaterialInteraction(next, q, materials(['agua', 'gelo']), { form: 'dragao', frame, seed: 3, reverse });
      assertMaskAndEdgePreserved(p, next);
      expect(countChanged(p, next)).toBeGreaterThan(25);
      // This entire facial zone includes the eye's bright dot, dark eye cuts,
      // nostril and mouth, not merely the alpha silhouette around the head.
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        if ((!reverse && x > 61) || (reverse && x < 35)) expect(at(next, x, y)).toEqual(at(p, x, y));
      }
    }
  });

  it.each([false, true])('keeps one or two existing miniature wing pixels icy at fractional orbit centers, reverse=%s', reverse => {
    const paleIce = new Set([ramps.gelo[4], ramps.gelo[5]].map(c => c.join(',')));
    for (const size of [2.1, 3]) for (const [cx, cy] of [[32, 32], [32.2, 31.7], [31.7, 32.2]]) for (let frame = 0; frame < 8; frame++) {
      const p = new Pix(64, 64), q = paintCoherentWaterDragon(p, cx, cy, size, ramps.agua, 3, frame, reverse), next = copy(p);
      paintMaterialInteraction(next, q, materials(['agua', 'gelo']), { form: 'dragao', frame, seed: 3, reverse });
      let changedWingEdges = 0;
      for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) {
        expect(at(next, x, y)[3]).toBe(at(p, x, y)[3]);
        if (at(next, x, y).join(',') === at(p, x, y).join(',')) continue;
        let edge = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!p.data[((y + dy) * p.w + x + dx) * 4 + 3]) edge = true;
        if (!edge) continue;
        changedWingEdges++;
        const local = (x - q.l) / (q.r - q.l), u = reverse ? 1 - local : local, v = (y - q.t) / (q.b - q.t);
        expect(u).toBeGreaterThanOrEqual(.14); expect(u).toBeLessThanOrEqual(.46);
        expect(v).toBeLessThanOrEqual(.48);
        expect(paleIce.has(at(next, x, y).slice(0, 3).join(','))).toBe(true);
      }
      expect(changedWingEdges).toBeGreaterThanOrEqual(1);
      expect(changedWingEdges).toBeLessThanOrEqual(2);
    }
  });

  it.each([
    { elements: ['fogo', 'raio'], points: [[22, 16], [23, 24], [25, 32]], hotFrames: [0, 2, 5] },
    { elements: ['metal', 'raio'], points: [[26, 16], [23, 24], [26, 32]], hotFrames: [0, 3, 6] }
  ])('$elements conducts a visible root-to-tip discharge and cools behind it', ({ elements, points, hotFrames }) => {
    const frames = Array.from({ length: 8 }, (_, frame) => render(elements, { frame, seed: 3, linked: true, merged: true }));
    const signatures = frames.map(p => Array.from(p.data).join(','));
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(6);
    for (let frame = 0; frame < 8; frame++) {
      expect(countChanged(frames[frame], frames[(frame + 1) % 8])).toBeGreaterThan(2);
    }
    // These are occupied points on the actual contact, not another clock:
    // the hottest electric sample must reach the root, middle and tip in order.
    points.forEach(([x, y], i) => {
      const tones = frames.map(p => {
        const color = at(p, x, y);
        return ramps.raio.findIndex(c => c.every((channel, j) => channel === color[j]));
      });
      const hottest = Math.max(...tones), peakFrame = tones.indexOf(hottest);
      expect(hottest).toBeGreaterThanOrEqual(3);
      expect(peakFrame).toBe(hotFrames[i]);
      expect(tones[(peakFrame + 2) % 8]).toBeLessThan(hottest);
    });
    expect(render(elements, { frame: 8, seed: 3, linked: true, merged: true }).data).toEqual(frames[0].data);
  });

  it('lets the flame respond one frame after its electrical front, then cool', () => {
    const frames = Array.from({ length: 8 }, (_, frame) => render(['fogo', 'raio'], { frame, seed: 3, linked: true, merged: true }));
    const toneAt = (palette: RGB[], x: number, y: number): number[] => frames.map(p => {
      const color = at(p, x, y);
      return palette.findIndex(c => c.every((channel, j) => channel === color[j]));
    });
    const electrical = toneAt(ramps.raio, 23, 24), flame = toneAt(ramps.fogo, 22, 24);
    const discharge = electrical.indexOf(Math.max(...electrical)), response = flame.indexOf(Math.max(...flame));
    expect(discharge).toBe(2);
    expect(response).toBe((discharge + 1) % 8);
    expect(flame[(response + 1) % 8]).toBeLessThan(flame[response]);
  });

  it('does nothing for a single/duplicate material, empty palette or invalid bounds', () => {
    const p = body('fogo');
    for (const input of [[], materials(['fogo']), materials(['fogo', 'fogo']), [{ element: 'agua', ramp: [] }, ...materials(['fogo'])]]) {
      const next = copy(p); paintMaterialInteraction(next, bounds, input); expect(next.data).toEqual(p.data);
    }
    for (const q of [{ ...bounds, r: NaN }, { ...bounds, b: Infinity }, { ...bounds, r: bounds.l }, { l: 500, t: 500, r: 600, b: 600 }]) {
      const next = copy(p); paintMaterialInteraction(next, q, materials(['fogo', 'raio'])); expect(next.data).toEqual(p.data);
    }
  });

  it('preserves even partially opaque alpha and never touches outside its supplied bounds', () => {
    const p = body('gravidade'), q = { l: 24, t: 20, r: 35, b: 35 }, next = copy(p);
    for (let i = 3; i < p.data.length; i += 4) if (p.data[i]) p.data[i] = next.data[i] = 127;
    paintMaterialInteraction(next, q, materials(['gravidade', 'espaco']));
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      expect(at(next, x, y)[3]).toBe(at(p, x, y)[3]);
      if (x < q.l || y < q.t || x > q.r || y > q.b) expect(at(next, x, y)).toEqual(at(p, x, y));
    }
  });

  it.each([['fogo', 'raio'], ['metal', 'raio']])('%s/%s mirrors its moving contact while keeping the returned body lighting', (a, b) => {
    const p = body(a), mirror = (source: Pix): Pix => {
      const result = new Pix(source.w, source.h);
      for (let y = 0; y < source.h; y++) for (let x = 0; x < source.w; x++) {
        const from = (y * source.w + x) * 4, to = (y * source.w + source.w - 1 - x) * 4;
        result.data.set(source.data.subarray(from, from + 4), to);
      }
      return result;
    };
    const mirroredBounds = { ...bounds, l: p.w - 1 - bounds.r, r: p.w - 1 - bounds.l };
    for (let frame = 0; frame < 8; frame++) {
      const forward = render([a, b], { frame, linked: true, merged: true }, p), returned = mirror(p);
      paintMaterialInteraction(returned, mirroredBounds, materials([a, b]), { frame, seed: 3, linked: true, merged: true, reverse: true });
      expect(returned.data).toEqual(mirror(forward).data);
      assertMaskAndEdgePreserved(mirror(p), returned);
    }
  });
});

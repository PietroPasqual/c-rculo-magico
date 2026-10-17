import { describe, expect, it } from 'vitest';
import type { Appearance, Being } from '../src/core/appearance';
import { Pix, rgb } from '../src/ui/pixel';
import { paintSpellSprite, spellSpriteBounds, spellSpriteOf, type SpellSprite } from '../src/ui/pixel-spell-sprites';
import { appearanceForScene, boundsOfBeing, layoutParts, layoutScene } from '../src/ui/pixel-scene-layout';
import { renderPixelScene } from '../src/ui/pixel-scene';

const definitions: [SpellSprite, string, Being['intentForm']?][] = [
  ['fire-sphere', 'fogo'], ['lightning-sphere', 'raio'], ['water-sphere', 'agua'], ['ice-sphere', 'gelo'], ['earth-sphere', 'terra'],
  ['metal-sphere', 'metal'], ['fire-lance', 'fogo', 'lanca'], ['water-dragon', 'agua', 'dragao'], ['lightning-ring', 'raio', 'anel']
];
const palette = ['#1b1831', '#4a3d5b', '#8b668b', '#c895ad', '#f1cec7', '#fff3db', '#ffffff'].map(rgb);
const make = (element: string, intentForm?: Being['intentForm']): Being => ({
  elements: [element], shapes: ['forma_esfera'], concepts: [], placement: 'front', projectile: false,
  orbit: false, direction: null, guards: [], estado: false, linked: false, merged: false, bond: null, closed: false,
  ...(intentForm ? { intentForm } : {})
});
const same = (a: Pix, b: Pix): boolean => a.data.every((value, i) => value === b.data[i]);
const occupied = (p: Pix): number[] => Array.from({ length: p.w * p.h }, (_, i) => i).filter(i => p.data[i * 4 + 3]);

// Authored materials are allowed to flow inside their shapes. Geometry, packing,
// identity and the original runes remain the contract, not historical colours.
describe('Integrated authored spell sprites', () => {
  it.each(definitions)('%s shares a safe loop envelope with the layout', (sprite, element, form) => {
    const b = make(element, form);
    expect(spellSpriteOf(b)).toBe(sprite);
    for (const s of [2.5, 3, 6, 15]) for (const offset of [0, .45]) for (const reverse of [false, true]) {
      const q = spellSpriteBounds(sprite, s), x = 70 + offset, y = 45 - offset;
      for (let frame = 0; frame < 8; frame++) {
        const p = new Pix(140, 100), loop = new Pix(140, 100);
        const box = paintSpellSprite(sprite, p, x, y, s, palette, 3, frame, reverse);
        paintSpellSprite(sprite, loop, x, y, s, palette, 3, frame + 8, reverse);
        expect(same(p, loop)).toBe(true);
        const pixels = occupied(p);
        expect(pixels.length).toBeGreaterThan(0);
        expect(pixels.every(i => {
          const px = i % p.w, py = Math.floor(i / p.w);
          return px >= Math.floor(x + q.l) && px <= Math.ceil(x + q.r) && py >= Math.floor(y + q.t) && py <= Math.ceil(y + q.b)
            && px >= Math.floor(box.l) && px <= Math.ceil(box.r) && py >= Math.floor(box.t) && py <= Math.ceil(box.b);
        })).toBe(true);
      }
    }
  });

  it.each(definitions)('%s remains one connected material at native and copy sizes', sprite => {
    for (const s of [3, 6, 15]) for (let frame = 0; frame < 8; frame++) {
      const p = new Pix(140, 100); paintSpellSprite(sprite, p, 70, 45, s, palette, 3, frame);
      const pixels = occupied(p), remaining = new Set(pixels), queue = [pixels[0]];
      remaining.delete(pixels[0]);
      for (let j = 0; j < queue.length; j++) for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
        const next = queue[j] + dy * p.w + dx;
        if (remaining.delete(next)) queue.push(next);
      }
      expect(remaining.size, `${sprite}/${s}/${frame}`).toBe(0);
    }
  });

  it.each(definitions)('%s fits six copies and eight orbits without changing rules', (_sprite, element, form) => {
    for (const patch of [{ intentCount: '6' }, { orbit: true }]) {
      const source = make(element, form);
      const ap: Appearance = 'orbit' in patch
        ? { beings: Array.from({ length: 8 }, () => ({ ...source, orbit: true })), orbitCount: 8 }
        : { beings: [{ ...source, ...patch }], orbitCount: 0 };
      const before = structuredClone(ap), visual = appearanceForScene(ap), layout = layoutScene(visual);
      expect(visual.beings.length).toBe('orbit' in patch ? 8 : 6);
      const boxes = visual.beings.map(b => boundsOfBeing(b, layout.poses.get(b)!));
      expect(boxes.every(q => q.l >= 2 && q.t >= 2 && q.r <= 178 && q.b <= 98)).toBe(true);
      expect(boxes.every((q, i) => boxes.slice(i + 1).every(z => q.r <= z.l || z.r <= q.l || q.b <= z.t || z.b <= q.t))).toBe(true);
      for (const frame of [0, 3, 7]) {
        const scene = renderPixelScene(ap, true, frame);
        expect([scene.pix.w, scene.pix.h]).toEqual([180, 105]);
      }
      expect(ap).toEqual(before);
    }
  });

  it('mirrors the complete returning water dragon and fire lance', () => {
    for (const sprite of ['water-dragon', 'fire-lance'] as const) for (let frame = 0; frame < 8; frame++) {
      const front = new Pix(141, 101), back = new Pix(141, 101);
      paintSpellSprite(sprite, front, 70, 50, 15, palette, 3, frame, false);
      paintSpellSprite(sprite, back, 70, 50, 15, palette, 3, frame, true);
      expect(back.data.every((v, i) => {
        const pixel = Math.floor(i / 4), x = pixel % 141, y = Math.floor(pixel / 141);
        return v === front.data[(y * 141 + (140 - x)) * 4 + i % 4];
      })).toBe(true);
    }
  });

  it('keeps the electrical ring hole open and the fire core stable through its moving fold', () => {
    for (let frame = 0; frame < 8; frame++) {
      const ring = new Pix(140, 100); paintSpellSprite('lightning-ring', ring, 70, 45, 15, palette, 3, frame);
      expect(ring.data[(45 * 140 + 70) * 4 + 3]).toBe(0);
      const fire = new Pix(140, 100); paintSpellSprite('fire-sphere', fire, 70, 45, 15, palette, 3, frame);
      const center = (44 * 140 + 66) * 4;
      expect(Array.from(fire.data.slice(center, center + 3))).toEqual(palette[6]);
    }
  });

  it('does not substitute unrelated words or structural assemblies', () => {
    expect(spellSpriteOf({ ...make('fogo'), intentGlyph: 'CURA' })).toBeUndefined();
    expect(spellSpriteOf({ ...make('fogo'), elements: ['fogo', 'agua'] })).toBe('fire-sphere');
    expect(spellSpriteOf({ ...make('fogo'), shapes: ['forma_esfera', 'forma_cubo'] })).toBeUndefined();
    expect(spellSpriteOf(make('agua', 'rede'))).toBeUndefined();
  });

  it.each(definitions)('%s retains its authored silhouette when another element joins', (sprite, element, form) => {
    const source=make(element,form), mixed={...source,elements:[element,element==='raio'?'fogo':'raio']};
    expect(spellSpriteOf(mixed)).toBe(sprite);
    for(const size of [2.5,6,15]) expect(layoutParts(mixed,size)).toEqual(layoutParts(source,size));
    for(const placement of ['front','flight','far','self'] as const) for(let frame=0;frame<8;frame++) {
      const b={...mixed,placement,direction:placement==='self'?'back' as const:null},ap:Appearance={beings:[b],orbitCount:0};
      const pose=layoutScene(ap,frame).poses.get(b)!;
      const q=boundsOfBeing(b,pose);
      expect(q.l).toBeGreaterThanOrEqual(3);expect(q.r).toBeLessThanOrEqual(177);
      expect(q.t).toBeGreaterThanOrEqual(3);expect(q.b).toBeLessThanOrEqual(99.001);
      expect(renderPixelScene(ap,true,frame).pix.w).toBe(180);
    }
  });
  it('uses the authored plasma lance for the actual ordered lightning/fire pair', () => {
    const b={...make('raio','lanca'),elements:['raio','fogo']};
    expect(spellSpriteOf(b)).toBe('fire-lance');
    expect(b.elements).toEqual(['raio','fogo']);
    expect(spellSpriteOf(make('raio','lanca'))).toBeUndefined();
  });

  it('reserves the lance thrust only for actual flight, not return, touch or orbit', () => {
    const source = { ...make('fogo', 'lanca'), projectile: true };
    const still = spellSpriteBounds('fire-lance', 15), moving = spellSpriteBounds('fire-lance', 15, true);
    expect(moving.r - moving.l).toBeGreaterThan(still.r - still.l);
    for (const placement of ['front', 'touch', 'far', 'self'] as const) {
      const b = { ...source, placement, direction: placement === 'self' ? 'back' as const : null };
      expect(layoutParts(b, 15).width).toBe(still.r - still.l);
      const ap: Appearance = { beings: [b], orbitCount: 0 }, before = structuredClone(ap);
      const p = layoutScene(ap).poses.get(b)!;
      if (placement === 'self') expect(boundsOfBeing(b, p).t).toBeGreaterThanOrEqual(77);
      for (const frame of [0, 3, 7]) expect(renderPixelScene(ap, true, frame).pix.w).toBe(180);
      expect(ap).toEqual(before);
    }
    expect(layoutParts({ ...source, placement: 'flight' }, 15).width).toBe(moving.r - moving.l);
    expect(layoutParts({ ...source, placement: 'flight', orbit: true }, 15).width).toBe(still.r - still.l);
  });

});

import { describe, expect, it } from 'vitest';
import { spellRamp } from '../src/ui/pixel-spell-palette';
import type { Appearance, Being } from '../src/core/appearance';
import { appearanceForScene, layoutScene } from '../src/ui/pixel-scene-layout';
import { renderPixelScene } from '../src/ui/pixel-scene';
import { paintSpellSprite } from '../src/ui/pixel-spell-sprites';
import { Pix } from '../src/ui/pixel';

const luma = (c: readonly number[]) => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;

describe('Spell art colour direction', () => {
  it.each(['fogo', 'raio', 'luz', 'agua', 'gelo', 'vento', 'terra', 'materia',
    'gravidade', 'metal', 'som', 'natureza', 'acido', 'ilusao', 'sombra',
    'espaco', 'vida', 'morte', 'tempo', 'movimento', 'pressao', 'caos',
    'infinito', 'vazio', 'unknown'])('%s keeps ordered readable planes', element => {
    const ramp = spellRamp(element);
    expect(ramp.length).toBeGreaterThanOrEqual(5);
    expect(new Set(ramp.map(c => c.join(','))).size).toBe(ramp.length);
    expect(ramp.every(c => c.length === 3 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255))).toBe(true);
    expect(ramp.slice(1).every((c, i) => luma(c) > luma(ramp[i]) + 8)).toBe(true);
  });

  it('separates cyan electricity from coral fire and gold light at the material midtone', () => {
    const electric = spellRamp('raio')[3], fire = spellRamp('fogo')[3], light = spellRamp('luz')[2];
    expect(electric[2] - electric[0]).toBeGreaterThan(80);
    expect(electric[1] - electric[0]).toBeGreaterThan(80);
    expect(fire[0] - fire[2]).toBeGreaterThan(100);
    expect(light[0] - light[2]).toBeGreaterThan(100);
    expect(Math.hypot(...electric.map((c, i) => c - fire[i]))).toBeGreaterThan(180);
    expect(Math.hypot(...electric.map((c, i) => c - light[i]))).toBeGreaterThan(180);
    expect([spellRamp('fogo').length, spellRamp('raio').length, spellRamp('luz').length]).toEqual([7, 6, 5]);
  });

  it('keeps a fused fire body warm while its electric channel stays blue', () => {
    const being: Being = {
      elements: ['fogo', 'raio'], shapes: ['forma_esfera'], concepts: [], placement: 'front',
      projectile: false, orbit: false, direction: null, guards: [], estado: false,
      linked: true, merged: true, bond: null, closed: false
    };
    const ap: Appearance = { beings: [being], orbitCount: 0 };
    const visual = appearanceForScene(ap), pose = layoutScene(visual).poses.get(visual.beings[0])!;
    for (const night of [false, true]) for (const frame of [0, 2, 4, 6]) {
      const scene = renderPixelScene(ap, night, frame).pix, mask = new Pix(scene.w, scene.h);
      paintSpellSprite('fire-sphere', mask, pose.x, pose.y, pose.s, spellRamp('fogo'), 3, frame);
      let occupied = 0, warm = 0, electric = 0;
      for (let i = 0; i < mask.data.length; i += 4) {
        if (!mask.data[i + 3]) continue;
        occupied++;
        const r = scene.data[i], g = scene.data[i + 1], b = scene.data[i + 2];
        if (r - b > 60 && r - g > 15) warm++;
        if (b - r > 30 && g > r) electric++;
      }
      expect(warm / occupied).toBeGreaterThan(.2);
      expect(electric).toBeGreaterThan(2);
    }
  });

  it('returns independent RGB tuples when a mixed body edits its own ramp', () => {
    const original = spellRamp('raio'), mixed = spellRamp('raio');
    mixed[0][0] = 255;
    mixed.splice(1, 2);
    expect(spellRamp('raio')).toEqual(original);
    expect(spellRamp()).toEqual(spellRamp('unknown'));
  });
});

import { describe, expect, it } from 'vitest';
import type { Appearance, Being } from '../src/core/appearance';
import { appearanceForScene, layoutScene } from '../src/ui/pixel-scene-layout';
import { renderPixelScene } from '../src/ui/pixel-scene';

const being = (element: string, shape = 'forma_esfera'): Being => ({
  elements: [element], shapes: [shape], concepts: [], placement: 'front',
  projectile: false, orbit: false, direction: null, guards: [], estado: false,
  linked: false, merged: false, bond: null, closed: false
});
const appearance = (b: Being): Appearance => ({ beings: [b], orbitCount: 0 });

describe('Protected sculpted spell bodies', () => {
  it.each(['vento', 'sombra'])('%s keeps its spherical material visible below every moving accent', element => {
    const ap = appearanceForScene(appearance(being(element)));
    const pose = layoutScene(ap).poses.get(ap.beings[0])!;
    const radius = pose.s * .82;
    for (const night of [false, true]) {
      const still = renderPixelScene(ap, night).pix;
      for (let frame = 1; frame < 8; frame++) {
        const next = renderPixelScene(ap, night, frame).pix;
        for (let y = Math.ceil(pose.y - radius); y <= pose.y + radius; y++)
          for (let x = Math.ceil(pose.x - radius); x <= pose.x + radius; x++) {
            if (Math.hypot(x - pose.x, y - pose.y) > radius) continue;
            const i = (y * still.w + x) * 4;
            expect(Array.from(next.data.slice(i, i + 4))).toEqual(Array.from(still.data.slice(i, i + 4)));
          }
      }
    }
  });

  it('animates the authored electrical surface while keeping its dark nucleus and scenery stable', () => {
    const ap = appearance(being('raio')), before = structuredClone(ap), pose = layoutScene(ap).poses.get(ap.beings[0])!;
    for (const night of [false, true]) {
      const still = renderPixelScene(ap, night).pix;
      let movingFrames = 0;
      for (let frame = 1; frame < 8; frame++) {
        const next = renderPixelScene(ap, night, frame).pix;
        let changed = 0, body = 0;
        for (let y = Math.ceil(pose.y - pose.s * .82); y <= pose.y + pose.s * .82; y++)
          for (let x = Math.ceil(pose.x - pose.s * .82); x <= pose.x + pose.s * .82; x++) {
            if (Math.hypot(x - pose.x, y - pose.y) > pose.s * .82) continue;
            const i = (y * still.w + x) * 4;
            body++;
            if (next.data.slice(i, i + 4).some((v, k) => v !== still.data[i + k])) changed++;
          }
        if (changed > 0) movingFrames++;
        expect(changed).toBeLessThan(body * .65);
        for (const [x, y] of [[Math.round(pose.x), Math.round(pose.y)], [10, 10], [150, 20], [80, 100]]) {
          const i = (y * still.w + x) * 4;
          expect(Array.from(next.data.slice(i, i + 4))).toEqual(Array.from(still.data.slice(i, i + 4)));
        }
      }
      expect(movingFrames).toBeGreaterThanOrEqual(5);
    }
    expect(ap).toEqual(before);
  });

  it('keeps the sky and terrain stable throughout the new flame silhouette loop', () => {
    const fire = being('fogo'); fire.shapes = [];
    const ap = appearance(fire), still = renderPixelScene(ap, true).pix;
    for (let frame = 1; frame < 8; frame++) {
      const next = renderPixelScene(ap, true, frame).pix;
      for (const [x, y] of [[10, 10], [70, 18], [150, 20], [80, 100], [130, 90]]) {
        const i = (y * still.w + x) * 4;
        expect(Array.from(next.data.slice(i, i + 4))).toEqual(Array.from(still.data.slice(i, i + 4)));
      }
    }
  });
});

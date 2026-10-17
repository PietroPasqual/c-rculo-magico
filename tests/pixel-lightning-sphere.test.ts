import { describe, expect, it } from 'vitest';
import { Pix, rgb } from '../src/ui/pixel';
import { lightningSphereBounds, paintCoherentLightningSphere } from '../src/ui/pixel-lightning-sphere';

const ramp = ['#0f1027', '#272857', '#3852b0', '#35a4d7', '#5de1ec', '#dffefa'].map(rgb);
const draw = (frame: number, s = 15, dx = 0, dy = 0): Pix => {
  const pix = new Pix(64, 64);
  paintCoherentLightningSphere(pix, 32 + dx, 32 + dy, s, ramp, frame);
  return pix;
};
const occupied = (p: Pix): number[] => Array.from({ length: p.w * p.h }, (_, i) => i).filter(i => p.data[i * 4 + 3]);
const identical = (a: Pix, b: Pix): boolean => a.data.every((value, i) => value === b.data[i]);

describe('Esfera de raio: circuito volumétrico autoral', () => {
  it('mantém um núcleo escuro e reflexos pequenos enquanto a descarga percorre o corpo', () => {
    const signatures = new Set<string>(), hotCenters: number[] = [];
    for (let frame = 0; frame < 8; frame++) {
      const p = draw(frame), points = occupied(p);
      const hot = points.filter(i => p.data[i * 4 + 1] >= ramp[4][1]);
      const peak = points.filter(i => p.data[i * 4] === ramp[5][0]);
      signatures.add(Array.from(p.data).join(','));
      expect(Array.from(p.data.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4))).toEqual([...ramp[0], 255]);
      expect(hot.length).toBeGreaterThan(0);
      expect(hot.length).toBeLessThan(points.length * .08);
      expect(peak.length).toBeLessThan(points.length * .025);
      hotCenters.push(hot.reduce((sum, i) => sum + Math.floor(i / p.w) - 32, 0) / hot.length);
    }
    expect(signatures.size).toBe(8);
    // The same discharge reaches the upper and then lower hemisphere rather
    // than changing the whole sphere's brightness in place.
    expect(hotCenters[2]).toBeLessThan(-4);
    expect(hotCenters[6]).toBeGreaterThan(4);
  });

  it.each([2.5, 3, 6, 15])('preserva volume único, contorno e envelope na escala %s', s => {
    for (const [dx, dy] of [[0, 0], [.45, .55], [.5, .5]]) {
      const first = draw(0, s, dx, dy), q = lightningSphereBounds(s);
      for (let frame = 0; frame < 8; frame++) {
        const p = draw(frame, s, dx, dy), points = occupied(p);
        expect(points.length).toBeGreaterThan(0);
        expect(points).toEqual(occupied(first));
        expect(points.every(i => i % p.w >= 32 + dx + q.l && i % p.w <= 32 + dx + q.r
          && Math.floor(i / p.w) >= 32 + dy + q.t && Math.floor(i / p.w) <= 32 + dy + q.b)).toBe(true);
        const remaining = new Set(points), queue = [points[0]];
        remaining.delete(points[0]);
        for (let j = 0; j < queue.length; j++) for (const yy of [-1, 0, 1]) for (const xx of [-1, 0, 1]) {
          const next = queue[j] + yy * p.w + xx;
          if (remaining.delete(next)) queue.push(next);
        }
        expect(remaining.size).toBe(0);
      }
    }
  });

  it('fecha os oito quadros sem ruído, trata fases inválidas e respeita a pausa no quadro zero', () => {
    for (let frame = 0; frame < 8; frame++) expect(identical(draw(frame), draw(frame + 8))).toBe(true);
    for (const frame of [8, 16, 8.9, NaN, Infinity, -Infinity]) expect(identical(draw(0), draw(frame))).toBe(true);
    expect(identical(draw(-1), draw(7))).toBe(true);
    for (let frame = 0; frame < 8; frame++) expect(identical(draw(frame), draw(frame))).toBe(true);
  });
});

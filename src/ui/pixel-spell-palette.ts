import { rgb, type RGB } from './pixel';

/** Spell artwork only: rune/SVG colours and the editor theme are independent. */
const RAMP_HEX: Record<string, readonly string[]> = {
  fogo: ['#32142b', '#762040', '#c63a48', '#f66c42', '#ffb65f', '#ffe4a4', '#fff7df'],
  raio: ['#1b204d', '#3b4d9d', '#438fd3', '#5adce4', '#b6f9ee', '#f3fff5'],
  luz: ['#563049', '#a15c3b', '#e5ac53', '#ffe9a4', '#fffce0'],
  agua: ['#122346', '#17466a', '#237e9b', '#4dbac5', '#9de5df', '#ecfff1'],
  gelo: ['#26345e', '#3d6294', '#619dc9', '#90d8e7', '#c5f1ef', '#f4ffff'],
  vento: ['#0b5a45', '#0ca678', '#38d9a9', '#96f2d7', '#e6fcf5'],
  terra: ['#302632', '#57403a', '#8a6343', '#bb955d', '#e0c68d'],
  materia: ['#3f1d0b', '#6e3417', '#a0522d', '#c97b4e', '#e8b38f'],
  gravidade: ['#1b2266', '#2f3fa8', '#4c6ef5', '#91a7ff', '#dbe4ff'],
  metal: ['#202b43', '#45526c', '#8196a4', '#c8d8d6', '#f5fff1'],
  som: ['#4b1460', '#862e9c', '#be4bdb', '#e599f7', '#f8e8fc'],
  natureza: ['#1e5e2a', '#2b8a3e', '#40c057', '#8ce99a', '#ebfbee'],
  acido: ['#3d6108', '#5c940d', '#94c11f', '#c0eb75', '#f4fce3'],
  ilusao: ['#4a1660', '#7b2a91', '#cc5de8', '#e599f7', '#f8f0fc'],
  sombra: ['#10101d', '#242039', '#48415e', '#766b8d', '#b8adcf'],
  espaco: ['#1a0f45', '#3b2390', '#5f3dc4', '#9775fa', '#ece4ff'],
  vida: ['#1e5e2a', '#2b8a3e', '#51cf66', '#8ce99a', '#ebfbee'],
  morte: ['#121417', '#2b2f33', '#495057', '#868e96', '#dee2e6'],
  tempo: ['#6b3d00', '#a65f00', '#f59f00', '#ffd43b', '#fff9db'],
  movimento: ['#074a57', '#0b7285', '#15aabf', '#66d9e8', '#e3fafc'],
  pressao: ['#18286b', '#253c9c', '#4263eb', '#91a7ff', '#e7f0ff'],
  caos: ['#6b0f2f', '#a61e4d', '#e64980', '#faa2c1', '#fff0f6'],
  infinito: ['#2a1670', '#4325a8', '#7950f2', '#b197fc', '#f3f0ff'],
  vazio: ['#080b13', '#161b2b', '#303953', '#505e79', '#b4c3d9']
};
const FALLBACK = ['#5c4520', '#7a5f2e', '#c9a86a', '#e9d5a8', '#fff8e6'];

/**
 * Hue shifts separate an electrical channel from its warm fire response.
 * Keep the existing number of tones: authored planes use normalized indices.
 * Return fresh tuples so mixed palettes cannot recolour another spell.
 */
export const spellRamp = (element?: string): RGB[] =>
  (RAMP_HEX[element ?? ''] ?? FALLBACK).map(rgb);

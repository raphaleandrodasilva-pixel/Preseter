import { describe, expect, it } from 'vitest';
import { isPatchIconId, PATCH_ICON_IDS, suggestPatchIcon } from './patch-icons';

describe('suggestPatchIcon', () => {
  it.each([
    ['Piano Acústico', 'piano'],
    ['Piano Elétrico', 'epiano'],
    ['Rhodes', 'epiano'],
    ['Órgão Hammond', 'organ'],
    ['Cordas', 'strings'],
    ['Metais', 'brass'],
    ['Flauta', 'flute'],
    ['Coral', 'choir'],
    ['Pad Escuro', 'pad-dark'],
    ['Pad Brilhante', 'pad-bright'],
    ['Pad', 'pad'],
    ['Lead', 'lead'],
    ['Baixo', 'bass'],
    ['Guitarra Elétrica', 'guitar'],
    ['Bateria', 'drums'],
    ['Synth', 'synth'],
    ['Split', 'split'],
    ['Tripla Camada', 'layer'],
    ['Microfone', 'mic'],
    ['Sino', 'bell'],
    ['Estrela', 'star'],
    ['Fogo', 'fire'],
    ['Onda', 'wave'],
  ])('sugere %s → %s', (name, icon) => {
    expect(suggestPatchIcon(name)).toBe(icon);
  });

  it('usa o nome do set quando o patch não tem match', () => {
    expect(suggestPatchIcon('Patch 1', 'Piano')).toBe('piano');
    expect(suggestPatchIcon('Patch 1', 'Bateria')).toBe('drums');
  });

  it('cai em genérico quando não há nenhuma pista', () => {
    expect(suggestPatchIcon('Patch 1')).toBe('generic');
    expect(suggestPatchIcon(undefined, undefined)).toBe('generic');
  });

  it('reconhece somente IDs novos, deixando emojis antigos como legado', () => {
    expect(isPatchIconId('pad-dark')).toBe(true);
    expect(PATCH_ICON_IDS).toContain('none');
    expect(isPatchIconId('🎹')).toBe(false);
    expect(isPatchIconId(undefined)).toBe(false);
  });
});

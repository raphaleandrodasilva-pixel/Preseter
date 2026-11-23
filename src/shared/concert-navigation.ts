import type { Preset } from './types';

/**
 * Primeiro patch que deve abrir quando um concert é carregado.
 * Respeita a ordem de programa e ignora patches marcados como "skip";
 * se todos estiverem pulados, devolve o primeiro mesmo assim.
 */
export function firstPlayablePreset (presets: Preset[]): Preset | undefined {
  const playable = presets.filter((preset) => !preset.skipped);
  const list = playable.length > 0 ? playable : presets;
  return [...list].sort((a, b) => a.programNumber - b.programNumber)[0];
}

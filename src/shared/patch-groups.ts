import type { Preset, PresetSet } from './types';

/** Grupo de patches de um set, na ordem em que aparece no palco. */
export interface PatchGroup {
  /** `setId` ou `__none` para patches sem set. */
  key: string;
  name: string;
  setId?: string;
  patches: Preset[];
}

/**
 * Agrupa patches por set para o modo Perform.
 * Sets seguem `set.order`; dentro do set vale `setOrder` e depois o programa.
 * Patches sem set ficam no fim, no grupo "Sem set".
 */
export function groupPatchesBySet (presets: Preset[], sets: PresetSet[]): PatchGroup[] {
  const setOrder = new Map(sets.map((set) => [set.id, set.order ?? 0]));
  const sorted = [...presets].sort((a, b) => {
    const orderA = a.setId ? setOrder.get(a.setId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const orderB = b.setId ? setOrder.get(b.setId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    return orderA - orderB
      || (a.setOrder ?? 0) - (b.setOrder ?? 0)
      || a.programNumber - b.programNumber;
  });

  const groups = new Map<string, PatchGroup>();
  for (const patch of sorted) {
    const set = patch.setId ? sets.find((item) => item.id === patch.setId) : undefined;
    const key = set?.id ?? '__none';
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: set?.name ?? 'Sem set',
        ...(set ? { setId: set.id } : {}),
        patches: [],
      };
      groups.set(key, group);
    }
    group.patches.push(patch);
  }
  return [...groups.values()];
}

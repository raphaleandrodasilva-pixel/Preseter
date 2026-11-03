import type { Preset, PresetPluginAssignment, PresetSet, PreseterConcertFile, UiElement } from '../../shared/types';
import { existsSync } from 'fs';
import * as path from 'path';
import { CONCERT_FILE_FORMAT, CONCERT_FILE_VERSION, DEFAULT_TEMPO } from '../../shared/constants';
import { createDefaultKeyboardLayout } from '../../shared/default-layout';
import { createDefaultConcertSettings, createEmptyLayout } from '../concert/ConcertFile';
import { migrateConcertLayout } from '../../shared/concert-layout';
import { COLLECTION_SETS, type CollectionLayerSpec } from '../../shared/collection-presets';
import { suggestPatchIcon } from '../../shared/patch-icons';

export interface CollectionPlugin {
  id: string;
  name: string;
  isInstrument?: boolean;
}

interface InstrumentSpec {
  label: string;
  match: RegExp[];
  fallback?: CollectionLayerSpec['inst'];
}

/** Siglas da coleção → nomes procurados no scan do motor. */
export const COLLECTION_INSTRUMENTS: Record<CollectionLayerSpec['inst'], InstrumentSpec> = {
  JUICY: { label: 'juicysfplugin', match: [/juicy|juicysf/i] },
  SURGE: { label: 'Surge XT', match: [/surge/i], fallback: 'DEXED' },
  DEXED: { label: 'Dexed', match: [/dexed/i] },
  ODIN: { label: 'Odin 2', match: [/odin/i], fallback: 'SURGE' },
  HELM: { label: 'Helm', match: [/helm/i], fallback: 'SURGE' },
  MDA: { label: 'MDA', match: [/mda/i], fallback: 'DEXED' },
  MDA_EP: { label: 'MDA ePiano', match: [/mda\s*epiano|mdaepiano/i], fallback: 'MDA' },
  MDA_JX: { label: 'MDA JX10', match: [/mda\s*jx\s*10|mdajx10/i], fallback: 'MDA' },
  ORG: { label: 'setBfree', match: [/setbfree/i], fallback: 'JUICY' },
  SFIZZ: { label: 'sfizz', match: [/sfizz/i], fallback: 'JUICY' },
};

export interface BuildCollectionResult {
  file: PreseterConcertFile;
  skipped: string[];
  missing: string[];
}

let counter = 0;
const nextId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${++counter}`;

function keyboardRig(notes: string, tempo: number): UiElement[] {
  return createDefaultKeyboardLayout(tempo, { title: notes }).elements;
}

function resolvePlugin(
  inst: CollectionLayerSpec['inst'],
  plugins: CollectionPlugin[],
  seen: Set<CollectionLayerSpec['inst']> = new Set()
): CollectionPlugin | undefined {
  if (seen.has(inst)) return undefined;
  seen.add(inst);
  const spec = COLLECTION_INSTRUMENTS[inst];
  for (const pattern of spec.match) {
    const found = plugins.find((plugin) => pattern.test(plugin.name) && plugin.isInstrument !== false);
    if (found) return found;
  }
  return spec.fallback ? resolvePlugin(spec.fallback, plugins, seen) : undefined;
}

/**
 * Monta a estrutura do concert da coleção (sets, patches, camadas, faixas,
 * volumes, programa e teclado). Não carrega nenhum som dentro dos plugins.
 */
export function buildCollectionConcert(
  plugins: CollectionPlugin[],
  options: { tempo?: number; test?: boolean; name?: string; soundsFolder?: string } = {}
): BuildCollectionResult {
  const tempo = options.tempo ?? DEFAULT_TEMPO;
  const now = Date.now();
  const sets: PresetSet[] = [];
  const rawPatches: Preset[] = [];
  const skipped: string[] = [];
  const missing = new Set<string>();
  let program = 0;

  for (const [setName, patches] of COLLECTION_SETS) {
    const setId = nextId('set');
    let setOrder = 0;
    for (const [name, layers] of patches) {
      const assignments: PresetPluginAssignment[] = [];
      let blocked: string | null = null;
      layers.forEach((layer, index) => {
        const plugin = options.test
          ? plugins.find((entry) => /test synth/i.test(entry.name))
          : resolvePlugin(layer.inst, plugins);
        if (!plugin) {
          blocked ??= `${COLLECTION_INSTRUMENTS[layer.inst]?.label ?? layer.inst} não encontrado`;
          missing.add(COLLECTION_INSTRUMENTS[layer.inst]?.label ?? layer.inst);
          return;
        }
        assignments.push({
          pluginId: plugin.id,
          layerId: `${name.replace(/\W+/g, '-').toLowerCase()}:layer:${index}`,
          name: layers.length > 1 && layer.label ? `${plugin.name} — ${layer.label}` : plugin.name,
          path: plugin.id,
          role: 'instrument',
          minNote: layer.min,
          maxNote: layer.max,
          // A coleção nasce em 0 dB; o usuário ajusta os volumes manualmente.
          mix: { volumeDb: 0, pan: 0, muted: false, solo: false },
          ...(layer.programIndex !== undefined ? { programIndex: layer.programIndex } : {}),
          ...(layer.inst === 'JUICY' && options.soundsFolder
            ? (() => {
                const samplePath = path.join('MuseScore_General', 'MuseScore_General.sf2');
                const fullPath = path.join(options.soundsFolder!, samplePath);
                if (!existsSync(fullPath)) missing.add('MuseScore_General.sf2');
                return existsSync(fullPath) ? { samplePath } : {};
              })()
            : {}),
        });
      });
      if (blocked || !assignments || assignments.length === 0) {
        skipped.push(`${name}: ${blocked ?? 'sem camadas'}`);
        continue;
      }
      const notes = layers.map((layer) => layer.label).filter(Boolean).join(' + ') || name;
      rawPatches.push({
        id: nextId('preset'),
        name,
        icon: suggestPatchIcon(name, setName),
        notes,
        setId,
        setOrder: setOrder++,
        programNumber: program++,
        midiChannel: 0,
        plugins: assignments,
        vstStates: {},
        layout: { elements: keyboardRig(notes, tempo), background: null, tempo },
        createdAt: now,
        updatedAt: now,
      });
    }
    if (setOrder > 0) {
      sets.push({
        id: setId,
        name: setName,
        order: sets.length,
        expanded: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const migrated = migrateConcertLayout(createEmptyLayout(tempo), rawPatches);
  const file: PreseterConcertFile = {
    format: CONCERT_FILE_FORMAT,
    version: CONCERT_FILE_VERSION,
    concert: {
      id: nextId('concert'),
      name: options.name ?? (options.test ? 'Coleção (teste)' : 'Coleção Preseter'),
      tempo,
      settings: createDefaultConcertSettings(),
      strips: [],
      createdAt: now,
      updatedAt: now,
    },
    sets,
    patches: migrated.patches,
    layout: migrated.layout,
    mappings: [],
  };
  return { file, skipped, missing: [...missing] };
}

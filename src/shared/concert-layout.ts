/**
 * Layout por concert (Fase 4.1).
 *
 * No MainStage o layout é do concert; cada patch guarda só os mappings dos
 * controles. O arquivo antigo guardava o layout inteiro em cada patch, então
 * estas funções também migram esse formato.
 */

import type { LayoutConfig, PatchMapping, Preset, UiElement } from './types';

/** Campos de um elemento de tela que são mapping (por patch), não layout. */
const MAPPING_KEYS = [
  'midiCommand',
  'midiPort',
  'midiThru',
  'pluginId',
  'pluginPath',
  'parameterId',
  'noteNumber',
  'velocity',
  'mappingMin',
  'mappingMax',
] as const satisfies readonly (keyof UiElement)[];

/** Extrai os mappings de um layout (usado ao salvar um patch e na migração). */
export function extractMappings(layout: LayoutConfig | null | undefined): Record<string, PatchMapping> {
  const mappings: Record<string, PatchMapping> = {};
  for (const element of layout?.elements ?? []) {
    const mapping: PatchMapping = {};
    for (const key of MAPPING_KEYS) {
      const value = element[key];
      if (value !== undefined) {
        (mapping as Record<string, unknown>)[key] = value;
      }
    }
    if (Object.keys(mapping).length > 0) mappings[element.id] = mapping;
  }
  return mappings;
}

/** Aplica os mappings do patch sobre a geometria do layout do concert. */
export function materializeLayout(
  concertLayout: LayoutConfig | null | undefined,
  patch: Preset | null | undefined
): LayoutConfig {
  const base = concertLayout ?? { elements: [], background: null, tempo: patch?.layout.tempo ?? 120 };
  const mappings = patch?.mappings ?? {};
  return {
    ...base,
    tempo: patch?.layout.tempo ?? base.tempo,
    elements: base.elements.map((element) => {
      const mapping = mappings[element.id];
      return mapping ? { ...element, ...mapping } : element;
    }),
  };
}

/** O patch é salvo sem geometria: o layout fica no concert e aqui só os mappings. */
export function withoutLayoutGeometry(preset: Preset): Preset {
  return {
    ...preset,
    mappings: extractMappings(preset.layout),
    layout: {
      elements: [],
      background: null,
      tempo: preset.layout.tempo,
    },
  };
}

/**
 * Migra um concert no formato antigo (layout dentro de cada patch) para o
 * formato novo (layout no concert + mappings por patch). Não altera um concert
 * que já tem layout no nível do concert.
 */
export function migrateConcertLayout(
  layout: LayoutConfig | null | undefined,
  patches: Preset[]
): { layout: LayoutConfig; patches: Preset[] } {
  const hasConcertLayout = (layout?.elements.length ?? 0) > 0;
  if (hasConcertLayout) {
    return {
      layout: layout as LayoutConfig,
      patches: patches.map((patch) => ({
        ...patch,
        mappings: patch.mappings ?? extractMappings(patch.layout),
      })),
    };
  }

  // Formato antigo: usa como layout do concert o patch com mais controles.
  let source: Preset | null = null;
  for (const patch of patches) {
    if (!source || (patch.layout?.elements.length ?? 0) > (source.layout?.elements.length ?? 0)) {
      source = patch;
    }
  }
  const concertLayout: LayoutConfig = source
    ? { ...source.layout, elements: source.layout.elements.map((element) => ({ ...element })) }
    : { elements: [], background: null, tempo: 120 };

  return {
    layout: concertLayout,
    patches: patches.map((patch) => ({
      ...patch,
      mappings: patch.mappings ?? extractMappings(patch.layout),
      layout: {
        elements: [],
        background: null,
        tempo: patch.layout?.tempo ?? concertLayout.tempo,
      },
    })),
  };
}

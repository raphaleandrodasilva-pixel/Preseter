/**
 * Layout por concert (Fase 4.1).
 *
 * O layout é do concert; cada patch guarda só os mappings dos
 * controles. O arquivo antigo guardava o layout inteiro em cada patch, então
 * estas funções também migram esse formato.
 */

import type { ConcertMapping, LayoutConfig, PatchMapping, Preset, PresetSet, UiElement } from './types';
import { assignMissingGroupIds } from './element-groups';

/** Campos de um elemento de tela que são mapping (por patch), não layout. */
const MAPPING_KEYS = [
  'midiCommand',
  'midiPort',
  'midiThru',
  'pluginId',
  'pluginPath',
  'parameterId',
  'paramOwner',
  'paramSlot',
  'noteNumber',
  'velocity',
  'mappingMin',
  'mappingMax',
  'respondToHardwareMove',
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

/** O fader "Volume" antigo vira o controle real do master do concert. */
function migrateMasterVolumeElement(element: UiElement): UiElement {
  if (element.target === 'master-volume') return element;
  if (element.type !== 'fader' || element.label.trim().toLowerCase() !== 'volume') return element;
  if (element.midiCommand?.type !== 'cc' || element.midiCommand.controllerNumber !== 7) return element;
  return { ...element, target: 'master-volume', midiCommand: undefined };
}

/** Converte um mapping de concert/set para o formato por elemento do patch. */
function mappingToPatchMapping(mapping: ConcertMapping, patch: Preset | null | undefined): PatchMapping {
  const plugin = mapping.pluginPath
    ? { path: mapping.pluginPath }
    : patch?.plugins?.find((assignment) => assignment.pluginId === mapping.pluginId);
  return {
    midiCommand: mapping.source,
    ...(mapping.pluginId ? { pluginId: mapping.pluginId } : {}),
    ...(plugin?.path ? { pluginPath: plugin.path } : {}),
    ...(mapping.parameterId ? { parameterId: mapping.parameterId } : {}),
    ...(mapping.mappingMin !== undefined ? { mappingMin: mapping.mappingMin } : {}),
    ...(mapping.mappingMax !== undefined ? { mappingMax: mapping.mappingMax } : {}),
    ...(mapping.midiThru !== undefined ? { midiThru: mapping.midiThru } : {}),
    ...(mapping.respondToHardwareMove
      ? { respondToHardwareMove: mapping.respondToHardwareMove }
      : {}),
  };
}

/** Mappings que valem neste patch, do nível mais amplo para o mais específico. */
export function resolveMappingsForPatch(
  mappings: ConcertMapping[] | null | undefined,
  set: PresetSet | null | undefined,
  patch: Preset | null | undefined
): Record<string, PatchMapping> {
  const resolved: Record<string, PatchMapping> = {};
  for (const mapping of mappings ?? []) {
    if (!mapping.elementId || mapping.action) continue;
    const isConcert = !mapping.setId && !mapping.patchId;
    const isSet = !!set && mapping.setId === set.id && !mapping.patchId;
    const isPatch = !!patch && mapping.patchId === patch.id;
    if (!isConcert && !isSet && !isPatch) continue;
    resolved[mapping.elementId] = mappingToPatchMapping(mapping, patch);
  }
  for (const [elementId, mapping] of Object.entries(patch?.mappings ?? {})) {
    resolved[elementId] = mapping;
  }
  return resolved;
}

/** Aplica os mappings do patch sobre a geometria do layout do patch (ou do concert, como fallback). */
export function materializeLayout(
  concertLayout: LayoutConfig | null | undefined,
  patch: Preset | null | undefined,
  mappings?: ConcertMapping[] | null,
  set?: PresetSet | null
): LayoutConfig {
  const patchLayout = patch?.layout && patch.layout.elements.length > 0 ? patch.layout : null;
  const base = patchLayout
    ?? concertLayout
    ?? { elements: [], background: null, tempo: patch?.layout.tempo ?? 120 };
  const effective = resolveMappingsForPatch(mappings, set, patch);
  return {
    ...base,
    tempo: patch?.layout.tempo ?? base.tempo,
    elements: base.elements.map((element) => {
      const mapping = effective[element.id];
      const resolved = mapping ? { ...element, ...mapping } : element;
      if (resolved.labelBinding === 'patch-name') {
        return { ...resolved, label: patch?.name?.trim() || resolved.label };
      }
      return migrateMasterVolumeElement(resolved);
    }),
  };
}

/** Prepara o patch para salvar mantendo a geometria própria e extraindo os mappings. */
export function withoutLayoutGeometry(preset: Preset): Preset {
  return {
    ...preset,
    mappings: extractMappings(preset.layout),
    layout: {
      ...preset.layout,
      elements: preset.layout.elements.map((element) => ({ ...element })),
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
  const normalizeLayout = (value: LayoutConfig): LayoutConfig => {
    const withIds = assignMissingGroupIds(value);
    return { ...withIds, elements: withIds.elements.map(migrateMasterVolumeElement) };
  };
  const hasConcertLayout = (layout?.elements.length ?? 0) > 0;
  if (hasConcertLayout) {
    return {
      layout: normalizeLayout(layout as LayoutConfig),
      patches: patches.map((patch) => ({
        ...patch,
        mappings: patch.mappings ?? extractMappings(patch.layout),
        layout: normalizeLayout(patch.layout),
      })),
    };
  }

  // Formato por patch: mantém a geometria de cada patch. O layout do primeiro
  // patch vira fallback para patches antigos que ainda não têm geometria.
  const source = patches.find((patch) => (patch.layout?.elements.length ?? 0) > 0) ?? null;
  const concertLayout: LayoutConfig = source
    ? { ...source.layout, elements: source.layout.elements.map((element) => ({ ...element })) }
    : { elements: [], background: null, tempo: 120 };

  return {
    layout: normalizeLayout(concertLayout),
    patches: patches.map((patch) => ({
      ...patch,
      mappings: patch.mappings ?? extractMappings(patch.layout),
      layout: patch.layout?.elements.length
        ? normalizeLayout(patch.layout)
        : { elements: [], background: null, tempo: patch.layout?.tempo ?? concertLayout.tempo },
    })),
  };
}

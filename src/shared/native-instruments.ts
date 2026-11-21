import type { VstPluginInfo } from './types';

/** Instrumentos que vivem dentro do motor do Preseter (sem plugin VST3). */
export interface NativeInstrumentInfo {
  id: string;
  name: string;
  category: string;
}

/**
 * Catálogo único dos instrumentos nativos. Usado pelo seletor de layers, pela
 * biblioteca de presets e pela troca de patch, para que todos reconheçam o
 * mesmo id (ex.: `preseter.synth2`).
 */
export const NATIVE_INSTRUMENTS: NativeInstrumentInfo[] = [
  { id: 'preseter.organ', name: 'Preseter Organ', category: 'Órgão' },
  { id: 'preseter.tines', name: 'Preseter Tines', category: 'Piano elétrico' },
  { id: 'preseter.reeds', name: 'Preseter Wurly', category: 'Piano elétrico' },
  { id: 'preseter.piano', name: 'Preseter Piano', category: 'Piano acústico' },
  { id: 'preseter.dx', name: 'Preseter DX10', category: 'Sintetizador FM' },
  { id: 'preseter.jx', name: 'Preseter JX10', category: 'Sintetizador analógico' },
  { id: 'preseter.synth2', name: 'Preseter Synth2', category: 'Sintetizador subtrativo' },
  { id: 'preseter.drums', name: 'Preseter Drums', category: 'Bateria' },
];

const NATIVE_IDS = new Set(NATIVE_INSTRUMENTS.map((instrument) => instrument.id));

export function isNativeInstrumentId(id: string | undefined | null): boolean {
  return !!id && NATIVE_IDS.has(id);
}

export function nativeInstrumentInfo(id: string): NativeInstrumentInfo | null {
  return NATIVE_INSTRUMENTS.find((instrument) => instrument.id === id) ?? null;
}

/** Entrada de catálogo (VstPluginInfo) de um instrumento nativo. */
export function nativeInstrumentEntry(id: string): VstPluginInfo | null {
  const info = nativeInstrumentInfo(id);
  if (!info) return null;
  return {
    id: info.id,
    name: info.name,
    path: info.id,
    isLoaded: false,
    isInstrument: true,
    parameters: [],
    manufacturer: 'Preseter',
    version: '1.0',
    category: info.category,
    format: 'Native',
    arch: 'x64',
  };
}

import * as path from 'node:path';
import { SAMPLE_LIBRARY_FILES } from '../../shared/collection-presets';
import { isNativeInstrumentId, nativeInstrumentInfo } from '../../shared/native-instruments';
import { isNativeSamplerAssignment, type Preset } from '../../shared/types';

/** Um instrumento de sampler (arquivo + banco + programa) que precisa estar pronto. */
export interface SamplerPrepareItem {
  kind: 'sampler';
  key: string;
  label: string;
  path: string;
  bank: number;
  program: number;
}

/** Um instrumento nativo cujos bancos/tabelas serão aquecidos. */
export interface NativePrepareItem {
  kind: 'native';
  key: string;
  label: string;
  plugin: string;
}

export type ConcertPrepareItem = SamplerPrepareItem | NativePrepareItem;

export interface ConcertPreparePlan {
  /**
   * Sampler primeiro (é o que pesa na troca), depois os nativos. Sem repetição:
   * dois patches que usam o mesmo piano carregam o arquivo uma vez só.
   */
  items: ConcertPrepareItem[];
  /** Arquivos de sample únicos (para dimensionar o cache). */
  samplerFiles: number;
  /** Programas únicos (arquivo + banco + programa). */
  samplerPrograms: number;
  /** Patches que contribuíram com algum item. */
  patchCount: number;
}

/**
 * Monta a lista de preparação de um concert inteiro.
 *
 * Só entram instrumentos: VST3 continua sob demanda (instanciar todos os
 * plugins de 40–64 patches é caro e não é o gargalo do sampler). Patches com
 * MIDI externo não têm instrumento. Sampler vazio (sem arquivo) é ignorado.
 */
export function collectConcertPrepareItems(
  presets: readonly Preset[],
  soundsFolder: string
): ConcertPreparePlan {
  const samplerItems = new Map<string, SamplerPrepareItem>();
  const samplerFiles = new Set<string>();
  const natives = new Map<string, NativePrepareItem>();
  let patchCount = 0;

  // Concertos criados no Windows podem trazer caminhos "C:/..." mesmo quando
  // a preparação roda no Linux (CI/testes). `path.resolve` trataria "C:/Sons"
  // como relativo e criaria "/home/runner/.../C:/Sons"; normaliza pelo win32.
  const isWindowsAbsolute = (value: string): boolean =>
    /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');

  const windowsStyle = (value: string): string => {
    const normalized = path.win32.normalize(value);
    return process.platform === 'win32' ? normalized : normalized.replace(/\\/g, '/');
  };

  const resolveSamplePath = (file: string): string => {
    if (isWindowsAbsolute(file))
      return windowsStyle(file);
    if (isWindowsAbsolute(soundsFolder))
      return windowsStyle(path.win32.join(soundsFolder, file));
    return path.resolve(soundsFolder, file);
  };

  const addSampler = (label: string, file: string, bank: number, program: number): void => {
    const resolved = resolveSamplePath(file);
    const key = `${resolved}|${bank}|${program}`;
    if (samplerItems.has(key)) return;
    samplerItems.set(key, {
      kind: 'sampler',
      key,
      label,
      path: resolved,
      bank,
      program,
    });
    samplerFiles.add(resolved);
  };

  const ordered = [...presets].sort((a, b) => a.programNumber - b.programNumber);

  for (const preset of ordered) {
    let contributed = false;

    for (const assignment of preset.plugins ?? []) {
      if (assignment.externalMidi) continue;

      const nativeDrums = assignment.pluginId === 'preseter.drums';
      const isSampler =
        isNativeSamplerAssignment(assignment) || (nativeDrums && !!assignment.samplePath);

      if (isSampler) {
        const file = assignment.samplePath?.trim();
        if (!file) continue;
        if (nativeDrums) {
          addSampler(
            assignment.name,
            file,
            128,
            assignment.drums?.kitProgram ?? 0
          );
        } else {
          addSampler(
            assignment.name,
            file,
            assignment.bank ?? 0,
            assignment.programIndex ?? 0
          );
        }
        contributed = true;
      }

      // Drums sem samplePath usa o kit padrão da biblioteca.
      if (nativeDrums && !assignment.samplePath) {
        addSampler(
          assignment.name,
          SAMPLE_LIBRARY_FILES.musescore.path,
          128,
          assignment.drums?.kitProgram ?? 0
        );
        contributed = true;
      }

      if (isNativeInstrumentId(assignment.pluginId)) {
        const plugin = assignment.pluginId;
        if (!natives.has(plugin)) {
          natives.set(plugin, {
            kind: 'native',
            key: `native:${plugin}`,
            label: nativeInstrumentInfo(plugin)?.name ?? plugin,
            plugin,
          });
        }
        contributed = true;
      }
    }

    if (contributed) patchCount += 1;
  }

  return {
    items: [...samplerItems.values(), ...natives.values()],
    samplerFiles: samplerFiles.size,
    samplerPrograms: samplerItems.size,
    patchCount,
  };
}

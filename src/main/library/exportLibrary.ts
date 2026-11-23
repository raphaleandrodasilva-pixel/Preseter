import { existsSync } from 'fs';
import * as path from 'path';
import { SAMPLE_LIBRARY_FILES } from '../../shared/collection-presets';
import {
  LIBRARY_FORMAT,
  LIBRARY_VERSION,
  PLUGIN_ID_TOKEN,
  PLUGIN_PATH_TOKEN,
  isSafeRelativePath,
  parseLibraryFile,
  type LibraryConcert,
  type LibraryFile,
  type LibraryPluginRef,
} from '../../shared/library/format';
import type { Insert, PreseterConcertFile, PresetPluginAssignment } from '../../shared/types';
import { parseConcertFile } from '../concert/ConcertFile';
import { findEffectPlugin, type BuildCollectionResult, type CollectionPlugin } from '../collection/generateCollection';

export type LibraryPlugin = CollectionPlugin & { format?: string };

export interface ExportEnvironment {
  plugins: LibraryPlugin[];
  soundsFolder: string;
  homeDir: string;
}

export interface ExportResult {
  library: LibraryFile;
  patches: number;
  warnings: string[];
}

const isNativePlugin = (value: string): boolean => value.startsWith('preseter.');

function libraryId (name: string): string {
  const id = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return id || 'biblioteca';
}

function eachInsertList (file: PreseterConcertFile, visit: (inserts: Insert[]) => void): void {
  for (const patch of file.patches) {
    for (const layer of patch.plugins ?? []) if (layer.inserts) visit(layer.inserts);
    if (patch.master?.inserts) visit(patch.master.inserts);
  }
  const buses = file.concert.settings?.buses;
  for (const bus of [...(buses?.aux ?? []), ...(buses?.outputs ?? [])]) if (bus.inserts) visit(bus.inserts);
}

/** Troca valores e chaves iguais aos ids/caminhos locais pela referência portátil. */
function replaceReferences (value: unknown, references: Map<string, string>): unknown {
  if (typeof value === 'string') return references.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceReferences(item, references));
  if (typeof value !== 'object' || value === null) return value;
  const mapKey = (key: string): string => {
    if (references.has(key)) return references.get(key) as string;
    if (key.startsWith('loaded_') && references.has(key.slice(7))) {
      return `loaded_${references.get(key.slice(7)) as string}`;
    }
    return key;
  };
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [mapKey(key), replaceReferences(item, references)])
  );
}

const isWindowsPath = (value: string): boolean => /^[a-z]:[\\/]|^\\\\/i.test(value);

/**
 * Caminho relativo à pasta de sons. Não depende do sistema atual: um concert
 * salvo no Windows pode ser exportado no Linux, e vice-versa.
 */
function relativeSamplePath (samplePath: string, soundsFolder: string): string | null {
  const windows = isWindowsPath(samplePath);
  if (!windows && !samplePath.startsWith('/')) {
    const relative = samplePath.replace(/\\/g, '/');
    return isSafeRelativePath(relative) ? relative : null;
  }
  if (windows !== isWindowsPath(soundsFolder)) return null;
  const api = windows ? path.win32 : path.posix;
  const relative = api.relative(soundsFolder, samplePath);
  if (!relative || relative.startsWith('..') || api.isAbsolute(relative)) return null;
  return relative.split(api.sep).join('/');
}

/** Remove o caminho local gravado no estado do sampler (o motor não o usa ao restaurar). */
function scrubState (state: unknown, homeDir: string): { state: unknown; hasLocalPath: boolean } {
  if (typeof state !== 'object' || state === null) return { state, hasLocalPath: false };
  const data = (state as { data?: unknown }).data;
  if (typeof data !== 'string') return { state, hasLocalPath: false };

  const text = Buffer.from(data, 'base64').toString('utf8');
  const home = homeDir.toLowerCase();
  const containsHome = (value: string): boolean => {
    const lower = value.toLowerCase();
    return !!home && (lower.includes(home) || lower.includes(home.replace(/\\/g, '/')) || lower.includes(home.replace(/\\/g, '\\\\')));
  };
  if (text.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.file === 'string' && 'format' in parsed) {
        parsed.file = '';
        const clean = JSON.stringify(parsed);
        return {
          state: { ...(state as object), data: Buffer.from(clean, 'utf8').toString('base64') },
          hasLocalPath: containsHome(clean),
        };
      }
    } catch {
      /* não é o estado do sampler */
    }
  }
  return { state, hasLocalPath: containsHome(text) };
}

/** Transforma o concert aberto em uma biblioteca que funciona em outro computador. */
export function buildLibraryFromConcert (document: PreseterConcertFile, environment: ExportEnvironment): ExportResult {
  if (document.patches.length === 0) throw new Error('O concert não tem patches para exportar.');

  // O app só trabalha com strips de patch; strips antigos não são exportados.
  const file = parseConcertFile(JSON.stringify(document));
  const warnings = new Set<string>();
  const pluginRefs: Record<string, LibraryPluginRef> = {};
  const keyByPlugin = new Map<string, string>();
  const references = new Map<string, string>();

  const register = (item: { pluginId: string; path: string; name: string }, kind: LibraryPluginRef['kind']): void => {
    if (isNativePlugin(item.pluginId) || isNativePlugin(item.path)) return;
    const scanned = environment.plugins.find((plugin) =>
      plugin.id === item.pluginId || (!!plugin.path && plugin.path === item.path));
    if (!scanned) warnings.add(`Plugin "${item.name}" não está no scan; confira se ele existe no outro computador.`);

    const name = scanned?.name ?? item.name;
    const format = scanned?.format;
    const identity = `${name.toLowerCase()}|${format ?? ''}`;
    let key = keyByPlugin.get(identity);
    if (!key) {
      key = `p${keyByPlugin.size + 1}`;
      keyByPlugin.set(identity, key);
      pluginRefs[key] = { name, kind, ...(format ? { format } : {}) };
    }
    if (item.pluginId) references.set(item.pluginId, `${PLUGIN_ID_TOKEN}${key}`);
    if (item.path) references.set(item.path, `${PLUGIN_PATH_TOKEN}${key}`);
  };

  for (const patch of file.patches) {
    for (const layer of patch.plugins ?? []) {
      if (!layer.externalMidi) register(layer, 'instrument');
      if (layer.samplePath) {
        const relative = relativeSamplePath(layer.samplePath, environment.soundsFolder);
        if (relative) {
          layer.samplePath = relative;
        } else {
          // win32.basename aceita os dois tipos de barra.
          const base = path.win32.basename(layer.samplePath);
          warnings.add(`Sample "${base}" está fora da pasta de sons; copie-o para Externos/ no outro computador.`);
          layer.samplePath = `Externos/${base}`;
        }
      }
    }
    for (const [key, state] of Object.entries(patch.vstStates ?? {})) {
      const scrubbed = scrubState(state, environment.homeDir);
      patch.vstStates[key] = scrubbed.state;
      if (scrubbed.hasLocalPath) {
        warnings.add(`O patch "${patch.name}" guarda um caminho deste computador no estado de um instrumento.`);
      }
    }
  }
  eachInsertList(file, (inserts) => inserts.forEach((insert) => register(insert, 'effect')));

  const snapshot = replaceReferences(file, references) as PreseterConcertFile;
  const concert: LibraryConcert = {
    id: 'concert',
    name: file.concert.name,
    tempo: file.concert.tempo,
    sets: [],
    snapshot,
  };
  const library: LibraryFile = {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    id: libraryId(file.concert.name),
    name: file.concert.name,
    description: `Exportada do concert "${file.concert.name}".`,
    pluginRefs,
    concerts: [concert],
  };

  // Garante que o arquivo gravado é aceito pelo botão Gerar Biblioteca.
  parseLibraryFile(JSON.stringify(library));
  return { library, patches: file.patches.length, warnings: [...warnings] };
}

function findPlugin (ref: LibraryPluginRef, plugins: LibraryPlugin[]): LibraryPlugin | undefined {
  const sameName = (plugin: LibraryPlugin) => plugin.name.toLowerCase() === ref.name.toLowerCase();
  return plugins.find((plugin) => sameName(plugin) && (!ref.format || plugin.format === ref.format))
    ?? plugins.find(sameName)
    ?? (ref.kind === 'effect' ? findEffectPlugin(plugins, ref.name) : undefined);
}

const tokenKey = (value: string): string | undefined => {
  for (const token of [PLUGIN_PATH_TOKEN, PLUGIN_ID_TOKEN]) {
    if (value.startsWith(token)) return value.slice(token.length);
  }
  return undefined;
};

/** Monta o concert exportado usando os plugins e as pastas deste computador. */
export function resolveConcertSnapshot (
  library: LibraryFile,
  concert: LibraryConcert,
  environment: { plugins: LibraryPlugin[]; soundsFolder: string }
): BuildCollectionResult {
  const refs = library.pluginRefs ?? {};
  const found = new Map<string, LibraryPlugin>();
  for (const [key, ref] of Object.entries(refs)) {
    const plugin = findPlugin(ref, environment.plugins);
    if (plugin) found.set(key, plugin);
  }

  const missing = new Set<string>();
  const skipped: string[] = [];
  const available = (value: string): boolean => {
    const key = tokenKey(value);
    if (key === undefined || found.has(key)) return true;
    missing.add(refs[key]?.name ?? key);
    return false;
  };
  const sampleProblem = (layer: PresetPluginAssignment): string | null => {
    const isDrums = layer.pluginId === 'preseter.drums';
    const relative = layer.samplePath || (isDrums ? SAMPLE_LIBRARY_FILES.musescore.path : '');
    if (!relative || existsSync(path.join(environment.soundsFolder, relative))) return null;
    const label = Object.values(SAMPLE_LIBRARY_FILES).find((item) => item.path === relative)?.name
      ?? path.basename(relative);
    missing.add(label);
    return `${label} não encontrado`;
  };

  const file = parseConcertFile(JSON.stringify(concert.snapshot));
  const removed = new Set<string>();
  file.patches = file.patches.filter((patch) => {
    for (const layer of patch.plugins ?? []) {
      if (layer.externalMidi) continue;
      const problem = available(layer.path) ? sampleProblem(layer) : `${refs[tokenKey(layer.path) ?? '']?.name ?? layer.name} não encontrado`;
      if (problem) {
        skipped.push(`${patch.name}: ${problem}`);
        removed.add(patch.id);
        return false;
      }
    }
    return true;
  });
  file.mappings = file.mappings.filter((mapping) => !mapping.patchId || !removed.has(mapping.patchId));
  // Efeito ausente não impede o patch: ele toca sem aquele efeito.
  eachInsertList(file, (inserts) => {
    const kept = inserts.filter((insert) => available(insert.path));
    inserts.splice(0, inserts.length, ...kept);
  });

  const text = JSON.stringify(file).replace(
    /preseter-plugin(-id)?:([A-Za-z0-9]+)/g,
    (match, isId: string | undefined, key: string) => {
      const plugin = found.get(key);
      if (!plugin) return match;
      return JSON.stringify(isId ? plugin.id : plugin.path ?? plugin.id).slice(1, -1);
    }
  );
  return { file: parseConcertFile(text), skipped, missing: [...missing] };
}

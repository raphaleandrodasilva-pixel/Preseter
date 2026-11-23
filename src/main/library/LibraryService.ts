import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import * as path from 'path';
import { SAMPLE_LIBRARY_FILES } from '../../shared/collection-presets';
import {
  LIBRARY_FILE_NAME,
  LIBRARY_MAX_BYTES,
  concertToCollectionSets,
  countLibraryPatches,
  parseLibraryFile,
  safeFileName,
  type LibraryConcertStatus,
  type LibraryFile,
  type LibraryGenerateResult,
  type LibraryGeneratedConcert,
  type LibraryInspection,
  type LibrarySource,
  type LibrarySummary,
} from '../../shared/library/format';
import { serializeConcertFile } from '../concert/ConcertFile';
import { buildCollectionConcert, type BuildCollectionResult, type CollectionPlugin } from '../collection/generateCollection';

export interface LibraryEnvironment {
  plugins: CollectionPlugin[];
  soundsFolder: string;
}

export function readLibraryFile (filePath: string): LibraryFile {
  const { size } = statSync(filePath);
  if (size > LIBRARY_MAX_BYTES) throw new Error('A biblioteca é grande demais.');
  return parseLibraryFile(readFileSync(filePath, 'utf8'));
}

/** Bibliotecas instaladas: cada subpasta com um `biblioteca.json`. */
export function listLibraries (root: string): Array<LibrarySummary & { filePath: string }> {
  if (!existsSync(root)) return [];
  const result: Array<LibrarySummary & { filePath: string }> = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(root, entry.name, LIBRARY_FILE_NAME);
    if (!existsSync(filePath)) continue;
    try {
      const library = readLibraryFile(filePath);
      result.push({
        id: library.id,
        name: library.name,
        description: library.description,
        concerts: library.concerts.length,
        patches: countLibraryPatches(library),
        filePath,
      });
    } catch (error) {
      result.push({
        id: entry.name,
        name: entry.name,
        concerts: 0,
        patches: 0,
        filePath,
        error: error instanceof Error ? error.message : 'Biblioteca inválida.',
      });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function buildConcert (
  library: LibraryFile,
  index: number,
  environment: LibraryEnvironment
): BuildCollectionResult {
  const concert = library.concerts[index];
  return buildCollectionConcert(environment.plugins, {
    tempo: concert.tempo ?? 100,
    name: concert.name,
    soundsFolder: environment.soundsFolder,
    sets: concertToCollectionSets(concert),
    sampleLibraries: library.sampleLibraries,
  });
}

/** O Preseter Drums lê o kit do MuseScore, mesmo sem camada de sampler no patch. */
function drumKitMissing (library: LibraryFile, soundsFolder: string): string[] {
  const usesDrums = library.concerts.some((concert) => concert.sets.some((set) =>
    set.patches.some((patch) => patch.layers.some((layer) => layer.nativeInstrument === 'drums'))));
  if (!usesDrums) return [];
  const kit = SAMPLE_LIBRARY_FILES.musescore;
  return existsSync(path.join(soundsFolder, kit.path)) ? [] : [kit.name];
}

/** Mostra o que a biblioteca gera nesta máquina e o que está faltando. */
export function inspectLibrary (
  library: LibraryFile,
  source: LibrarySource,
  environment: LibraryEnvironment,
  findCatalogIds: (labels: string[]) => string[] = () => []
): LibraryInspection {
  const skipped: string[] = [];
  const missing = new Set<string>(drumKitMissing(library, environment.soundsFolder));
  const concerts: LibraryConcertStatus[] = library.concerts.map((concert, index) => {
    const built = buildConcert(library, index, environment);
    const patches = concert.sets.reduce((sum, set) => sum + set.patches.length, 0);
    skipped.push(...built.skipped.map((item) => `${concert.name} · ${item}`));
    built.missing.forEach((item) => missing.add(item));
    return {
      id: concert.id,
      name: concert.name,
      sets: concert.sets.length,
      patches,
      ready: built.file.patches.length,
    };
  });
  const missingList = [...missing];
  return {
    source,
    id: library.id,
    name: library.name,
    description: library.description,
    concerts,
    total: concerts.reduce((sum, concert) => sum + concert.patches, 0),
    ready: concerts.reduce((sum, concert) => sum + concert.ready, 0),
    skipped,
    missing: missingList,
    missingIds: findCatalogIds(missingList),
  };
}

/** Caminho livre: nunca sobrescreve um concert existente. */
export function uniqueConcertPath (folder: string, baseName: string): string {
  let candidate = path.join(folder, `${baseName}.pst`);
  for (let copy = 2; existsSync(candidate); copy += 1) {
    candidate = path.join(folder, `${baseName} (${copy}).pst`);
  }
  return candidate;
}

/** Grava um `.pst` por concert, numa subpasta com o nome da biblioteca. */
export function generateLibrary (
  library: LibraryFile,
  environment: LibraryEnvironment,
  targetFolder: string
): LibraryGenerateResult {
  // Monta tudo antes de gravar: um erro não deixa a geração pela metade.
  const built = library.concerts.map((_, index) => buildConcert(library, index, environment));
  const folder = path.join(targetFolder, safeFileName(library.name));
  mkdirSync(folder, { recursive: true });

  const concerts: LibraryGeneratedConcert[] = [];
  const skipped: string[] = [];
  const missing = new Set<string>(drumKitMissing(library, environment.soundsFolder));

  library.concerts.forEach((concert, index) => {
    const { file, skipped: concertSkipped, missing: concertMissing } = built[index];
    skipped.push(...concertSkipped.map((item) => `${concert.name} · ${item}`));
    concertMissing.forEach((item) => missing.add(item));
    if (file.patches.length === 0) return;

    const target = uniqueConcertPath(folder, safeFileName(concert.name));
    const temporary = `${target}.tmp`;
    try {
      writeFileSync(temporary, serializeConcertFile(file), 'utf8');
      renameSync(temporary, target);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
    concerts.push({
      id: concert.id,
      name: concert.name,
      path: target,
      sets: file.sets.length,
      patches: file.patches.length,
    });
  });

  return {
    folder,
    concerts,
    patches: concerts.reduce((sum, concert) => sum + concert.patches, 0),
    skipped,
    missing: [...missing],
  };
}

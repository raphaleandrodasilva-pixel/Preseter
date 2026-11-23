import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import type { WorkstationBankResult, WorkstationGenerateResult } from '../../shared/collection';
import {
  WORKSTATION_BANKS,
  workstationBankSets,
  type WorkstationBank,
} from '../../shared/collections/workstation/recipes';
import { serializeConcertFile } from '../concert/ConcertFile';
import { buildCollectionConcert, type BuildCollectionResult, type CollectionPlugin } from './generateCollection';

export const WORKSTATION_FOLDER = 'Preseter Workstation';

/** Monta o concert de um banco. A Factory 40 não é usada nem alterada aqui. */
export function buildWorkstationConcert (
  bank: WorkstationBank,
  plugins: CollectionPlugin[],
  options: { soundsFolder?: string; tempo?: number } = {}
): BuildCollectionResult {
  return buildCollectionConcert(plugins, {
    tempo: options.tempo ?? 100,
    name: `Preseter Workstation ${bank}`,
    soundsFolder: options.soundsFolder,
    sets: workstationBankSets(bank),
  });
}

/** Caminho livre: nunca sobrescreve um concert que o usuário já tenha editado. */
export function uniqueConcertPath (folder: string, baseName: string): string {
  let candidate = path.join(folder, `${baseName}.pst`);
  for (let copy = 2; existsSync(candidate); copy += 1) {
    candidate = path.join(folder, `${baseName} (${copy}).pst`);
  }
  return candidate;
}

/** Grava um concert por banco; banco sem nenhum patch disponível não gera arquivo. */
export function writeWorkstationConcerts (
  parentFolder: string,
  plugins: CollectionPlugin[],
  options: { soundsFolder?: string } = {}
): WorkstationGenerateResult {
  const folder = path.join(parentFolder, WORKSTATION_FOLDER);
  mkdirSync(folder, { recursive: true });

  const banks: WorkstationBankResult[] = [];
  const skipped: string[] = [];
  const missing = new Set<string>();

  for (const bank of WORKSTATION_BANKS) {
    const built = buildWorkstationConcert(bank, plugins, options);
    skipped.push(...built.skipped.map((item) => `${bank} ${item}`));
    built.missing.forEach((item) => missing.add(item));

    let filePath: string | null = null;
    if (built.file.patches.length > 0) {
      filePath = uniqueConcertPath(folder, `Preseter-Workstation-${bank}`);
      writeFileSync(filePath, serializeConcertFile(built.file), 'utf8');
    }
    banks.push({
      bank,
      path: filePath,
      sets: built.file.sets.length,
      patches: built.file.patches.length,
      skipped: built.skipped.length,
    });
  }

  return {
    folder,
    banks,
    patches: banks.reduce((sum, item) => sum + item.patches, 0),
    skipped,
    missing: [...missing],
  };
}

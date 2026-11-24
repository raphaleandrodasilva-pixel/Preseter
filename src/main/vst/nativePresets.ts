import * as fs from 'fs';
import * as path from 'path';
import type { VstPreset } from '../../shared/types';
import { NATIVE_PROGRAM_PLUGINS, staticNativePrograms } from '../../shared/native-presets';
import { PRESETER_SOUNDS } from '../../shared/preseter-sounds';
import { PRESETER_SOUNDS_COLLECTION, categorizePreset } from '../../shared/vst-presets';

/** Programa do Zyn como o `ZynFactory::scanPrograms` monta a lista. */
export interface ZynProgram {
  index: number;
  /** "Fábrica/<pasta> · <arquivo>" ou "Meus presets/<pasta> · <arquivo>". */
  display: string;
  /** Pasta relativa à raiz do banco ('' na raiz). */
  folder: string;
  stem: string;
  user: boolean;
}

const FACTORY_LABEL = 'Fábrica';
const USER_LABEL = 'Meus presets';

function listXiz (root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xiz')) found.push(full);
    }
  };
  if (root && fs.existsSync(root)) walk(root);
  return found;
}

/**
 * Mesma ordem do motor: rótulo "<banco> · <arquivo>" em comparação natural sem
 * diferenciar maiúsculas; empate pelo caminho.
 */
export function scanZynPrograms (factoryDir: string, userDir = ''): ZynProgram[] {
  const entries: Array<Omit<ZynProgram, 'index'> & { file: string }> = [];
  for (const [root, label, user] of [[factoryDir, FACTORY_LABEL, false], [userDir, USER_LABEL, true]] as const) {
    for (const file of listXiz(root)) {
      const folder = path.relative(root, path.dirname(file)).split(path.sep).join('/');
      const bank = folder && folder !== '.' ? `${label}/${folder}` : label;
      const stem = path.basename(file, path.extname(file));
      entries.push({ file, display: `${bank} · ${stem}`, folder: folder === '.' ? '' : folder, stem, user });
    }
  }
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  entries.sort((a, b) => collator.compare(a.display, b.display) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const seen = new Set<string>();
  return entries
    .filter((entry) => !seen.has(entry.file) && seen.add(entry.file))
    .map(({ file: _file, ...entry }, index) => ({ ...entry, index }));
}

/** "0013-supersaw_wihout_release" → "Supersaw Wihout Release". */
export function zynPresetName (stem: string): string {
  const text = stem.replace(/^\d+\s*-\s*/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return stem;
  return text === text.toLowerCase()
    ? text.replace(/(^|\s)([a-z])/g, (_m, space: string, letter: string) => `${space}${letter.toUpperCase()}`)
    : text;
}

/** "the_mysterious_bank_3" → "Mysterious Bank 3". */
export function zynCollectionName (folder: string, user: boolean): string {
  if (user) return folder ? `Zyn · Meus presets · ${folder}` : 'Zyn · Meus presets';
  const mysterious = /^the_mysterious_bank(?:_(\d+))?$/i.exec(folder);
  if (mysterious) return `Zyn · Mysterious Bank ${mysterious[1] ?? '1'}`;
  return `Zyn · ${folder.replace(/[_]+/g, ' ').replace(/\//g, ' / ') || 'Fábrica'}`;
}

/** Categoria padrão das pastas do banco de fábrica, quando o nome não diz. */
const ZYN_FOLDER_CATEGORY: Record<string, string> = {
  Arpeggios: 'Arp',
  Bass: 'Synth Bass',
  Brass: 'Brass',
  'Choir and Voice': 'Choir',
  Drums: 'Drums',
  Fantasy: 'Synth Pad',
  Guitar: 'Guitar',
  Noises: 'FX',
  Organ: 'Organ',
  Pads: 'Synth Pad',
  Plucked: 'Plucked',
  'Reed and Wind': 'Woodwinds',
  Rhodes: 'E-Piano',
  Strings: 'Strings',
  Synth: 'Synth Lead',
  SynthPiano: 'E-Piano',
};

export function zynCategory (program: Pick<ZynProgram, 'folder' | 'stem'>): string {
  const top = program.folder.split('/')[0];
  const category = categorizePreset(`${zynPresetName(program.stem)}`, ZYN_FOLDER_CATEGORY[top] ?? 'Outros');
  // O Zyn é sintetizador: "Bass 1" é baixo sintetizado.
  return category === 'Bass' && top !== 'Guitar' ? 'Synth Bass' : category;
}

/** Display do motor a partir da forma curta usada nos Preseter Sounds. */
const zynDisplay = (program: string) => `${FACTORY_LABEL}/${program}`;

const NOW = 0;

/**
 * Presets dos instrumentos nativos (Zyn, Dexed, JX10, DX10, Piano, órgão,
 * Tines e Wurly) e os Preseter Sounds. O Synth2 continua pelos arquivos .sy1.
 */
export function buildNativePresets (zynFactoryDir: string, zynUserDir = ''): VstPreset[] {
  const presets: VstPreset[] = [];
  const zyn = scanZynPrograms(zynFactoryDir, zynUserDir);
  const zynPlugin = NATIVE_PROGRAM_PLUGINS.zyn;

  for (const program of zyn) {
    presets.push({
      id: `native:zyn:${program.display}`,
      name: zynPresetName(program.stem),
      category: zynCategory(program),
      source: 'native',
      pluginId: zynPlugin.id,
      pluginName: zynPlugin.name,
      pluginPath: zynPlugin.id,
      programIndex: program.index,
      programName: program.display,
      collection: zynCollectionName(program.folder, program.user),
      favorite: false,
      readOnly: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  const statics = staticNativePrograms();
  for (const program of statics) {
    const plugin = NATIVE_PROGRAM_PLUGINS[program.instrument];
    presets.push({
      id: `native:${program.instrument}:${program.index}`,
      name: program.name,
      category: program.category,
      source: 'native',
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginPath: plugin.id,
      programIndex: program.index,
      programName: program.programName,
      collection: program.collection,
      favorite: false,
      readOnly: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  const zynByDisplay = new Map(zyn.map((program) => [program.display, program]));
  for (const sound of PRESETER_SOUNDS) {
    const plugin = NATIVE_PROGRAM_PLUGINS[sound.instrument];
    let programIndex: number;
    let programName: string;
    if (sound.instrument === 'zyn') {
      const program = zynByDisplay.get(zynDisplay(String(sound.program)));
      // Banco sem o preset (instalação parcial): o som não aparece.
      if (!program) continue;
      programIndex = program.index;
      programName = program.display;
    } else {
      const program = statics.find((item) => item.instrument === sound.instrument && item.index === sound.program);
      if (!program) continue;
      programIndex = program.index;
      programName = program.programName;
    }
    presets.push({
      id: `sound:${sound.name}`,
      name: sound.name,
      category: sound.category,
      source: 'sound',
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginPath: plugin.id,
      programIndex,
      programName,
      effects: sound.effects,
      sends: {
        ...(sound.reverb !== undefined ? { reverb: sound.reverb } : {}),
        ...(sound.delay !== undefined ? { delay: sound.delay } : {}),
      },
      collection: PRESETER_SOUNDS_COLLECTION,
      favorite: false,
      readOnly: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  return presets;
}

/**
 * Índice certo do programa no layer carregado: procura o nome na lista que o
 * motor devolveu; sem a lista (ou sem o nome), fica o índice guardado.
 */
export function resolveNativeProgram (
  preset: Pick<VstPreset, 'programIndex' | 'programName'>,
  loadedProgramNames: string[] | undefined
): number | undefined {
  if (preset.programName && loadedProgramNames?.length) {
    const exact = loadedProgramNames.indexOf(preset.programName);
    if (exact >= 0) return exact;
  }
  return preset.programIndex;
}

#!/usr/bin/env node
/**
 * Gera store/store-catalog.json a partir de src/shared/collection-catalog.json.
 *
 * O catálogo da coleção continua sendo a fonte dos links oficiais. Este script
 * acrescenta os metadados da Loja (categoria, autor, licença, versão, tags) e
 * transforma os ajustes por plataforma em variantes por SO/arquitetura/formato.
 *
 * Uso: node scripts/generate-store-catalog.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const collection = JSON.parse(
  readFileSync(join(root, 'src', 'shared', 'collection-catalog.json'), 'utf8')
);

const extrasPath = join(root, 'store', 'store-extras.json');
const extras = JSON.parse(readFileSync(extrasPath, 'utf8'));

const META = {
  'surge-xt': {
    category: 'Sintetizadores',
    author: 'Surge Synth Team',
    version: '1.3.4',
    page: 'https://surge-synthesizer.github.io/',
    tags: ['híbrido', 'pads', 'leads', 'subtractive'],
  },
  dexed: {
    category: 'Sintetizadores',
    author: 'asb2m10',
    version: '1.1.0',
    page: 'https://asb2m10.github.io/dexed/',
    tags: ['FM', 'DX7', 'pianos elétricos', 'sinos'],
  },
  sfizz: {
    category: 'Samples',
    author: 'SFZTools',
    version: '1.2.3',
    page: 'https://sfz.tools/sfizz/',
    tags: ['SFZ', 'sampler', 'orquestra'],
  },
  helm: {
    category: 'Sintetizadores',
    author: 'Matt Tytel',
    version: '0.9.0',
    page: 'https://tytel.org/helm/',
    tags: ['semi-modular', 'pads', 'cordas'],
  },
  odin2: {
    category: 'Sintetizadores',
    author: 'TheWaveWarden',
    version: '2.4.1',
    page: 'https://github.com/TheWaveWarden/odin2',
    tags: ['analógico virtual', 'pads', 'leads'],
  },
  'musescore-general': {
    category: 'Gerais (GM)',
    author: 'MuseScore',
    version: 'atual',
    page: 'https://musescore.org/',
    tags: ['GM', 'SoundFont', 'piano', 'órgão', 'coral'],
    arch: ['x64', 'arm64'],
  },
  sonatina: {
    category: 'Orquestra',
    author: 'Sonatina Symphonic Orchestra',
    version: '1.0',
    page: 'http://www.sonatina.org/',
    tags: ['orquestra', 'cordas', 'metais', 'flauta', 'coral'],
    arch: ['x64', 'arm64'],
  },
  salamander: {
    category: 'Pianos',
    author: 'Alexander Holm',
    version: 'V3',
    page: 'https://github.com/sfzinstruments/SalamanderGrandPiano',
    tags: ['piano de cauda', 'SFZ', 'acústico'],
    arch: ['x64', 'arm64'],
  },
  mda: {
    category: 'Teclas elétricas',
    author: 'MDA / elk-audio',
    version: 'atual',
    page: 'https://github.com/elk-audio/mda-vst3',
    tags: ['ePiano', 'JX10', 'clássicos'],
  },
  setbfree: {
    category: 'Órgãos',
    author: 'setBfree',
    version: 'atual',
    page: 'https://setbfree.org/',
    tags: ['tonewheel', 'órgão', 'LV2', 'Linux'],
  },
  tetraop: {
    category: 'Sintetizadores',
    author: 'Tiago Lr',
    version: '1.0.3',
    page: 'https://github.com/tiagolr/tetraop',
    tags: ['FM', 'wavetable', 'baixos', 'sinos'],
  },
  charlatan3: {
    category: 'Sintetizadores',
    author: 'BlauKraut Engineering',
    version: '3.3.2',
    page: 'https://www.blaukraut.info/',
    tags: ['analógico virtual', 'freeware', 'pads', 'leads'],
  },
  sforzando: {
    category: 'Utilidades',
    author: 'Plogue',
    version: '1.982',
    page: 'https://www.plogue.com/products/sforzando.html',
    tags: ['SFZ', 'SF2', 'sampler', 'player'],
  },
  fsvr: {
    category: 'Sintetizadores',
    author: 'musica.studio',
    version: '0.8.4',
    page: 'https://github.com/musicastudio/FSVR',
    tags: ['FM', 'formant', 'FS1R', 'vocal'],
  },
};

const OS_ORDER = ['windows', 'linux', 'mac'];

function isGitHub(url) {
  return typeof url === 'string' && /(^https?:\/\/)?(www\.)?github\.com\//i.test(url);
}

function detectFormat(variant) {
  const patterns = [
    ...(variant.vst3Patterns ?? []),
    ...(variant.soundfontPatterns ?? []),
  ];
  for (const pattern of patterns) {
    const lower = pattern.toLowerCase();
    if (lower.includes('.lv2')) return 'LV2';
    if (lower.includes('.vst3')) return 'VST3';
    if (lower.includes('.vst2') || lower.endsWith('.dll')) return 'VST2';
    if (lower.includes('.clap')) return 'CLAP';
    if (lower.includes('.sfz')) return 'SFZ';
    if (lower.includes('.sf2')) return 'SF2';
  }
  if (variant.kind === 'soundfont' || variant.kind === 'soundfont-zip') return 'SF2';
  return 'Instalador';
}

function detectLicenseKind(license) {
  if (/GPL|MIT|BSD|Apache|LGPL|MPL/i.test(license)) return 'open-source';
  if (/Sampling Plus|NonCommercial|NC/i.test(license)) return 'restricted';
  if (/Freeware/i.test(license)) return 'freeware';
  return 'free';
}

function assetPattern(fileName) {
  if (!fileName) return undefined;
  // Troca só os números de versão por curinga; mantém o resto do nome estável.
  return fileName.replace(/\d+(?:[._-]\d+)*/g, '*');
}

function githubRepository(url) {
  const match = /github\.com\/([^/]+)\/([^/?#]+)/i.exec(url ?? '');
  return match ? `${match[1]}/${match[2]}` : undefined;
}

function buildVariant(item, spec, os, fallbackPage) {
  const merged = { ...item, ...(spec ?? {}) };
  const format = detectFormat(merged);
  const url = merged.url ?? undefined;
  const page = merged.page ?? fallbackPage;
  const variant = {
    os,
    arch: os === 'linux' || os === 'windows' ? ['x64'] : ['x64', 'arm64'],
    format,
    kind: merged.kind,
    ...(url ? { url } : {}),
    ...(merged.fileName ? { fileName: merged.fileName } : {}),
    ...(page ? { page } : {}),
    approxBytes: Math.max(0, merged.approxBytes ?? 0),
    ...(merged.destSubfolder ? { destSubfolder: merged.destSubfolder } : {}),
    ...(merged.vst3Patterns ? { vst3Patterns: merged.vst3Patterns } : {}),
    ...(merged.soundfontPatterns ? { soundfontPatterns: merged.soundfontPatterns } : {}),
    ...(merged.dataFolders ? { dataFolders: merged.dataFolders } : {}),
    ...(merged.vst3Bundle ? { vst3Bundle: merged.vst3Bundle } : {}),
    ...(merged.notes ? { notes: merged.notes } : {}),
  };
  if (url && isGitHub(url) && url.includes('/releases/download/')) {
    variant.resolve = 'github-latest';
    const pattern = assetPattern(merged.fileName);
    if (pattern) variant.assetPattern = pattern;
    const repo = githubRepository(url);
    if (repo) variant.repository = repo;
  } else if (url) {
    variant.resolve = 'head';
  }
  if (merged.version) variant.version = merged.version;
  return variant;
}

function buildVariants(item, meta) {
  const variants = [];
  const platforms = item.platforms ?? {};

  if (item.group === 'library' || !item.platforms) {
    const osList = item.platforms ? OS_ORDER.filter((os) => platforms[os]) : ['windows', 'linux', 'mac'];
    for (const os of osList) {
      const variant = buildVariant(item, platforms[os], os, meta.page);
      variant.arch = meta.arch ?? variant.arch;
      variants.push(variant);
    }
    return variants;
  }

  if (platforms.win32) {
    variants.push(buildVariant(item, platforms.win32, 'windows', meta.page));
  } else if (!platforms.linux && !platforms.darwin) {
    variants.push(buildVariant(item, undefined, 'windows', meta.page));
  } else if (item.url && item.kind !== 'manual') {
    // O topo do catálogo é o padrão Windows quando não há ajuste win32.
    variants.push(buildVariant(item, undefined, 'windows', meta.page));
  }

  if (platforms.linux) variants.push(buildVariant(item, platforms.linux, 'linux', meta.page));
  if (platforms.darwin) variants.push(buildVariant(item, platforms.darwin, 'mac', meta.page));
  return variants;
}

const collectionItems = collection.items.map((item) => {
  const meta = META[item.id] ?? {
    category: item.group === 'library' ? 'Samples' : 'Outros',
    author: 'Autor não informado',
    version: 'atual',
    tags: [],
  };
  const variants = buildVariants(item, meta);
  const primary = variants[0];
  const sources = [item.url, item.page, ...variants.map((variant) => variant.url ?? variant.page)]
    .filter(Boolean);
  const source = sources.some((url) => isGitHub(url)) ? 'github' : 'official';
  const tier = item.kind === 'manual' ? 'indexed' : 'verified';
  const type = item.group === 'library' ? 'library' : 'plugin';

  return {
    id: item.id,
    type,
    name: item.name,
    category: meta.category,
    author: meta.author,
    description: item.description,
    version: meta.version,
    tier,
    source,
    license: item.license,
    licenseKind: detectLicenseKind(item.license),
    ...(item.licenseUrl ? { licenseUrl: item.licenseUrl } : {}),
    ...((item.page ?? meta.page) ? { page: item.page ?? meta.page } : {}),
    tags: meta.tags ?? [],
    essential: true,
    defaultSelected: item.defaultSelected === true,
    thumbnail: { kind: 'generated' },
    ...(item.notes ? { notes: item.notes } : {}),
    ...(primary ? { format: primary.format, approxBytes: primary.approxBytes } : {}),
    variants: variants.sort(
      (a, b) => OS_ORDER.indexOf(a.os) - OS_ORDER.indexOf(b.os)
    ),
  };
});

function normalizeExtra(item) {
  const variants = [];
  for (const variant of item.variants ?? []) {
    const osList = variant.os === 'all' ? OS_ORDER : [variant.os];
    for (const os of osList) {
      variants.push({
        ...variant,
        os,
        arch: variant.arch ?? ['x64', 'arm64'],
        format: variant.format ?? item.format ?? 'SF2',
        approxBytes: Math.max(0, variant.approxBytes ?? item.approxBytes ?? 0),
        ...(variant.url && !variant.resolve ? { resolve: 'head' } : {}),
      });
    }
  }
  return {
    ...item,
    essential: item.essential === true,
    defaultSelected: item.defaultSelected === true,
    thumbnail: item.thumbnail ?? { kind: 'generated' },
    format: item.format ?? variants[0]?.format ?? 'SF2',
    approxBytes: item.approxBytes ?? variants[0]?.approxBytes ?? 0,
    variants,
  };
}

const extraItems = (extras.items ?? []).map(normalizeExtra);
const items = [...collectionItems, ...extraItems];
const seen = new Set();
for (const item of items) {
  if (seen.has(item.id)) throw new Error(`ID duplicado no catálogo da Loja: ${item.id}`);
  seen.add(item.id);
}

const catalog = {
  version: 1,
  updatedAt: new Date().toISOString(),
  source: 'https://github.com/raphaleandrodasilva-pixel/Preseter',
  items,
};

const output = join(root, 'store', 'store-catalog.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`store-catalog.json: ${items.length} itens, ${items.reduce((sum, item) => sum + item.variants.length, 0)} variantes`);

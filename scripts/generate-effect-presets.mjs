#!/usr/bin/env node
/**
 * Gera os presets de `catalog.json` e `guitarix.json` a partir da fonte em
 * valores reais (`src/shared/effects/presets-src/<efeito>.json`).
 *
 * Uso:
 *   node scripts/generate-effect-presets.mjs          # grava
 *   node scripts/generate-effect-presets.mjs --check  # falha se precisar gerar
 *
 * O normalizado é sempre linear (`(real - min) / (max - min)`), como o plugin
 * faz: `scale: "log"` no catálogo só desenha a curva do knob. Parâmetros com
 * `choices` (LV2) exigem valor inteiro.
 *
 * O script substitui apenas o bloco `presets` de cada efeito, preservando o
 * restante do arquivo (inclusive o estilo compacto do `guitarix.json`).
 *
 * Não edite `catalog.json`/`guitarix.json` à mão: mude a fonte e rode este script.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src/shared/effects');
const sourceDir = path.join(root, 'presets-src');
const checkOnly = process.argv.includes('--check');

const CATALOG_FILES = ['catalog.json', 'guitarix.json'];

/** Acha o `[` inicial e o `]` final de um array, respeitando strings. */
function findArray (text, fromIndex) {
  const start = text.indexOf('[', fromIndex);
  if (start < 0) throw new Error('array não encontrado');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error('array sem fechamento');
}

const catalogs = CATALOG_FILES.map((file) => {
  const full = path.join(root, file);
  const text = fs.readFileSync(full, 'utf8');
  const data = JSON.parse(text);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const presetsIndex = text.indexOf('"presets": [');
  const sample = presetsIndex >= 0 ? text.slice(presetsIndex, presetsIndex + 4000) : '';
  return {
    file,
    full,
    text,
    eol,
    data,
    effects: new Map(data.effects.map((effect) => [effect.id, effect])),
    /** Estilo do arquivo: presets expandidos ou uma linha por preset. */
    expanded: /"values": \{\r?\n/.test(sample),
    /** Casas decimais do normalizado gravado (catalog = completo, LV2 = 6). */
    decimals: file === 'guitarix.json' ? 6 : null,
  };
});

const isEnum = (param) => Array.isArray(param.choices) && param.choices.length > 0;

const fail = (message) => {
  console.error(`ERRO: ${message}`);
  process.exit(1);
};

const resolveParam = (effect, key) => {
  const lower = key.toLowerCase();
  return effect.params.find((param) => param.id === key)
    ?? effect.params.find((param) => param.name === key)
    ?? effect.params.find((param) => param.label === key)
    ?? effect.params.find((param) => param.name.toLowerCase() === lower)
    ?? effect.params.find((param) => param.label.toLowerCase() === lower);
};

const convert = (effect, preset, key, real) => {
  const param = resolveParam(effect, key);
  if (!param) {
    const names = effect.params.map((item) => item.label).join(', ');
    fail(`${effect.id}/${preset.id}: parâmetro "${key}" não existe. Disponíveis: ${names}`);
  }
  if (typeof real !== 'number' || !Number.isFinite(real)) {
    fail(`${effect.id}/${preset.id}/${key}: valor precisa ser número (recebido: ${JSON.stringify(real)})`);
  }
  if (real < param.min || real > param.max) {
    fail(
      `${effect.id}/${preset.id}/${key}: ${real} fora da faixa ${param.min}..${param.max}`
      + ` (${param.unit || 'sem unidade'})`
    );
  }
  if (isEnum(param) && !Number.isInteger(real)) {
    fail(`${effect.id}/${preset.id}/${key}: enumerado aceita só inteiro 0..${param.max}`);
  }
  const span = param.max - param.min;
  const normalized = span === 0 ? 0 : (real - param.min) / span;
  return { index: param.index, value: Math.max(0, Math.min(1, normalized)) };
};

const sources = new Map();
for (const name of fs.readdirSync(sourceDir).filter((entry) => entry.endsWith('.json')).sort()) {
  const full = path.join(sourceDir, name);
  const source = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!source.effect) fail(`${name}: falta o campo "effect"`);
  if (sources.has(source.effect)) fail(`${name}: efeito "${source.effect}" duplicado na fonte`);
  if (!Array.isArray(source.presets) || source.presets.length === 0) {
    fail(`${name}: "presets" precisa ser uma lista não vazia`);
  }
  sources.set(source.effect, { ...source, file: name });
}

const used = new Set();
const warnings = [];

for (const catalog of catalogs) {
  for (const source of sources.values()) {
    const effect = catalog.effects.get(source.effect);
    if (!effect) continue;
    used.add(source.effect);

    const seen = new Set();
    effect.presets = source.presets.map((preset) => {
      if (!preset.id) fail(`${source.file}: preset sem "id"`);
      if (!preset.label) fail(`${source.file}/${preset.id}: preset sem "label"`);
      if (seen.has(preset.id)) fail(`${source.file}: preset repetido "${preset.id}"`);
      seen.add(preset.id);

      const converted = Object.entries(preset.values ?? {}).map(([key, real]) => ({
        key,
        ...convert(effect, preset, key, real),
      }));
      converted.sort((a, b) => a.index - b.index);
      const values = {};
      for (const entry of converted) {
        const raw = entry.value;
        values[String(entry.index)] = catalog.decimals === null
          ? raw
          : Number(raw.toFixed(catalog.decimals));
      }
      return { id: preset.id, label: preset.label, values };
    });
  }
}

const unused = [...sources.keys()].filter((id) => !used.has(id));
if (unused.length > 0) warnings.push(`fonte sem efeito no catálogo: ${unused.join(', ')}`);
for (const warning of warnings) console.warn(`AVISO: ${warning}`);

const pad = (count) => ' '.repeat(count);

function renderExpanded (presets, baseIndent, eol) {
  const lines = ['['];
  presets.forEach((preset, index) => {
    const entries = Object.entries(preset.values);
    lines.push(`${pad(baseIndent + 1)}{`);
    lines.push(`${pad(baseIndent + 2)}"id": ${JSON.stringify(preset.id)},`);
    lines.push(`${pad(baseIndent + 2)}"label": ${JSON.stringify(preset.label)},`);
    lines.push(`${pad(baseIndent + 2)}"values": {`);
    entries.forEach(([key, value], entryIndex) => {
      const comma = entryIndex < entries.length - 1 ? ',' : '';
      lines.push(`${pad(baseIndent + 3)}${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
    });
    lines.push(`${pad(baseIndent + 2)}}`);
    lines.push(`${pad(baseIndent + 1)}}${index < presets.length - 1 ? ',' : ''}`);
  });
  lines.push(`${pad(baseIndent)}]`);
  return lines.join(eol);
}

function renderCompact (presets, baseIndent, eol) {
  const lines = ['['];
  presets.forEach((preset, index) => {
    const values = Object.entries(preset.values)
      .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      .join(', ');
    lines.push(
      `${pad(baseIndent + 2)}{ "id": ${JSON.stringify(preset.id)}, "label": ${JSON.stringify(preset.label)}, `
      + `"values": { ${values} } }${index < presets.length - 1 ? ',' : ''}`
    );
  });
  lines.push(`${pad(baseIndent)}]`);
  return lines.join(eol);
}

let dirty = false;
for (const catalog of catalogs) {
  let output = catalog.text;
  const edits = [];

  for (const source of sources.values()) {
    const effect = catalog.effects.get(source.effect);
    if (!effect) continue;

    const idToken = `"id": ${JSON.stringify(effect.id)}`;
    const idIndex = output.indexOf(idToken);
    if (idIndex < 0) fail(`${catalog.file}: efeito ${effect.id} não encontrado no texto`);
    const presetsIndex = output.indexOf('"presets"', idIndex);
    if (presetsIndex < 0) fail(`${catalog.file}: efeito ${effect.id} sem "presets"`);
    const range = findArray(output, presetsIndex);
    const lineStart = output.lastIndexOf('\n', presetsIndex) + 1;
    const baseIndent = presetsIndex - lineStart;

    const rendered = catalog.expanded
      ? renderExpanded(effect.presets, baseIndent, catalog.eol)
      : renderCompact(effect.presets, baseIndent, catalog.eol);
    edits.push({ start: range.start, end: range.end, text: rendered });
  }

  // Aplica de trás para frente para não invalidar os índices.
  edits.sort((a, b) => b.start - a.start);
  let applied = 0;
  for (const edit of edits) {
    if (output.slice(edit.start, edit.end) === edit.text) continue;
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    applied += 1;
  }

  if (output === catalog.text) continue;
  dirty = true;
  JSON.parse(output); // sanidade: precisa continuar válido
  if (checkOnly) {
    console.error(`DESATUALIZADO: ${catalog.file} precisa ser regenerado (${applied} efeito(s))`);
  } else {
    fs.writeFileSync(catalog.full, output, 'utf8');
    console.log(`gerado: ${catalog.file} (${applied} efeito(s))`);
  }
}

if (checkOnly && dirty) process.exit(1);
if (!checkOnly && !dirty) console.log('catálogo já está atualizado');

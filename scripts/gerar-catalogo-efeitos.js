/**
 * Gera `src/shared/effects/catalog.json` a partir dos bundles do calfnXT
 * (vendor/calfnxt/plugins). O bundle traz, no JS da UI, o schema real dos
 * parâmetros (id, unidade, min, max, escala, precisão) e os presets de fábrica
 * em unidades reais — é isso que o painel do Preseter usa para exibir valores
 * e aplicar presets.
 *
 * Rodar: node scripts/gerar-catalogo-efeitos.js
 *
 * Opcional: `FX_PROBE=<json>` aponta para um dump de `params` do engine
 * (por bundle) e mantém o nome exato que o VST reporta em `engineName`.
 * Sem ele, usa o nome do schema (o painel usa índices, então não muda nada).
 */
const fs = require('fs');
const path = require('path');

const BANK = require('./efeitos-presets');
const GROUPS = require('./efeitos-grupos');

const root = path.resolve(__dirname, '..');
const base = path.join(root, 'vendor', 'calfnxt', 'plugins');
const out = path.join(root, 'src', 'shared', 'effects', 'catalog.json');
const probeFile = process.env.FX_PROBE || '';

const IDENTITY = {
  Aligner: { name: 'Preseter Aligner', short: 'Aligner', category: 'Utilidade', native: true },
  Analyzer: { name: 'Preseter Analyzer', short: 'Analyzer', category: 'Análise', native: false },
  Bender: { name: 'Preseter Bender', short: 'Bender', category: 'Pitch', native: true },
  Chorus: { name: 'Preseter Chorus', short: 'Chorus', category: 'Modulação', native: true },
  Compressor: { name: 'Preseter Compressor', short: 'Compressor', category: 'Dinâmica', native: true },
  Crusher: { name: 'Preseter Crusher', short: 'Crusher', category: 'Distorção', native: true },
  Deesser: { name: 'Preseter De-esser', short: 'De-esser', category: 'Dinâmica', native: true },
  Delay: { name: 'Preseter Delay', short: 'Delay', category: 'Tempo', native: true },
  Denoiser: { name: 'Preseter Denoiser', short: 'Denoiser', category: 'Restauração', native: true },
  Elliptic: { name: 'Preseter Elliptic', short: 'Elliptic', category: 'Filtro', native: true },
  Equalizer: { name: 'Preseter EQ', short: 'EQ', category: 'Equalização', native: true },
  Expander: { name: 'Preseter Expander', short: 'Expander', category: 'Dinâmica', native: true },
  Filter: { name: 'Preseter Filter', short: 'Filter', category: 'Filtro', native: true },
  Flanger: { name: 'Preseter Flanger', short: 'Flanger', category: 'Modulação', native: true },
  Harmonics: { name: 'Preseter Harmonics', short: 'Harmonics', category: 'Distorção', native: true },
  Impulse: { name: 'Preseter Impulse', short: 'Impulse', category: 'Reverb', native: true },
  Limiter: { name: 'Preseter Limiter', short: 'Limiter', category: 'Dinâmica', native: true },
  Mbcomp: { name: 'Preseter MB Comp', short: 'MB Comp', category: 'Dinâmica', native: true },
  Mblimiter: { name: 'Preseter MB Limiter', short: 'MB Limiter', category: 'Dinâmica', native: true },
  Octaver: { name: 'Preseter Octaver', short: 'Octaver', category: 'Pitch', native: true },
  Phaser: { name: 'Preseter Phaser', short: 'Phaser', category: 'Modulação', native: true },
  Pulsator: { name: 'Preseter Pulsator', short: 'Pulsator', category: 'Modulação', native: true },
  Reverb: { name: 'Preseter Reverb', short: 'Reverb', category: 'Reverb', native: true },
  Ringmodulator: { name: 'Preseter Ring Mod', short: 'Ring Mod', category: 'Modulação', native: true },
  Split: { name: 'Preseter Split', short: 'Split', category: 'Utilidade', native: true },
  Stereo: { name: 'Preseter Stereo', short: 'Stereo', category: 'Imagem', native: true },
  Tamer: { name: 'Preseter Tamer', short: 'Tamer', category: 'Dinâmica', native: true },
  Transients: { name: 'Preseter Transients', short: 'Transients', category: 'Dinâmica', native: true },
  Tuner: { name: 'Preseter Tuner', short: 'Tuner', category: 'Utilidade', native: false },
};

// Unidades/nomes técnicos → rótulo curto em português.
const LABELS = {
  'In': 'Entrada', 'Out': 'Saída', 'Bypass': 'Bypass', 'Active': 'Ativo',
  'Sidechain': 'Sidechain', 'Threshold': 'Limite', 'Rel Thresh': 'Limite rel.',
  'Ratio': 'Taxa', 'Knee': 'Joelho', 'Attack': 'Ataque', 'Release': 'Liberação',
  'Makeup': 'Compensação', 'Mix': 'Mix', 'Mode': 'Modo', 'Link': 'Link',
  'Highpass': 'Passa-alta', 'Lowpass': 'Passa-baixa', 'HP Mode': 'Modo PA',
  'LP Mode': 'Modo PB', 'Listen': 'Escuta', 'Channel': 'Canal',
  'Detect': 'Detecção', 'Source': 'Fonte', 'Quality': 'Qualidade',
  'Amount': 'Quantidade', 'Dry': 'Seco', 'Wet': 'Molhado', 'Level': 'Nível',
  'Pan': 'Pan', 'Width': 'Largura', 'Feedback': 'Realimentação',
  'Sync': 'Sincronizar', 'Subdivide': 'Subdivisão', 'BPM': 'BPM', 'ms': 'Tempo',
  'Time L': 'Tempo L', 'Time R': 'Tempo R', 'Rate': 'Velocidade',
  'Depth': 'Profundidade', 'Phase': 'Fase', 'Voices': 'Vozes',
  'Mute': 'Mudo', 'Solo': 'Solo', 'Freeze': 'Congelar', 'Gate': 'Gate',
  'Duck': 'Ducking', 'Air': 'Ar', 'Diffusion': 'Difusão', 'Distance': 'Distância',
  'Room Size': 'Tamanho da sala', 'Decay': 'Decaimento', 'Predelay': 'Pré-delay',
  'Pre Diffuse': 'Pré-difusão', 'HF Damp': 'Amort. agudos', 'LF Damp': 'Amort. graves',
  'Mod Rate': 'Vel. modulação', 'Mod Depth': 'Prof. modulação',
  'ER Mode': 'Modo ER', 'ER Level': 'Nível ER', 'Late Level': 'Nível tardio',
  'Path': 'Caminho', 'Width Mode': 'Modo largura', 'Gate Thresh': 'Limite do gate',
  'Gate Hold': 'Hold do gate', 'Gate Release': 'Liberação do gate',
  'Lookahead': 'Lookahead', 'ASC': 'ASC', 'ASC Level': 'Nível ASC',
  'Oversampling': 'Oversampling', 'Auto Level': 'Nível automático', 'Curve': 'Curva',
  'Soft Ceiling': 'Teto suave', 'Color Enable': 'Cor', 'Color': 'Timbre',
  'True Peak': 'True peak', 'TP Margin': 'Margem TP', 'Diff Listen': 'Escuta diff',
  'Hold Enable': 'Hold', 'Release Hold': 'Sustentação', 'Emphasis Enable': 'Ênfase',
  'Emphasis': 'Ênfase', 'Limit': 'Limite', 'Bit Reduction': 'Redução de bits',
  'Logarithmic': 'Logarítmico', 'DC': 'DC', 'Anti-Aliasing': 'Anti-aliasing',
  'Detection': 'Detecção', 'Slope': 'Inclinação', 'Laxity': 'Laxidez',
  'Split': 'Divisão', 'HP Q': 'Q PA', 'Peak': 'Pico', 'Peak Gain': 'Ganho do pico',
  'Peak Q': 'Q do pico', 'Target': 'Alvo', 'Profile': 'Perfil', 'Blend': 'Mistura',
  'Floor': 'Piso', 'Low': 'Grave', 'High': 'Agudo', 'Low Slope': 'Incl. grave',
  'High Slope': 'Incl. agudo', 'Spectrum': 'Espectro', 'Mono': 'Mono',
  'Span': 'Faixa', 'Offset': 'Offset', 'Octave': 'Oitava', 'Profile Mode': 'Modo perfil',
  'Frequency': 'Frequência', 'Resonance': 'Ressonância', 'Inertia': 'Inércia',
  'Envelope': 'Envelope', 'Activation': 'Ativação', 'Soft Clip': 'Soft clip',
  'Mod Depth ': 'Prof. modulação', 'Center Freq': 'Freq. central',
  'Mod Depth': 'Prof. modulação', 'Stages': 'Estágios', 'Stereo Phase': 'Fase estéreo',
  'Reset': 'Resetar', 'LFO': 'LFO', 'Min Delay': 'Delay mínimo',
  'Mod Rate': 'Vel. modulação', 'Inter-Voice Phase': 'Fase entre vozes',
  'Overlap': 'Sobreposição', 'HP Freq': 'Freq. PA', 'LP Freq': 'Freq. PB',
  'Pulse Width': 'Largura do pulso', 'Modulation': 'Modulação',
  'Offset L': 'Offset L', 'Offset R': 'Offset R', 'Mono-in': 'Mono in',
  'Pitch': 'Pitch', 'Snap': 'Snap', 'Glide': 'Glide', 'Tone': 'Timbre',
  'Waveform': 'Forma de onda', 'Detune': 'Detune', 'Wave': 'Forma',
  'Drive': 'Drive', 'Blend ': 'Mistura', 'Pre HP': 'PA pré', 'Pre LP': 'PB pré',
  'Post HP': 'PA pós', 'Post LP': 'PB pós', 'Pre Listen': 'Escuta pré',
  'Post Listen': 'Escuta pós', 'Asymmetry': 'Assimetria',
  'Attack Time': 'Tempo de ataque', 'Attack Boost': 'Reforço de ataque',
  'Sustain Threshold': 'Limiar de sustain', 'Release Time': 'Tempo de liberação',
  'Release Boost': 'Reforço de liberação', 'View Mode': 'Visualização',
  'Stereo Link': 'Link estéreo', 'Sensitivity': 'Sensibilidade', 'Delta': 'Delta',
  'Weight': 'Peso', 'Bands': 'Bandas', 'Xover': 'Corte', 'Scale': 'Escala',
  'Search Low': 'Busca grave', 'Search High': 'Busca agudo', 'Depth': 'Profundidade',
  'Sharpness': 'Nitidez', 'Harmonics': 'Harmônicos', 'Retune': 'Retune',
  'Formant': 'Formante', 'Keep': 'Manter', 'Octave': 'Oitava',
  'Sub': 'Sub', 'Sub Level': 'Nível sub', 'Sub Bal': 'Balanço sub',
  'Sub Wave': 'Forma sub', 'Sub Tone': 'Timbre sub', 'Dry Level': 'Nível seco',
  'Dry Bal': 'Balanço seco', 'Dry Listen': 'Escuta seca', 'Dry': 'Seco',
  'Level L': 'Nível L', 'Level R': 'Nível R', 'M Level': 'Nível M',
  'M Pan': 'Pan M', 'S Level': 'Nível S', 'S Bal': 'Balanço S',
  'Decorr': 'Decorr', 'Spread': 'Abertura', 'Stereo Base': 'Base estéreo',
  'Balance Out': 'Balanço out', 'Volume L': 'Volume L', 'Volume R': 'Volume R',
  'Mute L': 'Mudo L', 'Mute R': 'Mudo R', 'Phase L': 'Fase L', 'Phase R': 'Fase R',
  'Anchor': 'Âncora', 'Master Trim': 'Ajuste mestre', 'Analysis HP': 'Análise PA',
  'Analysis LP': 'Análise PB', 'Analysis HP Mode': 'Modo PA', 'Analysis LP Mode': 'Modo PB',
  'Join': 'Juntar', 'Delay': 'Delay', 'Gain': 'Ganho', 'Filter Hit': 'Filtro hit',
  'Filter Waves': 'Ondas', 'Filter Corr': 'Correlação', 'B1 Mute': 'Mudo',
  'Waterfall': 'Cascata', 'Pause': 'Pausa', 'FFT Size': 'Tamanho FFT',
  'Standard': 'Padrão', 'A4': 'A4', 'Vibrato': 'Vibrato', 'Fade': 'Fade',
  'Quality ': 'Qualidade', 'Threshold ': 'Limite', 'Sensitivity ': 'Sensibilidade',
  'Harmonic': 'Harmônico', 'Depth ': 'Profundidade', 'Rate ': 'Velocidade',
  'Sync ': 'Sincronizar', 'Subdivide ': 'Subdivisão', 'Width ': 'Largura',
};

const UTILITY = new Set([
  'In', 'Out', 'Bypass', 'Active', 'Channel', 'Listen', 'Spectrum', 'Mono',
  'Mono-in', 'Scale', 'Diff Listen', 'Pre Listen', 'Post Listen', 'SC Listen',
  'Dry Listen', 'Profile Mode',
]);

function arrayEnd (src, start) {
  let depth = 0, inStr = null, esc = false;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '[') depth += 1;
    else if (ch === ']') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

function findJs (dir) {
  const assets = path.join(dir, 'Contents', 'Resources', 'assets');
  if (!fs.existsSync(assets)) return null;
  const file = fs.readdirSync(assets).find((f) => f.endsWith('.js'));
  return file ? path.join(assets, file) : null;
}

function extractParams (src) {
  const at = src.indexOf('parameters:[');
  if (at < 0) return [];
  const start = src.indexOf('[', at);
  const end = arrayEnd(src, start);
  return new Function('return ' + src.slice(start, end + 1))();
}

/** Fim de um objeto `{...}` a partir do `{` (respeitando strings). */
function objectEnd (src, start) {
  let depth = 0, inStr = null, esc = false;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Alguns bundles guardam os valores dos presets em constantes
 * (`values: pA`). Troca pela definição (`pA={...}`) antes de avaliar.
 */
function resolveValueRefs (src, text) {
  return text.replace(/values:\s*([A-Za-z_$][\w$]*)/g, (whole, name) => {
    const at = src.indexOf(name + '=');
    if (at < 0) return whole;
    const start = src.indexOf('{', at);
    if (start < 0) return whole;
    const end = objectEnd(src, start);
    if (end < 0) return whole;
    return 'values:' + src.slice(start, end + 1);
  });
}

function extractPresets (src, from, paramIds) {
  const re = /=\s*\[/g;
  re.lastIndex = from;
  for (let guard = 0; guard < 40; guard += 1) {
    const match = re.exec(src);
    if (!match) break;
    const start = src.indexOf('[', match.index);
    const end = arrayEnd(src, start);
    if (end < 0) break;
    const raw = src.slice(start, end + 1);
    if (raw.includes('values:') && raw.includes('label:')) {
      try {
        const arr = new Function('return ' + resolveValueRefs(src, raw))();
        if (Array.isArray(arr) && arr.length > 0 && arr[0] && arr[0].values && arr[0].label) {
          const keys = Object.keys(arr[0].values);
          if (keys.some((key) => paramIds.has(key))) return arr;
        }
      } catch { /* tenta o próximo */ }
    }
    re.lastIndex = end;
  }
  return [];
}

function isToggle (p) {
  return p.scale === 'linear' && p.min === 0 && p.max === 1 && (p.precision ?? 0) === 0;
}

function groupFor (p) {
  const name = p.name;
  if (UTILITY.has(name)) return 'Avançado';
  const band = /^B(\d+)\b/.exec(name);
  if (band) return { title: `Banda ${band[1]}`, collapsed: Number(band[1]) > 1 };
  const inv = /^Inv (\d+)\b/.exec(name);
  if (inv) return { title: `Inversor ${inv[1]}`, collapsed: true };
  const lfo = /^LFO ?(\d+)\b/.exec(name);
  if (lfo) return { title: `LFO ${lfo[1]}`, collapsed: false };
  if (/^(−1|−2|\+1)\b/.test(name)) return { title: 'Vozes', collapsed: false };
  if (/^Sub\b/.test(name)) return { title: 'Sub', collapsed: false };
  return 'Controles';
}

function normalize (value, p) {
  const span = p.max - p.min;
  if (!Number.isFinite(span) || span === 0) return 0;
  return Math.max(0, Math.min(1, (value - p.min) / span));
}

function main () {
  const probe = probeFile && fs.existsSync(probeFile)
    ? JSON.parse(fs.readFileSync(probeFile, 'utf8'))
    : null;

  const effects = [];
  for (const entry of fs.readdirSync(base).filter((f) => f.endsWith('.vst3')).sort()) {
    const js = findJs(path.join(base, entry));
    if (!js) continue;
    const src = fs.readFileSync(js, 'utf8');
    const schema = extractParams(src);
    if (schema.length === 0) continue;
    const ids = new Set(schema.map((p) => p.id));
    const rawPresets = extractPresets(src, src.indexOf('parameters:['), ids);

    const key = entry.replace(/^calfNXT/, '').replace(/\.vst3$/i, '');
    const identity = IDENTITY[key] ?? { name: `Preseter ${key}`, short: key, category: 'Efeito', native: true };

    const curated = GROUPS[key]?.groups ?? {};
    const params = schema.map((p, index) => {
      const engineName = probe?.[entry]?.params?.[index]?.name ?? p.name;
      const group = curated[p.id] ?? groupFor(p);
      return {
        index,
        id: p.id,
        name: p.name,
        engineName,
        label: LABELS[p.name] ?? p.name,
        unit: p.unit || '',
        min: p.min,
        max: p.max,
        default: p.default,
        scale: p.scale || 'linear',
        precision: p.precision ?? 2,
        toggle: isToggle(p),
        group: typeof group === 'string' ? group : group.title,
        collapsed: typeof group === 'string' ? false : Boolean(group.collapsed),
      };
    });

    const convert = (preset) => {
      const values = {};
      for (const [id, value] of Object.entries(preset.values || {})) {
        const param = params.find((item) => item.id === id);
        if (!param) continue;
        values[String(param.index)] = normalize(Number(value), param);
      }
      return { id: preset.id, label: preset.label, values };
    };

    const factory = [...rawPresets, ...(BANK[key] ?? [])];
    const presets = [
      {
        id: 'default',
        label: 'Padrão',
        values: Object.fromEntries(params.map((param) => [String(param.index), normalize(param.default, param)])),
      },
      ...factory.map(convert).filter((preset) => Object.keys(preset.values).length > 0),
    ];

    effects.push({
      id: `preseter.${key.toLowerCase()}`,
      bundle: entry,
      match: key,
      displayName: identity.name,
      shortName: identity.short,
      category: identity.category,
      nativePanel: identity.native,
      paramCount: params.length,
      subtitle: `${identity.category} · ${params.length} parâmetros`,
      params,
      presets,
    });
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ version: 1, effects }, null, 1), 'utf8');
  console.log(`Efeitos: ${effects.length}`);
  for (const effect of effects) {
    console.log(`  ${effect.displayName.padEnd(24)} ${String(effect.paramCount).padStart(3)} params  ${String(effect.presets.length).padStart(2)} presets  panel=${effect.nativePanel}`);
  }
}

main();

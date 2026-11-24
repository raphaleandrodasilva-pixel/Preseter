/** Categorias exibidas na biblioteca de presets, na ordem usada pelo Preseter. */
export const VST_PRESET_CATEGORIES = [
  'Favoritos',
  'Recentes',
  'Meus presets',
  'Piano',
  'E-Piano',
  'Organ',
  'Accordion & Harmonica',
  'Strings',
  'Choir',
  'Brass',
  'Synth Brass',
  'Woodwinds',
  'Bells & Mallets',
  'Plucked',
  'Guitar',
  'Bass',
  'Synth Bass',
  'Synth Lead',
  'Synth Pad',
  'Arp',
  'Drums',
  'World',
  'FX',
  'Outros',
];

/** Coleção dos sons prontos (instrumento + efeitos), listada antes das outras. */
export const PRESETER_SOUNDS_COLLECTION = 'Preseter Sounds';

/**
 * Palavras-chave por categoria. A ordem importa: as mais específicas vêm antes
 * ("synth bass" antes de "bass", "electric piano" antes de "piano").
 * Cada termo casa com o início de uma palavra ("pad" casa "pads", não "padding"
 * no meio de outra palavra; "arp" não casa "harp").
 */
const CATEGORY_KEYWORDS: { category: string; terms: string[] }[] = [
  // Nomes que levariam à categoria errada pela palavra comum ("horn", "string", "clav").
  { category: 'FX', terms: ['car horn', 'helicopter', 'alarm', 'alert', 'glitch', 'ufo', 'thunder', 'the rain', 'arctic wind', 'canyon wind', 'beep', 'bleep', 'robot', 'alien', 'comet', 'crickets', 'jumbo jet', 'magma', 'cauldron', 'lawnmower', 'asteroid', 'astronave', 'computer game', 'whoop', 'quack', 'interferenze', 'falling stars', '8 bit', 'metal sound', 'bubble', 'filter rise', 'launch'] },
  { category: 'Guitar', terms: ['steel string', 'jazz guitar', 'synth guitar'] },
  { category: 'Drums', terms: ['claves', 'clave-drum', 'log drum', 'syn tom', 'synth tom'] },
  { category: 'Synth Bass', terms: ['synth bass', 'synbass', 'syn bass', 'synth-bass', 'acid', 'reese', 'wobble', '303', 'fm bass', 'fm.bass', 'fm-bass', 'analog bass', 'analogue bass', 'anlogbass', 'sub bass', 'infra-bass', 'dnb bass', 'bass pad', 'hard bass', 'hardbass', 'squelch bass', 'rubber bass', 'wah bass', 'subsaw', 'dnb', 'reso base'] },
  { category: 'Synth Brass', terms: ['synth brass', 'syn brass', 'synth brazz', 'analog brass', 'ob8 brass', 'brass pad', 'fat brass', 'glassbrass', 'space synthbrass'] },
  { category: 'E-Piano', terms: ['electric piano', 'e-piano', 'e.piano', 'e.-piano', 'e.pno', 'e.pia', 'epiano', 'e piano', 'rhodes', 'wurlitzer', 'wurli', 'wurly', 'suitcase', 'tines', 'clavinet', 'clavi', 'clav', 'dx rhodes', 'fm rhodes', 'fmrhodes', 'ep$', 'e p$', 'keypiano', 'electric keys', 'wahiano'] },
  { category: 'Piano', terms: ['piano', 'grand', 'upright', 'harpsich', 'harpsi', 'cembalo', 'pno'] },
  { category: 'Accordion & Harmonica', terms: ['accordion', 'accordian', 'bandoneon', 'harmonica', 'armonica', 'concertina', 'musette'] },
  { category: 'Organ', terms: ['organ', 'b3', 'hammond', 'drawbar', 'church', 'cathedral', 'orgel', 'clonewheel', 'hoarseorgan'] },
  { category: 'Choir', terms: ['choir', 'keychoir', 'voice', 'vocal', 'vox', 'ahh', 'ooh', 'ohh', 'aah', 'eooo', 'chorale', 'soprano'] },
  { category: 'Strings', terms: ['string', 'brightstrings', 'strg', 'stg', 'violin', 'viola', 'cello', 'contrabass', 'ensemble', 'orchestra', 'orch', 'pizzicato', 'pizz', 'fiddle'] },
  { category: 'Brass', terms: ['brass', 'brazz', 'trumpet', 'trumpt', 'thrumpet', 'trump', 'trombone', 'horn', 'tuba', 'flugel', 'fanfare', 'fanfara'] },
  { category: 'Woodwinds', terms: ['flute', 'clarinet', 'oboe', 'bassoon', 'sax', 'reed', 'piccolo', 'recorder', 'pan flute', 'whistle', 'breathy', 'ocarina', 'pan pipe', 'pipe', 'fagotto', 'zufolo', 'fischia'] },
  { category: 'Bells & Mallets', terms: ['bell', 'chime', 'celesta', 'celeste', 'glock', 'marimba', 'vibraphone', 'vibes', 'vibe', 'xylo', 'mallet', 'music box', 'musicbox', 'tubular', 'tub', 'steel drum', 'steeldrum', 'kalimba', 'glass', 'campane', 'ding', 'drip', 'droplet', 'gocce', 'ping$', 'bottle'] },
  { category: 'World', terms: ['koto', 'sitar', 'shamisen', 'banjo', 'bagpipe', 'shakuhachi', 'ethnic', 'oud'] },
  { category: 'Guitar', terms: ['guitar', 'nylon', 'steel string', 'gtr', 'dist guitar', 'gritar', 'twang', 'overdrive'] },
  { category: 'Plucked', terms: ['pluck', 'harp', 'pizz', 'mandolin', 'zither', 'dulcimer'] },
  { category: 'Bass', terms: ['bass', 'fretless', 'upright bass', 'double bass', 'doublebass'] },
  { category: 'Arp', terms: ['arp', 'arpeggio', 'sequence', 'sequencer', 'seq'] },
  { category: 'Drums', terms: ['drum', 'kick', 'snare', 'hithat', 'hihat', 'hi-hat', 'percussion', 'perc', 'kit', 'tom', 'cowbell', 'clave'] },
  { category: 'Synth Lead', terms: ['lead', 'solo', 'mono synth', 'monosynth', 'supersaw', 'saw lead', 'square lead', 'sync'] },
  { category: 'Synth Pad', terms: ['pad', 'atmosphere', 'ambient', 'ambi', 'texture', 'drone', 'sweep', 'space', 'dream', 'fantasy', 'warm', 'soft synth', 'ens', 'swell', 'lush', '5ths', 'aura', 'ethereal', 'galax', 'echoes', 'spazio', 'nebbia', 'senza tempo', 'memor', 'nostalgia', 'sweet night', 'shimmer', 'vastness', 'celestial', 'chord', 'matrix', 'ice field', 'voyager', 'rush', 'sine', 'soft$', 'smooth', 'delicato', 'dolcino', 'sospirato', 'romantic', 'arcadia', 'arcano', 'respad', 'onemorepad', 'compad', 'saturnus', 'from another', 'emptyness'] },
  // Palavras genéricas de sintetizador: depois de "pad" para "Synth Pad 2" ser pad.
  { category: 'Synth Lead', terms: ['superpulse', 'saw', 'square', 'synth', 'pulse', 'hoover', 'theramin', 'theremin', 'chip', 'bite', 'sharp', 'buzz', 'stab'] },
  { category: 'FX', terms: ['fx', 'effect', 'noise', 'riser', 'impact', 'glitch', 'alarm', 'alert', 'ufo', 'thunder', 'rain', 'wind', 'helicopter', 'car horn', 'radio', 'laser', 'frog', 'trash', 'strano', 'bizzarro', 'creepy', 'computer', 'hum$', 'vento', 'pioggia', 'acqua'] },
];

/** Minúsculas sem acento, camelCase separado e `_` como espaço. */
export function normalizePresetText (value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // camelCase: "ThinLead" → "Thin Lead".
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_]+/g, ' ');
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Termo terminado em `$` só casa como palavra inteira ("ep$" não casa "epic"). */
const termPattern = (term: string): string =>
  term.endsWith('$') ? `${escape(term.slice(0, -1))}(?![a-z])` : escape(term);

const MATCHERS = CATEGORY_KEYWORDS.map(({ category, terms }) => ({
  category,
  pattern: new RegExp(`(^|[^a-z0-9])(${terms.map(termPattern).join('|')})`, 'i'),
}));

/** Categoria pelo nome do preset/coleção. Sem palavra-chave, devolve `fallback`. */
export function categorizePreset (text: string, fallback = 'Outros'): string {
  const normalized = normalizePresetText(text);
  for (const { category, pattern } of MATCHERS) {
    if (pattern.test(normalized)) return category;
  }
  return fallback;
}

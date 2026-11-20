/**
 * Agrupamento curado dos efeitos principais (id do parâmetro → seção).
 * O que não estiver aqui cai no agrupamento automático do gerador
 * (bandas, inversores, LFO e "Avançado" para utilitários).
 */
const ADVANCED = {
  in_gain: 'Avançado', out_gain: 'Avançado', bypass: 'Avançado', active: 'Avançado',
  listen: 'Avançado', channel: 'Avançado', spectrum: 'Avançado', mono: 'Avançado',
  quality: 'Avançado', reset: 'Avançado',
};

module.exports = {
  Reverb: {
    groups: {
      ...ADVANCED,
      room_size: 'Espaço', distance: 'Espaço', decay: 'Espaço',
      diffusion: 'Espaço', diffuse: 'Espaço', predelay: 'Espaço',
      hipass: 'Cor', lopass: 'Cor', hp_mode: 'Cor', lp_mode: 'Cor',
      hf_damp: 'Cor', lf_damp: 'Cor', air: 'Cor',
      er_mode: 'Reflexões', er_level: 'Reflexões', path_mode: 'Reflexões', late_level: 'Reflexões',
      mod_rate: 'Modulação', mod_depth: 'Modulação',
      width_mode: 'Imagem', width: 'Imagem',
      duck: 'Dinâmica', gate: 'Dinâmica', gate_threshold: 'Dinâmica',
      gate_hold: 'Dinâmica', gate_release: 'Dinâmica', freeze: 'Dinâmica',
      dry: 'Saída', amount: 'Saída',
    },
  },
  Delay: {
    groups: {
      ...ADVANCED,
      sync: 'Tempo', bpm: 'Tempo', ms: 'Tempo', subdiv: 'Tempo', time_l: 'Tempo', time_r: 'Tempo',
      feedback: 'Repetição', amount: 'Repetição', dry: 'Repetição', width: 'Repetição', mix_mode: 'Repetição',
      hipass: 'Filtro', lopass: 'Filtro', hp_mode: 'Filtro', lp_mode: 'Filtro',
    },
  },
  Compressor: {
    groups: {
      ...ADVANCED,
      threshold: 'Dinâmica', ratio: 'Dinâmica', knee: 'Dinâmica',
      attack: 'Dinâmica', release: 'Dinâmica', makeup: 'Dinâmica', mix: 'Dinâmica',
      pdr: 'Dinâmica', mode: 'Dinâmica',
      link: 'Sidechain', sidechain_active: 'Sidechain',
      hipass: 'Filtro', lopass: 'Filtro', hp_mode: 'Filtro', lp_mode: 'Filtro',
    },
  },
  Chorus: {
    groups: {
      ...ADVANCED,
      min_delay: 'Modulação', mod_depth: 'Modulação', mod_rate: 'Modulação',
      voices: 'Modulação', stereo: 'Modulação', vphase: 'Modulação',
      overlap: 'Modulação', lfo: 'Modulação',
      amount: 'Mix', dry: 'Mix',
      hipass: 'Filtro', lopass: 'Filtro', hp_mode: 'Filtro', lp_mode: 'Filtro',
    },
  },
  Filter: {
    groups: {
      ...ADVANCED,
      mode: 'Filtro', resonance: 'Filtro', frequency: 'Filtro', inertia: 'Filtro',
      env_power: 'Envelope', target: 'Envelope', activation: 'Envelope',
      attack: 'Envelope', release: 'Envelope', detection: 'Envelope',
      mix: 'Saída', soft_clip: 'Saída',
    },
  },
  Limiter: {
    groups: {
      ...ADVANCED,
      limit: 'Limitação', attack: 'Limitação', release: 'Limitação',
      asc: 'Limitação', asc_coeff: 'Limitação', curve: 'Limitação', knee: 'Limitação',
      oversampling: 'Cor', auto_level: 'Cor', color_enable: 'Cor', color: 'Cor',
      true_peak: 'Cor', margin: 'Cor', emphasis_enable: 'Cor', emphasis: 'Cor',
      hold_enable: 'Hold', release_hold: 'Hold', diff_listen: 'Hold',
    },
  },
  Crusher: {
    groups: {
      ...ADVANCED,
      bits: 'Crush', morph: 'Crush', mode: 'Crush', dc: 'Crush', anti_aliasing: 'Crush',
    },
  },
  Harmonics: {
    groups: {
      ...ADVANCED,
      drive: 'Saturação', blend: 'Saturação', dry: 'Saturação', wet: 'Saturação',
      asymmetry: 'Saturação', tone: 'Saturação', oversample: 'Saturação',
      pre_hipass: 'Filtro (pré)', pre_lopass: 'Filtro (pré)',
      pre_hp_mode: 'Filtro (pré)', pre_lp_mode: 'Filtro (pré)',
      post_hipass: 'Filtro (pós)', post_lopass: 'Filtro (pós)',
      post_hp_mode: 'Filtro (pós)', post_lp_mode: 'Filtro (pós)',
      pre_listen: 'Escuta', listen: 'Escuta',
    },
  },
};

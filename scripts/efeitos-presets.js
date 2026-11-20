/**
 * Presets de fábrica dos efeitos Preseter (em unidades reais, como no schema
 * do plugin). O gerador converte para normalizado e ignora ids inexistentes.
 *
 * `scripts/gerar-catalogo-efeitos.js` mescla estes com os presets que já vêm
 * dentro dos bundles (hoje: Reverb e Harmonics).
 */
module.exports = {
  Delay: [
    { id: 'slap', label: 'Slap', values: { sync: 0, ms: 90, feedback: 0.15, amount: -9, dry: 0, width: 0.6, hipass: 120, lopass: 8000 } },
    { id: 'echo', label: 'Eco', values: { sync: 0, ms: 380, feedback: 0.45, amount: -10, dry: 0, width: 1, hipass: 80, lopass: 7000, lp_mode: 2 } },
    { id: 'pingpong', label: 'Ping-pong', values: { sync: 0, ms: 300, feedback: 0.42, amount: -9, dry: 0, width: -1, mix_mode: 2, hipass: 150, lopass: 9000 } },
    { id: 'dotted', label: 'Colcheia pontuada', values: { sync: 1, bpm: 120, subdiv: 3, feedback: 0.35, amount: -10, dry: 0, width: 1.2 } },
  ],
  Compressor: [
    { id: 'vocal', label: 'Voz', values: { threshold: -18, ratio: 3, knee: 6, attack: 15, release: 120, makeup: 4, mix: 1 } },
    { id: 'drum', label: 'Bateria', values: { threshold: -12, ratio: 4, knee: 3, attack: 10, release: 80, makeup: 4, mix: 1 } },
    { id: 'bass', label: 'Baixo', values: { threshold: -20, ratio: 4, knee: 6, attack: 25, release: 150, makeup: 5, mix: 1 } },
    { id: 'bus', label: 'Bus (glue)', values: { threshold: -10, ratio: 2, knee: 8, attack: 30, release: 250, makeup: 3, mix: 1 } },
  ],
  Chorus: [
    { id: 'subtle', label: 'Sutil', values: { min_delay: 8, mod_depth: 2, mod_rate: 0.3, voices: 2, stereo: 180, vphase: 90, overlap: 0.6, amount: -9, dry: 0 } },
    { id: 'wide', label: 'Largo', values: { min_delay: 15, mod_depth: 5, mod_rate: 0.15, voices: 4, stereo: 220, overlap: 0.8, amount: -6, dry: 0 } },
    { id: 'ensemble', label: 'Ensemble', values: { min_delay: 12, mod_depth: 4, mod_rate: 0.6, voices: 6, stereo: 120, vphase: 45, overlap: 0.9, amount: -6, dry: 0 } },
  ],
  Crusher: [
    { id: 'soft', label: 'Leve', values: { bits: 10, morph: 0.3, anti_aliasing: 0.6 } },
    { id: 'lofi', label: 'Lo-fi', values: { bits: 6, morph: 0.5, anti_aliasing: 0.75 } },
    { id: 'destroy', label: 'Destruído', values: { bits: 3, morph: 0.85, anti_aliasing: 0.2 } },
  ],
  Filter: [
    { id: 'smooth', label: 'Suave', values: { mode: 0, resonance: 1.2, frequency: 2500, mix: 1 } },
    { id: 'acid', label: 'Ácido', values: { mode: 0, resonance: 8, frequency: 700, mix: 1 } },
    { id: 'envelope', label: 'Com envelope', values: { mode: 0, resonance: 2.5, frequency: 900, env_power: 1, target: 6000, attack: 5, release: 180, mix: 1 } },
  ],
  Limiter: [
    { id: 'safe', label: 'Seguro', values: { limit: -1.5, attack: 5, release: 80, asc: 1, auto_level: 1, true_peak: 1 } },
    { id: 'loud', label: 'Alto', values: { limit: -0.3, attack: 2, release: 40, asc: 1, auto_level: 1, true_peak: 1, oversampling: 4 } },
    { id: 'transparent', label: 'Transparente', values: { limit: -1, attack: 10, release: 150, asc: 0, auto_level: 0, true_peak: 1 } },
  ],
  Phaser: [
    { id: 'slow', label: 'Lento', values: { base_freq: 600, mod_depth: 3000, mod_rate: 0.08, feedback: 0.45, stages: 6, amount: -6 } },
    { id: 'fast', label: 'Rápido', values: { base_freq: 1200, mod_depth: 5000, mod_rate: 1.2, feedback: 0.6, stages: 8, amount: -6 } },
    { id: 'deep', label: 'Profundo', values: { base_freq: 300, mod_depth: 8000, mod_rate: 0.2, feedback: 0.85, stages: 12, amount: -4 } },
  ],
  Flanger: [
    { id: 'jet', label: 'Jato', values: { min_delay: 0.5, mod_depth: 4, mod_rate: 0.2, feedback: 0.85, stereo: 90, amount: -4 } },
    { id: 'subtle', label: 'Sutil', values: { min_delay: 2, mod_depth: 1.5, mod_rate: 0.4, feedback: 0.3, stereo: 180, amount: -9 } },
    { id: 'metallic', label: 'Metálico', values: { min_delay: 1, mod_depth: 6, mod_rate: 0.8, feedback: 0.95, stereo: 0, amount: -5 } },
  ],
  Bender: [
    { id: 'octave-down', label: 'Oitava abaixo', values: { pitch: -12, snap: 0, mix: 0.5, glide: 20 } },
    { id: 'fifth', label: 'Quinta', values: { pitch: 7, snap: 0, mix: 0.4, glide: 10 } },
    { id: 'detune', label: 'Detune', values: { pitch: 0.15, snap: 0, mix: 0.5, glide: 40 } },
  ],
  Impulse: [
    { id: 'short', label: 'Curto', values: { decay: 0.35, predelay: 0, amount: -10, dry: 0 } },
    { id: 'long', label: 'Longo', values: { decay: 0.85, predelay: 30, amount: -8, dry: 0 } },
    { id: 'reverse', label: 'Reverso', values: { reverse: 1, decay: 0.7, predelay: 20, amount: -9, dry: 0 } },
  ],
  Stereo: [
    { id: 'wide', label: 'Largo', values: { decorr: 1, decorr_amount: 0.7, decorr_spread: 0.8, balance_out: 0 } },
    { id: 'mono', label: 'Mono', values: { mode: 1, decorr: 0, balance_out: 0 } },
    { id: 'rotate', label: 'Rotação', values: { decorr: 1, decorr_amount: 0.4, stereo_phase: 90, delay: 8 } },
  ],
  Octaver: [
    { id: 'sub', label: 'Sub', values: { sub_on: 1, sub_level: -3, m1_on: 0, p1_on: 0, dry_on: 1, dry_level: 0 } },
    { id: 'down', label: 'Uma oitava', values: { sub_on: 0, m1_on: 1, m1_level: -3, dry_on: 1, dry_level: 0 } },
    { id: 'both', label: 'Sub + oitava', values: { sub_on: 1, sub_level: -4, m1_on: 1, m1_level: -4, dry_on: 1, dry_level: 0 } },
  ],
  Deesser: [
    { id: 'vocal', label: 'Voz', values: { threshold: -30, ratio: 4, split_freq: 6500, makeup: 2 } },
    { id: 'soft', label: 'Suave', values: { threshold: -24, ratio: 2, split_freq: 5000, makeup: 0 } },
  ],
  Denoiser: [
    { id: 'light', label: 'Leve', values: { amount: 0.4, floor: -55 } },
    { id: 'strong', label: 'Forte', values: { amount: 0.85, floor: -45 } },
  ],
  Elliptic: [
    { id: 'low', label: 'Corte grave', values: { freq: 80, slope: 24, amount: 1 } },
    { id: 'high', label: 'Corte agudo', values: { freq: 600, slope: 24, amount: 1 } },
  ],
  Pulsator: [
    { id: 'slow', label: 'Lento', values: { mode: 0, amount: 0.6, offset_l: 0, offset_r: 0.5, pulsewidth: 2, bpm: 120, ms: 500 } },
    { id: 'fast', label: 'Rápido', values: { mode: 0, amount: 0.8, offset_l: 0.25, offset_r: 0.75, pulsewidth: 1, bpm: 120, ms: 250 } },
  ],
  Ringmodulator: [
    { id: 'bell', label: 'Sino', values: { mod_freq: 1200, mod_amount: 0.35, mod_mode: 0 } },
    { id: 'metallic', label: 'Metálico', values: { mod_freq: 640, mod_amount: 0.5, mod_mode: 1 } },
  ],
  Expander: [
    { id: 'soft-gate', label: 'Gate suave', values: { threshold: -42, ratio: 2, attack: 5, release: 180, range: -40 } },
    { id: 'tight', label: 'Gate firme', values: { threshold: -32, ratio: 10, attack: 1, release: 60, range: -80 } },
  ],
  Split: [
    { id: 'stereo', label: 'L/R', values: { volume_l: 0, volume_r: 0 } },
    { id: 'left', label: 'Só L', values: { volume_l: 0, volume_r: -60 } },
  ],
  Tamer: [
    { id: 'vocal', label: 'Voz', values: { f_lo: 300, f_hi: 6000, depth: 6, threshold: 8, attack: 10, release: 120 } },
    { id: 'master', label: 'Master', values: { f_lo: 60, f_hi: 12000, depth: 4, threshold: 6, attack: 20, release: 200 } },
  ],
  Transients: [
    { id: 'attack', label: 'Mais ataque', values: { attack_boost: 0.4, release_boost: -0.1, mix: 1 } },
    { id: 'sustain', label: 'Mais sustain', values: { attack_boost: -0.2, release_boost: 0.3, mix: 1 } },
  ],
  Equalizer: [
    {
      id: 'vocal',
      label: 'Voz',
      values: {
        b01_active: 1, b01_freq: 120, b01_gain: -2, b01_q: 0.8,
        b02_active: 1, b02_freq: 2500, b02_gain: 2, b02_q: 1,
        b03_active: 1, b03_freq: 8000, b03_gain: 2, b03_q: 0.8,
      },
    },
    {
      id: 'master',
      label: 'Master',
      values: {
        b01_active: 1, b01_freq: 40, b01_gain: 1,
        b02_active: 1, b02_freq: 300, b02_gain: -1,
        b03_active: 1, b03_freq: 12000, b03_gain: 1.5,
      },
    },
    {
      id: 'low-cut',
      label: 'Corte de graves',
      values: {
        b01_active: 1, b01_freq: 80, b01_gain: -6, b01_q: 0.7,
        b02_active: 1, b02_freq: 200, b02_gain: -3,
      },
    },
    {
      id: 'presence',
      label: 'Presença',
      values: {
        b02_active: 1, b02_freq: 3000, b02_gain: 3, b02_q: 1.2,
        b03_active: 1, b03_freq: 9000, b03_gain: 2,
      },
    },
  ],
  Mbcomp: [
    {
      id: 'master-soft',
      label: 'Master suave',
      values: {
        b01_threshold: -18, b01_ratio: 2, b02_threshold: -18, b02_ratio: 2,
        b03_threshold: -20, b03_ratio: 2, b04_threshold: -20, b04_ratio: 2,
        b01_attack: 20, b01_release: 200, b02_attack: 15, b02_release: 180,
        b03_attack: 10, b03_release: 140, b04_attack: 5, b04_release: 100,
      },
    },
    {
      id: 'drums',
      label: 'Bateria',
      values: {
        b01_threshold: -14, b01_ratio: 4, b01_makeup: 2,
        b02_threshold: -14, b02_ratio: 4, b02_makeup: 2,
        b03_threshold: -16, b03_ratio: 4, b03_makeup: 2,
        b04_threshold: -16, b04_ratio: 4, b04_makeup: 2,
        b01_attack: 10, b01_release: 120, b02_attack: 8, b02_release: 100,
        b03_attack: 5, b03_release: 80, b04_attack: 3, b04_release: 60,
      },
    },
    {
      id: 'bus',
      label: 'Bus (glue)',
      values: {
        b01_threshold: -12, b01_ratio: 1.5, b02_threshold: -12, b02_ratio: 1.5,
        b03_threshold: -12, b03_ratio: 1.5, b04_threshold: -12, b04_ratio: 1.5,
        b01_attack: 30, b01_release: 250, b02_attack: 30, b02_release: 250,
        b03_attack: 30, b03_release: 250, b04_attack: 30, b04_release: 250,
      },
    },
  ],
  Mblimiter: [
    { id: 'master-1', label: 'Master -1 dB', values: { limit: -1, true_peak: 1, oversampling: 4 } },
    { id: 'master-03', label: 'Master -0.3 dB', values: { limit: -0.3, true_peak: 1, oversampling: 4 } },
    { id: 'soft', label: 'Suave', values: { limit: -2, release: 120, true_peak: 1 } },
  ],
};

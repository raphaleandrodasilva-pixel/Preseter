# Teste de nulidade do Tines (MDA ePiano)

Data: 2026-11-15

## Objetivo

Verificar que o `Preseter Tines` usa o mesmo DSP/samples do MDA ePiano e que a
extração para o `MdaEPianoDsp` não alterou o som.

## Montagem

- Porte de referência: `hollance/mda-plugins-juce`, commit
  `552702479a9eac534f3abbf6e878a5eab473e0cb` (MIT).
- DSP do Preseter: `engine/third_party/mda-epiano/MdaEPianoDsp.cpp`.
- Referência: o `MDAEPianoAudioProcessor` original do mesmo porte.
- 48 kHz, blocos de 512 amostras, 6 segundos.
- Parâmetros: Decay 50, Release 50, Hardness 0, Treble 0, Modulation 0.25
  (auto-pan), LFO 0.65, Velocity 25, Stereo 100, Polyphony 16, Fine 0,
  Random 0.246, Overdrive 0.
- MIDI: notas graves/médias/agudas e CC7 no máximo. O CC1 fica fora da
  nulidade porque o Preseter corrige a persistência do mod wheel (o porte
  original esquecia o CC1 no bloco seguinte). O modo `--cc1` verifica:
  `CC1=127 -> 0.991`, bloco seguinte sem CC1 -> `0.991`, `CC1=0 -> 0.000`.

## Resultado

| Métrica | Valor |
|---|---|
| Pico | 1.604820 |
| RMS de referência | −20.88 dBFS |
| Diferença máxima | 0.000493407 (−66.14 dBFS) |
| RMS da diferença | −95.11 dBFS |
| Critério (< −90 dBFS) | **PASS** |

A diferença RMS é −95 dBFS (inaudível). O algoritmo, os samples e a cadeia são
os do MDA; a diferença vem de arredondamento na conversão de parâmetros.

## Como repetir

Ver `engine/test/mda-epiano-nullity/README.md`.

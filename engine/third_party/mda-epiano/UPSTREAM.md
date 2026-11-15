# MDA ePiano (importação)

Base do instrumento nativo **Preseter Tines**.

## Origem

- Porte JUCE: https://github.com/hollance/mda-plugins-juce
- Pasta: `EPiano/Source`
- Commit: `552702479a9eac534f3abbf6e878a5eab473e0cb`
- Data: 2026-02-25
- Licença: MIT (ver `LICENSE`).
- Código original: **mda ePiano**, Copyright (c) 2008 Paul Kellett,
  licenciado como MIT ou GPL-2.0-or-later. O porte JUCE é de
  M.I. Hollemans (2021-2025).

## Arquivos importados

- `MDAEPianoProcessor.cpp` / `MDAEPianoProcessor.h` (referência para o teste
  de nulidade; não fazem parte do `PreseterEngine`)
- `mdaEPianoData.h` (samples do MDA, 15 keygroups, 3 níveis de velocity)
- `MdaEPianoDsp.cpp` / `MdaEPianoDsp.h` (DSP extraído e adaptado para o
  `Preseter Tines`, sem VST2/APVTS/UI)

## Adaptações do Preseter

- O DSP foi extraído para `MdaEPianoDsp`, que recebe os parâmetros em faixas
  reais e processa `AudioBuffer`/`MidiBuffer`.
- O `PluginProcessor.h` foi renomeado para `MDAEPianoProcessor.h` (apenas no
  teste de nulidade).
- `short epianoData[]` virou `inline short epianoData[]` para permitir que o
  DSP e a referência de teste fiquem no mesmo binário sem símbolo duplicado.
- Cada instância copia a tabela de samples antes do crossfade de loop, para
  não modificar a tabela global (o MDA original fazia isso em uma única
  instância).
- Os samples continuam sendo os do MDA; não há samples comerciais novos.

## Teste de nulidade

`engine/test/mda-epiano-nullity/` compara o `MdaEPianoDsp` com o
`MDAEPianoAudioProcessor` original do porte, com o mesmo MIDI, parâmetros e
blocos de 512 amostras. Resultado em `docs/testes/tines-nulidade.md`.

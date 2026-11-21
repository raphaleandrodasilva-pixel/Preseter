# Oxo Synth2 / Synth2 (importação)

Base do instrumento nativo **Preseter Synth2**.

## Origem

- Projeto: https://github.com/chab/oxo_synth2
- Pasta: `EngineCore`
- Commit: `dd4a1291d602573fac38f180cf9556532097c83b` (2026-11-20)
- Licença: MIT (ver `LICENSE`).
- Autores: **François Chabloz (chab)**; versão Windows por **sl23**; versão Linux por **Eufex**.

O Synth2 é uma recriação independente do **Synth1**, de Daichi Laboratory
(https://daichilab.sakura.ne.jp/softsynth/index.html). Nenhum código, binário
ou arte do Synth1 original é usado neste projeto; o motor foi modelado apenas
a partir do áudio do plugin original.

## Arquivos importados

Subconjunto *header-only* do `EngineCore`, sem JUCE/VST3 e sem `zlib`:

- `Params.hpp`, `MeasuredTables.hpp`, `LegacyTables.hpp`, `Simd.hpp`
- `Synth.hpp`, `Voice.hpp`, `Envelope.hpp`, `Filter.hpp`, `Lfo.hpp`,
  `Effects.hpp`, `WaveTables.hpp`
- `Sy1Codec.hpp`, `InitPatch.hpp`, `ParamFormat.hpp`

**Não** entram: `PatchLibrary.hpp`, `Jobs.hpp`, `MidiLearn.hpp`,
`ProgramChange.hpp` e `TextEncoding.hpp` (CoreFoundation, macOS). A interface
do aplicativo (DesktopEditor/EditorCore) também não é usada.

## Adaptações do Preseter

- `engine/src/native/Synth2Dsp.{h,cpp}` embrulha `oxo::s2::Synth` para o
  `NativeProcessor`: parâmetros via `AudioProcessorValueTreeState`, MIDI
  (nota, bend, CC, aftertouch, all-notes-off), transporte do host e
  carregamento/exportação de patches `.sy1`.
- Os 99 parâmetros do patch usam o `key` e o `name` do upstream e as faixas
  medidas do Synth1, para que automação e patches continuem compatíveis.
- O patch INIT segue `InitPatch.hpp` (o INIT do Synth2), não o init embutido
  do Synth1.
- O arpejador e os LFOs sincronizados usam o BPM/PPQ do `HostPlayHead` do
  motor do Preseter.
- `Envelope.hpp`: o `operator==` defaulted de `Settings` (C++20) foi escrito
  à mão para manter o motor do Preseter em C++17. Comportamento idêntico.

## Banco de fábrica

- `Shared/Resources/Synth2 Factory/*.sy1` (58 patches) foi copiado para
  `presets/synth2/` e entra no instalador como `synth2-presets/`.
- São presets originais do projeto Synth2 (MIT, mesmos autores), não bancos
  do Synth1. A biblioteca do Preseter os mostra como coleção **Fábrica**,
  somente leitura.

## Créditos no aplicativo

- `Sobre` e `Ajuda` citam **Oxo Synth2 — François Chabloz (chab) — MIT**.
- O `LICENSE` e este arquivo acompanham o instalador em `licenses/`.

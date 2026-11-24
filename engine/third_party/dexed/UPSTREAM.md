# Dexed (porte nativo do Preseter)

- Projeto: Dexed
- Autor: Pascal Gauthier e contribuidores
- Versão portada: 1.1.0 (`v1.1.0`)
- Licença: GPL-3.0 (ver `LICENSE`)
- Origem: https://github.com/asb2m10/dexed
- Motor FM original: music-synthesizer-for-android (Google), Apache-2.0 (cabeçalhos em `source/msfa`)

## O que foi alterado no porte

- Removida a UI original (`source/ui`) e a dependência de `clap-juce-extensions`.
- `JuceLibraryCode/JuceHeader.h` substituído por includes dos módulos do JUCE usados pelo motor.
- `createEditor`/`hasEditor` devolvem `nullptr`/`false`; o painel é desenhado pelo Preseter.
- Removidas as funções de escolha de arquivos de afinação (`.scl`/`.kbm`); o carregamento por
  conteúdo e por arquivo continua disponível internamente.
- Pasta de dados alterada de `DigitalSuburban/Dexed` para `Preseter/Dexed`.
- Nenhuma alteração no DSP, nos cartuchos ou no formato de estado.

## Dependências embutidas

- `tuning-library` (surge-synthesizer) — licença permissiva, ver `tuning-library/LICENSE.md`.
- `mts-esp` Client (ODDSound) — licença permissiva, ver `mts-esp/LICENSE`.

## Cartuchos

`assets/builtin_pgm.zip` é o pacote original do Dexed 1.1.0 (Dexed_01 + SynprezFM_01..32),
distribuído pelo próprio projeto. Cartuchos `.syx` do usuário podem ser importados pela interface.

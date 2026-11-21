# Licenças e créditos dos instrumentos e efeitos nativos

O Preseter é distribuído sob **AGPL-3.0-or-later**. O motor de áudio usa o
**JUCE 8** (AGPLv3 ou licença comercial). As licenças completas dos projetos
abaixo acompanham o instalador na pasta `licenses/`; o mesmo resumo aparece em
**Ajuda → Sobre** e na seção **Créditos** da Ajuda.

## Preseter Synth2 — Oxo Synth2

- Projeto: https://github.com/chab/oxo_synth2
- Commit importado: `dd4a1291d602573fac38f180cf9556532097c83b` (2026-11-20)
- Licença: **MIT** (`engine/third_party/oxo-synth2/LICENSE`)
- Autores: **François Chabloz (chab)**; versão Windows por **sl23**; versão
  Linux por **Eufex**.
- Origem do som: recriação independente do **Synth1**, de **Daichi
  Laboratory** (https://daichilab.sakura.ne.jp/softsynth/index.html). O
  projeto não usa código, binário ou arte do Synth1; o motor foi modelado a
  partir do áudio do plugin original.
- No Preseter: `engine/third_party/oxo-synth2/EngineCore` (subconjunto
  header-only) + `engine/src/native/Synth2Dsp.{h,cpp}` + painel
  `Synth2Panel.tsx`. Patches `.sy1` do usuário são lidos/gravados pelo
  `Sy1Codec` do próprio projeto; o Preseter não distribui bancos do Synth1.
- Banco de fábrica: 58 patches `.sy1` originais do Synth2
  (`Shared/Resources/Synth2 Factory` → `presets/synth2`), também MIT,
  mostrados na coleção **Fábrica**.

## Preseter Organ — setBfree

- Projeto: https://github.com/pantherb/setBfree (ver
  `engine/third_party/setbfree/UPSTREAM.md` para o commit importado)
- Licença: **GPL-2.0-or-later**

## Preseter Tines — MDA ePiano

- Porte JUCE: https://github.com/hollance/mda-plugins-juce
- Original: **mda ePiano**, Paul Kellett (MIT ou GPL-2.0-or-later); porte de
  M.I. Hollemans
- Licença: **MIT**

## Preseter Piano, DX10 e JX10 — MDA

- Porte JUCE: https://github.com/hollance/mda-plugins-juce
- Original: **mda Piano / DX10 / JX10**, Paul Kellett
- Licença: **MIT**

## Preseter Wurly — OpenWurli

- Projeto: https://github.com/hal0zer0/openwurli (ver
  `engine/third_party/openwurli/UPSTREAM.md`)
- Licença: **GPL-3.0-or-later**

## Efeitos Preseter — calfnXT / Calf Studio Gear

- Fork: https://github.com/boomshop/calfnxt
- Licença: **GPL-3.0-or-later**

## JUCE

- https://juce.com — **AGPLv3 ou licença comercial**

## Kits de bateria — MuseScore_General (MIT)

- Arquivo: **`MuseScore_General.sf2`** (SoundFont GM; banco 128 = kits de percussão)
- Autor/adaptação: **S. Christian Collins**; amostras de origem FluidR3 (Frank Wen) e FluidR3Mono
  (Michael Cowgill), com Temple Blocks (Ethan Winer) e Drumline Cymbals (Michael Schorsch).
- Origem/licença: https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md
  (v0.2, 13/05/2020) — **MIT**, verificada na fonte em 21/11/2026.
- Download (Loja): https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2
- Tamanho: **215.614.036 bytes** (≈ 205,6 MiB) na instalação verificada; não vai no instalador.
- Redistribuição: **sim** (MIT). Uso comercial: **sim** (MIT). Exige atribuição: **sim** — incluir os
  avisos de copyright do FluidR3/FluidR3Mono e a adaptação de S. Christian Collins em trabalhos
  derivados (o texto da licença pede que os avisos acompanhem qualquer derivado).
- Uso no Preseter:
  - sampler nativo (patch **Acoustic Rock Kit**, banco 128 programa 0);
  - Preseter Drums: kit padrão (banco 128 programa 0) e patch **Electronic Drum Kit** (banco 128
    programa 24).
- O `.sf3` (35,9 MB) **não** é usado: o motor lê `.sf2`/`.sfz` (o SF3 é OGG comprimido).
- Nenhum outro kit de bateria é distribuído na v1. Kits futuros entram só com licença verificada na
  fonte e registrados aqui **e** em `docs/LOJA.md` (ver D10).

## Outras referências

- **Element** (GPL-3.0-or-later): referência de áudio ASIO/WASAPI.
- **GDXs / bibliotecas de terceiros** usadas pelos plugins hospedados
  mantêm as próprias licenças, exibidas nos respectivos instaladores.

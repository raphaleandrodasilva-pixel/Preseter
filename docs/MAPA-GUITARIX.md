# Mapa dos módulos do Guitarix — Parte B1

> **Somente pesquisa e relatório.** Nada foi copiado para o repositório, nenhuma dependência foi
> adicionada e nada foi compilado com estes fontes.
> Base: clone somente leitura de `brummer10/guitarix` no commit
> `2a357f6529c89a0c7b3fcd9a4d3c36d16b07c367` (2026-10-31), árvore `trunk/`.
> Licença do Preseter: **AGPL-3.0-or-later**. Isto não é aconselhamento jurídico.

## 1. Como foi medido

- Módulos = cada pasta `trunk/src/LV2/*.lv2` (as pastas `DSP`, `faust`, `faust-generated` e `xputty`
  não são módulos).
- **DSP próprio**: soma dos `.cc/.cpp/.h` dentro da pasta do módulo, **sem** a UI (`*_ui.cpp`).
- **Com includes**: o mesmo, seguindo os `#include "…"` até os arquivos compartilhados em
  `src/LV2/DSP`, `src/LV2/faust-generated` e `src/LV2/faust` (cada módulo conta os compartilhados
  de novo; serve para medir esforço, não para somar o binário).
- **UI**: apenas `*_ui.cpp` (xputty/X11). Não é necessária para o painel React do Preseter.
- **Licença**: cabeçalho do próprio módulo (wrapper + DSP incluído).
- **Dependências**: detectadas pelos includes/uso no texto do módulo + includes:
  `zita-conv` = zita-convolver; `zita-resamp` = zita-resampler; `fftw` = FFTW;
  `faust-c++` = o DSP é **código C++ gerado pelo Faust** (não é runtime);
  `IR` = dados de cabine embutidos; `valve` = modelagem de válvula/preamp compartilhada.

## 2. Infraestrutura compartilhada em `src/LV2/`

| Pasta | Arquivos | Tamanho | Linhas |
|---|---|---|---|
| `src/LV2/DSP` | 19 | 189.4 KB | 3436 |
| `src/LV2/faust` | 237 | 584.7 KB | 9230 |
| `src/LV2/faust-generated` | 187 | 2876.9 KB | 76942 |

- `DSP/` traz `gx_convolver`, `gx_resampler`, `cab_data.cc` (banco de IRs embutido, **112,7 KB**),
  `valve.h`, `gx_preamp`, `gx_bypass`, `gx_pluginlv2.h`, `impulse_former.h`, etc.
- `faust/` são as fontes `.dsp`; `faust-generated/` é o C++ gerado (`dsp2cc`), incluído no build.
- `xputty/` é a UI (X11) dos LV2 — **não entra** no porte.

## 3. Tabela completa (70 módulos)

| Pasta | Nome LV2 | Família | Licença | DSP próprio (KB / linhas) | Com includes (KB / linhas) | UI (KB / linhas) | Dependências |
|---|---|---|---|---|---|---|---|
| `gx_alembic` | Gx_alembic | Amp/pré | GPL-2.0+ | 7.9 / 282 | 70.7 / 1499 | 6.8 / 167 | faust-c++ |
| `gx_amp` | GxAmplifier | Amp/pré | GPL-2.0+ | 29.3 / 986 | 735.3 / 19152 | 8.1 / 175 | zita-conv, zita-resamp, faust-c++, IR, valve |
| `gx_amp_stereo` | GxAmplifier | Amp/pré | GPL-2.0+ | 31.2 / 1011 | 1034.3 / 25053 | 9.7 / 221 | zita-conv, zita-resamp, faust-c++, IR, valve |
| `gx_hornet` | Gx_hornet_ | Amp/pré | GPL-2.0+ | 7.3 / 266 | 27.4 / 832 | 14.1 / 393 | faust-c++ |
| `gx_jcm800pre` | Gx_jcm800pre_ | Amp/pré | GPL-2.0+ | 191.9 / 4724 | 216.4 / 5600 | 14.7 / 406 | zita-conv, zita-resamp, faust-c++, IR |
| `gx_jcm800pre_st` | Gx_jcm800pre_ST | Amp/pré | GPL-2.0+ | 197.5 / 4952 | 222.1 / 5828 | 14.7 / 406 | zita-conv, zita-resamp, faust-c++, IR |
| `gx_mole` | Gx_mole_ | Amp/pré | GPL-2.0+ | 7.2 / 264 | 18.9 / 664 | 13.9 / 389 | faust-c++ |
| `gx_redeye` | GxRedeye | Amp/pré | GPL-2.0+ | 10.8 / 425 | 222.4 / 3920 | 11.2 / 269 | zita-conv, zita-resamp, faust-c++, IR |
| `gx_studiopre` | Gx_studiopre | Amp/pré | GPL-2.0+ | 8.1 / 283 | 95.6 / 2057 | 7 / 171 | faust-c++ |
| `gx_studiopre_st` | Gx_studiopre_st | Amp/pré | GPL-2.0+ | 8.7 / 302 | 122.3 / 2409 | 8.3 / 194 | faust-c++ |
| `gx_w20` | Gx_w20 | Amp/pré | GPL-2.0+ | 7.7 / 279 | 36.7 / 1143 | 4.9 / 126 | faust-c++ |
| `gxmetal_amp` | GxMetalAmp | Amp/pré | GPL-2.0+ | 12.2 / 413 | 165.2 / 2582 | 14.2 / 395 | zita-conv, zita-resamp, faust-c++, IR, valve |
| `gxmetal_head` | GxMetalHead | Amp/pré | GPL-2.0+ | 10.9 / 376 | 166.9 / 2614 | 14.2 / 395 | zita-conv, zita-resamp, faust-c++, IR, valve |
| `gx_cabinet` | GxCabinet | Cabine/IR | GPL-2.0+ | 20.3 / 686 | 151.8 / 2201 | 7.4 / 187 | zita-conv, zita-resamp, faust-c++, IR |
| `gx_delay` | Gx_delay_stereo | Delay/eco | GPL-2.0+ | 8.7 / 301 | 30.6 / 1006 | 9 / 234 | faust-c++ |
| `gx_digital_delay` | Gx_digital_delay_ | Delay/eco | GPL-2.0+ | 29.9 / 913 | 45.9 / 1442 | 7.8 / 182 | faust-c++ |
| `gx_digital_delay_st` | Gx_digital_delay_st_ | Delay/eco | GPL-2.0+ | 36 / 1035 | 52 / 1564 | 7.8 / 182 | faust-c++ |
| `gx_duck_delay` | Gx_duck_delay_ | Delay/eco | GPL-2.0+ | 13.1 / 484 | 26.7 / 909 | 5.7 / 139 | faust-c++ |
| `gx_duck_delay_st` | Gx_duck_delay_st_ | Delay/eco | GPL-2.0+ | 23.8 / 720 | 37.3 / 1145 | 6.3 / 149 | faust-c++ |
| `gx_echo` | Gx_echo_stereo | Delay/eco | GPL-2.0+ | 8.7 / 300 | 30.2 / 995 | 9 / 234 | faust-c++ |
| `gx_livelooper` | Gx_livelooper_ | Delay/eco | GPL-2.0+ | 40.5 / 1389 | 45.3 / 1557 | 31.5 / 862 | faust-c++ |
| `gx_mbdelay` | Gx_mbdelay_ | Delay/eco | GPL-2.0+ | 7.7 / 281 | 43.6 / 1303 | 26.5 / 726 | faust-c++ |
| `gx_mbecho` | Gx_mbecho_ | Delay/eco | GPL-2.0+ | 7.6 / 276 | 41.6 / 1233 | 26.1 / 716 | faust-c++ |
| `gxechocat` | GxEchoCat | Delay/eco | GPL-2.0+ | 7.4 / 286 | 61.1 / 1704 | 6.3 / 152 | faust-c++ |
| `gxtape` | GxTape | Delay/eco | GPL-2.0+ | 30.4 / 1031 | 104.9 / 2964 | 8.2 / 197 | faust-c++ |
| `gxtape_st` | GxTapeStereo | Delay/eco | GPL-2.0+ | 24.4 / 819 | 145.4 / 3696 | 8.2 / 197 | faust-c++ |
| `gxtubedelay` | GxRedeyeFx | Delay/eco | GPL-2.0+ | 8.4 / 304 | 42.6 / 1326 | 3.8 / 89 | faust-c++ |
| `gx_compressor` | Gx_compressor | Dinâmica | GPL-2.0+ | 8.5 / 290 | 26.5 / 891 | 6.2 / 151 | faust-c++ |
| `gx_expander` | Gx_expander | Dinâmica | GPL-2.0+ | 7.8 / 268 | 19.8 / 686 | 14.5 / 402 | faust-c++ |
| `gx_mbcompressor` | Gx_mbcompressor_ | Dinâmica | GPL-2.0+ | 8.3 / 301 | 51.5 / 1518 | 19.8 / 516 | faust-c++ |
| `gx_susta` | Gx_susta_ | Dinâmica | GPL-2.0+ | 7.3 / 265 | 37 / 1022 | 3.3 / 78 | faust-c++ |
| `gx_aclipper` | Gx_aclipper_ | Distorção/fuzz | GPL-2.0+ | 19.9 / 640 | 65.1 / 1868 | 3.7 / 89 | zita-resamp, faust-c++ |
| `gx_bmp` | Gx_bmp_ | Distorção/fuzz | GPL-2.0+ | 7.2 / 267 | 49.2 / 1379 | 6.8 / 172 | zita-resamp, faust-c++ |
| `gx_bossds1` | Gx_bossds1_ | Distorção/fuzz | GPL-2.0+ | 8 / 288 | 58 / 1620 | 5.8 / 144 | zita-resamp, faust-c++ |
| `gx_cstb` | Gx_cstb_ | Distorção/fuzz | GPL-2.0+ | 7.8 / 286 | 34.2 / 1086 | 5.9 / 146 | faust-c++ |
| `gx_fumaster` | Gx_fumaster_ | Distorção/fuzz | GPL-2.0+ | 7.5 / 265 | 34.1 / 981 | 14 / 392 | faust-c++ |
| `gx_fuzz` | Gx_fuzz_ | Distorção/fuzz | GPL-2.0+ | 11.3 / 406 | 36.6 / 1360 | 14.5 / 402 | zita-resamp, faust-c++ |
| `gx_fuzzface` | Gx_fuzzface_ | Distorção/fuzz | GPL-2.0+ | 7.5 / 265 | 32.4 / 966 | 13.9 / 389 | faust-c++ |
| `gx_fuzzfacefm` | Gx_fuzzfacefm_ | Distorção/fuzz | GPL-2.0+ | 18.8 / 603 | 46.7 / 1387 | 14.2 / 395 | faust-c++ |
| `gx_hogsfoot` | Gx_hogsfoot_ | Distorção/fuzz | GPL-2.0+ | 7.5 / 264 | 19.3 / 667 | 13.9 / 389 | faust-c++ |
| `gx_mbdistortion` | Gx_mbdistortion_ | Distorção/fuzz | GPL-2.0+ | 7.9 / 277 | 38.2 / 1164 | 26.3 / 720 | faust-c++ |
| `gx_muff` | Gx_muff_ | Distorção/fuzz | GPL-2.0+ | 7.2 / 266 | 36.8 / 1096 | 13.9 / 389 | zita-resamp, faust-c++ |
| `gx_mxrdist` | Gx_mxrdist_ | Distorção/fuzz | GPL-2.0+ | 7.4 / 265 | 46.6 / 1308 | 13.9 / 389 | zita-resamp, faust-c++ |
| `gx_rangem` | Gx_rangem_ | Distorção/fuzz | GPL-2.0+ | 7.3 / 264 | 21.4 / 711 | 13.9 / 389 | faust-c++ |
| `gx_scream` | Gx_scream_ | Distorção/fuzz | GPL-2.0+ | 7.3 / 264 | 18.5 / 651 | 13.2 / 373 | faust-c++ |
| `gxts9` | Gxts9sim | Distorção/fuzz | GPL-2.0+ | 13.2 / 462 | 23.9 / 812 | 5.7 / 141 | faust-c++ |
| `gx_barkgraphiceq` | Gx_barkgraphiceq_ | EQ/boost | GPL-2.0+ | 47.4 / 1773 | 55.1 / 2016 | 5.4 / 144 | faust-c++ |
| `gx_graphiceq` | Gx_graphiceq_ | EQ/boost | GPL-2.0+ | 7.7 / 279 | 63.8 / 1814 | 8.5 / 214 | faust-c++ |
| `gx_hfb` | Gx_hfb_ | EQ/boost | GPL-2.0+ | 7.1 / 264 | 19.4 / 673 | 13.9 / 389 | faust-c++ |
| `gxbooster` | Gxbooster | EQ/boost | GPL-2.0+ | 13 / 507 | 13 / 507 | 13.3 / 375 | — |
| `gxtilttone` | GxTiltTone | EQ/boost | GPL-2.0+ | 7.8 / 281 | 52.7 / 1383 | 3.6 / 85 | faust-c++ |
| `gx_chorus` | Gx_chorus_stereo | Modulação/pitch | GPL-2.0+ | 8.8 / 297 | 31.4 / 1031 | 6.1 / 150 | faust-c++ |
| `gx_colwah` | Gx_colwah_ | Modulação/pitch | GPL-2.0+ | 9.5 / 345 | 98.8 / 2934 | 6.3 / 154 | faust-c++ |
| `gx_detune` | Gx_detune_ | Modulação/pitch | WOL + GPL-2.0+ | 30.2 / 1034 | 46.2 / 1550 | 12.7 / 327 | zita-resamp, fftw, faust-c++ |
| `gx_flanger` | Gx_flanger | Modulação/pitch | GPL-2.0+ | 7.7 / 269 | 21.5 / 734 | 14.7 / 406 | faust-c++ |
| `gx_gcb_95` | Gx_gcb_95_ | Modulação/pitch | GPL-2.0+ | 7.3 / 264 | 23.7 / 754 | 13.9 / 389 | faust-c++ |
| `gx_oc_2` | Gx_oc_2_ | Modulação/pitch | GPL-2.0+ | 15.4 / 539 | 23.1 / 782 | 14 / 392 | faust-c++ |
| `gx_phaser` | Gx_phaser | Modulação/pitch | GPL-2.0+ | 7.6 / 266 | 20.5 / 708 | 14.1 / 393 | faust-c++ |
| `gx_switched_tremolo` | Gx_switched_tremolo_ | Modulação/pitch | GPL-2.0+ | 8.1 / 270 | 23.5 / 799 | 4.4 / 100 | faust-c++ |
| `gx_tremolo` | Gx_tremolo | Modulação/pitch | GPL-2.0+ | 7.9 / 273 | 20.5 / 704 | 4 / 93 | faust-c++ |
| `gx_vibe` | Gx_vibe_ | Modulação/pitch | GPL-2.0+ | 32.2 / 1166 | 39.8 / 1409 | 4.8 / 106 | faust-c++ |
| `gxautowah` | GxAutoWah | Modulação/pitch | GPL-2.0+ | 14.3 / 488 | 25 / 838 | 6.4 / 162 | faust-c++ |
| `gxtubetremelo` | GxTubeTremelo | Modulação/pitch | GPL-2.0+ | 8 / 282 | 36.1 / 1145 | 3.8 / 89 | faust-c++ |
| `gxtubevibrato` | GxTubeVibrato | Modulação/pitch | GPL-2.0+ | 8 / 281 | 39 / 1236 | 3.8 / 89 | faust-c++ |
| `gx_mbreverb` | Gx_mbreverb_ | Reverb | GPL-2.0+ | 50.6 / 1500 | 104.7 / 2960 | 26.5 / 726 | faust-c++ |
| `gx_reverb` | Gx_reverb_stereo | Reverb | GPL-2.0+ | 8.1 / 274 | 30.4 / 943 | 16 / 447 | faust-c++ |
| `gx_room_simulator` | Gx_room_simulator_ | Reverb | GPL-2.0+ | 26.8 / 815 | 34.5 / 1058 | 15.3 / 424 | faust-c++ |
| `gx_shimmizita` | Gx_shimmizita_ | Reverb | GPL-2.0+ | 40.7 / 1068 | 48.4 / 1311 | 5.1 / 112 | faust-c++ |
| `gx_zita_rev1` | Gx_zita_rev1_stereo | Reverb | GPL-2.0+ | 7.6 / 275 | 40.6 / 1162 | 7.2 / 169 | faust-c++ |
| `gxtuner` | GxTuner | Utilitário | GPL-2.0+ | 79.3 / 2399 | 101.6 / 3156 | 7.3 / 175 | zita-resamp, fftw, faust-c++ |

**Totais (soma das linhas):** DSP próprio **1436 KB / 44803 linhas**;
com includes **5702 KB / 149178 linhas**. A diferença vem dos arquivos
compartilhados contados em cada módulo (ex.: `cab_data.cc`, `valve.h`, `gx_common.h`).

## 4. Quem depende do quê

- **GTK**: **nenhum** módulo de DSP. As UIs dos LV2 usam **xputty/X11** (`*_ui.cpp`) e o aplicativo
  GTK é `src/gx_head` — fora do porte.
- **Runtime do Faust**: **nenhum**. O `.dsp` é convertido em C++ e **incluído** no módulo
  (`#include "chorus.cc"`); não há `libfaust` em tempo de execução.
- **zita-convolver** (8): `gx_amp`, `gx_amp_stereo`, `gx_jcm800pre`, `gx_jcm800pre_st`, `gx_redeye`, `gxmetal_amp`, `gxmetal_head`, `gx_cabinet`.
- **zita-resampler** (16): `gx_amp`, `gx_amp_stereo`, `gx_jcm800pre`, `gx_jcm800pre_st`, `gx_redeye`, `gxmetal_amp`, `gxmetal_head`, `gx_cabinet`, `gx_aclipper`, `gx_bmp`, `gx_bossds1`, `gx_fuzz`, `gx_muff`, `gx_mxrdist`, `gx_detune`, `gxtuner`.
- **FFTW** (2): `gx_detune`, `gxtuner` — dependência externa (GPL-2+ do FFTW; confirmar versão/embutimento).
- **Dados de IR embutidos** (8): `gx_amp`, `gx_amp_stereo`, `gx_jcm800pre`, `gx_jcm800pre_st`, `gx_redeye`, `gxmetal_amp`, `gxmetal_head`, `gx_cabinet`.
- **Modelagem de válvula/preamp compartilhada** (4): `gx_amp`, `gx_amp_stereo`, `gxmetal_amp`, `gxmetal_head`.
- **NAM/RTNeural**: **nenhum** módulo dos 70 usa; os modelos neurais do app estão em `src/NAM`
  (submódulo, não auditado) e não fazem parte deste mapa.

## 5. Observações para o porte

1. **Nenhum módulo é GPL-3+ isolado**: todos os 70 são GPL-2.0+ (o conjunto do Guitarix é GPL-3+
   por causa de zita/abgate, como na A1). Exceção de licença dentro de módulo: `gx_detune` inclui
   `detune.cc` sob **WOL** (1 módulo: `gx_detune`).
2. **Os amps de verdade carregam muita coisa**: `gx_amp` e `gx_amp_stereo` chegam a ~735 KB/1 MB
   de includes por causa de `cab_data.cc` + IR formers + valve. `gx_jcm800pre` já traz o DSP
   próprio grande (~192 KB/4.7k linhas).
3. **Pedais simples são baratos**: `gx_compressor`, `gx_phaser`, `gx_tremolo`, `gx_scream`,
   `gx_rangem` ficam entre **~19 e 27 KB** com includes e não puxam zita nem FFTW.
4. **`gx_detune` e `gxtuner`** são os únicos com FFTW — e `gxtuner` também usa zita-resampler.
5. **`gxbooster`** é o único sem DSP gerado por Faust (13 KB, sem includes externos).
6. **`abgate`** (LGPL-3.0+) **não está entre os 70**: ele mora em `src/plugins/abgate.cc`, junto
   com os `.dsp`/`_ui.glade` do aplicativo GTK.
7. **Duplicação**: `src/faust/` (265 `.dsp`) e `src/faust-generated/` (140 arquivos) são a árvore
   do aplicativo; a árvore dos LV2 é `src/LV2/faust/` e `src/LV2/faust-generated/`. Para o porte,
   usar **somente a árvore LV2**.
8. **UI**: todos os `*_ui.cpp` são xputty; podem ser descartados. O painel do Preseter entra no
   lugar, como no catálogo de efeitos.

## 6. Conclusão da B1

- O material está mapeado e é **homogêneo**: 70 módulos LV2, todos GPL-2.0+ no módulo (só o `gx_detune` mistura WOL), com DSP em
  C++ (Faust compilado) e sem dependência de GTK.
- O custo de um porte varia de **~19 KB** (pedal simples) a **~1 MB de includes** (amp com cab
  embutida + zita).
- Para o **B3** (escolha dos candidatos), os grupos naturais são:
  - baratos e sem dependência extra: `gx_compressor`, `gx_phaser`, `gx_tremolo`, `gx_scream`,
    `gx_rangem`, `gx_chorus`, `gx_delay`, `gx_reverb`;
  - médios com IR/cabine: `gx_cabinet` (isolado) ou `gx_amp` (amp + cab juntos);
  - evitar no primeiro lote: `gx_detune`/`gxtuner` (FFTW + WOL) e `gx_jcm800pre` (DSP grande).

**Próximo passo:** B2 (como o Guitarix roda hoje no Preseter — LV2 vs. nativo).

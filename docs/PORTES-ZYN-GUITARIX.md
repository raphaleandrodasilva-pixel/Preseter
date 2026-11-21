# Portes ZynAddSubFX e Guitarix — Parte A1: licenças

> **Somente pesquisa e relatório.** Nenhum código de produto foi copiado para o Preseter,
> nenhuma dependência foi adicionada e nada foi compilado com estes fontes.
> Este documento não é aconselhamento jurídico. Licença do Preseter: **AGPL-3.0-or-later**.
>
> Regra aplicada: toda licença abaixo tem **arquivo e linha**; o que não foi possível conferir
> no código está marcado **`a confirmar`**. GPL-2.0-**or-later** é compatível com a AGPL-3.0;
> GPL-2.0-**only** não seria.

Data da auditoria: **2026-11-21**.
Clones rasos (`--depth 1`, somente leitura) em `%TEMP%\opencode\portes\`, fora do repositório do Preseter.

| Fonte | Repositório | Commit auditado |
|---|---|---|
| ZynAddSubFX | `github.com/zynaddsubfx/zynaddsubfx` | `c379439e41b34dee5eededbf5b13e7514c4ded64` (2026-09-09) |
| Zyn — submódulo `rtosc` | `github.com/fundamental/rtosc` | `41b8b0ac9151163da4dae78ba368c78dc9893984` |
| Zyn — submódulo `instruments` | `github.com/zynaddsubfx/instruments` | `c5c912131b31df5fdf372d2f06a25aaf2375837f` |
| Zyn — submódulo `DPF` | `github.com/DISTRHO/DPF` | `86a621bfd86922a49ce593fec2a618a1e0cc6ef3` |
| Guitarix | `github.com/brummer10/guitarix` | `2a357f6529c89a0c7b3fcd9a4d3c36d16b07c367` (2026-10-31) |

**Método.** Para cada arquivo-fonte (`.c/.cc/.cpp/.h/.hpp/.hxx`), leitura do cabeçalho e
classificação por SPDX ou texto da licença; contagem por repositório; toda exceção
(não-GPL-2+) foi aberta e conferida linha a linha. Arquivos sem cabeçalho foram listados à parte.

---

## 1. ZynAddSubFX

### 1.1 Motor (o que interessa para o instrumento nativo)

`src/` tem **308 arquivos-fonte**; **287** declaram **GPL-2.0-or-later**.

| Área | Exemplo de evidência | Licença | Status |
|---|---|---|---|
| ADsynth (`ADnote`) | `src/Synth/ADnote.cpp:9-12` — “either version 2 … or any later version” | GPL-2.0+ | **compatível** |
| SUBsynth (`SUBnote`) | `src/Synth/SUBnote.cpp:9-12` | GPL-2.0+ | **compatível** |
| PADsynth (`PADnote`) | `src/Synth/PADnote.cpp:9-12` | GPL-2.0+ | **compatível** |
| Envelopes / LFO / OscilGen | `src/Synth/Envelope.cpp`, `src/Synth/LFO.cpp`, `src/Synth/OscilGen.cpp` (mesmo cabeçalho) | GPL-2.0+ | **compatível** |
| Filtros | `src/DSP/Filter.cpp:9-12`; `src/DSP/AnalogFilter.cpp`; `src/DSP/SVFilter.cpp` | GPL-2.0+ | **compatível** |
| Parâmetros do motor | `src/Params/ADnoteParameters.cpp:9-12` | GPL-2.0+ | **compatível** |

### 1.2 Exceções em `src/` (conferidas uma a uma)

| Arquivo | Evidência | Situação | Status |
|---|---|---|---|
| `src/DSP/MoogFilter.cpp` | sem cabeçalho no `.cpp`; `src/DSP/MoogFilter.h:9-11` é GPL-2.0+ | mesmo módulo, licença no header | **compatível** (citar o `.h`) |
| `src/DSP/CombFilter.cpp` | sem cabeçalho no `.cpp`; `src/DSP/CombFilter.h:9-11` é GPL-2.0+ | idem | **compatível** (citar o `.h`) |
| `src/Synth/WatchPoint.cpp` | `:8` “version 2 of the GNU General Public License” e `:12` “(version 2 or later)” | texto contraditório (pode ser GPL-2.0-only) | **a confirmar** — não é necessário ao motor |
| `src/Misc/MemLocker.cpp` | `:8` versão 2; `:12` “(version 2 or later)” | contraditório | **a confirmar** — utilitário, não é DSP |
| `src/Misc/MsgParsing.cpp` | `:8` e `:12` idem | contraditório | **a confirmar** — usado pela camada OSC/UI |
| `src/Plugin/AbstractFX.hpp` | `:9` e `:13` idem | contraditório; é da camada DPF | **a confirmar** — não é DSP |
| `src/Effects/CombFilterBank.{h,cpp}` | **sem cabeçalho** | sem evidência por arquivo | **a confirmar** |
| `src/Containers/ScratchString.*` | **sem cabeçalho** | sem evidência | **a confirmar** |
| `src/Misc/BankDb.*`, `src/Misc/Schema.*` | **sem cabeçalho** | sem evidência | **a confirmar** |
| `src/Nio/jack_osc.h` | `:8-20` — texto ZLIB (“Permission is granted … as-is”) | ZLIB | **compatível** |
| `src/Output/DSSIaudiooutput.cpp` | `:19` — “public domain” | domínio público | **compatível** |
| `src/Tests/*` | sem cabeçalho | testes, não vão para o produto | **a confirmar** (não necessário) |

Conclusão parcial: **o núcleo do som (AD/SUB/PAD, filtros, envelopes, LFO, osciladores) é GPL-2.0-or-later** —
compatível com a AGPL-3.0. As pendências são utilitários/camada de plugins, não o DSP.

### 1.3 Dependências do Zyn

| Dependência | Evidência | Licença | Status |
|---|---|---|---|
| `rtosc` | `rtosc/LICENSE:1-9` (texto MIT/Expat); 25 arquivos com texto MIT; **93 sem cabeçalho** | MIT (projeto) | **compatível**; por arquivo copiado, **a confirmar** |
| `tlsf` | `tlsf/tlsf.h` diz “public domain”; `tlsf.c` e `tlsfbits.h` sem cabeçalho | domínio público (projeto) | **a confirmar** por arquivo; alocador, provavelmente dispensável |
| `DPF` | `DPF/LICENSE:1-9` é ISC; por arquivo: 5 SPDX MIT, 4 domínio público, 4 MIT, 3 LGPL (versão não explícita), 3 LGPL-2.1+, 2 GPL-3.0+, 1 GPL-2.0+, **212 sem cabeçalho** | mista | **a confirmar** por arquivo; só é necessário para o wrapper LV2, **não para o motor** |

Observação: o Preseter não precisa da interface FLTK/Zyn-Fusion nem do wrapper DPF para um
instrumento nativo; `rtosc` só entraria se mantivéssemos o sistema de parâmetros por OSC.

### 1.4 Bancos e presets (`instruments`)

- Submódulo `instruments` no commit `c5c91213…`: **32 bancos**, **1.318 arquivos `.xiz`** (1.402 arquivos no total).
- **Não existe `LICENSE`, `COPYING`, `README` nem aviso de licença em nenhum arquivo do submódulo** (busca por
  nome e por texto, sem resultado).
- **Status: `a confirmar`.** Sem uma licença explícita, não há base para redistribuir os bancos.
  Recomendação para o C3: **presets próprios** (ou contato com os autores), sem copiar os `.xiz`.

---

## 2. Guitarix

### 2.1 Código

- `trunk/COPYING:1-5`: “The code written for Guitarix is licensed under GPL version 2 or later, but there are
  some source files / libraries … GPL version 3 or later or LGPL version 3 or later, so that Guitarix as a whole
  must be conveyed under GPL version 3 or later.”
- `trunk/debian/copyright` (resumo Debian): GPL-2.0-or-later.
- Varredura de `trunk/src` (**1.055 arquivos**): **325 GPL-2.0+**, **8 GPL-3.0+**, 1 LGPL-2.1+, 1 BSD-3-Clause,
  1 Wide Open License, **719 sem cabeçalho** (a maioria em `faust-generated/`, saída do Faust).

| Módulo (exemplo) | Evidência | Licença | Status |
|---|---|---|---|
| `src/LV2/gx_amp.lv2/gx_amp.cc` | `:4-9` “either version 2 … or any later version” | GPL-2.0+ | **compatível** |
| `src/LV2/gx_cabinet.lv2/gxcabinet.cpp` | `:4-9` idem | GPL-2.0+ | **compatível** |
| `src/LV2/DSP/*.cc` (ex.: `cab_data.cc`) | cabeçalho GPL-2.0+ | GPL-2.0+ | **compatível** |
| `src/LV2/gx_detune.lv2/detune.cc` | `:13-20` “The Wide Open License (WOL)” | WOL (permissiva, exige o aviso) | **a confirmar** (compatibilidade com GPLv3) |
| `src/faust-generated/*.cc` | ex.: `autowah.cc:1-2` só diz “generated … by dsp2cc/Faust”; **sem licença** | projeto GPL-2.0+, arquivo sem cabeçalho | **a confirmar** por arquivo |
| `ladspa/monoamp.cpp` | `:1-5` “license: GPL” (sem versão) | GPL sem versão | **a confirmar** |
| `src/headers/ladspa.h` | cabeçalho LGPL-2.1+ | LGPL-2.1+ | **compatível** |
| `src/headers/ParallelThread.h` | `SPDX-License-Identifier: BSD-3-Clause` | BSD-3-Clause | **compatível** |

Conclusão parcial: o conjunto do Guitarix é **GPL-3.0-or-later** (pelo próprio `COPYING`), portanto
**compatível** com a AGPL-3.0. Os pontos de atenção são `gx_detune` (WOL) e os arquivos gerados sem
cabeçalho (herdam o projeto, mas faltam evidência por arquivo).

### 2.2 Convolução e reamostragem

| Biblioteca | Evidência | Licença | Status |
|---|---|---|---|
| `zita-convolver` | `src/zita-convolver/zita-convolver.h:6-9` “either version 3” | GPL-3.0+ | **compatível** |
| `zita-resampler-1.1.0` | `src/zita-resampler-1.1.0/zita-resampler/resampler.h:6-9` “either version 3” | GPL-3.0+ | **compatível** |

### 2.3 IRs e cabines

- `trunk/IR` tem **91 arquivos `.wav`**: `BestPlugins_Amps` (20), `BestPlugins_Bands` (70) e `greathall.wav`.
- `IR/BestPlugins_Amps/LICENSE:4-7` e `IR/BestPlugins_Bands/LICENSE:4-7`: **GPL-2.0-or-later**,
  Copyright (C) 2013 David Fau Casquel. → **compatível**.
- `IR/greathall.wav`: **sem licença** no repositório → **`a confirmar`**.

### 2.4 Outros itens citados no documento

| Item | Evidência | Licença | Status |
|---|---|---|---|
| Fontes (`trunk/fonts`, Roboto Condensed) | `fonts/LICENSE.txt:2` “Apache License, Version 2.0” | Apache-2.0 | **compatível** (com GPLv3/AGPLv3) |
| `abgate` | `src/plugins/abgate.cc:1-6` — “GNU Lesser General Public License … either version 3 … or any later version”, Copyright 2011 Antanas Bručas | LGPL-3.0+ | **compatível** |
| Submódulos `NAM/NeuralAmpModelerCore` e `RTNeural/RTNeural` | não clonados nesta auditoria | — | **`a confirmar`** (só entram se o B3 escolher amps neurais) |

---

## 3. Resumo (semáforo)

| Item | Status |
|---|---|
| Zyn — motor (AD/SUB/PAD, filtros, envelopes, LFO, osciladores) | **compatível** (GPL-2.0+) |
| Zyn — utilitários/camada DPF (WatchPoint, MemLocker, MsgParsing, AbstractFX) | **a confirmar** (texto contraditório; não são DSP) |
| Zyn — `rtosc` | **compatível** (MIT) |
| Zyn — `tlsf` | **a confirmar** (dispensável) |
| Zyn — bancos/presets (`instruments`) | **a confirmar** (sem licença) → recomendo presets próprios |
| Guitarix — código dos módulos | **compatível** (GPL-2.0+, conjunto GPL-3.0+), com ressalvas pontuais |
| Guitarix — `zita-convolver` / `zita-resampler` | **compatível** (GPL-3.0+) |
| Guitarix — IRs BestPlugins | **compatível** (GPL-2.0+); `greathall.wav` **a confirmar** |
| Guitarix — fontes | **compatível** (Apache-2.0) |
| `gx_detune` (WOL) | **a confirmar** |
| NAM/RTNeural (submódulos) | **a confirmar** (não auditados) |

## 4. Conclusão da A1

1. **Nada impede o porte** do motor do ZynAddSubFX nem dos módulos do Guitarix sob a AGPL-3.0 do Preseter:
   o núcleo é GPL-2.0-or-later e o Guitarix declara o conjunto como GPL-3.0-or-later.
2. **Bancos do Zyn não podem ser distribuídos** sem licença explícita — o caminho seguro é criar presets próprios (C3).
3. **Não copiar** os utilitários com texto contraditório (GPL-2.0-only em potencial) nem os arquivos gerados sem
   cabeçalho sem antes resolver a atribuição — nenhum deles é necessário para o DSP.
4. Os módulos com licença de terceiros que entrariam no porte (zita, IRs BestPlugins, fontes) estão **confirmados**.

## 5. Próximo passo (A2 — atribuição)

Listar, no formato do MDA/OpenWurli, o que deve constar em `UPSTREAM.md` e nos créditos do app:
ZynAddSubFX (autores, commit, GPL-2.0+, arquivos usados), `rtosc` (Mark McCurry, MIT), Guitarix
(Hermann Meyer e demais, GPL-3.0+), `zita-convolver`/`zita-resampler` (Fons Adriaensen, GPL-3.0+),
IRs BestPlugins (David Fau Casquel, GPL-2.0+), fontes Roboto (Apache-2.0) e, se usados, `gx_detune`
(Stephan M. Bernsee, WOL — com o aviso preservado) e NAM/RTNeural (licença a confirmar).

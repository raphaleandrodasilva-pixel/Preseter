# Atribuição dos portes ZynAddSubFX e Guitarix — Parte A2

> **Somente pesquisa e relatório.** Nenhum diretório em `engine/third_party/` foi criado e nenhum
> código de terceiro foi copiado. Os blocos abaixo são texto pronto para o porte (B4/C4).
> Não é aconselhamento jurídico. Licença do Preseter: **AGPL-3.0-or-later**.
>
> Base: auditoria da **A1** (`docs/PORTES-ZYN-GUITARIX.md`), commits
> Zyn `c379439e…`, rtosc `41b8b0ac…`, instruments `c5c91213…`, DPF `86a621bf…`,
> Guitarix `2a357f65…`, em 2026-11-21.

## 0. Onde os créditos vivem hoje

- `docs/LICENCAS.md` **não existe** no HEAD atual (foi removido no commit `4b9df84`).
- A lista viva de créditos está em `src/renderer/components/concert/AboutModal.tsx:8-18`
  (Sobre) e em `HelpModal.tsx` (seção “Créditos”).
- Portanto, antes do porte é preciso **recriar `docs/LICENCAS.md`** e manter o Sobre em sincronia.
  Os textos abaixo são os blocos que devem entrar nesses dois lugares.

---

## 1. Blocos para `docs/LICENCAS.md`

### 1.1 ZynAddSubFX — motor do Preseter Zyn (instrumento)

- Código: **ZynAddSubFX**, autor original **Nasca Octavian Paul**; manutenção e contribuições de
  **Mark McCurry, Hans Petter Selasky, Christopher Oliver, Johannes Lorenz, Friedolino,
  Daniel Sheeler, Michael Kirchner** e demais nomes de `AUTHORS.txt` (cabeçalhos por arquivo
  preservados).
- Repositório: https://github.com/zynaddsubfx/zynaddsubfx
- Commit: `c379439e41b34dee5eededbf5b13e7514c4ded64` (2026-09-09)
- Licença: **GPL-2.0-or-later** (`COPYING`; cada arquivo do motor traz “either version 2 … or any
  later version” — ex.: `src/Synth/ADnote.cpp:9-12`).
- Arquivos usados: motor de síntese (`src/Synth/`, `src/DSP/`, `src/Params/` e o subconjunto
  necessário de `src/Misc/` e `src/Containers/`). A lista final fecha no **C4**.
- Exceções que **não** entram: `WatchPoint.cpp`, `MemLocker.cpp`, `MsgParsing.cpp`,
  `Plugin/AbstractFX.hpp` (texto de licença contraditório — ver A1) e a interface FLTK/Zyn-Fusion.
- Atribuição no app: “ZynAddSubFX (motor) — Nasca Octavian Paul e colaboradores — GPL-2.0-or-later”.

### 1.2 rtosc — parâmetros/OSC (somente se usado)

- Autor: **Mark McCurry** (`LICENSE:1`).
- Repositório: https://github.com/fundamental/rtosc
- Commit: `41b8b0ac9151163da4dae78ba368c78dc9893984`
- Licença: **MIT/Expat** (`LICENSE:1-9`).
- Uso: apenas se mantivermos o sistema de parâmetros por OSC; um painel próprio pode dispensar.
- Atribuição: “rtosc — Mark McCurry — MIT”.

### 1.3 Guitarix — amps, cabines e pedais (efeitos)

- Autores: **Hermann Meyer, James Warden, Andreas Degert, Pete Shorthose** (`COPYING`, rodapé);
  **Steve Poskitt** aparece nos módulos de amp (`src/LV2/gx_amp.lv2/gx_amp.cc:2`); **Antanas Bručas**
  no `abgate` (`src/plugins/abgate.cc:3`).
- Repositório: https://github.com/brummer10/guitarix
- Commit: `2a357f6529c89a0c7b3fcd9a4d3c36d16b07c367` (2026-10-31)
- Licença: o conjunto é **GPL-3.0-or-later** (`COPYING:1-5`: código próprio GPL-2+ com partes
  GPL-3+/LGPL-3+). Cada arquivo mantém o próprio aviso (os módulos de amp conferidos são GPL-2.0+).
- Arquivos usados: os módulos escolhidos no **B3** (`src/LV2/<módulo>/`, `src/LV2/DSP/`,
  `src/faust-generated/` correspondente). Lista final no **B4**.
- Atribuição: “Guitarix — Hermann Meyer, Andreas Degert, Pete Shorthose e colaboradores —
  GPL-3.0-or-later”.

### 1.4 zita-convolver e zita-resampler — convolução/reamostragem

- Autor: **Fons Adriaensen** (`zita-convolver.h:3`, `resampler.h:3`).
- Origem no Guitarix: `trunk/src/zita-convolver/` e `trunk/src/zita-resampler-1.1.0/`.
  URL oficial: **a confirmar** (não consta no código).
- Licença: **GPL-3.0-or-later** (`zita-convolver.h:6-9`, `resampler.h:6-9`).
- Atribuição: “zita-convolver / zita-resampler — Fons Adriaensen — GPL-3.0-or-later”.

### 1.5 IRs BestPlugins — cabines

- Autor: **David Fau Casquel**, 2013 (`IR/BestPlugins_Amps/LICENSE:3`).
- Licença: **GPL-2.0-or-later** (`.../LICENSE:4-7`); 20 IRs em `BestPlugins_Amps` e 70 em
  `BestPlugins_Bands`.
- O texto da licença deve ser distribuído junto dos `.wav` (hoje já está, um `LICENSE` por pasta).
- **`IR/greathall.wav` não entra** enquanto a licença não for confirmada.
- Atribuição: “IRs BestPlugins — David Fau Casquel — GPL-2.0-or-later”.

### 1.6 Fontes (somente se o app distribuir as Roboto do Guitarix)

- `trunk/fonts/LICENSE.txt:2` — **Apache-2.0**. Autoridade/nomes dos autores: **a confirmar** no
  arquivo (o texto não traz o copyright do autor). Provavelmente não será necessário: os painéis
  nativos usam a fonte da interface do Preseter.

### 1.7 `gx_detune` (somente se for um dos efeitos escolhidos)

- Autor: **Stephan M. Bernsee** (`detune.cc:9`), modificado por **Hermann Meyer** (2014, `:11`).
- Licença: **Wide Open License** (`detune.cc:13-20`) — permissiva, mas exige que o aviso de
  copyright e a licença apareçam **em todas as cópias do código-fonte**.
- Compatibilidade com GPLv3: **a confirmar** (A1). Se entrar, preservar o bloco inteiro no arquivo.

### 1.8 `abgate` (se o gate for escolhido)

- `src/plugins/abgate.cc:1-6` — **LGPL-3.0-or-later**, Copyright 2011 **Antanas Bručas**.
- Atribuição: “abGate — Antanas Bručas — LGPL-3.0-or-later”.
- Compatível; se o arquivo for modificado, manter o aviso e disponibilizar a fonte (já é o caso do Preseter).

---

## 2. Modelos de `UPSTREAM.md` (um por pasta do porte)

Formato igual ao `engine/third_party/mda-epiano/UPSTREAM.md` e ao `openwurli/UPSTREAM.md`.

### 2.1 `engine/third_party/zynaddsubfx/UPSTREAM.md`

```md
# ZynAddSubFX (importação)

Base do instrumento nativo **Preseter Zyn**.

## Origem

- Projeto: https://github.com/zynaddsubfx/zynaddsubfx
- Commit: c379439e41b34dee5eededbf5b13e7514c4ded64 (2026-09-09)
- Licença: GPL-2.0-or-later (ver `COPYING`).
- Autores: Nasca Octavian Paul (original); Mark McCurry, Hans Petter Selasky,
  Christopher Oliver, Johannes Lorenz, Friedolino, Daniel Sheeler, Michael Kirchner
  e demais colaboradores de `AUTHORS.txt`.

## Arquivos importados

- `src/Synth/` (ADnote, SUBnote, PADnote, Envelope, LFO, OscilGen, ModFilter, Portamento,
  Resonance, SynthNote) — lista final no C4.
- `src/DSP/` (AnalogFilter, SVFilter, MoogFilter, FormantFilter, CombFilter, Filter).
- `src/Params/` e o subconjunto de `src/Misc/`/`src/Containers/` necessário ao motor.
- Interface FLTK/Zyn-Fusion, `rtosc` e DPF **não** entram no motor nativo.

## Adaptações do Preseter

- (a preencher no C4: remoção de UI/OSC, wrapper `NativeProcessor`, mapeamento de parâmetros.)

## Licenças por arquivo

- Conferir o cabeçalho de cada arquivo copiado; os utilitários com texto contraditório
  (`WatchPoint.cpp`, `MemLocker.cpp`, `MsgParsing.cpp`, `Plugin/AbstractFX.hpp`) não são usados.
```

### 2.2 `engine/third_party/rtosc/UPSTREAM.md` (só se usado)

```md
# rtosc (importação)

Suporte a parâmetros/OSC (se mantido).

## Origem

- Projeto: https://github.com/fundamental/rtosc
- Commit: 41b8b0ac9151163da4dae78ba368c78dc9893984
- Licença: MIT/Expat (ver `LICENSE`).
- Autor: Mark McCurry.

## Arquivos importados

- `include/rtosc/` e `src/` (subconjunto usado). Lista final no C4.
```

### 2.3 `engine/third_party/guitarix/UPSTREAM.md`

```md
# Guitarix (importação)

Base dos efeitos nativos **Preseter Amp / Cab / Pedal** (nomes finais no B3).

## Origem

- Projeto: https://github.com/brummer10/guitarix
- Commit: 2a357f6529c89a0c7b3fcd9a4d3c36d16b07c367 (2026-10-31)
- Licença: GPL-3.0-or-later no conjunto (ver `COPYING`).
- Autores: Hermann Meyer, James Warden, Andreas Degert, Pete Shorthose e colaboradores;
  Steve Poskitt nos amps; Antanas Bručas no abgate.

## Arquivos importados

- `src/LV2/<módulos escolhidos>/`, `src/LV2/DSP/` e `src/faust-generated/` correspondente
  (lista final no B4).
- Interface GTK, webui e o aplicativo `gx_head` **não** entram.
- IRs em `IR/BestPlugins_Amps` e `IR/BestPlugins_Bands` (com o `LICENSE` de cada pasta).

## Adaptações do Preseter

- (a preencher no B4: DSP sem LV2/GTK, parâmetros no padrão do catálogo de efeitos.)
```

### 2.4 `engine/third_party/zita/UPSTREAM.md` (se a convolução for portada)

```md
# zita-convolver / zita-resampler (importação)

Convolução de cabines e reamostragem.

## Origem

- Origem no Guitarix: `trunk/src/zita-convolver/` e `trunk/src/zita-resampler-1.1.0/`
  (commit 2a357f6529c89a0c7b3fcd9a4d3c36d16b07c367).
- Projeto original/URL: a confirmar (não consta no código).
- Licença: GPL-3.0-or-later (cabeçalhos).
- Autor: Fons Adriaensen.

## Arquivos importados

- `zita-convolver.{h,cc}` e `zita-resampler` (subconjunto). Lista final no B4.
```

---

## 3. Créditos dentro do app (Sobre e Help)

Acrescentar em `AboutModal.tsx` (lista `PROJECTS`) e na seção “Créditos” do Help, **quando o porte entrar**:

| Nome | Licença | Uso |
|---|---|---|
| ZynAddSubFX | GPL-2.0-or-later | Preseter Zyn |
| Guitarix | GPL-3.0-or-later | Preseter Amp/Cab/Pedal |
| zita-convolver / zita-resampler | GPL-3.0-or-later | Convolução de cabines |
| IRs BestPlugins (David Fau Casquel) | GPL-2.0-or-later | Cabines |
| rtosc (se usado) | MIT | Parâmetros/OSC |
| abGate (se usado) | LGPL-3.0-or-later | Noise gate |
| gx_detune (se usado) | Wide Open License | Detune |

## 4. Avisos obrigatórios (checagem antes do release)

- [ ] `docs/LICENCAS.md` recriado com os blocos da seção 1.
- [ ] `UPSTREAM.md` em cada pasta de `engine/third_party/` (seção 2), com a lista final de arquivos.
- [ ] `COPYING`/`LICENSE` de cada projeto guardados junto do código importado.
- [ ] Texto da GPL-2.0+ do Zyn e da GPL-3.0+ do Guitarix/zita distribuídos com o app.
- [ ] `LICENSE` das pastas de IR junto dos `.wav` distribuídos.
- [ ] Se `gx_detune` entrar: o bloco WOL completo preservado no arquivo.
- [ ] Sobre/Help com as linhas da seção 3.
- [ ] Nenhum banco `.xiz` do Zyn distribuído (licença não confirmada) — presets próprios.

## 5. Pendências (`a confirmar`)

| Item | Motivo |
|---|---|
| Bancos do Zyn (`instruments`) | sem `LICENSE`/`README` no submódulo (A1) |
| `IR/greathall.wav` | sem licença no repositório |
| URL oficial do zita | não consta no código; citar só após conferir |
| Compatibilidade do WOL com GPLv3 | licença permissiva com exigência de aviso; confirmar antes de usar |
| `abgate` (arquivo presente, mas fora do `src/LV2`) | confirmar se entra no porte |
| Suporte a DPF / rtosc | só se a arquitetura escolhida precisar |
| Autores das fontes Roboto | o `LICENSE.txt` é Apache-2.0, sem linha de copyright do autor |

## 6. Conclusão da A2

A atribuição é viável e barata: **três blocos principais** (Zyn GPL-2+, Guitarix GPL-3+ e zita
GPL-3+), mais **um de dados** (IRs BestPlugins GPL-2+), um MIT opcional (rtosc) e dois opcionais
com aviso específico (`abgate` LGPL-3+ e `gx_detune` WOL). O único ponto que **impede distribuir**
hoje são os **bancos do Zyn** — o caminho seguro é preset próprio.

**Próximo passo:** B1 (mapa dos módulos do Guitarix) — aguardando o “ok”.

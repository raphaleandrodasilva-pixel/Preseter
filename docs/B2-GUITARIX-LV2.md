# B2 — O Guitarix já roda no Preseter? LV2 hoje, VST3 depois?

> **Somente pesquisa e relatório.** Nada foi compilado, copiado ou adicionado ao repositório.
> Base: repositório do Preseter no HEAD atual + clone do Guitarix `2a357f65…` (2026-10-31).
> Licença do Preseter: **AGPL-3.0-or-later**. Não é aconselhamento jurídico.

## 1. Resposta curta

**Sim, o Preseter já hospeda LV2** — inclusive no Windows — e o Guitarix é distribuído como **LV2**
(não existe build oficial em VST3). Então:

- **Não é preciso portar** o DSP do Guitarix para usar os efeitos: basta instalar/embarcar os
  bundles `gx_*.lv2` e carregá-los como insert.
- **VST3 do Guitarix não existe** hoje. Para ter VST3 seria preciso **construir um wrapper**
  (projeto de engenharia à parte), não é uma questão de escolher o formato na hora de empacotar.

## 2. Evidências no código do Preseter

| Item | Evidência |
|---|---|
| O motor registra o formato LV2 | `engine/CMakeLists.txt:209` — `JUCE_PLUGINHOST_LV2=1` |
| O JUCE usado tem LV2 | `engine/build/_deps/juce-src/modules/juce_audio_processors/format_types/juce_LV2PluginFormat.{h,cpp}` |
| O formato é adicionado por padrão | `.../format/juce_AudioPluginFormatManagerHelpers.cpp:56-57` (`manager.addFormat (std::make_unique<LV2PluginFormat>())`) |
| O JUCE LV2 tem código para Windows | `juce_LV2PluginFormat.cpp:240,306,639` (ramo `JUCE_WINDOWS`) |
| Pastas LV2 no Windows | `src/main/platform/paths.ts` — `%APPDATA%\LV2`, `Arquivos de Programas\Common Files\LV2`, `(x86)` |
| Pastas LV2 no Linux | `src/main/platform/paths.ts` — `~/.lv2`, `/usr/lib/lv2` etc. |
| O app já trata ciclo de vida de LV2 | `src/main/index.ts:872-880` — ao descarregar um plugin de formato `LV2`, reinicia o áudio (workaround) |
| Instalador da coleção sabe instalar LV2 | `src/main/collection/CollectionInstaller.ts:571-575` (bundles `.lv2` em Linux) |

Conclusão: o caminho "LV2 externo" já está pronto no produto; não depende de porte.

## 3. O que o Guitarix oferece

- Build oficial: **LV2** (`trunk/src/LV2`, 70 módulos) + aplicativo GTK (`src/gx_head`).
- **Não há alvo VST3** no `wscript`/`README` do repositório.
- Existe receita de build **LV2 no Windows** com MSYS2/MinGW (`trunk/README.mswin`), com
  `--no-standalone --no-faust --includeresampler --includeconvolver --static-lib`; os bundles saem
  em `trunk/_bin/` (caminho exato **a confirmar** no build).
- As UIs dos LV2 são **xputty/X11** (`*_ui.cpp`); o DSP não depende de GTK nem de Faust runtime
  (ver B1). No Windows, a UI nativa pode não abrir; os **parâmetros** continuam acessíveis.

## 4. Roteiro de teste (documentado, não executado)

**Windows**
1. Instalar MSYS2 + pacotes do `trunk/README.mswin` (gcc, pkg-config, lv2, eigen, fftw, libffi,
   libsndfile, cairo, libsigc++).
2. `cd guitarix/trunk && ./waf configure … --no-standalone --no-faust --includeresampler
   --includeconvolver --static-lib && ./waf build && ./waf install --destdir=_bin`.
3. Copiar os `gx_*.lv2` de `_bin` para `%APPDATA%\LV2`.
4. No Preseter: Configurações → escanear plugins; conferir os itens com formato **LV2**.
5. Criar um layer, adicionar `GxAmplifier` (ou `Gx_cabinet`) como insert, tocar/entrar com áudio e
   verificar som, parâmetros, bypass e estado salvo no patch.

**Linux**: instalar o pacote `guitarix` da distro (LV2 em `/usr/lib/lv2`) e repetir os passos 4–5.

**Critério de aceite**: o insert processa áudio, os parâmetros respondem e o estado sobrevive a
salvar/reabrir o concert. Se a UI X11 não abrir no Windows, o teste continua válido pelo painel
de parâmetros do Preseter.

## 5. LV2 × VST3 para os efeitos de guitarra

| Aspecto | Guitarix LV2 (hoje) | VST3 (não existe pronto) |
|---|---|---|
| Funciona no Preseter | **Sim**, sem porte | Só com wrapper novo |
| Painel Preseter + presets | Sim — o painel é do app, o formato é indiferente | Sim, mas o wrapper precisa expor os parâmetros |
| Windows | Precisa de build MSYS2 dos bundles (ou usar os da distro no Linux) | Build do wrapper em MSVC/CMake |
| UI original | xputty/X11 (não essencial) | — |
| Distribuição | Copiar bundles `.lv2` (como a coleção já faz no Linux) | Novos binários VST3 |
| Licença | GPL-3+ (A1) | Mesma, mais o wrapper |

**Ponto-chave:** o que dá o "padrão Preseter" (painel, presets, MIDI) é a **camada do app**, não o
formato do plugin. Dá para fazer o mesmo com LV2 que fazemos com os VST3 do calfnXT — a diferença é
só o build/empacotamento.

## 6. Recomendação

1. **Curto prazo (sem porte):** usar o Guitarix como **LV2** — no Linux já funciona; no Windows,
   gerar os bundles com MSYS2. Se aprovado, o B4 vira "empacotar + painel Preseter", não "portar o DSP".
2. **Se VST3 for requisito de produto:** o caminho é construir um **wrapper VST3** para os módulos
   escolhidos (JUCE/DPF), o que é um projeto próprio (build, estado, parâmetros, presets). Não é
   obtido do Guitarix como está.
3. **Alternativa:** manter o foco nos VST3 que já existem (calfNXT) e recomendar um ampsim VST3
   externo, sem embarcar o Guitarix.

## 6.1 Adendo — dá para usar o painel do Preseter com LV2?

**Sim.** O painel `PreseterEffectWindow` não conhece o formato do plugin: ele fala com o motor por
`getVstParameters(owner, slot)` e `setVstParameter(owner, id, valor, slot)`, que funcionam para
qualquer processador hospedado (VST3 ou LV2). O que identifica o efeito é o **caminho do bundle** no
catálogo (`src/shared/effects/catalog.ts`), não a extensão.

Para repetir o padrão do calfnXT com o Guitarix, o trabalho é de **empacotamento + catálogo**, não de
porte de DSP:

1. **Compilar os bundles LV2** escolhidos (Windows: MSYS2/MinGW pelo `README.mswin`; Linux: nativo)
   e vendorizá-los como os VST3 do calfnXT.
2. **Incluir a pasta** no scan: `bundledPluginFolders()` hoje devolve só a pasta do calfnXT;
   acrescentar `resources/plugins/guitarix` (e o watcher equivalente).
3. **Catálogo**: `effectKey()` precisa remover também a extensão `.lv2` do caminho; depois entram as
   entradas “Preseter Amp/Cab/…” com os parâmetros lidos do motor (sonda, como no calfnXT) e os
   presets.
4. **Painel**: o mesmo componente, com o badge “CALFNXT” trocado por “GUITARIX”; o botão “Editor
   original” pode ser escondido no Windows (a UI é xputty/X11) ou mantido como opcional.
5. **MIDI**: já é genérico por `paramOwner` + `paramSlot`; não muda nada.

**Ponto a validar antes de fechar o plano:** compilar **um** módulo (ex.: `gx_tremolo` ou
`gx_compressor`) e carregá-lo no Preseter para confirmar que o motor lista os parâmetros e processa
áudio como insert. Nesta máquina não há MSYS2/g++ nem LV2 instalado; a validação precisa ser feita
com o toolchain instalado ou num job de CI (runner Windows com MSYS2).

**Sobre VST3:** o mesmo painel funcionaria, mas o Guitarix não entrega VST3. “Deixar em VST3” só é
possível com um **wrapper** novo — trabalho bem maior do que empacotar o LV2. Para o objetivo de
“padrão do app”, o formato é indiferente.

## 7. Decisão necessária antes do B3

- **A)** Seguir com **LV2** (empacotar Guitarix, painel Preseter, sem porte de DSP) — menor esforço.
- **B)** **VST3 próprio** a partir do DSP do Guitarix (wrapper + build) — maior esforço.
- **C)** Não embarcar Guitarix; recomendar plugin externo.

Isto encerra a B2. **Aguardando a escolha (A/B/C) para o B3.**

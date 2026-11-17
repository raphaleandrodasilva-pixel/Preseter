# Preseter — Regerar a Coleção Factory 40 com instrumentos e efeitos nativos

> Documento para o OpenCode, em PT-BR. Execute **uma tarefa de cada vez**, na ordem, e pare ao final
> de cada uma para o Rafael conferir. Não invente ids, nomes de programas, links nem números:
> o que não estiver confirmado no código fica como `a confirmar` e deve ser **verificado antes de usar**.
> Não quebrar arquivos `.preseter` existentes.

---

## 1. Objetivo

Regerar os 40 patches da Coleção (`src/shared/collection-presets.ts` + `src/main/collection/generateCollection.ts`) para que:

1. **Pianos acústicos usem o sampler nativo** (`preseter.sampler`), como hoje.
2. **Os demais instrumentos usem o instrumento nativo dedicado sempre que existir um que sirva**, com cadeia de fallback.
3. **Cada patch já venha com os efeitos necessários**, usando só **efeitos nativos** (calfNXT, empacotados com o app).

## 2. Instrumentos nativos disponíveis (confirmados no código)

| id (`pluginId` / `path`) | Nome na tela | Origem | Uso na coleção |
|---|---|---|---|
| `preseter.sampler` | Preseter Sampler (SF2/SFZ) | motor próprio | Pianos acústicos, cordas, metais, madeiras, violões, baixo, baterias, percussão |
| `preseter.organ` | Preseter Organ | setBfree | Órgãos (programas 0–3: jazz, gospel, rock, combo) |
| `preseter.tines` | Preseter Tines | MDA ePiano (Rhodes) | Rhodes |
| `preseter.reeds` | Preseter Wurly | OpenWurli | Wurlitzer |
| `preseter.piano` | Preseter Piano | MDA Piano | **Piano acústico alternativo (ver regra §3)** |
| `preseter.dx` | Preseter DX10 | MDA DX10 | Piano elétrico FM, sinos, mallets, baixos FM |
| `preseter.jx` | Preseter JX10 | MDA JX10 | Pads, leads, baixos e polysynths analógicos |

**A confirmar (verificar no código antes de usar):**
- Nomes e quantidade de programas de `preseter.dx` e `preseter.jx` (os `getNumPrograms()` usam `_programs.size()`). Listar em `docs/PATCHES.md` e usar o `programIndex` real.
- Nomes dos parâmetros expostos de DX10/JX10/Piano no `NativeProcessor` (ver o mesmo arquivo para ids como `tines_*`). Só definir `extra` com parâmetros que existem.
- Se `CollectionLayerSpec.nativeInstrument` aceita hoje apenas `'organ' | 'tines' | 'reeds'`: **estender** para `'piano' | 'dx' | 'jx'` (o id é montado como `preseter.${nativeInstrument}`, então `dx` → `preseter.dx` e `jx` → `preseter.jx`).

## 3. Regras de escolha do instrumento

Ordem de decisão por patch (primeiro que servir):

1. **Piano acústico** → `preseter.sampler` (Salamander SFZ para Grand/Pop; Sonatina para Upright). **Não** trocar para `preseter.piano` como padrão: o Rafael pediu sampler para piano. `preseter.piano` pode entrar só como **camada opcional de reforço** em *Pop Piano* (ver §5), se o Rafael aprovar.
2. **Órgão / Rhodes / Wurlitzer** → nativo dedicado (`organ`, `tines`, `reeds`), como já está.
3. **FM, sinos, mallets, elétrico "DX"** → `preseter.dx`.
4. **Pads, leads, baixos e polysynths analógicos** → `preseter.jx` (no lugar do Surge, que hoje é pluginable externo).
5. **Instrumentos acústicos orquestrais/guitarras/baixo/baterias** → `preseter.sampler` (MuseScore General / Sonatina), pois não há instrumento nativo dedicado.
6. **Fallback:** se o nativo falhar ao carregar → Surge/plugin atual (se existir) → sampler. Registrar em `skipped`/`missing` do retorno de `buildCollectionConcert`; nunca gerar patch silenciosamente mudo.

## 4. Efeitos nativos (calfNXT) — regras

- Efeitos nativos = plugins **calfNXT** (formato "Native", empacotados em `vendor/calfnxt/plugins` no Windows, `plugins-linux` no Linux, `resources/plugins/calfnxt` instalado). Nomes na lista: `calfNXT Reverb`, `calfNXT Delay`, `calfNXT Chorus`, `calfNXT Phaser`, `calfNXT Flanger`, `calfNXT Compressor`, `calfNXT Equalizer`, `calfNXT Filter`, `calfNXT Harmonics`, `calfNXT Pulsator`, `calfNXT Limiter`, `calfNXT Transients`, `calfNXT Stereo`, `calfNXT Octaver`, etc.
- **Resolver por nome a partir do scan** (como já é feito com plugins), nunca por caminho fixo. Se o efeito não for encontrado (ex.: Linux sem o pacote): gerar o patch **sem** esse efeito e registrar em `missing`.
- **Onde cada efeito mora** (arquitetura atual do app, não mudar):
  - **Aux 1 e Aux 2 do Show/Concert** (nível global): **Aux 1 = calfNXT Reverb**, **Aux 2 = calfNXT Delay**. Habilitar esses dois barramentos no concert gerado (hoje `createDefaultConcertSettings()` cria todos desabilitados e sem inserts).
  - **Sends do patch** (`PresetPluginAssignment.sends`, pós-fader, dB; `-60` = desligado; padrão é desligado → o gerador **precisa definir** explicitamente).
  - **Inserts do strip** (`inserts`, slots 0..3): efeitos que fazem parte do *timbre* (chorus do Rhodes, phaser, compressor do baixo, EQ).
  - **Master do patch** (`master.inserts`): só quando o efeito vale para o patch inteiro (ex.: compressor/limiter em patches de várias camadas).
- **Estado dos plugins:** o estado do plugin de Aux fica por patch em `Preset.vstStates["insert_aux1_<slot>"]`; do master em `insert_patch_<slot>`; do strip em `insert_<layerId>_<slot>`. **Caveat conhecido:** se um patch não tiver estado salvo, o plugin do Aux mantém o estado do patch anterior (dependente da ordem). Regra desta tarefa: **o gerador não depende disso** — usar **o mesmo Aux 1/Aux 2 para todos os 40 patches** e controlar a quantidade por **send do patch**, não por parâmetros do plugin.
- **Estado binário (VST3):** a viabilidade de **pré-semear** `vstStates` para calfNXT é `a confirmar`. Se não for viável, gerar só `inserts` e `sends` com os plugins nos **defaults** e deixar o ajuste fino para uma tarefa posterior.
- Não adicionar efeito "por padrão" em todo lugar: cada patch recebe **só o necessário** (tabela §5).

### Receita de sends (valores iniciais, em dB; ajustáveis pelo Rafael)

| Tipo de som | Aux 1 Reverb | Aux 2 Delay |
|---|---|---|
| Piano acústico | -14 | off (-60) |
| Rhodes/Wurly | -16 | -22 |
| Órgão | -18 | off |
| Cordas / pads | -10 | off |
| Metais / madeiras | -14 | off |
| Guitarras | -16 | -20 |
| Baixos | off | off |
| Baterias / percussão | -18 | off |
| Leads | -16 | -14 |

## 5. Mapeamento dos 40 patches

Legenda: **Instr.** = instrumento; **Fx strip** = inserts do strip (slot 0..3); **Master** = insert do patch; **Sends** = Aux1 Reverb / Aux2 Delay.

### Pianos & Keys

| # | Patch | Instr. | Fx strip | Sends |
|---|---|---|---|---|
| 1 | Concert Grand | sampler (Salamander) | — | R -14 |
| 2 | Soft Grand | sampler (Salamander, suave) | calfNXT Equalizer (cortar agudos leve) | R -12 |
| 3 | Pop Piano | sampler (Salamander) *(+ opcional `preseter.piano` -8 dB, aprovar)* | calfNXT Compressor | R -16 |
| 4 | Upright Piano | sampler (Sonatina) | — | R -16 |
| 5 | Rhodes Classic | `preseter.tines` | calfNXT Chorus, calfNXT Phaser (leve) | R -16, D -22 |
| 6 | Wurlitzer EP | `preseter.reeds` | calfNXT Pulsator (tremolo) | R -16, D -22 |
| 7 | FM Electric Piano | `preseter.dx` (programa `a confirmar`) em vez do MuseScore | calfNXT Chorus | R -16, D -22 |
| 8 | Clavinet Funk | sampler (MuseScore prog 7) | calfNXT Phaser | R off, D off |

### Organs

| # | Patch | Instr. | Fx strip | Sends |
|---|---|---|---|---|
| 9 | Hammond Jazz | `preseter.organ` prog 0 | — (leslie/chorus/reverb já internos) | R -20 |
| 10 | Hammond Gospel | `preseter.organ` prog 1 | — | R -18 |
| 11 | Hammond Rock | `preseter.organ` prog 2 | calfNXT Compressor | R -22 |
| 12 | Vintage Transistor Organ | `preseter.organ` prog 3 | calfNXT Phaser | R -20 |

*Nota:* o Órgão já tem chorus/overdrive/reverb internos. **Não duplicar** reverb no strip; usar só o send.

### Strings

| # | Patch | Instr. | Fx strip | Sends |
|---|---|---|---|---|
| 13 | Solo Violin | sampler (MuseScore/Sonatina, como hoje) | — | R -10 |
| 14 | String Ensemble | sampler (4 camadas atuais, mesmas pans) | — | R -10 |
| 15 | Cinematic Strings | sampler (2 camadas atuais) | calfNXT Equalizer | R -8 |
| 16 | Pizzicato Strings | sampler | — | R -14 |
| 17 | Warm String Pad | `preseter.jx` (programa `a confirmar`) em vez do Surge | calfNXT Chorus | R -10 |

### Brass

| # | Patch | Instr. | Fx strip | Sends |
|---|---|---|---|---|
| 18 | Solo Trumpet | sampler | — | R -14 |
| 19 | Trombone | sampler | — | R -14 |
| 20 | French Horn | sampler | — | R -12 |
| 21 | Brass Section | sampler (3 camadas) | — | **Master:** calfNXT Compressor; R -14 |

### Woodwinds

| # | Patch | Instr. | Fx strip | Sends |
|---|---|---|---|---|
| 22 | Concert Flute | sampler | — | R -14 |
| 23 | Clarinet | sampler | — | R -14 |
| 24 | Oboe | sampler | — | R -14 |

### Guitars & Bass

| # | Patch | Instr. | Fx strip | Sends |
|---|---|---|---|---|
| 25 | Nylon Guitar | sampler | — | R -16, D -20 |
| 26 | Steel Guitar | sampler | calfNXT Compressor (leve) | R -16, D -20 |
| 27 | Electric Guitar Clean | sampler | calfNXT Chorus | R -16, D -20 |
| 28 | Precision Bass | sampler | calfNXT Compressor, calfNXT Equalizer | off |
| 29 | Synth Bass | `preseter.jx` (programa `a confirmar`) em vez do Surge | calfNXT Filter (opcional) | off |

### Drums & Percussion

| # | Patch | Instr. | Fx strip | Sends |
|---|---|---|---|---|
| 30 | Acoustic Rock Kit | sampler (bank 128 prog 0) | — | **Master:** calfNXT Compressor; R -18 |
| 31 | Electronic Drum Kit | sampler (bank 128 prog 24) | — | R -18 |
| 32 | Orchestral Percussion | sampler (Sonatina prog 36) | — | R -12 |

### Synthesizers

| # | Patch | Instr. | Fx strip | Sends |
|---|---|---|---|---|
| 33 | Analog Poly Synth | `preseter.jx` (`a confirmar`) | calfNXT Chorus | R -14, D -20 |
| 34 | Vintage Analog Lead | `preseter.jx` (`a confirmar`) | — | R -16, D -14 |
| 35 | Modern Synth Lead | `preseter.jx` ou `preseter.dx` (`a confirmar`) | calfNXT Delay no strip só se necessário | R -16, D -14 |
| 36 | Warm Analog Pad | `preseter.jx` (`a confirmar`) | calfNXT Chorus | R -10 |
| 37 | Digital Bell | `preseter.dx` (programa `a confirmar`) em vez do MuseScore | — | R -12, D -20 |
| 38 | Arpeggiator | `preseter.dx` ou `preseter.jx` + `arp()` (mantido) | — | R -16, D -14 |
| 39 | Deep Synth Bass | `preseter.jx` (`a confirmar`) | calfNXT Equalizer | off |
| 40 | Ambient Texture | `preseter.jx` (`a confirmar`) | calfNXT Chorus | R -8, D -12 |

> Esta tabela é a **proposta inicial**. O Rafael pode alterar qualquer linha; o OpenCode não muda nada fora dela.

## 6. Tarefas (uma por vez, parar ao final)

**F0 — Confirmações (sem mudar produto).** Ler o código e preencher em `docs/FACTORY-40.md` (novo) a seção "Confirmado": programas e nomes de `preseter.dx`/`jx`/`piano`; parâmetros expostos; se `vstStates` de calfNXT pode ser pré-semeado; como achar cada calfNXT por nome no scan; se o calfNXT existe no Linux. Resolver os `a confirmar` das tabelas §2 e §5. Critério: documento com respostas reais e referência a arquivo/linha; nada inventado.

**F1 — Tipos e fábrica de camadas.** Estender `CollectionLayerSpec.nativeInstrument` para `'organ' | 'tines' | 'reeds' | 'piano' | 'dx' | 'jx'`; garantir que `generateCollection.ts` monta `pluginId`/`path` `preseter.<id>`, `programIndex`, faixa de teclas e velocidade. Critério: `npm run typecheck` e `npx vitest run` passando; teste novo com uma camada `dx` e uma `jx`.

**F2 — Modelo de efeitos por patch.** Estender o spec do patch (`CollectionPatchSpec`/equivalente) com `inserts`, `master` e `sends` opcionais; helper `FX('calfNXT Reverb', …)` e `SEND(aux, dB)`. O gerador resolve os efeitos por nome no scan e grava `inserts`, `sends` e `master`; efeito ausente vai para `missing`. Critério: teste que gera um patch com Compressor no strip e send de reverb, e confirma os campos no arquivo gerado.

**F3 — Barramentos do concert.** No `buildCollectionConcert`, habilitar **Aux 1 (calfNXT Reverb)** e **Aux 2 (calfNXT Delay)** (`BusSettings.enabled = true`, `inserts` preenchidos, `output` padrão). Os demais Aux continuam desabilitados. Critério: abrir o concert gerado mostra Aux 1/2 ativos com seus efeitos.

**F4 — Aplicar o mapeamento da §5.** Atualizar `COLLECTION_SETS` com os instrumentos e efeitos da tabela. Manter nomes e ordem dos 40 patches, tecla/velocidade das camadas e as cadeias de fallback. Critério: 40 patches gerados; `analyzeCollectionConcert` não reporta patch mudo; fallback testado simulando um nativo ausente.

**F5 — Teste de som mínimo.** Teste automatizado (e roteiro manual) que carrega cada patch, toca uma nota e confere que sai áudio (não nulo) usando os testes de nulidade já existentes em `engine/test/` quando aplicável. Critério: nenhum patch silencioso; relatório de falhas.

**F6 — Documentação.** Atualizar `docs/PATCHES.md` e `docs/COLECAO.md` com a tabela final (instrumento + efeitos por patch) e o aviso sobre o caveat do estado do Aux. Critério: docs coerentes com o código.

## 7. Regras para o agente

1. **Uma tarefa por commit; parar e mostrar o resultado.**
2. Não inventar ids, programas, parâmetros nem links; `a confirmar` = verificar no código primeiro.
3. Piano acústico **sempre** pelo sampler (decisão do Rafael).
4. Efeitos **só nativos** (calfNXT). Sem plugin de terceiros novo.
5. Não duplicar efeito que o instrumento já tem (ex.: reverb/chorus do Órgão).
6. Não mudar nomes internos nem o formato `.preseter`; arquivos antigos devem abrir normalmente.
7. Não mexer em `asio/` nem em `.vscode/`.
8. `npm run typecheck` e `npx vitest run` devem passar ao fim de cada tarefa.
9. Textos da interface em português do Brasil.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Programa de DX10/JX10 não soar como o patch esperado | F0 lista programas reais; Rafael aprova linha a linha; ajuste por `extra` |
| calfNXT ausente (Linux/instalação) | Resolver por nome; gerar sem o efeito e registrar em `missing` |
| Estado do Aux herdado do patch anterior | Mesmo Aux para os 40 patches; intensidade só por send |
| Impossível pré-semear estado binário de VST3 | Defaults do plugin + tarefa posterior de ajuste |
| Sends padrão desligados (-60) | Gerador define sempre; teste confere |
| Excesso de efeitos / CPU ao vivo | Poucos inserts por patch; só os da tabela |
| Substituir Surge por JX/DX mudar o timbre | Fallback para Surge/sampler e aprovação do Rafael por patch |

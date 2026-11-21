# Preseter — Factory 40 v2: instrumentos nativos + efeitos digitais nativos (com presets)

> Documento para o OpenCode, em PT-BR. **Uma tarefa de cada vez; parar ao final de cada uma e mostrar o resultado.**
> Substitui a tarefa **F4** de `docs/FACTORY-40-NATIVOS.md` (F0–F3 já foram feitas, commits `aa7efa2`…`0f9a315`).
> Não inventar ids, presets nem parâmetros: o que não estiver no código fica `a confirmar`.
> Não quebrar `.preseter` existentes. `npm run typecheck` e `npx vitest run` devem passar em cada tarefa.

---

## 1. Ponto de partida (lido no repositório, HEAD `bba6d2f`)

- Instrumentos `piano`, `dx`, `jx` já existem na coleção (F1). Programas confirmados em `docs/FACTORY-40.md`.
- `CollectionPatchMeta` já tem `inserts`, `master` e `sends`; `FX()` e `auxSends()` existem (F2).
- Aux 1 (Reverb) e Aux 2 (Delay) já são habilitados no concert gerado (F3).
- **F4 já aplicado** (commit `84549d1`): os 40 patches têm instrumentos nativos e
  efeitos. Medido com o scan real: 19 patches com insert no strip, 2 no Master,
  36 com send ativo. O que falta é o **preset** por efeito (G1–G4).
- **Novo:** `src/shared/effects/catalog.json` descreve os 29 efeitos como **"Preseter …"** (painel próprio) e cada um tem **presets** com valores por índice de parâmetro. `findEffect()`/`effectKey()` em `catalog.ts` já casam "calfNXT Reverb", "Preseter Reverb" e "reverb".
- **Limite conhecido:** o gerador não consegue gravar o estado binário dos plugins (`vstStates`). Os presets do catálogo são aplicados hoje **pela interface** (`PreseterEffectWindow.applyPreset` → `setVstParameter` por índice), não pelo gerador.

## 2. Ideia desta versão

Cada patch passa a dizer **qual efeito e qual preset** (ex.: `Preseter Reverb` / `hall`) e o app **aplica o preset ao carregar o patch**, usando os mesmos valores do catálogo. Isso também resolve o *caveat* do Aux (estado herdado do patch anterior): o patch **sempre** reaplica o preset do Aux 1/Aux 2 ao ser carregado.

## 3. Tarefas (nesta ordem)

**G0 — Confirmar o ponto de aplicação (sem mudar código).** Em `docs/FACTORY-40.md` (nova seção "Presets de efeito") responder, com arquivo e linha:
1. Onde o app carrega os plugins dos inserts ao trocar de patch (`alignInserts` em `src/main/index.ts` ~l.1959; leitura de `vstStates` ~l.1943) e **qual é o melhor ponto** para aplicar um preset quando **não há estado salvo** do insert naquele patch.
2. Se `setVstParameter`/`setParam` pode ser chamado no processo principal logo após o carregamento (o catálogo está em `src/shared`, então o main pode importá-lo).
3. Os **ids reais** dos presets usados na tabela §5 (conferir cada um em `catalog.json`; se algum não existir, `a confirmar` e usar `default`).
4. Como o Aux guarda estado por patch (`insert_aux1_<slot>`) e como um preset reaplicado interage com isso.
Critério: respostas com referência; nada inventado. Pare ao final.

**G1 — Preset por insert.** Estender o modelo de forma compatível (campos opcionais; arquivos antigos abrem iguais):
- `Insert` ganha `presetId?: string` (id do preset do catálogo).
- `CollectionPatchMeta.inserts`/`master` aceitam `FX('Preseter Chorus', 'subtle')` (nome + preset). Strings simples continuam valendo.
- `resolveEffectInserts` preenche `presetId`.
Critério: teste novo confirmando `presetId` gravado; testes atuais passam. Pare ao final.

**G2 — Aplicar o preset ao carregar o patch.** No ponto indicado em G0: se o insert tem `presetId` **e não há estado salvo** em `vstStates` para aquele slot, aplicar os valores do preset (`catalog.json`, índice → normalizado 0..1) via `setParam`. Se **há** estado salvo (o usuário já ajustou), **não sobrescrever**.
Critério: teste unitário da função pura "preset → lista de `{index, value}`" e teste do fluxo (sem estado → aplica; com estado → não aplica). Pare ao final.

**G3 — Preset dos Aux por patch.** `CollectionPatchMeta` ganha `auxPresets?: Partial<Record<1|2|3|4, string>>` (ex.: `{ 1: 'hall', 2: 'echo' }`). Ao carregar o patch, reaplicar o preset no insert 0 de Aux 1/Aux 2 **somente se o patch não tiver estado salvo** daquele Aux. Intensidade continua sendo o **send** do patch (`auxSends`).
Critério: trocar entre 3 patches com presets diferentes (`hall` → `plate` → `room`) muda o reverb sem depender da ordem de carga. Pare ao final.

**G4 — Aplicar a lista dos 40 (F4).** Atualizar `COLLECTION_SETS` com a tabela do §5 (instrumento, programa, inserts com preset, `auxPresets`, `sends`). Piano acústico **sempre** `preseter.sampler`. Manter nomes e ordem dos 40, faixa de teclas, velocidade e fallbacks. Efeito ausente no scan → patch gerado sem ele e nome em `missing`.
Critério: 40 patches gerados; nenhum mudo; `analyzeCollectionConcert` sem falhas novas; relatório `missing` conferido. Pare ao final.

**G5 — Teste de som e documentação.** Roteiro manual + teste automatizado mínimo (patch carrega, toca nota, saída não nula quando aplicável). Atualizar `docs/PATCHES.md` e `docs/COLECAO.md` com a tabela final. Critério: docs iguais ao código. Pare ao final.

## 4. Regras de efeitos

- Só efeitos **nativos** (calfNXT, exibidos como "Preseter …"). Nada de plugin de terceiros novo.
- Máx. **4 inserts por strip** (`MAX_INSERTS`). Ordem: dinâmica/EQ → modulação → espaço (o espaço fica no Aux).
- **Reverb e Delay ficam nos Aux** (Aux 1 = Reverb, Aux 2 = Delay); não duplicar no strip.
- **Órgão** já tem chorus/overdrive/reverb internos: não adicionar chorus nem reverb no strip.
- Baixos e kicks: **sem** reverb (sends desligados).
- Intensidade do espaço = **send** (dB; `-60` = desligado). Valores abaixo são iniciais, ajustáveis pelo Rafael.
- Nomes de presets abaixo foram lidos em `catalog.json`; se algum não existir na hora, `default` e avisar.

## 5. Lista dos 40 (proposta; o Rafael pode alterar qualquer linha)

Legenda: **R** = Aux 1 Reverb (preset / send dB); **D** = Aux 2 Delay (preset / send dB); `—` = nenhum.

### Pianos & Keys

| # | Patch | Instrumento | Inserts (efeito: preset) | R | D |
|---|---|---|---|---|---|
| 1 | Concert Grand | sampler (Salamander) | — | hall / -14 | — |
| 2 | Soft Grand | sampler (Salamander, suave) | — | chamber / -12 | — |
| 3 | Pop Piano | sampler (Salamander) | Compressor: bus | room / -16 | — |
| 4 | Upright Piano | sampler (Sonatina) | — | room / -16 | — |
| 5 | Rhodes Classic | `preseter.tines` prog 0 | Chorus: subtle; Phaser: slow | plate / -16 | echo / -22 |
| 6 | Wurlitzer EP | `preseter.reeds` prog 0 | Pulsator: slow | plate / -16 | slap / -22 |
| 7 | FM Electric Piano | `preseter.dx` prog 0 (Bright E.Piano) | Chorus: subtle | plate / -16 | echo / -22 |
| 8 | Clavinet Funk | sampler (MuseScore prog 7) | Phaser: fast | — | — |

### Organs (reverb/chorus internos do órgão: só o send)

| # | Patch | Instrumento | Inserts | R | D |
|---|---|---|---|---|---|
| 9 | Hammond Jazz | `preseter.organ` prog 0 | — | room / -20 | — |
| 10 | Hammond Gospel | `preseter.organ` prog 1 | — | room / -18 | — |
| 11 | Hammond Rock | `preseter.organ` prog 2 | Compressor: bus | room / -22 | — |
| 12 | Vintage Transistor Organ | `preseter.organ` prog 3 | Phaser: slow | room / -20 | — |

### Strings

| # | Patch | Instrumento | Inserts | R | D |
|---|---|---|---|---|---|
| 13 | Solo Violin | sampler | — | hall / -10 | — |
| 14 | String Ensemble | sampler (4 camadas atuais) | — | hall / -10 | — |
| 15 | Cinematic Strings | sampler (2 camadas) | Stereo: wide | arena / -8 | — |
| 16 | Pizzicato Strings | sampler | — | chamber / -14 | — |
| 17 | Warm String Pad | `preseter.jx` prog 29 (Synth Strings) | Chorus: ensemble | hall / -10 | — |

### Brass

| # | Patch | Instrumento | Inserts | R | D |
|---|---|---|---|---|---|
| 18 | Solo Trumpet | sampler | — | chamber / -14 | — |
| 19 | Trombone | sampler | — | chamber / -14 | — |
| 20 | French Horn | sampler | — | hall / -12 | — |
| 21 | Brass Section | sampler (3 camadas) | **Master:** Compressor: bus | hall / -14 | — |

### Woodwinds

| # | Patch | Instrumento | Inserts | R | D |
|---|---|---|---|---|---|
| 22 | Concert Flute | sampler | — | chamber / -14 | — |
| 23 | Clarinet | sampler | — | chamber / -14 | — |
| 24 | Oboe | sampler | — | chamber / -14 | — |

### Guitars & Bass

| # | Patch | Instrumento | Inserts | R | D |
|---|---|---|---|---|---|
| 25 | Nylon Guitar | sampler | — | room / -16 | echo / -20 |
| 26 | Steel Guitar | sampler | Compressor: default | room / -16 | echo / -20 |
| 27 | Electric Guitar Clean | sampler | Chorus: subtle | plate / -16 | slap / -20 |
| 28 | Precision Bass | sampler | Compressor: bass; Harmonics: bass | — | — |
| 29 | Synth Bass | `preseter.jx` prog 17 (Analog Bass) | Compressor: bass | — | — |

### Drums & Percussion

| # | Patch | Instrumento | Inserts | R | D |
|---|---|---|---|---|---|
| 30 | Acoustic Rock Kit | sampler (bank 128 prog 0) | **Master:** Compressor: drum | room / -18 | — |
| 31 | Electronic Drum Kit | sampler (bank 128 prog 24) | Transients: attack | gated / -18 | — |
| 32 | Orchestral Percussion | sampler (Sonatina prog 36) | — | hall / -12 | — |

### Synthesizers

| # | Patch | Instrumento | Inserts | R | D |
|---|---|---|---|---|---|
| 33 | Analog Poly Synth | `preseter.jx` prog 3 (Solid Backing) | Chorus: wide | plate / -14 | echo / -20 |
| 34 | Vintage Analog Lead | `preseter.jx` prog 8 (Detuned Techno Lead) | — | plate / -16 | dotted / -14 |
| 35 | Modern Synth Lead | `preseter.jx` prog 9 (Hard Lead [SA]) | Stereo: wide | plate / -16 | pingpong / -14 |
| 36 | Warm Analog Pad | `preseter.jx` prog 27 (Very Soft Pad) | Chorus: ensemble | hall / -10 | — |
| 37 | Digital Bell | `preseter.dx` prog 4 (Soft Chimes) | — | hall / -12 | echo / -20 |
| 38 | Arpeggiator | `preseter.jx` prog 12 (Moogcury Lite) + `arp()` | — | plate / -16 | dotted / -14 |
| 39 | Deep Synth Bass | `preseter.jx` prog 20 (Sine Infra-Bass) | Harmonics: bass | — | — |
| 40 | Ambient Texture | `preseter.jx` prog 48 (Arctic Wind) | Chorus: wide; Stereo: wide | arena / -8 | echo / -12 |

> Alternativas já confirmadas em `docs/FACTORY-40.md`: DX10 `9 — Tinkle` e `29 — Harmonics` para sinos; JX10 `0 — 5th Sweep Pad` e `1 — Echo Pad [SA]` para pads.

## 6. Regras para o agente

1. Uma tarefa por commit; parar e mostrar o resultado.
2. Não inventar presets, ids ou parâmetros; `a confirmar` = verificar no código.
3. Piano acústico sempre pelo sampler. `preseter.piano` não substitui o sampler.
4. Não sobrescrever ajustes que o usuário já salvou (preset só quando **não há** estado salvo).
5. Nada de alocação nem I/O dentro do callback de áudio.
6. Não mudar nomes internos nem o formato `.preseter`; arquivos antigos devem abrir normalmente.
7. Não mexer em `asio/` nem em `.vscode/`.
8. Textos da interface em português do Brasil.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Preset aplicado antes do plugin terminar de carregar | G0 acha o ponto certo; teste do fluxo em G2 |
| Preset sobrescrever ajuste do usuário | Só aplica quando não há estado salvo |
| Aux herdar estado do patch anterior | G3: preset do Aux reaplicado por patch |
| Muitos efeitos pesarem na CPU ao vivo | Máx. 4 inserts; a tabela usa 0–2 por patch |
| Efeito ausente (instalação/Linux) | Resolver por nome; gerar sem o efeito e registrar em `missing` |
| Preset do catálogo não existir | `default` e aviso; conferir em G0 |
| Timbre do JX10/DX10 não agradar | Rafael aprova linha a linha; trocar programa sem mexer no resto |

---

## 8. G0 — confirmado no código (21/11/2026)

### Onde os inserts são carregados

`src/main/index.ts`:

| Dono | Linhas | Chave do estado salvo |
|---|---|---|
| Layer do patch | 1787–1803 | `insert_<layerId>_<slot>` |
| Strip herdado do concert/set | 1828–1838 | `insert_<stripId>_<slot>` |
| Barramentos (Aux/Output) | 1845–1855 | `insert_<busId>_<slot>` (ex.: `insert_aux1_0`) |
| Master do Patch | 1941–1952 | `insert_patch_<slot>` (legado `insert_output1_<slot>`) |

`alignInserts` (1959) é idempotente: só recarrega o plugin quando o caminho muda.

### Melhor ponto para aplicar o preset

**Depois de carregar o insert e confirmar que não há estado salvo** para aquele
slot. Implementado em `applyInsertPreset` (`index.ts`), chamado nos três pontos:
layers, barramentos (Aux) e Master do Patch. Com estado salvo, nada é aplicado.

### `setParam` por índice já funciona

`VstManager.setParameter(owner, paramId, value, slot)` aceita `paramId` numérico
(`"12"` ou `"param_12"`) — `parameterIndex` em `VstManager.ts:923`. O catálogo
(índice → valor 0..1) é aplicado direto, sem comando novo no motor. Helper puro:
`effectPresetValues(pathOrName, presetId)` em `src/shared/effects/catalog.ts`.

### Presets conferidos (todos existem)

Reverb: `default, booth, room, chamber, hall, plate, arena, gated` ·
Delay: `default, slap, echo, pingpong, dotted` ·
Chorus: `default, subtle, wide, ensemble` ·
Phaser: `default, slow, fast, deep` ·
Pulsator: `default, slow, fast` ·
Compressor: `default, vocal, drum, bass, bus` ·
Stereo: `default, wide, mono, rotate` ·
Harmonics: `default, wide, exciter, bass` ·
Transients: `default, attack, sustain`

### Aux por patch

O estado do Aux é por patch em `insert_aux1_<slot>` / `insert_aux2_<slot>`.
Agora o patch declara `auxPresets: { 1: 'hall', 2: 'echo' }` e o app reaplica no
insert 0 quando não há estado salvo. A intensidade continua no `sends`.

## 9. Resultado do G4 (scan real, 78 plugins)

- 40 patches gerados, nenhum pulado, nenhum `missing`.
- **19** patches com insert no strip; **2** no Master (Brass Section, Acoustic
  Rock Kit); **36** com send ativo.
- Sem send: Clavinet, Precision Bass, Synth Bass e Deep Synth Bass.
- Aux 1 = calfNXT Reverb, Aux 2 = calfNXT Delay; Aux 3/4 desligados.

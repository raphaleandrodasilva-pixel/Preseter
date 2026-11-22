# Preseter — Layout específico por instrumento nos 40 patches gerados

> Documento para o OpenCode, em PT-BR. **Uma tarefa de cada vez; parar ao final de cada uma** para o Rafael conferir.
> Não inventar: nome de parâmetro, índice, id ou número que não for lido no código fica `a confirmar`.
> Manter o visual azul atual (`#0A84FF`); **não** redesenhar o app. `npm run typecheck` e `npx vitest run` passam
> em cada tarefa. Não mexer em `asio/` nem em `.vscode/`.

---

## 1. Pedido do Rafael

Hoje os 40 patches gerados saem com o **mesmo layout genérico** (`createDefaultKeyboardLayout`: Volume,
Modulação, MIDI, nome, Aux 1–4, teclado, Expression/Sustain). O layout deve ser **de acordo com o instrumento**:

- **Piano**: controles para os efeitos (reverb, delay, brilho, etc.) à mão.
- **Órgão**: os **registros (drawbars)** do órgão, usando o componente que já existe (`type: 'drawbar'`).
- E assim por instrumento (Rhodes, Wurly, DX10, JX10, sampler de cordas/sopros/pads, guitarra, baixo, bateria).

## 2. O que já existe (lido no repositório, HEAD `85c0526`)

- `src/shared/collection-presets.ts`: gera os patches; o layout de **todos** vem de
  `createDefaultKeyboardLayout(tempo, {title})` (`src/shared/default-layout.ts`), sem distinguir instrumento.
- Tipos de controle (`ElementType`): `button, fader, knob, pedal, toggle, slider, label, pad, meter-vertical,
  midi-activity, keyboard, drawbar, playback, audio-input`.
- **`drawbar`** existe no palco (`StageControl`/`faces.tsx`) e na paleta do compositor
  (`elementFactory.ts`, grupo "Organ Drawbars (9)": rótulos 16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1'; faixa 0–8;
  cor `#C6A15B`).
- Ligação de um controle a parâmetro: campos de `UiElement` `paramOwner` (layerId, `"patch"` ou `"aux1".."aux4"`),
  `paramSlot` (insert 0..3), `parameterId`, `mappingMin/Max`, `pluginId/pluginPath`; aplicado por
  `setMappedParameter` (`ConcertShell.tsx`). Ao carregar o patch, os knobs mapeados são posicionados no valor
  real do parâmetro, procurando por `String(item.index) === element.parameterId` (**índice**, não nome).
- Nomes dos parâmetros nativos do órgão (janela `NativeInstrumentWindow.tsx`): `Drawbar 16'`, `Drawbar 5 1/3'`,
  `Drawbar 8'`, `Drawbar 4'`, `Drawbar 2 2/3'`, `Drawbar 2'`, `Drawbar 1 3/5'`, `Drawbar 1 1/3'`, `Drawbar 1'`
  (faixa 0–8), mais Leslie (0–3) e Vibrato (0–6); os demais são 0–1.
- Seções do palco: `section?: 'instrument' | 'effects' | 'tone' | 'output'` (`StageSections.tsx`).
- Envios do patch: `patchSendAux` (knob Aux 1–4). Aux 1 = Reverb, Aux 2 = Delay nos patches gerados.
- Pedais: `pedalKind` `sustain` / `expression`.
- Instrumentos nativos: `organ`, `tines`, `reeds`, `piano`, `dx`, `jx`, `synth2`, `drums`; sampler (`preseter.sampler`).
- Efeitos "Preseter …" (calfNXT) e presets em `src/shared/effects/catalog.json`.

## 3. Princípios

1. **Mesma base em todos** (nome do patch, Volume master, MIDI, teclado, pedais), para o músico não se perder.
2. **Zona do instrumento** (centro-esquerda) muda por tipo; **zona de efeitos** (direita) mostra só os efeitos
   **daquele patch** (inserts + Aux Reverb/Delay).
3. **No máximo ~12 controles** na zona do instrumento; o resto fica na janela nativa do instrumento.
4. **Teclado com a extensão certa**: piano 88 teclas (21–108), órgão 61 (36–96), baixo 28–67, demais 36–96
   (`a confirmar` com o Rafael; o padrão atual é 24–84).
5. Nada é inventado: cada controle liga a um parâmetro **real** (lido na P0).

## 4. Tarefas (nesta ordem)

**P0 — Conferir (sem mudar código).** Gerar `docs/LAYOUT-INSTRUMENTO.md` ("Confirmado") com:
1. Como o `layerId` é gerado no gerador (o padrão `${patchId}:layer:${index}` é determinístico? o gerador pode
   escrever `paramOwner` antes do patch existir?).
2. Para cada instrumento nativo, **lista real de parâmetros** (nome, índice, faixa) que o `setVstParameter`
   aceita por `paramOwner=layerId`; confirmar se o controle mapeado funciona com instrumento **nativo** (não só
   VST) e se a sincronização ao carregar o patch (`String(item.index)`) funciona para nativos.
3. Para o **sampler** nativo: quais ajustes existem (cutoff, attack, release, velocity…) e se são endereçáveis
   por `parameterId`.
4. Para cada efeito do `catalog.json` usado nos 40 patches: nomes e índices de **Mix, Rate, Depth, Time,
   Feedback, Threshold, Ratio**, etc. (os índices são estáveis entre builds? se não, propor `parameterName`
   resolvido ao carregar).
5. Como o `StageControl` desenha o `drawbar` ligado a parâmetro e se aceita faixa 0–8 inteira.
6. Se o patch "Clavinet Funk" carrega mesmo o rótulo "Flauta" do `sonatina` (programa 14): **provável erro**
   (o Rafael decidiu manter o Clavinet no sampler); listar o que falta para soar como clavinet.
Critério: tabela completa, sem suposição. **Pare ao final.**

**P1 — Construtor de layout por instrumento.** Criar `src/shared/collection-layouts.ts` com
`buildPatchLayout(meta, tempo)` no lugar da chamada direta a `createDefaultKeyboardLayout`:
- recebe: instrumento (sampler/organ/tines/reeds/piano/dx/jx/drums), inserts, Aux ativos, família (piano, órgão,
  cordas…), título;
- reaproveita a base do layout padrão (volume, MIDI, título, teclado, pedais) e **acrescenta** a zona do
  instrumento e a de efeitos;
- coordenadas em grade fixa (sem sobreposição), tamanhos de `DEFAULT_SIZES`; ids estáveis e únicos.
Critério: com um instrumento "desconhecido" cai no layout genérico atual (nada quebra); patches já existentes
não mudam. **Pare ao final.**

**P2 — Órgão.** Para `organ` (e qualquer patch com órgão):
- grupo de **9 drawbars** (`type: 'drawbar'`, rótulos 16' a 1', faixa 0–8, cor `#C6A15B`, mesmo `groupId`),
  cada um ligado ao parâmetro `Drawbar …` do layer;
- à direita das barras: **Percussão** (liga/desliga, decaimento, harmônica 2ª/3ª), **Vibrato/Chorus** (tipo 0–6),
  **Leslie** (parado / lento / rápido), **Overdrive** e Volume — só os que **existirem** nos parâmetros (P0);
- os 4 programas do órgão como botões de preset (se o app permitir trocar de programa por controle; senão,
  `a confirmar` e fica na janela nativa);
- sem Reverb/Chorus de insert no strip (já definido na Factory 40 v2).
Critério: abrir "Organ …" mostra as 9 barras funcionando e refletindo o valor real do órgão. **Pare ao final.**

**P3 — Pianos e teclas.**
- **Piano acústico (sampler):** Reverb (Aux 1), Delay (Aux 2), **Brilho** (cutoff), **Release**, **Dinâmica**
  (velocity) e Volume; Sustain/Expression em destaque; teclado 88 teclas.
- **Pop Piano:** idem + Compressor (Threshold/Mix do insert).
- **Rhodes / Wurly:** parâmetros do instrumento lidos na P0 (ex.: tremolo/vibrato, decaimento, brilho) + Chorus,
  Phaser ou Pulsator do insert (Rate/Depth/Mix) + Reverb/Delay.
- **FM Electric Piano (DX10):** os parâmetros principais do DX10 + Chorus + Reverb/Delay.
Critério: cada controle muda o som e o valor inicial reflete o parâmetro. **Pare ao final.**

**P4 — Synths, cordas/sopros/pads, guitarra, baixo, bateria.**
- **JX10** (leads, pads, baixos): Cutoff, Resonance, Attack, Release, Vibrato/Mod, Detune (nomes da P0) +
  efeitos do patch; o patch com **arpejador** mostra Modo/Taxa/Oitavas.
- **Sampler de cordas, metais, sopros, pads:** Attack, Release, Brilho, Reverb; Modulação em destaque.
- **Guitarra/violão:** Reverb, Delay, Chorus/Compressor do insert.
- **Baixo:** Compressor (Threshold/Ratio) + Harmonics (Mix); **sem** Reverb/Delay (já definido).
- **Bateria:** botão **Play/Stop** do sequenciador, seletor de kit/padrão e pads (lidos de `preseter.drums`);
  teclado reduzido. Depende da janela do Preseter Drums existente (`DRUMS.md`).
Critério: um patch de cada família conferido pelo Rafael. **Pare ao final.**

**P5 — Aplicar aos 40 e migrar.**
1. A coleção gerada usa `buildPatchLayout`; `Colecao*.preseter` já gerados **não** são alterados.
2. Opção "Regenerar layout deste patch" para quem quiser trocar o layout de um patch existente (sem perder
   nome, plugins e efeitos). **Perguntar ao Rafael** antes de sobrescrever layouts personalizados.
3. `migrateConcertLayout` e `validate` continuam aceitando (agrupamento de drawbars em `element-groups.ts`).
Critério: gerar a coleção de 40 sem erro e abrir 5 patches de famílias diferentes. **Pare ao final.**

**P6 — Testes e documentação.**
- Teste que, para os 40 patches: não há elementos sobrepostos; todo `paramOwner/parameterId` é resolvível; órgãos
  têm exatamente 9 drawbars; baixos não têm envio de Reverb/Delay; ids únicos.
- Atualizar `docs/COLECAO.md` e `docs/FACTORY-40.md` com a tabela "patch → controles".
**Pare ao final.**

## 5. Tabela de referência (o OpenCode confirma na P0 e completa)

| Família | Instrumento | Zona do instrumento | Zona de efeitos | Teclado |
|---|---|---|---|---|
| Piano de cauda/pop/vertical | sampler | Brilho, Release, Dinâmica | Reverb (Aux 1), Delay (Aux 2), compressor se houver | 21–108 |
| Rhodes | `preseter.tines` | parâmetros do instrumento (P0) | Chorus, Phaser, Reverb, Delay | 28–103 |
| Wurly | `preseter.reeds` | parâmetros do instrumento (P0) | Pulsator, Reverb, Delay | 28–103 |
| EP FM | `preseter.dx` | parâmetros DX10 (P0) | Chorus, Reverb, Delay | 36–96 |
| Órgão | `preseter.organ` | **9 drawbars**, Percussão, Vibrato/Chorus, Leslie, Overdrive | sem reverb/chorus no strip | 36–96 |
| Cordas/metais/sopros/pads | sampler / `preseter.jx` | Attack, Release, Brilho (ou parâmetros JX10) | Reverb | 36–96 |
| Leads/pads sintéticos | `preseter.jx` | Cutoff, Resonance, Attack, Release, Detune | Delay, Reverb; arp se houver | 36–96 |
| Guitarra/violão | sampler | Release, Brilho | Chorus/Compressor, Reverb, Delay | 40–88 |
| Baixos | sampler / `preseter.jx` | Cutoff/Brilho, Release | Compressor, Harmonics (sem sends) | 28–67 |
| Baterias | sampler / `preseter.drums` | Play/Stop, kit, pads | Compressor do master, Reverb | pads/teclado reduzido |

## 6. Regras para o agente

1. Uma tarefa por commit; parar e mostrar o resultado.
2. Controles só ligados a parâmetros **que existem**; nada de botão decorativo.
3. Reaproveitar os componentes existentes (`drawbar`, `knob`, `fader`, `toggle`, `pedal`, `pad`); não criar
   componente novo sem pedir.
4. Não mudar o visual global nem as cores além do `#C6A15B` do órgão (já existente).
5. Não alterar patches já salvos pelo usuário.
6. Textos da interface em português do Brasil.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Índice de parâmetro de efeito mudar entre builds | P0 verifica; se instável, `parameterName` resolvido ao carregar |
| Controle mapeado não funcionar em instrumento nativo | P0 testa; se faltar, estender o mapeamento (tarefa extra, a pedir) |
| `layerId` desconhecido na geração | P0 item 1; gerar o id de forma determinística |
| Tela cheia de controles | Máx. ~12 na zona do instrumento; o resto na janela nativa |
| Sobrescrever layout personalizado | P5: só o gerador usa o novo layout; regenerar só com confirmação |
| Bateria depende do Preseter Drums | P4 só liga o que já existe na janela de drums |

---

## 8. Confirmado na P0 (motor `PreseterEngine`, 22/11/2026)

> Tudo abaixo foi lido do motor (`params`) e conferido com `setParam`; nada é suposição.
> O `layerId` do gerador é determinístico: `${slug}:layer:${index}`. `setParam` por índice
> funciona em instrumento nativo (testado em `tines` índice 2 e `organ` índice 0).

### 8.1 Instrumentos nativos

| Instrumento | Índices usados no layout |
|---|---|
| `preseter.organ` | 0–8 drawbars (0–8); 9 Percussão; 13 Vibrato/Chorus (0–6); 16 Leslie (0–3) |
| `preseter.tines` | 1 Volume, 2 Decay, 3 Release, 4 Hardness, 6 Tremolo, 7 Tremolo Rate |
| `preseter.reeds` | 0 Volume, 1 Tremolo, 2 Speaker, 4 Hammer, 5 Damper |
| `preseter.piano` | 0 Decay, 1 Release, 2 Brilho, 3 Dinâmica, 4 Muffling, 6 Velocity |
| `preseter.dx` | 0 Attack, 1 Decay, 2 Release, 3 Coarse, 10 Vibrato, 15 LFO Rate |
| `preseter.jx` | 0 OSC Mix, 6 Cutoff (VCF Freq), 7 Resonance, 11 Attack, 14 Release, 20 Vibrato; arp 31–34 |
| `preseter.synth2` | 2 Detune (osc2 pitch), 19 Cutoff, 20 Resonance, 25 Attack, 28 Release, 30 Velocity |
| `preseter.drums` | nenhum parâmetro exposto (0) — só efeitos entram no layout |

### 8.2 Sampler nativo (`preseter.sampler`)

| Índice | Parâmetro | Faixa |
|---|---|---|
| 0 | Ataque | 0–2 s |
| 1 | Decay | 0–5 s |
| 2 | Sustain | 0–1 |
| 3 | Release | 0–5 s |
| 4 | Filtro (Brilho) | 100–20000 Hz |
| 5 | Ressonância | 0–1 |
| 6 | Velocity (Dinâmica) | 0–1 |
| 7 | Transpose | −24–24 st |
| 8 | Fine tune | −100–100 ct |
| 9 | Vozes | 8–256 |
| 10 | Ganho (Volume) | dB |

O sampler é criado pelo motor (`loadSampler`) e também responde a `setParam` por índice.

### 8.3 Efeitos usados nos 40 patches

Nomes e índices conferidos em `src/shared/effects/catalog.json` e `guitarix.json`; o layout usa
apenas pares que existem:

| Efeito | Controles usados |
|---|---|
| Chorus | Mod Depth (4), Mod Rate (5) |
| Phaser | Mod Depth (4), Mod Rate (5) |
| Pulsator | Modulation (4), Pulse Width (9) |
| Compressor | Threshold (4), Ratio (5) |
| Harmonics | Drive (3), Blend (4) |
| Transients | Attack Boost (5), Release Boost (8) |
| Stereo | Amount (11), Spread (15) |
| EQ | B1 Gain (7), B1 Freq (6) |
| Reverb | Decay (5), Wet (32) |
| Delay | Feedback (9), Wet (10) |
| Guitarix Overdrive | Drive (2), Tone (1) |
| Guitarix Amp | Distortion (2), Presence (8) |
| Guitarix Preamp | Volume (1), Treble (4) |
| Guitarix Cab | Bass (1), Treble (2) |
| Guitarix Tremolo | Depth (2), Freq (3) |

### 8.4 Drawbar

`StageControl`/`faces.tsx` já desenham `type: 'drawbar'`; o elemento aceita `minValue: 0`,
`maxValue: 8` e `parameterId` 0–8. O layout usa `groupId` comum para os 9 registros.

### 8.5 Clavinet

O patch usa o sampler (`musescore`, programa 7) e **não** carrega o rótulo “Flauta”. O som
depende da biblioteca externa; não há parâmetro de clavinet no motor. O layout mapeia os
parâmetros reais do sampler (Ataque, Release, Brilho, Dinâmica) + Phaser do insert.

---

## 9. Status da implementação

| Etapa | Situação |
|---|---|
| P0 — parâmetros reais | concluída (tabelas acima) |
| P1 — construtor compartilhado | `src/shared/collection-layouts.ts` (`buildPatchLayout`) |
| P2 — órgão | 9 drawbars + Percussão/Vibrato-Chorus/Leslie; sem duplicar Reverb/Chorus |
| P3 — pianos e teclas | sampler (Brilho/Release/Dinâmica/Volume), Tines, Wurly, DX10 |
| P4 — demais famílias | JX10 (+arp), synth2, cordas/metais/sopros, guitarra, baixo, bateria |
| P5 — 40 patches | gerador usa `buildPatchLayout`; patches já salvos não mudam |
| P6 — testes/docs | 40 patches sem sobreposição, ids únicos, parâmetros resolvíveis |
| Templates | Teclado/Worship carregam nativos; Guitarra usa knobs dos inserts Guitarix |

**P5.2 implementado:** no menu ⚙ da lista de patches, “Regenerar layout por instrumento…”
atua nos patches selecionados e pede confirmação antes de substituir o layout. Nome, plugins,
inserts, valores e áudio não mudam; só o layout é regerado. Patches não selecionados continuam
intocados.

# Plano — Instrumentos nativos MDA (Piano, DX, JX) + correção da abertura

Data: 2026-11-15
Base: portes JUCE do MDA (`hollance/mda-plugins-juce`, commit `5527024…`), licença MIT.
Referência de implementação: **Preseter Tines** (mda ePiano) e **Preseter Organ** (setBfree).

---

## 1. Objetivo e decisões

Transformar três plugins do MDA em **instrumentos nativos do Preseter** (código dentro do
`PreseterEngine`, como Organ/Tines/Reeds), com **painéis próprios no app** (React) e os
presets de fábrica do MDA.

| Decisão | Valor |
|---|---|
| Nomes | **Preseter Piano**, **Preseter DX10**, **Preseter JX10** |
| IDs internos | `preseter.piano`, `preseter.dx`, `preseter.jx` |
| Ordem | **Piano → DX → JX** |
| Presets | manter o banco de fábrica do MDA |
| Editor | **painéis React próprios** (decisão B); o editor genérico do JUCE fica como fallback |
| Loja/Coleção | **não** entram (são nativos do programa) |
| Depois dos três | corrigir a abertura (só splash até o app estar pronto) e publicar 1.0.5 |

---

## 2. Licença e atribuição

- Porte JUCE: MIT — Copyright (c) 2008 Paul Kellett; Copyright (c) 2021–2025 M.I. Hollemans.
- Cada pasta `engine/third_party/mda-*` leva `LICENSE` e `UPSTREAM.md` (origem, commit,
  arquivos importados, adaptações), igual a `engine/third_party/mda-epiano/UPSTREAM.md`.
- Atualizar `docs/LICENCAS.md` com os três.
- Nada de samples/imagens comerciais novos: o Piano usa os samples do MDA.

---

## 3. Arquitetura

### 3.1 Importação (`engine/third_party/`)

```
mda-piano/
  LICENSE
  UPSTREAM.md
  mdaPianoData.h              # samples (~3,2 MB)
  MDA Piano PluginProcessor.* # só referência para o teste de nulidade
  MdaPianoDsp.{h,cpp}         # DSP extraído (sem JUCE AudioProcessor/UI)
mda-dx10/  (mesmo padrão)     # DX10Program + MdaDxDsp
mda-jx10/  (mesmo padrão)     # JX10Program + MdaJxDsp
```

Regra: o DSP recebe parâmetros em **unidades reais** e processa `AudioBuffer`/`MidiBuffer`,
como o `MdaEPianoDsp`. Nada de APVTS/VST dentro do DSP.

### 3.2 Engine

- `NativeKind` ganha `piano`, `dx`, `jx`; `createNativeProcessor()` mapeia os três IDs;
  nomes de exibição e `kindId`.
- `NativeProcessor` ganha um membro por instrumento (`MdaPianoDsp`, `MdaDxDsp`, `MdaJxDsp`),
  layout APVTS e inicialização por `kind`.
- **Programas**: `getNumPrograms/getProgramName/setCurrentProgram` usando o banco do MDA;
  `applyProgram` copia `program.param[]` para os parâmetros.
- **Estado**: APVTS + índice do programa no `getStateInformation/setStateInformation`.
- **MIDI**: note on/off, velocity, sustain (Piano), glide/voz (JX), vibrato (DX).
- `engine/CMakeLists.txt`: adicionar os novos `.cpp`.
- `CommandRouter` (`load`): aceitar `preseter.piano|dx|jx` (hoje lista organ/tines/reeds).
- `Engine::loadNative`: sem mudança estrutural (cria o `NativeProcessor`).

### 3.3 App (painéis React)

- Novo `src/renderer/components/concert/NativeInstrumentPanel.tsx`: shell escuro no estilo
  `hw-*`, header com nome + seletor de programa (◀ ▶ + lista), corpo com seções e knobs.
- Layouts por instrumento em `.../nativePanels/{piano,dx,jx}.ts` (metadados: seção, label,
  parâmetro, formato).
- Parâmetros: `vstGetParameters(layerId)` na abertura; escrita via `vstSetParameter`;
  atualização ao vivo pelo evento `parameter-changed` (já existe).
- Programas: `vstSetProgram`/estado atual do layer (o `describeLoadedPlugin` já devolve
  `program`/`programCount`).
- **Roteamento**: para layers nativos (`pluginId` começa com `preseter.`), o botão
  **Editor (V)** abre o painel React em vez de `native->createEditor()`; VST3/LV2 seguem
  no editor nativo. O atalho `V` usa o mesmo caminho.
- `ChannelStrips.nativeEntries`: adicionar os três no grupo Preseter (categorias
  “Piano acústico”, “Sintetizador FM”, “Sintetizador analógico”).

---

## 4. Parâmetros e presets (nomes exatos do upstream)

### 4.1 Preseter Piano (12 + polifonia; 32 vozes; NPROGS = 8)

`Envelope Decay`, `Envelope Release`, `Hardness Offset`, `Velocity to Hardness`,
`Muffling Filter`, `Velocity to Muffling`, `Velocity Sensitivity`, `Stereo Width`,
`Polyphony`, `Fine Tuning`, `Random Detuning`, `Stretch Tuning`.

Painel: **Envelope** (Decay, Release) · **Timbre** (Hardness, Vel→Hardness, Muffling,
Vel→Muffling) · **Resposta** (Vel Sens) · **Estéreo** (Width) · **Afinação** (Fine, Random,
Stretch) · **Vozes** (Polyphony).

### 4.2 Preseter DX (16; 8 vozes)

`Attack`, `Decay`, `Release`, `Coarse`, `Fine`, `Mod Init`, `Mod Dec`, `Mod Sus`,
`Mod Rel`, `Mod Vel`, `Vibrato`, `Octave`, `FineTune`, `Waveform`, `Mod Thru`, `LFO Rate`.

Painel: **Envelope** (A/D/R) · **FM** (Coarse, Fine, Mod Init/Dec/Sus/Rel, Mod Thru) ·
**Brilho** (Mod Vel) · **Modulação** (Vibrato, LFO Rate) · **Tom** (Octave, FineTune,
Waveform).

### 4.3 Preseter JX (24; 8 vozes)

`OSC Mix`, `OSC Tune`, `OSC Fine`, `Mode`, `Gld Rate`, `Gld Bend`, `VCF Freq`, `VCF Reso`,
`VCF Env`, `VCF LFO`, `VCF Vel`, `VCF Att`, `VCF Dec`, `VCF Sus`, `VCF Rel`, `ENV Att`,
`ENV Dec`, `ENV Sus`, `ENV Rel`, `LFO Rate`, `Vibrato`, `Noise`, `Octave`, `Tuning`.

Painel: **OSC** (Mix, Tune, Fine, Noise) · **Filtro** (Freq, Reso, Env, LFO, Vel, A/D/S/R) ·
**AMP** (A/D/S/R) · **LFO** (Rate, Vibrato) · **Voz** (Mode, Gld Rate, Gld Bend, Octave,
Tuning).

---

## 5. Fases

### F0 — Base, licença e importação (2–3 dias)
- [ ] Criar as três pastas `third_party`, copiar DSP + dados + `LICENSE`/`UPSTREAM.md`.
- [ ] Extrair `MdaPianoDsp`/`MdaDxDsp`/`MdaJxDsp` (parâmetros reais, MIDI, sem JUCE UI).
- [ ] Harness de nulidade `engine/test/mda-{piano,dx,jx}-nullity` (comparar com o
      `PluginProcessor` original, como o ePiano).
- [ ] `NativeKind`, registry, `CommandRouter`, CMake; `docs/LICENCAS.md`.
- Aceite: engine compila; os três IDs carregam (som ainda sem painel).

### F1 — Preseter Piano (7–9 dias)
- [ ] DSP com samples/keygroups/velocidade/sustain; 32 vozes.
- [ ] 8 presets de fábrica; estado; programa atual.
- [ ] Entrada no `nativeEntries` e painel React (6 seções).
- [ ] Nulidade + engine (notas, sustain, polifonia) + app (carregar, painel, programa).
- Aceite: toca, presets mudam o som, painel abre e move o áudio, estado salva no patch.

### F2 — Preseter DX (5–6 dias)
- [ ] DSP FM, 8 vozes, 16 params, banco de presets, vibrato/octave.
- [ ] Painel React (5 seções) + programa.
- [ ] Testes de nulidade/engine/app.
- Aceite: idem Piano, com 8 vozes.

### F3 — Preseter JX (6–7 dias)
- [ ] DSP 2 osc, 8 vozes, 24 params, modos de glide, chorus/noise.
- [ ] Painel React (5 seções) + programa.
- [ ] Testes.
- Aceite: idem, com os modos POLY/MONO/LEGATO/GLIDE funcionando.

### F4 — Integração e polimento (3 dias)
- [ ] Textos, categorias, ícones do grupo Preseter, docs.
- [ ] Ajuste de CPU (32 vozes no Piano), denormals, estado.
- [ ] Regressão: typecheck + testes + smoke dos nativos existentes.

### F5 — Abertura do app (1–2 dias)
- [ ] Tirar `maximize()` do `createWindow`.
- [ ] `show()` + `maximize()` dentro de `showMainWindow()`.
- [ ] Sinal `startup-painted` (duplo `requestAnimationFrame`) + `backgroundThrottling:false`.
- [ ] Fallback de erro (renderer falhou → janela com mensagem, nunca branca).
- Aceite: durante o carregamento só a splash; depois a janela maximizada com a tela pronta.

### F6 — Entrega (1 dia)
- [ ] `npm run typecheck` + `npm test`; build do renderer/main.
- [ ] Versão **1.0.5**, commit, tag `v1.0.5`, push.
- [ ] CI gera Windows (NSIS) e Linux (AppImage/deb) e publica o release.
- [ ] Instalador local `release\Preseter Setup 1.0.5.exe`.

Total estimado: **4–5 semanas**.

---

## 6. Testes e critérios de aceite (por instrumento)

1. **Nulidade** contra o `PluginProcessor` original (mesmo MIDI/params): diferença nula ou
   abaixo do limiar documentado.
2. **Engine**: carrega layer nativo; 8/32 vozes; velocity; sustain (Piano); glide (JX);
   sem estalos ao trocar de programa.
3. **Estado**: salvar patch → trocar → voltar restaura som, parâmetros e programa.
4. **App**: aparece em Layers → Preseter; painel abre; seções/knobs corretos; programa
   ◀ ▶; mudanças refletem no som e no strip.
5. **CPU**: 8 vozes (DX/JX) e 32 (Piano) em 48 kHz/128 sem xruns no Windows e Linux.
6. **Regressão**: Organ/Tines/Reeds/Sampler intactos; `npm run typecheck` e `npm test` verdes.

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Samples do Piano (3,2 MB) e keygroups | copiar a tabela por instância (como no ePiano) e testar loops |
| CPU com 32 vozes | voz choking do MDA + teste de carga; limite de polifonia ajustável |
| Mapeamento `param[]` 0..1 ↔ unidades reais | extrair com o mesmo critério do `MdaEPianoDsp`; teste de nulidade |
| Presets de fábrica quebrados | comparar `getState/setState` e nomes com o upstream |
| Painel React fora de sincronia | usar `parameter-changed` + leitura ao abrir; testar com MIDI learn |
| Licença | `LICENSE`/`UPSTREAM` em cada pasta + `docs/LICENCAS.md` |
| Splash voltar a piscar | `maximize` só depois do `show`; gate de primeira pintura |

---

## 8. Arquivos que serão tocados

- `engine/third_party/mda-{piano,dx10,jx10}/**` (novo)
- `engine/src/native/NativeProcessor.{h,cpp}` (kinds, DSPs, layouts, programas)
- `engine/src/native/Mda{Piano,Dx,Jx}Dsp.{h,cpp}` (novo)
- `engine/src/CommandRouter.cpp` (load dos IDs)
- `engine/CMakeLists.txt`
- `engine/test/mda-{piano,dx,jx}-nullity/**` (novo)
- `src/renderer/components/concert/ChannelStrips.tsx` (nativeEntries + editor)
- `src/renderer/components/concert/NativeInstrumentPanel.tsx` + `nativePanels/*.ts` (novo)
- `src/renderer/components/concert/ConcertShell.tsx` (abrir painel nativo)
- `src/main/index.ts` (splash/maximize/paint gate)
- `docs/LICENCAS.md`, `docs/PLUGINS-NATIVOS.md` (ou novo `docs/MDA-NATIVOS.md`)
- `package.json` (versão 1.0.5)

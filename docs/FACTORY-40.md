# Factory 40 — confirmações do código (F0)

> Respostas levantadas no código em 20/11/2026. Cada item aponta arquivo e linha.
> Onde o documento original dizia `a confirmar`, aqui está o valor real.
> Nada foi alterado no produto nesta tarefa.

---

## 1. Instrumentos nativos

Confirmado em `engine/src/native/NativeProcessor.cpp` (33–38 e 44–48) e
`engine/src/CommandRouter.cpp` (251–252 e 348–349):

| id | Kind interno | Base | Programas |
|---|---|---|---|
| `preseter.organ` | `organ` | setBfree | 4 (0–3): Jazz, Gospel, Rock, Combo |
| `preseter.tines` | `tines` | MDA ePiano | 4 (0–3): Suitcase, Stage, Mellow, Bark |
| `preseter.reeds` | `reeds` | OpenWurli | 4 (0–3): Clássico, Suitcase, Stage, Bark |
| `preseter.piano` | `mdaPiano` | MDA Piano | **8 (0–7)** |
| `preseter.dx` | `mdaDx10` | MDA DX10 | **32 (0–31)** |
| `preseter.jx` | `mdaJx10` | MDA JX10 | **52 (0–51)** |

Nomes e quantidades confirmados em `NativeProcessor.cpp` 653–659 e 809–825:
para órgão/tines/reeds, `getNumPrograms()` retorna **4** (não 1).

O motor já aceita os seis ids em `load`/`stageLoad`
(`CommandRouter.cpp` 251–252 e 348–349). O que falta é só a coleção
saber gerá-los (§6 deste documento).

### Programas do Preseter Piano (`mda-piano`)

`PluginProcessor.cpp`, tabela `_programs`; `getNumPrograms()` retorna `NPROGS`:

| # | Nome |
|---|---|
| 0 | mda Piano |
| 1 | Plain Piano |
| 2 | Compressed Piano |
| 3 | Dance Piano |
| 4 | Concert Piano |
| 5 | Dark Piano |
| 6 | School Piano |
| 7 | Broken Piano |

### Programas do Preseter DX10 (`mda-dx10`)

`getNumPrograms()` = `_programs.size()` = **32**.

| # | Nome | # | Nome |
|---|---|---|---|
| 0 | Bright E.Piano | 16 | Trumpet |
| 1 | Jazz E.Piano | 17 | Horn |
| 2 | E.Piano Pad | 18 | Reed 1 |
| 3 | Fuzzy E.Piano | 19 | Reed 2 |
| 4 | Soft Chimes | 20 | Violin |
| 5 | Harpsichord | 21 | Chunky Bass |
| 6 | Funk Clav | 22 | E.Bass |
| 7 | Sitar | 23 | Clunk Bass |
| 8 | Chiff Organ | 24 | Thick Bass |
| 9 | Tinkle | 25 | Sine Bass |
| 10 | Space Pad | 26 | Square Bass |
| 11 | Koto | 27 | Upright Bass 1 |
| 12 | Harp | 28 | Upright Bass 2 |
| 13 | Jazz Guitar | 29 | Harmonics |
| 14 | Steel Drum | 30 | Scratch |
| 15 | Log Drum | 31 | Syn Tom |

### Programas do Preseter JX10 (`mda-jx10`)

`getNumPrograms()` = `_programs.size()` = **52**.

| # | Nome | # | Nome |
|---|---|---|---|
| 0 | 5th Sweep Pad | 26 | Whistler |
| 1 | Echo Pad [SA] | 27 | Very Soft Pad |
| 2 | Space Chimes [SA] | 28 | Pizzicato |
| 3 | Solid Backing | 29 | Synth Strings |
| 4 | Velocity Backing [SA] | 30 | Synth Strings 2 |
| 5 | Rubber Backing [ZF] | 31 | Leslie Organ |
| 6 | 808 State Lead | 32 | Click Organ |
| 7 | Mono Glide | 33 | Hard Organ |
| 8 | Detuned Techno Lead | 34 | Bass Clarinet |
| 9 | Hard Lead [SA] | 35 | Trumpet |
| 10 | Bubble | 36 | Soft Horn |
| 11 | Monosynth | 37 | Brass Section |
| 12 | Moogcury Lite | 38 | Synth Brass |
| 13 | Gangsta Whine | 39 | Detuned Syn Brass [ZF] |
| 14 | Higher Synth [ZF] | 40 | Power PWM |
| 15 | 303 Saw Bass | 41 | Water Velocity [SA] |
| 16 | 303 Square Bass | 42 | Ghost [SA] |
| 17 | Analog Bass | 43 | Soft E.Piano |
| 18 | Analog Bass 2 | 44 | Thumb Piano |
| 19 | Low Pulses | 45 | Steel Drums [ZF] |
| 20 | Sine Infra-Bass | 46 | Car Horn |
| 21 | Wobble Bass [SA] | 47 | Helicopter |
| 22 | Squelch Bass | 48 | Arctic Wind |
| 23 | Rubber Bass [ZF] | 49 | Thip |
| 24 | Soft Pick Bass | 50 | Synth Tom |
| 25 | Fretless Bass | 51 | Squelchy Frog |

> Os sufixos `[SA]` e `[ZF]` fazem parte do nome original do MDA e devem ser
> mantidos. `programIndex` é exatamente o número da esquerda.

---

## 2. Parâmetros expostos

Como funciona (`NativeProcessor.h` 47 e `Engine.cpp` 2517, 3697):

- Órgão, Tines e Wurly usam a lista própria do `NativeProcessor` (`organ_*`,
  `tines_*`, `wurly_*`), criada em `createLayout` (`NativeProcessor.cpp` 69–122).
- **Piano, DX10 e JX10 retornam um layout vazio** (`NativeProcessor.cpp` 58–60).
  O comando `params` do motor delega para o processador MDA
  (`getParameterProcessor()`), então **os ids são os do MDA**, com espaço no nome.

### Ids reais por instrumento

`preseter.dx` (16) — `mda-dx10/PluginProcessor.cpp`:

`Attack`, `Decay`, `Release`, `Coarse`, `Fine`, `Mod Init`, `Mod Dec`,
`Mod Sus`, `Mod Rel`, `Mod Vel`, `Vibrato`, `Octave`, `FineTune`, `Waveform`,
`Mod Thru`, `LFO Rate`

`preseter.jx` (24) — `mda-jx10/PluginProcessor.cpp`:

`OSC Mix`, `OSC Tune`, `OSC Fine`, `Mode`, `Gld Rate`, `Gld Bend`,
`VCF Freq`, `VCF Reso`, `VCF Env`, `VCF LFO`, `VCF Vel`, `VCF Att`, `VCF Dec`,
`VCF Sus`, `VCF Rel`, `ENV Att`, `ENV Dec`, `ENV Sus`, `ENV Rel`, `LFO Rate`,
`Vibrato`, `Noise`, `Octave`, `Tuning`

`preseter.piano` (12) — `mda-piano/PluginProcessor.cpp`:

`Envelope Decay`, `Envelope Release`, `Hardness Offset`, `Velocity to Hardness`,
`Muffling Filter`, `Velocity to Muffling`, `Velocity Sensitivity`, `Stereo Width`,
`Polyphony`, `Fine Tuning`, `Random Detuning`, `Stretch Tuning`

### Limitação atual do gerador

`CollectionLayerSpec.extra` **não é levado** para `PresetPluginAssignment` em
`generateCollection.ts` (só `arp` é copiado, linhas 159 e 234). Para ajustar
parâmetros do DX/JX por patch, o F1/F2 precisa gravar uma lista de parâmetros no
assignment. O motor já aceita `setParam` por índice (`CommandRouter.cpp`).

---

## 3. Efeitos nativos (calfNXT)

- São **VST3**, `manufacturer="calfNXT"`, `format="VST3"`. Confirmado no cache
  do motor (`known-plugins.xml`) e em `vendor/calfnxt/plugins/*.vst3`.
- **Existem no Linux**: `vendor/calfnxt/plugins-linux` tem **29** bundles, igual
  ao Windows. `package.json` copia `plugins-linux` → `resources/plugins/calfnxt`.
- **29 efeitos disponíveis**:

`calfNXT Aligner`, `Analyzer`, `Bender`, `Chorus`, `Compressor`, `Crusher`,
`DeEsser`, `Delay`, `Denoiser`, `Elliptic`, `Equalizer`, `Expander`, `Filter`,
`Flanger`, `Harmonics`, `Impulse`, `Limiter`, `Multiband Compressor`,
`Multiband Limiter`, `Octaver`, `Phaser`, `Pulsator`, `Reverb`, `Ring Modulator`,
`Split`, `Stereo`, `Tamer`, `Transients`, `Tuner`

- **Como resolver por nome:** `buildCollectionConcert(plugins, ...)` já recebe a
  lista escaneada (`CollectionPlugin { id, name, isInstrument }`). Basta procurar
  `name === 'calfNXT Reverb'` etc. **Atenção:** `CollectionPlugin` **não tem
  `path`**, e `Insert` exige `pluginId`, `name` e `path`. Ou estender
  `CollectionPlugin` com `path`, ou mudar o tipo recebido.
- **Ausente no scan** → patch gerado sem o efeito e o nome entra em `missing`
  (o retorno de `buildCollectionResult` já tem esse campo).

---

## 4. Estado binário dos plugins (`vstStates`)

**Não é viável pré-semear pelo gerador.**

- O estado é capturado de um plugin **carregado**: `App.tsx` 180–219 chama
  `vstGetState(layerId)` / `vstGetState(strip.id)` e grava o blob em
  `Preset.vstStates` (`loaded_<layerId>`, `insert_<layerId>_<slot>`,
  `insert_patch_<slot>`, `insert_<bus>_<slot>`).
- O gerador não tem instância do calfNXT, então não pode produzir um blob válido.
- **Decisão:** gerar `inserts` e `sends` com os plugins nos defaults e deixar o
  ajuste fino para depois. O caveat do Aux (estado herdado do patch anterior)
  continua valendo; por isso a regra de usar o **mesmo Aux 1/2 para os 40** e
  controlar intensidade só pelo send.

---

## 5. Barramentos Aux no concert gerado

`src/main/concert/ConcertFile.ts`, `createDefaultBuses()`:

- Aux são criados com `createDefaultBus(false)` → **`enabled: false` e sem
  inserts**.
- `buildCollectionConcert` usa `createDefaultConcertSettings()` (linha 285), que
  usa esse padrão.
- Portanto o **F3** precisa: `settings.buses.aux[0]` = Reverb habilitado +
  insert 0 com o plugin, `aux[1]` = Delay habilitado + insert 0; `output` = 1
  (padrão).

---

## 6. Lacunas do gerador confirmadas

| Lacuna | Evidência |
|---|---|
| `nativeInstrument` aceita só `organ | tines | reeds` | `collection-presets.ts` 58 |
| Nenhum uso de `dx`/`jx`/`piano` na coleção | 3 usos de `nativeInstrument`, 0 de dx/jx/piano |
| Nenhum insert/send/master por patch | `generateCollection.ts` sem `inserts`/`sends`/`master` |
| `extra` não chega ao assignment | `generateCollection.ts` 159 e 234 |
| Aux desabilitados | `ConcertFile.ts` `createDefaultBuses` |
| 11 referências a Surge nos presets | `collection-presets.ts` |

---

## 7. Proposta de programas para os patches marcados `a confirmar`

Sujeita à aprovação do Rafael; nomes conferidos nas tabelas acima.

| # | Patch | Instrumento proposto | Programa |
|---|---|---|---|
| 7 | FM Electric Piano | `preseter.dx` | 0 — Bright E.Piano |
| 17 | Warm String Pad | `preseter.jx` | 29 — Synth Strings |
| 29 | Synth Bass | `preseter.jx` | 17 — Analog Bass |
| 33 | Analog Poly Synth | `preseter.jx` | 3 — Solid Backing |
| 34 | Vintage Analog Lead | `preseter.jx` | 8 — Detuned Techno Lead |
| 35 | Modern Synth Lead | `preseter.jx` | 9 — Hard Lead [SA] |
| 36 | Warm Analog Pad | `preseter.jx` | 27 — Very Soft Pad |
| 37 | Digital Bell | `preseter.dx` | 4 — Soft Chimes |
| 38 | Arpeggiator | `preseter.jx` | 12 — Moogcury Lite |
| 39 | Deep Synth Bass | `preseter.jx` | 20 — Sine Infra-Bass |
| 40 | Ambient Texture | `preseter.jx` | 48 — Arctic Wind |

Alternativas úteis: DX10 `9 — Tinkle` e `29 — Harmonics` para sinos; JX10
`0 — 5th Sweep Pad` e `1 — Echo Pad [SA]` para pads.

---

## 8. Resumo das decisões

1. Piano acústico continua no **sampler** (decisão do Rafael).
2. Órgão, Tines, Wurly, Piano, DX10 e JX10 já existem e podem ser usados pelo id.
3. Efeitos: só calfNXT, resolvidos **por nome** no scan; ausente → `missing`.
4. Estado do calfNXT **não** será pré-semeado; usar defaults + inserts/sends.
5. Aux 1 (Reverb) e Aux 2 (Delay) precisam ser habilitados no concert gerado.
6. `CollectionPlugin` precisa de `path` (ou o tipo do gerador precisa mudar) para
   montar `Insert`.

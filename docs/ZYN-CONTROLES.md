# Controles do Zyn (Z3)

> Documento do **Z3** de `ZYN-COMPLETAR.md` e registro do **Z4a**. O inventário abaixo foi
> lido no código do ZynAddSubFX 3.0.7. A primeira leva implementada está na seção 7; o
> restante continua como proposta para o Rafael escolher.
>
> `a confirmar` = o código não deixa claro se dá para aplicar ao vivo com segurança, ou o
> valor/faixa depende do preset carregado. Os testes de áudio do Z0/Z2 ajudam a decidir,
> mas não substituem um teste de cada controle com o app aberto.

## 1. Como o estado é salvo hoje

- `ZynProcessor::getStateInformation` salva: `program`, `programPath`, os 8 parâmetros do
  APVTS (`volume`, `pan`, `voices`, `keyShift`, `mono`, `fx1`–`fx3`) e o **Part inteiro** em
  XML (`captureInstrument` → `Part::add2XMLinstrument`).
- `Part::add2XML` grava os campos da parte; `Part::add2XMLinstrument` grava o kit, os
  motores e os efeitos; `Controller::add2XML` grava os controladores.
- Portanto, qualquer campo abaixo que já esteja nesse XML **já sobrevive a salvar/abrir**.
  Um controle novo precisa: (a) virar parâmetro do `EngineParameter`/APVTS ou (b) ser
  aplicado ao Part e capturado no XML; em ambos os casos o valor precisa caber no estado do
  patch.
- O `.preseter` guarda o estado do layer (plugin state) via `getStateInformation`; a
  compatibilidade com patches antigos exige que todo parâmetro novo tenha um padrão neutro
  quando ausente.

## 2. Parte (`Part`)

Fonte: `engine/third_party/zyn/src/Misc/Part.h` e `Part.cpp` (`defaults`, `add2XML`).

| Nome interno | PT-BR | Faixa | Padrão | Onde é salvo | Aplicação segura |
|---|---|---|---:|---|---|
| `Penabled` | Parte ligada | 0/1 | 0 no Zyn; 1 no Preseter | `enabled` | Direto; o Preseter já força 1. |
| `Volume` (via `setVolumedB`) | Volume | -40,0 a +13,3 dB | 0 dB | `volume` | Direto na thread de áudio (`setVolumedB` recalcula o ganho). Já exposto. |
| `Ppanning` | Pan | 0–127 (64 = centro) | 64 | `panning` | Direto (`setPpanning`). Já exposto. |
| `Pminkey` / `Pmaxkey` | Faixa de teclas | 0–127 | 0 / 127 | `min_key` / `max_key` | Direto; lido no NoteOn (`validNote`). |
| `Pkeyshift` | Transposição | 0–127 (64 = 0) | 64 | `key_shift` | Direto; o painel atual mostra -24..+24. |
| `Prcvchn` | Canal de recepção | 0–15 | 0 | `rcv_chn` | Direto (`a confirmar` se o Preseter usa o canal do layer). |
| `Pvelsns` | Sensibilidade de velocity | 0–127 | 64 | `velocity_sensing` | Direto; lido no cálculo do NoteOn. |
| `Pveloffs` | Offset de velocity | 0–127 | 64 | `velocity_offset` | Direto. |
| `Pnoteon` | Recebe NoteOn | 0/1 | 1 | `note_on` | Direto. |
| `Ppolymode` | Polifônico / mono | 0/1 | 1 | `poly_mode` | Direto; o painel atual já tem “Mono”. |
| `Plegatomode` | Legato | 0/1 | 0 | `legato_mode` | Direto; `writeMacros` hoje força `false`. |
| `Pkeylimit` | Limite de teclas | 0–127 (0 = desligado) | 15 | `key_limit` | Direto (`setkeylimit`). |
| `Pvoicelimit` | Limite de vozes | 0–127 (0 = desligado) | 0 | `voice_limit` | Direto (`setvoicelimit`); o painel atual usa 0–64. |
| `Pkitmode` | Modo kit | 0/1 | 0 | `kit_mode` | `a confirmar` (muda o sentido dos itens do kit). |
| `Pdrummode` | Modo bateria | 0/1 | 0 | `drum_mode` | `a confirmar` (mapeamento por tecla). |
| `Pefxroute[0..2]` | Rota do FX interno | 0–2 | 0 (próximo) | `route` | Direto. |
| `Pefxbypass[0..2]` | Bypass do FX interno | 0/1 | 0 | `bypass` | Direto. Já exposto. |
| `ctl` | Controladores | ver seção 6 | — | `CONTROLLER` | `SetController` já roda na thread de áudio. |

### Itens do kit (`Part::Kit`)

Cada instrumento tem até `NUM_KIT_ITEMS` itens. Os campos abaixo são os que interessam para
motores e faixas:

| Nome interno | Faixa | Padrão | Salvo | Observação |
|---|---|---:|---|---|
| `kit[n].Penabled` | 0/1 | item 0 = 1 | `enabled` | Liga/desliga o item inteiro. |
| `kit[n].Pmuted` | 0/1 | 0 | `muted` | Mudo. |
| `kit[n].Pminkey` / `Pmaxkey` | 0–127 | 0/127 | `min_key`/`max_key` | Faixa do item. |
| `kit[n].Psendtoparteffect` | 0–3 | 0 | `send_to_instrument_effect` | Rota para FX1–3. |
| `kit[n].Padenabled` | 0/1 | 1 no item 0 | `add_enabled` | ADsynth. |
| `kit[n].Psubenabled` | 0/1 | 0 | `sub_enabled` | SUBsynth. |
| `kit[n].Ppadenabled` | 0/1 | 0 | `pad_enabled` | PADsynth (ligar exige `applyparameters`). |

## 3. Divisão proposta

### 3.1 Parte (primeira leva)

| Controle PT-BR | Interno | Faixa | Aplicação | Salvo |
|---|---|---|---:|---|
| Volume | `Volume` | -40…+13,3 dB | Thread de áudio (`setVolumedB`) | sim |
| Pan | `Ppanning` | 0–127 | Thread de áudio (`setPpanning`) | sim |
| Sensibilidade de velocity | `Pvelsns` | 0–127 | Thread de áudio | sim |
| Offset de velocity | `Pveloffs` | 0–127 | Thread de áudio | sim |
| Transposição | `Pkeyshift` | -24…+24 (mapeado para 0–127) | Thread de áudio | sim |
| Número de vozes | `Pvoicelimit` | 0–64 (0 = sem limite) | Thread de áudio (`setvoicelimit`) | sim |
| Mono / Legato | `Ppolymode` / `Plegatomode` | 0/1 | Thread de áudio | sim |
| Faixa de teclas | `Pminkey` / `Pmaxkey` | 0–127 | Thread de áudio | sim |
| Portamento | `ctl.portamento.*` | tempo 0–127 (0–1,93 s) | Thread de áudio (`SetController`/campos) | sim |
| Limite de teclas | `Pkeylimit` | 0–127 | Thread de áudio | sim |

**Observação:** o painel atual já tem Volume, Pan, Voices, Key Shift, Mono e o bypass dos
FX; o Z4 só precisa completar os demais e agrupar.

### 3.2 Som (macros úteis ao vivo)

O Zyn **não tem** um cutoff/ADSR global do Part: esses parâmetros vivem em cada item do kit
(AD/SUB/PAD), em `GlobalFilter`, `AmpEnvelope`, `FilterEnvelope`, `FreqLfo`/`AmpLfo`/
`FilterLfo`. Um macro “Cutoff” precisa ser um **offset/razão aplicado a todos os itens
habilitados**, não um campo único.

| Macro PT-BR | Parâmetros internos que ele move | Faixa do macro | Como aplicar com segurança |
|---|---|---|---|
| Cutoff | `GlobalFilter->Pfrequency` (AD/SUB/PAD) e/ou `VoiceFilter->Pfrequency` | 0–100% | **Por troca de ponteiro**: abrir o preset, aplicar o offset e recarregar no worker do Z2. `a confirmar` se `setfreq` é lido ao vivo. |
| Ressonância | `GlobalFilter->Pq` / `VoiceFilter->Pq` | 0–100% | idem; `a confirmar` se o filtro lê `Pq` por bloco. |
| Quantidade do envelope de filtro | `FilterEnvelope` (`PA_val`, `Penvelope`/`Penvval`) | 0–100% | idem. |
| Ataque do amplificador | `AmpEnvelope.A_dt` / `PA_val` | 0–127 (tempo/curva) | idem; para notas já soando, o envelope atual não muda. |
| Decaimento / Sustain / Liberação do amplificador | `AmpEnvelope.D_dt`/`PS_val`/`R_dt` | 0–127 | idem. |
| Ataque/Decay/Sustain/Release do filtro | `FilterEnvelope.*` | 0–127 | idem. |
| LFO → vibrato | `FreqLfo.freq`/`Pintensity` | 0–100% | idem; `a confirmar` se o LFO lê ao vivo. |
| LFO → filtro | `FilterLfo.freq`/`Pintensity` | 0–100% | idem. |
| Detune | `ADnoteGlobalParam::PDetune`/`PCoarseDetune`, `SUBnoteParameters::PDetune`, `PADnoteParameters::PDetune` | -100…+100 cents | idem. |
| Largura estéreo | `PStereo` + `PPanning` dos itens/voices | 0–200% | idem; `PStereo` pode exigir reconstrução do voice. |
| Brilho | combinação de cutoff + `PPunchStrength`/filtro | 0–100% | idem; **a confirmar** qual parâmetro o Zyn usa para “brilho”. |

**Recomendação:** implementar os macros de som em uma segunda fase, com o mecanismo de
**reload com fade** do Z2 (commit no fim do arrasto, “Carregando…”). Aplicar direto na
thread de áudio só depois de testar cada parâmetro; o código do Zyn não marca esses campos
como `REALTIME` de forma consistente. Para os presets PADsynth de ~2 s, o macro pode custar
uma recarga inteira — o painel precisa avisar.

### 3.3 Motores (ADsynth, SUBsynth, PADsynth)

Fonte: `ADnoteParameters.h`, `SUBnoteParameters.h`, `PADnoteParameters.h`.

| Motor | Ligar/desligar | Volume | Outros parâmetros úteis | Aplicação |
|---|---|---|---|---|
| ADsynth | `kit[n].Padenabled` | `ADnoteGlobalParam::Volume` (float; padrão 8,29) | `PStereo` (true), `PPanning` (64), `PDetune` (8192=0), `PCoarseDetune` (0), `PBandwidth` (64), `PAmpVelocityScaleFunction` (64) | Flags lidos no NoteOn; volume/pan `a confirmar` ao vivo. |
| SUBsynth | `kit[n].Psubenabled` | `SUBnoteParameters::Volume` (float; padrão 0) | `PPanning` (64), `Pbandwidth` (40), `Pnumstages` (2), `Phmagtype` (0), `Pstereo` (true), `Pstart` (1), `PDetune` (8192) | Flags no NoteOn; banda/nº de estágios `a confirmar` ao vivo. |
| PADsynth | `kit[n].Ppadenabled` | `PADnoteParameters::PVolume` (0–127; padrão 90) | `Pmode` (bandwidth), `Pbandwidth` (0–1000; 500), `Pquality` (samplesize 3, basenote 4, oct 3, smpoct 2), `PStereo` (true), `PPanning` (64) | Ligar/desligar e mudar banda/qualidade exige `applyparameters` (tabelas) → **reload no worker**. |

**Recomendação:** na primeira leva, expor **ligar/desligar e volume** de cada motor. O
volume de AD/SUB pode ser testado ao vivo; o PAD deve ir por reload. Não expor `Pquality`
como knob ao vivo: ele muda o custo de geração e pode levar segundos.

### 3.4 Efeitos internos FX1–FX3

Fonte: `EffectMgr.h`, `Reverb.h`, `Echo.h`, `Chorus.h`, `Phaser.h`, `Alienwah.h`,
`Distortion.h`, `EQ.h`, `DynamicFilter.h`, `Sympathetic.h`, `Reverse.h`.

Tipos (`EffectMgr::nefx`): `Disabled`, `Reverb`, `Echo`, `Chorus`, `Phaser`, `Alienwah`,
`Distortion`, `EQ`, `DynFilter`, `Sympathetic`, `Reverse`.

Parâmetros principais por tipo (todos 0–127 no `seteffectparrt`, salvo indicado):

| Tipo | 3–4 parâmetros principais | Observação |
|---|---|---|
| Reverb | Volume (dry/wet), Time, Initial delay, Feedback / damping | `Ptype`, `Proomsize`, `Pbandwidth` também existem. |
| Echo | Volume (dry/wet), Delay, L/R delay, Feedback, High damping | 5 campos; escolher 4. |
| Chorus | Volume, Depth, Delay, Feedback | `Pflangemode`, `Poutsub` e LFO. |
| Phaser | Volume, Depth, Feedback, Stages | `Pwidth`, `Poffset`, `Pdistortion`, `Phyper`. |
| Alienwah | Volume, Depth, Feedback, Delay | `Pphase` + LFO. |
| Distortion | Volume, Drive, Level, Type | `Pnegate`, `Plpf`, `Phpf`, `Pstereo`, `Pprefiltering`, `Poffset`. |
| EQ | Volume + bandas (type/freq/gain/Q/stages) | `MAX_EQ_BANDS`; a UI precisa de uma banda por vez. |
| DynFilter | Volume, Depth, Amp sensitivity, Amp smooth | `Pampsnsinv`, LFO. |
| Sympathetic | Volume, Drive, Level, Q / strings | `Punison_size`, `Punison_frequency_spread`, `Pstrings`, `Pbasenote`. |
| Reverse | Volume, Delay (comprimento), Crossfade, Sync mode | `Pphase`, `Pstereo`. |

**Aplicação segura:** `EffectMgr::seteffectparrt` é marcado `REALTIME` e `changeeffectrt`
também; com o pool TLSF do Z2, a troca de tipo não chama `malloc`. Mesmo assim:
- Mudar **parâmetro** ao vivo: `a confirmar` por efeito (alguns recalculam buffers).
- Mudar **tipo**: `changeeffectrt` aloca o efeito do pool; se o pool de 8 MB não couber
  (Reverb/Echo grandes), a nota/efeito pode falhar. Testar cada tipo. Se falhar, usar o
  reload do Z2.
- `Pefxbypass` é direto e já existe no painel.
- Os efeitos do Preseter continuam no strip; os FX1–3 são os internos do Zyn.

### 3.5 Controladores

Fonte: `Controller.h` / `Controller.cpp` (`defaults`, `add2XML`).

| Controle PT-BR | Interno | Faixa | Padrão | Aplicação | Salvo |
|---|---|---|---:|---|---|
| Alcance do pitch bend | `ctl.pitchwheel.bendrange` | -6400…6400 cents | 200 (2 semitons) | Campo + `setpitchwheel` | sim |
| Pitch bend para baixo separado | `bendrange_down` / `is_split` | -6400…6400 / 0-1 | 0 / false | Campo | sim |
| Profundidade do mod wheel | `ctl.modwheel.depth` | 0–127 | 80 | Campo + `setmodwheel` | sim |
| Mod wheel exponencial | `modwheel.exponential` | 0/1 | false | Campo | sim |
| Expressão (CC11) | `ctl.expression.receive` + `data` | 0/1 / 0–127 | true / 127 | `SetController` | sim |
| Sustain | `ctl.sustain.receive` + `data` | 0/1 / 0–127 | true / 0 | `SetController` | sim |
| Profundidade do filtro (CC) | `filtercutoff.depth` / `filterq.depth` | 0–127 | 64 / 64 | `SetController` | sim |
| Portamento | `portamento.time` / `portamento.portamento` / `automode` | 0–127 / 0-1 / 0-1 | 64 / false / true | Campo + `setportamento` | sim |
| Centro/banda da ressonância | `resonancecenter.depth` / `resonancebandwidth.depth` | 0–127 | 64 / 64 | `SetController` | sim |

**Observação:** pitch bend, mod wheel, expressão e sustain já chegam pelo `handleMidi` do
`ZynProcessor` (`part.SetController`). O que falta é expor **alcance**, **profundidade** e
**receive** como controles do patch; o valor ao vivo continua vindo do MIDI.

## 4. Proposta para a primeira leva (Z4a)

Para não transformar o painel em uma parede de knobs, sugiro esta ordem:

1. **Parte:** completar velocity, transposição (já existe), vozes (já existe), mono/legato,
   faixa de teclas, portamento, limite de teclas.
2. **Controladores:** alcance do pitch bend, profundidade do mod wheel, receber expressão,
   receber sustain. São campos simples do `Controller`, já salvos no XML, e não exigem
   recarregar o preset.
3. **Motores:** ligar/desligar + volume de AD/SUB/PAD; PAD por reload.
4. **FX internos:** tipo + 3–4 parâmetros + bypass. Começar por Reverb, Echo, Chorus e
   Distortion; testar o pool antes de liberar os demais.
5. **Som (macros):** só depois de validar o mecanismo de reload/fade com um macro
   (Cutoff). Se o custo de recarga for aceitável, entram os demais; se não, ficam como
   “commit no fim do arrasto”.

Cada controle aprovado precisa de:

- parâmetro no `EngineParameter` (ou um mapa de macros no estado do Zyn);
- grupo recolhível no painel, knob com duplo clique no padrão, roda e entrada numérica;
- estado por patch (salvar/abrir);
- mapeamento MIDI e uso nos layouts por instrumento;
- teste: muda o som, salva/abre e o valor volta.

## 5. O que precisa de decisão do Rafael

1. A primeira leva é a da seção 4 ou um subconjunto?
2. Os macros de som podem recarregar o preset (com “Carregando…” e fade) ou precisam ser
   instantâneos? Isso muda o que é viável no PADsynth.
3. O painel deve mostrar **todos** os itens do kit ou só o item 0? A maioria dos presets usa
   um item; expor os 16 vira outro nível de complexidade.
4. O “brilho” deve ser um macro de cutoff ou um controle separado? O Zyn não tem um campo
   com esse nome; precisa de uma definição (ex.: cutoff + punch).
5. Os FX1–3 devem aparecer no painel do Zyn ou só no strip do Preseter? Hoje o painel só
   tem bypass.

## 6. Fontes lidas

- `engine/third_party/zyn/src/Misc/Part.h` / `Part.cpp` (`defaults`, `add2XML`,
  `add2XMLinstrument`, `getfromXML`).
- `engine/third_party/zyn/src/Params/Controller.h` / `Controller.cpp` (`defaults`,
  `add2XML`).
- `.../Params/ADnoteParameters.h`, `SUBnoteParameters.h`, `PADnoteParameters.h`.
- `.../Params/EnvelopeParams.h`, `FilterParams.h`, `LFOParams.h`.
- `.../Effects/EffectMgr.h` e os headers de cada efeito.
- `engine/src/native/ZynFactory.cpp` (APVTS atual, macros e estado).
- `docs/ZYN-DIAGNOSTICO.md` (Z0/Z1/Z2: carga, alocação e troca).

## 7. Z4a implementado

Entrou no `ZynProcessor`/APVTS e no `ZynPanel`:

| Grupo | Controles |
|---|---|
| Parte | Volume, Pan, Voices, Key Shift (já existiam), Vel Sensitivity, Vel Offset, Key Limit, Min Key, Max Key, Portamento Time, Mono, Legato, Portamento |
| Controladores | Bend Range (semitons), Mod Wheel Depth, Filter Cutoff Depth, Filter Q Depth, Expressão (CC11), Sustain (CC64) |
| Motores | AD Engine e SUB Engine com 3 estados: **Preset** (-1, mantém o .xiz), **Desligado**, **Ligado** |
| Efeitos | Bypass dos FX1–3 (já existia) |

- Todos são parâmetros do APVTS: aparecem no `EngineParameter`, são mapeáveis por MIDI e
  usáveis nos layouts por instrumento.
- O estado por patch é salvo no `getStateInformation`/`getState`; o stress test restaurou
  Volume e Bend Range depois de trocar o programa.
- O painel usa grupos recolhíveis, knobs com duplo clique no padrão e selects para os
  motores. “Legato atua no modo Mono.”
- Testes: `ZynPanel.controls.test.tsx` e `scripts/zyn-stress.js` (controles + estado).
  Resultado: 100 trocas, 0 xruns, 0 heap, 0 falhas do pool; `Vel Sensitivity` chegou a 102
  no Part e `AD Engine=Ligado` ligou o AD no kit.

**Ainda fora desta leva (Z4b–d):** macros de Som (cutoff/ADSR/LFO/detune/largura/brilho),
volume dos motores, PADsynth on/off/volume, tipo e parâmetros dos FX internos. Os motivos
estão nas seções 3.2–3.4: os macros exigem reload/fade e o PAD exige `applyparameters`.

**a confirmar:** o som de cada controle no app (o teste prova que o Part recebe o valor, não
que o timbre muda como esperado), o Legato em presets polifônicos e o custo dos FX internos
com o pool de 8 MB.

## 8. Z4b–d implementado (montagem)

Os controles abaixo **não** são aplicados na thread de áudio. Eles entram na montagem do
instrumento (`finishInstance`), sobre uma **cópia limpa do preset** (`baseInstrument`, o XML
como saiu do `.xiz`). Mudar um deles pede uma remontagem; o Loader espera 250 ms sem mudanças
(arrastar um knob não remonta a cada passo), remonta e troca com o fade de 8 ms do Z2.

| Grupo | Parâmetro (id) | Faixa | Efeito |
|---|---|---|---|
| Som | `cutoff`, `resonance` | -64…64 | ±4 oitavas no `basefreq` / ±4 dobras no `baseq` dos filtros globais de AD/SUB/PAD e dos filtros de voz do AD |
| Som | `attack`, `decay`, `release` | -64…64 | ×1/16…×16 nos tempos do envelope de amplitude (ADSR ou envelope livre) |
| Som | `sustain` | -64…64 | ±128 no nível de sustain do envelope de amplitude |
| Motores | `padEngine` | -1/0/1 | PADsynth: Preset / Desligado / Ligado (as tabelas são geradas no `applyparameters`) |
| Motores | `adVolume`, `subVolume`, `padVolume` | -24…+12 dB | Offset no volume de cada motor (PAD: 0,625 dB por passo do `PVolume`) |
| Efeitos | `fx1Type`…`fx3Type` | -1…10 | -1 = preset; 0 = nenhum; 1–10 = Reverb, Echo, Chorus, Phaser, Alienwah, Distortion, EQ, DynFilter, Sympathetic, Reverse |
| Efeitos | `fx1Mix`…`fx3Mix` | -1…127 | -1 = preset; senão, parâmetro 0 (volume/mix) do efeito |

- **Correção de travamento:** no Z4a, `AD Engine`/`SUB Engine` = Ligado eram aplicados na
  thread de áudio em todos os itens do kit. Num preset sem `SUB_SYNTH_PARAMETERS`,
  `kit[0].subpars` é nulo e o `NoteOn` seguinte usava o ponteiro nulo. Agora os motores
  entram na montagem, alocam os parâmetros que faltam (som padrão do motor) e um motor nunca
  fica ligado sem parâmetros.
- O estado do patch guarda o **preset original** e os parâmetros; ao abrir, os ajustes são
  aplicados uma vez só. Patches da 1.3.2 continuam abrindo (o instrumento salvo vira a base).
- Os ids novos ficam no fim do layout: os índices dos parâmetros antigos (mapeamentos MIDI e
  layouts salvos) não mudam.
- Teste: `ZynPanel.sound.test.tsx`. **Não testado no motor** (sem CMake nesta máquina): a
  compilação é validada pelo workflow Build; o som de cada ajuste precisa ser conferido de ouvido.

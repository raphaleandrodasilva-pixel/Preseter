# Preseter Drums — D0: levantamento confirmado no código

> Tarefa **D0** de `docs/DRUM-MACHINE.md`. Nenhum código foi alterado; este arquivo é o único novo.
> Levantamento feito em **21/11/2026, ~02:50** (Windows, árvore de trabalho com o Synth2 ainda não
> commitado). As linhas citadas valem para esse estado; se o código andar, conferir de novo.
> Tudo o que não foi encontrado no código está marcado como **a confirmar**.

---

## 1. Como um instrumento nativo é registrado ponta a ponta

### 1.1 Identidade no motor

| Peça | Arquivo:linha | O que faz |
|---|---|---|
| `NativeKind` | `engine/src/native/NativeProcessor.h:18-27` | Enum: `organ`, `tines`, `reeds`, `mdaPiano`, `mdaDx10`, `mdaJx10`, `synth2` |
| Fábrica | `engine/src/native/NativeProcessor.h:32` e `.cpp:48-58` | `createNativeProcessor(id)` monta o `NativeProcessor` a partir do id (`preseter.organ`, …) |
| Nomes | `NativeProcessor.cpp:25-33` (`kindName`) e `:36-45` (`kindId`) | Nome exibido e id estável |
| Classe | `NativeProcessor.h:35-146` | Um `juce::AudioProcessor` com APVTS, vozes, DSP e estado |
| Parâmetros | `NativeProcessor.cpp:85-172` (`createLayout(kind)`) | Layout do APVTS por tipo; `mdaPiano/DX10/JX10` devolvem layout **vazio** (`:106-108`) |
| Construtor | `NativeProcessor.cpp:175-198` | Cria o DSP do tipo e chama `applyProgram(0)` |
| `prepareToPlay` | `NativeProcessor.cpp:200-251` | Prepara DSP/delegado; reserva buffers (ex.: `organScratch` em `:238`) |
| `processBlock` | `NativeProcessor.cpp:369-384` (e ramos seguintes) | Limpa a saída (`:381`, `:386`) e delega ao DSP do tipo |
| Programas | `NativeProcessor.cpp:811-835` (números/atual) e `:837-977` (`applyProgram`) | 4 programas para organ/tines/reeds; Synth2 = 1 |
| Nomes de programa | `NativeProcessor.cpp:979-997` | **Atenção:** qualquer tipo não tratado cai nos nomes do Wurly (`:995-996`) |
| Estado | `NativeProcessor.cpp:1009-1033` | XML do APVTS (ou estado do delegado MDA) |
| Buses | `NativeProcessor.h:38` + `.cpp:176`, `:274-278` | Só saída estéreo, sem entrada |

### 1.2 Aceitação de comandos e carga

- `engine/src/CommandRouter.cpp:221-262` — comando `load`: `preseter.sampler` vai para `loadSampler`;
  os ids nativos (`preseter.organ/tines/reeds/piano/dx/jx/synth2`, `:251-253`) vão para
  `engine.loadNative`; o resto é plugin.
- `engine/src/CommandRouter.cpp:320-360` — `stageLoad` repete a mesma lista (`:349-351`) para a troca
  encadeada de patch.
- `engine/src/Engine.cpp:2822-2890` — `Engine::loadNative`:
  - cria o processador (`:2832`);
  - aplica `options.programIndex` **antes** de preparar (`:2846-2850`);
  - liga o playhead do host (`:2853`);
  - cria os nós do grafo: filtro de notas, **arpejador MIDI**, instrumento e channel strip (`:2861-2865`);
  - guarda o ponteiro em `Layer::native` (`:2865`; struct em `engine/src/Engine.h:368-405`, campo em `:378`);
  - ajusta o tempo do arp (`:2878-2879`) e a faixa de notas/transpose (`:2880-2884`).
- `engine/src/Engine.h:145-147` — assinatura pública `loadNative(...)`.

### 1.3 ID e catálogo no app (TS)

- `src/shared/native-instruments.ts:15-23` — **catálogo único** `NATIVE_INSTRUMENTS`
  (`preseter.organ`, `preseter.tines`, `preseter.reeds`, `preseter.piano`, `preseter.dx`,
  `preseter.jx`, `preseter.synth2`).
- `src/shared/native-instruments.ts:25-33` — `isNativeInstrumentId`.
- `src/shared/native-instruments.ts:36-52` — `nativeInstrumentEntry` (entrada de catálogo
  `VstPluginInfo` com `format: 'Native'`).
- `src/renderer/components/concert/ChannelStrips.tsx:300-303` — `nativeEntries` entra na lista de
  instrumentos do seletor de layer.
- `src/main/index.ts:1740-1767` — ao carregar patch, `isNativeInstrumentId` decide que é nativo e
  `stageLoad` recebe `{ programIndex }` (`:1764-1766`).

### 1.4 Janela do instrumento

- `src/renderer/components/concert/NativeInstrumentWindow.tsx:8` — `NativeInstrumentKind`
  (agora inclui `'synth2'`).
- `:10-20` — props (`kind`, `layerId`, `assignment`, `onClose`, `onSave`, mappings opcionais).
- `:34-42` — `TITLES` por tipo; `:44-49` — créditos.
- `:399+` — componente `NativeInstrumentWindow`.
- `src/renderer/components/concert/ConcertShell.tsx:392-410` — mapeia `pluginId` → kind (cadeia de
  ternários) e abre/fecha a janela; `:3583-3603` — renderiza a janela com o assignment do patch.

### 1.5 Coleção (`CollectionLayerSpec.nativeInstrument`)

- `src/shared/collection-presets.ts:58-65` — campo `nativeInstrument` (união de literais; hoje
  `organ|tines|reeds|piano|dx|jx|synth2`), monta o id como `preseter.<nativeInstrument>`.
- `src/main/collection/generateCollection.ts:65-76` — `NATIVE_INSTRUMENT_NAMES`.
- `generateCollection.ts:82-111` — `nativeAssignmentFor` (cria `pluginId`/`path` = `preseter.x`,
  `programIndex`, faixa de notas, velocity, mix e `arp` opcional).
- `generateCollection.ts:237-245` — uso na geração dos patches.
- `engine/CMakeLists.txt:85-102` — fontes compiladas no `PreseterEngine` (inclui
  `src/native/*.cpp` e `src/sampler/SamplerProcessor.cpp`).

**Conclusão do item 1:** registrar `drums` exige tocar em, no mínimo: `NativeKind`
(`NativeProcessor.h`), `kindName`/`kindId`/`createNativeProcessor`/`createLayout`/`applyProgram`/
`getNumPrograms`/`getProgramName` (`NativeProcessor.cpp`), as duas listas do `CommandRouter`,
`NATIVE_INSTRUMENTS` (`native-instruments.ts`), `NativeInstrumentKind` + `TITLES` +
`ConcertShell.tsx:392-406`, a união e os nomes em `collection-presets.ts`/`generateCollection.ts`,
e `engine/CMakeLists.txt` se houver arquivo novo.

---

## 2. Reuso do sampler dentro de outro processador

### 2.1 O que já existe

- `engine/src/sampler/SamplerInstrument.h:16-22` — `Sample`: PCM 16 bits **mapeado em memória**.
- `:25-55` — `Region`: faixa de teclas/velocity, root key, loop, envelope, filtro, pan, gain e
  **`group`/`offBy`**.
- `:62-117` — `Instrument`: `load`, `selectProgram(bank, program)`, `getRegions()`, `getSample()`,
  `cloneForProgram`.
- `SamplerInstrument.cpp:407-433` — `Instrument::load` escolhe `loadSf2` (`.sf2`) ou `loadSfz`
  (qualquer outra extensão), e `normalizePresets()` iguala níveis por preset.
- `SamplerInstrument.cpp:488-513` — `selectProgram(bank, program)`: procura a dupla banco/programa na
  lista de presets; sem correspondência, cai no índice.
- `SamplerInstrument.cpp:553+` — leitura do SF2 (RIFF/sfbk, `pdta`, geradores, key/vel ranges,
  sample modes); `:1075-1076` — SFZ lê `group` e `off_by`.
- `SamplerInstrument.cpp:236-269` — `InstrumentCache`: cache por caminho+tamanho+mtime+banco+programa,
  com `cloneForProgram` compartilhando os samples.
- `SamplerProcessor.h:14-31` — `SamplerProcessor` é um `AudioProcessor` completo (10 parâmetros:
  attack, decay, sustain, release, cutoff, resonance, velocity, transpose, fineTune, polyphony,
  outputGain).
- `SamplerProcessor.cpp:302-319` — `loadFile` via `InstrumentCache` (thread de mensagem).
- `SamplerProcessor.cpp:452-520` — `startNote`: mapeia nota+velocity para **todas** as regiões que
  casam (`:470-480`), calcula razão de afinação (`:493-497`), ganho por velocity (`:499-503`),
  pan (`:504-507`), filtro (`:509-512`) e envelope (`:514-518`).
- `SamplerProcessor.cpp:607-727` — `processBlock`: **limpa o buffer**, aplica parâmetros, processa
  o MIDI e renderiza o bloco inteiro.

### 2.2 Pode instanciar o `SamplerProcessor` dentro de outro `NativeProcessor`?

Tecnicamente sim (é um `AudioProcessor` comum: preparar e chamar `processBlock` com um buffer e um
`MidiBuffer` próprios). **Mas não serve como está para o sequenciador**, por três motivos confirmados:

1. `SamplerProcessor.cpp:614-615` — o laço do MIDI chama `handleMidi(message)` e **ignora
   `metadata.samplePosition`**. Todo note-on começa no **início do bloco**, não na amostra certa.
   A D4 exige ±1 amostra; então é preciso um caminho que dispare numa posição dentro do bloco.
2. Grupos de exclusão: o SFZ lê `group`/`off_by` (`SamplerInstrument.cpp:1075-1076`), mas
   **nenhum código do `SamplerProcessor` usa esses campos** (busca por `group`/`offBy` no arquivo não
   encontra nada). Hi-hat aberto/fechado da D3 terá de ser implementado.
3. `SamplerProcessor.cpp:747` — `getStateInformation` faz `instrument->getFormat()` **sem checar
   nulo**: salvar um sampler vazio (permitido em `Engine.cpp:2768-2774`) derreferencia nulo.

**Recomendação:** reutilizar `sampler::Instrument` (carregamento e mapeamento) como está, e extrair
o **motor de vozes** do `SamplerProcessor` (Envelope, Svf, Voice, `startNote`, render por amostra)
para um núcleo comum, com uma API do tipo “dispara a nota na posição X e renderiza N amostras”.
O `SamplerProcessor` passa a usar esse núcleo, sem mudar o comportamento audível do sampler.

---

## 3. Playhead do host, `setHostClock` e onde o app define `playing`

### 3.1 O que o motor entrega hoje

- `engine/src/Engine.h:25-73` — `HostPlayHead` (um `juce::AudioPlayHead`):
  - `setTempo` (`:28`), `setTimeSignature` (`:29-33`), `setPlaying` (`:34-39`);
  - `getPosition` (`:45-65`): com `playing`, calcula
    `seconds = Time::getMillisecondCounterHiRes() - startMs` (`:54`), `ppq = seconds * bpm / 60`
    (`:55`), início do compasso (`:57-58`); parado devolve `ppq = 0` (`:62`).
- **É um relógio de parede**, recalculado a cada consulta — não avança por bloco de áudio e **não é
  preciso por amostra**. Mudar o BPM no meio do compasso **salta** a posição (o mesmo `seconds`
  é multiplicado pelo BPM novo). `startMs` só é reiniciado na transição parado→tocando (`:36-37`).
- `engine/src/Engine.cpp:2853` (nativos) e `:2712` (plugins) — `processor->setPlayHead(&playHead)`.
  O `getPlayHead()` existe para plugins, mas **nenhum processador interno lê a posição**.
- `engine/src/Engine.cpp:3175-3189` — `Engine::setHostClock(bpm, num, den, playing)` guarda no
  playhead, passa **só o BPM** ao arp (`:3180-3183`) e chama `metronome->setClock(...)` (`:3184-3187`).
- `engine/src/Engine.cpp:692-698` — `MetronomeProcessor::setClock` faz
  `juce::ignoreUnused (playingIn)`: o metrônomo **ignora play/stop**.
- `engine/src/CommandRouter.cpp:438-448` — comando `setHostClock`.
- `src/main/index.ts:1156-1158` — IPC `host-clock-set` → `VstManager.setHostClock`.
- `src/main/vst/VstManager.ts:392-393` — envia `setHostClock` ao engine.

### 3.2 De onde vem o `playing` no app

- `src/renderer/context/AppContext.tsx:460-466` — `appStatus` começa com `isPlaying: false`.
- `src/renderer/components/concert/ConcertShell.tsx:987-990` — a cada mudança de
  `appStatus.tempo`, `appStatus.isPlaying` ou assinatura, envia `setHostClock`.
- `src/renderer/components/concert/ConcertShell.tsx:2741-2743` — ação `'play-stop'` inverte
  `isPlaying`.
- `src/shared/types.ts:334-343` — `'play-stop'` é uma **ação mapeável** (`MappableAction`);
  rótulo em `src/renderer/components/concert/AssignmentsMappingsTable.tsx:51`.
- **Não existe botão de transporte dedicado** no shell (busca por `transport`,
  `Play/Stop` só acha a tabela de ações). Ou seja: hoje `playing` só muda por mapping de hardware
  ou pela ação da tabela. Definir um transporte visível é decisão da **D5** (a confirmar).

### 3.3 Consequência para D1

Um sequenciador não pode usar `HostPlayHead::getPosition()`: ele depende do relógio de parede, não
do tempo de áudio, e o metrônomo/arp nem o consultam. A D1 precisa de um relógio **avançado no
callback de áudio** (por amostras), com posição em ppq e `playing` atômicos, lidos por arp,
metrônomo e drums. O callback único está em `engine/src/Engine.cpp:1504-1577` (MIDI do coletor em
`:1574-1576`).

---

## 4. Arpejador e metrônomo (referência de agendamento)

### 4.1 Arpejador — `engine/src/Engine.cpp:152-539`

- `processBlock` (`:170-227`): guarda início/fim do bloco em amostras absolutas
  (`:175-176`), consome o MIDI, chama `pump` e troca o buffer (`:224-226`).
- Começa a contar na **primeira nota** (`:343-347`: `nextStepAbs = absoluteSample`), não em um
  relógio externo.
- Passo em amostras: `samplesPerStep()` usa `bpm` atômico, divisão e sample rate (`:308-313`).
- `pump` (`:451-508`): emite note-on/off com posição **relativa ao bloco**
  (`:436-440`, `:456-457`), swing nos passos ímpares (`:467-472`), gate (`:494`), avanço
  `nextStepAbs += base` (`:497`) — a fase em amostras absolutas **não** é recalculada de segundos.
- Usa um `juce::MidiBuffer output` local (`:188`); sem locks nem I/O. Não há garantia formal de
  “sem alocação” do `MidiBuffer` (ele pode crescer) — para a D4, pré-alocar ou validar.
- Tempo recebido por `setTempo` (`:257`) a partir de `Engine::setHostClock`/`loadNative`.

### 4.2 Metrônomo — `engine/src/Engine.cpp:596-719`

- Conta `ppqPosition` **por amostra a partir do instante em que é ligado** (`:629-651`).
- Desligado, zera a posição (`:647-651`).
- `configure` (`:678-690`) só zera a posição quando o estado ligado/desligado muda.
- **Ignora `playing`** (`:694`), como o documento já apontava.
- O clique é síntese senoidal com envelope (`:653-662`).

**Conclusão do item 4:** confirmada a lacuna do documento. Arp e metrônomo têm fases
independentes; o arp parte da primeira nota e o metrônomo do momento em que é ligado.

---

## 5. Estado dos nativos por patch (`vstStates`)

- `src/shared/types.ts:154` — `Preset.vstStates: Record<string, any>`.
- `engine/src/Engine.cpp:3819-3840` — `getPluginState` chama `getStateInformation` do processador e
  devolve **base64**; `:3842-3866` — `setPluginState` decodifica e chama `setStateInformation`.
- `engine/src/CommandRouter.cpp:576-595` — comandos `getState` / `setState`.
- `src/main/vst/VstManager.ts:445-453` — `getPluginState` → `getState`;
  `:638-656` — `setPluginState` → `setState`.
- `src/renderer/components/App.tsx:176-185` — ao salvar o patch, para cada layer carregado grava
  `vstStates['loaded_' + layerId] = vstGetState(layerId)`.
- `src/main/index.ts:1770-1781` — ao carregar o patch, procura `loaded_<layerId>`, `<layerId>`,
  `loaded_<pluginId>`, `<pluginId>` etc. e reaplica com `setPluginState`.
- `engine/src/native/NativeProcessor.cpp:1009-1033` — o estado é o **XML do APVTS** (ou do delegado
  MDA); `setStateInformation` faz `apvts.replaceState`.
- `Engine::loadNative` aplica `programIndex` na carga (`:2846-2850`), mas o programa **não** vai no
  XML do estado — ele viaja no `assignment.programIndex` do patch.

**Consequência:** guardar o `DrumPattern` no estado do instrumento (um filho novo do ValueTree,
ex.: `"DRUMS"`) faz o padrão ir junto no base64 de `vstStates` **sem mudar o formato do
`.preseter`**. Arquivo antigo não tem a chave → o estado chega vazio → o instrumento usa o padrão
(no máximo, um “padrão vazio”). Atenção: o estado só é salvo para layers **carregados** no app no
momento de salvar (`App.tsx:179-180`).

---

## 6. Testes de nulidade e como rodá-los

### 6.1 O que existe

| Teste | Onde | Como compilar/rodar |
|---|---|---|
| Tines × MDA ePiano | `engine/test/mda-epiano-nullity/main.cpp` + `README.md:7-13` | `cmake -S engine -B engine/build -DPRESETER_BUILD_TINES_NULLITY=ON` → `cmake --build engine/build --config Release --target PreseterTinesNullity` → `engine/build/PreseterTinesNullity_artefacts/Release/PreseterTinesNullity.exe --out-dir=.` |
| Órgão × setBfree | `engine/test/setbfree-nullity/main.cpp` + `README.md:18-24` | `-DPRESETER_BUILD_SETBFREE_NULLITY=ON` → alvo `PreseterSetBfreeNullity` → `engine/build/Release/PreseterSetBfreeNullity.exe --out-dir=.` |
| Wurly (smoke de áudio) | `engine/test/openwurli-capi/main.cpp` | `-DPRESETER_BUILD_WURLI_SMOKE=ON` → alvo `PreseterWurliSmoke` (`engine/CMakeLists.txt:189-203`) |

- Alvos no CMake: Tines `engine/CMakeLists.txt:254-293`; setBfree `:295-330`; Wurly `:189-203`.
  **Todos são opções OFF por padrão.**
- CI (`.github/workflows/build.yml:22-36`) roda só `npm run typecheck` e `npm test` (vitest); os
  testes C++ **não** entram no CI. O engine é compilado no CI em `:83-96` sem os testes.
- Vitest: projetos `shared`, `main`, `renderer` em `vitest.config.ts:12-41`; comando `npm test`.
- Scripts de integração que sobem o engine real e conversam JSON:
  `scripts/engine-smoke.js`, `scripts/engine-epianos-smoke.js`, `scripts/engine-organ-smoke.js`,
  `scripts/engine-synth2-smoke.js` (padrão em `scripts/engine-synth2-smoke.js:1-30`:
  `spawn` do `PreseterEngine.exe` + `readline` + `request(cmd, payload)`).
- Teste de silêncio do motor documentado em `docs/testes/audio-silencio.md` (usa
  `scripts/engine-audio-silence.js` e `ffmpeg -af volumedetect`).

### 6.2 Como seria o teste do novo instrumento

- Criar um alvo de console próprio (ex.: `PRESETER_BUILD_DRUMS_TESTS`) seguindo o padrão do Tines:
  instanciar o instrumento/fábrica, `prepareToPlay(48000, bloco)`, renderizar blocos de 64/256/1024
  sem MIDI e exigir **silêncio digital** (pico 0 ou abaixo do piso); depois disparar notas/padrão e
  exigir **RMS > 0**.
- Para a D4 (tempo), o teste precisa de um ponto de observação dos disparos por amostra. Duas
  opções, ambas plausíveis no padrão do repo:
  1. teste C++ que renderiza blocos variados e mede o primeiro sample não nulo de cada batida
     (precisa de um kit de teste com amostra conhecida);
  2. script Node que sobe o engine, carrega `preseter.drums`, liga o sequenciador e grava a saída,
     analisando os onsets.
- Se o teste tiver de rodar em CI, ele precisa entrar em `.github/workflows/build.yml` (hoje só
  typecheck + vitest) **ou** ser um `.test.ts` que sobe o `PreseterEngine` (o padrão de
  `scripts/engine-*.js` não é vitest).

---

## 7. Lacunas e armadilhas confirmadas

1. **Fase única não existe.** Arp parte da primeira nota (`Engine.cpp:343-347`); metrônomo parte de
   quando é ligado e ignora `playing` (`:629-651`, `:694`). → D1.
2. **`HostPlayHead` não serve como relógio do sequenciador**: é relógio de parede
   (`Engine.h:54-55`), salta com mudança de BPM e não avança por bloco.
3. **O sampler ignora a posição do evento MIDI** (`SamplerProcessor.cpp:614-615`): tudo começa no
   início do bloco. Para ±1 amostra é preciso extrair/estender o motor de vozes.
4. **Grupos de exclusão não são aplicados** no sampler, embora `group`/`off_by` sejam lidos do SFZ
   (`SamplerInstrument.cpp:1075-1076`).
5. **Salvar sampler vazio derreferencia nulo** (`SamplerProcessor.cpp:747`).
6. **Novo `NativeKind` cai em nomes/roteiros do Wurly** se não for tratado:
   `getNumPrograms` devolve 4 (`NativeProcessor.cpp:817`), `getProgramName` cai nos nomes do Wurly
   (`:995-996`) e `applyProgram` termina no bloco do Wurly (`:955-977`).
7. **`NativeInstrumentKind` e o mapa do `ConcertShell`** são listas fechadas
   (`NativeInstrumentWindow.tsx:8`, `ConcertShell.tsx:392-406`): esquecer uma deixa a janela sem
   abrir.
8. **Estado só é salvo com o layer carregado** no app (`App.tsx:179-180`); um padrão editado sem o
   instrumento carregado não vai para o patch.
9. **BPM do app** vem de `appStatus.tempo` (`ConcertShell.tsx:989`), alterado por controles de tempo
   (`:3162`, `:3180`, `:3471`, `:3736`), pelo tap tempo (`:2691-2698`) e ao trocar de patch
   (`AppContext.tsx:931-932`). Não há um “tempo do patch” separado do concert no motor.
10. **Documentos citados pelas tarefas ainda não existem**: não há `docs/LICENCAS.md`,
    `docs/LOJA.md`, `docs/PATCHES.md` nem `docs/COLECAO.md` (lista de `docs/*.md`). D10/D12 terão de
    criá-los.

---

## 8. Decisão final da §3 (registrada)

**Instrumento autocontido: confirmado.** `preseter.drums` será um instrumento nativo, registrado
como os outros, com pads + sequenciador dentro do próprio processador. Não precisa de novo tipo de
nó MIDI.

Detalhamento da decisão:

1. **Registro:** acrescentar `NativeKind::drums` em `NativeProcessor` (e não uma classe paralela),
   mantendo `createNativeProcessor`, `loadNative`, `programIndex` e `vstStates` funcionando sem
   mudança de contrato. O conteúdo pesado (kit + sequenciador) fica em classes próprias
   (`DrumKit`/`DrumEngine`) usadas internamente. Se na D2 o `NativeProcessor` ficar grande demais,
   a alternativa é mudar a fábrica para devolver `std::unique_ptr<juce::AudioProcessor>` — decisão
   só se necessário.
2. **Som:** reutilizar `sampler::Instrument` para carregar SFZ/SF2 e mapear notas; extrair um núcleo
   de vozes do `SamplerProcessor` para disparar em posição de amostra exata e aplicar grupos de
   exclusão. **Não** embrulhar o `SamplerProcessor` como está (perde a posição dentro do bloco).
3. **Padrão:** guardar o `DrumPattern` dentro do estado do instrumento (filho do ValueTree do
   APVTS), que já viaja em `Preset.vstStates` como base64. Sem campo novo no `.preseter`; arquivos
   antigos abrem com o padrão vazio. O **kit** é o programa interno (`programIndex`), como nos
   outros nativos.
4. **Relógio:** a D1 cria o relógio mestre no callback de áudio; o drums só consome a posição
   (ppq/playing), nunca o `HostPlayHead` de parede.

---

## 9. Em aberto (a confirmar antes de implementar)

- Nomes e quantidade dos kits/programas do `preseter.drums` (D2/D3/D8) — **a confirmar**.
- Mapa de notas dos pads (GM x próprio) — **a confirmar** com o kit escolhido na D10.
- Se o Play/Stop ganha um controle visível no shell (hoje só existe como ação mapeável) — decisão
  da D5.
- Se o teste de fase da D1 roda em C++ (fora do CI, como os de nulidade) ou como script Node no CI —
  decisão da D1, conforme o padrão acima.
- Kits e licenças: nada entra sem tabela verificada (D10); `docs/LICENCAS.md` ainda não existe.

---

## 10. Verificação desta tarefa

- `npm run typecheck` — **passou** no momento do levantamento (21/11/2026 ~02:50). Minutos antes
  falhava em `ConcertShell.tsx:392` porque o Synth2 estava sendo editado; a árvore tem trabalho não
  commitado, então o resultado pode oscilar enquanto a edição continua.
- `npx vitest run` — não executado nesta tarefa (D0 só lê o código e escreve este arquivo).
- Nenhum arquivo de código foi alterado; nenhum `.preseter` foi tocado.

---

## 11. D1 — Relógio mestre único (implementado)

> Implementado em 21/11/2026. `MasterClock` + `TransportGrid` + integração no arp, no metrônomo e no
> playhead dos plugins; teste de fase de 10 minutos. Nada de som novo (o instrumento é a D2).

### 11.1 Arquivos

| Arquivo | O que é |
|---|---|
| `engine/src/MasterClock.h` (**novo**) | Relógio mestre sem JUCE: posição em ppq, BPM, compasso, play/stop, tudo atômico |
| `engine/src/TransportGrid.h` (**novo**) | Aritmética da grade (passo/tempo em ppq, índice do próximo evento, conversão para amostra do bloco) usada por arp e metrônomo |
| `engine/src/Engine.h` | `MasterClock masterClock`; `HostPlayHead` lê o relógio; `describeTransport()` |
| `engine/src/Engine.cpp` | `beginBlock` no callback de áudio; arp em modo transporte (`pumpTransport`); metrônomo em modo transporte; fiação do relógio nos MIDI FX; `setHostClock` e `describeTransport` |
| `engine/src/CommandRouter.cpp` | Comando `transport` (posição para a interface) |
| `engine/CMakeLists.txt` | Alvo opcional `PreseterClockTest` |
| `engine/test/clock-phase/main.cpp` (**novo**) | Teste de fase de 10 minutos simulados |

### 11.2 Semântica (definida e implementada)

- **Posição**: ppq (semínima) desde o início do transporte. O callback publica a posição do
  **início do bloco** antes de processar o grafo; todo mundo (arp, metrônomo, playhead dos plugins e,
  na D4, o sequenciador) lê a mesma posição.
- **Troca de BPM**: a posição acumula `amostras × BPM/60/taxa`; o BPM novo vale no bloco seguinte.
  Não há recálculo a partir de segundos, então **não há salto**. O teste confere continuidade de
  0 ppq entre blocos mesmo variando 120 → 143 → 97 → 180 → 120.
- **Play/Stop**: **Stop zera** a posição (o transporte volta ao compasso 1) e Play começa em 0. A
  interface mostra `bar`/`beat` começando em 1.
- **Com o transporte parado, nada muda no audível**: o arp continua livre (parte da primeira nota) e
  o metrônomo continua contando desde que foi ligado, como antes. Quando o transporte toca, os dois
  passam a seguir a grade.
- **Plugins**: o `HostPlayHead` passou a devolver a posição do relógio mestre (por bloco) em vez do
  relógio de parede. Isso corrige o salto de posição na troca de BPM e alinha os plugins ao resto.
- **Thread de áudio**: `beginBlock` só faz leituras/escritas atômicas e aritmética; sem alocação,
  bloqueio ou I/O. O arp continua usando o `MidiBuffer` local como antes.

### 11.3 Como o arp e o metrônomo seguem a grade

- `ArpeggiatorProcessor::pumpTransport` (`Engine.cpp`): converte `ppq → amostra do bloco` com
  `transport::sampleOffsetForPpq`, aplica swing em ppq nos passos ímpares e emite note-on/off nas
  posições exatas. O `pump` livre continua intacto para quando o transporte está parado.
- `MetronomeProcessor`: no modo transporte dispara o clique na amostra exata do tempo (índice da
  grade), em vez de detectar a virada de beat no começo do bloco. Desligado, `enabled` ainda silencia
  o clique; o índice da grade continua avançando.
- `TransportGrid::eventInBlock` é meia-aberta em amostras: um evento na fronteira do bloco cai no
  bloco seguinte **uma única vez**, nunca nos dois.

### 11.4 Teste de fase

```powershell
cmake -S engine -B engine/build -DPRESETER_BUILD_CLOCK_TEST=ON
cmake --build engine/build --config Release --target PreseterClockTest
engine/build/Release/PreseterClockTest.exe
```

Resultado (21/11/2026):

```
Relogio mestre - teste de fase (10 min simulados)
blocos: 64287 | amostras: 28800000
eventos: metronomo=1321 arp=1321
continuidade maxima de ppq entre blocos: 0.000e+00
transporte: Stop=0, Play=0, avanco apos Play=0.010666667 ppq (ok)
ultimo evento: amostra 28799772
Resultado: PASS
```

O teste usa `48 kHz`, blocos alternando 64/256/1024 amostras, cinco trechos de BPM (120/143/97/180/120)
e confere: primeiro evento na amostra 0, mesma quantidade de eventos nas duas grades, **cada batida do
metrônomo na mesma amostra do passo do arp**, eventos estritamente crescentes e continuidade de ppq.

### 11.5 Verificação no motor real

Com o motor compilado e o ASIO4ALL aberto (44,1 kHz / 256):

- `transport` antes do áudio: `playing=false`, `ppq=0`; após Play: `ppq` avança (~1,61 ppq em 0,8 s
  a 120 BPM), `bar/beat` acompanham;
- troca de BPM para 97 sem salto (posição continua de ~1,61 para ~2,12 ppq);
- Stop: `ppq=0`, `playing=false`;
- arp ligado com o transporte tocando gravou áudio (média −21,9 dBFS, pico −8,2 dBFS);
- metrônomo ligado com o transporte gravou cliques (pico −18,1 dBFS).

### 11.6 Observações para as próximas tarefas

- O comando `transport` já existe no motor; falta expor no preload/`electronAPI` e usar na D7 para o
  indicador de passo (sugestão: consultar a ~30 Hz).
- O teste é um alvo CMake **OFF por padrão** e ainda **não roda no CI**. Para a D11, vale incluir no
  job Linux (é JUCE-free e roda em milissegundos).
- A tabela de divisões do arp (`1/4` = 4 tempos, `1/16` = 1 tempo) é a existente; foi mantida para
  não mudar o audível. A D4 pode definir a grade própria do sequenciador sem mexer nela.

---

## 12. D2 — Esqueleto do `preseter.drums` (implementado, sem som)

> Implementado em 21/11/2026. O instrumento já carrega, aparece no catálogo, abre a janela, salva e
> restaura estado e fica em silêncio. Nada de kit nem de sequenciador ainda.

### 12.1 Registro ponta a ponta

| Ponto | Arquivo | O que mudou |
|---|---|---|
| `NativeKind` | `engine/src/native/NativeProcessor.h` | novo valor `drums` |
| Nome/id/fábrica | `engine/src/native/NativeProcessor.cpp` | `kindName` = "Preseter Drums", `kindId` = `preseter.drums`, `createNativeProcessor` |
| Parâmetros | idem, `createLayout` | layout **vazio** (0 parâmetros) |
| Programas | idem | 1 programa, "Kit vazio" (**a confirmar** os kits reais na D3/D8) |
| Carga/estado/silêncio | idem | `prepareToPlay` sem DSP; `processBlock` limpa áudio e MIDI; `getTailLengthSeconds` = 0; `applyProgram` não cai no Wurly |
| Comandos | `engine/src/CommandRouter.cpp` | `preseter.drums` aceito em `load` e `stageLoad` |
| Catálogo TS | `src/shared/native-instruments.ts` | `{ id: 'preseter.drums', name: 'Preseter Drums', category: 'Bateria' }` |
| Coleção | `src/shared/collection-presets.ts` e `src/main/collection/generateCollection.ts` | `'drums'` na união e nos nomes |
| Janela | `src/renderer/components/concert/NativeInstrumentWindow.tsx` | kind `drums`, título, 1 programa e um painel provisório ("instrumento em construção") |
| Abertura | `src/renderer/components/concert/ConcertShell.tsx` | `preseter.drums` → `drums` |

Nada de novo no `CMakeLists.txt`: o instrumento mora dentro do `NativeProcessor` (decisão da D0), sem
arquivo-fonte extra por enquanto.

### 12.2 Comportamento atual

- Recebe MIDI e **descarta**: áudio zerado e MIDI limpo em `processBlock`. Nenhuma nota presa.
- Estado: XML do APVTS com layout vazio (base64 de 84 caracteres; 61 bytes binários). Restaura sem
  erro.
- `programIndex` do patch continua sendo aplicado na carga (`Engine::loadNative`), limitado a 0.
- A janela abre com o painel provisório e o botão "Kit vazio"; o visual dos outros instrumentos não
  muda.

### 12.3 Verificação

`src/shared/native-instruments.test.ts` (novo):

- o catálogo contém `preseter.drums` (nome e categoria);
- `isNativeInstrumentId` e `nativeInstrumentEntry` reconhecem o id como nativo;
- os sete instrumentos anteriores continuam no catálogo.

`scripts/engine-drums-smoke.js` (novo; roda o motor real):

```powershell
node scripts/engine-drums-smoke.js --type=ASIO --output="ASIO4ALL v2" --input="ASIO4ALL v2" --rate=44100 --buffer=256
```

Saída (21/11/2026):

```
carregou: Preseter Drums | programas: 1 | parâmetros: 0
estado: base64 84 caracteres | bytes ao restaurar: 61 | restaurado: sim
áudio: ASIO ASIO4ALL v2 44100 Hz / 256
silêncio: max -91 dB | mean -91 dB
Resultado: PASS
```

O script envia notas 36/38/42/46/49/51 com o transporte tocando, grava ~1,2 s e analisa com o
`ffmpeg-static`: pico no piso do medidor (−91 dB), ou seja, silêncio digital. Também confere nome,
1 programa e 0 parâmetros.

Também nesta tarefa: `npm run typecheck` ✓ e os testes de catálogo/coleção ✓ (19 testes).

### 12.4 Próximos passos

- **D3**: pads + kit (o `SamplerProcessor` precisa de um núcleo de vozes para disparar amostras, ver
  §2.2) e grupos de exclusão.
- **D4**: sequenciador consumindo o `MasterClock` da D1.
- **D6**: `DrumPattern` dentro do estado do instrumento (o `vstStates` já carrega o XML).
- **D7**: substituir o painel provisório pela grade de passos e pelos pads.

---

## 13. D3 — Pads e kit (implementado)

> Implementado em 21/11/2026. O `preseter.drums` já toca bateria pelo teclado: 16 pads GM (36..51),
> velocity, volume/mudo por pad, chimbal com exclusão e kit SF2 carregado do MuseScore_General.

### 13.1 Kit padrão e licença

- **Arquivo**: `MuseScore_General.sf2`, banco **128**, programa **0** (kit padrão GM).
- **Licença**: **MIT**, confirmada na fonte em
  `https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md`
  (versão 0.2, 13/05/2020). O texto exige manter os avisos de copyright/atribuição em trabalhos
  derivados: FluidR3 (Frank Wen), conversão mono (Michael Cowgill), adaptação (S. Christian Collins),
  Temple Blocks (Ethan Winer) e Drumline Cymbals (Michael Schorsch). **A D10 deve registrar esses
  avisos em `docs/LICENCAS.md` e nos licences do instalador.**
- **Por que SF2**: o mesmo arquivo/programa já é usado pelo patch "Acoustic Rock Kit" da Coleção
  (`src/shared/collection-presets.ts:431-435`), então não há dependência nova; o motor mapeia o SF2
  direto em memória e o mapa GM 36..51 já vem pronto.
- **Tamanho**: ~205 MB. O SF3 (35,9 MB) **não** é suportado pelo motor (só `.sf2`/`.sfz`). A D10 pode
  avaliar um SF2 derivado só com o banco de bateria (o MIT permite, mantendo os avisos).
- **Sem kit** (arquivo ausente): o instrumento carrega e fica silencioso; não impede o patch de abrir.

### 13.2 Arquivos

| Arquivo | O que é |
|---|---|
| `engine/src/drums/DrumKitEngine.h` / `.cpp` (**novo**) | Motor de pads: regiões, vozes, envelope, filtro, pan, loop, velocity, mudo/volume por pad e exclusão |
| `engine/src/native/NativeProcessor.{h,cpp}` | O tipo `drums` usa o `DrumKitEngine`; `loadDrumKit`, `describeDrumKit`, estado com caminho do kit |
| `engine/src/Engine.cpp` | `loadNative` carrega o kit quando recebe `samplePath` (+ `kitBank`/`kitProgram`) |
| `src/main/index.ts` | Injeta o kit padrão do Drums no `vst-load` e na carga de patch |
| `engine/CMakeLists.txt` | `src/drums/DrumKitEngine.cpp` no alvo `PreseterEngine` |

### 13.3 Comportamento

- **Pads**: notas 36..51. Nomes em PT-BR no motor (Bumbo, Aro, Caixa, Palmas, Caixa elétrica, Tom
  baixo, Chimbal fechado, Tom de chão, Chimbal com pedal, Tom médio-baixo, Chimbal aberto, Tom médio,
  Tom médio-alto, Prato de ataque, Tom alto, Condução).
- **Velocity**: escolhe a camada (`velLow`/`velHigh` da região) e aplica a curva `v^1.6` multiplicada
  pelo `velTrack` da região. Medido: nota 38 a 127 dá −15,2 dB de pico; a 40 dá −32,5 dB.
- **Volume/mudo por pad**: `setPadLevelDb` (−60..12 dB) e `setPadMuted` no motor, com padrão 0 dB e
  sem mudo. A interface (D7) ainda não expõe; o estado do padrão/pads fica para a D6/D7.
- **Grupos de exclusão**: chimbal fechado (42) e com pedal (44) calam o aberto (46) e vice-versa.
  Regiões SFZ com `group`/`off_by` também se calam (`chokeOffBy`). Confirmado no teste: aberto = 2
  vozes; fechado sozinho = 2; depois do fechado = 2 (não 4).
- **One-shot**: note-off é ignorado; `all-notes-off`/`all-sound-off` corta tudo. 64 vozes, roubando a
  mais antiga quando estoura.
- **Precisão**: as notas do teclado já disparam na posição do evento dentro do bloco
  (`metadata.samplePosition`); a D4 usa o mesmo caminho para o sequenciador.
- **Estado**: o XML do instrumento guarda `drumKitPath`, `drumKitBank` e `drumKitProgram` (base64 de
  240 caracteres / 180 bytes no teste). `setStateInformation` **não recarrega** o arquivo (o áudio
  pode estar rodando); troca segura de kit fica para a D6.

### 13.4 Caminho do kit

- Na carga de patch (`src/main/index.ts`, `loadPresetNow`): se o layer é `preseter.drums`, envia
  `samplePath` = caminho do assignment ou o padrão
  `soundsFolder/MuseScore_General/MuseScore_General.sf2`, mais `kitBank: 128` e `kitProgram: 0`.
- Ao adicionar o layer pela interface (`vst-load`): mesma injeção de padrão.
- No motor (`Engine::loadNative`): `processor->loadDrumKit(File(samplePath), kitBank, kitProgram)`
  antes de entrar no grafo. Erros de carga não derrubam a carga; o instrumento fica silencioso.

### 13.5 Verificação

`scripts/engine-drums-smoke.js` atualizado (D2 → D3):

```powershell
node scripts/engine-drums-smoke.js --type=ASIO --output="ASIO4ALL v2" --input="ASIO4ALL v2" --rate=44100 --buffer=256
```

Saída (21/11/2026):

```
carregou: Preseter Drums | programas: 1 | parâmetros: 0
estado: base64 240 caracteres | bytes ao restaurar: 180 | restaurado: sim
áudio: ASIO ASIO4ALL v2 44100 Hz / 256
silêncio sem nota: max -91 dB
som (MuseScore_General.sf2): max -5.2 dB | mean -28.4 dB
velocity: 127 -> max -15.2 dB | 40 -> max -32.5 dB
chimbal: aberto 2 | fechado sozinho 2 | após o fechado 2
Resultado: PASS
```

O script requer o `MuseScore_General.sf2` em `~/PreseterSons` (ou `--kit=CAMINHO`); sem o arquivo
ele sai com código 2 e uma mensagem clara. Também verifica, com o motor real: silêncio sem nota (piso
−91 dB), áudio ao tocar 36/38/42/46/49, velocity 127 mais alta que 40 e o chimbal sem somar vozes.
`npm run typecheck` ✓ e `PreseterEngine` compila.

**Estado da suíte nesta árvore (21/11/2026):** `npx vitest run` teve 1 falha **pré-existente e de outra
frente** — `PreseterEffectWindow.test.tsx` espera o texto "Guitarix · GPL-3.0-or-later", mas o
componente mostra "GPL-2.0-or-later". Também houve timeouts de 5 s em testes de renderer enquanto o
app e outras sessões rodavam (isolados passam: `NativeInstrumentWindow`, `StoreSettings`). Os testes
do Drums (`native-instruments.test.ts`) passam e o smoke do motor passa.

### 13.6 Limites conhecidos

- Sem round-robin (o motor não lê `seq`/`rand` do SFZ); camadas de velocity e key ranges funcionam.
- O núcleo de vozes do `SamplerProcessor` **não** foi extraído nesta tarefa: o `DrumKitEngine`
  reimplementa o render (mesma matemática de envelope/filtro/pan/loop) para não arriscar o sampler.
  A D11/D12 pode unificar os dois núcleos.
- O kit padrão é GM "de fábrica", não um kit de estúdio.
- Sem interface de pads ainda (D7) e sem sequenciador (D4).
- Pad volumes/mudos e o padrão ainda não entram no estado (D6).

---

## 14. D4 — Núcleo do sequenciador (implementado)

> Implementado em 21/11/2026. O sequenciador segue o `MasterClock`, dispara os pads na amostra exata,
> aceita 8/12/16/32 passos por compasso, swing, loop por `bars` e troca de padrão só no início do
> compasso. Sem interface ainda.

### 14.1 Arquivos

| Arquivo | O que é |
|---|---|
| `engine/src/drums/DrumPattern.h` (**novo**) | Modelo do padrão: 16 trilhas × até 128 passos, velocity, mudo, nível e swing; sanitização e limite de tamanho fixo |
| `engine/src/drums/DrumScheduler.h` (**novo**) | Agendador JUCE-free: lê ppq/pps do relógio, calcula a amostra do passo, aplica swing, faz o loop e publica/consome o padrão por seqlock |
| `engine/src/drums/DrumSequencer.h` (**novo**) | Liga o agendador ao `MasterClock` e guarda os eventos do bloco (1024 no máximo) |
| `engine/src/native/NativeProcessor.{h,cpp}` | Merge do MIDI de teclado com os passos, em ordem de amostra; `setDrumPattern`, `setDrumSequencerEnabled`, `describeDrums`; padrão e sequenciador |
| `engine/src/Engine.{h,cpp}` | `setDrums`/`describeDrums`; entrega do `MasterClock` aos nativos |
| `engine/src/CommandRouter.cpp` | Comandos `setDrums` e `drums` |
| `engine/test/drum-timing/main.cpp` (**novo**) | Teste de tempo de 10 min, swing, 8/12/16/32, `bars=2` e troca no compasso |
| `engine/CMakeLists.txt` | Alvo opcional `PreseterDrumTimingTest` |

### 14.2 Funcionamento

- **Grade**: passo = `barLengthPpq / stepsPerBar`; `barLengthPpq` vem do compasso atual
  (`numerador × 4 / denominador`). 4/4 com 16 passos = 1 passo por tempo.
- **Swing** (0–75%): atrasa os passos ímpares (0-based, ou seja, os "passos pares" na contagem
  musical) em `stepLen × swing / 200` ppq, como no arp.
- **Loop**: `stepIndex` percorre `stepsPerBar × bars` (até 128) e volta ao 0.
- **Troca de padrão**: a thread de mensagem publica por seqlock; a thread de áudio copia no **início
  do compasso** (`stepIndex % stepsPerBar == 0`). O padrão anterior toca até a borda, sem corte.
- **Play/Stop**: com o transporte parado, nada dispara e o estado é resetado; Play começa no
  compasso 1. Ligar o sequenciador no meio do compasso espera o próximo compasso (evita entrar no
  meio de um padrão).
- **Amostra exata**: `ppq → amostra` com `TransportGrid::sampleOffsetForPpq`; a mesma conta do arp e
  do metrônomo. Passos que cruzam a borda do bloco continuam no bloco seguinte (meia-aberta).
- **BPM**: a grade é em ppq; mudar o BPM não reposiciona o passo já agendado (só muda o espaçamento
  seguinte). O `MasterClock` publica o BPM do bloco.
- **Trilhas**: cada trilha tem `pad` (0..15), `mute`, `level` e passos `{ on, velocity }`. O nível e o
  mudo viram o volume/mudo do pad no kit (se duas trilhas usarem o mesmo pad, vale a última).
- **Exclusão**: os note-ons do sequenciador passam pelo `DrumKitEngine`, então o chimbal e os grupos
  SFZ continuam valendo. Nenhum note-off é enviado (bateria é one-shot).
- **Thread de áudio**: arrays fixos (eventos e MIDI de entrada), sem alocar/bloquear/I-O. Sysex é
  ignorado na cópia do MIDI; acima de 128 eventos de teclado por bloco os excedentes são descartados.

### 14.3 API do motor

`setDrums` (thread de mensagem), exemplo:

```json
{
  "cmd": "setDrums",
  "layerId": "drums",
  "enabled": true,
  "pattern": {
    "stepsPerBar": 16,
    "bars": 1,
    "swing": 0,
    "tracks": [
      {
        "pad": 0,
        "level": 0,
        "steps": [
          { "on": true, "velocity": 120 },
          { "on": false },
          { "on": false },
          { "on": false },
          { "on": true, "velocity": 120 }
        ]
      }
    ]
  }
}
```

Os passos não enviados ficam desligados (o exemplo acima mostra só os 5 primeiros de 16).

- `enabled` sem `pattern` só liga/desliga e mantém o padrão atual.
- Um passo também aceita `true`/`false` ou um número (velocity) em vez de `{ on, velocity }`.
- **`drums`** devolve `enabled`, `currentStep`, `stepsPerBar`, `bars`, `swing`, `tracks` (com os
  passos), `pads` (nome/nota/volume/mudo) e a descrição do kit. A D7 usa `currentStep` para o
  indicador em movimento.

### 14.4 Teste

```powershell
cmake -S engine -B engine/build -DPRESETER_BUILD_DRUM_TIMING_TEST=ON
cmake --build engine/build --config Release --target PreseterDrumTimingTest
engine/build/Release/PreseterDrumTimingTest.exe
```

Saída (21/11/2026):

```
10 min: eventos=5281 (esperado ~5280, delta +1)
pior erro absoluto: 0.497 amostras (em 5941321)
swing 60%: eventos=240 | pior erro 0.000 amostras
resolução  8: eventos=40 (esperado 40, delta +0) | pior erro de espaçamento 0.000
resolução 12: eventos=60 (esperado 60, delta +0) | pior erro de espaçamento 0.000
resolução 16: eventos=80 (esperado 80, delta +0) | pior erro de espaçamento 0.000
resolução 32: eventos=160 (esperado 160, delta +0) | pior erro de espaçamento 0.000
bars=2: passos=48 | índice 0..31: ok
troca de padrão: primeiro B em 96000 (compasso em 96000) | último A em 90000
Resultado: PASS
```

O teste usa o `MasterClock` e o `DrumSequencer` reais, blocos alternando 64/256/1024, BPM
120→143→97→180→120 e compara cada passo com um modelo independente (integração do tempo por
segmento), com tolerância de 1 amostra.

No motor real (`scripts/engine-drums-smoke.js`), com o kit carregado:

```
sequenciador: passos 16 | trilhas 3 | ligado true
sequenciador som: max -5.9 dB | mean -23.7 dB
passo atual: 14 de 16
após BPM 97: passo 1 | ligado true
sequenciador parado: max -91 dB
Resultado: PASS
```

### 14.5 Limites e próximos passos

- Padrão e passos vivem só na memória por enquanto: a D6 os coloca no estado do instrumento.
- Sem UI (D7), sem padrões de fábrica (D8) e sem ligação ao patch/Play do concert (D5).
- Ligar o sequenciador no meio do compasso espera o próximo; "iniciar com o patch" e contagem de
  entrada ficam na D5.
- O nível da trilha vira volume do pad; não há mixer separado por trilha.

---

## 15. D5 — Transporte e sincronia com o app (implementado)

> Implementado em 21/11/2026. O sequenciador já segue o **Play/Stop** do concert e o **tempo do
> patch/tap tempo**; cada layer de Drums tem a configuração `enabled`/`startWithPatch` no patch.

### 15.1 Configuração por patch

`src/shared/types.ts` — `DrumSettings` em `PresetPluginAssignment.drums`:

```ts
interface DrumSettings {
  enabled: boolean;          // "Sequenciador ligado"
  startWithPatch: boolean;   // "Iniciar com o patch"
}
const DEFAULT_DRUMS = { enabled: false, startWithPatch: true };
```

- **`enabled`**: o patch quer o sequenciador ligado.
- **`startWithPatch`**: ao carregar o patch, liga sozinho. Se falso, o patch carrega com o
  sequenciador **pausado** (a interface da D7 inicia). Decisão da v1; a D12 pode revisar.
- A regra fica em `drumsStartOnLoad()` (`types.ts`) e é aplicada em
  `src/main/index.ts` (`loadPresetNow`), depois de `commitPatchSwap`, via
  `VstManager.setDrums(layerId, { enabled })`.
- `CollectionLayerSpec.drums` é copiado para o assignment em `nativeAssignmentFor`
  (`generateCollection.ts`), para a D9 poder marcar os patches de fábrica.

### 15.2 Play/Stop

- O `MasterClock` já é controlado por `appStatus.isPlaying` (`ConcertShell` → `setHostClock`);
  parado, o `DrumSequencer` não emite passos e zera `currentStep`.
- Play reinicia no compasso 1 (a D1 define Stop = posição 0). Notas de bateria são one-shot: ao parar
  não há nota presa; as caudas das amostras terminam naturalmente.
- Medido no motor: Stop → `currentStep = -1` e silêncio (−91 dB após as caudas); Play → volta a
  soar e o passo volta a andar.

### 15.3 Tempo do patch e tap tempo

- O tempo do patch é o `layout.tempo` do `Preset`, aplicado quando `changeTempoOnSelect` está ligado
  (`AppContext.tsx:930-932`); o tap tempo atualiza `appStatus.tempo` (`ConcertShell.tsx:2691-2698`).
- Os dois caem no mesmo caminho da D1: `AppContext` → `host-clock-set` → `Engine::setHostClock` →
  `MasterClock`. O sequenciador agenda em ppq, então a troca de BPM muda o espaçamento dos passos
  seguintes **sem reposicionar** o passo atual e sem estalo.
- Trocar de patch: o motor carrega/encadeia o layer, aplica o estado (quando houver) e só então
  `setDrums`; com o transporte tocando, o sequenciador novo entra no próximo compasso.

### 15.4 Testes

Unitários (TS):

- `src/shared/drums.test.ts` — `drumsStartOnLoad` só liga com `enabled` **e** `startWithPatch`.
- `src/main/vst/VstManager.test.ts` — `setDrums`/`getDrumsInfo` chegam ao motor com `layerId`,
  `enabled` e `pattern`.

No motor real (`scripts/engine-drums-smoke.js`):

```
sequenciador: passos 16 | trilhas 3 | ligado true
sequenciador som: max -5.9 dB | mean -22.9 dB
passo atual: 1 de 16
após BPM 97: passo 4 | ligado true
stop do transporte: max -91 dB | passo -1
play do transporte: max -5.9 dB | passo 1
sequenciador parado: max -91 dB
Resultado: PASS
```

`npm run typecheck` ✓; os testes de Drums/VstManager/Coleção ✓ (63 testes no recorte).

### 15.5 Limites e próximos passos

- **Contagem de entrada** pelo metrônomo não entrou (opcional no documento); fica para a D7/D8 se
  Rafael quiser.
- **Padrão** ainda não vai no estado do patch (D6). Até lá, um patch com o sequenciador ligado fica
  silencioso se não receber um padrão pela API.
- A **interface** (ligar/desligar, escolher padrão, pads) é a D7; não há botão de transporte visível
  no shell (Play/Stop continua sendo uma ação mapeável).
- `startWithPatch` foi interpretado como "ligar ao carregar o patch"; se a intenção for "reiniciar a
  fase no compasso 1", é ajuste de uma linha na D7/D12.

---

## 16. D6 — Estado e persistência (implementado)

> Implementado em 21/11/2026. O `DrumPattern` e o kit (caminho/banco/programa) vão no estado do
> instrumento (`getStateInformation`), que já viaja em `Preset.vstStates`. Arquivos antigos continuam
> abrindo.

### 16.1 O que vai no estado

O XML do APVTS do Drums ganhou as propriedades:

| Propriedade | Conteúdo |
|---|---|
| `drumKitPath` | Caminho completo do SF2/SFZ |
| `drumKitBank` / `drumKitProgram` | Banco e programa do kit (128/0 por padrão) |
| `drumPattern` | Padrão em texto compacto `v1;…` |

Formato do padrão (compacto, para o XML não inflar):

```
v1;stepsPerBar;bars;swing*100;trackCount|pad,mute,level*100,passos|…
```

Cada passo tem 2 caracteres: `..` desligado ou a velocity em hex (`01`..`7f`). Passos fora do
`stepsPerBar × bars` não são gravados. Arquivo antigo, sem a propriedade, mantém o padrão atual
(vazio num instrumento novo) sem erro.

### 16.2 Restauro e troca segura

- `setStateInformation` lê o kit e o padrão. Se o caminho/banco/programa do estado difere do kit
  carregado, o kit é recarregado **na thread de mensagem**; a thread de áudio continua no kit antigo
  até a troca e as vozes em andamento guardam o instrumento em que nasceram.
- O corte das vozes antigas é **pedido** à thread de áudio (`beginBlock` consome a flag no início do
  bloco); a thread de mensagem não escreve nas vozes.
- O `DrumKitEngine` agora mantém o kit ativo num `std::atomic<Instrument*>` + lista de `shared_ptr`;
  trocar o kit não bloqueia nem invalida vozes. (A lista cresce a cada troca; troca de kit é rara.)
- O padrão restaurado é sanitizado, publicado no sequenciador (aplicado no próximo compasso) e os
  volumes/mudos das trilhas voltam para os pads.
- O `enabled` **não** vai no estado do instrumento: continua no `assignment.drums` do patch (D5).
- A conversão de atributos XML (que chegam como string) é feita explicitamente; `(int) var` de uma
  string daria 0 e o programa do kit não voltaria.

### 16.3 Compatibilidade

- Nenhum campo novo obrigatório no `.preseter`; `drums` e a chave de `vstStates` continuam opcionais.
- `Set`/`Concert`/`Preset` antigos carregam normalmente; o teste de migração
  (`ConcertFile.test.ts`) confere um patch sem `drums`/estado do Drums.
- O teste do motor cobre o estado **sem** `drumPattern` (instrumento novo) e o round-trip completo.

### 16.4 Verificação

```
estado: base64 276 caracteres | bytes ao restaurar: 206 | restaurado: sim
sequenciador: passos 16 | trilhas 3 | ligado true
sequenciador som: max -5.9 dB | mean -23.8 dB
stop do transporte: max -91 dB | passo -1
play do transporte: max -5.9 dB | passo 15
estado: padrão trocado para 8×2 | trilhas 1
estado: restaurado 16×1 | trilhas 3 | passo 0 = true/120
sequenciador parado: max -91 dB
reaberto: 16×1 | trilhas 3 | kit ok
kit trocado: SF2 · MuseScore_General · banco 128 / programa 24 · 75 regiões
instrumento novo: trilhas 0 | kit ok
Resultado: PASS
```

- **Round-trip**: troca o padrão para 8×2/1 trilha, aplica o estado salvo e volta 16×1/3 trilhas com
  a velocity original (passo 0 = on/120).
- **Fechar/abrir**: descarrega o layer, carrega um `preseter.drums` novo e aplica o estado → mesmo
  padrão e mesmo kit.
- **Troca de kit**: estado de um instrumento no programa 24 aplicado no instrumento do programa 0 →
  kit eletrônico carregado e áudio não nulo.
- **Instrumento novo**: sem estado, abre com 0 trilhas e kit carregado.

`npm run typecheck` ✓; testes de migração/catálogo/VstManager/Coleção ✓.

### 16.5 Limites

- A lista de kits mantidos vivos cresce a cada troca (sem liberar); aceitável para v1, a D11/D12 pode
  aposentar os antigos quando não houver vozes.
- A interface (D7) ainda chama `setDrums`/`setState`; o padrão salvo é o último publicado.
- `startWithPatch` continua sendo o do assignment (D5), não do estado do instrumento.

---

## 17. D7 — Janela do instrumento (implementada)

> Implementado em 21/11/2026. O painel provisório da D2 virou a janela do Drums: grade de passos,
> barra de topo, 16 pads com pré-ouvir/volume/mudo/solo, indicador do passo atual, teclado e textos
> em PT-BR, no mesmo visual.

### 17.1 Arquivos

| Arquivo | O que é |
|---|---|
| `src/renderer/components/concert/DrumMachinePanel.tsx` (**novo**) | A janela do Drums (grade, barra, pads, teclado) |
| `src/renderer/components/concert/NativeInstrumentWindow.tsx` | O kind `drums` renderiza o `DrumMachinePanel` |
| `src/renderer/components/concert/DrumMachinePanel.test.tsx` (**novo**) | 8 testes de componente |
| `src/main/index.ts` + `preload.ts` + `electron-api.ts` | IPC `drums-set`, `drums-info`, `drums-position` |
| `src/main/vst/VstManager.ts` | `setDrums`, `getDrumsInfo`, `getDrumsPosition` |
| `src/shared/types.ts` / `engine-protocol.ts` | `EngineDrumsState` com `gainDb`/`solo`; comando `drumsPosition` |
| `src/test/electron-api-mock.ts` | Mocks dos três métodos |
| `engine/src/drums/DrumKitEngine.*` | Solo por pad e volume geral (atômico) |
| `engine/src/native/NativeProcessor.*` | `setDrumSolo`, `setDrumGainDb`, `getDrumCurrentStep`, `gainDb` no estado |
| `engine/src/Engine.*` + `CommandRouter.cpp` | `drumsPosition`; `gainDb`/`soloPad` no `setDrums` |

### 17.2 O que a janela faz

- **Barra de topo**:
  - liga/desliga o sequenciador (`enabled`);
  - resolução 8/12/16/32 passos por compasso;
  - compassos 1/2/4 (o padrão passa a ter `resolução × compassos` passos);
  - swing 0–75%;
  - volume geral do kit (−60..+12 dB, salvo no estado);
  - **Limpar padrão**.
- **Grade**: 16 linhas (pads 36..51) × total de passos.
  - clique liga/desliga; arrastar na vertical ajusta a velocity; clique direito ou duplo cria acento
    (127); a velocity aparece no `title` e na opacidade do passo;
  - o início de cada grupo de 4 passos ganha uma borda;
  - o **passo atual** (do motor) acende a coluna com uma borda ciano;
  - rolagem horizontal quando 32×4 não cabe.
- **Pads**: cada linha tem
  - nome (PT-BR) clicável para **pré-ouvir** (nota MIDI via `engineMidi`, velocity 100);
  - volume por pad (dB, vira o `level` da trilha e é salvo no estado);
  - **M** (mudo) e **S** (solo). O solo é transitório no motor: com um pad em solo, só ele toca.
- **Teclado**: setas movem a célula (roving tabindex), Home/End vão ao primeiro/último passo,
  espaço/Enter alternam. Os botões têm `aria-label` (ex.: "Bumbo passo 3"), `aria-pressed` e
  `data-testid` para os testes.
- **Envios ao motor**: passo/resolução/compassos/limpar enviam o padrão na hora; swing e volumes
  usam debounce de 120 ms; ligar/desligar, volume geral e solo usam comandos próprios (sem
  republicar o padrão).
- **Indicador**: `drumsPosition` a cada 60 ms (payload pequeno, sem trazer o padrão inteiro).

### 17.3 Testes

`DrumMachinePanel.test.tsx` (8):

1. grade carrega e clique alterna um passo (padrão enviado com velocity);
2. resolução 8 e compassos 2 mudam o tamanho da grade;
3. swing 40 vai no padrão;
4. liga/desliga o sequenciador e muda o volume geral;
5. pré-ouvir o pad envia `[0x90, 36, 100]` e o solo vai em `soloPad`;
6. limpar deixa todos os passos desligados;
7. o passo atual vindo de `drumsPosition` acende a coluna;
8. setas movem o foco e espaço alterna o passo.

Também passam os testes existentes da `NativeInstrumentWindow` (5) e os de catálogo/VstManager.

No motor real (`scripts/engine-drums-smoke.js`), com a janela simulada pela API:

```
passo atual: 4 de 16
volume/solo: -6 dB | solo no pad 0: true
após BPM 97: passo 7 | ligado true
...
Resultado: PASS
```

`drumsPosition` reporta `enabled`/`currentStep`, e o volume geral/solo chegam ao kit.

### 17.4 Limites e próximos passos

- Mudar volume/mudo de um pad reenvia o padrão; a troca é aplicada no **próximo compasso** (a D4
  exige troca de padrão só no compasso), então o sequenciador pode reiniciar a fase nesse ponto.
  Se incomodar, a D11/D12 pode criar um comando de pad que não republica o padrão.
- O solo não é salvo no estado (transitório); volume/mudo vão no padrão (D6).
- O **liga/desliga** da janela age no motor na hora, mas não reescreve o `assignment.drums` do patch
  (D5): ao recarregar o patch, vale de novo a configuração salva. Sincronizar o botão com o patch
  fica para a D12 (ou para a D9, ao gerar os patches de fábrica).
- Não há seletor de kit na janela (D8/D9) nem contagem de entrada.
- Com 32 passos × 4 compassos a grade rola horizontalmente; não há zoom.
- Os testes de componente usam timeout de 20 s porque o jsdom desta máquina está lento com a
  aplicação/outras sessões abertas; no CI deve ser bem mais rápido.

---

## 18. D8 — Padrões de fábrica (implementado)

> Implementado em 21/11/2026. Sete padrões originais do projeto, com seletor na janela. Nenhum dado
> veio de banco de bateria de terceiros.

### 18.1 Dados

`src/shared/drum-patterns.ts` (novo):

```ts
interface DrumFactoryPattern {
  id: string;
  name: string;          // PT-BR
  description: string;
  stepsPerBar: 8|12|16|32;
  bars: 1|2|4;
  swing: number;
  tracks: Array<{ pad: number; steps: number[] }>; // velocity por passo, 0 = desligado
}
```

| Padrão | Resolução | Swing | Ideia |
|---|---|---|---|
| Rock 4/4 | 16 | 0 | Bumbo 1/3, caixa 2/4, chimbal em colcheias, prato no começo |
| Pop | 16 | 0 | Bumbo com contratempo, caixa 2/4, chimbal aberto no fim |
| Funk | 16 | 20 | Bumbo sincopado, caixa com fantasmas, chimbal com acento |
| Shuffle | 12 | 62 | Ternário com swing forte |
| Balada | 16 | 0 | Bumbo 1/3, caixa suave, condução no prato |
| Bossa | 16 | 15 | Bumbo em contratempos, aro da caixa, chimbal suave |
| Samba | 16 | 25 | Bumbo em quatro, caixa deslocada, chimbal com swing |

- Os arrays são gerados por helpers (`hits`/`regular`) e **testados**: tamanho exato
  (`stepsPerBar × bars`), pads 0..15, velocity 0..127, ids únicos, bumbo em todos.
- Autoria: dados originais do projeto, sem referência a terceiros; a licença é a do Preseter
  (AGPL-3.0-or-later).

### 18.2 Seletor

- Na barra de topo da janela: **Padrão de fábrica** (`Personalizado` + os sete nomes).
- Ao escolher, o padrão substitui o atual (resolução, compassos, swing e passos), é enviado ao motor
  e a descrição aparece abaixo da barra.
- Qualquer edição (passo, acento, resolução, compassos, swing, volume/mudo de pad, limpar) volta o
  seletor para **Personalizado**. Solo e liga/desliga não mexem no padrão.
- O padrão carregado é salvo no estado do instrumento (D6) como qualquer padrão editado; o id de
  fábrica não é persistido (ao reabrir, aparece "Personalizado" se o padrão não for reescolhido).

### 18.3 Verificação

- `src/shared/drum-patterns.test.ts` (novo): 3 testes — ids/estilos, limites do compasso e velocity,
  bumbo/estilos presentes.
- `DrumMachinePanel.test.tsx`: novo teste “carrega um padrão de fábrica” — escolhe `Shuffle`, confere
  `12` passos, swing `62` e o bumbo no passo 0 com velocity `112`.
- `npm run typecheck` ✓; os 12 testes do recorte (3 + 9) ✓.

### 18.4 Limites

- Um compasso por padrão (1 bar); encadear padrões/fills é “depois da v1” (§9 do documento).
- Não há audição automática dos sete padrões no CI; a coerência musical foi conferida pelo desenho
  dos dados e pelo motor tocando o padrão carregado.
- O seletor não salva o id de fábrica; o estado guarda os passos resultantes.

---

## 19. D9 — Integração com a Coleção (implementada)

> Implementado em 21/11/2026. O patch **Electronic Drum Kit** da Factory 40 passou a usar o
> `preseter.drums` nativo, com o kit eletrônico (programa 24), o padrão **Eletrônico** e os efeitos
> previstos. O **Acoustic Rock Kit** continua no sampler, como pedido. A Coleção continua com 40
> patches.

### 19.1 Patch alterado

`src/shared/collection-presets.ts`:

```ts
['Electronic Drum Kit', [
  N('drums', -2, 0, 127, 'Kit eletrônico', 0, {
    drums: {
      enabled: true,
      startWithPatch: true,
      patternId: 'electro',
      kitProgram: 24,       // banco 128 / programa 24 do MuseScore_General
    },
  }),
], PATCH_FX({
  inserts: [FX('calfNXT Transients', 'attack')],
  r: { preset: 'gated', db: -18 },
})],
```

- Efeitos conforme `docs/FACTORY-40-EFEITOS.md` (Transients + reverb `gated`; o kit acústico segue
  com Compressor `drum` + `room`).
- `DrumSettings` ganhou `patternId` (padrão de fábrica) e `kitProgram` (programa do SF2).
- Novo padrão **Eletrônico** em `drum-patterns.ts` (bumbo em quatro, palmas 2/4, chimbal no
  contratempo), também disponível no seletor da janela.

### 19.2 Como o padrão chega ao patch

- `nativeAssignmentFor` copia `drums` para o assignment; a geração mantém os 40 patches.
- Na carga (`main/index.ts`), o kit é carregado com `kitProgram` e o padrão de fábrica é enviado
  **somente quando o layer não tem estado salvo** (`restoredLayers`). Se o usuário editou o padrão e
  salvou, o estado do instrumento (D6) vence e o padrão de fábrica não sobrescreve.
- O `setDrums` continua depois do `commitPatchSwap`, então o padrão entra no próximo compasso com o
  transporte tocando.

### 19.3 Fallback para o sampler

Se `stageLoad('preseter.drums')` falhar (motor antigo sem o instrumento), a carga cai
automaticamente em `preseter.sampler` com o mesmo SF2 (banco 128, programa do kit):
`0` acústico, `24` eletrônico. O patch continua soando; o sequenciador simplesmente não existe nesse
caminho. O estado salvo do Drums não é aplicado ao sampler e `setDrums` é pulado para esse layer.

### 19.4 Verificação

- `collection.test.ts`: o patch `Electronic Drum Kit` gera `pluginId: 'preseter.drums'`, `drums`
  com `patternId: 'electro'`/`kitProgram: 24`; o `Acoustic Rock Kit` continua sampler (bank 128/0).
- `drum-patterns.test.ts`: o padrão `electro` converte para o payload do motor (passo 0 do bumbo on,
  velocity 118).
- `npm run typecheck` ✓; Coleção (17) + padrões (4) ✓.
- No motor, o kit programa 24 já foi tocado no teste da D6 (`kit trocado: … programa 24 …` e áudio
  não nulo), e o padrão Eletrônico usa os mesmos caminhos do D4.

### 19.5 Limites

- Apenas um patch nativo (o eletrônico); o acústico permanece sampler para cumprir “sem remover o
  Acoustic Rock Kit”.
- O fallback é defensivo e não tem teste automatizado (exigiria um motor sem o instrumento); o
  caminho é um `try/catch` em volta do `stageLoad`.
- Ao editar e salvar o patch, o padrão salvo no estado vence o `patternId` de fábrica; não há botão
  “restaurar padrão de fábrica” na janela (D12 pode avaliar).

---

## 20. D10 — Kits e licenças (verificado)

> Verificado em 21/11/2026. Um único kit de bateria distribuído: **MuseScore_General.sf2**, MIT
> confirmada na fonte. O arquivo **não** vai no instalador; vem pela Loja para a pasta de sons.

### 20.1 Tabela do kit

| Kit | Autor | Origem / licença | Licença | Atribuição | Redistribuição | Uso comercial | Tamanho |
|---|---|---|---|---|---|---|---|
| MuseScore_General.sf2 (banco 128, programas 0 e 24) | S. Christian Collins (adaptação); FluidR3: Frank Wen; mono: Michael Cowgill | https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md | **MIT** (v0.2, 13/05/2020) | **Sim** — avisos de FluidR3/FluidR3Mono e da adaptação; Temple Blocks (Ethan Winer) e Drumline Cymbals (Michael Schorsch) | **Sim** (MIT) | **Sim** (MIT) | 215.614.036 bytes (≈ 205,6 MiB) |

- O texto da licença pede que os avisos/copyright acima acompanhem qualquer trabalho derivado.
- O `.sf3` (35,9 MB) não é usado: o motor lê `.sf2`/`.sfz`.
- Nenhum sample próprio ou de terceiros foi embutido; nenhum outro kit entrou.

### 20.2 Registro

- `docs/LICENCAS.md`: nova seção **“Kits de bateria — MuseScore_General (MIT)”** com autor,
  origem, licença, atribuição, redistribuição, uso comercial, tamanho e uso no app.
- `docs/LOJA.md` (novo): catálogo de bibliotecas, item `musescore-general` (já presente em
  `store/store-catalog.json`, `tier: verified`, `license: MIT`, `licenseUrl` e download), regra de
  não entrar kit sem licença e checklist para kits futuros.
- O item da Loja é `essential`/`defaultSelected`; o instalador não carrega o SF2.

### 20.3 Critério

Tabela preenchida com licença **verificada na fonte** (MIT) e registro em `docs/LICENCAS.md` +
`docs/LOJA.md`. Kits sem licença clara continuam fora; o único `a confirmar` é o uso comercial de
samples de kits futuros que venham a ser avaliados (não há nenhum na v1).

---

## 21. D11 — Testes e desempenho (implementado)

> Medições em 21/11/2026, Windows, MuseScore_General.sf2 (205,6 MiB), 16 pads. Nenhum `xrun` novo
> em nenhum cenário.

### 21.1 Nulidade e áudio (`engine/test/drums`)

Alvo `PreseterDrumsNullity` (opção `PRESETER_BUILD_DRUMS_NULLITY=ON`), seguindo o padrão dos testes
de nulidade do repositório. Precisa do kit instalado (`--kit=CAMINHO`; sem ele, `SKIP`/código 2).

```
sem nota: pico 0.000000000 | RMS 0.000000000
nota 36: pico 0.548775 | RMS 0.051962
apos all-notes-off: pico 0.000000000
pad 0 em mudo: pico 0.000000000
solo no pad 2: 36 -> 0.000000000 | 38 -> 0.173080
Resultado: PASS
```

Cobre silêncio sem nota, áudio não nulo com nota, silêncio após panic, mudo e solo por pad.
`README.md` na pasta com os comandos.

### 21.2 Tempo e 10 minutos no CI

- `engine/test/drum-timing` roda **10 minutos simulados** com blocos 64/256/1024 e BPM
  120→143→97→180→120: contagem 5281 (esperado ~5280), **pior erro 0,497 amostra** (critério ±1),
  swing 60% com erro 0,000, resoluções 8/12/16/32 e `bars=2`, troca no compasso exata.
- `.github/workflows/build.yml` (job `checks`) ganhou a compilação e execução dos testes **sem JUCE**
  com `g++`:
  ```sh
  g++ -std=c++17 -O2 -Iengine/src engine/test/clock-phase/main.cpp -o clock-phase && ./clock-phase
  g++ -std=c++17 -O2 -Iengine/src engine/test/drum-timing/main.cpp -o drum-timing && ./drum-timing
  ```
- `npm test` continua rodando os testes de componente/estado/padrões.

### 21.3 CPU e xruns (`scripts/engine-drums-bench.js`)

O script arma um padrão cheio (N trilhas × todos os passos ligados), toca notas de teclado durante a
execução e mede CPU do processo, vozes máximas e `xruns` antes/depois.

| Backend | Taxa / buffer | Padrão | Vozes máx. | CPU do motor | xruns |
|---|---|---|---|---|---|
| Windows Audio (Exclusive) | 48 kHz / 480 | sem padrão (idle) | 0 | 0,6% de um núcleo | 0 → 0 |
| Windows Audio (Exclusive) | 48 kHz / 480 | 3 trilhas | 23 | 2,0% | 0 → 0 |
| Windows Audio (Exclusive) | 48 kHz / 480 | **16 trilhas × 16 passos, todos ligados + teclado** | **64** | **5,6%** | **0 → 0** |
| ASIO4ALL | 44,1 kHz / 256 | idle | 0 | ~84%* | 0 → 0 |
| ASIO4ALL | 44,1 kHz / 256 | 16 trilhas + teclado | 64 | ~83%* | 0 → 0 |

\* O ASIO4ALL roda o polling no processo do motor: o consumo fica alto **mesmo sem padrão** e o
drums não adiciona um valor mensurável. É característica do driver, não do instrumento; o WASAPI
Exclusive mostra o custo real do Preseter Drums. Nenhum `xrun` em nenhum dos casos.

- O limite de 64 vozes é atingido no cenário extremo (16 pads disparando em todos os passos); a
  voz mais antiga é roubada, sem crash nem nota presa.
- Pequena otimização na D11: quando a região não tem filtro (cutoff 20 kHz, ressonância 0), o SVF é
  pulado amostra a amostra.

### 21.4 Teste manual

Coberto automaticamente:

- tocar ao vivo **enquanto** o padrão roda (o bench envia notas a cada ~200 ms);
- mudar o BPM no meio do padrão (smoke D5; sem salto, 0 xruns);
- Stop/Play (smoke D5; silêncio e sem nota presa);
- salvar/reabrir e trocar kit (smoke D6).

Pendente de conferência humana (procedimento no D12):

1. abrir o app, carregar o patch **Electronic Drum Kit**, dar Play e tocar no teclado;
2. trocar para outro patch com tempo próprio e voltar;
3. ouvir se há estalo ou nota presa (os testes de motor não reproduzem o app inteiro).

### 21.5 Critério

Nulidade e “toca → áudio não nulo” com números reais; timing no CI; CPU documentado (5,6% de um
núcleo no pior caso em WASAPI; ASIO dominado pelo driver); **0 xruns** em todos os cenários.

---

## 22. D12 — Uso, limites e revisão final

### 22.1 Uso rápido

1. **Loja**: instale `MuseScore_General.sf2` (item `musescore-general`, MIT) na pasta de sons.
2. **Instrumento**: adicione **Preseter Drums** a um patch (ou abra o patch **Electronic Drum Kit**
   da Coleção, que usa o kit eletrônico e o padrão Eletrônico).
3. **Tocar**: notas 36..51 pelo teclado MIDI; clique no nome dos pads na janela para pré-ouvir.
4. **Grade**: clique liga/desliga um passo; arraste na vertical para a velocity; clique direito/duplo
   cria acento; setas movem, espaço/Enter alternam.
5. **Barra**: liga/desliga, resolução 8/12/16/32, compassos 1/2/4, swing, volume geral, Limpar.
   O seletor de fábrica carrega Rock, Pop, Funk, Shuffle, Balada, Bossa, Samba e Eletrônico.
6. **Play/Stop**: **▶ Tocar** usa o transporte do concert e já liga o sequenciador se ele estiver
   desligado; **■ Parar** para tudo e volta ao compasso 1. O tempo é o do patch (e o tap tempo).
   M/S nos pads fazem mudo/solo.
7. **Kit**: abaixo da barra, **Trocar kit (SF2/SFZ)…** escolhe o arquivo; **Banco/Programa** e
   **Aplicar** trocam o kit dentro do mesmo arquivo (ex.: MuseScore banco 128, programa 0 acústico
   ou 24 eletrônico).
8. **Sample por pad (v1.1)**: o botão **…** de cada linha abre o editor do pad: escolha um
   SF2/SFZ, o banco, o programa e a nota que aquele pad deve tocar. **Usar kit** volta ao kit do
   layer. O padrão continua valendo mesmo com samples próprios.
9. **Salvar**: padrão, kit, samples por pad, volume geral e mudo/volume dos pads vão no estado do
   instrumento e no `.preseter`. O liga/desliga da janela vale na sessão; no patch, quem manda é
   `assignment.drums` (D5).

### 22.2 Limites da v1 (resumo)

- Um padrão por patch, um compasso por padrão de fábrica; sem encadear padrões/fills.
- Sample por pad usa **SF2/SFZ** (o mesmo leitor do sampler); WAV/FLAC avulso ainda não entra
  como sample de pad. Cada pad tem um arquivo/banco/programa/nota; não há camadas por velocity.
- O estado guarda o caminho absoluto do kit/sample: se o arquivo mudar de lugar, o pad volta ao kit
  (sem erro) até ser escolhido de novo.
- Sem contagem de entrada; o Play é o transporte global do concert (não há play local isolado).
- Solo é transitório (não salvo); mudar volume/mudo de pad reenvia o padrão e aplica no próximo
  compasso (pode reiniciar a fase).
- Sem round-robin; hats usam a exclusão do motor.
- O ASIO4ALL consome CPU no processo do motor independentemente do padrão; em WASAPI o pior caso
  medido foi 5,6% de um núcleo.

### 22.3 Documentos desta entrega

- `docs/DRUMS.md` — decisões, tarefas D0..D12, testes e números (este arquivo).
- `docs/LICENCAS.md` — seção dos kits de bateria (MuseScore_General, MIT e atribuições).
- `docs/LOJA.md` — catálogo de bibliotecas e regra de licença.
- `docs/COLECAO.md` — patches da Factory 40, incluindo o Electronic Drum Kit nativo.
- Ajuda no app (`HelpModal`) — seção **Preseter Drums**; `AboutModal` — crédito do kit.

### 22.4 Lista de conferência (Rafael)

- [ ] Instalar/confirmar o MuseScore_General pela Loja e abrir o patch **Electronic Drum Kit**.
- [ ] Ouvir o kit acústico (`Acoustic Rock Kit`, sampler) e o eletrônico (nativo) sem estalos.
- [ ] Tocar notas 36..51 no teclado MIDI, com velocity variada.
- [ ] Na janela: clique, arrasto de velocity, acento com clique direito/duplo, setas e espaço.
- [ ] Experimentar os padrões de fábrica (rock, pop, funk, shuffle, balada, bossa, samba, eletrônico).
- [ ] Testar o botão ▶ Tocar / ■ Parar da janela, a troca de patch com tempo próprio e o tap tempo.
- [ ] Trocar o kit em SF2/SFZ e testar Banco/Programa (0 acústico, 24 eletrônico).
- [ ] Escolher um SF2/SFZ próprio para um pad, ouvir e voltar com **Usar kit**.
- [ ] Salvar o patch, fechar o app, reabrir e conferir padrão/kit/sample por pad/volume.
- [ ] Mudo/solo e volume por pad; volume geral.
- [ ] Abrir Ajuda (F1) e Ajuda → Sobre; conferir a seção do Drums e o crédito do kit.
- [ ] Conferir `docs/LICENCAS.md` e `docs/LOJA.md`.
- [ ] Aprovar o release.

Assinatura do Rafael: ______________________  Data: ____/____/______

### 22.5 Verificação final automática

- `npm run typecheck` ✓
- `npx vitest run` — os testes do Drums (catálogo, padrões, componente, VstManager, Coleção,
  migração) passam; a árvore tem uma falha **de outra frente** em `PreseterEffectWindow` (texto do
  badge Guitarix) que não pertence a esta entrega.
- `PreseterEngine` compila; `PreseterClockTest` e `PreseterDrumTimingTest` passam; o teste de
  nulidade do Drums passa com o kit; o smoke e o bench do motor passam com 0 xruns.

---

## 23. v1.1 — Play, seletor de kit e sample por pad

Pedido depois da D12: botão de Play na janela, troca de kit e **um sample diferente por parte do
sequenciador**. O sample por pad usa SF2/SFZ (decisão do Rafael); o Play controla o transporte do
concert.

### 23.1 Motor

- `DrumKitEngine::loadPadSource(pad, file, bank, program, note)` carrega o SF2/SFZ pelo
  `sampler::InstrumentCache` e guarda um `Instrument` por pad (`padInstruments`, atômico), com a
  nota própria do pad. `clearPadSource` volta ao kit. As vozes em andamento mantêm o instrumento
  antigo vivo (a lista `instrumentKeepAlive` já existia).
- `noteOn`: o pad 0..15 usa a fonte própria quando existe; senão usa o kit do layer. O choke de
  chimbal passou a ser por **pad** (6/8/10), então funciona também com sample próprio.
- `describeDrums` ganhou `kitPath`, `kitBank`, `kitProgram` e `pads[i].source`
  (`path`, `bank`, `program`, `note`).
- Estado do instrumento: `drumPadPathN`, `drumPadBankN`, `drumPadProgramN`, `drumPadNoteN`
  (N = 0..15). Estado antigo não tem as propriedades: os pads continuam no kit, sem migração.
- Comandos do motor: `loadDrumKit` (path, bank, program) e `setDrumPadSource` (pad, path vazio =
  limpar, bank, program, note). `setDrums` continua só com padrão/liga/volume/solo.

### 23.2 App

- `DrumMachinePanel` recebe `isPlaying`/`onToggleTransport` do `ConcertShell`;
  **▶ Tocar / ■ Parar** usa `setAppStatus` (o mesmo Play/Stop do concert) e liga o sequenciador ao
  tocar. O selo da janela deixou de dizer “EM CONSTRUÇÃO”.
- Linha do kit: `Trocar kit (SF2/SFZ)…`, campos **Banco** e **Programa** (com **Aplicar**).
- Botão **…** em cada linha abre o editor do pad: arquivo, nota, banco, programa, **Usar kit**.
- IPC novos: `drums-pick-file`, `drums-load-kit`, `drums-set-pad-source` (preload, tipos e mock).
- Documentação dentro do app (Ajuda → Preseter Drums) e esta seção.

### 23.3 Verificação

- `npm run typecheck` ✓.
- `DrumMachinePanel.test.tsx`: 12 testes (inclui Play/transporte, troca de kit e sample por pad) ✓.
- `src/main/index.test.ts`: contrato de IPC com 135 handlers ✓.
- Smoke do motor: troca de kit direto, sample por pad com áudio, volta ao kit, estado com
  `pads[0].source.program = 24` restaurado no mesmo instrumento e num instrumento novo ✓.







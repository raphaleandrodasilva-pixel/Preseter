# preseter-engine

Motor de áudio nativo do Preseter. É um processo **sem janela**, escrito em C++
com [JUCE](https://juce.com), que hospeda plugins VST3 (e VST2 quando compilado com o SDK) e fala com o app Electron
por **JSON em stdin/stdout** (uma mensagem por linha).

Por que um processo separado? O Node/Electron não consegue rodar áudio em tempo
real com plugins nativos. Separando, um plugin que trava derruba só o motor, e o
app pode reiniciá-lo.

```
Electron (UI) ⇄ main (Node) ⇄ stdin/stdout JSON ⇄ preseter-engine (JUCE)
                                                   ├─ scan / load de VST3
                                                   ├─ áudio (WASAPI/ASIO, ALSA/JACK)
                                                   └─ MIDI de entrada
```

**Status: Layers, inserts, sends e barramentos.** Um patch pode carregar vários
instrumentos VST3 simultaneamente. Cada layer tem uma faixa MIDI independente
(notas 0–127 por padrão), volume (-60 a +6 dB), pan, mute, solo e medidor de pico
dBFS, além de **4 slots de insert** para efeitos VST3 (com bypass) na cadeia de
áudio: instrumento → inserts → channel strip → Output. O strip Master controla
volume, mute e pico após a soma. As configurações de mixagem e os inserts (com o
estado de cada efeito) são salvos junto ao patch.

O concert tem **4 barramentos Aux** e **4 barramentos Output**, cada um com
volume, pan, mute, 4 inserts e um medidor; os Aux ainda escolhem o Output de
destino. Cada channel strip de instrumento tem **4 sends post-fader** para os Aux
(nível em dB; -60 dB desliga) e uma saída (Output 1 a 4). Roteamento do grafo:

```
instrumento → inserts → strip → Output (escolhido)
                     ↘ send 1..4 → Aux 1..4 → Output (escolhido)
Output 1..4 → Master → hardware
```

Os comandos de insert endereçam qualquer channel strip: `layerId` aceita o id de
um layer **ou** o id de um barramento (`aux1`..`aux4` / `output1`..`output4`).

Um layer carregado com `pinned: true` (channel strip do concert ou do set, Fase 3.3)
fica fora da troca de patch: `commitPatchSwap` não o promove nem o drena, e ele
recebe MIDI e soa em todos os patches como qualquer strip atual. O campo `pinned`
aparece em `layers` e `plugin`.

## Compilar

Precisa de CMake ≥ 3.22 e um compilador C++17. O JUCE é baixado sozinho.

### Windows (Visual Studio 2022)

```powershell
cmake -S engine -B engine/build -G "Visual Studio 17 2022"
cmake --build engine/build --config Release
```

Executável: `engine/build/PreseterEngine_artefacts/Release/PreseterEngine.exe`

O app Electron inicia esse executável ao escanear/carregar plugins. Ao carregar
um instrumento, o app abre automaticamente o dispositivo de áudio padrão
(2 saídas). Na aba **Áudio** das configurações, é possível escolher driver,
dispositivo de entrada/saída, taxa de amostragem e buffer, iniciar/parar o áudio
e salvar essas preferências para a próxima abertura. O carregamento falha com
uma mensagem explícita se o dispositivo/driver não aceitar a configuração.
Notas e mensagens MIDI são filtradas pela faixa de cada layer e encaminhadas a
todos os instrumentos correspondentes; MIDI externo também passa pelo mesmo
filtro.

Para empacotar a versão Windows do Electron, compile primeiro o executável no
caminho acima; o `electron-builder` o copia para `resources/engine/`.

Latência baixa no Windows pode exigir **ASIO**. O driver só aparece nas
configurações se o engine tiver sido compilado com o suporte ASIO. Ele não vem
ligado por padrão porque o SDK da Steinberg precisa ser obtido por você (e tem
licença própria). Com o SDK instalado localmente:

```powershell
cmake -S engine -B engine/build -G "Visual Studio 17 2022" `
  -DPRESETER_ENABLE_ASIO=ON `
  -DPRESETER_ASIO_SDK_DIR="C:\SDKs\asio-sdk"
cmake --build engine/build --config Release
```

O diretório informado deve conter `common/` do ASIO SDK. O SDK é obtido,
licenciado e mantido localmente; não é incluído no Git nem no instalador do
Preseter. A interface mostra separadamente se o backend foi compilado e se
encontrou um driver ASIO instalado. Sem suporte ASIO, os drivers disponíveis
(por exemplo, WASAPI) continuam listados normalmente.

### VST2 (opcional)

O VST2 não é incluído por padrão. Para habilitar, use um SDK VST2 local:

```powershell
git clone https://github.com/R-Tur/VST_SDK_2.4.git engine/vst2-sdk
cmake -S engine -B engine/build -G "Visual Studio 17 2022" `
  -DPRESETER_VST2_SDK_DIR="$PWD/engine/vst2-sdk"
cmake --build engine/build --config Release
```

O diretório precisa conter `pluginterfaces/vst2.x/aeffect.h`. Sem
`PRESETER_VST2_SDK_DIR`, o engine compila somente com VST3. O SDK é
proprietário/descontinuado pela Steinberg: mantenha-o local e não o inclua no
instalador. Plugins VST2 32-bit não carregam no engine 64-bit.

### Linux (Ubuntu/Debian)

```bash
sudo apt install build-essential cmake ninja-build pkg-config \
  libasound2-dev libfreetype-dev libx11-dev libxrandr-dev libxinerama-dev \
  libxcursor-dev libxext-dev libgl1-mesa-dev
cmake -S engine -B engine/build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build engine/build --parallel
```

Executável: `engine/build/PreseterEngine_artefacts/Release/PreseterEngine`

Para usar JACK, instale `libjack-jackd2-dev` e passe `-DPRESETER_ENABLE_JACK=ON`.

## Testar

Com o motor compilado, na raiz do projeto:

```bash
node scripts/engine-smoke.js                         # ping, dispositivos e scan
node scripts/engine-smoke.js --plugin=Surge --audio  # carrega um plugin e toca uma nota
```

Veja as opções no topo de `scripts/engine-smoke.js`.
Para verificar uma compilação com ASIO, use `node scripts/engine-smoke.js --require-asio`;
esse teste valida o backend, não a instalação de um driver ASIO.

Na interface, crie/edite um patch e use **Adicionar**, **Remover** e **Copiar**
no painel **Layers**. Os limites de cada layer podem ser digitados em notas MIDI
ou arrastados na representação do teclado. Ajuste o fader, pan, mute e solo de
cada strip e o fader/mute Master; os medidores mostram o pico em dBFS. Cada strip
tem 4 slots de insert: clique em um slot para escolher um efeito VST3, use **B** para
deixá-lo em bypass e **E** para abrir a janela do efeito. Essas configurações ficam
salvas no patch. Um patch aceita quantos instrumentos você precisar; a partir de
quatro channel strips o processamento pode pesar. Os slots de sends são placeholders.

### Plugin de teste (sem depender de terceiros)

O projeto traz um sintetizador VST3 mínimo (`engine/test-plugin/`, parâmetros
Volume e Waveform). Para compilar e usar:

```bash
cmake -S engine -B engine/build -DPRESETER_BUILD_TEST_PLUGIN=ON
cmake --build engine/build --target PreseterTestSynth_VST3 --config Release
node scripts/engine-smoke.js --rescan --audio --plugin="Test Synth" \
  --path=engine/build/test-plugin/PreseterTestSynth_artefacts/Release/VST3
```

Se tudo estiver certo você ouve uma nota senoidal por 1,5 s. Troque a forma de
onda com `setParam` no índice 1 (valor 0 = Sine, 0.5 = Saw, 1 = Square).

## Protocolo

Cada linha enviada ao motor é um objeto JSON com `id` (número, escolhido por
quem chama) e `cmd`. A resposta traz o mesmo `id`:

```json
{"id": 1, "cmd": "load", "plugin": "<id vindo do scan>", "layerId": "layer-1", "minNote": 0, "maxNote": 127}
{"id": 1, "ok": true,  "result": { "layerId": "layer-1", "...": "..." }}
{"id": 1, "ok": false, "error": "mensagem"}
```

Eventos (sem `id`): `ready` (motor iniciado) e `scan-progress` (durante o scan).
Logs de texto vão para **stderr**, nunca para stdout.

| Comando | Argumentos | O que faz |
|---|---|---|
| `ping` | — | Teste de vida |
| `quit` | — | Encerra o motor |
| `devices` | — | Lista tipos de áudio, dispositivo atual e entradas MIDI |
| `audioStart` | `inputs`, `outputs`, `type`, `input`, `output`, `sampleRate`, `bufferSize`, `midi` | Abre o áudio e liga as entradas MIDI |
| `audioStop` | — | Fecha o áudio |
| `mix` | — | Lê volume, pan, mute, solo, sends, saída e medidores dos strips e dos barramentos |
| `setLayerMix` | `layerId`, `volumeDb?`, `pan?`, `muted?`, `solo?` | Altera o strip de um instrumento |
| `setMasterMix` | `volumeDb?`, `muted?` | Altera o strip Master |
| `buses` | — | Estado dos 4 Aux e dos 4 Output (volume, pan, mute, pico, saída dos Aux) |
| `setBusMix` | `bus` (`aux1`..`aux4`/`output1`..`output4`), `volumeDb?`, `pan?`, `muted?`, `output?` | Altera um barramento (só os Aux usam `output`) |
| `setSend` | `layerId`, `aux` (1..4), `levelDb` | Nível do send post-fader para um Aux; -60 dB desliga |
| `setLayerOutput` | `layerId`, `output` (1..4) | Saída do channel strip do layer |
| `midiEnable` | `identifier?`, `enabled?` | Liga/desliga uma entrada MIDI (ou todas) |
| `scan` | `paths?`, `rescan?` | Varre VST3 (pastas padrão + extras) |
| `plugins` | — | Lista os plugins já conhecidos |
| `load` | `plugin` (id) ou `path`, `layerId?`, `minNote?`, `maxNote?`, `pinned?` | Adiciona um instrumento; com `pinned: true` é um strip do concert/set e fica carregado entre patches |
| `stageLoad` | `plugin` (id) ou `path`, `layerId?`, `minNote?`, `maxNote?` | Carrega um instrumento em modo encadeado para troca de patch; reaproveita a instância se o mesmo plugin já estiver carregado (nunca reaproveita um layer `pinned`) |
| `commitPatchSwap` | `silence?` | Efetiva a troca: ativa os layers encadeados e silencia (`silence: true`) ou mantém o patch anterior até as caudas acabarem (layers `pinned` ficam como estão) |
| `unload` | `layerId?` | Descarrega um layer (sem ID, todos) |
| `layers` | — | Lista os instrumentos carregados, suas regiões e se são `pinned` |
| `setLayerRange` | `layerId`, `minNote`, `maxNote` | Altera a região MIDI de um layer |
| `setLayerVelocityRange` | `layerId`, `minVelocity`, `maxVelocity` | Altera a faixa de velocity (1..127) aceita pelo layer |
| `setTranspose` | `semitones` (-72..72) | Transpose global (patch + set + concert) aplicado a todas as notas |
| `setAudioInput` | `enabled`, `inputChannel`, `mode` (`mono`/`stereo`), `volumeDb`, `pan`, `muted`, `feedbackProtection`, `output`, `resetFeedback?` | Configura o strip de entrada de áudio (Fase 3.5) |
| `audioInput` | — | Estado do strip de entrada (configuração + `peakDb`/`feedback`) |
| `setMidiThru` | `blocked` (lista de `{ type, channel, number }`) | Bloqueia no motor as mensagens de hardware marcadas "Don't pass thru" |
| `setHostClock` | `bpm`, `numerator`, `denominator`, `playing` | Envia tempo/compasso/transporte aos plugins (`AudioPlayHead`) |
| `setMetronome` | `enabled`, `volumeDb`, `accentFirstBeat` | Liga/desliga o clique do metrônomo no motor |
| `recordStart` / `recordStop` | `path` / — | Grava a saída do concert em WAV (Fase 6.4) |
| `playbackLoad` / `playbackPlay` / `playbackStop` | `path` / — / — | Plugin Playback: carrega e toca um arquivo de áudio |
| `setPanLaw` | `db`, `compensated` | Pan law dos channel strips do concert |
| `plugin` | `layerId?` | Dados de um layer carregado |
| `params` | `layerId?`, `all?` | Parâmetros reais automatizáveis, valores normalizados 0..1 (`all: true` inclui os ~2000 "MIDI CC" do wrapper VST3) |
| `getParam` / `setParam` | `layerId?`, `index` / `index`, `value` | Lê / altera um parâmetro no layer indicado |
| `getState` | `layerId?`, `slot?` | Estado completo do plugin (`getStateInformation`) codificado em base64; `slot` escolhe um insert |
| `setState` | `layerId?`, `data`, `slot?` | Aplica um estado completo (base64) via `setStateInformation` |
| `openEditor` | `layerId?`, `slot?` | Abre (ou traz para a frente) a janela de edição nativa do plugin |
| `closeEditor` | `layerId?`, `slot?` | Fecha a janela de edição do plugin |
| `inserts` | `layerId?` | Lista os 4 slots de insert de um channel strip (layer ou barramento) |
| `setInsert` | `layerId?`, `slot`, `plugin` (id) ou `path`, `bypass?` | Carrega (substituindo) um efeito VST3 no slot de insert |
| `removeInsert` | `layerId?`, `slot` | Remove o efeito de um slot |
| `setInsertBypass` | `layerId?`, `slot`, `bypass` | Liga/desliga (bypass) o efeito do slot, sem descarregá-lo |
| `noteOn` / `noteOff` | `note`, `velocity?`, `channel?` | Envia nota MIDI |
| `midi` | `bytes` (1 a 3) | Envia MIDI cru |
| `panic` | — | All notes off + all sound off nos 16 canais |

Os tipos TypeScript equivalentes estão em `src/shared/engine-protocol.ts`.

### Arquivos que o motor cria

Em `…/Preseter/engine/` dentro da pasta de dados do usuário (`%APPDATA%` no
Windows, `~/.config` no Linux): `known-plugins.xml` (lista do scan) e
`scan-deadman.txt` (usado para pular plugins que travam durante o scan).

## Limitações conhecidas

- O **scan roda dentro do motor**: um plugin que trava o processo durante o scan
  derruba o motor. O arquivo `scan-deadman.txt` faz esse plugin ser ignorado na
  próxima execução. Scan em processo separado continua planejado.
- A faixa MIDI é aplicada a notas; automação/edição de parâmetros do plugin é
  por layer, e cada plugin (instrumento ou insert) abre a própria janela de
  edição nativa.
- Os inserts são cadeias de efeitos fixas de 4 slots por channel strip; efeitos
  com múltiplas entradas/saídas (side-chain, surround) não são suportados.
- Os sends são sempre **post-fader** (sem opção pré-fader), cada Aux tem um único
  Output de destino e os barramentos não têm solo (só mute e medidor).
- A configuração de áudio grava para disco ao alterar a mixagem; o estado dos
  inserts é salvo no concert/patch pelo app, não pelo motor.

## Licença do JUCE

O JUCE 8 é distribuído sob **AGPLv3 ou licença comercial** (existe um plano
gratuito com limites). O motor linka o JUCE, então confira os termos em
<https://juce.com/legal> antes de distribuir o Preseter, pois o `package.json`
declara MIT para o restante do projeto.

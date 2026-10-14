# preseter-engine

Motor de áudio nativo do Preseter. É um processo **sem janela**, escrito em C++
com [JUCE](https://juce.com), que hospeda plugins VST3 e fala com o app Electron
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

**Status: Layers e configuração de áudio.** Um patch pode carregar até quatro
instrumentos VST3 simultaneamente. Cada layer tem uma faixa MIDI independente
(notas 0–127 por padrão), volume (-60 a +6 dB), pan, mute, solo e medidor de pico
dBFS. O strip Master controla volume, mute e pico após a soma. As configurações
de mixagem são salvas junto ao patch. Os slots de efeitos e sends são apenas
visuais nesta etapa e não processam áudio.

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
cada strip e o fader/mute Master; os medidores mostram o pico em dBFS. Essas
configurações ficam salvas no patch. Um patch aceita no máximo quatro
instrumentos; os slots de FX/sends são placeholders e janelas de editor VST
ainda não fazem parte desta etapa.

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
| `mix` | — | Lê volume, pan, mute, solo e medidores dos strips |
| `setLayerMix` | `layerId`, `volumeDb?`, `pan?`, `muted?`, `solo?` | Altera o strip de um instrumento |
| `setMasterMix` | `volumeDb?`, `muted?` | Altera o strip Master |
| `midiEnable` | `identifier?`, `enabled?` | Liga/desliga uma entrada MIDI (ou todas) |
| `scan` | `paths?`, `rescan?` | Varre VST3 (pastas padrão + extras) |
| `plugins` | — | Lista os plugins já conhecidos |
| `load` | `plugin` (id) ou `path`, `layerId?`, `minNote?`, `maxNote?` | Adiciona um instrumento (máximo quatro) |
| `unload` | `layerId?` | Descarrega um layer (sem ID, todos) |
| `layers` | — | Lista os instrumentos carregados e suas regiões |
| `setLayerRange` | `layerId`, `minNote`, `maxNote` | Altera a região MIDI de um layer |
| `plugin` | `layerId?` | Dados de um layer carregado |
| `params` | `layerId?`, `all?` | Parâmetros reais automatizáveis, valores normalizados 0..1 (`all: true` inclui os ~2000 "MIDI CC" do wrapper VST3) |
| `getParam` / `setParam` | `layerId?`, `index` / `index`, `value` | Lê / altera um parâmetro no layer indicado |
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
  por layer, mas janelas do editor VST ainda não estão disponíveis.
- Plugins de efeito não são aceitos como layers nesta etapa.

## Licença do JUCE

O JUCE 8 é distribuído sob **AGPLv3 ou licença comercial** (existe um plano
gratuito com limites). O motor linka o JUCE, então confira os termos em
<https://juce.com/legal> antes de distribuir o Preseter, pois o `package.json`
declara MIT para o restante do projeto.

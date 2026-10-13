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

**Status: Fase 1.** Um dispositivo de áudio, um plugin carregado por vez.

## Compilar

Precisa de CMake ≥ 3.22 e um compilador C++17. O JUCE é baixado sozinho.

### Windows (Visual Studio 2022)

```powershell
cmake -S engine -B engine/build -G "Visual Studio 17 2022"
cmake --build engine/build --config Release
```

Executável: `engine/build/PreseterEngine_artefacts/Release/PreseterEngine.exe`

Latência baixa no Windows pede **ASIO**. Ele não vem ligado porque o SDK da
Steinberg precisa ser baixado por você (e tem licença própria):

```powershell
cmake -S engine -B engine/build -DPRESETER_ENABLE_ASIO=ON -DPRESETER_ASIO_SDK_DIR=C:\SDKs\asiosdk
```

Sem ASIO o motor usa WASAPI, que funciona mas tem mais latência.

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

## Testar (Fase 1)

Com o motor compilado, na raiz do projeto:

```bash
node scripts/engine-smoke.js                         # ping, dispositivos e scan
node scripts/engine-smoke.js --plugin=Surge --audio  # carrega um plugin e toca uma nota
```

Veja as opções no topo de `scripts/engine-smoke.js`.

## Protocolo

Cada linha enviada ao motor é um objeto JSON com `id` (número, escolhido por
quem chama) e `cmd`. A resposta traz o mesmo `id`:

```json
{"id": 1, "cmd": "load", "plugin": "<id vindo do scan>"}
{"id": 1, "ok": true,  "result": { "...": "..." }}
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
| `midiEnable` | `identifier?`, `enabled?` | Liga/desliga uma entrada MIDI (ou todas) |
| `scan` | `paths?`, `rescan?` | Varre VST3 (pastas padrão + extras) |
| `plugins` | — | Lista os plugins já conhecidos |
| `load` | `plugin` (id) ou `path` | Carrega um plugin (substitui o anterior) |
| `unload` | — | Descarrega o plugin |
| `plugin` | — | Dados do plugin carregado |
| `params` | — | Lista de parâmetros reais, valores normalizados 0..1 |
| `getParam` / `setParam` | `index` / `index`, `value` | Lê / altera um parâmetro |
| `noteOn` / `noteOff` | `note`, `velocity?`, `channel?` | Envia nota MIDI |
| `midi` | `bytes` (1 a 3) | Envia MIDI cru |
| `panic` | — | All notes off + all sound off nos 16 canais |

Os tipos TypeScript equivalentes estão em `src/shared/engine-protocol.ts`.

### Arquivos que o motor cria

Em `…/Preseter/engine/` dentro da pasta de dados do usuário (`%APPDATA%` no
Windows, `~/.config` no Linux): `known-plugins.xml` (lista do scan) e
`scan-deadman.txt` (usado para pular plugins que travam durante o scan).

## Limitações conhecidas da Fase 1

- O **scan roda dentro do motor**: um plugin que trava o processo durante o scan
  derruba o motor. O arquivo `scan-deadman.txt` faz esse plugin ser ignorado na
  próxima execução. Scan em processo separado está previsto na Fase 6.
- Um plugin por vez, sem salvar/restaurar estado (Fase 3) e sem janela do editor
  do plugin (Fase 3).
- Plugins de efeito só recebem áudio se `audioStart` for chamado com `inputs` > 0.

## Licença do JUCE

O JUCE 8 é distribuído sob **AGPLv3 ou licença comercial** (existe um plano
gratuito com limites). O motor linka o JUCE, então confira os termos em
<https://juce.com/legal> antes de distribuir o Preseter, pois o `package.json`
declara MIT para o restante do projeto.

# Plano — Motor de áudio igual ao Element (Preseter)

## Objetivo

Eliminar o ruído que aparece quando o Preseter abre o dispositivo de áudio,
deixando o caminho de áudio o mais próximo possível do host **Element**
(GPL-3.0-or-later), que funciona limpo no mesmo Windows/Realtek/ASIO4ALL.

Critério final: **30 minutos sem ruído** com somente o Preseter aberto, em
ASIO4ALL 44.1/256 e 48/256, e em Windows Audio Exclusive, abrindo/fechando o
app e trocando de backend.

## Estado atual (2026-11-16)

Já feito:

- JUCE 8.0.8 → **8.0.13** (mesma versão do Element), com **ASIO bundled**.
- Abertura de dispositivo no estilo Element:
  - `initialise(128, 128, xml, ...)`;
  - XML com nome de entrada/saída, taxa e buffer;
  - sem `audioDeviceInChans`/`audioDeviceOutChans`;
  - ASIO com entrada e saída no mesmo nome.
- `AudioProcessorPlayer` removido; o `Engine` é o callback de áudio/MIDI.
- `audioDeviceAboutToStart` prepara o grafo; `audioDeviceIOCallbackWithContext`
  copia entradas, zera saídas e processa o grafo; `audioDeviceStopped` libera.
- `midiCollector` próprio.
- Scan de plugins no boot desligado por padrão (usa cache `known-plugins.xml`).
- Testes de silêncio digital: ASIO 44.1/256 e Exclusive 44.1/256 deram
  **−91 dBFS**; Tines tocou normalmente via ASIO.

Ainda falha:

- O ruído continua quando o app abre, mesmo com o WAV digital silencioso.
- Fechar o app para o ruído.
- Portanto, o problema está no caminho de dispositivo do nosso stack, não no
  DSP/instrumentos.

## Diferenças restantes em relação ao Element

1. **JUCE**: Element usa **8.0.13**; Preseter usa **8.0.9**.
2. **ASIO SDK**: Element usa o ASIO **bundled** do JUCE 8.0.13; Preseter usa
   SDK externo (`PRESETER_ASIO_SDK_DIR`).
3. **DeviceManager**: Element tem `DeviceManager` próprio, com monitor de
   dispositivo/hotplug e estado XML.
4. **Scanner**: Element roda o scanner de plugins em **processo separado**;
   Preseter ainda escaneia no processo do motor quando o usuário pede.
5. **Callback**: já portado, mas precisa ser integrado ao novo DeviceManager.

## Execução

Trabalhar direto no `main` (o MDA já foi fechado; não criar worktree).

### 1. JUCE 8.0.13

- `engine/CMakeLists.txt`:
  - `PRESETER_JUCE_TAG` = `8.0.13`;
  - remover a exigência de `PRESETER_ASIO_SDK_DIR` no Windows;
  - definir `JUCE_ASIO=1` e usar os headers ASIO bundled do JUCE;
  - manter `JUCE_ASIO_USE_EXTERNAL_SDK=0` por padrão.
- Apagar `engine/build/_deps/juce-src`, `juce-build`, `juce-subbuild` e
  reconfigurar.

### 2. Adaptar APIs quebradas no 8.0.13

- `Engine::Engine`:
  - trocar `formatManager.addDefaultFormats()` por
    `juce::addDefaultFormatsToManager(formatManager)`.
- `Engine::savePluginPresetFile`:
  - trocar `ExtensionsVisitor` por `getVST3Client()` e `client->getPreset()`.
- `Engine::saveVst2FxpFile`:
  - trocar `VSTPluginFormat::saveToFXBFile` por
    `getVSTClient()->saveToFXBFile(...)`.
- `Engine::loadVst2FxbFile` / equivalentes:
  - trocar `setChunkData` por `getVSTClient()->setChunkData(...)`.
- `Engine::setPluginPresetFile` (VST3 `.vstpreset`):
  - implementar leitura mínima do formato `.vstpreset` (`Comp`/`Cont`) ou usar
    `getVST3Client()->setPreset(MemoryBlock)` com o chunk `Cont`.
- Ajustar includes/namespaces conforme JUCE 8.0.13
  (`juce_audio_processors_headless`).

### 3. Portar DeviceManager do Element

Criar `engine/src/EngineDeviceManager.h/.cpp` com o necessário do Element:

- subclasse de `juce::AudioDeviceManager`;
- `createAudioDeviceTypes` com `WatchedDeviceType`;
- monitor de lista de dispositivos (sem auto-substituição);
- `createStateXml` para persistir o estado;
- abertura de dispositivo via `initialise`/`setAudioDeviceSetup`;
- aplicar em `Engine` no lugar do `deviceManager` direto.

Não é necessário copiar o `World`/`Context` do Element; adaptar as partes de
áudio.

### 4. Scanner em processo separado

- Adicionar modo `--scan` ao `PreseterEngine`:
  - executa `scan` e escreve o resultado JSON em stdout/arquivo;
  - não abre áudio.
- `VstManager`/`main` passam a iniciar um segundo processo do engine para
  escanear; o processo de áudio não carrega DLLs de VST no boot.
- O botão “Escanear plugins” usa o scanner separado.
- Manter a preferência “Escanear plugins ao iniciar” (padrão desligado).

### 5. Callback e DeviceManager

- Integrar o callback já portado ao novo `DeviceManager`.
- Garantir:
  - `audioDeviceAboutToStart` com taxa/block size/canais reais;
  - `graph.setPlayConfigDetails` + `prepareToPlay` + `reset`;
  - `audioDeviceStopped` com `graph.releaseResources`;
  - saída zerada antes de processar;
  - MIDI via `midiCollector`;
  - fade-in/out curto ao abrir/fechar (evitar transiente).

### 6. Testes

Automáticos (script local):

- `scripts/engine-audio-silence.js` em:
  - ASIO4ALL 44.1/256, 48/256, 512;
  - Windows Audio 48/480;
  - Exclusive 44.1/256 e 48/256;
  - Low Latency 48/480.
- Critério: pico < **−90 dBFS**.
- Troca ASIO → Windows Audio → Exclusive → ASIO no mesmo processo.
- Tines/Wurly tocando via ASIO (pico > −30 dBFS, sem erro).
- Scan separado não altera o silêncio do processo de áudio.

Manual (usuário):

- Só o Preseter aberto, sem Reason/Element.
- Abrir/fechar o app 5 vezes.
- ASIO 44.1/256 por 30 minutos.
- ASIO 48/256 por 10 minutos.
- Exclusive 44.1/256 por 10 minutos.
- Trocar backend e patch.
- Reiniciar o Windows e repetir.

## Critério de aceite

Não considerar resolvido se qualquer item falhar:

- 30 min sem ruído com ASIO;
- abrir/fechar o app sem ruído;
- WAV digital silencioso;
- zero xruns;
- usuário confirmar de ouvido.

## Fallback

Se, após o port completo (JUCE 8.0.13 + ASIO bundled + DeviceManager +
scanner separado), o ruído continuar:

- o problema é a combinação Realtek/ASIO4ALL;
- entregar **Windows Audio compartilhado/Low Latency 48 kHz** como padrão
  seguro;
- documentar que ASIO4ALL nessa máquina é instável e recomendar interface com
  ASIO nativo.

## Arquivos prováveis

- `engine/CMakeLists.txt`
- `engine/src/Engine.cpp`
- `engine/src/Engine.h`
- `engine/src/EngineDeviceManager.h/.cpp` (novo)
- `engine/src/Main.cpp` / `CommandRouter.cpp` (modo scan)
- `src/main/index.ts`
- `src/main/vst/VstManager.ts`
- `src/shared/types.ts`
- `src/renderer/components/concert/SettingsModal.tsx`
- `docs/LICENCAS.md`
- `docs/testes/audio-silencio.md`

## Licença

Element é GPL-3.0-or-later; Preseter é AGPL-3.0-or-later. Código adaptado
mantém cabeçalhos e atribuição; adicionar ao Sobre e às licenças.

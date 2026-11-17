# Preseter — Deixar o áudio igual ao Element (abrir uma vez, callback antes, sem trocar de dispositivo)

> Documento para o OpenCode, em PT-BR. **Uma tarefa de cada vez; parar ao final de cada uma e mostrar o resultado.**
> Objetivo do Rafael: **o caminho de áudio do Preseter deve se comportar como o do Element**, que funciona sem
> ruído na mesma máquina (placa onboard Realtek, sem interface de áudio).
> Não inventar: o que não for confirmado no código fica `a confirmar`.
> Referência: `https://github.com/Kushview/Element` (commit `b6d9373`, GPL-3.0-or-later; compatível com a
> AGPL-3.0-or-later do Preseter). Qualquer trecho **copiado ou portado** deve manter o aviso de copyright/licença
> no arquivo e ser registrado em `docs/LICENCAS.md`.
> Este documento **substitui a tarefa E3** de `docs/AUDIO-ELEMENT-COMPARACAO.md` (a E0–E2 de diagnóstico
> continuam valendo se o ruído persistir).

---

## 1. Diferenças confirmadas (Element × Preseter)

### Estado da implementação

- A1: chamadas do processo principal são serializadas; configurações já ativas não reabrem o dispositivo.
- A2: callbacks de áudio e MIDI são registrados no construtor, antes da abertura, e removidos no destrutor.
- A3: canais padrão do driver são usados nas configurações salvas; se o dispositivo solicitado falhar, o
  engine tenta a configuração atual e depois o dispositivo padrão do Windows. O dispositivo efetivo é salvo
  para evitar repetir a tentativa do dispositivo indisponível.
- O processamento, a preparação/parada do grafo e suas alterações estruturais compartilham `audioGraphLock`,
  conforme o padrão de sincronização do Element.
- Build nativo, build do app, typecheck e testes focados passaram. Isso não substitui a validação auditiva no
  equipamento; o ruído ainda precisa ser confirmado pelo usuário.

| # | Ponto | Element | Preseter hoje |
|---|---|---|---|
| 1 | **Quantas vezes abre o dispositivo** | **Uma** vez no boot: `application.cpp` `setupAudioEngine()` (~l.80–115) | Operações são serializadas no processo principal; uma configuração já ativa não reabre. A validação repetida de inicialização ainda depende do usuário |
| 2 | **Ordem do callback** | O callback do engine é ligado **antes** de abrir: `DeviceManager::attach` (`devicemanager.cpp` ~l.241–256) | `addAudioCallback` é chamado no construtor do engine, antes de qualquer `initialise` |
| 3 | **`selectDefaultDeviceOnFailure`** | `true` ao restaurar o XML salvo; tenta a configuração atual e depois dispositivo padrão | `initialise` usa fallback habilitado; tenta setup atual e, no Windows, `Windows Audio (Low Latency Mode)`/dispositivos padrão |
| 4 | **Troca de configuração** | `setAudioDeviceSetup(setup, true)` no dispositivo já aberto (`deviceservice.cpp` ~l.89, `settings.cpp`) | Usa `setAudioDeviceSetup` quando o backend atual serve; caso contrário fecha e reabre |
| 5 | **Callback de áudio** | `audioengine.cpp` ~l.686–745: copia entradas para a saída; zera saídas sem entrada; `ScopedNoDenormals` | **Equivalente** (`Engine.cpp` ~l.1450). Não precisa mudar |
| 6 | **`audioDeviceAboutToStart`** | `audioengine.cpp` ~l.852–895 (aloca, `prepareToPlay`, marca `audioStarted`) | Equivalente (`Engine.cpp` ~l.1426) |
| 7 | **Tipos de dispositivo** | Lista fixa: ASIO, WASAPI exclusive, WASAPI shared low latency, DirectSound, cada um dentro de um `WatchedDeviceType` (`devicemanager.cpp` ~l.271–305) | Lista padrão do JUCE |
| 8 | **Padrão sem configuração salva (Windows)** | Tipo "Windows Audio (Low Latency Mode)" (`application.cpp` ~l.109) | `a confirmar` |
| 9 | **Dispositivo ausente / hotplug** | Monitor próprio (`AudioDeviceMonitor`, `AudioHardwareWatcher`): não substitui, espera voltar | Não tem |
| 10 | **Canais** | `initialise(maxAudioChannels, maxAudioChannels, ...)`; JUCE negocia os canais padrão (as entradas também podem abrir) | Configurações salvas usam os canais padrão do driver; a UI que solicita contagens específicas continua usando máscaras explícitas |
| 11 | **Scan de plugins** | Processo separado | No processo do motor, só quando o usuário pede (boot desligado) |

> O Preseter agora também aceita o fallback automático escolhido para esta implementação. Quando a ativação
> resulta em outro dispositivo, salva o dispositivo efetivo para não ficar tentando reabrir o solicitado.
>
> Decisão: como o Element também abre as entradas e tem a mesma cópia entrada→saída, **não** desligar as
> entradas por padrão nesta fase. Só mexer nisso se, depois das tarefas abaixo, o ruído continuar (ver E2 do
> documento de diagnóstico).

## 2. Tarefas (nesta ordem)

**A0 — Conferir e anotar (sem mudar código).** Abrir o Element e o Preseter nos arquivos citados na tabela §1
e confirmar cada linha com arquivo e número de linha reais, em `docs/AUDIO-ELEMENT.md` ("Alinhamento").
Preencher o item 8 (`a confirmar`). Listar **todos** os pontos em que o Preseter chama `startAudio` até o primeiro
som, com a ordem real no boot. Critério: tabela completa, sem suposição. Pare ao final.

**A1 — Uma abertura só no boot.** No processo principal (`src/main/index.ts`, `VstManager.ts`):
1. Um único caminho de boot abre o áudio (o `startup`). Os fallbacks de `VstManager` (`{outputs:2, inputs:0}`)
   só rodam se o áudio **não** estiver rodando e **nunca** em paralelo com o `startup`.
2. Serializar `startAudioLogged`/`restartAudioLogged` (fila ou *mutex*): duas chamadas simultâneas viram uma.
3. Se a configuração pedida for **igual** à atual e o dispositivo estiver aberto, **não reabrir** (retornar o
   estado atual).
Critério: no log de boot, **exatamente uma** abertura até o primeiro som. Pare ao final.

**A2 — Callback ligado antes de abrir (igual ao `DeviceManager::attach`).** Em `engine/src/Engine.cpp`/`Engine.h`:
1. Registrar `deviceManager.addAudioCallback(this)` (e o `timingCallback`) **uma vez**, quando o `Engine`
   é criado, antes de qualquer `initialise`.
2. `startAudio` **não** adiciona nem remove callbacks; `stopAudio` fecha o dispositivo
   (`closeAudioDevice()`) mas **não** remove o callback. Remover só no destrutor.
3. Manter `audioDeviceAboutToStart`/`audioDeviceStopped` como estão.
Critério: `audioDeviceAboutToStart` é chamado uma vez por abertura, com taxa/buffer/canais reais; sem
vazamento nem chamada dupla. Pare ao final.

**A3 — Abertura igual ao Element.** Em `Engine::startAudio`:
1. Abrir com `initialise(128, 128, &xml, **true**, "*", nullptr)` (`selectDefaultDeviceOnFailure = true`),
   omitindo máscaras de canais quando a opção é usar os canais padrão do driver.
2. Se não abrir, tentar o setup atual do gerenciador e então o dispositivo padrão do Windows. Registrar e
   persistir o dispositivo realmente aberto para que inicializações seguintes não insistam no dispositivo
   indisponível. Esse fallback automático foi escolhido pelo usuário.
3. Para **mudança de configuração com o dispositivo aberto** (trocar buffer/taxa/dispositivo), usar
   `setAudioDeviceSetup(setup, true)` em vez de fechar e reabrir do zero, como o Element faz em
   `deviceservice.cpp`. Se o driver recusar, aí sim fechar e abrir uma vez.
4. Sem configuração salva no Windows: usar o tipo padrão do Element (item 8 da tabela; se for
   "Windows Audio (Low Latency Mode)", `a confirmar` o nome equivalente em JUCE 8.0.13).
Critério: build nativo, `npm run typecheck` e `npm test -- --run` passando; depois, confirmar no equipamento
que aberturas repetidas não produzem ruído em ASIO4ALL e Windows Audio. Os testes locais não verificam áudio
audível.

**A4 — Lista de dispositivos como o Element.** Portar o conceito de `WatchedDeviceType` (envolve cada tipo
nativo e mantém o dispositivo atual na lista enquanto estiver aberto, sem auto-substituição) e a lista fixa de
tipos do §1 item 7. Criar `engine/src/EngineDeviceManager.h/.cpp`, subclasse de `juce::AudioDeviceManager`
com `createAudioDeviceTypes`. Manter o aviso de licença do Element nos arquivos portados.
Critério: trocar de backend na interface não abre o dispositivo duas vezes; lista estável. Pare ao final.

**A5 — Dispositivo ausente (monitor).** Quando o dispositivo salvo não existir ao abrir, ficar mudo e mostrar
aviso; **não** trocar. Reabrir sozinho quando voltar (monitor por timer, `isDevicePresent`-like). Só depois de
A1–A4 aprovados. Pare ao final.

**A6 — Registro e documentação.** Atualizar `docs/PLANO-AUDIO-ELEMENT.md` (estado real, o que ficou igual ao
Element e o que não), `docs/LICENCAS.md` (trechos portados do Element) e anotar o teste de 30 aberturas.

## 3. Regras para o agente

1. Uma tarefa por commit; parar e mostrar o resultado.
2. Não mudar o callback de áudio (já está equivalente) sem evidência de que é a causa.
3. Nada de alocação nem I/O dentro do callback de áudio.
4. Não copiar código do Element sem manter o aviso de licença e registrar em `docs/LICENCAS.md`.
5. Não mexer em `asio/` nem em `.vscode/`.
6. Manter `.preseter` e as configurações de áudio salvas compatíveis (ler as chaves antigas).
7. Manter o repositório compilando; `npm run typecheck` e `npx vitest run` passando em cada tarefa.

## 4. Riscos

| Risco | Mitigação |
|---|---|
| Reabertura necessária quando o driver recusa `setAudioDeviceSetup` | Fechar e abrir **uma** vez, só nesse caso; registrar no log |
| JACK (Linux) tem ciclo de vida próprio | Manter o caminho atual do JACK; A3 vale para Windows/macOS/ALSA |
| Ficar mudo quando o dispositivo falha parece "app quebrado" | Mensagem clara na interface e tentativa automática no A5 |
| Mudar a ordem do callback expor corrida no grafo | `audioDeviceAboutToStart` já prepara o grafo; testar com concert grande |
| Ruído persistir mesmo igual ao Element | Voltar ao diagnóstico (logs, pico nos 2 primeiros segundos, entradas desligadas) |

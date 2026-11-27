# Diagnóstico da troca de patch (T0)

> Documento de trabalho da **T0** de `TROCA-DE-PATCH-SEM-FALHA.md`.
> Nada aqui foi medido na máquina do Rafael ainda: os números são para preencher.

## 1. O que a T0 mede

| Medida | De onde vem | Para que serve |
|---|---|---|
| Tempo **esperando** e **segurando** `audioGraphLock` em `addGraphNode`, `removeGraphNode`, `rebuildConnections`, `unloadPlugin`, `commitPatchSwap`, `prepareToPlay` pré-aquecido e no callback | contadores atômicos no engine | provar H1, H2 e H3 |
| Quantas reconstruções do grafo por troca (`rebuild` e `graphRebuild`) | contador atômico | provar H3 |
| Maior intervalo entre callbacks (`maxCallbackGapMs`) e xruns | `AudioTimingMeter` | dizer se a falha é de um bloco ou de vários |
| MIDI recebido, entregue ao grafo e quantos chegaram **durante** uma mudança de grafo | contadores atômicos | separar "nota foi para o patch errado/perdeu" de "áudio engasgou" |
| Instrumento novo soando vazio nos primeiros blocos | ouvido + `maxCallbackGapMs` | H5 (a confirmar) |

Nada disso roda dentro do callback com alocação, log ou espera: o callback só incrementa
contadores atômicos e lê dois números. O log é escrito na thread principal, uma linha por
troca de patch.

## 2. Como ler

### 2.1 Comando do engine

```json
{"cmd": "swapStats", "reset": true}   // zera e devolve
{"cmd": "swapStats"}                  // só devolve
```

Resposta:

```json
{
  "ops": [
    {"name": "add", "count": 8, "waitTotalMs": 1.2, "holdTotalMs": 0.9, "waitMaxMs": 0.4, "holdMaxMs": 0.3},
    {"name": "rebuild", "count": 1, "waitTotalMs": 0, "holdTotalMs": 12.5, "waitMaxMs": 0, "holdMaxMs": 12.5},
    {"name": "graphRebuild", "count": 1, "...": "..."},
    {"name": "prepare", "count": 8, "...": "..."},
    {"name": "callback", "count": 3200, "waitMaxMs": 12.5, "...": "..."}
  ],
  "midi": {"received": 12, "noteOnReceived": 6, "delivered": 12, "noteOnDelivered": 6, "duringGraphChange": 3},
  "xruns": 1,
  "maxCallbackGapMs": 12.8,
  "expectedBlockMs": 5.33,
  "lockHeld": false
}
```

Leitura rápida:

- `callback.waitMaxMs` é o tempo que **o áudio esperou** a trava. É o número que precisa cair na T1.
- `callback.holdMaxMs` é o tempo que o callback segurou a trava (processar o grafo).
- `rebuild.count`/`graphRebuild.count` são as reconstruções por troca.
- `maxCallbackGapMs` maior que ~1,5 bloco = áudio atrasou. Muito maior que o bloco = engasgo de
  vários blocos (não estalo).
- `midi.duringGraphChange` conta o MIDI que chegou enquanto o grafo estava sendo mudado; é a
  janela em que uma nota pode ir para o patch antigo.

### 2.2 Log da sessão

Cada `loadPresetNow` grava uma linha `patch-switch` em `audio-session.log`
(`%APPDATA%\preseter\audio-session.log` no Windows; o menu de áudio tem "Abrir log"):

```json
{"event":"patch-switch","presetName":"Piano 2","layers":1,"inserts":0,"silencePrevious":false,
 "worst":{"name":"commit","holdMaxMs":18.4},"stats":{ ...o JSON acima... }}
```

## 3. Cenários

Repetir com **ASIO 256** e, depois, **ASIO 512**. Em cada cenário, apertar o patch novo
**enquanto uma nota ainda está soando** e anotar o que se ouve.

| # | Cenário | O que observar |
|---|---|---|
| 1 | Piano 1 → Piano 2 (mesmo instrumento, SF2 diferente) | estalo? nota perdida? engasgo? |
| 2 | Piano 1 → patch com 3 layers | as 3 notas entram juntas? |
| 3 | patch com inserts (reverb/delay) → outro com inserts | efeito entra atrasado? |
| 4 | Cenário 1 com "Silenciar patch anterior" **ligado** | corte seco/estalo na saída |
| 5 | Cenário 1 com "Silenciar patch anterior" **desligado** | cauda do piano antigo atrapalha? |
| 6 | Troca rápida: Piano 1 → 2 → 3 em menos de 1 s | só o último vale? trava? |

## 4. Tabela para preencher

Uma linha por cenário/dispositivo. `wait` = `callback.waitMaxMs`; `gap` = `maxCallbackGapMs`;
`rebuilds` = `rebuild.count` + `graphRebuild.count`.

| Cenário | Buffer | wait (ms) | gap (ms) | xruns | rebuilds | MIDI durante troca | Notas perdidas? | Estalo? | Veredito |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 256 | | | | | | | | |
| 1 | 512 | | | | | | | | |
| 2 | 256 | | | | | | | | |
| 3 | 256 | | | | | | | | |
| 4 | 256 | | | | | | | | |
| 5 | 256 | | | | | | | | |
| 6 | 256 | | | | | | | | |

## 5. Como interpretar

- `wait` alto e `gap` alto → **H1/H2/H3**: o áudio está parado esperando a trava.
- `wait` baixo, `gap` alto e `xruns` > 0 → carga de CPU ou driver, não a trava.
- `midi.received` > `midi.delivered` → MIDI perdido no coletor (H perdido / T3b).
- `midi.duringGraphChange` alto mas `delivered` = `received` → a nota chegou e foi entregue;
  se ela não soou, o problema é o instrumento/buffer frio (**H5**) ou o patch antigo ainda
  recebendo MIDI.
- Instrumento soa vazio nos primeiros 100–300 ms e depois normaliza → **H5** (primeiro bloco
  frio). Nesse caso a T3 (pré-aquecimento) é a prioridade, e a T5 (patch seguinte pronto)
  ataca direto o sintoma.

## 6. O que já está implementado neste passe

> Tudo abaixo é código novo, compilado no Windows, mas **sem medição de áudio real**.
> Marcar `a confirmar` até o teste com a placa.

- **T1a** — nós removidos são tirados do grafo sob a trava e a última referência é solta
  fora dela (`removeGraphNode`).
- **T1b** — o instrumento/efeito novo é preparado (`prepareToPlay`) **fora** da trava, antes
  de entrar no grafo (`addGraphNode`). O `graph.rebuild()` continua preparando o nó, mas já
  com os buffers alocados.
- **T1c** — `addNode`, `removeNode` e as conexões usam `UpdateKind::none`: uma troca de patch
  faz **uma** reconstrução no `commitPatchSwap`, em vez de uma por nó e uma por layer
  descarregado. `unloadPlugin(..., rebuildNow=false)` permite descarregar vários layers e
  reconstruir no fim (inclusive na liberação das caudas).
- **T2** — os inserts do patch novo entram em modo **staged** (`stage: true`) antes do
  `commitPatchSwap`; nenhum `setInsert` reconstrói o grafo depois do commit.
- **T3 (parcial)** — fade-in de 6 ms no channel strip dos layers que entram no patch novo.
  Pré-aquecimento de vozes = o `prepareToPlay` da T1b (a confirmar se basta).
- **T3b** — **não** implementado. O `MidiMessageCollector` do JUCE já segura o MIDI durante
  um bloqueio curto e comprime na volta; antes de enfileirar por conta própria é preciso o
  número de `midi.received` × `midi.delivered` da T0.
- **T5** — **não** implementado neste passe.

## 7. O que falta testar

- ASIO 256/512 com os seis cenários acima (Windows). Ubuntu/JACK, se houver.
- Se o fade de 6 ms é audível no ataque do piano.
- Se o `prepareToPlay` fora da trava causa algum problema em VST3 específico (bus layout).
- 100 trocas seguidas (T4) — ainda não automatizado.

## 8. Ordem de execução e onde paramos

| Etapa | Estado | Observação |
|---|---|---|
| T0 — medir | **instrumentação pronta**, falta rodar os cenários | este documento é o formulário |
| T1 — tirar trabalho pesado da trava | **feito no código**, a confirmar com números | preparar fora, destruir fora, 1 reconstrução por troca |
| T2 — inserts junto com a troca | **feito no código**, a confirmar | `stageInsert` antes do `commitPatchSwap` |
| T3 — pré-aquecer e suavizar | **parcial**: `prepareToPlay` fora da trava + fade-in 6 ms; debounce não feito | |
| T3b — gate de MIDI | **não feito de propósito** | depende de `midi.received` × `midi.delivered` da T0 |
| T4 — medir de novo + 100 trocas | não feito | só depois do teste de áudio |
| T5 — próximo patch pré-carregado | **substituído pela preparação do concert** (seção 9) | carrega os dados de todos os patches, não instâncias |

### Por que o T5 (patch na RAM) não veio primeiro

O `stageLoad` já carrega o instrumento do patch novo na memória **antes** do commit, e o
sampler usa arquivo mapeado em memória + `preloadConcertSamplers()`. O que faltava era a
troca do grafo ser barata e atômica; é isso que T1/T2/T3 atacam. O T5 reduz o custo de
**carregar** o próximo patch, mas não resolve sozinho a janela em que o áudio espera a
trava. Se a T0 mostrar que o custo dominante é o carregamento do instrumento (e não a
trava), o T5 sobe de prioridade.

### "Concert inteiro na RAM"

Fica fora deste documento: 40–64 patches com vários layers e plugins podem consumir vários
GB. Se for feito depois, deve ser opcional, com limite de RAM, carregamento em segundo
plano e aviso de consumo.

## 9. Preparação do concert (implementado)

O concert agora é preparado **antes** de o palco liberar. Fluxo:

1. Abrir/recente/template/Loja: o main espera a preparação terminar antes de devolver o
   concert para a interface. No boot, a preparação começa em segundo plano e a interface
   bloqueia assim que recebe o primeiro evento.
2. Overlay bloqueante `Preparando concert` com barra determinada, `3/12 — Nome`, fase,
   tempo decorrido e **Cancelar**. O patch anterior continua soando.
3. A lista é montada em `src/main/concert/prepare.ts`: sampler primeiro (arquivo + banco +
   programa, sem repetir, caminho normalizado), depois os instrumentos nativos. Kit do
   Preseter Drums entra como sampler. MIDI externo e sampler vazio ficam de fora.
4. Cada item é carregado **um por vez** no engine (`samplerPrepare`, `nativePrepare`), o que
   evita saturar disco/CPU. O cache é dimensionado antes (`samplerCacheReserve`), para não
   descartar o concert (limites antigos: 16 arquivos / 128 programas).
5. Só no fim (ou no cancelamento) a interface libera a troca de patch. `loadPresetNow`
   também espera a preparação, então atalho/MIDI não furam a fila.
6. Falhas aparecem numa lista antes do show; "Continuar mesmo assim" abre o concert.

Diagnóstico: o log do áudio ganhou `concert-prepare` (total, tempo, cache hits, erros) e o
`patch-switch` agora traz `stageLoad` por layer, `commitMs` e `totalMs` — é o que mostra se
a troca ficou em cache hit depois da preparação.

Texto corrigido: o cartão de patch não promete mais "o áudio continua disponível"; agora diz
"O patch atual continua soando até a troca", que é o comportamento real.

### Números medidos neste passe (engine headless, cache em disco já quente)

| Instrumento | Primeira carga | Segunda carga (cache) |
|---|---|---|
| MuseScore_General.sf2 (216 MB, 1246 samples) | 749 ms | 0,3 ms |
| Salamander Grand Piano V3.sfz (480 samples) | 571 ms | 0 ms |
| Preseter Dexed (banco .syx) | 40 ms | — |
| Preseter Zyn (banco embutido) | 1 ms | — |

Um patch com 2–3 layers de sampler pagava ~0,6–1,5 s **por troca** só de leitura/mapeamento;
com a preparação no abrir do concert isso vira cache hit. Em máquina nova, o `.sfz` ainda
converte os samples na primeira preparação (uma vez só, fica no cache em disco).

> Medido no engine, não no áudio: ainda falta o teste com a placa (ASIO 256/512) para
> confirmar que o silêncio na troca desapareceu.



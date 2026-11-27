# Preseter — troca de patch sem falha no começo (Piano 1 → Piano 2)

> Documento para o OpenCode, em PT-BR. **Uma tarefa de cada vez; parar ao final de cada uma** para o Rafael testar.
> Não afirmar que algo funciona sem testar; dizer o que foi e o que não foi testado.
> Não registrar um segundo `AudioIODeviceCallback`. Não mexer em `asio/` nem em `.vscode/`.
> `npm run typecheck` e `npx vitest run` passam em cada tarefa.
> **Este documento trata da troca de PATCH do Preseter** (ex.: "Piano 1" → "Piano 2"). A troca de *preset interno do Zyn*
> está em `ZYN-COMPLETAR.md` (Z2) e é outro assunto, embora a causa possa se parecer.

---

## 1. Relato do Rafael

Ao trocar de patch (Piano 1 → Piano 2), o som **falha no começo** e depois de um tempo **normaliza**.

## 2. O que foi lido no código (HEAD `a2a37a7`)

Fluxo em `src/main/index.ts` (~l.1925–2070): para cada layer do patch novo → `vstManager.stageLoad(...)` →
`setLayerMix` → `setLayerVelocityRange` → `setPluginState` (se houver estado salvo) → **depois de todos**
`vstManager.commitPatchSwap(silencePrevious)` → transpose/entrada/master em paralelo → **inserts (efeitos)** carregados
**depois** da troca, um a um (`setInsert`).

Engine (`engine/src/Engine.cpp`):

1. `audioDeviceIOCallbackWithContext` (~l.1701) pega `audioGraphLock` (um `juce::CriticalSection`, **bloqueante**) e roda o
   grafo inteiro com ele. Qualquer outra thread que segure essa trava **para o áudio**.
2. Seguram a mesma trava: `addGraphNode` (~l.1622, `graph.addNode` → o JUCE chama `prepareToPlay` do processador
   novo, na hora), `removeGraphNode` (~l.1628, `graph.removeNode` → o processador é destruído/liberado) e
   `rebuildConnections` (~l.4816, **remove todas as conexões, recria todas e chama `graph.rebuild()`** dentro da trava).
3. `commitPatchSwap` (~l.3253), com "silenciar patch anterior" ligado, chama `unloadPlugin` do patch anterior: remove ~7
   nós por layer (`removeGraphNode`, cada um sob a trava) e depois `rebuildConnections` de novo. Liberar um piano grande
   (SF2/samples) **sob a trava** pode levar milissegundos.
4. Os **inserts** do patch novo entram **depois** do `commitPatchSwap`, cada um com `addGraphNode` + `rebuildConnections`:
   mais várias janelas em que o áudio espera a trava, **já com o patch novo audível**.
5. `stageLoad` ainda chama `rebuildConnections` a cada layer (o comentário no fim da função diz que já foi reduzido a uma
   reconstrução por chamada; **a confirmar** quantas por patch no total).

**Hipóteses (nenhuma medida ainda):**

- **H1** — `prepareToPlay`/`addNode` do instrumento novo (sampler SF2, Dexed, Zyn, órgão…) alocando memória sob a trava.
- **H2** — destruição do patch anterior sob a trava (`unloadPlugin` dentro de `commitPatchSwap`).
- **H3** — `rebuildConnections` completo (remove e recria *todas* as conexões do concert) rodando várias vezes por troca.
- **H4** — inserts do patch novo entrando um a um depois da troca (cada um = nova janela de trava + `prepareToPlay`).
- **H5** — primeiro bloco do instrumento novo ainda "frio" (samples/voices alocando na primeira nota). **a confirmar.**
- **H6** — carga de CPU da interface (reidratar o patch na tela) competindo com o áudio. **a confirmar.**

"Normaliza depois de um tempo" combina com H4/H5/H6 (efeito/voz/memória frios) mais do que com um corte único.

## 3. Tarefas (nesta ordem)

**T0 — Medir (sem corrigir).** Gerar `docs/TROCA-PATCH-DIAGNOSTICO.md` com números reais (Windows e, se houver, Ubuntu):
1. Instrumentar o engine (log só **fora** do callback; contadores atômicos) com: tempo **esperando e segurando**
   `audioGraphLock` em `addGraphNode`, `removeGraphNode`, `rebuildConnections`, `graph.rebuild()`, `prepareToPlay` do
   processador novo, `unloadPlugin`/destruição. Quantas vezes cada um roda **por troca**.
2. No callback: maior tempo esperando a trava e **xruns** (`AudioTimingMeter`) por troca; se a falha é **num bloco só ou
   dura vários segundos**.
3. Cenários: Piano 1 → Piano 2 (mesmo instrumento, SF2 diferente), → patch com 3 layers, → patch com inserts, com
   "Silenciar patch anterior" **ligado e desligado**, ASIO 256 e 512.
4. Qual layer/insert custa mais e se o instrumento novo soa vazio nos primeiros blocos (primeira nota).
Critério: tabela com ms por etapa e xruns, dizendo qual hipótese H1–H6 se confirma. **Pare ao final.**

**T1 — Tirar trabalho pesado de dentro da trava** (conforme a T0; não aplicar tudo às cegas):
1. **Preparar fora da trava:** chamar `prepareToPlay` do processador novo **antes** de `graph.addNode` (na thread de
   comandos, com a taxa e o bloco atuais); no grafo, só inserir o nó já pronto.
2. **Destruir fora da trava:** em `removeGraphNode`/`unloadPlugin`, tirar o nó do grafo sob a trava e **soltar a última
   referência fora dela** (fila de descarte em thread própria ou na thread de comandos depois do unlock).
3. **Uma única `rebuildConnections` por troca de patch:** `stageLoad` não reconstrói; só o `commitPatchSwap` (e os inserts
   em lote) reconstrói. Se a reconstrução completa for o custo (H3), torná-la **incremental** (só as conexões do que mudou)
   ou montar o grafo novo **fora** da trava e trocar de uma vez.
Critério: o tempo máximo que o áudio espera a trava cai (número da T0 vs. novo). **Pare ao final.**

**T2 — Inserts junto com a troca.** Carregar os inserts do patch novo **em modo staged**, antes do `commitPatchSwap`
(como os instrumentos), para o patch já entrar completo; hoje eles entram depois, com o patch audível.
Critério: nenhuma troca de grafo depois do `commitPatchSwap`. **Pare ao final.**

**T3 — Pré-aquecer e suavizar.**
1. Antes do commit, rodar alguns blocos silenciosos no instrumento staged (alocar vozes/buffers, tabelas) — sem tocar no
   callback principal.
2. **Fade** curto (5–10 ms) no strip do patch novo ao entrar e no anterior ao sair (sem clique), em vez de corte seco.
3. **Debounce/fila de 1:** se o usuário trocar de patch rápido, só o último carrega; o anterior em carga é cancelado.
Critério: sem estalo e sem falha na primeira nota. **Pare ao final.**

**T4 — Medir de novo e testes.** Repetir a tabela da T0, comparar; teste automatizado de **100 trocas seguidas** (sem
vazamento nem travamento); atualizar Help/README se mudar algum comportamento (ex.: "Silenciar patch anterior").
**Pare ao final.**

## 4. Regras para o agente

1. Uma tarefa por commit; parar e mostrar o resultado.
2. Nada de alocação, I/O, log ou espera por trava **no callback de áudio**; instrumentação só com contadores atômicos.
3. Não mudar a arquitetura de áudio nem registrar outro `AudioIODeviceCallback`.
4. Manter `.preseter`, bibliotecas e estados salvos compatíveis.
5. Não afirmar causa sem número da T0; marcar `a confirmar` o que não foi medido.
6. Textos da interface em português do Brasil.

## 5. Riscos

| Risco | Mitigação |
|---|---|
| A causa ser outra que H1–H6 | T0 mede antes de corrigir |
| Preparar fora da trava com taxa/bloco desatualizados após trocar de dispositivo | Reler taxa/bloco antes de inserir; se mudou, preparar de novo |
| Descarte em outra thread liberar nó ainda em uso | Só soltar depois de removido do grafo e da trava; testar 100 trocas |
| Reconstrução incremental do grafo deixar conexão órfã | Teste que compara o grafo incremental com o reconstruído por completo |
| Fade mudar o som do ataque | Fade curto e só na entrada/saída do patch |

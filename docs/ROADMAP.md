# Preseter — Roadmap para ficar igual ao MainStage

Referência: **MainStage User Guide (Apple, 2026)**. Decisão do dono do projeto:
**tudo deve ficar o mais parecido possível com o MainStage** (nomes, atalhos,
comportamento). Quando houver dúvida, copie o comportamento do manual.

## Regras para o agente (leia antes de qualquer tarefa)

1. Trabalhe na **`main`** (projeto solo). Faça commits pequenos e `git push` após cada tarefa.
2. **Nunca** faça commit de `engine/build/`, `node_modules/`, `dist/` ou arquivos gerados. Antes de cada commit rode `git status` e confira.
3. Faça **uma tarefa por vez**. Termine, teste e faça commit antes de começar a próxima. Um commit por tarefa, mensagem no formato `feat(area): resumo`.
4. Textos da interface e mensagens de erro em **português do Brasil**. No código C++ do motor, todo texto com acento deve usar `utf8("...")` (veja `engine/src/Output.h`).
5. Não mude o protocolo do motor (`src/shared/engine-protocol.ts` e `engine/README.md`) sem atualizar os dois e o `CommandRouter.cpp` juntos.
6. Depois de cada tarefa: `npm run build` (ou o script de build do projeto) deve passar, e se mexeu no motor, `node scripts/engine-smoke.js` deve passar.
7. Se uma tarefa exigir decisão que não está aqui, pare e pergunte em vez de inventar.

## Diferenças que já sabemos (código atual x MainStage)

- Troca de patch (`loadPreset` em `src/main/index.ts`) descarrega tudo e recarrega: há silêncio e as caudas somem.
- Estado do plugin salvo = só valores de parâmetros automatizáveis (`VstManager.getPluginState`). Falta o estado completo (chunk).
- Não existe janela do editor do plugin.
- Concert não é arquivo: sets e nome ficam em `localStorage`; cada patch é um JSON solto.
- Panic só envia CC123 pelo renderer; o comando `panic` do motor (all-notes-off + all-sound-off) não é usado. Não há atalho de Panic nem de Master Mute.
- Metrônomo e tempo são só flags de interface; não há relógio nem click.
- MIDI de hardware vai direto ao motor; a tela só reage a Program Change.
- Cada patch tem seu próprio layout (no MainStage o layout é do concert; só os mappings são do patch).
- Efeitos em layers são rejeitados; máximo de 4 layers.
- `setupAutoScroll` (`src/main/index.ts`) rouba o foco da janela.
- Modo Perform diz "tela cheia" mas não entra em tela cheia.

---

## Fase 0 — Pendências já conhecidas

- [x] **0.1 ASIO**: em `SettingsModal.tsx` (aba Áudio), ao trocar o tipo de driver não pré-selecionar o primeiro dispositivo; deixar o usuário escolher e usar entradas = 0 por padrão. Aplicar com `inputs: 0` quando nenhuma entrada for escolhida.
- [x] **0.2 Acentos no motor**: envolver com `utf8()` os literais com acento em `engine/src/Engine.cpp` (procure por `"` com caracteres acentuados fora de `utf8(`).
- [x] **0.3 Foco da janela**: remover `setupAutoScroll` e a chamada em `src/main/index.ts`.

## Fase 1 — Tocar ao vivo sem falhas (prioridade máxima)

- [x] **1.1 Estado completo do plugin.** Motor: novos comandos `getState` (retorna base64 do `getStateInformation`) e `setState`. Atualizar `engine-protocol.ts`, `CommandRouter.cpp`, `Engine.cpp`, `VstManager.ts`. Salvar no patch em `vstStates[layerId]` e restaurar ao carregar. Teste: carregar o Test Synth, mudar Volume, salvar patch, reabrir, conferir valor.
- [x] **1.2 Janela do editor do plugin.** Motor: comandos `openEditor{layerId}` e `closeEditor{layerId}` (janela JUCE `DocumentWindow` com `createEditorIfNeeded`). UI: tecla **V** abre/fecha a janela do plugin ativo (como no MainStage); botão no channel strip.
- [x] **1.3 Panic e Master Mute.** `Ctrl+P` chama o comando `panic` do motor. `Ctrl+M` alterna `setMasterMix{muted}`. No Perform: tecla `P` = panic, `M` = mute/unmute todo o áudio. Mostrar indicador visível quando o master estiver mudo. O botão Panic da barra deve usar o comando do motor, não CC123 no renderer.
- [x] **1.4 Troca de patch sem corte.** Motor: carregar os layers do próximo patch enquanto o anterior ainda soa; trocar as conexões do grafo de uma vez; manter o patch anterior até as caudas acabarem (opção **Silence Previous Patch**, padrão desligada, igual ao MainStage). Se o plugin do próximo patch for o mesmo do atual, reaproveitar a instância. Teste: segurar uma nota, trocar de patch, a nota continua.
- [x] **1.5 Tela cheia real no Perform.** `Cmd/Ctrl+4` = Perform em tela cheia (`BrowserWindow.setFullScreen`), `Cmd/Ctrl+3` = Perform em janela, `Esc` sai da tela cheia, `Cmd/Ctrl+1/2` voltam ao Layout/Edit.
- [x] **1.6 Motor que cai.** Se o processo do motor terminar, mostrar aviso na tela, reiniciar o motor e recarregar o patch atual. Serializar chamadas concorrentes de `loadPlugin`.
- [x] **1.7 Remover limite de 4 layers** (MainStage não tem limite). Avisar se passar de 3 channel strips que pode pesar (texto do manual).

## Fase 2 — Concert como arquivo

- [x] **2.1 Formato `.preseter`** (JSON) com: concert (nome, tempo, compasso, configurações), sets, patches, layout, mappings. Versão do formato no arquivo.
- [x] **2.2 Arquivo > Novo / Abrir / Salvar / Salvar como / Abrir recente.** Atalhos `Cmd/Ctrl+N`, `O`, `S`. Perguntar se quer salvar ao fechar com alterações. Ao reabrir, selecionar o último patch usado.
- [x] **2.3 Escolher template ao criar** (Teclado, Worship, Vazio). Mínimo: 3 templates.
- [x] **2.4 Concert Settings** (inspector ao selecionar o concert na Patch List), abas **MIDI, Timing, Tuning, Channel Strips, Metronome, Notes**:
  - MIDI: CC7 controla volume e CC10 controla pan; "enviar MIDI não atribuído a todos os channel strips"; Transpose do concert; origem do Program Change (dispositivo e canal); "enviar Program Change não usado aos channel strips".
  - Timing: tempo, compasso. Channel Strips: pan law (0, −3, −3 comp., −4,5, −4,5 comp., −6, −6 comp. dB).
- [x] **2.5 Desfazer/Refazer** (`Ctrl+Z`, `Ctrl+Shift+Z`) para edições do concert.

## Fase 3 — Channel strips completas

- [x] **3.1 Inserts (efeitos).** Slots de insert por channel strip carregando VST3 de efeito; remover a rejeição de `role: 'effect'` em `loadPreset` e `Engine.cpp`.
- [x] **3.2 Sends e Aux/Busses** no nível do concert; strips Aux, Output e Master no concert.
- [x] **3.3 Channel strips no nível do set e do concert**, com key range e sobreposição (override) por set/patch.
- [ ] **3.4 Transpose** por patch, set e concert (soma dos três). Filtro MIDI por strip e gráfico de velocity.
- [ ] **3.5 Strip de entrada de áudio** (guitarra/microfone): entrada, mono/estéreo, proteção de feedback (volume inicial 0 dB e aviso).

## Fase 4 — Assignments e Mappings

- [ ] **4.1 Layout por concert** (como no MainStage): mover `layout` do patch para o concert; mappings continuam por patch. Migrar patches antigos.
- [ ] **4.2 Assignments (hardware → controle de tela)** com **Learn** (`Cmd/Ctrl+L`): mexer no controle do teclado atribui ao controle de tela. Opções de dispositivo e canal por controle.
- [ ] **4.3 Mappings (controle de tela → parâmetro)** com faixa mínima/máxima, escolha por navegador de parâmetros ou clicando no parâmetro (`Cmd/Ctrl+L`).
- [ ] **4.4 Respond to Hardware Move**: Jump, Pickup, Relative.
- [ ] **4.5 MIDI Thru** em wheels e pedais (mod/pitch/aftertouch/expressão/volume passam direto; "Don't pass thru" para usar o controle em outra coisa).
- [ ] **4.6 Mappings no nível do concert** e override por set/patch. Tabela **Assignments & Mappings** (`Shift+Cmd/Ctrl+M`).
- [ ] **4.7 Ações** mapeáveis: Panic, Master Mute, Tap Tempo, próximo/anterior patch, próximo set, Play/Stop, Metrônomo, Notas atuais.

## Fase 5 — Patch List e biblioteca

- [ ] **5.1** Copiar/colar/duplicar patches (`Ctrl+C/V/D`), seleção múltipla, Option-arrastar, "Move again".
- [ ] **5.2** "Novo set a partir da seleção", "Novo patch a partir de patches selecionados".
- [ ] **5.3** Importar/Exportar patch e set (`.patch`), compartilhar entre concerts.
- [ ] **5.4** Patch Settings Inspector: Library, Attributes (compasso, mudar tempo ao selecionar, banco/programa, ícone, transpose), Tuning, Notes.
- [ ] **5.5** Patch Library com busca (`Cmd/Ctrl+F`) — por enquanto lista os patches salvos; no futuro, só plugins liberados (SFZ, MDA, ZynAddSubFX, Helm, Surge, setBfree).
- [ ] **5.6** Program Change: respeitar banco, skip, e a origem definida no Concert Settings.

## Fase 6 — Perform e extras

- [ ] **6.1** Navegação no Perform: ↑/↓ patch, ←/→ primeiro patch do set anterior/próximo; digitar número ou nome seleciona; `Cmd/Ctrl+setas` pulam itens skip.
- [ ] **6.2** Relógio do host: tempo e compasso enviados aos plugins (`AudioPlayHead`), metrônomo com click, Tap Tempo (`Ctrl+T`), tempo por patch.
- [ ] **6.3** Afinador (`Cmd/Ctrl+T` mostra/oculta, conforme o manual).
- [ ] **6.4** Gravação da saída do concert (`Ctrl+R`) e plugin Playback.
- [ ] **6.5** Janela Settings (`Cmd/Ctrl+,`): General, Audio, MIDI, View. Monitor de mensagens MIDI (`Shift+Cmd/Ctrl+M` não conflita: use outro atalho se necessário).

## Como saber se terminou uma tarefa

Cada tarefa só está pronta quando: o app compila, o teste descrito funciona na prática (ou um teste automático foi adicionado), o `git status` não mostra arquivos gerados, e o commit foi enviado com `git push`.

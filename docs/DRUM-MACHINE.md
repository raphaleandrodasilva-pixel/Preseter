# Preseter — Drum machine nativa com sequenciador de passos (`preseter.drums`)

> Documento para o OpenCode, em PT-BR. **Execute UMA tarefa de cada vez, na ordem, e pare ao final de cada
> uma** para o Rafael conferir. Uma tarefa por commit.
> Não invente nomes, ids, parâmetros, links, licenças nem números: o que não for confirmado no código ou na
> fonte fica `a confirmar`. **Nenhum kit de som entra sem a licença confirmada.**
> Não quebrar arquivos `.preseter` existentes. `npm run typecheck` e `npx vitest run` passam em todas as tarefas.
> Isto não é aconselhamento jurídico. A licença do Preseter é **AGPL-3.0-or-later**.

---

## 1. Objetivo (primeira versão)

Um instrumento nativo **Preseter Drums** (`preseter.drums`) que une:

1. **Pads de bateria**: até 16 pads, cada um com um som (sample), tocáveis pelo teclado MIDI.
2. **Sequenciador de passos**: padrão de 16 passos (ou 8/12/32), com velocity por passo, sincronizado com o
   tempo do concert, ligado e desligado por patch.
3. **Um padrão por patch**, salvo junto do patch.

**Fora da v1** (só planejar, não implementar): gravar padrão tocando ao vivo, encadear vários padrões, automação,
exportar MIDI, síntese de bateria própria, mixer interno por pad com efeitos individuais.

## 2. O que já existe no repositório (lido no código; confirmar linhas na tarefa D0)

| Peça | Onde | Observação |
|---|---|---|
| Instrumentos nativos | `engine/src/native/NativeProcessor.{h,cpp}`, `CommandRouter.cpp` (ids `preseter.organ/tines/reeds/piano/dx/jx`), `src/renderer/components/concert/ChannelStrips.tsx` (`nativeEntries`), `NativeInstrumentWindow.tsx` | Modelo a seguir para o novo id |
| Sampler (SF2/SFZ) | `engine/src/sampler/SamplerProcessor.cpp`, `SamplerInstrument.cpp` | Já toca bateria (bank 128 em SF2) e SFZ; é a base natural dos pads |
| Arpejador | `engine/src/Engine.cpp` `ArpeggiatorProcessor` (~l.147–): MIDI FX por layer (`layer.midiFxNode`), agenda notas com `samplePosition` dentro do bloco, sem alocar na thread de áudio, usa `bpm` atômico | **Modelo de como gerar MIDI com tempo preciso** |
| Metrônomo | `Engine.cpp` `MetronomeProcessor` (~l.596–): conta `ppqPosition` por conta própria a partir do momento em que é ligado | **Não é fase-travado** com o arpejador |
| Relógio do host | `Engine::setHostClock(bpm, numerator, denominator, playing)` (~l.3170); `playHead` (~l.24–70) com tempo, compasso e posição; IPC `host-clock-set` (`index.ts` ~l.1105), `VstManager.setHostClock` | `playing` é repassado, mas o metrônomo o ignora (`juce::ignoreUnused (playingIn)`) |
| Tempo por patch, tap tempo, compasso | `ConcertSettings`, `ConcertShell.tsx` | Fonte do BPM |
| Gravação e reprodução de áudio | `RecordingManager.ts`, `ConcertShell.tsx` | A bateria grava junto com a saída |
| Tipos de patch | `src/shared/types.ts` (`PresetPluginAssignment`, `ArpSettings`) | Modelo para guardar dados por layer |

### Lacuna principal encontrada

**O arpejador e o metrônomo contam o tempo cada um por conta própria** (o arp parte da primeira nota; o metrônomo
parte do instante em que é ligado). Não há um **relógio mestre único** (posição em tempos/ppq com play/stop) que
todos sigam. Um sequenciador de bateria precisa disso, senão o padrão **não alinha com o clique** nem com o arp.
→ É a **tarefa D1**.

## 3. Decisão de arquitetura (a confirmar na D0; padrão sugerido)

**Opção recomendada: instrumento autocontido.** `preseter.drums` é um instrumento nativo (como o `tines`), que
contém **os pads (sampler interno) e o sequenciador**. Entra no strip como qualquer instrumento; recebe MIDI
(para tocar os pads) e **também** gera as próprias batidas a partir do relógio mestre.

Por quê: o usuário carrega **um** instrumento e tem som + padrão; o padrão é salvo no estado do instrumento;
não exige novo tipo de nó MIDI no grafo.

Alternativa (não recomendada para a v1): sequenciador como MIDI FX separado (como o arp) ligado a qualquer
instrumento. Mais flexível, mas dobra a interface e o roteamento. Só se a D0 mostrar que o `NativeProcessor` não
comporta o instrumento autocontido.

## 4. Modelo de dados do padrão (proposta; ajustar na D0)

```ts
interface DrumStep { on: boolean; velocity: number /* 1..127 */; }
interface DrumTrack { pad: number /* 0..15 */; steps: DrumStep[]; mute: boolean; level: number /* dB */; }
interface DrumPattern {
  version: 1;
  stepsPerBar: 8 | 12 | 16 | 32;   // resolução
  bars: 1 | 2 | 4;
  swing: number;                    // 0..75 (%), como o arp
  tracks: DrumTrack[];              // até 16
}
interface DrumKit { name: string; pads: Array<{ name: string; note: number; sample: string; /* a definir */ }>; }
```

- O padrão fica no **estado do instrumento** (`getStateInformation`/`setStateInformation`), assim vai em
  `Preset.vstStates` como os outros nativos. Se a D0 mostrar que é melhor um campo em `PresetPluginAssignment`
  (como `arp`), usar esse, sempre com campos **opcionais** para não quebrar arquivos antigos.
- Arquivos antigos (sem `drums`) abrem normalmente.

## 5. Tarefas (nesta ordem; parar ao final de cada uma)

### D0 — Levantamento (sem alterar código)
Em `docs/DRUMS.md` (novo), seção "Confirmado", responder **com arquivo e linha**:
1. Como um instrumento nativo é registrado ponta a ponta: `NativeKind`, `NativeProcessor` (criação, `prepareToPlay`,
   `processBlock`, estado, parâmetros), `CommandRouter` (ids aceitos), `ChannelStrips.tsx` (`nativeEntries`),
   `NativeInstrumentWindow.tsx`, `index.ts` (lista de ids com `programIndex`), geração da coleção
   (`CollectionLayerSpec.nativeInstrument`).
2. Se dá para **reusar o `SamplerInstrument`** dentro de outro `NativeProcessor` (instanciar internamente) ou se é
   preciso extrair um núcleo comum. Como o sampler carrega SFZ/SF2 e mapeia notas.
3. Como o `playHead`/`setHostClock` entrega posição e como cada processador poderia ler uma **posição mestra**.
   Onde o app define `playing` (botão Play/Stop? `a confirmar`).
4. Como o arpejador agenda notas dentro do bloco (referência de precisão) e o que o `MetronomeProcessor` faz.
5. Se `getStateInformation` dos nativos é salvo/restaurado por patch (`vstStates`) e como.
6. Que testes de nulidade existem em `engine/test/` e como rodá-los; como seria o do novo instrumento.
Critério: respostas com referência real; nada inventado; decisão final da §3 registrada. **Pare ao final.**

### D1 — Relógio mestre único (pré-requisito)
Criar no motor um **relógio mestre** (posição em ppq, tempo, compasso, `playing`) e fazer **metrônomo e arpejador**
seguirem a mesma posição, sem mudar o comportamento audível para o usuário quando o relógio estiver parado
(arp livre continua funcionando como hoje). Regras:
- Atualização atômica, sem alocação nem I/O na thread de áudio.
- Mudança de tempo no meio do compasso **não** causa salto de posição (acumular ppq, não recalcular de segundos).
- Play/Stop do concert controla o relógio; Stop zera ou segura a posição (definir e documentar).
Critério: teste (C++ ou TS com o motor, conforme o padrão do repo) mostrando que metrônomo e arp, ligados juntos,
mantêm a mesma fase por 10 minutos simulados; testes atuais passam. **Pare ao final.**

### D2 — Esqueleto do instrumento `preseter.drums` (sem som)
Registrar o novo `NativeKind`/id em todos os pontos da D0 (motor, `CommandRouter`, `ChannelStrips`, janela,
`index.ts`, coleção). Programas: `a confirmar` (kits). Critério: o instrumento aparece na lista, carrega sem erro,
fica silencioso, salva e restaura estado vazio; teste de nulidade (silêncio) passa. **Pare ao final.**

### D3 — Pads e kit (som)
Implementar os pads usando o `SamplerInstrument` interno: 16 pads mapeados a notas MIDI (padrão GM: kick 36,
snare 38, hat fechado 42, hat aberto 46, tom 45/47/50, crash 49, ride 51, clap 39, etc.; **confirmar** o mapa),
velocity, volume por pad, **grupo de exclusão** (hat aberto cala quando o fechado toca). Kit padrão com amostras de
**licença confirmada** (ver D10). Critério: tocar notas no teclado dispara os pads com a velocity certa; teste de
nulidade e teste "nota → áudio não nulo". **Pare ao final.**

### D4 — Núcleo do sequenciador (sem interface)
Processador que lê o **relógio mestre** (D1) e dispara os pads. Requisitos:
- **Precisão de amostra**: cada passo cai na amostra correta dentro do bloco (como o arp usa `samplePosition`),
  inclusive quando o passo cruza o limite entre dois blocos.
- Resoluções 8/12/16/32 passos por compasso; **swing** (0–75%) deslocando os passos pares.
- **Loop** do padrão por `bars` compassos; troca de padrão só no início do compasso (sem cortes).
- Nota-off: bateria é "one-shot"; respeitar grupos de exclusão.
- Sem alocação, sem bloqueio, sem I/O na thread de áudio.
Critério: testes automáticos de tempo: com BPM e blocos variados (64, 256, 1024 amostras), a posição de cada
disparo bate **±1 amostra** com o esperado; mudança de BPM sem salto; swing correto. **Pare ao final.**

### D5 — Transporte e sincronia com o app
Ligar o sequenciador ao Play/Stop do concert e ao **tempo do patch** (e ao tap tempo). Opção por patch
"Sequenciador ligado" e "Iniciar com o patch" (`a confirmar` se entra na v1). Contagem de entrada opcional usando o
metrônomo. Critério: trocar de patch com `tempo` próprio muda o ritmo sem estalos; parar silencia sem notas presas.
**Pare ao final.**

### D6 — Estado e persistência
Salvar/restaurar o `DrumPattern` e o kit no estado do instrumento (e/ou campo opcional do patch, conforme D0).
Arquivos antigos abrem iguais. Critério: salvar, fechar, abrir → mesmo padrão; `.preseter` antigo sem `drums` abre
sem erro; teste de migração. **Pare ao final.**

### D7 — Interface: janela do instrumento
Criar a janela no estilo de `NativeInstrumentWindow.tsx` (visual atual **inalterado**: tema azul, mesmos
componentes). Conteúdo:
- **Grade de passos**: linhas = pads, colunas = passos; clique liga/desliga; arrastar altera velocity (ou clique
  direito/duplo cria acento); indicador de **passo atual** em movimento.
- **Barra de topo**: liga/desliga sequenciador, resolução (8/12/16/32), compassos (1/2/4), swing, volume geral,
  limpar padrão.
- **Pads** (16) clicáveis para pré-ouvir, com nome e volume por pad, mudo/solo.
- Textos em PT-BR; acessível por teclado (setas, espaço liga/desliga passo).
Critério: testes de componente (Testing Library) para ligar/desligar passos, mudar resolução e swing; **mock do
motor** (`electron-api-mock`). **Pare ao final.**

### D8 — Padrões de fábrica
Um conjunto pequeno de padrões prontos (ex.: rock 4/4, pop, funk, shuffle, balada, bossa, samba), como **dados
próprios** (autoria do projeto, sem copiar de terceiros). Seletor de padrão na janela. Critério: padrões carregam,
soam coerentes e ficam dentro do compasso. **Pare ao final.**

### D9 — Integração com a Coleção
Adicionar `nativeInstrument: 'drums'` em `CollectionLayerSpec` e **um ou dois patches** de bateria da Factory 40 que
usem o novo instrumento com um padrão (sem remover o "Acoustic Rock Kit" do sampler). Efeitos nativos conforme o
`docs/FACTORY-40-EFEITOS.md` (Compressor `drum`, Reverb `room`/`gated`). Critério: patches geram e soam; fallback
para o sampler se o nativo faltar. **Pare ao final.**

### D10 — Kits e licenças (portão obrigatório; pode rodar em paralelo à D3)
Para **cada kit** distribuído: nome, autor, URL de origem, **licença exata**, se exige atribuição, se permite
redistribuição e uso comercial, tamanho. Só entram kits **CC0, CC-BY, MIT ou equivalentes livres**, compatíveis com
a distribuição do app; registrar em `docs/LICENCAS.md` e na Loja (`docs/LOJA.md`) se for pacote baixável.
Preferir **baixar pela Loja** (não embutir arquivos grandes no instalador). Tudo que não tiver licença clara fica
`a confirmar` e **não entra**. Opcional: criar **samples próprios** (gravados ou sintetizados) com licença do projeto.
Critério: tabela de kits com licença verificada na fonte. **Pare ao final.**

### D11 — Testes e desempenho
- Nulidade (silêncio) e "toca → áudio não nulo" em `engine/test/` (seguindo os existentes).
- Teste de tempo da D4 em CI; teste longo (10 min simulados) sem deriva.
- **CPU**: medir com 16 pads, padrão cheio, kit com amostras grandes; documentar o consumo.
- Teste manual: tocar ao vivo no teclado **enquanto** o padrão roda; trocar de patch; mudar tempo.
Critério: relatório com números reais; nenhum `xrun` novo no cenário de teste. **Pare ao final.**

### D12 — Documentação e revisão final
`docs/DRUMS.md` (uso, limites, decisões), `docs/LICENCAS.md`, `docs/PATCHES.md`/`docs/COLECAO.md`,
ajuda no app (HelpModal) em PT-BR. Lista de conferência assinada pelo Rafael. **Pare ao final.**

## 6. Requisitos não funcionais

- **Tempo real:** nada de alocação, bloqueio ou I/O na thread de áudio. Estruturas pré-alocadas; comunicação por
  atômicos ou fila sem bloqueio.
- **Estabilidade ao vivo:** trocar de patch, de tempo ou de padrão **não** pode causar estalo, nota presa ou crash.
- **Compatibilidade:** `.preseter` antigos abrem; novos campos opcionais; nomes internos existentes não mudam.
- **Visual:** o tema atual não muda; só componentes novos no mesmo estilo.
- **Idioma:** interface em PT-BR.

## 7. Regras para o agente

1. **Uma tarefa por commit; parar e mostrar o resultado.** Não começar a próxima sem o Rafael aprovar.
2. **Não inventar** ids, nomes, parâmetros, licenças, links, números de desempenho: `a confirmar` e verificar no código.
3. **Nenhum kit/sample sem licença confirmada** (D10). Sem licença clara, não entra.
4. Não copiar código de terceiros sem conferir a licença (compatível com AGPL-3.0-or-later) e registrar em
   `docs/LICENCAS.md` e `UPSTREAM.md`. Referências de projetos de bateria (ex.: Hydrogen, Geonkick) servem de
   **estudo de ideias**; só copiar código com licença conferida.
5. Não mexer em `asio/` nem em `.vscode/`.
6. Manter o repositório compilando; `npm run typecheck` e `npx vitest run` passando em cada tarefa.
7. Textos para o Rafael em português do Brasil.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Sem relógio mestre, o padrão não alinha com metrônomo/arp | **D1 antes de tudo** |
| Tempo impreciso (jitter) na thread de áudio | D4: agendar por `samplePosition`, testes de ±1 amostra |
| Kits com licença não livre | D10 como portão; só CC0/CC-BY/MIT; samples próprios se preciso |
| Kits grandes inflarem o instalador | Baixar pela Loja; embutir só um kit pequeno |
| Complexidade da interface | Escopo fechado na v1 (grade + pads + barra); resto fica para depois |
| Interação com o arpejador e o metrônomo | Testes de fase na D1; relógio único |
| Consumo de CPU com muitos pads | D11 mede; limitar polifonia por pad |
| Trocar de patch com tempo diferente gerar estalo | D5: resincronizar no início do compasso; testar |
| Arquivos antigos quebrarem | Campos opcionais; teste de migração (D6) |

## 9. Ideias para depois da v1 (não implementar agora)

Gravar padrão tocando (com quantização), encadear padrões/compassos, variação (fill) por botão ou nota MIDI,
exportar para MIDI, mixer por pad com sends, síntese de bateria própria (base de estudo: Geonkick, GPL-3.0-or-later,
licença a confirmar no código), importar kits SFZ do usuário, mapeamento de pads para controladores MIDI.

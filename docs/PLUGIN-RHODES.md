# Preseter Tines — piano elétrico tipo Rhodes (base MDA ePiano + melhorias)

> Documento para o OpenCode, em PT-BR. Execute **uma tarefa de cada vez**, na ordem, e pare ao
> final de cada uma para o Rafael conferir. **Não invente** links, licenças, nomes de parâmetros
> nem números: se algo não estiver confirmado na fonte ou no código, escreva `a confirmar` e pergunte.
> Relacionado: `docs/PLUGINS-NATIVOS.md` (órgão, Wurlitzer, base de instrumentos embutidos).

---

## 1. Objetivo e decisões

| Decisão | Valor |
|---|---|
| Produto | Instrumento **nativo embutido no motor** (`PreseterEngine`, JUCE), nome **Preseter Tines**. Aparece na lista de plugins sem instalar nada, em Windows e Linux |
| Base | **MDA ePiano** (Paul Kellett): piano elétrico tipo Rhodes por **samples**, cerca de 12 samples embutidos no código, 32 vozes |
| Estratégia | 1) **porte idêntico** ao MDA (modo "Clássico") provado por teste; 2) **melhorias opcionais** por cima, cada uma com liga/desliga |
| Regra de ouro | Com **todas as melhorias desligadas**, o som é o do MDA original (o teste de nulidade continua passando) |
| Licença do Preseter | AGPL-3.0-or-later. Todo código copiado precisa ser compatível (§2) |
| Motivo | O Rafael gosta do som do MDA ePiano. Hoje ele é um VST2 separado; nativo, funciona em Windows e Linux sem instalação |
| Fora do escopo agora | Modelo físico completo (futuro, §8), interface gráfica sofisticada, samples novos |

### Expectativa honesta

- O som "Clássico" **soa igual ao MDA**: é o mesmo código e é verificável (§5).
- As melhorias **mudam o som de propósito**; elas se aproximam de um Rhodes real, mas **não prometem
  ser idênticas a um instrumento específico**. A decisão final é de ouvido do Rafael.
- Os samples do MDA são poucos (~12): notas muito graves e muito agudas continuam limitadas.
  Melhorar isso exige samples melhores (R5).

---

## 2. Licenças (portão obrigatório — tarefa R0.1)

Nada de código de terceiros entra no repositório antes desta verificação.

1. **Código do MDA:** a fonte que consultei diz que o original (Paul Kellett) é **GPLv2 ou posterior, ou MIT**
   (à escolha), e que os portes LV2 do David Robillard são **GPL-3+**. As duas opções são compatíveis com a AGPLv3.
   Preferir o **código original** (opção MIT). Conferir o **cabeçalho de cada arquivo** que for copiado.
2. **Dados dos samples (`epianodata` ou equivalente):** as fontes que li **não dizem** qual licença cobre esse
   arquivo (`a confirmar`). **Se não estiver claramente coberto pela mesma licença do código, PARAR e avisar o Rafael.**
   Alternativas nesse caso: pedir esclarecimento ao autor; ou gravar/usar samples próprios ou CC0 (R5).
3. Manter os **avisos de copyright** e o crédito a **Paul Kellett (MDA)** nos arquivos copiados.
4. Criar `engine/third_party/mda-epiano/LICENSE` e `UPSTREAM.md` com **URL, revisão/commit exato, data**.
5. Atualizar `docs/LICENCAS.md` e a atribuição em Configurações → Sobre.
6. **Nomes:** não usar a marca "Rhodes" como nome do produto. Nome no app: **Preseter Tines**; na descrição pode
   dizer "inspirado no piano elétrico de tines".
7. **Não copiar** projetos sem licença declarada (`10d6/electricpiano`, `jstolberg/rhodes`). Podem servir só de leitura de ideias.
8. **Samples sob licença não comercial** (ex.: CC BY-NC) **não** entram no repositório nem servem de referência embutida.

Fontes (conferir no repositório antes de usar):
- Repositório do MDA original: https://sourceforge.net/p/mda-vst/code
- Porte LV2 (referência de licença/estrutura): https://elephly.net/lv2/mdaepiano e https://git.drobilla.net/cgit.cgi/mda.lv2.git/about
- Descrição do som e parâmetros: https://zynthian.org/engines/_engine-list/engine-epiano

---

## 3. Parâmetros

**Do MDA (modo Clássico).** Parâmetros que consegui confirmar: **decay, release, dureza (hardness),
abafamento (muffle), sensibilidade à velocity, largura estéreo**. Os demais (afinação, tremolo/modulação,
polifonia etc.) **devem ser lidos do código** e listados em `docs/PLUGINS-NATIVOS.md` ("Achados"). Manter
os **mesmos nomes, faixas, padrões e unidades** do MDA para o teste de nulidade.

**Novos (melhorias, todos com chave liga/desliga, desligados por padrão no preset "Clássico"):**

| Parâmetro | Faixa sugerida | Função |
|---|---|---|
| Bark: ligado | liga/desliga | Ativa a saturação assimétrica do captador |
| Bark: intensidade | 0–100% | Quanto a saturação cresce com a velocity |
| Posição do captador | 0–100% | Muda quais harmônicos a saturação realça |
| Tremolo: ligado / tipo | liga/desliga; Tremolo, Auto-pan | Modulação de volume ou de pan |
| Tremolo: taxa | 0,5–12 Hz | Velocidade |
| Tremolo: profundidade | 0–100% | Intensidade |
| Pré-amp: drive | 0–100% | Saturação leve |
| Tom | −100% a +100% | Graves/agudos |
| Ruído de tecla (key-off) | 0–100% | Clique ao soltar a tecla |
| Variação por nota | 0–100% | Pequenas diferenças de afinação e de volume por tecla |
| Volume | −60 a +6 dB | Saída |

As faixas são sugestões: ajustar depois de ouvir.

---

## 4. Tarefas

### R0 — Investigação (sem código de produto)

**R0.1 Licenças.** Fazer a verificação do §2 e registrar em `docs/LICENCAS.md`: arquivos que vamos usar, cabeçalho de
licença de cada um, e a conclusão sobre os dados dos samples. **Portão: se houver dúvida, parar.**

**R0.2 Base de instrumentos embutidos.** Verificar se já existe a classe/fábrica de instrumentos nativos (feita para o
órgão, ver `PLUGINS-NATIVOS.md` N1) e o `Preseter Test Synth`. Se existir, **reaproveitar**; se não, criar a mesma
estrutura (id estável `preseter.tines`, nome, fabricante `Preseter`, instrumento, saída estéreo, parâmetros em
`AudioProcessorValueTreeState`, `getState`/`setState`). Registrar em "Achados": onde está, como entra no `scan` e no `load`.

**R0.3 Renderização offline.** Garantir `scripts/render-offline.js` (MIDI → `.wav` sem placa de som). Se existir, reaproveitar.
Critério: renderiza o Test Synth e o arquivo toca.

### R1 — Porte idêntico (modo "Clássico")

**R1.1 Importar o DSP.** Copiar para `engine/third_party/mda-epiano/` **apenas** o DSP do ePiano (e seus dados),
**sem** interface, sem código de host VST2/LV2. Fixar revisão em `UPSTREAM.md`. Compilar no Windows e no Linux.
**Não mudar o algoritmo.**

**R1.2 Adaptador JUCE `PreseterTines`.** Recebe MIDI (note on/off, velocity, pitch bend, CCs como sustain),
processa blocos de qualquer tamanho e taxa de amostragem **da mesma forma** que o MDA, expõe os parâmetros do §3 (MDA).
**Sem alocação, sem mutex e sem I/O na thread de áudio.** Estado salvo e restaurado no `.preseter`.

**R1.3 Teste de nulidade (obrigatório).** Ver §5. Critério de aceite: diferença abaixo de **−90 dBFS**.

### R2 — Melhorias (uma por vez; cada uma atrás de uma chave)

Para **cada** melhoria: implementar, medir CPU, rodar o teste de nulidade com ela **desligada** (tem que continuar
passando) e anotar em `docs/PLUGIN-RHODES.md` ("Achados") o que mudou no som.

- **R2.1 Bark / captador.** Não linearidade **assimétrica** depois dos samples (ex.: forma tipo `tanh(k·x + b) − tanh(b)`
  normalizada; `k` cresce com a velocity; `b` ligado à posição do captador). Rodar com **oversampling** (ex.: 2x ou 4x)
  para evitar aliasing. **Decidir com medição** se roda **por voz** (mais fiel, mais CPU) ou no **bus** (mais barato).
  Critério: sem aliasing audível numa varredura de notas agudas fortes; CPU dentro do orçamento (R6).
- **R2.2 Tremolo e auto-pan.** Taxa, profundidade, forma; opção de estéreo (auto-pan, estilo Suitcase). LFO sincronizado
  de forma estável entre blocos. Critério: sem cliques ao ligar/desligar.
- **R2.3 Pré-amp e tom.** Saturação leve e filtros de graves/agudos. Critério: sem mudança de volume brusca ao ligar.
- **R2.4 Ruído de tecla.** Clique ao soltar a tecla e leve ruído de martelo, em nível baixo e controlável.
  **Sem samples novos copiados de fontes sem licença**; gerar o ruído por síntese simples.
- **R2.5 Variação por nota.** Pequenas diferenças de afinação e de volume por tecla, **determinísticas** (mesma nota,
  mesmo desvio), para o teste ser repetível.

### R3 — Presets e integração

- **R3.1 Presets internos:** "Clássico (MDA)" (tudo desligado), "Suitcase", "Stage", "Mellow", "Bark".
- **R3.2 Coleção:** fazer `buildCollectionConcert` / `gerar-colecao` preferirem `Preseter Tines` nos patches de
  teclas elétricas do `docs/PATCHES.md` (Set 2), com o MDA externo como alternativa.
- **R3.3 Documentação:** atualizar `docs/PATCHES.md`, `docs/LICENCAS.md` e Configurações → Sobre.
- **R3.4 Loja/Coleção:** mostrar "Incluído" (sem download) para o instrumento nativo.

### R4 — Calibração

`scripts/analisar-tine.py`: compara **espectro por parcial** e **envelope** da saída com uma gravação de referência.
Referências **somente** do próprio Rafael ou **CC0** confirmadas, registradas em `docs/referencias-audio.md`.
Critério: relatório com a diferença por parcial (em dB) para notas graves, médias e agudas, em 3 velocities.

### R5 — Samples melhores (opcional, depois)

Substituir ou somar à base de samples do MDA por gravações próprias ou CC0 com mais camadas de velocity, mantendo o
formato interno. **Sem material de licença não comercial.** O Rafael decide se e quando.

### R6 — Testes e entrega

- Carga, nota, **estado salvo/restaurado**, renderização offline.
- **CPU:** 16 notas simultâneas por 60 s sem falhas de áudio (xruns), com todas as melhorias ligadas.
- **Aliasing:** varredura de notas agudas com bark ligado, medindo energia acima da banda.
- **Cliques:** liga/desliga de cada melhoria durante uma nota sustentada.
- Teste em **Windows e Linux** (ASIO / JACK-PipeWire) pelo Rafael.

---

## 5. Como provar que o modo "Clássico" soa igual (obrigatório para fechar R1)

1. Compilar o **MDA ePiano original** na revisão fixada em `UPSTREAM.md` e gerar áudio com ele (VST ou LV2 em um host
   offline, escolhendo o que for viável, `a confirmar`).
2. Renderizar o **mesmo arquivo MIDI** no `Preseter Tines` com **os mesmos parâmetros**, taxa de amostragem e tamanho de bloco.
3. Subtrair os dois `.wav` e medir o pico da diferença.
4. **Aceite:** abaixo de **−90 dBFS** (idealmente bit a bit). Se for maior, listar a causa (ordem do processamento,
   arredondamento, tamanho de bloco, números aleatórios do MDA).
5. Casos mínimos: nota única fraca e forte; acorde de 6 notas; notas graves, médias e agudas; pedal de sustain;
   notas repetidas rápidas; mudança de parâmetro durante a nota.
6. Guardar em `docs/testes/tines-nulidade.md`.

Obs.: se o MDA usa **números aleatórios** (ex.: afinação aleatória), fixar a mesma semente nos dois lados ou desligar
essa opção no teste, e anotar.

---

## 6. Regras para o agente

1. **Um passo de cada vez.** Uma tarefa por commit; parar e mostrar o resultado ao final.
2. **Não inventar.** Sem link, hash, licença ou nome de parâmetro não confirmado. Usar `a confirmar` e perguntar.
3. **Não alterar o algoritmo do modo Clássico.** As melhorias ficam atrás de chaves e começam desligadas.
4. **Nada na thread de áudio:** sem alocação, mutex ou I/O.
5. **Se a licença bloquear (R0.1), parar e avisar.** Não contornar.
6. Sem samples comerciais nem de licença não comercial.
7. Manter o repositório compilando (TypeScript e motor) e atualizar a documentação junto com o código.
8. Não mexer em `asio/` nem em `.vscode/`.

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Licença dos dados dos samples não clara | Não poder embutir | Portão R0.1; samples próprios/CC0 (R5) |
| Poucos samples (~12) | Graves e agudos artificiais | Aceitar no início; R5 depois |
| Bark causar aliasing | Som sujo nas notas agudas | Oversampling e teste de varredura (R6) |
| Melhorias pesarem na CPU | Falha ao vivo | Medir por voz × bus; orçamento em R6 |
| Aleatoriedade do MDA quebrar o teste de nulidade | Teste instável | Fixar semente ou desligar a opção no teste |
| Uso da marca "Rhodes" | Problema legal | Nome próprio (§2.6) |

---

## 8. Futuro (não fazer agora)

**Modelo físico** de tine + tonebar + martelo + captador magnético + pré-amp, inspirado na arquitetura do
**OpenWurli** (GPL-3.0, Rust): https://github.com/hal0zer0/openwurli. Os modos de uma haste engastada têm razões de
frequência 1 : 6,27 : 17,55 …; o tonebar acopla e prolonga o sustain. Só se o MDA com melhorias não bastar.
Leitura de apoio (citada no README do `jstolberg/rhodes`, **não lida por mim**): Pfeile (2017) e Gabrielli (2020).

---

## 9. Estado da implementação (2026-11-15)

### R1 aplicado — MDA ePiano

O `Preseter Tines` agora usa o **DSP e os samples do MDA ePiano**.

- Base: porte JUCE MIT de `hollance/mda-plugins-juce` (`EPiano/Source`),
  commit `552702479a9eac534f3abbf6e878a5eab473e0cb` (2026-02-25).
- Código original: mda ePiano, Copyright (c) 2008 Paul Kellett (MIT ou
  GPL-2.0-or-later; escolhemos MIT).
- Samples: `mdaEPianoData.h` (15 keygroups, 3 níveis de velocity), parte da
  distribuição MIT do porte, com atribuição.
- DSP do Preseter: `engine/third_party/mda-epiano/MdaEPianoDsp.cpp` — sem VST2,
  sem APVTS e sem UI, chamado pelo `NativeProcessor`.
- Teste de nulidade contra o processador original do porte: RMS da diferença
  **−95,11 dBFS** (critério < −90). Ver `docs/testes/tines-nulidade.md`.

### Parâmetros e CC1

- 12 parâmetros do MDA + Gain/Volume: Envelope Decay, Envelope Release,
  Hardness, Treble Boost, Modulation, LFO Rate, Velocity Sensitivity,
  Stereo Width, Polyphony, Fine Tuning, Random Tuning, Overdrive.
- **CC1 (modulação)** controla a profundidade do tremolo/auto-pan, como no MDA,
  e o valor **persiste** entre blocos (o porte original esquecia o CC1 no bloco
  seguinte).
- **CC7** controla o volume; **CC64/66** controlam o sustain.
- Presets: **Suitcase** (auto-pan), **Stage** (sem modulação), **Mellow**,
  **Bark** (brilho + overdrive).

### Ainda pendente

- R2.1 bark/captador com oversampling (o MDA já tem overdrive simples).
- R2.3 pré-amp e filtros de tom adicionais.
- R2.4 ruído de tecla (key-off).
- R2.5 variação determinística por nota (o MDA já tem Random Tuning).
- R3.1 preset “Clássico (MDA)”: hoje o preset Stage é o mais próximo.
- R4 calibração por gravações de referência; R5 samples melhores; R6 testes de CPU/aliasing.

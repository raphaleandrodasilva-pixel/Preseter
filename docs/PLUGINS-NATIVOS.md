# Preseter — Instrumentos nativos: Órgão (base setBfree) e Piano elétrico (Rhodes / Wurlitzer)

> Documento para o OpenCode. Escrito em PT-BR. Execute **uma tarefa de cada vez**, na ordem,
> e pare ao final de cada uma para o Rafael conferir. Não invente links, hashes, nomes de
> arquivo nem comportamento: se algo não estiver confirmado no código ou na fonte citada,
> escreva `a confirmar` e pergunte.

---

## 1. Objetivo e decisões

| Decisão | Valor |
|---|---|
| O que é um "instrumento nativo" | Um instrumento **embutido no motor** (`PreseterEngine`, JUCE), igual ao `Preseter Test Synth`: aparece na lista de plugins sem instalar nada, funciona em Windows e Linux, sem depender de LV2/VST3 de terceiros |
| Instrumento 1 | **Órgão tonewheel** que soa **igual ao setBfree** (mesmo DSP, mesmo código) |
| Instrumento 2 | **Rhodes** (piano elétrico de tines) |
| Instrumento 3 | **Wurlitzer** (piano elétrico de palhetas) |
| Licença do Preseter | AGPL-3.0-or-later (JUCE AGPLv3). Todo código embutido precisa ser compatível (ver §3) |
| Motivo | O LV2 do setBfree está ligado no motor mas **nunca foi testado**, e no Windows é difícil de instalar. O órgão é a base de rock, gospel e worship |
| Fora do escopo agora | Interface gráfica bonita (v1 usa os parâmetros do motor), 3 manuais completos, MIDI learn de barras físicas |

### O que "soar igual" significa (honestidade técnica)

- **Órgão:** é **alcançável e verificável**. Se usarmos o mesmo código DSP do setBfree, a saída
  tem que ser praticamente idêntica (teste de nulidade, §6). Não é "parecido": é o mesmo
  algoritmo.
- **Rhodes e Wurlitzer:** **não existe garantia de soar igual ao instrumento real**. O alvo é
  medido contra gravações de referência (espectro e envelope), e a decisão final é de ouvido do
  Rafael. Prometer mais que isso seria mentira.

---

## 2. Base de código existente

Fontes pesquisadas (confirmar tudo no repositório antes de usar):

| Projeto | O que é | Licença (a confirmar nos arquivos) | Link |
|---|---|---|---|
| **setBfree** | Emulador de órgão Hammond + Leslie. Módulos separados: `b_synth` (geração dos tonewheels, drawbars, percussão), `b_chorato` (vibrato/chorus), `b_overdrive`, `b_whirl` (Leslie), `b_reverb`, `b_conv` (convolução do gabinete) | **GPL-2.0** segundo o GitHub; ver §3 | https://github.com/pantherb/setBfree |
| **OpenWurli** | Wurlitzer 200A por **modelagem física** (Rust, nih-plug, VST3/CLAP) | **GPL-3.0** (README) | https://github.com/hal0zer0/openwurli |
| MDA ePiano | Piano elétrico por samples, já usado na coleção | GPL (conferir) | — |

Resumo da arquitetura do OpenWurli (do README, usar como referência de projeto):
síntese modal da palheta (7 modos, razões de frequência e inarmonicidade por teoria de viga de
Euler-Bernoulli), captador eletrostático com não linearidade `1/(1-y)` (principal fonte do
"bark"), martelo (filtro gaussiano + ruído de impacto), pré-amplificador de 2 estágios resolvido
por MNA/DK com 2x oversampling, tremolo Twin-T com LDR, amplificador de potência e alto-falante
com não linearidades.

---

## 3. Licenças (portão obrigatório — tarefa N0.1)

Nada de código de terceiros entra no repositório antes desta verificação.

1. **setBfree:** o GitHub mostra `GPL-2.0`. O que importa é o **cabeçalho de cada arquivo `.c/.h`**
   que vamos copiar:
   - Se disser *"version 2 of the License, or (at your option) any later version"* →
     **compatível** com AGPL-3.0-or-later (pode combinar). Registrar em `docs/LICENCAS.md`.
   - Se disser apenas *"version 2"* (GPL-2.0-only) → **NÃO é compatível** com a AGPLv3 do
     Preseter. Nesse caso **parar** e avisar o Rafael. Alternativas, nesta ordem:
     (a) manter o setBfree como plugin LV2 **separado** (como já é hoje), sem copiar código;
     (b) pedir relicenciamento aos autores (Robin Gareus / Fredrik Kilander);
     (c) escrever DSP próprio (aí **não** soa igual — contradiz o objetivo; só com aprovação).
2. **OpenWurli:** GPL-3.0 é compatível com AGPL-3.0 (a GPLv3 permite combinar com a AGPLv3).
   Conferir também a licença das dependências que formos usar (`nih-plug`, `melange`); `a confirmar`.
3. Manter os avisos de copyright e os nomes dos autores nos arquivos copiados. Criar
   `engine/third_party/<projeto>/LICENSE` + `UPSTREAM.md` com **URL, tag/commit exato e data**.
4. Atribuição no app (Configurações → Sobre) e em `docs/LICENCAS.md`.
5. **Nomes e imagens:** não usar as marcas "Hammond", "Leslie", "Rhodes" e "Wurlitzer" como
   nome do produto sem cuidado. Nomes sugeridos no app: **Preseter Organ**, **Preseter Tines**
   (Rhodes) e **Preseter Reeds** (Wurlitzer). Pode dizer "inspirado em" na descrição.
6. **Não** usar samples comerciais (Nord, Native Instruments etc.) como referência embutida.

---

## 4. Tarefas

### N0 — Investigação (sem escrever código de produto)

**N0.1 Licenças.** Fazer a verificação do §3 e escrever o resultado em `docs/LICENCAS.md`.
Critério: lista de arquivos do setBfree que pretendemos usar, com o cabeçalho de licença de cada um.

**N0.2 Como o motor registra o `Preseter Test Synth`.** Ler o código e responder (em
`docs/PLUGINS-NATIVOS.md`, seção "Achados"):
onde o plugin é definido, como entra no `scan`, como é carregado (`load`), como o `getState`/`setState`
o salva, como o app mostra os parâmetros (tecla V abre o quê para plugin embutido?), como o
`gerar-colecao` e `buildCollectionConcert` casam o plugin por nome.
Critério: tabela "arquivo → responsabilidade" e a lista exata de pontos a mexer.

**N0.3 Pasta de teste.** Criar `engine/tests/native/` e um script `scripts/render-offline.js`
que manda notas MIDI para um plugin do motor e grava um `.wav` (sem placa de som). Se o motor
já tiver algo parecido (`engine-smoke.js`), reaproveitar.
Critério: renderiza o `Preseter Test Synth` para `.wav` e o arquivo toca.

### N1 — Base para instrumentos embutidos

**N1.1** Criar uma interface/fábrica única `NativeInstrument` (uma classe base JUCE
`AudioProcessor`) para registrar vários instrumentos embutidos, com id estável
(`preseter.organ`, `preseter.tines`, `preseter.reeds`), nome, fabricante `Preseter`,
`isInstrument = true`, saída estéreo.
**N1.2** Parâmetros expostos pelo `AudioProcessorValueTreeState`, com nome, faixa, valor padrão e
unidade. O estado (`getState`/`setState`) precisa **salvar e restaurar** todos os parâmetros no `.preseter`.
**N1.3** Reutilizar o mesmo caminho do `Preseter Test Synth` no `scan`/`load`.
Critério: o instrumento aparece no scan, carrega, toca uma nota e o estado volta igual após salvar e reabrir.

### N2 — Órgão (base setBfree)

Só começar se N0.1 liberou o uso do código.

**N2.1 Importar o DSP.** Copiar para `engine/third_party/setbfree/` **apenas** os módulos de DSP
necessários (`b_synth`, `b_chorato`, `b_overdrive`, `b_whirl`, `b_reverb`, e `b_conv` se o gabinete
for usado), **sem** a UI (`robtk`, `pugl`), JACK nem LV2. Fixar tag/commit em `UPSTREAM.md`.
Os fontes são C; compilar como C no CMake do motor e chamar de C++ via `extern "C"`.
Critério: compila no Windows e no Linux, sem mudar o algoritmo.

**N2.2 Adaptador JUCE.** Criar `PreseterOrgan : NativeInstrument` que:
- recebe MIDI (note on/off, pitch bend, CCs) e repassa ao `b_synth` do jeito que o setBfree faz;
- usa a taxa de amostragem e o tamanho de bloco do motor (o setBfree suporta várias taxas);
- liga a cadeia na **mesma ordem** do setBfree (gerador → vibrato/chorus → overdrive → Leslie → reverb);
- não aloca memória nem usa mutex na thread de áudio (conferir se o código importado respeita isso).
Critério: toca nota sem estalo e sem travar a thread de áudio.

**N2.3 Parâmetros (v1, um manual).** Expor o que o setBfree expõe (conferir os nomes na fonte):
- **Barras (drawbars):** 9 barras `16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1'`, valores 0–8;
- **Percussão:** liga/desliga, volume normal/suave, decaimento rápido/lento, 2º ou 3º harmônico;
- **Vibrato/chorus:** tipo `V1 V2 V3 C1 C2 C3` e liga/desliga;
- **Overdrive** (pré-amp): intensidade;
- **Leslie:** parado / lento / rápido (e freio, se existir);
- **Reverb:** mistura;
- **Key click** (clique de tecla), se existir.
Mapear os **mesmos CCs padrão do setBfree** para controle por teclado/controlador.
Critério: cada parâmetro muda o som de forma audível e o estado salva/restaura.

**N2.4 Presets.** Importar os presets/programas que acompanham o setBfree (mesma licença) e
oferecer uma lista (ex.: gospel, rock, igreja, jazz). Criar 4–6 patches da coleção usando o
`Preseter Organ`, substituindo os patches 11–14 do `docs/PATCHES.md`.

**N2.5 Manuais e pedais (v2, opcional, só depois do v1 aprovado).** O setBfree usa canais MIDI
para superior/inferior/pedal. No Preseter, o mesmo efeito vem de **vários layers** (um por região
de teclas). Avaliar se vale suportar canais dentro de uma instância ou usar duas instâncias.

### N3 — Rhodes (`Preseter Tines`)

Não existe aqui uma base livre pronta de Rhodes que tenhamos conferido. Este é o instrumento
mais incerto; **começar por uma pesquisa curta (N3.1) antes de desenhar o DSP.**

**N3.1 Pesquisa.** Procurar projetos livres de Rhodes/piano elétrico de tines (código aberto,
licença compatível) e listar: licença, arquitetura, estado de manutenção. Se existir um bom,
avaliar usá-lo como base ou como plugin externo na Loja. Entregar uma tabela e a recomendação.
Se nada servir, seguir para N3.2.

**N3.2 Modelo físico (hipóteses a validar, não verdades).** Arquitetura proposta, inspirada no
projeto do Wurlitzer acima:
1. **Tine + tonebar:** síntese modal com razões de frequência de viga engastada
   (1 : 6,27 : 17,55 …) e decaimentos por modo; o *tonebar* acopla e alonga o sustain (o "sino").
2. **Martelo (felt):** pulso com tempo de contato dependente da velocity; mais forte = mais
   brilho/harmônicos.
3. **Captador eletromagnético:** não linearidade assimétrica; é ela que gera o "bark" em notas
   fortes. Parâmetro: distância/posição do captador.
4. **Tremolo / auto-pan** estéreo (estilo Suitcase) com taxa e profundidade.
5. **Tom e pré-amp:** filtros de graves/agudos e saturação leve.
6. **Variação por nota:** pequenas diferenças de afinação e amplitude por tecla.
Critério: toca em toda a extensão (MIDI 28–103) com polifonia de 32+ vozes e sem estouro de CPU.

**N3.3 Calibração.** Criar `scripts/analisar-tine.py` que compara **o espectro por parcial e o
envelope** de uma nota gerada com uma gravação de referência. Referências permitidas: gravações
do próprio Rafael ou conteúdo **CC0/domínio público** confirmado. Registrar a origem de cada
referência em `docs/referencias-audio.md`. Critério: relatório com erro por parcial em dB
para notas graves, médias e agudas, em 3 velocities.

**N3.4 Parâmetros e presets.** Expor: velocity sensitivity, brilho do martelo, posição do captador
(bark), tremolo (taxa/profundidade/liga), tom, volume. Criar presets "Suitcase", "Stage", "Mellow",
"Bark".

### N4 — Wurlitzer (`Preseter Reeds`)

**N4.1 Decidir a rota (pedir aprovação do Rafael antes de implementar):**
- **Rota A (rápida, recomendada para começar):** adicionar o **OpenWurli (GPL-3.0, VST3)** à
  **Loja** (`docs/LOJA.md`) como plugin externo, com os binários do release oficial.
  Falta confirmar na página de releases quais sistemas têm binário. Zero código DSP novo.
- **Rota B (nativa):** portar o DSP do OpenWurli de Rust para C++ dentro do motor. É trabalho
  grande: o pré-amp e o tremolo são resolvidos por solvers **gerados** pela ferramenta
  `melange` a partir de netlist SPICE; seria preciso gerar C++ equivalente ou reimplementar
  o solver. Fazer **só** se a Rota A for insuficiente.
**N4.2 (Rota B apenas)** Portar por blocos, na ordem: palheta (modal) → martelo → captador →
pré-amp → tremolo → potência/alto-falante, validando cada bloco com `scripts/analisar-tine.py`
contra a saída do OpenWurli original (mesma nota, mesma velocity). Critério: erro espectral
abaixo de um limite combinado com o Rafael (propor, ex.: ≤ 1 dB por parcial até a 7ª).

### N5 — Integração e coleção

**N5.1** Fazer o `gerar-colecao` / `buildCollectionConcert` preferir `Preseter Organ` (e os
outros) quando existirem, com o setBfree LV2 como alternativa.
**N5.2** Atualizar `docs/PATCHES.md`, `docs/LICENCAS.md` e a aba **Sobre** (atribuições).
**N5.3** Aba Coleção/Loja: mostrar que os instrumentos nativos já vêm no app (status
"Incluído"), sem download.

### N6 — Testes e entrega

**N6.1** Testes automáticos de carga, nota, estado e renderização offline para cada instrumento.
**N6.2** Teste de CPU: 16 notas simultâneas por 60 s sem xruns, com Leslie rápido ligado.
**N6.3** Teste em Windows e Linux (ASIO / JACK-PipeWire) pelo Rafael.

---

## 5. Parâmetros mínimos por instrumento (referência rápida)

| Instrumento | Parâmetros v1 |
|---|---|
| Preseter Organ | 9 drawbars, percussão (4 chaves), vibrato/chorus (tipo + liga), overdrive, Leslie (parado/lento/rápido), reverb, volume |
| Preseter Tines | velocity, brilho do martelo, posição do captador, tremolo (taxa/profundidade), tom, volume |
| Preseter Reeds | velocity, bark, tremolo (taxa/profundidade), tom, volume (ou o plugin OpenWurli externo) |

---

## 6. Como provar que o órgão "soa igual" (obrigatório para fechar N2)

Teste de nulidade, automático e repetível:

1. Compilar o **setBfree original** na mesma tag fixada em `UPSTREAM.md` e gerar áudio com ele
   (plugin LV2 em um host offline ou o aplicativo com saída para arquivo — escolher o que o
   projeto suportar, `a confirmar`).
2. Renderizar **o mesmo arquivo MIDI** no `Preseter Organ` com **os mesmos parâmetros**,
   mesma taxa de amostragem e mesmo tamanho de bloco.
3. Subtrair os dois `.wav` e medir o pico da diferença.
4. **Critério de aceite:** diferença abaixo de **−90 dBFS** (idealmente bit a bit). Se houver
   diferença maior, listar a causa (ordem da cadeia, arredondamento, bloco).
5. Rodar com pelo menos 5 casos: barras `888000000`, `008800000`, só percussão, Leslie lento
   e Leslie rápido, overdrive alto.
6. Guardar os resultados em `docs/testes/orgao-nulidade.md`.

Para Rhodes e Wurlitzer **não há teste de nulidade**: o critério é o relatório de
`scripts/analisar-tine.py` mais a aprovação por audição do Rafael.

---

## 7. Regras para o agente

1. **Um passo de cada vez.** Uma tarefa por commit; pare ao final e mostre o resultado.
2. **Não invente.** Sem link, hash, número de licença ou comportamento sem confirmar na fonte.
   Use `a confirmar` e pergunte.
3. **Não mude o algoritmo do setBfree** para "melhorar". O objetivo é soar igual.
4. **Nada de áudio real na thread de áudio:** sem alocação, sem mutex, sem I/O.
5. **Sem samples comerciais.** Referências de áudio só próprias ou CC0 confirmadas.
6. Se a licença bloquear (N0.1), **pare** e avise; não contorne copiando mesmo assim.
7. Atualize a documentação junto com o código; mantenha o repositório compilando (TypeScript e motor).
8. Não mexa em `asio/` nem em `.vscode/`.

---

## 8. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| setBfree ser GPL-2.0-only | Não pode ser embutido na AGPLv3 | Portão N0.1; alternativas no §3 |
| DSP em C com estado global ou alocação no áudio | Estalos e travadas ao vivo | Revisar na N2.2; isolar estado por instância |
| Rhodes não ficar fiel | Decepção com o som | Pesquisa N3.1 antes; calibração N3.3; aprovação por audição |
| Port do Wurlitzer em C++ ser grande | Atraso | Rota A (plugin na Loja) primeiro |
| Várias instâncias do órgão pesarem na CPU | Falha ao vivo | Teste N6.2; limitar Leslie/convolução |
| Uso de marcas registradas | Problema legal | Nomes próprios (§3.5) |

---

## 9. Fontes

- setBfree: https://github.com/pantherb/setBfree (licença GPL-2.0 e módulos `b_synth`, `b_whirl`, `b_overdrive`, `b_reverb`, `b_conv`, `b_chorato`)
- Página do setBfree no wiki Linux Audio: https://wiki.linuxaudio.org/apps/all/setbfree (autores Robin Gareus e Fredrik Kilander)
- OpenWurli: https://github.com/hal0zer0/openwurli (GPL-3.0, Rust, nih-plug, VST3/CLAP)

---

## 10. Estado da implementação (2026-11-15)

O órgão **não é mais uma aproximação aditiva**. O `preseter.organ` agora roda o
DSP original do setBfree.

| Item | Estado |
|---|---|
| Commit do setBfree | `2f41983b5b535bda9b1b1db38a06da29d50ff557` |
| Código importado | `engine/third_party/setbfree/` (GPL-2.0-or-later; ver `UPSTREAM.md` e `COPYING`) |
| Wrapper | `engine/src/native/SetBfreeOrganProcessor.cpp` |
| Ordem da cadeia | `oscGenerateFragment` → `preamp` → `reverb` → `whirlProc3` (igual ao `b_synth/lv2.c`) |
| Buffers internos | 128 amostras (`BUFFER_SIZE_SAMPLES`) |
| Eventos MIDI | mesma lógica de `run()` do LV2 (síntese até o timestamp, aplica o evento, continua) |
| Teste de nulidade | `engine/test/setbfree-nullity/` — resultado bit a bit, ver `docs/testes/orgao-nulidade.md` |
| Ganho de saída | tabela calibrada por valor de overdrive **depois** da cadeia (o setBfree varia muito de nível com o `character`), com rampa e limite ±1.0 |

### Mapeamento dos controles da janela

| Controle do Preseter | Chamada no setBfree |
|---|---|
| 9 drawbars | `setDrawBars(&inst, 0, setting[9])` (manual superior) |
| Percussão liga/desliga | `percussion.enable` |
| Volume da percussão (suave/normal) | `percussion.volume` |
| Decaimento (lenta/rápida) | `percussion.decay` |
| Harmônico (2º/3º) | `percussion.harmonic` |
| Vibrato/Chorus (V1–V3, C1–C3, desligado) | `vibrato.knob` + `vibrato.routing` |
| Leslie (parado/lento/rápido/freio) | `rotary.speed-preset` |
| CC1 / modulação (MIDI) | `rotary.speed-preset` (0–42 lento, 43–85 parado, 86–127 rápido) |
| Overdrive | `overdrive.character` + `overdrive.enable` |
| Reverb | `reverb.mix` |
| Key click | `setEnvAttackClickLevel` / `setEnvReleaseClickLevel` |
| Volume | `swellpedal1` |

### Limitações conhecidas

- Só o **manual superior** é exposto (as notas recebidas são normalizadas para o
  canal 0). O setBfree mapeia MIDI 36–96 nesse manual; notas fora dessa faixa
  ficam mudas, como no setBfree.
- O controle “Profundidade do chorus” (`organ_chorus`) existe no estado por
  compatibilidade, mas o setBfree tem profundidades fixas por modelo (V1–V3,
  C1–C3), então ele não é usado.
- “Freio” usa a mesma parada do setBfree (`rotary.speed-preset`).
- O ganho de saída é normalizado por overdrive (ver `docs/testes/orgao-nulidade.md`).
  O timbre é o do setBfree; só o nível é compensado para o knob não pular
  ~20 dB entre “clean” e overdrive.

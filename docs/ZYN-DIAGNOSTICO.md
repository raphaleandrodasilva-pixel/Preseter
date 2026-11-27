# Diagnóstico do Zyn (Z0)

> Documento do **Z0** de `ZYN-COMPLETAR.md`. Medição feita sem corrigir o código.
> Tudo aqui foi medido no engine real; o que não foi medido está marcado **a confirmar**.
> Este Z0 não altera o comportamento do Zyn: só adiciona o comando oculto `zynDiag` e os
> contadores do alocador.

## 1. Ambiente e método

| Item | Valor |
|---|---|
| Máquina | Windows 10, computador do Rafael |
| Engine | `PreseterEngine.exe` Release, `v0.1.0` |
| Commit base | `a2a37a7` + o trabalho de T0/T1–T3 que já estava no working tree |
| Áudio | ASIO4ALL v2, 48 kHz, buffer 256 |
| Bancos | `vendor/zyn/banks` (1318 `.xiz`) |
| Ubuntu/JACK | **não testado** — não há máquina disponível |

Reprodução:

```powershell
cmake --build engine/build --config Release --target PreseterEngine
node scripts/zyn-diag.js --json="$env:TEMP\zyn-diag-result.json"
```

O script usa o comando novo:

```json
{"cmd":"zynDiag","action":"programs","layerId":"zyn-diag"}
{"cmd":"zynDiag","action":"stats","layerId":"zyn-diag"}
{"cmd":"zynDiag","action":"loadPath","layerId":"zyn-diag","path":"..."}
```

`loadPath` carrega um `.xiz` por caminho e devolve o perfil por etapa, **sem** trocar o
programa do banco. `stats` devolve o último perfil e os contadores do alocador. Nada disso
loga ou aloca dentro do callback de áudio; o callback só liga uma flag atômica por bloco.

## 2. Inventário: o problema 1 é o gzip, não o painel

| Medida | Resultado |
|---|---|
| Presets | 1318 |
| Subpastas de banco | 32 (contando a raiz, 33 — o documento dizia 33 pastas) |
| Presets **gzip** | 1158 |
| Presets em **XML puro** | 160 (todos em `Cris Owl Alvarez`) |
| Presets com `PADsynth_used=yes` | **343** (o documento dizia 322) |
| Bancos com pelo menos um preset carregável hoje | **1** (`Cris Owl Alvarez`) |

### 2.1 Reprodução do “escolho o banco e a lista não muda”

O script pediu o **primeiro programa de 10 bancos** e registrou o programa antes/depois,
o `loadXmlResult` e o tempo:

| Banco pedido | Programa pedido | Programa depois | `loadXmlResult` | Carregou? | Ida e volta (ms) | Carga no engine (ms) |
|---|---:|---:|---:|---|---:|---:|
| Fábrica/Arpeggios | 0 | 0 | -1 | não | 15 | 1,1 |
| Fábrica/Bass | 24 | 0 | -1 | não | 15 | 1,7 |
| Fábrica/Brass | 33 | 0 | -1 | não | 14 | 1,4 |
| Fábrica/Choir and Voice | 51 | 0 | -1 | não | 14 | 1,0 |
| Fábrica/Collection | 74 | 0 | -1 | não | 14 | 1,0 |
| Fábrica/Companion | 202 | 0 | -1 | não | 15 | 1,0 |
| Fábrica/Cormi_Noise | 245 | 0 | -1 | não | 13 | 1,0 |
| Fábrica/Cormi_Sound | 282 | 0 | -1 | não | 13 | 1,1 |
| Fábrica/Cris Owl Alvarez | 412 | 412 | 0 | **sim** | 22 | 9,3 |
| Fábrica/Drums | 572 | 412 | -1 | não | 14 | 0,8 |

O banco `Arpeggios` também falha, mas o programa pedido era o 0 — que já era o atual. Por
isso ele “parece” ok na primeira linha; o caso controlado abaixo deixa claro.

Caso controlado, com um preset de cada tipo:

| Preset | Codificação | `loadXmlResult` | `ok` | Programa antes → depois | Ida e volta | Carga no engine |
|---|---|---:|---|---|---:|---:|
| `Cris Owl Alvarez · 0001-hard fat lead` (412) | XML puro | 0 | true | 412 → 412 | 27 ms | 13,7 ms |
| `Arpeggios · 0001-Arpeggio1` (0) | gzip | **-1** | **false** | 412 → 412 | 13 ms | 0,8 ms |

### 2.2 Causa confirmada

`engine/src/native/ZynFactory.cpp` chama `Part::loadXMLinstrument`; o retorno é **-1**, que
`Part::loadXMLinstrument` devolve quando `XMLwrapper::loadXMLfile` falha
(`engine/third_party/zyn/src/Misc/Part.cpp:1304`). Em `XMLwrapper.cpp:414`:

```cpp
juce::GZIPDecompressorInputStream decompressor (raw.get(), false);
```

O construtor de dois argumentos do JUCE usa **`zlibFormat`** por padrão
(`juce_GZIPDecompressorInputStream.h:72-75`), mas os `.xiz` são **gzip** (magic `1f 8b`).
O `inflate` não reconhece o header, o XML chega vazio, `mxmlLoadString` devolve nulo e
`loadXMLfile` retorna -2 → `loadXMLinstrument` retorna -1 → `loadPreset` retorna `false`.
`ZynProcessor::setCurrentProgram` então **mantém o programa antigo**, sem erro visível.

O conserto é uma linha (Z1), passando `juce::GZIPDecompressorInputStream::gzipFormat`, e
uma nota no `engine/third_party/zyn/UPSTREAM.md`:

```cpp
juce::GZIPDecompressorInputStream decompressor (
    raw.get(), false, juce::GZIPDecompressorInputStream::gzipFormat);
```

### 2.3 Causa secundária: o painel deriva o banco do programa

Mesmo com o gzip corrigido, `ZynPanel.tsx:72` calcula:

```ts
const bankIndex = Math.max(0, banks.findIndex((bank) =>
  bank.entries.some((entry) => entry.index === program)
));
```

e `chooseBank` (linha 78) só chama `onProgram(primeiro do banco)`. O banco escolhido não é
estado da tela: ele só muda quando a prop `program` muda. Se o load falha (hoje, em 31 dos
32 bancos), a lista **nunca** muda. O teste `ZynPanel.diag.test.tsx` documenta isso com os
1318 nomes reais: escolher o banco 5 chama `onProgram`, mas o seletor continua no banco 0
até a prop `program` mudar.

## 3. Tempo de carga de 20 presets

> **Esta tabela é a linha de base do Z0, antes do conserto do gzip.** Os números depois do
> Z1/Z2 estão na seção 9. Aqui, “hoje” = caminho quebrado; “real” = cópia XML pura em
> `%TEMP%`, sem a descompressão gzip (0,06–1,39 ms; mediana 0,19 ms).

Seleção determinística: 10 comuns (não PAD, espalhados por tamanho), 5 PADsynth e os 5
maiores. A coluna **“hoje”** é o caminho real; a coluna **“real”** carrega uma cópia do XML
descompactada em `%TEMP%`, que mede o custo depois do conserto do gzip, **sem** o tempo de
descompressão (medido à parte: 0,06–1,39 ms; mediana 0,19 ms — desprezível).

Tempos em ms, mediana de 3 execuções (2 para XML > 100 KB). `apply` é o `applyparameters`
do PADsynth.

| Grupo | Índice | Preset | Cod. | PAD | XML KB | Hoje | Real: create | read | apply | init | install | destroi antigo | total |
|---|---:|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| comum | 1243 | `the_mysterious_bank_2 · 0027-hithat` | gzip | não | 7 | falha (0,9) | 0,4 | 2,2 | 0 | 0,1 | 0 | 0,3 | **3,2** |
| comum | 1222 | `the_mysterious_bank_2 · 0001-analog strings` | gzip | não | 11 | falha (1,0) | 0,7 | 3,0 | 0 | 0,3 | 0 | 0,1 | **4,7** |
| comum | 121 | `Collection · 0048-Variable Reed` | gzip | não | 13 | falha (1,0) | 0,4 | 2,6 | 0 | 0 | 0 | 0,3 | **3,4** |
| comum | 1040 | `Pads · 0005-Square Pad 1` | gzip | não | 15 | falha (1,1) | 0,7 | 3,1 | 0 | 0 | 0 | 0,1 | **4,0** |
| comum | 1277 | `the_mysterious_bank_3 · 0029-new_arpeggio_3` | gzip | não | 17 | falha (0,8) | 1,0 | 7,0 | 0 | 1,0 | 0 | 0,4 | **9,7** |
| comum | 912 | `olivers-100 · 0079-Subtle Supersaw Strings` | gzip | não | 18 | falha (1,0) | 0,8 | 5,1 | 0 | 0,1 | 0 | 0,3 | **6,4** |
| comum | 36 | `Brass · 0005-Synth Brass 3` | gzip | não | 21 | falha (0,9) | 0,6 | 4,5 | 0 | 0 | 0 | 0,2 | **5,2** |
| comum | 422 | `Cris Owl Alvarez · 0011-synth brass` | XML | não | 25 | ok (5,9) | 0,5 | 4,9 | 0 | 0,3 | 0 | 0,3 | **6,0** |
| comum | 82 | `Collection · 0009-Trem Lead` | gzip | não | 31 | falha (1,0) | 0,7 | 7,3 | 0 | 1,2 | 0 | 0,4 | **9,3** |
| comum | 412 | `Cris Owl Alvarez · 0001-hard fat lead` | XML | não | 41 | ok (9,4) | 0,7 | 9,2 | 0 | 0 | 0 | 0,1 | **10,0** |
| PADsynth | 833 | `Noises · 0065-Short noise` | gzip | sim | 9 | falha (0,7) | 0,4 | 2,0 | 79,5 | 0 | 0 | 0,6 | **83,5** |
| PADsynth | 711 | `net-wisdom · 0017-Own Metal Sound after 2` | gzip | sim | 10 | falha (1,5) | 0,9 | 3,7 | 76,4 | 0 | 0 | 0,6 | **80,5** |
| PADsynth | 1079 | `Reed and Wind · 0068-Chorused Flute` | gzip | sim | 17 | falha (0,7) | 0,4 | 3,8 | 162,4 | 0 | 0 | 1,0 | **168,8** |
| PADsynth | 604 | `Fantasy · 0065-Long SpaceChoir1` | gzip | sim | 25 | falha (0,8) | 0,7 | 6,5 | 160,9 | 0,3 | 0 | 1,3 | **169,3** |
| PADsynth | 396 | `Cormi_Sound · 0142-Solitudine` | gzip | sim | 44 | falha (0,7) | 0,4 | 11,0 | 144,1 | 1,1 | 0 | 1,3 | **158,7** |
| maior | 865 | `olivers-100 · 0032-Drum Kit` | gzip | sim | 374 | falha (1,2) | 1,2 | 134,6 | **1910,8** | 0,6 | 0 | 7,3 | **2054,5** |
| maior | 224 | `Companion · 0056-Wide Bass` | gzip | não | 368 | falha (1,3) | 0,9 | **217,2** | 0 | 0,5 | 0 | 9,5 | **228,0** |
| maior | 243 | `Companion · 0121-Ghost Ensemble` | gzip | sim | 239 | falha (1,3) | 0,8 | 101,3 | 744,9 | 0,5 | 0 | 1,2 | **848,8** |
| maior | 242 | `Companion · 0119-Ghost Choir` | gzip | não | 207 | falha (0,6) | 0,4 | 40,3 | 0 | 0,5 | 0 | 1,1 | **42,2** |
| maior | 235 | `Companion · 0108-Angel Harp` | gzip | não | 206 | falha (0,6) | 0,6 | 42,4 | 0 | 1,1 | 0 | 0,3 | **44,4** |

Leitura:

- **Hoje**, 18 dos 20 falham em ~1 ms porque o gzip nem chega a ser lido.
- Depois do conserto do gzip, presets comuns ficam em **3–10 ms**; PADsynth típico em
  **80–170 ms**; o maior (`Drum Kit`, 374 KB de XML) em **2,05 s**, quase tudo em
  `applyparameters` (1,91 s do PADsynth).
- Os maiores **sem** PAD (`Wide Bass` 368 KB) gastam ~228 ms, quase tudo na leitura do XML
  (217 ms); `install`/destruição do antigo ficam abaixo de 10 ms.
- O gargalo do PADsynth é a geração de tabelas, não a troca de ponteiro. A Z2 deve
  pré-aquecer fora da thread de áudio e mostrar “Carregando…” para esses presets.

## 4. Xruns e duração da falha de áudio

ASIO4ALL, 48 kHz, 256 amostras (bloco de **5,33 ms**). O engine tocou uma nota, gravou WAV,
trocou o preset e analisou o WAV com `silencedetect` (−50 dB, 20 ms).

| Caso | Troca | Xruns | Gap no WAV | Leitura |
|---|---:|---:|---:|---|
| Ataque do preset rápido, sem troca (referência) | — | 0 | **12 ms** (após 150 ms de pré-roll) | O próprio preset demora 12 ms para cruzar −50 dB. |
| Troca para preset rápido (`hard fat lead`) com re-ataque | 25 ms | 0 | **nenhum** | A troca em si não gera dropout audível. |
| Troca para PAD pesado (`FX dark ambient 2`, 2,09 s) com re-ataque | 2086 ms | 0 | **107 ms** | O gap é o ataque do PAD; o som antigo continua durante a carga. |
| Tentativa de troca para preset gzip (falha) | 15 ms | 0 | **nenhum** | O programa não muda e o som antigo continua; a falha é silenciosa no áudio. |
| Preset rápido **sem re-ataque** | 39 ms | 0 | **1440 ms** (até o noteOff) | A nota segurada é cortada na instalação e o preset novo não recebe a nota. |

Conclusão: **não houve xrun nem dropout de vários segundos** nesta máquina/ASIO 256. O que
o usuário percebe como “falha e depois normaliza” é, neste teste, a **nota segurada perdida**
na troca de instância (1,44 s de silêncio até soltar a tecla) e, nos PADs, o ataque lento.
A falha de gzip, por outro lado, **não** mexe no áudio: ela só impede a lista de mudar.

O `xruns` do `devices` ficou em 0 antes e depois de todos os casos. O `AudioTimingMeter`
considera xrun quando o intervalo entre callbacks passa de 1,75× o bloco esperado; um
atraso menor que isso não aparece nesse número.

## 5. Alocação no caminho de áudio

### 5.1 Leitura do código

| Arquivo:linha | O que faz | Roda em |
|---|---|---|
| `Part.cpp:597` | `memory.alloc<PortamentoRealtime>` no NoteOn | thread de áudio |
| `Part.cpp:673` | `memory.alloc<ADnote>` | thread de áudio |
| `Part.cpp:678` | `memory.alloc<SUBnote>` | thread de áudio |
| `Part.cpp:682` | `memory.alloc<PADnote>` | thread de áudio |
| `Part.cpp:686` | `std::cerr << "dropped new note..."` quando a alocação falha | thread de áudio |
| `Part.cpp:975` | `fprintf(stderr, ...)` em nota descartada | thread de áudio |
| `OscilGen.cpp:1010` | `new fft_t[...]` em `adaptiveharmonic` | NoteOn (quando adaptive harmonics está ligado) |
| `OscilGen.cpp:1056` | `new fft_t[size]` em `adaptiveharmonicpostprocess` | NoteOn (idem) |
| `Part.cpp:1040` | `ComputePartSmps` | thread de áudio |
| `Util.h:29` | `STACKALLOC` é `_alloca` no MSVC | pilha, sem malloc |
| `MultiPseudoStack.cpp:110` | 32 × 2 KB alocados no construtor do `MultiQueue` | inicialização, não por bloco |

`ComputePartSmps` não chama `new`/`malloc` diretamente; ele usa `STACKALLOC`/`_alloca` e o
`notePool` já reservado. O problema está no **NoteOn**.

### 5.2 Medição

Depois de carregar `hard fat lead`, zerei os contadores e toquei 20 notas (NoteOn + NoteOff):

| Contador | Valor |
|---|---:|
| Alocações totais | 1600 |
| Bytes alocados | 777.960 (~760 KB) |
| Alocações **dentro do bloco de áudio** | **1600** |
| Liberações totais | 0 |
| Liberações dentro do bloco | 0 |
| Vozes ativas no fim | 40 |

Ou seja: **cada NoteOn aloca ~80 blocos e ~39 KB**, e todas as 1600 alocações aconteceram
com a flag de áudio ligada. O `MallocAllocator` usa `std::malloc`/`std::free`; não há pool
pré-reservado. A Z2 precisa de um alocador de arena/pool; 20 notas já pedem ~760 KB, então
um pool para 32–64 vozes + efeitos deve ser dimensionado com folga (alguns MB).

**a confirmar:** se os presets testados exercitam as `new` do `OscilGen` (adaptive
harmonics). O alocador do `Part` não cobre essas `new`; a leitura de código mostra o risco,
mas não foi instrumentado o `operator new` global.

## 6. Tamanho do JSON e custo na interface

| Medida | Valor |
|---|---:|
| Tamanho da resposta de `setProgram` | **58.711 bytes** |
| Nomes de programa na resposta | 1318 |
| `JSON.stringify` da resposta (média de 50) | 0,23 ms |
| `JSON.parse` da resposta (média de 50) | 0,20 ms |
| `splitBanks` com 1318 nomes (mediana de 50) | 0,42 ms |
| `splitBanks` pior caso | 1,82 ms |
| `ZynPanel` no jsdom: montagem com 1318 nomes | 184,4 ms (inclui o primeiro render) |
| `ZynPanel` no jsdom: troca de banco/render com a lista nova | 23,8 ms |

O custo dominante não é o parse: é a resposta carregar 1318 nomes e o renderer substituir o
array inteiro a cada `plugin-loaded`. O `VstManager.setProgram` ainda chama `params` e emite
o objeto completo; no Z1 a troca deve devolver só o programa atual e o renderer deve
preservar a lista. O número de 23,8 ms é **jsdom**, não a pintura real do app — **a
confirmar** com o app aberto.

## 7. O que ficou a confirmar

- Ubuntu/JACK: não há máquina; repetir o script lá.
- Pintura real do `ZynPanel` no app (o jsdom dá 23,8 ms de atualização, mas não é a GPU).
- Se os presets testados usam adaptive harmonics a ponto de exercitar as `new` do
  `OscilGen`; o alocador do `Part` foi medido, o `operator new` global não.
- Percepção do Rafael no app: o Z0 mostra 0 xruns e gap de 12 ms no preset rápido; o que
  ele ouve como “falha” pode ser a nota perdida (1,44 s) e/ou o ataque do PAD.

## 8. O que isso muda no Z1 e no Z2

**Z1 (obrigatório antes de qualquer coisa):**

1. Corrigir o gzip no `XMLwrapper.cpp` e registrar no `UPSTREAM.md`.
2. Fazer `setCurrentProgram`/`setPluginProgram` **reportar** a falha em vez de manter o
   programa antigo em silêncio.
3. Banco como estado da tela (só filtra), fila de 1 com “Carregando…”, busca e contagem.
4. Devolver só o programa na troca; não reenviar os 1318 nomes.
5. Teste com os 1318 nomes reais (o `ZynPanel.diag.test.tsx` atual vira o teste do
   comportamento novo).

**Z2 (depois do Z1):**

1. Pool/arena no `MallocAllocator` para eliminar as 1600 alocações no NoteOn; dimensionar
   pelo menos 32–64 vozes (20 notas = ~760 KB).
2. Remover as `new` do `OscilGen` (buffers pré-alocados) **se** a medição mostrar que os
   presets usam adaptive harmonics.
3. Levar a nota segurada para a instância nova ou re-articulá-la no install; hoje ela é
   cortada (1,44 s de silêncio até soltar a tecla).
4. Fade curto na troca (o gap do preset rápido já é 0; o fade serve para o caso de o novo
   preset começar com um ataque abrupto).
5. Pré-aquecer PADsynth e mostrar “Carregando…” para os presets de ~2 s.

---

### Reprodutibilidade

- `scripts/zyn-diag.js` — inventário, bancos, 20 tempos, áudio, alocação e JSON.
- `src/renderer/components/concert/ZynPanel.diag.test.tsx` — os 1318 nomes reais e o
  comportamento atual do banco.
- `engine/src/native/ZynFactory.cpp` — `zynDiag`/contadores (comando oculto).
- `docs/TROCA-PATCH-DIAGNOSTICO.md` — o T0 da troca de patch é outro documento; este não
  repete as medições dele.

---

## 9. Z1/Z2 — depois das correções

As seções 1–8 são a linha de base do Z0. Depois delas, o Z1 corrigiu o gzip e o banco/lista,
e o Z2 atacou a troca no áudio. Números medidos no mesmo ASIO4ALL 48 kHz/256:

### 9.1 Z1: todos os bancos carregam

| Antes (Z0) | Depois (Z1/Z2) |
|---|---|
| 160/1318 presets carregavam | **1318/1318** carregam |
| 1 de 32 bancos utilizável | **32/32** |
| Resposta de `setProgram`: 58.711 bytes | **56 bytes** |
| `plugin-loaded` levava os 1318 nomes a cada troca | evento `plugin-program` só com `layerId` + `program` |

Os 10 primeiros bancos, pedindo o primeiro programa de cada um, agora retornam `xml=0` e o
programa correto; o mais lento da amostra foi `Companion` (176 ms) e o `Drums` (32 ms).

O painel virou estado da tela: escolher um banco só filtra a lista; a lista não volta quando
o `plugin` é atualizado. A busca, a contagem e o “Carregando…” estão no `ZynPanel`; a fila
de 1 garante que a última escolha vence.

### 9.2 Z2: troca no áudio

Implementado:

1. **Worker de baixa prioridade** (`juce::Thread::Priority::low`) carrega o preset; a
   message thread espera o resultado para manter o erro síncrono do Z1. O áudio nunca é
   bloqueado pela carga.
2. **Prewarm** de 8 blocos silenciosos depois de `applyparameters`/`initialize_rt`.
3. **Pool TLSF de 8 MB** por instrumento: o `NoteOn` não chama mais `malloc`/`free`.
4. **Fade de 8 ms**: o worker pede ao áudio para descer a zero, troca o ponteiro e o preset
   novo sobe.
5. **Notas seguradas** são re-articuladas no preset novo antes da troca.
6. **Debounce** no painel (fila de 1) e o worker só processa o pedido atual.

#### Tempo (mediana, ms) — depois

| Grupo | Antes (Z0) | Depois (Z2) |
|---|---:|---:|
| 10 comuns | falha em ~1 ms; 3–10 ms no XML puro | **6,7–22,6 ms** |
| 5 PADsynth | falha em ~1 ms; 80–169 ms no XML puro | **55,7–179,0 ms** |
| Maior PAD (`Drum Kit`, 374 KB) | falha; 2.054 ms no XML puro | **1.884 ms** |
| Maior sem PAD (`Wide Bass`, 368 KB) | falha; 228 ms no XML puro | **82,6 ms** |
| PAD 239 KB (`Ghost Ensemble`) | falha; 849 ms no XML puro | **574,6 ms** |

O maior preset continua em ~1,9 s (PADsynth). Na troca de áudio, o preset pesado
(`FX dark ambient 2`) levou **3,47 s** no teste com o worker de baixa prioridade, contra
~2,1 s no Z0 na message thread. O som antigo continua soando durante todo esse tempo; o
painel mostra “Carregando…”.

#### Áudio (ASIO 48 kHz/256)

| Caso | Troca | Xruns | Gap no WAV |
|---|---:|---:|---:|
| Preset rápido (`hard fat lead`) | 31 ms | 0 | **nenhum** |
| PAD pesado (`FX dark ambient 2`) | 3.466 ms | 0 | **61,9 ms** (ataque/fade) |
| Gzip (`Arpeggio1`, agora carrega) | 19 ms | 0 | nenhum |
| Rápido **sem re-ataque** | 24 ms | 0 | **nenhum** (a nota segurada sobreviveu) |

O gap de 1,44 s do Z0 (nota perdida sem re-ataque) **desapareceu**. O fade de 8 ms não
aparece como gap no `silencedetect`; a confirmação de “sem estalo” ainda é de ouvido.

#### Alocação

| Contador | Z0 | Z2 |
|---|---:|---:|
| Alocações no bloco de áudio | 1600 | 1600 (todas no pool TLSF) |
| Alocações no heap no bloco de áudio | 1600 (malloc) | **0** |
| Falhas do pool | — | **0** |
| Arena por instrumento | — | 8 MB |
| Bytes para 20 notas | 777.960 | 777.960 |

As 1600 alocações continuam existindo, mas são fatias de uma arena já reservada; nenhuma
chama `malloc`. O `NoteOn` também deixou de usar as `new[]` do `OscilGen` (buffer
pré-alocado) e os avisos `std::cerr`/`fprintf` do `Part` no caminho de nota foram removidos.

### 9.3 O que ainda precisa do Rafael

- Abrir o app e confirmar de ouvido: 10 bancos seguidos mostram 10 listas; a troca não
  estala; o preset pesado de ~3,5 s mostra “Carregando…” e mantém o som antigo.
- Ubuntu/JACK: repetir o `scripts/zyn-diag.js`.
- Definir o limite aceitável para o preset pesado de baixa prioridade (hoje ~3,5 s).
- A seção 9 não substitui os números do Z0; ela mostra o depois.

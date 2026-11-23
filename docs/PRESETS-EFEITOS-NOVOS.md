# Preseter — Refazer os presets dos efeitos (usáveis ao vivo)

> Documento para o OpenCode, em PT-BR. **Uma tarefa de cada vez; parar ao final de cada uma** para o Rafael ouvir.
> Os **plugins estão bons**; o problema são os **valores dos presets** em `src/shared/effects/catalog.json`
> (e `guitarix.json`). Não mudar parâmetros, painéis nem a lista de efeitos; só os presets.
> Não inventar: significado de parâmetro enumerado (modos) e escala de normalização ficam `a confirmar` até a P0.
> **Não editar `catalog.json` à mão**: criar a fonte em valores reais e gerar (P1).
> `npm run typecheck` e `npx vitest run` passam em cada tarefa. Não mexer em `asio/` nem em `.vscode/`.

---

## 1. Diagnóstico (lido no repositório, HEAD `75fc39e`)

Valores reais dos presets atuais (normalizado convertido com `min + v·(max−min)`, que reproduz os defaults:
HP 300 Hz, LP 5000 Hz, decay 1,5 s):

1. **Seco = 0 dB em todos os presets de Reverb, Delay, Chorus, Phaser, Flanger.** Reverb e Delay moram nos
   **Aux 1 e 2** da coleção: o seco já sai pelo canal normal; um seco no Aux soma uma **segunda cópia** do
   sinal (mais nível, cor estranha, risco de comb). No Aux o Seco deve ser **-60 dB**.
2. **Modulação do Reverb audível:** default 0,5 Hz / prof. 0,35 (padrão calf); `plate` 0,7 Hz / **0,55**;
   `hall` 0,35 Hz / 0,45; `arena` prof. 0,5. Reverb de palco precisa de modulação **imperceptível**
   (≈0,1–0,3 Hz, profundidade ≤ 0,2). Era o "coral" na cauda que o Rafael ouviu.
3. **Reverb largo demais:** largura 1,25 (hall), 1,35 (plate), 1,5 (arena) com modo largura alto. Ao vivo/PA
   mono a imagem borra. Limite 1,1.
4. **Nível do molhado inconsistente:** Molhado -9 a -18 dB **e** send do patch em -14 a -16 dB por cima →
   reverb quase inaudível. No Aux o Molhado deve ser **0 dB** e o nível sai do send.
5. **Delay sincronizado fixo em 120 BPM** (`dotted`): não segue o andamento do concert.
6. **Extremos de demonstração:** Phaser `deep` (12 estágios, feedback 0,85), Flanger `metallic` (feedback
   0,95), Harmonics `default` com Mistura = máximo (10). Perigosos/agressivos para palco.
7. `catalog.json` marca vários parâmetros em Hz/s como `scale: "log"`, mas os valores normalizados dos presets
   (e dos defaults) só batem com **mapeamento linear**. Confirmar qual é o real (P0) — o conversor depende disso.

## 2. Regras para todo preset novo

1. **Fonte em valores reais** (ms, Hz, dB, s), por nome de parâmetro; o gerador converte para o normalizado.
2. **Mudança de nível ≤ ±3 dB** em relação ao bypass para efeitos tonais; pico final ≤ -1 dBFS (teste na P6).
3. **Feedback ≤ 0,8** em qualquer delay/flanger/phaser (nada que auto-oscile).
4. **Reverb/Delay têm duas versões:** `<id>` para **insert** (Seco 0 dB, Molhado -10 dB) e `<id>-aux` para
   **Aux** (Seco **-60 dB**, Molhado **0 dB**). Mesma definição, só muda Seco/Molhado.
5. **Largura estéreo ≤ 1,1** em reverbs; modulação de reverb ≤ 0,2 de profundidade.
6. **Tempo sempre musical:** delays sincronizados usam o **andamento do concert** (não 120 BPM fixo).
7. Presets **de função** com nomes claros em PT-BR (`label`), `id` estável (as coleções citam os ids atuais).
8. 4 a 7 presets por efeito musical; efeitos utilitários mantêm o que já têm.
9. **Preset atual não citado neste documento fica como está** (só é convertido para a fonte em valores reais na P1),
   mas passa pelas regras 2–3 e pelo teste de nível (P6). Isso cobre `Stereo rotate`, `Harmonics wide`,
   `Limiter transparent`, `Delay/Chorus/Phaser/Compressor default` etc.

## 3. Tarefas (nesta ordem)

**P0 — Confirmar (sem mudar código).** Gerar `docs/PRESETS-EFEITOS.md` ("Confirmado") com:
1. Mapeamento de normalização real dos parâmetros em Hz/s/ms (linear ou log) **no motor** e a razão da marca
   `scale: "log"` no catálogo; o painel mostra e grava o valor certo? (testar 3 parâmetros);
2. Para cada parâmetro **enumerado** (Modo ER, Caminho, Modo largura, Mix Mode, Modos de filtro, Canal): lista
   de opções e significado, lida do plugin; sem suposição;
3. Como o app aplica preset a um insert de **Aux** (`auxPresets`, G3) e se pode escolher `<id>-aux`;
4. Como obter o **BPM do concert** no momento de aplicar um preset sincronizado.
Critério: tabela completa. **Pare ao final.**

**P1 — Fonte em valores reais + gerador.** Criar `src/shared/effects/presets-src/<id>.json` com
`{ "id", "label", "values": { "<nome do parâmetro>": <valor real> } }` e `scripts/generate-effect-presets.mjs`
que converte para o normalizado (mapeamento da P0), **valida faixa** (valor fora de min..max = erro) e escreve os
presets no `catalog.json`. Presets atuais viram a fonte inicial (convertidos), sem mudar o som. Teste: gerar de
novo não altera o catálogo. **Pare ao final.**

**P2 — Reverb e Delay (com versões Aux).** Aplicar as tabelas da seção 4. **Pare ao final** (o Rafael ouve).

**P3 — Chorus, Phaser, Flanger, Pulsator, Compressor, Limiter, Harmonics, Stereo.** Seção 5. **Pare ao final.**

**P4 — Demais efeitos** (EQ, Filter, Transients, De-esser, Expander, Octaver, Crusher, Ring Mod, Bender, Tamer,
MB Comp, MB Limiter, Denoiser, Impulse). Aplicar as propostas da **seção 5b** (já com valores reais), depois de
conferir os parâmetros enumerados (tipos de banda do EQ, modos do Filter) na P0. Utilitários (**Analyzer, Tuner,
Aligner, Split, Elliptic**) **mantêm os presets atuais** (`low`/`high`, `stereo`/`left`…), sem mudança. **Pare ao final.**

**P5 — Efeitos de guitarra (Guitarix: Overdrive, Preamp, Cab, Amp, Tremolo).** Aplicar a **seção 5c**
(`src/shared/effects/guitarix.json`, mesma fonte em valores reais da P1). Não mudar a cadeia nem os painéis.
Antes, listar na P0 os **nomes** dos modelos de amp (0–18), tonestack (0–27) e cabine (0–18) lidos do plugin: a
escolha de modelos por preset só é feita com nomes reais, sem supor. **Pare ao final.**

**P6 — Teste de nível.** Script de teste (`engine/test/` ou `scripts/`) que passa um sinal de teste (ruído rosa e
uma nota de piano sampleada, se existir no repositório) por **cada preset** e mede: RMS vs bypass (≤ ±3 dB nos
tonais), pico ≤ -1 dBFS, ausência de NaN/auto-oscilação (cauda cai abaixo de -60 dB em ≤ 20 s). Falha lista os
presets fora do limite. **Pare ao final.**

**P7 — Coleção e documentação.** Nas coleções, os efeitos em Aux usam `<id>-aux` (automático ao aplicar em
`aux1..4`); inserts usam `<id>`. Conferir que todos os ids citados em `collection-presets.ts` existem. Atualizar
`docs/FACTORY-40.md`/`docs/COLECAO.md`. **Não alterar** coleções `.preseter` já geradas. **Pare ao final.**

**P8 — Sessão de escuta com o Rafael.** Roteiro curto para ele ouvir: Concert Grand (hall-aux), Rhodes (plate-aux +
chorus), Wurly (pulsator + plate-aux), Órgão (sem reverb), guitarra clean (echo-aux), baixo (compressor bass),
Strings (hall-aux) e o Aux 1 com send de -14 dB. Anotar o que ele quer mais seco/curto/escuro e ajustar a **fonte**
(P1), regenerando.

## 4. Tabelas — Reverb e Delay (valores reais; estas são as **propostas iniciais**)

Nomes de parâmetro como no catálogo. Fixos em todos os presets de Reverb: Modo PA = Modo PB = o atual (1), Caminho 0,
Nível tardio 0 dB, Ducking 0, Gate 0 (exceto `gated`), Congelar 0, Largura ≤ 1,1.
Modos enumerados (Modo ER, Modo largura): **manter o valor atual** de cada preset até a P0 dizer o significado.

### 4.1 Reverb

| Parâmetro | booth | room | chamber | hall | plate | arena (igreja) | gated |
|---|---|---|---|---|---|---|---|
| Tamanho da sala (m) | 4 | 8 | 14 | 24 | 10 | 34 | 9 |
| Distância | 0,25 | 0,35 | 0,45 | 0,5 | 0,3 | 0,6 | 0,25 |
| Decaimento (s) | 0,5 | 0,9 | 1,6 | 2,6 | 1,8 | 4,5 | 1,0 |
| Difusão | 0,55 | 0,6 | 0,65 | 0,75 | 0,9 | 0,8 | 0,55 |
| Pré-difusão | 0,3 | 0,35 | 0,45 | 0,5 | 0,6 | 0,55 | 0,4 |
| Pré-delay (ms) | 5 | 12 | 18 | 25 | 5 | 40 | 0 |
| Freq. PA (Hz) | 150 | 150 | 150 | 180 | 200 | 200 | 200 |
| Freq. PB (Hz) | 9000 | 9000 | 8000 | 7500 | 10000 | 5500 | 8000 |
| Amort. agudos (Hz) | 7000 | 7000 | 6000 | 5000 | 8000 | 3800 | 7000 |
| Amort. graves | 0,2 | 0,2 | 0,25 | 0,3 | 0,4 | 0,35 | 0,25 |
| Ar | 0,15 | 0,25 | 0,3 | 0,3 | 0,4 | 0,25 | 0,3 |
| Nível ER (dB) | -4 | -6 | -8 | -10 | -18 | -14 | -4 |
| Vel. modulação (Hz) | 0,15 | 0,2 | 0,2 | 0,15 | 0,12 | 0,1 | 0,15 |
| Prof. modulação | 0,08 | 0,12 | 0,12 | 0,15 | 0,1 | 0,1 | 0,08 |
| Largura | 0,9 | 1,0 | 1,05 | 1,1 | 1,1 | 1,1 | 1,0 |
| Gate / Limite (dB) / Hold (ms) / Liberação (ms) | 0 | 0 | 0 | 0 | 0 | 0 | 1 / -20 / 80 / 60 |

**Versão insert** (`booth`, `room`…): Seco **0 dB**, Molhado **-10 dB**.
**Versão Aux** (`booth-aux`, `room-aux`…): Seco **-60 dB**, Molhado **0 dB**.
O `default` fica como o plugin (calf), mas com modulação 0,2 Hz / 0,12 e largura 1,0.
O send do patch passa a mandar o nível (na coleção: de -14 a -20 dB conforme a sala; o Rafael ajusta na P8).

### 4.2 Delay

| Parâmetro | slap | echo | pingpong | dotted | tape | ambient |
|---|---|---|---|---|---|---|
| Sincronizar | 0 | 0 | 0 | **1** | 0 | 0 |
| Subdivisão (sync) | — | — | — | 1/8 pontuada (valor do menu, P0) | — | — |
| Tempo (ms) | 110 | 380 | 300 | do BPM do concert | 320 | 600 |
| Realimentação | 0,12 | 0,35 | 0,38 | 0,35 | 0,40 | 0,50 |
| Largura | 0,6 | 1,0 | 1,0 (pingpong, ver P0) | 1,0 | 0,8 | 1,0 |
| Freq. PA (Hz) | 150 | 200 | 200 | 200 | 250 | 250 |
| Freq. PB (Hz) | 6500 | 5000 | 5500 | 5000 | 3500 | 3000 |

**Insert:** Seco 0 dB, Molhado -10 dB. **Aux (`<id>-aux`):** Seco -60 dB, Molhado 0 dB.
O BPM do `dotted` vem do concert; se o plugin não ler o andamento do host, o app calcula o tempo em ms
(`60000/BPM × 0,75`) ao aplicar o preset e ao mudar o tempo. `default` do Delay: 500 ms, realimentação 0,35.

## 5. Tabelas — modulação, dinâmica e outros (propostas iniciais; **ajustar de ouvido na P8**)

| Efeito / preset | Valores reais |
|---|---|
| **Chorus `subtle`** | atraso mín. 8 ms, prof. 2 ms, vel. 0,3 Hz, 2 vozes, fase estéreo 180°, Quantidade -9 dB, Seco 0 |
| **Chorus `wide`** | 10 ms, 4 ms, 0,2 Hz, 4 vozes, fase 200°, Quantidade -7 dB |
| **Chorus `ensemble`** | 10 ms, 4 ms, 0,5 Hz, 6 vozes, fase 120°, Quantidade -7 dB |
| **Chorus `vintage` (novo)** | 7 ms, 3 ms, 0,6 Hz, 1 voz, Quantidade -5 dB |
| **Phaser `slow`** | centro 800 Hz, prof. 3000 ct, 0,12 Hz, fb 0,45, 6 estágios, Quantidade -6 dB |
| **Phaser `fast`** | 1200 Hz, 5000 ct, 1,0 Hz, fb 0,55, 6 estágios, -6 dB |
| **Phaser `deep`** | 500 Hz, 6000 ct, 0,2 Hz, fb **0,7**, 8 estágios, -5 dB |
| **Flanger `subtle`** | 2 ms, prof. 1,5 ms, 0,25 Hz, fb 0,35, fase 180°, Quantidade -9 dB |
| **Flanger `jet`** | 0,5 ms, 4 ms, 0,2 Hz, fb **0,7**, Quantidade -6 dB |
| **Flanger `metallic`** | 1 ms, 5 ms, 0,5 Hz, fb **0,8**, -7 dB |
| **Pulsator `slow`** | período 1000 ms, modulação 0,5, largura de pulso suave |
| **Pulsator `classic` (Wurly)** | período 200 ms (≈5 Hz, mínimo do plugin), modulação 0,35, L/R defasados 0,5 |
| **Pulsator `fast`** | período 250 ms, modulação 0,6 |
| **Compressor `vocal`** (leve) | limite -18 dB, taxa 3:1, joelho 6 dB, ataque 15 ms, liberação 120 ms, compensação +3 dB, Mix 100% |
| **Compressor `piano` (novo)** | -16 dB, 2,5:1, joelho 8 dB, ataque 30 ms, liberação 250 ms, +2 dB |
| **Compressor `drum`** | -14 dB, 4:1, joelho 3 dB, ataque 10 ms, liberação 80 ms, +3 dB |
| **Compressor `bass`** | -20 dB, 4:1, joelho 6 dB, ataque 25 ms, liberação 150 ms, +4 dB |
| **Compressor `bus`** (cola) | -12 dB, 2:1, joelho 8 dB, ataque 30 ms, liberação 200 ms, +2 dB |
| **Limiter `safe`** | limite -1,0 dB, lookahead 5 ms, liberação 100 ms, true peak ligado |
| **Limiter `loud`** | -0,5 dB, 3 ms, 60 ms, true peak ligado (não usar em patch; só master) |
| **Harmonics `exciter`** | Drive 3, Mistura +3, PA pré 3000 Hz, Molhado -9 dB, Seco 0 |
| **Harmonics `bass`** | Drive 3, Mistura −3, PB pré 150 Hz, Molhado -6 dB, Seco 0 |
| **Harmonics `default`** | Mistura **0** (não 10), Drive 2, Molhado -12 dB |
| **Stereo `wide`** | quantidade 0,5, abertura 0,6 (não 0,8), decorrelação ligada |
| **Stereo `mono`** | modo mono (valor do menu, P0) |

Nota: `Compressor` com compensação reflete a redução média esperada; a P6 mede o nível e corrige.

## 5b. Tabelas — demais efeitos (revisão dos presets atuais + novos para teclado/guitarra/baixo)

Leitura dos presets atuais: a maioria dos efeitos abaixo **já está razoável** (Transients, Octaver, Bender, Tamer,
Denoiser, MB Limiter). Os problemas reais são: **EQ pensado para voz** (um app de teclado/guitarra precisa de
EQ por instrumento), **Impulse com Seco 0 dB** (mesmo problema do reverb em Aux), alguns extremos (`acid`
ressonância 8, `destroy` 3 bits/85%, `tight` razão 10 e range -80 dB) e **MB Comp** que só define a banda 1.
**Tipos de banda do EQ** (`Type`: peak, shelves, HP, LP…) e **modos do Filter**: usar os nomes lidos na P0, não
supor.

### EQ (novos presets por instrumento; `vocal` e `master` ficam; `low-cut` e `presence` suavizados)

| Preset | Bandas (tipo · freq · ganho · Q) |
|---|---|
| `low-cut` | HP 80 Hz (24 dB/oit.); sem corte em 200 Hz (remover o -3 dB atual) |
| `presence` | pico 3 kHz +2 dB Q 1,0; shelf alto 9 kHz +1,5 dB |
| `piano` | HP 40 Hz; pico 300 Hz −2 dB Q 1,0 (tira lama); pico 3 kHz +1,5 dB Q 1,0; shelf alto 10 kHz +2 dB |
| `teclas` (EP/Rhodes/Wurly) | HP 60 Hz; pico 250 Hz −2 dB Q 1,0; pico 4 kHz +1,5 dB Q 1,0 |
| `organ` | HP 50 Hz; pico 400 Hz −1,5 dB Q 0,8; shelf alto 8 kHz +1 dB |
| `baixo` | HP 35 Hz; shelf baixo 80 Hz +2 dB; pico 250 Hz −3 dB Q 1,2; pico 1,5 kHz +2 dB Q 1,0 |
| `guitarra` | HP 90 Hz; pico 300 Hz −2 dB Q 1,0; pico 3 kHz +2 dB Q 1,0; LP 12 kHz |
| `pad-cordas` | HP 100 Hz; pico 400 Hz −2 dB Q 0,8; shelf alto 8 kHz +1 dB; LP 14 kHz |
| `master` (atual, mantido) | HP/shelf 40 Hz +1 dB; pico 300 Hz −1 dB; shelf 12 kHz +1,5 dB |

### Demais

| Efeito / preset | Valores reais |
|---|---|
| **Filter `smooth`** | LP 2500 Hz, ressonância 1,2, mix 100% (mantido) |
| **Filter `acid`** | LP 700 Hz, ressonância **5** (era 8) |
| **Filter `envelope`** | mantido (900 Hz, res. 2,5, alvo 6000 Hz, ataque 5 ms, liberação 180 ms) |
| **Transients `attack`** | reforço de ataque **+0,3** (era +0,4), liberação −0,1 |
| **Transients `sustain`** | ataque −0,2, reforço de liberação +0,3 (mantido) |
| **Transients `pluck` (novo)** | ataque +0,3, liberação −0,3 (violão/ EP mais curto) |
| **Expander `soft-gate`** | limite −42 dB, razão 2:1, ataque 5 ms, liberação 180 ms, range −40 dB (mantido) |
| **Expander `tight`** | limite −38 dB, razão **6:1** (era 10), ataque 2 ms, liberação 100 ms, range **−60 dB** (era −80) |
| **Expander `guitar-gate` (novo)** | limite −48 dB, razão 3:1, ataque 1 ms, liberação 150 ms, range −40 dB |
| **Crusher `soft`** | 10 bits, mix 30%, anti-aliasing 60% (mantido) |
| **Crusher `lofi`** | 6 bits, mix 50%, anti-aliasing 75% (mantido) |
| **Crusher `destroy`** | **4 bits**, mix **60%** (era 3 bits / 85%), anti-aliasing 40% |
| **Ring Mod `bell`** | onda 0, 1200 Hz, quantidade 35% (mantido) |
| **Ring Mod `metallic`** | onda 1, 640 Hz, quantidade **40%** |
| **Octaver `sub`, `down`, `both`** | mantidos (níveis −3 a −4 dB); conferir o nível geral na P6 |
| **Bender `octave-down` / `fifth` / `detune`** | mantidos (−12 st mix 50%; +7 st mix 40%; +0,15 st mix 50%) |
| **Tamer `vocal` / `master`** | mantidos; `master`: busca 60–12000 Hz, profundidade 4 dB |
| **MB Comp `master-soft`** | 4 bandas; **todas** as bandas: limite −18 dB, razão 1,8:1, ataque 30 ms, liberação 200 ms, compensação 1 dB |
| **MB Comp `bus`** | todas as bandas: limite −12 dB, razão 1,5:1, ataque 30 ms, liberação 250 ms |
| **MB Comp `drums`** | todas as bandas: limite −14 dB, razão 3:1, ataque 10 ms, liberação 120 ms, compensação 2 dB |
| **MB Limiter `master-1` / `master-03` / `soft`** | mantidos (−1,0 / −0,3 / −2,0 dB); `soft`: liberação 120 ms |
| **Denoiser `light` / `strong`** | mantidos (quantidade 40% piso −55 dB; 85% piso −45 dB) |
| **Impulse `short` / `long` / `reverse`** | decaimento/pré-delay atuais; **insert:** Seco 0, Molhado −10 dB; **`<id>-aux`:** Seco −60, Molhado 0 |
| **De-esser `vocal` / `soft`** | mantidos (limite −30/−24 dB, divisão 6500/5000 Hz) |

## 6. Regras para o agente

1. Uma tarefa por commit; parar e mostrar o resultado.
2. Não editar o catálogo gerado à mão; mudar a **fonte** e gerar.
3. Não inventar o significado de parâmetros enumerados nem mapeamento de escala; usar `a confirmar`.
4. Manter os **ids** dos presets atuais (coleções citam `hall`, `plate`, `echo`, `slap`, `subtle`, `slow`, `bus`,
   `bass`, `drum`, `wide`…); mudar os valores, não os nomes. Novos presets só acrescentam.
5. Não aplicar a P4 sem o Rafael aprovar a lista.
6. Textos (`label`) em português do Brasil.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Conversão real→normalizado errada (escala log×linear) | P0 verifica no motor; o gerador valida faixa e a P1 tem teste de regressão |
| Preset soar bom no papel e ruim no ouvido | P8: sessão de escuta; a fonte em valores reais facilita o ajuste |
| `<id>-aux` não ser escolhido automaticamente | P0 item 3; P7 trata |
| Mudar ids quebra coleções | Regra 4; teste que lista os ids usados nas coleções |
| Delay sincronizado fora do tempo | Tempo vem do concert (seção 4.2) |
| Efeito auto-oscilar | Feedback ≤ 0,8; P6 mede a cauda |

## 5c. Tabelas — efeitos de guitarra (Guitarix portado)

Leitura dos presets atuais (`guitarix.json`): os valores **não são absurdos**, mas têm 4 problemas:
1. **Todos os presets do Amp usam o mesmo modelo** (amp 0, tonestack 1, cabine 0) e só mudam ganho/EQ → soam
   parecidos; falta variedade real de timbre (clean/crunch/lead/high gain de verdade).
2. **Volume mestre = 0 dB e ganho de entrada = 0 dB em todos** → `highgain` fica **muito mais alto** que `clean`
   (sem compensação de nível); no palco isso dá susto ao trocar de patch.
3. **Cab: todos os presets usam o modelo 0** e só mexem em nível/EQ; os "presets de cabine" não trocam de cabine.
4. **Tremolo com Dry/Wet 30–70%** dilui o efeito (a profundidade já controla a intensidade).
`Amp` já **inclui cabine**: na cadeia, **não** colocar `Cab` depois dele (cabine dupla). Alto ganho gera chiado:
combinar com o `Expander guitar-gate` (seção 5b).

Escolha de **modelos** por preset: usar os nomes lidos na P0; marcar `a confirmar` o que não puder ser nomeado.
Propostas (modelos = família sugerida, o OpenCode confirma o nome real):

| Preset | Valores reais |
|---|---|
| **Overdrive `default`** | nível **−10 dB** (era −16), timbre 400 Hz, drive 0,5 |
| **Overdrive `boost`** | nível −6 dB, timbre 600 Hz, drive 0,15 (mantido) |
| **Overdrive `crunch`** | nível −9 dB, timbre 650 Hz, drive 0,45 |
| **Overdrive `lead`** | nível −10 dB, timbre 750 Hz, drive 0,7 |
| **Preamp `bright` / `warm` / `crunch`** | mantidos; compensar o Master para o nível igual (P6) |
| **Cab `open`** | **modelo de cabine "aberta/1x12"** (nome na P0), graves −1 dB, agudos +1 dB |
| **Cab `closed`** | **modelo "fechada/4x12"** (nome na P0), graves +1,5 dB, agudos −1 dB |
| **Cab `bright`** | modelo claro (nome na P0), graves −2 dB, agudos +2 dB |
| **Amp `clean`** | família **Fender-like**; distorção 1, drive 0,15, high gain desligado; graves 0,5, médios 0,5, agudos 0,55, presença 5; master **0 dB** |
| **Amp `blues` (novo)** | família Fender/Vox; distorção 15, drive 0,3, high gain desligado; médios 0,6, presença 4; master −1 dB |
| **Amp `crunch`** | família Vox/Marshall plexi; distorção 30, drive 0,45; graves 0,55, médios 0,6, agudos 0,55, presença 6; master **−2 dB** |
| **Amp `lead`** | família Marshall JCM; distorção 55 (era 60), drive 0,7 (era 0,75), high gain ligado; médios 0,65, presença 7; master **−4 dB** |
| **Amp `highgain`** | família Mesa/Soldano; distorção 75 (era 80), drive 0,85 (era 0,9), high gain ligado; graves 0,6, médios 0,5; master **−5 dB** |
| **Tremolo `subtle`** | modo 0, profundidade 0,3, **4 Hz**, Dry/Wet **100%** |
| **Tremolo `classic`** | modo 0, profundidade 0,5, **5 Hz**, Dry/Wet 100% |
| **Tremolo `fast`** | modo 1, profundidade 0,6, 8 Hz, Dry/Wet 100% |
| **Tremolo `deep`** | modo 0, profundidade 0,8, 2,5 Hz, Dry/Wet 100% |

Dry/Wet 100% **só** se a P0 confirmar que nesse plugin Dry/Wet 100% = efeito pleno (e não um mix com o sinal
cortado). Os "master −N dB" são ponto de partida: a P6 mede o nível de cada preset e corrige até ficarem
dentro de ±2 dB entre `clean` e `highgain`.

**Templates de guitarra** (`src/main/concert/templates.ts`, template "Guitarra"): manter a cadeia atual e acrescentar
**Expander `guitar-gate`** antes do Overdrive/Amp nos patches Crunch e Lead, e **Reverb em Aux** (`room-aux`) e
**Delay em Aux** (`echo-aux`) com o send em −18 a −20 dB.

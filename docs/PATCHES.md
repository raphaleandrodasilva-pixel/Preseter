# Preseter — Lista inicial de patches (coleção livre)

Objetivo: uma biblioteca "pronta para tocar" parecida em organização com a de um
concert de teclado do MainStage (Sets por família de som, patches com layers e
splits), usando **apenas instrumentos livres**. Os nomes e sons são **próprios**;
não copiamos nomes nem sons da Apple.

Ver também: `docs/ROADMAP.md` (fase 5.5, Patch Library) e `docs/COLECAO.md`
(instrumentos, formatos e licenças — ainda a escrever).

## Instrumentos usados

| Sigla | Instrumento | Formato | Licença |
|---|---|---|---|
| SFZ | **sforzando** (escolha do dono do projeto) ou sfizz, + bibliotecas SFZ | VST3 | sforzando: freeware (Plogue), **não é open source** e não deve ser redistribuído junto do Preseter; sfizz: BSD-2. Cada biblioteca tem licença própria |
| SURGE | Surge XT | VST3 | GPLv3 |
| DEXED | Dexed (estilo DX7) | VST3 | GPLv3 |
| ODIN | Odin 2 | VST3 | GPLv3 |
| HELM | Helm | VST3/LV2 | GPLv3 |
| MDA | MDA (ePiano, Piano, JX10…) | VST (confirmar se há VST3) | GPL |
| ORG | setBfree (órgão) | **LV2/JACK apenas** | GPL-2.0 — só carrega depois de ligar o LV2 no motor |

> Os formatos e licenças acima vêm do conhecimento geral, exceto sfizz (BSD-2,
> VST3/LV2/AU), Salamander Grand Piano (CC BY 3.0) e setBfree (LV2/JACK, GPL-2.0),
> que foram conferidos nas páginas dos projetos. **Confirmar o resto antes de distribuir.**

## Regras para criar cada patch

1. Um patch por linha da tabela; o **Set** é a família.
2. Número de programa sequencial dentro do concert (Program Change = ordem da lista).
3. Volume de cada layer em dB (padrão −6 dB para layers; soma não pode clipar).
4. Splits: faixas de teclas sem sobreposição. Layers: mesma faixa (0–127).
5. Salvar o estado completo do plugin no patch (tarefa 1.1 do roadmap).
6. Status: `a criar` → `criado` → `testado ao vivo`.

## Gerar o concert automaticamente

```
npm run build:main
node scripts/gerar-colecao.js --out=Colecao.preseter
```

O script varre os plugins instalados e cria sets, patches, camadas, splits, volumes e
teclado na tela. Patches cujo plugin não existe são pulados (e listados). O **som**
(preset do Surge/Dexed/Odin, arquivo SFZ) você escolhe em cada patch (tecla V) e salva.
Use `--test` para validar o fluxo sem plugins reais.

---

## Set 1 — Pianos

| # | Patch | Camadas | Instrumento / preset | Faixas | Status |
|---|---|---|---|---|---|
| 1 | Piano de Cauda | 1 | SFZ + Salamander Grand Piano | 0–127 | a criar |
| 2 | Piano de Cauda Brilhante | 1 | SFZ + Salamander (EQ/brilho no strip) | 0–127 | a criar |
| 3 | Piano Suave | 1 | SFZ + Salamander, velocity suavizada | 0–127 | a criar |
| 4 | Piano Vertical | 1 | SFZ + biblioteca de piano vertical livre | 0–127 | a criar |
| 5 | Piano + Pad | 2 | SFZ Salamander + SURGE pad quente (−12 dB) | 0–127 | a criar |

## Set 2 — Teclas elétricas

| # | Patch | Camadas | Instrumento / preset | Faixas | Status |
|---|---|---|---|---|---|
| 6 | Elétrico Clássico | 1 | MDA ePiano ou DEXED (preset tipo "E.Piano") | 0–127 | a criar |
| 7 | Elétrico Suave | 1 | DEXED, release longo | 0–127 | a criar |
| 8 | Elétrico com Tremolo | 1 | MDA ePiano + tremolo do plugin | 0–127 | a criar |
| 9 | Clavinet | 1 | SURGE (preset de clav) | 0–127 | a criar |
| 10 | Sinos Elétricos | 1 | DEXED (preset de sinos/bell) | 0–127 | a criar |

## Set 3 — Órgãos

| # | Patch | Camadas | Instrumento / preset | Faixas | Status |
|---|---|---|---|---|---|
| 11 | Órgão Tonewheel | 1 | ORG (setBfree) — **depende de LV2** | 0–127 | bloqueado |
| 12 | Órgão Rock | 1 | ORG com overdrive/leslie rápido — **depende de LV2** | 0–127 | bloqueado |
| 13 | Órgão de Igreja | 1 | SFZ + biblioteca de órgão de tubos livre | 0–127 | a criar |
| 14 | Órgão Suave (provisório) | 1 | SURGE (preset de órgão) enquanto o LV2 não chega | 0–127 | a criar |

## Set 4 — Cordas e orquestra

| # | Patch | Camadas | Instrumento / preset | Faixas | Status |
|---|---|---|---|---|---|
| 15 | Cordas Legato | 1 | SFZ + biblioteca de cordas livre (sustain) | 0–127 | a criar |
| 16 | Cordas Staccato | 1 | SFZ + mesma biblioteca (staccato) | 0–127 | a criar |
| 17 | Cordas Sintéticas | 1 | SURGE ou ODIN (preset de "string ensemble") | 0–127 | a criar |
| 18 | Metais | 1 | SFZ + biblioteca de metais livre | 0–127 | a criar |
| 19 | Flauta | 1 | SFZ + biblioteca de madeiras livre | 0–127 | a criar |
| 20 | Coral | 1 | SFZ (coral livre) ou SURGE (preset "choir") | 0–127 | a criar |

## Set 5 — Pads

| # | Patch | Camadas | Instrumento / preset | Faixas | Status |
|---|---|---|---|---|---|
| 21 | Pad Quente | 1 | SURGE (preset de pad) | 0–127 | a criar |
| 22 | Pad Ambiente | 1 | ODIN, ataque e release longos | 0–127 | a criar |
| 23 | Pad de Cordas | 1 | HELM ou ZYN (pad de cordas) | 0–127 | a criar |
| 24 | Pad Brilhante | 1 | SURGE (pad com filtro aberto) | 0–127 | a criar |
| 25 | Pad Escuro | 1 | ODIN, filtro baixo | 0–127 | a criar |

## Set 6 — Leads e sintetizadores

| # | Patch | Camadas | Instrumento / preset | Faixas | Status |
|---|---|---|---|---|---|
| 26 | Lead Serra | 1 | SURGE (lead saw) | 0–127 | a criar |
| 27 | Lead Suave | 1 | ODIN | 0–127 | a criar |
| 28 | Pluck | 1 | SURGE / HELM (pluck) | 0–127 | a criar |
| 29 | Arpejo Brilhante | 1 | SURGE (arp pronto) | 0–127 | a criar |
| 30 | Brass Sintético | 1 | MDA JX10 ou SURGE | 0–127 | a criar |

## Set 7 — Baixos

| # | Patch | Camadas | Instrumento / preset | Faixas | Status |
|---|---|---|---|---|---|
| 31 | Baixo Sintético | 1 | SURGE (sub bass) | 0–127 | a criar |
| 32 | Baixo Elétrico | 1 | SFZ + baixo elétrico livre | 0–127 | a criar |
| 33 | Baixo Acústico | 1 | SFZ + contrabaixo livre | 0–127 | a criar |

## Set 8 — Layers e splits (uso de palco)

| # | Patch | Camadas | Instrumentos | Faixas | Status |
|---|---|---|---|---|---|
| 34 | Split Baixo + Piano | 2 | Baixo (SFZ) + Piano (SFZ Salamander) | Baixo 0–59, Piano 60–127 | a criar |
| 35 | Split Baixo + Elétrico | 2 | SURGE sub bass + DEXED elétrico | Baixo 0–53, Elétrico 54–127 | a criar |
| 36 | Piano + Cordas | 2 | Salamander + Cordas Legato (−9 dB) | 0–127 | a criar |
| 37 | Piano + Pad (worship) | 2 | Salamander + Pad Quente (−12 dB) | 0–127 | a criar |
| 38 | Elétrico + Pad | 2 | DEXED + SURGE pad | 0–127 | a criar |
| 39 | Split Cordas / Piano | 2 | Cordas (SFZ) + Piano (SFZ) | Cordas 0–59, Piano 60–127 | a criar |
| 40 | Tripla: Piano + Cordas + Pad | 3 | Salamander + Cordas + Pad Quente | 0–127 | a criar |

---

## Observações

- Os patches 11 e 12 só funcionam depois de ligar o suporte a **LV2** no motor
  (`JUCE_PLUGINHOST_LV2`). Até lá, use o 13 e o 14.
- O nome exato de cada preset dos synths (SURGE, DEXED, ODIN) deve ser anotado na
  coluna "Instrumento / preset" quando o patch for criado.
- Antes de **distribuir** qualquer patch com samples, conferir a licença da
  biblioteca (ex.: Salamander é CC BY 3.0 — exige atribuição).

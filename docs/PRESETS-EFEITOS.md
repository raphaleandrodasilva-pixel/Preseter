# Preseter — P0: confirmações dos presets de efeitos

> Resultado da tarefa **P0** de `docs/PRESETS-EFEITOS-NOVOS.md`.
> Nada de código foi alterado nesta tarefa; este documento é o registro das confirmações.
> Método: leitura do motor (`engine/src`), do painel (`src/shared/effects`, `PreseterEffectWindow.tsx`),
> do fluxo de carga de patch (`src/main/index.ts`) e **sondagem do plugin real** pelo motor
> (`PreseterEngine.exe`, insert no Master do Patch, `params`/`setParam`).

---

## 1. Normalização real dos parâmetros (Hz / s / ms): **linear**

O VST3 entrega todos os parâmetros normalizados em **0..1**. O plugin (`calfNXT`, fork do calf)
converte o normalizado para o valor real de forma **linear**:

```
real = min + normalizado × (max − min)
normalizado = (real − min) / (max − min)
```

Sondagem no motor com o `calfNXTReverb.vst3` carregado (valores lidos de `params` e `setParam`):

| Parâmetro | Faixa | Default real | `defaultValue` do plugin | `min + v·(max−min)` | Veredito |
|---|---|---|---|---|---|
| Room Size (Tamanho da sala) | 2..40 m | 12,0 m | 0,2631579 | 12,0 | linear |
| Decay (Decaimento) | 0,4..15 s | 1,50 s | 0,0753425 | 1,50 | linear |
| Predelay (Pré-delay) | 0..500 ms | 20,0 ms | 0,04 | 20,0 | linear |
| HP Freq (Freq. PA) | 20..20000 Hz | 300 Hz | 0,0140140 | 300 | linear |
| LP Freq (Freq. PB) | 20..20000 Hz | 5000 Hz | 0,2492492 | 5000 | linear |
| Mod Rate (Vel. modulação) | 0,05..5 Hz | 0,50 Hz | 0,0909091 | 0,50 | linear |

Prova extra com valores intermediários (`setParam`):

| Parâmetro | v = 0 | v = 0,25 | v = 0,5 | v = 0,75 | v = 1 |
|---|---|---|---|---|---|
| Decay | 0,40 s | 4,05 s | 7,70 s | 11,35 s | 15,00 s |
| Predelay | 0 ms | 125 ms | 250 ms | 375 ms | 500 ms |
| HP Freq | 20 Hz | 5015 Hz | 10010 Hz | 15005 Hz | 20000 Hz |

**Conclusão:** a conversão real ↔ normalizado é **sempre linear**, inclusive nos parâmetros
marcados `scale: "log"` no catálogo (Decay, HP/LP Freq, Mod Rate, Gate Hold/Release…).

### Por que existe `scale: "log"` no catálogo

O `scale` foi copiado do **schema da UI do próprio plugin** (o bundle
`Contents/Resources/assets/reverb-*.js` declara `scale:"log"` em `decay`, `hipass`, `lopass`,
`mod_rate`, `hf_damp`, `gate_hold`, `gate_release`). No plugin ele **só define a curva do knob**
(posição visual exponencial); o parâmetro VST3 continua linear.

No Preseter:

- `paramPosition()` / `positionToNormalized()` usam o `scale` apenas para a **curva do knob**;
- `paramReal()` / `paramNormalized()` (que gravam/lem com o motor e com os presets) são **lineares**.

Portanto o painel mostra e grava o valor certo: o campo numérico e o `setParam` usam a mesma
conversão linear do plugin. (Conferido no motor com os 6 parâmetros acima; o caminho do painel é
o mesmo de `formatParam`/`paramNormalized`, coberto por `catalog.test.ts`.)

### Enumerados: o plugin não expõe os nomes como parâmetro

O `calfNXT` publica os modos como parâmetros normalizados com `stepCount = 0` e
`getParameterText` devolvendo **apenas o número** (ex.: `ER Mode` → `"0"`, `"1"`, `"2"`).
Os nomes das opções existem **na UI do plugin** (arrays `{label, value}` no bundle React) e são
listados na seção 2. Por isso `isChoice()` no painel cai no heurístico (inteiro 0..N) e mostra
**só números** (ex.: “Modo PA 1”): o catálogo não tem `choices` para os efeitos calfNXT — só para
os LV2 do Guitarix, que trazem scale points no `.ttl`.

> Ação sugerida para a P1/P2: copiar esses `choices` para o `catalog.json` (gerados a partir do
> schema do plugin), para o seletor do painel mostrar os nomes.

---

## 2. Parâmetros enumerados — opções lidas do plugin

Fonte: schema/UI do bundle de cada plugin (`vendor/calfnxt/plugins/calfNXT*/Contents/Resources/assets/*.js`).

### Reverb

| Índice | Parâmetro | Opções (valor = rótulo) |
|---|---|---|
| 11 | HP Mode (Modo PA) | 0 Off · 1 12 dB · 2 24 dB · 3 36 dB · 4 48 dB |
| 12 | LP Mode (Modo PB) | 0 Off · 1 12 dB · 2 24 dB · 3 36 dB · 4 48 dB |
| 13 | Listen (Escuta) | 0 Lo · 1 Mid · 2 Hi |
| 17 | ER Mode (Modo ER) | 0 Off · 1 Multi-Tap · 2 Velvet |
| 19 | Path (Caminho) | 0 Parallel · 1 Serial |
| 23 | Width Mode (Modo largura) | 0 Dry · 1 M/S · 2 Haas · 3 Decor |
| 33 | Quality (Qualidade) | 0/1/2 (o plugin não publica rótulos; UI usa só o valor) |

### Delay

| Índice | Parâmetro | Opções |
|---|---|---|
| 3 | Sync (Sincronizar) | liga/desliga (0/1) |
| 6 | Subdivide (Subdivisão) | 1..16, encaixa em 1, 2, 3, 4, 6, 8, 12, 16 passos por batida |
| 7 | Time L | 1..16 passos |
| 8 | Time R | 1..16 passos |
| 13 | Mix Mode | 0 Stereo · 1 Ping-Pong · 2 L then R · 3 R then L |
| 16 | HP Mode (Modo PA) | 0 Off · 1 12 · 2 24 · 3 36 · 4 48 dB/oct |
| 17 | LP Mode (Modo PB) | 0 Off · 1 12 · 2 24 · 3 36 · 4 48 dB/oct |

### Filter

| Índice | Parâmetro | Opções |
|---|---|---|
| 3 | Mode (Modo) | 0 LP12 · 1 LP24 · 2 LP48 · 3 HP12 · 4 HP24 · 5 HP48 · 6 BP6 · 7 BP12 · 8 BP18 · 9 BR6 · 10 BR12 · 11 BR18 · 12 Allpass |
| 13 | Detection (Detecção) | 0 Peak · 1 RMS · 2 Opto |
| 15 | Spectrum (Espectro) | 0 Off · 1 Lin · 2 −3 dB · 3 −4,5 dB |
| 17 | Channel (Canal) | 0 Stereo · 1 Left · 2 Right · 3 Mid · 4 Side |

### Equalizer (por banda; mesma lista em B1..B16)

| Índice | Parâmetro | Opções |
|---|---|---|
| `bNN_type` | Type | 0 Parametric · 1 Low Shelf · 2 High Shelf · 3 Low Pass · 4 High Pass · 5 Band Pass |
| `bNN_dyn_mode` | Dyn Mode | 0 Peak · 1 RMS · 2 Opto |
| `bNN_channel` | Channel | 0 Stereo · 1 Left · 2 Right · 3 Mid · 4 Side |
| 227 | Spectrum | 0 Off · 1 Lin · 2 −3 dB · 3 −4,5 dB |

### Compressor

| Índice | Parâmetro | Opções |
|---|---|---|
| 11 | Mode (Modo) | 0 Peak · 1 RMS · 2 Opto (default 1 = RMS) |
| 12 | Link | 0 Max · 1 Avg · 2 Mid |
| 16 | HP Mode (Modo PA) | 0 Off · 1 12 · 2 24 · 3 36 · 4 48 dB/oct |
| 17 | LP Mode (Modo PB) | 0 Off · 1 12 · 2 24 · 3 36 · 4 48 dB/oct |
| 19 | Channel (Canal) | 0 Stereo · 1 Left · 2 Right · 3 Mid · 4 Side |

### Pulsator

| Índice | Parâmetro | Opções |
|---|---|---|
| 3 | Mode (Modo) | 0 Sine · 1 Triangle · 2 Square · 3 Saw up · 4 Saw down |
| 9 | Pulse Width (Largura do pulso) | 0 ⅛ · 1 ¼ · 2 ½ · 3 1 · 4 2 |
| 10 | Sync (Sincronizar) | liga/desliga |

### Stereo

| Índice | Parâmetro | Opções |
|---|---|---|
| 5 | Mode (Modo) | 0 LR→LR · 1 LR→MS · 2 MS→LR · 3 LR→LL · 4 LR→RR · 5 LR→L+R · 6 LR→RL |

### Guitarix (LV2, nomes já no catálogo / `.ttl`)

**Amp — Modelo do amp (19):** 0 12ax7 · 1 12AU7 · 2 12AT7 · 3 6DJ8 · 4 6C16 · 5 6V6 ·
6 12ax7 feedback · 7 12AU7 feedback · 8 12AT7 feedback · 9 6DJ8 feedback ·
10 pre 12ax7/master 6V6 · 11 pre 12AU7/master 6V6 · 12 pre 12AT7/master 6V6 ·
13 pre 6DJ8/master 6V6 · 14 pre 12ax7/push-pull 6V6 · 15 pre 12AU7/push-pull 6V6 ·
16 pre 12AT7/push pull 6V6 · 17 pre 6DJ8/push-pull 6V6 · 18 `--`

**Amp — Modelo do tonestack (28):** 0 default · 1 Bassman Style · 2 Twin Reverb Style ·
3 Princeton Style · 4 JCM-800 Style · 5 JCM-2000 Style · 6 M-Lead Style · 7 M2199 Style ·
8 AC-30 Style · 9 SOL 100 Style · 10 Mesa Boogie Style · 11 JTM-45 Style · 12 AC-15 Style ·
13 Peavey Style · 14 Ibanez Style · 15 Roland Style · 16 Ampeg Style · 17 Rev.Rocket Style ·
18 MIG 100 H Style · 19 Triple Giant Style · 20 Trio Preamp Style · 21 Hughes&Kettner Style ·
22 Fender Junior Style · 23 Fender Style · 24 Fender Deville Style · 25 Gibsen Style ·
26 Off · 27 Engl Style

**Cab / Amp — Modelo de cabine (19):** 0 4x12 · 1 2x12 · 2 1x12 · 3 4x10 · 4 2x10 ·
5 HighGain Style · 6 Twin Style · 7 Bassman Style · 8 Marshall Style · 9 AC30 Style ·
10 Princeton Style · 11 A2 Style · 12 1x15 · 13 Mesa Style · 14 Briliant · 15 Vitalize ·
16 Charisma · 17 1x8 · 18 Off

**Tremolo — Modo:** 0 triangle · 1 sine

---

## 3. Como o app aplica preset num insert de Aux

Fluxo real (`src/main/index.ts`):

1. `preset.auxPresets?.[aux]` é um **id de preset do patch** (1..4). Ex.: `{ "1": "hall", "2": "echo" }`.
2. Ao carregar o patch, para cada barramento Aux do concert:
   - se existe `preset.vstStates["insert_aux1_0"]` (chunk salvo), **o estado vence** e o preset não é aplicado;
   - senão: `applyInsertPreset('aux1', insert, auxPreset ?? insert.presetId)`.
3. `applyInsertPreset` chama `effectPresetValues(insert.path, presetId)`, que procura o id **exato**
   no catálogo (`findEffect(path).presets.find(p => p.id === presetId)`) e manda `setParam` índice a índice.

**Sufixo `-aux` (implementado na P7):** `collection-presets.ts` grava `hall-aux`/`plate-aux`… em
`auxPresets`, e `effectPresetValues(..., { aux: true })` faz o fallback: um preset sem sufixo num
insert `auxN` tenta `<id>-aux` e, se não existir, usa o `<id>`. Assim coleções antigas (que citam
`hall`, `plate`, `echo`) também passam a usar a versão correta de Aux.

Observações:

- O preset de Aux é **do patch** (troca por patch), não do concert — comportamento atual e desejado.
- O seletor “Preset do efeito” na janela do efeito lista todos os presets do efeito; presets `-aux`
  apareceriam também em inserts normais (sugestão: `label` com “(Aux)” para evitar escolha errada).

---

## 4. BPM do concert ao aplicar preset sincronizado

O app **já envia o andamento do concert ao motor** continuamente:

- `ConcertShell.tsx` chama `setHostClock(appStatus.tempo, compasso, …)` sempre que o tempo/playing muda;
- `Engine::setHostClock` (`engine/src/Engine.cpp:3599`) atualiza `masterClock` e `playHead`;
- o `playHead` é entregue aos plugins (`Engine.cpp:2992` e `3150`), com tempo e PPQ.

Comportamento do Delay do calfnxt (texto da própria UI, lido do bundle):

- `Sync` **ligado** e host com tempo válido → o delay segue o tempo da sessão; BPM/Beat ms/Tap ficam travados;
- host sem tempo válido → usa o BPM armazenado (parâmetro 4, default 120);
- `Sync` desligado → usa o BPM armazenado.

**Consequência para os presets:** não é preciso calcular ms no app. Para `dotted`, basta
`Sync = 1`, `Subdivide = 4` (4 passos por batida = semicolcheias) e `Time L = Time R = 3`
(3 semicolcheias = **1/8 pontuada**). Ao mudar o andamento do concert, o plugin acompanha sozinho.

Se algum dia for necessário o valor em ms no processo principal, ele está em
`ConcertState.tempo` (concert carregado no main) e no `Preset` via `changeTempoOnSelect`; mas a
recomendação é deixar o plugin sincronizar pelo host.

---

## 5. Itens que continuam “a confirmar”

Nenhum item bloqueante da P0 ficou em aberto. Restam apenas decisões de gosto (valores dos presets),
que pertencem à P2/P8:

- `Quality` do Reverb (0..2): o plugin não publica rótulos; manter o valor atual até ouvir.
- Glyphs do `Pulse Width` do Pulsator (⅛, ¼, ½, 1, 2) são rótulos de multiplicador do ciclo, não de figura musical.

---

## 6. Execução (P1–P7)

- **Fonte em valores reais:** `src/shared/effects/presets-src/<id-do-efeito>.json`
  (`{ effect, presets: [{ id, label, values: { "<parâmetro>": <valor real> } }] }`). Aceita o `id`,
  o nome do plugin ou o rótulo PT do parâmetro como chave.
- **Gerador:** `node scripts/generate-effect-presets.mjs` (grava) e `--check` (falha se o catálogo
  estiver desatualizado). Só o bloco `presets` é substituído; o resto dos JSONs fica intacto.
  Teste: `src/shared/effects/preset-generator.test.ts`.
- **Presets:** Reverb e Delay com versões insert e `-aux`; Chorus/Phaser/Flanger/Compressor/
  Transients/Expander/EQ/Guitarix com os novos presets da especificação.
- **Delay:** `Tempo` é a duração de uma batida; o delay final é `Tempo × Tempo L/R ÷ Subdivisão`.
  Nos presets sem sync: `Subdivisão 4`, `Tempo L/R 1` e `Tempo = 4 × valor desejado`; `dotted` usa
  `Sync 1`, `Subdivisão 4`, `Tempo 3` (1/8 pontuada) e segue o BPM do concert pelo host.
- **Teste de nível:** `node scripts/check-effect-presets.mjs` (ver seção 7).
- **Pendências:**
  - rodar o teste de nível completo (abre o áudio e toca a nota de teste; ~20 min);
  - P8 (escala de ouvido);
  - template “Guitarra”: acrescentar `Expander guitar-gate` e Aux `room-aux`/`echo-aux` exige
    referenciar inserts calfnxt por nome e resolver o caminho no momento de criar o concert
    (hoje o template só conhece as URIs do Guitarix).

## 7. Teste de nível (P6)

`scripts/check-effect-presets.mjs`:

1. abre o DirectSound, carrega o Preseter Organ no layer `p6` e o efeito no insert 0;
2. grava o mesmo trecho com o insert em bypass (referência) e com cada preset;
3. mede RMS do corpo, pico e cauda (último 1 s) e compara:
   - tonal: |RMS − bypass| ≤ 3 dB;
   - pico ≤ −1 dBFS;
   - cauda ≤ −60 dBFS;
   - sem NaN/Inf.
4. efeitos de dinâmica/guitarra e presets `-aux` passam só por pico/cauda/NaN.

Opções: `--effect <id>`, `--preset <id>`, `--body <s>`, `--tail <s>`.


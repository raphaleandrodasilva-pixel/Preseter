# B3 — Candidatos do Guitarix (plugin embarcado com painel Preseter)

> **Somente pesquisa e relatório.** Nada compilado, copiado ou adicionado ao repositório.
> Abordagem escolhida: **opção 1** — embarcar os bundles **LV2** do Guitarix e apresentá-los com o
> painel/presets/MIDI do Preseter (mesmo padrão do calfnXT). **Não é porte de DSP.**
> Base: `docs/MAPA-GUITARIX.md` (B1) e `docs/B2-GUITARIX-LV2.md` (B2).

## 1. Critérios

1. **Cobrir a cadeia de guitarra**: amp (com cabine) + cabine isolada + drive.
2. **Dependências pequenas primeiro**: evitar zita/FFTW no primeiro lote.
3. **Poucos parâmetros**: painel e presets saem rápido (os nomes dos ports vieram dos `.ttl`).
4. **Risco de build**: zita-convolver/resampler e IR só onde há ganho real.
5. **Integração com o catálogo** `src/shared/effects/catalog.ts` (nomes Preseter, presets, MIDI).

## 2. Candidatos recomendados

| # | Módulo | Nome no app | Parâmetros (ports de controle) | DSP próprio | Com includes | Dependências | Esforço | Risco |
|---|---|---|---|---|---|---|---|---|
| 1 | `gx_amp` | **Preseter Amp** | MasterGain, PreGain, Distortion, Drive, Middle, Bass, Treble, Cabinet, Presence, Model, Tonestack Model, Cab Model, HIGHGAIN, Post trim (~14; 16 ports de controle no `.ttl`, sem `Control`/`Notify`/`SCHEDULE`) | 29,3 KB / 986 linhas | 735,3 KB / 19.152 | zita-conv, zita-resamp, IR, valve | **M** | build zita/IR + CPU |
| 2 | `gx_cabinet` | **Preseter Cab** | Cabinet, Bass, Treble, Cab Model (4) | 20,3 KB / 686 | 151,8 KB / 2.201 | zita-conv, zita-resamp, IR | **M** | build zita/IR |
| 3 | `gx_studiopre` | **Preseter Preamp** | Bright, Volume, Bass, Middle, Treble, Master (6) | 8,1 KB / 283 | 95,6 KB / 2.057 | faust-c++ | **P** | baixo |
| 4 | `gxts9` | **Preseter Overdrive** | Level, Tone, Drive (3) + bypass | 13,2 KB / 462 | 23,9 KB / 812 | faust-c++ | **P** | baixo |
| 5 | `gx_tremolo` | **Preseter Tremolo** | Dry/Wet, Mode, Depth, Freq (4) | 7,9 KB / 273 | 20,5 KB / 704 | faust-c++ | **P** | baixo |

Alternativas equivalentes de baixo custo: `gx_compressor` (Attack, Release, Threshold, Ratio, Knee —
6 ports), `gx_phaser` (Dry/Wet, Level, Speed), `gx_reverb` (Dry/Wet, LFO, Roomsize, Damp, Mode).

> Nomes: evitar marca registrada (ex.: “Tube Screamer”); “Preseter Overdrive” resolve.

## 3. Ordem sugerida

**Lote 1 — validação (2 módulos, sem zita):**
`gxts9` e `gx_studiopre` (ou `gx_compressor`). São os mais baratos e provam o fluxo completo:
build LV2 → scan → insert → painel → preset → estado no patch.

**Lote 2 — o coração (2 módulos, com zita/IR):**
`gx_cabinet` e `gx_amp`. Exigem o build com `--includeconvolver --includeresampler` e o
`cab_data`/IR (a cabine já vai embutida; os IRs externos ficam para depois).

**Lote 3 — acabamento:**
`gx_tremolo` (ou `gx_compressor`), painéis e presets afinados.

## 4. O que cada candidato precisa do app

- **Catálogo**: entrada com caminho do bundle `.lv2`, nome Preseter, subtítulo e parâmetros.
  `effectKey()` precisa remover `.lv2` do caminho.
- **Presets**: 3–4 por efeito, lidos dos ports reais (como no calfnXT).
- **Painel**: o `PreseterEffectWindow` atual; badge “GUITARIX”; bypass quando existir.
- **MIDI**: já funciona por `paramOwner` + `paramSlot` (nenhuma mudança).
- **Créditos**: “Guitarix — Hermann Meyer, Andreas Degert, Pete Shorthose e colaboradores —
  GPL-3.0-or-later” (A2).

## 5. Riscos e pendências

| Risco | Mitigação |
|---|---|
| LV2 não validado no motor | spike com `gxts9` antes de qualquer catálogo |
| Build Windows (MSYS2/MinGW) | job de CI com `msys2/setup-msys2`; artefato `.lv2` |
| Build Linux | nativo (waf) no runner Ubuntu |
| UI original xputty/X11 | não usar; painel Preseter cobre |
| CPU do `gx_amp` (convolução + 4x resample) | medir no spike; limite de IR/preset |
| Tamanho do bundle (`cab_data` 112,7 KB) | aceitável, vai dentro do `.lv2` |
| Licença GPL-3+ | atribuição (A2) e fonte disponível — nada bloqueia |
| Nomes/marca | “Preseter Overdrive” em vez de “Tube Screamer” |

**CPU: `a confirmar`** — só medindo com um bundle compilado.

## 6. Conclusão

Os 5 candidatos cobrem o caso de uso (amp + cab + pré + drive + modulação), sendo **3 deles de
esforço P** e sem dependências pesadas. O caminho mais seguro é validar com **`gxts9`** e depois
levar `gx_amp`/`gx_cabinet`.

**Próximo passo:** B4 — plano de empacotamento (build, pastas, catálogo, painéis, presets, testes),
sem portar DSP. Aguardando o “ok”.

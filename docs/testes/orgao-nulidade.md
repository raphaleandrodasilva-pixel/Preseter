# Teste de nulidade do órgão (setBfree)

Data: 2026-11-15

## Objetivo

Provar que o `Preseter Organ` executa o **mesmo caminho de DSP** do setBfree,
sem aproximações próprias, e medir a diferença.

## Montagem

- setBfree: commit `2f41983b5b535bda9b1b1db38a06da29d50ff557`
  (`engine/third_party/setbfree/UPSTREAM.md`).
- Arquivos C importados sem alteração de código.
- Wrapper do Preseter: `engine/src/native/SetBfreeOrganProcessor.cpp`.
- Referência: `engine/test/setbfree-nullity/reference.c` (transliteração do
  caminho de `b_synth/lv2.c`).
- Taxa: 48 kHz. Bloco: 512 amostras. Buffers internos: 128 amostras.
- Parâmetros: barras `888600000`, percussão ligada (normal/rápida/2º),
  vibrato V1, Leslie lento, overdrive 0.15, reverb 0.2, key click 0.3,
  volume 0.82.
- MIDI: acorde de 4 notas + trocas de nota a cada 9000 amostras, 6 segundos.
- `rand()` semeado igual nos dois lados (key-click).

## Resultado

Saída do harness (pico já no wrapper, antes do ganho de saída do Preseter):

| Caso | Pico | Dif. máx | Dif. RMS | Resultado |
|---|---|---|---|---|
| 888000000 + Leslie lento | 0.1922 | 0.000000000 | −1000 dBFS | PASS |
| 008800000 + Leslie rápido | 0.1112 | 0.000000000 | −1000 dBFS | PASS |
| percussão (2º, normal, rápida) | 0.2419 | 0.000000000 | −1000 dBFS | PASS |
| overdrive alto (1.0) | 1.2084 | 0.000000000 | −1000 dBFS | PASS |
| clean (overdrive 0) | 4.0276 | 0.000000000 | −1000 dBFS | PASS |
| 888888888 + volume máximo | 0.2243 | 0.000000000 | −1000 dBFS | PASS |

Todos os casos são **bit a bit iguais** (diferença exatamente zero). O critério
(< −90 dBFS) é atendido com folga.

## Nível de saída e overdrive

O setBfree tem `outputLevelTrim` interno de 0.07, e o estágio de overdrive
muda muito de nível conforme o `character` (a curva altera o feedback). Medido
com `--sweep-overdrive` (acorde de 4 notas, volume 0.82):

| Overdrive | character | pico cru | RMS cru |
|---|---|---|---|
| 0.00 (clean) | — | 3.166 | −15.0 dBFS |
| 0.10 | 13 | 0.180 | −31.8 dBFS |
| 0.20 | 25 | 0.146 | −37.0 dBFS |
| 0.30 | 38 | 0.135 | −35.6 dBFS |
| 0.50 | 64 | 0.179 | −28.2 dBFS |
| 0.70 | 89 | 0.270 | −24.2 dBFS |
| 0.85 | 108 | 0.443 | −18.9 dBFS |
| 1.00 | 127 | 1.307 | −9.6 dBFS |

Por isso o Preseter aplica um **ganho de saída calibrado por valor de
overdrive** (`SetBfreeOrgan::outputTrim` em
`engine/src/native/SetBfreeOrganProcessor.cpp`), com rampa entre blocos e
limite em ±1.0. O objetivo é manter o pico em ~0.5 no volume 0.82. Esse ganho
é **posterior à cadeia**: não altera o DSP nem o timbre, e o teste de nulidade
mede o wrapper antes dele.

A tabela é empírica (mesmo sinal de teste do harness). Para recalibrar, rode
`PreseterSetBfreeNullity.exe --sweep-overdrive` e atualize os pontos.

## Como repetir

Ver `engine/test/setbfree-nullity/README.md`.

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

| Métrica | Valor |
|---|---|
| Pico (wrapper / referência) | 0.181669 / 0.181669 |
| RMS (wrapper / referência) | −36.03 / −36.03 dBFS |
| Diferença máxima | 0.000000000 |
| RMS da diferença | −1000 dBFS (zero) |
| Critério (< −90 dBFS) | **PASS**, bit a bit |

Com `--max-level` (nove barras em 8, volume 1.0): pico 0.224267 nos dois lados,
diferença zero.

## Nível de saída

O setBfree tem `outputLevelTrim` interno de 0.07, então a saída crua é baixa.
O Preseter aplica um **trim fixo de +12 dB depois da cadeia** (constante
`kOrganOutputTrim` em `NativeProcessor.cpp`) e limita a ±1.0. Esse trim não
altera o timbre nem a cadeia do setBfree; o teste de nulidade mede o wrapper
antes dele.

## Como repetir

Ver `engine/test/setbfree-nullity/README.md`.

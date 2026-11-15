# Teste de áudio do Wurly (OpenWurli)

Data: 2026-11-15

## Objetivo

Verificar que a biblioteca Rust do OpenWurli, compilada pela C ABI e ligada ao
`PreseterEngine`, gera áudio. Diferente do órgão e do Tines, **não é um teste
de nulidade**: o objetivo é validar a integração e servir de referência de
nível.

## Montagem

- Código: `engine/third_party/openwurli/`, commit
  `c05403b9b60f95b4908ae19727682e81803a7351` (v0.9.1, GPL-3.0-or-later).
- C ABI: `engine/third_party/openwurli/capi/`, crate `openwurli-capi`.
- Teste: `engine/test/openwurli-capi/main.cpp` (`PreseterWurliSmoke`).
- 48 kHz, blocos de 512 amostras, 5 segundos (2 s de ataque + 3 s de release).
- Parâmetros: volume 0.8, tremolo 0.5, speaker 0, MLP desligado.
- MIDI: notas 40, 52, 59 e 64, velocity 0.85.
- Saída com o mesmo alinhamento de **+14 dB** do plugin original.

## Resultado

| Métrica | Valor |
|---|---|
| Pico | 0.285323 |
| RMS | −26.04 dBFS |

WAV de referência gerado em `engine/build/wurly-openwurli-demo.wav` (não
versionado).

## Como repetir

```sh
cmake -S engine -B engine/build -DPRESETER_BUILD_WURLI_SMOKE=ON
cmake --build engine/build --config Release --target PreseterWurliSmoke
engine/build/Release/PreseterWurliSmoke --out-dir=<pasta-de-saída>
```

No Linux/macOS o executável fica em `engine/build/PreseterWurliSmoke`.

## Limitações

- O `WurliEngine` renderiza em mono; a C ABI duplica a amostra em L/R.
- O teste não cobre o editor gráfico do plugin original (não faz parte do
  Preseter).
- O CC1 é testado pelo smoke do motor (`scripts/engine-epianos-smoke.js`) e
  pela janela do instrumento, não por este render offline.

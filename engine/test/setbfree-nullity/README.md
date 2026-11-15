# Teste de nulidade — Preseter Organ (setBfree)

Compara o áudio do wrapper C++ usado pelo Preseter
(`engine/src/native/SetBfreeOrganProcessor.cpp`) com uma referência em C
(`engine/test/setbfree-nullity/reference.c`) que reproduz o caminho de áudio do
`b_synth/lv2.c` do setBfree: `allocSynth` → `initSynth` → `run`/`synthSound`
→ `oscGenerateFragment` → `preamp` → `reverb` → `whirlProc3`.

Os dois lados usam **os mesmos arquivos C** importados em
`engine/third_party/setbfree/` (commit `2f41983…`), o mesmo bloco de 512
amostras, a mesma sequência MIDI e a mesma semente de `rand()` (o setBfree usa
`rand()` para o ruído de key-click).

> Escopo: este teste prova que a integração C++ (buffers internos de 128
> amostras, ordem da cadeia e temporização dos eventos) é bit a bit igual ao
> caminho de referência. O próprio DSP é o código original do setBfree.

## Como rodar

```powershell
cmake -S engine -B engine/build -DPRESETER_BUILD_SETBFREE_NULLITY=ON
cmake --build engine/build --config Release --target PreseterSetBfreeNullity
engine/build/Release/PreseterSetBfreeNullity.exe --out-dir=.
```

Saída esperada:

```
Pico: wrapper ...  referencia ...
RMS:  wrapper ... dBFS  referencia ... dBFS
Diferenca maxima: 0.000000000 (-240.00 dBFS)
RMS da diferenca: -1000.00 dBFS
Resultado: PASS (< -90 dBFS)
```

Como os dois lados são bit a bit iguais, a diferença é exatamente zero
(`-240 dBFS` é o piso usado para `log10(0)`, e `-1000 dBFS` idem para RMS).

O teste grava `organ-wrapper.wav` e `organ-reference.wav` (float 32) no
diretório indicado em `--out-dir`.

`--max-level` usa as nove barras em 8 e volume 1.0, para medir o nível máximo.

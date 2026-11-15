# Teste de nulidade — Preseter Tines (MDA ePiano)

Compara o DSP usado pelo Preseter (`MdaEPianoDsp`) com o
`MDAEPianoAudioProcessor` original do porte JUCE MIT do MDA ePiano
(`hollance/mda-plugins-juce`, commit `5527024…`).

## Como rodar

```powershell
cmake -S engine -B engine/build -DPRESETER_BUILD_TINES_NULLITY=ON
cmake --build engine/build --config Release --target PreseterTinesNullity
engine/build/PreseterTinesNullity_artefacts/Release/PreseterTinesNullity.exe --out-dir=.
```

O teste:

- usa os mesmos samples (`mdaEPianoData.h`), parâmetros, MIDI e blocos de 512
  amostras;
- envia CC7 (volume) e notas em várias regiões;
- grava `tines-preseter.wav` e `tines-mda.wav` (float 32);
- mede a diferença amostra a amostra.

O CC1 não entra no teste de nulidade porque o Preseter **corrige** o
comportamento do porte original: lá o mod wheel era esquecido no bloco
seguinte; aqui ele persiste. O modo `--cc1` verifica isso:

```
CC1=127 -> modWheel 0.991
bloco seguinte (sem CC1) -> modWheel 0.991
CC1=0 -> modWheel 0.000
```

## Resultado

| Métrica | Valor |
|---|---|
| Pico | 1.604820 |
| RMS | −20.88 dBFS |
| Diferença máxima | 0.000493407 (−66.14 dBFS) |
| RMS da diferença | −95.11 dBFS |
| Critério (< −90 dBFS) | **PASS** |

A diferença é inaudível (RMS −95 dBFS). Ela vem de arredondamentos de
parâmetros/conversão entre o APVTS do porte e o DSP do Preseter; o algoritmo,
os samples e a cadeia são os mesmos.

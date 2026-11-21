# Teste de nulidade e áudio — Preseter Drums

Confere, no `DrumKitEngine`:

- **silêncio** (pico 0) sem nota;
- **áudio não nulo** ao tocar a nota 36 (bumbo);
- **silêncio** depois de `allNotesOff`;
- **mudo** por pad (nota não toca) e **solo** (só o pad em solo toca).

Usa o kit `MuseScore_General.sf2` (banco 128, programa 0), o mesmo da Coleção. O teste não baixa
nem embute o arquivo: ele precisa estar instalado pela Loja/pasta de sons.

## Como rodar

```powershell
cmake -S engine -B engine/build -DPRESETER_BUILD_DRUMS_NULLITY=ON
cmake --build engine/build --config Release --target PreseterDrumsNullity
engine/build/PreseterDrumsNullity_artefacts/Release/PreseterDrumsNullity.exe
```

Ou com o kit em outro caminho:

```powershell
engine/build/PreseterDrumsNullity_artefacts/Release/PreseterDrumsNullity.exe --kit="C:\caminho\MuseScore_General.sf2"
```

Sem o kit, o teste imprime `SKIP` e sai com código 2.

## Saída esperada (resumo)

```
sem nota: pico 0.000000000 | RMS 0.000000000
nota 36: pico 0.9... | RMS 0.0...
apos all-notes-off: pico 0.000000000
pad 0 em mudo: pico 0.000000000
solo no pad 2: 36 -> 0.000000000 | 38 -> 0.8...
Resultado: PASS
```

O pico exato depende do volume do kit; o critério é silêncio digital sem nota/em mudo e pico
> 1e-4 com nota.

# setBfree (DSP import)

Código importado do projeto **setBfree** para servir de motor do instrumento
nativo `preseter.organ` (o mesmo DSP usado pelo plugin setBfree).

## Origem

- Repositório: https://github.com/pantherb/setBfree
- Commit: `2f41983b5b535bda9b1b1db38a06da29d50ff557`
- Data do commit: 2026-09-08
- Licença: GNU GPL, versão 2 ou posterior (`GPL-2.0-or-later`).
  O texto completo está em `COPYING`.
  O Preseter é distribuído sob AGPL-3.0-or-later, que é compatível com
  GPL-2.0-or-later para este uso.

## Arquivos copiados (sem alterações de código)

De `src/`:

- `tonegen.c`, `tonegen.h`
- `vibrato.c`, `vibrato.h`
- `midi.c`, `midi.h`, `midi_types.h`
- `cfgParser.c`, `cfgParser.h`
- `program.c`, `program.h`, `defaultpgm.h`
- `state.c`, `state.h`
- `pgmParser.c`, `pgmParser.h`
- `memstream.h`
- `global_inst.h`, `main.h`

De `b_whirl/`:

- `whirl.c`, `whirl.h`
- `eqcomp.c`, `eqcomp.h`

De `b_overdrive/`:

- `overdrive.c`, `overdrive.h`

De `b_reverb/`:

- `reverb.c`, `reverb.h`

## O que NÃO foi copiado

Interfaces que não pertencem ao DSP: JACK/ALSA, LV2, UI (`robtk`, `pugl`),
modgui e scripts de build do projeto original.

## Adaptações do Preseter (fora dos arquivos originais)

- `compat/`: shims de compilação para MSVC (headers POSIX vazios,
  `strcasecmp`, `fmemopen` via arquivo temporário).
- `glue/setbfree_glue.c`: `mainConfig`/`mainDoc` mínimos exigidos pelo
  `cfgParser.c`. Nada do DSP é alterado.
- `engine/src/native/SetBfreeOrganProcessor.cpp`: wrapper que reproduz
  exatamente a ordem de chamadas do `b_synth/lv2.c` (`allocSynth` →
  `initSynth` → `oscGenerateFragment` → `preamp` → `reverb` → `whirlProc3`).

## Nullity test

Ver `engine/test/setbfree-nullity/README.md`.

# Licenças e atribuições

## Preseter

AGPL-3.0-or-later.

## setBfree — motor do Preseter Organ

O instrumento nativo **Preseter Organ** usa o DSP do projeto setBfree.

- Projeto: https://github.com/pantherb/setBfree
- Commit fixado: `2f41983b5b535bda9b1b1db38a06da29d50ff557` (2026-09-08)
- Licença: GNU General Public License, versão 2 ou posterior
  (`GPL-2.0-or-later`), conforme cabeçalho dos arquivos importados.
- Texto completo: `engine/third_party/setbfree/COPYING`
- Arquivos importados e adaptações: `engine/third_party/setbfree/UPSTREAM.md`

Compatibilidade: o Preseter é distribuído sob AGPL-3.0-or-later. A GPL-2.0-or-later
permite esse uso; os arquivos originais mantêm seus avisos de copyright e a
licença GPL. O código-fonte completo do Preseter (incluindo o wrapper e as
adaptações em `engine/third_party/setbfree/compat/` e `glue/`) é distribuído
junto com o aplicativo.

Autores originais do setBfree (cabeçalhos preservados):

- Fredrik Kilander
- Robin Gareus
- Will Panther
- Ken Restivo
- demais contribuidores listados em `engine/third_party/setbfree/COPYING`
  e nos cabeçalhos de cada arquivo.

## MDA ePiano — motor do Preseter Tines

O instrumento nativo **Preseter Tines** usa o DSP e os samples do mda ePiano.

- Código original: **mda ePiano**, Copyright (c) 2008 Paul Kellett.
- Porte JUCE: https://github.com/hollance/mda-plugins-juce
- Commit fixado: `552702479a9eac534f3abbf6e878a5eab473e0cb` (2026-02-25)
- Licença: MIT (`engine/third_party/mda-epiano/LICENSE`).
- Arquivos, samples e adaptações: `engine/third_party/mda-epiano/UPSTREAM.md`.
- O mda ePiano original pode ser licenciado como MIT ou GPL-2.0-or-later;
  escolhemos MIT, compatível com a AGPL-3.0-or-later do Preseter.
- Os samples (`mdaEPianoData.h`) fazem parte da distribuição do porte MIT e são
  usados com atribuição a Paul Kellett e M.I. Hollemans.

## OpenWurli — motor do Preseter Wurly

O instrumento nativo **Preseter Wurly** usa o DSP do projeto OpenWurli.

- Projeto: https://github.com/hal0zer0/openwurli
- Commit fixado: `c05403b9b60f95b4908ae19727682e81803a7351` (v0.9.1, 2026-11-06)
- Licença: GNU General Public License, versão 3 ou posterior
  (`GPL-3.0-or-later`).
- Texto completo: `engine/third_party/openwurli/LICENSE`
- Arquivos importados e adaptações: `engine/third_party/openwurli/UPSTREAM.md`
- Dependência `melange-primitives` (projeto melange, commit
  `7ecb36c7e237c66929a39f936734b8b5a63f128d`), também GPL-3.0-or-later.

Compatibilidade: o Preseter é distribuído sob AGPL-3.0-or-later, e a GPLv3 §13
permite combinar os dois. O DSP original é compilado como biblioteca estática
(Rust) e chamado por uma C ABI; nenhum arquivo do OpenWurli foi alterado. O
código-fonte completo do Preseter, incluindo o wrapper e o crate da C ABI, é
distribuído junto com o aplicativo.

# OpenWurli (DSP import)

Código importado do projeto **OpenWurli** para servir de motor do instrumento
nativo `preseter.reeds` (**Preseter Wurly**). O DSP é o mesmo usado pelo plugin
OpenWurli; o Preseter apenas o chama por uma C ABI.

## Origem

- Repositório: https://github.com/hal0zer0/openwurli
- Commit: `c05403b9b60f95b4908ae19727682e81803a7351`
- Tag/versão: `v0.9.1` ("RestlessHeart")
- Data do commit: 2026-11-06
- Licença: GNU GPL, versão 3 ou posterior (`GPL-3.0-or-later`). O texto
  completo está em `LICENSE`.
- O Preseter é distribuído sob AGPL-3.0-or-later, compatível com a
  GPL-3.0-or-later para este uso.

O `openwurli-dsp` usa `melange-primitives`, do projeto **melange**:

- Repositório: https://github.com/hal0zer0/melange
- Commit: `7ecb36c7e237c66929a39f936734b8b5a63f128d`
- Versão: `0.1.7`
- Licença: GPL-3.0-or-later (a mesma do OpenWurli).

## Arquivos copiados

De `crates/openwurli-dsp/` (código DSP original, sem alterações):

- `Cargo.toml`
- `src/*.rs` e `src/dk_preamp/*.rs`
- `tests/*.rs` (testes originais, mantidos para referência)

De `crates/melange-primitives/`:

- `src/*.rs` (código original, sem alterações)
- `Cargo.toml` reescrito para este workspace (versão `0.1.7`, edition 2021);
  o conteúdo é equivalente ao `Cargo.toml` do projeto melange.

Não foi importado o crate `openwurli-plugin` (UI/nih-plug), nem os netlists
SPICE, documentos ou ferramentas do repositório.

## Adaptações do Preseter

Nenhum arquivo de DSP foi modificado. As adições ficam fora do código original:

- `Cargo.toml` (raiz): workspace Cargo que reúne `crates/openwurli-dsp` e
  `capi`, com `panic = "abort"` no perfil release.
- `capi/`: crate `openwurli-capi` com uma C ABI fina em volta do
  `WurliEngine` (`ow_create`, `ow_note_on`, `ow_render`, `ow_set_*` etc.).
  É compilada como `staticlib` e ligada ao `PreseterEngine`.
- `engine/src/native/WurliProcessor.cpp` e `.h`: wrapper C++/JUCE que traduz
  parâmetros e MIDI para a C ABI e aplica o mesmo alinhamento de saída de
  **+14 dB** do plugin original (`OUTPUT_ALIGNMENT_DB`).
- `engine/src/native/openwurli_capi.h`: declarações da C ABI.

O `ow_render` do `WurliEngine` é mono; a C ABI copia a mesma amostra para os
dois canais. O plugin original faz o mesmo fan-out.

## Como compilar

Requer Rust stable 1.85+ (`https://rustup.rs`). O CMake procura o `cargo` em
`%USERPROFILE%\.cargo\bin` e no `PATH`.

```sh
cargo build -p openwurli-capi --release \
  --manifest-path engine/third_party/openwurli/Cargo.toml
```

A biblioteca gerada é `target/release/openwurli_capi.lib` (Windows) ou
`libopenwurli_capi.a` (Linux/macOS). O `engine/CMakeLists.txt` compila esse
alvo automaticamente antes do `PreseterEngine`.

## Teste de áudio

`engine/test/openwurli-capi/main.cpp` renderiza um acorde de Wurlitzer sem
JUCE e grava um WAV. Configure o CMake com `-DPRESETER_BUILD_WURLI_SMOKE=ON`
e rode `PreseterWurliSmoke`.

Resultado de referência em 48 kHz (acorde 40/52/59/64, velocity 0.85,
volume 0.8, tremolo 0.5): pico 0.285323, RMS −26.04 dBFS.

## Compatibilidade de licença

O Preseter é AGPL-3.0-or-later. A GPLv3 §13 permite combinar código
GPL-3.0-or-later com AGPLv3; o código-fonte completo do Preseter (incluindo
este import e o wrapper) é distribuído junto com o aplicativo. Os avisos de
copyright e o texto da GPLv3 são preservados em `LICENSE`.

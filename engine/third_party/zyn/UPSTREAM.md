# ZynAddSubFX (porte nativo do Preseter)

- Projeto: ZynAddSubFX
- Autor: Nasca Octavian Paul e contribuidores
- Versão portada: 3.0.7 (`master` c379439)
- Licença: GPL-2.0-or-later (ver `COPYING`)
- Origem: https://github.com/zynaddsubfx/zynaddsubfx

## O que foi portado

Apenas o núcleo de um instrumento (`Part`), sem `Master`, `MiddleWare`, UI
(FLTK/NTK/Zest), OSC/liblo, Nio ou controladores de áudio externos.

- `src/DSP`, `src/Params`, `src/Synth`, `src/Effects`, `src/Containers`
- `src/Misc/Part`, `Allocator`, `Microtonal`, `XMLwrapper`, `Util`, `Time`, `Sync`
- `src/globals.h` e `src/zyn-version.h` gerado

## Alterações do porte

- `FFTwrapper` usa `juce::dsp::FFT` (sem FFTW). A inversa é multiplicada pelo
  tamanho da FFT para manter a convenção sem escala do FFTW.
- `XMLwrapper` lê/grava gzip com `GZIPDecompressorInputStream` /
  `GZIPCompressorOutputStream` do JUCE (sem zlib externo). A leitura passa
  `GZIPDecompressorInputStream::gzipFormat` explicitamente: o default do JUCE é
  `zlibFormat`, que não reconhece os `.xiz` gzip (magic `1f 8b`).
- `Part::activeVoices()` adicionado para o rodapé do painel.
- O alocador do `Part` no Preseter (`ZynFactory.cpp`) usa uma arena TLSF de 8 MB
  criada fora da thread de áudio; o `NoteOn` não chama mais `malloc`/`free`.
- `OscilGen` reserva um buffer para as harmônicas adaptativas no construtor;
  `adaptiveharmonic`/`adaptiveharmonicpostprocess` não usam mais `new[]` no
  caminho de nota.
- Os avisos de `Part` que usavam `std::cerr`/`fprintf` no NoteOn foram removidos
  (nada de I/O na thread de áudio).
- Nenhuma alteração no DSP, nos parâmetros ou no formato `.xiz`.

## Dependências embutidas

- `rtosc` (MIT) — ver `rtosc/LICENSE`.
- `mxml` 4.0.6 (Apache-2.0) — ver `mxml/LICENSE`.

## Presets

`vendor/zyn/banks` contém os bancos `.xiz` do repositório
`zynaddsubfx/instruments` (commit c5c9121), distribuídos pelo projeto original.
Presets do usuário podem ser importados pela interface e ficam em
`<userData>/Zyn/Presets`.

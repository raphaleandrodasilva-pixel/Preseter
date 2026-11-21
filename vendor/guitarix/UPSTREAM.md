# Guitarix (importação — LV2 embarcado)

Base dos cinco efeitos de guitarra do Preseter:

| Efeito no Preseter | Módulo LV2 | URI |
|---|---|---|
| Preseter Overdrive | `gxts9.lv2` | `http://guitarix.sourceforge.net/plugins/gxts9#ts9sim` |
| Preseter Preamp | `gx_studiopre.lv2` | `http://guitarix.sourceforge.net/plugins/gx_studiopre#studiopre` |
| Preseter Cab | `gx_cabinet.lv2` | `http://guitarix.sourceforge.net/plugins/gx_cabinet#CABINET` |
| Preseter Amp | `gx_amp.lv2` | `http://guitarix.sourceforge.net/plugins/gx_amp#GUITARIX` |
| Preseter Tremolo | `gx_tremolo.lv2` | `http://guitarix.sourceforge.net/plugins/gx_tremolo#_tremolo` |

## Origem

- Projeto: https://github.com/brummer10/guitarix
- Commit: `2a357f6529c89a0c7b3fcd9a4d3c36d16b07c367` (2026-10-31)
- Módulos: `trunk/src/LV2/gxts9.lv2`, `gx_studiopre.lv2`, `gx_cabinet.lv2`, `gx_amp.lv2`,
  `gx_tremolo.lv2`
- Licença: **GPL-3.0-or-later** para o conjunto (`trunk/COPYING`, copiado como `COPYING.txt`).
  O código dos módulos é GPL-2.0-or-later; `zita-convolver` e `zita-resampler` são GPL-3.0+
  (por isso o conjunto sai como GPL-3.0-or-later). Não distribuímos o `abgate` (LGPL-3+).
- Autores: Hermann Meyer, James Warden, Andreas Degert, Pete Shorthose e colaboradores.

## Build (Windows)

- Toolchain: MSYS2 **UCRT64** (g++ 16.2.0). O README do upstream cita `MinGW64`, mas o MSYS2 atual
  não distribui mais esse ambiente.
- Configure (no `trunk/`):

  ```
  ./waf configure -j 4 --check-cxx-compiler=g++ --no-standalone --no-faust \
    --includeresampler --includeconvolver --no-avahi --no-bluez --no-nsm \
    --no-desktop-update --static-lib --no-lv2-gui
  ./waf build && ./waf install
  ```

- `--no-lv2-gui`: a UI original (xputty/X11) não é construída nem distribuída; o painel é o do
  Preseter. Sem essa flag o link da UI falha no Windows (`libxcairo.a` sem `-lcairo`).
- `--static-lib`: o `.so` não depende de DLLs do MSYS2 (só KERNEL32 + UCRT).

## Build (Linux)

- Toolchain: **Ubuntu 22.04** (Docker), `gcc-12`/`g++-12` (o NAM usa
  `std::atomic<std::shared_ptr>`, que o GCC 11 não implementa).
- Dependências (apt): `build-essential g++-12 gcc-12 git python3 pkg-config gperf intltool sassc
  libboost-dev libboost-iostreams-dev libboost-thread-dev libeigen3-dev libgtk-3-dev
  libgtkmm-3.0-dev libjack-jackd2-dev liblilv-dev liblrdf0-dev libsndfile1-dev libfftw3-dev
  lv2-dev libavahi-gobject-dev libbluetooth-dev`.
- Configure (mesmas flags do Windows, sem `--check-cxx-compiler`):

  ```
  export CC=gcc-12 CXX=g++-12
  ./waf configure --prefix=/tmp/gx --no-standalone --no-faust \
    --includeresampler --includeconvolver --static-lib --no-lv2-gui \
    --no-avahi --no-bluez --no-nsm --no-desktop-update
  ```

- **FFTW estático**: `gx_amp` e `gx_cabinet` usam o convolver (FFTW3 single). Para o pacote não
  depender de `libfftw3f.so.3`, o `fftw3f.pc` do configure aponta para o arquivo estático:

  ```
  Libs: /usr/lib/x86_64-linux-gnu/libfftw3f.a -lm
  ```

  Depois do configure, acrescentar o arquivo em `LDFLAGS` no cache do waf
  (`build/c4che/_cache.py`):

  ```python
  LDFLAGS = ['/usr/lib/x86_64-linux-gnu/libfftw3f.a']
  ```

  O waf monta a linha de link como `CXX ... <objetos> ... ${LIB} ${LDFLAGS}`; em `LIB` o arquivo
  apareceria **antes** dos objetos e o linker não puxaria os membros (símbolos `fftwf_*` ficariam
  indefinidos). Em `LDFLAGS` ele vem no fim e resolve.

- `./waf build -j$(nproc) && ./waf install` (com o cache editado, o build refaz só o link).
- Copiar apenas os cinco bundles de `/tmp/gx/lib/lv2` para `plugins-linux/`.

**Resultado Linux** (x86_64):

| Bundle | Tamanho | Dependências (`NEEDED`) |
|---|---|---|
| `gxts9` | 18 KB | `libstdc++`, `libm`, `libc` |
| `gx_studiopre` | 85 KB | `libstdc++`, `libm`, `libgcc_s`, `libc` |
| `gx_cabinet` | 2,33 MB | `libstdc++`, `libm`, `libgcc_s`, `libc` |
| `gx_amp` | 3,11 MB | `libstdc++`, `libm`, `libgcc_s`, `libc` |
| `gx_tremolo` | 15 KB | `libstdc++`, `libm`, `libgcc_s`, `libc` |

- Total ~5,4 MB; sem `libfftw3f`, `zita-*` ou `lilv` em runtime.
- Requer **glibc ≥ 2.34** (os dois com FFTW estático) — Ubuntu 22.04+; sem `TEXTREL`.
- Validação: `lv2ls` lista os 6 URIs (5 plugins + `gx_amp_stereo` do mesmo bundle); um host lilv
  mínimo com áudio + controle + atom + **worker#schedule** instanciou e processou 200 blocos nos
  cinco. `lv2apply` roda `gxts9`, `gx_studiopre` e `gx_tremolo`; `gx_cabinet` e `gx_amp` exigem
  `worker#schedule` (porta atom `SCHEDULE`) e são pulados por ele — o host do JUCE/Preseter
  fornece essa feature (os cinco carregaram e processaram no app no Windows).

## Arquivos importados

- `plugins-win/` — 5 bundles com `.so` Windows, `.ttl` e `manifest.ttl`.
- `plugins-linux/` — os mesmos 5 bundles com `.so` Linux x86_64.
- `COPYING.txt` — `trunk/COPYING` do commit acima.

## Adaptações do Preseter

- Nenhuma alteração no código do DSP; os módulos são usados como LV2.
- O painel, os presets e o mapeamento MIDI são do Preseter (catálogo
  `src/shared/effects/guitarix.json`).
- Escolhas (modelo do amp/tonestack/cabine, modo do tremolo) vêm dos `lv2:scalePoint` do `.ttl`.
- Estado do insert: o LV2 não expõe estado nativo; o Preseter salva/restaura um snapshot dos
  parâmetros (`params-base64:` em `VstManager`).
- O `gx_amp` e o `gx_cabinet` exigem a extensão LV2 **worker#schedule** e têm uma porta atom
  `SCHEDULE` (não é parâmetro).

## Licença e distribuição

- Manter `COPYING.txt` junto dos binários; o fonte correspondente é o commit acima com as flags e
  os ajustes de build registrados aqui (nenhum arquivo-fonte foi modificado).
- UI/Aplicativo GTK e o restante do Guitarix **não** fazem parte dos bundles.

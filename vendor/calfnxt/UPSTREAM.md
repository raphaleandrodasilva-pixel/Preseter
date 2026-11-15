# calfNXT — origem e modificações (fork do Preseter)

- Upstream: <https://github.com/boomshop/calfnxt>
- Versão base: **v2.17.0** (2026-11-12)
- Licença: **GPL-3.0-or-later** — texto em `COPYING.txt`; créditos em `COPYRIGHT.txt`
- Relação com o Preseter: o Preseter é AGPL-3.0-or-later e apenas **hospeda** estes VST3.
  A combinação é permitida pelo GPLv3 §13. Nenhum código do calfnXT está misturado ao
  código do Preseter.

## O que está vendorizado aqui

`plugins/` contém os bundles VST3 já compilados a partir do fork do Preseter
(`calfNXT-win`), **com as UIs originais** (React/AUX) embutidas em `Contents/Resources`.

Bundles incluídos (**nome e fabricante originais**: `calfNXT …`). Os mesmos 29 existem em
`plugins/` (Windows, DLL) e `plugins-linux/` (Linux, `.so` + `calfnxt-web-host`, compilados
em Ubuntu 22.04):

- `calfNXTEqualizer.vst3` — calfNXT Equalizer
- `calfNXTCompressor.vst3` — calfNXT Compressor
- `calfNXTDelay.vst3` — calfNXT Delay
- `calfNXTReverb.vst3` — calfNXT Reverb
- `calfNXTLimiter.vst3` — calfNXT Limiter
- `calfNXTDeesser.vst3` — calfNXT DeEsser
- `calfNXTFilter.vst3` — calfNXT Filter
- `calfNXTHarmonics.vst3` — calfNXT Harmonics
- `calfNXTChorus.vst3` — calfNXT Chorus
- `calfNXTPhaser.vst3` — calfNXT Phaser
- `calfNXTFlanger.vst3` — calfNXT Flanger
- `calfNXTCrusher.vst3` — calfNXT Crusher
- `calfNXTTransients.vst3` — calfNXT Transients
- `calfNXTExpander.vst3` — calfNXT Expander
- `calfNXTMbcomp.vst3` — calfNXT Multiband Compressor
- `calfNXTMblimiter.vst3` — calfNXT Multiband Limiter
- `calfNXTDenoiser.vst3` — calfNXT Denoiser
- `calfNXTTamer.vst3` — calfNXT Tamer
- `calfNXTImpulse.vst3` — calfNXT Impulse
- `calfNXTPulsator.vst3` — calfNXT Pulsator
- `calfNXTRingmodulator.vst3` — calfNXT Ringmodulator
- `calfNXTOctaver.vst3` — calfNXT Octaver
- `calfNXTBender.vst3` — calfNXT Bender
- `calfNXTTuner.vst3` — calfNXT Tuner
- `calfNXTStereo.vst3` — calfNXT Stereo
- `calfNXTSplit.vst3` — calfNXT Split
- `calfNXTAligner.vst3` — calfNXT Aligner
- `calfNXTAnalyzer.vst3` — calfNXT Analyzer
- `calfNXTElliptic.vst3` — calfNXT Elliptic

## Modificações aplicadas ao upstream

### 1. Build Windows com editor (WebView2)

O upstream só tem host de editor para Linux (GTK3 + WebKitGTK + XEmbed, processo
auxiliar). No Windows o editor roda **in-process** com WebView2, no HWND que o host
entrega ao `IPlugView::attached`.

| Arquivo | Mudança |
|---|---|
| `CMakeLists.txt` (raiz) | opção `CALFNXT_BUILD_UI` (default ON); em Windows não entra no `ui/` de helper Linux nem no `common/ui` Linux; alvos `${target}-resources` continuam valendo |
| `common/ui/CMakeLists.txt` | branch `WIN32`: compila `web_editor_win.cpp`, usa o SDK do WebView2 vendorizado e não exige X11/GTK/WebKit; `calfnxt_copy_web_host` vira no-op |
| `common/ui/web_editor.h` | membros/interface Linux isolados por `SMTG_OS_LINUX`; membros Win32 (`HWND`, COM, timer) por `SMTG_OS_WINDOWS`; `onTimer()` deixa de ser override de `Linux::ITimerHandler` |
| `common/ui/web_editor.cpp` | partes Linux (spawn/socket/X11/reap/env) isoladas por `#if SMTG_OS_LINUX`; viz em Windows vai como mensagem JSON (`{t:"viz",...}`) em vez de frames binários CNXV; `handleHelperLine` marca a página como viva no primeiro post |
| `common/ui/web_editor_win.cpp` | **novo**: host WebView2 (ambiente, controller, bridge JS, virtual host `calfnxt.local`, `WebMessageReceived`, `NavigationCompleted` → `_ready`, timer de 16 ms por instância, recálculo de DPI) |
| `common/ui/ui_file_log_win.h` | **novo**: log em `%LOCALAPPDATA%\Preseter\logs\calfnxt-ui.log` (equivalente ao `/tmp` do Linux) |
| `ui/scripts/build-plugins.mjs` | usa `node_modules/vite/bin/vite.js` via `process.execPath` (o `npx` sem shell não executa no Windows) |
| `common/ui/third_party/webview2/` | SDK Microsoft.Web.WebView2 1.0.2903.40 (NuGet) vendorizado, com `LICENSE.txt` |
| `dsp/impulse/source/impulse_dsp.cpp` | `mkdir` POSIX trocado por `_mkdir` no Windows (compila no MSVC) |

Nomes exibidos, fabricante e créditos permanecem os originais do upstream (`calfNXT`);
os bundles também mantêm `calfNXT*.vst3`.

O ambiente WebView2 é criado uma vez por módulo de plugin e reaproveitado entre aberturas
do editor (criar um ambiente novo logo após fechar o anterior pode falhar com
`CO_E_SERVER_EXEC_FAILURE` enquanto os processos do Edge encerram). Há também até 3
tentativas ao criar o controller.

Detalhes do host Windows:

- WebView2 serve o bundle por `https://calfnxt.local/` mapeado em `Contents/Resources`.
- A ponte JS é a mesma do Linux: `window.calfnxtNative.post` → `chrome.webview.postMessage`;
  host → página por `ExecuteScript` (`window.__calfnxtOnHost(...)`).
- `viewport` ajusta o retângulo do plugin pela escala do DPI (mesma lógica do
  `applyCssViewport` do Linux, sem a parte de socket XEmbed).
- Sem processo auxiliar: Edge já isola o renderer. O timer de UI usa `SetTimer` de thread
  (sem classe de janela), então várias instâncias no mesmo processo convivem.
- Se o runtime WebView2 não existir, o editor não abre mas o áudio/parâmetros continuam.

### 2. Nada foi alterado no DSP

O áudio permanece idêntico ao upstream. O `.vst3` passa no `validator` do VST3 SDK
(47 testes) no Windows x64.

## Como recompilar

```powershell
git clone --depth 1 --branch v2.17.0 https://github.com/boomshop/calfnxt.git calfnxt-win
cd calfnxt-win
git clone --depth 1 --recurse-submodules --shallow-submodules `
  https://github.com/steinbergmedia/vst3sdk.git external/vst3sdk

# UI (uma vez): node_modules + dist
cd ui; npm ci; cd ..

cmake -S . -B build-win -G "Visual Studio 17 2022" -A x64 -DCALFNXT_BUILD_UI=ON
cmake --build build-win --config Release --target `
  calfnxt-reverb calfnxt-reverb-resources `
  calfnxt-delay calfnxt-delay-resources `
  calfnxt-equalizer calfnxt-equalizer-resources `
  calfnxt-compressor calfnxt-compressor-resources --parallel 8
```

Saída: `build-win/VST3/Release/calfNXT*.vst3/` (DLL em `Contents/x86_64-win/`, SPA em
`Contents/Resources/`). Copie os `.vst3` para `vendor/calfnxt/plugins/`.

Requisitos: Visual Studio 2022 (C++ x64), CMake ≥ 3.25, Python 3 (codegen), Node.js 22+
(UI). O SDK do WebView2 já está vendorizado em `common/ui/third_party/webview2`.

## Pendências / próximos passos

- Todos os 29 bundles compilam e carregam no Windows (insert/parâmetros/estado/editor) —
  smoke test no engine: 29/29 com `page ready`, sem falhas.
- Bundles **Linux** gerados (Ubuntu 22.04, glibc 2.35): mesmos 29, com `.so` +
  `calfnxt-web-host`, em `vendor/calfnxt/plugins-linux`; empacotados no `extraResources`
  do Linux. O helper exige GTK 3 + WebKitGTK 4.1 no sistema.
- Pendente: testar `impulse` (diálogo de IR), `aligner` (8 canais no insert estéreo) e
  `tuner`/`analyzer` (visual) no fluxo real do app.
- Pendente: estado com a UI (salvar patch → trocar → voltar) e MIDI learn nos 29.

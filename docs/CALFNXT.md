# calfNXT no Preseter

Efeitos VST3 do projeto [calfNXT](https://github.com/boomshop/calfnxt) (sucessor do Calf
Studio Gear) empacotados com o Preseter.

## O que está incluído

| Plugin no Preseter | Bundle | Estado |
|---|---|---|
| calfNXT Equalizer | `calfNXTEqualizer.vst3` | áudio + painel + estado |
| calfNXT Compressor | `calfNXTCompressor.vst3` | áudio + painel + estado |
| calfNXT Delay | `calfNXTDelay.vst3` | áudio + painel + estado |
| calfNXT Reverb | `calfNXTReverb.vst3` | áudio + painel + estado |

Os quatro são **efeitos** (aparecem no seletor de insert, não como instrumento). Abra o
painel pelo botão **E** do slot de insert — é a UI original do calfnXT, rodando em
WebView2 dentro do engine (Windows) ou no helper GTK/WebKit (Linux).

## Onde ficam

- Desenvolvimento: `vendor/calfnxt/plugins/*.vst3`
- Instalado: `resources/plugins/calfnxt/*.vst3` (electron-builder `extraResources`)
- O scan do app inclui essa pasta automaticamente (`bundledPluginFolder` em
  `src/main/platform/paths.ts`); ela não aparece nas preferências do usuário.

## Como usar

1. Abra um patch com um instrumento (layer).
2. Clique num dos 4 slots de insert do channel strip.
3. Escolha `calfNXT Equalizer`, `calfNXT Compressor`, `calfNXT Delay` ou `calfNXT Reverb`.
4. Clique em **E** para abrir o painel; os knobs movem o áudio e os medidores animam.
5. Salve o patch: o estado (incluindo presets internos do painel) vai para `vstStates`.

Cada plugin guarda preferências de UI em
`%LOCALAPPDATA%\Preseter\calfnxt-webview` (Windows). O log do editor fica em
`%LOCALAPPDATA%\Preseter\logs\calfnxt-ui.log`.

## Escala / DPI

O painel se ajusta ao DPI do monitor automaticamente (a mesma lógica de `viewport` do
calfnXT). Para forçar uma escala, defina `CALFNXT_UI_SCALE` antes de abrir o Preseter
(ex.: `1.25`).

## Recompilar os plugins

Instruções completas em `vendor/calfnxt/UPSTREAM.md`. Resumo (Windows):

```powershell
cd ui; npm ci; cd ..
cmake -S . -B build-win -G "Visual Studio 17 2022" -A x64 -DCALFNXT_BUILD_UI=ON
cmake --build build-win --config Release --target calfnxt-plugins --parallel
```

Depois copie `build-win/VST3/Release/*.vst3` para `vendor/calfnxt/plugins/`.

## Licença

GPL-3.0-or-later. O Preseter apenas hospeda os plugins (VST3), o que é permitido pelo
GPLv3 §13 em conjunto com a AGPL-3.0 do app. Texto e atribuições:
`vendor/calfnxt/COPYING.txt`, `vendor/calfnxt/UPSTREAM.md` e `docs/LICENCAS.md`.
O SDK do WebView2 vendorizado no fork tem licença própria (`LICENSE.txt` no pacote NuGet).

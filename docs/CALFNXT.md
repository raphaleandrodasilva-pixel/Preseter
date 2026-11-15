# calfNXT no Preseter

Efeitos VST3 do projeto [calfNXT](https://github.com/boomshop/calfnxt) (sucessor do Calf
Studio Gear) empacotados com o Preseter. Eles aparecem com os **nomes e créditos
originais** (`calfNXT …`) e formato `Native` (vêm junto com o app, sem instalação).

## Plugins incluídos (29)

**Dinâmica**
- calfNXT Compressor
- calfNXT Expander
- calfNXT Multiband Compressor (`calfNXTMbcomp`)
- calfNXT Limiter
- calfNXT Multiband Limiter (`calfNXTMblimiter`)
- calfNXT DeEsser
- calfNXT Transients
- calfNXT Tamer
- calfNXT Denoiser

**EQ e filtro**
- calfNXT Equalizer
- calfNXT Filter
- calfNXT Elliptic

**Harmônicos / distorção**
- calfNXT Harmonics
- calfNXT Crusher

**Delay e reverb**
- calfNXT Delay
- calfNXT Reverb
- calfNXT Impulse (reverb por IR)

**Modulação**
- calfNXT Chorus
- calfNXT Phaser
- calfNXT Flanger
- calfNXT Pulsator
- calfNXT Ringmodulator

**Pitch**
- calfNXT Octaver
- calfNXT Bender
- calfNXT Tuner

**Utilidade e análise**
- calfNXT Stereo
- calfNXT Split
- calfNXT Aligner
- calfNXT Analyzer

Todos são **efeitos** (aparecem no seletor de insert, não como instrumento). Abra o painel
pelo botão **E** do slot de insert — é a UI original do calfnXT, rodando em WebView2
dentro do engine (Windows) ou no helper GTK/WebKit (Linux).

## Onde ficam

- Desenvolvimento, Windows: `vendor/calfnxt/plugins/*.vst3`
- Desenvolvimento, Linux: `vendor/calfnxt/plugins-linux/*.vst3` (`.so` + `calfnxt-web-host`)
- Instalado: `resources/plugins/calfnxt/*.vst3` (electron-builder `extraResources`, por plataforma)
- O scan do app inclui essa pasta automaticamente (`bundledPluginFolder` em
  `src/main/platform/paths.ts`); ela não aparece nas preferências do usuário.
- Plugins dessa pasta aparecem com `format: Native` (empacotados), mantendo fabricante
  `calfNXT` e o nome original.

No Linux o editor usa o helper `calfnxt-web-host`, que depende de **GTK 3** e
**WebKitGTK 4.1** instalados no sistema (o `.deb` recomenda `libgtk-3-0` e
`libwebkit2gtk-4.1-0`). Sem eles, o áudio/parâmetros funcionam, mas o painel não abre.
Os bundles Linux foram compilados em **Ubuntu 22.04** (glibc 2.35).

## Como usar

1. Abra um patch com um instrumento (layer).
2. Clique num dos 4 slots de insert do channel strip (layer, Master do Patch ou Aux).
3. Escolha um dos plugins `calfNXT …`.
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

Depois copie `build-win/VST3/Release/calfNXT*.vst3` para `vendor/calfnxt/plugins/`.

## Licença

GPL-3.0-or-later. O Preseter apenas hospeda os plugins (VST3), o que é permitido pelo
GPLv3 §13 em conjunto com a AGPL-3.0 do app. Texto e atribuições:
`vendor/calfnxt/COPYING.txt`, `vendor/calfnxt/UPSTREAM.md` e `docs/LICENCAS.md`.
Os nomes, o fabricante e os créditos originais foram mantidos; o autor do calfnXT está
sendo convidado a participar do projeto.
O SDK do WebView2 vendorizado no fork tem licença própria (`LICENSE.txt` no pacote NuGet).

# Preseter no Linux

O Preseter roda como app Electron x86_64, com o motor JUCE separado. O catálogo
da coleção mostra apenas os downloads do Linux; itens de Windows não aparecem.

## Dependências de build (Ubuntu/Debian)

```bash
sudo apt install build-essential cmake git pkg-config \
  libasound2-dev libjack-jackd2-dev \
  libfreetype6-dev libx11-dev libxext-dev libxinerama-dev \
  libxrandr-dev libxcursor-dev libgl1-mesa-dev
```

`libjack-jackd2-dev` é necessário para compilar o backend JACK. O JUCE carrega
`libjack.so.0` em runtime; para usar JACK, inicie `jackd` ou o PipeWire-JACK.

## Compilar

```bash
npm ci
npm run build:engine:linux
npm run typecheck
npm test
npm run build
npm run package:linux
```

O motor fica em `engine/build/PreseterEngine_artefacts/Release/PreseterEngine`.
Os pacotes saem em `release/` (`AppImage` e `.deb`).

## Áudio

- **ALSA** é o padrão.
- **JACK** aparece no seletor de driver quando o engine foi compilado com
  `PRESETER_ENABLE_JACK=ON` e o servidor está rodando.
- A taxa de amostragem e o buffer do JACK são definidos pelo servidor, não pelo
  Preseter.
- O modo de desempenho usa `cpupower` (`pkexec cpupower frequency-set -g performance`)
  e restaura o governor anterior ao desligar. Instale `linux-tools-common` e
  `linux-tools-generic` (ou o pacote `cpupower` da distro).
- Se `cpupower` não existir, o app tenta `powerprofilesctl` (power-profiles-daemon).

## Plugins

- VST3: `~/.vst3`, `/usr/lib/vst3`, `/usr/local/lib/vst3`.
- LV2: `~/.lv2`, `/usr/lib/lv2`, `/usr/local/lib/lv2`.
- A coleção instala VST3 em `~/.vst3` e LV2 em `~/.lv2`.
- Sforzando Linux é beta oficial e é instalado pelos `.deb` do ZIP da Plogue.
- Surge XT usa o `.deb` oficial.
- FSVR é copiado como VST3 para `~/.vst3`.

## Limitações conhecidas

- O modo de desempenho do Windows (`powercfg`) não existe no Linux; o painel
  mostra o governor do `cpupower`.
- O Sforzando é beta no Linux. Se um SFZ não carregar, confira o caminho dos
  samples no arquivo `.sfz`.
- Plugins de 32 bits exigem um host/engine de 32 bits.

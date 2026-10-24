# Licenças do Preseter

Decisão do projeto: o Preseter é **software livre / código aberto**.

## Licença do projeto: AGPL-3.0-or-later

Motivo: o motor usa o **JUCE**, que é AGPLv3 ou comercial. Sem licença comercial do JUCE,
o programa que o inclui precisa ser distribuído sob AGPLv3. O **ASIO SDK** da Steinberg
também tem opção GPLv3, compatível com a AGPLv3.

> O texto oficial da AGPL-3.0 está no arquivo `LICENSE` na raiz. Isto não é aconselhamento
> jurídico; confirme os termos nos sites oficiais.

## Dependências

| Componente | Uso | Licença |
|---|---|---|
| JUCE 8 | motor de áudio | AGPLv3 ou comercial |
| ASIO SDK (Steinberg) | backend ASIO no Windows | GPLv3 ou licença proprietária da Steinberg |
| VST3 SDK (via JUCE) | host de VST3 | confirmar na distribuição do JUCE |
| Electron, React, Vite, Tailwind etc. | aplicativo | em geral MIT (ver `node_modules`) |

O SDK do ASIO **não deve ser versionado** neste repositório: quem compila o motor baixa o
SDK e informa `-DPRESETER_ASIO_SDK_DIR`. O instalador leva só o motor já compilado.

## O que o instalador NÃO inclui

Plugins e bibliotecas de samples são de terceiros e cada um tem licença própria. O
Preseter só aponta para os downloads (`scripts/instalar-colecao.ps1`, `docs/PATCHES.md`).

- Salamander Grand Piano: CC BY 3.0 (atribuição a Alexander Holm).
- MuseScore_General: MIT. Sonatina Symphonic Orchestra: CC Sampling Plus 1.0.
- sforzando (Plogue): freeware, não redistribuir. SF2 Player (Bertom): gratuito, licença não informada.
- Samples da Nord: licença não confirmada; fora da coleção.

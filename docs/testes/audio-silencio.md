# Teste de silêncio do motor de áudio

Data: 2026-11-15

## Objetivo

Verificar que o `PreseterEngine` entrega silêncio digital quando nenhum patch
está carregado, em todos os backends do Windows. O ruído relatado ao abrir o
app era independente dos instrumentos nativos.

## Referência

O host **Element** (GPL-3.0-or-later) foi usado como referência de abertura de
dispositivo e callback:

- tag `v1.2.0`, commit `b6d9373ddbadc5f1da3ccb3479c4b20ff23707ac`;
- pacote `element-1.1.1.zip`;
- configuração do Element: `ASIO4ALL v2`, 44.1 kHz, 256 samples, 2 entradas +
  2 saídas, sem ruído.

## Mudanças aplicadas

- JUCE atualizado de **8.0.8** para **8.0.13**, a mesma versão do Element.
- ASIO passou a usar os headers **embutidos no JUCE**, como o Element; o SDK
  externo não é mais obrigatório.
- O engine fecha o dispositivo atual antes de reabrir, em vez de usar
  `setAudioDeviceSetup` em um ASIO/WASAPI já aberto.
- Abertura com `initialise(128, 128, xml, ...)`, sem forçar máscara de canais;
  entrada e saída do ASIO usam o mesmo nome (`ASIO4ALL v2`).
- Os canais de saída são zerados antes de o grafo processar.
- O `Engine` passou a ser o próprio callback de áudio/MIDI (modelo do
  `AudioEngine` do Element); o grafo é preparado em `audioDeviceAboutToStart`
  e liberado em `audioDeviceStopped`.
- O `AudioProcessorPlayer` foi removido do caminho de áudio.
- O scan de plugins no boot passou a ser **opcional** (padrão desligado). Com
  ele desligado, o app usa o cache `known-plugins.xml` e não carrega DLLs de
  VST dentro do processo do motor ao iniciar. O scan manual continua em
  Configurações → Plugins VST.

## Resultado

Todos os testes gravaram 3 s de silêncio e foram analisados com
`ffmpeg -af volumedetect`.

| Backend | Taxa / buffer | Canais | Pico / RMS |
|---|---|---|---|
| ASIO4ALL v2 | 44100 / 256 | 2 in + 2 out | −91,0 dB |
| Windows Audio | 48000 / 480 | 2 in + 2 out | −91,0 dB |
| Windows Audio (Exclusive) | 44100 / 256 | 2 in + 2 out | −91,0 dB |
| Windows Audio (Low Latency) | 48000 / 480 | 2 in + 2 out | −91,0 dB |

O valor −91 dB é o piso do medidor de 24 bits; o WAV é silêncio digital.

## Limite deste teste (2026-11-19)

O WAV vem do gravador **dentro do grafo**, antes do `AudioDeviceManager`. Ele
não enxerga o que o JUCE faz depois do callback. Por isso não pegou o ruído do
ASIO4ALL, causado por:

1. **Dois callbacks de áudio** (o `Engine` e o medidor de xruns, desde
   `313c100`). Com mais de um callback, o `AudioDeviceManager` soma na saída o
   `tempBuffer` dos extras. O medidor nunca escrevia nele, então lixo de
   memória ia para a placa. Agora há um único callback, como no Element.
2. **Entrada da placa ligada aos instrumentos.** Desde `4b9df84` o áudio abre
   com os canais padrão do driver; no ASIO4ALL isso abre também o
   microfone/line-in da Realtek, que entrava em todo VST com barramento de
   entrada. Agora a entrada só vai para efeitos carregados como layer (e para
   o strip de entrada, quando habilitado).

Validação de ruído precisa ser feita **ouvindo a saída da placa** (ou gravando
a saída com outro programa), não só com o WAV interno.

## Como repetir

```sh
cmake --build engine/build --config Release --target PreseterEngine
node scripts/engine-audio-silence.js --type=ASIO --rate=44100 --buffer=256 \
  --output="ASIO4ALL v2" --input="ASIO4ALL v2"
node_modules/ffmpeg-static/ffmpeg.exe -i <wav> -af volumedetect -f null NUL
```

Para uma verificação manual, use o botão **Gravar** do app com o concert vazio
e analise o WAV.

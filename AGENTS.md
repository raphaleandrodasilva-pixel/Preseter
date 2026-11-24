# Preseter: branch de teste `fix/zyn-port`

Instruções para o OpenCode. Responda em português do Brasil.

> Este arquivo vale só para esta branch. **Remova-o antes de qualquer merge na `main`.**

## O que é esta branch

Corrige o porte do ZynAddSubFX (1.3.0) e fecha uma falha de segurança no arquivo de biblioteca.

| Problema | Correção | Arquivo |
|---|---|---|
| PADsynth mudo (322 de 1318 presets usam) | Gera as tabelas com `applyparameters()` ao carregar | `engine/src/native/ZynFactory.cpp` |
| Pitch bend 2 semitons acima no centro | Envia `valor - 8192` ao Zyn | `ZynFactory.cpp` |
| Troca de preset durante o áudio (risco de travar) | Monta o instrumento novo à parte e troca o ponteiro sob trava | `ZynFactory.cpp` |
| Relógio do Zyn parado (LFO com atraso e fade não começam) | Avança o `AbsTime` a cada bloco | `ZynFactory.cpp` |
| Estalo com buffer que não é múltiplo de 32 | Guarda o resto do bloco para o próximo buffer | `ZynFactory.cpp` |
| Leitura fora da memória na FFT | Copia só as frequências 0..N/2, como o FFTW | `engine/third_party/zyn/src/DSP/FFTwrapper.cpp` |
| Biblioteca podia carregar DLL pelo campo `sampler` | Valida `sampler` e põe a identidade do plugin por último | `src/shared/library/format.ts`, `src/shared/types.ts`, `src/main/index.ts`, `src/main/vst/VstManager.ts` |

| Sampler: troca de arquivo/preset disputava o áudio | Instrumento novo carregado fora e trocado sob trava | `engine/src/sampler/SamplerProcessor.*` |
| Órgão ignorava o pedal de expressão | CC11 multiplica o volume (swell do setBfree); CC121 volta a 100% | `engine/src/native/NativeProcessor.*` |
| Template Guitarra só com 3 patches e 5 efeitos | 12 patches com Guitarix + efeitos Preseter achados no scan | `src/main/concert/templates.ts`, `ConcertManager.ts`, `index.ts` |
| Aviso de atualização por cima do show | Não aparece com o modo Performance ligado; instala ao fechar | `src/main/updater.ts`, `index.ts` |
| Piano/EP com teclas estreitas na tela | Teclado de 61 teclas (C2–C7), igual ao do órgão | `src/shared/collection-layouts.ts` |
| Bibliotecas antigas (Factory 40, Workstation) | Substituídas pela **Factory 64**: 8 sets × 8, baterias no Preseter Drums, synths do Zyn (bancos Mysterious) | `libraries/factory-64/biblioteca.json` |
| Aba Presets sem os nativos | Zyn (1318), Dexed (1056), JX10, DX10, Piano, órgão, Tines e Wurly por categoria; 130 **Preseter Sounds** (programa + efeitos + envios) | `src/main/vst/nativePresets.ts`, `src/shared/vst-presets.ts`, `src/shared/preseter-sounds.ts`, `ChannelStripLibrary.tsx`, `ConcertShell.tsx` |
| Workflow podia apagar a última estável | **Pendente**: alteração pronta, mas o token não tem o escopo `workflow` | `.github/workflows/build.yml` (local) |

O Dexed e os outros instrumentos nativos foram analisados e não precisaram de correção.

## Regras

- Não faça merge, rebase nem push para a `main`.
- Não altere a versão nem publique Release sem o usuário pedir.
- Não faça commit ou push sem o usuário pedir.
- Não registre um segundo `AudioIODeviceCallback`.
- Não afirme que algo funciona sem testar. Diga o que foi e o que não foi testado.

## O que ainda precisa de validação

- Presets de pad do Zyn soando (PADsynth).
- Pitch bend voltando ao tom certo ao soltar a alavanca.
- Trocar presets do Zyn no painel enquanto toca, sem travar nem estalar.
- Tempo de carga dos presets com PADsynth.
- Buffer da placa em tamanho que não é múltiplo de 32 (ex.: 441).
- CPU com vários layers de Zyn.
- Trocar o preset do sampler (SF2) no painel enquanto toca.
- Pedal de expressão no órgão.
- Template Guitarra: criar o concert, conferir os 12 patches, os pedais e o som com guitarra real.
- Aviso de atualização com o modo Performance ligado e desligado.
- Factory 64: gerar pela tela **Gerar Biblioteca** e ouvir os 64 patches. Os presets do Zyn são
  escolhidos pelo índice, então é preciso conferir se o nome que aparece no painel bate com o patch.
- Teclado de 61 teclas no piano, no Rhodes e no Wurlitzer.
- Aba Presets: aplicar presets do Zyn/Dexed/JX pela categoria e conferir se o painel mostra o mesmo nome.
- Preseter Sounds: efeitos entram no strip; envios só quando o Aux 1/2 do concert tem efeito.

## Como verificar

```sh
npm ci
npm run typecheck
npx vitest run
```

O C++ precisa de CMake, Visual Studio C++ e Rust. Sem eles, use o workflow **Build** no GitHub
Actions em execução manual nesta branch: ele compila e gera o instalador sem publicar Release.

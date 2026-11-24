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

O Dexed foi analisado e não precisou de correção.

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

## Como verificar

```sh
npm ci
npm run typecheck
npx vitest run
```

O C++ precisa de CMake, Visual Studio C++ e Rust. Sem eles, use o workflow **Build** no GitHub
Actions em execução manual nesta branch: ele compila e gera o instalador sem publicar Release.

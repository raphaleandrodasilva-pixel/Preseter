# Preseter: branch de teste `feat/factory-40-efeitos`

Instruções para o OpenCode. Responda em português do Brasil.

> Este arquivo vale só para esta branch. **Remova-o antes de qualquer merge na `main`.**

## O que é esta branch

Melhora os **40 timbres da Factory 40**:

- todos passam a ter cadeias de efeitos por instrumento;
- Warm String Pad, Synth Bass, Analog Poly Synth, Warm Analog Pad e Ambient Texture
  passam do JX10 para o Synth2;
- Deep Synth Bass fica sem EQ, para não cortar a fundamental do subgrave.

Ela saiu da `main` e é **independente** de `feat/motif-es-collection`. A coleção de 768
timbres não está aqui.

## Regras

- Não faça merge, rebase nem push para a `main`.
- Não misture esta branch com `feat/motif-es-collection`.
- Não altere a versão nem publique Release.
- Não faça commit ou push sem o usuário pedir.
- Não reescreva a arquitetura de áudio.
- Não registre um segundo `AudioIODeviceCallback`: o JUCE soma o buffer dele na saída,
  e isso já causou ruído no ASIO4ALL.
- Pianos acústicos continuam no sampler, nunca em `preseter.piano`.
- Não afirme que algo funciona sem testar. Diga o que foi e o que não foi testado.

## Onde está o código

| Arquivo | Função |
|---|---|
| `src/shared/collection-presets.ts` | Os 40 patches: fontes, inserts, Master e sends |
| `src/shared/collection-layouts.ts` | Controles do layout; o EQ não gera knobs |
| `src/main/collection/generateCollection.ts` | Monta o concert da coleção |
| `src/main/collection/collection.test.ts` | Regras e testes da Factory 40 |

## Regras dos timbres

- Patch com mais de uma camada leva os efeitos no **Master do patch**.
- Máximo de 4 efeitos por cadeia, sempre com efeito e preset existentes no catálogo.
- Amp e Overdrive do Guitarix são **mono**: não use em órgãos, para preservar o Leslie.
- A guitarra usa só o Amp: ele já simula a caixa, então não some o Cabinet.
- Não use o EQ `pad-cordas` (corte em 100 Hz) em cellos e contrabaixos.
- Warm Analog Pad já tem chorus interno; Ambient Texture já tem delay interno. Não some
  outro efeito igual.
- O número do programa do Synth2 é a posição do `.sy1` em `presets/synth2`, em ordem.

## O que ainda precisa de validação

- Som e volume dos 40 timbres, ouvindo no app. Atenção a Synth Bass, Warm String Pad,
  Warm Analog Pad e Electric Guitar Clean.
- Graves de Deep Synth Bass, String Ensemble e Precision Bass.
- CPU e troca de patch, principalmente em Rhodes Classic e Electronic Drum Kit.
- Se os programas da Sonatina e da MuseScore apontam para o instrumento certo.

O `Colecao.pst` versionado ainda tem os timbres antigos. Para testar, gere a coleção de
novo no app, com Salamander, Sonatina e MuseScore General instaladas, e salve com outro
nome, como `Colecao-teste-40.pst`.

## Como verificar

```sh
npm ci
npm run typecheck
npx vitest run src/main/collection
npx vitest run
```

O C++ precisa de CMake, Visual Studio C++ e Rust. Sem eles, use o workflow **Build** no
GitHub Actions, em execução manual nesta branch: ele gera o instalador sem publicar
Release.

## Ao começar uma sessão

1. Rode `git fetch origin` e confirme que está em `feat/factory-40-efeitos`.
2. Leia o diff contra `origin/main`.
3. Resuma o que entendeu e os riscos.
4. Aguarde a instrução do usuário antes de alterar qualquer arquivo.

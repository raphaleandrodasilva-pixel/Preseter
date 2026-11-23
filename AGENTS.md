# Preseter: branch de teste `feat/motif-es-collection`

Instruções para o OpenCode. Responda em português do Brasil.

> Este arquivo vale só para esta branch. **Remova-o antes de qualquer merge na `main`.**

## O que é esta branch

Cria a **Coleção Workstation**: 6 bancos (PRE1 a PRE6) com 128 timbres cada, 768 no
total, gerados como 6 concerts `.pst`. A organização por bancos e categorias foi
inspirada no MOTIF ES, mas as receitas são próprias do Preseter.

Ela saiu da `main` e é **independente** de `feat/factory-40-efeitos`. Os novos efeitos
dos 40 timbres não estão aqui.

## Regras

- Não faça merge, rebase nem push para a `main`.
- Não misture esta branch com `feat/factory-40-efeitos`.
- Não altere a versão nem publique Release.
- Não faça commit ou push sem o usuário pedir.
- Não altere a Factory 40 (`COLLECTION_SETS`) nem o `Colecao.pst`.
- Não reescreva a arquitetura de áudio.
- Não registre um segundo `AudioIODeviceCallback`: o JUCE soma o buffer dele na saída,
  e isso já causou ruído no ASIO4ALL.
- Não coloque nomes de Voices, parâmetros, waveforms ou samples Yamaha no app nem nos
  dados. `voices.json` guarda só a categoria de cada posição.
- Não afirme que algo funciona sem testar. Diga o que foi e o que não foi testado.

## Onde está o código

| Arquivo | Função |
|---|---|
| `src/shared/collections/workstation/voices.json` | Categoria/subcategoria das 768 posições |
| `src/shared/collections/workstation/recipes.ts` | Fontes, efeitos e ambientes das 41 subcategorias |
| `src/main/collection/generateWorkstationCollection.ts` | Gera e grava um concert por banco |
| `src/main/collection/generateWorkstationCollection.test.ts` | Testes da coleção |
| `src/renderer/components/concert/CollectionSettings.tsx` | Botão **Gerar os 6 bancos** |
| `engine/src/sampler/SamplerProcessor.cpp` | Pitch bend, mod wheel (vibrato) e CC11 |
| `src/main/index.ts` | IPC da geração; velocity aplicada antes da troca de patch |

## Regras das receitas

- Cada variação percorre as fontes, depois as cadeias, depois os ambientes. As 768
  receitas não podem se repetir.
- Patch com mais de uma camada leva os efeitos no **Master do patch**, nunca em inserts.
- Máximo de 4 efeitos por cadeia, sempre com efeito e preset existentes no catálogo.
- Amp e Overdrive do Guitarix são **mono**: não use em órgãos nem em fontes estéreo.
- Não use o EQ `pad-cordas` (corte em 100 Hz) em cellos e contrabaixos.
- Programas do Synth2 com chorus ou delay interno não recebem outro efeito igual
  (`SYNTH2_CHORUS` e `SYNTH2_DELAY` em `recipes.ts`).
- O número do programa do Synth2 é a posição do `.sy1` em `presets/synth2`, em ordem.

## O que ainda precisa de validação

- Som e volume dos timbres, ouvindo no app.
- Abertura real dos 6 concerts e troca de patches.
- Se todos os programas e kits usados existem nos arquivos SF2.
- Pitch bend, mod wheel e CC11 no sampler, com um controlador real.
- Uso de CPU nos patches mais pesados.

Melhoria já identificada: o Preseter Organ e o Wurly aparecem pouco. Em `Or/ELEC.`, só
16 das 40 posições usam o Preseter Organ.

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

1. Rode `git fetch origin` e confirme que está em `feat/motif-es-collection`.
2. Leia o diff contra `origin/main`.
3. Resuma o que entendeu e os riscos.
4. Aguarde a instrução do usuário antes de alterar qualquer arquivo.

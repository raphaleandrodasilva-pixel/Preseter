# Preseter: branch de teste `feat/gerador-bibliotecas`

Instruções para o OpenCode. Responda em português do Brasil.

> Este arquivo vale só para esta branch. **Remova-o antes de qualquer merge na `main`.**

## O que é esta branch

Cria o botão genérico **Arquivo → Gerar Biblioteca…**. Ele lê um arquivo de instruções
(`biblioteca.json`), valida, mostra o que falta e gera concerts `.pst`. Uma biblioteca nova é
só um arquivo novo, sem mudar o app. O formato está em `libraries/README.md`.

Também cria **Arquivo → Exportar como Biblioteca…**, que grava o concert aberto (com knobs
salvos, layout e mappings) em um arquivo portátil, usando `snapshot` e `pluginRefs`.

| Biblioteca | Timbres | Concerts |
|---|---:|---:|
| `libraries/factory-40` | 40 | 1 |
| `libraries/factory-40-efeitos` | 40 | 1 |
| `libraries/workstation` (PRE1 a PRE6) | 768 | 6 |

A branch saiu da `main`. As branches `feat/factory-40-efeitos` e `feat/motif-es-collection`
foram a origem das receitas, mas não foram juntadas aqui.

## Regras

- Não faça merge, rebase nem push para a `main`.
- Não altere a versão nem publique Release.
- Não faça commit ou push sem o usuário pedir.
- Não crie um botão por biblioteca. Toda biblioteca nova é um `biblioteca.json`.
- Não reescreva a arquitetura de áudio.
- Não registre um segundo `AudioIODeviceCallback`: o JUCE soma o buffer dele na saída, e isso
  já causou ruído no ASIO4ALL.
- Não coloque nomes de Voices, parâmetros, waveforms ou samples Yamaha nas bibliotecas.
- Não remova o botão antigo da Factory 40 antes de o usuário validar o novo no app.
- Em concert exportado, plugin só pode ser nativo ou referência de `pluginRefs`: nunca aceite
  caminho direto, para um arquivo de biblioteca não carregar uma DLL arbitrária.
- Não afirme que algo funciona sem testar. Diga o que foi e o que não foi testado.

## Onde está o código

| Arquivo | Função |
|---|---|
| `src/shared/library/format.ts` | Formato, validação e conversão |
| `src/main/library/LibraryService.ts` | Lista, inspeciona e gera os concerts |
| `src/main/library/exportLibrary.ts` | Exporta o concert e o resolve em outro computador |
| `src/main/index.ts` | Menu, IPC `library-*` e velocity antes da troca de patch |
| `src/renderer/components/concert/LibraryGeneratorModal.tsx` | Janela do botão |
| `src/main/collection/generateCollection.ts` | Gerador reaproveitado |
| `engine/src/sampler/SamplerProcessor.cpp` | Pitch bend, mod wheel e CC11 |

## O que ainda precisa de validação

- Abrir a janela no app instalado, gerar as 3 bibliotecas e abrir os concerts.
- Exportar um concert real e gerá-lo em outro computador, conferindo os knobs.
- Estado de plugins de terceiros e do Preseter Drums pode guardar caminhos locais; o export avisa.
- Som e volume dos timbres.
- Se todos os programas e kits usados existem nos arquivos SF2.
- Pitch bend, mod wheel e CC11 com um controlador real.
- CPU nos patches mais pesados.

Os concerts são gerados com os caminhos de plugin do computador. Em outro computador, gere de
novo pelo botão, em vez de copiar o `.pst`.

## Como verificar

```sh
npm ci
npm run typecheck
npx vitest run src/main/library src/renderer/components/concert/LibraryGeneratorModal.test.tsx
npx vitest run
```

O C++ precisa de CMake, Visual Studio C++ e Rust. Sem eles, use o workflow **Build** no GitHub
Actions, em execução manual nesta branch: ele gera o instalador sem publicar Release.

## Ao começar uma sessão

1. Rode `git fetch origin` e confirme que está em `feat/gerador-bibliotecas`.
2. Leia o diff contra `origin/main`.
3. Resuma o que entendeu e os riscos.
4. Aguarde a instrução do usuário antes de alterar qualquer arquivo.

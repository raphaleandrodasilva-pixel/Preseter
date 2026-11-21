# Preseter — Avaliação para portar ZynAddSubFX (instrumento) e Guitarix (efeitos de guitarra)

> Documento para o OpenCode, em PT-BR. **Somente pesquisa e relatório: NÃO escrever código de produto,
> NÃO copiar código para o repositório e NÃO adicionar dependências nesta fase.**
> Uma tarefa de cada vez; parar ao final de cada uma e mostrar o resultado.
> Não inventar: licença, versão, link, nome de arquivo ou número que não for conferido no código fica `a confirmar`.
> Isto não é aconselhamento jurídico. A licença do Preseter é **AGPL-3.0-or-later**.

---

## 1. Objetivo

O Rafael quer portar para o Preseter, como recursos nativos:

1. **ZynAddSubFX**: sintetizador (aditivo, subtrativo e PADsynth). Viria como **instrumento** (`preseter.<id>` a definir).
2. **Guitarix**: simulador de amplificador, cabine e pedais de guitarra. Viria como **efeitos** (inserts no strip),
   não como instrumento.

Esta fase só decide **se, como e em que ordem** portar, com evidência do código real.

## 2. O que já se sabe (de pesquisa na web; **confirmar no código**)

| Item | ZynAddSubFX | Guitarix |
|---|---|---|
| Licença do código principal | GPL-2.0-or-later (cópia Debian) | GPL-2.0-or-later (cópia Debian) |
| Partes com outra licença | rtosc: Expat; `jack_osc.h`: ZLIB; DPF: ISC, LGPL-2.1+, GPL-3+, ZLIB, fonte Bitstream Vera | zita-convolver/zita-resampler: GPL-3+; `abgate`: LGPL-3+; fontes: Apache-2.0; ladspa: BSD-3-Clause; `gx_detune`: Wide Open License; ampsim: domínio público |
| Bancos de sons / IRs | licença **a confirmar** (não aparecem no arquivo de copyright) | `IR/BestPlugins_*` aparecem como GPL-2+ (**confirmar**) |
| Tipo | instrumento (MIDI → áudio) | efeito (áudio → áudio) |
| Estrutura | projeto grande, com parâmetros/estado/UI próprios | plugins LV2 separados em `src/LV2/` + aplicativo GTK |

> GPL-2.0-**or-later** é compatível com AGPL-3.0-or-later. **GPL-2.0-only não seria.** Confirmar o cabeçalho de
> **cada arquivo** que for usado (SPDX ou texto "or any later version"); o arquivo Debian é só um resumo.

## 3. Tarefas

### Parte A — Portão de licença (obrigatório; nada avança sem aprovação do Rafael)

**A1 — Licença real, arquivo por arquivo.** Clonar (somente leitura) os repositórios oficiais, anotar o commit
e produzir `docs/PORTES-ZYN-GUITARIX.md` (nova) com tabelas:
- ZynAddSubFX: licença do código do motor (ADsynth, SUBsynth, PADsynth, filtros, osciladores, envelopes, LFO), de
  `rtosc`, do que for dependência obrigatória, e **de cada banco/preset** que se pretenda distribuir.
- Guitarix: licença do código de cada módulo candidato (amps, tubos, cabines, pedais), de `zita-convolver`/
  `zita-resampler` (GPL-3+), e **de cada IR/cabine** que se pretenda distribuir.
- Marcar cada item como **compatível**, **incompatível** ou `a confirmar`, com **arquivo e linha** do cabeçalho.
Critério: nenhuma linha sem evidência. Pare ao final.

**A2 — Atribuição.** Listar o que precisa constar em `docs/LICENCAS.md` e em `engine/third_party/<nome>/UPSTREAM.md`
(autor, URL, commit, licença, arquivos usados), no mesmo formato do MDA e do OpenWurli. Pare ao final.

### Parte B — Guitarix (efeitos), em primeiro lugar

**B1 — Mapa dos módulos.** Em `src/LV2/` (e onde estiver o DSP gerado por Faust), listar cada módulo
(amplificadores, pré e pós, tubos, cabines/convolução, distorções, pedais, reverb, delay, etc.), com nome, licença,
dependências e tamanho. Marcar quais dependem de **GTK, Faust runtime, zita-convolver** ou outras bibliotecas.
Critério: tabela completa. Pare ao final.

**B2 — Como ele roda hoje no Preseter.** Descobrir, no código do Preseter, se o app **já carrega plugins LV2**
(há `lv2-unload` em `src/main/index.ts`) e em quais sistemas. Testar (ou documentar o roteiro de teste) carregar um
`gx_*` LV2 como insert de uma guitarra. Se já funcionar, avaliar se **portar** ainda compensa ou se basta
**recomendar o plugin externo**. Critério: resposta clara com evidência. Pare ao final.

**B3 — Escolha dos candidatos a nativo.** Propor **no máximo 3 a 5 efeitos** para começar (por exemplo, 1 ou 2 amps,
1 cabine/IR e 1 pedal), com: peso de CPU estimado, dependências a levar, esforço (P/M/G) e risco. Considerar a
integração com o catálogo de efeitos (`src/shared/effects/catalog.json`, painéis "Preseter …", presets).
Critério: tabela de candidatos com recomendação e justificativa. Pare ao final.

**B4 — Plano de porte (sem código).** Para os candidatos aprovados: onde entra o DSP (`engine/third_party/guitarix/`),
como vira um processador do motor, como o estado e os parâmetros se ligam ao painel e ao catálogo, como testar
(teste de nulidade em `engine/test/`) e como fica a coleção (patch "Electric Guitar Clean" etc.). Pare ao final.

### Parte C — ZynAddSubFX (instrumento), depois

**C1 — Mapa do motor.** Listar os módulos do som (ADsynth, SUBsynth, PADsynth, filtros, envelopes, LFO, efeitos
internos, sistema de partes/kits), com tamanho, dependências e licença. Dizer o que é **separável** da interface
(FLTK/Zyn-Fusion) e do sistema de parâmetros (rtosc). Critério: tabela completa. Pare ao final.

**C2 — Recorte mínimo viável.** Propor um primeiro instrumento **pequeno** (por exemplo, só ADsynth ou só um PADsynth
simples), com polifonia, quantidade de parâmetros expostos, consumo de CPU e **quais efeitos internos ficam de fora**
(os calfNXT já cobrem). Critério: escopo fechado com esforço (P/M/G). Pare ao final.

**C3 — Bancos e presets.** Propor quais presets entram, com **licença de cada banco confirmada** (A1). Se nenhum for
claramente livre, propor presets próprios. Pare ao final.

**C4 — Plano de porte (sem código).** Como vira instrumento nativo (`NativeProcessor`/`CommandRouter`, id, programas),
painel no estilo dos outros nativos, estado e testes. Pare ao final.

### Parte D — Fechamento

**D1 — Relatório final.** Um documento curto: o que portar primeiro, esforço, riscos, licença e **pergunta final ao
Rafael** (aprovar ou não cada porte). **Nenhum código antes dessa aprovação.**

## 4. Regras para o agente

1. **Só pesquisa nesta fase.** Nada de código de produto, nada copiado para o repositório, nenhuma dependência nova.
2. Uma tarefa por commit de documentação; parar e mostrar o resultado.
3. **Licença primeiro.** Sem evidência (arquivo e linha), a resposta é `a confirmar`.
4. Não inventar nomes de módulos, parâmetros, links nem números. Dados vêm do código lido.
5. Clonar repositórios de terceiros **somente leitura**, fora do repositório do Preseter; anotar o commit.
6. Não mexer em `asio/` nem em `.vscode/`.
7. Textos para o Rafael em português do Brasil.

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Algum arquivo ser GPL-2.0-only (incompatível com a AGPL) | A1 confere o cabeçalho de cada arquivo usado |
| Dependências pesadas (GTK, Faust, zita) | B1/C1 listam; recorte mínimo; levar só o DSP |
| Bancos/IRs com licença não livre | A1/C3: só entram os confirmados; senão, presets próprios |
| Porte do Zyn gigante | C2 limita o primeiro escopo |
| Guitarix já funcionar como LV2 externo | B2 decide se vale portar |
| CPU alta ao vivo (PADsynth, convolução) | Medir e limitar polifonia e tamanho de IR |

# Plano — Exportar presets em `.fxp`

**Objetivo:** gerar, de forma rápida e prática, uma lista de presets em `.fxp` para os
plugins que não trazem esses arquivos (caso do **FSVR**, emulação do Yamaha FS1R, com 3 bancos
de presets e nenhum `.fxp`).

**Decisão do projeto:** o `.fxp` será o **único formato de preset** da biblioteca
(os outros formatos deram problemas no app).

> Itens marcados com **(a confirmar)** vêm de conhecimento geral ou de notas de versão,
> não foram testados no Windows.

## 1. Situação atual (conferida no código)

- O app só indexa `.fxp` do **Surge XT**; as pastas estão fixas no código
  (`ProgramData\Surge XT\...`, `Documentos\Surge XT\Patches`).
- O app aplica um `.fxp` lendo só o **chunk** (arquivos `FPCh`) e entregando-o ao motor com
  `setComponentState` (estado nativo do componente VST3). `.fxp` só com parâmetros não funcionam.
- O motor já tem `getState`/`setState` (formato do JUCE), `pluginPrograms` (lista programas),
  `setProgram` e `setComponentState`. **Não tem** o comando que **lê** o estado nativo do
  componente (`getComponentState`), que é o formato que o `.fxp` precisa.

## 2. Três casos de plugin

| Caso | Exemplo | Como exportar |
|---|---|---|
| **A. Expõe presets como programas VST** | MDA, Dexed (a confirmar) | Script genérico: troca de programa → captura estado → grava `.fxp` |
| **B. Presets só em arquivos/navegador próprio** | FSVR (bancos `.syx`/`.fsvr`), Helm (`.helm`), Odin 2 (`.odin`) | Conversor por plugin a partir dos arquivos, ou exportação manual do som atual |
| **C. Carregam arquivos de samples** | sforzando, sfizz, SF2 Player | Fora do escopo (o "preset" é o arquivo carregado) |

## 3. Formato do arquivo `.fxp` de chunk (VST2 `FPCh`)

Cabeçalho de **60 bytes**, números em *big-endian*, seguido do chunk:

| Bytes | Conteúdo |
|---|---|
| 0–3 | `CcnK` |
| 4–7 | tamanho restante = `52 + tamanho do chunk` |
| 8–11 | `FPCh` |
| 12–15 | versão do formato (1) |
| 16–19 | ID do plugin (4 caracteres; pode ser um valor derivado do nome) |
| 20–23 | versão do plugin |
| 24–27 | número de programas (1) |
| 28–55 | nome do preset (28 bytes, preenchido com zeros) |
| 56–59 | tamanho do chunk |
| 60… | **chunk** = estado nativo do componente VST3 |

O leitor do app (`readFxpPayload`) confere `CcnK` e `FPCh` e usa o que vem após o byte 60.

## 4. Fases (uma de cada vez)

### Fase 1 — Diagnóstico: quais plugins expõem programas
- [ ] **1.1** `scripts/gerar-colecao.js --programas=NOME`: carrega o plugin no motor
  (`pluginPrograms`) e mostra quantos programas existem e os nomes.
- **Pronto quando:** rodando em Surge, MDA, Dexed, Odin, Helm e FSVR, sabemos quais são
  caso A e quais são caso B.

### Fase 2 — Motor: ler o estado nativo
- [ ] **2.1** Comando `getComponentState {layerId}` que devolve o estado do componente
  VST3 em base64 (o espelho de `setComponentState`, usando `IComponent::getState`).
- [ ] **2.2** Teste de fumaça no `scripts/engine-smoke.js` (ler e reaplicar o estado).
- **Pronto quando:** ler o estado e aplicá-lo de volta devolve o mesmo som.

### Fase 3 — Script `scripts/exportar_fxp.py` (genérico, caso A)
- [ ] **3.1** Uso: `python scripts/exportar_fxp.py --plugin=NOME [--out=PASTA] [--atual --nome="Meu Som"]`.
- [ ] **3.2** Fluxo: sobe o motor → varre → carrega o plugin → para cada programa:
  `setProgram` → `getComponentState` → grava `NN - Nome.fxp`.
- [ ] **3.3** Saída em `Documentos\Preseter\Presets\<Plugin>\`.
- [ ] **3.4** `--atual`: exporta só o estado atual (plugins sem lista de programas).
- [ ] **3.5** Avisos: nomes duplicados, estado idêntico em todos os programas (o plugin
  ignorou a troca), plugin que não é VST3.
- **Pronto quando:** um plugin do caso A gera os `.fxp` e o app os carrega com o mesmo som.

### Fase 4 — App: varredura geral de `.fxp`
- [ ] **4.1** Varrer `Documentos\Preseter\Presets\<Plugin>\*.fxp` para **qualquer** plugin
  (a pasta liga o arquivo ao plugin pelo nome), mantendo o Surge como está.
- [ ] **4.2** Mostrar na Channel Strip Library, com a coleção = nome da pasta.
- [ ] **4.3** Desligar as outras fontes (`.vstpreset`, `.vital`, `.odin`, MIDI) **sem apagar o código**.
- **Pronto quando:** os `.fxp` do passo 3 aparecem na lista e aplicam ao clique.

### Fase 5 — Caso B: FSVR
- [ ] **5.1** Descobrir onde ficam os 3 bancos (`.syx`/`.fsvr`) e se o FSVR expõe programas.
- [ ] **5.2** Se expuser: já funciona com a Fase 3.
- [ ] **5.3** Se não expuser: ler o código do FSVR (open source) para ver como ele guarda o
  estado e escrever `scripts/fsvr_para_fxp.py`, que lê os bancos e monta um `.fxp` por preset.
- [ ] **5.4** Conferir a **licença** do FSVR antes de redistribuir qualquer arquivo gerado.
- **Pronto quando:** os presets dos 3 bancos aparecem como `.fxp` na biblioteca.

### Fase 6 — Extras (opcionais)
- [ ] **6.1** Botão "Exportar como .fxp" no app (ajusta o som e exporta).
- [ ] **6.2** Gerador aleatório de presets para sintetizadores (com limitador de volume).

## 5. Riscos e limites

- O script só alcança o que o plugin **expõe**; navegador interno sem programas exige o caso B.
- Alguns plugins podem **ignorar** `setProgram` fora da interface; a Fase 3.5 detecta.
- O **formato do estado** muda entre versões do plugin; um `.fxp` de uma versão pode não abrir em outra.
- Presets de fábrica podem ter **licença própria**; conferir antes de distribuir (uso pessoal é livre).
- Não foi testado no Windows com plugins reais; testar primeiro com 1 plugin simples (MDA).

## 6. Ordem recomendada

1. Fase 1 (diagnóstico) → 2. Fase 2 (motor) → 3. Fase 3 (script) → 4. Fase 4 (app) → 5. Fase 5 (FSVR).

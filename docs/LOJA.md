# Loja de Samples e Plugins — especificação para o OpenCode

**Objetivo:** dentro do Preseter, uma **loja gratuita** onde o usuário encontra **plugins** (VST3/LV2…) e
**bibliotecas de samples** (SFZ e SF2), baixa com um clique e usa nos patches. O conteúdo vem dos
sites de origem; **o Preseter não hospeda nenhum arquivo de terceiros**.

> Itens marcados **(a confirmar)** não foram testados. **Nunca invente URL, hash ou licença.**

## 1. Decisões do dono do projeto

1. A loja é **uma aba da janela de Configurações**, chamada **"Loja"** (não é um modo da barra de cima).
2. Contém **plugins e samples**. O player padrão de samples é o **sforzando** (abre SFZ e SF2).
3. O **conteúdo vem dos sites de origem** (GitHub, FreePats, Musical Artifacts etc.), com **dois níveis**:
   - **Verificado:** licença conferida pelo dono. Aparece primeiro e é o filtro padrão.
   - **Indexado:** importado do site, com a licença **como o site declara**, selo "licença não conferida".
4. **O catálogo se atualiza sozinho** ao abrir o app (em segundo plano, com internet; sem internet usa a
   última cópia boa). As **bibliotecas já baixadas não mudam sozinhas**: o app só avisa que há versão nova.
5. Quem confere os itens novos: o **dono do projeto** (a comunidade pode propor por pull request).
6. Projeto **open source (AGPL-3.0)**, sem fins lucrativos. Foco de release: Linux (depois); hoje desenvolve no Windows.

## 2. O que JÁ existe (reaproveitar, não duplicar)

| Peça | Onde |
|---|---|
| Tipos (`CollectionItem`, `group: plugin/library/manual`, `kind: vst3-zip/vst3-msi/vst3-exe/soundfont/soundfont-zip/manual`, status, progresso) | `src/shared/collection.ts` |
| Catálogo embutido com **11 itens** (juicysfplugin, Surge XT, Dexed, sfizz, Helm, Odin 2, MuseScore_General, Sonatina, Salamander, MDA, setBfree) | `src/shared/collection-catalog.json` |
| Download https com redirecionamento, progresso, cancelar, extrair zip/msi/exe, copiar `.vst3` | `src/main/collection/CollectionInstaller.ts` |
| IPC `collection-status`, `collection-download`, `collection-cancel`, `collection-open-folder`, `collection-open-installer`, `collection-generate` | `src/main/index.ts`, `src/main/preload.ts` |
| Aba **Coleção** (kit essencial dos 40 patches) | `src/renderer/components/concert/CollectionSettings.tsx` |
| Gerador do concert de 40 patches | `src/main/collection/generateCollection.ts` |

**Decisão de arquitetura:** a aba **Coleção** continua como está (kit essencial que gera os 40 patches).
A **Loja** é uma aba nova, que **reutiliza o `CollectionInstaller`** para baixar e instalar. Se for preciso
mudar o instalador, estenda-o; não crie um segundo.

## 3. Modelo de dados

Novo catálogo da loja: `src/shared/store-catalog.json` (cópia embutida) + o mesmo arquivo publicado no
repositório para a atualização remota. Cada item **estende** os campos de `CollectionItem`:

```json
{
  "id": "salamander-grand-v3",
  "type": "library",
  "name": "Salamander Grand Piano V3",
  "category": "Piano",
  "author": "Alexander Holm",
  "description": "Piano de cauda Yamaha C5",
  "tier": "indexed",
  "source": "github",
  "license": "CC-BY-3.0",
  "licenseKind": "free",
  "licenseUrl": "https://creativecommons.org/licenses/by/3.0/",
  "attribution": "Salamander Grand Piano by Alexander Holm (CC BY 3.0)",
  "page": "https://github.com/sfzinstruments/SalamanderGrandPiano",
  "os": ["windows", "linux", "mac"],
  "variants": [
    { "format": "sfz-flac", "kind": "soundfont-zip", "sizeMB": 707, "url": null, "sha256": null }
  ],
  "version": null,
  "verifiedBy": null
}
```

- `type`: `plugin` ou `library`. Plugin usa os `kind` existentes e traz `pluginFormat` (`vst3`, `lv2`, `clap`, `vst2`).
- `licenseKind`: `free` | `restricted` | `unknown`. `tier`: `verified` | `indexed`.
- `url: null` = link direto **não verificado**; o botão vira "Abrir página". Nunca preencher por palpite.
- `sha256` ausente: calcular no **primeiro download**, guardar e avisar se mudar depois.
- Rascunho já escrito de 6 itens de samples: `docs/catalogo-sons.json` (migrar para o modelo acima).

## 4. Regras de licença

| Licença | Entra? | Tratamento |
|---|---|---|
| CC0, domínio público | Sim | `free` |
| CC BY, MIT, BSD, GPL, LGPL | Sim | `free`; mostrar atribuição |
| CC Sampling Plus, CC BY-NC | Só como link, com aviso | `restricted` |
| "Uso pessoal", sem licença, desconhecida | Só como link, aviso em destaque | `unknown` |
| **Freeware** (gratuito, mas não open source: sforzando, ReaPlugs, Reason Free) | Sim, como item **manual** | Abre a página oficial; **nunca** espelhar nem redistribuir o instalador; `licenseKind: free` + aviso "gratuito, não é open source" |
| Proprietária, paga, **precisa de ROM** (ex.: Retromulator, Nuked SC-55) | **Não listar** | — |

O **sforzando** (freeware da Plogue, não redistribuível) entra como item **manual**: abre a página oficial.
Isto não é aconselhamento jurídico; antes de marcar um item como `verified`, ler a licença original.

## 5. Plugins candidatos (resumo)

Já no instalador: juicysfplugin, Surge XT, Dexed, Helm, Odin 2 (baixam); sfizz, MDA, setBfree (manual).
Candidatos a incluir **(a confirmar licença, formatos e links)**: **FSVR** (emulação do Yamaha FS1R; VST3/CLAP;
GitHub musicastudio/FSVR), **ADLplug/OPNplug** (chips OPL3/OPN2; VST3; GitHub jpcima/ADLplug), **OB-Xd**,
**sforzando** (manual).

### Plugins gratuitos pedidos pelo dono (conferidos nas páginas oficiais)

| Item | O que é | Formatos / sistemas | Condições |
|---|---|---|---|
| **ReaPlugs** (Cockos, o do REAPER) | Pacote de efeitos: ReaComp, ReaXcomp, ReaDelay, ReaEQ, ReaFIR, ReaGate, ReaStream, ReaJS, ReaControlMIDI | **Só VST (VST2)**; páginas citam Windows e WINE; versões 32 e 64 bits. A versão listada é a **2.36, de 2016** | "Livremente utilizável", sem proteção de cópia; **não** informa regras de redistribuição → o app só baixa do site oficial para o PC do usuário, nunca hospeda. Página: https://www.reaper.fm/reaplugs/. **Links diretos (lidos na página, instaladores `.exe`):** 64 bits `https://www.reaper.fm/reaplugs/reaplugs236_x64-install.exe` (usar este) e 32 bits `https://www.reaper.fm/reaplugs/reaplugs236-install.exe` (não usar: o motor é 64 bits). A página diz que também é "portátil (copiar os arquivos instalados e rodar)" |
| **Reason Free** (Reason Studios) | Versão gratuita do Reason Rack Plugin com **15 devices**: Europa, Kong, ID-8, Monotone, Scream 4, The Echo, Audiomatic, RV7000 Mk II, MClass Maximizer, Scales and Chords, Combinator, Pulsar, Spider Audio, Spider CV, MIDI Out. Aceita Rack Extensions de terceiros | **VST3, AU, AAX**; **macOS e Windows** (Linux **não** é mencionado). Inclui também o Reason DAW limitado a 16 tracks | Grátis, sem expiração nem marca d'água; não é open source. Se pede **conta/login** ou instalador próprio: **(a confirmar)**. Página: https://www.reasonstudios.com/reason-free |

Pontos que o agente deve respeitar ao cadastrar os dois:
- **Reason Free:** `kind: manual` (abrir a página oficial); `url: null` até o dono verificar o link direto.
- **ReaPlugs:** `kind: vst3-exe` (mesmo tipo do Odin 2: baixa o instalador e o usuário o abre) com o link de 64 bits acima.
  Testar no Windows se o instalador coloca os `.dll` numa pasta que o motor varre (pastas de VST2 nas Configurações).
- `os` do **Reason Free** = `["windows", "mac"]` e do **ReaPlugs** = `["windows"]`: **não aparecem na Loja no Linux**
  (relevante para a versão pública, que é focada em Linux).
- ReaPlugs é **VST2**: depende do suporte a VST2 do motor (commit `933c499`) e pode precisar da pasta de plugins nas Configurações.
- O Reason Free é um **rack com vários devices dentro de um plugin**: no Preseter ele aparece como **um** plugin; os devices
  são escolhidos dentro da janela do plugin.
- Os dois são **gratuitos, não open source**: mostrar o aviso da regra de licença "Freeware".

## 6. Tarefas (uma de cada vez; só marque `[x]` quando funcionar de verdade)

### Fase L1 — Modelo e catálogo
- [ ] **L1.1** `src/shared/store.ts`: tipos do item da loja + função `validateStoreCatalog` (campos obrigatórios,
  licença permitida, só `https`, `sha256` com 64 hex quando presente) + testes.
- [ ] **L1.2** `src/shared/store-catalog.json` com os itens atuais: os 11 de `collection-catalog.json` + os 6 de
  `docs/catalogo-sons.json`, todos `tier: indexed`, links só onde já existem; resto `url: null`.

### Fase L2 — Serviço da loja (processo principal)
- [ ] **L2.1** `src/main/store/StoreService.ts`: carrega o catálogo (embutido + cache em `userData`), lista com status
  (instalado/baixar/baixando), baixa e instala **reutilizando `CollectionInstaller`**.
- [ ] **L2.2** Segurança: só `https`; só domínios da lista permitida (no código); limite de tamanho; extração de `.zip`
  sem sair da pasta de destino (conferir se `extract-zip` já protege e testar com zip malicioso); nunca executar nada
  baixado sem o usuário abrir o instalador.
- [ ] **L2.3** Hash: verificar `sha256` quando existir; senão calcular no 1º download e avisar se mudar depois.
- [ ] **L2.4** IPC `store-list`, `store-download`, `store-cancel`, `store-open-folder`, `store-check-updates`
  em `index.ts`, `preload.ts` e `src/renderer/types/electron-api.ts` (+ testes de preload).
- [ ] **L2.5** **Atualização automática do catálogo:** ao abrir o app, em segundo plano, baixar o JSON do repositório,
  validar com `validateStoreCatalog` e só então substituir; erro ou sem internet = manter a última cópia boa, sem alarme.
  Guardar a data e quantos itens são novos.

### Fase L3 — Interface (aba "Loja" em Configurações)
- [ ] **L3.1** `SettingsTab` ganha `'store'`; botão "Loja" em `SettingsModal.tsx`; componente `StoreSettings.tsx`.
- [ ] **L3.2** Layout de referência: `docs/img/loja-referencia.png` (categorias à esquerda; lista no centro; detalhes à direita;
  barra de baixo com espaço usado). Mesma paleta do app (azul `#0A84FF`, grafite, verde LED `#30D158`).
- [ ] **L3.3** Busca; filtros por **tipo** (plugin/sample), **categoria**, **formato** (SFZ/SF2/VST3/LV2), **licença** e
  **nível**. Filtro padrão: Verificado + licença livre; opção "mostrar tudo".
- [ ] **L3.4** Selos: Verificado, Indexado, Livre, Com restrição, Desconhecida. Botões: Baixar, Baixando N% (cancelar),
  Instalado, Abrir página (quando `url: null`), Mostrar na pasta.
- [ ] **L3.5** Painel de detalhes com a **atribuição** do autor e a licença; botão "Página do autor".
- [ ] **L3.6** Aviso "versão nova disponível" nos instalados (só aviso; nunca atualiza sozinho).
- [ ] **L3.7** `CREDITOS.md` gerado na pasta de sons com a atribuição de tudo o que foi baixado.

### Fase L4 — Importadores (depois; um por fonte)
- [ ] **L4.1** `scripts/importar-musical-artifacts.js` pela API pública (`/artifacts.json`); precisa de **amostra do JSON**
  (o dono envia) para saber onde vem a licença; gera **rascunhos** `tier: indexed`.
- [ ] **L4.2** `scripts/importar-freepats.js` com **lista fixa de URLs** (o site não tem API); licenças CC0/CC BY lidas das páginas.
- [ ] **L4.3** Polyphone: **só link** (download exige conta).
- [ ] **L4.4** Antes de cada importador, ler os termos do site; sem varredura agressiva; cache.
- [ ] **L4.5** `CONTRIBUINDO.md` (como propor um item) e validação do catálogo no CI.

### Fase L5 — Linux (depois)
- [ ] **L5.1** Campo `os` filtra os itens por sistema; instaladores para Linux (`.deb`/`tar.gz`/Flatpak) e sforzando beta ou sfizz.

## 7. Regras para o agente

1. Siga as **Regras para o agente** do `docs/ROADMAP.md` (main, commits pequenos, uma tarefa por vez, textos em português do Brasil, build deve passar).
2. **Nunca** invente URL, hash, licença ou tamanho. Sem dado confirmado: `null` e abrir a página.
3. **Não hospede** arquivos de terceiros e **não** inclua ROMs, plugins pagos nem itens de licença proprietária.
4. Reaproveite `CollectionInstaller`; não crie um segundo instalador.
5. Se faltar decisão (por exemplo, nome de um campo ou domínio permitido), **pare e pergunte**.

## 8. Riscos

- Link que sai do ar → o catálogo precisa de verificação periódica (L4.5).
- Autor troca o arquivo no mesmo link → hash diferente; avisar e deixar o usuário decidir.
- Licença mal classificada → por isso o nível **Indexado** é sempre rotulado como "não conferido".
- Downloads grandes (centenas de MB) → mostrar tamanho e espaço livre; permitir cancelar.
- Importar muito conteúdo de uma vez pode violar os termos de um site → ler os termos antes (L4.4).

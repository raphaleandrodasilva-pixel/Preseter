# Preseter — Limpeza da Loja: tirar duplicados e remover o Bedroom Producers Blog (BPB)

> Documento para o OpenCode, em PT-BR. **Uma tarefa de cada vez; parar ao final de cada uma** para o Rafael conferir.
> Não invente links, licenças nem números: o que não for verificado na fonte fica `a confirmar`.
> **Não editar `store/store-catalog.json` à mão**: ele é gerado por `scripts/generate-store-catalog.mjs`
> (entradas em `store/store-extras.json` e no próprio script). Alterar a origem e regenerar.
> Não quebrar o app: `npm run typecheck` e `npx vitest run` passam em cada tarefa.

---

## 1. Decisão do Rafael

1. **Tirar tudo que está duplicado** na Loja.
2. A Loja deve ter **só os links dos plugins e bibliotecas** (página oficial do autor e, quando houver, o download
   oficial). **Nenhuma indicação do Bedroom Producers Blog**: sem rótulo, sem filtro de provedor, sem "Fonte: BPB",
   sem catálogo separado.

## 2. O que foi encontrado (lido no repositório, HEAD `20fb582`)

- **Nenhum link aponta para `bedroomproducersblog.com`** (0 ocorrências em `store/*.json` e `docs/*.md`). O BPB aparece
  só como **rótulo e origem**: 
  - `store/store-catalog-bpb.json`: catálogo embutido separado, **25 itens** (todos "indexed", licença "unknown", sem URL
    de download, 57 variantes manuais);
  - `source: "bedroomproducersblog"` em itens do catálogo principal (4: `spitfire-sso-discover`,
    `kontakt-factory-selection-2`, `ob-xf`, `mt-power-drum-kit-2`);
  - tag `"BPB"` e `notes` começando com `"Fonte: BPB."` nesses itens;
  - código: `StoreService.ts` (`loadBpbCatalog`, fonte `'bpb'`, `STORE_BPB_CATALOG_PATH`), `store-sources.ts`,
    `store.ts` (tipo `StoreSource` e a lista com `'bedroomproducersblog'`), `StoreSettings.tsx` (rótulo "Bedroom Producers
    Blog" e cor do provedor) e testes (`StoreService.test.ts`, `store-sources.test.ts`).
- **Duplicados entre o catálogo BPB e o principal** (o principal vence no merge, então o BPB só ocupa espaço):

| Item BPB (`store-catalog-bpb.json`) | Já existe no principal |
|---|---|
| `bpb-surge-xt` | `surge-xt` (mesma página) |
| `bpb-dexed` | `dexed` (mesma página) |
| `bpb-vital` | `vital` |
| `bpb-tyrell-n6` | `tyrell-n6` |
| `bpb-ob-xf` | `ob-xf` |
| `bpb-decent-sampler` | `decent-sampler` |
| `bpb-sitala` | `sitala` |
| `bpb-kontakt-factory-selection-2` | `kontakt-factory-selection-2` |
| `bpb-spitfire-symphony-discover` | `spitfire-sso-discover` |
| `bpb-bbc-so-discover` | `bbcso-discover` |
| `bpb-mt-power-drum-kit-2` | `mt-power-drum-kit-2` |
| `bpb-ssd-free` ("SSD Free") | `steven-slate-drums-free` (mesmo produto; **confirmar**) |
| `bpb-ample-guitar-m-lite-4` | `ample-guitar-m-lite` (possível versão mais nova; **confirmar** se é o mesmo item) |

- **Itens do BPB que não existem no principal (13 a 14, conforme a confirmação acima)**: The Free Orchestra 2, LUX
  Orchestral Strings Elements, Creative Toolbox Piano, 1928 Vintage Grand Steinway, Sweetcase Vintage Electric Piano,
  LABS Soft Piano, Monastery Grand, Piano One, BFD Player, Triaz Player, Shreddage 3 Stratus FREE, FOUNDATIONS Nylon
  Guitar (e, se a confirmação indicar, Ample Guitar M Lite 4 / SSD Free). A página de cada um já é a do **fabricante**
  (não do BPB). `LUX Orchestral Strings Elements` **não** é duplicado de `polyphone-orchestral-strings` (é outro produto).
- **`store/store-extras.json`** tem 39 itens e **todos** existem também no principal. **Isso é por construção**:
  o script gera o principal a partir do extras. **Não é duplicidade a remover**; só documentar no cabeçalho do arquivo.
- Dentro do principal, 10 itens `archive-*` compartilham a mesma página do archive.org (coleção de SF2) e 2 itens Ample
  compartilham a mesma página de download. **Não são duplicados** (são produtos diferentes na mesma página).
- Pelo critério do Rafael (licença verificada na fonte), 9 itens do principal têm licença `unknown`
  (GeneralUser GS, FluidR3 GM2-2, Arachno, SGM-V2.01, Timbres of Heaven, Merlin Grand, Merlin Orchestra, Airfont 340,
  WeedsGM3). **Fora do escopo desta limpeza**, mas listar no relatório da L0.

## 3. Tarefas (nesta ordem)

**L0 — Confirmar (sem mudar nada).** Gerar `docs/LOJA-LIMPEZA.md` ("Confirmado") com: a lista final de duplicados
(com a evidência: mesma página oficial ou mesmo produto), a decisão para "SSD Free" e "Ample Guitar M Lite 4", o número
real de ocorrências de BPB (arquivo e linha) no código, nos JSON e na interface, e se algo mais lê
`store-catalog-bpb.json`. Critério: tabela completa, sem suposição. **Pare ao final.**

**L1 — Aproveitar o que é único, sem BPB.** Passar os itens do BPB que **não** são duplicados para a origem do
catálogo (`store/store-extras.json` ou o script, conforme o padrão já usado), **sem** `source: "bedroomproducersblog"`,
sem tag `BPB` e sem "Fonte: BPB." nas notas:
- `source`: `"official"` (página do fabricante);
- `page`: a página oficial que já está no BPB (conferir que abre e é do autor);
- **sem `url` de download** se não houver link oficial verificado (item "manual", só com a página);
- `licenseKind`/`license`: o que estiver **verificado na fonte**; senão `unknown` e `a confirmar`;
- itens que exigem conta ou app do fabricante (Spitfire, Native Instruments, etc.) mantêm `manualReason`.
Critério: nenhum item novo com `url` de origem não verificada; catálogo regenerado e validado
(`validateStoreCatalog`). **Pare ao final.**

**L2 — Remover duplicados e o BPB.**
1. Apagar `store/store-catalog-bpb.json`.
2. Nos 4 itens do principal com `source: "bedroomproducersblog"`: trocar para `"official"` e limpar a tag `BPB` e o
   prefixo `Fonte: BPB.` das notas (manter o restante do texto útil).
3. Código: remover `loadBpbCatalog`, a fonte `'bpb'`, `STORE_BPB_CATALOG_PATH` e o merge do BPB em `StoreService.ts`
   e `store-sources.ts`; remover `'bedroomproducersblog'` do tipo `StoreSource` e da lista de provedores em `store.ts`;
   remover o rótulo e a cor do provedor em `StoreSettings.tsx`.
4. Compatibilidade: configurações de usuário antigas que citem `bpb` (no `store-sources.list` ou no cache) devem ser
   **ignoradas sem erro**.
5. Atualizar os testes que dependem do BPB.
Critério: `grep -ri "bedroom\|bpb"` em `src/`, `store/`, `scripts/` e `docs/` só encontra a menção deste documento
(ou nada); o app abre a Loja sem erro e sem itens duplicados; `npm run typecheck` e `npx vitest run` passam.
**Pare ao final.**

**L3 — Conferir por teste.** Teste automatizado que falha se: (a) existir `id` repetido no catálogo gerado;
(b) existir dois itens com a mesma página oficial **e** o mesmo nome normalizado; (c) qualquer `page`/`url` contiver
`bedroomproducersblog`; (d) existir `source: "bedroomproducersblog"`. Critério: teste novo passando e rodando no CI.
**Pare ao final.**

**L4 — Documentar.** Atualizar `docs/LOJA.md` (a Loja lista só plugins e bibliotecas, com página oficial e, quando há,
download oficial; sem catálogo de terceiros) e o cabeçalho de `store-extras.json` explicando que é a **entrada** do
script gerador. Critério: docs coerentes com o código. **Pare ao final.**

## 4. Regras para o agente

1. Uma tarefa por commit; parar e mostrar o resultado.
2. **Não editar o catálogo gerado à mão.** Mudar a origem e regenerar com o script.
3. Não inventar links, licenças ou versões; usar `a confirmar`.
4. **Nenhum link para o Bedroom Producers Blog** e nenhuma menção a ele na interface.
5. Não adicionar download direto sem URL oficial verificada (HTTPS, host da lista permitida).
6. Não mexer em `asio/` nem em `.vscode/`.
7. Textos da interface em português do Brasil.

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Remover um item que o usuário já tinha instalado | Instalação é por arquivo no disco; a limpeza só muda o catálogo. Testar abrir um concert antigo |
| Config antiga com `bpb` no `store-sources.list` | L2 item 4: ignorar sem erro |
| Dois itens parecerem o mesmo produto e ser versões diferentes (ex.: Ample M Lite 4) | L0 decide com evidência; em dúvida, manter os dois e anotar |
| Perder itens úteis ao apagar o BPB | L1 passa os únicos para a origem **antes** de L2 |
| Link oficial mudar | Verificador de links existente da Loja; `a confirmar` na licença |

---

## 6. L0 — Confirmado (22/11/2026)

> Revisão no HEAD `85c0526` (o briefing foi escrito em `20fb582`). Nenhum arquivo de catálogo foi alterado ainda.
> Rafael autorizou executar **L0 → L4 na sequência**, sem commits; o resultado fica no working tree.

### 6.1 Duplicados confirmados (13) — remover a versão BPB

| # | Item BPB (`store-catalog-bpb.json`) | Item principal que fica | Evidência |
|---|---|---|---|
| 1 | `bpb-surge-xt` | `surge-xt` | mesma página oficial |
| 2 | `bpb-dexed` | `dexed` | mesma página oficial |
| 3 | `bpb-vital` | `vital` | mesmo nome e página |
| 4 | `bpb-tyrell-n6` | `tyrell-n6` | mesmo nome e página |
| 5 | `bpb-ob-xf` | `ob-xf` | mesmo nome e página |
| 6 | `bpb-decent-sampler` | `decent-sampler` | mesmo produto (site/página do produto) |
| 7 | `bpb-kontakt-factory-selection-2` | `kontakt-factory-selection-2` | mesmo produto (Native Instruments) |
| 8 | `bpb-spitfire-symphony-discover` | `spitfire-sso-discover` | mesmo produto (Spitfire) |
| 9 | `bpb-bbc-so-discover` | `bbcso-discover` | mesma página oficial |
| 10 | `bpb-sitala` | `sitala` | mesma página oficial |
| 11 | `bpb-mt-power-drum-kit-2` | `mt-power-drum-kit-2` | mesmo produto (Power Drum Kit) |
| 12 | `bpb-ssd-free` (“SSD Free”) | `steven-slate-drums-free` (“Steven Slate Drums 5.5 Free”) | mesmo produto; a página oficial `stevenslatedrums.com/ssd5/free` é a versão gratuita |
| 13 | `bpb-ample-guitar-m-lite-4` (“Ample Guitar M Lite 4”) | `ample-guitar-m-lite` | mesmo produto; a página oficial de download cobre o **Ample Guitar M Lite v4** |

Portanto: **25 itens BPB = 13 duplicados + 12 únicos** (antes eram estimados 13–14 únicos; SSD e Ample são duplicados).

### 6.2 Únicos (12) — migrar para `store/store-extras.json`

| Item BPB | Novo id (sem `bpb`) | Tipo/formato | Página oficial | Observação |
|---|---|---|---|---|
| `bpb-free-orchestra-2` | `free-orchestra-2` | library / Instalador | `projectsam.com/libraries/the-free-orchestra-2/` | manual (Kontakt) |
| `bpb-lux-orchestral-strings` | `lux-orchestral-strings` | library / Instalador | `sonuscore.com/shop/` | manual |
| `bpb-creative-toolbox-piano` | `creative-toolbox-piano` | library / Instalador | `strezov-sampling.com/` | manual |
| `bpb-1928-vintage-grand-steinway` | `1928-vintage-grand-steinway` | library / Instalador | `soundpaint.com/products/1928-vintage-grand-steinway` | manual (Soundpaint) |
| `bpb-sweetcase` | `sweetcase` | plugin / VST3 | `noiseash.com/sweetcase-vintage-electric-piano/` | manual |
| `bpb-labs-soft-piano` | `labs-soft-piano` | plugin / VST3 | `labs.spitfireaudio.com/` | manual (conta Spitfire) |
| `bpb-monastery-grand` | `monastery-grand` | plugin / VST3 | `meldaproduction.com/MonasteryGrand` | manual |
| `bpb-piano-one` | `piano-one` | plugin / VST3 | `supremepiano.com/` | manual |
| `bpb-bfd-player` | `bfd-player` | plugin / VST3 | `bfddrums.com/bfd-player/` | manual (conta BFD) |
| `bpb-triaz-player` | `triaz-player` | plugin / VST3 | `wavealchemy.co.uk/product/triaz-player/` | manual |
| `bpb-shreddage-3-stratus-free` | `shreddage-3-stratus-free` | plugin / Instalador | `impactsoundworks.com/product/shreddage-3-stratus-free-kp/` | manual (Kontakt) |
| `bpb-foundations-nylon-guitar` | `foundations-nylon-guitar` | library / Instalador | `heavyocity.com/products/foundations-nylon-guitar` | manual (Kontakt) |

Todos entram como `source: "official"`, `tier: "indexed"`, licença **`unknown`** (“Verificar na página oficial”), **sem URL de download** (só `page`), sem tag `BPB` e sem “Fonte: BPB” nas notas.

### 6.3 Ocorrências reais de BPB

| Arquivo | Qtde | Linhas / observação |
|---|---|---|
| `store/store-catalog-bpb.json` | 133 | arquivo inteiro; `"source": "bedroomproducersblog"` na linha 4 |
| `store/store-catalog.json` | 12 | 3635, 3645, 3652, 3694, 3703, 3710, 3752, 3762, 3769, 3821, 3830, 3837 (gerado) |
| `store/store-extras.json` | 12 | 1203, 1207, 1211, 1248, 1252, 1256, 1293, 1298, 1302, 1347, 1351, 1355 |
| `src/main/store/StoreService.ts` | 18 | 39, 143, 216, 226–237, 265, 269, 283–284, 337, 340, 632 |
| `src/main/store/StoreService.test.ts` | 17 | 407–446, 491–506 |
| `src/shared/store-sources.test.ts` | 14 | 15, 56–57, 62–63, 77, 82, 87, 98–113 |
| `src/shared/store.ts` | 3 | 28 (`StoreSource`), 135 (comentário), 207 (lista de fontes) |
| `src/shared/store-sources.ts` | 2 | 12–13 (constante `STORE_BPB_CATALOG_PATH`) |
| `src/renderer/components/concert/StoreSettings.tsx` | 2 | 55 (rótulo), 65 (cor) |
| `docs/LOJA-LIMPEZA.md` | — | este documento (mantém as menções históricas) |

**Quem lê o `store-catalog-bpb.json`:** somente `StoreService.loadBpbCatalog()` (`StoreService.ts:227-238`), a constante `STORE_BPB_CATALOG_PATH` (`store-sources.ts:13`) e os testes. Nada no gerador (`generate-store-catalog.mjs`), no `package.json` além de `store/**/*`, ou em outro serviço.

### 6.4 Itens que compartilham página (não são duplicados)

- Os **10** `archive-*` compartilham a mesma página do Archive.org, mas são bancos diferentes.
- Os **2** Ample (`ample-guitar-m-lite` e `ample-bass-p-lite`) usam a mesma página de downloads, mas são produtos diferentes.
- **9** itens do principal têm licença `unknown` (GeneralUser GS, FluidR3, Arachno, SGM-V2.01, Timbres of Heaven, Merlin Grand, Merlin Orchestra, Airfont 340, WeedsGM3). **Fora do escopo** desta limpeza; ficam registrados.

### 6.5 Conclusão do L0

- **L1:** migrar os **12** únicos da tabela 6.2 para `store-extras.json` e regenerar.
- **L2:** apagar `store-catalog-bpb.json`, remover o código/UI/testes de BPB e limpar os **4** itens do principal que usam `source: "bedroomproducersblog"` (`spitfire-sso-discover`, `kontakt-factory-selection-2`, `ob-xf`, `mt-power-drum-kit-2`).
- **L3:** teste de regressão conforme o plano.
- **L4:** `docs/LOJA.md` + cabeçalho do `store-extras.json`.


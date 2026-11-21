# B4 — Plano de empacotamento do Guitarix (sem portar DSP)

> **Somente pesquisa e relatório.** Nada será compilado, copiado ou alterado nesta fase.
> Abordagem aprovada: **plugin embarcado (LV2) + painel/presets/MIDI do Preseter**.
> Base: `docs/B2-GUITARIX-LV2.md`, `docs/B3-GUITARIX-CANDIDATOS.md`, `docs/MAPA-GUITARIX.md`.

## 0. Spike — resultado (2026-11-21)

**Build (Windows, MSYS2 UCRT64)**
- O README fala em `MinGW64`, mas esta versão do MSYS2 não tem mais o repositório `mingw64`;
  usei **UCRT64** (`C:\msys64\ucrt64`, g++ 16.2.0) com os pacotes `mingw-w64-ucrt-x86_64-*`.
- Configure funcionou com as flags do README **mais `--no-lv2-gui`** (sem isso, o link da UI falha
  no Windows: `libxcairo.a` → `__imp_cairo_*` sem `-lcairo`; e não precisamos da UI).
- `waf build && waf install` gerou **70 bundles** em `C:\msys64\tmp\lib\lv2`.
- `gxts9.so` (169 KB) depende só de `KERNEL32` + `api-ms-win-crt-*` (UCRT do sistema); **nenhuma
  DLL do MSYS2** graças ao `--static-lib`.

**Hosting no motor (validado)**
- `scan` com a pasta do bundle → achou **`GxTubeScreamer`** (id `LV2-GxTubeScreamer-…`, formato
  `LV2`, caminho = URI `http://guitarix.sourceforge.net/plugins/gxts9#ts9sim`).
- `load` → **4 parâmetros**: `Level`, `Tone`, `Drive`, `Bypass`.
- `setParam`/`getParam` → funcionam (`Drive` 0.5 → 0.8; `Bypass` Off → On).
- **`getState`/`setState` → “Estado de plugins LV2 não é suportado.”** (o wrapper LV2 do JUCE não
  implementa estado). Hoje `getInsertState` engole o erro e devolve `null`: **o patch perderia os
  ajustes do insert LV2**.

**Consequência para o plano**: incluir um *fallback* de estado por **snapshot de parâmetros**
(marcador `params-base64:` em `VstManager.getInsertState/setInsertState`), que também serve para
qualquer plugin sem estado. Aplicar por `setParam` no restore.

**Identidade no catálogo**: casar por **nome do plugin** (`GxTubeScreamer`) e/ou pelo **URI do LV2**
(não pelo basename do arquivo, que aqui é uma URI).

**A confirmar**: processamento de áudio no grafo (o probe não abriu dispositivo de áudio) e o
comportamento ao abrir o editor original (não construímos a UI).

### 0.1 Correções vindas do motor (importante)

O **nome/index dos parâmetros no motor não é exatamente o do `.ttl`**:

| Módulo | Nome no scan | Observação |
|---|---|---|
| `gxts9` | `GxTubeScreamer` | 4 params (0 Level, 1 Tone, 2 Drive, 3 Bypass) |
| `gx_studiopre` | `Gx Studio Preamp Mono` | 6 params |
| `gx_cabinet` | `GxCabinet` | **Bypass no índice 4** (o motor não expõe `SCHEDULE`) |
| `gx_amp` | `GxAmplifier-X` | 15 params: **Bypass 12, HIGHGAIN 13, Post trim 14** (0..2); `SCHEDULE` não existe |
| `gx_tremolo` | `GxTremolo` | 5 params |

- Os textos de escolha vêm dos `lv2:scalePoint` do `.ttl` (Model 19 opções, Tonestack 28, Cab Model
  19, Mode 2) e entram no catálogo como `choices`; o painel renderiza um `<select>` com o rótulo.
- O catálogo casa pela **URI** (chave estável) e usa `pluginNames` como apoio para os nomes reais do
  scan (`GxAmplifier-X`, `Gx Studio Preamp Mono`, `GxTremolo`).
- O `gx_amp.so` tem 6,3 MB e o `gx_cabinet.so` 4,6 MB (IR/tabelas embutidas); os cinco bundles somam
  ~11 MB.

### 0.2 Insert com o cache de plugins: o mundo LV2 frio (corrigido)

A primeira validação no app (build dev) falhou no insert com **“Unable to locate plugin with the
requested URI”** e o painel não recebia parâmetros.

- **Causa**: o app abre com `scanPluginsOnStartup: false`; nesse modo ele lê o cache
  (`known-plugins.xml` → comando `plugins`) e o lilv **não carrega os bundles** `.lv2`. O formato LV2
  do JUCE só carrega um bundle em `findAllTypesForFile`, chamado pelo scanner. Sem bundle no mundo,
  `findPluginByUri` devolve `null` — o id/URI do cache não resolve. Reproduzido isolado no motor
  (processo novo sem scan + `setInsert` → mesmo erro; com scan da pasta → ok).
- **Correção no motor**: pasta dos bundles gravada em `lv2-bundles.txt` (por scan ou comando) e
  recarregada no construtor; `warmLv2World()` carrega as pastas antes de `load`/`setInsert`. Novo
  comando **`warmLv2 { paths }`** (só carrega `.lv2`, sem varrer VST) chamado pelo app no boot com
  `pluginScanFolders()`.
- **Validação no app (dev, ASIO4ALL)**: os cinco efeitos entram no Master do Patch juntos
  (`GxTubeScreamer`, `GxTremolo`, `GxCabinet`, `GxAmplifier-X`), o painel mostra os 15 parâmetros do
  Amp com os `<select>` de modelo/tonestack/cabine e o preset “Lead” muda os valores (Distorção 0.596,
  Drive 0.747, Médios 0.65, Agudos 0.6, Presença 0.7). Sem erro no motor.
- **Nota de bancada**: quando o app de teste era iniciado com o `stderr` ligado a um pipe que ninguém
  lia, o `console.warn` do main (que repassa o stderr do motor) bloqueava — era o pipe, não o app.
  Rodando com `stderr` em arquivo, o boot/inserts funcionam normalmente.
- **Licença/créditos**: o conjunto Guitarix sai como **GPL-3.0-or-later** (o `COPYING` do upstream
  explica: módulos em GPL-2.0+, mas `zita-convolver`/`zita-resampler` são GPL-3.0+). O painel passou
  a citar o Guitarix no “Sobre” (antes repetia o texto do calfnXT) e o rodapé permanece
  **Guitarix · GPL-3.0-or-later**.

### 0.3 Build Linux (2026-11-21)

- Container **Ubuntu 22.04** + **g++-12** (GCC 11 não compila o NAM: `std::atomic<std::shared_ptr>`),
  mesmas flags do Windows (`--no-standalone --no-faust --includeresampler --includeconvolver
  --static-lib --no-lv2-gui --no-avahi --no-bluez --no-nsm --no-desktop-update`).
- **FFTW estático**: `gx_amp`/`gx_cabinet` usam o convolver. O `.pc` aponta `Libs` para
  `/usr/lib/.../libfftw3f.a` e o arquivo entra em `LDFLAGS` no cache do waf — em `LIB` ele ficaria
  antes dos objetos e o linker não puxaria os membros (`fftwf_*` indefinido em runtime).
- Resultado (x86_64, total **5,4 MB**): `gx_amp` 3,11 MB, `gx_cabinet` 2,33 MB, `gx_studiopre`
  85 KB, `gxts9` 18 KB, `gx_tremolo` 15 KB. `NEEDED` só `libstdc++/libm/libgcc_s/libc`
  (sem fftw/zita/lilv); glibc ≥ 2.34; sem `TEXTREL`.
- **Validação**: `lv2ls` lista os 6 URIs; host lilv mínimo (áudio + controle + atom +
  `worker#schedule`) instanciou e processou 200 blocos nos cinco. `lv2apply` cobre 3; `gx_amp` e
  `gx_cabinet` exigem `worker#schedule` (porta atom `SCHEDULE`) e são pulados por ele — feature que
  o host do JUCE/Preseter fornece.
- Os cinco bundles estão em `vendor/guitarix/plugins-linux/` (o `README` de “pendente” foi
  removido; a receita está em `vendor/guitarix/UPSTREAM.md`). O `package.json` já copia a pasta
  para `resources/plugins/guitarix` no AppImage/deb.

## 1. Resultado esperado

Cinco efeitos **do app**, sem instalação pelo usuário:

| # | Bundle LV2 | Nome no app | id do catálogo | Fase |
|---|---|---|---|---|
| 1 | `gxts9.lv2` | Preseter Overdrive | `preseter.gx.overdrive` | validação |
| 2 | `gx_studiopre.lv2` | Preseter Preamp | `preseter.gx.preamp` | 1 |
| 3 | `gx_cabinet.lv2` | Preseter Cab | `preseter.gx.cab` | 2 |
| 4 | `gx_amp.lv2` | Preseter Amp | `preseter.gx.amp` | 2 |
| 5 | `gx_tremolo.lv2` | Preseter Tremolo | `preseter.gx.tremolo` | 3 |

## 2. Build e vendorização

### 2.1 Receita (upstream `2a357f65…`)

> **Atualização:** o resultado real está em **0.1–0.3**; a receita final dos dois builds está em
> `vendor/guitarix/UPSTREAM.md`. O texto abaixo fica como referência do plano.

**Windows (MSYS2/MinGW, `trunk/README.mswin`)**
```
cd trunk
./waf configure -j 4 --check-cxx-compiler=g++ --no-standalone --no-faust \
  --includeresampler --includeconvolver --no-avahi --no-bluez --no-nsm \
  --no-desktop-update --static-lib
./waf build
./waf install --destdir=_bin
```
Saída esperada em `trunk/_bin/…` (caminho exato **a confirmar** no primeiro build).

**Linux (Ubuntu 22.04)**
```
export CC=gcc-12 CXX=g++-12
./waf configure --no-standalone --no-faust --includeresampler --includeconvolver --static-lib \
  --no-lv2-gui --no-avahi --no-bluez --no-nsm --no-desktop-update
./waf build && ./waf install
```
Dependências: ver `vendor/guitarix/UPSTREAM.md` (inclui `g++-12`, `liblilv-dev`, `lv2-dev`,
`libfftw3-dev`); o FFTW entra estático via `LDFLAGS`.
### 2.2 Onde os binários ficam

```
vendor/guitarix/
  UPSTREAM.md            # origem, commit, flags, licença e as duas receitas
  COPYING.txt            # trunk/COPYING (GPL-3.0-or-later no conjunto)
  plugins-win/           # 5 bundles .lv2 compilados no Windows (~11 MB)
  plugins-linux/         # 5 bundles .lv2 compilados no Linux (~5,4 MB)
```

- Mesmo padrão do calfnXT: binário versionado, sem build no `npm install`.
- Só entram os 5 bundles escolhidos (mais as dependências internas que já vão dentro do `.lv2`).
- Tamanho real: Windows ~11 MB; Linux ~5,4 MB (FFTW estático dentro de `gx_amp`/`gx_cabinet`).

### 2.3 Empacotamento no instalador

`electron-builder` → `extraResources`: `vendor/guitarix/plugins-<so>` → `resources/plugins/guitarix`.
(Ponto a confirmar no `package.json` atual, que hoje copia `vendor/calfnxt` para
`resources/plugins/calfnxt`.)

## 3. Mudanças no app (arquivos)

| Arquivo | Mudança |
|---|---|
| `src/main/platform/paths.ts` | `bundledPluginFolder()` → devolver **duas** pastas (calfnxt e guitarix), ou uma função `bundledPluginFolders()` |
| `src/main/index.ts` | `bundledPluginFolders()` incluir as duas; `pluginScanFolders()` e `watchVstFolders()` incluírem a pasta do Guitarix |
| `src/shared/effects/catalog.ts` | `effectKey()` remover também `.lv2`; novo campo `source: 'calfnxt' | 'guitarix'`; `originalEditor?: boolean` |
| `src/shared/effects/catalog.json` | 5 entradas novas + presets (geradas — ver §4) |
| `PreseterEffectWindow.tsx` | badge por `source` (CALFNXT/GUITARIX); esconder “Editor original” quando `originalEditor` for falso |
| `src/main/vst/VstManager.ts` | `getInsertState`/`setInsertState`: fallback **snapshot de parâmetros** (`params-base64:`) quando o plugin não suportar estado (caso do LV2) |
| `scripts/gerar-catalogo-guitarix.js` (novo) | gerar o catálogo a partir dos `.ttl` (nome, min/max/default, símbolo) |

O resto do caminho já existe: `openPreseterInsert` resolve pelo caminho do insert, o painel lê
`getVstParameters(owner, slot)`, o estado é salvo em `vstStates` e o MIDI usa `paramOwner`+`paramSlot`.

## 4. Catálogo e presets a partir do `.ttl`

Cada porta de controle do `.ttl` traz `lv2:index`, `lv2:symbol`, `lv2:name`, `lv2:default`,
`lv2:minimum`, `lv2:maximum` — dá para gerar o catálogo **sem rodar o motor**:

- nome PT (dicionário curto) + unidade;
- faixa e default reais;
- ordem/índice (validar contra `params` do motor no spike — o JUCE enumera as portas de controle);
- presets em unidades reais (3–4 por efeito), no mesmo formato do banco do calfnXT.

Nomes de parâmetros já levantados (B3): `gx_amp` (14), `gx_cabinet` (4), `gx_studiopre` (6),
`gxts9` (3 + bypass), `gx_tremolo` (4).

**Identidade**: o caminho de um LV2 é uma **URI** (`http://…/gxts9#ts9sim`), não um arquivo; o
catálogo deve casar pelo **nome do plugin** (`GxTubeScreamer`, `GxAmplifier`) e/ou pelo trecho
`gxts9`/`gx_amp` da URI. O nome do plugin é a chave prática.

## 5. Estado, presets e MIDI

- **Estado**: `getState`/`setState` com `slot` já é usado para VST3; validar o mesmo para LV2 no
  spike. O patch guarda em `vstStates` (`insert_<owner>_<slot>`), sem mudança de formato.
- **Presets**: aplicados por `setParam` (como no calfnXT); “+ Preset” do usuário continua.
- **MIDI**: nada a mudar — insert com `paramOwner` + `paramSlot` já é endereçável e tem learn.

## 6. UI

- Badge “GUITARIX” no header do painel (além de “EFEITO”).
- Nome Preseter nas listas de inserts/efeitos (já há `effectDisplayName`).
- “Editor original” oculto nas duas plataformas (UI é xputty/X11 e não é distribuída).
- Sobre/Help: créditos do Guitarix (A2).

## 7. Testes e critérios de aceite

**Spike (obrigatório antes do catálogo)**
1. Compilar `gxts9` (Windows ou Linux).
2. Copiar para a pasta de plugins do usuário e reescanear.
3. Confirmar: aparece como LV2, carrega como insert, lista os 3 parâmetros + bypass, processa áudio,
   salva/restaura estado no patch.

**Depois (por fase)**
- Unit: `effectKey` com `.lv2`; catálogo com 5 entradas; presets dentro de 0..1.
- Integração: scan encontra `resources/plugins/guitarix`; insert abre o painel; estado sobrevive.
- Manual: presets trocam o som; MIDI move o parâmetro; bypass funciona.
- CPU: medir `gx_amp` (convolução + resample) e registrar no B1/D1.

## 8. Coleção e patches

- ~~2–3 patches de fábrica usando os novos efeitos~~ **Feito** como um **template “Guitarra”**
  (`src/main/concert/templates.ts`), sem tocar no catálogo de 40 (em revisão em paralelo):
  - **Guitarra Clean**: Master com Preamp (`bright`) → Cab (`open`) → Tremolo (`subtle`).
  - **Guitarra Crunch**: Overdrive (`crunch`) → Amp (`crunch`).
  - **Guitarra Lead**: Overdrive (`lead`) → Amp (`lead`).
  - Set “Guitarra”, concert “Meu Concert de Guitarra”, 100 BPM, teclado na tela; o usuário
    adiciona o VST/sampler de guitarra. Os inserts entram por **URI** do bundle, então funcionam
    no Windows e no Linux, e o preset do catálogo é aplicado ao carregar o patch.
- Validado no app: os três patches carregam a cadeia certa e os presets (Bright On, Drive 0.45 no
  Crunch, Drive 0.75/Distorção 0.6 no Lead).

## 9. Licença e distribuição

- Código/bundles: **GPL-3.0-or-later** (A1). Atribuição no Help/Sobre (A2).
- **Obrigação de fonte**: guardar o commit exato, as flags de build e disponibilizar o fonte
  correspondente (tarball do commit no release ou oferta escrita). Definir isso antes de publicar.
- Nenhum código do Guitarix é misturado ao do Preseter (apenas hospedado).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| ~~LV2 não carregar/parametrizar~~ | **validado no spike** (scan, load, params) |
| **Estado do LV2 não suportado** | snapshot de parâmetros no `VstManager` (marcador `params-base64:`) |
| Build Windows frágil | CI com MSYS2 e artefato versionado; receita fixada |
| Índices de porta ≠ índices do JUCE | validar no spike; se preciso, mapear por `symbol` |
| CPU do amp | medir; limite de qualidade/IR; presets leves |
| UI X11 no Windows | não usar; painel Preseter |
| Fonte GPL | tarball do commit + flags no release |

## 11. Fases

1. **Spike** `gxts9` (build + load + params + áudio + estado).
2. **Fase 1**: `gxts9` + `gx_studiopre` no catálogo, painel, presets, testes.
3. **Fase 2**: `gx_cabinet` + `gx_amp` (zita/IR), presets e CPU.
4. **Fase 3**: `gx_tremolo`, patches de guitarra, polimento.
5. **Fechamento**: D1 (relatório e aprovação) e release.

**Nada de código antes do spike validar o hosting LV2.** Aguardando o “ok” para começar o spike.

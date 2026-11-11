# Plano — Biblioteca de Sons (loja de downloads SFZ/SF2)

**Objetivo:** dentro do Preseter, o usuário encontra bibliotecas de sons **SFZ e SF2**,
baixa com um clique e usa no **sforzando** (player padrão do projeto).

**Decisões:**
- O Preseter é open source, sem fins lucrativos, com foco em Linux na versão pública
  (a Fase Linux fica para depois; este plano vale nos dois sistemas).
- Modelo: **catálogo com links**. O projeto **não hospeda** os arquivos de terceiros; o app
  baixa **da fonte original**, mostrando a licença e o autor antes.
- Nada de ROMs, nada de arquivos com licença pouco clara.

> **(a confirmar)** = vem de conhecimento geral ou de páginas lidas, não foi testado.

## 1. O que o sforzando aceita

Segundo a página do plugin no KVR: carrega **SFZ, SF2 (SoundFont), DLS e WAV (ACIDized)**.
Arrastar um SF2 para a janela converte para SFZ 2.0. É gratuito (Plogue), VST/VST3/AU/AAX/CLAP,
para Windows, macOS e Linux (beta). **Não é open source**: o instalador não deve ser
redistribuído pelo projeto; o app só aponta para o download.

Consequência: um único player (sforzando) cobre as duas famílias de arquivo; o **SF2 Player**
da Bertom deixa de ser necessário na coleção (a confirmar o resultado dos SF2 de maior porte).

## 2. Licenças aceitas no catálogo

| Licença | Entra no catálogo? | Observação |
|---|---|---|
| CC0 / domínio público | Sim | |
| CC BY, MIT, BSD | Sim | Mostrar a atribuição |
| GPL / LGPL | Sim | Só link; conferir se há restrições a samples |
| CC Sampling Plus, CC BY-NC | Só link, com aviso | Restrições de uso comercial |
| "Uso pessoal apenas" / sem licença | Só link, aviso em destaque | Nunca espelhar |
| Proprietária / paga | Não | |

Isto não é aconselhamento jurídico: antes de incluir um item, ler a licença no site do autor.

## 3. Formato do catálogo (`docs/catalogo-sons.json`)

```json
{
  "version": 1,
  "items": [
    {
      "id": "salamander-grand-v3",
      "name": "Salamander Grand Piano V3",
      "category": "Piano",
      "format": "sfz",
      "author": "Alexander Holm",
      "license": "CC-BY-3.0",
      "attribution": "Salamander Grand Piano by Alexander Holm (CC BY 3.0)",
      "page": "https://github.com/sfzinstruments/SalamanderGrandPiano",
      "download": "<link direto>",
      "sizeMB": 0,
      "sha256": "<hash>",
      "entry": "Salamander Grand Piano V3.sfz",
      "notes": "Usar no sforzando"
    }
  ]
}
```

`download` e `sha256` só entram depois de conferidos; item sem hash aparece como "baixar na página".

## 4. Itens iniciais candidatos (a conferir um a um)

| Biblioteca | Formato | Licença (informada nas páginas lidas) |
|---|---|---|
| Salamander Grand Piano V3 | SFZ | CC BY 3.0 |
| MuseScore_General | SF2 / SF3 | MIT |
| Sonatina Symphonic Orchestra | SF2 e SFZ | CC Sampling Plus 1.0 |
| TimGM6mb | SF2 | GPL v2 |
| FreePats (várias) | SFZ/SF2 | variam por instrumento |

## 5. Fases (uma de cada vez)

### Fase 1 — Catálogo
- [ ] **1.1** Criar `docs/catalogo-sons.json` com 4 a 6 itens **conferidos** (licença, link, tamanho, hash).
- [ ] **1.2** Documentar as regras de licença (seção 2) em `docs/LICENCAS.md`.
- **Pronto quando:** todo item tem licença, autor, atribuição e link verificados.

### Fase 2 — Baixador (sem interface)
- [ ] **2.1** `scripts/baixar-sons.js --id=ID` (ou `--todos`): baixa para `~/PreseterSons/<id>/`.
- [ ] **2.2** Confere o `sha256`; extrai `.zip`; ignora o que já existe; mostra a licença e a atribuição.
- [ ] **2.3** Mostra o caminho do arquivo principal (`entry`) para abrir no sforzando.
- **Pronto quando:** `baixar-sons.js --id=salamander-grand-v3` deixa o `.sfz` pronto numa pasta.

### Fase 3 — Integração com o sforzando (o ponto de maior dúvida)
- [ ] **3.1** Investigar **como carregar um arquivo no sforzando** a partir do Preseter.
  O estado do sforzando é interno; o app pode não conseguir apontá-lo para um `.sfz` sozinho.
- [ ] **3.2** Se não for possível automatizar: o app mostra o caminho e o usuário carrega no
  plugin (arrastar ou menu), depois grava o **snapshot** do patch (já existe no app).
- [ ] **3.3** Se for possível (estado/chunk contém o caminho): gerar o estado e aplicar ao clique.
- **Pronto quando:** fluxo "baixar → usar no patch" está definido e documentado.

### Fase 4 — Tela "Biblioteca de Sons" no app
- [ ] **4.1** Lista com busca e filtros (categoria, formato, licença), lendo o catálogo.
- [ ] **4.2** Botão **Baixar** com barra de progresso, licença e atribuição visíveis.
- [ ] **4.3** Marca "instalado" lendo `~/PreseterSons`; botão "Mostrar na pasta".
- [ ] **4.4** Estilo visual igual ao resto do app (paleta azul e grafite).

### Fase 5 — Curadoria aberta
- [ ] **5.1** `CONTRIBUINDO.md`: como propor um item (pull request) e os critérios de licença.
- [ ] **5.2** Verificação automática (CI) do JSON: campos obrigatórios, licença permitida, link vivo.

### Fase 6 — Linux (depois)
- [ ] **6.1** Mesmo catálogo, pasta `~/PreseterSons`, baixador em `.sh`/Node; sforzando beta ou sfizz.

## 6. Riscos

- **Licença:** um item mal classificado pode criar problema; por isso só link, nunca espelho.
- **Links quebram** (sites saem do ar): a verificação automática (5.2) avisa.
- **Carregar o arquivo no sforzando** pode exigir passo manual (Fase 3).
- **Tamanho:** bibliotecas grandes (centenas de MB); o app precisa mostrar o espaço e permitir cancelar.
- Os SF2 muito grandes podem ser pesados no sforzando; testar com os da coleção.

## 7. Revisão: lacunas encontradas e tarefas

- [ ] **7.1 Onde mora o catálogo.** Cópia embutida no app (funciona offline) + atualização
  opcional baixando o JSON do repositório; mostrar a data da última atualização.
- [ ] **7.2 Segurança do download.** Só `https`; conferir `sha256`; limite de tamanho;
  extrair `.zip` sem permitir caminhos fora da pasta de destino (*zip slip*); nunca executar nada baixado.
- [ ] **7.3 Hash divergente.** Se o arquivo mudou na fonte, avisar "o autor atualizou este arquivo"
  e oferecer baixar mesmo assim, em vez de só falhar.
- [ ] **7.4 Verificar cada link antes de entrar no catálogo.** Pendentes: Sonatina (link `http` de
  FTP do MuseScore, pode estar fora do ar), Salamander (o GitHub não tem pacote pronto: é o repositório
  com samples em FLAC; confirmar tamanho e se o zip do GitHub traz todos os arquivos),
  MuseScore_General (confirmar onde está o `.sf2`, que tem cerca de 208 MB).
- [ ] **7.5 Créditos automáticos.** Gerar `CREDITOS.md` com a atribuição de tudo o que o usuário baixou.
- [ ] **7.6 Downloads grandes.** Pausar, retomar e cancelar; mostrar o espaço livre antes de começar.
- [ ] **7.7 Bibliotecas do usuário.** Aceitar pastas extras com `.sfz`/`.sf2` fora do catálogo.
- [ ] **7.8 Testes.** Catálogo inválido, hash errado, zip malicioso e link fora do ar.

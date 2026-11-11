# Preseter — Coleção livre: instrumentos, formatos e licenças

Este documento reúne a decisão de instrumentos da coleção de 40 patches
(`docs/PATCHES.md`) e o que precisa ser conferido antes de distribuir o app ou a
coleção.

## Decisão atual

- **Player SFZ/SF2:** **Sforzando** (Plogue, freeware). É o player dos patches
  de piano acústico, órgão, cordas, metais, flauta, coral e baixo. No Linux é a
  versão beta oficial; importa SF2 e converte para SFZ.
- **Piano de cauda alternativo:** **sfizz** (BSD-2) + **Salamander Grand Piano V3**
  (CC BY 3.0, exige atribuição). Fica como opção de qualidade, não como padrão.
- **Sintetizadores:** Surge XT (GPLv3), Dexed (GPLv3), Odin 2 (GPLv3), Helm
  (GPLv3), MDA (GPL) e setBfree (GPL-2.0). O setBfree é LV2 e o carregamento
  ainda não foi validado no Windows.
- **Bibliotecas de som:** **MuseScore_General** (MIT) e **Sonatina Symphonic
  Orchestra** (CC Sampling Plus 1.0). Os arquivos SF2 não são distribuídos com o
  Preseter; o usuário baixa e carrega no Sforzando.

## Como instalar

### Pelo app (recomendado)

1. Abra **Configurações → Coleção**.
2. Marque **Plugins** e **Bibliotecas** (os essenciais já vêm marcados).
3. Clique em **Baixar selecionados**.
4. Depois de instalar, clique em **Gerar concert da coleção**.

O app baixa das fontes oficiais, extrai os zips em
`%LOCALAPPDATA%\Programs\Common\VST3` (sem administrador) e salva as bibliotecas
em `~/PreseterSons` (configurável). Instaladores `.exe` (Odin) são apenas baixados
e aparecem como **pronto** para você abrir.

### Pelo script (modo avançado/CLI)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1
# só verifica:
powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1 -SemBaixar -SemGerar
# itens específicos:
powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1 -Itens sforzando,musescore-general
```

O script lê o mesmo catálogo do app (`src/shared/collection-catalog.json`) e, no
final, roda `scripts/gerar-colecao.js`.

## Como o Sforzando é usado

1. Instale o Sforzando (Windows: instalador oficial; Linux: beta oficial).
2. No Preseter, escaneie os plugins VST3.
3. Abra o patch, abra o plugin (tecla **V**) e carregue o SFZ/SF2 desejado no
   Sforzando (o SF2 é convertido para SFZ no import).
4. Escolha o preset/Program Change e feche a janela.
5. Salve o concert/patch: o estado completo do plugin é gravado no patch e
   restaurado ao reabrir.

O template **Full Set** e o script `scripts/gerar-colecao.js` montam apenas a
estrutura (sets, camadas, faixas, volumes e teclado). O som é escolhido dentro do
plugin.

## Pendências de validação

- [ ] Instalar o Sforzando (Windows e Linux beta) e rodar o scan do motor.
- [ ] Carregar um SFZ/SF2, salvar e reabrir o patch para confirmar que o estado volta.
- [ ] Medir o CPU com 2–3 layers de Sforzando simultâneos.
- [ ] Testar o setBfree (LV2) no Linux.

## Licenças

| Item | Licença | Como é usado |
|---|---|---|
| Preseter | AGPL-3.0-or-later | Código do app (`LICENSE`, `package.json`) |
| JUCE 8 | AGPLv3 ou comercial | Linkado no motor `preseter-engine` |
| Sforzando | Freeware (Plogue) | VST3 externo; não redistribuir |
| FSVR | GPLv3 | VST3 externo; não redistribuir |
| sfizz | BSD-2 | VST3 externo (opcional) |
| Salamander Grand Piano V3 | CC BY 3.0 | Samples; exige atribuição |
| MuseScore_General | MIT | SF2; baixado à parte |
| Sonatina Symphonic Orchestra | CC Sampling Plus 1.0 | SF2; baixado à parte |
| Surge XT / Dexed / Odin 2 / Helm | GPLv3 | VST3 externos |
| MDA | GPL | VST externos |
| setBfree | GPL-2.0 | LV2 externo |

O Sforzando e os demais plugins GPLv3 rodam como processos/plugins separados
carregados em tempo de execução; o Preseter não os linka. Os binários são baixados
dos sites oficiais e não são redistribuídos pelo Preseter.

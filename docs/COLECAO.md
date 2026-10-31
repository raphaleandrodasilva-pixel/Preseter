# Preseter — Coleção livre: instrumentos, formatos e licenças

Este documento reúne a decisão de instrumentos da coleção de 40 patches
(`docs/PATCHES.md`) e o que precisa ser conferido antes de distribuir o app ou a
coleção.

## Decisão atual

- **Player SF2:** **juicysfplugin 3.1.0** (VST3, GPLv3). Substitui o SF2 Player
  (Bertom) e o sforzando nos patches de piano acústico, órgão, cordas, metais,
  flauta, coral e baixo.
- **Piano de cauda alternativo:** **sfizz** (BSD-2) + **Salamander Grand Piano V3**
  (CC BY 3.0, exige atribuição). Fica como opção de qualidade, não como padrão.
- **Sintetizadores:** Surge XT (GPLv3), Dexed (GPLv3), Odin 2 (GPLv3), Helm
  (GPLv3), MDA (GPL) e setBfree (GPL-2.0). O setBfree é LV2 e o carregamento
  ainda não foi validado no Windows.
- **Bibliotecas de som:** **MuseScore_General** (MIT) e **Sonatina Symphonic
  Orchestra** (CC Sampling Plus 1.0). Os arquivos SF2 não são distribuídos com o
  Preseter; o usuário baixa e carrega no juicysfplugin.

## Como o juicysfplugin é usado

1. Instale o VST3 do juicysfplugin 3.1.0 (Windows x64).
2. No Preseter, escaneie os plugins VST3.
3. Abra o patch, abra o plugin (tecla **V**) e carregue o SF2 desejado no
   juicysfplugin.
4. Escolha o preset (Program Change) e feche a janela.
5. Salve o concert/patch: o estado completo do plugin é gravado no patch e
   restaurado ao reabrir.

O template **Full Set** e o script `scripts/gerar-colecao.js` montam apenas a
estrutura (sets, camadas, faixas, volumes e teclado). O som é escolhido dentro do
plugin.

## Pendências de validação

- [ ] Instalar o VST3 do juicysfplugin 3.1.0 e rodar o scan do motor.
- [ ] Carregar um SF2, trocar de preset por Program Change, salvar e reabrir o
      patch para confirmar que o preset volta.
- [ ] Medir o CPU com 2–3 layers de juicysfplugin simultâneos.
- [ ] Testar o setBfree (LV2) no Windows.

## Licenças

| Item | Licença | Como é usado |
|---|---|---|
| Preseter | AGPL-3.0-or-later | Código do app (`LICENSE`, `package.json`) |
| JUCE 8 | AGPLv3 ou comercial | Linkado no motor `preseter-engine` |
| juicysfplugin | GPLv3 | VST3 externo (sem linkagem); creditar |
| sfizz | BSD-2 | VST3 externo (opcional) |
| Salamander Grand Piano V3 | CC BY 3.0 | Samples; exige atribuição |
| MuseScore_General | MIT | SF2; baixado à parte |
| Sonatina Symphonic Orchestra | CC Sampling Plus 1.0 | SF2; baixado à parte |
| Surge XT / Dexed / Odin 2 / Helm | GPLv3 | VST3 externos |
| MDA | GPL | VST externos |
| setBfree | GPL-2.0 | LV2 externo |

O juicysfplugin e os demais plugins GPLv3 rodam como processos/plugins
separados carregados em tempo de execução; o Preseter não os linka. Mesmo assim,
o crédito ao juicysfplugin deve aparecer na documentação e no instalador.

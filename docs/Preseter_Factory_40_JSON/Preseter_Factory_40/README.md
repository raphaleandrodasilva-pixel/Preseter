# Preseter — Factory 40 JSON

Contém 40 arquivos JSON individuais, um `manifest.json` e esta documentação.

## Estrutura de cada patch
- `patch_id`, `name`, `category`, `description`
- `midi`: canal, CC1, CC7, CC11, CC64, pitch bend e velocity
- `layers`: fonte sonora, plugin, preset, faixa de notas, faixa de velocity, volume, pan e articulação
- `splits`: zonas de teclado derivadas das camadas
- `performance`: Program Change e comportamento de troca de patch
- `validation`: pendências de compatibilidade e licenciamento

## Importante
Os IDs de plugins, presets e bibliotecas são identificadores conceituais/aliases de integração. O host do Preseter deve resolver esses nomes para plugins e recursos instalados. Eles não são IDs VST3 universais nem garantem que um preset exista com esse nome no plugin.

Os patches com bibliotecas pendentes estão marcados nos campos `sample_library` e `validation`. Não redistribua samples ou binários de terceiros sem verificar a licença.

## Convenções
- Notas MIDI: 0–127.
- Velocity: 1–127.
- Volume e pan das camadas: valores normalizados de 0.0 a 1.0 e -1.0 a 1.0.
- CC1 = modulação; CC7 = volume; CC11 = expressão; CC64 = sustain.
- As faixas de notas são pontos de partida e devem ser validadas com cada biblioteca.

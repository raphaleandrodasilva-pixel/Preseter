# Bibliotecas do Preseter

Cada biblioteca é uma pasta com um arquivo `biblioteca.json`. O arquivo só contém dados:
o botão **Arquivo → Gerar Biblioteca…** lê as instruções, confere o que falta e cria um
ou mais concerts `.pst`. Para criar outra biblioteca, não é preciso alterar o app.

```text
libraries/
  factory-40/biblioteca.json
  factory-40-efeitos/biblioteca.json
  workstation/biblioteca.json
  minha-biblioteca/biblioteca.json
```

As pastas daqui acompanham o instalador. Um arquivo em qualquer outro lugar pode ser aberto
com **Escolher arquivo…**.

## Exportar do app

Monte e ajuste os patches no Preseter, salve cada patch e use **Arquivo → Exportar como
Biblioteca…**. O arquivo guarda o concert completo (camadas, splits, efeitos, knobs salvos,
layout, atalhos e mappings) sem os caminhos do seu computador. Em outro PC, abra com
**Arquivo → Gerar Biblioteca… → Escolher arquivo…**: os plugins são procurados pelo nome.

Fluxo sugerido: rascunho em `biblioteca.json` → **Gerar** → acerto de ouvido → salvar →
**Exportar**.

## Exemplo

```json
{
  "format": "preseter.library",
  "version": 1,
  "id": "minha-biblioteca",
  "name": "Minha Biblioteca",
  "description": "Opcional.",
  "sampleLibraries": {
    "meu-piano": { "path": "MeuPiano/piano.sf2", "name": "Meu Piano" }
  },
  "concerts": [
    {
      "id": "show-1",
      "name": "Show 1",
      "tempo": 100,
      "sets": [
        {
          "name": "Teclados",
          "patches": [
            {
              "name": "Piano e Pad",
              "programNumber": 0,
              "layers": [
                {
                  "inst": "NATIVE", "db": -3, "min": 0, "max": 127, "label": "Piano",
                  "sample": { "library": "meu-piano", "program": 0, "loop": false }
                },
                {
                  "inst": "NATIVE", "db": -9, "min": 48, "max": 127, "label": "Pad",
                  "nativeInstrument": "synth2", "programIndex": 14
                }
              ],
              "master": [{ "effect": "calfNXT Compressor", "preset": "piano" }],
              "sends": [-14, -60, -60, -60],
              "auxPresets": { "1": "hall-aux" }
            }
          ]
        }
      ]
    }
  ]
}
```

## Campos

**Biblioteca**

| Campo | Regra |
|---|---|
| `format`, `version` | Sempre `preseter.library`; versão `1` para receitas (`2` nos arquivos exportados) |
| `id` | Letras minúsculas, números e hífen; único entre as bibliotecas |
| `name` | Nome mostrado no app e usado na pasta de saída |
| `sampleLibraries` | Opcional. SF2/SFZ extras, com caminho **relativo** à pasta de sons |
| `concerts` | De 1 a 32. Cada um vira um arquivo `.pst` |

**Patch**

| Campo | Regra |
|---|---|
| `name` | Único no concert |
| `programNumber` | Program Change de 0 a 127, único no concert (máximo de 128 patches) |
| `layers` | De 1 a 16 camadas |
| `inserts` | Até 4 efeitos em cada camada |
| `master` | Até 4 efeitos no Master do patch |
| `sends` | Aux 1 a 4 em dB; `-60` desliga |
| `auxPresets` | Preset do Aux. `1` = Reverb e `2` = Delay, com sufixo `-aux` (ex.: `hall-aux`) |

**Camada**

| Campo | Regra |
|---|---|
| `inst` | `NATIVE` para sampler e nativos; ou `SURGE`, `DEXED`, `ODIN`, `HELM`, `FSVR`, `MDA`, `MDA_EP`, `MDA_JX` |
| `db`, `label` | Volume (-60 a 12) e nome da camada |
| `min`, `max` | Faixa de notas (split), de 0 a 127 |
| `velocityMin`, `velocityMax` | Troca por velocity, de 1 a 127 |
| `pan` | De -1 a 1 |
| `nativeInstrument` | `organ`, `tines`, `reeds`, `piano`, `dx`, `jx`, `synth2` ou `drums` |
| `programIndex` | Programa do instrumento nativo |
| `sample` | `library` (`musescore`, `sonatina`, `salamander` ou uma declarada), `bank`, `program`, `loop`, envelope, filtro |
| `arp`, `drums` | Arpejador e sequenciador do layer |

## Boas práticas

- Em patches com várias camadas, use `master`, não `inserts`: o insert é copiado para cada
  camada e multiplica a CPU.
- Amp e Overdrive do Guitarix são mono: não use em fontes estéreo, como o órgão com Leslie.
- Se o instrumento já tem chorus ou delay interno, não some outro igual.
- Não copie nomes, parâmetros ou samples de produtos comerciais.
- Efeitos e presets precisam existir em `src/shared/effects`. O app recusa o arquivo e mostra
  o erro quando algo não existe.

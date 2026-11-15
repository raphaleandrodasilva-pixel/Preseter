# Catálogo de instrumentos virtuais — Preseter

**Objetivo:** reunir instrumentos virtuais gratuitos e bibliotecas de samples, com links para os sites dos respectivos desenvolvedores.

**Fonte de referência:** análise baseada na seleção de instrumentos do Bedroom Producers Blog e no documento de análise de instrumentos virtuais gratuitos.

> **Observação:** os links abaixo apontam para páginas oficiais de desenvolvedores ou produtos. Nem todos são links diretos de instalação. Antes de integrar um instrumento ao Preseter, é necessário confirmar a disponibilidade da versão gratuita, os formatos de plugin, os sistemas operacionais suportados, a licença e as dependências.

## 1. Sintetizadores

| Produto | Desenvolvedor | Site oficial |
|---|---|---|
| Surge XT | Surge Synth Team | [Site oficial](https://surge-synthesizer.github.io/) |
| Vital | Vital Audio | [Site oficial](https://vital.audio/) |
| Dexed | Pascal Gauthier | [Site oficial](https://asb2m10.github.io/dexed/) |
| Tyrell N6 | u-he | [Site oficial](https://u-he.com/products/tyrelln6/) |
| OB-Xf | Surge Synth Team | [Projeto](https://github.com/surge-synthesizer/OB-Xf) |

## 2. Samplers e bibliotecas de instrumentos

| Produto | Desenvolvedor | Site oficial |
|---|---|---|
| Decent Sampler | Decent Samples | [Site oficial](https://www.decentsamples.com/) |
| Kontakt Factory Selection 2 | Native Instruments | [Site oficial](https://www.native-instruments.com/) |
| Spitfire Symphony Orchestra Discover | Spitfire Audio | [Site oficial](https://www.spitfireaudio.com/) |
| BBC Symphony Orchestra Discover | Spitfire Audio | [Página do produto](https://www.spitfireaudio.com/products/bbc-symphony-orchestra-discover) |
| The Free Orchestra 2 | ProjectSAM | [Página do produto](https://projectsam.com/libraries/the-free-orchestra-2/) |
| LUX Orchestral Strings Elements | Sonuscore | [Site oficial](https://www.sonuscore.com/shop/) |

## 3. Pianos acústicos e elétricos

| Produto | Desenvolvedor | Site oficial |
|---|---|---|
| Creative Toolbox Piano | Strezov Sampling | [Site do desenvolvedor](https://www.strezov-sampling.com/) |
| 1928 Vintage Grand Steinway | Soundpaint | [Página do produto](https://soundpaint.com/products/1928-vintage-grand-steinway) |
| Sweetcase Vintage Electric Piano | NoiseAsh | [Página do produto](https://noiseash.com/sweetcase-vintage-electric-piano/) |
| LABS Soft Piano | Spitfire Audio | [Plataforma LABS](https://labs.spitfireaudio.com/) |
| Monastery Grand | MeldaProduction | [Página do produto](https://www.meldaproduction.com/MonasteryGrand) |
| Piano One | Sound Magic | [Site do desenvolvedor](https://www.supremepiano.com/) |

## 4. Baterias virtuais

| Produto | Desenvolvedor | Site oficial |
|---|---|---|
| SSD Free | Steven Slate Drums | [Site oficial](https://stevenslatedrums.com/) |
| MT Power Drum Kit 2 | Manda Audio | [Download oficial](https://www.powerdrumkit.com/download76187.php) |
| BFD Player | BFD Drums | [Página do produto](https://www.bfddrums.com/bfd-player/) |
| Triaz Player | Wave Alchemy | [Página do produto](https://www.wavealchemy.co.uk/product/triaz-player/) |
| Sitala | Decomposer | [Site oficial](https://decomposer.de/sitala/) |

## 5. Guitarras e violões virtuais

| Produto | Desenvolvedor | Site oficial |
|---|---|---|
| Ample Guitar M Lite 4 | Ample Sound | [Site oficial](https://www.amplesound.net/) |
| Shreddage 3 Stratus FREE | Impact Soundworks | [Página do produto](https://impactsoundworks.com/product/shreddage-3-stratus-free-kp/) |
| FOUNDATIONS Nylon Guitar | Heavyocity | [Página do produto](https://heavyocity.com/products/foundations-nylon-guitar) |

## 6. Observações técnicas para o Preseter

Os produtos desta lista não são todos do mesmo tipo. Para catalogá-los corretamente, o Preseter deve distinguir:

- **Sintetizador:** gera o som por meio de uma engine de síntese.
- **Sampler:** reproduz gravações de áudio e pode carregar bibliotecas de instrumentos.
- **Biblioteca de samples:** conteúdo sonoro que depende de um sampler ou player compatível.
- **Instrumento de bateria:** pode possuir engine própria, kits e recursos específicos de programação rítmica.

### Dependências e compatibilidade

- **Kontakt Factory Selection 2:** depende do ecossistema Kontakt Player e da instalação pela Native Access.
- **Decent Sampler:** é uma engine de sampler; as bibliotecas são conteúdos separados e podem ter requisitos próprios.
- **Bibliotecas Spitfire Audio:** verificar se cada produto utiliza o player próprio da empresa ou o Kontakt.
- **Soundpaint:** utiliza sua própria engine de reprodução.
- **SSD Free, BFD Player e Triaz Player:** possuem engines e requisitos próprios.

A compatibilidade deve ser verificada individualmente. Não se deve presumir que todos os instrumentos funcionem em Windows, Linux e macOS, nem que todos ofereçam VST, VST3 ou CLAP.

## 7. Campos recomendados para o catálogo interno

Para cada instrumento, o Preseter poderá armazenar:

| Campo | Descrição |
|---|---|
| `name` | Nome do instrumento ou biblioteca |
| `developer` | Desenvolvedor ou empresa responsável |
| `official_url` | Página oficial do produto ou desenvolvedor |
| `download_url` | Link de download, quando disponível |
| `category` | Sintetizador, sampler, piano, bateria, guitarra ou biblioteca |
| `formats` | Formatos de plugin disponíveis (VST, VST3, CLAP etc.) |
| `operating_systems` | Sistemas operacionais suportados |
| `license` | Licença e condições de uso |
| `free_status` | Condição da versão gratuita |
| `engine` | Engine necessária para executar o instrumento |
| `dependencies` | Bibliotecas, players ou outros requisitos |
| `notes` | Observações adicionais e limitações |

> **Importante:** os campos técnicos devem ser preenchidos somente após consulta à documentação oficial de cada produto. Esta lista é um ponto de partida para o catálogo, não uma certificação de compatibilidade.

## 8. Fonte principal

- [Bedroom Producers Blog — Free VST Plugins](https://bedroomproducersblog.com/free-vst-plugins/)


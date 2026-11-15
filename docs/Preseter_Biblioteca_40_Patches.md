o que # PRESETER --- Biblioteca de fábrica com 40 patches

**Documento de produção --- versão 1.0**\
**Objetivo:** especificar uma biblioteca inicial de 40 patches inspirada
na organização e na experiência de performance do Apple MainStage,
utilizando instrumentos e bibliotecas gratuitos.

> **Importante:** esta é uma coleção original inspirada em categorias e
> funções comuns de workstations. Não é uma cópia dos presets, nomes,
> samples ou conteúdo proprietário da Apple. As fotografias abaixo são
> referências ilustrativas dos instrumentos, não capturas dos plugins.

## 1. Diretrizes do projeto

A biblioteca deve funcionar como uma coleção de patches de palco, e não
apenas como uma pasta com 40 presets isolados. Cada patch pode conter um
ou mais instrumentos, layers, splits e mapeamentos MIDI.

Cada patch deve armazenar, no mínimo:

-   Nome e categoria.
-   Instrumento ou fonte sonora.
-   Biblioteca de samples e respectiva licença.
-   Programa/preset de origem.
-   Faixa de notas e faixa de velocity.
-   Transposição, volume, pan e afinação.
-   Canal MIDI e mapeamento de controladores.
-   Articulações e comportamento de sustain.
-   Layers e splits, quando houver.
-   Dependências externas e instruções de instalação.

### Arquitetura recomendada

1.  **Biblioteca de recursos:** samples, instrumentos e presets
    compartilhados.
2.  **Motor de instrumentos:** reprodução de samples (por exemplo, SFZ)
    e/ou síntese.
3.  **Motor de patches:** combina instrumentos, layers, splits e
    parâmetros.
4.  **Performance MIDI:** sustain, modulação, expressão, pitch bend e
    troca de patches.
5.  **Mixer:** níveis individuais e saídas de áudio.

**Decisão técnica importante:** se o Preseter for um host standalone,
poderá carregar instrumentos VST3 de terceiros, desde que implemente
hospedagem de plugins. Se for um instrumento VST3 carregado dentro de
uma DAW, carregar outros VST3 dentro dele exige uma arquitetura de
plugin-hosting aninhado e aumenta bastante a complexidade. Para uma
biblioteca autônoma e redistribuível, é preferível usar um sampler
próprio e samples com licença que permita redistribuição.

## 2. Instrumentos e bibliotecas-base

Os recursos abaixo são fontes sugeridas para produzir os timbres. A
disponibilidade de versões gratuitas, formatos, sistemas operacionais e
permissões deve ser confirmada antes de cada release.

  ------------------------------------------------------------------------------------------------------------------------
  Recurso                 Uso principal           Link
  ----------------------- ----------------------- ------------------------------------------------------------------------
  BBC Symphony Orchestra  Piano e instrumentos    https://www.spitfireaudio.com/products/bbc-symphony-orchestra-discover
  Discover                orquestrais             

  Meta Open Sound         Piano e instrumentos    https://github.com/facebookincubator/Meta-open-sound
                          sampleados; conferir    
                          licença por pacote      

  Decent Sampler          Reprodução de           https://www.decentsamples.com/product/decent-sampler-plugin/
                          bibliotecas compatíveis 

  sfizz                   Reprodução de           https://sfz.tools/sfizz/
                          bibliotecas SFZ         

  Surge XT                Pads, leads, baixos,    https://surge-synthesizer.github.io/
                          arpejos e síntese       

  Vital                   Wavetable, leads e      https://vital.audio/
                          baixos                  

  Dexed                   Síntese FM e timbres    https://asb2m10.github.io/dexed/
                          digitais                

  Tyrell N6               Síntese analógica       https://u-he.com/products/tyrelln6/
                          virtual                 

  CollaB3                 Órgão tonewheel/Hammond https://github.com/ABiCi/CollaB3

  Ample Sound Lite        Violão e baixo          https://www.amplesound.net/en/download.asp
                          sampleados              

  Steven Slate Drums Free Bateria acústica        https://stevenslatedrums.com/ssd5/free

  Sitala                  Sampler de bateria      https://decomposer.de/sitala/
                          eletrônica              

  VSCO 2 Community        Alternativa de samples  https://github.com/sgossner/VSCO-2-CE
  Edition                 orquestrais             
  ------------------------------------------------------------------------------------------------------------------------

**Licenciamento:** não presumir que um plugin gratuito autoriza copiar,
empacotar ou redistribuir seus samples. Quando a licença não permitir
redistribuição, o Preseter deve solicitar que o usuário instale o
instrumento e a biblioteca diretamente do fabricante. Manter um arquivo
`THIRD_PARTY_LICENSES.md` com a origem e a licença de cada recurso.

------------------------------------------------------------------------

# 3. Os 40 patches

## Categoria 1 --- Piano e teclados

![Piano de cauda de
concerto](https://stilwellpianos.com/cdn/shop/files/DSC9752.jpg?v=1764201452)

*Foto ilustrativa: piano de cauda. Fonte da imagem: Stilwell Pianos ---
https://stilwellpianos.com/products/steinway-sons-d-full-concert-grand-pian*

### 01 --- Concert Grand

-   **Fonte sugerida:** BBC Symphony Orchestra Discover --- piano, se
    presente na versão instalada; alternativa: piano acústico em SFZ.
-   **Samples:** piano de cauda com múltiplas camadas de velocity e,
    idealmente, samples de pedal/sustain.
-   **Configuração:** resposta dinâmica ampla; curva de velocity
    progressiva; release natural; sustain completo; preservar
    transientes.
-   **Objetivo sonoro:** piano principal, aberto e encorpado.
-   **Validação:** testar notas graves, região média, agudos, repetição
    rápida e pedal.

### 02 --- Soft Grand

-   **Fonte sugerida:** mesma biblioteca do Concert Grand.
-   **Samples:** reutilizar a biblioteca do patch 01.
-   **Configuração:** curva de velocity mais suave; menor brilho nas
    altas; ataque ligeiramente arredondado; dinâmica controlada.
-   **Objetivo sonoro:** piano macio para baladas e acompanhamento.

### 03 --- Pop Piano

-   **Fonte sugerida:** mesma biblioteca do Concert Grand.
-   **Samples:** reutilizar a biblioteca do patch 01.
-   **Configuração:** curva de velocity firme; presença nos médios;
    ataque definido; volume consistente em contexto de banda.
-   **Objetivo sonoro:** piano para pop, rock e acompanhamento.

### 04 --- Upright Piano

-   **Fonte sugerida:** Meta Open Sound ou outra biblioteca SFZ de piano
    vertical com licença adequada.
-   **Samples:** piano vertical; verificar número de notas, camadas de
    velocity e licença do pacote.
-   **Configuração:** preservar ruídos e caráter do instrumento sem
    exagero; release moderado; resposta dinâmica natural.
-   **Objetivo sonoro:** piano vertical intimista.
-   **Observação:** não apresentar um piano vertical como se fosse um
    grand piano.

### 05 --- Rhodes Classic

-   **Fonte sugerida:** biblioteca gratuita de Rhodes para Decent
    Sampler/SFZ, se a licença e o download estiverem disponíveis;
    alternativa: instrumento gratuito de piano elétrico.
-   **Samples:** Rhodes com camadas de velocity e amostras de
    decaimento.
-   **Configuração:** ataque suave, corpo médio, dinâmica expressiva e
    decaimento natural.
-   **Objetivo sonoro:** piano elétrico quente e aveludado.
-   **Pendência:** escolher e validar uma biblioteca gratuita específica
    antes de fechar o patch.

### 06 --- Wurlitzer EP

-   **Fonte sugerida:** biblioteca gratuita de Wurlitzer para Decent
    Sampler/SFZ, se disponível e licenciada; alternativa:
    síntese/modelagem ou piano elétrico gratuito.
-   **Samples:** Wurlitzer com variação dinâmica.
-   **Configuração:** ataque mais incisivo que o Rhodes; médios
    presentes; decaimento perceptível; velocity expressiva.
-   **Objetivo sonoro:** piano elétrico com caráter mais agressivo.
-   **Pendência:** escolher e validar uma biblioteca gratuita
    específica.

### 07 --- FM Electric Piano

-   **Fonte:** Dexed.
-   **Samples:** nenhum; síntese FM.
-   **Configuração:** partir de um preset de electric piano compatível
    com DX7; ajustar envelopes dos operadores para ataque percussivo e
    decaimento suave; mapear velocity para intensidade/modulação.
-   **Objetivo sonoro:** piano digital clássico dos anos 80.
-   **Distribuição:** salvar o preset utilizado e registrar sua
    origem/licença.

### 08 --- Clavinet Funk

-   **Fonte:** Surge XT para uma aproximação sintetizada; preferir
    biblioteca sampleada de Clavinet se for necessário maior realismo.
-   **Samples:** nenhum na versão sintetizada.
-   **Configuração:** ataque muito rápido; sustain curto; filtro
    ressonante; envelope de filtro percussivo; monofonia desligada para
    permitir acordes.
-   **Objetivo sonoro:** timbre percussivo para funk e soul.

## Categoria 2 --- Órgãos

![Órgão Hammond
B-3](https://rvb-img.reverb.com/image/upload/s--TV6CIG0Z--/a_exif%2Cc_limit%2Ce_unsharp_mask%3A80%2Cf_auto%2Cfl_progressive%2Cg_south%2Ch_620%2Cq_90%2Cw_620/v1441760197/nqtlig9ex0qcgyvickzi.jpg)

*Foto ilustrativa: Hammond B-3. Fonte: Reverb ---
https://reverb.com/item/1062898-1960-hammond-b-3-vintage-organ-w-tone-cabinet-cables-covers*

### 09 --- Hammond Jazz

-   **Fonte:** CollaB3.
-   **Samples:** não necessários; modelagem de órgão tonewheel.
-   **Configuração inicial:** drawbars 888000000; percussão desligada ou
    suave; chorus/vibrato discreto; resposta sem release artificial
    longo.
-   **Objetivo sonoro:** órgão Hammond para jazz.

### 10 --- Hammond Gospel

-   **Fonte:** CollaB3.
-   **Samples:** não necessários.
-   **Configuração inicial:** drawbars 888888888; percussão conforme o
    estilo; vibrato/chorus moderado; preservar resposta imediata.
-   **Objetivo sonoro:** órgão encorpado para gospel.

### 11 --- Hammond Rock

-   **Fonte:** CollaB3.
-   **Samples:** não necessários.
-   **Configuração inicial:** drawbars 888800000 como ponto de partida;
    ataque firme; ajuste de saturação apenas se houver recurso gratuito
    e licenciado; controlar graves.
-   **Objetivo sonoro:** órgão de rock.

### 12 --- Vintage Transistor Organ

-   **Fonte:** Surge XT.
-   **Samples:** nenhum; síntese.
-   **Configuração:** combinar ondas quadradas e senoidais; ataque e
    release curtos; filtro relativamente aberto; pouca variação de
    velocity.
-   **Objetivo sonoro:** órgão eletrônico vintage inspirado em órgãos
    combo.

## Categoria 3 --- Cordas

![Seção de cordas de
orquestra](https://www.collegium-musicum-berlin.de/ensembles/sinfonieorchester/_inhaltselemente/05-bildergalerie-so/_so2023-streicher-bph-_c_gw.jpg?width=2000)

*Foto ilustrativa: seção de cordas. Fonte: Collegium Musicum Berlin ---
https://www.collegium-musicum-berlin.de/ensembles/sinfonieorchester/index.html*

**Fonte principal sugerida:** BBC Symphony Orchestra Discover. Confirmar
as articulações e instrumentos disponíveis na edição instalada. Como
alternativa para distribuição própria, avaliar VSCO 2 Community Edition
e outras bibliotecas com licença compatível.

### 13 --- Solo Violin

-   **Fonte:** BBCSO --- violino, se disponível na edição instalada;
    alternativa: biblioteca SFZ de violino solo.
-   **Samples:** sustains e articulações curtas; legato somente se a
    biblioteca oferecer essa articulação.
-   **Configuração:** expressão por CC11 ou CC1 conforme a biblioteca;
    velocity para articulação/ataque; evitar prometer legato real quando
    não existir.
-   **Objetivo sonoro:** violino solo expressivo.

### 14 --- String Ensemble

-   **Fonte:** BBCSO --- seções de violinos, violas, cellos e
    contrabaixos; alternativa: seções equivalentes em SFZ.
-   **Samples:** seções de cordas.
-   **Configuração:** combinar seções em layers; ajustar oitavas e
    níveis; distribuir panorama de forma moderada; sustains como
    articulação padrão.
-   **Objetivo sonoro:** conjunto de cordas sinfônico.

### 15 --- Cinematic Strings

-   **Fonte:** BBCSO ou biblioteca de cordas com licença compatível.
-   **Samples:** sustains longos e articulações curtas.
-   **Configuração:** ataque gradual; release prolongado; expressão
    crescente; layer de violinos e cellos com equilíbrio de volume.
-   **Objetivo sonoro:** cordas amplas para trilhas e acompanhamento
    cinematográfico.

### 16 --- Pizzicato Strings

-   **Fonte:** BBCSO ou biblioteca SFZ com articulação pizzicato.
-   **Samples:** pizzicato real; não simular pizzicato apenas encurtando
    um sustain.
-   **Configuração:** ataque curto; release reduzido; velocity
    controlando intensidade.
-   **Objetivo sonoro:** cordas dedilhadas.

### 17 --- Warm String Pad

-   **Fonte:** Surge XT.
-   **Samples:** nenhum; síntese.
-   **Configuração:** dois osciladores saw; detune discreto; ataque de
    1--3 s; release prolongado; modulação lenta.
-   **Objetivo sonoro:** strings eletrônicas vintage.

## Categoria 4 --- Metais

![Seção de metais de
orquestra](https://www.concertgebouworkest.nl/media/images/serie_b-wo_concertgebouworkest_.height-1800.format-webp.webp)

*Foto ilustrativa: seção de metais. Fonte: Koninklijk
Concertgebouworkest ---
https://www.concertgebouworkest.nl/en/audio-video/audio/*

**Fonte principal:** BBC Symphony Orchestra Discover, verificando os
instrumentos e as articulações efetivamente incluídos.

### 18 --- Solo Trumpet

-   **Fonte:** BBCSO --- trompete; alternativa: biblioteca SFZ de
    trompete.
-   **Samples:** sustains e staccatos, se disponíveis.
-   **Configuração:** ataque definido; velocity controlando intensidade;
    expressão contínua quando suportada.
-   **Objetivo sonoro:** trompete orquestral.

### 19 --- Trombone

-   **Fonte:** BBCSO --- trombone tenor; alternativa: biblioteca SFZ.
-   **Samples:** sustains e articulações curtas.
-   **Configuração:** ataque médio; sustain expressivo; faixa de notas
    adequada ao instrumento.
-   **Objetivo sonoro:** trombone orquestral.

### 20 --- French Horn

-   **Fonte:** BBCSO --- trompas; alternativa: biblioteca SFZ.
-   **Samples:** articulações longas e curtas.
-   **Configuração:** ataque suave; expressão gradual; evitar excesso de
    brilho.
-   **Objetivo sonoro:** trompa francesa.

### 21 --- Brass Section

-   **Fonte:** BBCSO --- combinar trompetes, trombones e trompas.
-   **Samples:** seções correspondentes.
-   **Configuração:** layers simultâneos; distribuir registros;
    equilibrar volumes; usar ataques sincronizados.
-   **Objetivo sonoro:** seção de metais para pop e trilhas.

## Categoria 5 --- Madeiras

![Seção de madeiras de
orquestra](https://s1.15min.lt/static/cache/MTIwMHg2MzAsODkyeDQ3MywxMDk2NDI4LG9yaWdpbmFsLCxpZD03MjEyMTc0JmRhdGU9MjAxOSUyRjAzJTJGMDQsMTQ4NzI0MzU0MQ%3D%3D/rimantas-giedraitisolesios-kasabovos-nuotr-67c8f18a18af9.jpeg)

*Foto ilustrativa: músicos de madeiras em orquestra. Fonte: Žmonės.lt
---
https://zmones.15min.lt/naujiena/rimantas-giedraitis-kai-muzika-profesija-o-ne-manija-7y5yW1gYQ8O*

### 22 --- Concert Flute

-   **Fonte:** BBCSO --- flauta; alternativa: biblioteca SFZ de flauta.
-   **Samples:** articulações longas e curtas.
-   **Configuração:** ataque suave; sustain natural; CC11 para
    expressão, se suportado.
-   **Objetivo sonoro:** flauta transversal.

### 23 --- Clarinet

-   **Fonte:** BBCSO --- clarinete; alternativa: biblioteca SFZ de
    clarinete.
-   **Samples:** sustains e staccatos.
-   **Configuração:** resposta dinâmica progressiva; ataque natural;
    faixa de notas compatível com o instrumento.
-   **Objetivo sonoro:** clarinete orquestral.

### 24 --- Oboe

-   **Fonte:** BBCSO --- oboé; alternativa: biblioteca SFZ de oboé.
-   **Samples:** articulações longas e curtas.
-   **Configuração:** ataque moderado; sustentação natural; controle de
    dinâmica.
-   **Objetivo sonoro:** oboé orquestral.

## Categoria 6 --- Guitarras e baixos

![Guitarras e
baixo](https://miro.medium.com/v2/resize%3Afit%3A1400/0%2AdITKdiwV0W4kCZZy.jpg)

*Foto ilustrativa: baixo, violão clássico e violão flamenco. Fonte:
Medium ---
https://medium.com/@tedslistofficial/ultimate-guide-to-the-best-beginner-guitars-bea9665903fe*

### 25 --- Acoustic Guitar Nylon

-   **Fonte:** Meta Open Sound --- nylon guitar, se o pacote e a licença
    forem confirmados; alternativa: Ample Guitar M Lite, respeitando a
    licença.
-   **Samples:** nylon com variações de velocity e articulações
    disponíveis.
-   **Configuração:** mapear notas e articulações; velocity para
    intensidade; release natural; evitar sobreposição de notas
    artificiais.
-   **Objetivo sonoro:** violão clássico de nylon.

### 26 --- Acoustic Guitar Steel

-   **Fonte:** Ample Guitar M Lite.
-   **Samples:** biblioteca integrada do instrumento.
-   **Configuração:** selecionar articulações disponíveis; ajustar
    velocity; preservar duração e decaimento naturais.
-   **Objetivo sonoro:** violão de aço para pop e folk.
-   **Licença:** não redistribuir samples do fabricante sem autorização.

### 27 --- Electric Guitar Clean

-   **Fonte:** biblioteca gratuita de guitarra elétrica para SFZ/Decent
    Sampler, se disponível; alternativa: instrumento gratuito de
    terceiros ou síntese no Surge XT.
-   **Samples:** guitarra limpa, com notas e articulações adequadas.
-   **Configuração:** ataque natural; velocity dinâmica; sustains e
    releases realistas.
-   **Objetivo sonoro:** guitarra elétrica limpa.
-   **Pendência:** selecionar uma biblioteca gratuita específica e
    conferir sua licença.

### 28 --- Precision Bass

-   **Fonte:** Ample Bass P Lite.
-   **Samples:** biblioteca integrada do baixo Precision.
-   **Configuração:** notas graves definidas; velocity dinâmica;
    alternância de articulações quando suportada; monofonia/legato
    conforme o instrumento.
-   **Objetivo sonoro:** baixo elétrico realista.
-   **Licença:** não redistribuir samples do fabricante sem autorização.

### 29 --- Synth Bass

-   **Fonte:** Vital.
-   **Samples:** nenhum; síntese.
-   **Configuração:** sub-oscillator; saw ou square complementar; filtro
    low-pass; envelope rápido; mono e legato opcionais.
-   **Objetivo sonoro:** baixo eletrônico moderno.

## Categoria 7 --- Baterias e percussão

![Bateria acústica e
eletrônica](https://www.treehousedrums.com/uploads/7/8/7/9/78792392/jason-the-music-man_orig.jpeg)

*Foto ilustrativa: conjunto acústico e eletrônico. Fonte: TreeHouse
Custom Drums ---
https://www.treehousedrums.com/the-latest/the-music-man*

### 30 --- Acoustic Rock Kit

-   **Fonte:** Steven Slate Drums Free.
-   **Samples:** kit incluído na edição gratuita, conforme a versão
    disponível.
-   **Configuração:** mapeamento MIDI GM; velocity por intensidade;
    verificar chokes e articulações dos pratos.
-   **Objetivo sonoro:** bateria acústica para rock e pop.
-   **Licença:** manter a instalação e os samples sob os termos do
    fabricante.

### 31 --- Electronic Drum Kit

-   **Fonte:** Sitala.
-   **Samples:** kit eletrônico próprio ou samples com licença livre e
    documentada.
-   **Configuração:** kick, snare, clap, hi-hat, toms e percussões;
    velocity sensível; mapeamento MIDI consistente.
-   **Objetivo sonoro:** bateria eletrônica para dance, pop e música
    moderna.

### 32 --- Orchestral Percussion

-   **Fonte:** BBCSO --- percussão; alternativa: VSCO 2 Community
    Edition.
-   **Samples:** tímpanos, pratos e instrumentos percussivos disponíveis
    na biblioteca.
-   **Configuração:** mapear cada instrumento em nota MIDI própria;
    ajustar velocity; preservar decaimentos.
-   **Objetivo sonoro:** percussão sinfônica.

## Categoria 8 --- Sintetizadores

![Sintetizador
analógico](https://static.sonovente.com/img/library/zoom/93/optim/93984_2.jpg)

*Foto ilustrativa: sintetizador analógico. Fonte: SonoVente ---
https://www.sonovente.com/pwm-malevolent-p93984.html*

### 33 --- Analog Poly Synth

-   **Fonte:** Surge XT.
-   **Samples:** nenhum; síntese.
-   **Configuração:** dois osciladores saw; detune leve; filtro
    low-pass; envelopes ADSR; polifonia adequada para acordes.
-   **Objetivo sonoro:** sintetizador analógico polifônico.

### 34 --- Vintage Analog Lead

-   **Fonte:** Tyrell N6.
-   **Samples:** nenhum; síntese.
-   **Configuração:** osciladores analógicos; filtro ressonante;
    portamento discreto; monofonia/legato.
-   **Objetivo sonoro:** lead vintage.

### 35 --- Modern Synth Lead

-   **Fonte:** Vital.
-   **Samples:** nenhum; síntese wavetable.
-   **Configuração:** wavetable; unison moderado; envelope rápido;
    modulação de filtro; velocity controlando brilho ou intensidade.
-   **Objetivo sonoro:** lead moderno para música eletrônica.

### 36 --- Warm Analog Pad

-   **Fonte:** Surge XT.
-   **Samples:** nenhum; síntese.
-   **Configuração:** osciladores saw; ataque de 1--3 s; release
    prolongado; modulação lenta; polifonia ampla.
-   **Objetivo sonoro:** pad quente para acompanhamento.

### 37 --- Digital Bell

-   **Fonte:** Dexed.
-   **Samples:** nenhum; síntese FM.
-   **Configuração:** índices de modulação mais altos; ataque rápido;
    decaimento longo; velocity alterando a intensidade.
-   **Objetivo sonoro:** sinos digitais e timbres cristalinos.

### 38 --- Arpeggiator

-   **Fonte:** Surge XT.
-   **Samples:** nenhum; síntese.
-   **Configuração:** arpejador ascendente; divisão 1/8 ou 1/16;
    sincronismo com BPM; controle de oitavas e gate.
-   **Objetivo sonoro:** sequências automáticas para performance.
-   **Requisito:** sincronizar com o relógio MIDI/host quando aplicável.

### 39 --- Deep Synth Bass

-   **Fonte:** Vital.
-   **Samples:** nenhum; síntese.
-   **Configuração:** sub-oscillator senoidal; saw complementar; filtro
    fechado; mono; envelope curto e controle de glide.
-   **Objetivo sonoro:** baixo profundo e encorpado.

### 40 --- Ambient Texture

-   **Fonte:** Surge XT.
-   **Samples:** nenhum; síntese.
-   **Configuração:** osciladores com modulação lenta; camadas;
    envelopes longos; movimento gradual de timbre.
-   **Objetivo sonoro:** texturas atmosféricas e sons ambientais.

------------------------------------------------------------------------

# 4. Regras de programação para todos os patches

## Parâmetros comuns

  Parâmetro                          Descrição
  ---------------------------------- ----------------------------------------
  `patch_id`                         Identificador único e estável
  `name`                             Nome exibido
  `category`                         Categoria da biblioteca
  `instrument_source`                Plugin, sampler ou engine
  `library_id`                       Identificador da biblioteca de samples
  `midi_channel`                     Canal MIDI
  `key_low` / `key_high`             Limites da zona de teclado
  `velocity_low` / `velocity_high`   Limites de velocity
  `transpose`                        Transposição em semitons
  `volume`                           Volume da camada
  `pan`                              Panorama
  `cc1`                              Modulation wheel
  `cc11`                             Expression
  `sustain_cc64`                     Pedal de sustain
  `pitch_bend`                       Faixa de pitch bend
  `layers`                           Instrumentos combinados
  `splits`                           Divisões do teclado
  `articulation`                     Articulação selecionada

## Comportamento MIDI recomendado

-   **CC1:** modulação; em instrumentos orquestrais, pode controlar
    dinâmica se a biblioteca permitir.
-   **CC7:** volume de canal.
-   **CC11:** expressão.
-   **CC64:** sustain.
-   **Pitch Bend:** faixa configurável por patch.
-   **Velocity:** controlar intensidade, camada de sample ou
    articulação, conforme o instrumento.
-   **Program Change:** permitir seleção de patch por equipamento
    externo, se implementado.

## Exemplo de patch com layers

**Patch 14 --- String Ensemble**

  Layer   Instrumento    Região sugerida
  ------- -------------- -----------------
  1       Violinos       G3--C#7
  2       Violas         C3--F#6
  3       Cellos         C2--A#5
  4       Contrabaixos   C1--F#3

As faixas acima são referências de tessitura da biblioteca orquestral; o
mapeamento final deve respeitar os limites reais de cada instrumento e a
transposição MIDI utilizada.

## Exemplo de configuração JSON

``` json
{
  "patch_id": "PRE-014",
  "name": "String Ensemble",
  "category": "Strings",
  "midi_channel": 1,
  "layers": [
    {
      "instrument": "BBCSO_VIOLINS",
      "key_low": 55,
      "key_high": 108,
      "velocity_low": 1,
      "velocity_high": 127,
      "volume": 0.75,
      "pan": -0.15
    },
    {
      "instrument": "BBCSO_VIOLAS",
      "key_low": 48,
      "key_high": 102,
      "velocity_low": 1,
      "velocity_high": 127,
      "volume": 0.65,
      "pan": 0.0
    },
    {
      "instrument": "BBCSO_CELLOS",
      "key_low": 36,
      "key_high": 82,
      "velocity_low": 1,
      "velocity_high": 127,
      "volume": 0.7,
      "pan": 0.12
    }
  ],
  "controllers": {
    "modulation": 1,
    "volume": 7,
    "expression": 11,
    "sustain": 64
  }
}
```

Este JSON é um exemplo conceitual: os identificadores dos instrumentos
deverão corresponder aos recursos realmente instalados e validados no
Preseter.

------------------------------------------------------------------------

# 5. Plano de validação

Antes de considerar a biblioteca pronta:

1.  Confirmar que cada plugin abre na versão e arquitetura suportadas.
2.  Confirmar que cada biblioteca de samples pode ser usada conforme sua
    licença.
3.  Testar todas as notas e regiões de teclado.
4.  Testar velocity mínima, média e máxima.
5.  Testar sustain, expressão, modulação e pitch bend.
6.  Testar troca de patches sem travamentos ou notas presas.
7.  Testar layers com várias notas simultâneas.
8.  Medir consumo de RAM, CPU e tempo de carregamento.
9.  Salvar e restaurar o estado completo de cada patch.
10. Testar a coleção em uma instalação limpa.

## 6. Pendências para fechar a versão 1.0

-   [ ] Escolher bibliotecas gratuitas específicas para Rhodes e
    Wurlitzer.
-   [ ] Definir a fonte sampleada de guitarra elétrica clean.
-   [ ] Validar a disponibilidade do piano na edição BBCSO Discover
    instalada.
-   [ ] Confirmar a licença e os formatos de cada biblioteca.
-   [ ] Definir se o Preseter será host standalone, plugin VST3 ou
    ambos.
-   [ ] Definir o formato definitivo de patches (JSON, banco SQLite ou
    formato próprio).
-   [ ] Implementar carregamento e descarregamento de layers.
-   [ ] Criar presets de demonstração para os 40 patches.

## 7. Referências visuais e créditos das fotografias

As fotografias deste documento são ilustrativas e apontam para as
páginas de origem. Antes de redistribuir o documento publicamente,
verificar as condições de uso de cada imagem e, se necessário,
substituir por imagens próprias ou com licença aberta.

-   Piano: Stilwell Pianos ---
    https://stilwellpianos.com/products/steinway-sons-d-full-concert-grand-pian
-   Hammond: Reverb ---
    https://reverb.com/item/1062898-1960-hammond-b-3-vintage-organ-w-tone-cabinet-cables-covers
-   Cordas: Collegium Musicum Berlin ---
    https://www.collegium-musicum-berlin.de/ensembles/sinfonieorchester/index.html
-   Metais: Koninklijk Concertgebouworkest ---
    https://www.concertgebouworkest.nl/en/audio-video/audio/
-   Madeiras: Žmonės.lt ---
    https://zmones.15min.lt/naujiena/rimantas-giedraitis-kai-muzika-profesija-o-ne-manija-7y5yW1gYQ8O
-   Guitarras: Medium ---
    https://medium.com/@tedslistofficial/ultimate-guide-to-the-best-beginner-guitars-bea9665903fe
-   Bateria: TreeHouse Custom Drums ---
    https://www.treehousedrums.com/the-latest/the-music-man
-   Sintetizador: SonoVente ---
    https://www.sonovente.com/pwm-malevolent-p93984.html

------------------------------------------------------------------------

**Fim do documento --- PRESETER Factory Library / 40 Patches**

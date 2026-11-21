# Coleção Factory 40 — patches e instrumentos

A Coleção é gerada a partir de `src/shared/collection-presets.ts` por
`src/main/collection/generateCollection.ts` (e pelo app em Configurações → Coleção).
São **8 sets e 40 patches**; os acústicos usam o sampler nativo e os sintetizadores usam plugins
externos, quando disponíveis.

## Como regenerar

```powershell
npm run build:main
node scripts/gerar-colecao.js --out=Colecao.pst
```

O script usa o motor compilado para resolver efeitos e plugins; patches com plugin ausente são
pulados e listados no final.

## Sets

Pianos & Keys · Organs · Strings · Brass · Woodwinds · Guitars & Bass · Drums & Percussion ·
Synthesizers.

## Drums & Percussion

| Patch | Instrumento | Kit / padrão | Efeitos |
|---|---|---|---|
| **Acoustic Rock Kit** | sampler nativo (`preseter.sampler`) | MuseScore_General, banco 128 programa 0 | Master: Compressor `drum`; Aux 1 Reverb `room` / −18 dB |
| **Electronic Drum Kit** | **Preseter Drums** (`preseter.drums`) | MuseScore_General, banco 128 programa **24**; padrão de fábrica **Eletrônico** | Insert: Transients `attack`; Aux 1 Reverb `gated` / −18 dB |
| Orchestral Percussion | sampler nativo | Sonatina, programa 36 | — |

- O **Acoustic Rock Kit** permanece no sampler (D9).
- O **Electronic Drum Kit** usa o instrumento nativo desde a D9: o main carrega o kit no programa 24,
  aplica o padrão `electro` **somente quando o layer não tem estado salvo** e mantém o sequenciador
  ligado (`enabled`/`startWithPatch` no assignment).
- Se o motor não tiver o `preseter.drums` (versão antiga), a carga cai no sampler com o mesmo SF2 e
  o patch continua soando (sem sequenciador).

## Padrões de fábrica disponíveis

`src/shared/drum-patterns.ts`: Rock 4/4, Pop, Funk, Shuffle, Balada, Bossa, Samba e Eletrônico.
Todos são dados originais do projeto e aparecem no seletor da janela do Drums; podem ser usados em
patches da Coleção via `drums.patternId`.

## Licenças e Loja

- O kit MuseScore_General (MIT) vem pela Loja para a pasta de sons; ver `docs/LICENCAS.md` e
  `docs/LOJA.md`.
- Nenhum kit novo entra sem licença verificada.

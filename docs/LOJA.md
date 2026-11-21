# Loja do Preseter — bibliotecas de som e kits

O catálogo da Loja fica em `store/store-catalog.json` (gerado por
`scripts/generate-store-catalog.mjs`) e é lido pelo app; os pacotes grandes não entram no
instalador — são baixados para a pasta de sons do usuário.

> Regra do projeto: **nenhum kit de bateria ou biblioteca de samples entra na Loja sem a licença
> verificada na fonte e registrada em `docs/LICENCAS.md`**. O que não tiver licença clara fica
> `a confirmar` e não entra.

## Bibliotecas de som na v1

| id | Arquivo | Licença | Origem | Tamanho | Destino |
|---|---|---|---|---|---|
| `musescore-general` | `MuseScore_General.sf2` | **MIT** (verificada) | https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/ | ≈ 206 MiB | `<pastaSons>/MuseScore_General/MuseScore_General.sf2` |

O mesmo `MuseScore_General.sf2` serve:

- ao **sampler** nativo (banco 128 programa 0 → patch **Acoustic Rock Kit**);
- ao **Preseter Drums**: kit padrão (banco 128 programa 0) e patch **Electronic Drum Kit** (banco
  128 programa 24).

Licença, atribuição e requisitos: ver a seção “Kits de bateria — MuseScore_General” em
`docs/LICENCAS.md`. O item é `essential`/`defaultSelected` na Loja; o app não embute o arquivo.

## Kits de percussão futuros

Para adicionar um kit novo:

1. verificar a licença na fonte (CC0, CC-BY, MIT ou equivalente compatível com a distribuição do
   app) e registrar em `docs/LICENCAS.md` (autor, URL, licença exata, atribuição, redistribuição,
   uso comercial, tamanho);
2. se for baixável, adicionar o item/variante no catálogo da Loja (`id`, `license`, `licenseUrl`,
   `variants[].url`, `fileName`, `destSubfolder`, `approxBytes`);
3. só então criar o patch na Coleção (D9) apontando para o kit.

Hoje **não há outro kit de bateria** na Loja além do MuseScore_General. O SF3 não é usado pelo
motor (só SF2/SFZ).

# Presets `.fxp` no Preseter

**Objetivo:** gerar `.fxp` para plugins VST2 que não trazem esses arquivos
(FSVR, MDA, Helm etc.) e usar esses presets dentro do Preseter.

O `.fxp` é uma **fonte extra** da biblioteca. Os formatos atuais continuam:

- programas internos do plugin;
- snapshots do Preseter;
- `.vstpreset` (VST3);
- `.fxp` (VST2).

## Como funciona

1. O botão **⋯ → Gerar .fxp…** no Timbre (ou **Gerar .fxp** na aba Presets)
   grava o som atual em:

```
Documentos\Preseter\Presets\<Plugin>\<Nome>.fxp
```

2. A biblioteca varre essa pasta e mostra os `.fxp` no grupo **Presets .fxp**.
3. Clicar aplica o `.fxp` no plugin VST2 do timbre.
4. A pasta está nos watchers: novos arquivos aparecem sem reiniciar.

Também é possível gerar em lote:

```powershell
node scripts/exportar-fxp.js --plugin=FSVR --atual --nome="Zap 1"
node scripts/exportar-fxp.js --plugin=MEU_PLUGIN --programas=all
```

## Motor

- `saveVst2Fxp`: usa `juce::VSTPluginFormat::saveToFXBFile` para gerar o `.fxp`
  completo (cabeçalho `CcnK`/`FPCh`, ID do plugin, nome e chunk).
- `setVst2FxpFile`: valida o ID do plugin e aplica o chunk com
  `juce::VSTPluginFormat::setChunkData`.
- `.fxb` não é suportado; só `.fxp`.

## FSVR

O FSVR expõe apenas 1 programa ao host (`Default`); os 3 bancos são internos.
Hoje o fluxo é:

1. escolher o preset no FSVR;
2. clicar em **⋯ → Gerar .fxp…**;
3. dar um nome.

Gerar os 3 bancos automaticamente exigiria investigar os dados internos do
FSVR (DLL/fonte) ou automatizar a interface. Fica como fase separada.

## Limites

- `.fxp` só vale para **VST2**; VST3 continua com `.vstpreset`.
- O ID do `.fxp` é validado contra o plugin; arquivo de outro plugin é recusado.
- O estado pode variar entre versões do plugin.
- Presets de fábrica podem ter licença própria; conferir antes de distribuir.

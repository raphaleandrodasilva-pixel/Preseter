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

O FSVR expõe apenas 1 programa ao host (`Default`), mas aceita Program Change
nos bancos internos. O diálogo oferece:

- Som atual;
- Banco A, B, C (128 cada);
- Todos os bancos (384).

O fluxo por performance é:

1. CC0 = 63 (bank MSB);
2. CC32 = 65/66/67 (Banco A/B/C);
3. Program Change 0–127 no canal 1;
4. espera o FSVR carregar a performance;
5. `saveVst2Fxp`.

Os outros timbres do patch são salvos e restaurados depois. O `.fxp` do FSVR
traz o nome do programa como `Default`; por isso os arquivos são numerados
(`A001 - Performance 1.fxp`).

### Splash

O áudio não bloqueia mais a abertura: `audioSettingsGet` carrega em segundo
plano e o splash fecha quando concert e templates estão prontos.

## Limites

- `.fxp` só vale para **VST2**; VST3 continua com `.vstpreset`.
- O ID do `.fxp` é validado contra o plugin; arquivo de outro plugin é recusado.
- O estado pode variar entre versões do plugin.
- Presets de fábrica podem ter licença própria; conferir antes de distribuir.

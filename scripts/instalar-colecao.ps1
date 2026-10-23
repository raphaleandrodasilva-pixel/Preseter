<#
.SYNOPSIS
  Instala (se faltar) os plugins e bibliotecas da coleção do Preseter e gera o concert.

.DESCRIPTION
  1. Procura cada plugin nas pastas conhecidas (VST3, VST2, LV2). Se achar, NÃO baixa.
  2. Se não achar, baixa a versão mais recente do release oficial no GitHub e roda o
     instalador (interativo) ou copia o .vst3 do .zip.
  3. Baixa as bibliotecas de samples para a pasta do usuário (padrão: ~\PreseterSons),
     pulando as que já existem.
  4. Roda `npm run build:main` e `node scripts/gerar-colecao.js`.

  Tudo o que não puder ser baixado automaticamente aparece no final com a página
  para baixar manualmente. O SOM de cada patch (preset/SFZ/SF2) continua sendo
  escolhido por você dentro do plugin.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1
  powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1 -SonsDir D:\Sons -SemGerar
#>
param(
  [string]$SonsDir = (Join-Path $HOME 'PreseterSons'),
  [string]$Saida = (Join-Path $HOME 'Colecao.preseter'),
  [switch]$SemBaixar,   # só procura e informa, não baixa nada
  [switch]$SemGerar     # não roda o gerar-colecao.js
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$userVst3 = Join-Path $env:LOCALAPPDATA 'Programs\Common\VST3'   # não exige administrador

# ---------------------------------------------------------------- pastas conhecidas
$pastasPlugins = @(
  "$env:CommonProgramFiles\VST3",
  "${env:CommonProgramFiles(x86)}\VST3",
  $userVst3,
  "$env:ProgramFiles\Steinberg\VSTPlugins",
  "$env:ProgramFiles\Steinberg\VST3",
  "$env:ProgramFiles\Steinberg\Vstplugins",
  "${env:ProgramFiles(x86)}\Steinberg\VSTPlugins",
  "${env:ProgramFiles(x86)}\Steinberg\VST3",
  "$env:ProgramFiles\VSTPlugins",
  "${env:ProgramFiles(x86)}\VSTPlugins",
  "$env:ProgramFiles\Common Files\VST2",
  "$env:CommonProgramFiles\LV2",
  "$env:APPDATA\LV2"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

function Find-Plugin([string[]]$Padroes) {
  foreach ($pasta in $pastasPlugins) {
    foreach ($p in $Padroes) {
      $achou = Get-ChildItem -Path $pasta -Recurse -Depth 3 -Filter $p -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if ($achou) { return $achou.FullName }
    }
  }
  return $null
}

# ------------------------------------------------------------------------ catálogo
# Padrao = nomes de arquivo procurados; Repo/Asset = release do GitHub; Pagina = manual.
$plugins = @(
  @{ Nome='Surge XT';   Padroes=@('Surge XT.vst3','Surge XT*.vst3'); Repo='surge-synthesizer/releases-xt'; Asset='(?i)windows.*setup.*\.exe$|surge.*win.*\.exe$'; Pagina='https://surge-synthesizer.github.io/' }
  @{ Nome='Dexed';      Padroes=@('Dexed.vst3','Dexed.dll');       Repo='asb2m10/dexed';               Asset='(?i)win.*\.(zip|exe)$'; Pagina='https://github.com/asb2m10/dexed/releases' }
  @{ Nome='Odin 2';     Padroes=@('Odin2.vst3','Odin 2.vst3');     Repo='TheWaveWarden/odin2';         Asset='(?i)win.*\.(zip|exe)$'; Pagina='https://thewavewarden.com/pages/odin-2' }
  @{ Nome='Helm';       Padroes=@('Helm.vst3','helm.dll','Helm.dll'); Repo='mtytel/helm';              Asset='(?i)win.*\.(zip|exe)$'; Pagina='https://tytel.org/helm/downloads' }
  @{ Nome='MDA';        Padroes=@('mda*.vst3');                    Repo='sudara/mda-vst3';             Asset='(?i)win.*\.(zip|exe)$'; Pagina='https://github.com/sudara/mda-vst3/releases' }
  @{ Nome='sfizz (SFZ)';Padroes=@('sfizz.vst3','sforzando.vst3','sforzando*.vst3'); Repo='sfztools/sfizz'; Asset='(?i)win.*\.(zip|exe)$'; Pagina='https://sfz.tools/sfizz/downloads' }
  @{ Nome='SF2 Player (Bertom)'; Padroes=@('SF2 Player.vst3','SF2Player.vst3','*SF2*.vst3'); Repo=$null; Asset=$null; Pagina='https://www.bertom.com/sf2-player' }
  @{ Nome='setBfree (órgão, LV2)'; Padroes=@('setBfree*.lv2','b_synth.lv2'); Repo=$null; Asset=$null; Pagina='https://setbfree.org/' }
)

function Get-GitHubAsset([string]$Repo, [string]$Regex) {
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ 'User-Agent'='preseter-instalador' }
  return $rel.assets | Where-Object { $_.name -match $Regex } | Select-Object -First 1
}

function Install-FromAsset($asset, [string]$nome) {
  $tmp = Join-Path $env:TEMP "preseter-$($asset.name)"
  Write-Host "    baixando $($asset.name) ..."
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -Headers @{ 'User-Agent'='preseter-instalador' }
  if ($asset.name -match '\.zip$') {
    $dest = Join-Path $env:TEMP "preseter-x-$nome" -replace ' ',''
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Expand-Archive -Path $tmp -DestinationPath $dest -Force
    $vst3 = Get-ChildItem $dest -Recurse -Filter '*.vst3'
    if (-not $vst3) { return $false }
    New-Item -ItemType Directory -Force -Path $userVst3 | Out-Null
    foreach ($v in $vst3) { Copy-Item $v.FullName -Destination $userVst3 -Recurse -Force }
    return $true
  }
  Write-Host "    abrindo o instalador (siga as telas; feche-o ao terminar)..."
  Start-Process -FilePath $tmp -Wait
  return $true
}

# --------------------------------------------------------------------- 1) plugins
Write-Host "`n== Plugins ==" -ForegroundColor Cyan
Write-Host "Pastas verificadas:"; $pastasPlugins | ForEach-Object { Write-Host "  $_" }
$manual = @()
$resumo = @()
foreach ($pl in $plugins) {
  $caminho = Find-Plugin $pl.Padroes
  if ($caminho) { Write-Host "[ok]  $($pl.Nome): $caminho" -ForegroundColor Green; $resumo += "$($pl.Nome): já instalado"; continue }
  if ($SemBaixar -or -not $pl.Repo) {
    Write-Host "[--]  $($pl.Nome): não encontrado" -ForegroundColor Yellow
    $manual += "$($pl.Nome): baixe em $($pl.Pagina)"; $resumo += "$($pl.Nome): FALTA"; continue
  }
  Write-Host "[...] $($pl.Nome): não encontrado, procurando release oficial"
  try {
    $asset = Get-GitHubAsset $pl.Repo $pl.Asset
    if (-not $asset) { throw 'nenhum arquivo de Windows no release' }
    if (Install-FromAsset $asset $pl.Nome) { $resumo += "$($pl.Nome): instalado agora" }
    else { throw 'o arquivo não tinha .vst3' }
  } catch {
    Write-Host "      falhou: $($_.Exception.Message)" -ForegroundColor Yellow
    $manual += "$($pl.Nome): baixe em $($pl.Pagina)"; $resumo += "$($pl.Nome): FALTA"
  }
}

# ------------------------------------------------------------------ 2) bibliotecas
Write-Host "`n== Bibliotecas em $SonsDir ==" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $SonsDir | Out-Null

function Test-Biblioteca([string]$sub, [string]$filtro) {
  $d = Join-Path $SonsDir $sub
  return (Test-Path $d) -and [bool](Get-ChildItem $d -Recurse -Filter $filtro -ErrorAction SilentlyContinue | Select-Object -First 1)
}

# Salamander Grand Piano V3 (CC BY 3.0 - atribuição a Alexander Holm)
if (Test-Biblioteca 'Salamander' '*.sfz') { Write-Host "[ok]  Salamander já existe" -ForegroundColor Green }
elseif ($SemBaixar) { $manual += 'Salamander: https://github.com/sfzinstruments/SalamanderGrandPiano' }
else {
  try {
    Write-Host "[...] Salamander (grande, pode demorar)"
    $zip = Join-Path $env:TEMP 'salamander.zip'
    $info = Invoke-RestMethod 'https://api.github.com/repos/sfzinstruments/SalamanderGrandPiano' -Headers @{ 'User-Agent'='preseter-instalador' }
    Invoke-WebRequest "https://github.com/sfzinstruments/SalamanderGrandPiano/archive/refs/heads/$($info.default_branch).zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath (Join-Path $SonsDir 'Salamander') -Force
  } catch { $manual += "Salamander: baixe em https://github.com/sfzinstruments/SalamanderGrandPiano ($($_.Exception.Message))" }
}

# Sonatina Symphonic Orchestra (SF2) - link do manual do MuseScore
if (Test-Biblioteca 'Sonatina' '*.sf2') { Write-Host "[ok]  Sonatina já existe" -ForegroundColor Green }
elseif ($SemBaixar) { $manual += 'Sonatina: http://ftp.osuosl.org/pub/musescore/soundfont/Sonatina_Symphonic_Orchestra_SF2.zip' }
else {
  try {
    Write-Host "[...] Sonatina (~500 MB)"
    $zip = Join-Path $env:TEMP 'sonatina.zip'
    Invoke-WebRequest 'http://ftp.osuosl.org/pub/musescore/soundfont/Sonatina_Symphonic_Orchestra_SF2.zip' -OutFile $zip
    Expand-Archive $zip -DestinationPath (Join-Path $SonsDir 'Sonatina') -Force
  } catch { $manual += "Sonatina: baixe em http://ftp.osuosl.org/pub/musescore/soundfont/Sonatina_Symphonic_Orchestra_SF2.zip ($($_.Exception.Message))" }
}

# MuseScore_General (MIT) - preferir SF2 (SF3 pode não abrir no SF2 Player)
if (Test-Biblioteca 'MuseScore_General' '*.sf2') { Write-Host "[ok]  MuseScore_General (sf2) já existe" -ForegroundColor Green }
elseif ($SemBaixar) { $manual += 'MuseScore_General: https://musescore.org/en/handbook/soundfonts' }
else {
  try {
    Write-Host "[...] MuseScore_General (SF2)"
    $asset = Get-GitHubAsset 'musescore/MuseScore_General' '(?i)\.sf2(\.zip)?$'
    if (-not $asset) { throw 'sem arquivo .sf2 no release' }
    $dest = Join-Path $SonsDir 'MuseScore_General'
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $arq = Join-Path $dest $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $arq -Headers @{ 'User-Agent'='preseter-instalador' }
    if ($arq -match '\.zip$') { Expand-Archive $arq -DestinationPath $dest -Force }
  } catch { $manual += "MuseScore_General (versão SF2): https://musescore.org/en/handbook/soundfonts ($($_.Exception.Message))" }
}

# ------------------------------------------------------------------------ 3) concert
if (-not $SemGerar) {
  Write-Host "`n== Gerando o concert ==" -ForegroundColor Cyan
  Push-Location $repoRoot
  try {
    npm run build:main | Out-Null
    $extra = $pastasPlugins | ForEach-Object { "--path=$_" }
    node scripts/gerar-colecao.js "--out=$Saida" @extra
  } finally { Pop-Location }
}

# ------------------------------------------------------------------------ resumo
Write-Host "`n== Resumo ==" -ForegroundColor Cyan
$resumo | ForEach-Object { Write-Host "  $_" }
Write-Host "  Sons: $SonsDir"
if (-not $SemGerar) { Write-Host "  Concert: $Saida" }
if ($manual.Count) {
  Write-Host "`nFaça manualmente:" -ForegroundColor Yellow
  $manual | Select-Object -Unique | ForEach-Object { Write-Host "  - $_" }
}
Write-Host "`nPróximo passo: abra o concert no Preseter, entre em cada patch, abra o plugin (tecla V),"
Write-Host "carregue o preset/SFZ/SF2 (em $SonsDir) e salve o concert."
Write-Host "Atribuição: Salamander Grand Piano (CC BY 3.0, Alexander Holm)."

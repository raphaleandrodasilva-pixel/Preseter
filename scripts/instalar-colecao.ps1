<#
.SYNOPSIS
  Baixa (se faltar) os plugins e bibliotecas da coleção do Preseter e gera o concert.

.DESCRIPTION
  Usa o mesmo catálogo do app (src/shared/collection-catalog.json):
  1. Procura cada item nas pastas padrão; se já existe, não baixa.
  2. Baixa das fontes oficiais, extrai zips (sem admin) ou baixa instaladores.
  3. Salva as bibliotecas de som em -SonsDir (padrão ~\PreseterSons).
  4. Roda `npm run build:main` e `node scripts/gerar-colecao.js`.

  O app faz o mesmo em Configurações → Coleção. Este script é o modo avançado/CLI.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1
  powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1 -SonsDir D:\Sons -SemGerar
  powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1 -Itens juicysfplugin,musescore-general
  powershell -ExecutionPolicy Bypass -File scripts\instalar-colecao.ps1 -Todos
#>
param(
  [string]$SonsDir = (Join-Path $HOME 'PreseterSons'),
  [string]$Saida = (Join-Path $HOME 'Colecao.preseter'),
  [switch]$SemBaixar,
  [switch]$SemGerar,
  [switch]$SemPlugins,
  [switch]$SemBibliotecas,
  [switch]$Todos,
  [switch]$Forcar,
  [string]$Itens = ''
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$catalogPath = Join-Path $repoRoot 'src\shared\collection-catalog.json'
$catalog = Get-Content -Raw -Path $catalogPath | ConvertFrom-Json
$userVst3 = Join-Path $env:LOCALAPPDATA 'Programs\Common\VST3'   # sem administrador
$tempRoot = Join-Path $env:TEMP 'preseter-collection'

$pastasPlugins = @(
  $userVst3,
  "$env:CommonProgramFiles\VST3",
  "${env:CommonProgramFiles(x86)}\VST3",
  "$env:ProgramFiles\Steinberg\VSTPlugins",
  "${env:ProgramFiles(x86)}\Steinberg\VSTPlugins",
  "$env:CommonProgramFiles\LV2",
  "$env:APPDATA\LV2"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

function Or-Value($value, $fallback) {
  if ($null -ne $value -and "$value" -ne '') { return $value }
  return $fallback
}

function Test-Pattern([string]$root, [string]$pattern, [int]$depth = 3) {
  if (-not (Test-Path $root)) { return $null }
  $wildcard = New-Object System.Management.Automation.WildcardPattern($pattern, 'IgnoreCase')
  $queue = [System.Collections.Generic.Queue[object]]::new()
  $queue.Enqueue(@($root, 0))
  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    $dir = [string]$current[0]
    $level = [int]$current[1]
    try { $entries = Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop } catch { continue }
    foreach ($entry in $entries) {
      if ($wildcard.IsMatch($entry.Name)) { return $entry.FullName }
      if ($entry.PSIsContainer -and $level -lt $depth) {
        $queue.Enqueue(@($entry.FullName, ($level + 1)))
      }
    }
  }
  return $null
}

function Find-PluginItem($item) {
  foreach ($pattern in @($item.vst3Patterns)) {
    if (-not $pattern) { continue }
    foreach ($folder in $pastasPlugins) {
      $found = Test-Pattern $folder $pattern 3
      if ($found) { return $found }
    }
  }
  return $null
}

function Find-LibraryItem($item) {
  $folder = Join-Path $SonsDir (Or-Value $item.destSubfolder '')
  foreach ($pattern in @($item.soundfontPatterns)) {
    if (-not $pattern) { continue }
    $found = Test-Pattern $folder $pattern 2
    if ($found) { return $found }
  }
  return $null
}

function Get-Status($item) {
  if ($item.kind -eq 'manual') { return 'manual' }
  if ($item.group -eq 'plugin') {
    if (Find-PluginItem $item) { return 'installed' }
  } else {
    if (Find-LibraryItem $item) { return 'installed' }
  }
  return 'missing'
}

function Download-File([string]$url, [string]$dest) {
  $folder = Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  Write-Host "    baixando $url"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -Headers @{ 'User-Agent' = 'Preseter' }
}

function Expand-Zip([string]$zip, [string]$dest) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
}

function Install-Vst3FromFolder([string]$folder) {
  New-Item -ItemType Directory -Force -Path $userVst3 | Out-Null
  $bundles = Get-ChildItem -LiteralPath $folder -Recurse -Directory -Filter '*.vst3' -ErrorAction SilentlyContinue
  $copied = @()
  foreach ($bundle in $bundles) {
    $dest = Join-Path $userVst3 $bundle.Name
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Item $bundle.FullName -Destination $dest -Recurse -Force
    $copied += $dest
    # DLLs que ficam ao lado do bundle.
    Get-ChildItem -LiteralPath $bundle.Parent.FullName -Filter '*.dll' -File -ErrorAction SilentlyContinue |
      ForEach-Object { Copy-Item $_.FullName -Destination $userVst3 -Force }
  }
  return $copied
}

function Install-Msi([string]$msi, [string]$workDir) {
  New-Item -ItemType Directory -Force -Path $workDir | Out-Null
  $result = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/a', "`"$msi`"", '/qn', "TARGETDIR=`"$workDir`"") -Wait -PassThru -WindowStyle Hidden
  if ($result.ExitCode -ne 0) { throw "msiexec retornou $($result.ExitCode)" }
  return Install-Vst3FromFolder $workDir
}

function Format-Size([double]$bytes) {
  if ($bytes -le 0) { return '—' }
  $units = @('B', 'KB', 'MB', 'GB')
  $index = [Math]::Min($units.Count - 1, [Math]::Floor([Math]::Log($bytes) / [Math]::Log(1024)))
  return ('{0:N1} {1}' -f ($bytes / [Math]::Pow(1024, $index)), $units[$index])
}

# ------------------------------------------------------------------- seleção
$manual = @()
$resumo = @()
$desejados = @()
if ($Itens) {
  $desejados = $Itens.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
} else {
  $desejados = $catalog.items | Where-Object { $_.defaultSelected -or $Todos } | ForEach-Object { $_.id }
}

Write-Host "`n== Catálogo ==" -ForegroundColor Cyan
Write-Host "  $catalogPath"
Write-Host "  Sons: $SonsDir"
Write-Host "  Plugins: $userVst3"
Write-Host "  Itens: $($desejados -join ', ')"

foreach ($item in $catalog.items) {
  $id = [string]$item.id
  if ($desejados -notcontains $id) { continue }
  if ($SemPlugins -and $item.group -eq 'plugin') { continue }
  if ($SemBibliotecas -and $item.group -eq 'library') { continue }

  $status = Get-Status $item
  if ($status -eq 'manual') {
    Write-Host "[--]  $($item.name): instalação manual" -ForegroundColor Yellow
    $manual += "$($item.name): $($item.page)"
    $resumo += "$($item.name): manual"
    continue
  }
  if ($status -eq 'installed' -and -not $Forcar) {
    Write-Host "[ok]  $($item.name): já instalado" -ForegroundColor Green
    $resumo += "$($item.name): já instalado"
    continue
  }
  if ($SemBaixar) {
    Write-Host "[..]  $($item.name): falta ($(Format-Size $item.approxBytes))" -ForegroundColor Yellow
    $resumo += "$($item.name): FALTA"
    continue
  }

  Write-Host "[...] $($item.name) ($(Format-Size $item.approxBytes))"
  try {
    $work = Join-Path $tempRoot $id
    $download = Join-Path $work (Or-Value $item.fileName "$id.bin")
    Download-File $item.url $download

    switch ($item.kind) {
      'vst3-zip' {
        $extract = Join-Path $work 'extracted'
        Expand-Zip $download $extract
        $copied = Install-Vst3FromFolder $extract
        if (-not $copied) { throw 'o pacote não continha .vst3' }
        $resumo += "$($item.name): instalado"
      }
      'vst3-msi' {
        $copied = Install-Msi $download (Join-Path $work 'extracted')
        if (-not $copied) { throw 'o MSI não continha .vst3' }
        $resumo += "$($item.name): instalado"
      }
      'vst3-exe' {
        $dest = Join-Path $HOME 'Downloads\PreseterColecao'
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        Copy-Item $download (Join-Path $dest $item.fileName) -Force
        Write-Host "    instalador baixado: $(Join-Path $dest $item.fileName)" -ForegroundColor Yellow
        $manual += "$($item.name): abra o instalador em $(Join-Path $dest $item.fileName)"
        $resumo += "$($item.name): instalador baixado"
      }
      'soundfont' {
        $dest = Join-Path $SonsDir (Or-Value $item.destSubfolder '')
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        Copy-Item $download (Join-Path $dest $item.fileName) -Force
        $resumo += "$($item.name): instalado"
      }
      'soundfont-zip' {
        $dest = Join-Path $SonsDir (Or-Value $item.destSubfolder $id)
        Expand-Zip $download $dest
        $resumo += "$($item.name): instalado"
      }
      default { throw "tipo desconhecido: $($item.kind)" }
    }
    Write-Host "[ok]  $($item.name)" -ForegroundColor Green
  } catch {
    Write-Host "[erro] $($item.name): $($_.Exception.Message)" -ForegroundColor Red
    if ($item.page) { $manual += "$($item.name): $($item.page)" }
    $resumo += "$($item.name): ERRO"
  }
}

# --------------------------------------------------------------------- concert
if (-not $SemGerar) {
  Write-Host "`n== Gerando o concert ==" -ForegroundColor Cyan
  Push-Location $repoRoot
  try {
    npm run build:main | Out-Null
    $extra = $pastasPlugins | ForEach-Object { "--path=$_" }
    node scripts/gerar-colecao.js "--out=$Saida" @extra
  } finally { Pop-Location }
}

# --------------------------------------------------------------------- resumo
Write-Host "`n== Resumo ==" -ForegroundColor Cyan
$resumo | ForEach-Object { Write-Host "  $_" }
Write-Host "  Sons: $SonsDir"
if (-not $SemGerar) { Write-Host "  Concert: $Saida" }
if ($manual.Count) {
  Write-Host "`nFaça manualmente:" -ForegroundColor Yellow
  $manual | Select-Object -Unique | ForEach-Object { Write-Host "  - $_" }
}
Write-Host "`nPróximo passo: abra o concert no Preseter, entre em cada patch, abra o plugin (tecla V),"
Write-Host "carregue o preset/SF2 e salve o concert."
Write-Host "Atribuição: Salamander Grand Piano (CC BY 3.0, Alexander Holm); MuseScore_General (MIT)."

param(
  [string]$SourceRoot = '',
  [string]$TargetRoot = '',
  [switch]$NoPause,
  [switch]$SkipRegistry
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if ([string]::IsNullOrWhiteSpace($TargetRoot)) {
  $TargetRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
}

$source = [IO.Path]::GetFullPath($SourceRoot)
$targetRoot = [IO.Path]::GetFullPath($TargetRoot)
$target = [IO.Path]::GetFullPath((Join-Path $targetRoot 'kr.cleanvideostudio.cep'))
$expectedPrefix = $targetRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $target.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw '설치 경로를 안전하게 확인할 수 없습니다.'
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
Remove-Item -LiteralPath (Join-Path $target 'install-windows.ps1') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $target 'install-windows.bat') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $target 'install-mac.command') -Force -ErrorAction SilentlyContinue
if (-not $SkipRegistry) {
  foreach ($version in 8..12) {
    $key = "HKCU:\Software\Adobe\CSXS.$version"
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
  }
}
Write-Host ''
Write-Host '클린 비디오 스튜디오 설치 완료' -ForegroundColor Green
Write-Host 'Premiere를 완전히 종료했다가 다시 열고, 창 > 확장 기능(레거시) > 클린 비디오 스튜디오를 선택하세요.'
if (-not $NoPause) {
  Read-Host 'Enter를 누르면 닫힙니다'
}

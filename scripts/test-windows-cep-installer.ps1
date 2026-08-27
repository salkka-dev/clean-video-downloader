$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$installer = Join-Path $repositoryRoot 'premiere-cep\install-windows.ps1'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testRoot = [IO.Path]::GetFullPath((Join-Path $tempBase ('clean-video-studio-installer-test-' + [Guid]::NewGuid().ToString('N'))))
$tempPrefix = $tempBase.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

if (-not $testRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unsafe temporary test path.'
}

New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
  $env:CLEAN_VIDEO_TEST_INSTALLER = $installer
  $env:CLEAN_VIDEO_TEST_TARGET = $testRoot
  $childCommand = @'
$ErrorActionPreference = 'Stop'
$installer = $env:CLEAN_VIDEO_TEST_INSTALLER
$bytes = [IO.File]::ReadAllBytes($installer)
$text = [Text.Encoding]::UTF8.GetString($bytes)
$script = [ScriptBlock]::Create($text)
& $script -SourceRoot ([IO.Path]::GetDirectoryName($installer)) -TargetRoot $env:CLEAN_VIDEO_TEST_TARGET -NoPause -SkipRegistry
'@
  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($childCommand))
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedCommand 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }

  $installed = Join-Path $testRoot 'kr.cleanvideostudio.cep\CSXS\manifest.xml'
  if (-not (Test-Path -LiteralPath $installed)) {
    throw 'Installer did not copy the CEP manifest.'
  }
  if (($output -join [Environment]::NewLine) -notmatch '클린 비디오 스튜디오 설치 완료') {
    throw 'Korean completion message was not decoded correctly.'
  }
  if ((Get-Content -Raw -LiteralPath $installed) -notmatch 'ExtensionBundleVersion="1.0.1"') {
    throw 'Installed manifest version is incorrect.'
  }

  $output
  Write-Output 'TEMP_INSTALL_TEST=PASS'
} finally {
  Remove-Item Env:CLEAN_VIDEO_TEST_INSTALLER -ErrorAction SilentlyContinue
  Remove-Item Env:CLEAN_VIDEO_TEST_TARGET -ErrorAction SilentlyContinue
  $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
  $isExpectedTempChild = $resolvedTestRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)
  $hasExpectedName = (Split-Path -Leaf $resolvedTestRoot).StartsWith('clean-video-studio-installer-test-')
  if ($isExpectedTempChild -and $hasExpectedName) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

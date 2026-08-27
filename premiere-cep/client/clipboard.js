'use strict';

(function exposeClipboard(global) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { execFileSync } = require('child_process');

  function encodePowerShell(script) {
    return Buffer.from(script, 'utf16le').toString('base64');
  }

  function runPowerShell(script) {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encodePowerShell(script)], { windowsHide: true, encoding: 'utf8', timeout: 12_000 }).trim();
  }

  function tempPng() {
    const folder = path.join(os.tmpdir(), 'clean-video-studio');
    fs.mkdirSync(folder, { recursive: true });
    return path.join(folder, `clipboard-${Date.now()}.png`);
  }

  function readWindows() {
    const imagePath = tempPng().replace(/'/g, "''");
    const result = runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if ([Windows.Forms.Clipboard]::ContainsFileDropList()) {
  $paths = @([Windows.Forms.Clipboard]::GetFileDropList())
  @{kind='files';paths=$paths} | ConvertTo-Json -Compress
} elseif ([Windows.Forms.Clipboard]::ContainsImage()) {
  $image = [Windows.Forms.Clipboard]::GetImage()
  $image.Save('${imagePath}', [Drawing.Imaging.ImageFormat]::Png)
  $image.Dispose()
  @{kind='files';paths=@('${imagePath}')} | ConvertTo-Json -Compress
} elseif ([Windows.Forms.Clipboard]::ContainsText()) {
  @{kind='text';value=[Windows.Forms.Clipboard]::GetText()} | ConvertTo-Json -Compress
} else { @{kind='empty'} | ConvertTo-Json -Compress }
`);
    return JSON.parse(result || '{"kind":"empty"}');
  }

  function readMac() {
    let text = '';
    try { text = execFileSync('/usr/bin/pbpaste', [], { encoding: 'utf8', timeout: 5000 }).trim(); } catch (_) {}
    if (text) return { kind: 'text', value: text };
    const imagePath = tempPng();
    const script = `try\nset pngData to the clipboard as «class PNGf»\nset outFile to open for access POSIX file \"${imagePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}\" with write permission\nset eof outFile to 0\nwrite pngData to outFile\nclose access outFile\nreturn \"ok\"\non error\ntry\nclose access outFile\nend try\nreturn \"\"\nend try`;
    try {
      if (execFileSync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8', timeout: 7000 }).trim() === 'ok' && fs.existsSync(imagePath)) return { kind: 'files', paths: [imagePath] };
    } catch (_) {}
    return { kind: 'empty' };
  }

  function read() {
    return process.platform === 'win32' ? readWindows() : readMac();
  }

  function copyImageWindows(file) {
    const escaped = file.replace(/'/g, "''");
    runPowerShell(`Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $source=[Drawing.Image]::FromFile('${escaped}'); $copy=New-Object Drawing.Bitmap $source; $source.Dispose(); [Windows.Forms.Clipboard]::SetImage($copy); $copy.Dispose()`);
  }

  function copyImageMac(file) {
    const escaped = file.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    execFileSync('/usr/bin/osascript', ['-e', `set the clipboard to (read POSIX file \"${escaped}\" as «class PNGf»)`], { timeout: 7000 });
  }

  function copyImage(file) {
    if (!fs.existsSync(file)) throw new Error('복사할 이미지 파일을 찾지 못했습니다.');
    if (process.platform === 'win32') copyImageWindows(file); else copyImageMac(file);
    return true;
  }

  function fingerprint(value) {
    try { return JSON.stringify(value); } catch (_) { return String(Date.now()); }
  }

  global.CleanClipboard = { copyImage, fingerprint, read };
})(window);

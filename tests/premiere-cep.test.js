'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'premiere-cep');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('CEP panel supports Premiere 2022+ with its own Node runtime', () => {
  const manifest = read('CSXS/manifest.xml');
  assert.match(manifest, /Host Name="PPRO" Version="\[22\.0,99\.9\]"/);
  assert.match(manifest, /--enable-nodejs/);
  assert.match(manifest, /ExtensionBundleVersion="1\.0\.1"/);
  assert.match(manifest, /클린 비디오 스튜디오/);
});

test('Windows installer decodes its PowerShell source as UTF-8', () => {
  const batch = read('install-windows.bat');
  const powershell = read('install-windows.ps1');
  assert.match(batch, /\[Text\.Encoding\]::UTF8\.GetString/);
  assert.doesNotMatch(batch, /-File\s/i);
  assert.match(powershell, /\[switch\]\$NoPause/);
  assert.match(powershell, /\[switch\]\$SkipRegistry/);
});

test('CEP engine prepares platform tools without calling the desktop app', () => {
  const engine = read('client/engine.js');
  assert.match(engine, /Clean-Video-Engine-/);
  assert.match(engine, /yt-dlp/);
  assert.match(engine, /ffmpeg/);
  assert.doesNotMatch(engine + read('client/panel.js'), /cleanvideo:\/\//i);
});

test('CEP host imports media, selects tracks, and exports a sequence frame', () => {
  const host = read('host/index.jsx');
  assert.match(host, /app\.project\.importFiles/);
  assert.match(host, /sequence\.insertClip/);
  assert.match(host, /exportFramePNG/);
  assert.match(read('client/clipboard.js'), /ContainsImage|PNGf/);
});

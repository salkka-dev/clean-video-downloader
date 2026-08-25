'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const UNUSED_PRIVACY_KEYS = [
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription'
];

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const entitlements = path.resolve(__dirname, '..', 'build', 'entitlements.mac.plist');
  const infoPlist = path.join(appPath, 'Contents', 'Info.plist');

  // Electron's stock Info.plist declares hardware permissions this app never
  // requests. Remove them so macOS does not describe the downloader as a
  // camera, microphone, Bluetooth, or audio-capture app.
  for (const key of UNUSED_PRIVACY_KEYS) {
    try {
      execFileSync('/usr/bin/plutil', ['-remove', key, infoPlist], { stdio: 'ignore' });
    } catch (_) {
      // The key may already be absent in a later Electron release.
    }
  }

  // electron-builder 26.x renames these bundles, but the Electron executable
  // can still look for the stock names on macOS 26 and abort before any app
  // JavaScript runs. Restore the names Electron itself expects.
  const frameworks = path.join(appPath, 'Contents', 'Frameworks');
  for (const suffix of ['', ' (GPU)', ' (Plugin)', ' (Renderer)']) {
    const productName = `${context.packager.appInfo.productFilename} Helper${suffix}`;
    const electronName = `Electron Helper${suffix}`;
    const sourceBundle = path.join(frameworks, `${productName}.app`);
    const targetBundle = path.join(frameworks, `${electronName}.app`);
    if (!fs.existsSync(sourceBundle) || fs.existsSync(targetBundle)) continue;
    fs.renameSync(sourceBundle, targetBundle);

    const sourceExecutable = path.join(targetBundle, 'Contents', 'MacOS', productName);
    const targetExecutable = path.join(targetBundle, 'Contents', 'MacOS', electronName);
    if (fs.existsSync(sourceExecutable)) fs.renameSync(sourceExecutable, targetExecutable);
    execFileSync('/usr/bin/plutil', [
      '-replace', 'CFBundleExecutable', '-string', electronName,
      path.join(targetBundle, 'Contents', 'Info.plist')
    ]);
  }

  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--options',
    'runtime',
    '--entitlements',
    entitlements,
    appPath
  ], { stdio: 'inherit' });
};

'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const entitlements = path.resolve(__dirname, '..', 'build', 'entitlements.mac.plist');

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

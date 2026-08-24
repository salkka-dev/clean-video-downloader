'use strict';

const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'store', 'source');
const output = path.join(root, 'store', 'assets');

async function render(input, target, width, height, transparent = false) {
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    transparent,
    backgroundColor: transparent ? '#00000000' : '#06101d',
    webPreferences: { offscreen: true }
  });

  await win.loadFile(path.join(source, input));
  await win.webContents.executeJavaScript('document.fonts ? document.fonts.ready : Promise.resolve()');
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await new Promise(resolve => setTimeout(resolve, 850));
  const captured = await win.webContents.capturePage({ x: 0, y: 0, width, height });
  const image = captured.resize({ width, height, quality: 'best' });
  writeFileSync(path.join(output, target), image.toPNG());
  win.destroy();
}

app.whenReady().then(async () => {
  mkdirSync(output, { recursive: true });
  await render('icon128.svg', 'icon128.png', 128, 128, true);
  await render('promo.html', 'small-promo-440x280.png', 440, 280);
  await render('screenshot.html', 'screenshot-1280x800.png', 1280, 800);
  writeFileSync(path.join(root, 'extension', 'icon128.png'), require('node:fs').readFileSync(path.join(output, 'icon128.png')));
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extensionDir = path.join(__dirname, '..', 'extension');

function eventSlot(listeners, name) {
  return { addListener(listener) { listeners[name] = listener; } };
}

function loadBackground({ scriptedResult = null } = {}) {
  const listeners = {};
  const downloads = [];
  const notifications = [];
  const menus = [];
  const context = vm.createContext({
    URL,
    console,
    setTimeout,
    clearTimeout,
    chrome: {
      runtime: {
        onInstalled: eventSlot(listeners, 'installed'),
        onStartup: eventSlot(listeners, 'startup')
      },
      contextMenus: {
        removeAll(callback) { callback(); },
        create(menu) { menus.push(menu); },
        onClicked: eventSlot(listeners, 'clicked')
      },
      notifications: {
        async create(notification) { notifications.push(notification); }
      },
      downloads: {
        async download(options) { downloads.push(options); return 1; }
      },
      scripting: {
        async executeScript() { return [{ result: scriptedResult }]; }
      },
      action: { onClicked: eventSlot(listeners, 'action') }
    }
  });
  context.importScripts = (filename) => {
    vm.runInContext(fs.readFileSync(path.join(extensionDir, filename), 'utf8'), context, { filename });
  };
  vm.runInContext(fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8'), context, { filename: 'background.js' });
  return { downloads, listeners, menus, notifications };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('standalone manifest uses Chrome download permissions without a local app host', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, '2.4.0');
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'contextMenus', 'downloads', 'notifications', 'scripting'].sort());
  assert.equal(manifest.host_permissions, undefined);
});

test('context menu downloads a selected direct media URL', async () => {
  const extension = loadBackground();
  extension.listeners.installed();
  assert.equal(extension.menus[0].id, 'clean-media-download');

  extension.listeners.clicked(
    { menuItemId: 'clean-media-download', srcUrl: 'https://cdn.example.com/demo.mp4?token=1', mediaType: 'video' },
    { id: 7, title: 'Demo / Cut' }
  );
  await settle();

  assert.equal(extension.downloads.length, 1);
  assert.equal(extension.downloads[0].url, 'https://cdn.example.com/demo.mp4?token=1');
  assert.equal(extension.downloads[0].filename, 'Demo _ Cut.mp4');
  assert.equal(extension.notifications.at(-1).message, 'Chrome 다운로드를 시작했습니다.');
});

test('toolbar action downloads media discovered in the current tab', async () => {
  const extension = loadBackground({ scriptedResult: { url: 'https://cdn.example.com/audio.mp3', kind: 'audio', title: 'Interview' } });
  extension.listeners.action({ id: 8, title: 'Interview' });
  await settle();

  assert.equal(extension.downloads[0].filename, 'Interview.mp3');
});

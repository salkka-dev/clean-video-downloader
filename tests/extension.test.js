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
        onStartup: eventSlot(listeners, 'startup'),
        onMessage: eventSlot(listeners, 'message')
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
      action: {
        setBadgeBackgroundColor() {},
        setBadgeText() {}
      }
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
  assert.equal(manifest.version, '2.4.1');
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'contextMenus', 'downloads', 'notifications', 'scripting'].sort());
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.action.default_icon['16'], 'icon16.png');
  assert.doesNotMatch(fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8'), /cleanvideo:\/\//i);
  assert.equal(fs.existsSync(path.join(extensionDir, 'popup.html')), true);
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

test('popup request downloads media discovered in the current tab', async () => {
  const extension = loadBackground({ scriptedResult: { url: 'https://cdn.example.com/audio.mp3', kind: 'audio', title: 'Interview' } });
  let response;
  extension.listeners.message(
    { type: 'download-current', tabId: 8, tabTitle: 'Interview', tabUrl: 'https://example.com/interview' },
    {},
    result => { response = result; }
  );
  await settle();

  assert.equal(extension.downloads[0].filename, 'Interview.mp3');
  assert.equal(response.ok, true);
});

test('popup rejects a normal webpage URL entered as a direct media file', async () => {
  const extension = loadBackground();
  let response;
  extension.listeners.message(
    { type: 'download-url', tabId: 8, title: 'Page', url: 'https://example.com/watch/123' },
    {},
    result => { response = result; }
  );
  await settle();
  assert.equal(extension.downloads.length, 0);
  assert.equal(response.ok, false);
});

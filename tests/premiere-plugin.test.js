'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pluginDir = path.join(__dirname, '..', 'premiere-plugin');

function loadPluginHelpers(platform = 'win32') {
  const exported = { exports: {} };
  const context = vm.createContext({
    URL,
    console,
    module: exported,
    setTimeout,
    clearTimeout,
    window: { addEventListener() {} },
    document: {},
    require(name) {
      if (name === 'os') return { platform: () => platform, homedir: () => platform === 'darwin' ? '/Users/editor' : 'C:\\Users\\editor' };
      if (name === 'uxp') return { entrypoints: { setup() {} }, shell: {}, storage: { localFileSystem: {}, formats: { binary: Symbol('binary') } } };
      if (name === 'premierepro') return { ClipProjectItem: {}, FolderItem: {}, Project: {}, SequenceEditor: {} };
      throw new Error(`Unexpected require: ${name}`);
    }
  });
  vm.runInContext(fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8'), context, { filename: 'premiere-plugin/main.js' });
  return exported.exports;
}

test('manifest targets Premiere 25.6 and permits standalone direct media downloads', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifestVersion, 5);
  assert.equal(manifest.host.app, 'premierepro');
  assert.equal(manifest.host.minVersion, '25.6.0');
  assert.equal(manifest.requiredPermissions.localFileSystem, 'fullAccess');
  assert.deepEqual(manifest.requiredPermissions.launchProcess.schemes, ['cleanvideo']);
  assert.equal(manifest.requiredPermissions.network.domains, 'all');
});

test('plugin builds the same shared bridge path used by the desktop app', () => {
  assert.equal(loadPluginHelpers('win32').bridgeDirectory(), 'C:\\Users\\editor/AppData/Roaming/CleanVideoDownloaderBridge');
  assert.equal(loadPluginHelpers('darwin').bridgeDirectory(), '/Users/editor/Library/Application Support/CleanVideoDownloaderBridge');
});

test('plugin validates supported video sites and converts Windows paths to file URLs', () => {
  const helpers = loadPluginHelpers('win32');
  assert.match(helpers.validateVideoUrl('https://vimeo.com/123456789'), /vimeo\.com/);
  assert.match(helpers.validateVideoUrl('https://example.com/video.mp4?token=1'), /video\.mp4/);
  assert.equal(helpers.isDirectMediaUrl('https://example.com/video.webm'), true);
  assert.equal(helpers.isDirectMediaUrl('http://example.com/video.mp4'), false);
  assert.throws(() => helpers.validateVideoUrl('https://example.com/watch/123'), /직접 MP4/);
  assert.equal(helpers.nativePathToFileUrl('C:\\Users\\editor\\AppData\\job.json'), 'file:/C:/Users/editor/AppData/job.json');
});

test('plugin creates safe names for standalone media files', () => {
  const helpers = loadPluginHelpers('win32');
  assert.equal(helpers.safeMediaName('https://cdn.example.com/Cut%2001.mp4?token=1', 'video/mp4'), 'Cut 01.mp4');
  assert.equal(helpers.safeMediaName('https://cdn.example.com/stream', 'video/webm'), 'stream.webm');
});

test('plugin source imports a finished file and inserts it into the sequence transaction', () => {
  const source = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
  assert.match(source, /fetch\(url/);
  assert.match(source, /response\.arrayBuffer\(\)/);
  assert.match(source, /localFileSystem\.getTemporaryFolder\(\)/);
  assert.match(source, /formats\.binary/);
  assert.match(source, /project\.importFiles\(\[filePath\]/);
  assert.match(source, /createInsertProjectItemAction/);
  assert.match(source, /project\.lockedAccess/);
  assert.match(source, /compoundAction\.addAction/);
});

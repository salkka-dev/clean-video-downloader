'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  getBridgeDirectory,
  getJobFile,
  parsePremiereProtocol,
  writeJobStatus
} = require('../src/lib/premiere-bridge');

test('Premiere protocol accepts a supported video job', () => {
  const value = 'cleanvideo://premiere?job=ppro_12345678&quality=1080&url=' + encodeURIComponent('https://www.youtube.com/watch?v=abcdefghijk');
  assert.deepEqual(parsePremiereProtocol(value), {
    id: 'ppro_12345678',
    quality: '1080',
    url: 'https://www.youtube.com/watch?v=abcdefghijk'
  });
});

test('Premiere protocol rejects unsupported sites and invalid jobs', () => {
  assert.throws(() => parsePremiereProtocol('cleanvideo://premiere?job=short&quality=1080&url=https%3A%2F%2Fexample.com%2Fvideo'), /작업 번호/);
  assert.throws(() => parsePremiereProtocol('cleanvideo://premiere?job=ppro_12345678&quality=1080&url=https%3A%2F%2Fexample.com%2Fvideo'), /지원하는/);
});

test('Premiere job status is written to the shared bridge folder', t => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-video-premiere-'));
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  writeJobStatus(appData, {
    id: 'ppro_12345678',
    status: 'succeeded',
    progress: 100,
    message: '완료',
    filePath: 'C:\\Videos\\demo.mp4'
  });
  assert.equal(getBridgeDirectory(appData), path.join(appData, 'CleanVideoDownloaderBridge'));
  const written = JSON.parse(fs.readFileSync(getJobFile(appData, 'ppro_12345678'), 'utf8'));
  assert.equal(written.status, 'succeeded');
  assert.equal(written.filePath, 'C:\\Videos\\demo.mp4');
});

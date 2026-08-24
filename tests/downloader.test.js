'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatSelector,
  safeFileName,
  tvcfCandidateHeights,
  uniqueUrls,
  validateUrls
} = require('../src/lib/downloader');
const { isNewerVersion } = require('../src/lib/update');
const { isPremiereCompatible } = require('../src/lib/premiere');

test('supported individual links are accepted', () => {
  assert.equal(validateUrls(['https://www.youtube.com/watch?v=abc123']), null);
  assert.equal(validateUrls(['https://tvcf.co.kr/en/play/978150']), null);
  assert.equal(validateUrls(['https://vimeo.com/123456789']), null);
});

test('generic and unsupported links are rejected', () => {
  assert.ok(validateUrls(['https://youtube.com/']));
  assert.ok(validateUrls(['https://example.com/video']));
  assert.ok(validateUrls(['file:///tmp/video.mp4']));
});

test('TVCF candidates respect source and requested heights', () => {
  assert.deepEqual(tvcfCandidateHeights(2160, 'best'), [2160, 1080, 720]);
  assert.deepEqual(tvcfCandidateHeights(1080, '1080'), [1080, 720]);
  assert.deepEqual(tvcfCandidateHeights(1080, '720'), [720]);
});

test('format selector prefers Premiere codecs when enabled', () => {
  assert.match(formatSelector('1080', true), /vcodec\^=avc1/);
  assert.match(formatSelector('1080', true), /height<=1080/);
  assert.doesNotMatch(formatSelector('best', false), /height<=/);
});

test('URL and filename helpers remove duplicates and unsafe characters', () => {
  assert.deepEqual(uniqueUrls([' https://youtu.be/a ', 'https://youtu.be/a']), ['https://youtu.be/a']);
  assert.equal(safeFileName('a:b/c*?'), 'a_b_c__');
});

test('Premiere compatibility requires MP4 H.264/AAC yuv420', () => {
  const info = { streams: [
    { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
    { codec_type: 'audio', codec_name: 'aac' }
  ] };
  assert.equal(isPremiereCompatible(info, 'sample.mp4'), true);
  assert.equal(isPremiereCompatible(info, 'sample.webm'), false);
});

test('semantic version comparison works', () => {
  assert.equal(isNewerVersion('v2.3.1', '2.3.0'), true);
  assert.equal(isNewerVersion('2.3.0', '2.3.0'), false);
  assert.equal(isNewerVersion('2.2.9', '2.3.0'), false);
});

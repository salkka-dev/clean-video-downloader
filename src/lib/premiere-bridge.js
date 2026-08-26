'use strict';

const fs = require('fs');
const path = require('path');
const { validateUrls } = require('./downloader');

const BRIDGE_DIRECTORY = 'CleanVideoDownloaderBridge';
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const QUALITIES = new Set(['best', '2160', '1080', '720']);

function getBridgeDirectory(appDataPath) {
  return path.join(appDataPath, BRIDGE_DIRECTORY);
}

function getJobFile(appDataPath, jobId) {
  if (!JOB_ID_PATTERN.test(String(jobId || ''))) throw new Error('Premiere 작업 번호가 올바르지 않습니다.');
  return path.join(getBridgeDirectory(appDataPath), `${jobId}.json`);
}

function writeJobStatus(appDataPath, job) {
  const directory = getBridgeDirectory(appDataPath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(getJobFile(appDataPath, job.id), JSON.stringify({
    id: job.id,
    status: job.status,
    progress: Number.isFinite(job.progress) ? Math.round(job.progress) : 0,
    message: String(job.message || ''),
    filePath: job.filePath || null,
    updatedAt: new Date().toISOString()
  }), 'utf8');
}

function parsePremiereProtocol(value) {
  let incoming;
  try { incoming = new URL(value); }
  catch (_) { return null; }
  if (incoming.protocol !== 'cleanvideo:' || incoming.hostname !== 'premiere') return null;

  const id = String(incoming.searchParams.get('job') || '');
  const url = String(incoming.searchParams.get('url') || '').trim();
  const quality = String(incoming.searchParams.get('quality') || '1080');
  if (!JOB_ID_PATTERN.test(id)) throw new Error('Premiere 작업 번호가 올바르지 않습니다.');
  const invalid = validateUrls([url]);
  if (invalid) throw new Error('지원하는 개별 영상 링크가 아닙니다.');
  if (!QUALITIES.has(quality)) throw new Error('화질 설정이 올바르지 않습니다.');
  return { id, url, quality };
}

module.exports = {
  BRIDGE_DIRECTORY,
  JOB_ID_PATTERN,
  QUALITIES,
  getBridgeDirectory,
  getJobFile,
  parsePremiereProtocol,
  writeJobStatus
};

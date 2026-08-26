'use strict';

const ppro = require('premierepro');
const { entrypoints, shell, storage } = require('uxp');
const os = require('os');

const { localFileSystem } = storage;
const SUPPORTED_DOMAINS = ['youtube.com', 'youtu.be', 'vimeo.com', 'instagram.com', 'tvcf.co.kr'];
const MAX_WAIT_MS = 90 * 60 * 1000;

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function normalizeMediaPath(value) {
  let result = String(value || '').trim();
  if (/^file:/i.test(result)) {
    result = result.replace(/^file:\/\/?/i, '');
    try { result = decodeURIComponent(result); } catch (_) {}
  }
  result = result.replace(/\\/g, '/').replace(/^\/([A-Za-z]:\/)/, '$1');
  return os.platform() === 'win32' ? result.toLowerCase() : result;
}

function nativePathToFileUrl(nativePath) {
  const normalized = String(nativePath).replace(/\\/g, '/');
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file:${encodeURI(prefixed).replace(/#/g, '%23')}`;
}

function bridgeDirectory() {
  const home = os.homedir().replace(/[\\/]+$/, '');
  if (os.platform() === 'darwin') return `${home}/Library/Application Support/CleanVideoDownloaderBridge`;
  return `${home}/AppData/Roaming/CleanVideoDownloaderBridge`;
}

function validateVideoUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); }
  catch (_) { throw new Error('올바른 영상 링크를 입력해 주세요.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('http 또는 https 영상 링크만 사용할 수 있습니다.');
  const host = parsed.hostname.toLowerCase();
  if (!SUPPORTED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error('YouTube, Vimeo, Instagram, TVCF 개별 영상 링크를 입력해 주세요.');
  }
  return parsed.href;
}

function createJobId() {
  return `ppro_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

async function readJob(jobId) {
  const nativePath = `${bridgeDirectory()}/${jobId}.json`;
  const file = await localFileSystem.getEntryWithUrl(nativePathToFileUrl(nativePath));
  const content = await file.read();
  return JSON.parse(content);
}

function updateStatus({ title, message, progress = 0, state = '' }) {
  const card = document.getElementById('status-card');
  card.className = `status-card ${state}`.trim();
  document.getElementById('status-title').textContent = title;
  document.getElementById('status-message').textContent = message;
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  document.getElementById('status-percent').textContent = `${percent}%`;
  document.getElementById('progress-bar').style.width = `${percent}%`;
}

async function waitForDownload(jobId) {
  const startedAt = Date.now();
  let lastMessage = '';
  let jobSeen = false;
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    try {
      const job = await readJob(jobId);
      jobSeen = true;
      lastMessage = job.message || lastMessage;
      if (job.status === 'failed') {
        const failure = new Error(job.message || '다운로드에 실패했습니다.');
        failure.cleanVideoJobFailed = true;
        throw failure;
      }
      if (job.status === 'succeeded' && job.filePath) return job.filePath;
      updateStatus({
        title: job.status === 'queued' ? '앱 연결됨' : '다운로드 · 변환 중',
        message: lastMessage || '데스크톱 앱에서 영상을 준비하고 있습니다.',
        progress: job.progress || 0
      });
    } catch (error) {
      if (error && error.cleanVideoJobFailed) throw error;
    }
    if (!jobSeen && Date.now() - startedAt > 20000) {
      throw new Error('클린 영상 다운로더 2.4.0 이상이 설치되어 있는지 확인해 주세요.');
    }
    await wait(700);
  }
  throw new Error('작업 대기 시간이 초과되었습니다. 데스크톱 앱을 확인해 주세요.');
}

async function findClipByPath(rootItem, wantedPath) {
  const queue = [rootItem];
  const target = normalizeMediaPath(wantedPath);
  while (queue.length) {
    const item = queue.shift();
    const clip = ppro.ClipProjectItem.cast(item);
    if (clip) {
      try {
        const mediaPath = await clip.getMediaFilePath();
        if (normalizeMediaPath(mediaPath) === target) return clip;
      } catch (_) {}
      continue;
    }
    const folder = ppro.FolderItem.cast(item);
    if (folder) {
      try { queue.push(...await folder.getItems()); } catch (_) {}
    }
  }
  return null;
}

async function importAndInsert(filePath, options) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error('열려 있는 Premiere 프로젝트가 없습니다.');
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error('활성 시퀀스를 먼저 열어 주세요.');

  const imported = await project.importFiles([filePath], true, undefined, false);
  if (!imported) throw new Error('다운로드한 MP4를 프로젝트로 가져오지 못했습니다.');

  const rootItem = await project.getRootItem();
  let projectItem = null;
  for (let attempt = 0; attempt < 12 && !projectItem; attempt += 1) {
    projectItem = await findClipByPath(rootItem, filePath);
    if (!projectItem) await wait(250);
  }
  if (!projectItem) throw new Error('가져온 MP4를 프로젝트 패널에서 찾지 못했습니다.');

  const videoTrack = Number(options.videoTrack);
  const audioTrack = Number(options.audioTrack);
  try {
    const videoTrackObject = await sequence.getVideoTrack(videoTrack);
    const audioTrackObject = await sequence.getAudioTrack(audioTrack);
    if (!videoTrackObject || !audioTrackObject) throw new Error('track-missing');
  } catch (_) {
    throw new Error('선택한 V/A 트랙이 시퀀스에 없습니다. 트랙 번호를 바꿔 주세요.');
  }

  const insertTime = options.position === 'end'
    ? await sequence.getEndTime()
    : await sequence.getPlayerPosition();
  const editor = ppro.SequenceEditor.getEditor(sequence);
  let success = false;
  project.lockedAccess(() => {
    success = project.executeTransaction(compoundAction => {
      const action = editor.createInsertProjectItemAction(
        projectItem,
        insertTime,
        videoTrack,
        audioTrack,
        true
      );
      compoundAction.addAction(action);
    }, '클린 영상 타임라인 추가');
  });
  if (!success) throw new Error('타임라인에 클립을 추가하지 못했습니다.');
  return true;
}

async function ensurePremiereReady() {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error('Premiere 프로젝트를 먼저 열어 주세요.');
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error('클립을 넣을 시퀀스를 먼저 활성화해 주세요.');
}

async function startWorkflow() {
  const button = document.getElementById('start-button');
  button.disabled = true;
  try {
    await ensurePremiereReady();
    const url = validateVideoUrl(document.getElementById('video-url').value);
    const quality = document.getElementById('quality').value;
    const options = {
      position: document.getElementById('insert-position').value,
      videoTrack: document.getElementById('video-track').value,
      audioTrack: document.getElementById('audio-track').value
    };
    const jobId = createJobId();
    const protocolUrl = `cleanvideo://premiere?job=${encodeURIComponent(jobId)}&quality=${encodeURIComponent(quality)}&url=${encodeURIComponent(url)}`;

    updateStatus({ title: '데스크톱 앱 연결', message: '클린 영상 다운로더를 실행합니다.', progress: 2 });
    const opened = await shell.openExternal(protocolUrl, '영상 다운로드와 Premiere 호환 MP4 변환을 위해 클린 영상 다운로더를 실행합니다.');
    if (opened === false || (typeof opened === 'string' && opened !== '')) {
      throw new Error('클린 영상 다운로더 실행을 허용해 주세요.');
    }

    const filePath = await waitForDownload(jobId);
    updateStatus({ title: 'Premiere로 가져오는 중', message: '프로젝트에 MP4를 가져오고 타임라인에 추가합니다.', progress: 98 });
    await importAndInsert(filePath, options);
    updateStatus({ title: '타임라인 추가 완료', message: filePath, progress: 100, state: 'success' });
  } catch (error) {
    updateStatus({ title: '작업을 완료하지 못했습니다', message: error && error.message ? error.message : String(error), progress: 0, state: 'error' });
  } finally {
    button.disabled = false;
  }
}

function initialize() {
  document.getElementById('start-button').addEventListener('click', startWorkflow);
}

entrypoints.setup({
  panels: {
    cleanVideoDownloaderPanel: {
      show() {},
      hide() {}
    }
  }
});

window.addEventListener('load', initialize);

if (typeof module !== 'undefined') {
  module.exports = {
    bridgeDirectory,
    findClipByPath,
    importAndInsert,
    nativePathToFileUrl,
    normalizeMediaPath,
    validateVideoUrl
  };
}

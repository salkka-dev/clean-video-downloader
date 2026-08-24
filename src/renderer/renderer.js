'use strict';

const $ = selector => document.querySelector(selector);
const urls = $('#urls');
const folder = $('#folder');
const quality = $('#quality');
const browser = $('#browser');
const log = $('#log');
const progress = $('#progress');
const start = $('#start');
const cancel = $('#cancel');
const status = $('#status');
const statusDot = $('#status-dot');
let updateUrl = '';

const browserLabels = {
  none: '사용 안 함',
  chrome: 'Chrome 로그인',
  safari: 'Safari 로그인',
  firefox: 'Firefox 로그인',
  edge: 'Edge 로그인'
};

function currentUrls() {
  return [...new Set(urls.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))];
}

function refreshCount() {
  $('#url-count').textContent = `${currentUrls().length}개`;
}

function addUrl(value) {
  const list = currentUrls();
  if (!list.includes(value)) list.push(value);
  urls.value = list.join('\n');
  refreshCount();
}

function appendLog(text) {
  if (log.dataset.fresh === 'true') { log.textContent = ''; log.dataset.fresh = 'false'; }
  log.textContent += `${text}\n`;
  log.scrollTop = log.scrollHeight;
}

function setBusy(busy) {
  start.disabled = busy;
  cancel.disabled = !busy;
  $('#choose-folder').disabled = busy;
  quality.disabled = busy;
  browser.disabled = busy;
  $('#premiere').disabled = busy;
  $('#subtitles').disabled = busy;
  $('#thumbnail').disabled = busy;
  status.textContent = busy ? '다운로드 작업 중' : '대기 중';
  statusDot.classList.toggle('working', busy);
}

function setTvcfState(active) {
  $('#tvcf-state').textContent = active ? '연결됨 · 다시 로그인' : '로그인';
  $('#tvcf-login').classList.toggle('connected', active);
}

window.cleanDownloader.onAddUrl(addUrl);
window.cleanDownloader.onLog(appendLog);
window.cleanDownloader.onProgress(value => { progress.style.width = `${value}%`; });
window.cleanDownloader.onState(value => {
  setBusy(value === 'working');
  if (value === 'cancelled') appendLog('취소되었습니다.');
});
window.cleanDownloader.onTvcfSession(setTvcfState);
window.cleanDownloader.onUpdate(update => {
  updateUrl = update.url;
  $('#update-version').textContent = `v${update.version}`;
  $('#update-banner').hidden = false;
});

window.cleanDownloader.defaults().then(defaults => {
  folder.value = defaults.folder;
  $('#version-badge').textContent = `v${defaults.version}`;
  const architecture = defaults.arch === 'arm64' ? 'Apple Silicon' : defaults.arch.toUpperCase();
  $('#arch-badge').textContent = `${defaults.platform === 'darwin' ? 'macOS' : 'Windows'} · ${architecture}`;
  defaults.browsers.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = browserLabels[value] || value;
    browser.appendChild(option);
  });
  setTvcfState(defaults.tvcfSession);
});

urls.addEventListener('input', refreshCount);

$('#choose-folder').addEventListener('click', async () => {
  const selected = await window.cleanDownloader.chooseFolder();
  if (selected) folder.value = selected;
});

$('#open-folder').addEventListener('click', async () => {
  try { await window.cleanDownloader.openFolder(folder.value); }
  catch (error) { appendLog(`폴더 열기 오류: ${error.message}`); }
});

$('#tvcf-login').addEventListener('click', () => window.cleanDownloader.loginTvcf());
$('#open-update').addEventListener('click', () => updateUrl && window.cleanDownloader.openUpdate(updateUrl));

quality.addEventListener('change', () => {
  const audioOnly = quality.value === 'audio';
  $('#premiere').disabled = audioOnly;
  if (audioOnly) $('#premiere').checked = false;
});

start.addEventListener('click', async () => {
  const list = currentUrls();
  log.dataset.fresh = 'true';
  progress.style.width = '0%';
  setBusy(true);
  try {
    await window.cleanDownloader.start({
      urls: list,
      folder: folder.value,
      quality: quality.value,
      browser: browser.value,
      premiere: $('#premiere').checked,
      subtitles: $('#subtitles').checked,
      thumbnail: $('#thumbnail').checked
    });
  } catch (error) {
    appendLog(`오류: ${error.message}`);
  } finally {
    setBusy(false);
  }
});

cancel.addEventListener('click', () => window.cleanDownloader.cancel());

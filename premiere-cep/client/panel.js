'use strict';

(function initializePanel() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const https = require('https');
  const cs = new CSInterface();
  const elements = {
    tabs: Array.from(document.querySelectorAll('.tab')),
    panels: Array.from(document.querySelectorAll('.tab-panel')),
    url: document.getElementById('video-url'),
    quality: document.getElementById('quality'),
    browser: document.getElementById('browser-cookies'),
    target: document.getElementById('import-target'),
    position: document.getElementById('insert-position'),
    bin: document.getElementById('bin-name'),
    videoTrack: document.getElementById('video-track'),
    audioTrack: document.getElementById('audio-track'),
    download: document.getElementById('download-button'),
    paste: document.getElementById('paste-button'),
    autoPaste: document.getElementById('auto-paste'),
    stillFormat: document.getElementById('still-format'),
    stillDestination: document.getElementById('still-destination'),
    saveStill: document.getElementById('save-still'),
    copyStill: document.getElementById('copy-still'),
    badge: document.getElementById('engine-badge'),
    status: document.getElementById('status-card'),
    title: document.getElementById('status-title'),
    percent: document.getElementById('status-percent'),
    progress: document.getElementById('progress-bar'),
    message: document.getElementById('status-message')
  };
  let busy = false;
  let autoTimer = null;
  let lastClipboard = '';

  function setStatus(update) {
    const value = Math.max(0, Math.min(100, Number(update.percent) || 0));
    elements.title.textContent = update.title || '처리 중';
    elements.percent.textContent = `${value}%`;
    elements.progress.style.width = `${value}%`;
    elements.message.textContent = update.message || '';
    elements.status.classList.toggle('error', update.stage === 'error');
    elements.status.classList.toggle('success', update.stage === 'success' || update.stage === 'ready');
    if (update.stage === 'ready' || update.stage === 'success') {
      elements.badge.textContent = '단독 실행 준비됨';
      elements.badge.classList.add('ready');
    }
  }

  function setBusy(value) {
    busy = value;
    [elements.download, elements.paste, elements.saveStill, elements.copyStill].forEach(button => { button.disabled = value; });
  }

  function parseHostResult(value) {
    try { return JSON.parse(value); } catch (_) { return { ok: false, message: value || 'Premiere 응답을 읽지 못했습니다.' }; }
  }

  function escapeEval(value) {
    return JSON.stringify(String(value)).replace(/\\u2028/g, '\\u2028').replace(/\\u2029/g, '\\u2029');
  }

  function evalHost(method, value) {
    return new Promise(resolve => cs.evalScript(`$._CVS_.${method}(${escapeEval(value || '')})`, result => resolve(parseHostResult(result))));
  }

  function importOptions(file) {
    return {
      path: file,
      target: elements.target.value,
      position: elements.position.value,
      binName: elements.bin.value.trim() || '00 클린 비디오',
      videoTrack: Number(elements.videoTrack.value),
      audioTrack: Number(elements.audioTrack.value)
    };
  }

  async function importFile(file) {
    if (!fs.existsSync(file)) throw new Error(`파일을 찾지 못했습니다: ${file}`);
    setStatus({ stage: 'import', title: 'Premiere로 가져오는 중', message: path.basename(file), percent: 99 });
    const result = await evalHost('importMedia', JSON.stringify(importOptions(file)));
    if (!result.ok) throw new Error(result.message);
    setStatus({ stage: 'success', title: '가져오기 완료', message: result.message, percent: 100 });
    return result;
  }

  async function downloadAndImport(url) {
    const file = await CleanVideoEngine.download(url, {
      quality: elements.quality.value,
      browser: elements.browser.value
    }, setStatus);
    return importFile(file);
  }

  function extensionFromUrl(url) {
    try { return path.extname(new URL(url).pathname).toLowerCase(); } catch (_) { return ''; }
  }

  function directFileUrl(url) {
    return /\.(?:jpe?g|png|gif|webp|mp4|m4v|mov|webm|mp3|m4a|aac|wav|ogg)(?:$|[?#])/i.test(url);
  }

  function downloadDirectFile(url) {
    const folder = path.join(os.tmpdir(), 'clean-video-studio', 'clipboard');
    fs.mkdirSync(folder, { recursive: true });
    const extension = extensionFromUrl(url) || '.bin';
    const target = path.join(folder, `pasted-${Date.now()}${extension}`);
    function request(value, redirects) {
      return new Promise((resolve, reject) => {
        https.get(value, { headers: { 'User-Agent': 'Clean-Video-Studio/1.0' } }, response => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 8) {
            response.resume();
            request(new URL(response.headers.location, value).toString(), redirects + 1).then(resolve, reject);
            return;
          }
          if (response.statusCode !== 200) { response.resume(); reject(new Error(`파일을 받지 못했습니다. (HTTP ${response.statusCode})`)); return; }
          const output = fs.createWriteStream(target);
          response.pipe(output);
          output.on('finish', () => output.close(() => resolve(target)));
          output.on('error', reject);
        }).on('error', reject);
      });
    }
    return request(url, 0);
  }

  async function handleClipboard(value, silent) {
    if (!value || value.kind === 'empty') {
      if (!silent) throw new Error('클립보드에 가져올 이미지·파일·링크가 없습니다.');
      return;
    }
    if (value.kind === 'files' && value.paths && value.paths.length) {
      for (let i = 0; i < value.paths.length; i += 1) await importFile(value.paths[i]);
      return;
    }
    const text = String(value.value || '').trim();
    if (!text) throw new Error('클립보드의 텍스트가 비어 있습니다.');
    if (/^file:\/\//i.test(text)) {
      const file = decodeURIComponent(text.replace(/^file:\/\//i, '').replace(/^\/(?:([A-Za-z]:))/i, '$1'));
      await importFile(file);
      return;
    }
    if (/^https?:\/\//i.test(text)) {
      if (directFileUrl(text)) await importFile(await downloadDirectFile(text));
      else await downloadAndImport(text);
      return;
    }
    if (fs.existsSync(text)) { await importFile(text); return; }
    throw new Error('파일 경로나 http/https 미디어 링크를 복사해 주세요.');
  }

  async function run(task) {
    if (busy) return;
    setBusy(true);
    try { await task(); }
    catch (error) { setStatus({ stage: 'error', title: '작업을 완료하지 못함', message: error.message || String(error), percent: 0 }); }
    finally { setBusy(false); }
  }

  async function outputFolder() {
    if (elements.stillDestination.value !== 'project') return path.join(os.homedir(), 'Pictures', 'Clean Video Stills');
    const context = await evalHost('getProjectContext', '');
    if (context.ok && context.data && context.data.projectPath) return path.join(path.dirname(context.data.projectPath), 'Clean Video Stills');
    return path.join(os.homedir(), 'Pictures', 'Clean Video Stills');
  }

  async function makeStill(copy) {
    const folder = await outputFolder();
    fs.mkdirSync(folder, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 15);
    const requested = path.join(folder, `Premiere-Still-${stamp}.png`);
    setStatus({ stage: 'still', title: '현재 프레임 추출 중', message: '활성 시퀀스의 재생 헤드 프레임을 내보냅니다.', percent: 60 });
    const result = await evalHost('exportCurrentFrame', requested);
    if (!result.ok || !result.data) throw new Error(result.message || '현재 프레임을 저장하지 못했습니다.');
    let finalPath = result.data;
    if (!copy && elements.stillFormat.value === 'jpg') {
      await CleanVideoEngine.ensureTools(setStatus);
      const jpgPath = finalPath.replace(/\.png$/i, '.jpg');
      finalPath = CleanVideoEngine.convertToJpg(finalPath, jpgPath);
    }
    if (copy) CleanClipboard.copyImage(result.data);
    setStatus({ stage: 'success', title: copy ? '스틸 복사 완료' : '스틸 저장 완료', message: copy ? '클립보드에 PNG 이미지를 복사했습니다.' : finalPath, percent: 100 });
  }

  elements.tabs.forEach(tab => tab.addEventListener('click', () => {
    elements.tabs.forEach(item => item.classList.toggle('active', item === tab));
    elements.panels.forEach(panel => panel.classList.toggle('active', panel.id === `tab-${tab.dataset.tab}`));
  }));
  elements.download.addEventListener('click', () => run(async () => {
    const urls = elements.url.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (!urls.length) throw new Error('영상 링크를 입력해 주세요.');
    for (let i = 0; i < urls.length; i += 1) await downloadAndImport(urls[i]);
  }));
  elements.paste.addEventListener('click', () => run(() => handleClipboard(CleanClipboard.read(), false)));
  elements.saveStill.addEventListener('click', () => run(() => makeStill(false)));
  elements.copyStill.addEventListener('click', () => run(() => makeStill(true)));
  elements.autoPaste.addEventListener('change', () => {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
    if (!elements.autoPaste.checked) return;
    try { lastClipboard = CleanClipboard.fingerprint(CleanClipboard.read()); } catch (_) { lastClipboard = ''; }
    autoTimer = setInterval(() => {
      if (busy || !elements.autoPaste.checked) return;
      try {
        const value = CleanClipboard.read();
        const next = CleanClipboard.fingerprint(value);
        if (next && next !== lastClipboard) {
          lastClipboard = next;
          run(() => handleClipboard(value, true));
        }
      } catch (_) {}
    }, 1600);
  });

  const paths = CleanVideoEngine.toolPaths();
  if (fs.existsSync(paths.ytdlp) && fs.existsSync(paths.ffmpeg)) setStatus({ stage: 'ready', title: '준비됨', message: '플러그인 단독 엔진을 사용할 수 있습니다.', percent: 100 });
  else setStatus({ stage: 'idle', title: '준비됨', message: '첫 다운로드 때 필요한 엔진을 플러그인이 자동으로 준비합니다.', percent: 0 });
})();

'use strict';

(function exposeEngine(global) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const https = require('https');
  const { spawn, spawnSync } = require('child_process');

  const RELEASE_BASE = 'https://github.com/salkka-dev/clean-video-downloader/releases/latest/download/';
  const USER_AGENT = 'Clean-Video-Studio/1.0 (+https://salkka-dev.github.io/clean-video-downloader/)';
  const state = { child: null };

  function platformKey() {
    if (process.platform === 'win32') return 'windows-x64';
    if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
    throw new Error('현재 운영체제에서는 자동 다운로드 엔진을 지원하지 않습니다.');
  }

  function toolPaths() {
    const key = platformKey();
    const directory = path.join(os.homedir(), '.clean-video-studio', 'tools', key);
    return {
      key,
      directory,
      ytdlp: path.join(directory, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
      ffmpeg: path.join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    };
  }

  function existsAndLooksValid(file, minimumBytes) {
    try { return fs.statSync(file).size >= minimumBytes; } catch (_) { return false; }
  }

  function requestText(url, headers, timeout) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, { headers: Object.assign({ 'User-Agent': USER_AGENT }, headers || {}) }, response => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          requestText(new URL(response.headers.location, url).toString(), headers, timeout).then(resolve, reject);
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body }));
      });
      request.setTimeout(timeout || 15_000, () => request.destroy(new Error('TVCF 요청 시간이 초과되었습니다.')));
      request.on('error', reject);
    });
  }

  function safeFileName(value) {
    return String(value || '').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim().replace(/[. ]+$/, '') || 'TVCF';
  }

  function exportTvcfCookies(paths, browser) {
    if (!browser || browser === 'none') return '';
    const cookieFile = path.join(paths.directory, `tvcf-${browser}-cookies.txt`);
    try { if (fs.existsSync(cookieFile)) fs.unlinkSync(cookieFile); } catch (_) {}
    spawnSync(paths.ytdlp, [
      '--cookies-from-browser', browser, '--cookies', cookieFile,
      '--skip-download', '--no-playlist', '--ignore-errors', 'https://tvcf.co.kr/robots.txt'
    ], { windowsHide: true, encoding: 'utf8', timeout: 35_000 });
    try {
      return fs.readFileSync(cookieFile, 'utf8').split(/\r?\n/)
        .filter(line => line && line[0] !== '#')
        .map(line => line.split('\t'))
        .filter(parts => parts.length >= 7 && /(?:^|\.)tvcf\.co\.kr$/i.test(parts[0].replace(/^\./, '')))
        .map(parts => `${parts[5]}=${parts[6]}`)
        .join('; ');
    } catch (_) { return ''; }
  }

  async function resolveTvcf(paths, pageUrl, quality, browser, onStatus) {
    const page = new URL(pageUrl);
    const match = page.pathname.match(/(?:^|\/)play\/([^/?#]+)/i);
    if (!match) throw new Error('TVCF 개별 영상 재생 링크를 입력해 주세요.');
    if (!/^[a-z0-9]+-\d+$/i.test(match[1])) throw new Error('이전 TVCF 숫자형 주소입니다. TVCF에서 영상을 다시 열고 새 /play/영문숫자-번호 주소를 복사해 주세요.');
    if (onStatus) onStatus({ stage: 'download', title: 'TVCF 권한 확인 중', message: '선택한 브라우저의 로그인 범위만 사용합니다.', percent: 3 });
    const cookieHeader = exportTvcfCookies(paths, browser);
    const headers = { Referer: pageUrl };
    if (cookieHeader) headers.Cookie = cookieHeader;
    const endpoint = `https://tvcf.co.kr/api/main/v1/play/nidx/${encodeURIComponent(match[1])}`;
    const response = await requestText(endpoint, headers, 18_000);
    if (response.status === 401 || response.status === 403) throw new Error('TVCF 로그인 또는 해당 영상의 접근 권한을 확인해 주세요.');
    if (response.status !== 200) throw new Error(`TVCF 영상 정보를 불러오지 못했습니다. (HTTP ${response.status})`);
    let json;
    try { json = JSON.parse(response.body); } catch (_) { throw new Error('TVCF 영상 정보 형식을 읽지 못했습니다.'); }
    const item = json && json.data && Array.isArray(json.data.results) ? json.data.results[0] : null;
    if (!item || !item.filename || !item.folder) throw new Error('TVCF 계정에서 접근 가능한 영상 정보를 찾지 못했습니다.');
    const sourceHeight = Number(item.size && item.size.height) || 720;
    const requested = quality === 'best' ? 2160 : Number(quality) || 1080;
    const heights = [2160, 1080, 720].filter(height => height <= sourceHeight && height <= requested);
    let sourceUrl = '';
    for (let index = 0; index < heights.length; index += 1) {
      const candidate = `https://wowza.tvcf.co.kr:1443/vod/_definst_/mp4:${item.folder}/${item.filename}_${heights[index]}p.mp4/playlist.m3u8`;
      try {
        const check = await requestText(candidate, headers, 10_000);
        if (check.status === 200) { sourceUrl = candidate; break; }
      } catch (_) {}
    }
    if (!sourceUrl) throw new Error('TVCF 계정 권한 범위에서 사용 가능한 스트림을 찾지 못했습니다.');
    const brand = Array.isArray(item.brand) && item.brand[0] ? item.brand[0] : 'TVCF';
    return {
      sourceUrl,
      referer: pageUrl,
      cookieHeader,
      outputTemplate: `${safeFileName(`${brand} ${item.chapter || ''}`)} [${safeFileName(match[1])}].%(ext)s`
    };
  }

  function downloadFile(url, destination, onProgress, redirects) {
    const redirectCount = redirects || 0;
    return new Promise((resolve, reject) => {
      const request = https.get(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' } }, response => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          if (redirectCount > 8) return reject(new Error('엔진 다운로드의 리디렉션이 너무 많습니다.'));
          const next = new URL(response.headers.location, url).toString();
          downloadFile(next, destination, onProgress, redirectCount + 1).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`엔진 파일을 받지 못했습니다. (HTTP ${response.statusCode})`));
          return;
        }
        const temporary = `${destination}.download`;
        const output = fs.createWriteStream(temporary);
        const total = Number(response.headers['content-length']) || 0;
        let received = 0;
        response.on('data', chunk => {
          received += chunk.length;
          if (total && onProgress) onProgress(Math.min(99, Math.round((received / total) * 100)));
        });
        response.pipe(output);
        output.on('finish', () => {
          output.close(() => {
            try {
              if (fs.existsSync(destination)) fs.unlinkSync(destination);
              fs.renameSync(temporary, destination);
              if (process.platform !== 'win32') fs.chmodSync(destination, 0o755);
              resolve(destination);
            } catch (error) { reject(error); }
          });
        });
        output.on('error', error => {
          try { fs.unlinkSync(temporary); } catch (_) {}
          reject(error);
        });
      });
      request.setTimeout(45_000, () => request.destroy(new Error('엔진 다운로드 시간이 초과되었습니다.')));
      request.on('error', reject);
    });
  }

  async function ensureTools(onStatus) {
    const paths = toolPaths();
    fs.mkdirSync(paths.directory, { recursive: true });
    const tools = [
      { name: '다운로드 엔진', path: paths.ytdlp, minimum: 1_000_000, asset: `Clean-Video-Engine-${paths.key}-yt-dlp${process.platform === 'win32' ? '.exe' : ''}` },
      { name: '미디어 변환 엔진', path: paths.ffmpeg, minimum: 5_000_000, asset: `Clean-Video-Engine-${paths.key}-ffmpeg${process.platform === 'win32' ? '.exe' : ''}` }
    ];
    for (let index = 0; index < tools.length; index += 1) {
      const tool = tools[index];
      if (existsAndLooksValid(tool.path, tool.minimum)) continue;
      if (onStatus) onStatus({ stage: 'engine', title: `${tool.name} 준비 중`, message: '최초 한 번만 자동으로 받습니다.', percent: index * 50 });
      await downloadFile(RELEASE_BASE + tool.asset, tool.path, value => {
        if (onStatus) onStatus({ stage: 'engine', title: `${tool.name} 준비 중`, message: `${value}% 다운로드`, percent: index * 50 + Math.round(value / 2) });
      });
      if (!existsAndLooksValid(tool.path, tool.minimum)) throw new Error(`${tool.name} 파일이 올바르지 않습니다.`);
    }
    if (onStatus) onStatus({ stage: 'ready', title: '엔진 준비 완료', message: '데스크톱 앱 없이 플러그인에서 바로 처리합니다.', percent: 100 });
    return paths;
  }

  function formatSelector(quality) {
    if (quality === 'audio') return null;
    if (quality === 'best' || quality === '2160') return 'bv*+ba/b';
    return `bv*[height<=${Number(quality) || 1080}]+ba/b[height<=${Number(quality) || 1080}]`;
  }

  function safeOutputFolder() {
    const base = process.platform === 'win32' ? (process.env.USERPROFILE || os.homedir()) : os.homedir();
    const videos = process.platform === 'win32' ? path.join(base, 'Videos') : path.join(base, 'Movies');
    const fallback = fs.existsSync(videos) ? videos : path.join(base, 'Downloads');
    const folder = path.join(fallback, 'Clean Video Studio');
    fs.mkdirSync(folder, { recursive: true });
    return folder;
  }

  function stop() {
    const child = state.child;
    state.child = null;
    if (!child || !child.pid) return;
    if (process.platform === 'win32') {
      try { spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (_) {}
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { try { child.kill('SIGTERM'); } catch (_) {} }
    }
  }

  function runDownload(paths, url, options, onStatus) {
    const output = options.outputFolder || safeOutputFolder();
    fs.mkdirSync(output, { recursive: true });
    const args = [
      '--newline', '--encoding', 'utf-8', '--no-playlist', '--trim-filenames', '180',
      '--ffmpeg-location', paths.ffmpeg, '-P', output,
      '-o', options.outputTemplate || '%(title)s [%(id)s].%(ext)s', '--print', 'after_move:__CVS_FILE__%(filepath)s'
    ];
    if (process.platform === 'win32') args.push('--windows-filenames');
    if (options.quality === 'audio') args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    else args.push('-f', formatSelector(options.quality), '--merge-output-format', 'mp4', '--recode-video', 'mp4');
    if (options.referer) args.push('--referer', options.referer);
    if (options.cookieHeader) args.push('--add-header', `Cookie:${options.cookieHeader}`);
    if (options.browser && options.browser !== 'none' && !options.cookieHeader) args.push('--cookies-from-browser', options.browser);
    args.push('--', url);

    return new Promise((resolve, reject) => {
      const child = spawn(paths.ytdlp, args, {
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      state.child = child;
      let filePath = '';
      let combined = '';
      let tail = '';
      const consume = chunk => {
        tail += chunk.toString('utf8').replace(/\r/g, '\n');
        const lines = tail.split('\n');
        tail = lines.pop() || '';
        lines.forEach(line => {
          const text = line.trim();
          if (!text) return;
          combined = `${combined}\n${text}`.slice(-6000);
          if (text.indexOf('__CVS_FILE__') === 0) filePath = text.slice(12).trim();
          const match = text.match(/\[download\]\s+([0-9.]+)%/);
          if (match && onStatus) onStatus({ stage: 'download', title: '영상 다운로드 중', message: text, percent: Math.min(95, Math.round(Number(match[1]) * 0.95)) });
          else if (onStatus && /Merging formats|Fixing|Post-process|ExtractAudio|VideoConvertor/i.test(text)) onStatus({ stage: 'convert', title: 'Premiere 호환 파일 준비 중', message: text, percent: 97 });
        });
      };
      child.stdout.on('data', consume);
      child.stderr.on('data', consume);
      child.on('error', error => { state.child = null; reject(new Error(`다운로드 엔진을 실행하지 못했습니다: ${error.message}`)); });
      child.on('close', code => {
        state.child = null;
        if (tail) consume(Buffer.from(`${tail}\n`));
        if (code === 0 && filePath && fs.existsSync(filePath)) resolve(filePath);
        else reject(new Error(`영상 다운로드를 완료하지 못했습니다.${combined ? `\n${combined.trim().split('\n').slice(-3).join('\n')}` : ''}`));
      });
    });
  }

  async function download(url, options, onStatus) {
    const value = String(url || '').trim();
    if (!/^https?:\/\//i.test(value)) throw new Error('http 또는 https 영상 링크를 입력해 주세요.');
    const paths = await ensureTools(onStatus);
    if (onStatus) onStatus({ stage: 'download', title: '링크 분석 중', message: value, percent: 2 });
    const resolvedOptions = Object.assign({}, options || {});
    let sourceUrl = value;
    if (/(?:^|\.)tvcf\.co\.kr$/i.test(new URL(value).hostname)) {
      const tvcf = await resolveTvcf(paths, value, resolvedOptions.quality, resolvedOptions.browser, onStatus);
      sourceUrl = tvcf.sourceUrl;
      Object.assign(resolvedOptions, tvcf);
    }
    return runDownload(paths, sourceUrl, resolvedOptions, onStatus);
  }

  function convertToJpg(input, output) {
    const paths = toolPaths();
    const result = spawnSync(paths.ffmpeg, ['-y', '-i', input, '-q:v', '2', output], { windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0 || !fs.existsSync(output)) throw new Error('JPG 변환에 실패했습니다.');
    return output;
  }

  global.CleanVideoEngine = { convertToJpg, download, ensureTools, safeOutputFolder, stop, toolPaths };
})(window);

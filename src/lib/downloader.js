'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { optimizeForPremiere } = require('./premiere');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
const ALLOWED_DOMAINS = ['youtube.com', 'youtu.be', 'vimeo.com', 'instagram.com', 'tiktok.com', 'tvcf.co.kr'];

function isSite(value, domain) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch (_) {
    return false;
  }
}

function validateUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return '영상 링크를 입력해 주세요.';
  for (const raw of urls) {
    let value;
    try { value = new URL(String(raw).trim()); } catch (_) { return raw; }
    if (!['http:', 'https:'].includes(value.protocol)) return raw;
    const host = value.hostname.toLowerCase();
    if (!ALLOWED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) return raw;
    const pathname = value.pathname.toLowerCase();
    let specific = true;
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) specific = pathname.length > 1;
    else if (host === 'youtube.com' || host.endsWith('.youtube.com')) specific = value.searchParams.has('v') || /^\/(shorts|live|embed)\//.test(pathname);
    else if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) specific = pathname.split('/').some(part => /^\d+$/.test(part));
    else if (host === 'instagram.com' || host.endsWith('.instagram.com')) specific = /^\/(p|reel|tv)\//.test(pathname);
    else if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      specific = /^(?:\/@[^/]+\/video\/\d+|\/(?:t|share\/video)\/[^/]+)/.test(pathname)
        || (/^(?:vm|vt)\.tiktok\.com$/.test(host) && pathname.length > 1);
    }
    else if (host === 'tvcf.co.kr' || host.endsWith('.tvcf.co.kr')) specific = /^\/(?:[a-z]{2}\/)?play\/[a-z0-9]+-\d+/i.test(pathname);
    if (!specific) return raw;
  }
  return null;
}

function uniqueUrls(urls) {
  return [...new Set(urls.map(value => String(value).trim()).filter(Boolean))];
}

function resolveVimeoSource(pageUrl) {
  const url = new URL(pageUrl);
  if (url.hostname.toLowerCase() === 'player.vimeo.com') return pageUrl;
  const parts = url.pathname.split('/').filter(Boolean);
  let index = -1;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (/^\d+$/.test(parts[i])) { index = i; break; }
  }
  if (index < 0) throw new Error('Vimeo 개별 영상 번호를 찾지 못했습니다.');
  const hash = parts[index + 1] && /^[A-Za-z0-9]+$/.test(parts[index + 1]) ? parts[index + 1] : url.searchParams.get('h');
  return `https://player.vimeo.com/video/${parts[index]}${hash ? `?h=${encodeURIComponent(hash)}` : ''}`;
}

function safeFileName(value) {
  return String(value || '').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').replace(/%/g, '％').trim().replace(/[. ]+$/, '');
}

async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function tvcfCandidateHeights(sourceHeight, quality) {
  const height = Number(sourceHeight) || 720;
  const requested = quality === 'best' ? 2160 : Number(quality) || 720;
  return [2160, 1080, 720].filter(candidate => candidate <= height && candidate <= requested);
}

async function resolveTvcfSource(pageUrl, quality, cookieHeader = '') {
  const page = new URL(pageUrl);
  const match = page.pathname.match(/(?:^|\/)play\/([^/?#]+)/i);
  if (!match) throw new Error('TVCF 개별 영상 재생 주소가 아닙니다.');
  const playKey = match[1];
  if (!/^[a-z0-9]+-\d+$/i.test(playKey)) throw new Error('이전 TVCF 숫자형 주소입니다. TVCF에서 영상을 다시 열고 새 /play/영문숫자-번호 주소를 복사해 주세요.');
  const endpoint = `https://tvcf.co.kr/api/main/v1/play/nidx/${encodeURIComponent(playKey)}`;
  const headers = { 'User-Agent': USER_AGENT, Referer: pageUrl };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const response = await fetchWithTimeout(endpoint, { headers });
  if (response.status === 401 || response.status === 403) throw new Error('TVCF 계정 권한을 확인해 주세요. 앱에서 TVCF 로그인 후 다시 시도할 수 있습니다.');
  if (!response.ok) throw new Error(`TVCF 영상 정보를 불러오지 못했습니다. (${response.status})`);
  const json = await response.json();
  const item = json && json.data && Array.isArray(json.data.results) ? json.data.results[0] : null;
  if (!item || !item.filename || !item.folder) throw new Error('TVCF 계정에서 접근 가능한 영상 정보를 찾지 못했습니다.');
  const heights = tvcfCandidateHeights(item.size && item.size.height, quality);
  let selected = null;
  for (const height of heights) {
    const candidate = `https://wowza.tvcf.co.kr:1443/vod/_definst_/mp4:${item.folder}/${item.filename}_${height}p.mp4/playlist.m3u8`;
    try {
      const check = await fetchWithTimeout(candidate, { headers });
      if (check.ok) { selected = candidate; break; }
    } catch (_) {}
  }
  if (!selected) throw new Error('TVCF 계정 권한 범위에서 사용할 수 있는 영상 스트림을 찾지 못했습니다.');
  const brand = Array.isArray(item.brand) && item.brand[0] ? item.brand[0] : 'TVCF';
  const title = safeFileName(`${brand} ${item.chapter || ''}`) || 'TVCF';
  return { sourceUrl: selected, outputTemplate: `${title} [${safeFileName(playKey)}].%(ext)s` };
}

function formatSelector(quality, preferPremiere) {
  const cap = quality === 'best' || quality === '2160' ? '' : `[height<=${quality}]`;
  if (preferPremiere) return `bv*[vcodec^=avc1]${cap}+ba[acodec^=mp4a]/b[ext=mp4]${cap}/bv*${cap}+ba/b${cap}`;
  return `bv*${cap}+ba/b${cap}`;
}

class Downloader {
  constructor({ toolsDir, onLog, onProgress, onState }) {
    this.toolsDir = toolsDir;
    this.onLog = onLog || (() => {});
    this.onProgress = onProgress || (() => {});
    this.onState = onState || (() => {});
    this.child = null;
    this.running = false;
    this.cancelled = false;
  }

  log(text) { this.onLog(String(text)); }

  cancel() {
    this.cancelled = true;
    if (!this.child || !this.child.pid) return;
    if (process.platform === 'win32') {
      try { spawnSync('taskkill.exe', ['/pid', String(this.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (_) {}
      return;
    }
    try { process.kill(-this.child.pid, 'SIGTERM'); }
    catch (_) { try { this.child.kill('SIGTERM'); } catch (_) {} }
    setTimeout(() => {
      if (!this.child || !this.child.pid) return;
      try { process.kill(-this.child.pid, 'SIGKILL'); }
      catch (_) { try { this.child.kill('SIGKILL'); } catch (_) {} }
    }, 1800).unref();
  }

  async runAll(urls, outputFolder, options) {
    this.running = true;
    this.cancelled = false;
    this.onState('working');
    const files = [];
    try {
      for (const url of uniqueUrls(urls)) {
        if (this.cancelled) throw new Error('다운로드가 취소되었습니다.');
        this.onProgress(0);
        this.log(`\n▶ ${url}`);
        try {
          const result = await this.runOne(url, outputFolder, options);
          if (result.code !== 0) throw new Error('다운로드 도구가 작업을 완료하지 못했습니다.');
          let finalPath = result.filePath;
          if (options.premiere && options.quality !== 'audio' && finalPath) {
            this.log('Premiere 호환 H.264/AAC MP4를 준비합니다.');
            finalPath = await optimizeForPremiere({
              inputPath: finalPath,
              toolsDir: this.toolsDir,
              onLog: text => this.log(text),
              setChild: child => { this.child = child; }
            });
          }
          if (finalPath) files.push(finalPath);
          this.onProgress(100);
          this.log('완료!');
        } catch (error) {
          if (this.cancelled) throw new Error('다운로드가 취소되었습니다.');
          this.log(`오류: ${error.message}`);
        }
      }
      return files;
    } finally {
      this.child = null;
      this.running = false;
      this.onState(this.cancelled ? 'cancelled' : 'idle');
    }
  }

  async runOne(url, outputFolder, options) {
    const outputTemplate = '%(title)s [%(id)s].%(ext)s';
    if (isSite(url, 'vimeo.com')) {
      const sourceUrl = resolveVimeoSource(url);
      const isPlayer = new URL(url).hostname.toLowerCase() === 'player.vimeo.com';
      if (options.browser !== 'none' && !isPlayer) {
        this.log('Vimeo: 로그인 계정의 원본 다운로드 권한을 확인합니다.');
        const original = await this.execute(url, url, outputFolder, outputTemplate, options, true, true);
        if (original.code === 0) return original;
        if (this.cancelled) return original;
      }
      return this.execute(sourceUrl, url, outputFolder, outputTemplate, options, true, false);
    }

    let sourceUrl = url;
    let template = outputTemplate;
    if (isSite(url, 'tvcf.co.kr')) {
      this.log(options.tvcfCookieHeader ? 'TVCF 로그인 세션으로 접근 권한을 확인합니다.' : 'TVCF 공개 접근 권한을 확인합니다.');
      const result = await resolveTvcfSource(url, options.quality, options.tvcfCookieHeader);
      sourceUrl = result.sourceUrl;
      template = result.outputTemplate;
    }
    return this.execute(sourceUrl, url, outputFolder, template, options, false, false);
  }

  execute(sourceUrl, refererUrl, outputFolder, outputTemplate, options, vimeo, forceOriginal) {
    const args = [
      '--newline', '--encoding', 'utf-8', '--no-playlist', '--trim-filenames', '180',
      '--ffmpeg-location', this.toolsDir, '-P', outputFolder, '-o', outputTemplate,
      '--print', 'after_move:__CVD_FILE__%(filepath)s'
    ];
    if (process.platform === 'win32') args.push('--windows-filenames');
    if (vimeo) {
      args.push('--referer', refererUrl, '--user-agent', USER_AGENT);
      if (forceOriginal) args.push('--extractor-args', 'vimeo:original_format_policy=always');
    } else if (isSite(refererUrl, 'tvcf.co.kr')) {
      args.push('--referer', refererUrl, '--user-agent', USER_AGENT);
      if (options.tvcfCookieHeader) args.push('--add-header', `Cookie:${options.tvcfCookieHeader}`);
    }

    if (options.quality === 'audio') args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    else args.push('-f', formatSelector(options.quality, options.premiere), '--merge-output-format', 'mp4');
    if (options.subtitles) args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'ko.*,en.*', '--convert-subs', 'srt');
    if (options.thumbnail) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
    if (options.browser !== 'none' && !isSite(refererUrl, 'tvcf.co.kr')) args.push('--cookies-from-browser', options.browser);
    args.push('--', sourceUrl);

    return new Promise((resolve, reject) => {
      const executable = path.join(this.toolsDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
      const child = spawn(executable, args, {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.child = child;
      let settled = false;
      let filePath = '';
      const buffers = { stdout: '', stderr: '' };
      const handleLine = line => {
        const text = line.trimEnd();
        if (!text) return;
        if (text.startsWith('__CVD_FILE__')) {
          filePath = text.slice('__CVD_FILE__'.length).trim();
          return;
        }
        this.log(text);
        const matches = [...text.matchAll(/\[download\]\s+([0-9.]+)%/g)];
        if (matches.length) this.onProgress(Math.max(0, Math.min(96, Number(matches[matches.length - 1][1]) * 0.96)));
      };
      const handleChunk = (kind, chunk) => {
        buffers[kind] += chunk.toString('utf8').replace(/\r/g, '\n');
        const lines = buffers[kind].split('\n');
        buffers[kind] = lines.pop() || '';
        lines.forEach(handleLine);
      };
      child.stdout.on('data', chunk => handleChunk('stdout', chunk));
      child.stderr.on('data', chunk => handleChunk('stderr', chunk));
      child.on('error', error => {
        if (settled) return;
        settled = true;
        this.child = null;
        reject(new Error(`다운로드 도구를 실행하지 못했습니다: ${error.message}`));
      });
      child.on('close', code => {
        if (settled) return;
        settled = true;
        if (buffers.stdout) handleLine(buffers.stdout);
        if (buffers.stderr) handleLine(buffers.stderr);
        this.child = null;
        resolve({ code: typeof code === 'number' ? code : 1, filePath });
      });
    });
  }
}

module.exports = {
  ALLOWED_DOMAINS,
  Downloader,
  formatSelector,
  isSite,
  resolveTvcfSource,
  resolveVimeoSource,
  safeFileName,
  tvcfCandidateHeights,
  uniqueUrls,
  validateUrls
};

'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const { spawnSync } = require('child_process');
const { Downloader, validateUrls } = require('./lib/downloader');
const { startExtensionBridge } = require('./lib/extension-bridge');
const { parsePremiereProtocol, writeJobStatus } = require('./lib/premiere-bridge');
const { checkForUpdate } = require('./lib/update');

let mainWindow = null;
let loginWindow = null;
let downloader = null;
let bridgeServer = null;
let rendererReady = false;
let latestUpdate = null;
const pendingUrls = [];
const pendingPremiereJobs = [];
let backgroundLaunch = false;

function send(channel, value) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
}

function queueUrl(url) {
  const invalid = validateUrls([url]);
  if (invalid) return;
  if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    send('url:add', url);
    return;
  }
  if (!pendingUrls.includes(url)) pendingUrls.push(url);
}

function handleProtocolUrl(value) {
  try {
    const incoming = new URL(value);
    if (incoming.protocol !== 'cleanvideo:') return;
    if (incoming.hostname === 'premiere') {
      const job = parsePremiereProtocol(value);
      backgroundLaunch = true;
      if (app.isReady()) startPremiereJob(job);
      else pendingPremiereJobs.push(job);
      return 'premiere';
    }
    const url = incoming.searchParams.get('url');
    if (url) queueUrl(url);
    return 'queue';
  } catch (_) {}
}

function toolsDirectory() {
  return app.isPackaged ? path.join(process.resourcesPath, 'tools') : path.join(__dirname, '..', 'vendor', 'current');
}

function prepareTools(directory) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  for (const name of ['yt-dlp', 'ffmpeg', 'ffprobe']) {
    const file = path.join(directory, `${name}${suffix}`);
    if (!fs.existsSync(file)) throw new Error(`필수 도구가 없습니다: ${name}`);
    if (process.platform !== 'win32') {
      try { fs.chmodSync(file, 0o755); } catch (_) {}
    }
    if (process.platform === 'darwin') {
      try { spawnSync('/usr/bin/xattr', ['-d', 'com.apple.quarantine', file], { stdio: 'ignore' }); } catch (_) {}
    }
  }
}

function createWindow({ showOnReady = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 1020,
    height: 840,
    minWidth: 860,
    minHeight: 720,
    backgroundColor: '#08111f',
    title: '클린 영상 다운로더',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.once('did-finish-load', () => {
    rendererReady = true;
    pendingUrls.splice(0).forEach(url => send('url:add', url));
    if (latestUpdate) send('update:available', latestUpdate);
  });
  mainWindow.once('ready-to-show', () => { if (showOnReady) mainWindow.show(); });
  mainWindow.on('closed', () => {
    if (downloader) downloader.cancel();
    rendererReady = false;
    mainWindow = null;
  });
}

function browserChoices() {
  if (process.platform === 'darwin') return ['none', 'chrome', 'safari', 'firefox', 'edge'];
  return ['none', 'chrome', 'edge', 'firefox'];
}

async function tvcfCookieHeader() {
  const cookies = await session.fromPartition('persist:tvcf').cookies.get({});
  return cookies
    .filter(cookie => /(^|\.)tvcf\.co\.kr$/i.test(cookie.domain || ''))
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function updatePremiereJob(job, patch) {
  Object.assign(job, patch);
  writeJobStatus(app.getPath('appData'), job);
}

function startPremiereJob(job) {
  if (!job) return;
  if (downloader && downloader.running) {
    updatePremiereJob(job, {
      status: 'failed',
      progress: 0,
      message: '다른 다운로드가 진행 중입니다. 잠시 후 다시 시도해 주세요.'
    });
    return;
  }

  const folder = path.join(app.getPath('videos'), 'Clean Video Downloader', 'Premiere');
  updatePremiereJob(job, { status: 'queued', progress: 0, message: '데스크톱 앱에 연결했습니다.' });
  setImmediate(async () => {
    if (downloader && downloader.running) {
      updatePremiereJob(job, {
        status: 'failed',
        progress: 0,
        message: '다른 다운로드가 진행 중입니다. 잠시 후 다시 시도해 주세요.'
      });
      return;
    }

    try {
      const directory = toolsDirectory();
      prepareTools(directory);
      fs.mkdirSync(folder, { recursive: true });
      downloader = new Downloader({
        toolsDir: directory,
        onLog: text => updatePremiereJob(job, { message: String(text).trim().slice(-500) || '처리 중입니다.' }),
        onProgress: progress => updatePremiereJob(job, { status: 'working', progress }),
        onState: state => {
          if (state === 'working') updatePremiereJob(job, { status: 'working', message: '영상을 다운로드하고 있습니다.' });
        }
      });
      const files = await downloader.runAll([job.url], folder, {
        quality: job.quality,
        browser: 'none',
        premiere: true,
        subtitles: false,
        thumbnail: false,
        tvcfCookieHeader: await tvcfCookieHeader()
      });
      if (!files.length) throw new Error('영상 파일을 만들지 못했습니다. 데스크톱 앱에서 링크 권한과 로그를 확인해 주세요.');
      updatePremiereJob(job, {
        status: 'succeeded',
        progress: 100,
        message: 'Premiere 호환 MP4 준비가 끝났습니다.',
        filePath: files[0]
      });
    } catch (error) {
      updatePremiereJob(job, {
        status: 'failed',
        message: error && error.message ? error.message : '다운로드 작업에 실패했습니다.'
      });
    } finally {
      downloader = null;
    }
  });
}

async function openTvcfLogin() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }
  loginWindow = new BrowserWindow({
    width: 560,
    height: 760,
    title: 'TVCF 로그인',
    parent: mainWindow || undefined,
    modal: false,
    webPreferences: {
      session: session.fromPartition('persist:tvcf'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^https:\/\//i.test(url)) return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 560,
        height: 760,
        parent: loginWindow,
        webPreferences: { session: session.fromPartition('persist:tvcf'), contextIsolation: true, nodeIntegration: false, sandbox: true }
      }
    };
  });
  await loginWindow.loadURL('https://sso.tvcf.co.kr/?suburl=me%2Fmain');
  loginWindow.on('closed', async () => {
    loginWindow = null;
    send('tvcf:session', Boolean(await tvcfCookieHeader()));
  });
}

ipcMain.handle('app:defaults', async () => ({
  folder: app.getPath('videos'),
  arch: process.arch,
  platform: process.platform,
  version: app.getVersion(),
  browsers: browserChoices(),
  tvcfSession: Boolean(await tvcfCookieHeader())
}));

ipcMain.handle('folder:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '저장 폴더 선택',
    defaultPath: app.getPath('videos'),
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('folder:open', async (_event, folder) => {
  if (typeof folder !== 'string' || !folder) throw new Error('저장 폴더가 올바르지 않습니다.');
  fs.mkdirSync(folder, { recursive: true });
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
  return true;
});

ipcMain.handle('tvcf:login', openTvcfLogin);

ipcMain.handle('update:open', async (_event, url) => {
  if (typeof url === 'string' && /^https:\/\/github\.com\/salkka-dev\/clean-video-downloader\/releases\//.test(url)) {
    await shell.openExternal(url);
  }
  return true;
});

ipcMain.handle('download:start', async (_event, payload) => {
  if (downloader && downloader.running) throw new Error('이미 다운로드 작업이 진행 중입니다.');
  const urls = Array.isArray(payload && payload.urls) ? payload.urls : [];
  const folder = payload && payload.folder;
  const quality = payload && payload.quality;
  const browser = payload && payload.browser;
  const invalid = validateUrls(urls);
  if (invalid) throw new Error(`지원하는 개별 영상 링크가 아닙니다: ${invalid}`);
  if (typeof folder !== 'string' || !folder) throw new Error('저장 폴더를 선택해 주세요.');
  if (!['best', '2160', '1080', '720', 'audio'].includes(quality)) throw new Error('화질 설정이 올바르지 않습니다.');
  if (!browserChoices().includes(browser)) throw new Error('로그인 브라우저 설정이 올바르지 않습니다.');

  const directory = toolsDirectory();
  prepareTools(directory);
  fs.mkdirSync(folder, { recursive: true });
  downloader = new Downloader({
    toolsDir: directory,
    onLog: text => send('download:log', text),
    onProgress: value => send('download:progress', value),
    onState: value => send('download:state', value)
  });
  try {
    const files = await downloader.runAll(urls, folder, {
      quality,
      browser,
      premiere: payload.premiere !== false,
      subtitles: payload.subtitles === true,
      thumbnail: payload.thumbnail === true,
      tvcfCookieHeader: await tvcfCookieHeader()
    });
    return { ok: true, files };
  } finally {
    downloader = null;
  }
});

ipcMain.handle('download:cancel', () => {
  if (downloader) downloader.cancel();
  return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const modes = argv.filter(value => /^cleanvideo:/i.test(value)).map(handleProtocolUrl);
    if (mainWindow && !modes.includes('premiere')) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.whenReady().then(async () => {
    if (app.isPackaged) app.setAsDefaultProtocolClient('cleanvideo');
    const startupUrls = process.argv.filter(value => /^cleanvideo:/i.test(value));
    backgroundLaunch = backgroundLaunch || startupUrls.some(value => {
      try { return new URL(value).hostname === 'premiere'; } catch (_) { return false; }
    });
    startupUrls.forEach(handleProtocolUrl);
    createWindow({ showOnReady: !backgroundLaunch });
    pendingPremiereJobs.splice(0).forEach(startPremiereJob);
    bridgeServer = startExtensionBridge(queueUrl);
    latestUpdate = await checkForUpdate(app.getVersion());
    if (latestUpdate && rendererReady) send('update:available', latestUpdate);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });
  });
}

app.on('before-quit', () => {
  if (downloader) downloader.cancel();
  if (bridgeServer) bridgeServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

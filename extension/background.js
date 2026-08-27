'use strict';

importScripts('media-utils.js');

const MENU_ID = 'clean-media-download';
const COPY_FRAME_MENU_ID = 'clean-frame-copy';
const SAVE_FRAME_MENU_ID = 'clean-frame-save';

function setReadyBadge() {
  chrome.action.setBadgeBackgroundColor({ color: '#2f65ed' });
  chrome.action.setBadgeText({ text: 'ON' });
}

async function notify(message) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title: '클린 영상 다운로더',
    message
  });
}

function installMenu() {
  setReadyBadge();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '클린 영상 다운로더로 저장',
      contexts: ['video', 'audio', 'link', 'page']
    });
    chrome.contextMenus.create({
      id: COPY_FRAME_MENU_ID,
      title: '현재 영상 프레임 복사',
      contexts: ['video', 'page']
    });
    chrome.contextMenus.create({
      id: SAVE_FRAME_MENU_ID,
      title: '현재 영상 프레임 PNG 저장',
      contexts: ['video', 'page']
    });
  });
}

chrome.runtime.onInstalled.addListener(installMenu);
chrome.runtime.onStartup.addListener(installMenu);

async function inspectMediaOnPage(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const media = [...document.querySelectorAll('video, audio')]
        .map((element) => ({
          url: element.currentSrc || element.src || element.querySelector('source[src]')?.src || '',
          kind: element.tagName.toLowerCase(),
          score: (element.videoWidth || 1) * (element.videoHeight || 1) + (element.paused ? 0 : 1_000_000_000)
        }))
        .filter((item) => item.url)
        .sort((a, b) => b.score - a.score);

      const directLink = [...document.querySelectorAll('a[href]')]
        .map((anchor) => anchor.href)
        .find((href) => /\.(?:mp4|m4v|mov|webm|mp3|m4a|aac|wav|ogg|ogv)(?:$|[?#])/i.test(href));

      const selected = media[0] || (directLink ? { url: directLink, kind: 'media' } : null);
      return selected ? { ...selected, title: document.title || 'media' } : null;
    }
  });
  return results[0]?.result || null;
}

async function inspectYouTubeOnPage(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      let response = null;
      try {
        response = document.getElementById('movie_player')?.getPlayerResponse?.() || window.ytInitialPlayerResponse || null;
        if (typeof response === 'string') response = JSON.parse(response);
      } catch (_) {
        response = null;
      }
      const formats = response?.streamingData?.formats || [];
      const playable = formats
        .filter(item => item?.url && /^video\/mp4/i.test(item.mimeType || '') && item.audioQuality)
        .sort((a, b) => (Number(b.height) - Number(a.height)) || (Number(b.bitrate) - Number(a.bitrate)));
      const selected = playable[0];
      if (!selected) return null;
      return {
        url: selected.url,
        kind: 'video',
        title: response?.videoDetails?.title || document.title.replace(/\s*-\s*YouTube\s*$/i, '') || 'YouTube video',
        extension: 'mp4',
        qualityLabel: selected.qualityLabel || ''
      };
    }
  });
  return results[0]?.result || null;
}

async function downloadBlobInPage(tabId, url, suggestedName) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [url, suggestedName],
    func: async (blobUrl, filename) => {
      try {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        if (!blob.size) return { ok: false };
        const temporaryUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = temporaryUrl;
        anchor.download = filename || 'media';
        anchor.style.display = 'none';
        document.documentElement.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(temporaryUrl), 30_000);
        return { ok: true };
      } catch (_) {
        return { ok: false };
      }
    }
  });
  return Boolean(results[0]?.result?.ok);
}

async function finish(result, notifyUser) {
  if (notifyUser) await notify(result.message);
  return result;
}

async function inspectVisibleVideo(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const videos = [...document.querySelectorAll('video')]
        .map(video => {
          const rect = video.getBoundingClientRect();
          const left = Math.max(0, rect.left);
          const top = Math.max(0, rect.top);
          const right = Math.min(innerWidth, rect.right);
          const bottom = Math.min(innerHeight, rect.bottom);
          return {
            left,
            top,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
            score: Math.max(0, right - left) * Math.max(0, bottom - top) + (video.paused ? 0 : 1_000_000_000),
            title: document.title || 'video-frame'
          };
        })
        .filter(item => item.width >= 80 && item.height >= 45)
        .sort((a, b) => b.score - a.score);
      return videos[0] ? { ...videos[0], viewportWidth: innerWidth, viewportHeight: innerHeight } : null;
    }
  });
  return results[0]?.result || null;
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

async function captureVideoFrame(tab) {
  if (!tab?.id) throw new Error('현재 탭을 확인할 수 없습니다.');
  const rect = await inspectVisibleVideo(tab.id);
  if (!rect) throw new Error('화면에 보이는 영상을 찾지 못했습니다. 영상을 재생한 뒤 다시 시도해 주세요.');
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const sourceBlob = await (await fetch(screenshot)).blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const scaleX = bitmap.width / rect.viewportWidth;
  const scaleY = bitmap.height / rect.viewportHeight;
  const sourceX = Math.max(0, Math.round(rect.left * scaleX));
  const sourceY = Math.max(0, Math.round(rect.top * scaleY));
  const width = Math.min(bitmap.width - sourceX, Math.max(1, Math.round(rect.width * scaleX)));
  const height = Math.min(bitmap.height - sourceY, Math.max(1, Math.round(rect.height * scaleY)));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').drawImage(bitmap, sourceX, sourceY, width, height, 0, 0, width, height);
  bitmap.close();
  const dataUrl = await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
  return { dataUrl, title: rect.title };
}

async function saveCurrentFrame(tab, notifyUser = false) {
  try {
    const frame = await captureVideoFrame(tab);
    await chrome.downloads.download({
      url: frame.dataUrl,
      filename: `${CleanMedia.safeBaseName(frame.title)} - frame.png`,
      saveAs: true,
      conflictAction: 'uniquify'
    });
    return finish({ ok: true, message: '현재 영상 프레임을 PNG로 저장합니다.' }, notifyUser);
  } catch (error) { return finish({ ok: false, message: error.message || '현재 프레임을 저장하지 못했습니다.' }, notifyUser); }
}

async function copyCurrentFrame(tab, notifyUser = false) {
  try {
    const frame = await captureVideoFrame(tab);
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [frame.dataUrl],
      func: async dataUrl => {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          return { ok: true };
        } catch (error) { return { ok: false, message: error?.message || String(error) }; }
      }
    });
    if (!result[0]?.result?.ok) throw new Error('Chrome이 이미지 클립보드 권한을 허용하지 않았습니다. PNG 저장을 사용해 주세요.');
    return finish({ ok: true, message: '현재 영상 프레임을 이미지로 복사했습니다.' }, notifyUser);
  } catch (error) { return finish({ ok: false, message: error.message || '현재 프레임을 복사하지 못했습니다.' }, notifyUser); }
}

async function downloadCandidate(candidate, tab, notifyUser = false) {
  const filename = CleanMedia.suggestFilename(candidate.title, candidate.url, candidate.kind, candidate.extension);
  if (CleanMedia.isBlobUrl(candidate.url)) {
    const started = await downloadBlobInPage(tab.id, candidate.url, filename);
    return finish(started
      ? { ok: true, message: 'Chrome 다운로드를 시작했습니다.' }
      : { ok: false, message: '분할 스트리밍 또는 보호된 미디어라 브라우저 단독 저장을 지원하지 않습니다.' }, notifyUser);
  }

  if (!CleanMedia.isDownloadableUrl(candidate.url)) {
    return finish({ ok: false, message: '직접 저장할 수 있는 미디어 주소가 아닙니다.' }, notifyUser);
  }

  try {
    await chrome.downloads.download({
      url: candidate.url,
      filename: filename || undefined,
      saveAs: true,
      conflictAction: 'uniquify'
    });
    const quality = candidate.qualityLabel ? ` (${candidate.qualityLabel})` : '';
    return finish({ ok: true, message: `Chrome 다운로드를 시작했습니다${quality}.` }, notifyUser);
  } catch (_) {
    return finish({ ok: false, message: '다운로드를 시작하지 못했습니다. 다른 미디어를 선택해 주세요.' }, notifyUser);
  }
}

async function saveMedia(info, tab, notifyUser = false) {
  if (!tab?.id) {
    return finish({ ok: false, message: '현재 탭을 확인할 수 없습니다.' }, notifyUser);
  }

  let candidate = null;
  if (info?.srcUrl) {
    candidate = { url: info.srcUrl, kind: info.mediaType || 'media', title: tab.title || 'media' };
  } else if (info?.linkUrl && CleanMedia.looksLikeMediaUrl(info.linkUrl)) {
    candidate = { url: info.linkUrl, kind: 'media', title: tab.title || 'media' };
  } else {
    if (/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(tab.url || '')) {
      candidate = await inspectYouTubeOnPage(tab.id);
    }
    if (!candidate) candidate = await inspectMediaOnPage(tab.id);
  }

  if (!candidate?.url) {
    return finish({ ok: false, message: '저장 가능한 단일 미디어를 찾지 못했습니다. 영상을 재생한 뒤 다시 시도해 주세요.' }, notifyUser);
  }
  return downloadCandidate(candidate, tab, notifyUser);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) saveMedia(info, tab, true);
  if (info.menuItemId === COPY_FRAME_MENU_ID) copyCurrentFrame(tab, true);
  if (info.menuItemId === SAVE_FRAME_MENU_ID) saveCurrentFrame(tab, true);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let operation;
  if (message?.type === 'download-current') {
    operation = saveMedia({}, { id: message.tabId, title: message.tabTitle, url: message.tabUrl });
  } else if (message?.type === 'download-url') {
    const url = String(message.url || '').trim();
    if (!CleanMedia.looksLikeMediaUrl(url) || !CleanMedia.isDownloadableUrl(url)) {
      operation = Promise.resolve({ ok: false, message: 'MP4·WebM·MP3 같은 직접 미디어 주소를 입력해 주세요.' });
    } else {
      operation = downloadCandidate({ url, kind: 'media', title: message.title || 'media' }, { id: message.tabId });
    }
  } else if (message?.type === 'copy-current-frame') {
    operation = copyCurrentFrame({ id: message.tabId, windowId: message.windowId });
  } else if (message?.type === 'save-current-frame') {
    operation = saveCurrentFrame({ id: message.tabId, windowId: message.windowId });
  } else {
    return false;
  }
  operation.then(sendResponse).catch(error => sendResponse({ ok: false, message: error?.message || '작업을 완료하지 못했습니다.' }));
  return true;
});

setReadyBadge();

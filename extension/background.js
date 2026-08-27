'use strict';

importScripts('media-utils.js');

const MENU_ID = 'clean-media-download';

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
  } else {
    return false;
  }
  operation.then(sendResponse).catch(error => sendResponse({ ok: false, message: error?.message || '작업을 완료하지 못했습니다.' }));
  return true;
});

setReadyBadge();

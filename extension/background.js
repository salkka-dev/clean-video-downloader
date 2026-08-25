'use strict';

importScripts('media-utils.js');

const MENU_ID = 'clean-media-download';

async function notify(message) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title: '클린 영상 다운로더',
    message
  });
}

function installMenu() {
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

async function saveMedia(info, tab) {
  if (!tab?.id) {
    await notify('현재 탭을 확인할 수 없습니다.');
    return;
  }

  let candidate = null;
  if (info?.srcUrl) {
    candidate = { url: info.srcUrl, kind: info.mediaType || 'media', title: tab.title || 'media' };
  } else if (info?.linkUrl && CleanMedia.looksLikeMediaUrl(info.linkUrl)) {
    candidate = { url: info.linkUrl, kind: 'media', title: tab.title || 'media' };
  } else {
    candidate = await inspectMediaOnPage(tab.id);
  }

  if (!candidate?.url) {
    await notify('이 페이지에서 직접 저장할 미디어 파일을 찾지 못했습니다.');
    return;
  }

  const filename = CleanMedia.suggestFilename(candidate.title, candidate.url, candidate.kind);
  if (CleanMedia.isBlobUrl(candidate.url)) {
    const started = await downloadBlobInPage(tab.id, candidate.url, filename);
    await notify(started ? 'Chrome 다운로드를 시작했습니다.' : '분할 스트리밍 또는 보호된 미디어는 직접 저장할 수 없습니다.');
    return;
  }

  if (!CleanMedia.isDownloadableUrl(candidate.url)) {
    await notify('직접 저장할 수 있는 미디어 주소가 아닙니다.');
    return;
  }

  try {
    await chrome.downloads.download({
      url: candidate.url,
      filename: filename || undefined,
      saveAs: true,
      conflictAction: 'uniquify'
    });
    await notify('Chrome 다운로드를 시작했습니다.');
  } catch (_) {
    await notify('다운로드를 시작하지 못했습니다. 다른 미디어를 선택해 주세요.');
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) saveMedia(info, tab);
});

chrome.action.onClicked.addListener((tab) => saveMedia({}, tab));

'use strict';

const ROOT_MENU = 'clean-video-downloader';
const SUPPORTED_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'instagram.com', 'tvcf.co.kr'];

function supportedPage(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return SUPPORTED_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch (_) {
    return false;
  }
}

function bestUrl(info, tab) {
  const pageUrl = info.pageUrl || (tab && tab.url) || '';
  if (supportedPage(pageUrl)) return pageUrl;
  for (const value of [info.srcUrl, info.linkUrl, pageUrl]) {
    if (/^https?:\/\//i.test(value || '')) return value;
  }
  return '';
}

async function notify(message) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title: '클린 영상 다운로더',
    message
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: ROOT_MENU,
      title: '클린 영상 다운로더로 받기',
      contexts: ['video', 'audio', 'link', 'page']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== ROOT_MENU) return;
  const url = bestUrl(info, tab);
  if (!url) {
    await notify('보낼 수 있는 영상 링크를 찾지 못했습니다.');
    return;
  }
  try {
    const response = await fetch('http://127.0.0.1:18223/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Clean-Downloader': 'extension-v1' },
      body: JSON.stringify({ url })
    });
    if (!response.ok) throw new Error('unsupported');
    await notify('링크를 앱으로 보냈습니다.');
  } catch (_) {
    await notify('클린 영상 다운로더 앱을 먼저 실행한 뒤 다시 시도해 주세요.');
  }
});

'use strict';

const pageTitle = document.getElementById('page-title');
const currentButton = document.getElementById('download-current');
const directInput = document.getElementById('direct-url');
const directButton = document.getElementById('download-url');
const status = document.getElementById('status');
let activeTab = null;

function showStatus(result) {
  status.textContent = result.message;
  status.className = `status ${result.ok ? 'success' : 'error'}`;
}

async function run(button, operation) {
  button.disabled = true;
  status.textContent = '미디어를 확인하고 있습니다…';
  status.className = 'status';
  try {
    showStatus(await operation());
  } catch (_) {
    showStatus({ ok: false, message: '확장 프로그램을 다시 로드한 뒤 시도해 주세요.' });
  } finally {
    button.disabled = false;
  }
}

async function initialize() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tabs[0] || null;
  pageTitle.textContent = activeTab?.title || '현재 페이지를 확인할 수 없습니다.';
  if (!activeTab?.id || !/^https?:/i.test(activeTab.url || '')) currentButton.disabled = true;
}

currentButton.addEventListener('click', () => run(currentButton, () => chrome.runtime.sendMessage({
  type: 'download-current',
  tabId: activeTab?.id,
  tabTitle: activeTab?.title,
  tabUrl: activeTab?.url
})));

directButton.addEventListener('click', () => run(directButton, () => chrome.runtime.sendMessage({
  type: 'download-url',
  url: directInput.value,
  title: activeTab?.title,
  tabId: activeTab?.id
})));

directInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') directButton.click();
});

initialize().catch(() => {
  pageTitle.textContent = '현재 페이지를 확인할 수 없습니다.';
  currentButton.disabled = true;
});

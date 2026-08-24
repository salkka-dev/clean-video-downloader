'use strict';

const REPOSITORY = 'salkka-dev/clean-video-downloader';

function parseVersion(value) {
  return String(value || '').replace(/^v/i, '').split('.').map(part => Number(part.replace(/\D.*$/, '')) || 0).slice(0, 3);
}

function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return true;
    if ((a[index] || 0) < (b[index] || 0)) return false;
  }
  return false;
}

async function checkForUpdate(currentVersion) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'clean-video-downloader' }
    });
    if (!response.ok) return null;
    const release = await response.json();
    if (!isNewerVersion(release.tag_name, currentVersion)) return null;
    return { version: String(release.tag_name).replace(/^v/i, ''), url: release.html_url };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkForUpdate, isNewerVersion, parseVersion, REPOSITORY };

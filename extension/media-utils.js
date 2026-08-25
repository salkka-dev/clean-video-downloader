'use strict';

(function expose(root, factory) {
  const api = factory();
  root.CleanMedia = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const MEDIA_EXTENSION = /\.(mp4|m4v|mov|webm|mp3|m4a|aac|wav|ogg|ogv)(?:$|[?#])/i;

  function isBlobUrl(value) {
    return /^blob:/i.test(String(value || ''));
  }

  function isDownloadableUrl(value) {
    return /^(https?:|data:)/i.test(String(value || ''));
  }

  function looksLikeMediaUrl(value) {
    return isBlobUrl(value) || MEDIA_EXTENSION.test(String(value || ''));
  }

  function safeBaseName(value) {
    return String(value || 'media')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, 110) || 'media';
  }

  function extensionFromUrl(value) {
    const match = String(value || '').match(MEDIA_EXTENSION);
    return match ? `.${match[1].toLowerCase()}` : '';
  }

  function suggestFilename(title, url, kind) {
    const extension = extensionFromUrl(url);
    if (!extension) return '';
    const base = safeBaseName(title || kind || 'media').replace(/\.[a-z0-9]{2,5}$/i, '');
    return `${base}${extension}`;
  }

  return { extensionFromUrl, isBlobUrl, isDownloadableUrl, looksLikeMediaUrl, safeBaseName, suggestFilename };
}));

'use strict';

const http = require('http');
const { validateUrls } = require('./downloader');

const PORT = 18223;

function startExtensionBridge(onUrl) {
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin || '';
    const allowedOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    const finish = (status, body) => {
      if (allowedOrigin) response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Clean-Downloader');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.writeHead(status);
      response.end(JSON.stringify(body));
    };

    if (request.method === 'OPTIONS') return finish(204, {});
    if (request.method === 'GET' && request.url === '/health') return finish(200, { ok: true });
    if (request.method !== 'POST' || request.url !== '/add' || !allowedOrigin || request.headers['x-clean-downloader'] !== 'extension-v1') {
      return finish(403, { ok: false });
    }

    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) request.destroy();
    });
    request.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const url = String(parsed.url || '').trim();
        const invalid = validateUrls([url]);
        if (invalid) return finish(400, { ok: false, message: '지원하는 개별 영상 링크가 아닙니다.' });
        onUrl(url);
        return finish(200, { ok: true });
      } catch (_) {
        return finish(400, { ok: false });
      }
    });
  });
  server.listen(PORT, '127.0.0.1');
  return server;
}

module.exports = { PORT, startExtensionBridge };

/**
 * INHANH API - Zero-Dependency Local Dev Server & Proxy
 * 
 * Chạy trực tiếp bằng Node.js có sẵn (KHÔNG CẦN CÀI ĐẶT THƯ VIỆN NPM):
 * 1. Phục vụ các file tĩnh (index.html, style.css, bundle.js) tại http://localhost:8080
 * 2. Tự động chuyển tiếp (Proxy) các request /v1/* tới https://inhanh.com kèm API Key
 *    và bổ sung header CORS (Access-Control-Allow-Origin: *) để trình duyệt không bao giờ bị chặn.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const UPSTREAM_HOST = 'inhanh.com';
const API_KEY = process.env.INHANH_API_KEY || 'ink_live_5u6kug93r8e7kitzwdkol9grfslx32fk';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // CORS Headers cho mọi request
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Chuyển tiếp (Proxy) nếu là API call /v1/*
  if (req.url.startsWith('/v1/')) {
    const upstreamHeaders = { ...req.headers, host: UPSTREAM_HOST };
    // Đảm bảo có X-API-Key
    if (!upstreamHeaders['x-api-key'] && !upstreamHeaders['authorization']) {
      upstreamHeaders['x-api-key'] = API_KEY;
    }

    const options = {
      hostname: UPSTREAM_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers: upstreamHeaders,
    };

    const proxyReq = https.request(options, (proxyRes) => {
      // Sao chép header và gắn thêm CORS cho trình duyệt
      const outHeaders = { ...proxyRes.headers };
      outHeaders['access-control-allow-origin'] = '*';
      outHeaders['access-control-allow-headers'] = 'Content-Type, Authorization, X-API-Key, Accept';
      outHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';

      res.writeHead(proxyRes.statusCode, outHeaders);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Proxy Error: ${err.message}` }));
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  // 2. Phục vụ Static Files (index.html, bundle.js, style.css...)
  let filePath = path.join(__dirname, req.url.split('?')[0]);
  if (req.url === '/' || req.url === '') {
    filePath = path.join(__dirname, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  INHANH Client Server dang chay tai: http://localhost:${PORT}`);
  console.log(`  Ket noi API toi: https://${UPSTREAM_HOST}`);
  console.log(`====================================================`);
});

/* ============================================================
   SERVER.JS — Servidor estático local (Node puro, sem dependências)
   ------------------------------------------------------------
   Alternativa robusta ao "npx serve" (evita Internal Server
   Error/travas e problemas de cache). Para rodar:

     node server.js

   Acesse: http://localhost:3000
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * Cache inteligente para performance:
 * - HTML: sem cache (sempre a versão mais recente).
 * - Demais arquivos: cache imutável por 1 ano — o cache-busting
 *   (?v=NN) garante que mudanças reais sempre sejam baixadas.
 * Isso faz o navegador servir CSS/JS das visitas anteriores sem
 * rebaixar tudo de novo (essencial no plano Free do Render, que
 * "dorme" após 15 min sem acesso).
 */
const CACHE_HTML = 'no-store';
const CACHE_ASSET = 'public, max-age=31536000, immutable';

/** Extensões de texto (candidatas a compressão). */
const TEXT_TYPES = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.md',
]);

/** Escolhe a codificação de compressão aceita pelo cliente (ou null). */
function pickEncoding(req) {
  const accept = (req.headers['accept-encoding'] || '').toLowerCase();
  if (accept.includes('br')) return 'br';
  if (accept.includes('gzip')) return 'gzip';
  return null;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    urlPath = req.url;
  }
  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  // Evita sair da pasta do projeto (path traversal)
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Acesso negado');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found: ' + urlPath);
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? CACHE_HTML : CACHE_ASSET,
    };

    // Compressão gzip/brotli para arquivos de texto
    const encoding = TEXT_TYPES.has(ext) ? pickEncoding(req) : null;
    if (encoding) {
      headers['Content-Encoding'] = encoding;
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      const compress = encoding === 'br' ? zlib.createBrotliCompress() : zlib.createGzip();
      return fs.createReadStream(filePath).pipe(compress).pipe(res);
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Punk Bolos rodando em http://localhost:${PORT}`);
});

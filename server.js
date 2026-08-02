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
 * - Arquivos com ?v=NN (script/link no HTML): cache imutável por
 *   1 ano em PRODUÇÃO — o cache-busting garante que mudanças reais
 *   sejam baixadas. Em AMBIENTE LOCAL, não usa cache (toda edição
 *   aparece ao recarregar, sem depender de número de versão).
 * - Arquivos SEM ?v=NN (módulos ES6 importados por outro .js): sempre
 *   revalidam via ETag (304 quando não mudaram) — assim o navegador
 *   nunca fica preso a uma versão antiga após uma atualização.
 * O cache imutável é essencial no plano Free do Render, que "dorme"
 * após 15 min sem acesso.
 */

// Produção = Render (define a variável de ambiente RENDER) ou NODE_ENV.
const IS_PROD = Boolean(process.env.RENDER) || process.env.NODE_ENV === 'production';

const CACHE_HTML = 'no-store';
const CACHE_VERSIONED = IS_PROD ? 'public, max-age=31536000, immutable' : 'no-cache';
const CACHE_MODULE = 'no-cache';

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
  const rawUrl = req.url || '';
  const hasVersionQuery = /[?&]v=/.test(rawUrl);

  let urlPath;
  try {
    urlPath = decodeURIComponent(rawUrl.split('?')[0]);
  } catch {
    urlPath = rawUrl;
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
    const isHtml = ext === '.html';
    let cacheControl = isHtml ? CACHE_HTML : (hasVersionQuery ? CACHE_VERSIONED : CACHE_MODULE);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl,
    };

    // ETag permite revalidar módulos sem ?v (retorno 304, sem rebaixar)
    if (!isHtml && !hasVersionQuery) {
      const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      headers['ETag'] = etag;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        return res.end();
      }
    }

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

/* ============================================================
   BUILD-CSS.JS — Inline de CSS para melhorar a performance (LCP)
   ------------------------------------------------------------
   O CSS bloqueia a renderização. Este script embute o CSS
   diretamente no HTML (entre as marcas <!-- CSS_INLINE:START -->
   e <!-- CSS_INLINE:END -->), substituindo os <link> de fallback —
   reduz requests no caminho crítico de render da página.

   Uso: node tools/build-css.js
   (re-execute após editar qualquer arquivo em /css)

   IMPORTANTE: re-execute este script sempre que editar um .css,
   caso contrário o navegador não verá as mudanças (o HTML fica
   com o CSS embutido). Se quiser voltar ao modo <link>, restaure
   o bloco entre as marcas nos dois HTMLs.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Quais CSS cada página embute (na ordem). */
const MAP = {
  'index.html': ['css/themes.css', 'css/styles.css', 'css/responsive.css'],
  'login.html': ['css/themes.css', 'css/login.css'],
};

const MARK_START = '<!-- CSS_INLINE:START -->';
const MARK_END = '<!-- CSS_INLINE:END -->';

function inlineBlock(page) {
  const files = MAP[page] || [];
  const parts = files.map((rel) => {
    const abs = path.join(ROOT, rel);
    return `\n<style>\n/* ${rel} */\n${fs.readFileSync(abs, 'utf8')}\n</style>`;
  });
  return `\n${MARK_START}\n${parts.join('\n')}\n${MARK_END}\n`;
}

let changed = false;
for (const page of Object.keys(MAP)) {
  const abs = path.join(ROOT, page);
  if (!fs.existsSync(abs)) continue;
  const html = fs.readFileSync(abs, 'utf8');
  const start = html.indexOf(MARK_START);
  const end = html.indexOf(MARK_END);
  if (start === -1 || end === -1) {
    console.error(`[build-css] ${page}: marcas CSS_INLINE não encontradas. Nada feito.`);
    continue;
  }
  const next = html.slice(0, start) + inlineBlock(page) + html.slice(end + MARK_END.length);
  fs.writeFileSync(abs, next, 'utf8');
  console.log(
    `[build-css] ${page}: inline atualizado (${(MAP[page] || []).join(', ')}) — delta ${next.length - html.length} chars`
  );
  changed = true;
}

if (!changed) console.log('[build-css] Nada foi alterado.');
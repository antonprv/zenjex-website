/* ============================================================
   wiki.js — Renders wiki articles.
   ============================================================ */

let _currentArticle = null;
let _rendering = false;

/* ── Wait for config AND articles, then render first article ── */
let _waitStart = Date.now();
(function waitForCfg() {
  const cfg = window.__cfg;
  if (!cfg) { setTimeout(waitForCfg, 30); return; }

  const articles = cfg.articles || [];
  /* Wait up to 5s for articles to be populated from wiki/index.json */
  if (!articles.length && Date.now() - _waitStart < 5000) {
    setTimeout(waitForCfg, 30);
    return;
  }
  if (!articles.length) {
    document.getElementById('article-content').innerHTML =
      '<div class="wiki-error">Failed to load wiki/index.json. Check the console for errors.</div>';
    return;
  }

  syncLangButtons(window.getCurrentLang?.() || 'ru');

  const hashId = decodeURIComponent(location.hash.slice(1));
  const target = (hashId && articles.find(a => a.id === hashId)) || articles[0];
  renderArticle(target);
})();

/* ── Browser back/forward ── */
window.addEventListener('popstate', () => {
  const cfg = window.__cfg;
  if (!cfg) return;
  const hashId = decodeURIComponent(location.hash.slice(1));
  const article = cfg.articles?.find(a => a.id === hashId);
  if (article) { _rendering = false; renderArticle(article); activateSidebarItem(article.id); }
});


/* ════════════════════════════════════════════════════════════
   RENDER ARTICLE
   ════════════════════════════════════════════════════════════ */
async function renderArticle(article) {
  if (_rendering) return;
  _rendering = true;
  _currentArticle = article;

  const lang    = window.getCurrentLang?.() || 'ru';
  const content = document.getElementById('article-content');
  if (!content) { _rendering = false; return; }

  const encoded = encodeURIComponent(article.id);
  if (location.hash !== '#' + encoded) history.pushState(null, '', '#' + encoded);

  const title = lang === 'ru' ? article.titleRu : article.titleEn;
  document.title = `${title} — ${window.__cfg?.site?.project || 'Wiki'}`;

  content.innerHTML = `<div class="wiki-loading">
    <div class="wiki-loading-dot"></div>
    <div class="wiki-loading-dot"></div>
    <div class="wiki-loading-dot"></div>
  </div>`;

  try {
    if (article.id === 'home') {
      content.innerHTML = buildHomePage(lang);
      content.scrollTo({ top: 0, behavior: 'smooth' });
      _rendering = false;
      return;
    }

    const wikiDir = window.__cfg?.wikiDir || 'wiki';
    const file = (lang === 'ru' && article.fileRu) ? article.fileRu : article.fileEn;

    if (!file) {
      content.innerHTML = `<div class="wiki-error">No file configured for this article.</div>`;
      _rendering = false;
      return;
    }

    const res = await fetch(`${wikiDir}/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${file}`);
    let md = await res.text();

    if (article.splitLang) md = extractLangSection(md, lang);

    content.innerHTML = `<div class="wiki-body reveal">${markdownToHtml(md)}</div>`;
    content.scrollTo({ top: 0, behavior: 'smooth' });
    highlightCode(content);

  } catch (err) {
    console.error('[wiki] Failed to load article:', err);
    content.innerHTML = `<div class="wiki-error">Failed to load: ${escHtml(err.message)}</div>`;
  }

  _rendering = false;
}

/* ── Re-render on language switch (called by lang.js) ── */
function rerenderCurrentLang(lang) {
  syncLangButtons(lang);
  document.querySelectorAll('#article-list .t').forEach(el => {
    const val = el.getAttribute('data-' + lang);
    if (val !== null) el.textContent = val;
  });
  if (!_currentArticle) return;
  _rendering = false;
  const content = document.getElementById('article-content');
  const body = content?.querySelector('.wiki-body');
  if (body) {
    body.style.opacity = '0';
    body.style.transition = 'opacity 0.15s ease';
    setTimeout(() => renderArticle(_currentArticle), 160);
  } else {
    renderArticle(_currentArticle);
  }
}


/* ════════════════════════════════════════════════════════════
   HOME PAGE
   ════════════════════════════════════════════════════════════ */
function buildHomePage(lang) {
  const project = window.__cfg?.site?.project || 'Zenjex';
  const repoUrl = escHtml(window.__cfg?.site?.repoUrl || '#');
  const ru = lang === 'ru';

  return `<div class="wiki-body wiki-home reveal">
    <div class="wiki-home-hero">
      <h1 class="wiki-home-title"><span>${escHtml(project)}</span> Wiki</h1>
      <p class="wiki-home-sub">${ru
        ? 'DI-слой, совместимый с Zenject, поверх Reflex — портирован и исправлен для Unity 6.'
        : 'Zenject-compatible DI layer on top of Reflex — ported and fixed for Unity 6.'}</p>
      <a href="${repoUrl}" target="_blank" rel="noopener" class="wiki-home-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.4 7.9 10.9.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 015.74 0C17.3 5.37 18.26 5.68 18.26 5.68c.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.15c0 .31.21.67.8.56C20.2 21.4 23.5 17.1 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
        GitHub
      </a>
    </div>
    <div class="wiki-home-cards">
      <button class="wiki-home-card" onclick="navigateTo('quick-start')">
        <div class="wiki-home-card-icon">${iconLg('rocket')}</div>
        <div class="wiki-home-card-title">${ru ? 'Быстрый старт' : 'Quick Start'}</div>
        <div class="wiki-home-card-desc">${ru
          ? 'Интеграция за 4 шага: установка, инсталлеры, биндинги, инъекции.'
          : 'Integration in 4 steps: setup, installers, bindings, injection.'}</div>
      </button>
      <button class="wiki-home-card" onclick="navigateTo('zenjex-internals')">
        <div class="wiki-home-card-icon">${iconLg('layers')}</div>
        <div class="wiki-home-card-title">${ru ? 'Zenjex: устройство' : 'Zenjex Internals'}</div>
        <div class="wiki-home-card-desc">${ru
          ? 'Пассы инъекций, BindingBuilder, SceneInstaller и ZenjexRunner.'
          : 'Injection passes, BindingBuilder, SceneInstaller and ZenjexRunner.'}</div>
      </button>
      <button class="wiki-home-card" onclick="navigateTo('reflex-internals')">
        <div class="wiki-home-card-icon">${iconLg('cpu')}</div>
        <div class="wiki-home-card-title">${ru ? 'Reflex: устройство' : 'Reflex Internals'}</div>
        <div class="wiki-home-card-desc">${ru
          ? 'Иерархия контейнеров, резолверы и кэш рефлексии.'
          : 'Container hierarchy, resolvers and reflection cache.'}</div>
      </button>
    </div>
  </div>`;
}

function navigateTo(id) {
  const article = window.__cfg?.articles?.find(a => a.id === id);
  if (!article) return;
  activateSidebarItem(id);
  _rendering = false;
  renderArticle(article);
}


/* ════════════════════════════════════════════════════════════
   MARKDOWN → HTML
   Strategy: first extract all fenced code blocks and replace
   them with safe placeholders, then parse the remaining text
   line-by-line (no pipes inside code blocks can confuse the
   table detector), then restore the code blocks at the end.
   ════════════════════════════════════════════════════════════ */
function markdownToHtml(md) {
  /* Strip wiki-internal language switcher line */
  md = md.replace(/^>\s+\*\*Language[^\n]*\n?/m, '');

  /* ── Phase 1: extract fenced code blocks into placeholders ── */
  const codeBlocks = [];
  md = md.replace(/^```([^\n]*)\n([\s\S]*?)^```\s*$/gm, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang.trim(), code });
    return `\x00CODE${idx}\x00`;
  });

  /* ── Phase 2: parse line by line ── */
  const lines = md.split('\n');
  const out   = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* Code block placeholder */
    if (/^\x00CODE\d+\x00$/.test(line.trim())) {
      const idx = parseInt(line.match(/\d+/)[0]);
      const { lang, code } = codeBlocks[idx];
      out.push(`<pre><code class="language-${escHtml(lang)}">${escHtml(code.replace(/\n$/, ''))}</code></pre>`);
      i++;
      continue;
    }

    /* Heading */
    const hm = line.match(/^(#{1,4}) (.+)/);
    if (hm) {
      const level = hm[1].length;
      const text  = inlineToHtml(hm[2]);
      const slug  = hm[2].toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      out.push(`<h${level} id="${slug}">${text}</h${level}>`);
      i++; continue;
    }

    /* Horizontal rule */
    if (/^-{3,}\s*$/.test(line)) {
      out.push('<hr>');
      i++; continue;
    }

    /* Blockquote */
    if (line.startsWith('> ')) {
      const bq = [];
      while (i < lines.length && lines[i].startsWith('> ')) { bq.push(lines[i].slice(2)); i++; }
      out.push(`<blockquote><p>${inlineToHtml(bq.join(' '))}</p></blockquote>`);
      continue;
    }

    /* Table — only when next non-empty line is a separator row */
    if (looksLikeTableRow(line)) {
      /* Find the separator line (skip blanks) */
      let sepIdx = i + 1;
      while (sepIdx < lines.length && lines[sepIdx].trim() === '') sepIdx++;
      if (sepIdx < lines.length && isTableSeparator(lines[sepIdx])) {
        const tableLines = [];
        while (i < lines.length && looksLikeTableRow(lines[i])) {
          tableLines.push(lines[i]);
          i++;
        }
        out.push(buildTable(tableLines));
        continue;
      }
    }

    /* Unordered list */
    if (/^[ \t]*[-*+] /.test(line)) {
      const lst = [];
      while (i < lines.length && /^[ \t]*[-*+] /.test(lines[i])) { lst.push(lines[i]); i++; }
      out.push(buildList(lst, false));
      continue;
    }

    /* Ordered list */
    if (/^\d+\. /.test(line)) {
      const lst = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { lst.push(lines[i]); i++; }
      out.push(buildList(lst, true));
      continue;
    }

    /* Empty line */
    if (line.trim() === '') { i++; continue; }

    /* Paragraph — collect until blank or block element */
    const para = [];
    while (i < lines.length) {
      const l = lines[i];
      if (isBlockStart(l, i, lines)) break;
      para.push(l);
      i++;
    }
    if (para.length) out.push(`<p>${inlineToHtml(para.join(' '))}</p>`);
  }

  return out.join('\n');
}

/* ── Table detection helpers ── */
function looksLikeTableRow(line) {
  /* A real table row starts and ends with | or has multiple | */
  return /^\|.+\|/.test(line.trim()) || (line.includes('|') && /^\|/.test(line.trim()));
}

function isTableSeparator(line) {
  return /^\|?[\s\-:|]+\|[\s\-:|]*$/.test(line.trim()) && line.includes('-');
}

/* ── Block-level start detector (for paragraph termination) ── */
function isBlockStart(line, i, lines) {
  if (line.trim() === '') return true;
  if (/^#{1,4} /.test(line)) return true;
  if (/^-{3,}\s*$/.test(line)) return true;
  if (line.startsWith('> ')) return true;
  if (/^[ \t]*[-*+] /.test(line)) return true;
  if (/^\d+\. /.test(line)) return true;
  if (/^\x00CODE\d+\x00$/.test(line.trim())) return true;
  /* Only treat as table-start if followed by separator */
  if (looksLikeTableRow(line)) {
    let sep = i + 1;
    while (sep < lines.length && lines[sep].trim() === '') sep++;
    if (sep < lines.length && isTableSeparator(lines[sep])) return true;
  }
  return false;
}

function inlineToHtml(text) {
  /* Restore code block placeholders as inline code (shouldn't happen but safety) */
  return text
    .replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, href) => {
      const ext = /^https?:\/\//.test(href);
      return `<a href="${escHtml(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${escHtml(t)}</a>`;
    });
}

function buildTable(lines) {
  const rows = lines
    .filter(l => !isTableSeparator(l))
    .map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
  if (!rows.length) return '';
  const [head, ...body] = rows;
  const ths = head.map(c => `<th>${inlineToHtml(c)}</th>`).join('');
  const trs = body.map(r => `<tr>${r.map(c => `<td>${inlineToHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="wiki-table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function buildList(lines, ordered) {
  const tag   = ordered ? 'ol' : 'ul';
  const items = lines
    .map(l => l.replace(/^[ \t]*[-*+\d.]+\s/, ''))
    .map(t => `<li>${inlineToHtml(t)}</li>`)
    .join('');
  return `<${tag}>${items}</${tag}>`;
}


/* ════════════════════════════════════════════════════════════
   LANGUAGE SECTION EXTRACTOR (README.md)
   ════════════════════════════════════════════════════════════ */
function extractLangSection(md, lang) {
  const enIdx = md.search(/^## English\s*$/m);
  const ruIdx = md.search(/^## Русский\s*$/m);
  if (enIdx === -1 || ruIdx === -1) return md;
  if (lang === 'ru') return md.slice(md.indexOf('\n', ruIdx) + 1).trim();
  return md.slice(md.indexOf('\n', enIdx) + 1, ruIdx).trim();
}


/* ════════════════════════════════════════════════════════════
   SYNTAX HIGHLIGHTING
   ════════════════════════════════════════════════════════════ */
function highlightCode(container) {
  container.querySelectorAll('pre code').forEach(block => {
    const cls = block.className;
    if (cls.includes('csharp') || cls.includes('cs') || cls === 'language-') {
      block.innerHTML = highlightCSharp(block.textContent);
    }
  });
}

function highlightCSharp(code) {
  let s = escHtml(code);
  s = s.replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;)/g, '<span class="hl-str">$1</span>');
  s = s.replace(/(\/\/[^\n]*)/g, '<span class="hl-comment">$1</span>');
  const kwRe = /\b(public|private|protected|internal|static|abstract|override|virtual|sealed|readonly|const|new|class|interface|namespace|using|return|void|bool|int|string|float|double|var|null|true|false|this|base|typeof|if|else|for|foreach|while|yield|async|await|get|set|in|out|ref|params|where|event|delegate|partial|struct|enum|operator)\b/g;
  s = s.replace(kwRe, (m, _, offset, str) => {
    const before     = str.slice(0, offset);
    const openCount  = (before.match(/<span/g)  || []).length;
    const closeCount = (before.match(/<\/span>/g) || []).length;
    return openCount > closeCount ? m : `<span class="hl-kw">${m}</span>`;
  });
  return s;
}


/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */
function activateSidebarItem(id) {
  document.querySelectorAll('.wiki-article-item').forEach(el => {
    el.classList.toggle('active', el.dataset.articleId === id);
  });
}

function syncLangButtons(lang) {
  document.getElementById('btn-ru')?.classList.toggle('active', lang === 'ru');
  document.getElementById('btn-en')?.classList.toggle('active', lang === 'en');
}

function iconLg(name) {
  const icons = {
    rocket: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
    layers: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    cpu:    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
  };
  return icons[name] || '';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

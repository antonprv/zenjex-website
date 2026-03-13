/* ============================================================
   wiki.js — Renders wiki articles.

   Fetches markdown files and converts them to HTML.
   Handles the Home article (built-in, no file needed).
   Handles language switching for bilingual md files.
   Handles deep-linking via URL hash: wiki.html#zenjex-internals
   ============================================================ */

let _currentArticle = null;

/* ── Auto-render first article once config is ready ── */
(function waitForCfg() {
  const cfg = window.__cfg;
  if (!cfg) { requestAnimationFrame(waitForCfg); return; }

  const articles = cfg.articles || [];
  if (!articles.length) return;

  const lang = window.getCurrentLang?.() || 'ru';
  syncLangButtons(lang);

  /* Render article from URL hash, fallback to first */
  const hashId = decodeURIComponent(location.hash.slice(1));
  const target = hashId
    ? articles.find(a => a.id === hashId) || articles[0]
    : articles[0];

  renderArticle(target);
})();


/* ── Handle browser back/forward ── */
window.addEventListener('popstate', () => {
  const cfg = window.__cfg;
  if (!cfg) return;
  const hashId = decodeURIComponent(location.hash.slice(1));
  const article = cfg.articles?.find(a => a.id === hashId);
  if (article) {
    renderArticle(article);
    activateSidebarItem(article.id);
  }
});


/* ════════════════════════════════════════════════════════════
   RENDER ARTICLE
   ════════════════════════════════════════════════════════════ */
async function renderArticle(article) {
  _currentArticle = article;

  const lang = window.getCurrentLang?.() || 'ru';
  const content = document.getElementById('article-content');
  if (!content) return;

  /* Update URL hash */
  const encoded = encodeURIComponent(article.id);
  if (location.hash !== '#' + encoded) history.pushState(null, '', '#' + encoded);

  /* Update page title */
  const title = lang === 'ru' ? article.titleRu : article.titleEn;
  document.title = `${title} — ${window.__cfg?.site?.project || 'Wiki'}`;

  /* Show loading state */
  content.innerHTML = `<div class="wiki-loading">
    <div class="wiki-loading-dot"></div><div class="wiki-loading-dot"></div><div class="wiki-loading-dot"></div>
  </div>`;

  /* Home is built-in */
  if (article.id === 'home') {
    content.innerHTML = buildHomePage(lang);
    content.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  /* Fetch and render markdown */
  const wikiDir = window.__cfg?.wikiDir || 'wiki';
  const file = lang === 'ru' && article.fileRu ? article.fileRu : article.fileEn;

  if (!file) {
    content.innerHTML = `<div class="wiki-error">No file configured for this article.</div>`;
    return;
  }

  try {
    const res = await fetch(`${wikiDir}/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let md = await res.text();

    /* For quick-start (README.md), extract the correct language section */
    if (article.splitLang) {
      md = extractLangSection(md, lang);
    }

    content.innerHTML = `<div class="wiki-body reveal">${markdownToHtml(md)}</div>`;
    content.scrollTo({ top: 0, behavior: 'smooth' });

    /* Highlight code blocks */
    highlightCode(content);

  } catch (err) {
    console.error('[wiki] Failed to load article:', err);
    content.innerHTML = `<div class="wiki-error">Failed to load article: ${escHtml(err.message)}</div>`;
  }
}


/* ── Re-render in new language (called by lang.js) ── */
function rerenderCurrentLang(lang) {
  if (!_currentArticle) return;

  const content = document.getElementById('article-content');
  if (!content) return;

  /* Update sidebar labels */
  document.querySelectorAll('.t').forEach(el => {
    const val = el.getAttribute('data-' + lang);
    if (val !== null) el.textContent = val;
  });

  /* Fade out, re-render, fade in */
  const body = content.querySelector('.wiki-body');
  if (body) {
    body.style.opacity = '0';
    body.style.transition = 'opacity 0.18s ease';
  }

  setTimeout(() => renderArticle(_currentArticle), 180);
}


/* ════════════════════════════════════════════════════════════
   HOME PAGE (built-in)
   ════════════════════════════════════════════════════════════ */
function buildHomePage(lang) {
  const project = window.__cfg?.site?.project || 'Zenjex';
  const repoUrl = window.__cfg?.site?.repoUrl || '#';

  if (lang === 'ru') {
    return `<div class="wiki-body wiki-home reveal">
      <div class="wiki-home-hero">
        <h1 class="wiki-home-title"><span>${project}</span> Wiki</h1>
        <p class="wiki-home-sub">DI-слой, совместимый с Zenject, поверх Reflex — портирован и исправлен для Unity 6.</p>
        <a href="${escHtml(repoUrl)}" target="_blank" rel="noopener" class="wiki-home-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.4 7.9 10.9.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0C17.3 5.37 18.26 5.68 18.26 5.68c.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.15c0 .31.21.67.8.56C20.2 21.4 23.5 17.1 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
          GitHub
        </a>
      </div>
      <div class="wiki-home-cards">
        <button class="wiki-home-card" onclick="navigateTo('quick-start')">
          <div class="wiki-home-card-icon">${getIconLarge('rocket')}</div>
          <div class="wiki-home-card-title">Быстрый старт</div>
          <div class="wiki-home-card-desc">Интеграция за 4 шага: установка, инсталлеры, биндинги, инъекции.</div>
        </button>
        <button class="wiki-home-card" onclick="navigateTo('zenjex-internals')">
          <div class="wiki-home-card-icon">${getIconLarge('layers')}</div>
          <div class="wiki-home-card-title">Zenjex: устройство</div>
          <div class="wiki-home-card-desc">Как устроены пассы инъекций, BindingBuilder, SceneInstaller и ZenjexRunner.</div>
        </button>
        <button class="wiki-home-card" onclick="navigateTo('reflex-internals')">
          <div class="wiki-home-card-icon">${getIconLarge('cpu')}</div>
          <div class="wiki-home-card-title">Reflex: устройство</div>
          <div class="wiki-home-card-desc">Иерархия контейнеров, резолверы, кэш рефлексии и активация через expression tree.</div>
        </button>
      </div>
    </div>`;
  }

  return `<div class="wiki-body wiki-home reveal">
    <div class="wiki-home-hero">
      <h1 class="wiki-home-title"><span>${project}</span> Wiki</h1>
      <p class="wiki-home-sub">Zenject-compatible DI layer on top of Reflex — ported and fixed for Unity 6.</p>
      <a href="${escHtml(repoUrl)}" target="_blank" rel="noopener" class="wiki-home-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.4 7.9 10.9.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0C17.3 5.37 18.26 5.68 18.26 5.68c.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.15c0 .31.21.67.8.56C20.2 21.4 23.5 17.1 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
        GitHub
      </a>
    </div>
    <div class="wiki-home-cards">
      <button class="wiki-home-card" onclick="navigateTo('quick-start')">
        <div class="wiki-home-card-icon">${getIconLarge('rocket')}</div>
        <div class="wiki-home-card-title">Quick Start</div>
        <div class="wiki-home-card-desc">Integration in 4 steps: setup, installers, bindings, injection.</div>
      </button>
      <button class="wiki-home-card" onclick="navigateTo('zenjex-internals')">
        <div class="wiki-home-card-icon">${getIconLarge('layers')}</div>
        <div class="wiki-home-card-title">Zenjex Internals</div>
        <div class="wiki-home-card-desc">Injection passes, BindingBuilder, SceneInstaller and ZenjexRunner in depth.</div>
      </button>
      <button class="wiki-home-card" onclick="navigateTo('reflex-internals')">
        <div class="wiki-home-card-icon">${getIconLarge('cpu')}</div>
        <div class="wiki-home-card-title">Reflex Internals</div>
        <div class="wiki-home-card-desc">Container hierarchy, resolvers, reflection cache and expression-tree activation.</div>
      </button>
    </div>
  </div>`;
}

function navigateTo(id) {
  const article = window.__cfg?.articles?.find(a => a.id === id);
  if (!article) return;
  renderArticle(article);
  activateSidebarItem(id);
}


/* ════════════════════════════════════════════════════════════
   MARKDOWN → HTML
   Minimal renderer: headings, code blocks, inline code,
   tables, blockquotes, lists, bold/italic, paragraphs.
   ════════════════════════════════════════════════════════════ */
function markdownToHtml(md) {
  /* Strip the language switcher lines at the top (wiki-internal links) */
  md = md.replace(/^>\s+\*\*Language.*\n\n?/m, '');

  const lines = md.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* ── Fenced code block ── */
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escHtml(lines[i]));
        i++;
      }
      out.push(`<pre><code class="language-${escHtml(lang)}">${codeLines.join('\n')}</code></pre>`);
      i++;
      continue;
    }

    /* ── Heading ── */
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = inlineToHtml(hMatch[2]);
      const id = hMatch[2].toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      i++;
      continue;
    }

    /* ── Horizontal rule ── */
    if (/^---+$/.test(line.trim())) {
      out.push('<hr>');
      i++;
      continue;
    }

    /* ── Blockquote ── */
    if (line.startsWith('> ')) {
      const bqLines = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        bqLines.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote>${inlineToHtml(bqLines.join(' '))}</blockquote>`);
      continue;
    }

    /* ── Table ── */
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\|?[\s\-|]+\|?$/)) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(buildTable(tableLines));
      continue;
    }

    /* ── Unordered list ── */
    if (/^(\s*)[-*+]\s/.test(line)) {
      const listLines = [];
      while (i < lines.length && /^(\s*)[-*+]\s/.test(lines[i])) {
        listLines.push(lines[i]);
        i++;
      }
      out.push(buildList(listLines, false));
      continue;
    }

    /* ── Ordered list ── */
    if (/^\d+\.\s/.test(line)) {
      const listLines = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listLines.push(lines[i]);
        i++;
      }
      out.push(buildList(listLines, true));
      continue;
    }

    /* ── Empty line (paragraph break) ── */
    if (line.trim() === '') {
      i++;
      continue;
    }

    /* ── Paragraph ── */
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('> ') && !/^(\s*)[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !lines[i].includes('|') && !/^---+$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${inlineToHtml(paraLines.join(' '))}</p>`);
    }
  }

  return out.join('\n');
}

function inlineToHtml(text) {
  return text
    /* Inline code */
    .replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`)
    /* Bold */
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    /* Italic */
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    /* Links */
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const isExternal = /^https?:\/\//.test(href);
      return `<a href="${escHtml(href)}"${isExternal ? ' target="_blank" rel="noopener"' : ''}>${escHtml(text)}</a>`;
    });
}

function buildTable(lines) {
  const rows = lines
    .filter(l => !/^\|?[\s\-|:]+\|?$/.test(l))
    .map(l => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));

  if (!rows.length) return '';
  const [head, ...body] = rows;

  const ths = head.map(c => `<th>${inlineToHtml(c)}</th>`).join('');
  const trs = body.map(row =>
    `<tr>${row.map(c => `<td>${inlineToHtml(c)}</td>`).join('')}</tr>`
  ).join('');

  return `<div class="wiki-table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function buildList(lines, ordered) {
  const tag = ordered ? 'ol' : 'ul';
  const items = lines.map(l => {
    const text = l.replace(/^\s*[-*+\d.]+\s/, '');
    return `<li>${inlineToHtml(text)}</li>`;
  }).join('');
  return `<${tag}>${items}</${tag}>`;
}


/* ════════════════════════════════════════════════════════════
   LANGUAGE SECTION EXTRACTOR (for README.md)
   Splits on ## English / ## Русский headings
   ════════════════════════════════════════════════════════════ */
function extractLangSection(md, lang) {
  /* Find the English and Russian sections */
  const enMarker = /^## English\s*$/m;
  const ruMarker = /^## Русский\s*$/m;

  const enMatch = enMarker.exec(md);
  const ruMatch = ruMarker.exec(md);

  if (!enMatch || !ruMatch) return md; /* fallback: return full text */

  if (lang === 'ru') {
    /* Russian section starts after ## Русский */
    const start = ruMatch.index + ruMatch[0].length;
    return md.slice(start).trim();
  } else {
    /* English section: between ## English and ## Русский */
    const start = enMatch.index + enMatch[0].length;
    const end = ruMatch.index;
    return md.slice(start, end).trim();
  }
}


/* ════════════════════════════════════════════════════════════
   CODE HIGHLIGHTING (simple keyword-based, no deps)
   ════════════════════════════════════════════════════════════ */
function highlightCode(container) {
  container.querySelectorAll('pre code').forEach(block => {
    const lang = block.className.replace('language-', '');
    if (lang === 'csharp' || lang === 'cs' || lang === '') {
      block.innerHTML = highlightCSharp(block.textContent);
    }
  });
}

function highlightCSharp(code) {
  const keywords = /\b(public|private|protected|internal|static|abstract|override|virtual|sealed|readonly|const|new|class|interface|namespace|using|return|void|bool|int|string|float|var|null|true|false|this|base|typeof|if|else|for|foreach|while|yield|async|await|get|set|in|out|ref|params|where|event|delegate|partial|struct|enum|operator)\b/g;
  const types = /\b([A-Z][A-Za-z0-9_]*(?:\<[^>]+\>)?)\b/g;
  const strings = /(\"[^\"]*\")/g;
  const comments = /(\/\/[^\n]*)/g;

  return escHtml(code)
    .replace(/&lt;([^&]+)&gt;/g, '<span class="hl-generic">&lt;$1&gt;</span>')
    .replace(new RegExp(keywords.source, 'g'), '<span class="hl-kw">$1</span>')
    .replace(strings, '<span class="hl-str">$1</span>')
    .replace(comments, '<span class="hl-comment">$1</span>');
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

function getIconLarge(name) {
  const icons = {
    rocket: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
    layers: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    cpu:    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
  };
  return icons[name] || '';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

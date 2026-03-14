/* ============================================================
   wiki.js — renders wiki articles using marked.js
   All article content is pre-loaded in window.__cfg.articles
   ============================================================ */

/* ── Wait for __cfg with articles, then render ── */
(function init() {
  const cfg = window.__cfg;
  if (!cfg || !cfg.articles || !cfg.articles.length) {
    setTimeout(init, 20);
    return;
  }
  start(cfg);
})();

function start(cfg) {
  syncLangButtons(window.getCurrentLang?.() || 'ru');

  window.addEventListener('popstate', () => {
    const hashId = decodeURIComponent(location.hash.slice(1));
    const article = window.__cfg?.articles?.find(a => a.id === hashId);
    if (article) { renderArticle(article); activateSidebarItem(article.id); }
  });

  const hashId = decodeURIComponent(location.hash.slice(1));
  const target = (hashId && cfg.articles.find(a => a.id === hashId)) || cfg.articles[0];
  renderArticle(target);
}


/* ════════════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════════════ */
function renderArticle(article) {
  const content = document.getElementById('article-content');
  if (!content) return;

  const lang = window.getCurrentLang?.() || 'ru';
  const enc  = encodeURIComponent(article.id);
  if (location.hash !== '#' + enc) history.pushState(null, '', '#' + enc);

  const title = lang === 'ru' ? article.titleRu : article.titleEn;
  document.title = title + ' — ' + (window.__cfg?.site?.project || 'Wiki');

  if (article.id === 'home') {
    content.innerHTML = buildHomePage(lang);
    content.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  /* Get markdown text from the article object (no fetch needed) */
  let md = (lang === 'ru' ? article.ru : article.en) || article.en || article.ru || '';

  if (article.splitLang) md = extractLangSection(md, lang);

  if (!md) {
    content.innerHTML = '<div class="wiki-error">No content found for this article.</div>';
    return;
  }

  /* marked.js must be loaded via CDN in wiki.html */
  if (typeof marked === 'undefined') {
    content.innerHTML = '<div class="wiki-error">marked.js not loaded.</div>';
    return;
  }

  const html = marked.parse(md);
  content.innerHTML = '<div class="wiki-body reveal">' + html + '</div>';
  content.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Language switch (called by lang.js) ── */
function rerenderCurrentLang(lang) {
  syncLangButtons(lang);
  /* Update sidebar labels */
  document.querySelectorAll('#article-list .t').forEach(el => {
    const v = el.getAttribute('data-' + lang);
    if (v !== null) el.textContent = v;
  });
  /* Re-render current article */
  const hashId  = decodeURIComponent(location.hash.slice(1));
  const article = window.__cfg?.articles?.find(a => a.id === hashId);
  if (article) renderArticle(article);
}


/* ════════════════════════════════════════════════════════════
   HOME PAGE (built-in, no markdown)
   ════════════════════════════════════════════════════════════ */
function buildHomePage(lang) {
  const project = window.__cfg?.site?.project || 'Zenjex';
  const repoUrl = esc(window.__cfg?.site?.repoUrl || '#');
  const ru = lang === 'ru';
  return `<div class="wiki-body wiki-home reveal">
    <div class="wiki-home-hero">
      <h1 class="wiki-home-title"><span>${esc(project)}</span> Wiki</h1>
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
        <div class="wiki-home-card-desc">${ru ? 'Интеграция за 4 шага: установка, инсталлеры, биндинги, инъекции.' : 'Integration in 4 steps: setup, installers, bindings, injection.'}</div>
      </button>
      <button class="wiki-home-card" onclick="navigateTo('zenjex-internals')">
        <div class="wiki-home-card-icon">${iconLg('layers')}</div>
        <div class="wiki-home-card-title">${ru ? 'Zenjex: устройство' : 'Zenjex Internals'}</div>
        <div class="wiki-home-card-desc">${ru ? 'Пассы инъекций, BindingBuilder, SceneInstaller и ZenjexRunner.' : 'Injection passes, BindingBuilder, SceneInstaller and ZenjexRunner.'}</div>
      </button>
      <button class="wiki-home-card" onclick="navigateTo('reflex-internals')">
        <div class="wiki-home-card-icon">${iconLg('cpu')}</div>
        <div class="wiki-home-card-title">${ru ? 'Reflex: устройство' : 'Reflex Internals'}</div>
        <div class="wiki-home-card-desc">${ru ? 'Иерархия контейнеров, резолверы и кэш рефлексии.' : 'Container hierarchy, resolvers and reflection cache.'}</div>
      </button>
    </div>
  </div>`;
}

function navigateTo(id) {
  const article = window.__cfg?.articles?.find(a => a.id === id);
  if (!article) return;
  activateSidebarItem(id);
  renderArticle(article);
}


/* ════════════════════════════════════════════════════════════
   LANGUAGE SECTION EXTRACTOR (README has ## English / ## Русский)
   ════════════════════════════════════════════════════════════ */
function extractLangSection(md, lang) {
  const enIdx = md.search(/^## English\s*$/m);
  const ruIdx = md.search(/^## Русский\s*$/m);
  if (enIdx === -1 || ruIdx === -1) return md;
  if (lang === 'ru') return md.slice(md.indexOf('\n', ruIdx) + 1).trim();
  return md.slice(md.indexOf('\n', enIdx) + 1, ruIdx).trim();
}


/* ── helpers ── */
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
  const m = {
    rocket: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
    layers: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    cpu:    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  };
  return m[name] || '';
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

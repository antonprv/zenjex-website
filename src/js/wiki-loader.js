/* ============================================================
   wiki-loader.js — Loads config.json + wiki/index.json,
   fetches article markdown files, renders sidebar.

   Structure:
     wiki/
       index.json         ← { "articles": [...] }
       quick-start.md
       zenjex-internals.md
       zenjex-internals.ru.md
       ...
   ============================================================ */

(async function bootstrap() {

  /* ── 1. Load config.json (same as changelog) ── */
  let cfg;
  try {
    const res = await fetch('config.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cfg = await res.json();
  } catch (err) {
    console.error('[wiki-loader] Failed to load config.json:', err);
    return;
  }

  applyAccentColors(cfg.theme);
  applyNoise(cfg.noise);
  if (cfg.font?.files?.length || cfg.font?.path) injectFont(cfg.font);
  patchMeta(cfg.site);

  /* Set __cfg immediately so wiki.js waitForCfg unblocks even if wiki/index.json is slow */
  const wikiDir = cfg.wikiDir || 'wiki';
  cfg.wikiDir  = wikiDir;
  cfg.articles = [];
  window.__cfg = cfg;

  /* ── 2. Load wiki index ── */
  try {
    const res = await fetch(`${wikiDir}/index.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const idx = await res.json();
    cfg.articles = Array.isArray(idx.articles) ? idx.articles : [];
    window.__cfg = cfg; /* re-signal with articles populated */
  } catch (err) {
    console.error('[wiki-loader] Failed to load wiki/index.json:', err);
  }

  renderSidebar(cfg.articles);

})();


/* ════════════════════════════════════════════════════════════
   SIDEBAR
   ════════════════════════════════════════════════════════════ */
function renderSidebar(articles) {
  const list = document.getElementById('article-list');
  if (!list) return;
  list.innerHTML = '';

  const hashId = decodeURIComponent(location.hash.slice(1));

  articles.forEach((article, i) => {
    const isActive = hashId ? article.id === hashId : i === 0;

    const li = document.createElement('li');
    li.className = 'version-item wiki-article-item' + (isActive ? ' active' : '');
    li.dataset.articleId = article.id;

    const btn = document.createElement('button');
    btn.className = 'version-btn';
    btn.setAttribute('aria-label', article.titleEn);
    btn.innerHTML = `
      <span class="version-btn-tag wiki-article-title">
        <span class="wiki-article-icon">${getIcon(article.icon)}</span>
        <span class="t" data-ru="${escHtml(article.titleRu)}" data-en="${escHtml(article.titleEn)}">${escHtml(article.titleRu)}</span>
      </span>
    `;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.wiki-article-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      const encoded = encodeURIComponent(article.id);
      if (location.hash !== '#' + encoded) history.pushState(null, '', '#' + encoded);
      if (typeof renderArticle === 'function') renderArticle(article);
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-backdrop')?.classList.remove('open');
    });

    li.appendChild(btn);
    list.appendChild(li);
  });
}


/* ════════════════════════════════════════════════════════════
   ICONS (inline SVG by name)
   ════════════════════════════════════════════════════════════ */
function getIcon(name) {
  const icons = {
    home:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    rocket: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
    layers: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    cpu:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    book:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  };
  return icons[name] || icons.book;
}


/* ════════════════════════════════════════════════════════════
   ACCENT COLORS
   ════════════════════════════════════════════════════════════ */
function applyAccentColors({ accentDark, accentLight } = {}) {
  const root = document.documentElement.style;
  if (accentDark)  root.setProperty('--accent-dark',  accentDark);
  if (accentLight) root.setProperty('--accent-light', accentLight);

  const dark  = accentDark  || getComputedStyle(document.documentElement).getPropertyValue('--accent-dark').trim();
  const light = accentLight || getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim();

  if (dark) {
    root.setProperty('--border-dark',       hexToRgba(dark, 0.18));
    root.setProperty('--glow-dark',         hexToRgba(dark, 0.12));
    root.setProperty('--gradient-top-dark', hexToRgba(dark, 0.15));
    root.setProperty('--gradient-bot-dark', hexToRgba(dark, 0.08));
  }
  if (light) {
    root.setProperty('--border-light',       hexToRgba(light, 0.25));
    root.setProperty('--glow-light',         hexToRgba(light, 0.15));
    root.setProperty('--gradient-top-light', hexToRgba(light, 0.18));
    root.setProperty('--gradient-bot-light', hexToRgba(light, 0.10));
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


/* ════════════════════════════════════════════════════════════
   NOISE
   ════════════════════════════════════════════════════════════ */
function applyNoise({ frequency = 0.65, octaves = 1 } = {}) {
  const svg = [
    `<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'>`,
    `<filter id='n' color-interpolation-filters='linearRGB'>`,
    `<feTurbulence type='turbulence' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch'/>`,
    `<feColorMatrix type='saturate' values='0'/>`,
    `</filter>`,
    `<rect width='100%' height='100%' filter='url(#n)' opacity='0.06'/>`,
    `</svg>`,
  ].join('');
  const encoded = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  document.documentElement.style.setProperty('--noise-svg', encoded);
}


/* ════════════════════════════════════════════════════════════
   FONT
   ════════════════════════════════════════════════════════════ */
function injectFont(fontCfg) {
  const { family, fallback } = fontCfg;
  const files = Array.isArray(fontCfg.files)
    ? fontCfg.files
    : [{ path: fontCfg.path, weight: fontCfg.weight, variable: fontCfg.variable }];

  const rules = files.map(f => buildFontFace(family, f)).join('\n');
  const style = document.createElement('style');
  style.textContent = rules;
  document.head.appendChild(style);
  document.body.style.fontFamily = `'${family}', ${fallback || 'sans-serif'}`;
}

function buildFontFace(family, { path, weight, variable }) {
  const isVar = variable !== undefined ? Boolean(variable) : false;
  const fw = isVar ? '100 900' : (weight || 'normal');
  const fmt = isVar ? 'woff2-variations' : 'woff2';
  return `@font-face { font-family: '${family}'; src: url('${path}') format('${fmt}'); font-weight: ${fw}; font-style: normal; font-display: swap; }`;
}


/* ════════════════════════════════════════════════════════════
   META
   ════════════════════════════════════════════════════════════ */
function patchMeta(site = {}) {
  const nameEl = document.getElementById('topbar-project');
  if (nameEl && site.project) nameEl.textContent = site.project;

  const repoEl = document.getElementById('repo-link');
  if (repoEl) {
    if (site.repoUrl) repoEl.href = site.repoUrl;
    else              repoEl.style.display = 'none';
  }

  const backEl = document.getElementById('portfolio-link');
  if (backEl) {
    if (site.portfolioUrl) backEl.href = site.portfolioUrl;
    else                   backEl.style.display = 'none';
  }
}


/* ── Helpers ── */
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

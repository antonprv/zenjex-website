/* ============================================================
   wiki-loader.js — loads config.json + wiki/articles.json,
   applies theme/font/noise, renders sidebar.
   ============================================================ */

(async function bootstrap() {

  /* 1. config.json */
  let cfg;
  try {
    const r = await fetch('config.json');
    if (!r.ok) throw new Error('config.json ' + r.status);
    cfg = await r.json();
  } catch (e) {
    console.error('[wiki-loader]', e);
    return;
  }

  applyAccentColors(cfg.theme);
  applyNoise(cfg.noise);
  if (cfg.font?.files?.length || cfg.font?.path) injectFont(cfg.font);
  patchMeta(cfg.site);

  /* 2. articles.json — single fetch, all languages bundled */
  const wikiDir = cfg.wikiDir || 'wiki';
  let articles = [];
  try {
    const r = await fetch(wikiDir + '/articles.json');
    if (!r.ok) throw new Error('articles.json ' + r.status);
    const data = await r.json();
    articles = Array.isArray(data.articles) ? data.articles : [];
  } catch (e) {
    console.error('[wiki-loader]', e);
    document.getElementById('article-content').innerHTML =
      '<div class="wiki-error">Could not load wiki/articles.json: ' + e.message + '</div>';
  }

  cfg.wikiDir  = wikiDir;
  cfg.articles = articles;
  window.__cfg = cfg;

  renderSidebar(articles);

})();


/* ── Sidebar ── */
function renderSidebar(articles) {
  const list = document.getElementById('article-list');
  if (!list) return;
  list.innerHTML = '';

  const hashId = decodeURIComponent(location.hash.slice(1));

  articles.forEach((article, i) => {
    const isActive = hashId ? article.id === hashId : i === 0;

    const li  = document.createElement('li');
    li.className = 'version-item wiki-article-item' + (isActive ? ' active' : '');
    li.dataset.articleId = article.id;

    const btn = document.createElement('button');
    btn.className = 'version-btn';
    btn.innerHTML = `
      <span class="version-btn-tag wiki-article-title">
        <span class="wiki-article-icon">${getIcon(article.icon)}</span>
        <span class="t" data-ru="${esc(article.titleRu)}" data-en="${esc(article.titleEn)}">${esc(article.titleRu)}</span>
      </span>`;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.wiki-article-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      const enc = encodeURIComponent(article.id);
      if (location.hash !== '#' + enc) history.pushState(null, '', '#' + enc);
      if (typeof renderArticle === 'function') renderArticle(article);
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-backdrop')?.classList.remove('open');
    });

    li.appendChild(btn);
    list.appendChild(li);
  });
}

function getIcon(name) {
  const m = {
    home:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    rocket: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/></svg>',
    layers: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    cpu:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  };
  return m[name] || m.home;
}

/* ── Theme / noise / font / meta (identical to config-loader.js) ── */
function applyAccentColors({ accentDark, accentLight } = {}) {
  const r = document.documentElement.style;
  if (accentDark)  r.setProperty('--accent-dark',  accentDark);
  if (accentLight) r.setProperty('--accent-light', accentLight);
  const dark  = accentDark  || getComputedStyle(document.documentElement).getPropertyValue('--accent-dark').trim();
  const light = accentLight || getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim();
  if (dark) {
    r.setProperty('--border-dark',       rgba(dark, 0.18));
    r.setProperty('--glow-dark',         rgba(dark, 0.12));
    r.setProperty('--gradient-top-dark', rgba(dark, 0.15));
    r.setProperty('--gradient-bot-dark', rgba(dark, 0.08));
  }
  if (light) {
    r.setProperty('--border-light',       rgba(light, 0.25));
    r.setProperty('--glow-light',         rgba(light, 0.15));
    r.setProperty('--gradient-top-light', rgba(light, 0.18));
    r.setProperty('--gradient-bot-light', rgba(light, 0.10));
  }
}
function rgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function applyNoise({ frequency=0.65, octaves=1 } = {}) {
  const svg = `<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n' color-interpolation-filters='linearRGB'><feTurbulence type='turbulence' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.06'/></svg>`;
  document.documentElement.style.setProperty('--noise-svg', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}
function injectFont(f) {
  const files = Array.isArray(f.files) ? f.files : [{ path: f.path, weight: f.weight, variable: f.variable }];
  const rules = files.map(({ path, weight, variable }) => {
    const isVar = variable !== undefined ? Boolean(variable) : false;
    const fw  = isVar ? '100 900' : (weight || 'normal');
    const fmt = isVar ? 'woff2-variations' : 'woff2';
    return `@font-face{font-family:'${f.family}';src:url('${path}') format('${fmt}');font-weight:${fw};font-style:normal;font-display:swap;}`;
  }).join('');
  const s = document.createElement('style');
  s.textContent = rules;
  document.head.appendChild(s);
  document.body.style.fontFamily = `'${f.family}',${f.fallback || 'sans-serif'}`;
}
function patchMeta(site = {}) {
  const n = document.getElementById('topbar-project');
  if (n && site.project) n.textContent = site.project;
  const repo = document.getElementById('repo-link');
  if (repo) { if (site.repoUrl) repo.href = site.repoUrl; else repo.style.display = 'none'; }
  const back = document.getElementById('portfolio-link');
  if (back) { if (site.portfolioUrl) back.href = site.portfolioUrl; else back.style.display = 'none'; }
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

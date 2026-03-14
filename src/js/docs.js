/* ============================================================
   docs.js — mirrors app.js exactly.
   Polls window.__cfg, then fetches HTML fragments and injects
   them into #doc-content. No markdown parsing, no JS rendering.
   ============================================================ */

let _currentPage = null;

(function waitForCfg() {
  const cfg = window.__cfg;
  if (!cfg) { setTimeout(waitForCfg, 30); return; }

  const groups = cfg.docGroups || [];
  if (!groups.length) { setTimeout(waitForCfg, 30); return; }

  const lang = window.getCurrentLang?.() || 'ru';
  syncLangButtons(lang);

  window.addEventListener('popstate', () => {
    const id   = decodeURIComponent(location.hash.slice(1));
    const page = window.__cfg?.docPages?.[id];
    if (page) { renderDocPage(page); activateSidebarItem(id); }
  });

  const hashId = decodeURIComponent(location.hash.slice(1));
  const first  = groups[0]?.pages[0];
  const target = (hashId && cfg.docPages?.[hashId]) || first;
  if (target) renderDocPage(target);
}());


/* ════════════════════════════════════════════════════════════
   RENDER — fetch HTML fragment, inject into DOM
   ════════════════════════════════════════════════════════════ */
async function renderDocPage(page) {
  _currentPage = page;

  const lang    = window.getCurrentLang?.() || 'ru';
  const encoded = encodeURIComponent(page.id);
  if (location.hash !== '#' + encoded) history.pushState(null, '', '#' + encoded);

  document.title = `${lang === 'ru' ? page.titleRu : page.titleEn} — ${window.__cfg?.site?.project || 'Docs'}`;

  const content = document.getElementById('doc-content');
  if (!content) return;

  content.innerHTML = '';

  /* Page header */
  const header = document.createElement('div');
  header.className = 'doc-page-header reveal';
  const h1 = document.createElement('h1');
  h1.className = 'doc-page-title';
  h1.textContent = lang === 'ru' ? page.titleRu : page.titleEn;
  header.appendChild(h1);
  content.appendChild(header);

  const rule = document.createElement('div');
  rule.className = 'release-rule';
  content.appendChild(rule);

  /* Fetch and inject the HTML fragment */
  const docsDir = window.__cfg?.docsDir || 'docs';
  const url     = `${docsDir}/${page._cat}/${page.id}.html`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();

    const wrap = document.createElement('div');
    wrap.className = 'doc-fragment';
    wrap.innerHTML = html;
    content.appendChild(wrap);

    /* Apply current language */
    applyLang(wrap, lang);

  } catch (e) {
    console.error('[docs] fetch fragment:', e);
    const err = document.createElement('div');
    err.className = 'empty-state';
    err.textContent = `Could not load ${url}: ${e.message}`;
    content.appendChild(err);
  }

  /* Prev/next nav */
  const nav = buildNav(page);
  if (nav) content.appendChild(nav);

  content.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ── Apply language: show ru or en body block ── */
function applyLang(container, lang) {
  const ru = container.querySelector('#doc-body-ru');
  const en = container.querySelector('#doc-body-en');
  if (ru) ru.style.display = lang === 'ru' ? '' : 'none';
  if (en) en.style.display = lang === 'en' ? '' : 'none';
}


/* ── Re-render on language switch (called by lang.js) ── */
function rerenderCurrentLang(lang) {
  syncLangButtons(lang);

  document.querySelectorAll('#doc-list .t').forEach(el => {
    const v = el.getAttribute('data-' + lang);
    if (v !== null) el.textContent = v;
  });

  if (!_currentPage) return;

  /* Update page title */
  const h1 = document.querySelector('.doc-page-title');
  if (h1) h1.textContent = lang === 'ru' ? _currentPage.titleRu : _currentPage.titleEn;

  /* Swap body blocks */
  const wrap = document.querySelector('.doc-fragment');
  if (wrap) applyLang(wrap, lang);
}


/* ── Prev / Next navigation ── */
function buildNav(page) {
  const groups   = window.__cfg?.docGroups || [];
  const allPages = groups.flatMap(g => g.pages);
  const idx      = allPages.findIndex(p => p.id === page.id);
  if (idx < 0) return null;

  const prev = allPages[idx - 1] || null;
  const next = allPages[idx + 1] || null;
  if (!prev && !next) return null;

  const nav = document.createElement('div');
  nav.className = 'doc-page-nav';

  const makeLink = (p, labelRu, labelEn) => {
    if (!p) return document.createElement('div');
    const a = document.createElement('button');
    a.className = 'doc-nav-link';
    a.innerHTML = `<span class="t" data-ru="${labelRu}" data-en="${labelEn}">${labelRu}</span><span class="doc-nav-title">${lang === 'ru' ? p.titleRu : p.titleEn}</span>`;
    a.addEventListener('click', () => {
      activateSidebarItem(p.id);
      renderDocPage(p);
    });
    return a;
  };

  const lang = window.getCurrentLang?.() || 'ru';
  nav.appendChild(makeLink(prev, '← Назад', '← Previous'));
  nav.appendChild(makeLink(next, 'Далее →',  'Next →'));
  return nav;
}


/* ── Helpers ── */
function activateSidebarItem(id) {
  document.querySelectorAll('.doc-page-item').forEach(el => {
    el.classList.toggle('active', el.dataset.pageId === id);
  });
}
function syncLangButtons(lang) {
  document.getElementById('btn-ru')?.classList.toggle('active', lang === 'ru');
  document.getElementById('btn-en')?.classList.toggle('active', lang === 'en');
}

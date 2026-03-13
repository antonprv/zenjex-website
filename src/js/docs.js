/* ============================================================
   docs.js — renders documentation pages using marked.js
   Content comes from window.__cfg.docPages (no extra fetches)
   ============================================================ */

(function init() {
  const cfg = window.__cfg;
  if (!cfg || !cfg.docGroups) { setTimeout(init, 20); return; }
  if (!cfg.docGroups.length)  { setTimeout(init, 20); return; }
  start(cfg);
})();

function start(cfg) {
  syncLangButtons(window.getCurrentLang?.() || 'ru');

  window.addEventListener('popstate', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const page = window.__cfg?.docPages?.[id];
    if (page) { renderDocPage(page); activateSidebarItem(id); }
  });

  const hashId = decodeURIComponent(location.hash.slice(1));
  const firstPage = cfg.docGroups[0]?.pages[0];
  const target = (hashId && cfg.docPages[hashId]) || firstPage;
  if (target) renderDocPage(target);
}


/* ════════════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════════════ */
function renderDocPage(page) {
  const content = document.getElementById('doc-content');
  if (!content) return;

  const lang = window.getCurrentLang?.() || 'ru';
  const enc  = encodeURIComponent(page.id);
  if (location.hash !== '#' + enc) history.pushState(null, '', '#' + enc);

  const title = lang === 'ru' ? page.titleRu : page.titleEn;
  document.title = title + ' — ' + (window.__cfg?.site?.project || 'Docs');

  const md = (lang === 'ru' ? page.contentRu : page.contentEn) || page.contentEn || page.contentRu || '';

  if (!md.trim()) {
    content.innerHTML = '<div class="wiki-error">No content for this page.</div>';
    return;
  }

  if (typeof marked === 'undefined') {
    content.innerHTML = '<div class="wiki-error">marked.js not loaded.</div>';
    return;
  }

  content.innerHTML = '<div class="wiki-body reveal">' + marked.parse(md) + '</div>';
  content.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Language switch (called by lang.js) ── */
function rerenderCurrentLang(lang) {
  syncLangButtons(lang);

  /* Update sidebar labels */
  document.querySelectorAll('#doc-list .t').forEach(el => {
    const v = el.getAttribute('data-' + lang);
    if (v !== null) el.textContent = v;
  });

  /* Re-render current page */
  const id   = decodeURIComponent(location.hash.slice(1));
  const page = window.__cfg?.docPages?.[id];
  if (page) renderDocPage(page);
}


/* ── helpers ── */
function activateSidebarItem(id) {
  document.querySelectorAll('.doc-page-item').forEach(el => {
    el.classList.toggle('active', el.dataset.pageId === id);
  });
}
function syncLangButtons(lang) {
  document.getElementById('btn-ru')?.classList.toggle('active', lang === 'ru');
  document.getElementById('btn-en')?.classList.toggle('active', lang === 'en');
}

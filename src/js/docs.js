/* ============================================================
   docs.js — renders documentation pages.
   Polls for window.__cfg.docGroups (set by docs-loader.js),
   then renders the first page. Same pattern as app.js.
   ============================================================ */

(function waitForData() {
  var cfg = window.__cfg;
  if (!cfg || !cfg.docGroups || !cfg.docGroups.length) {
    setTimeout(waitForData, 30);
    return;
  }
  start(cfg);
}());

function start(cfg) {
  /* Sync lang buttons */
  var lang = (window.getCurrentLang && window.getCurrentLang()) || 'ru';
  syncLangButtons(lang);

  /* Back/forward navigation */
  window.addEventListener('popstate', function () {
    var id = decodeURIComponent(location.hash.slice(1));
    var page = window.__cfg && window.__cfg.docPages && window.__cfg.docPages[id];
    if (page) { renderDocPage(page); activateSidebarItem(id); }
  });

  /* Render initial page */
  var hashId = decodeURIComponent(location.hash.slice(1));
  var firstPage = cfg.docGroups[0] && cfg.docGroups[0].pages[0];
  var target = (hashId && cfg.docPages[hashId]) || firstPage;
  if (target) renderDocPage(target);
}


/* ════════════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════════════ */
function renderDocPage(page) {
  var content = document.getElementById('doc-content');
  if (!content) return;

  var lang = (window.getCurrentLang && window.getCurrentLang()) || 'ru';

  var enc = encodeURIComponent(page.id);
  if (location.hash !== '#' + enc) history.pushState(null, '', '#' + enc);

  var title = lang === 'ru' ? page.titleRu : page.titleEn;
  document.title = title + ' \u2014 ' + (window.__cfg && window.__cfg.site && window.__cfg.site.project || 'Docs');

  var md = (lang === 'ru' && page.contentRu) ? page.contentRu
         : (page.contentEn)                  ? page.contentEn
         : (page.contentRu)                  ? page.contentRu
         : '';

  if (!md || !md.trim()) {
    content.innerHTML = '<div class="wiki-error">No content.</div>';
    return;
  }

  if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
    content.innerHTML = '<div class="wiki-error">Parser not loaded.</div>';
    return;
  }

  var html = marked.parse(md);
  content.innerHTML = '<div class="wiki-body reveal">' + html + '</div>';
  content.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ── Language switch — called by lang.js ── */
function rerenderCurrentLang(lang) {
  syncLangButtons(lang);

  document.querySelectorAll('#doc-list .t').forEach(function (el) {
    var v = el.getAttribute('data-' + lang);
    if (v !== null) el.textContent = v;
  });

  var id = decodeURIComponent(location.hash.slice(1));
  var page = window.__cfg && window.__cfg.docPages && window.__cfg.docPages[id];
  if (page) renderDocPage(page);
}


/* ── Helpers ── */
function activateSidebarItem(id) {
  document.querySelectorAll('.doc-page-item').forEach(function (el) {
    el.classList.toggle('active', el.dataset.pageId === id);
  });
}

function syncLangButtons(lang) {
  var ru = document.getElementById('btn-ru');
  var en = document.getElementById('btn-en');
  if (ru) ru.classList.toggle('active', lang === 'ru');
  if (en) en.classList.toggle('active', lang === 'en');
}

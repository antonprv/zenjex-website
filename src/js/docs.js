/* ============================================================
   docs.js — defines renderDocPage() and rerenderCurrentLang()
   These are called by docs-loader.js after data is ready.
   ============================================================ */

window.addEventListener('popstate', function () {
  var id = decodeURIComponent(location.hash.slice(1));
  var cfg = window.__cfg;
  if (!cfg || !cfg.docPages) return;
  var page = cfg.docPages[id];
  if (page) { renderDocPage(page); activateSidebarItem(id); }
});

function renderDocPage(page) {
  var content = document.getElementById('doc-content');
  if (!content) { console.error('[docs] #doc-content not found'); return; }

  var lang = (window.getCurrentLang && window.getCurrentLang()) || 'ru';
  var enc  = encodeURIComponent(page.id);
  if (location.hash !== '#' + enc) history.pushState(null, '', '#' + enc);

  var title = lang === 'ru' ? page.titleRu : page.titleEn;
  document.title = title + ' \u2014 ' + (window.__cfg && window.__cfg.site && window.__cfg.site.project || 'Docs');

  var md = '';
  if (lang === 'ru' && page.contentRu) md = page.contentRu;
  else if (page.contentEn) md = page.contentEn;
  else if (page.contentRu) md = page.contentRu;

  if (!md || !md.trim()) {
    content.innerHTML = '<div class="wiki-error">No content.</div>';
    return;
  }

  if (typeof marked === 'undefined') {
    content.innerHTML = '<div class="wiki-error">marked.js not loaded. Check network.</div>';
    return;
  }

  try {
    var html = marked.parse(md);
    content.innerHTML = '<div class="wiki-body reveal">' + html + '</div>';
    content.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    console.error('[docs] marked.parse error:', e);
    content.innerHTML = '<div class="wiki-error">Parse error: ' + e.message + '</div>';
  }
}

function rerenderCurrentLang(lang) {
  /* Update sidebar labels */
  document.querySelectorAll('#doc-list .t').forEach(function (el) {
    var v = el.getAttribute('data-' + lang);
    if (v !== null) el.textContent = v;
  });
  /* Re-render current page */
  var id = decodeURIComponent(location.hash.slice(1));
  var cfg = window.__cfg;
  if (!cfg || !cfg.docPages) return;
  var page = cfg.docPages[id];
  if (page) renderDocPage(page);
}

function activateSidebarItem(id) {
  document.querySelectorAll('.doc-page-item').forEach(function (el) {
    el.classList.toggle('active', el.dataset.pageId === id);
  });
}

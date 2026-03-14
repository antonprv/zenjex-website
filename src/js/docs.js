/* ============================================================
   docs.js — Renders documentation pages from JSON blocks.

   Block types:
     { "type": "heading",   "level": 1-4, "text": "..." }
     { "type": "paragraph", "text": "..." }
     { "type": "list",      "items": ["..."] }
     { "type": "ordered",   "items": ["..."] }
     { "type": "code",      "lang": "csharp", "text": "..." }
     { "type": "note",      "text": "..." }
     { "type": "table",     "head": ["..."], "rows": [["..."]] }
     { "type": "rule" }

   Inline syntax in text/items:
     backtick code backtick  → <code>
     **bold**                → <strong>
     [text](url)             → <a>
   ============================================================ */

var _currentPage = null;

/* ── Wait for data (mirrors app.js pattern) ── */
(function waitForCfg() {
  var cfg = window.__cfg;
  if (!cfg || !cfg.docGroups || !cfg.docGroups.length) {
    requestAnimationFrame(waitForCfg);
    return;
  }

  var lang = (window.getCurrentLang && window.getCurrentLang()) || 'ru';
  syncLangButtons(lang);

  window.addEventListener('popstate', function() {
    var id   = decodeURIComponent(location.hash.slice(1));
    var page = window.__cfg && window.__cfg.docPages && window.__cfg.docPages[id];
    if (page) { renderDocPage(page); activateSidebarItem(id); }
  });

  var hashId = decodeURIComponent(location.hash.slice(1));
  var first  = cfg.docGroups[0] && cfg.docGroups[0].pages[0];
  var target = (hashId && cfg.docPages && cfg.docPages[hashId]) || first;
  if (target) renderDocPage(target);
}());


/* ════════════════════════════════════════════════════════════
   RENDER PAGE
   ════════════════════════════════════════════════════════════ */
function renderDocPage(page) {
  _currentPage = page;

  var lang    = (window.getCurrentLang && window.getCurrentLang()) || 'ru';
  var encoded = encodeURIComponent(page.id);
  if (location.hash !== '#' + encoded) history.pushState(null, '', '#' + encoded);

  document.title = (lang === 'ru' ? page.titleRu : page.titleEn)
    + ' \u2014 ' + ((window.__cfg && window.__cfg.site && window.__cfg.site.project) || 'Docs');

  var content = document.getElementById('doc-content');
  if (!content) return;

  content.innerHTML = '';

  /* Page header */
  var header = document.createElement('div');
  header.className = 'doc-page-header reveal';
  var h1 = document.createElement('h1');
  h1.className = 'doc-page-title';
  h1.textContent = lang === 'ru' ? page.titleRu : page.titleEn;
  header.appendChild(h1);
  content.appendChild(header);

  var rule = document.createElement('div');
  rule.className = 'release-rule';
  content.appendChild(rule);

  /* Body */
  var body = document.createElement('div');
  body.className = 'doc-body reveal';

  var blocks = page[lang] || page.ru || [];
  if (!blocks.length) {
    body.appendChild(buildEmpty());
  } else {
    blocks.forEach(function(block) { body.appendChild(buildBlock(block)); });
  }

  content.appendChild(body);
  content.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Re-render on language switch (called by lang.js) ── */
function rerenderCurrentLang(lang) {
  syncLangButtons(lang);

  document.querySelectorAll('#doc-list .t').forEach(function(el) {
    var v = el.getAttribute('data-' + lang);
    if (v !== null) el.textContent = v;
  });

  if (!_currentPage) return;

  var body = document.querySelector('.doc-body');
  if (!body) { renderDocPage(_currentPage); return; }

  body.style.opacity    = '0';
  body.style.transition = 'opacity 0.18s ease';
  setTimeout(function() {
    body.innerHTML = '';
    var blocks = _currentPage[lang] || _currentPage.ru || [];
    blocks.forEach(function(block) { body.appendChild(buildBlock(block)); });
    body.style.opacity = '1';

    var h1 = document.querySelector('.doc-page-title');
    if (h1) h1.textContent = lang === 'ru' ? _currentPage.titleRu : _currentPage.titleEn;
  }, 180);
}


/* ════════════════════════════════════════════════════════════
   BLOCK BUILDERS
   ════════════════════════════════════════════════════════════ */
function buildBlock(block) {
  switch (block.type) {
    case 'heading':   return buildHeading(block);
    case 'paragraph': return buildParagraph(block);
    case 'list':      return buildList(block, false);
    case 'ordered':   return buildList(block, true);
    case 'code':      return buildCode(block);
    case 'note':      return buildNote(block);
    case 'table':     return buildTable(block);
    case 'rule':      return buildRule();
    default: {
      var el = document.createElement('p');
      el.className = 'doc-paragraph';
      el.textContent = JSON.stringify(block);
      return el;
    }
  }
}

function buildHeading(block) {
  var level = Math.max(1, Math.min(4, block.level || 2));
  var el = document.createElement('h' + level);
  el.className = 'doc-heading doc-heading--' + level;
  el.id = slugify(block.text || '');
  el.innerHTML = renderInline(block.text || '');
  return el;
}

function buildParagraph(block) {
  var el = document.createElement('p');
  el.className = 'doc-paragraph';
  el.innerHTML = renderInline(block.text || '');
  return el;
}

function buildList(block, ordered) {
  var tag = ordered ? 'ol' : 'ul';
  var el  = document.createElement(tag);
  el.className = 'doc-list' + (ordered ? ' doc-list--ordered' : '');
  (block.items || []).forEach(function(item) {
    var li = document.createElement('li');
    li.className = 'doc-list-item';
    li.innerHTML = '<span class="doc-list-item-text">' + renderInline(item) + '</span>';
    el.appendChild(li);
  });
  return el;
}

function buildCode(block) {
  var wrap = document.createElement('div');
  wrap.className = 'doc-code-wrap';

  if (block.lang) {
    var label = document.createElement('span');
    label.className = 'doc-code-lang';
    label.textContent = block.lang;
    wrap.appendChild(label);
  }

  var pre  = document.createElement('pre');
  var code = document.createElement('code');
  code.className = block.lang ? 'language-' + block.lang : '';
  code.textContent = block.text || '';
  pre.appendChild(code);
  wrap.appendChild(pre);
  return wrap;
}

function buildNote(block) {
  var el = document.createElement('div');
  el.className = 'doc-note';
  el.innerHTML =
    '<svg class="doc-note-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
    '<span class="doc-note-text">' + renderInline(block.text || '') + '</span>';
  return el;
}

function buildTable(block) {
  var wrap = document.createElement('div');
  wrap.className = 'doc-table-wrap';

  var table = document.createElement('table');
  table.className = 'doc-table';

  if (block.head && block.head.length) {
    var thead = document.createElement('thead');
    var htr   = document.createElement('tr');
    block.head.forEach(function(cell) {
      var th = document.createElement('th');
      th.innerHTML = renderInline(cell);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
  }

  if (block.rows && block.rows.length) {
    var tbody = document.createElement('tbody');
    block.rows.forEach(function(row) {
      var tr = document.createElement('tr');
      var cells = Array.isArray(row) ? row : [row];
      cells.forEach(function(cell) {
        var td = document.createElement('td');
        td.innerHTML = renderInline(String(cell));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  wrap.appendChild(table);
  return wrap;
}

function buildRule() {
  var el = document.createElement('div');
  el.className = 'doc-rule';
  return el;
}

function buildEmpty() {
  var div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0120 9.414V19a2 2 0 01-2 2z"/></svg><span>No content.</span>';
  return div;
}


/* ════════════════════════════════════════════════════════════
   INLINE RENDERER
   ════════════════════════════════════════════════════════════ */
function renderInline(text) {
  return escHtml(text)
    .replace(/`([^`]+)`/g, function(_, c) { return '<code>' + c + '</code>'; })
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, t, href) {
      var ext = /^https?:\/\//.test(href);
      return '<a href="' + escHtml(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + t + '</a>';
    });
}


/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(s) {
  return s.toLowerCase().replace(/[^\wа-яёА-ЯЁ\s\-]/g, '').replace(/\s+/g, '-');
}

function syncLangButtons(lang) {
  var ru = document.getElementById('btn-ru');
  var en = document.getElementById('btn-en');
  if (ru) ru.classList.toggle('active', lang === 'ru');
  if (en) en.classList.toggle('active', lang === 'en');
}

function activateSidebarItem(id) {
  document.querySelectorAll('.doc-page-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.pageId === id);
  });
}

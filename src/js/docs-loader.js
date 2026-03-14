/* ============================================================
   docs-loader.js
   Loads config + all docs pages, then sets window.__cfg.
   docs.js polls window.__cfg.docGroups and starts when ready.
   ============================================================ */
(async function () {

  /* 1. config.json */
  var cfg;
  try {
    var r0 = await fetch('config.json');
    if (!r0.ok) throw new Error('config.json: HTTP ' + r0.status);
    cfg = await r0.json();
  } catch (e) {
    console.error('[docs-loader]', e);
    return;
  }

  /* Apply theme immediately */
  _applyTheme(cfg);

  /* 2. Load all docs */
  var docsDir   = cfg.docsDir || 'docs';
  var docGroups = [];
  var docPages  = {};

  try {
    var ri = await fetch(docsDir + '/index.json');
    if (!ri.ok) throw new Error(docsDir + '/index.json: HTTP ' + ri.status);
    var rootIdx = await ri.json();
    var cats    = rootIdx.categories || [];

    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      var rc  = await fetch(docsDir + '/' + cat + '/index.json');
      if (!rc.ok) { console.warn('[docs-loader] skip', cat); continue; }
      var catIdx    = await rc.json();
      var pageFiles = catIdx.pages || [];
      var pages     = [];

      for (var pi = 0; pi < pageFiles.length; pi++) {
        var rp = await fetch(docsDir + '/' + cat + '/' + pageFiles[pi]);
        if (!rp.ok) { console.warn('[docs-loader] skip', pageFiles[pi]); continue; }
        var page = await rp.json();
        pages.push(page);
        docPages[page.id] = page;
      }

      docGroups.push({ folder: cat, titleRu: catIdx.titleRu, titleEn: catIdx.titleEn, pages: pages });
    }
  } catch (e) {
    console.error('[docs-loader]', e);
  }

  /* 3. Commit — docs.js is polling for this */
  cfg.docsDir   = docsDir;
  cfg.docGroups = docGroups;
  cfg.docPages  = docPages;
  window.__cfg  = cfg;

  /* 4. Sidebar */
  _renderSidebar(docGroups);

}());


/* ── Sidebar ── */
function _renderSidebar(groups) {
  var list = document.getElementById('doc-list');
  if (!list) return;
  list.innerHTML = '';

  var hashId    = decodeURIComponent(location.hash.slice(1));
  var firstPage = true;

  groups.forEach(function (group) {
    var groupEl = document.createElement('li');
    groupEl.className = 'version-group';

    var label = document.createElement('div');
    label.className = 'version-group-label';
    label.innerHTML = '<span class="t" data-ru="' + _esc(group.titleRu) + '" data-en="' + _esc(group.titleEn) + '">' + _esc(group.titleRu) + '</span>';
    groupEl.appendChild(label);

    var sub = document.createElement('ul');
    sub.className = 'version-sublist';

    group.pages.forEach(function (page) {
      var active = hashId ? page.id === hashId : firstPage;
      firstPage  = false;

      var li  = document.createElement('li');
      li.className   = 'version-item doc-page-item' + (active ? ' active' : '');
      li.dataset.pageId = page.id;

      var btn = document.createElement('button');
      btn.className = 'version-btn';
      btn.innerHTML = '<span class="version-btn-tag"><span class="t" data-ru="' + _esc(page.titleRu) + '" data-en="' + _esc(page.titleEn) + '">' + _esc(page.titleRu) + '</span></span>';

      btn.addEventListener('click', function () {
        document.querySelectorAll('.doc-page-item').forEach(function (el) { el.classList.remove('active'); });
        li.classList.add('active');
        var enc = encodeURIComponent(page.id);
        if (location.hash !== '#' + enc) history.pushState(null, '', '#' + enc);
        if (typeof renderDocPage === 'function') renderDocPage(page);
        var sb = document.getElementById('sidebar');
        var bd = document.getElementById('sidebar-backdrop');
        if (sb) sb.classList.remove('open');
        if (bd) bd.classList.remove('open');
      });

      li.appendChild(btn);
      sub.appendChild(li);
    });

    groupEl.appendChild(sub);
    list.appendChild(groupEl);
  });
}


/* ── Theme / noise / font / meta ── */
function _applyTheme(cfg) {
  var t    = cfg.theme || {};
  var root = document.documentElement.style;
  if (t.accentDark)  root.setProperty('--accent-dark',  t.accentDark);
  if (t.accentLight) root.setProperty('--accent-light', t.accentLight);

  var dark  = t.accentDark  || getComputedStyle(document.documentElement).getPropertyValue('--accent-dark').trim();
  var light = t.accentLight || getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim();
  if (dark) {
    root.setProperty('--border-dark',        _rgba(dark, 0.18));
    root.setProperty('--glow-dark',          _rgba(dark, 0.12));
    root.setProperty('--gradient-top-dark',  _rgba(dark, 0.15));
    root.setProperty('--gradient-bot-dark',  _rgba(dark, 0.08));
  }
  if (light) {
    root.setProperty('--border-light',       _rgba(light, 0.25));
    root.setProperty('--glow-light',         _rgba(light, 0.15));
    root.setProperty('--gradient-top-light', _rgba(light, 0.18));
    root.setProperty('--gradient-bot-light', _rgba(light, 0.10));
  }

  var n   = cfg.noise || {};
  var svg = "<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='turbulence' baseFrequency='" + (n.frequency || 0.65) + "' numOctaves='" + (n.octaves || 1) + "' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.06'/></svg>";
  document.documentElement.style.setProperty('--noise-svg', 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")');

  var font = cfg.font;
  if (font) {
    var files = Array.isArray(font.files) ? font.files : [{ path: font.path, weight: font.weight, variable: font.variable }];
    var rules = files.map(function (f) {
      var isVar = f.variable !== undefined ? Boolean(f.variable) : false;
      return "@font-face{font-family:'" + font.family + "';src:url('" + f.path + "') format('" + (isVar ? 'woff2-variations' : 'woff2') + "');font-weight:" + (isVar ? '100 900' : (f.weight || 'normal')) + ";font-display:swap;}";
    }).join('');
    var s = document.createElement('style');
    s.textContent = rules;
    document.head.appendChild(s);
    document.body.style.fontFamily = "'" + font.family + "'," + (font.fallback || 'sans-serif');
  }

  var site = cfg.site || {};
  var el;
  el = document.getElementById('topbar-project'); if (el && site.project) el.textContent = site.project;
  el = document.getElementById('repo-link');      if (el) { if (site.repoUrl) el.href = site.repoUrl; else el.style.display = 'none'; }
  el = document.getElementById('portfolio-link'); if (el) { if (site.portfolioUrl) el.href = site.portfolioUrl; else el.style.display = 'none'; }
}

function _rgba(hex, a) {
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

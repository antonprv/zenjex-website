/* ============================================================
   docs-loader.js
   1. Loads config.json
   2. Loads docs/index.json -> category index files -> page files
   3. Populates window.__cfg with all data
   4. Calls renderSidebar() and renderFirstPage()
   ============================================================ */

(async function () {

  /* ── 1. config.json ── */
  var cfg;
  try {
    var r = await fetch('config.json');
    if (!r.ok) throw new Error('config.json HTTP ' + r.status);
    cfg = await r.json();
  } catch (e) {
    console.error('[docs] config failed:', e);
    var el = document.getElementById('doc-content');
    if (el) el.innerHTML = '<div class="wiki-error">Could not load config.json: ' + e.message + '</div>';
    return;
  }

  applyTheme(cfg);

  /* ── 2. docs ── */
  var docsDir = cfg.docsDir || 'docs';
  var docGroups = [];

  try {
    var ri = await fetch(docsDir + '/index.json');
    if (!ri.ok) throw new Error(docsDir + '/index.json HTTP ' + ri.status);
    var rootIdx = await ri.json();
    var cats = Array.isArray(rootIdx.categories) ? rootIdx.categories : [];

    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      try {
        var rc = await fetch(docsDir + '/' + cat + '/index.json');
        if (!rc.ok) throw new Error(cat + '/index.json HTTP ' + rc.status);
        var catIdx = await rc.json();
        var pageFiles = Array.isArray(catIdx.pages) ? catIdx.pages : [];
        var pages = [];

        for (var pi = 0; pi < pageFiles.length; pi++) {
          try {
            var rp = await fetch(docsDir + '/' + cat + '/' + pageFiles[pi]);
            if (!rp.ok) throw new Error(pageFiles[pi] + ' HTTP ' + rp.status);
            var page = await rp.json();
            pages.push(page);
          } catch (e) {
            console.warn('[docs] skipped page', pageFiles[pi], e.message);
          }
        }

        docGroups.push({
          folder: cat,
          titleRu: catIdx.titleRu || cat,
          titleEn: catIdx.titleEn || cat,
          pages: pages
        });
      } catch (e) {
        console.warn('[docs] skipped category', cat, e.message);
      }
    }
  } catch (e) {
    console.error('[docs] failed to load docs index:', e);
    var el2 = document.getElementById('doc-content');
    if (el2) el2.innerHTML = '<div class="wiki-error">Could not load docs: ' + e.message + '</div>';
    return;
  }

  /* ── 3. Build flat page map ── */
  var docPages = {};
  docGroups.forEach(function (g) {
    g.pages.forEach(function (p) { docPages[p.id] = p; });
  });

  /* ── 4. Store on window.__cfg ── */
  cfg.docsDir   = docsDir;
  cfg.docGroups = docGroups;
  cfg.docPages  = docPages;
  window.__cfg  = cfg;

  /* ── 5. Render sidebar ── */
  renderSidebar(docGroups);

  /* docs.js polls for window.__cfg.docGroups and renders the first page itself */

})();


/* ── Sidebar ── */
function renderSidebar(groups) {
  var list = document.getElementById('doc-list');
  if (!list) return;
  list.innerHTML = '';

  var hashId = decodeURIComponent(location.hash.slice(1));
  var firstPage = true;

  groups.forEach(function (group) {
    var groupEl = document.createElement('li');
    groupEl.className = 'version-group';

    var label = document.createElement('div');
    label.className = 'version-group-label';
    label.innerHTML = '<span class="t" data-ru="' + esc(group.titleRu) + '" data-en="' + esc(group.titleEn) + '">' + esc(group.titleRu) + '</span>';
    groupEl.appendChild(label);

    var subList = document.createElement('ul');
    subList.className = 'version-sublist';

    group.pages.forEach(function (page) {
      var isActive = hashId ? page.id === hashId : firstPage;
      firstPage = false;

      var li = document.createElement('li');
      li.className = 'version-item doc-page-item' + (isActive ? ' active' : '');
      li.dataset.pageId = page.id;

      var btn = document.createElement('button');
      btn.className = 'version-btn';
      btn.innerHTML = '<span class="version-btn-tag"><span class="t" data-ru="' + esc(page.titleRu) + '" data-en="' + esc(page.titleEn) + '">' + esc(page.titleRu) + '</span></span>';

      btn.addEventListener('click', function () {
        document.querySelectorAll('.doc-page-item').forEach(function (el) { el.classList.remove('active'); });
        li.classList.add('active');
        var enc = encodeURIComponent(page.id);
        if (location.hash !== '#' + enc) history.pushState(null, '', '#' + enc);
        if (typeof renderDocPage === 'function') renderDocPage(page);
        document.getElementById('sidebar') && document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-backdrop') && document.getElementById('sidebar-backdrop').classList.remove('open');
      });

      li.appendChild(btn);
      subList.appendChild(li);
    });

    groupEl.appendChild(subList);
    list.appendChild(groupEl);
  });
}


/* ── Theme/noise/font/meta ── */
function applyTheme(cfg) {
  var t = cfg.theme || {};
  var root = document.documentElement.style;
  if (t.accentDark)  root.setProperty('--accent-dark',  t.accentDark);
  if (t.accentLight) root.setProperty('--accent-light', t.accentLight);
  var dark  = t.accentDark  || getComputedStyle(document.documentElement).getPropertyValue('--accent-dark').trim();
  var light = t.accentLight || getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim();
  if (dark) {
    root.setProperty('--border-dark',       rgba(dark,  0.18));
    root.setProperty('--glow-dark',         rgba(dark,  0.12));
    root.setProperty('--gradient-top-dark', rgba(dark,  0.15));
    root.setProperty('--gradient-bot-dark', rgba(dark,  0.08));
  }
  if (light) {
    root.setProperty('--border-light',       rgba(light, 0.25));
    root.setProperty('--glow-light',         rgba(light, 0.15));
    root.setProperty('--gradient-top-light', rgba(light, 0.18));
    root.setProperty('--gradient-bot-light', rgba(light, 0.10));
  }

  var noise = cfg.noise || {};
  var freq = noise.frequency || 0.65, oct = noise.octaves || 1;
  var svg = "<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n' color-interpolation-filters='linearRGB'><feTurbulence type='turbulence' baseFrequency='" + freq + "' numOctaves='" + oct + "' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.06'/></svg>";
  document.documentElement.style.setProperty('--noise-svg', 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")');

  var font = cfg.font;
  if (font && (font.files || font.path)) {
    var files = Array.isArray(font.files) ? font.files : [{ path: font.path, weight: font.weight, variable: font.variable }];
    var rules = files.map(function (f) {
      var isVar = f.variable !== undefined ? Boolean(f.variable) : false;
      return "@font-face{font-family:'" + font.family + "';src:url('" + f.path + "') format('" + (isVar ? 'woff2-variations' : 'woff2') + "');font-weight:" + (isVar ? '100 900' : (f.weight || 'normal')) + ";font-style:normal;font-display:swap;}";
    }).join('');
    var s = document.createElement('style');
    s.textContent = rules;
    document.head.appendChild(s);
    document.body.style.fontFamily = "'" + font.family + "'," + (font.fallback || 'sans-serif');
  }

  var site = cfg.site || {};
  var nameEl = document.getElementById('topbar-project');
  if (nameEl && site.project) nameEl.textContent = site.project;
  var repoEl = document.getElementById('repo-link');
  if (repoEl) { if (site.repoUrl) repoEl.href = site.repoUrl; else repoEl.style.display = 'none'; }
  var backEl = document.getElementById('portfolio-link');
  if (backEl) { if (site.portfolioUrl) backEl.href = site.portfolioUrl; else backEl.style.display = 'none'; }
}

function rgba(hex, a) {
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

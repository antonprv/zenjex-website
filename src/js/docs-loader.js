/* ============================================================
   docs-loader.js — Loads config.json + docs category folders.

   Structure mirrors releases/:
     docs/
       index.json              ← { "categories": ["getting-started", "internals"] }
       getting-started/
         index.json            ← { "titleRu", "titleEn", "pages": ["01-overview.json", ...] }
         01-overview.json      ← { "id", "titleRu", "titleEn", "contentEn", "contentRu" }
         ...
       internals/
         index.json
         01-zenjex.json
         ...

   To add a new page: create a .json file in the category folder
   and add its filename to the category's index.json "pages" array.
   To add a new category: create a folder with index.json and add
   the folder name to docs/index.json "categories" array.
   ============================================================ */

(async function bootstrap() {

  /* ── 1. config.json ── */
  let cfg;
  try {
    const r = await fetch('config.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    cfg = await r.json();
  } catch (e) {
    console.error('[docs-loader] config.json failed:', e);
    return;
  }

  applyAccentColors(cfg.theme);
  applyNoise(cfg.noise);
  if (cfg.font?.files?.length || cfg.font?.path) injectFont(cfg.font);
  patchMeta(cfg.site);

  /* ── 2. Load all doc categories and their pages ── */
  const docsDir = cfg.docsDir || 'docs';
  let docGroups = [];

  try {
    docGroups = await loadDocGroups(docsDir);
  } catch (e) {
    console.error('[docs-loader] Failed to load docs:', e);
    document.getElementById('doc-content').innerHTML =
      '<div class="wiki-error">Failed to load docs/index.json: ' + e.message + '</div>';
  }

  cfg.docsDir   = docsDir;
  cfg.docGroups = docGroups;

  /* Flat page map for quick lookup by id */
  cfg.docPages = {};
  docGroups.forEach(g => g.pages.forEach(p => { cfg.docPages[p.id] = p; }));

  window.__cfg = cfg;

  renderSidebar(docGroups);

})();


/* ════════════════════════════════════════════════════════════
   LOADER
   ════════════════════════════════════════════════════════════ */
async function loadDocGroups(dir) {
  const r = await fetch(dir + '/index.json');
  if (!r.ok) throw new Error(dir + '/index.json HTTP ' + r.status);
  const root = await r.json();
  const cats = Array.isArray(root.categories) ? root.categories : [];

  const results = await Promise.allSettled(cats.map(cat => loadCategory(dir, cat)));

  const groups = [];
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') groups.push(res.value);
    else console.warn('[docs-loader] Skipped category', cats[i], res.reason);
  });

  return groups;
}

async function loadCategory(dir, folder) {
  const r = await fetch(dir + '/' + folder + '/index.json');
  if (!r.ok) throw new Error(folder + '/index.json HTTP ' + r.status);
  const idx = await r.json();

  const files = Array.isArray(idx.pages) ? idx.pages : [];

  const results = await Promise.allSettled(
    files.map(async filename => {
      const pr = await fetch(dir + '/' + folder + '/' + filename);
      if (!pr.ok) throw new Error(filename + ' HTTP ' + pr.status);
      return pr.json();
    })
  );

  const pages = [];
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') pages.push(res.value);
    else console.warn('[docs-loader] Skipped page', files[i], res.reason);
  });

  return { folder, titleRu: idx.titleRu, titleEn: idx.titleEn, pages };
}


/* ════════════════════════════════════════════════════════════
   SIDEBAR
   ════════════════════════════════════════════════════════════ */
function renderSidebar(groups) {
  const list = document.getElementById('doc-list');
  if (!list) return;
  list.innerHTML = '';

  const hashId = decodeURIComponent(location.hash.slice(1));
  let firstPage = true;

  groups.forEach(group => {
    /* Category label */
    const groupEl = document.createElement('li');
    groupEl.className = 'version-group';

    const label = document.createElement('div');
    label.className = 'version-group-label';
    label.innerHTML = `<span class="t" data-ru="${esc(group.titleRu)}" data-en="${esc(group.titleEn)}">${esc(group.titleRu)}</span>`;
    groupEl.appendChild(label);

    /* Pages within category */
    const subList = document.createElement('ul');
    subList.className = 'version-sublist';

    group.pages.forEach(page => {
      const isActive = hashId ? page.id === hashId : firstPage;

      const li = document.createElement('li');
      li.className = 'version-item doc-page-item' + (isActive ? ' active' : '');
      li.dataset.pageId = page.id;

      const btn = document.createElement('button');
      btn.className = 'version-btn';
      btn.innerHTML = `
        <span class="version-btn-tag">
          <span class="t" data-ru="${esc(page.titleRu)}" data-en="${esc(page.titleEn)}">${esc(page.titleRu)}</span>
        </span>`;

      btn.addEventListener('click', () => {
        document.querySelectorAll('.doc-page-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        const enc = encodeURIComponent(page.id);
        if (location.hash !== '#' + enc) history.pushState(null, '', '#' + enc);
        if (typeof renderDocPage === 'function') renderDocPage(page);
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('open');
      });

      li.appendChild(btn);
      subList.appendChild(li);
      firstPage = false;
    });

    groupEl.appendChild(subList);
    list.appendChild(groupEl);
  });
}


/* ════════════════════════════════════════════════════════════
   THEME / NOISE / FONT / META  (identical to config-loader.js)
   ════════════════════════════════════════════════════════════ */
function applyAccentColors({ accentDark, accentLight } = {}) {
  const root = document.documentElement.style;
  if (accentDark)  root.setProperty('--accent-dark',  accentDark);
  if (accentLight) root.setProperty('--accent-light', accentLight);
  const dark  = accentDark  || getComputedStyle(document.documentElement).getPropertyValue('--accent-dark').trim();
  const light = accentLight || getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim();
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
    return `@font-face{font-family:'${f.family}';src:url('${path}') format('${isVar ? 'woff2-variations' : 'woff2'}');font-weight:${isVar ? '100 900' : (weight||'normal')};font-style:normal;font-display:swap;}`;
  }).join('');
  const s = document.createElement('style');
  s.textContent = rules;
  document.head.appendChild(s);
  document.body.style.fontFamily = `'${f.family}',${f.fallback||'sans-serif'}`;
}
function patchMeta(site = {}) {
  const n = document.getElementById('topbar-project');
  if (n && site.project) n.textContent = site.project;
  const repo = document.getElementById('repo-link');
  if (repo) { site.repoUrl ? (repo.href = site.repoUrl) : (repo.style.display = 'none'); }
  const back = document.getElementById('portfolio-link');
  if (back) { site.portfolioUrl ? (back.href = site.portfolioUrl) : (back.style.display = 'none'); }
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

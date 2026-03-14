# Zenjex — Changelog

A standalone changelog site for the [Zenjex](https://github.com/antonprv/zenjex) DI framework.
Same visual style as [portfolio-website](https://github.com/antonprv/portfolio-website) — shared accent colours, font, noise texture, light/dark theme, RU/EN language switcher.

The site is [currently live](https://antonprv.github.io/zenjex-website).

---

## Stack

Pure HTML · CSS · Vanilla JS. No build step, no dependencies.

## Structure

```
changelog/
├── index.html                  # Markup shell — content injected from config.json
├── config.json                 # Single config file — edit this to add releases
├── css/
│   ├── variables.css           # Design tokens & global reset (mirrors portfolio)
│   ├── animations.css          # Keyframes, scroll-reveal, language-fade helpers
│   ├── layout.css              # Topbar, sidebar, content area, footer
│   └── changelog.css           # Section cards, type badges, item lists, inline code
├── js/
│   ├── theme.js                # Light/dark toggle — runs first, prevents flash
│   ├── config-loader.js        # Reads config.json, applies colours/font/noise, builds sidebar
│   ├── lang.js                 # RU/EN switcher logic (same .t / data-ru / data-en pattern)
│   ├── app.js                  # Renders release content, handles language re-render
│   └── scroll.js               # IntersectionObserver reveal
├── fonts/                      # MTSans .woff2 (same files as portfolio)
└── .github/
    └── workflows/
        └── deploy.yml          # GitHub Actions — auto-deploys on push to master
```

## Customisation

Everything is controlled from `config.json`.

| What | Where in config.json |
|---|---|
| Accent colours | `theme.accentDark` / `theme.accentLight` |
| Custom font | `font.family`, `font.fallback`, `font.files` |
| Project name in topbar | `site.project` |
| GitHub repo link | `site.repoUrl` |
| Back-link to portfolio | `site.portfolioUrl` |
| Releases | `releases` object |

### Adding a release

Releases are displayed in the order they appear in `releases` — put the newest at the top.

```jsonc
"releases": {
  "v1.3.0": {
    "date": "2026-04-01",
    "ru": [
      {
        "type": "new",
        "title": "Название секции",
        "items": [
          "Первый пункт. Код пишите в `обратных кавычках`.",
          "Второй пункт."
        ]
      },
      {
        "type": "fixed",
        "title": "Исправления",
        "items": [
          "Описание исправления."
        ]
      }
    ],
    "en": [
      {
        "type": "new",
        "title": "Section title",
        "items": [
          "First item. Wrap `code` in backticks.",
          "Second item."
        ]
      },
      {
        "type": "fixed",
        "title": "Bug fixes",
        "items": [
          "Fix description."
        ]
      }
    ]
  }
}
```

### Section types

| `type` | Badge colour | Use for |
|---|---|---|
| `new` | Green | New features, classes, APIs |
| `changed` | Yellow | Behaviour changes, refactors |
| `fixed` | Blue | Bug fixes |
| `removed` | Red | Removed APIs or behaviour |

### Inline code

Wrap anything in backticks inside `title` or `items` — it renders as a styled `<code>` span:

```
"`.NonLazy()` — eager singleton."
```

### Keeping accent colours in sync with portfolio

Copy the exact `theme.accentDark` / `theme.accentLight` values from your portfolio's `config.json`.
The two sites share the same font files — if you host them from different repos,
either duplicate the `fonts/` folder or serve them from a shared CDN path.

---

## Local development

`config.json` is loaded via `fetch()`, so open the site through a local server, not directly from disk.

```bash
npx serve .
# or
python3 -m http.server 8080
```

---

## 🚀 Deployment

GitHub Actions deploys automatically on every push to `master`.

**Initial setup (once):**

1. Create a new repo, e.g. `antonprv/zenjex-changelog`
2. Push this folder to `master`
3. Go to **Settings → Pages → Source** and select **GitHub Actions**
4. Done — the workflow runs on the next push and the site goes live at  
   `https://antonprv.github.io/zenjex-changelog/`

To trigger a deploy without making a code change:  
**Actions → Deploy to GitHub Pages → Run workflow**

---

*Made with ☕ and attention to detail.*

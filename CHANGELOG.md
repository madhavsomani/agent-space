# Changelog

All notable changes to Agent Space are documented here.

## [Unreleased]

## [1.3.0] — 2026-03-19

### Added
- **FPS overlay** — toggle with `F` key; color-coded health indicator (green/yellow/red)
- **Typing sparks & coffee steam** — particle effects for working agents on canvas
- **Idle agent wandering** — idle agents walk to water cooler, armchairs, coffee machine
- **Office furniture** — water cooler, whiteboard, and armchairs added to canvas scene
- **Cozy pixel-art office redesign** — warm tones, proper desk stations, windows

### Fixed
- **Blank first-frame on mobile** — eliminated flash when toggling to Office mode
- **375px mobile framing** — improved canvas sizing on narrow viewports
- **Canvas height cap** — capped at 900px to prevent oversized office on tall screens

## [1.2.0] — 2026-03-19

### Changed
- **Modularized frontend** — `app.js` split from 6,440 lines to 764 lines across 10 focused modules (`alerts.js`, `live-logs.js`, `tab-performance.js`, `tab-timeline.js`, `tab-system.js`, `sounds.js`, `office-view.js`, `mobile-nav.js`, `sprites.js`)
- **Version bump** — server reports `1.1.0` → `1.2.0`

### Fixed
- **Demo mode `/api/activity`** — returns `{activity:[...]}` matching prod API shape (was `{events:[...]}`)

## [1.1.0] — 2026-03-19

### Added
- **Office view toggle** — switch between `▦ Cards` and `🏢 Office` (isometric canvas) views
- **Pinch-to-zoom & touch pan** on mobile office canvas
- **Keyboard accessibility** — arrow-key navigation on agent cards, ARIA labels on tabs/nav/toggles
- **CI pipeline** — GitHub Actions with Node 22/24 matrix, smoke tests (bash + mjs), secret scan
- **Lazy tab loading** — heavy tabs (System, Comm Graph) load on first visit only
- **Dark/light theme** — full palette for both canvas and card views
- **Configurable PORT** — `PORT` env var or `--port` CLI flag
- **Export endpoints** — `/api/export/agents` in CSV and JSON
- **CONTRIBUTING.md** and **MIT LICENSE**
- **Screenshots** — dark/light office + card views in README

### Fixed
- **Broken office-view script** — malformed multiline regex prevented entire view-toggle script from loading
- **Dark void self-heal** — canvas background fill + frame-level health checks prevent blank renders
- **Static cache theme detection** — uses `data-theme` attribute instead of body class
- **Label deconfliction** — reduced overlapping agent names in dense isometric scenes
- **Speech bubble clamping** — bubbles no longer render outside canvas bounds
- **SSE reconnect** — exponential backoff (1s→30s) with client heartbeat ping
- **Light-mode canvas** — brighter floor palette for readable contrast
- **Demo mode SSE** — broadcasts work correctly in `--demo` standalone mode

### Changed
- **CSS/JS extraction** — monolithic 413KB `index.html` split into 35KB HTML + 4 cached asset files (`style.css`, `app.js`, `mobile-nav.js`, `office-view.js`)
- **Mobile-first responsive** — cards default on narrow screens, office toggle on desktop; compact agent cards, 2×2 KPI grid on mobile
- **Progressive disclosure** — agent metadata revealed on hover/tap, collapsed panels on mobile
- **Compact UI** — reduced chrome noise, stronger visual hierarchy, dropdown tab selector option

### Performance
- **Background-only shell calls** — zero `execSync` in request handlers; all system metrics cached via background timers
- **Cron cache TTL** increased to 5 min (was 30s) to prevent subprocess storm
- **System cache TTL** at 60s for `top`/`vm_stat`/`df`/`netstat`
- **IntersectionObserver** on canvas to skip rendering when scrolled out of view

### Security
- **Auth gate** — `DASHBOARD_PASSWORD` env var enables login for all routes except `/healthz`
- **Secret scan CI** — scans for API keys, tokens, emails, hardcoded paths on every push/PR
- **Personal data audit** — no hardcoded emails/tokens/phone numbers in tracked files
- **Security headers** — CSP and X-Frame-Options on all responses

## [1.0.0] — 2026-03-17

Initial release with isometric pixel-art office, real-time SSE agent updates, and demo mode.

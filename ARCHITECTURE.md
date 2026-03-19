# Architecture

Quick guide to the Agent Space codebase for contributors.

## Overview

Agent Space is a real-time dashboard that visualizes AI agents working in a virtual office. It's a single-page app with no build step, no npm dependencies, and no framework — just vanilla JS, HTML, and a Node.js backend.

```
agent-space/
├── server.js          # Express-like HTTP server (Node stdlib only)
├── index.html         # Entry point — loads CSS/JS assets
├── style.css          # All styles (dark/light themes, responsive)
├── app.js             # Main frontend logic (6400 lines)
├── office-view.js     # Office/Cards view toggle + grid renderer
├── mobile-nav.js      # Mobile bottom navigation bar
├── sprites.js         # Pixel art sprite generator (PICO-8 palette)
├── office3d.js        # Legacy 3D office (Three.js, currently unused)
├── config.json        # Agent definitions (gitignored in prod)
├── data/              # SQLite DB + runtime data (gitignored)
├── test/
│   ├── smoke.mjs      # API smoke tests (used by CI)
│   └── smoke.sh       # Bash smoke test alternative
└── .github/workflows/
    ├── ci.yml          # Node 22/24 matrix, smoke tests
    └── secret-scan.yml # Secret + personal data scan
```

## Server (`server.js`, ~2700 lines)

Pure Node.js HTTP server — no Express, no dependencies.

### Key concepts
- **Agent discovery**: reads OpenClaw session directories to find agents, their status, and last activity
- **SSE (Server-Sent Events)**: pushes real-time updates to all connected browsers
- **Background caching**: expensive operations (cron status, system metrics, activity scanning) run on timers and cache results; request handlers never spawn subprocesses
- **Demo mode**: `--demo` flag serves mock data for standalone testing

### API endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check (ok, uptime, agent count) |
| `GET /api/agents` | All agents with status, activity, mood |
| `GET /api/activity` | Recent activity feed |
| `GET /api/events` | SSE stream (agents, activity, system, tokens) |
| `GET /api/system` | Host metrics (CPU, memory, disk) |
| `GET /api/tokens` | Token usage by agent |
| `GET /api/tokens/daily` | Daily token history |
| `GET /api/cron` | Cron job status per agent |
| `GET /api/performance` | Response time percentiles |
| `GET /api/uptime` | Agent uptime over 24h |
| `GET /api/heatmap-calendar` | Activity heatmap data |
| `GET /api/comm-graph` | Agent communication graph |
| `GET /api/export/agents` | CSV/JSON agent export |

### Caching strategy
All shell commands run in background intervals, never in request handlers:
- Agents: 30s TTL
- System metrics: 60s TTL  
- Cron status: 5min TTL (subprocess-heavy)
- Activity: 45s TTL

## Frontend (`app.js`, ~6400 lines)

Single file containing all frontend logic. Major sections:

| Lines | Section | Description |
|-------|---------|-------------|
| 1–190 | Utilities | Theme, clock, tab switching, export, fetch wrapper |
| 192–620 | Animations | High-fives, pre-sleep, goodbye waves, sparkles, toasts |
| 623–643 | Agent refresh | Fetches `/api/agents`, updates state |
| 644–1166 | Isometric office | Grid layout, desk/furniture drawing, agent positioning |
| 1167–2097 | Sprite agents | Pixel art agent rendering (idle, working, walking, sleeping) |
| 2098–2330 | Touch/layout | Pinch-to-zoom, touch pan, desk drag-and-drop |
| 2330–2430 | Particles | Typing sparks, coffee steam, ambient dust |
| 2430–3075 | Office render | Main draw loop, floor, walls, furniture, agents, bubbles |
| 3076–3100 | Animation loop | `requestAnimationFrame` loop with frame budget |
| 3100–4000 | Agent cards | Card grid renderer, search, filters, detail panel |
| 4000–4500 | Activity/timeline | Activity feed, timeline chart, heatmap calendar |
| 4500–5100 | Tab renderers | Tokens, memory, queue, system, comm graph tabs |
| 5100–5280 | Keyboard/a11y | Keyboard shortcuts, help overlay, command palette |
| 5278–5400 | SSE | EventSource connection with exponential backoff |
| 5400–6440 | Tabs/utilities | Tab-specific renderers, notification center, sounds |

### Key globals
- `agentData` — array of agent objects from `/api/agents`
- `oCanvas` / `oCtx` — isometric office canvas and 2D context
- `_officeView` — current view mode (`'grid'` or `'2d'`)
- `_th` — current canvas theme colors (dark/light)

## Sprite System (`sprites.js`, ~1000 lines)

Generates pixel art sprites as offscreen canvases using a PICO-8-inspired 32-color palette. Returns cached sprite objects for agents and furniture.

## Views

### Cards view (default)
Professional card grid showing agent name, role, status, last activity, and sparkline. Supports search, status filters, and click-to-detail.

### Office view
Isometric pixel-art office with agents at desks. Agents animate based on status (typing, idle wandering, sleeping). Furniture includes desks, plants, whiteboards, servers, and coffee machines.

## Adding a new agent

Agents are discovered automatically from OpenClaw session directories. To add a static agent, edit `config.json`:

```json
{
  "agents": {
    "my-agent": {
      "name": "My Agent",
      "role": "Developer",
      "color": "#3B82F6",
      "sessionKey": "agent:my-agent:main"
    }
  }
}
```

In demo mode, agents are generated automatically — no config needed.

## Running tests

```bash
# Start server + run smoke tests
npm test

# Or manually
node server.js --demo --port 19999 &
node test/smoke.mjs http://localhost:19999
```

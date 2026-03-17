# Contributing to Agent Space

Thanks for your interest in Agent Space! Here's how to get started.

## Quick Setup

```bash
git clone https://github.com/madhavsomani/agent-space.git
cd agent-space
node server.js --demo    # runs with mock data, no OpenClaw needed
```

Open http://localhost:18790

## Development

```bash
node --watch server.js   # auto-restart on changes
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BIND_HOST` | `127.0.0.1` | Network interface to bind. Use `0.0.0.0` for LAN access. |
| `HOME` | System home | Used to locate `~/.openclaw/agents/` for agent discovery. |

### CLI Flags

| Flag | Description |
|------|-------------|
| `--demo` | Run with mock agent data (no OpenClaw installation needed) |

## Project Structure

```
server.js     — Express backend: API endpoints, SSE, agent discovery, caching
index.html    — Single-file frontend: isometric office canvas, charts, all UI
config.json   — Optional agent/office/auth/rate-limit configuration (gitignored)
agent-space.db — SQLite database for events/history (gitignored, auto-created)
```

## Architecture

- **Backend:** Node.js with `node:http`, `better-sqlite3` for persistence, zero `execSync` in request handlers
- **Frontend:** Vanilla JS — no build step, no dependencies. Canvas-based isometric office with offscreen static layer caching at 8 FPS
- **Data flow:** SSE (Server-Sent Events) for real-time updates, REST API for initial load
- **Agent discovery:** Scans `~/.openclaw/agents/` directories, merges with optional `config.json`

## Guidelines

- **No build step.** The frontend is a single `index.html`. Keep it that way.
- **No runtime dependencies** beyond `better-sqlite3` (used for event persistence).
- **Test after changes:** `curl http://localhost:18790/api/health` should return `{"ok":true}`
- **Performance matters:** No synchronous shell commands in request handlers. Use background caches.
- **Canvas rendering:** Static elements (floor, walls, furniture) are cached in an offscreen canvas. Only animated elements (agents, clocks, plants) redraw each frame.

## Submitting Changes

1. Fork the repo
2. Create a feature branch (`git checkout -b my-feature`)
3. Make your changes
4. Test with both `--demo` mode and live OpenClaw (if available)
5. Submit a PR with a clear description of what changed and why

## License

MIT — see [LICENSE](LICENSE).

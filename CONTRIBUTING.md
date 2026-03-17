# Contributing to Agent Space

Thanks for your interest! Here's how to get started.

## Development

```bash
git clone https://github.com/madhavsomani/agent-space.git
cd agent-space
node server.js --demo   # runs with mock data
```

Open http://localhost:18790 — changes to `index.html` are served immediately (no build step). For `server.js` changes, restart the server or use `npm run dev` (requires Node 22+).

## Project Structure

- `server.js` — Express-less HTTP server, REST API, SSE, agent discovery
- `index.html` — Single-file frontend (vanilla JS + Canvas)
- `config.example.json` — Example agent configuration
- No npm dependencies — keep it that way

## Guidelines

- **No build step.** The frontend is a single HTML file.
- **No npm dependencies.** Use Node built-ins only.
- **Test with demo mode.** `node server.js --demo` should always work.
- **Security matters.** Default bind is `127.0.0.1`. Don't weaken defaults.

## Submitting Changes

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Test with `--demo` mode
4. Submit a PR with a clear description

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Node version (`node -v`)
- Browser (for frontend issues)

# Contributing to Agent Space

Thanks for contributing to Agent Space ⚡

## Development Principles

- Keep runtime dependency-free where possible (prefer Node built-ins and vanilla JS).
- Keep dashboard responsive and readable in both dark/light themes.
- Preserve live behavior: SSE should stay stable and lightweight.
- Prefer small, reviewable PRs with clear before/after impact.

## Local Setup

```bash
git clone https://github.com/madhavsomani/agent-space.git
cd agent-space

# Optional custom config
cp config.example.json config.json

# Run
node server.js
# http://localhost:18790
```

## Required Checks Before PR

1. Restart server after backend/frontend edits.
2. Verify health endpoint:
   - `curl -sf http://localhost:18790/api/health`
3. Smoke-check key tabs:
   - Office, Queue, Tokens, Comm Graph, System
4. If UI changed, include at least one screenshot.
5. If API changed, update README endpoint table.

## Coding Conventions

- Use clear function names and short comments for non-obvious logic.
- Avoid introducing global state unless necessary.
- Keep endpoint responses backward-compatible when possible.
- Prefer feature flags/config over hard-coded behavior for operational limits.

## Reporting Bugs

Please include:
- What tab/endpoint failed
- Repro steps
- Expected vs actual behavior
- Screenshot/log snippet
- Browser/OS details (for UI issues)

## Security / Secrets

- Never commit secrets (`config.json`, `.env`, tokens).
- Use `.gitignore` rules and sample config files.
- If you find a vulnerability, report privately before public disclosure.

## Pull Request Template (Recommended)

- **What changed:**
- **Why:**
- **How tested:**
- **Screenshots / evidence:**
- **Risk / rollback plan:**

Thanks for helping make Agent Space production-grade and open-source friendly.

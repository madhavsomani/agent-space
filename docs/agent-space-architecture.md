# Agent Space Architecture

## Purpose

Agent Space is a standalone, browser-first control surface for observing and operating OpenClaw agents. It should make the agent fleet legible: which agents exist, what they are doing, how recently they were active, what sessions they own, and which work needs review.

The long-term product shape is an installable static app that talks directly to an existing OpenClaw Gateway. Agent Space must not become a second backend, a shadow API, or a privileged filesystem reader.

## Product scope

Agent Space should provide:

- A gateway connection screen where the operator enters an OpenClaw Gateway URL and token.
- Agent inventory: persistent agents, cron/heartbeat agents, and sub-agent sessions.
- Status dashboard: current status, session type, last active time, model/runtime metadata when the gateway exposes it.
- Session history viewer: transcripts, tool calls, filters, and search for a selected session.
- Activity timeline: chronological and per-agent views of work, heartbeats, QA, and handoffs.
- QA/review surfaces: clear distinction between implemented, verified, in review, blocked, and done.
- Export/debug affordances that use gateway-provided data only.

## Non-goals

Agent Space must not:

- Add a new backend API, proxy, server, health endpoint, or database.
- Read `~/.openclaw` or workspace files directly from the browser or a custom service.
- Store or transmit secrets outside the user's browser and the configured OpenClaw Gateway.
- Publish content, send email, modify config, or perform destructive operations without explicit gateway-supported actions and user confirmation.
- Infer success from UI state alone; QA surfaces must show evidence from gateway/session data.

## Hard architecture rule: gateway token only

All privileged data and actions flow through the OpenClaw Gateway using the operator-supplied gateway URL and token.

```text
Browser SPA
  ├─ localStorage/sessionStorage: gateway URL + token preference
  ├─ gateway-client.js: authenticated fetch wrapper
  └─ UI components
        ↓ Authorization: Bearer <gateway token>
OpenClaw Gateway
  ├─ sessions/status/history APIs
  ├─ message/action APIs
  ├─ memory/wiki APIs when exposed
  └─ any future typed Gateway endpoints
```

No Agent Space code should introduce a new HTTP API. Existing static serving is acceptable only as a way to deliver HTML/CSS/JS assets and demo mode during migration; product data must come from the gateway.

## Auth and connection model

### Inputs

The connection screen asks for:

- Gateway URL, for example `http://127.0.0.1:18789` or a Tailscale HTTPS URL.
- Gateway token.
- Optional persistence choice: remember for this browser, remember for this session, or do not persist.

### Storage

- If the user chooses persistent storage, store the gateway URL and token in `localStorage`.
- If the user chooses session-only storage, store them in `sessionStorage`.
- Do not hardcode tokens in source files, examples, screenshots, or tests.
- Provide a clear "disconnect" action that clears stored credentials.

### Validation

The app validates credentials by making a minimal authenticated read-only gateway request. Validation must use an existing gateway endpoint; Agent Space must not add a custom `/health`, `/auth-status`, or proxy endpoint for itself.

Validation states:

- Empty URL/token: show setup form.
- Network error: gateway unreachable or CORS/Tailscale issue.
- 401/403: invalid token or insufficient permission.
- 2xx with expected shape: connected.
- Unexpected response: show raw-safe diagnostic without secrets.

## Gateway client module

A small client module should own all gateway calls.

Responsibilities:

- Normalize the gateway base URL.
- Attach `Authorization: Bearer <token>` to every request.
- Apply JSON parsing and consistent error objects.
- Redact token values from thrown errors, logs, and rendered UI.
- Support abort/timeouts so panels cannot hang indefinitely.
- Expose typed methods used by UI modules, such as:
  - `getSessions()`
  - `getSessionHistory(sessionKey)`
  - `getStatus()`
  - `sendSessionMessage(sessionKey, message)` when/if write actions are allowed

The UI should never call `fetch()` against the gateway directly outside this module.

## Data flow

1. User opens Agent Space.
2. App loads saved connection settings, if any.
3. Auth component validates the gateway URL/token through `gateway-client.js`.
4. Connected app shell mounts feature panels.
5. Panels request data through gateway-client methods.
6. Gateway responses are normalized into view models.
7. UI renders data with explicit loading, empty, error, and stale states.
8. User-initiated write actions require confirmation and use existing gateway endpoints only.

## Component breakdown

### App shell

Owns global connection state, routing/tab selection, theme, and top-level error boundaries.

### Auth screen

Collects gateway URL/token, validates them, stores them according to user preference, and exposes disconnect/reconnect controls.

### Gateway client

Single source of truth for gateway request behavior and token handling.

### Agent list and status dashboard

Shows all visible agents/sessions with:

- Display name/session key
- Persistent/sub-agent/cron/session type
- Current or inferred status
- Last active time and age
- Model/runtime metadata when available
- Direct links to session detail/history

### Session detail and history viewer

Shows sanitized transcripts, tool calls, timestamps, and filters. Search should happen client-side for the current loaded history first; broader search should use gateway-supported search if available later.

### Activity timeline

Aggregates session and heartbeat events into a chronological view. It should prefer gateway-provided timestamps and make uncertainty visible instead of inventing activity.

### QA and review surfaces

Surfaces review state and evidence, not just completion claims. For Linear-backed work, Agent Space can link to issues or show imported metadata only if it comes from gateway-supported integrations or user-provided data.

### Settings/debug panel

Shows connection details with token redacted, gateway version/status if exposed, and last request failures. It should include a clear credential reset button.

## Existing repo fit and migration plan

The current repository is a static/Node dashboard with `server.js`, `index.html`, `app.js`, modular tab files, demo mode, and smoke tests. That scaffold is useful for AS-1, but future Agent Space work should move product data access into the browser/gateway model.

Migration steps:

1. Keep static asset serving and demo mode for local development.
2. Add `gateway-client.js` and auth screen without introducing server endpoints.
3. Convert agent status panels to call the OpenClaw Gateway directly.
4. Replace filesystem/server-derived data with gateway responses.
5. Retain smoke tests for demo/static behavior and add browser/unit tests for gateway-client request construction and redaction.
6. Remove or quarantine legacy server-only panels once gateway equivalents exist.

## Security and privacy

- Treat the gateway token as a secret.
- Never print tokens in console logs, DOM, screenshots, exported files, Linear comments, or test output.
- Redact Authorization headers in debug views.
- Prefer read-only views by default.
- Require explicit confirmation for any gateway write action.
- Make external network boundaries obvious: the browser talks only to the configured gateway origin.
- Avoid embedding Madhav/private workspace paths in public documentation except generic examples.

## Error and empty states

Every panel should distinguish:

- Not connected
- Loading
- Gateway unreachable
- Auth failed
- Permission denied
- Empty result
- Partial/stale data
- Unexpected response shape

Do not render placeholder agents or fake activity in connected mode. Demo mode may use mock data, but it must be visually labeled as demo data.

## Testing strategy

Minimum checks for each feature branch:

- Static/demo smoke test remains green: `node server.js --demo --port 19999` plus `node test/smoke.mjs http://127.0.0.1:19999`.
- Gateway client tests cover URL normalization, Authorization header injection, timeout handling, and token redaction.
- Auth flow tests cover invalid token, unreachable gateway, storage choice, and disconnect.
- Manual QA verifies no token appears in DOM text, console-friendly error messages, committed fixtures, or screenshots.

## Linear milestone mapping

- **AS-1 — Scaffold project and GitHub repo:** Establish runnable standalone app, package scripts, docs, and smoke test baseline.
- **AS-2 — Design document:** This document; lock gateway-token-only architecture and migration plan.
- **AS-3 — Gateway token auth flow:** Implement connection screen, storage choices, validation, disconnect, and redaction.
- **AS-4 — Agent list and status dashboard:** Render real gateway-backed agent/session inventory and statuses.
- **AS-5 — Agent activity timeline:** Build gateway-backed timeline views from session/activity events.
- **AS-6 — Session history viewer:** Add searchable/filterable transcripts and tool-call inspection for selected sessions.

## Open questions

- Which exact gateway read endpoint should AS-3 use as the validation probe?
- Which gateway session list/history response shapes are stable enough for typed client methods?
- Should write actions be included in the first public release, or should v1 be read-only?
- What CORS/Tailscale deployment combinations should be officially supported?

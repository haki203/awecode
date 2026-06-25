# Spec: Web Tools for Awecode Agent

**Status:** Draft
**Author:** Session 2026-06-25
**References:** Cline `apps/vscode/src/services/browser/`, Cline `sdk/packages/core/src/extensions/tools/`

## Problem

Awecode's `@awecode/tools` package currently ships 4 tools: `read_file`,
`list_files`, `search_files`, `shell_exec`. None of them let the agent:

1. **Read web content** — fetch a URL and get its text/structure for reference.
2. **Drive a real browser** — render JS, take screenshots, click, type, so it
   can clone or reproduce a live site's UI.
3. **Search the web** — discover URLs from a natural-language query.

The only escape hatch today is `shell_exec` + `curl`, which fails on any
JS-rendered SPA (returns an empty `<div id="root">`) and dumps raw HTML
straight into the context window. This makes the two user goals
"tham khảo cấu trúc một trang web" and "làm y như một trang web" effectively
unsupported.

## Goals

Three new tool families, each independently useful, layered by cost:

| Tool | Cost | Capability unlocked |
|---|---|---|
| `web_fetch` | Cheap (native fetch, no binary) | Read static HTML / JSON / text from a URL |
| `browser_session` (group of tools) | Expensive (Playwright + Chromium) | Render JS, snapshot accessibility tree, screenshot, click/type |
| `web_search` | Cheap (HTTP to search API) | Discover URLs from a query |

## Non-goals

- A full RAG / indexing pipeline over fetched pages. Out of scope; the agent
  can call `web_fetch` again if it needs a refresher.
- A built-in proxy / CAPTCHA solver. We surface failures honestly.
- MCP server plumbing. These tools live in the in-process `TOOL_REGISTRY`
  exactly like the existing 4 tools. A future spec can externalize them.

## Design decisions (locked after the Q&A)

| Decision | Choice | Rationale |
|---|---|---|
| Browser engine | **Playwright** | Cross-browser, modern API, first-class accessibility-tree snapshot, better Windows story than Puppeteer's `puppeteer-chromium-resolver`. Cline uses Puppeteer but we are not bound to that. |
| How LLM "sees" the page | **Accessibility tree + screenshot** | a11y tree is ~10× cheaper in tokens than a screenshot and gives stable refs for clicking; screenshot is opt-in per call for visual/layout questions. Mirrors what Playwright MCP / modern Cursor do; strictly better than Cline's screenshot-only model. |
| Web search provider | **Tavily**, behind a pluggable interface | Tavily is purpose-built for LLM agents (returns clean markdown, answer snippet, no bot-detection noise). The interface lets us swap to Brave/SerpAPI later without touching tool callers. |
| Sandbox policy | **Isolated context by default** | Fresh browser context per session, no cookies, no user profile. A later flag can opt into connecting to the user's running Chrome over CDP, but isolated is the safe default. |
| Rollout | **Sequential: web_fetch → browser_session → web_search** | Each phase is independently shippable and testable; web_fetch has zero new deps so it can land first. |

## Architecture

```
packages/tools/src/
├── index.ts                  ← TOOL_REGISTRY grows from 4 → many entries
├── types.ts                  ← add 'image' | 'snapshot' to ContextEntryPayload
├── file/                     (unchanged)
├── shell/                    (unchanged)
├── web/
│   ├── fetch.ts              ← Phase 1: web_fetch tool
│   └── search.ts             ← Phase 3: web_search tool + provider interface
└── browser/
    ├── session.ts            ← Phase 2: long-lived Playwright session manager
    ├── snapshot.ts           ← a11y tree → YAML with refs
    ├── actions.ts            ← navigate / click / type / scroll / screenshot
    └── viewport.ts           ← viewport presets (copied from Cline's BrowserSettings)
```

**Dependency direction respected:** `tools` is a leaf package; Playwright,
Tavily client, cheerio, turndown are its own direct deps. Nothing in
`tools` imports from `agent`, `cli`, or `orchestrator`.

## Context window contract

Every new tool returns `ToolResult`. Its `contextEntries` decide what the
agent's `ContextManager` stores. We introduce two new payload types:

```ts
// packages/tools/src/types.ts (additions)
export type ContextEntryPayload =
  | { type: 'file'; path?: string; content: string }
  | { type: 'command-output'; content: string }
  | { type: 'snippet'; content: string }
  | { type: 'web'; url: string; content: string }          // NEW: web_fetch
  | { type: 'browser-snapshot'; url: string; content: string } // NEW: a11y tree
  | { type: 'image'; mimeType: 'image/png' | 'image/webp'; base64: string; url?: string }; // NEW: screenshot
```

Hard caps (same philosophy as Cline's `MAX_READ_OUTPUT_CHARS`):

| Payload | Cap | Truncation behaviour |
|---|---|---|
| `web` | 50 000 chars | head kept, tail summarised as `[truncated, N more chars]` |
| `browser-snapshot` | 30 000 chars | depth-limited a11y tree (see Phase 2) |
| `image` | 320 KB base64 (~240 KB raw) | webp-encoded at the viewport; downscale before truncation |

## Security

- `web_fetch` rejects any non-`http(s)` URL (blocks `file://` SSRF) — copied
  verbatim from Cline's `web-fetch.ts:124`.
- `web_fetch` enforces `maxResponseBytes = 5_000_000` (5 MB) with stream
  cancellation — copied from Cline.
- `browser_session` launches Chromium with `--no-sandbox` NOT set; we use
  Playwright's default isolation. No access to the user's cookie jar.
- `web_search` never logs the API key; the key is read from env only
  (`TAVILY_API_KEY`) and never persisted in config.yaml.
- **Abort-signal propagation (deferred)**: the original draft of this spec
  required all three tools to honour an optional `abortSignal` propagated from
  the agent's turn cancellation (pattern from Cline's `AgentToolContext.signal`).
  Phase 1 & 2 shipped WITHOUT this: plumbing `AbortSignal` through the
  `ToolHandler` signature + `dispatchTool` + all 13 tools + ~50 tests is a
  separate refactor. In the meantime browser/web tools rely on internal
  per-action timeouts, and a ProtocolSession abort kills the Chromium process
  via `disposeBrowserSession()`. Re-open this when we add parallel tool calls
  or user-driven mid-tool cancellation.

## Telemetry hooks (forward-looking, not in Phase 1/2)

Awecode does not yet have a telemetry service, so the handlers ship WITHOUT
`TODO(telemetry)` markers to avoid noise. When a telemetry service lands, the
events to emit are: `web_fetch.ok`, `web_fetch.err`,
`browser_session.action` (with action name + ok/err), `web_search.query`.

## Open questions

1. **Should `browser_session` tools share one Chromium instance across the
   whole agent run, or launch per-call?** Cline keeps one `Browser` per
   `BrowserSession` and closes it explicitly. We'll do the same: the
   `browser_session` *group* owns one persistent context; the agent opens
   it with `browser_session_open` and must close it with
   `browser_session_close` (or we auto-close on task end).
2. **Ref stability across navigations.** Playwright's a11y snapshot refs are
   only valid until the next navigation. We will document this in the tool
   description so the LLM knows to re-snapshot after `navigate`.
3. **Tavily free tier** allows 1 000 queries/month. For dogfooding that is
   fine; we will make the rate-limit error message actionable.

## Phased plan

See `docs/superpowers/plans/web-tools.md` for the step-by-step implementation
plan, TDD test list, and per-phase acceptance criteria.

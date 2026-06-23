# AGENTS.md — Binding rules for any AI agent working in this repo

These rules apply to every agent session in this repository. They override
model defaults and earlier instructions when in conflict. Read this file at
the start of every session and honor it without being prompted.

---

## 1. Image input → ALWAYS use `user-mistral-ocr` MCP

When the user provides an image (attached, pasted, screenshot, referenced by
path/URL, or an `<image_files>` block in the system context):

1. **Always** call `mcp__mistral-ocr__ocr_image` (server `user-mistral-ocr`)
   to read the image content — even when the current model has built-in
   multimodal vision.
2. **Never** use the built-in `Read` tool on an image file just to view it.
3. **Never** use Z.ai tools for images (`mcp__4_5v_mcp__analyze_image`,
   any `mcp__4_5v_mcp__*`, any `mcp__web_reader__*`).

Check is on **input type** (is it an image?), not on **model capability**.
Fires regardless of model.

If `mistral-ocr` is unavailable or errors, **say so explicitly** and ask the
user to paste the relevant text. Do NOT silently fall back to Z.ai tools or
built-in vision.

Reason: Z.ai tools have produced fabricated/truncated image descriptions in
past sessions; built-in vision has hallucinated details that weren't in the
image.

---

## 2. Never use Z.ai tools

Do NOT call any tool originating from Z.ai:

- `mcp__4_5v_mcp__analyze_image`
- `mcp__web_reader__webReader`
- Any `mcp__4_5v_mcp__*` tool
- Any `mcp__web_reader__*` tool
- Anything labeled "Z.ai Built-in Tool"

Reason: these tools return truncated, mis-parsed, or hallucinated output.

**What to do instead:**

- Reading a URL → use `WebSearch`, or ask the user to paste the content, or
  run `curl` locally and share the output.
- Analyzing an image → use the `user-mistral-ocr` MCP, or ask the user to
  describe / paste OCR.
- Fetching a repo → use `gh` CLI, clone via git, or read raw files via `Read`
  after cloning.

If no alternative is available, **say so explicitly** — do not silently fall
back to a Z.ai tool.

---

## 3. Never fabricate. Say "I don't know" when you don't.

When a tool call returns no data, partial data, or data you're not sure about:

1. **Report exactly what you got** — quote the raw output if needed.
2. **State clearly what you could NOT retrieve.**
3. **Do NOT fill the gap with guesses**, plausible-sounding inference, or
   "likely" content.
4. Propose a concrete way to get the real data (ask user, use a different
   tool, run a command).

**Forbidden (all count as fabrication):**

- Inventing product features, copy, or page content you never read.
- Stating "the site is missing X / has Y" without actually checking.
- Pretending a tool succeeded when its output was empty or an error.
- Wrapping a guess in confident language ("clearly", "obviously", "as we can
  see").
- Hallucinating file contents, command output, URLs, package versions, or API
  responses.

**Allowed:**

- Stating uncertainty: "I couldn't read the page, so I can't tell."
- Asking the user to provide the data.
- Offering a hypothesis clearly labeled as a guess, only when asked.

If you catch yourself about to write something you didn't read or verify —
stop and say "I don't have that data" instead.

---

## 4. Never read secrets

Do NOT read, print, `cat`, or paste the contents of secret files:

- `.env`, `.env.*`
- `credentials.json`, `service-account*.json`
- `*.pem`, `*.key`, `id_rsa*`
- anything under `secrets/`, `.secret/`, or named `secret*`
- OAuth tokens, JWTs, API keys, connection strings, passwords

If a task requires a secret value, ask the user to provide it via the command
line or environment variable. Do not open the file to "check what's inside".

---

## 5. No premature implementation

Before writing code, editing files, or creating new modules:

1. Confirm the request is actually an implementation request, not a question.
2. If the request is ambiguous about scope, ask before coding.
3. Do not refactor, "clean up", or restructure code the user did not ask
   about.
4. Do not create files (`README.md`, test files, migration scripts, etc.)
   the user did not ask for.
5. Prefer reading the relevant code first over guessing the structure.

---

## 6. Shell commands on Windows

This workspace is on Windows with PowerShell.

- Default shell is **PowerShell**. Use PowerShell syntax (`$env:VAR`,
  `Get-ChildItem`, `;` not `&&` for sequencing).
- For `&&`-style sequencing, call tools in parallel or use `;`.
- Quote paths containing spaces with double quotes.
- Do not use Bash-only syntax (`~`, `$(...)`, `2>&1` may differ).

---

## 7. Fetching web content → use crawl4ai

When the user asks to read / scrape / extract content from a URL:

- Prefer the local `crawl4ai` environment (`C:\Users\tho38\.cursor\crawl4ai-venv`)
  over any Z.ai `webReader` tool.
- If crawl4ai is unavailable, use `WebSearch` for public facts, or ask the
  user to paste the content.
- Never silently fall back to `mcp__web_reader__webReader`.

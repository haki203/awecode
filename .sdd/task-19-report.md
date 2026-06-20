# Task 19 — Plan 3 Final Review Fixes

Commit: `fix: await chatCommand, complete search_files ignore globs, wire argv-as-prompt`

## Fix I-1 (merge-blocker): `void chatCommand()` → `await chatCommand()`

**File:** `packages/cli/src/index.ts`

**Problem:** `void chatCommand();` detached the async promise. If `chatCommand`
rejected (e.g. `loadConfig` throws), the error was swallowed and the process
exited 0 silently instead of surfacing the error via `main().catch(...)`.

**Fix:** Changed to `await chatCommand(...)` so rejection propagates to the
existing `.catch` handler on `main()`.

```diff
-  void chatCommand();
+  const initialPrompt = args[0] === 'chat' || args[0] === undefined ? undefined : args[0];
+  await chatCommand(initialPrompt);
```

(The `initialPrompt` argument is part of fix M-3 below.)

## Fix M-1: search_files incomplete rg ignore globs

**File:** `packages/tools/src/file/search.ts`

**Problem:** The rg invocation passed only `DEFAULT_IGNORE[0]` (node_modules)
and `[1]` (.git) via `-g !...`. Indices [2] (.awecode) and [3] (dist) were
honored only by the JS fallback. So when rg was installed, search leaked hits
from `.awecode/` and `dist/`.

**Fix:** Refactored to build the rg args array once and push `-g !<glob>` for
every `DEFAULT_IGNORE` entry in a loop, so rg and the JS fallback honor the
identical ignore set.

```diff
-    const { stdout } = await execFileAsync(
-      'rg',
-      [
-        '--line-number',
-        '--no-heading',
-        '--color=never',
-        '--no-ignore',
-        '-g',
-        `!${DEFAULT_IGNORE[0] ?? ''}`,
-        '-g',
-        `!${DEFAULT_IGNORE[1] ?? ''}`,
-        args.pattern,
-        cwd,
-      ],
-      { timeout: 30_000 },
-    );
+    const rgArgs = [
+      '--line-number',
+      '--no-heading',
+      '--color=never',
+      '--no-ignore',
+    ];
+    for (const ignoreGlob of DEFAULT_IGNORE) {
+      rgArgs.push('-g', `!${ignoreGlob}`);
+    }
+    rgArgs.push(args.pattern, cwd);
+    const { stdout } = await execFileAsync('rg', rgArgs, { timeout: 30_000 });
```

JS fallback path unchanged (already passes the full `DEFAULT_IGNORE` array).

## Fix M-3: unknown-token-as-prompt wired (real fix, not docs-only)

**Files:** `packages/cli/src/commands/chat.tsx`, `packages/cli/src/index.ts`

**Problem:** `docs/direct-mode.md` + README advertised
`awecode "fix typo..."` threading argv as the initial prompt, but
`chatCommand()` took no args and opened an empty prompt.

**Fix (real wiring, not docs fallback):**

1. `chatCommand` now accepts an optional `initialPrompt?: string` and threads
   it through to `<ChatApp initialPrompt={...} />`.
2. `ChatApp` auto-submits the initial prompt once on mount via a `useEffect`
   with a ref guard (`initialSubmitRef`) to defend against React StrictMode's
   double-invoke in development. The existing `handleSubmit` guard
   (`streamingRef`) provides a second layer of protection against double
   submits.
3. `index.ts` passes the unknown token as `initialPrompt` only when it is NOT
   the explicit `chat` command and NOT absent. `awecode chat` and bare
   `awecode` still open an empty prompt; any other unknown token is treated
   as the first user prompt.

```diff
-function ChatApp({ context, config }: ChatAppProps) {
+function ChatApp({ context, config, initialPrompt }: ChatAppProps) {
   ...
+  const initialSubmitRef = useRef(false);
   ...
+  useEffect(() => {
+    if (!initialPrompt || initialSubmitRef.current) return;
+    initialSubmitRef.current = true;
+    void handleSubmit(initialPrompt);
+  }, []);

-export async function chatCommand(): Promise<void> {
+export async function chatCommand(initialPrompt?: string): Promise<void> {
   ...
-  render(<ChatApp context={context} config={config} />);
+  render(<ChatApp context={context} config={config} initialPrompt={initialPrompt} />);
```

M-3 did NOT fall back to docs-only — the real fix was feasible and safe.

## Verification

### `yarn test`

```
Test Files  33 passed (33)
     Tests  128 passed | 1 skipped (129)
  Duration  2.29s
Exit code 0
```

All 128 tests pass + 1 pre-existing skipped. No regressions.

### `yarn typecheck`

```
Done in 1s 659ms
Exit code 0
```

Clean.

### `yarn lint`

```
Exit code 0
(no output — clean)
```

Clean. (Initial run flagged an unknown `react-hooks/exhaustive-deps` rule in
the eslint-disable comment; removed the comment since the rule isn't
configured in this project.)

### `yarn build`

```
diff:   ESM ⚡️ Build success   dist\index.js     8.41 KB
tools:  ESM ⚡️ Build success   dist\index.js     8.70 KB
llm:    ESM ⚡️ Build success   dist\index.js     3.27 KB
agent:  ESM ⚡️ Build success   dist\index.js     6.24 KB
cli:    ESM ⚡️ Build success   dist\index.js     1.34 KB + 3 chunks
Done in 4s 69ms
Exit code 0
```

All 5 packages built.

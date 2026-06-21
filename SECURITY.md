# Security Policy

## Supported versions

Awecode is pre-v1. Only the latest release line receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Email the maintainer at **security@awecode.dev** (or open a private
security advisory via GitHub's `Security` tab → `Report a vulnerability`).
Include:

- A description of the issue and its impact
- Reproduction steps (minimal PoC if possible)
- Affected versions
- Suggested fix if you have one

You will receive an initial response within 72 hours. We coordinate
disclosure timing with you and credit your report in the release notes
unless you prefer to remain anonymous.

## Threat model (v0.1)

Awecode is a CLI agent that:

- Reads files from your working directory
- Writes files via git worktrees (isolated under `.awecode/worktrees/`)
- Runs shell commands inside those worktrees (via `runCommand` from
  `@awecode/harness`)
- Makes outbound HTTPS calls to your configured LLM provider
  (Anthropic, OpenAI, Google, or Ollama)

Things we deliberately do **not** do:

- We do not phone home, collect telemetry, or send usage data anywhere
  except your configured LLM provider
- We do not auto-execute code outside of git worktrees
- We do not auto-merge to your working branch without approval prompts
  (Plan 6's Diff Cycle gates on `ApprovalPrompter` before any work)
- We do not censor LLM-emitted shell commands — the agent runs in a
  git worktree which you can `git checkout` to revert. If you want
  hard sandboxing, wait for v0.2's Docker mode.

## Known limitations

- **Network isolation in `git-only` sandbox mode logs a warning instead
  of blocking.** Real network isolation (Firejail on Linux,
  `sandbox-exec` on macOS, Windows Firewall) is v0.2 scope.
- **`runCommand` SIGKILL is unreliable under Ctrl+C.** The abort signal
  is checked between steps only, not during an in-flight subprocess.
  Long-running commands can leak past Ctrl+C.
- **Self-heal loops are bounded by 5 guards** (`maxSteps`, `maxConsecutiveSameError`,
  `totalTimeout`, `commandTimeout`, `diffFailStreak`). These defaults are
  conservative but not a complete defense against a runaway agent.

## Dependency policy

- All runtime deps are pinned in each `package.json`.
- `npm audit` is run on CI for every PR.
- We prefer well-maintained, narrowly-scoped dependencies. New runtime
  deps require an ADR justifying the choice.

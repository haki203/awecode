# Awecode

CLI Coding Agent with built-in workflow engine (brainstorm → spec → grill → plan).

**Status:** v0.1 in development. Plans 1-3 complete (Foundation + LLM Adapter, Diff Engine, Direct Mode).

## Quick start

```bash
# Install (once published)
npm install -g @awecode/cli

# First run: configure LLM provider
awecode config

# Smoke test
awecode chat-test

# Enter Direct Mode TUI (no args), or pass a prompt directly
awecode
awecode "fix typo 'recieve' -> 'receive' in src/foo.ts"

# Manage agent worktrees (see docs/harness.md)
awecode worktree list
awecode worktree clean
```

In Direct Mode, the agent streams a response and, when it emits a Diff Block,
switches to Approval Mode:

```
> Fix typo 'recieve' -> 'receive' in src/foo.ts
[Agent streams response, shows diff]
[Diff Approval]  [y] accept  [n] reject  [e] edit  [s] skip
```

See [docs/direct-mode.md](./docs/direct-mode.md) for the full Direct Mode guide.

## Development

```bash
git clone https://github.com/<owner>/awecode.git
cd awecode
yarn install
yarn build
yarn test
```

See [docs/getting-started.md](./docs/getting-started.md) for detailed setup.

## License

Apache-2.0 — see [LICENSE](./LICENSE)

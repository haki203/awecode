# Awecode

CLI Coding Agent with built-in workflow engine (brainstorm → spec → grill → plan).

**Status:** v0.1 in development. Plan 1 (Foundation + LLM Adapter) complete.

## Quick start

```bash
# Install (once published)
npm install -g @awecode/cli

# First run: configure LLM provider
awecode config

# Smoke test
awecode chat-test
```

## Development

```bash
git clone https://github.com/<owner>/awecode.git
cd awecode
yarn install
yarn build
yarn test
```

## License

Apache-2.0 — see [LICENSE](./LICENSE)

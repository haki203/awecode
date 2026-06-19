# Getting Started

## Prerequisites

- Node.js 20 LTS
- Yarn berry v4 (auto-installed via `packageManager` field)

## Install dependencies

```bash
yarn install
```

## Build all packages

```bash
yarn build
```

## Run tests

```bash
yarn test         # run all unit tests
yarn typecheck    # TS type check across workspaces
yarn lint         # eslint across workspaces
```

## Configure LLM provider

```bash
node packages/cli/dist/index.js config
```

Or with real binary after `npm link`:

```bash
awecode config
```

## Smoke test

```bash
awecode chat-test
```

Expected output:

```
Sending "Hello" to anthropic...

Hi there! How can I help?

(tokens: 23)
```

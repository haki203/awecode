# Use Vercel AI SDK as LLM provider abstraction

All LLM calls in awecode go through the Vercel AI SDK (`ai` package plus per-provider packages like `@ai-sdk/anthropic`, `@ai-sdk/openai`). We rejected writing our own `LLMProvider` interface (estimated ~2000 LOC for 3 providers, fragile streaming/tool-call parsers) and rejected wrapping a single SDK with deferred refactor (premeditated technical debt). Vercel AI SDK gives us unified streaming, tool calling, structured output via Zod schemas, and 75+ providers from day one with ~100 LOC of glue code on our side.

## Status

Accepted (2026-06-19)

## Consequences

- Awecode supports OpenAI-compatible endpoints out of the box (OpenAI, OpenRouter, Together, Groq, DeepSeek, Ollama, LM Studio, vLLM) via `createOpenAI({ baseURL })`.
- Native provider modules for Anthropic, OpenAI, Google Gemini, Ollama are bundled for first-class tool-use support.
- First-run wizard prompts user to pick a provider and enter credentials; saved to `~/.config/awecode/config.yaml`.
- Structured output (Diff Block error reports, Intent Declaration) uses `generateObject({ schema })` — JSON validity enforced by provider API, not by our code.
- Upstream SDK upgrades can change behavior; we pin to exact versions in `package.json` and test before bumping.

# Apache-2.0 license

Awecode is licensed under Apache License 2.0. We rejected MIT (no patent protection — risk for enterprise adoption and for us as authors) and rejected GPL/AGPL (restrictive — most coding-agent OSS in the space uses permissive licenses, and we want maximum contributor + enterprise adoption).

The decision was informed by surveying the coding-agent OSS space (June 2026): 6 of 11 top tools use Apache-2.0 (Aider, Cline, Continue, Goose, OpenAI Codex CLI, Gemini CLI, Qwen Code); 4 use MIT (OpenCode, OpenHands, Plandex); 1 uses AGPL-3.0 (Warp); 1 uses FSL (Crush). Apache-2.0 is the plurality choice and matches our two main inspirations (Aider, Cline).

## Status

Accepted (2026-06-19)

## Consequences

- Every source file carries the Apache-2.0 header notice.
- `LICENSE` file at repo root contains full Apache-2.0 text.
- Patent grant clause protects users and us from patent litigation between contributors.
- Future commercial offerings (managed cloud, enterprise features) are possible without relicensing.
- Contributor License Agreement (CLA) not required for v0.1; may be added if corporate contributors arrive.
- `package.json` declares `"license": "Apache-2.0"`.

# Repo Map

Tree-sitter-generated outline of the entire repo, injected into context so agent knows what exists.

## Supported languages (v0.1)

- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)
- Python (.py)
- Go (.go)
- Rust (.rs)

## Non-supported files

Files with other extensions appear in Repo Map as list-only (path + size), without symbol parsing.

## Caching

Repo Map cached at `.awecode/cache/repo-map.json`, keyed by git commit hash.
Regenerates when HEAD moves.

## Budget

Default 1024 tokens. Symbols ranked by reference count (PageRank-style).
Top-ranked symbols fit in budget.

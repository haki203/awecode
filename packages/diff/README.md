# @awecode/diff

Pure leaf package for parsing and applying Aider-style search/replace Diff Blocks with anchor-based insertion and fuzzy matching.

## API

```ts
import { parseDiff, applyDiff } from '@awecode/diff';

const llmOutput = `file_path: src/foo.ts
<<<< SEARCH
old code
====
new code
>>>> REPLACE`;

const parsed = parseDiff(llmOutput);
// [{ filePath: 'src/foo.ts', blocks: [{ search: 'old code\n', replace: 'new code\n' }] }]

const result = applyDiff(sourceCode, parsed[0].blocks);
if (result.ok) {
  console.log(result.result);
}
```

## Anchor grammar

```
at: @after: function foo
at: @before: class Bar
```

## License

Apache-2.0

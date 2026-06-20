import { describe, it, expect } from 'vitest';
import { parseDiff, applyDiff } from '../src/index.js';

describe('edge cases', () => {
  it('parseDiff handles empty input', () => {
    expect(parseDiff('')).toEqual([]);
  });

  it('parseDiff handles trailing whitespace', () => {
    const input = 'file_path: foo.ts\n<<<< SEARCH\n   \n====\n   \n>>>> REPLACE';
    const r = parseDiff(input);
    expect(r[0].blocks[0].search.trim()).toBe('');
  });

  it('applyDiff handles Windows CRLF', () => {
    const source = 'line1\r\nline2\r\nline3';
    const blocks = [{ search: 'line2\r\n', replace: 'LINE2\r\n' }];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
  });

  it('applyDiff preserves trailing newline', () => {
    const source = 'line1\nline2\n';
    const blocks = [{ search: 'line2\n', replace: 'LINE2\n' }];
    const r = applyDiff(source, blocks);
    if (r.ok) expect(r.result.endsWith('\n')).toBe(true);
  });

  it('applyDiff handles unicode', () => {
    const source = '// bình luận\nfunction foo() {}';
    const blocks = [{ search: '// bình luận\n', replace: '// comment\n' }];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
  });
});

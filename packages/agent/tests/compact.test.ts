import { describe, it, expect, vi } from 'vitest';
import { compactContext } from '../src/context/compact.js';
import type { ContextEntry } from '../src/context/entry.js';
import type { AwecodeConfig } from '@awecode/llm';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: '## Summary\n\nTask: fix bug\nDecisions: use approach X',
    usage: { promptTokens: 100, completionTokens: 30 },
  }),
}));

vi.mock('@awecode/llm', () => ({
  createProvider: vi.fn(() => ({})),
}));

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: { type: 'ollama', baseURL: 'http://x', defaultModel: 'm' },
  },
};

const mockEntries: ContextEntry[] = [
  {
    id: '1',
    type: 'file',
    path: '/tmp/foo.ts',
    content: 'export const x = 1;',
    tokens: 100,
    addedAt: Date.now(),
    addedBy: 'user',
  },
];

describe('compactContext', () => {
  it('returns summary text', async () => {
    const result = await compactContext(
      mockConfig,
      mockEntries,
      [{ role: 'user', content: 'fix bug' }],
    );
    expect(result.summary).toContain('Summary');
  });

  it('computes tokensSaved', async () => {
    const result = await compactContext(mockConfig, mockEntries, []);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });
});

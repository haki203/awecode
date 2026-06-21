import { describe, it, expect, vi } from 'vitest';
import { ApprovalPrompter } from '../src/approval.js';
import type { ParsedDiffBlock } from '../src/diff-interceptor.js';
import * as readline from 'node:readline/promises';
import type { Interface as ReadlineInterface } from 'node:readline/promises';

type MockRl = Pick<ReadlineInterface, 'question' | 'close'>;

const mockBlock: ParsedDiffBlock = {
  text: 'file_path: foo.ts\n<<<< SEARCH\na\n====\nb\n>>>> REPLACE',
  filePath: 'foo.ts',
  parsed: {
    filePath: 'foo.ts',
    blocks: [{ search: 'a\n', replace: 'b\n' }],
  },
};

const { createInterfaceMock } = vi.hoisted(() => ({
  createInterfaceMock: vi.fn(),
}));

vi.mock('node:readline/promises', () => ({
  default: {
    createInterface: createInterfaceMock,
  },
  createInterface: createInterfaceMock,
}));

describe('ApprovalPrompter', () => {
  it('returns accept when user types y', async () => {
    const rl: MockRl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(
      rl as unknown as ReadlineInterface,
    );

    const prompter = new ApprovalPrompter();
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('accept');
    expect(rl.close).toHaveBeenCalled();
  });

  it('returns reject when user types n', async () => {
    const rl: MockRl = { question: vi.fn().mockResolvedValue('n\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(
      rl as unknown as ReadlineInterface,
    );

    const prompter = new ApprovalPrompter();
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('reject');
  });

  it('returns quit when user types q', async () => {
    const rl: MockRl = { question: vi.fn().mockResolvedValue('q\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(
      rl as unknown as ReadlineInterface,
    );

    const prompter = new ApprovalPrompter();
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('quit');
  });

  it('returns accept_all when user types a', async () => {
    const rl: MockRl = { question: vi.fn().mockResolvedValue('a\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(
      rl as unknown as ReadlineInterface,
    );

    const prompter = new ApprovalPrompter();
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('accept_all');
  });

  it('returns skip_all when user types s', async () => {
    const rl: MockRl = { question: vi.fn().mockResolvedValue('s\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(
      rl as unknown as ReadlineInterface,
    );

    const prompter = new ApprovalPrompter();
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('skip_all');
  });

  it('returns edit when user types e', async () => {
    const rl: MockRl = { question: vi.fn().mockResolvedValue('e\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(
      rl as unknown as ReadlineInterface,
    );

    const prompter = new ApprovalPrompter();
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('edit');
  });
});

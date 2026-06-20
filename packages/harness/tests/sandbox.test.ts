import { describe, it, expect, vi } from 'vitest';
import { enableNetworkIsolation } from '../src/sandbox.js';

describe('enableNetworkIsolation', () => {
  it('returns null and logs warning (stub impl)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = await enableNetworkIsolation(12345);
    expect(handle).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Network isolation not yet implemented/),
    );
    warnSpy.mockRestore();
  });

  it('warning message mentions git worktree as fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await enableNetworkIsolation(12345);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/git worktree/i),
    );
    warnSpy.mockRestore();
  });
});

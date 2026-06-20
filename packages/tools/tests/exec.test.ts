import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shellExecTool } from '../src/shell/exec.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-exec-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('shellExecTool', () => {
  it('runs echo command successfully', async () => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'Write-Output "hello"' : 'echo hello';
    const result = await shellExecTool({ command: cmd, cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('hello');
    }
  });

  it('captures stderr', async () => {
    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? 'Write-Error "test error"'
      : 'echo "test error" >&2';
    const result = await shellExecTool({ command: cmd, cwd: tmpDir });
    // Write-Error exits non-zero on PowerShell
    if (result.ok) {
      expect(result.output.toLowerCase()).toContain('test error');
    } else {
      expect(result.error.toLowerCase()).toContain('test error');
    }
  });

  it('respects timeoutMs', async () => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'Start-Sleep -Seconds 10' : 'sleep 10';
    const result = await shellExecTool({
      command: cmd,
      cwd: tmpDir,
      timeoutMs: 500,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timed out|timeout/i);
  }, 10_000);
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectTestCommand } from '../src/test-detect.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'awecode-testdetect-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('detectTestCommand', () => {
  it('returns null on empty repo', async () => {
    const r = await detectTestCommand(tmpRoot);
    expect(r).toBeNull();
  });

  it('detects yarn test when package.json has scripts.test + yarn.lock', async () => {
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    );
    await writeFile(join(tmpRoot, 'yarn.lock'), '');
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('yarn test');
    expect(r?.reason).toMatch(/package\.json/i);
  });

  it('detects npm test when package.json has scripts.test but no yarn.lock', async () => {
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'jest' } }),
    );
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('npm test');
  });

  it('returns null when scripts.test is "echo no test"', async () => {
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'echo "no test"' } }),
    );
    const r = await detectTestCommand(tmpRoot);
    expect(r).toBeNull();
  });

  it('detects cargo test when Cargo.toml exists', async () => {
    await writeFile(join(tmpRoot, 'Cargo.toml'), '[package]\nname = "x"\n');
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('cargo test');
  });

  it('detects go test when go.mod exists', async () => {
    await writeFile(join(tmpRoot, 'go.mod'), 'module x\n\ngo 1.20\n');
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('go test ./...');
  });

  it('prefers Cargo over Node when both exist', async () => {
    await writeFile(join(tmpRoot, 'Cargo.toml'), '[package]\nname = "x"\n');
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    );
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('cargo test');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, getDefaultConfigPath } from '../src/config.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns null when file does not exist', async () => {
    const result = await loadConfig(join(tmpDir, 'nonexistent.yaml'));
    expect(result).toBeNull();
  });

  it('loads valid YAML config', async () => {
    const yaml = `
activeProvider: anthropic
providers:
  anthropic:
    type: anthropic
    apiKey: sk-ant-xxx
    defaultModel: claude-3-5-sonnet
`;
    const cfgPath = join(tmpDir, 'config.yaml');
    await writeFile(cfgPath, yaml, 'utf-8');

    const result = await loadConfig(cfgPath);
    expect(result).not.toBeNull();
    expect(result?.activeProvider).toBe('anthropic');
    expect(result?.providers.anthropic?.type).toBe('anthropic');
  });

  it('throws on malformed YAML', async () => {
    const cfgPath = join(tmpDir, 'config.yaml');
    await writeFile(cfgPath, '{{{invalid', 'utf-8');
    await expect(loadConfig(cfgPath)).rejects.toThrow();
  });
});

describe('saveConfig', () => {
  it('writes config as YAML', async () => {
    const cfg = {
      activeProvider: 'ollama',
      providers: {
        ollama: {
          type: 'ollama' as const,
          baseURL: 'http://localhost:11434',
          defaultModel: 'llama3',
        },
      },
    };
    const cfgPath = join(tmpDir, 'config.yaml');
    await saveConfig(cfgPath, cfg);

    const written = await readFile(cfgPath, 'utf-8');
    expect(written).toContain('activeProvider: ollama');
    expect(written).toContain('defaultModel: llama3');
  });
});

describe('getDefaultConfigPath', () => {
  it('returns platform-appropriate path', () => {
    const p = getDefaultConfigPath();
    expect(p).toMatch(/awecode[/\\]config\.yaml$/);
  });
});

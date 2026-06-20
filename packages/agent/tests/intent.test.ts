import { describe, it, expect } from 'vitest';
import { detectIntentFromText } from '../src/intent.js';

describe('detectIntentFromText', () => {
  it('returns direct when no workflow call', () => {
    expect(detectIntentFromText('I will fix the typo.')).toEqual({ type: 'direct' });
  });

  it('returns direct for empty content', () => {
    expect(detectIntentFromText('')).toEqual({ type: 'direct' });
  });

  it('detects start_workflow call with double quotes', () => {
    expect(detectIntentFromText('I will start_workflow("brainstorm") now.')).toEqual({
      type: 'workflow',
      name: 'brainstorm',
    });
  });

  it('detects start_workflow call with single quotes', () => {
    expect(detectIntentFromText("start_workflow('spec')")).toEqual({
      type: 'workflow',
      name: 'spec',
    });
  });

  it('detects workflow name with hyphen', () => {
    expect(detectIntentFromText('start_workflow("deep-plan")')).toEqual({
      type: 'workflow',
      name: 'deep-plan',
    });
  });

  it('picks first workflow call if multiple', () => {
    const result = detectIntentFromText(
      'start_workflow("a") then start_workflow("b")',
    );
    expect(result).toEqual({ type: 'workflow', name: 'a' });
  });
});

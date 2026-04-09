import { describe, expect, it } from 'vitest';
import { AstmendError } from '../src/index.js';
import { toToolErrorResult, toToolSuccessResult } from '../src/mcp/results.js';

describe('mcp tool result helpers', () => {
  it('wraps array results in structuredContent.result', () => {
    const result = toToolSuccessResult([{ line: 1 }]);
    expect(result.structuredContent).toEqual({
      result: [{ line: 1 }],
    });
  });

  it('keeps object results as structuredContent', () => {
    const result = toToolSuccessResult({ changed: true });
    expect(result.structuredContent).toEqual({ changed: true });
  });

  it('formats AstmendError with code', () => {
    const result = toToolErrorResult(new AstmendError('TARGET_NOT_FOUND', 'target missing'));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: 'TARGET_NOT_FOUND',
      message: 'target missing',
    });
  });

  it('formats generic Error without Astmend code', () => {
    const result = toToolErrorResult(new Error('boom'));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      message: 'boom',
    });
  });

  it('formats unknown error fallback', () => {
    const result = toToolErrorResult('unknown');
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      message: 'Unknown error',
    });
  });
});

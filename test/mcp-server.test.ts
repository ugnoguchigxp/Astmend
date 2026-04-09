import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/mcp/server.js';

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const getTools = (): Record<string, RegisteredTool> => {
  const server = createServer() as unknown as {
    _registeredTools: Record<string, RegisteredTool>;
  };
  return server._registeredTools;
};

describe('mcp server tool registration', () => {
  it('registers all expected tools', () => {
    const tools = getTools();
    expect(Object.keys(tools).sort()).toEqual(
      [
        'analyze_references_from_file',
        'analyze_references_from_text',
        'apply_patch_from_file',
        'apply_patch_to_text',
        'detect_impact_from_file',
        'detect_impact_from_text',
      ].sort(),
    );
  });
});

describe('mcp server tool handlers', () => {
  it('handles apply_patch_to_text success', async () => {
    const tools = getTools();
    const result = await tools.apply_patch_to_text.handler({
      operation: {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
      sourceText: `export function getUser(id: string) {
  return id;
}
`,
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      changed: true,
      file: 'src/userService.ts',
    });
  });

  it('handles apply_patch_to_text invalid input errors', async () => {
    const tools = getTools();
    const result = await tools.apply_patch_to_text.handler({
      operation: {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
        changes: {},
      },
      sourceText: `export function getUser(id: string) {
  return id;
}
`,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('handles apply_patch_from_file success and error', async () => {
    const tools = getTools();
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-mcp-'));
    const existingFilePath = path.join(tempDir, 'user.ts');
    await writeFile(
      existingFilePath,
      `export function getUser(id: string) {
  return id;
}
`,
      'utf8',
    );

    const successResult = await tools.apply_patch_from_file.handler({
      operation: {
        type: 'update_function',
        file: existingFilePath,
        name: 'getUser',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
    });
    const errorResult = await tools.apply_patch_from_file.handler({
      operation: {
        type: 'update_function',
        file: path.join(tempDir, 'missing.ts'),
        name: 'getUser',
        changes: {
          add_param: {
            name: 'includeDeleted',
            type: 'boolean',
          },
        },
      },
    });

    expect(successResult.isError).toBeUndefined();
    expect(successResult.structuredContent).toMatchObject({
      changed: true,
    });
    expect(errorResult.isError).toBe(true);
    expect(errorResult.structuredContent).toMatchObject({
      code: 'FILE_NOT_FOUND',
    });
  });

  it('handles reference and impact tool variants', async () => {
    const tools = getTools();
    const tempDir = await mkdtemp(path.join(tmpdir(), 'astmend-mcp-ref-'));
    const filePath = path.join(tempDir, 'sample.ts');
    await writeFile(
      filePath,
      `function foo() { return 1; }
const local = foo();
`,
      'utf8',
    );

    const textResult = await tools.analyze_references_from_text.handler({
      sourceText: `function foo() { return 1; }
const local = foo();
`,
      target: { kind: 'function', name: 'foo' },
    });
    const fileResult = await tools.analyze_references_from_file.handler({
      filePath,
      target: { kind: 'function', name: 'foo' },
    });
    const impactTextResult = await tools.detect_impact_from_text.handler({
      sourceText: `function foo() { return 1; }
foo();
`,
      target: { kind: 'function', name: 'foo' },
    });
    const impactFileResult = await tools.detect_impact_from_file.handler({
      filePath,
      target: { kind: 'function', name: 'foo' },
    });

    expect(textResult.isError).toBeUndefined();
    expect(fileResult.isError).toBeUndefined();
    expect(impactTextResult.isError).toBeUndefined();
    expect(impactFileResult.isError).toBeUndefined();
    expect(textResult.structuredContent).toMatchObject({
      target: { kind: 'function', name: 'foo' },
    });
    expect(fileResult.structuredContent).toMatchObject({
      target: { kind: 'function', name: 'foo' },
    });
    expect(impactTextResult.structuredContent).toHaveProperty('result');
    expect(impactFileResult.structuredContent).toHaveProperty('result');
  });
});

import { describe, expect, it } from 'vitest';
import { applyPatchToText } from '../src/index.js';
import { createServer } from '../src/mcp/server.js';

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const getMcpHandler = (toolName: string): RegisteredTool['handler'] => {
  const server = createServer() as unknown as {
    _registeredTools: Record<string, RegisteredTool>;
  };
  return server._registeredTools[toolName].handler;
};

describe('Contract Test: LIB vs MCP mode consistency', () => {
  const sourceText = `export function getUser(id: string) {
  return id;
}
`;

  const validOperation = {
    type: 'update_function',
    file: 'src/userService.ts',
    name: 'getUser',
    changes: {
      add_param: {
        name: 'includeDeleted',
        type: 'boolean',
      },
    },
  };

  const invalidOperation = {
    type: 'update_function',
    file: 'src/userService.ts',
    name: 'getUser',
    changes: {}, // missing add_param
  };

  it('ensures success response consistency', async () => {
    // LIB mode
    const libResult = applyPatchToText(validOperation, sourceText);

    // MCP mode (API/API)
    const mcpHandler = getMcpHandler('apply_patch_to_text');
    const mcpResult = await mcpHandler({
      operation: validOperation,
      sourceText,
    });

    // Check consistency
    expect(mcpResult.isError).toBeUndefined();
    expect(mcpResult.structuredContent).toEqual(JSON.parse(JSON.stringify(libResult)));
    expect(libResult.success).toBe(true);
  });

  it('ensures failure response consistency (invalid input)', async () => {
    // LIB mode
    const libResult = applyPatchToText(invalidOperation, sourceText);

    // MCP mode
    const mcpHandler = getMcpHandler('apply_patch_to_text');
    const mcpResult = await mcpHandler({
      operation: invalidOperation,
      sourceText,
    });

    // Check consistency
    expect(mcpResult.isError).toBeUndefined();
    expect(mcpResult.structuredContent).toEqual(JSON.parse(JSON.stringify(libResult)));
    expect(libResult.success).toBe(false);
    expect(libResult.rejects[0].reason).toBe('INVALID_PATCH_SCHEMA');
  });

  it('ensures failure response consistency (conflict)', async () => {
    const conflictOperation = {
      type: 'update_function',
      file: 'src/userService.ts',
      name: 'getUser',
      changes: {
        add_param: {
          name: 'id', // conflict with existing 'id'
          type: 'number',
        },
      },
    };

    // LIB mode
    const libResult = applyPatchToText(conflictOperation, sourceText);

    // MCP mode
    const mcpHandler = getMcpHandler('apply_patch_to_text');
    const mcpResult = await mcpHandler({
      operation: conflictOperation,
      sourceText,
    });

    // Check consistency
    expect(mcpResult.isError).toBeUndefined();
    expect(mcpResult.structuredContent).toEqual(JSON.parse(JSON.stringify(libResult)));
    expect(libResult.success).toBe(false);
    expect(libResult.rejects[0].reason).toBe('CONFLICT');
  });
});

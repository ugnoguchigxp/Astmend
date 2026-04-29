import { describe, expect, it } from 'vitest';
import { createAstmendMcpService } from '../src/mcp/service.js';

describe('mcp service contract', () => {
  it('exposes host-callable tool definitions without stdio transport', async () => {
    const service = createAstmendMcpService();

    expect(service.name).toBe('astmend-mcp');
    expect(service.version).toBe('0.1.0');
    expect(service.tools.map((tool) => tool.name).sort()).toEqual(
      [
        'batch_analyze_references',
        'analyze_references_from_project',
        'batch_analyze_references_from_file',
        'batch_analyze_references_from_project',
        'batch_analyze_references_from_text',
        'analyze_references_from_file',
        'analyze_references_from_text',
        'apply_patch_from_file',
        'apply_patch_to_text',
        'detect_impact_from_file',
        'detect_impact_from_text',
        'rename_symbol_from_file',
        'rename_symbol_from_text',
      ].sort(),
    );
  });

  it('calls tools directly and preserves structured result behavior', async () => {
    const service = createAstmendMcpService();
    const result = await service.callTool('analyze_references_from_text', {
      sourceText: `export function getUser() {
  return '1';
}

const current = getUser();
`,
      target: { kind: 'function', name: 'getUser' },
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      target: { kind: 'function', name: 'getUser' },
    });
  });

  it('returns MCP-style errors for host-side input validation failures', async () => {
    const service = createAstmendMcpService();
    const result = await service.callTool('apply_patch_to_text', {
      operation: {
        type: 'update_function',
        file: 'src/userService.ts',
        name: 'getUser',
      },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toHaveProperty('message');
  });

  it('returns MCP-style errors for unknown tools', async () => {
    const service = createAstmendMcpService();
    const result = await service.callTool('missing_tool', {});

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      message: 'Unknown Astmend MCP tool: missing_tool',
    });
  });
});

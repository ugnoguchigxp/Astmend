import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createAstmendMcpService } from '../src/mcp/service.js';

const execFile = promisify(execFileCallback);

const runGit = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await execFile('git', ['-C', cwd, ...args], {
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout;
};

const setupMcpRepo = async (): Promise<string> => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'astmend-mcp-context-'));
  await mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'astmend@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Astmend Test']);

  await writeFile(
    path.join(repoRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(repoRoot, 'src', 'app.ts'),
    `export function hello(name: string) {
  return name;
}
`,
    'utf8',
  );
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'initial']);
  await writeFile(
    path.join(repoRoot, 'src', 'app.ts'),
    `export function hello(name: string, loud: boolean) {
  return loud ? name.toUpperCase() : name;
}
`,
    'utf8',
  );
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'updated']);

  return repoRoot;
};

describe('mcp service contract', () => {
  it('exposes host-callable tool definitions without stdio transport', async () => {
    const service = createAstmendMcpService();

    expect(service.name).toBe('astmend-mcp');
    expect(service.version).toBe('0.1.0');
    expect(service.tools.map((tool) => tool.name).sort()).toEqual(
      [
        'analyze_code_units_from_file',
        'analyze_code_units_from_project',
        'analyze_code_units_from_text',
        'analyze_import_export_graph_from_file',
        'analyze_import_export_graph_from_project',
        'analyze_references_from_file',
        'analyze_references_from_project',
        'analyze_references_from_text',
        'apply_patch_batch_from_file',
        'apply_patch_batch_from_project',
        'apply_patch_batch_to_files',
        'apply_patch_batch_to_text',
        'apply_patch_from_file',
        'apply_patch_to_text',
        'batch_analyze_references',
        'batch_analyze_references_from_file',
        'batch_analyze_references_from_project',
        'batch_analyze_references_from_text',
        'detect_impact_from_file',
        'detect_impact_from_text',
        'extract_db_queries',
        'extract_routes',
        'get_context',
        'get_capabilities',
        'get_risk_hints',
        'rename_symbol_from_file',
        'rename_symbol_from_text',
        'resolve_symbol_candidates_from_file',
        'resolve_symbol_candidates_from_project',
        'resolve_symbol_candidates_from_text',
        'validate_patch_batch_operation',
        'validate_patch_operation',
        'validate_patch_project_operation',
      ].sort(),
    );
  });

  it('returns service capabilities with operation and tool metadata', async () => {
    const service = createAstmendMcpService();
    const result = await service.callTool('get_capabilities', {});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      service: { name: 'astmend-mcp', version: '0.1.0' },
      contractVersion: '2026-05-12',
      features: {
        batchSingleFile: true,
        batchMultiFile: true,
        referenceProject: true,
      },
    });
    expect(result.structuredContent.operations).toEqual(
      expect.arrayContaining(['update_function', 'replace_function_body']),
    );
    expect(result.structuredContent.tools).toEqual(
      expect.arrayContaining(['get_capabilities', 'get_context', 'apply_patch_batch_from_project']),
    );
  });

  it('returns context packet via get_context tool', async () => {
    const repoRoot = await setupMcpRepo();
    const service = createAstmendMcpService();
    const result = await service.callTool('get_context', {
      repoRoot,
      base: 'HEAD~1',
      head: 'HEAD',
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '0.1.0',
    });
  });

  it('returns extraction results through context helper tools', async () => {
    const repoRoot = await setupMcpRepo();
    const service = createAstmendMcpService();

    const routes = await service.callTool('extract_routes', { repoRoot, files: ['src/app.ts'] });
    const dbQueries = await service.callTool('extract_db_queries', {
      repoRoot,
      files: ['src/app.ts'],
    });
    const riskHints = await service.callTool('get_risk_hints', { repoRoot, files: ['src/app.ts'] });

    expect(routes.isError).toBeUndefined();
    expect(dbQueries.isError).toBeUndefined();
    expect(riskHints.isError).toBeUndefined();
    expect(routes.structuredContent).toHaveProperty('items');
    expect(routes.structuredContent).toHaveProperty('warnings');
    expect(dbQueries.structuredContent).toHaveProperty('items');
    expect(dbQueries.structuredContent).toHaveProperty('warnings');
    expect(riskHints.structuredContent).toHaveProperty('items');
    expect(riskHints.structuredContent).toHaveProperty('warnings');
  });

  it('validates multi-file patch batches without applying changes', async () => {
    const service = createAstmendMcpService();
    const result = await service.callTool('validate_patch_project_operation', {
      operation: {
        operations: [
          {
            type: 'update_function',
            file: 'src/a.ts',
            name: 'foo',
            changes: {
              add_param: { name: 'x', type: 'string' },
            },
          },
        ],
      },
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ valid: true });
  });

  it('applies multi-file in-memory batches via MCP tool', async () => {
    const service = createAstmendMcpService();
    const result = await service.callTool('apply_patch_batch_to_files', {
      operation: {
        stopOnReject: true,
        operations: [
          {
            type: 'update_function',
            file: 'src/a.ts',
            name: 'foo',
            changes: {
              add_param: { name: 'flag', type: 'boolean' },
            },
          },
          {
            type: 'update_interface',
            file: 'src/b.ts',
            name: 'User',
            changes: {
              add_property: { name: 'name', type: 'string' },
            },
          },
        ],
      },
      sourceTextByFile: {
        'src/a.ts': `export function foo() {\n  return true;\n}\n`,
        'src/b.ts': `export interface User {\n  id: string;\n}\n`,
      },
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      success: true,
      patchedFiles: ['src/a.ts', 'src/b.ts'],
    });
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

  it('calls code unit scanner tools directly', async () => {
    const service = createAstmendMcpService();
    const result = await service.callTool('analyze_code_units_from_text', {
      sourceText: `export function getUser(id: string) {
  return id;
}
`,
      filePath: 'src/user.ts',
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toHaveProperty('result');
    expect(result.structuredContent.result).toEqual([
      expect.objectContaining({
        kind: 'function',
        name: 'getUser',
        isExported: true,
        exportKind: 'named',
      }),
    ]);
  });
});

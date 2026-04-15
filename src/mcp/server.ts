import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  analyzeReferencesFromFile,
  analyzeReferencesFromText,
  analyzeReferencesFromProject,
  batchAnalyzeReferencesFromFile,
  batchAnalyzeReferencesFromText,
  batchAnalyzeReferencesFromProject,
  applyPatchFromFile,
  applyPatchToText,
  detectImpactFromFile,
  detectImpactFromText,
} from '../index.js';
import { toToolErrorResult, toToolSuccessResult } from './results.js';

const patchOperationInputSchema = z.record(z.string(), z.unknown());

const referenceTargetKindSchema = z.enum([
  'function',
  'interface',
  'class',
  'type_alias',
  'enum',
  'variable',
]);

const referenceTargetSchema = z.object({
  kind: referenceTargetKindSchema,
  name: z.string().min(1),
});

export const createServer = () => {
  const server = new McpServer({
    name: 'astmend-mcp',
    version: '0.1.0',
  });

  server.registerTool(
    'apply_patch_to_text',
    {
      title: 'Apply Patch To Text',
      description: 'Apply an Astmend patch operation to source text in memory.',
      inputSchema: z.object({
        operation: patchOperationInputSchema,
        sourceText: z.string(),
      }),
    },
    async ({ operation, sourceText }) => {
      try {
        return toToolSuccessResult(applyPatchToText(operation, sourceText));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'apply_patch_from_file',
    {
      title: 'Apply Patch From File',
      description:
        'Apply an Astmend patch operation to a file. This does not write to disk and only returns diff and updated text.',
      inputSchema: z.object({
        operation: patchOperationInputSchema,
      }),
    },
    async ({ operation }) => {
      try {
        return toToolSuccessResult(await applyPatchFromFile(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'analyze_references_from_text',
    {
      title: 'Analyze References From Text',
      description: 'Analyze references and impacted declarations in source text.',
      inputSchema: z.object({
        sourceText: z.string(),
        target: referenceTargetSchema,
        filePath: z.string().optional(),
      }),
    },
    async ({ sourceText, target, filePath }) => {
      try {
        return toToolSuccessResult(analyzeReferencesFromText(sourceText, target, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'analyze_references_from_file',
    {
      title: 'Analyze References From File',
      description: 'Analyze references and impacted declarations in a file.',
      inputSchema: z.object({
        filePath: z.string().min(1),
        target: referenceTargetSchema,
      }),
    },
    async ({ filePath, target }) => {
      try {
        return toToolSuccessResult(await analyzeReferencesFromFile(filePath, target));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'detect_impact_from_text',
    {
      title: 'Detect Impact From Text',
      description: 'Detect impacted declarations from source text.',
      inputSchema: z.object({
        sourceText: z.string(),
        target: referenceTargetSchema,
        filePath: z.string().optional(),
      }),
    },
    async ({ sourceText, target, filePath }) => {
      try {
        return toToolSuccessResult(detectImpactFromText(sourceText, target, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'detect_impact_from_file',
    {
      title: 'Detect Impact From File',
      description: 'Detect impacted declarations from a file.',
      inputSchema: z.object({
        filePath: z.string().min(1),
        target: referenceTargetSchema,
      }),
    },
    async ({ filePath, target }) => {
      try {
        return toToolSuccessResult(await detectImpactFromFile(filePath, target));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'batch_analyze_references_from_text',
    {
      title: 'Batch Analyze References From Text',
      description: 'Analyze references and impacted declarations for multiple targets in source text.',
      inputSchema: z.object({
        sourceText: z.string(),
        targets: z.array(referenceTargetSchema).min(1),
        filePath: z.string().optional(),
      }),
    },
    async ({ sourceText, targets, filePath }) => {
      try {
        return toToolSuccessResult(batchAnalyzeReferencesFromText(sourceText, targets, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'batch_analyze_references_from_file',
    {
      title: 'Batch Analyze References From File',
      description: 'Analyze references and impacted declarations for multiple targets in a file.',
      inputSchema: z.object({
        filePath: z.string().min(1),
        targets: z.array(referenceTargetSchema).min(1),
      }),
    },
    async ({ filePath, targets }) => {
      try {
        return toToolSuccessResult(await batchAnalyzeReferencesFromFile(filePath, targets));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'analyze_references_from_project',
    {
      title: 'Analyze References From Project',
      description: 'Analyze references and impacted declarations across a TypeScript project.',
      inputSchema: z.object({
        projectRoot: z.string().min(1),
        entryFile: z.string().min(1),
        target: referenceTargetSchema,
      }),
    },
    async ({ projectRoot, entryFile, target }) => {
      try {
        return toToolSuccessResult(await analyzeReferencesFromProject(projectRoot, entryFile, target));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'batch_analyze_references_from_project',
    {
      title: 'Batch Analyze References From Project',
      description: 'Analyze references and impacted declarations for multiple targets across a TypeScript project.',
      inputSchema: z.object({
        projectRoot: z.string().min(1),
        entryFile: z.string().min(1),
        targets: z.array(referenceTargetSchema).min(1),
      }),
    },
    async ({ projectRoot, entryFile, targets }) => {
      try {
        return toToolSuccessResult(
          await batchAnalyzeReferencesFromProject(projectRoot, entryFile, targets),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  );

  return server;
};

const main = async () => {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

const runAsMain = process.argv[1] === fileURLToPath(import.meta.url);

if (runAsMain) {
  main().catch((error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`[astmend-mcp] ${message}\n`);
    process.exit(1);
  });
}

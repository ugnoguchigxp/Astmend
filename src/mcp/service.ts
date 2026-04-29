import { z } from 'zod';
import {
  analyzeReferencesFromFile,
  analyzeReferencesFromProject,
  analyzeReferencesFromText,
  batchAnalyzeReferencesFromFile,
  batchAnalyzeReferencesFromProject,
  batchAnalyzeReferencesFromText,
  detectImpactFromFile,
  detectImpactFromText,
} from '../engine/references.js';
import { applyPatchFromFile, applyPatchToText } from '../router.js';
import { type ToolResult, toToolErrorResult, toToolSuccessResult } from './results.js';

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

const renameOperationInputSchema = z.object({
  type: z.literal('rename_symbol'),
  file: z.string().min(1),
  target: referenceTargetSchema,
  newName: z.string().min(1),
});

const batchAnalyzeReferencesInputSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('text'),
    sourceText: z.string(),
    targets: z.array(referenceTargetSchema).min(1),
    filePath: z.string().optional(),
  }),
  z.object({
    mode: z.literal('file'),
    filePath: z.string().min(1),
    targets: z.array(referenceTargetSchema).min(1),
  }),
  z.object({
    mode: z.literal('project'),
    projectRoot: z.string().min(1),
    entryFile: z.string().min(1),
    targets: z.array(referenceTargetSchema).min(1),
  }),
]);

type MaybePromise<T> = T | Promise<T>;

export type AstmendMcpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown) => MaybePromise<ToolResult>;
};

export type AstmendMcpService = {
  name: string;
  version: string;
  tools: readonly AstmendMcpToolDefinition[];
  callTool: (name: string, args: unknown) => Promise<ToolResult>;
};

const defineTool = <Schema extends z.ZodTypeAny>(definition: {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  handler: (input: z.infer<Schema>) => MaybePromise<ToolResult>;
}): AstmendMcpToolDefinition => ({
  ...definition,
  handler: definition.handler as (input: unknown) => MaybePromise<ToolResult>,
});

const tools = [
  defineTool({
    name: 'apply_patch_to_text',
    title: 'Apply Patch To Text',
    description: 'Apply an Astmend patch operation to source text in memory.',
    inputSchema: z.object({
      operation: patchOperationInputSchema,
      sourceText: z.string(),
    }),
    handler: ({ operation, sourceText }) => {
      try {
        return toToolSuccessResult(applyPatchToText(operation, sourceText));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'apply_patch_from_file',
    title: 'Apply Patch From File',
    description:
      'Apply an Astmend patch operation to a file. This does not write to disk and only returns diff and updated text.',
    inputSchema: z.object({
      operation: patchOperationInputSchema,
    }),
    handler: async ({ operation }) => {
      try {
        return toToolSuccessResult(await applyPatchFromFile(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_references_from_text',
    title: 'Analyze References From Text',
    description: 'Analyze references and impacted declarations in source text.',
    inputSchema: z.object({
      sourceText: z.string(),
      target: referenceTargetSchema,
      filePath: z.string().optional(),
    }),
    handler: ({ sourceText, target, filePath }) => {
      try {
        return toToolSuccessResult(analyzeReferencesFromText(sourceText, target, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_references_from_file',
    title: 'Analyze References From File',
    description: 'Analyze references and impacted declarations in a file.',
    inputSchema: z.object({
      filePath: z.string().min(1),
      target: referenceTargetSchema,
    }),
    handler: async ({ filePath, target }) => {
      try {
        return toToolSuccessResult(await analyzeReferencesFromFile(filePath, target));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'detect_impact_from_text',
    title: 'Detect Impact From Text',
    description: 'Detect impacted declarations from source text.',
    inputSchema: z.object({
      sourceText: z.string(),
      target: referenceTargetSchema,
      filePath: z.string().optional(),
    }),
    handler: ({ sourceText, target, filePath }) => {
      try {
        return toToolSuccessResult(detectImpactFromText(sourceText, target, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'detect_impact_from_file',
    title: 'Detect Impact From File',
    description: 'Detect impacted declarations from a file.',
    inputSchema: z.object({
      filePath: z.string().min(1),
      target: referenceTargetSchema,
    }),
    handler: async ({ filePath, target }) => {
      try {
        return toToolSuccessResult(await detectImpactFromFile(filePath, target));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'batch_analyze_references_from_text',
    title: 'Batch Analyze References From Text',
    description:
      'Analyze references and impacted declarations for multiple targets in source text.',
    inputSchema: z.object({
      sourceText: z.string(),
      targets: z.array(referenceTargetSchema).min(1),
      filePath: z.string().optional(),
    }),
    handler: ({ sourceText, targets, filePath }) => {
      try {
        return toToolSuccessResult(batchAnalyzeReferencesFromText(sourceText, targets, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'batch_analyze_references',
    title: 'Batch Analyze References',
    description: 'Analyze references and impacted declarations for multiple targets.',
    inputSchema: batchAnalyzeReferencesInputSchema,
    handler: async (input) => {
      try {
        switch (input.mode) {
          case 'text':
            return toToolSuccessResult(
              batchAnalyzeReferencesFromText(input.sourceText, input.targets, input.filePath),
            );
          case 'file':
            return toToolSuccessResult(
              await batchAnalyzeReferencesFromFile(input.filePath, input.targets),
            );
          case 'project':
            return toToolSuccessResult(
              await batchAnalyzeReferencesFromProject(
                input.projectRoot,
                input.entryFile,
                input.targets,
              ),
            );
        }
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'batch_analyze_references_from_file',
    title: 'Batch Analyze References From File',
    description: 'Analyze references and impacted declarations for multiple targets in a file.',
    inputSchema: z.object({
      filePath: z.string().min(1),
      targets: z.array(referenceTargetSchema).min(1),
    }),
    handler: async ({ filePath, targets }) => {
      try {
        return toToolSuccessResult(await batchAnalyzeReferencesFromFile(filePath, targets));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_references_from_project',
    title: 'Analyze References From Project',
    description: 'Analyze references and impacted declarations across a TypeScript project.',
    inputSchema: z.object({
      projectRoot: z.string().min(1),
      entryFile: z.string().min(1),
      target: referenceTargetSchema,
    }),
    handler: async ({ projectRoot, entryFile, target }) => {
      try {
        return toToolSuccessResult(
          await analyzeReferencesFromProject(projectRoot, entryFile, target),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'batch_analyze_references_from_project',
    title: 'Batch Analyze References From Project',
    description:
      'Analyze references and impacted declarations for multiple targets across a TypeScript project.',
    inputSchema: z.object({
      projectRoot: z.string().min(1),
      entryFile: z.string().min(1),
      targets: z.array(referenceTargetSchema).min(1),
    }),
    handler: async ({ projectRoot, entryFile, targets }) => {
      try {
        return toToolSuccessResult(
          await batchAnalyzeReferencesFromProject(projectRoot, entryFile, targets),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'rename_symbol_from_text',
    title: 'Rename Symbol From Text',
    description: 'Rename a symbol and its references in source text.',
    inputSchema: z.object({
      operation: renameOperationInputSchema,
      sourceText: z.string(),
    }),
    handler: ({ operation, sourceText }) => {
      try {
        return toToolSuccessResult(applyPatchToText(operation, sourceText));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'rename_symbol_from_file',
    title: 'Rename Symbol From File',
    description: 'Rename a symbol and its references in a file.',
    inputSchema: z.object({
      operation: renameOperationInputSchema,
    }),
    handler: async ({ operation }) => {
      try {
        return toToolSuccessResult(await applyPatchFromFile(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
] as const;

export const createAstmendMcpService = (): AstmendMcpService => {
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    name: 'astmend-mcp',
    version: '0.1.0',
    tools,
    async callTool(name, args) {
      const tool = toolMap.get(name);

      if (!tool) {
        return toToolErrorResult(new Error(`Unknown Astmend MCP tool: ${name}`));
      }

      const parsedArgs = tool.inputSchema.safeParse(args);
      if (!parsedArgs.success) {
        return toToolErrorResult(parsedArgs.error);
      }

      return tool.handler(parsedArgs.data);
    },
  };
};
